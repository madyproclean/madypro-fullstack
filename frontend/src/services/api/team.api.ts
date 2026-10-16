import {
  Certification,
  EmployeeDocument,
  ShiftSwapRequest,
  TeamPost,
  Badge,
  UserBadge,
  OnboardingTemplateItem,
  UserOnboardingItem,
  Availability,
} from '../../types/team';
import { apiFetch } from './client';

// Habilitations
export async function listCertifications(token: string, userId?: string) {
  const query = userId ? `?userId=${userId}` : '';
  return apiFetch<Certification[]>({ path: `certifications${query}`, token });
}
export async function listExpiringCertifications(token: string, days = 30) {
  return apiFetch<Certification[]>({ path: `certifications/expiring?days=${days}`, token });
}
export async function createCertification(
  token: string,
  payload: { userId: string; label: string; obtainedAt?: string; expiresAt?: string },
) {
  return apiFetch<Certification>({
    path: 'certifications',
    token,
    options: { method: 'POST', body: JSON.stringify(payload) },
  });
}
export async function deleteCertification(token: string, id: string) {
  return apiFetch<{ deleted: boolean }>({ path: `certifications/${id}`, token, options: { method: 'DELETE' } });
}

// Documents RH
export async function listEmployeeDocuments(token: string, userId?: string) {
  const query = userId ? `?userId=${userId}` : '';
  return apiFetch<EmployeeDocument[]>({ path: `employee-documents${query}`, token });
}
export async function createEmployeeDocument(
  token: string,
  payload: { userId: string; type: string; label: string; fileUrl: string },
) {
  return apiFetch<EmployeeDocument>({
    path: 'employee-documents',
    token,
    options: { method: 'POST', body: JSON.stringify(payload) },
  });
}
export async function deleteEmployeeDocument(token: string, id: string) {
  return apiFetch<{ deleted: boolean }>({ path: `employee-documents/${id}`, token, options: { method: 'DELETE' } });
}

// Échanges de shift
export async function listShiftSwaps(token: string) {
  return apiFetch<ShiftSwapRequest[]>({ path: 'shift-swaps', token });
}
export async function acceptShiftSwap(token: string, id: string) {
  return apiFetch<ShiftSwapRequest>({ path: `shift-swaps/${id}/accept`, token, options: { method: 'POST' } });
}
export async function rejectShiftSwap(token: string, id: string) {
  return apiFetch<ShiftSwapRequest>({ path: `shift-swaps/${id}/reject`, token, options: { method: 'POST' } });
}

// Fil d'actualité
export async function listTeamPosts(token: string) {
  return apiFetch<TeamPost[]>({ path: 'team-feed', token });
}
export async function createTeamPost(token: string, message: string) {
  return apiFetch<TeamPost>({
    path: 'team-feed',
    token,
    options: { method: 'POST', body: JSON.stringify({ message }) },
  });
}
export async function deleteTeamPost(token: string, id: string) {
  return apiFetch<{ deleted: boolean }>({ path: `team-feed/${id}`, token, options: { method: 'DELETE' } });
}

// Badges
export async function listBadges(token: string) {
  return apiFetch<Badge[]>({ path: 'badges', token });
}
export async function createBadge(token: string, payload: { code: string; label: string; description?: string }) {
  return apiFetch<Badge>({ path: 'badges', token, options: { method: 'POST', body: JSON.stringify(payload) } });
}
export async function listBadgeAwards(token: string, userId?: string) {
  const query = userId ? `?userId=${userId}` : '';
  return apiFetch<UserBadge[]>({ path: `badges/awards${query}`, token });
}
export async function awardBadge(
  token: string,
  payload: { userId: string; badgeId: string; period?: string; note?: string },
) {
  return apiFetch<UserBadge>({
    path: 'badges/awards',
    token,
    options: { method: 'POST', body: JSON.stringify(payload) },
  });
}
export async function revokeBadgeAward(token: string, id: string) {
  return apiFetch<{ deleted: boolean }>({ path: `badges/awards/${id}`, token, options: { method: 'DELETE' } });
}

// Onboarding
export async function listOnboardingTemplate(token: string) {
  return apiFetch<OnboardingTemplateItem[]>({ path: 'onboarding/template', token });
}
export async function createOnboardingTemplateItem(token: string, payload: { label: string; order?: number }) {
  return apiFetch<OnboardingTemplateItem>({
    path: 'onboarding/template',
    token,
    options: { method: 'POST', body: JSON.stringify(payload) },
  });
}
export async function deleteOnboardingTemplateItem(token: string, id: string) {
  return apiFetch<{ deleted: boolean }>({ path: `onboarding/template/${id}`, token, options: { method: 'DELETE' } });
}
export async function getUserOnboarding(token: string, userId: string) {
  return apiFetch<UserOnboardingItem[]>({ path: `onboarding/users/${userId}`, token });
}
export async function seedUserOnboarding(token: string, userId: string) {
  return apiFetch<UserOnboardingItem[]>({ path: `onboarding/users/${userId}/seed`, token, options: { method: 'POST' } });
}
export async function setOnboardingItemDone(token: string, id: string, done: boolean) {
  return apiFetch<UserOnboardingItem>({
    path: `onboarding/items/${id}`,
    token,
    options: { method: 'PATCH', body: JSON.stringify({ done }) },
  });
}

// Disponibilités
export async function listAvailability(token: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString();
  return apiFetch<Availability[]>({ path: `availability${query ? `?${query}` : ''}`, token });
}
