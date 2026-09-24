import { ApprovalRequest } from '../../types/approval';
import { apiFetch } from './client';

export type ApprovalRequestFilters = {
  status?: string;
  requestedById?: string;
  page?: number;
  pageSize?: number;
};

export type ApprovalRequestPage = { items: ApprovalRequest[]; total: number; page: number; pageSize: number };

export async function listApprovalRequests(token: string, filters: ApprovalRequestFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.requestedById) params.set('requestedById', filters.requestedById);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  const query = params.toString();
  const path = query ? `approval-requests?${query}` : 'approval-requests';
  return apiFetch<ApprovalRequestPage>({ path, token });
}

export async function approveRequest(token: string, id: string) {
  return apiFetch<ApprovalRequest>({
    path: `approval-requests/${id}/approve`,
    token,
    options: { method: 'POST' },
  });
}

export async function rejectRequest(token: string, id: string, comment: string) {
  return apiFetch<ApprovalRequest>({
    path: `approval-requests/${id}/reject`,
    token,
    options: { method: 'POST', body: JSON.stringify({ comment }) },
  });
}
