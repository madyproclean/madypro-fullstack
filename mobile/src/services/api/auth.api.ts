import { AuthResponse } from '../../types/auth';
import { apiFetch } from './client';

type LoginPayload = {
  email: string;
  password: string;
};

type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
};

type ForgotPasswordPayload = {
  email: string;
};

export async function login(email: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>({
    path: '/auth/login',
    options: {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), password } satisfies LoginPayload),
    },
  });
}

export async function changePassword(token: string, payload: ChangePasswordPayload) {
  return apiFetch<{ message: string }>({
    path: '/auth/change-password',
    token,
    options: {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  });
}

export async function forgotPassword(email: string) {
  return apiFetch<{ message: string }>({
    path: '/auth/forgot-password',
    options: {
      method: 'POST',
      body: JSON.stringify({ email: email.trim() } satisfies ForgotPasswordPayload),
    },
  });
}
