export type AttendanceStatus = 'present' | 'absent' | 'excused' | 'unmarked';

export interface Participant {
  id: string;
  name: string;
  contact: string;
  cohort: string;
  joinDate: string;
  avatarColor: string;
  registrationNotes?: string;
  outreachNotes?: OutreachLog[];
  idNo?: string;
  age?: string;
  dob?: string;
  village?: string;
  caregiver?: string;
  gender?: string;
  schoolingStatus?: 'Day Scholar' | 'Boarder' | string;
  schoolClass?: string;
  isFormer?: boolean;
  formerDate?: string;
  photoUrl?: string;
  isPermanent?: boolean;
  isImported?: boolean;
  scannedForms?: ScannedForm[];
  documents?: OfficialDocument[];
  filledForms?: FilledForm[];
}

export interface FilledForm {
  id: string;
  type: 'Home Visit' | 'Sick Participant Follow' | 'Follow-Up' | 'Referral' | 'Discharge Summary' | 'School Visit';
  date: string;
  data: any; // Flexible JSON payload for the form form data
}

export interface OfficialDocument {
  id: string;
  name: string;
  uploadDate: string;
  url: string;
}

export interface ScannedForm {
  id: string;
  uploadDate: string;
  formType: 'enrollment' | 'medical' | 'school' | 'home_visit' | 'other';
  fileName: string;
  fileDataUrl: string; // Keep base64 image data URL for rendering / local storage
  extractedData: {
    enrollment?: {
      name?: string;
      age?: string;
      gender?: string;
      village?: string;
      caregiver?: string;
      contact?: string;
      cohort?: string;
      registrationNotes?: string;
    };
    medical?: {
      bloodType?: string;
      disabilitiesOrConditions?: string;
      vaccinationStatus?: string;
      recentCheckupDate?: string;
      healthStatusSummary?: string;
    };
    school?: {
      schoolName?: string;
      gradeLevel?: string;
      academicTerm?: string;
      academicRank?: string;
      averageScorePercentage?: number;
      teacherRemarks?: string;
    };
    home_visit?: {
      visitDate?: string;
      householdSize?: number;
      dwellingType?: string;
      familyLivelihood?: string;
      riskVulnerabilitiesSummary?: string;
      visitingStaffRecommendation?: string;
    };
    other?: {
      title?: string;
      rawSummary?: string;
      keyExtractedPoints?: string[];
    };
  };
}

export interface OutreachLog {
  id: string;
  date: string;
  status: 'pending' | 'contacted' | 'resolved';
  notes: string;
  loggedBy: string;
}

export interface AttendanceRecord {
  // Key is participant.id
  [participantId: string]: {
    // Key is date string (YYYY-MM-DD)
    [dateStr: string]: AttendanceStatus;
  };
}

export interface Session {
  date: string; // YYYY-MM-DD
  label?: string; // e.g., "Sprint 1 Kickoff", "Session 4"
  checklist?: Record<string, boolean>;
  notes?: string;
}

export interface AttendanceStats {
  totalPresent: number;
  totalAbsent: number;
  totalExcused: number;
  totalSessions: number;
  attendanceRate: number;
  consecutiveAbsences: number;
  hasYellowFlag: boolean; // 2 consecutive absences
  hasRedFlag: boolean; // 3+ total absences
}
