import { apiFetch } from './client';

export type DaySummary = {
  date: string;
  generatedAt: string;
  missions: { total: number; completed: number; toValidate: number; inProgress: number; notDone: number; upcoming: number; cancelled: number };
  punctuality: { arrivals: number; late: number; onTimeRate: number | null };
  hours: { planned: number; worked: number };
  late: { agentName: string; siteName: string; startTime: string; minutesLate: number }[];
  toValidate: { interventionId: string; siteName: string; startTime: string; endTime: string }[];
  notDone: { interventionId: string; siteName: string; startTime: string; agents: string[] }[];
  anomalies: { id: string; siteName: string; title: string; description: string; status: 'NEW' | 'RESOLVED'; agentName: string }[];
  anomalyCount: { total: number; open: number };
  absences: { agentName: string; type: string }[];
};

export type QualityItem = { label: string; rating: 'GOOD' | 'AVERAGE' | 'POOR'; comment?: string };
export type QualityInspection = {
  id: string;
  createdAt: string;
  score: number;
  items: QualityItem[];
  comment: string | null;
  photos: string[];
  inspectorName: string;
};
export type QualityOverview = {
  criteria: string[];
  sites: { siteId: string; siteName: string; inspections: number; average: number; lastScore: number; lastAt: string }[];
};
export type SiteHistory = {
  site: { id: string; name: string };
  missions: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    prestation: string | null;
    agents: string[];
    observation: string | null;
    photoCount: number;
    anomalies: { id: string; title: string; status: string }[];
  }[];
  inspections: QualityInspection[];
};

export const getDaySummary = (token: string, date?: string) =>
  apiFetch<DaySummary>({ path: `supervision/day-summary${date ? `?date=${date}` : ''}`, token });

export const getQualityOverview = (token: string) => apiFetch<QualityOverview>({ path: 'supervision/quality', token });

export const getSiteHistory = (token: string, siteId: string) =>
  apiFetch<SiteHistory>({ path: `supervision/sites/${siteId}/history`, token });

export const createSiteInspection = (token: string, siteId: string, input: { items: QualityItem[]; comment?: string }) =>
  apiFetch<{ id: string; score: number }>({
    path: `supervision/sites/${siteId}/inspections`,
    token,
    options: { method: 'POST', body: JSON.stringify(input) },
  });

export const messageSiteTeam = (token: string, siteId: string, body: string) =>
  apiFetch<{ siteName: string; recipients: { id: string; name: string }[] }>({
    path: `chat/sites/${siteId}/broadcast`,
    token,
    options: { method: 'POST', body: JSON.stringify({ body }) },
  });

export const validateMissions = (token: string, ids: string[]) =>
  apiFetch<{ validated: string[]; refused: { id: string; siteName?: string; reason: string }[] }>({
    path: 'interventions/validate-batch',
    token,
    options: { method: 'POST', body: JSON.stringify({ ids }) },
  });

export const regularizeAttendance = (token: string, id: string, input: { checkInTime?: string; checkOutTime?: string; reason: string }) =>
  apiFetch<unknown>({ path: `attendance/${id}/regularize`, token, options: { method: 'POST', body: JSON.stringify(input) } });

export type InboxItem = {
  id: string;
  kind: 'APPROVAL' | 'ABSENCE' | 'ANOMALY' | 'MISSION_TO_VALIDATE' | 'LOW_STOCK' | 'INVOICE_OVERDUE' | 'CERTIFICATION';
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  detail: string;
  date: string;
  link: string;
};
export type Inbox = { total: number; high: number; counts: Record<string, number>; items: InboxItem[] };

export const getAdminInbox = (token: string) => apiFetch<Inbox>({ path: 'admin/inbox', token });

type Totals = { missions: number; done: number; missed: number; completionRate: number | null; onTimeRate: number | null };
export type Steering = {
  period: { startDate: string; endDate: string; days: number };
  current: Totals;
  previous: Totals;
  agents: {
    agentId: string;
    agentName: string;
    missions: number;
    done: number;
    missed: number;
    late: number;
    onTimeRate: number | null;
    plannedHours: number;
    workedHours: number;
    corrections: number;
  }[];
  sites: {
    siteId: string;
    siteName: string;
    missions: number;
    done: number;
    missed: number;
    completionRate: number | null;
    anomalies: number;
    plannedHours: number;
    workedHours: number;
    quality: number | null;
  }[];
};

export const getSteering = (token: string, days: number) => apiFetch<Steering>({ path: `supervision/steering?days=${days}`, token });
