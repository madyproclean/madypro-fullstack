import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { apiFetch } from '../../services/api/client';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';

type ErrorEvent = {
  id: string;
  source: 'SERVER' | 'WEB' | 'MOBILE';
  message: string;
  stack: string | null;
  path: string | null;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
};

const SOURCES: Record<ErrorEvent['source'], string> = { SERVER: 'Serveur', WEB: 'Site web', MOBILE: 'Application' };

/** Erreurs techniques relevées automatiquement, regroupées et comptées. */
export const ErrorsPage: React.FC = () => {
  const { token, notify } = useAuthContext();
  const [items, setItems] = useState<ErrorEvent[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () => {
    if (!token) return;
    apiFetch<ErrorEvent[]>({ path: `monitoring/errors${showResolved ? '?all=true' : ''}`, token })
      .then(setItems)
      .catch((err) => notify(err instanceof Error ? err.message : 'Chargement impossible', 'error'));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [token, showResolved]);

  const resolve = async (id: string) => {
    if (!token) return;
    await apiFetch({ path: `monitoring/errors/${id}/resolve`, token, options: { method: 'PATCH' } });
    notify('Erreur marquée comme corrigée');
    load();
  };

  return (
    <div className="page">
      <PageHeader
        title="Erreurs techniques"
        subtitle="Relevées automatiquement sur le serveur, le site web et l’application. Une erreur corrigée qui revient réapparaît ici."
      />
      <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', margin: '1rem 0' }}>
        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
        Afficher aussi les erreurs corrigées
      </label>
      <div className="panel">
        {items.length === 0 && <p className="card__meta">Aucune erreur en cours. Tout fonctionne normalement.</p>}
        {items.map((e) => (
          <div key={e.id} style={{ padding: '0.75rem 0', borderBottom: '1px solid #eef1f4' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge tone={e.source === 'SERVER' ? 'danger' : 'warning'}>{SOURCES[e.source]}</Badge>
              <strong style={{ flex: 1, minWidth: 240 }}>{e.message}</strong>
              <span className="card__meta">
                {e.count} fois · dernière le {new Date(e.lastSeenAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
              {!e.resolvedAt && (
                <Button type="button" variant="ghost" className="btn--compact" icon={Check} onClick={() => resolve(e.id)}>
                  Corrigée
                </Button>
              )}
            </div>
            {e.path && <div className="card__meta">Où : {e.path}</div>}
            {e.stack && (
              <button type="button" className="chip" style={{ marginTop: 6 }} onClick={() => setOpenId(openId === e.id ? null : e.id)}>
                {openId === e.id ? 'Masquer le détail technique' : 'Détail technique'}
              </button>
            )}
            {openId === e.id && <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', marginTop: 6 }}>{e.stack}</pre>}
          </div>
        ))}
      </div>
    </div>
  );
};
