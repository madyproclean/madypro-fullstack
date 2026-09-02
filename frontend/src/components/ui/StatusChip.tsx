import React from 'react';
import { Clock, Loader2, CheckCircle2, AlertTriangle, XCircle, Ban } from 'lucide-react';
import { InterventionStatus } from '../../types/intervention';

const LABELS: Record<InterventionStatus, string> = {
  PLANNED: 'Planifiée',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminée',
  NEEDS_REVIEW: 'À valider',
  CANCELLED: 'Annulée',
  NO_SHOW: 'Non effectuée',
};

const ICONS = {
  PLANNED: Clock,
  IN_PROGRESS: Loader2,
  COMPLETED: CheckCircle2,
  NEEDS_REVIEW: AlertTriangle,
  CANCELLED: XCircle,
  NO_SHOW: Ban,
} as const;

export const interventionStatusLabel = (status: InterventionStatus) => LABELS[status] ?? status;

const toneClass = (status: InterventionStatus) =>
  status === 'PLANNED'
    ? 'status-chip--info'
    : status === 'COMPLETED'
    ? 'status-chip--success'
    : 'status-chip--warning';

type StatusChipProps = {
  status: InterventionStatus;
  /** Ajoute l'animation de pulsation (utilisée pour signaler une intervention en cours dans une liste). */
  pulse?: boolean;
};

export const StatusChip: React.FC<StatusChipProps> = ({ status, pulse }) => {
  const Icon = ICONS[status];
  const spinning = status === 'IN_PROGRESS';
  return (
    <span className={`status-chip ${toneClass(status)}${pulse && status === 'IN_PROGRESS' ? ' status-pulse' : ''}`}>
      <Icon size={13} className={spinning ? 'status-chip__icon status-chip__icon--spin' : 'status-chip__icon'} aria-hidden="true" />
      {LABELS[status] ?? status}
    </span>
  );
};
