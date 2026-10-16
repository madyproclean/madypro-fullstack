import { createDeviceCache } from './supervisorCache';

/**
 * Cache de l'espace agent : planning, missions, fiches de site et checklists restent consultables
 * sans réseau (sous-sols, parkings). Les actions faites hors ligne passent par la file de
 * synchronisation (SyncContext), jamais par ce cache.
 */
export const AGENT_CACHE_PREFIX = 'agentcache:';
export const agentCache = createDeviceCache(AGENT_CACHE_PREFIX, 120);
