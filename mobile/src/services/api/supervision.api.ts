import { LiveAgent, MissionAttendance, SupervisedSite, SupervisorToday } from '../../types/supervision';
import { apiFetch } from './client';

type Page<T> = { items: T[]; total: number };

/** Situation du jour sur les sites du superviseur connecté (filtrée côté serveur). */
export function getSupervisorToday(token: string, date?: string) {
  const path = date ? `/supervision/today?date=${encodeURIComponent(date)}` : '/supervision/today';
  return apiFetch<SupervisorToday>({ path, token });
}

/** Sites du superviseur (le serveur ne renvoie que les siens). */
export async function listSupervisedSites(token: string) {
  const page = await apiFetch<Page<SupervisedSite>>({ path: '/sites?pageSize=200&active=true', token });
  return page.items;
}

/** Agents en mission ayant émis une position dans les 30 dernières minutes, sur ses sites. */
export function getLiveAgents(token: string) {
  return apiFetch<LiveAgent[]>({ path: '/attendance/live-map', token });
}

/** Pointages d'une mission, photos comprises (à ne charger que pour le détail). */
export async function listMissionAttendance(token: string, interventionId: string) {
  const page = await apiFetch<Page<MissionAttendance>>({
    path: `/attendance?interventionId=${encodeURIComponent(interventionId)}&pageSize=50`,
    token,
  });
  return page.items;
}
