import { SupervisorToday } from '../../types/supervision';
import { apiFetch } from './client';

/** Situation du jour sur les sites du superviseur connecté (filtrée côté serveur). */
export function getSupervisorToday(token: string, date?: string) {
  const path = date ? `/supervision/today?date=${encodeURIComponent(date)}` : '/supervision/today';
  return apiFetch<SupervisorToday>({ path, token });
}
