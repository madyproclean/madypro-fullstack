export type SiteContract = {
  id: string;
  siteId: string;
  label: string;
  startDate: string;
  endDate: string;
  slaDetails?: string;
  documentUrl?: string;
};

export type SiteZone = {
  id: string;
  siteId: string;
  label: string;
  floor?: string;
  order: number;
  completed: boolean;
};

export type SiteIncident = {
  id: string;
  type: string;
  title?: string;
  description: string;
  status: string;
  createdAt: string;
  interventionDate: string;
  reportedBy: string;
};

export type SiteQualityScore = {
  siteId: string;
  periodDays: number;
  score: number;
  interventionsTotal: number;
  interventionsCompleted: number;
  noShowCount: number;
  anomalyCount: number;
};

export type SiteQrCode = {
  siteId: string;
  code: string;
  qrCodeDataUrl: string;
};
