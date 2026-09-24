import { AuditAction, AuditLog } from '../../types/audit';
import { apiFetch, API_BASE_URL } from './client';

export type AuditFilters = {
  actorId?: string;
  action?: AuditAction | 'all';
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
};

export type AuditPage = {
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listAuditLogs(token: string, filters: AuditFilters = {}) {
  const params = new URLSearchParams();
  if (filters.actorId) params.set('actorId', filters.actorId);
  if (filters.action && filters.action !== 'all') params.set('action', filters.action);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  const query = params.toString();
  const path = query ? `audit?${query}` : 'audit';
  const data = await apiFetch<AuditLog[] | AuditPage>({ path, token });
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

export async function exportAuditCsv(token: string, filters: AuditFilters = {}): Promise<string> {
  const params = new URLSearchParams();
  if (filters.actorId) params.set('actorId', filters.actorId);
  if (filters.action && filters.action !== 'all') params.set('action', filters.action);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  const query = params.toString();
  const path = `${API_BASE_URL.replace(/\/$/, '')}/audit/export.csv${query ? `?${query}` : ''}`;
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error("Impossible de générer l'export d'audit");
  }
  return response.text();
}
