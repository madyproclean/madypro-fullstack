import { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
};

export type AgentTabParamList = {
  AgentHome: undefined;
  AgentHistory: undefined;
  AgentRequests: undefined;
  AgentNotifications: undefined;
  AgentProfile: undefined;
};

export type AgentStackParamList = {
  AgentTabs: NavigatorScreenParams<AgentTabParamList>;
  AgentIntervention: { id: string };
  AgentAbsenceForm: undefined;
  AgentChangePassword: undefined;
  AgentSyncQueue: undefined;
  AgentAvailability: undefined;
  AgentChat: undefined;
  AgentInventoryScanner: undefined;
  AgentPlanning: undefined;
  AgentShiftSwaps:
    | { interventionId: string; siteName?: string; date?: string; startTime?: string; endTime?: string }
    | undefined;
  AgentTeamFeed: undefined;
  AgentOnboardingChecklist: undefined;
};

/** Rubriques de l'espace superviseur (tablette), dans l'ordre de la navigation latérale. */
export type SupervisorTabParamList = {
  SupervisorToday: undefined;
  SupervisorMap: undefined;
  SupervisorMissions: { interventionId?: string } | undefined;
  SupervisorValidations: { absenceId?: string } | undefined;
  SupervisorTeam: undefined;
  SupervisorMessages: { threadUserId?: string } | undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Agent: NavigatorScreenParams<AgentStackParamList>;
  Supervisor: NavigatorScreenParams<SupervisorTabParamList>;
  AdminWebOnly: undefined;
};
