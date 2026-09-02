export type AttendanceStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';

export type AttendanceLocation = {
  latitude: number;
  longitude: number;
  distanceMeters?: number;
};

export type Attendance = {
  id: string;
  date: string;
  agent: {
    id: string;
    name: string;
  };
  site: {
    id: string;
    name: string;
  };
  interventionId?: string;
  checkInTime?: string;
  checkOutTime?: string;
  plannedStart?: string;
  plannedEnd?: string;
  durationMinutes?: number;
  status: AttendanceStatus;
  manual: boolean;
  createdBy: string;
  note?: string;
  gps: {
    checkIn?: AttendanceLocation;
    checkOut?: AttendanceLocation;
  };
  checkInPhoto?: string;
  checkOutPhoto?: string;
};

export type AttendanceAnomaly =
  | {
      type: 'SUSPICIOUS_DURATION';
      attendanceId: string;
      userId: string;
      agentName: string;
      siteName: string;
      date: string;
      durationMinutes: number;
      siteAverageMinutes: number;
    }
  | {
      type: 'REPEATED_OUTSIDE_ZONE';
      userId: string;
      agentName: string;
      occurrences: number;
    };

export type LiveMapEntry = {
  userId: string;
  agentName: string;
  interventionId: string;
  siteId: string;
  siteName: string;
  latitude: number | null;
  longitude: number | null;
  lastSeenAt: string;
};
