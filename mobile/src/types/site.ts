export type Site = {
  id: string;
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  timeWindow?: string;
  active: boolean;
  /** Consignes du site, visibles par les agents qui y travaillent. */
  accessInstructions?: string;
  accessCode?: string;
  contactName?: string;
  contactPhone?: string;
  photos?: string[];
};
