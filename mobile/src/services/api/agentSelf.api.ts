import { apiFetch } from './client';

export type MonthSummary = {
  month: string;
  plannedHours: number;
  workedHours: number;
  missionsDone: number;
  missionsUpcoming: number;
  late: number;
};

export type LeaveBalance = { year: number; allocatedDays: number; usedDays: number; remaining: number };

/** Mes heures du mois (heures faites et prévues, missions, retards). */
export function getMyMonthSummary(token: string, month?: string) {
  return apiFetch<MonthSummary>({ path: `/interventions/me/month-summary${month ? `?month=${month}` : ''}`, token });
}

/** Congés payés de l'année (droits, pris, restants). */
export function getMyLeaveBalance(token: string, userId: string) {
  return apiFetch<LeaveBalance>({ path: `/absences/leave-balance/${encodeURIComponent(userId)}`, token });
}
