import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { Student } from '../models/student.model';

const STORAGE_KEY = 'marfo-students';

@Injectable({ providedIn: 'root' })
export class StudentService {
  private readonly studentsSubject: BehaviorSubject<Student[]>;
  readonly students$: Observable<Student[]>;
  private readonly isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
    const storedStudents = this.isBrowser ? localStorage.getItem(STORAGE_KEY) : null;
    this.studentsSubject = new BehaviorSubject<Student[]>(this.parseStudents(storedStudents));
    this.students$ = this.studentsSubject.asObservable();
  }

  get students(): Student[] {
    return this.studentsSubject.value;
  }

  getById(id: string): Student | undefined {
    return this.students.find((student) => student.id.trim().toUpperCase() === id.trim().toUpperCase());
  }

  getNextSuggestedId(): string {
    const list = this.students;
    if (list.length === 0) return 'STU001';
    const numbers = list
      .map((s) => {
        const match = s.id.match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const maxNum = numbers.length ? Math.max(...numbers) : 0;
    return `STU${String(maxNum + 1).padStart(3, '0')}`;
  }

  addStudent(studentData: Omit<Student, 'fingerprintEnrolled' | 'fingerprintStatus' | 'status'> & { status?: 'active' | 'inactive' }): Student {
    const existing = this.getById(studentData.id);
    if (existing) {
      throw new Error(`Student with ID ${studentData.id} already exists`);
    }

    const newStudent: Student = {
      ...studentData,
      id: studentData.id.trim().toUpperCase(),
      fingerprintEnrolled: false,
      fingerprintStatus: 'Not Enrolled',
      status: studentData.status ?? 'active',
    };

    const updated = [...this.students, newStudent];
    this.studentsSubject.next(updated);
    this.persist();
    return newStudent;
  }

  updateStudent(student: Student): void {
    const updated = this.students.map((s) => (s.id === student.id ? student : s));
    this.studentsSubject.next(updated);
    this.persist();
  }

  deleteStudent(id: string): void {
    const updated = this.students.filter((s) => s.id !== id);
    this.studentsSubject.next(updated);
    this.persist();
  }

  markEnrolled(studentId: string, templateId: string): void {
    const updated = this.students.map((student) =>
      student.id.toUpperCase() === studentId.toUpperCase()
        ? {
          ...student,
          fingerprintEnrolled: true,
          fingerprintStatus: 'Enrolled' as const,
          fingerprintTemplateId: templateId,
        }
        : student
    );
    this.studentsSubject.next(updated);
    this.persist();
  }

  clearAllStudents(): void {
    this.studentsSubject.next([]);
    this.persist();
  }

  private parseStudents(value: string | null): Student[] {
    if (!value) return []; // Completely without dummy data by default
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as Student[]) : [];
    } catch {
      return [];
    }
  }

  private persist(): void {
    if (this.isBrowser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.students));
    }
  }
}
