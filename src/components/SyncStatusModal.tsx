import { useEffect, useState } from 'react';
import { CheckCircle2, Database, Loader2, RefreshCw, Server, X } from 'lucide-react';

interface SyncStatusModalProps {
  open: boolean;
  onClose: () => void;
  onSyncCompleted: () => void;
}

interface SyncLog {
  id: number;
  source: string;
  records_synced: number;
  status: string;
  message: string;
  synced_at: string;
}

export function SyncStatusModal({ open, onClose, onSyncCompleted }: SyncStatusModalProps) {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [d1Connected, setD1Connected] = useState(false);
  const [syncingTarget, setSyncingTarget] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch('/api/scielo-sync')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { logs?: SyncLog[]; d1Connected?: boolean } | null) => {
        if (!d) return;
        setLogs(d.logs || []);
        setD1Connected(Boolean(d.d1Connected));
      })
      .catch(() => undefined);
  }, [open]);

  if (!open) return null;

  const triggerSync = async (target: 'opds' | 'books-oai' | 'scielo-mx' | 'scielo-pe') => {
    setSyncingTarget(target);
    setFeedback(null);
    try {
      const res = await fetch('/api/scielo-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target })
      });
      const data = (await res.json()) as { ok?: boolean; synced?: number; error?: string };
      if (data.ok) {
        setFeedback(`Sincronizados ${data.synced ?? 0} registros desde ${target} hacia D1.`);
        onSyncCompleted();
        const logsRes = await fetch('/api/scielo-sync').then((r) => r.json() as Promise<{ logs?: SyncLog[] }>);
        setLogs(logsRes.logs || []);
      } else {
        setFeedback(`Aviso de origen (${target}): ${data.error || 'No se pudo completar la sincronización'}`);
      }
    } catch {
      setFeedback('Endpoint Edge /api/scielo-sync disponible en despliegue Cloudflare Pages.');
    } finally {
      setSyncingTarget(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />

      <div
        className="relative z-10 w-full max-w-xl rounded border shadow-2xl"
        style={{ backgroundColor: 'var(--bg-page)', borderColor: 'var(--border-strong)' }}
        role="dialog"
        aria-label="Sincronización OAI-PMH y Edge D1"
      >
        <div
          className="flex items-center justify-between border-b px-5 py-3.5"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-hairline)' }}
        >
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4" style={{ color: 'var(--accent-crimson)' }} />
            <h2 className="font-editorial text-base font-semibold">
              Cosecha OAI-PMH &amp; Cloudflare Edge D1
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded border"
            style={{ borderColor: 'var(--border-hairline)', backgroundColor: 'var(--bg-card)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5 text-xs">
          <div
            className="flex items-center justify-between rounded border p-3"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-hairline)' }}
          >
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4" style={{ color: 'var(--accent-moss)' }} />
              <span>Base de datos SQLite en el borde (Cloudflare D1)</span>
            </div>
            <span className="font-code font-semibold" style={{ color: d1Connected ? 'var(--accent-moss)' : 'var(--accent-ochre)' }}>
              {d1Connected ? 'CONECTADA' : 'MODO LOCAL'}
            </span>
          </div>

          <div>
            <p className="mb-2 font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Ejecutar cosecha incremental desde el Edge Worker:
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                { id: 'opds', label: 'SciELO Books OPDS (Nuevos)' },
                { id: 'books-oai', label: 'SciELO Books OAI-PMH (oai_dc)' },
                { id: 'scielo-mx', label: 'SciELO México OAI-PMH' },
                { id: 'scielo-pe', label: 'SciELO Perú OAI-PMH' }
              ].map((src) => (
                <button
                  key={src.id}
                  type="button"
                  disabled={syncingTarget !== null}
                  onClick={() => triggerSync(src.id as 'opds' | 'books-oai' | 'scielo-mx' | 'scielo-pe')}
                  className="flex items-center justify-between rounded border px-3 py-2 text-left font-medium transition-colors disabled:opacity-50"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-hairline)' }}
                >
                  <span>{src.label}</span>
                  {syncingTarget === src.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" style={{ color: 'var(--accent-crimson)' }} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {feedback && (
            <div
              className="flex items-center gap-2 rounded border p-2.5"
              style={{
                borderColor: 'var(--accent-moss)',
                backgroundColor: 'rgba(77, 107, 83, 0.12)',
                color: 'var(--text-primary)'
              }}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'var(--accent-moss)' }} />
              <span>{feedback}</span>
            </div>
          )}

          {logs.length > 0 && (
            <div>
              <p className="mb-2 font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Historial reciente en D1
              </p>
              <div className="max-h-44 space-y-1.5 overflow-y-auto">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between rounded border px-3 py-1.5"
                    style={{ borderColor: 'var(--border-hairline)', backgroundColor: 'var(--bg-card)' }}
                  >
                    <div className="min-w-0">
                      <span className="font-code font-semibold">{log.source}</span>
                      <span className="ml-2" style={{ color: 'var(--text-secondary)' }}>
                        {log.message}
                      </span>
                    </div>
                    <span className="shrink-0 font-code text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {log.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
