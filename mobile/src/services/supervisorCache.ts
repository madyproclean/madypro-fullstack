import AsyncStorage from '@react-native-async-storage/async-storage';
import { NetworkError } from './api/client';

/**
 * Cache en lecture seule de l'espace superviseur : la dernière réponse de chaque écran est
 * gardée sur l'appareil pour rester consultable sans réseau. Rien n'est jamais rejoué : une
 * action faite hors ligne est refusée (voir apiFetch), jamais mise en attente.
 *
 * Les entrées sont rangées par utilisateur et effacées à la déconnexion (tablettes partagées).
 */
export const SUPERVISOR_CACHE_PREFIX = 'supcache:';
/** Au-delà, les entrées les plus anciennes sont supprimées (fiches ouvertes au fil des jours). */
const MAX_ENTRIES = 150;

type Entry<T> = { savedAt: string; value: T };
type Index = Record<string, string>; // clé → savedAt
export type CachedResult<T> = { value: T; savedAt: string; fromCache: boolean };

/** Cache local par utilisateur, rangé sous un préfixe (effacé à la déconnexion). */
export function createDeviceCache(prefix: string, maxEntries = MAX_ENTRIES) {
  const indexKey = `${prefix}index`;
  const storageKey = (userId: string, key: string) => `${prefix}${userId}:${key}`;

  async function readIndex(): Promise<Index> {
    try {
      return JSON.parse((await AsyncStorage.getItem(indexKey)) ?? '{}') as Index;
    } catch {
      return {};
    }
  }

  async function readCache<T>(userId: string, key: string): Promise<Entry<T> | null> {
    try {
      const raw = await AsyncStorage.getItem(storageKey(userId, key));
      return raw ? (JSON.parse(raw) as Entry<T>) : null;
    } catch {
      return null;
    }
  }

  async function writeCache<T>(userId: string, key: string, value: T, savedAt = new Date().toISOString()) {
    const full = storageKey(userId, key);
    try {
      await AsyncStorage.setItem(full, JSON.stringify({ savedAt, value }));
      const index = await readIndex();
      index[full] = savedAt;
      const keys = Object.keys(index);
      if (keys.length > maxEntries) {
        const oldest = keys.sort((a, b) => index[a].localeCompare(index[b])).slice(0, keys.length - maxEntries);
        await AsyncStorage.multiRemove(oldest);
        oldest.forEach((k) => delete index[k]);
      }
      await AsyncStorage.setItem(indexKey, JSON.stringify(index));
    } catch {
      // Cache de confort : un échec d'écriture ne doit jamais bloquer l'écran.
    }
  }

  /**
   * Charge depuis le serveur et met en cache. Si le serveur est injoignable (pas de réponse),
   * renvoie la dernière copie enregistrée avec `fromCache: true`. Toute autre erreur (refus du
   * serveur : droits, introuvable) n'est jamais masquée par le cache.
   *
   * `onCached` reçoit la copie locale avant la requête, pour afficher tout de suite quelque chose
   * sur un réseau lent (à ne fournir qu'au premier chargement d'un écran).
   */
  async function loadWithCache<T>(
    userId: string | undefined,
    key: string,
    fetcher: () => Promise<T>,
    onCached?: (cached: Entry<T>) => void,
  ): Promise<CachedResult<T>> {
    if (!userId) return { value: await fetcher(), savedAt: new Date().toISOString(), fromCache: false };
    let fresh = false;
    const pending = onCached ? readCache<T>(userId, key) : null;
    // La copie locale n'est affichée que si la réponse du serveur n'est pas déjà arrivée.
    pending?.then((cached) => cached && !fresh && onCached?.(cached));
    try {
      const value = await fetcher();
      fresh = true;
      const savedAt = new Date().toISOString();
      await writeCache(userId, key, value, savedAt);
      return { value, savedAt, fromCache: false };
    } catch (err) {
      if (!(err instanceof NetworkError)) throw err;
      const cached = await (pending ?? readCache<T>(userId, key));
      if (!cached) throw err;
      return { value: cached.value, savedAt: cached.savedAt, fromCache: true };
    }
  }

  return { readCache, writeCache, loadWithCache };
}

const supervisorCache = createDeviceCache(SUPERVISOR_CACHE_PREFIX);
export const readCache = supervisorCache.readCache;
export const writeCache = supervisorCache.writeCache;
export const loadWithCache = supervisorCache.loadWithCache;

/** Heure d'enregistrement lisible : « 14:05 », ou « lun. 12 oct. 18:02 » si ce n'est pas aujourd'hui. */
export function formatSavedAt(iso: string, now: Date = new Date()) {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return time;
  return `${date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
}
