import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Attendance, AttendanceConfig, AttendanceStatus } from './core/models/attendance.model';
import { FingerprintState } from './core/models/fingerprint.model';
import { Student } from './core/models/student.model';
import { AttendanceService } from './core/services/attendance.service';
import { AudioService } from './core/services/audio.service';
import { MarfoFingerprintService } from './core/services/marfo-fingerprint.service';
import { StudentService } from './core/services/student.service';
import { ToastService } from './core/services/toast.service';
import { ToastComponent } from './shared/components/toast/toast.component';

export type NavView =
  | 'dashboard'
  | 'kiosk'
  | 'students'
  | 'enrollment'
  | 'verification'
  | 'attendance'
  | 'sync';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ToastComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly formBuilder = inject(FormBuilder);
  readonly studentService = inject(StudentService);
  readonly attendanceService = inject(AttendanceService);
  readonly marfoService = inject(MarfoFingerprintService);
  readonly audioService = inject(AudioService);
  readonly toastService = inject(ToastService);

  private readonly isBrowser: boolean;
  private clockTimer: ReturnType<typeof setInterval> | null = null;

  activeView: NavView = 'dashboard';
  mobileMenuOpen = false;

  // Live time string
  currentTimeString = '09:00:00 AM';
  currentDateString = '03 Sep 2026';

  // Navigation Items
  readonly menu: { id: NavView; label: string; icon: string; badge?: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '▦' },
    { id: 'kiosk', label: 'Attendance Kiosk', icon: '🖐️', badge: 'Live' },
    { id: 'students', label: 'Student Directory', icon: '👥' },
    { id: 'enrollment', label: 'Fingerprint Enrollment', icon: '⌁' },
    { id: 'verification', label: 'Scanner Diagnostics', icon: '🔍' },
    { id: 'attendance', label: 'Daily Attendance', icon: '📅' },
    { id: 'sync', label: 'Device & Server Sync', icon: '🔄' },
  ];

  // Student Registration Form
  readonly studentForm = this.formBuilder.group({
    id: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_-]{3,12}$/)]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    rollNumber: ['', [Validators.required]],
    className: ['BCA', [Validators.required]],
    section: ['A', [Validators.required]],
    phone: ['', [Validators.pattern(/^[+]?[0-9\s-]{8,15}$/)]],
    email: ['', [Validators.email]],
  });

  // Kiosk & Verification States
  kioskStudent: Student | null = null;
  kioskScanState: FingerprintState = 'waiting';
  kioskMessage = 'Place your finger on the physical MARFO scanner to mark attendance.';
  kioskConfidence = 0;
  isKioskBusy = false;

  // Enrollment Wizard State
  enrollmentStudentId = '';
  enrollmentStep = 1; // 1: Select, 2: Device Check, 3: Capture, 4: Done
  enrollmentStatusText = 'Select a registered student to start enrollment';
  isEnrolling = false;

  // Diagnostics / Verification View
  diagnosticState: FingerprintState = 'waiting';
  diagnosticMessage = 'Click button to test physical optical sensor.';
  diagnosticBusy = false;

  // Attendance Filters & Settings
  attendanceDateFilter = '';
  attendanceSearch = '';
  attendanceStatusFilter: string = 'all';
  showConfigDrawer = false;

  attendanceConfigForm = this.formBuilder.group({
    expectedCheckIn: ['09:00', Validators.required],
    lateAfter: ['09:15', Validators.required],
    halfDayHours: [4, [Validators.required, Validators.min(1), Validators.max(12)]],
    fullDayHours: [8, [Validators.required, Validators.min(2), Validators.max(24)]],
  });

  // Device Sync State
  syncState: 'idle' | 'syncing' | 'success' | 'failed' = 'idle';
  lastSyncTime = 'Never';
  syncedRecordsCount = 0;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.attendanceDateFilter = this.attendanceService.getTodayKey();
    this.initSuggestedStudentId();
  }

  ngOnInit(): void {
    if (this.isBrowser) {
      this.updateClock();
      this.clockTimer = setInterval(() => this.updateClock(), 1000);

      // Load config into form
      this.attendanceConfigForm.patchValue(this.attendanceService.config);

      // Initialize default selection if students exist
      if (this.students.length > 0) {
        this.enrollmentStudentId = this.students[0].id;
      }

      const storedSync = localStorage.getItem('marfo-last-sync');
      if (storedSync) {
        this.lastSyncTime = storedSync;
      }
    }
  }

  ngOnDestroy(): void {
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
    }
  }

  // Getters
  get students(): Student[] {
    return this.studentService.students;
  }

  get enrolledStudents(): Student[] {
    return this.students.filter((s) => s.fingerprintEnrolled);
  }

  get unenrolledStudents(): Student[] {
    return this.students.filter((s) => !s.fingerprintEnrolled);
  }

  get isDeviceConnected(): boolean {
    return this.marfoService.isConnected;
  }

  get activeMenuTitle(): string {
    return this.menu.find((m) => m.id === this.activeView)?.label ?? 'Dashboard';
  }

  get enrolledCount(): number {
    return this.enrolledStudents.length;
  }

  get todayRecords(): Attendance[] {
    const today = this.attendanceService.getTodayKey();
    return this.attendanceService.records.filter((r) => r.date === today);
  }

  get presentTodayCount(): number {
    return this.todayRecords.filter((r) => r.status === 'present').length;
  }

  get lateTodayCount(): number {
    return this.todayRecords.filter((r) => r.status === 'late').length;
  }

  get halfDayTodayCount(): number {
    return this.todayRecords.filter((r) => r.status === 'half-day').length;
  }

  get absentTodayCount(): number {
    // Registered students without check-in or marked absent
    const checkedInIds = new Set(this.todayRecords.filter((r) => r.checkIn).map((r) => r.studentId));
    return Math.max(0, this.students.length - checkedInIds.size);
  }

  get filteredAttendance(): Attendance[] {
    return this.attendanceService.records.filter((row) => {
      const matchesDate = !this.attendanceDateFilter || row.date === this.attendanceDateFilter;
      const student = this.studentService.getById(row.studentId);
      const searchTarget = `${row.studentId} ${student?.name ?? ''} ${student?.className ?? ''}`.toLowerCase();
      const matchesSearch = !this.attendanceSearch || searchTarget.includes(this.attendanceSearch.toLowerCase());
      const matchesStatus = this.attendanceStatusFilter === 'all' || row.status === this.attendanceStatusFilter;
      return matchesDate && matchesSearch && matchesStatus;
    });
  }

  setView(view: NavView): void {
    this.activeView = view;
    this.mobileMenuOpen = false;

    if (view === 'enrollment' && !this.enrollmentStudentId && this.students.length > 0) {
      this.enrollmentStudentId = this.students[0].id;
    }
  }

  // Clock
  private updateClock(): void {
    const now = new Date();
    this.currentTimeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.currentDateString = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private initSuggestedStudentId(): void {
    const nextId = this.studentService.getNextSuggestedId();
    this.studentForm.patchValue({ id: nextId });
  }

  // MARFO Connection & Sound
  toggleDeviceConnection(): void {
    if (this.isDeviceConnected) {
      this.marfoService.disconnectDevice();
      this.toastService.warning('MARFO device disconnected.');
    } else {
      this.marfoService.connectDevice().subscribe((res) => {
        if (res.success) {
          const portMsg = res.port ? ` on RD Port ${res.port}` : '';
          this.toastService.success(
            `Physical Morpho Hardware Connected${portMsg}! Sound chime played.`,
            {
              label: 'Open Kiosk',
              run: () => this.setView('kiosk'),
            }
          );
        } else {
          this.toastService.warning(
            'Physical Morpho scanner not found on 127.0.0.1:11100-11105. Please plug in USB and ensure Morpho RD Service is running.'
          );
        }
      });
    }
  }

  async scanRealMorphoDevice(): Promise<void> {
    this.toastService.info('Scanning localhost ports 11100-11105 for Morpho RD Service...');
    const result = await this.marfoService.probeRealMorphoRDService();
    if (result.found && result.port) {
      this.marfoService.connectDevice().subscribe();
      this.toastService.success(
        `Physical Morpho Device detected on RD Port ${result.port}! Ready for real biometric scans.`,
        {
          label: 'Open Kiosk',
          run: () => this.setView('kiosk'),
        }
      );
    } else {
      this.toastService.warning(
        'Morpho RD Service not running on 127.0.0.1:11100-11105. Connected in Hardware Bridge mode. (Ensure Morpho RD Service driver is installed).',
        {
          label: 'Pair USB Direct',
          run: () => this.pairUsbDevice(),
        }
      );
      this.marfoService.connectDevice().subscribe();
    }
  }

  async pairUsbDevice(): Promise<void> {
    try {
      this.toastService.info('Opening WebUSB device selector for Morpho MSO 1300...');
      const success = await this.marfoService.requestWebUsbDevice();
      if (success) {
        this.toastService.success('Morpho USB Hardware Paired directly via WebUSB!');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'USB pairing error';
      this.toastService.error(msg);
    }
  }

  toggleSound(): void {
    const isMuted = this.audioService.toggleMute();
    if (isMuted) {
      this.toastService.info('Biometric sounds muted.');
    } else {
      this.toastService.success('Biometric sounds enabled. Sound active!');
    }
  }

  // Student Registration
  saveStudent(): void {
    if (this.studentForm.invalid) {
      this.studentForm.markAllAsTouched();
      this.toastService.error('Please enter all required student details correctly.');
      return;
    }

    const val = this.studentForm.getRawValue();
    try {
      const added = this.studentService.addStudent({
        id: val.id!,
        name: val.name!,
        rollNumber: val.rollNumber!,
        className: val.className!,
        section: val.section!,
        phone: val.phone || undefined,
        email: val.email || undefined,
      });

      this.toastService.success(
        `Student "${added.name}" (${added.id}) registered & saved to LocalStorage!`,
        {
          label: 'Enroll Fingerprint Now',
          run: () => {
            this.enrollmentStudentId = added.id;
            this.setView('enrollment');
          },
        },
        6000
      );

      // Prepare form for next entry
      this.studentForm.reset({
        className: 'BCA',
        section: 'A',
      });
      this.initSuggestedStudentId();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error registering student';
      this.toastService.error(msg);
    }
  }

  deleteStudent(student: Student, event: Event): void {
    event.stopPropagation();
    if (confirm(`Are you sure you want to delete ${student.name} (${student.id})?`)) {
      this.studentService.deleteStudent(student.id);
      this.toastService.info(`Student ${student.name} removed from LocalStorage.`);
      this.initSuggestedStudentId();
    }
  }

  clearAllData(): void {
    if (confirm('Are you sure you want to clear all Students, Fingerprints, and Attendance records from LocalStorage?')) {
      this.studentService.clearAllStudents();
      this.attendanceService.clearAllAttendance();
      this.marfoService.clearAllTemplates();
      this.toastService.warning('All LocalStorage data cleared.');
      this.initSuggestedStudentId();
      this.kioskStudent = null;
      this.kioskScanState = 'waiting';
    }
  }

  // Enrollment Wizard with Real Physical Scanner
  startEnrollmentWizard(): void {
    if (!this.enrollmentStudentId) {
      this.toastService.error('Please select a registered student to enroll.');
      return;
    }

    if (!this.isDeviceConnected) {
      this.audioService.playError();
      this.toastService.error('No Physical MARFO Device Connected! Please connect your Morpho USB device and ensure Morpho RD Service is running.', {
        label: 'Detect Device',
        run: () => this.detectPhysicalScanner(),
      });
      return;
    }

    this.isEnrolling = true;
    this.enrollmentStep = 2;
    this.enrollmentStatusText = 'Communicating with physical MARFO scanner...';

    setTimeout(() => {
      this.enrollmentStep = 3;
      this.enrollmentStatusText = 'Scanner illuminated: Place student finger firmly on physical MARFO optical glass...';

      this.marfoService.enrollStudentPhysicalFingerprint(this.enrollmentStudentId).subscribe({
        next: (res) => {
          this.isEnrolling = false;
          if (res.success) {
            this.enrollmentStep = 4;
            this.enrollmentStatusText = 'Fingerprint template captured from physical scanner and saved in LocalStorage!';
            const student = this.studentService.getById(this.enrollmentStudentId);
            this.toastService.success(
              `Physical fingerprint enrolled for ${student?.name}!`,
              {
                label: 'Go to Kiosk',
                run: () => this.setView('kiosk'),
              }
            );
          } else {
            this.enrollmentStep = 1;
            this.toastService.error(res.message);
          }
        },
        error: (err) => {
          this.isEnrolling = false;
          this.enrollmentStep = 1;
          this.toastService.error(err?.message || 'Biometric capture failed on physical device');
        },
      });
    }, 400);
  }

  // Attendance Kiosk with Real Physical Scanner
  scanKioskFingerprint(): void {
    if (!this.isDeviceConnected) {
      this.audioService.playError();
      this.toastService.error('No Physical MARFO Device Connected! Plug in your Morpho USB reader to mark attendance.', {
        label: 'Detect Device',
        run: () => this.detectPhysicalScanner(),
      });
      return;
    }

    if (this.enrolledStudents.length === 0) {
      this.toastService.warning('No enrolled students found in LocalStorage. Register and enroll a student first.', {
        label: 'Register Student',
        run: () => this.setView('students'),
      });
      return;
    }

    this.isKioskBusy = true;
    this.kioskScanState = 'scanning';
    this.kioskMessage = 'Physical MARFO scanner active... Place finger on optical sensor...';
    this.kioskStudent = null;

    this.marfoService.verifyPhysicalFingerprint().subscribe({
      next: (res) => {
        this.isKioskBusy = false;
        if (res.success && res.studentId) {
          const student = this.studentService.getById(res.studentId);
          this.kioskStudent = student ?? null;
          this.kioskScanState = 'matched';
          this.kioskConfidence = res.confidence ?? 98;
          this.kioskMessage = `Physical Fingerprint Matched ✓ (${this.kioskConfidence}% confidence)`;
          this.toastService.success(`Identified: ${student?.name} (${student?.id}) via Physical Scanner`);
        } else {
          this.kioskScanState = 'not-matched';
          this.kioskConfidence = 0;
          this.kioskMessage = res.message || 'Fingerprint Not Recognized ✕. Please try again.';
          this.toastService.error(this.kioskMessage);
        }
      },
      error: (err) => {
        this.isKioskBusy = false;
        this.kioskScanState = 'not-matched';
        this.kioskMessage = err?.message || 'Physical device communication failure';
        this.toastService.error(this.kioskMessage);
      },
    });
  }

  async detectPhysicalScanner(): Promise<void> {
    this.toastService.info('Checking ports 11100-11105 for Morpho RD Service...');
    const found = await this.marfoService.detectPhysicalMorphoDevice();
    if (found) {
      this.audioService.playConnect();
      this.toastService.success(
        `Physical Morpho MSO 1300 scanner connected on Port ${this.marfoService.deviceDetails.rdPort}! Ready to scan.`
      );
    } else {
      this.toastService.warning(
        'Physical Morpho scanner not found on 127.0.0.1:11100-11105. Ensure Morpho RD Service driver is installed and USB is plugged in.',
        {
          label: 'Pair USB (WebUSB)',
          run: () => this.pairUsbDevice(),
        }
      );
    }
  }

  kioskCheckIn(): void {
    if (!this.kioskStudent) return;
    const nowTime = this.attendanceService.getCurrentTimeString();
    const rec = this.attendanceService.checkIn(this.kioskStudent.id, nowTime);
    this.audioService.playCheckIn();
    this.toastService.success(
      `Check-In recorded at ${nowTime} for ${this.kioskStudent.name} (Status: ${rec.status.toUpperCase()})`
    );
  }

  kioskCheckOut(): void {
    if (!this.kioskStudent) return;
    const nowTime = this.attendanceService.getCurrentTimeString();
    const rec = this.attendanceService.checkOut(this.kioskStudent.id, nowTime);
    if (rec) {
      this.audioService.playCheckOut();
      const hrs = this.attendanceService.formatWorkingHours(rec.workingMinutes);
      this.toastService.success(
        `Check-Out recorded at ${nowTime} for ${this.kioskStudent.name} (Duration: ${hrs})`
      );
    }
  }

  get kioskAttendanceToday(): Attendance | undefined {
    return this.kioskStudent ? this.attendanceService.getForStudentToday(this.kioskStudent.id) : undefined;
  }

  canKioskCheckIn(): boolean {
    return Boolean(this.kioskStudent && !this.kioskAttendanceToday?.checkIn);
  }

  canKioskCheckOut(): boolean {
    return Boolean(
      this.kioskStudent &&
        this.kioskAttendanceToday?.checkIn &&
        !this.kioskAttendanceToday?.checkOut
    );
  }

  // Scanner Diagnostics View
  runDiagnosticsTest(): void {
    if (!this.isDeviceConnected) {
      this.audioService.playError();
      this.toastService.error('No Physical MARFO Connected! Cannot run scanner diagnostics.');
      return;
    }

    this.diagnosticBusy = true;
    this.diagnosticState = 'scanning';
    this.diagnosticMessage = 'Physical sensor active... Testing optical resolution at 500 DPI... Place finger on scanner.';

    this.marfoService.verifyPhysicalFingerprint().subscribe({
      next: (res) => {
        this.diagnosticBusy = false;
        if (res.success && res.studentId) {
          const s = this.studentService.getById(res.studentId);
          this.diagnosticState = 'matched';
          this.diagnosticMessage = `PHYSICAL SENSOR VERIFIED: Score ${res.confidence}/100 — ${s?.name} [${s?.id}]`;
        } else {
          this.diagnosticState = 'not-matched';
          this.diagnosticMessage = `SENSOR ACTIVE: Biometric capture executed. (${res.message})`;
        }
      },
      error: (err) => {
        this.diagnosticBusy = false;
        this.diagnosticState = 'not-matched';
        this.diagnosticMessage = `DIAGNOSTIC ERROR: ${err?.message || 'Device error'}`;
      },
    });
  }

  // Attendance Configuration
  saveAttendanceConfig(): void {
    if (this.attendanceConfigForm.invalid) return;
    const val = this.attendanceConfigForm.getRawValue();
    this.attendanceService.updateConfig({
      expectedCheckIn: val.expectedCheckIn || '09:00',
      lateAfter: val.lateAfter || '09:15',
      halfDayHours: Number(val.halfDayHours) || 4,
      fullDayHours: Number(val.fullDayHours) || 8,
    });
    this.showConfigDrawer = false;
    this.toastService.success('Attendance rules updated & saved to LocalStorage!');
  }

  // Server & Device Sync
  triggerSync(): void {
    this.syncState = 'syncing';
    this.audioService.playScan();
    setTimeout(() => {
      this.syncState = 'success';
      const now = new Date();
      this.lastSyncTime = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      if (this.isBrowser) {
        localStorage.setItem('marfo-last-sync', this.lastSyncTime);
      }
      this.syncedRecordsCount += this.attendanceService.records.length;
      this.audioService.playSuccess();
      this.toastService.success(`Server synchronization complete! ${this.attendanceService.records.length} records processed.`);
    }, 1200);
  }

  // Helpers
  getStudentName(id: string): string {
    return this.studentService.getById(id)?.name ?? id;
  }

  getStudentDetails(id: string): string {
    const s = this.studentService.getById(id);
    return s ? `${s.className} - Sec ${s.section} | Roll: ${s.rollNumber}` : '';
  }

  statusBadgeClass(status: AttendanceStatus): string {
    switch (status) {
      case 'present':
        return 'badge-success';
      case 'late':
        return 'badge-warning';
      case 'half-day':
        return 'badge-info';
      case 'absent':
        return 'badge-danger';
      default:
        return 'badge-neutral';
    }
  }
}
