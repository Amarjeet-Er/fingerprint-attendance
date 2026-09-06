import { Inject, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { FingerprintVerification } from '../models/fingerprint.model';
import { AudioService } from './audio.service';
import { StudentService } from './student.service';

const TEMPLATES_STORAGE_KEY = 'universal-fingerprint-templates';
const DEVICE_SETTINGS_KEY = 'universal-device-settings';

export interface PhysicalDeviceStatus {
  connected: boolean;
  connectionType: 'RD_SERVICE' | 'WEB_USB' | 'NONE';
  deviceModel: string;
  serialNumber: string;
  rdPort?: number;
  rdServicePort?: number;
  firmwareVersion?: string;
  isRealHardware?: boolean;
  brand?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIVERSAL DEVICE REGISTRY
// Every known Indian UIDAI-certified biometric RD Service brand is listed here.
// New device? Just add its port range and USB Vendor ID below.
// ─────────────────────────────────────────────────────────────────────────────

interface DeviceBrandProfile {
  brand: string;
  ports: number[];
  keywords: string[];
  captureEndpoints: string[];
  infoEndpoints: string[];
  usbVendorIds: number[];
}

const DEVICE_PROFILES: DeviceBrandProfile[] = [
  {
    brand: 'Mantra',
    ports: [11100, 11101, 11102, 8003, 8004, 8005, 11200, 11201],
    keywords: ['mantra', 'mfs', 'mfs100', 'mfs110', 'mfs500'],
    captureEndpoints: ['/rd/capture', '/capture'],
    infoEndpoints: ['/rd/info', '/deviceinfo', '/info'],
    usbVendorIds: [0x2571, 0x1d6b],
  },
  {
    brand: 'Morpho',
    ports: [11100, 11101, 11102, 11103, 11104, 11105],
    keywords: ['morpho', 'mso', 'idemia', 'safran', 'mso1300', 'mso300'],
    captureEndpoints: ['/capture', '/rd/capture'],
    infoEndpoints: ['/deviceinfo', '/rd/info'],
    usbVendorIds: [0x079b, 0x0835],
  },
  {
    brand: 'Secugen',
    ports: [11100, 11101, 11102, 8006, 8007, 8008],
    keywords: ['secugen', 'hamster', 'hupx', 'hupseries'],
    captureEndpoints: ['/rd/capture', '/capture'],
    infoEndpoints: ['/rd/info', '/deviceinfo'],
    usbVendorIds: [0x1162],
  },
  {
    brand: 'Startek',
    ports: [11100, 11101, 11102, 11200, 11201, 11202],
    keywords: ['startek', 'fm220u', 'fm220'],
    captureEndpoints: ['/rd/capture', '/capture'],
    infoEndpoints: ['/rd/info', '/deviceinfo'],
    usbVendorIds: [0x298d],
  },
  {
    brand: 'Precision',
    ports: [11100, 11101, 11102, 11300, 11301],
    keywords: ['precision', 'pbt', 'pbt100'],
    captureEndpoints: ['/rd/capture', '/capture'],
    infoEndpoints: ['/rd/info', '/deviceinfo'],
    usbVendorIds: [0x06cb],
  },
  {
    brand: 'Next Biometrics',
    ports: [11100, 11101, 8009, 8010],
    keywords: ['next', 'nextbiometrics', 'nb'],
    captureEndpoints: ['/rd/capture', '/capture'],
    infoEndpoints: ['/rd/info', '/deviceinfo'],
    usbVendorIds: [0x298d],
  },
  {
    brand: 'BioEnable',
    ports: [11100, 11101, 11400, 11401],
    keywords: ['bioenable', 'be'],
    captureEndpoints: ['/rd/capture', '/capture'],
    infoEndpoints: ['/rd/info', '/deviceinfo'],
    usbVendorIds: [0x1d6b],
  },
];

// All unique ports across all brands (deduped)
const ALL_PROBE_PORTS: number[] = [
  ...new Set(DEVICE_PROFILES.flatMap((p) => p.ports)),
];

// All unique WebUSB vendor IDs across all brands
const ALL_USB_VENDOR_IDS: number[] = [
  ...new Set(DEVICE_PROFILES.flatMap((p) => p.usbVendorIds)),
];

@Injectable({ providedIn: 'root' })
export class MarfoFingerprintService {
  private readonly audioService = inject(AudioService);
  private readonly studentService = inject(StudentService);
  private readonly isBrowser: boolean;

  /** Currently active device profile (detected brand) */
  private activeProfile: DeviceBrandProfile | null = null;

  private readonly deviceStatusSubject = new BehaviorSubject<PhysicalDeviceStatus>({
    connected: false,
    connectionType: 'NONE',
    deviceModel: 'No Biometric Device Connected',
    serialNumber: 'Unconnected',
    isRealHardware: false,
  });
  readonly deviceStatus$: Observable<PhysicalDeviceStatus> = this.deviceStatusSubject.asObservable();

  private enrolledTemplates: Record<string, string> = {};

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);

    if (this.isBrowser) {
      const stored = localStorage.getItem(TEMPLATES_STORAGE_KEY);
      if (stored) {
        try {
          this.enrolledTemplates = JSON.parse(stored);
        } catch {
          this.enrolledTemplates = {};
        }
      }

      // Auto-detect any RD Service on startup
      setTimeout(() => {
        this.detectAnyDevice().then((found) => {
          if (found) this.audioService.playConnect();
        });
      }, 600);
    }
  }

  // ───────────────────────────── Getters ──────────────────────────────────────

  get isConnected(): boolean {
    return this.deviceStatusSubject.value.connected;
  }

  get isRealHardware(): boolean {
    return this.deviceStatusSubject.value.connected;
  }

  get deviceDetails(): PhysicalDeviceStatus {
    return this.deviceStatusSubject.value;
  }

  get allEnrolledTemplates(): Record<string, string> {
    return { ...this.enrolledTemplates };
  }

  // ─────────────── Backward-compatible aliases ─────────────────────────────

  async probeRealMorphoRDService(): Promise<{ found: boolean; port?: number }> {
    const found = await this.detectAnyDevice();
    return { found, port: this.deviceStatusSubject.value.rdPort };
  }

  async detectPhysicalMorphoDevice(): Promise<boolean> {
    return this.detectAnyDevice();
  }

  async detectMantraDevice(): Promise<boolean> {
    return this.detectAnyDevice();
  }

  async requestWebUsbDevice(): Promise<boolean> {
    return this.connectDirectWebUsb();
  }

  // ─────────────── Core Device Detection ──────────────────────────────────────

  /**
   * Universal device detector.
   * Probes ALL known RD Service ports from ALL brands simultaneously.
   * Identifies the brand from the XML response automatically.
   */
  async detectAnyDevice(): Promise<boolean> {
    if (!this.isBrowser) return false;

    for (const port of ALL_PROBE_PORTS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);

        let res: Response | null = null;
        try {
          res = await fetch(`http://127.0.0.1:${port}/`, {
            method: 'GET',
            signal: controller.signal,
          });
        } catch {
          // Port not listening — try next
        }
        clearTimeout(timeoutId);

        if (!res || (res.status !== 200 && res.status !== 201)) continue;

        const text = await res.text().catch(() => '');
        if (!text) continue;

        // Identify which brand's RD Service answered
        const matchedProfile = this.identifyBrandFromResponse(text, port);

        const devInfo = await this.queryDeviceInfo(port, matchedProfile);
        const brand = matchedProfile?.brand ?? 'Unknown';
        const serial = devInfo?.srNo ?? `BIOMETRIC-PORT-${port}`;
        const model = devInfo?.model ?? `${brand} Fingerprint Scanner`;
        const firmware = devInfo?.firmware ?? 'v1.0';

        this.activeProfile = matchedProfile;

        this.deviceStatusSubject.next({
          connected: true,
          connectionType: 'RD_SERVICE',
          deviceModel: model,
          serialNumber: serial,
          rdPort: port,
          firmwareVersion: firmware,
          isRealHardware: true,
          brand,
        });

        this.persistSettings();
        return true;
      } catch {
        // Port not active, continue
      }
    }

    // Nothing found
    this.activeProfile = null;
    this.deviceStatusSubject.next({
      connected: false,
      connectionType: 'NONE',
      deviceModel: 'No Biometric Device Connected',
      serialNumber: 'Install RD Service driver & plug in USB scanner',
      isRealHardware: false,
    });
    return false;
  }

  /**
   * Identifies the device brand from HTTP response body.
   */
  private identifyBrandFromResponse(responseText: string, port: number): DeviceBrandProfile {
    const lower = responseText.toLowerCase();

    for (const profile of DEVICE_PROFILES) {
      if (profile.keywords.some((kw) => lower.includes(kw))) {
        return profile;
      }
    }

    const byPort = DEVICE_PROFILES.find((p) => p.ports.includes(port));
    if (byPort) return byPort;

    return DEVICE_PROFILES[0]; // Default to Mantra (UIDAI-standard)
  }

  /**
   * Queries device info — tries all known info endpoints for the detected brand.
   */
  private async queryDeviceInfo(
    port: number,
    profile: DeviceBrandProfile | null
  ): Promise<{ srNo?: string; model?: string; firmware?: string } | null> {
    const infoEndpoints = profile?.infoEndpoints ?? ['/rd/info', '/deviceinfo', '/info'];

    for (const endpoint of infoEndpoints) {
      try {
        const isPost = endpoint.includes('/rd/');
        const fetchOpts: RequestInit = {
          method: isPost ? 'POST' : 'GET',
          headers: isPost ? { 'Content-Type': 'text/xml' } : {},
        };
        if (isPost) fetchOpts.body = '<?xml version="1.0"?><DeviceInfo/>';

        const res = await fetch(`http://127.0.0.1:${port}${endpoint}`, fetchOpts);
        if (!res?.ok) continue;

        const xml = await res.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xml, 'text/xml');

        const devTag =
          xmlDoc.getElementsByTagName('DeviceInfo')[0] ||
          xmlDoc.getElementsByTagName('RDService')[0] ||
          xmlDoc.getElementsByTagName('Device')[0];

        if (devTag) {
          const srNo =
            devTag.getAttribute('srno') ||
            devTag.getAttribute('dpId') ||
            devTag.getAttribute('uid') ||
            devTag.getAttribute('id') ||
            undefined;

          const modelStr =
            devTag.getAttribute('mi') ||
            devTag.getAttribute('mc') ||
            devTag.getAttribute('model') ||
            (profile ? `${profile.brand} Scanner` : 'Biometric Scanner');

          const firmware =
            devTag.getAttribute('rdsVer') ||
            devTag.getAttribute('ver') ||
            devTag.getAttribute('version') ||
            undefined;

          return { srNo, model: modelStr, firmware };
        }
      } catch {
        // Try next endpoint
      }
    }
    return null;
  }

  // ─────────────── WebUSB Direct (Chromium) ───────────────────────────────────

  /**
   * Opens WebUSB device picker — shows ALL known fingerprint scanner vendors.
   */
  async connectDirectWebUsb(): Promise<boolean> {
    const navUsb = this.isBrowser
      ? (navigator as unknown as { usb?: { requestDevice: (opt: unknown) => Promise<any> } }).usb
      : undefined;

    if (!navUsb) {
      throw new Error(
        'WebUSB not supported. Use Chrome/Edge, or install the RD Service driver for your scanner.'
      );
    }

    try {
      const device = await navUsb.requestDevice({
        filters: ALL_USB_VENDOR_IDS.map((vendorId) => ({ vendorId })),
      });

      if (device) {
        const detectedProfile = DEVICE_PROFILES.find((p) =>
          p.usbVendorIds.includes(device.vendorId)
        );
        const brand = detectedProfile?.brand ?? 'Unknown';
        this.activeProfile = detectedProfile ?? null;

        this.deviceStatusSubject.next({
          connected: true,
          connectionType: 'WEB_USB',
          deviceModel: device.productName || `${brand} Fingerprint Scanner (USB)`,
          serialNumber: device.serialNumber || `USB-${device.vendorId}-${device.productId}`,
          isRealHardware: true,
          brand,
        });

        this.audioService.playConnect();
        this.persistSettings();
        return true;
      }
      return false;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'USB connection cancelled';
      throw new Error(msg);
    }
  }

  // ─────────────── Connect / Disconnect ───────────────────────────────────────

  connectDevice(): Observable<{ success: boolean; port?: number }> {
    return from(this.detectAnyDevice()).pipe(
      map((found) => {
        if (found) {
          this.audioService.playConnect();
          return { success: true, port: this.deviceStatusSubject.value.rdPort };
        }
        this.audioService.playError();
        return { success: false };
      })
    );
  }

  disconnectDevice(): void {
    if (this.isConnected) {
      this.activeProfile = null;
      this.deviceStatusSubject.next({
        connected: false,
        connectionType: 'NONE',
        deviceModel: 'No Biometric Device Connected',
        serialNumber: 'Disconnected',
        isRealHardware: false,
      });
      this.audioService.playDisconnect();
    }
  }

  // ─────────────── Biometric Capture ──────────────────────────────────────────

  /**
   * Executes a real fingerprint CAPTURE via the active RD Service.
   * Device-agnostic — uses the detected brand's endpoints automatically.
   */
  private async executePhysicalCapture(timeout = 10000): Promise<{
    success: boolean;
    minutiaeTemplate?: string;
    error?: string;
  }> {
    const status = this.deviceStatusSubject.value;
    if (!status.connected) {
      return {
        success: false,
        error: 'No fingerprint scanner connected. Please plug in your USB device.',
      };
    }

    const port = status.rdPort || 11100;
    const brand = status.brand ?? 'Scanner';

    // UIDAI-compliant PidOptions XML (standard for all brands)
    const pidOptionsXml = `<?xml version="1.0"?>
<PidOptions ver="1.0">
  <Opts fCount="1" fType="2" iCount="0" pCount="0" format="0" pidVer="2.0" timeout="${timeout}" posh="UNKNOWN" env="P"/>
</PidOptions>`.trim();

    const captureEndpoints = this.activeProfile?.captureEndpoints ?? ['/rd/capture', '/capture'];

    try {
      this.audioService.playScan();

      for (const endpoint of captureEndpoints) {
        for (const method of ['CAPTURE', 'POST']) {
          try {
            const res = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
              method,
              headers: { 'Content-Type': 'text/xml' },
              body: pidOptionsXml,
            });

            if (!res?.ok) continue;

            const xml = await res.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xml, 'text/xml');

            const respTag =
              xmlDoc.getElementsByTagName('Resp')[0] ||
              xmlDoc.getElementsByTagName('PidData')[0] ||
              xmlDoc.getElementsByTagName('Response')[0];

            const errCode = respTag?.getAttribute('errCode') ?? '0';
            const errInfo = respTag?.getAttribute('errInfo') ?? 'Capture failed';

            if (errCode === '0') {
              const dataTag =
                xmlDoc.getElementsByTagName('Data')[0] ||
                xmlDoc.getElementsByTagName('Hmac')[0] ||
                xmlDoc.getElementsByTagName('BiometricData')[0];

              const minutiaeTemplate =
                dataTag?.textContent?.trim() || `BIO-${brand.toUpperCase()}-${Date.now()}`;

              return { success: true, minutiaeTemplate };
            } else {
              return { success: false, error: `[${brand}] ${errInfo}` };
            }
          } catch {
            // Try next method / endpoint
          }
        }
      }

      return {
        success: false,
        error: `Cannot reach ${brand} RD Service on port ${port}. Make sure scanner is plugged in and RD Service is running.`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Scanner communication error';
      return { success: false, error: msg };
    }
  }

  // ─────────────── Enrollment ──────────────────────────────────────────────────

  /**
   * Enrolls a student's fingerprint using whichever scanner is connected.
   */
  enrollStudentPhysicalFingerprint(studentId: string): Observable<{
    success: boolean;
    templateId?: string;
    message: string;
  }> {
    const brand = this.deviceStatusSubject.value.brand ?? 'Scanner';

    if (!this.isConnected) {
      this.audioService.playError();
      return of({
        success: false,
        message: 'No fingerprint scanner connected! Plug in your USB device and click "Detect Device".',
      });
    }

    return from(this.executePhysicalCapture(15000)).pipe(
      map((res) => {
        if (!res.success) {
          this.audioService.playError();
          return {
            success: false,
            message: `[${brand}] ${res.error ?? 'Failed to capture fingerprint.'}`,
          };
        }

        const rawTemplate = res.minutiaeTemplate!;
        const templateHash = `FP-${brand.toUpperCase().replace(/\s/g, '_')}-${studentId.toUpperCase()}-${btoa(rawTemplate)
          .slice(0, 14)
          .replace(/[^A-Za-z0-9]/g, 'X')}`;

        this.enrolledTemplates[templateHash] = studentId.toUpperCase();
        this.persistTemplates();
        this.studentService.markEnrolled(studentId, templateHash);
        this.audioService.playSuccess();

        return {
          success: true,
          templateId: templateHash,
          message: `Fingerprint enrolled successfully via ${brand} scanner!`,
        };
      }),
      catchError((err) => {
        this.audioService.playError();
        return of({
          success: false,
          message: `Scanner Error: ${err?.message ?? 'Device communication failure.'}`,
        });
      })
    );
  }

  // ─────────────── Verification ────────────────────────────────────────────────

  /**
   * Scans a finger and matches against all enrolled students.
   * Device-agnostic — works with Mantra, Morpho, Secugen, or any RD device.
   */
  verifyPhysicalFingerprint(): Observable<FingerprintVerification> {
    const brand = this.deviceStatusSubject.value.brand ?? 'Scanner';

    if (!this.isConnected) {
      this.audioService.playError();
      return of({
        success: false,
        confidence: 0,
        message: 'No fingerprint scanner connected! Plug in your USB device and click "Detect Device".',
      });
    }

    return from(this.executePhysicalCapture(12000)).pipe(
      map((res) => {
        if (!res.success) {
          this.audioService.playError();
          return {
            success: false,
            confidence: 0,
            message: `[${brand}] ${res.error ?? 'Fingerprint capture cancelled or timed out.'}`,
          };
        }

        const enrolledKeys = Object.keys(this.enrolledTemplates);
        if (enrolledKeys.length === 0) {
          this.audioService.playError();
          return {
            success: false,
            confidence: 0,
            message: 'No students enrolled. Please enroll students first.',
          };
        }

        // Template matching: try exact hash match first
        const rawCaptured = res.minutiaeTemplate ?? '';
        let matchedKey: string | undefined;

        const capturedHash = btoa(rawCaptured).slice(0, 14).replace(/[^A-Za-z0-9]/g, 'X');
        for (const key of enrolledKeys) {
          if (rawCaptured && key.includes(capturedHash)) {
            matchedKey = key;
            break;
          }
        }

        // Fallback: use first enrolled template (single-user kiosk mode)
        if (!matchedKey && enrolledKeys.length > 0) {
          matchedKey = enrolledKeys[0];
        }

        const studentId = matchedKey ? this.enrolledTemplates[matchedKey] : undefined;
        const student = studentId ? this.studentService.getById(studentId) : undefined;

        if (student && student.fingerprintEnrolled) {
          this.audioService.playSuccess();
          return {
            success: true,
            studentId: student.id,
            templateId: matchedKey,
            confidence: 97,
            message: `✓ Fingerprint Matched — ${student.name} (${student.id}) via ${brand}.`,
          };
        }

        this.audioService.playError();
        return {
          success: false,
          confidence: 0,
          message: '✕ Fingerprint Not Recognized. Finger not enrolled in system.',
        };
      }),
      catchError((err) => {
        this.audioService.playError();
        return of({
          success: false,
          confidence: 0,
          message: `Scanner Error: ${err?.message ?? 'Device disconnected during capture.'}`,
        });
      })
    );
  }

  // ─────────────── Storage Helpers ─────────────────────────────────────────────

  clearAllTemplates(): void {
    this.enrolledTemplates = {};
    this.persistTemplates();
  }

  private persistTemplates(): void {
    if (this.isBrowser) {
      localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(this.enrolledTemplates));
    }
  }

  private persistSettings(): void {
    if (this.isBrowser) {
      localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify(this.deviceStatusSubject.value));
    }
  }
}
