import { AttendanceRules, CompanyInfo, MonthlyQuota, SettingsSummary } from '../../types/settings';
import { apiFetch } from './client';

export async function getSettings(token: string) {
  return apiFetch<SettingsSummary>({ path: 'settings', token });
}

export async function getCompanyInfo(token: string) {
  return apiFetch<CompanyInfo>({ path: 'settings/company-info', token });
}

export async function updateCompanyInfo(token: string, payload: Partial<CompanyInfo>) {
  return apiFetch<CompanyInfo>({
    path: 'settings/company-info',
    token,
    options: { method: 'PATCH', body: JSON.stringify(payload) },
  });
}

export async function updateAttendanceRules(token: string, payload: AttendanceRules) {
  return apiFetch<AttendanceRules>({
    path: 'settings/attendance-rules',
    token,
    options: {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  });
}

export async function updateMonthlyQuota(token: string, payload: MonthlyQuota) {
  return apiFetch<MonthlyQuota>({
    path: 'settings/monthly-quota',
    token,
    options: {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  });
}

export async function createAbsenceType(token: string, payload: { code: string; name: string }) {
  return apiFetch({
    path: 'settings/absence-types',
    token,
    options: {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  });
}

export async function updateAbsenceType(
  token: string,
  code: string,
  payload: { name?: string; active?: boolean }
) {
  return apiFetch({
    path: `settings/absence-types/${code}`,
    token,
    options: {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  });
}
