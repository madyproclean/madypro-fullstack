/** Espace ouvert après connexion : chaque profil n'a accès qu'au sien. */
export type Space = 'Agent' | 'Supervisor' | 'AdminWebOnly';

export function spaceForRole(role: string | undefined | null): Space {
  const normalized = role?.trim().toUpperCase();
  if (normalized === 'AGENT') return 'Agent';
  if (normalized === 'SUPERVISOR') return 'Supervisor';
  // Administrateur ou rôle inconnu : aucun espace mobile, renvoi vers le web.
  return 'AdminWebOnly';
}
