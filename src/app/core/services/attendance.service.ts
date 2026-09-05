import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { Attendance, AttendanceConfig, AttendanceStatus } from '../models/attendance.model';

const ATTENDANCE_STORAGE_KEY = 'marfo-attendance';
const CONFIG_STORAGE_KEY = 'marfo-attendance-config';

const DEFAULT_CONFIG: AttendanceConfig = {
  expectedCheckIn: '09:00',
  lateAfter: '09:15',
  halfDayHours: 4,
  fullDayHours: 8,
};

@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private configValue: AttendanceConfig = DEFAULT_CONFIG;
  private readonly recordsSubject: BehaviorSubject<Attendance[]>;
  readonly records$: Observable<Attendance[]>;
  private readonly isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);

    if (this.isBrowser) {
      const storedConfig = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (storedConfig) {
        try {
          this.configValue = { ...DEFAULT_CONFIG, ...JSON.parse(storedConfig) };
        } catch {
          this.configValue = DEFAULT_CONFIG;
        }
      }
    }

    const storedRecords = this.isBrowser ? localStorage.getItem(ATTENDANCE_STORAGE_KEY) : null;
    this.recordsSubject = new BehaviorSubject<Attendance[]>(this.parseRecords(storedRecords));
    this.records$ = this.recordsSubject.asObservable();
  }

  get config(): AttendanceConfig {
    return this.configValue;
  }

  get records(): Attendance[] {
    return this.recordsSubject.value;
  }

  updateConfig(newConfig: Partial<AttendanceConfig>): void {
    this.configValue = { ...this.configValue, ...newConfig };
    if (this.isBrowser) {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(this.configValue));
    }
  }

  getTodayKey(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getCurrentTimeString(): string {
    const d = new Date();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  getForStudentToday(studentId: string): Attendance | undefined {
    return this.getForStudentOnDate(studentId, this.getTodayKey());
  }

  getForStudentOnDate(studentId: string, dateStr: string): Attendance | undefined {
    return this.records.find(
      (record) => record.studentId.toUpperCase() === studentId.toUpperCase() && record.date === dateStr
    );
  }

  checkIn(studentId: string, customTime?: string): Attendance {
    const date = this.getTodayKey();
    const time = customTime || this.getCurrentTimeString();
    const existing = this.getForStudentToday(studentId);

    if (existing?.checkIn) {
      return existing;
    }

    const status = this.calculateStatus(time, 0);
    const record: Attendance = existing
      ? { ...existing, checkIn: time, status }
      : {
          id: `ATT${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          studentId: studentId.toUpperCase(),
          date,
          checkIn: time,
          status,
        };

    this.saveRecord(record);
    return record;
  }

  checkOut(studentId: string, customTime?: string): Attendance | undefined {
    const existing = this.getForStudentToday(studentId);
    if (!existing || !existing.checkIn || existing.checkOut) {
      return existing;
    }

    const time = customTime || this.getCurrentTimeString();
    const minutes = this.diffMinutes(existing.checkIn, time);
    const validMinutes = Math.max(0, minutes);
    const status = this.calculateStatus(existing.checkIn, validMinutes);

    const updated: Attendance = {
      ...existing,
      checkOut: time,
      workingMinutes: validMinutes,
      status,
    };

    this.saveRecord(updated);
    return updated;
  }

  markAbsent(studentId: string, dateStr?: string): Attendance {
    const date = dateStr || this.getTodayKey();
    const existing = this.getForStudentOnDate(studentId, date);
    if (existing) {
      const updated: Attendance = { ...existing, status: 'absent', checkIn: undefined, checkOut: undefined, workingMinutes: 0 };
      this.saveRecord(updated);
      return updated;
    }

    const record: Attendance = {
      id: `ATT${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      studentId: studentId.toUpperCase(),
      date,
      status: 'absent',
    };
    this.saveRecord(record);
    return record;
  }

  calculateStatus(checkIn: string, workingMinutes: number): AttendanceStatus {
    // If working hours are recorded and below halfDayHours
    if (workingMinutes > 0 && workingMinutes < this.config.halfDayHours * 60) {
      return 'half-day';
    }

    // Compare checkIn with lateAfter/expectedCheckIn
    if (checkIn > this.config.lateAfter || checkIn > this.config.expectedCheckIn) {
      return 'late';
    }

    return 'present';
  }

  formatWorkingHours(minutes?: number): string {
    if (minutes === undefined || minutes === null || minutes < 0) return '—';
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs}h ${mins}m`;
  }

  diffMinutes(start: string, end: string): number {
    const [sH, sM] = start.split(':').map(Number);
    const [eH, eM] = end.split(':').map(Number);
    if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return 0;
    return eH * 60 + eM - (sH * 60 + sM);
  }

  clearAllAttendance(): void {
    this.recordsSubject.next([]);
    this.persist();
  }

  private saveRecord(record: Attendance): void {
    const list = this.records;
    const exists = list.some((item) => item.id === record.id);
    const updated = exists ? list.map((item) => (item.id === record.id ? record : item)) : [record, ...list];
    this.recordsSubject.next(updated);
    this.persist();
  }

  private parseRecords(value: string | null): Attendance[] {
    if (!value) return []; // Zero dummy data by default
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as Attendance[]) : [];
    } catch {
      return [];
    }
  }

  private persist(): void {
    if (this.isBrowser) {
      localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(this.records));
    }
  }
}
