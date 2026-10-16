import { StatusTone } from '@/components/ui/StatusPill';
import { Intervention } from '@/types/intervention';
import { ApprovalActionType } from '@/types/supervision';

/** Date locale de l'appareil au format YYYY-MM-DD (les tablettes sont à l'heure de Paris). */
export const toISODate = (date: Date) => {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

export const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const formatDayLong = (isoDate: string) => {
  const label = new Date(`${isoDate}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export const formatDayShort = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * Heure "HH:mm" : accepte un instant ISO (vue intervention) ou une heure déjà formatée
 * "HH:mm" (liste des pointages) ; "—" si absente.
 */
export const formatClock = (value?: string | null) => {
  if (!value) return '—';
  if (/^\d{1,2}:\d{2}$/.test(value)) return value.padStart(5, '0');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

/** Délai lisible depuis un instant passé : « à l'instant », « il y a 4 min », « il y a 2 h ». */
export const formatAgo = (iso: string, now: Date = new Date()) => {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  return `il y a ${Math.round(minutes / 60)} h`;
};

/**
 * Statut affiché d'une mission. Une mission encore « planifiée » dont l'heure de début est
 * passée sans aucun pointage est signalée « Non démarrée ».
 */
export const missionStatus = (mission: Intervention, now: Date = new Date()): { label: string; tone: StatusTone } => {
  switch (mission.status) {
    case 'IN_PROGRESS':
      return { label: 'En cours', tone: 'info' };
    case 'COMPLETED':
      return { label: 'Terminée', tone: 'success' };
    case 'NEEDS_REVIEW':
      return { label: 'À valider', tone: 'warning' };
    case 'CANCELLED':
      return { label: 'Annulée', tone: 'neutral' };
    case 'NO_SHOW':
      return { label: 'Non réalisée', tone: 'danger' };
    default: {
      const start = new Date(`${mission.date}T${mission.startTime || '00:00'}:00`);
      const started = mission.agents.some((a) => a.checkInTime || a.arrivalTime);
      return now > start && !started ? { label: 'Non démarrée', tone: 'danger' } : { label: 'À venir', tone: 'neutral' };
    }
  }
};

export const ANOMALY_LABELS: Record<string, string> = {
  CLEANLINESS: 'Propreté',
  MISSING_SUPPLIES: 'Fournitures manquantes',
  ACCESS: 'Accès au site',
  DAMAGE: 'Dégât',
  OTHER: 'Autre',
};

/** Signal GPS considéré comme ancien au-delà de ce délai. */
export const STALE_SIGNAL_MINUTES = 15;

/** Nature d'une demande envoyée à l'administrateur, en langage courant. */
export const APPROVAL_ACTION_LABELS: Record<ApprovalActionType, string> = {
  CREATE_INTERVENTION: 'Nouvelle mission',
  UPDATE_INTERVENTION_SCHEDULE: 'Déplacement de mission',
  ASSIGN_AGENT: "Ajout ou remplacement d'agent",
  UNASSIGN_AGENT: "Retrait d'agent",
  CANCEL_INTERVENTION: 'Annulation de mission',
  CREATE_TEMPLATE_BATCH: 'Génération de missions',
  VALIDATE_TEMPLATE: 'Validation de gabarit',
  CANCEL_OCCURRENCE: "Annulation d'un passage (un jour)",
};
