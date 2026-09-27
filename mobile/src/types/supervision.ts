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
