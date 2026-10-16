import React, { useEffect, useState } from 'react';
import { Check, FileText, Send } from 'lucide-react';
import { openPdfInNewTab } from '../../utils/downloadPdf';
import { useAuthContext } from '../../context/AuthContext';
import {
  createSiteInspection,
  getQualityOverview,
  getSiteHistory,
  messageSiteTeam,
  QualityItem,
  SiteHistory,
} from '../../services/api/supervision.api';
import { Button } from '../ui/Button';
import { Badge, BadgeTone } from '../ui/Badge';

const STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Prévue',
  IN_PROGRESS: 'En cours',
  NEEDS_REVIEW: 'À valider',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
  NO_SHOW: 'Non faite',
};
const RATINGS: { value: QualityItem['rating']; label: string }[] = [
  { value: 'GOOD', label: 'Bien' },
  { value: 'AVERAGE', label: 'Moyen' },
  { value: 'POOR', label: 'À reprendre' },
];
const scoreTone = (score: number): BadgeTone => (score >= 80 ? 'success' : score >= 60 ? 'warning' : 'danger');

/**
 * Suivi d'un site : contrôles qualité (grille notée), message à toute l'équipe du site et
 * historique des dernières missions.
 */
export const SiteFollowUpPanel: React.FC<{ siteId: string }> = ({ siteId }) => {
  const { token, notify } = useAuthContext();
  const [history, setHistory] = useState<SiteHistory | null>(null);
  const [criteria, setCriteria] = useState<string[]>([]);
  const [ratings, setRatings] = useState<Record<string, QualityItem['rating'] | ''>>({});
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const openReport = () => {
    if (!token) return;
    openPdfInNewTab(token, `reports/client-report/pdf?siteId=${siteId}&month=${reportMonth}`).catch((err) =>
      notify(err instanceof Error ? err.message : 'Compte rendu indisponible', 'error'),
    );
  };

  const load = () => {
    if (!token) return;
    getSiteHistory(token, siteId).then(setHistory).catch(() => setHistory(null));
  };

  useEffect(() => {
    load();
    if (token) getQualityOverview(token).then((o) => setCriteria(o.criteria)).catch(() => setCriteria([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, siteId]);

  const rated = criteria.filter((c) => ratings[c]);

  const saveInspection = async () => {
    if (!token || !rated.length) return;
    setSaving(true);
    try {
      const result = await createSiteInspection(token, siteId, {
        items: rated.map((label) => ({ label, rating: ratings[label] as QualityItem['rating'] })),
        comment: comment.trim() || undefined,
      });
      notify(`Contrôle enregistré : ${result.score} / 100`);
      setRatings({});
      setComment('');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Contrôle impossible', 'error');
    } finally {
      setSaving(false);
    }
  };

  const sendMessage = async () => {
    if (!token || message.trim().length < 2) return;
    setSending(true);
    try {
      const result = await messageSiteTeam(token, siteId, message.trim());
      notify(`Message envoyé à ${result.recipients.length} agent(s) : ${result.recipients.map((r) => r.name).join(', ')}`);
      setMessage('');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Envoi impossible', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="panel" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px' }}>
          <h3 style={{ marginTop: 0 }}>Compte rendu pour le client</h3>
          <p className="card__meta" style={{ margin: 0 }}>
            Passages du mois avec horaires réels, checklists, incidents, contrôles qualité et photos. Le PDF s’ouvre : rien n’est
            envoyé au client.
          </p>
        </div>
        <label className="filter-field">
          Mois
          <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
        </label>
        <Button type="button" icon={FileText} onClick={openReport} disabled={!reportMonth}>
          Ouvrir le PDF
        </Button>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Écrire à l’équipe du site</h3>
        <p className="card__meta">Chaque agent qui travaille sur ce site reçoit le message dans sa messagerie.</p>
        <textarea
          aria-label="Message à l'équipe du site"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          style={{ width: '100%', marginTop: '0.5rem' }}
          placeholder="Ex. : le code d'accès change à partir de lundi"
        />
        <div className="form-actions">
          <Button type="button" icon={Send} loading={sending} disabled={message.trim().length < 2} onClick={sendMessage}>
            Envoyer
          </Button>
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Nouveau contrôle qualité</h3>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {criteria.map((label) => (
            <div key={label} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ minWidth: 240 }}>{label}</span>
              <div className="chips">
                {RATINGS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    className={`chip ${ratings[label] === r.value ? 'chip--selected' : ''}`}
                    aria-pressed={ratings[label] === r.value}
                    onClick={() => setRatings((prev) => ({ ...prev, [label]: prev[label] === r.value ? '' : r.value }))}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <textarea
            aria-label="Commentaire du contrôle"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Commentaire (facultatif)"
          />
        </div>
        <div className="form-actions">
          <Button type="button" icon={Check} loading={saving} disabled={!rated.length} onClick={saveInspection}>
            Enregistrer le contrôle
          </Button>
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Contrôles qualité</h3>
        {!history?.inspections.length && <p className="card__meta">Aucun contrôle pour l’instant.</p>}
        {history?.inspections.map((q) => (
          <div key={q.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #eef1f4' }}>
            <Badge tone={scoreTone(q.score)}>{q.score} / 100</Badge>{' '}
            <span className="card__meta">
              {new Date(q.createdAt).toLocaleDateString('fr-FR')} · {q.inspectorName}
            </span>
            {q.items.filter((i) => i.rating !== 'GOOD').length > 0 && (
              <div style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
                {q.items
                  .filter((i) => i.rating !== 'GOOD')
                  .map((i) => `${i.rating === 'POOR' ? 'À reprendre' : 'Moyen'} : ${i.label}${i.comment ? ` (${i.comment})` : ''}`)
                  .join(' · ')}
              </div>
            )}
            {q.comment && <div style={{ fontSize: '0.9rem' }}>{q.comment}</div>}
          </div>
        ))}
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Historique des missions</h3>
        <div className="table-wrapper">
          <table className="table" aria-label="historique des missions du site">
            <thead>
              <tr>
                <th>Date</th>
                <th>Horaire</th>
                <th>Statut</th>
                <th>Agents</th>
                <th>Photos</th>
                <th>Anomalies</th>
                <th>Observation</th>
              </tr>
            </thead>
            <tbody>
              {history?.missions.map((m) => (
                <tr key={m.id}>
                  <td>{new Date(`${m.date}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' })}</td>
                  <td>
                    {m.startTime}–{m.endTime}
                  </td>
                  <td>{STATUS_LABELS[m.status] ?? m.status}</td>
                  <td>{m.agents.join(', ') || '—'}</td>
                  <td>{m.photoCount || '—'}</td>
                  <td>{m.anomalies.map((a) => `${a.title}${a.status === 'NEW' ? ' (à traiter)' : ''}`).join(', ') || '—'}</td>
                  <td>{m.observation ?? '—'}</td>
                </tr>
              ))}
              {!history?.missions.length && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                    Aucune mission passée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
