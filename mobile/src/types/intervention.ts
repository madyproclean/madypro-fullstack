export type InterventionType = 'REGULAR' | 'PUNCTUAL';

export type InterventionStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'NEEDS_REVIEW';

export type Intervention = {
  id: string;
  siteId: string;
  siteName: string;
  date: string;
  startTime: string;
  endTime: string;
  type: InterventionType;
  subType?: string;
  label?: string;
  status: InterventionStatus;
  agentIds: string[];
  agents: { id: string; name: string; attendanceId?: string; attendanceStatus?: string; arrivalTime?: string; checkInTime?: string; checkOutTime?: string }[];
  truckLabels: string[];
  observation?: string;
  actualStartTime?: string;
  actualEndTime?: string;
  actualStartAt?: string;
  actualEndAt?: string;
  siteAddress?: string;
  siteLatitude?: number;
  siteLongitude?: number;
  hasAnomaly?: boolean;
  /** Créneau du gabarit dont la mission est issue (absent pour une mission saisie à la main). */
  generatedFromStopId?: string;
  generatedFromTemplateId?: string;
};
