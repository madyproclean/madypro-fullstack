export type AgentPerformanceReport = {
  id: string;
  name: string;
  totalMinutes: number;
  workingDays: number;
  absenceMinutes: number;
};

export type SitePerformanceReport = {
  id: string;
  name: string;
  totalMinutes: number;
  agents: string[];
  uncoveredDays: number;
};

export type ReportsPerformance = {
  period: {
    startDate: string;
    endDate: string;
  };
  agentReports: AgentPerformanceReport[];
  siteReports: SitePerformanceReport[];
  totals: {
    totalMinutes: number;
  };
  kpis: {
    punctualityRate: number | null;
    absenteeismRate: number | null;
    plannedMinutes: number;
    realizedMinutes: number;
    realizationRate: number | null;
  };
};

export type HoursQuotaAgentReport = {
  userId: string;
  name: string;
  siteId: string;
  siteName: string;
  plannedMinutes: number;
  realizedMinutes: number;
  accomplishmentRate: number | null;
  meetsQuota: boolean;
  penaltyMinutes: number;
};

export type HoursQuotaSiteReport = {
  siteId: string;
  siteName: string;
  agents: HoursQuotaAgentReport[];
};

export type HoursQuotaReport = {
  period: { startDate: string; endDate: string };
  threshold: number;
  agentReports: HoursQuotaAgentReport[];
  siteReports: HoursQuotaSiteReport[];
};

export type SiteDossierEntry = {
  siteId: string;
  siteName: string;
  totalMinutes: number;
  punctualityRate: number | null;
  uncoveredDays: number;
  agentsInvolved: string[];
  interventionsTotal: number;
  completionRate: number | null;
  anomalyCount: number;
  billableHours: number;
  internalHours: number;
  quota: { threshold: number; agents: HoursQuotaAgentReport[] };
};

export type SiteDossierReport = {
  period: { startDate: string; endDate: string };
  sites: SiteDossierEntry[];
};

export type PayrollBreakdownRow = {
  agentName: string;
  agentEmail: string;
  normalHours: number;
  nightHours: number;
  sundayHours: number;
  holidayHours: number;
};

export type PeriodComparison = {
  current: { period: { startDate: string; endDate: string }; kpis: ReportsPerformance['kpis']; totals: { totalMinutes: number } };
  previous: { period: { startDate: string; endDate: string }; kpis: ReportsPerformance['kpis']; totals: { totalMinutes: number } };
  deltas: {
    punctualityRate: number | null;
    absenteeismRate: number | null;
    realizationRate: number | null;
    realizedMinutes: number | null;
  };
};

export type BillingReportRow = {
  siteId: string;
  siteName: string;
  billableHours: number;
  internalHours: number;
};

export type SiteBenchmarkRow = {
  siteId: string;
  siteName: string;
  interventionsTotal: number;
  completionRate: number | null;
  anomalyCount: number;
};
