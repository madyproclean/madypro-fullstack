import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  getAbsence,
  getReplacementSuggestions,
  ReplacementSuggestion,
  updateAbsenceStatus,
  approveAbsenceLevel1,
  getLeaveBalance,
  LeaveBalance,
} from '../../services/api/absences.api';
import { Absence, AbsenceStatus } from '../../types/absence';
import { useAuthContext } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { PromptModal } from '../../components/ui/PromptModal';
import { Check, X, ArrowLeft } from 'lucide-react';

const TYPE_LABELS: Record<Absence['type'], string> = {
  SICK: 'Arrêt maladie',
  PAID_LEAVE: 'Congés payés',
  UNPAID: 'Sans solde',
  OTHER: 'Autre',
};

const STATUS_LABELS: Record<AbsenceStatus, string> = {
  PENDING: 'En attente',
  APPROVED: 'Approuvé',
  REJECTED: 'Rejeté',
};

export const AbsenceDetailPage: React.FC = () => {
  const { id } = useParams();
  const { token, user, notify } = useAuthContext();
  const [absence, setAbsence] = useState<Absence | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<ReplacementSuggestion | null>(null);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null);
  const [decisionPrompt, setDecisionPrompt] = useState<AbsenceStatus | null>(null);
  const navigate = useNavigate();

  const loadDetail = () => {
    if (!token || !id) return;
    setLoading(true);
    getAbsence(token, id)
      .then((data) => {
        setAbsence(data);
        if (data.status === 'APPROVED') {
          getReplacementSuggestions(token, id)
            .then(setSuggestions)
            .catch(() => setSuggestions(null));
        } else {
          setSuggestions(null);
        }
        if (data.type === 'PAID_LEAVE') {
          getLeaveBalance(token, data.agent.id, new Date(data.from).getFullYear())
            .then(setLeaveBalance)
            .catch(() => setLeaveBalance(null));
        } else {
          setLeaveBalance(null);
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Absence introuvable';
        notify(message, 'error');
        setAbsence(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDetail();
  }, [token, id]);

  const handleDecision = (status: AbsenceStatus) => setDecisionPrompt(status);

  const confirmDecision = async (comment: string) => {
    if (!token || !id || !decisionPrompt) return;
    const status = decisionPrompt;
    setDecisionPrompt(null);
    try {
      await updateAbsenceStatus(token, id, { status, validatedBy: user?.name ?? 'ADMIN', comment: comment || undefined });
      notify(status === 'APPROVED' ? 'Demande approuvée' : 'Demande rejetée');
      loadDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action impossible';
      notify(message, 'error');
    }
  };

  const handleApproveLevel1 = async () => {
    if (!token || !id) return;
    try {
      await approveAbsenceLevel1(token, id);
      notify('Niveau 1 validé');
      loadDetail();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action impossible';
      notify(message, 'error');
    }
  };

  if (loading) {
    return <p>Chargement...</p>;
  }

  if (!absence) {
    return (
      <div>
        <div className="page-header">
          <span className="pill">Absences</span>
          <h2>Absence introuvable</h2>
        </div>
        <Link to="/absences" className="btn btn--ghost">
          Retour à la liste
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <span className="pill">Absences</span>
        <h2>{absence.agent.name}</h2>
        <p>
          {absence.from} → {absence.to}
        </p>
      </div>

      <section className="panel detail-grid">
        <div className="detail-grid__item">
          <span>Type</span>
          <strong>{TYPE_LABELS[absence.type] ?? absence.type}</strong>
        </div>
        <div className="detail-grid__item">
          <span>Statut</span>
          <strong>{STATUS_LABELS[absence.status] ?? absence.status}</strong>
          {absence.validatedBy && <small>Validé par {absence.validatedBy}</small>}
        </div>
        <div className="detail-grid__item">
          <span>Motif</span>
          <strong>{absence.reason}</strong>
        </div>
        {absence.site && (
          <div className="detail-grid__item">
            <span>Site</span>
            <strong>{absence.site.name}</strong>
          </div>
        )}
        <div className="detail-grid__item">
          <span>Note</span>
          <strong>{absence.note ?? '—'}</strong>
          {absence.validationComment && <small>Commentaire: {absence.validationComment}</small>}
        </div>
        <div className="detail-grid__item">
          <span>Origine</span>
          <strong>{absence.manual ? 'Saisie admin' : `Demande ${absence.createdBy}`}</strong>
        </div>
        {leaveBalance && (
          <div className="detail-grid__item">
            <span>Solde de congés {leaveBalance.year}</span>
            <strong>
              {leaveBalance.remaining} / {leaveBalance.allocatedDays} j restants
            </strong>
            <small>{leaveBalance.usedDays} j déjà utilisés</small>
          </div>
        )}
        {absence.requiresSecondApproval && (
          <div className="detail-grid__item">
            <span>Validation à deux niveaux</span>
            <strong>
              {absence.level1ApprovedBy ? 'Niveau 1 validé' : 'Niveau 1 en attente'}
            </strong>
            {absence.level1ApprovedAt && <small>le {absence.level1ApprovedAt.slice(0, 10)}</small>}
          </div>
        )}
        {absence.attachment && (
          <div className="detail-grid__item">
            <span>Pièce justificative</span>
            <a href={absence.attachment} target="_blank" rel="noreferrer">
              <img
                src={absence.attachment}
                alt="Pièce justificative"
                style={{ maxWidth: '160px', borderRadius: '8px', marginTop: '0.5rem' }}
              />
            </a>
          </div>
        )}
      </section>

      {absence.status === 'APPROVED' && suggestions && suggestions.interventions.length > 0 && (
        <section className="panel" style={{ marginTop: '1.5rem' }}>
          <h3 style={{ marginTop: 0 }}>Suggestions de remplacement</h3>
          {suggestions.interventions.map((intervention) => (
            <div key={intervention.interventionId} style={{ marginBottom: '1rem' }}>
              <strong>
                {intervention.siteName} · {intervention.date} {intervention.startTime}–{intervention.endTime}
              </strong>
              {intervention.candidates.length ? (
                <div className="chips" style={{ marginTop: '0.5rem' }}>
                  {intervention.candidates.map((candidate) => (
                    <span key={candidate.id} className="chip">
                      {candidate.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--color-muted)', margin: '0.25rem 0 0' }}>
                  Aucun agent disponible pour ce créneau.
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      {absence.status === 'PENDING' && (
        <div className="form-actions" style={{ marginTop: '1.5rem' }}>
          {absence.requiresSecondApproval && !absence.level1ApprovedBy ? (
            <Button type="button" icon={Check} onClick={handleApproveLevel1}>
              Valider (niveau 1)
            </Button>
          ) : (
            <Button type="button" icon={Check} onClick={() => handleDecision('APPROVED')}>
              Approuver
            </Button>
          )}
          <Button type="button" variant="ghost" icon={X} onClick={() => handleDecision('REJECTED')}>
            Rejeter
          </Button>
        </div>
      )}

      <Button type="button" variant="ghost" icon={ArrowLeft} style={{ marginTop: '1.5rem' }} onClick={() => navigate('/absences')}>
        Retour
      </Button>
      <PromptModal
        open={decisionPrompt !== null}
        title={decisionPrompt === 'APPROVED' ? "Approuver l'absence" : "Rejeter l'absence"}
        label="Commentaire (facultatif)"
        confirmLabel={decisionPrompt === 'APPROVED' ? 'Approuver' : 'Rejeter'}
        onConfirm={confirmDecision}
        onCancel={() => setDecisionPrompt(null)}
      />
    </div>
  );
};
