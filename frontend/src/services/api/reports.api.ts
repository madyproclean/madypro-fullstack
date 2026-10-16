import {
  BillingReportRow,
  HoursQuotaReport,
  PayrollBreakdownRow,
  PeriodComparison,
  ReportsPerformance,
  SiteBenchmarkRow,
  SiteDossierReport,
} from '../../types/report';
import { DashboardSummary } from '../../types/dashboard';
import { InvoicingKpis } from '../../types/invoice';
import { apiFetch, API_BASE_URL } from './client';
import { openPdfInNewTab } from '../../utils/downloadPdf';

export async function getDashboardSummary(token: string, date?: string): Promise<DashboardSummary> {
  const path = date ? `reports/summary?date=${encodeURIComponent(date)}` : 'reports/summary';
  return apiFetch<DashboardSummary>({ path, token });
}

export async function getPerformanceReport(
  token: string,
  filters: { startDate?: string; endDate?: string } = {}
) {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  const query = params.toString();
  const path = query ? `reports/performance?${query}` : 'reports/performance';
  return apiFetch<ReportsPerformance>({ path, token });
}

export async function getPayrollCsv(
  token: string,
  filters: { startDate?: string; endDate?: string } = {},
): Promise<string> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  const query = params.toString();
  const path = `${API_BASE_URL.replace(/\/$/, '')}/reports/payroll${query ? `?${query}` : ''}`;
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error("Impossible de générer l'export paie");
  }
  return response.text();
}

export type SendReportResult = { recipients: number; sent: number; failed: number };

export async function sendReportByEmail(
  token: string,
  filters: { startDate?: string; endDate?: string } = {},
): Promise<SendReportResult> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  const query = params.toString();
  const path = `reports/send-report${query ? `?${query}` : ''}`;
  return apiFetch<SendReportResult>({ path, token, options: { method: 'POST' } });
}

export async function getPayrollBreakdown(
  token: string,
  filters: { startDate?: string; endDate?: string } = {},
): Promise<PayrollBreakdownRow[]> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  const query = params.toString();
  const path = `reports/payroll-breakdown${query ? `?${query}` : ''}`;
  return apiFetch<PayrollBreakdownRow[]>({ path, token });
}

export async function pushPayrollBreakdown(
  token: string,
  filters: { startDate?: string; endDate?: string } = {},
): Promise<{ dispatched: boolean; agentCount: number }> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  const query = params.toString();
  const path = `reports/payroll-breakdown/push${query ? `?${query}` : ''}`;
  return apiFetch<{ dispatched: boolean; agentCount: number }>({ path, token, options: { method: 'POST' } });
}

export async function getPeriodComparison(
  token: string,
  filters: { startDate?: string; endDate?: string } = {},
): Promise<PeriodComparison> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  const query = params.toString();
  const path = `reports/comparison${query ? `?${query}` : ''}`;
  return apiFetch<PeriodComparison>({ path, token });
}

export async function getBillingReport(
  token: string,
  filters: { startDate?: string; endDate?: string } = {},
): Promise<BillingReportRow[]> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  const query = params.toString();
  const path = `reports/billing${query ? `?${query}` : ''}`;
  return apiFetch<BillingReportRow[]>({ path, token });
}

export async function getInvoicingReport(token: string): Promise<InvoicingKpis> {
  return apiFetch<InvoicingKpis>({ path: 'reports/invoicing', token });
}

export async function getSiteBenchmark(
  token: string,
  filters: { startDate?: string; endDate?: string } = {},
): Promise<SiteBenchmarkRow[]> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  const query = params.toString();
  const path = `reports/site-benchmark${query ? `?${query}` : ''}`;
  return apiFetch<SiteBenchmarkRow[]>({ path, token });
}

export async function getHoursQuotaReport(
  token: string,
  filters: { startDate?: string; endDate?: string; siteId?: string } = {},
): Promise<HoursQuotaReport> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.siteId && filters.siteId !== 'all') params.set('siteId', filters.siteId);
  const query = params.toString();
  const path = `reports/hours-quota${query ? `?${query}` : ''}`;
  return apiFetch<HoursQuotaReport>({ path, token });
}

export async function downloadHoursQuotaPdf(
  token: string,
  filters: { startDate?: string; endDate?: string; siteId?: string } = {},
): Promise<void> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.siteId && filters.siteId !== 'all') params.set('siteId', filters.siteId);
  const query = params.toString();
  await openPdfInNewTab(token, `reports/hours-quota/pdf${query ? `?${query}` : ''}`);
}

export async function getSiteDossierReport(
  token: string,
  filters: { startDate?: string; endDate?: string; siteId?: string } = {},
): Promise<SiteDossierReport> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.siteId && filters.siteId !== 'all') params.set('siteId', filters.siteId);
  const query = params.toString();
  const path = `reports/site-dossier${query ? `?${query}` : ''}`;
  return apiFetch<SiteDossierReport>({ path, token });
}

export async function downloadSiteDossierPdf(
  token: string,
  filters: { startDate?: string; endDate?: string; siteId?: string } = {},
): Promise<void> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.siteId && filters.siteId !== 'all') params.set('siteId', filters.siteId);
  const query = params.toString();
  await openPdfInNewTab(token, `reports/site-dossier/pdf${query ? `?${query}` : ''}`);
}

export type DashboardWidgetConfig = { id: string; visible: boolean; order: number };

export async function getDashboardLayout(token: string): Promise<DashboardWidgetConfig[] | null> {
  return apiFetch<DashboardWidgetConfig[] | null>({ path: 'reports/dashboard-layout', token });
}

export async function setDashboardLayout(token: string, layout: DashboardWidgetConfig[]): Promise<void> {
  await apiFetch({
    path: 'reports/dashboard-layout',
    token,
    options: { method: 'PUT', body: JSON.stringify({ layout }) },
  });
}
