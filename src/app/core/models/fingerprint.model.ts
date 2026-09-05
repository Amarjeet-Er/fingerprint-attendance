export type FingerprintState =
  | 'waiting'
  | 'scanning'
  | 'matching'
  | 'matched'
  | 'not-matched';

export interface FingerprintVerification {
  success: boolean;
  studentId?: string;
  templateId?: string;
  confidence?: number;
  message: string;
}

export interface DeviceStatus {
  connected: boolean;
  label: string;
  lastSync: string;
  pendingRecords: number;
  syncedRecords: number;
}
