import { Absence, AbsenceStatus, AbsenceType } from '../../types/absence';
import { apiFetch } from './client';

export type AbsenceFilters = {
  status?: AbsenceStatus | 'all';
  type?: AbsenceType | 'all';
  agentId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
};

export type ManualAbsencePayload = {
  userId: string;
  type: AbsenceType;
  from: string;
  to: string;
  reason: string;
  note: string;
  siteId?: string;
  attachment?: string;
};

export type UpdateAbsenceStatusPayload = {
  status: AbsenceStatus;
  validatedBy: string;
  comment?: string;
};

export type AbsencePage = {
  items: Absence[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listAbsences(token: string, filters: AbsenceFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.type && filters.type !== 'all') params.set('type', filters.type);
  if (filters.agentId && filters.agentId !== 'all') params.set('agentId', filters.agentId);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  const query = params.toString();
  const path = query ? `absences?${query}` : 'absences';
  const data = await apiFetch<Absence[] | AbsencePage>({ path, token });
  if (Array.isArray(data)) {
    return {
      items: data,
      total: data.length,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? (data.length || 20),
    };
  }
  return data;
}

export async function getAbsence(token: string, id: string) {
  return apiFetch<Absence>({ path: `absences/${id}`, token });
}

export async function createManualAbsence(token: string, payload: ManualAbsencePayload) {
  return apiFetch<Absence>({
    path: 'absences/manual',
    token,
    options: {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  });
}

export async function updateAbsenceStatus(token: string, id: string, payload: UpdateAbsenceStatusPayload) {
  return apiFetch<Absence>({
    path: `absences/${id}/status`,
    token,
    options: {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  });
}

export type ReplacementSuggestion = {
  absenceId: string;
  interventions: {
    interventionId: string;
    siteId: string;
    siteName: string;
    date: string;
    startTime: string;
    endTime: string;
    candidates: { id: string; name: string }[];
  }[];
};

export async function getReplacementSuggestions(token: string, id: string) {
  return apiFetch<ReplacementSuggestion>({ path: `absences/${id}/replacement-suggestions`, token });
}

export async function approveAbsenceLevel1(token: string, id: string) {
  return apiFetch<Absence>({ path: `absences/${id}/approve-level1`, token, options: { method: 'POST' } });
}

export type LeaveBalance = { userId: string; year: number; allocatedDays: number; usedDays: number; remaining: number };

export async function getLeaveBalance(token: string, userId: string, year?: number) {
  const query = year ? `?year=${year}` : '';
  return apiFetch<LeaveBalance>({ path: `absences/leave-balance/${userId}${query}`, token });
}

export async function setLeaveAllocation(token: string, userId: string, year: number, allocatedDays: number) {
  return apiFetch<{ allocatedDays: number }>({
    path: `absences/leave-balance/${userId}`,
    token,
    options: { method: 'PATCH', body: JSON.stringify({ year, allocatedDays }) },
  });
}

export type BlockedPeriod = { id: string; from: string; to: string; reason: string };

export async function listBlockedPeriods(token: string) {
  return apiFetch<BlockedPeriod[]>({ path: 'absences/blocked-periods/list', token });
}

export async function createBlockedPeriod(token: string, payload: { from: string; to: string; reason: string }) {
  return apiFetch<BlockedPeriod>({
    path: 'absences/blocked-periods',
    token,
    options: { method: 'POST', body: JSON.stringify(payload) },
  });
}

export async function deleteBlockedPeriod(token: string, id: string) {
  return apiFetch<{ deleted: boolean }>({ path: `absences/blocked-periods/${id}`, token, options: { method: 'DELETE' } });
}
