import {
  AgentOption,
  ApprovalRequest,
  LiveAgent,
  MissionAttendance,
  ReplacementSuggestions,
  SupervisedSite,
  SupervisorToday,
  TeamAbsence,
} from '../../types/supervision';
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

// ---------------------------------------------------------------- absences de l'équipe

/** Absences des agents du superviseur (le serveur filtre sur son équipe). */
export async function listTeamAbsences(token: string, status: 'PENDING' | 'all' = 'PENDING') {
  const page = await apiFetch<Page<TeamAbsence>>({ path: `/absences?status=${status}&pageSize=200`, token });
  return page.items;
}

export function decideAbsence(token: string, id: string, status: 'APPROVED' | 'REJECTED', comment?: string) {
  return apiFetch<TeamAbsence>({
    path: `/absences/${id}/status`,
    token,
    options: { method: 'PATCH', body: JSON.stringify({ status, comment }) },
  });
}

/** Première validation d'une absence longue (plus de 5 jours) ; l'administrateur donne l'accord final. */
export function approveAbsenceLevel1(token: string, id: string) {
  return apiFetch<TeamAbsence>({ path: `/absences/${id}/approve-level1`, token, options: { method: 'POST' } });
}

/** Remplaçants disponibles pour chaque mission touchée (seulement une fois l'absence approuvée). */
export function getReplacementSuggestions(token: string, absenceId: string) {
  return apiFetch<ReplacementSuggestions>({ path: `/absences/${absenceId}/replacement-suggestions`, token });
}

// ---------------------------------------------------------------- demandes de planification

/**
 * Pour un superviseur, ces appels ne modifient pas le planning : ils créent une demande de
 * validation que l'administrateur approuve ou refuse (réponse = la demande créée).
 */
export function requestMissionChange(
  token: string,
  interventionId: string,
  change: { date?: string; startTime?: string; endTime?: string; agentIds?: string[] },
) {
  return apiFetch<ApprovalRequest>({
    path: `/interventions/${interventionId}`,
    token,
    options: { method: 'PATCH', body: JSON.stringify(change) },
  });
}

export function requestMissionCancel(token: string, interventionId: string, observation: string) {
  return apiFetch<ApprovalRequest>({
    path: `/interventions/${interventionId}/cancel`,
    token,
    options: { method: 'POST', body: JSON.stringify({ observation }) },
  });
}

export function requestMissionCreate(
  token: string,
  mission: { siteId: string; date: string; startTime: string; endTime: string; agentIds: string[]; type: 'REGULAR' | 'PUNCTUAL'; subType?: string },
) {
  return apiFetch<ApprovalRequest>({
    path: '/interventions',
    token,
    options: { method: 'POST', body: JSON.stringify(mission) },
  });
}

/** Demandes déposées par le superviseur connecté, plus récentes d'abord. */
export async function listMyRequests(token: string) {
  const page = await apiFetch<Page<ApprovalRequest>>({ path: '/approval-requests/mine?pageSize=100', token });
  return page.items;
}

/** Agents actifs (annuaire), pour choisir qui affecter à une mission. */
export async function listActiveAgents(token: string) {
  const page = await apiFetch<Page<AgentOption>>({ path: '/users?role=AGENT&status=active&pageSize=500', token });
  return page.items;
}

export function getTeamAbsence(token: string, id: string) {
  return apiFetch<TeamAbsence>({ path: `/absences/${id}`, token });
}
