import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send, User, Bot, Shield, Eye, Terminal, Loader, FileText, ChevronDown, ChevronRight, Save, RefreshCw, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Card, Badge, Button, PageHeader, Select, Tabs } from '../components/ui';
import { usePlaygroundProfiles, useAgents, useEmployees, usePositions, useWorkspaceFile, useSaveWorkspaceFile } from '../hooks/useApi';
import { api } from '../api/client';

const STORAGE_KEY = 'openclaw_playground_chat';

function loadMessages(tenantId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${tenantId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveMessages(tenantId: string, messages: ChatMessage[]) {
  localStorage.setItem(`${STORAGE_KEY}_${tenantId}`, JSON.stringify(messages));
}

interface ChatMessage { role: 'user' | 'assistant' | 'system'; content: string; timestamp: string; }

// ── File viewer card ────────────────────────────────────────────────────────
interface FileCardProps {
  label: string;
  s3Key: string;
  editable?: boolean;
  badge?: string;
  badgeColor?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
}

function FileCard({ label, s3Key, editable = false, badge, badgeColor = 'default' }: FileCardProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const { data, isLoading, refetch } = useWorkspaceFile(open ? s3Key : '');
  const saveFile = useSaveWorkspaceFile();

  useEffect(() => {
    if (data?.content && !editing) setDraft(data.content);
  }, [data?.content]);

  const handleSave = async () => {
    await saveFile.mutateAsync({ key: s3Key, content: draft });
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="rounded-xl border border-dark-border/60 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 bg-dark-bg hover:bg-dark-hover transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2.5">
          <FileText size={14} className="text-text-muted" />
          <span className="text-sm font-medium text-text-primary">{label}</span>
          {badge && <Badge color={badgeColor}>{badge}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {data && <span className="text-[10px] text-text-muted">{(data.size / 1024).toFixed(1)} KB</span>}
          {open ? <ChevronDown size={14} className="text-text-muted" /> : <ChevronRight size={14} className="text-text-muted" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-dark-border/40">
          {isLoading ? (
            <div className="flex items-center justify-center py-6"><Loader size={16} className="animate-spin text-primary" /></div>
          ) : data ? (
            <div>
              {editable && (
                <div className="flex items-center justify-between px-4 py-2 bg-dark-card/50 border-b border-dark-border/30">
                  <span className="text-[10px] text-text-muted">S3: {s3Key}</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => refetch()} className="rounded p-1 text-text-muted hover:text-text-primary hover:bg-dark-hover transition-colors"><RefreshCw size={12} /></button>
                    {editing ? (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setDraft(data.content); }}>取消</Button>
                        <Button variant="primary" size="sm" onClick={handleSave} disabled={saveFile.isPending}>
                          <Save size={12} /> {saveFile.isPending ? '保存中...' : saved ? '已保存 ✓' : '保存'}
                        </Button>
                      </>
                    ) : (
                      <Button variant="default" size="sm" onClick={() => setEditing(true)}>Edit</Button>
                    )}
                  </div>
                </div>
              )}
              {!editable && (
                <div className="flex items-center justify-between px-4 py-1.5 bg-dark-card/50 border-b border-dark-border/30">
                  <span className="text-[10px] text-text-muted">{s3Key}</span>
                  <button onClick={() => refetch()} className="rounded p-1 text-text-muted hover:text-text-primary hover:bg-dark-hover transition-colors"><RefreshCw size={12} /></button>
                </div>
              )}
              {editing ? (
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  rows={14}
                  className="w-full bg-dark-bg px-4 py-3 text-xs text-text-primary font-mono focus:outline-none resize-none"
                />
              ) : (
                <pre className="px-4 py-3 text-xs text-text-secondary font-mono whitespace-pre-wrap overflow-x-auto max-h-72 overflow-y-auto bg-dark-bg">
                  {data.content || '(empty)'}
                </pre>
              )}
            </div>
          ) : (
            <p className="px-4 py-4 text-xs text-text-muted">(文件不存在或为空)</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Playground ─────────────────────────────────────────────────────────
export default function Playground() {
  const [searchParams] = useSearchParams();
  const agentParam = searchParams.get('agent'); // e.g. "agent-ae-mike"
  const { data: profiles } = usePlaygroundProfiles();
  const { data: employees = [] } = useEmployees();
  const { data: positions = [] } = usePositions();

  const tenantOptions = useMemo(() => {
    const opts = employees
      .filter(e => e.agentId)
      .map(e => ({ label: `${e.name} — ${e.positionName}`, value: `port__${e.id}` }));
    if (opts.length === 0) {
      return [
        { label: 'Carol Zhang — Finance Analyst', value: 'port__emp-carol' },
        { label: 'Wang Wu — Software Engineer', value: 'port__emp-w5' },
      ];
    }
    return opts;
  }, [employees]);

  const [tenantId, setTenantId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [lastPlanE, setLastPlanE] = useState('No messages yet');
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState('pipeline');
  const [tenantReady, setTenantReady] = useState(false);

  useEffect(() => {
    if (tenantOptions.length === 0) return;
    if (tenantId) return;
    // Pre-select from ?agent= query param if present
    if (agentParam) {
      const matched = tenantOptions.find(o => o.value.includes(agentParam) ||
        employees.find(e => e.agentId === agentParam && o.value === `port__${e.id}`));
      if (matched) { setTenantId(matched.value); return; }
    }
    setTenantId(tenantOptions[0].value);
  }, [tenantOptions, tenantId, agentParam]);

  const profile = profiles?.[tenantId] || { role: 'loading', tools: [], planA: '', planE: '' };

  useEffect(() => { if (tenantId && tenantReady) saveMessages(tenantId, messages); }, [messages]);

  useEffect(() => {
    if (!tenantId) return;
    setTenantReady(false);
    const saved = loadMessages(tenantId);
    const label = tenantOptions.find(o => o.value === tenantId)?.label || tenantId;
    if (saved.length > 0) {
      setMessages(saved);
    } else {
      const p = profiles?.[tenantId];
      setMessages([{
        role: 'system',
        content: `🔒 Tenant loaded: ${label} — ${p?.role || '?'} role, ${p?.tools?.length || 0} tools`,
        timestamp: '',
      }]);
    }
    setLastPlanE('No messages yet');
    setTimeout(() => setTenantReady(true), 100);
  }, [tenantId, profiles]);

  // Derive employee ID and position ID for file panel
  const empId = tenantId.replace('port__', '');
  const emp = employees.find(e => e.id === empId);
  const posId = emp?.positionId || '';

  const handleSend = async () => {
    if (!inputValue.trim() || sending) return;
    const now = new Date().toLocaleTimeString();
    const msg = inputValue.trim();
    setMessages(prev => [...prev, { role: 'user', content: msg, timestamp: now }]);
    setInputValue('');
    setSending(true);

    try {
      const data = await api.post<{ response: string; plan_e: string }>(
        '/playground/send', { tenant_id: tenantId, message: msg, mode: 'live' }
      );
      setMessages(prev => [...prev, { role: 'assistant', content: data.response, timestamp: new Date().toLocaleTimeString() }]);
      setLastPlanE(data.plan_e || '✅ PASS');
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⏳ Agent cold-starting (~25s). Retrying...',
        timestamp: new Date().toLocaleTimeString(),
      }]);
      try {
        await new Promise(r => setTimeout(r, 6000));
        const retry = await api.post<{ response: string; plan_e: string }>(
          '/playground/send', { tenant_id: tenantId, message: msg, mode: 'live' }
        );
        setMessages(prev => [...prev, { role: 'assistant', content: retry.response, timestamp: new Date().toLocaleTimeString() }]);
        setLastPlanE(retry.plan_e || '✅ PASS');
      } catch {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Agent still starting. Please retry in ~30s.',
          timestamp: new Date().toLocaleTimeString(),
        }]);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <PageHeader title="Agent Playground" description="Test agent behavior, inspect pipeline permissions, and read/write employee config files" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Left: Chat ── */}
        <Card>
          <div className="mb-4">
            <Select label="Tenant Context" value={tenantId} onChange={v => setTenantId(v)} options={tenantOptions} />
            <div className="mt-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs text-success font-medium">Live · AgentCore</span>
              <span className="text-xs text-text-muted">{tenantId}</span>
            </div>
          </div>

          <div className="min-h-[380px] max-h-[460px] overflow-y-auto rounded-xl bg-dark-bg border border-dark-border p-4 mb-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
                  msg.role === 'user' ? 'bg-primary/15 text-text-primary'
                  : msg.role === 'system' ? 'bg-dark-hover text-text-muted text-xs rounded-lg'
                  : 'bg-dark-card border border-dark-border text-text-primary'
                }`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {msg.role === 'system' ? <Terminal size={12} /> : msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                    <span className="text-xs text-text-muted">
                      {msg.role === 'system' ? 'System' : msg.role === 'user' ? 'You' : 'Agent'}
                      {msg.timestamp && ` · ${msg.timestamp}`}
                    </span>
                  </div>
                  {msg.role === 'assistant' ? (
                    <div className="text-sm prose prose-invert prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5 [&_code]:bg-dark-bg [&_code]:px-1 [&_code]:rounded [&_pre]:bg-dark-bg [&_pre]:p-3 [&_pre]:rounded-lg [&_strong]:text-text-primary">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-dark-card border border-dark-border px-3 py-2">
                  <Loader size={14} className="animate-spin text-primary" />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !sending) handleSend(); }}
              placeholder="Send a message to the agent..."
              className="flex-1 rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
            />
            <Button variant="default" onClick={() => {
              if (tenantId) localStorage.removeItem(`${STORAGE_KEY}_${tenantId}`);
              const label = tenantOptions.find(o => o.value === tenantId)?.label || tenantId;
              const p = profiles?.[tenantId];
              setMessages([{ role: 'system', content: `🔒 Tenant loaded: ${label} — ${p?.role || '?'} role, ${p?.tools?.length || 0} tools`, timestamp: '' }]);
              setLastPlanE('No messages yet');
            }}><Trash2 size={16} /></Button>
            <Button variant="primary" onClick={handleSend} disabled={sending}><Send size={16} /></Button>
          </div>
        </Card>

        {/* ── Right: Inspector + Files ── */}
        <div className="space-y-4">
          <Card>
            <Tabs
              tabs={[
                { id: 'pipeline', label: 'Pipeline' },
                { id: 'files', label: 'Employee Files' },
              ]}
              activeTab={activeTab}
              onChange={setActiveTab}
            />

            <div className="mt-4">
              {activeTab === 'pipeline' && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-text-muted mb-1">Tenant ID</p>
                    <code className="text-sm text-primary-light bg-primary/5 px-2 py-1 rounded">{tenantId}</code>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted mb-2">Permission Profile</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge color="primary">{profile.role}</Badge>
                      {profile.tools.map(t => <Badge key={t} color="success">{t}</Badge>)}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted mb-2">Plan A — Pre-Execution</p>
                    <pre className="rounded-lg bg-dark-bg border border-dark-border p-3 text-xs text-text-secondary whitespace-pre-wrap font-mono">{profile.planA || 'Loading...'}</pre>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted mb-2">Plan E — Post-Execution</p>
                    <pre className="rounded-lg bg-dark-bg border border-dark-border p-3 text-xs text-text-secondary whitespace-pre-wrap font-mono">{profile.planE || 'Loading...'}</pre>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted mb-1">Last Plan E Result</p>
                    <div className={`rounded-lg px-3 py-2 text-sm ${
                      lastPlanE.includes('PASS') || lastPlanE.includes('PASS') ? 'bg-success/10 text-success'
                      : lastPlanE.includes('BLOCKED') ? 'bg-danger/10 text-danger'
                      : 'bg-dark-bg text-text-muted'
                    }`}>{lastPlanE}</div>
                  </div>
                </div>
              )}

              {activeTab === 'files' && (
                <div className="space-y-2">
                  <p className="text-xs text-text-muted mb-3">
                    Click to expand and view or edit. USER.md and personal SOUL can be saved directly to S3.
                  </p>
                  <FileCard
                    label="SOUL.md (Personal)"
                    s3Key={`${empId}/workspace/SOUL.md`}
                    editable
                    badge="editable"
                    badgeColor="success"
                  />
                  {posId && (
                    <FileCard
                      label="SOUL.md (Position)"
                      s3Key={`_shared/soul/positions/${posId}/SOUL.md`}
                      editable
                      badge={posId}
                      badgeColor="primary"
                    />
                  )}
                  <FileCard
                    label="USER.md (Preferences)"
                    s3Key={`${empId}/workspace/USER.md`}
                    editable
                    badge="editable"
                    badgeColor="success"
                  />
                  <FileCard
                    label="MEMORY.md (Memory)"
                    s3Key={`${empId}/workspace/MEMORY.md`}
                    badge="read-only"
                    badgeColor="default"
                  />
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
