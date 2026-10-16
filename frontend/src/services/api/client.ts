export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'https://madypro-fullstack.onrender.com';
//export const API_BASE_URL = 'http://localhost:3000';

const defaultHeaders = {
  'Content-Type': 'application/json',
};

type FetchArgs = {
  path: string;
  options?: RequestInit;
  token?: string;
};

const buildUrl = (path: string) => {
  const base = API_BASE_URL.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
};

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export async function apiFetch<T>({ path, options = {}, token }: FetchArgs): Promise<T> {
  const response = await fetch(buildUrl(path), {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = await response.json();
      message = Array.isArray(data.message) ? data.message.join(', ') : data.message || message;
    } catch {
      message = await response.text();
    }
    if (response.status === 401 && token) {
      unauthorizedHandler?.();
    }
    throw new Error(message || 'Erreur serveur');
  }

  return response.json();
}
