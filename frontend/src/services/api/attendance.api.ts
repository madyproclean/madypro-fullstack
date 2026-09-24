import { Attendance, AttendanceAnomaly, AttendanceStatus, LiveMapEntry } from '../../types/attendance';
import { apiFetch } from './client';

export type AttendanceFilters = {
  startDate?: string;
  endDate?: string;
  agentId?: string;
  siteId?: string;
  interventionId?: string;
  status?: AttendanceStatus | 'all';
  page?: number;
  pageSize?: number;
};
export type AttendancePage = { items: Attendance[]; total: number; page: number; pageSize: number };

export type ManualAttendancePayload = {
  userId: string;
  siteId: string;
  date: string;
  checkInTime: string;
  checkOutTime: string;
  note: string;
};

export type UpdateAttendancePayload = {
  checkInTime?: string;
  checkOutTime?: string;
  note?: string;
  status?: AttendanceStatus;
};

export async function listAttendance(token: string, filters: AttendanceFilters = {}): Promise<AttendancePage> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.agentId && filters.agentId !== 'all') params.set('agentId', filters.agentId);
  if (filters.siteId && filters.siteId !== 'all') params.set('siteId', filters.siteId);
  if (filters.interventionId) params.set('interventionId', filters.interventionId);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  const query = params.toString();
  const path = query ? `attendance?${query}` : 'attendance';
  const res = await apiFetch<any>({ path, token });
  if (Array.isArray(res)) {
    return { items: res, total: res.length, page: 1, pageSize: res.length || 1 };
  }
  if (res && Array.isArray(res.items)) {
    return res as AttendancePage;
  }
  return { items: [], total: 0, page: 1, pageSize: filters.pageSize ?? 20 };
}

export async function getAttendance(token: string, id: string) {
  return apiFetch<Attendance>({ path: `attendance/${id}`, token });
}

export async function createManualAttendance(token: string, payload: ManualAttendancePayload) {
  return apiFetch<Attendance>({
    path: 'attendance/manual',
    token,
    options: {
      method: 'POST',
      body: JSON.stringify({ ...payload, createdBy: 'SUPERVISOR' }),
    },
  });
}

export async function updateAttendance(token: string, id: string, payload: UpdateAttendancePayload) {
  return apiFetch<Attendance>({
    path: `attendance/${id}`,
    token,
    options: {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  });
}

export async function cancelAttendance(token: string, id: string, reason?: string) {
  return apiFetch<Attendance>({
    path: `attendance/${id}/cancel`,
    token,
    options: {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    },
  });
}

export async function getLiveMap(token: string) {
  return apiFetch<LiveMapEntry[]>({ path: 'attendance/live-map', token });
}

export async function getAttendanceAnomalies(token: string) {
  return apiFetch<AttendanceAnomaly[]>({ path: 'attendance/anomalies', token });
}
