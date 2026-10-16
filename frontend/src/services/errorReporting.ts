import { API_BASE_URL } from './api/client';

const sent = new Set<string>();

/** Remonte une erreur du site web dans le journal des erreurs (une fois par erreur et par page ouverte). */
export function reportError(error: unknown, context?: string) {
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Erreur inconnue');
  const key = `${err.message}|${(err.stack ?? '').split('\n')[1] ?? ''}`;
  if (sent.has(key) || sent.size > 20) return;
  sent.add(key);
  let token: string | undefined;
  try {
    token = JSON.parse(window.localStorage.getItem('madypro-auth') ?? '{}').token;
  } catch {
    token = undefined;
  }
  fetch(`${API_BASE_URL.replace(/\/$/, '')}/monitoring/errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({
      source: 'WEB',
      message: err.message.slice(0, 2000),
      stack: err.stack?.slice(0, 8000),
      path: `${context ? `${context} · ` : ''}${window.location.pathname}`.slice(0, 500),
    }),
    keepalive: true,
  }).catch(() => undefined);
}

/** Erreurs JavaScript non rattrapées et promesses rejetées sans gestionnaire. */
export function installGlobalErrorReporting() {
  window.addEventListener('error', (event) => reportError(event.error ?? event.message, 'page'));
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason, 'promesse'));
}
