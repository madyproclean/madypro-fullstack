import { Webhook } from '../../types/webhook';
import { apiFetch } from './client';

export async function listWebhooks(token: string) {
  return apiFetch<Webhook[]>({ path: 'webhooks', token });
}

export async function createWebhook(token: string, url: string, events: string[]) {
  return apiFetch<Webhook>({
    path: 'webhooks',
    token,
    options: { method: 'POST', body: JSON.stringify({ url, events }) },
  });
}

export async function updateWebhookStatus(token: string, id: string, active: boolean) {
  return apiFetch<Webhook>({
    path: `webhooks/${id}/status`,
    token,
    options: { method: 'PATCH', body: JSON.stringify({ active }) },
  });
}

export async function rotateWebhookSecret(token: string, id: string) {
  return apiFetch<{ secret: string }>({
    path: `webhooks/${id}/rotate-secret`,
    token,
    options: { method: 'POST' },
  });
}

export async function deleteWebhook(token: string, id: string) {
  return apiFetch<{ deleted: boolean }>({
    path: `webhooks/${id}`,
    token,
    options: { method: 'DELETE' },
  });
}
