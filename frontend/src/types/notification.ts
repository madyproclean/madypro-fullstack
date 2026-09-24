export type NotificationAudience = 'ALL_AGENTS' | 'SITE_AGENTS' | 'AGENT';
export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type Notification = {
  id: string;
  title: string;
  message: string;
  audience: NotificationAudience;
  targetId?: string;
  targetName?: string;
  category?: string;
  priority?: NotificationPriority;
  scheduledFor?: string;
  sentAt?: string;
  escalateAfterMinutes?: number;
  createdAt: string;
};

export type NotificationTemplate = {
  id: string;
  name: string;
  title: string;
  message: string;
  category?: string;
  priority?: NotificationPriority;
};
