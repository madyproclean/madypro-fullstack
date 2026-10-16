import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, NetworkError } from '../api/client';
import { loadWithCache, readCache, SUPERVISOR_CACHE_PREFIX, writeCache } from '../supervisorCache';

describe('cache en lecture seule du superviseur', () => {
  beforeEach(() => AsyncStorage.clear());

  it('enregistre la réponse du serveur et la ressert hors ligne', async () => {
    const fresh = await loadWithCache('sup-1', 'today', async () => ({ n: 1 }));
    expect(fresh).toEqual(expect.objectContaining({ value: { n: 1 }, fromCache: false }));

    const offline = await loadWithCache('sup-1', 'today', async () => {
      throw new NetworkError('Pas de connexion');
    });
    expect(offline).toEqual({ value: { n: 1 }, savedAt: fresh.savedAt, fromCache: true });
  });

  it('ne masque jamais un refus du serveur par la copie locale', async () => {
    await writeCache('sup-1', 'agent:a9', { name: 'ancien' });
    await expect(
      loadWithCache('sup-1', 'agent:a9', async () => {
        throw new ApiError('Interdit', 403);
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('propage l’erreur réseau quand rien n’a jamais été enregistré', async () => {
    await expect(
      loadWithCache('sup-1', 'jamais-vu', async () => {
        throw new NetworkError('Pas de connexion');
      }),
    ).rejects.toBeInstanceOf(NetworkError);
  });

  it('sépare les données de chaque compte', async () => {
    await writeCache('sup-1', 'team', ['agent-1']);
    expect(await readCache('sup-2', 'team')).toBeNull();
  });

  it('ne remplace pas une réponse fraîche par la copie locale affichée en attendant', async () => {
    await writeCache('sup-1', 'team', ['ancien']);
    const shown: string[][] = [];
    const result = await loadWithCache('sup-1', 'team', async () => ['frais'], (cached) => shown.push(cached.value));
    expect(result.value).toEqual(['frais']);
    // Si la copie locale a été affichée, c'est forcément avant la réponse fraîche.
    expect(shown.every((v) => v[0] === 'ancien')).toBe(true);
  });

  it('range toutes ses clés sous le préfixe purgé à la déconnexion', async () => {
    await writeCache('sup-1', 'team', []);
    const keys = await AsyncStorage.getAllKeys();
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.startsWith(SUPERVISOR_CACHE_PREFIX))).toBe(true);
  });
});
