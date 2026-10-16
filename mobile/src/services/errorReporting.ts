import Constants from 'expo-constants';
import { env } from '@/config/env';

const sent = new Set<string>();

/** Remonte une erreur de l'application dans le journal des erreurs (une fois par erreur et par session). */
export function reportError(error: unknown, context?: string) {
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Erreur inconnue');
  const key = `${err.message}|${(err.stack ?? '').split('\n')[1] ?? ''}`;
  if (sent.has(key) || sent.size > 20) return;
  sent.add(key);
  fetch(`${env.apiUrl}/monitoring/errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'MOBILE',
      message: err.message.slice(0, 2000),
      stack: err.stack?.slice(0, 8000),
      path: context?.slice(0, 500),
      appVersion: Constants.expoConfig?.version,
    }),
  }).catch(() => undefined);
}

/** Erreurs JavaScript non rattrapées : relevées puis transmises au gestionnaire d'origine. */
export function installGlobalErrorReporting() {
  const g = global as unknown as { ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void } };
  if (!g.ErrorUtils) return;
  const previous = g.ErrorUtils.getGlobalHandler();
  g.ErrorUtils.setGlobalHandler((error, fatal) => {
    reportError(error, fatal ? 'plantage' : 'erreur');
    previous(error, fatal);
  });
}
