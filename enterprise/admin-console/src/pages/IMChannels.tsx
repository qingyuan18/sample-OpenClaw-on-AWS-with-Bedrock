import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw, Users, CheckCircle,
  Trash2, MessageSquare, Activity, Wifi, Zap, ArrowRight, Info,
} from 'lucide-react';
import { Card, Badge, Button, PageHeader, StatCard, Tabs } from '../components/ui';
import { api } from '../api/client';
import { IM_ICONS } from '../components/IMIcons';
import { useAgents, useEmployees } from '../hooks/useApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IMChannel {
  id: string; label: string; enterprise: boolean;
  status: 'connected' | 'configured' | 'not_connected';
  connectedEmployees: number; gatewayInfo: string;
}

interface ChannelConnection {
  empId: string; empName: string; positionName: string; departmentName: string;
  channelUserId: string; connectedAt: string; sessionCount: number; lastActive: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function shortDate(iso: string): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }); }
  catch { return '—'; }
}

const CHANNEL_LABELS: Record<string, string> = {
  telegram: 'Telegram', discord: 'Discord', feishu: 'Feishu / Lark',
  dingtalk: 'DingTalk', slack: 'Slack', teams: 'Microsoft Teams',
  googlechat: 'Google Chat', whatsapp: 'WhatsApp', wechat: 'WeChat',
};

const ENTERPRISE_CHANNELS = ['telegram', 'discord', 'feishu', 'dingtalk', 'slack', 'teams', 'googlechat', 'whatsapp', 'wechat'];

// ─── Channel Tab Content ──────────────────────────────────────────────────────

function ConnectionsTable({ connections, channel, revokeMutation, deployModeMap }: {
  connections: ChannelConnection[]; channel: string;
  revokeMutation: { isPending: boolean; mutate: (vars: { ch: string; uid: string }) => void };
  deployModeMap?: Record<string, 'serverless' | 'always-on'>;
}) {
  if (connections.length === 0) return null;
  return (
    <Card className="p-0 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-dark-border/50 bg-surface-dim">
            <th className="py-2.5 px-4 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Employee</th>
            <th className="py-2.5 px-4 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Channel User ID</th>
            <th className="py-2.5 px-4 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Connected</th>
            <th className="py-2.5 px-4 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Sessions</th>
            <th className="py-2.5 px-4 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Last Active</th>
            {deployModeMap && <th className="py-2.5 px-4 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Mode</th>}
            <th className="py-2.5 px-4 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Action</th>
          </tr>
        </thead>
        <tbody>
          {connections.map(conn => (
            <tr key={conn.channelUserId} className="border-b border-dark-border/30 hover:bg-dark-hover/20 transition-colors">
              <td className="py-3 px-4">
                <p className="text-sm font-medium text-text-primary">{conn.empName}</p>
                <p className="text-xs text-text-muted">{conn.positionName} · {conn.departmentName}</p>
              </td>
              <td className="py-3 px-4">
                <code className="text-xs font-mono text-text-secondary bg-dark-bg px-2 py-1 rounded">
                  {conn.channelUserId.length > 20 ? conn.channelUserId.slice(0, 18) + '...' : conn.channelUserId}
                </code>
              </td>
              <td className="py-3 px-4 text-xs text-text-muted">{shortDate(conn.connectedAt)}</td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-1.5">
                  <MessageSquare size={12} className="text-text-muted" />
                  <span className="text-sm font-medium text-text-primary">{conn.sessionCount || 0}</span>
                </div>
              </td>
              <td className="py-3 px-4 text-xs text-text-muted">{timeAgo(conn.lastActive)}</td>
              {deployModeMap && (
                <td className="py-3 px-4">
                  {deployModeMap[conn.empId] === 'always-on'
                    ? <Badge color="info"><Zap size={10} className="mr-1 inline" />Always-on</Badge>
                    : <Badge color="success">Serverless</Badge>}
                </td>
              )}
              <td className="py-3 px-4">
                <ConnectionRowAction
                  revoking={revokeMutation.isPending}
                  onRevoke={() => revokeMutation.mutate({ ch: channel, uid: conn.channelUserId })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function ConnectionRowAction({ onRevoke, revoking }: {
  onRevoke: () => void; revoking: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  return confirming ? (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-danger">Disconnect?</span>
      <Button variant="danger" size="sm" disabled={revoking}
        onClick={() => { onRevoke(); setConfirming(false); }}>
        {revoking ? <RefreshCw size={11} className="animate-spin" /> : 'Yes'}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>No</Button>
    </div>
  ) : (
    <Button variant="ghost" size="sm"
      className="text-text-muted hover:text-danger hover:border-danger/30"
      onClick={() => setConfirming(true)}>
      <Trash2 size={13} /> Disconnect
    </Button>
  );
}

function ChannelConnections({ channel, connections, channelStatus, onRevoke }: {
  channel: string; connections: ChannelConnection[];
  channelStatus?: IMChannel; onRevoke: (channelUserId: string) => void;
}) {
  const qc = useQueryClient();
  const [testResult, setTestResult] = useState<{ ok: boolean; botName?: string; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const { data: agents = [] } = useAgents();
  const { data: employees = [] } = useEmployees();

  // Build empId -> deploy mode map
  const alwaysOnAgentIds = new Set(agents.filter(a => a.deployMode === 'always-on-ecs').map(a => a.id));
  const empDeployMode: Record<string, 'serverless' | 'always-on'> = {};
  for (const emp of employees) {
    if (emp.agentId && alwaysOnAgentIds.has(emp.agentId)) {
      empDeployMode[emp.id] = 'always-on';
    } else {
      empDeployMode[emp.id] = 'serverless';
    }
  }

  // Split connections by mode
  const serverlessConns = connections.filter(c => empDeployMode[c.empId] !== 'always-on');
  const alwaysOnConns = connections.filter(c => empDeployMode[c.empId] === 'always-on');
  const hasAlwaysOn = alwaysOnConns.length > 0;

  const revokeMutation = useMutation({
    mutationFn: ({ ch, uid }: { ch: string; uid: string }) =>
      api.del(`/bindings/user-mappings?channel=${ch}&channelUserId=${uid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['im-channel-connections'] });
      qc.invalidateQueries({ queryKey: ['im-channels'] });
    },
  });

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.post<{ ok: boolean; botName?: string; error?: string }>(
        `/admin/im-channels/${channel}/test`, {}
      );
      setTestResult(result);
    } catch {
      setTestResult({ ok: false, error: 'Request failed' });
    }
    setTesting(false);
  };

  const Icon = IM_ICONS[channel];
  const label = CHANNEL_LABELS[channel] || channel;
  const isConfigured = channelStatus?.status === 'connected' || channelStatus?.status === 'configured';
  const isActive = channelStatus?.status === 'connected';

  return (
    <div className="space-y-4">
      {/* Channel header */}
      <div className="flex items-center gap-4 rounded-xl border px-4 py-3 bg-surface-dim border-dark-border/50">
        <div className="shrink-0">{Icon ? <Icon size={32} /> : <Wifi size={32} className="text-text-muted" />}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-text-primary">{label} Bot</h3>
            {channelStatus?.status === 'connected' && <Badge color="success" dot>Bot Active</Badge>}
            {channelStatus?.status === 'configured' && <Badge color="warning" dot>Bot Configured</Badge>}
            {(!channelStatus || channelStatus.status === 'not_connected') && <Badge color="default">Bot Not Connected</Badge>}
            {testResult && (
              <span className={`text-xs ${testResult.ok ? 'text-success' : 'text-danger'}`}>
                {testResult.ok ? `Connection OK — @${testResult.botName}` : `Failed: ${testResult.error}`}
              </span>
            )}
          </div>
          {channelStatus?.gatewayInfo && (
            <p className="text-[10px] text-text-muted font-mono mt-0.5">{channelStatus.gatewayInfo}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {isConfigured && (
            <Button variant="default" size="sm" onClick={handleTestConnection} disabled={testing}>
              {testing ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle size={13} />}
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>
          )}
          <div className="text-right">
            <p className="text-2xl font-bold text-text-primary">{connections.length}</p>
            <p className="text-xs text-text-muted">employees connected</p>
          </div>
        </div>
      </div>

      {/* Layer 2: Architecture flow + employee onboarding (shown when bot is active) */}
      {isActive && (
        <div className="rounded-xl border border-success/20 bg-success/5 px-5 py-4">
          <p className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
            <Info size={15} className="text-success" /> How it works
          </p>
          <div className="flex items-center gap-2 text-xs text-text-secondary font-mono flex-wrap mb-3">
            <span className="bg-dark-bg border border-dark-border/50 rounded px-2 py-1">Employee</span>
            <ArrowRight size={12} className="text-text-muted shrink-0" />
            <span className="bg-dark-bg border border-dark-border/50 rounded px-2 py-1">{label} Bot</span>
            <ArrowRight size={12} className="text-text-muted shrink-0" />
            <span className="bg-dark-bg border border-dark-border/50 rounded px-2 py-1">/start token</span>
            <ArrowRight size={12} className="text-text-muted shrink-0" />
            <span className="bg-primary/10 border border-primary/30 rounded px-2 py-1 text-primary">Tenant Router</span>
            <ArrowRight size={12} className="text-text-muted shrink-0" />
            <span className="bg-primary/10 border border-primary/30 rounded px-2 py-1 text-primary">AgentCore Session</span>
            <ArrowRight size={12} className="text-text-muted shrink-0" />
            <span className="bg-cyan-500/10 border border-cyan-500/30 rounded px-2 py-1 text-cyan-400">Bedrock</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-text-muted">
            <div>
              <p><strong className="text-text-secondary">Serverless mode:</strong> All employees share this bot. The Router maps each IM user to their personal agent. Employee data syncs to S3 after each session.</p>
            </div>
            <div>
              <p><strong className="text-text-secondary">Always-on mode:</strong> Executives with dedicated Fargate containers get their own gateway channel. Direct routing, EFS persistence, no cold start.</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-dark-bg border border-dark-border/40 px-3 py-2">
            <ArrowRight size={13} className="text-primary shrink-0" />
            <p className="text-xs text-text-secondary">
              <strong className="text-text-primary">Next:</strong> Tell employees to go to{' '}
              <strong>Portal</strong> <ArrowRight size={10} className="inline text-text-muted" />{' '}
              <strong>Connect IM</strong> <ArrowRight size={10} className="inline text-text-muted" />{' '}
              <strong>{label}</strong> — they'll get a pairing link automatically.
            </p>
          </div>
        </div>
      )}

      {/* Setup guide for unconfigured bots */}
      {(!channelStatus || channelStatus.status === 'not_connected') && (
        <div className="rounded-xl border border-warning/20 bg-warning/5 px-4 py-3 text-sm">
          <p className="font-medium text-text-primary mb-1">Bot not configured</p>
          <p className="text-xs text-text-muted mb-2">
            Configure the {label} bot via the <strong>OpenClaw Gateway UI</strong> (one-time setup by IT Admin):
          </p>
          <ol className="text-xs text-text-muted space-y-0.5 list-decimal list-inside">
            <li>SSM port-forward: <code className="bg-dark-hover px-1 rounded">aws ssm start-session --target $INSTANCE_ID --document-name AWS-StartPortForwardingSession --parameters portNumber=18789,localPortNumber=18789</code></li>
            <li>Open <code className="bg-dark-hover px-1 rounded">http://localhost:18789</code> → Channels → Add {label}</li>
            <li>Paste your bot token / credentials → Save</li>
            <li>Come back here and click <strong>Refresh</strong> to confirm status</li>
          </ol>
        </div>
      )}

      {/* Layer 3: Split view — Serverless vs Always-on */}
      {connections.length === 0 ? (
        <div className="rounded-xl bg-surface-dim border border-dark-border/30 py-12 text-center">
          <Users size={28} className="mx-auto mb-3 text-text-muted opacity-40" />
          <p className="text-sm text-text-muted">No employees connected via {label} yet</p>
          <p className="text-xs text-text-muted mt-1">Employees connect from Portal → Connect IM</p>
        </div>
      ) : hasAlwaysOn ? (
        /* Show split view when there are both serverless and always-on employees */
        <div className="space-y-4">
          {/* Shared Bot (Serverless) section */}
          <div className="rounded-xl border border-dark-border/40 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-success/5 border-b border-dark-border/30">
              <div className="flex items-center gap-2">
                <RefreshCw size={14} className="text-success" />
                <span className="text-sm font-medium text-text-primary">Shared Bot (Serverless Employees)</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-muted">{serverlessConns.length} employee{serverlessConns.length !== 1 ? 's' : ''} paired via shared bot</span>
              </div>
            </div>
            <div className="px-4 py-2 bg-surface-dim border-b border-dark-border/20">
              <p className="text-[11px] text-text-muted font-mono">
                Route: Bot <ArrowRight size={10} className="inline mx-0.5" /> tenant_router.py <ArrowRight size={10} className="inline mx-0.5" /> AgentCore session <ArrowRight size={10} className="inline mx-0.5" /> S3 sync
              </p>
            </div>
            {serverlessConns.length > 0 ? (
              <ConnectionsTable connections={serverlessConns} channel={channel} revokeMutation={revokeMutation} />
            ) : (
              <div className="py-6 text-center text-xs text-text-muted">No serverless employees on this channel</div>
            )}
          </div>

          {/* Dedicated Channels (Always-on) section */}
          <div className="rounded-xl border border-cyan-500/30 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-cyan-500/5 border-b border-cyan-500/20">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-cyan-400" />
                <span className="text-sm font-medium text-text-primary">Dedicated Channels (Always-on Executives)</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-muted">{alwaysOnConns.length} employee{alwaysOnConns.length !== 1 ? 's' : ''} on dedicated Fargate</span>
              </div>
            </div>
            <div className="px-4 py-2 bg-surface-dim border-b border-dark-border/20">
              <p className="text-[11px] text-text-muted font-mono">
                Route: Bot <ArrowRight size={10} className="inline mx-0.5" /> direct ECS container <ArrowRight size={10} className="inline mx-0.5" /> EFS persistence
              </p>
            </div>
            <ConnectionsTable connections={alwaysOnConns} channel={channel} revokeMutation={revokeMutation} />
          </div>
        </div>
      ) : (
        /* All serverless — single table with mode column */
        <ConnectionsTable connections={connections} channel={channel} revokeMutation={revokeMutation} deployModeMap={empDeployMode} />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IMChannels() {
  const qc = useQueryClient();
  const [activeChannel, setActiveChannel] = useState('telegram');

  const { data: channels = [], isLoading: channelsLoading, refetch, isFetching } = useQuery<IMChannel[]>({
    queryKey: ['im-channels'],
    queryFn: () => api.get('/admin/im-channels'),
    refetchInterval: 60_000,
  });

  const { data: connectionsData, isLoading: connLoading, refetch: refetchConn } = useQuery<{
    connections: Record<string, ChannelConnection[]>;
  }>({
    queryKey: ['im-channel-connections'],
    queryFn: () => api.get('/admin/im-channel-connections'),
    refetchInterval: 60_000,
  });

  const connections = connectionsData?.connections || {};
  const channelStatusMap = Object.fromEntries(channels.map(c => [c.id, c]));

  // Total stats
  const totalConnected = Object.values(connections).reduce((s, arr) => s + arr.length, 0);
  const activeChannels = Object.keys(connections).filter(ch => connections[ch].length > 0);
  const totalSessions = Object.values(connections).flat().reduce((s, c) => s + (c.sessionCount || 0), 0);

  // Build tabs — only enterprise channels
  const tabs = ENTERPRISE_CHANNELS.map(ch => ({
    id: ch,
    label: CHANNEL_LABELS[ch] || ch,
    count: connections[ch]?.length || 0,
  }));

  const handleRefresh = useCallback(() => {
    refetch();
    refetchConn();
  }, [refetch, refetchConn]);

  return (
    <div>
      <PageHeader
        title="IM Channels"
        description={channels.filter(c => c.status === 'connected').length > 0
          ? "Monitor employee IM connections across all channels. Manage pairings and view session activity."
          : "Configure enterprise IM bots, then employees can pair from their Portal to chat with AI agents."
        }
        actions={
          <Button variant="default" size="sm" onClick={handleRefresh} disabled={isFetching || connLoading}>
            <RefreshCw size={14} className={(isFetching || connLoading) ? 'animate-spin' : ''} /> Refresh
          </Button>
        }
      />

      {/* First-time setup guide — shown when no bots are connected */}
      {channels.filter(c => c.status === 'connected').length === 0 && !channelsLoading && (
        <div className="mb-6 rounded-xl border-2 border-primary/30 bg-primary/5 px-5 py-4">
          <h3 className="text-base font-semibold text-text-primary mb-2 flex items-center gap-2">
            <Wifi size={18} className="text-primary" /> First-time IM Channel Setup
          </h3>
          <p className="text-sm text-text-secondary mb-3">
            Connect your enterprise IM bots so employees can chat with their AI agents via Telegram, Discord, Feishu, etc.
            You configure the bots <strong>once</strong> — then every employee can pair from their Portal.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg bg-dark-bg border border-dark-border/50 px-3 py-2.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">1</span>
                <p className="text-sm font-medium text-text-primary">Open Gateway UI</p>
              </div>
              <p className="text-xs text-text-muted">
                Port-forward to <code className="bg-dark-hover px-1 rounded">localhost:18789</code> via SSM, then open in browser.
                Use the gateway token from SSM Parameter Store.
              </p>
            </div>
            <div className="rounded-lg bg-dark-bg border border-dark-border/50 px-3 py-2.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">2</span>
                <p className="text-sm font-medium text-text-primary">Add Bot Tokens</p>
              </div>
              <p className="text-xs text-text-muted">
                In Gateway UI → <strong>Channels</strong> → select a platform (e.g. Telegram) → paste your bot token → Save.
                Repeat for each platform you want.
              </p>
            </div>
            <div className="rounded-lg bg-dark-bg border border-dark-border/50 px-3 py-2.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">3</span>
                <p className="text-sm font-medium text-text-primary">Employees Pair</p>
              </div>
              <p className="text-xs text-text-muted">
                Employees go to <strong>Portal → Connect IM</strong>, select the channel, and scan QR / send <code>/start</code>.
                Each employee pairs to their own agent automatically.
              </p>
            </div>
          </div>
          <p className="text-xs text-text-muted mt-3">
            After configuring, click <strong>Refresh</strong> above to see the updated bot status.
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        <StatCard title="Paired Employees" value={totalConnected} subtitle="across all channels" icon={<Users size={22} />} color="primary" />
        <StatCard title="Active Channels" value={activeChannels.length} subtitle="with at least 1 employee" icon={<CheckCircle size={22} />} color="success" />
        <StatCard title="Total Sessions" value={totalSessions} subtitle="all-time invocations" icon={<Activity size={22} />} color="info" />
        <StatCard title="Bot Connections" value={channels.filter(c => c.status === 'connected').length} subtitle={`of ${channels.filter(c => c.enterprise).length} enterprise bots`} icon={<Wifi size={22} />} color="cyan" />
      </div>

      {/* Channel tabs */}
      <Tabs
        tabs={tabs}
        activeTab={activeChannel}
        onChange={setActiveChannel}
      />

      <div className="mt-6">
        {connLoading ? (
          <div className="flex justify-center py-16">
            <RefreshCw size={24} className="animate-spin text-text-muted" />
          </div>
        ) : (
          <ChannelConnections
            key={activeChannel}
            channel={activeChannel}
            connections={connections[activeChannel] || []}
            channelStatus={channelStatusMap[activeChannel]}
            onRevoke={() => {}}
          />
        )}
      </div>

      {/* Info footer */}
      <div className="mt-6 rounded-xl bg-info/5 border border-info/20 px-4 py-3 text-xs text-info">
        Employees connect via <strong>Portal → Connect IM</strong>. Disconnecting removes their SSM mapping — they can reconnect anytime by scanning again.
        Employee-initiated disconnects are also available from their Portal.
      </div>
    </div>
  );
}
