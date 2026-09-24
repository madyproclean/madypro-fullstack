import { useMemo } from 'react';
import { Site } from '../types/site';
import { User } from '../types/user';

/**
 * `null` pour un admin (aucune restriction) ou tant que l'utilisateur n'est pas chargé ;
 * un `Set` des ids de sites supervisés pour un superviseur (peut être vide).
 */
export function useSupervisedSiteIds(sites: Site[], user: User | null): Set<string> | null {
  return useMemo(() => {
    if (!user || user.role?.toUpperCase() !== 'SUPERVISOR') return null;
    return new Set(sites.filter((s) => s.supervisorIds?.includes(user.id)).map((s) => s.id));
  }, [sites, user]);
}
