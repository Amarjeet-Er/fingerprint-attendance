export type AttendanceStatus = 'present' | 'late' | 'half-day' | 'absent';

export interface Attendance {
  id: string;
  studentId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  workingMinutes?: number;
  status: AttendanceStatus;
}

export interface AttendanceConfig {
  expectedCheckIn: string;
  lateAfter: string;
  halfDayHours: number;
  fullDayHours: number;
}
