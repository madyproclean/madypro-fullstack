import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listAbsences,
  createManualAbsence,
  updateAbsenceStatus,
  approveAbsenceLevel1,
  listBlockedPeriods,
  createBlockedPeriod,
  deleteBlockedPeriod,
  BlockedPeriod,
  AbsenceFilters,
  ManualAbsencePayload,
  AbsencePage,
} from '../../services/api/absences.api';
import { Absence, AbsenceStatus, AbsenceType } from '../../types/absence';
import { listUsers } from '../../services/api/users.api';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Button } from '../../components/ui/Button';
import { PromptModal } from '../../components/ui/PromptModal';
import { Modal, ModalHeader, ModalBody } from '../../components/ui/Modal';
import { useAuthContext } from '../../context/AuthContext';
import { User } from '../../types/user';
import { Plus, RotateCcw, Check, X, ArrowLeft, ArrowRight, Trash2 } from 'lucide-react';

const TYPE_OPTIONS: { value: AbsenceType | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous les types' },
  { value: 'SICK', label: 'Arrêt maladie' },
  { value: 'PAID_LEAVE', label: 'Congés payés' },
  { value: 'UNPAID', label: 'Sans solde' },
  { value: 'OTHER', label: 'Autre' },
];

const STATUS_OPTIONS: { value: AbsenceStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous statuts' },
  { value: 'PENDING', label: 'En attente' },
  { value: 'APPROVED', label: 'Approuvé' },
  { value: 'REJECTED', label: 'Rejeté' },
];

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const initialFilters = () => {
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - 1);
  const end = new Date(now);
  end.setMonth(end.getMonth() + 3); // inclut les absences futures
  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
    agentId: 'all',
    type: 'all' as AbsenceType | 'all',
    status: 'all' as AbsenceStatus | 'all',
  };
};

type ManualFormState = {
  userId: string;
  type: AbsenceType;
  from: string;
  to: string;
  reason: string;
  note: string;
};

const EMPTY_MANUAL_FORM: ManualFormState = {
  userId: '',
  type: 'SICK',
  from: formatDate(new Date()),
  to: formatDate(new Date()),
  reason: '',
  note: '',
};

export const AbsencesListPage: React.FC = () => {
  const { token, user, notify } = useAuthContext();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [pageData, setPageData] = useState<AbsencePage>({
    items: [],
    total: 0,
    page: 1,
    pageSize,
  });
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<User[]>([]);
  const [manualForm, setManualForm] = useState<ManualFormState>(EMPTY_MANUAL_FORM);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [decisionPrompt, setDecisionPrompt] = useState<{ absence: Absence; status: AbsenceStatus } | null>(null);
  const [blockedPeriods, setBlockedPeriods] = useState<BlockedPeriod[]>([]);
  const [newBlockedPeriod, setNewBlockedPeriod] = useState({ from: '', to: '', reason: '' });

  const loadBlockedPeriods = () => {
    if (!token) return;
    listBlockedPeriods(token).then(setBlockedPeriods).catch(() => {});
  };

  useEffect(loadBlockedPeriods, [token]);

  const submitBlockedPeriod = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !newBlockedPeriod.from || !newBlockedPeriod.to || !newBlockedPeriod.reason.trim()) return;
    try {
      await createBlockedPeriod(token, newBlockedPeriod);
      setNewBlockedPeriod({ from: '', to: '', reason: '' });
      loadBlockedPeriods();
      notify('Période bloquée ajoutée');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible d’ajouter', 'error');
    }
  };

  const removeBlockedPeriod = async (id: string) => {
    if (!token) return;
    await deleteBlockedPeriod(token, id).catch(() => {});
    loadBlockedPeriods();
  };

  useEffect(() => {
    if (!token) return;
    listUsers(token, { role: 'AGENT', status: 'active' })
      .then((usersPage) => {
        const agentItems = usersPage.items ?? (usersPage as any as User[]);
        setAgents(agentItems);
        setManualForm((prev) => ({ ...prev, userId: prev.userId || agentItems[0]?.id || '' }));
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Impossible de charger les agents';
        setError(message);
        notify(message, 'error');
      });
  }, [token, notify]);

  const fetchAbsences = () => {
    if (!token) return;
    setLoading(true);
    const query: AbsenceFilters = {
      startDate: filters.startDate,
      endDate: filters.endDate,
      agentId: filters.agentId,
      type: filters.type,
      status: filters.status,
      page,
      pageSize,
    };
    listAbsences(token, query)
      .then((data) => {
        setPageData(data);
        setError(null);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Impossible de charger les absences';
        setError(message);
        notify(message, 'error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAbsences();
  }, [token, filters.startDate, filters.endDate, filters.agentId, filters.type, filters.status, page, pageSize]);

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const agentOptions = useMemo(
    () => [{ value: 'all', label: 'Tous les agents' }].concat(
      agents.map((agent) => ({ value: agent.id, label: agent.name }))
    ),
    [agents]
  );

  const handleManualChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setManualForm((prev) => ({ ...prev, [name]: value }));
  };

  const submitManual = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    if (!manualForm.userId || !manualForm.reason.trim()) {
      notify('Sélectionnez un agent et renseignez le motif', 'error');
      return;
    }
    const payload: ManualAbsencePayload = {
      userId: manualForm.userId,
      type: manualForm.type,
      from: manualForm.from,
      to: manualForm.to,
      reason: manualForm.reason,
      note: manualForm.note,
    };
    setManualSubmitting(true);
    try {
      await createManualAbsence(token, payload);
      notify('Absence saisie');
      setManualForm((prev) => ({ ...prev, reason: '', note: '' }));
      fetchAbsences();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Échec de la création';
      notify(message, 'error');
    } finally {
      setManualSubmitting(false);
    }
  };

  const handleDecision = (absence: Absence, status: AbsenceStatus) => setDecisionPrompt({ absence, status });

  const confirmDecision = async (comment: string) => {
    if (!token || !decisionPrompt) return;
    const { absence, status } = decisionPrompt;
    setDecisionPrompt(null);
    try {
      await updateAbsenceStatus(token, absence.id, {
        status,
        validatedBy: user?.name ?? 'ADMIN',
        comment: comment || undefined,
      });
      notify(status === 'APPROVED' ? 'Demande approuvée' : 'Demande rejetée');
      fetchAbsences();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action impossible';
      notify(message, 'error');
    }
  };

  const handleApproveLevel1 = async (absence: Absence) => {
    if (!token) return;
    try {
      await approveAbsenceLevel1(token, absence.id);
      notify('Niveau 1 validé');
      fetchAbsences();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action impossible', 'error');
    }
  };

  const statusClass = (status: AbsenceStatus) => {
    switch (status) {
      case 'APPROVED':
        return 'status-chip--success';
      case 'PENDING':
        return 'status-chip--warning';
      default:
        return 'status-chip--info';
    }
  };

  return (
    <div className="absences-page">
      <div className="page-hero">
        <div className="page-hero__content">
          <span className="pill">Absences & congés</span>
          <h2>Gardez la main sur la disponibilité</h2>
          <p>
            Validez les demandes, saisissez les absences terrain et synchronisez la paie avec la réalité
            opérationnelle Madypro Clean.
          </p>
          <Button
            type="button"
            icon={Plus}
            onClick={() => {
              setManualForm(EMPTY_MANUAL_FORM);
              setManualOpen(true);
            }}
          >
            Créer une absence manuelle
          </Button>
        </div>
        <div className="page-hero__accent">
          <h3>Indicateurs</h3>
          <ul className="list-line">
            <li>
              Demandés <span>{pageData.items.filter((item) => item.status === 'PENDING').length}</span>
            </li>
            <li>
              Validés <span>{pageData.items.filter((item) => item.status === 'APPROVED').length}</span>
            </li>
            <li>
              Manuels <span>{pageData.items.filter((item) => item.manual).length}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="filter-grid" role="search">
        <label className="filter-field filter-card">
          Début
          <input type="date" value={filters.startDate} onChange={(event) => handleFilterChange('startDate', event.target.value)} />
        </label>
        <label className="filter-field filter-card">
          Fin
          <input type="date" value={filters.endDate} onChange={(event) => handleFilterChange('endDate', event.target.value)} />
        </label>
        <label className="filter-field filter-card">
          Agent
          <select value={filters.agentId} onChange={(event) => handleFilterChange('agentId', event.target.value)}>
            {agentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field filter-card">
          Type
          <select value={filters.type} onChange={(event) => handleFilterChange('type', event.target.value)}>
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field filter-card">
          Statut
          <select value={filters.status} onChange={(event) => handleFilterChange('status', event.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Modal open={manualOpen} onClose={() => setManualOpen(false)} maxWidth={900} labelledBy="manual-absence-title">
        <ModalHeader
          eyebrow="Absence"
          title="Absence manuelle"
          titleId="manual-absence-title"
          onClose={() => setManualOpen(false)}
          actions={
            <Button type="button" variant="ghost" icon={RotateCcw} onClick={() => setManualForm(EMPTY_MANUAL_FORM)}>
              Réinitialiser
            </Button>
          }
        />
        <ModalBody>
            <form
              className="form-card"
              onSubmit={submitManual}
              style={{ boxShadow: 'none', padding: 0, display: 'grid', gap: '1rem' }}
            >
              <Select
                id="manualAgent"
                name="userId"
                label="Agent"
                options={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
                value={manualForm.userId}
                onChange={handleManualChange}
              />
              <Select
                id="manualType"
                name="type"
                label="Type"
                options={TYPE_OPTIONS.filter((option) => option.value !== 'all').map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                value={manualForm.type}
                onChange={handleManualChange}
              />
              <div className="form-row">
                <Input id="manualFrom" name="from" label="Du" type="date" value={manualForm.from} onChange={handleManualChange} required />
                <Input id="manualTo" name="to" label="Au" type="date" value={manualForm.to} onChange={handleManualChange} required />
              </div>
              <Input
                id="manualReason"
                name="reason"
                label="Motif"
                value={manualForm.reason}
                onChange={handleManualChange}
                placeholder="Motif officiel"
                required
              />
              <Textarea id="manualNote" name="note" label="Note interne" value={manualForm.note} onChange={handleManualChange} placeholder="Commentaire interne" />
              <div className="form-actions">
                <Button type="submit" icon={Check} loading={manualSubmitting}>
                  Enregistrer
                </Button>
                <Button type="button" variant="ghost" icon={X} onClick={() => setManualOpen(false)}>
                  Annuler
                </Button>
              </div>
            </form>
        </ModalBody>
      </Modal>

      <section className="panel">
        <h3>Demandes d'absence</h3>
        {error && <p className="form-error">{error}</p>}
        {loading ? (
          <p>Chargement...</p>
        ) : (
          <div className="table-wrapper">
            <table className="table" aria-label="absences déclarées">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Type</th>
                  <th>Période</th>
                  <th>Motif</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageData.items.map((absence) => (
                  <tr key={absence.id}>
                    <td>
                      <Link to={`/absences/${absence.id}`}>{absence.agent.name}</Link>
                    </td>
                    <td>{TYPE_OPTIONS.find((option) => option.value === absence.type)?.label ?? absence.type}</td>
                    <td>
                      {absence.from} → {absence.to}
                    </td>
                    <td>{absence.reason}</td>
                    <td>
                      <span className={`status-chip ${statusClass(absence.status)}`}>
                        {STATUS_OPTIONS.find((option) => option.value === absence.status)?.label ?? absence.status}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <Link to={`/absences/${absence.id}`} className="btn btn--ghost btn--compact">
                          Détails
                        </Link>
                        {absence.status === 'PENDING' && (
                          <>
                            {absence.requiresSecondApproval && !absence.level1ApprovedBy ? (
                              <Button
                                type="button"
                                variant="ghost"
                                className="btn--compact"
                                icon={Check}
                                onClick={() => handleApproveLevel1(absence)}
                              >
                                Valider (niveau 1)
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                className="btn--compact"
                                icon={Check}
                                onClick={() => handleDecision(absence, 'APPROVED')}
                              >
                                Approuver
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              className="btn--compact"
                              icon={X}
                              onClick={() => handleDecision(absence, 'REJECTED')}
                            >
                              Rejeter
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="pagination" style={{ marginTop: '1rem' }}>
        <Button type="button" variant="ghost" icon={ArrowLeft} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
          Précédent
        </Button>
        <span className="card__meta">Page {page}</span>
        <Button
          type="button"
          variant="ghost"
          icon={ArrowRight}
          iconPosition="right"
          onClick={() => {
            const maxPage = Math.ceil(pageData.total / pageSize) || 1;
            setPage((p) => (p < maxPage ? p + 1 : p));
          }}
          disabled={page * pageSize >= pageData.total}
        >
          Suivant
        </Button>
        <span className="card__meta">{pageData.total} résultats</span>
      </div>

      <section className="panel" style={{ marginTop: '1.5rem' }}>
        <h3>Périodes bloquées</h3>
        <p className="card__meta">
          Aucune nouvelle demande d’absence ne peut être créée sur ces périodes (forte activité).
        </p>
        <div className="table-wrapper">
          <table className="table" aria-label="périodes bloquées">
            <thead>
              <tr>
                <th>Du</th>
                <th>Au</th>
                <th>Raison</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {blockedPeriods.map((period) => (
                <tr key={period.id}>
                  <td>{period.from.slice(0, 10)}</td>
                  <td>{period.to.slice(0, 10)}</td>
                  <td>{period.reason}</td>
                  <td>
                    <Button type="button" variant="ghost" icon={Trash2} onClick={() => removeBlockedPeriod(period.id)}>
                      Retirer
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="form-row" onSubmit={submitBlockedPeriod} style={{ marginTop: '1rem' }}>
          <Input
            type="date"
            label="Du"
            value={newBlockedPeriod.from}
            onChange={(event) => setNewBlockedPeriod((prev) => ({ ...prev, from: event.target.value }))}
          />
          <Input
            type="date"
            label="Au"
            value={newBlockedPeriod.to}
            onChange={(event) => setNewBlockedPeriod((prev) => ({ ...prev, to: event.target.value }))}
          />
          <Input
            label="Raison"
            value={newBlockedPeriod.reason}
            onChange={(event) => setNewBlockedPeriod((prev) => ({ ...prev, reason: event.target.value }))}
            placeholder="Période de forte activité"
          />
          <Button type="submit" icon={Plus}>Ajouter</Button>
        </form>
      </section>
      <PromptModal
        open={decisionPrompt !== null}
        title={decisionPrompt?.status === 'APPROVED' ? "Approuver l'absence" : "Rejeter l'absence"}
        label="Commentaire (facultatif)"
        confirmLabel={decisionPrompt?.status === 'APPROVED' ? 'Approuver' : 'Rejeter'}
        onConfirm={confirmDecision}
        onCancel={() => setDecisionPrompt(null)}
      />
    </div>
  );
};
