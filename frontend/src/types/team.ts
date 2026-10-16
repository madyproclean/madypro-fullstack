export type Certification = {
  id: string;
  userId: string;
  label: string;
  obtainedAt?: string;
  expiresAt?: string;
};

export type EmployeeDocument = {
  id: string;
  userId: string;
  type: 'CONTRACT' | 'BADGE' | 'LICENSE' | 'OTHER';
  label: string;
  fileUrl: string;
  createdAt: string;
};

export type ShiftSwapRequest = {
  id: string;
  interventionId: string;
  requesterId: string;
  targetUserId?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  reason?: string;
  createdAt: string;
  respondedAt?: string;
  intervention: { id: string; date: string; startTime: string; endTime: string; siteId: string };
  requester: { id: string; firstName: string; lastName: string };
  target?: { id: string; firstName: string; lastName: string };
};

export type TeamPost = {
  id: string;
  authorId: string;
  message: string;
  photos: string[];
  createdAt: string;
  author: { id: string; firstName: string; lastName: string; role: string };
};

export type Badge = {
  id: string;
  code: string;
  label: string;
  description?: string;
  icon?: string;
};

export type UserBadge = {
  id: string;
  userId: string;
  badgeId: string;
  period?: string;
  note?: string;
  awardedBy?: string;
  awardedAt: string;
  badge: Badge;
};

export type OnboardingTemplateItem = {
  id: string;
  label: string;
  order: number;
};

export type UserOnboardingItem = {
  id: string;
  userId: string;
  label: string;
  order: number;
  done: boolean;
  completedAt?: string;
};

export type Availability = {
  id: string;
  userId: string;
  date: string;
  type: 'AVAILABLE' | 'UNAVAILABLE';
  note?: string;
  user?: { id: string; firstName: string; lastName: string };
};
