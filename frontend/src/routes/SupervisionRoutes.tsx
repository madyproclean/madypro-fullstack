import React from 'react';
import { Navigate, Route } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { SupervisorDashboardPage } from '../pages/supervision/SupervisorDashboardPage';
import { SupervisorSitesPage } from '../pages/supervision/SupervisorSitesPage';
import { SupervisorPlanningPage } from '../pages/supervision/SupervisorPlanningPage';
import { SupervisorInterventionsPage } from '../pages/supervision/SupervisorInterventionsPage';
import { SupervisorAbsencesPage } from '../pages/supervision/SupervisorAbsencesPage';
import { RealtimeSupervisionPage } from '../pages/supervision/RealtimeSupervisionPage';
import { AgentProfilePage } from '../pages/supervision/AgentProfilePage';
import { MyTeamPage } from '../pages/supervision/MyTeamPage';
import { SiteProfilePage } from '../pages/supervision/SiteProfilePage';
import { SupervisorHoursQuotaPage } from '../pages/supervision/SupervisorHoursQuotaPage';

export const SupervisionRoutes = () => (
  <Route element={<ProtectedRoute allowedRoles={['SUPERVISOR', 'ADMIN']} />}>
    <Route element={<AppLayout />}>
      <Route path="/supervision" element={<Navigate to="/supervision/dashboard" replace />} />
      <Route path="/supervision/dashboard" element={<SupervisorDashboardPage />} />
      <Route path="/supervision/sites" element={<SupervisorSitesPage />} />
      <Route path="/supervision/equipe" element={<MyTeamPage />} />
      <Route path="/supervision/presence" element={<RealtimeSupervisionPage />} />
      <Route path="/supervision/carte" element={<RealtimeSupervisionPage />} />
      <Route path="/supervision/planning" element={<SupervisorPlanningPage />} />
      <Route path="/supervision/interventions" element={<SupervisorInterventionsPage />} />
      <Route path="/supervision/absences" element={<SupervisorAbsencesPage />} />
      <Route path="/supervision/rapports" element={<SupervisorHoursQuotaPage />} />
      <Route path="/supervision/agents/:id" element={<AgentProfilePage />} />
      <Route path="/supervision/sites/:id" element={<SiteProfilePage />} />
    </Route>
  </Route>
);
