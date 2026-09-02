import { User } from '../../types/user';
import { apiFetch } from './client';

type LoginPayload = {
  email: string;
  password: string;
};

export type LoginResult =
  | { twoFactorRequired: true; userId: string }
  | { twoFactorRequired?: false; token: string; user: User };

export async function login(payload: LoginPayload): Promise<LoginResult> {
  return apiFetch<LoginResult>({
    path: 'auth/login',
    options: {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  });
}

export async function loginTwoFactor(userId: string, code: string) {
  return apiFetch<{ token: string; user: User }>({
    path: 'auth/login/two-factor',
    options: {
      method: 'POST',
      body: JSON.stringify({ userId, code }),
    },
  });
}

export async function requestPasswordReset(email: string) {
  return apiFetch<{ message: string }>({
    path: 'auth/forgot-password',
    options: {
      method: 'POST',
      body: JSON.stringify({ email }),
    },
  });
}

export async function resetPassword(token: string, newPassword: string) {
  return apiFetch<{ message: string }>({
    path: 'auth/reset-password',
    options: {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    },
  });
}

export type LoginEvent = {
  id: string;
  userId?: string;
  email: string;
  success: boolean;
  reason?: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
};

export type LoginHistoryPage = {
  items: LoginEvent[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listLoginHistory(token: string, page = 1, pageSize = 20) {
  return apiFetch<LoginHistoryPage>({
    path: `auth/login-history?page=${page}&pageSize=${pageSize}`,
    token,
  });
}

export async function setupTwoFactor(token: string) {
  return apiFetch<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }>({
    path: 'auth/two-factor/setup',
    token,
    options: { method: 'POST' },
  });
}

export async function confirmTwoFactor(token: string, code: string) {
  return apiFetch<{ enabled: boolean }>({
    path: 'auth/two-factor/confirm',
    token,
    options: { method: 'POST', body: JSON.stringify({ code }) },
  });
}

export async function disableTwoFactor(token: string, password: string) {
  return apiFetch<{ enabled: boolean }>({
    path: 'auth/two-factor/disable',
    token,
    options: { method: 'POST', body: JSON.stringify({ password }) },
  });
}
