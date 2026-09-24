export type AuditAction =
  | 'CREATE_NOTIFICATION'
  | 'CREATE_ABSENCE'
  | 'UPDATE_ABSENCE_STATUS'
  | 'CREATE_MANUAL_ATTENDANCE'
  | 'UPDATE_ATTENDANCE'
  | 'CANCEL_ATTENDANCE'
  | 'UPDATE_SETTINGS'
  | 'CREATE_USER'
  | 'UPDATE_USER'
  | 'UPDATE_USER_STATUS'
  | 'RESET_USER_PASSWORD'
  | 'CREATE_SITE'
  | 'UPDATE_SITE'
  | 'DELETE_SITE'
  | 'CREATE_INTERVENTION'
  | 'UPDATE_INTERVENTION'
  | 'UPDATE_INTERVENTION_STATUS'
  | 'CANCEL_INTERVENTION'
  | 'DUPLICATE_INTERVENTION'
  | 'CREATE_TEMPLATE_STOP'
  | 'UPDATE_TEMPLATE_STOP_AGENTS'
  | 'DELETE_TEMPLATE_STOP';

export type AuditLog = {
  id: string;
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  details?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  createdAt: string;
};
