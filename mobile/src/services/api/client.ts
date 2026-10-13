import NetInfo from '@react-native-community/netinfo';
import { env } from '../../config/env';

type FetchArgs = {
  path: string;
  token?: string;
  options?: RequestInit;
};

/** Le serveur a répondu et a explicitement rejeté la requête (ex: règle métier, validation). */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Le serveur n'a pas pu être joint (pas de réseau, coupure). Distinct d'ApiError : la requête
 * n'a pas été traitée, ce qui permet à l'appelant de se replier (cache, file d'attente agent).
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

// Joignabilité du serveur observée sur les requêtes réelles : plus fiable que l'état du Wi-Fi seul
// (réseau présent mais sans accès, portail captif, serveur injoignable).
let serverReachable = true;
const reachabilityListeners = new Set<(reachable: boolean) => void>();

function setServerReachable(reachable: boolean) {
  if (reachable === serverReachable) return;
  serverReachable = reachable;
  reachabilityListeners.forEach((listener) => listener(reachable));
}

export function isServerReachable() {
  return serverReachable;
}

/** Abonnement aux changements de joignabilité ; renvoie la fonction de désabonnement. */
export function onServerReachabilityChange(listener: (reachable: boolean) => void) {
  reachabilityListeners.add(listener);
  return () => {
    reachabilityListeners.delete(listener);
  };
}

const OFFLINE_ACTION_MESSAGE = "Pas de connexion : rien n'a été envoyé. Réessayez quand le réseau sera revenu.";
const OFFLINE_READ_MESSAGE = 'Pas de connexion au serveur. Vérifiez le réseau et réessayez.';

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

const normalizeBaseUrl = () => {
  if (!env.apiUrl) {
    throw new Error('Missing EXPO_PUBLIC_API_URL');
  }
  return env.apiUrl.replace(/\/$/, '');
};

const buildUrl = (path: string) => {
  const base = normalizeBaseUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
};

// Assez généreux pour l'envoi d'une photo (checkIn/checkOut) sur une connexion mobile faible,
// sans pour autant laisser l'utilisateur indéfiniment sans retour en cas de coupure réelle.
const REQUEST_TIMEOUT_MS = 40000;

export async function apiFetch<T>({ path, token, options = {} }: FetchArgs): Promise<T> {
  const isAction = Boolean(options.method && options.method.toUpperCase() !== 'GET');
  // Une action (validation, demande, message) sans réseau est refusée tout de suite avec un
  // message clair, plutôt que d'attendre l'expiration de la requête.
  if (isAction) {
    const state = await NetInfo.fetch().catch(() => null);
    if (state?.isConnected === false) throw new NetworkError(OFFLINE_ACTION_MESSAGE);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (err) {
    setServerReachable(false);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new NetworkError(
        isAction
          ? "Le serveur ne répond pas : l'action n'a peut-être pas été enregistrée. Vérifiez avant de recommencer."
          : 'Le serveur ne répond pas. Vérifiez votre connexion et réessayez.',
      );
    }
    // fetch échoue sans réponse (« Failed to fetch », « Network request failed ») : rien n'est parti.
    throw new NetworkError(isAction ? OFFLINE_ACTION_MESSAGE : OFFLINE_READ_MESSAGE);
  } finally {
    clearTimeout(timeout);
  }
  setServerReachable(true);

  if (!response.ok) {
    let message = response.statusText;
    const raw = await response.text();
    try {
      const data = JSON.parse(raw);
      message = Array.isArray(data.message) ? data.message.join(', ') : data.message || message;
    } catch {
      if (raw) message = raw;
    }
    if (response.status === 401 && token) {
      unauthorizedHandler?.();
    }
    throw new ApiError(message || 'API error', response.status);
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json();
}
