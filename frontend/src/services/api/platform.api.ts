import { ApiKey, CreatedApiKey, PortalToken } from '../../types/platform';
import { apiFetch } from './client';

export async function listApiKeys(token: string) {
  return apiFetch<ApiKey[]>({ path: 'platform/api-keys', token });
}

export async function createApiKey(token: string, label: string, scopes: string[] = []) {
  return apiFetch<CreatedApiKey>({
    path: 'platform/api-keys',
    token,
    options: { method: 'POST', body: JSON.stringify({ label, scopes }) },
  });
}

export async function revokeApiKey(token: string, id: string) {
  return apiFetch<{ revoked: boolean }>({
    path: `platform/api-keys/${id}`,
    token,
    options: { method: 'DELETE' },
  });
}

export async function listPortalTokens(token: string, siteId?: string) {
  const path = siteId ? `platform/portal-tokens?siteId=${encodeURIComponent(siteId)}` : 'platform/portal-tokens';
  return apiFetch<PortalToken[]>({ path, token });
}

export async function createPortalToken(token: string, siteId: string) {
  return apiFetch<PortalToken>({
    path: `platform/portal-tokens/${siteId}`,
    token,
    options: { method: 'POST' },
  });
}

export async function revokePortalToken(token: string, id: string) {
  return apiFetch<{ revoked: boolean }>({
    path: `platform/portal-tokens/${id}`,
    token,
    options: { method: 'DELETE' },
  });
}
