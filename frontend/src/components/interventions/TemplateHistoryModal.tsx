import React, { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { listTemplateRevisions, restoreTemplateRevision } from '../../services/api/interventions.api';
import { InterventionTemplate, TemplateRevision } from '../../types/intervention';
import { Modal, ModalBody, ModalHeader } from '../ui/Modal';
import { Button } from '../ui/Button';

const DAY_SHORT = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

type Props = {
  template: InterventionTemplate | null;
  agentName: (id: string) => string;
  onClose: () => void;
  onRestored: () => void;
};

/** Versions successives d'un gabarit ; l'administrateur peut revenir à l'une d'elles. */
export const TemplateHistoryModal: React.FC<Props> = ({ template, agentName, onClose, onRestored }) => {
  const { token, user, notify } = useAuthContext();
  const [revisions, setRevisions] = useState<TemplateRevision[] | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !template) return;
    setRevisions(null);
    listTemplateRevisions(token, template.id)
      .then(setRevisions)
      .catch((err) => {
        notify(err instanceof Error ? err.message : "Impossible de charger l'historique", 'error');
        setRevisions([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, template]);

  const restore = async (revision: TemplateRevision) => {
    if (!token || !template) return;
    setRestoring(revision.id);
    try {
      await restoreTemplateRevision(token, template.id, revision.id);
      notify('Version remise en place');
      onRestored();
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Retour impossible', 'error');
    } finally {
      setRestoring(null);
    }
  };

  return (
    <Modal open={Boolean(template)} onClose={onClose} maxWidth={760} labelledBy="gabarit-history-title">
      <ModalHeader eyebrow="Historique" title={template?.label ?? ''} titleId="gabarit-history-title" onClose={onClose} />
      <ModalBody>
        {revisions === null && <p>Chargement...</p>}
        {revisions?.length === 0 && (
          <p style={{ color: 'var(--color-muted)' }}>Aucune version enregistrée pour l’instant (l’historique démarre avec cette mise à jour).</p>
        )}
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {revisions?.map((revision, index) => (
            <div key={revision.id} className="panel" style={{ padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div>
                  <strong>{new Date(revision.createdAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</strong>
                  {index === 0 && <span style={{ marginLeft: 8, color: 'var(--color-muted)' }}>(version en place)</span>}
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                    {revision.note ? `${revision.note} · ` : ''}
                    {revision.authorName ? `Modifié par ${revision.authorName}` : 'Auteur inconnu'}
                    {revision.approvedByName && revision.approvedByName !== revision.authorName ? ` · validé par ${revision.approvedByName}` : ''}
                  </div>
                </div>
                {user?.role === 'ADMIN' && index > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="btn--compact"
                    icon={RotateCcw}
                    loading={restoring === revision.id}
                    onClick={() => restore(revision)}
                  >
                    Revenir à cette version
                  </Button>
                )}
              </div>
              <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem' }}>
                {revision.snapshot.stops.map((stop) => (
                  <li key={stop.id} style={{ fontSize: '0.85rem' }}>
                    {stop.specificDate
                      ? `le ${stop.specificDate.slice(0, 10)}`
                      : `${stop.daysOfWeek.map((d) => DAY_SHORT[d]).join(', ')}${stop.intervalWeeks > 1 ? ` (toutes les ${stop.intervalWeeks} semaines)` : ''}`}{' '}
                    · {stop.startTime}–{stop.endTime} · {stop.agentIds.map(agentName).join(', ') || 'aucun agent'}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </ModalBody>
    </Modal>
  );
};
