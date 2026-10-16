import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { ShiftSwapRequest } from '../../types/team';
import { listShiftSwaps, acceptShiftSwap, rejectShiftSwap } from '../../services/api/team.api';
import { Button } from '../../components/ui/Button';
import { formatDateTime } from '../../utils/datetime';
import { Check, X } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge, BadgeTone } from '../../components/ui/Badge';

const STATUS_TONES: Record<ShiftSwapRequest['status'], BadgeTone> = {
  PENDING: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

const STATUS_LABELS: Record<ShiftSwapRequest['status'], string> = {
  PENDING: 'En attente',
  ACCEPTED: 'Acceptée',
  REJECTED: 'Refusée',
  CANCELLED: 'Annulée',
};

export const ShiftSwapsPage: React.FC = () => {
  const { token, notify } = useAuthContext();
  const [swaps, setSwaps] = useState<ShiftSwapRequest[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    if (!token) return;
    setLoading(true);
    listShiftSwaps(token)
      .then(setSwaps)
      .catch((err) => notify(err instanceof Error ? err.message : 'Impossible de charger', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const handleAccept = async (id: string) => {
    if (!token) return;
    try {
      await acceptShiftSwap(token, id);
      notify('Échange accepté');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action impossible', 'error');
    }
  };

  const handleReject = async (id: string) => {
    if (!token) return;
    try {
      await rejectShiftSwap(token, id);
      notify('Échange refusé');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action impossible', 'error');
    }
  };

  return (
    <div>
      <PageHeader title="Échanges de shift" subtitle="Demandes d’échange de mission entre agents." />

      <section className="panel">
        {loading ? (
          <p>Chargement...</p>
        ) : swaps.length === 0 ? (
          <p className="card__meta">Aucune demande d’échange.</p>
        ) : (
          <div className="table-wrapper">
            <table className="table" aria-label="échanges de shift">
              <thead>
                <tr>
                  <th>Demandeur</th>
                  <th>Cible</th>
                  <th>Intervention</th>
                  <th>Raison</th>
                  <th>Statut</th>
                  <th>Créé le</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {swaps.map((swap) => (
                  <tr key={swap.id}>
                    <td>
                      {swap.requester.firstName} {swap.requester.lastName}
                    </td>
                    <td>{swap.target ? `${swap.target.firstName} ${swap.target.lastName}` : 'Ouvert à tous'}</td>
                    <td>{swap.intervention.date.slice(0, 10)} · {swap.intervention.startTime}-{swap.intervention.endTime}</td>
                    <td>{swap.reason ?? '—'}</td>
                    <td>
                      <Badge tone={STATUS_TONES[swap.status]}>{STATUS_LABELS[swap.status]}</Badge>
                    </td>
                    <td>{formatDateTime(swap.createdAt)}</td>
                    <td style={{ display: 'flex', gap: '0.4rem' }}>
                      {swap.status === 'PENDING' && (
                        <>
                          <Button type="button" variant="ghost" icon={Check} onClick={() => handleAccept(swap.id)}>
                            Accepter
                          </Button>
                          <Button type="button" variant="ghost" icon={X} onClick={() => handleReject(swap.id)}>
                            Refuser
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
