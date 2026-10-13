export type TodayTask =
  | {
      kind: 'LATE';
      interventionId: string;
      siteId: string;
      siteName: string;
      startTime: string;
      agentId: string;
      agentName: string;
      agentPhone: string | null;
    }
  | {
      kind: 'TO_VALIDATE';
      interventionId: string;
      siteId: string;
      siteName: string;
      startTime: string;
      endTime: string;
      agentCount: number;
    }
  | { kind: 'ABSENCE'; absenceId: string; agentId: string; agentName: string; type: string; from: string; to: string }
  | { kind: 'UNCOVERED'; interventionId: string; siteId: string; siteName: string; startTime: string };

export type SupervisorToday = {
  date: string;
  generatedAt: string;
  siteCount: number;
  agents: { expected: number; present: number; late: number; absent: number };
  missions: {
    total: number;
    planned: number;
    inProgress: number;
    toValidate: number;
    completed: number;
    notStarted: number;
  };
  tasks: TodayTask[];
};

/** Position d'un agent en mission (attendance/live-map), déjà filtrée sur les sites du superviseur. */
export type LiveAgent = {
  userId: string;
  agentName: string;
  interventionId: string;
  siteId: string;
  siteName: string;
  latitude: number;
  longitude: number;
  lastSeenAt: string;
};

export type SupervisedSite = {
  id: string;
  name: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  active: boolean;
};

export type MissionAttendance = {
  id: string;
  agent: { id: string; name: string };
  checkInTime?: string;
  checkOutTime?: string;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  checkInPhoto?: string;
  checkOutPhoto?: string;
};

export type TeamAbsence = {
  id: string;
  agent: { id: string; name: string };
  type: 'SICK' | 'PAID_LEAVE' | 'UNPAID' | 'OTHER' | string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  from: string;
  to: string;
  reason?: string;
  note?: string;
  attachment?: string;
  site?: { id: string; name: string };
  requiresSecondApproval?: boolean;
  level1ApprovedBy?: string | null;
  level1ApprovedAt?: string | null;
  validatedBy?: string | null;
  validationComment?: string | null;
  createdAt?: string;
};

export type ReplacementSuggestions = {
  absenceId: string;
  interventions: Array<{
    interventionId: string;
    siteId: string;
    siteName: string;
    date: string;
    startTime: string;
    endTime: string;
    candidates: Array<{ id: string; name: string }>;
  }>;
};

export type ApprovalActionType =
  | 'CREATE_INTERVENTION'
  | 'UPDATE_INTERVENTION_SCHEDULE'
  | 'ASSIGN_AGENT'
  | 'UNASSIGN_AGENT'
  | 'CANCEL_INTERVENTION'
  | 'CREATE_TEMPLATE_BATCH'
  | 'VALIDATE_TEMPLATE';

export type ApprovalRequest = {
  id: string;
  actionType: ApprovalActionType;
  entityType: string;
  entityId: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
  /** Site, créneau et changement demandé (absent pour les demandes hors mission). */
  summary?: string;
  reviewComment?: string | null;
  reviewedByName?: string;
  createdAt: string;
  reviewedAt?: string | null;
};

export type AgentOption = { id: string; name: string; active?: boolean };

// ---------------------------------------------------------------- équipe, sites, messages

/** Où en est un agent aujourd'hui sur les sites du superviseur. */
export type AgentDayStatus = 'ON_SITE' | 'LATE' | 'PLANNED' | 'DONE' | 'ABSENT' | 'OFF';

export type AgentDay = { status: AgentDayStatus; siteName?: string; startTime?: string; endTime?: string };

export type TeamAgent = {
  id: string;
  name: string;
  phone: string | null;
  email: string;
  today: AgentDay;
  /** Certifications expirées ou expirant dans les 30 jours. */
  expiringCertifications: number;
};

export type AgentFile = {
  id: string;
  name: string;
  phone: string | null;
  email: string;
  active: boolean;
  today: AgentDay;
  /** En minutes : prévues (missions) et pointées, sur les sites du superviseur. */
  hours: { week: { planned: number; worked: number }; month: { planned: number; worked: number } };
  certifications: Array<{ id: string; label: string; obtainedAt: string | null; expiresAt: string | null }>;
  upcoming: Array<{
    interventionId: string;
    date: string;
    startTime: string;
    endTime: string;
    siteId: string;
    siteName: string;
    status: string;
  }>;
  absences: Array<{ id: string; type: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; from: string; to: string }>;
  sites: Array<{ id: string; name: string }>;
};

export type SiteFile = {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  timeWindow: string | null;
  accessInstructions: string | null;
  accessCode: string | null;
  contact: { name: string | null; phone: string | null; email: string | null };
  checklists: Array<{ id: string; label: string; startTime: string; endTime: string; items: Array<{ id: string; label: string }> }>;
  incidents: Array<{
    id: string;
    type: string;
    title: string | null;
    description: string;
    status: 'NEW' | 'RESOLVED';
    createdAt: string;
    reportedBy: string;
  }>;
  today: Array<{ interventionId: string; startTime: string; endTime: string; status: string; agents: Array<{ id: string; name: string }> }>;
  team: Array<{ id: string; name: string; phone: string | null }>;
};

export type SiteQrCode = { siteId: string; code: string; qrCodeDataUrl: string };

export type ChatMessage = {
  id: string;
  threadUserId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt?: string | null;
};

/** Discussion avec un agent : dernier message et messages de l'agent pas encore lus. */
export type ChatThread = { agent: { id: string; name: string }; lastMessage: ChatMessage; unreadCount: number };
