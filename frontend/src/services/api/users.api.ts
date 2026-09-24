import { User } from '../../types/user';
import { apiFetch } from './client';

export type UserFilters = {
  search?: string;
  role?: string;
  status?: 'active' | 'inactive' | 'all';
  page?: number;
  pageSize?: number;
};
export type UsersPage = { items: User[]; total: number; page: number; pageSize: number };

export type CreateUserPayload = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  role: string;
  password?: string;
};

export type UpdateUserPayload = Partial<CreateUserPayload>;

export async function listUsers(token: string, filters: UserFilters = {}): Promise<UsersPage> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.role && filters.role !== 'all') params.set('role', filters.role);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  const query = params.toString();
  const path = query ? `users?${query}` : 'users';
  return apiFetch<UsersPage>({ path, token });
}

export async function createUser(token: string, payload: CreateUserPayload): Promise<User> {
  return apiFetch<User>({
    path: 'users',
    token,
    options: {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  });
}

export async function updateUser(token: string, id: string, payload: UpdateUserPayload): Promise<User> {
  return apiFetch<User>({
    path: `users/${id}`,
    token,
    options: {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  });
}

export async function updateUserStatus(token: string, id: string, active: boolean): Promise<User> {
  return apiFetch<User>({
    path: `users/${id}/status`,
    token,
    options: {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    },
  });
}

export async function resetUserPassword(token: string, id: string): Promise<{ password: string }> {
  return apiFetch<{ password: string }>({
    path: `users/${id}/reset-password`,
    token,
    options: {
      method: 'POST',
      body: JSON.stringify({}),
    },
  });
}

export async function getUser(token: string, id: string): Promise<User> {
  return apiFetch<User>({ path: `users/${id}`, token });
}

export async function updateUserPermissions(token: string, id: string, permissions: string[]): Promise<User> {
  return apiFetch<User>({
    path: `users/${id}/permissions`,
    token,
    options: {
      method: 'PATCH',
      body: JSON.stringify({ permissions }),
    },
  });
}
