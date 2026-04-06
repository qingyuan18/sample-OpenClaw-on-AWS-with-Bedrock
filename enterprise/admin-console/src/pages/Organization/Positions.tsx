import { useState } from 'react';
import { Briefcase, Users, Bot, Building2, Plus, Zap, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { Card, StatCard, Badge, Button, PageHeader, Table, Modal, Input, Select, Textarea } from '../../components/ui';
import { usePositions, useDepartments, useAgents, useEmployees, useCreatePosition, useUpdatePosition, useDeletePosition, useBulkProvision } from '../../hooks/useApi';
import { CHANNEL_LABELS } from '../../types';
import type { Position, ChannelType } from '../../types';

export default function Positions() {
  const { data: POSITIONS = [] } = usePositions();
  const { data: DEPARTMENTS = [] } = useDepartments();
  const { data: AGENTS = [] } = useAgents();
  const { data: EMPLOYEES = [] } = useEmployees();
  const createPosition = useCreatePosition();
  const updatePosition = useUpdatePosition();
  const deletePosition = useDeletePosition();
  const bulkProvision = useBulkProvision();
  const [showCreate, setShowCreate] = useState(false);
  const [editingPos, setEditingPos] = useState<Position | null>(null);
  const [deletingPos, setDeletingPos] = useState<Position | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [selected, setSelected] = useState<Position | null>(null);
  const [provisionResult, setProvisionResult] = useState<any>(null);
  const [newName, setNewName] = useState('');
  const [newDept, setNewDept] = useState('');
  const [newSoul, setNewSoul] = useState('');
  const [newChannel, setNewChannel] = useState('slack');
  const [newTools, setNewTools] = useState<string[]>(['web_search']);
  const [newSkills, setNewSkills] = useState<string[]>([]);

  const deptOptions = DEPARTMENTS.filter(d => !d.parentId).map(d => ({ label: d.name, value: d.id }));
  const totalMembers = POSITIONS.reduce((s, p) => s + (p.memberCount || 0), 0);
  const totalUnbound = EMPLOYEES.filter(e => !e.agentId).length;

  const getProvisionStats = (posId: string) => {
    const posEmps = EMPLOYEES.filter(e => e.positionId === posId);
    const bound = posEmps.filter(e => e.agentId).length;
    return { total: posEmps.length, bound, unbound: posEmps.length - bound };
  };

  const handleProvision = (posId: string, channel?: string) => {
    bulkProvision.mutate(
      { positionId: posId, defaultChannel: channel || 'slack' },
      { onSuccess: (data) => setProvisionResult(data) }
    );
  };

  return (
    <div>
      <PageHeader
        title="Position Management"
        description="Positions define default SOUL, Skills, Knowledge, and tool permissions for agents"
        actions={<Button variant="primary" onClick={() => setShowCreate(true)}><Plus size={16} /> Create Position</Button>}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        <StatCard title="Positions" value={POSITIONS.length} icon={<Briefcase size={22} />} color="primary" />
        <StatCard title="Total Members" value={totalMembers} icon={<Users size={22} />} color="info" />
        <StatCard title="Active Agents" value={AGENTS.length} icon={<Bot size={22} />} color="success" />
        <StatCard title="Unbound Employees" value={totalUnbound} icon={<Users size={22} />} color={totalUnbound > 0 ? 'warning' : 'success'} />
      </div>

      <Table
        columns={[
          { key: 'name', label: 'Position', render: (p: Position) => (
            <button onClick={() => setSelected(p)} className="text-primary-light hover:underline font-medium">{p.name}</button>
          )},
          { key: 'dept', label: 'Department', render: (p: Position) => <span className="text-text-secondary">{p.departmentName}</span> },
          { key: 'channel', label: 'Channel', render: (p: Position) => (
            <Badge color="info">{CHANNEL_LABELS[(p.defaultChannel || 'slack') as ChannelType]}</Badge>
          )},
          { key: 'skills', label: 'Default Skills', render: (p: Position) => (
            <div className="flex flex-wrap gap-1">
              {(p.defaultSkills || []).slice(0, 3).map(s => <Badge key={s} color="success">{s}</Badge>)}
              {(p.defaultSkills || []).length > 3 && <Badge>{`+${(p.defaultSkills || []).length - 3}`}</Badge>}
            </div>
          )},
          { key: 'provision', label: 'Provision Status', render: (p: Position) => {
            const stats = getProvisionStats(p.id);
            if (stats.total === 0) return <span className="text-xs text-text-muted">No members</span>;
            if (stats.unbound === 0) return <Badge color="success">{stats.bound}/{stats.total} bound</Badge>;
            return (
              <div className="flex items-center gap-2">
                <Badge color="warning">{stats.bound}/{stats.total} bound</Badge>
                <button
                  onClick={(e) => { e.stopPropagation(); handleProvision(p.id, p.defaultChannel); }}
                  className="text-xs text-primary-light hover:underline flex items-center gap-1"
                  disabled={bulkProvision.isPending}
                >
                  <Zap size={12} /> Provision {stats.unbound}
                </button>
              </div>
            );
          }},
          { key: 'actions', label: '', render: (p: Position) => (
            <div className="flex items-center gap-1">
              <button onClick={e => { e.stopPropagation(); setEditingPos(p); }} className="p-1.5 rounded hover:bg-dark-hover text-text-muted hover:text-text-primary"><Pencil size={13} /></button>
              <button onClick={e => { e.stopPropagation(); setDeletingPos(p); setDeleteError(''); }} className="p-1.5 rounded hover:bg-dark-hover text-text-muted hover:text-danger"><Trash2 size={13} /></button>
            </div>
          )},
        ]}
        data={POSITIONS}
      />

      {/* Detail Modal */}
      <Modal open={!!selected} onClose={() => { setSelected(null); setProvisionResult(null); }} title={selected?.name || ''} size="lg">
        {selected && (() => {
          const stats = getProvisionStats(selected.id);
          const posEmps = EMPLOYEES.filter(e => e.positionId === selected.id);
          return (
            <div className="space-y-5">
              <div className="grid grid-cols-4 gap-4">
                <div><p className="text-xs text-text-muted">Department</p><p className="text-sm font-medium">{selected.departmentName}</p></div>
                <div><p className="text-xs text-text-muted">Members</p><p className="text-sm font-medium">{stats.total}</p></div>
                <div><p className="text-xs text-text-muted">Agents Bound</p><p className="text-sm font-medium text-green-400">{stats.bound}</p></div>
                <div><p className="text-xs text-text-muted">Default Channel</p><Badge color="info">{CHANNEL_LABELS[(selected.defaultChannel || 'slack') as ChannelType]}</Badge></div>
              </div>

              {stats.unbound > 0 && !provisionResult && (
                <div className="rounded-lg bg-warning/5 border border-warning/20 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-warning">{stats.unbound} employee(s) without agents</p>
                    <p className="text-xs text-text-muted">Auto-create Serverless agents with position SOUL template and default skills</p>
                  </div>
                  <Button variant="primary" size="sm" onClick={() => handleProvision(selected.id, selected.defaultChannel)} disabled={bulkProvision.isPending}>
                    <Zap size={14} /> {bulkProvision.isPending ? 'Provisioning...' : `Provision All (${stats.unbound})`}
                  </Button>
                </div>
              )}

              {provisionResult && (
                <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3">
                  <p className="text-sm font-medium text-green-400">✓ Provisioned {provisionResult.provisioned} agent(s)</p>
                  {provisionResult.details?.map((d: any, i: number) => (
                    <p key={i} className="text-xs text-text-muted mt-1">• {d.employee} → {d.agent}</p>
                  ))}
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-medium text-text-muted uppercase tracking-wider">SOUL Template</p>
                <pre className="rounded-lg bg-dark-bg border border-dark-border p-4 text-sm text-text-secondary whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">{selected.soulTemplate || "(No SOUL template configured)"}</pre>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="mb-2 text-xs font-medium text-text-muted uppercase tracking-wider">Default Skills</p>
                  <div className="flex flex-wrap gap-2">{(selected.defaultSkills || []).map(s => <Badge key={s} color="success">{s}</Badge>)}</div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-text-muted uppercase tracking-wider">Tool Allowlist</p>
                  <div className="flex flex-wrap gap-2">{(selected.toolAllowlist || []).map(t => <Badge key={t} color="info">{t}</Badge>)}</div>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-text-muted uppercase tracking-wider">Employees ({posEmps.length})</p>
                <div className="space-y-2">
                  {posEmps.map(e => {
                    const agent = AGENTS.find(a => a.id === e.agentId);
                    return (
                      <div key={e.id} className="flex items-center justify-between rounded-lg bg-dark-bg px-3 py-2">
                        <div className="flex items-center gap-3">
                          <span className="text-sm">{e.name}</span>
                          <span className="text-xs text-text-muted">{e.employeeNo}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {agent ? (
                            <>
                              <span className="text-xs text-text-secondary">{agent.name}</span>
                              <Badge color="success">Bound</Badge>
                            </>
                          ) : (
                            <Badge color="warning">Unbound</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Edit Position Modal */}
      <Modal open={!!editingPos} title={editingPos ? `Edit: ${editingPos.name}` : ''} onClose={() => setEditingPos(null)} footer={
        <><Button variant="ghost" onClick={() => setEditingPos(null)}>Cancel</Button>
        <Button variant="primary" disabled={updatePosition.isPending} onClick={() => {
          if (!editingPos) return;
          const dept = DEPARTMENTS.find(d => d.id === editingPos.departmentId);
          updatePosition.mutate({ id: editingPos.id, name: editingPos.name, departmentId: editingPos.departmentId,
            departmentName: dept?.name || editingPos.departmentName, defaultChannel: editingPos.defaultChannel,
            defaultSkills: editingPos.defaultSkills, toolAllowlist: editingPos.toolAllowlist, soulTemplate: editingPos.soulTemplate },
            { onSuccess: () => setEditingPos(null) });
        }}>{updatePosition.isPending ? 'Saving…' : 'Save'}</Button></>
      }>
        {editingPos && <div className="space-y-4">
          <Input label="Name" value={editingPos.name} onChange={v => setEditingPos({ ...editingPos, name: v })} />
          <Select label="Department" value={editingPos.departmentId} onChange={v => {
            const dept = DEPARTMENTS.find(d => d.id === v);
            setEditingPos({ ...editingPos, departmentId: v, departmentName: dept?.name || '' });
          }} options={DEPARTMENTS.filter(d => !d.parentId).map(d => ({ label: d.name, value: d.id }))} />
          <Select label="Default Channel" value={editingPos.defaultChannel || 'slack'} onChange={v => setEditingPos({ ...editingPos, defaultChannel: v as any })}
            options={[{label:'Slack',value:'slack'},{label:'Telegram',value:'telegram'},{label:'Discord',value:'discord'},{label:'WhatsApp',value:'whatsapp'}]} />
        </div>}
      </Modal>

      {/* Delete Position Modal */}
      <Modal open={!!deletingPos} title="Delete Position" onClose={() => setDeletingPos(null)} footer={
        <><Button variant="ghost" onClick={() => setDeletingPos(null)}>Cancel</Button>
        <Button variant="danger" disabled={deletePosition.isPending || !!deleteError} onClick={() => {
          if (!deletingPos) return;
          setDeleteError('');
          deletePosition.mutate(deletingPos.id, {
            onSuccess: () => setDeletingPos(null),
            onError: (err: any) => setDeleteError(err?.response?.data?.message || err?.message || 'Delete failed'),
          });
        }}>{deletePosition.isPending ? 'Deleting…' : 'Delete'}</Button></>
      }>
        <div className="space-y-3">
          <p className="text-sm text-text-primary">Delete position <strong>{deletingPos?.name}</strong>?</p>
          {deleteError ? (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5">
              <AlertTriangle size={16} className="text-danger mt-0.5 shrink-0" />
              <p className="text-sm text-danger">{deleteError}</p>
            </div>
          ) : (
            <p className="text-xs text-text-muted">All employees must be reassigned to another position first.</p>
          )}
        </div>
      </Modal>

      {/* Create Modal */}
      <Modal
        open={showCreate} onClose={() => setShowCreate(false)} title="Create Position"
        footer={<div className="flex justify-end gap-3"><Button variant="default" onClick={() => setShowCreate(false)}>Cancel</Button><Button variant="primary" onClick={() => {
          if (newName && newDept) {
            const dept = DEPARTMENTS.find(d => d.id === newDept);
            createPosition.mutate({
              name: newName,
              departmentId: newDept,
              departmentName: dept?.name || '',
              soulTemplate: newSoul,
              defaultSkills: newSkills,
              defaultKnowledge: [],
              toolAllowlist: newTools,
              defaultChannel: newChannel as any,
              memberCount: 0,
              createdAt: new Date().toISOString(),
            });
          }
          setShowCreate(false); setNewName(''); setNewDept(''); setNewSoul(''); setNewChannel('slack'); setNewTools(['web_search']); setNewSkills([]);
        }}>Create</Button></div>}
      >
        <div className="space-y-4">
          <Input label="Position Name" value={newName} onChange={setNewName} placeholder="e.g. Solutions Architect" />
          <Select label="Department" value={newDept} onChange={setNewDept} options={deptOptions} placeholder="Select department" />
          <Select label="Default Channel" value={newChannel} onChange={setNewChannel} options={[
            { label: 'Slack', value: 'slack' }, { label: 'Telegram', value: 'telegram' },
            { label: 'WhatsApp', value: 'whatsapp' }, { label: 'Discord', value: 'discord' },
            { label: 'Feishu', value: 'feishu' }, { label: 'DingTalk', value: 'dingtalk' },
          ]} />
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Tool Permissions</label>
            <div className="flex flex-wrap gap-2">
              {['web_search', 'browser', 'file', 'file_write', 'shell', 'code_execution'].map(tool => (
                <button key={tool} onClick={() => setNewTools(prev => prev.includes(tool) ? prev.filter(t => t !== tool) : [...prev, tool])}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${newTools.includes(tool) ? 'bg-primary/10 border-primary/40 text-primary-light' : 'border-dark-border text-text-muted hover:border-text-muted'}`}>
                  {tool}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-text-muted mt-1">Tools this position's agents are allowed to use (Plan A enforcement)</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Default Skills</label>
            <div className="flex flex-wrap gap-2">
              {['web_search', 'browser', 'excel-gen', 'email-send', 'calendar-check', 'crm-query', 'google-docs', 'notion-sync', 'sap-connector'].map(skill => (
                <button key={skill} onClick={() => setNewSkills(prev => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill])}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${newSkills.includes(skill) ? 'bg-success/10 border-success/40 text-success' : 'border-dark-border text-text-muted hover:border-text-muted'}`}>
                  {skill}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-text-muted mt-1">Skills auto-installed for agents in this position</p>
          </div>
          <Textarea label="SOUL Template" value={newSoul} onChange={setNewSoul} rows={6} placeholder="You are a ... specializing in ..." description="Define the default persona and behavior rules for agents in this position" />
        </div>
      </Modal>
    </div>
  );
}
