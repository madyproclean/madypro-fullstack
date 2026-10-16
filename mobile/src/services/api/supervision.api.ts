import {
  AgentFile,
  AgentOption,
  ApprovalRequest,
  ChatMessage,
  ChatThread,
  LiveAgent,
  MissionAttendance,
  PlanningOccurrence,
  ReplacementSuggestions,
  SiteFile,
  SitePrestation,
  SiteTemplate,
  TemplateStop,
  TemplateImpact,
  DayOccurrence,
  DaySummary,
  SiteHistory,
  QualityOverview,
  QualityItem,
  SiteQrCode,
  SupervisedSite,
  TeamAgent,
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

// ---------------------------------------------------------------- annulation ponctuelle

/**
 * Demande d'annulation d'une mission (validée par l'administrateur). C'est la seule demande possible
 * sur une mission : créer, déplacer ou réaffecter passe par le gabarit du site.
 */
export function requestMissionCancel(token: string, interventionId: string, observation: string) {
  return apiFetch<ApprovalRequest>({
    path: `/interventions/${interventionId}/cancel`,
    token,
    options: { method: 'POST', body: JSON.stringify({ observation }) },
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

// ---------------------------------------------------------------- équipe et sites

/** Agents du superviseur avec leur situation du jour. */
export function getTeam(token: string) {
  return apiFetch<TeamAgent[]>({ path: '/supervision/agents', token });
}

export function getAgentFile(token: string, agentId: string) {
  return apiFetch<AgentFile>({ path: `/supervision/agents/${encodeURIComponent(agentId)}`, token });
}

export function getSiteFile(token: string, siteId: string) {
  return apiFetch<SiteFile>({ path: `/supervision/sites/${encodeURIComponent(siteId)}`, token });
}

/** QR code de pointage du site (à afficher quand un agent ne peut pas scanner l'affiche). */
export function getSiteQrCode(token: string, siteId: string) {
  return apiFetch<SiteQrCode>({ path: `/sites/${encodeURIComponent(siteId)}/qr-code`, token });
}

// ---------------------------------------------------------------- messagerie

/** Discussions ayant au moins un message, plus récentes d'abord (agents du superviseur seulement). */
export async function listChatThreads(token: string) {
  const threads = await apiFetch<ChatThread[] | null>({ path: '/chat/threads', token });
  return Array.isArray(threads) ? threads : [];
}

export async function getChatThread(token: string, agentId: string) {
  const messages = await apiFetch<ChatMessage[] | null>({ path: `/chat/threads/${encodeURIComponent(agentId)}`, token });
  return Array.isArray(messages) ? messages : [];
}

export function sendChatMessage(token: string, agentId: string, body: string) {
  return apiFetch<ChatMessage>({
    path: `/chat/threads/${encodeURIComponent(agentId)}/messages`,
    token,
    options: { method: 'POST', body: JSON.stringify({ body }) },
  });
}

export function markChatRead(token: string, agentId: string) {
  return apiFetch<{ success: boolean }>({
    path: `/chat/threads/${encodeURIComponent(agentId)}/read`,
    token,
    options: { method: 'PATCH' },
  });
}

// ---------------------------------------------------------------- gabarits et planning

/** Planning issu des gabarits validés de ses sites, missions déjà créées comprises. */
export function getPlanning(token: string, startDate: string, endDate: string) {
  return apiFetch<PlanningOccurrence[]>({
    path: `/interventions/planning?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    token,
  });
}

/** Gabarits de ses sites (un par site au plus). */
export function listSiteTemplates(token: string) {
  return apiFetch<SiteTemplate[]>({ path: '/interventions/templates/list', token });
}

/** Prestations prévues sur le site : base des créneaux du gabarit. */
export function listSitePrestations(token: string, siteId: string) {
  return apiFetch<SitePrestation[]>({ path: `/sites/${encodeURIComponent(siteId)}/categories`, token });
}

type TemplateInput = { label: string; siteId: string; stops: TemplateStop[] };

const stopsPayload = (stops: TemplateStop[]) =>
  stops.map(({ id, daysOfWeek, intervalWeeks, specificDate, categoryId, startTime, endTime, agentIds }, order) => ({
    ...(id ? { id } : {}),
    ...(specificDate ? { specificDate: specificDate.slice(0, 10) } : { daysOfWeek }),
    intervalWeeks,
    ...(categoryId ? { categoryId } : {}),
    startTime,
    endTime,
    agentIds,
    order,
  }));

/** Missions ajoutées, retirées ou modifiées sur 2 semaines, avant d'envoyer le gabarit. */
export function previewSiteTemplateImpact(token: string, templateId: string | null, input: TemplateInput) {
  return apiFetch<TemplateImpact>({
    path: templateId ? `/interventions/templates/${templateId}/impact` : '/interventions/templates/impact',
    token,
    options: { method: 'POST', body: JSON.stringify({ ...input, stops: stopsPayload(input.stops) }) },
  });
}

/**
 * Changement d'un seul jour sur un créneau du gabarit : remplacement d'agents (immédiat) ou
 * annulation (demande envoyée à l'administrateur).
 */
export function changeOneDay(
  token: string,
  occurrence: Pick<DayOccurrence, 'templateId' | 'stopId' | 'date'>,
  change: { kind: 'REPLACE_AGENTS'; agentIds: string[]; reason?: string } | { kind: 'CANCEL'; reason: string },
) {
  return apiFetch<{ id: string; actionType?: string }>({
    path: `/interventions/templates/${encodeURIComponent(occurrence.templateId)}/exceptions`,
    token,
    options: { method: 'POST', body: JSON.stringify({ stopId: occurrence.stopId, date: occurrence.date, ...change }) },
  });
}

/**
 * Enregistre le gabarit d'un site (création ou remplacement de ses créneaux). Pour un
 * superviseur, le gabarit repasse « à valider » : l'administrateur doit l'approuver.
 */
export function saveSiteTemplate(token: string, templateId: string | null, input: TemplateInput) {
  // La liste envoyée remplace celle du serveur : un créneau « date précise » (créé sur le web)
  // doit être renvoyé tel quel pour ne pas être supprimé.
  const stops = stopsPayload(input.stops);
  return apiFetch<SiteTemplate>({
    path: templateId ? `/interventions/templates/${templateId}` : '/interventions/templates',
    token,
    options: {
      method: templateId ? 'PATCH' : 'POST',
      body: JSON.stringify(templateId ? { label: input.label, stops } : { ...input, stops }),
    },
  });
}

// ---------------------------------------------------------------- bilan, historique, qualité

/** Validation groupée : chaque mission en ordre passe en « Terminée », les autres reviennent avec la raison. */
export function validateMissions(token: string, ids: string[]) {
  return apiFetch<{ validated: string[]; refused: Array<{ id: string; siteName?: string; reason: string }> }>({
    path: '/interventions/validate-batch',
    token,
    options: { method: 'POST', body: JSON.stringify({ ids }) },
  });
}

export function getDaySummary(token: string, date?: string) {
  return apiFetch<DaySummary>({ path: `/supervision/day-summary${date ? `?date=${date}` : ''}`, token });
}

export function getSiteHistory(token: string, siteId: string) {
  return apiFetch<SiteHistory>({ path: `/supervision/sites/${encodeURIComponent(siteId)}/history`, token });
}

export function getQualityOverview(token: string) {
  return apiFetch<QualityOverview>({ path: '/supervision/quality', token });
}

export function createSiteInspection(
  token: string,
  siteId: string,
  input: { items: QualityItem[]; comment?: string; photos?: string[] },
) {
  return apiFetch<{ id: string; score: number }>({
    path: `/supervision/sites/${encodeURIComponent(siteId)}/inspections`,
    token,
    options: { method: 'POST', body: JSON.stringify(input) },
  });
}

/** Message envoyé à chaque agent rattaché au site (gabarit et missions récentes). */
export function messageSiteTeam(token: string, siteId: string, body: string) {
  return apiFetch<{ siteName: string; recipients: Array<{ id: string; name: string }> }>({
    path: `/chat/sites/${encodeURIComponent(siteId)}/broadcast`,
    token,
    options: { method: 'POST', body: JSON.stringify({ body }) },
  });
}

/** Correction d'un pointage oublié ou erroné, motif obligatoire (heures HH:MM). */
export function regularizeAttendance(
  token: string,
  attendanceId: string,
  input: { checkInTime?: string; checkOutTime?: string; reason: string },
) {
  return apiFetch<MissionAttendance>({
    path: `/attendance/${encodeURIComponent(attendanceId)}/regularize`,
    token,
    options: { method: 'POST', body: JSON.stringify(input) },
  });
}
