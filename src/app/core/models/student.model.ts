export type StudentStatus = 'active' | 'inactive';
export type FingerprintStatus = 'Not Enrolled' | 'Enrolled' | 'Verification Failed';

export interface Student {
  id: string;
  name: string;
  rollNumber: string;
  className: string;
  section: string;
  phone?: string;
  email?: string;
  fingerprintEnrolled: boolean;
  fingerprintStatus: FingerprintStatus;
  fingerprintTemplateId?: string;
  status: StudentStatus;
}
