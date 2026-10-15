import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { listApprovalRequests, approveRequest, rejectRequest } from '../../services/api/approvals.api';
import { listUsers } from '../../services/api/users.api';
import { listSites } from '../../services/api/sites.api';
import {
  ApprovalActionType,
  ApprovalRequest,
  TemplateBatchPayload,
  OneshotBatchPayload,
  ValidateTemplatePayload,
} from '../../types/approval';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { PromptModal } from '../../components/ui/PromptModal';
import { Modal, ModalHeader, ModalBody } from '../../components/ui/Modal';
import { Badge, BadgeTone } from '../../components/ui/Badge';
import { StatCard } from '../../components/ui/StatCard';
import { BarChartCard } from '../../components/charts/BarChartCard';
import { TemplateImpactPanel } from '../../components/interventions/TemplateImpactPanel';
import { getTemplate, previewTemplateImpact } from '../../services/api/interventions.api';
import { TemplateImpact } from '../../types/intervention';
import { Check, ClipboardCheck, X } from 'lucide-react';

const ACTION_LABELS: Record<ApprovalActionType, string> = {
  CREATE_INTERVENTION: 'Création d’intervention',
  UPDATE_INTERVENTION_SCHEDULE: 'Modification d’horaire',
  ASSIGN_AGENT: 'Ajout d’agent',
  UNASSIGN_AGENT: 'Retrait d’agent',
  CANCEL_INTERVENTION: 'Annulation d’intervention',
  CREATE_TEMPLATE_BATCH: 'Génération d’un gabarit',
  VALIDATE_TEMPLATE: 'Validation d’un gabarit',
  CANCEL_OCCURRENCE: 'Annulation d’un passage (un jour)',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  APPROVED: 'Approuvée',
  REJECTED: 'Refusée',
  SUPERSEDED: 'Remplacée',
};

const STATUS_TONES: Record<string, BadgeTone> = {
  PENDING: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  SUPERSEDED: 'neutral',
};

export const ApprovalsPage: React.FC = () => {
  const { token, notify } = useAuthContext();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});
  const [siteNames, setSiteNames] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [datesModalId, setDatesModalId] = useState<string | null>(null);
  const [rejectPromptId, setRejectPromptId] = useState<string | null>(null);
  const [impactById, setImpactById] = useState<Record<string, TemplateImpact | 'loading'>>({});

  /** Effet de la version proposée d'un gabarit sur les 2 prochaines semaines. */
  const toggleImpact = async (req: ApprovalRequest) => {
    if (!token || !req.entityId) return;
    if (impactById[req.id]) {
      setImpactById(({ [req.id]: _, ...rest }) => rest);
      return;
    }
    setImpactById((prev) => ({ ...prev, [req.id]: 'loading' }));
    try {
      const template = await getTemplate(token, req.entityId);
      const proposal = (template.pendingVersion as any) ?? { stops: template.stops };
      const impact = await previewTemplateImpact(token, template.id, { ...proposal, active: true });
      // Gabarit jamais validé : tout ce qu'il prévoit est « ajouté ».
      setImpactById((prev) => ({ ...prev, [req.id]: { ...impact, requiresValidation: false } }));
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Aperçu impossible', 'error');
      setImpactById(({ [req.id]: _, ...rest }) => rest);
    }
  };

  const load = () => {
    if (!token) return Promise.resolve();
    setLoading(true);
    return listApprovalRequests(token, { status: statusFilter === 'all' ? undefined : statusFilter, pageSize: 100 })
      .then((res) => setRequests(res.items))
      .catch((err) => notify(err instanceof Error ? err.message : 'Impossible de charger les demandes', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [token, statusFilter]);

  const loadPendingCount = () => {
    if (!token) return;
    listApprovalRequests(token, { status: 'PENDING', pageSize: 1 })
      .then((res) => setPendingCount(res.total))
      .catch(() => {});
  };

  useEffect(loadPendingCount, [token]);

  useEffect(() => {
    if (!token) return;
    listUsers(token, { pageSize: 500 })
      .then((res) => {
        const map: Record<string, string> = {};
        res.items.forEach((u) => {
          map[u.id] = `${u.firstName} ${u.lastName}`;
        });
        setAgentNames(map);
      })
      .catch(() => setAgentNames({}));
    listSites(token, { pageSize: 500 })
      .then((res) => {
        const map: Record<string, string> = {};
        res.items.forEach((s) => {
          map[s.id] = s.name;
        });
        setSiteNames(map);
      })
      .catch(() => setSiteNames({}));
  }, [token]);

  const datesModalRequest = requests.find((r) => r.id === datesModalId) ?? null;

  // Répartition par type d'action des demandes actuellement affichées
  // (pas de nouvelle source de données).
  const actionBreakdown = (() => {
    if (requests.length === 0) return [];
    const counts = new Map<string, number>();
    requests.forEach((req) => {
      const label = ACTION_LABELS[req.actionType] ?? req.actionType;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return Array.from(counts.entries()).map(([action, Total]) => ({ action, Total }));
  })();

  const describe = (req: ApprovalRequest) => {
    const payload = req.payload as any;
    const prev = req.previousState as any;
    switch (req.actionType) {
      case 'CREATE_INTERVENTION': {
        if (Array.isArray(payload.occurrences)) {
          const batch = payload as OneshotBatchPayload;
          const siteLabels = Array.from(new Set(batch.occurrences.map((o) => siteNames[o.siteId] ?? o.siteId)));
          return `${siteLabels.join(', ')} — ${batch.occurrences.length} intervention(s)`;
        }
        return `${payload.date} · ${payload.startTime}–${payload.endTime}${payload.siteId ? ` (site ${siteNames[payload.siteId] ?? payload.siteId})` : ''}`;
      }
      case 'UPDATE_INTERVENTION_SCHEDULE': {
        const beforeLabel = prev ? `${prev.date} ${prev.startTime}–${prev.endTime}` : '—';
        const afterLabel = `${payload.date ?? prev?.date} ${payload.startTime ?? prev?.startTime}–${payload.endTime ?? prev?.endTime}`;
        return `${beforeLabel} → ${afterLabel}`;
      }
      case 'ASSIGN_AGENT':
      case 'UNASSIGN_AGENT': {
        const before: string[] = prev?.agentIds ?? [];
        const after: string[] = payload.agentIds ?? [];
        const added = after.filter((id) => !before.includes(id)).map((id) => agentNames[id] ?? id);
        const removed = before.filter((id) => !after.includes(id)).map((id) => agentNames[id] ?? id);
        const parts: string[] = [];
        if (added.length) parts.push(`+ ${added.join(', ')}`);
        if (removed.length) parts.push(`− ${removed.join(', ')}`);
        return parts.join(' · ') || 'Aucun changement détecté';
      }
      case 'CANCEL_INTERVENTION':
        return `Motif : ${payload.observation}`;
      case 'CREATE_TEMPLATE_BATCH': {
        const batch = payload as TemplateBatchPayload;
        const siteLabels = Array.from(new Set((batch.occurrences ?? []).map((o) => siteNames[o.siteId] ?? o.siteId)));
        return `${batch.templateLabel ?? 'Gabarit'} — ${siteLabels.join(', ')} — ${batch.occurrences?.length ?? 0} intervention(s)`;
      }
      case 'VALIDATE_TEMPLATE': {
        const validate = payload as ValidateTemplatePayload;
        const siteLabel = validate.siteName ?? (validate.siteId ? siteNames[validate.siteId] ?? validate.siteId : '');
        const pending = (payload as any).pending ? ' · modification (la version actuelle reste active en attendant)' : '';
        return `${validate.templateLabel ?? 'Gabarit'}${siteLabel ? ` — ${siteLabel}` : ''}${pending}`;
      }
      case 'CANCEL_OCCURRENCE':
        return req.summary ?? `${payload.siteName} · ${payload.date} ${payload.startTime}–${payload.endTime} · motif : ${payload.reason}`;
      default:
        return '';
    }
  };

  const handleApprove = async (id: string) => {
    if (!token) return;
    setBusyId(id);
    try {
      await approveRequest(token, id);
      notify('Demande approuvée et appliquée');
      await load();
      loadPendingCount();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible d’approuver cette demande', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = (id: string) => setRejectPromptId(id);

  const confirmReject = async (comment: string) => {
    if (!token || !rejectPromptId) return;
    const id = rejectPromptId;
    setRejectPromptId(null);
    setBusyId(id);
    try {
      await rejectRequest(token, id, comment);
      notify('Demande refusée');
      await load();
      loadPendingCount();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible de refuser cette demande', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Demandes de validation"
        subtitle="Actions planning proposées par les superviseurs, en attente d’une décision admin."
      />

      <div className="page-grid" style={{ marginBottom: '1rem' }}>
        <StatCard
          icon={ClipboardCheck}
          badgeTone="orange"
          value={pendingCount}
          label={loading ? 'Chargement...' : 'Demandes en attente'}
        />
      </div>

      <div className="filter-grid" style={{ marginBottom: '1rem' }}>
        <label className="filter-field filter-card">
          Statut
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="PENDING">En attente</option>
            <option value="APPROVED">Approuvées</option>
            <option value="REJECTED">Refusées</option>
            <option value="SUPERSEDED">Remplacées</option>
            <option value="all">Toutes</option>
          </select>
        </label>
      </div>

      {actionBreakdown.length > 0 && (
        <div style={{ maxWidth: 560, marginBottom: '1.5rem' }}>
          <BarChartCard title="Demandes par type d'action" data={actionBreakdown} xKey="action" series={['Total']} />
        </div>
      )}

      <div className="panel">
        <div className="table-wrapper">
          <table className="table" aria-label="demandes de validation">
            <thead>
              <tr>
                <th>Demandeur</th>
                <th>Action</th>
                <th>Détail</th>
                <th>Statut</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id}>
                  <td>{req.requestedByName ?? req.requestedById}</td>
                  <td>{ACTION_LABELS[req.actionType] ?? req.actionType}</td>
                  <td>
                    {describe(req)}
                    {(req.actionType === 'CREATE_TEMPLATE_BATCH' ||
                      (req.actionType === 'CREATE_INTERVENTION' && Array.isArray((req.payload as any).occurrences))) && (
                      <div style={{ marginTop: '0.35rem' }}>
                        <button
                          type="button"
                          onClick={() => setDatesModalId(req.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: 'var(--color-accent)',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            textDecoration: 'underline',
                          }}
                        >
                          Voir les dates
                        </button>
                      </div>
                    )}
                    {req.actionType === 'VALIDATE_TEMPLATE' && req.status === 'PENDING' && (
                      <div style={{ marginTop: '0.35rem' }}>
                        <button
                          type="button"
                          onClick={() => toggleImpact(req)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: 'var(--color-accent)',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            textDecoration: 'underline',
                          }}
                        >
                          {impactById[req.id] ? 'Masquer l’effet' : 'Voir l’effet sur le planning'}
                        </button>
                        {impactById[req.id] === 'loading' && <div className="card__meta">Calcul...</div>}
                        {impactById[req.id] && impactById[req.id] !== 'loading' && (
                          <div style={{ marginTop: '0.4rem', minWidth: 320 }}>
                            <TemplateImpactPanel impact={impactById[req.id] as TemplateImpact} />
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    <Badge tone={STATUS_TONES[req.status] ?? 'neutral'}>
                      {STATUS_LABELS[req.status] ?? req.status}
                    </Badge>
                    {req.status !== 'PENDING' && req.reviewComment && (
                      <div className="card__meta" style={{ marginTop: '0.25rem' }}>
                        {req.reviewComment}
                      </div>
                    )}
                  </td>
                  <td>{new Date(req.createdAt).toLocaleString('fr-FR')}</td>
                  <td>
                    {req.status === 'PENDING' ? (
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <Button
                          type="button"
                          className="btn--compact"
                          icon={Check}
                          disabled={busyId === req.id}
                          onClick={() => handleApprove(req.id)}
                        >
                          Approuver
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="btn--compact"
                          icon={X}
                          disabled={busyId === req.id}
                          onClick={() => handleReject(req.id)}
                        >
                          Refuser
                        </Button>
                      </div>
                    ) : (
                      <span className="card__meta">
                        {req.reviewedByName ? `Par ${req.reviewedByName}` : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                    Aucune demande pour ce filtre.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <PromptModal
        open={rejectPromptId !== null}
        title="Motif du refus"
        label="Motif"
        required
        confirmLabel="Refuser"
        onConfirm={confirmReject}
        onCancel={() => setRejectPromptId(null)}
      />

      <Modal open={datesModalId !== null} onClose={() => setDatesModalId(null)} maxWidth={480} labelledBy="approval-dates-title">
        <ModalHeader eyebrow="Détail" title="Dates concernées" titleId="approval-dates-title" onClose={() => setDatesModalId(null)} />
        <ModalBody>
          {datesModalRequest && (
            <ol className="list-line" style={{ margin: 0, padding: 0 }}>
              {(datesModalRequest.payload as TemplateBatchPayload | OneshotBatchPayload).occurrences?.map((o, index) => (
                <li key={index}>
                  <span>{o.date}</span>
                  <span>
                    {siteNames[o.siteId] ?? o.siteId} · {o.startTime}–{o.endTime}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </ModalBody>
      </Modal>
    </div>
  );
};
