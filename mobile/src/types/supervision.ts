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
