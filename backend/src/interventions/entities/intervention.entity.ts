export type InterventionType = 'REGULAR' | 'PUNCTUAL' | 'PONCTUAL';
export type InterventionStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'NEEDS_REVIEW' | 'CANCELLED' | 'NO_SHOW';

export class InterventionEntity {
  id!: string;
  siteId!: string;
  date!: string;
  startTime!: string;
  endTime!: string;
  type!: InterventionType;
  subType?: string;
  categoryId?: string;
  label?: string;
  agentIds: string[] = [];
  truckLabels: string[] = [];
  observation?: string;
  photos: string[] = [];
  status: InterventionStatus = 'PLANNED';
  billable: boolean = true;
  createdAt!: Date;
  updatedAt!: Date;
  generatedFromTemplateId?: string;
  generatedFromStopId?: string;
  batchId?: string;
}

export class TemplateStopEntity {
  id!: string;
  daysOfWeek!: number[];
  intervalWeeks: number = 1;
  specificDate?: Date | null;
  categoryId?: string | null;
  startTime!: string;
  endTime!: string;
  agentIds: string[] = [];
  order: number = 0;
}

export class InterventionTemplateEntity {
  id!: string;
  label!: string;
  siteId!: string;
  startDate!: Date;
  endDate?: Date | null;
  active: boolean = true;
  validatedAt?: Date | null;
  validatedById?: string | null;
  createdAt!: Date;
  updatedAt!: Date;
  /** Modification proposée en attente de validation (la version actuelle reste active). */
  pendingVersion?: Record<string, unknown> | null;
  pendingRequestedAt?: Date | null;
  pendingRequestedByName?: string | null;
  skipHolidays?: boolean;
  stops: TemplateStopEntity[] = [];
}
