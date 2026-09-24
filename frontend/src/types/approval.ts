export type ApprovalActionType =
  | 'CREATE_INTERVENTION'
  | 'UPDATE_INTERVENTION_SCHEDULE'
  | 'ASSIGN_AGENT'
  | 'UNASSIGN_AGENT'
  | 'CANCEL_INTERVENTION'
  | 'CREATE_TEMPLATE_BATCH'
  | 'VALIDATE_TEMPLATE';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';

export type TemplateBatchPayload = {
  templateId: string;
  templateLabel?: string;
  occurrences: { date: string; siteId: string; startTime: string; endTime: string; agentIds: string[] }[];
};

export type ValidateTemplatePayload = {
  templateLabel?: string;
  siteId?: string;
  siteName?: string;
};

/** Payload de CREATE_INTERVENTION quand plusieurs arrêts (sites) sont soumis en une fois. */
export type OneshotBatchPayload = {
  occurrences: { siteId: string; date: string; startTime: string; endTime: string; agentIds: string[]; label?: string }[];
};

export type ApprovalRequest = {
  id: string;
  actionType: ApprovalActionType;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
  previousState: Record<string, unknown> | null;
  status: ApprovalStatus;
  requestedById: string | null;
  requestedByName?: string;
  reviewedById?: string | null;
  reviewedByName?: string;
  reviewComment?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
};

export const isApprovalRequest = (value: unknown): value is ApprovalRequest =>
  Boolean(value) && typeof value === 'object' && 'actionType' in (value as Record<string, unknown>);
