import { useEffect, useState } from 'react';
import { Puzzle, Lock, Check, Send, ChevronRight } from 'lucide-react';
import { api } from '../../api/client';
import { Card, Badge, Button } from '../../components/ui';

function friendlyName(raw: string) {
  return raw.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function friendlyDesc(description?: string) {
  return description || 'Enterprise skill integration';
}

export default function MySkills() {
  const [data, setData] = useState<any>(null);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [requesting, setRequesting] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.get<any>('/portal/skills').then(setData).catch(() => {});
  }, []);

  const handleRequest = async (skillName: string) => {
    setRequesting(skillName);
    try {
      await api.post('/portal/requests/create', {
        type: 'skill',
        resourceId: skillName,
        resourceName: friendlyName(skillName),
        reason: `Employee requested access to skill: ${skillName}`,
      });
      setRequested(prev => new Set([...prev, skillName]));
      setToast(`Request submitted for "${friendlyName(skillName)}"`);
      setTimeout(() => setToast(null), 3000);
    } catch {
      setToast('Request failed — please try again');
      setTimeout(() => setToast(null), 3000);
    }
    setRequesting(null);
  };

  if (!data) return <div className="p-6 text-text-muted text-sm">Loading skills...</div>;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-bold text-text-primary">My Skills</h1>

      {toast && (
        <div className="rounded-xl bg-success/10 border border-success/20 px-4 py-2.5 text-sm text-success flex items-center gap-2">
          <Check size={14} /> {toast}
        </div>
      )}

      <Card>
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Check size={15} className="text-success" /> Active Skills ({data.available?.length || 0})
        </h3>
        {(data.available || []).length === 0 ? (
          <p className="text-sm text-text-muted text-center py-4">No skills loaded yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(data.available || []).map((s: any) => (
              <div key={s.id || s.name} className="flex items-start gap-3 rounded-xl bg-success/5 border border-success/20 px-3 py-2.5">
                <Check size={15} className="text-success shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">{s.name || friendlyName(s.id)}</p>
                  <p className="text-xs text-text-muted">{friendlyDesc(s.description)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2">
          <Lock size={15} className="text-text-muted" /> Restricted Skills ({data.restricted?.length || 0})
        </h3>
        <p className="text-xs text-text-muted mb-4">These skills require approval. Click "Request Access" to submit a request to your IT Admin.</p>
        {(data.restricted || []).length === 0 ? (
          <p className="text-sm text-text-muted text-center py-4">No restricted skills for your role.</p>
        ) : (
          <div className="space-y-2">
            {(data.restricted || []).map((s: any) => {
              const name = s.name || s.id || '';
              const alreadyRequested = requested.has(name);
              return (
                <div key={name} className="flex items-center gap-3 rounded-xl bg-surface-dim border border-dark-border/40 px-3 py-3">
                  <Lock size={15} className="text-text-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary">{s.name || friendlyName(name)}</p>
                    <p className="text-xs text-text-muted">{friendlyDesc(s.description)}</p>
                  </div>
                  {alreadyRequested ? (
                    <Badge color="info">Requested</Badge>
                  ) : (
                    <Button size="sm" variant="default"
                      disabled={requesting === name}
                      onClick={() => handleRequest(name)}>
                      {requesting === name ? 'Requesting...' : <><Send size={12} /> Request Access</>}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
