export type InterventionCategory = {
  id: string;
  label: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SiteCategoryChecklistItem = {
  id: string;
  siteCategoryId: string;
  label: string;
  order: number;
};

export type SiteCategory = {
  id: string;
  siteId: string;
  categoryId: string;
  category: InterventionCategory;
  startTime: string;
  endTime: string;
  active: boolean;
  checklist: SiteCategoryChecklistItem[];
};

export type SiteRosterEntry = {
  agentId: string;
  agentName: string;
  templateId: string;
  templateLabel: string;
  startTime: string;
  endTime: string;
};

export type SiteRoster = Record<string, SiteRosterEntry[]>;
