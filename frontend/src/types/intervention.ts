export type InterventionType = 'REGULAR' | 'PONCTUAL';
export type InterventionStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'NEEDS_REVIEW' | 'CANCELLED' | 'NO_SHOW';

export type Intervention = {
  id: string;
  siteId: string;
  siteName: string;
  date: string;
  startTime: string;
  endTime: string;
  type: InterventionType;
  subType?: string;
  categoryId?: string;
  label?: string;
  agents: { id: string; name: string; attendanceId?: string; attendanceStatus?: string; arrivalTime?: string; checkInTime?: string; checkOutTime?: string }[];
  agentIds: string[];
  truckLabels: string[];
  observation?: string;
  photos?: string[];
  clientSignature?: string;
  billable: boolean;
  status: InterventionStatus;
};

export type AssignmentSuggestion = {
  interventionId: string;
  candidates: { id: string; name: string; distanceMeters: number | null }[];
};

export type TemplateAgentSuggestion = {
  siteId: string;
  candidates: { id: string; name: string; distanceMeters: number | null; positionSource: 'attendance' | 'address' | null }[];
};

export type RouteOptimizationResult = {
  userId: string;
  date: string;
  stops: { interventionId: string; siteName: string; startTime: string }[];
  totalDistanceMeters: number;
};

export type DurationEstimate = {
  siteId: string;
  type: string | null;
  sampleSize: number;
  estimatedMinutes: number | null;
};

export type TemplateStop = {
  id: string;
  daysOfWeek: number[];
  intervalWeeks: number;
  /** Arrêt sans fréquence : une seule occurrence à cette date, exclusif avec daysOfWeek. */
  specificDate?: string | null;
  categoryId?: string | null;
  startTime: string;
  endTime: string;
  agentIds: string[];
  order: number;
};

export type InterventionTemplate = {
  id: string;
  label: string;
  siteId: string;
  startDate: string;
  endDate: string | null;
  active: boolean;
  validatedAt: string | null;
  validatedById: string | null;
  createdAt: string;
  stops: TemplateStop[];
  /** Modification proposée par un superviseur, en attente : la version actuelle reste active. */
  pendingVersion?: { label?: string; stops?: TemplateStop[] } | null;
  pendingRequestedAt?: string | null;
  pendingRequestedByName?: string | null;
  /** Pas de passage les jours fériés. */
  skipHolidays?: boolean;
};

export type TemplateImpactItem = {
  date: string;
  startTime: string;
  endTime: string;
  categoryLabel: string | null;
  agents: string[];
};

export type TemplateImpact = {
  period: { startDate: string; endDate: string };
  requiresValidation: boolean;
  added: TemplateImpactItem[];
  removed: TemplateImpactItem[];
  changed: { before: TemplateImpactItem; after: TemplateImpactItem }[];
  warnings: string[];
};

export type TemplateRevision = {
  id: string;
  createdAt: string;
  authorName: string | null;
  approvedByName: string | null;
  note: string | null;
  snapshot: { label: string; startDate: string; endDate: string | null; active: boolean; stops: TemplateStop[] };
};

export type TemplateException = {
  id: string;
  stopId: string;
  date: string;
  kind: 'CANCEL' | 'REPLACE_AGENTS';
  agents: { id: string; name: string }[];
  reason: string | null;
  createdByName: string | null;
  createdAt: string;
};

export type TemplateOccurrence = {
  date: string;
  stopId: string;
  siteId: string;
  siteName: string;
  categoryId?: string | null;
  startTime: string;
  endTime: string;
  agentIds: string[];
};

export type TemplatePreview = {
  templateId: string;
  templateLabel: string;
  occurrences: TemplateOccurrence[];
};

export type PlanningEntry = {
  date: string;
  stopId: string;
  siteId: string;
  siteName: string;
  templateId: string;
  templateLabel: string;
  categoryId?: string | null;
  startTime: string;
  endTime: string;
  agentIds: string[];
  source: 'real' | 'projected';
  interventionId?: string;
  status?: InterventionStatus;
  /** Remplacement prévu ce jour-là seulement (exception du gabarit). */
  exception?: { kind: 'REPLACE_AGENTS'; reason?: string | null; originalAgentIds: string[] };
};
