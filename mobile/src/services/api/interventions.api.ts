import { Intervention, InterventionStatus, InterventionType } from '../../types/intervention';
import { apiFetch } from './client';
import { getSite } from './sites.api';

export type InterventionFilters = {
  startDate?: string;
  endDate?: string;
  siteId?: string;
  type?: InterventionType | 'all';
  subType?: string;
  agentId?: string;
  status?: InterventionStatus | 'all';
  pageSize?: number;
};

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const rangeToFilters = (range: 'today' | 'week' | 'past'): Pick<InterventionFilters, 'startDate' | 'endDate'> => {
  const today = new Date();
  if (range === 'today') {
    const iso = formatLocalDate(today);
    return { startDate: iso, endDate: iso };
  }
  if (range === 'week') {
    const end = new Date(today);
    end.setDate(end.getDate() + 6);
    return { startDate: formatLocalDate(today), endDate: formatLocalDate(end) };
  }
  const start = new Date(today);
  start.setDate(start.getDate() - 28);
  return { startDate: formatLocalDate(start), endDate: formatLocalDate(today) };
};

export async function fetchInterventions(token: string, filters: InterventionFilters = {}) {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.siteId) params.set('siteId', filters.siteId);
  if (filters.type && filters.type !== 'all') params.set('type', filters.type);
  if (filters.subType) params.set('subType', filters.subType);
  if (filters.agentId) {
    params.set('agentId', String(filters.agentId));
    // certains backends attendent userId pour filtrer les interventions agent
    params.set('userId', String(filters.agentId));
  }
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  // Le backend trie par date décroissante avec pageSize=20 par défaut : sur une fenêtre large
  // (planning agent), ça coupe silencieusement les missions les plus proches (dont celles du
  // jour) au profit des plus lointaines. Ces écrans affichent tout côté client, pas de
  // pagination UI : on demande explicitement assez de résultats pour couvrir la fenêtre.
  params.set('pageSize', String(filters.pageSize ?? 200));
  const query = params.toString();
  const path = query ? `/interventions?${query}` : '/interventions';
  const response = await apiFetch<Array<ApiIntervention> | { data?: ApiIntervention[] } | null>({
    path,
    token,
  });

  const list: ApiIntervention[] = (() => {
    if (Array.isArray(response)) return response;
    if (response && Array.isArray((response as any).data)) return (response as any).data as ApiIntervention[];
    if (response && Array.isArray((response as any).items)) return (response as any).items as ApiIntervention[];
    if (response && Array.isArray((response as any).results)) return (response as any).results as ApiIntervention[];
    return [];
  })();

  return list.map((intervention) => mapIntervention(intervention));
}

export async function listInterventionsByRange(
  token: string,
  range: 'today' | 'week' | 'past',
  agentId?: string,
) {
  const filters = rangeToFilters(range);
  const primary = await fetchInterventions(token, { ...filters, agentId });
  if (agentId && primary.length === 0) {
    // fallback limité : on refiltre côté client pour ne pas exposer d'autres agents
    const fallback = await fetchInterventions(token, filters);
    return fallback.filter((i) => i.agentIds?.includes(agentId));
  }
  return primary;
}

/** Mission avec son site (adresse, coordonnées) ; propage les erreurs (réseau, droits). */
export async function fetchInterventionById(token: string, id: string): Promise<Intervention> {
  const intervention = await apiFetch<ApiIntervention>({ path: `/interventions/${id}`, token });
  const mapped = mapIntervention(intervention);
  // Always hydrate with site to ensure coords/address are present & numeric
  try {
    const site = await getSite(token, mapped.siteId);
    return {
      ...mapped,
      siteAddress: site.address ?? mapped.siteAddress,
      siteLatitude: typeof site.latitude === 'number' ? site.latitude : mapped.siteLatitude,
      siteLongitude: typeof site.longitude === 'number' ? site.longitude : mapped.siteLongitude,
    };
  } catch {
    return mapped;
  }
}

export async function getInterventionById(token: string, id: string): Promise<Intervention | null> {
  try {
    return await fetchInterventionById(token, id);
  } catch (error) {
    console.error('Failed to load intervention', error);
    return null;
  }
}

export async function updateInterventionStatus(token: string, id: string, status: InterventionStatus) {
  return apiFetch<Intervention>({
    path: `/interventions/${id}/status`,
    token,
    options: {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  });
}

export async function patchIntervention(token: string, id: string, payload: Partial<Pick<Intervention, 'status'>>) {
  return apiFetch<Intervention>({
    path: `/interventions/${id}`,
    token,
    options: {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  });
}

export type InterventionChecklistItem = {
  id: string;
  interventionId: string;
  label: string;
  order: number;
  done: boolean;
  completedAt?: string | null;
  completedBy?: string | null;
};

export async function listInterventionChecklist(token: string, interventionId: string) {
  return apiFetch<InterventionChecklistItem[]>({ path: `/interventions/${interventionId}/checklist`, token });
}

export async function toggleInterventionChecklistItem(
  token: string,
  interventionId: string,
  itemId: string,
  done: boolean,
) {
  return apiFetch<InterventionChecklistItem>({
    path: `/interventions/${interventionId}/checklist/${itemId}`,
    token,
    options: {
      method: 'PATCH',
      body: JSON.stringify({ done }),
    },
  });
}

function mapIntervention(intervention: ApiIntervention): Intervention {
  const toNumber = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    id: intervention.id,
    siteId: intervention.siteId,
    siteName: intervention.siteName,
    date: intervention.date,
    startTime: intervention.startTime,
    endTime: intervention.endTime,
    type: intervention.type,
    subType: intervention.subType,
    label: intervention.label,
    status: intervention.status,
    agentIds: intervention.agentIds,
    agents: intervention.agents ?? [],
    truckLabels: intervention.truckLabels ?? [],
    observation: intervention.observation,
    generatedFromStopId: (intervention as { generatedFromStopId?: string }).generatedFromStopId,
    generatedFromTemplateId: (intervention as { generatedFromTemplateId?: string }).generatedFromTemplateId,
    hasAnomaly: false,
    siteAddress: intervention.siteAddress,
    siteLatitude: toNumber(intervention.siteLatitude),
    siteLongitude: toNumber(intervention.siteLongitude),
  };
}

type ApiIntervention = {
  id: string;
  siteId: string;
  siteName: string;
  siteAddress?: string;
  siteLatitude?: number;
  siteLongitude?: number;
  date: string;
  startTime: string;
  endTime: string;
  type: InterventionType;
  subType?: string;
  label?: string;
  status: InterventionStatus;
  agentIds: string[];
  truckLabels?: string[];
  observation?: string;
  agents?: { id: string; name: string }[];
};
