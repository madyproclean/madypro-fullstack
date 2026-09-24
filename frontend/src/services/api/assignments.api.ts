import { Assignment } from '../../types/assignment';
import { apiFetch } from './client';

export type AssignmentFilters = {
  userId?: string;
  siteId?: string;
  dayOfWeek?: number;
};

export type AssignmentPayload = {
  userId: string;
  siteId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export async function listAssignments(token: string, filters: AssignmentFilters = {}) {
  const params = new URLSearchParams();
  if (filters.userId) params.set('userId', filters.userId);
  if (filters.siteId) params.set('siteId', filters.siteId);
  if (filters.dayOfWeek !== undefined) params.set('dayOfWeek', String(filters.dayOfWeek));
  const query = params.toString();
  const path = query ? `assignments?${query}` : 'assignments';
  return apiFetch<Assignment[]>({ path, token });
}

export async function createAssignment(token: string, payload: AssignmentPayload) {
  return apiFetch<Assignment>({
    path: 'assignments',
    token,
    options: {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  });
}

export async function updateAssignment(token: string, id: string, payload: Partial<AssignmentPayload>) {
  return apiFetch<Assignment>({
    path: `assignments/${id}`,
    token,
    options: {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  });
}

export async function deleteAssignment(token: string, id: string) {
  return apiFetch<Assignment>({
    path: `assignments/${id}`,
    token,
    options: {
      method: 'DELETE',
    },
  });
}
