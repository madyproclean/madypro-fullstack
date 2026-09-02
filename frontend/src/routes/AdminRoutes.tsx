import React from 'react';
import { Route } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { UsersListPage } from '../pages/users/UsersListPage';
import { UserFormPage } from '../pages/users/UserFormPage';
import { SitesListPage } from '../pages/sites/SitesListPage';
import { SiteFormPage } from '../pages/sites/SiteFormPage';
import { InterventionsPage } from '../pages/interventions/InterventionsPage';
import { AttendanceListPage } from '../pages/attendance/AttendanceListPage';
import { AbsencesListPage } from '../pages/absences/AbsencesListPage';
import { AbsenceDetailPage } from '../pages/absences/AbsenceDetailPage';
import { ReportsPage } from '../pages/reports/ReportsPage';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { NotificationsPage } from '../pages/notifications/NotificationsPage';
import { AuditPage } from '../pages/audit/AuditPage';
import { LoginHistoryPage } from '../pages/audit/LoginHistoryPage';
import { SecuritySettingsPage } from '../pages/settings/SecuritySettingsPage';
import { WebhooksPage } from '../pages/settings/WebhooksPage';
import { ApiKeysPage } from '../pages/settings/ApiKeysPage';
import { QuotesPage } from '../pages/billing/QuotesPage';
import { InvoicesPage } from '../pages/billing/InvoicesPage';
import { FormsPage } from '../pages/forms/FormsPage';
import { ShiftSwapsPage } from '../pages/team/ShiftSwapsPage';
import { TeamFeedPage } from '../pages/team/TeamFeedPage';
import { BadgesPage } from '../pages/team/BadgesPage';
import { OnboardingPage } from '../pages/team/OnboardingPage';
import { AvailabilityPage } from '../pages/team/AvailabilityPage';
import { ChatPage } from '../pages/team/ChatPage';
import { ApprovalsPage } from '../pages/approvals/ApprovalsPage';
import { CategoriesPage } from '../pages/categories/CategoriesPage';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';

export const AdminRoutes = () => (
  <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
    <Route element={<AppLayout />}>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/users" element={<UsersListPage />} />
      <Route path="/users/new" element={<UserFormPage />} />
      <Route path="/users/:id/edit" element={<UserFormPage />} />
      <Route path="/equipe/echanges" element={<ShiftSwapsPage />} />
      <Route path="/equipe/actualites" element={<TeamFeedPage />} />
      <Route path="/equipe/badges" element={<BadgesPage />} />
      <Route path="/equipe/onboarding" element={<OnboardingPage />} />
      <Route path="/equipe/disponibilites" element={<AvailabilityPage />} />
      <Route path="/equipe/messages" element={<ChatPage />} />
      <Route path="/sites" element={<SitesListPage />} />
      <Route path="/sites/new" element={<SiteFormPage />} />
      <Route path="/sites/:id/edit" element={<SiteFormPage />} />
      <Route path="/interventions" element={<InterventionsPage />} />
      <Route path="/approvals" element={<ApprovalsPage />} />
      <Route path="/attendance" element={<AttendanceListPage />} />
      <Route path="/absences" element={<AbsencesListPage />} />
      <Route path="/absences/:id" element={<AbsenceDetailPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/settings/security" element={<SecuritySettingsPage />} />
      <Route path="/settings/webhooks" element={<WebhooksPage />} />
      <Route path="/settings/api-keys" element={<ApiKeysPage />} />
      <Route path="/settings/categories" element={<CategoriesPage />} />
      <Route path="/devis" element={<QuotesPage />} />
      <Route path="/factures" element={<InvoicesPage />} />
      <Route path="/formulaires" element={<FormsPage />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route path="/audit" element={<AuditPage />} />
      <Route path="/audit/login-history" element={<LoginHistoryPage />} />
    </Route>
  </Route>
);
