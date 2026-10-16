import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../../context/AuthContext';
import { getAdminInbox, Inbox, InboxItem } from '../../services/api/supervision.api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge, BadgeTone } from '../../components/ui/Badge';

const KIND_LABELS: Record<InboxItem['kind'], string> = {
  APPROVAL: 'Demandes',
  ABSENCE: 'Absences',
  ANOMALY: 'Anomalies',
  MISSION_TO_VALIDATE: 'Missions à valider',
  LOW_STOCK: 'Stock',
  INVOICE_OVERDUE: 'Factures',
  CERTIFICATION: 'Habilitations',
};
const URGENCY: Record<InboxItem['urgency'], { label: string; tone: BadgeTone }> = {
  HIGH: { label: 'Urgent', tone: 'danger' },
  MEDIUM: { label: 'À faire', tone: 'warning' },
  LOW: { label: 'À surveiller', tone: 'neutral' },
};

/** Tout ce qui attend l'administrateur, au même endroit, trié par urgence. */
export const InboxPage: React.FC = () => {
  const { token, notify } = useAuthContext();
  const [data, setData] = useState<Inbox | null>(null);
  const [kind, setKind] = useState<InboxItem['kind'] | 'all'>('all');

  const load = () => {
    if (!token) return;
    getAdminInbox(token)
      .then(setData)
      .catch((err) => notify(err instanceof Error ? err.message : 'Chargement impossible', 'error'));
  };
  useEffect(load, [token]);

  const items = (data?.items ?? []).filter((i) => kind === 'all' || i.kind === kind);

  return (
    <div className="page">
      <PageHeader
        title="À traiter"
        subtitle="Demandes, absences, anomalies, missions non validées, stock, factures et habilitations : tout ce qui attend une action."
      />
      <div className="chips" style={{ margin: '1rem 0' }}>
        <button type="button" className={`chip ${kind === 'all' ? 'chip--selected' : ''}`} onClick={() => setKind('all')}>
          Tout ({data?.total ?? 0})
        </button>
        {Object.entries(data?.counts ?? {}).map(([k, n]) => (
          <button
            key={k}
            type="button"
            className={`chip ${kind === k ? 'chip--selected' : ''}`}
            onClick={() => setKind(k as InboxItem['kind'])}
          >
            {KIND_LABELS[k as InboxItem['kind']] ?? k} ({n})
          </button>
        ))}
      </div>
      <div className="panel">
        {!data && <p className="card__meta">Chargement…</p>}
        {data && items.length === 0 && <p className="card__meta">Rien à traiter : tout est à jour.</p>}
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {items.map((item) => (
            <Link
              key={item.id}
              to={item.link}
              className="card"
              style={{ padding: '0.75rem 1rem', display: 'flex', gap: '1rem', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}
            >
              <Badge tone={URGENCY[item.urgency].tone}>{URGENCY[item.urgency].label}</Badge>
              <div style={{ flex: 1 }}>
                <strong>{item.title}</strong>
                <div className="card__meta">{item.detail}</div>
              </div>
              <span className="card__meta">{KIND_LABELS[item.kind]}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};
