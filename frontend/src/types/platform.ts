export type ApiKey = {
  id: string;
  label: string;
  scopes: string[];
  active: boolean;
  createdAt: string;
  lastUsedAt?: string;
};

// La clé en clair n'est renvoyée par le backend qu'à la création (voir platform.service.ts),
// jamais dans la liste — types distincts pour que ça reste vrai côté front aussi.
export type CreatedApiKey = ApiKey & { key: string };

export type PortalToken = {
  id: string;
  siteId: string;
  site?: { name: string };
  token: string;
  active: boolean;
  createdAt: string;
};
