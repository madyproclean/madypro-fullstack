export type DashboardFilterOptions = {
  sites: string[];
  supervisors: string[];
};

export type DashboardPlanningRecord = {
  id: string;
  agent: string;
  supervisor: string;
  site: string;
  planned: boolean;
  checkIn?: string;
  status: 'ON_TIME' | 'LATE' | 'ABSENT';
};

export type DashboardAlert = {
  id: string;
  type: string;
  description: string;
  severity: 'warning' | 'info' | 'error';
};

export type DashboardSummary = {
  defaultDate: string;
  filterOptions: DashboardFilterOptions;
  metrics: { title: string; value: number }[];
  planning: DashboardPlanningRecord[];
  alerts: DashboardAlert[];
};
