import React from 'react';
import { Clock, Loader2, CheckCircle2, AlertTriangle, XCircle, Ban } from 'lucide-react';
import { InterventionStatus } from '../../types/intervention';
import { Badge, BadgeTone } from './Badge';

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

const TONES: Record<InterventionStatus, BadgeTone> = {
  PLANNED: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  NEEDS_REVIEW: 'warning',
  CANCELLED: 'danger',
  NO_SHOW: 'danger',
};

export const interventionStatusLabel = (status: InterventionStatus) => LABELS[status] ?? status;

type StatusChipProps = {
  status: InterventionStatus;
  /** Ajoute l'animation de pulsation (utilisée pour signaler une intervention en cours dans une liste). */
  pulse?: boolean;
};

/** Thin wrapper around Badge — mappe le statut d'intervention à un ton + icône. */
export const StatusChip: React.FC<StatusChipProps> = ({ status, pulse }) => {
  const Icon = ICONS[status];
  const spinning = status === 'IN_PROGRESS';
  return (
    <Badge
      tone={TONES[status]}
      icon={spinning ? undefined : Icon}
      pulse={pulse && status === 'IN_PROGRESS'}
    >
      {spinning && <Icon size={13} className="badge__icon badge__icon--spin" aria-hidden="true" />}
      {LABELS[status] ?? status}
    </Badge>
  );
};
