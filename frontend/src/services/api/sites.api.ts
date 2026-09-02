import { Site } from '../../types/site';
import { SiteContract, SiteZone, SiteIncident, SiteQualityScore, SiteQrCode } from '../../types/siteAdvanced';
import { SiteCategory, SiteCategoryChecklistItem } from '../../types/category';
import { apiFetch } from './client';

export type SitePayload = {
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  timeWindow?: string;
  active?: boolean;
  supervisorIds?: string[];
  accessInstructions?: string;
  accessCode?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  photos?: string[];
  gpsDistanceMeters?: number;
  toleranceMinutes?: number;
  minimumDurationMinutes?: number;
};

export type SitesPage = { items: Site[]; total: number; page: number; pageSize: number };

export async function listSites(
  token: string,
  params?: { page?: number; pageSize?: number },
): Promise<SitesPage> {
  const search = new URLSearchParams();
  if (params?.page) search.set('page', String(params.page));
  if (params?.pageSize) search.set('pageSize', String(params.pageSize));
  const path = search.toString() ? `sites?${search.toString()}` : 'sites';
  const res = await apiFetch<any>({ path, token });
  if (Array.isArray(res)) {
    return { items: res, total: res.length, page: 1, pageSize: res.length || 1 };
  }
  if (res && Array.isArray(res.items)) {
    return res as SitesPage;
  }
  return { items: [], total: 0, page: 1, pageSize: params?.pageSize ?? 20 };
}

export async function getSite(token: string, id: string): Promise<Site> {
  return apiFetch<Site>({ path: `sites/${id}`, token });
}

export async function createSite(token: string, payload: SitePayload): Promise<Site> {
  return apiFetch<Site>({
    path: 'sites',
    token,
    options: {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  });
}

export async function updateSite(token: string, id: string, payload: SitePayload): Promise<Site> {
  return apiFetch<Site>({
    path: `sites/${id}`,
    token,
    options: {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  });
}

export async function sendSitePlanning(
  token: string,
  id: string,
  periodWeeks: number,
): Promise<{ sent: boolean; count: number; to: string }> {
  return apiFetch<{ sent: boolean; count: number; to: string }>({
    path: `sites/${id}/send-planning`,
    token,
    options: {
      method: 'POST',
      body: JSON.stringify({ periodWeeks }),
    },
  });
}

export async function deleteSite(token: string, id: string): Promise<Site> {
  return apiFetch<Site>({
    path: `sites/${id}`,
    token,
    options: {
      method: 'DELETE',
    },
  });
}

export async function listSiteCategories(token: string, siteId: string): Promise<SiteCategory[]> {
  return apiFetch<SiteCategory[]>({ path: `sites/${siteId}/categories`, token });
}

export async function addSiteCategory(
  token: string,
  siteId: string,
  payload: { categoryId: string; startTime: string; endTime: string },
): Promise<SiteCategory> {
  return apiFetch<SiteCategory>({
    path: `sites/${siteId}/categories`,
    token,
    options: { method: 'POST', body: JSON.stringify(payload) },
  });
}

export async function updateSiteCategory(
  token: string,
  siteId: string,
  siteCategoryId: string,
  payload: { startTime?: string; endTime?: string; active?: boolean },
): Promise<SiteCategory> {
  return apiFetch<SiteCategory>({
    path: `sites/${siteId}/categories/${siteCategoryId}`,
    token,
    options: { method: 'PATCH', body: JSON.stringify(payload) },
  });
}

export async function removeSiteCategory(token: string, siteId: string, siteCategoryId: string): Promise<void> {
  await apiFetch({
    path: `sites/${siteId}/categories/${siteCategoryId}`,
    token,
    options: { method: 'DELETE' },
  });
}

export async function createSiteCategoryChecklistItem(
  token: string,
  siteId: string,
  siteCategoryId: string,
  payload: { label: string; order?: number },
): Promise<SiteCategoryChecklistItem> {
  return apiFetch<SiteCategoryChecklistItem>({
    path: `sites/${siteId}/categories/${siteCategoryId}/checklist`,
    token,
    options: { method: 'POST', body: JSON.stringify(payload) },
  });
}

export async function removeSiteCategoryChecklistItem(
  token: string,
  siteId: string,
  siteCategoryId: string,
  itemId: string,
): Promise<void> {
  await apiFetch({
    path: `sites/${siteId}/categories/${siteCategoryId}/checklist/${itemId}`,
    token,
    options: { method: 'DELETE' },
  });
}

// Contrats/SLA
export async function listSiteContracts(token: string, siteId: string) {
  return apiFetch<SiteContract[]>({ path: `sites/${siteId}/contracts`, token });
}
export async function createSiteContract(
  token: string,
  siteId: string,
  payload: { label: string; startDate: string; endDate: string; slaDetails?: string },
) {
  return apiFetch<SiteContract>({
    path: `sites/${siteId}/contracts`,
    token,
    options: { method: 'POST', body: JSON.stringify(payload) },
  });
}
export async function deleteSiteContract(token: string, siteId: string, contractId: string) {
  return apiFetch<{ deleted: boolean }>({
    path: `sites/${siteId}/contracts/${contractId}`,
    token,
    options: { method: 'DELETE' },
  });
}
export async function listExpiringContracts(token: string, days = 30) {
  return apiFetch<SiteContract[]>({ path: `sites/contracts/expiring?days=${days}`, token });
}

// Zones
export async function listSiteZones(token: string, siteId: string) {
  return apiFetch<SiteZone[]>({ path: `sites/${siteId}/zones`, token });
}
export async function createSiteZone(token: string, siteId: string, payload: { label: string; floor?: string }) {
  return apiFetch<SiteZone>({
    path: `sites/${siteId}/zones`,
    token,
    options: { method: 'POST', body: JSON.stringify(payload) },
  });
}
export async function updateSiteZone(token: string, siteId: string, zoneId: string, payload: { completed?: boolean }) {
  return apiFetch<SiteZone>({
    path: `sites/${siteId}/zones/${zoneId}`,
    token,
    options: { method: 'PATCH', body: JSON.stringify(payload) },
  });
}
export async function deleteSiteZone(token: string, siteId: string, zoneId: string) {
  return apiFetch<{ deleted: boolean }>({
    path: `sites/${siteId}/zones/${zoneId}`,
    token,
    options: { method: 'DELETE' },
  });
}

// Plan des locaux
export async function setSitePlanImage(token: string, siteId: string, planImageUrl: string | null) {
  return apiFetch<Site>({
    path: `sites/${siteId}/plan`,
    token,
    options: { method: 'PATCH', body: JSON.stringify({ planImageUrl }) },
  });
}

// Qualité
export async function getSiteIncidents(token: string, siteId: string) {
  return apiFetch<SiteIncident[]>({ path: `sites/${siteId}/incidents`, token });
}
export async function getSiteQualityScore(token: string, siteId: string) {
  return apiFetch<SiteQualityScore>({ path: `sites/${siteId}/quality-score`, token });
}

export async function getSiteQrCode(token: string, siteId: string) {
  return apiFetch<SiteQrCode>({ path: `sites/${siteId}/qr-code`, token });
}
