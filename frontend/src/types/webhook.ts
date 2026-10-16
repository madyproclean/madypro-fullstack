export type Webhook = {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export const WEBHOOK_EVENTS = [
  'intervention.created',
  'intervention.updated',
  'intervention.status',
  'intervention.checklist',
  'attendance.checkin',
  'attendance.checkout',
  'attendance.arrival',
  'payroll.export',
];
