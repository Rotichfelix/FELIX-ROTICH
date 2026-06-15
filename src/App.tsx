import { useState, useEffect, useRef, FormEvent, ChangeEvent, DragEvent, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, Legend } from 'recharts';
import { 
  MessageSquare,
  UserPlus, 
  Calendar, 
  Search, 
  AlertTriangle, 
  AlertCircle, 
  TrendingUp, 
  Users, 
  BookOpen, 
  CheckCircle, 
  XCircle, 
  MinusCircle, 
  HelpCircle, 
  X, 
  Copy, 
  Check, 
  ArrowRight, 
  Clock, 
  RotateCcw,
  FileText,
  Mail,
  Trash2,
  Undo,
  Upload,
  Info,
  FileSpreadsheet,
  FileCode,
  Download,
  Camera,
  Video,
  Lock,
  Zap,
  Cloud,
  CloudOff,
  RefreshCw,
  Wifi,
  WifiOff,
  LogOut,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Printer,
  Sparkles,
  Brain,
  Bell
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { db, auth, googleProvider, storage } from './firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { 
  Participant, 
  Session, 
  AttendanceRecord, 
  AttendanceStatus,
  OutreachLog,
  AttendanceStats
} from './types';
import { 
  INITIAL_PARTICIPANTS, 
  INITIAL_SESSIONS, 
  INITIAL_ATTENDANCE, 
  COHORTS, 
  AVATAR_COLORS 
} from './data';
import { 
  calculateParticipantStats, 
  generateOutreachTemplate, 
  formatToReadableDate,
  formatToShortDayMonth,
  findConsecutiveAbsentDates,
  formatMonthLabel,
  calculateAgeFromDob
} from './utils';

/**
 * Flags if a participant is due for caregiver outreach based on the rule:
 * no outreach or home visit for the last six months from July every Financial year.
 */
export function isDueForCaregiverOutreach(p: Participant, today: Date = new Date()): boolean {
  // Determine July 1st of the current Financial Year
  let fyYear = today.getFullYear();
  if (today.getMonth() < 6) { // January to June (0-5)
    fyYear = today.getFullYear() - 1;
  }
  const fyJuly1st = new Date(fyYear, 6, 1); // July 1st of current FY

  // Gather all dates of outreach or home visits
  const engagementDates: Date[] = [];

  if (p.outreachNotes && p.outreachNotes.length > 0) {
    p.outreachNotes.forEach(note => {
      if (note.date) {
        const d = new Date(note.date);
        if (!isNaN(d.getTime())) engagementDates.push(d);
      }
    });
  }

  if (p.scannedForms && p.scannedForms.length > 0) {
    p.scannedForms.forEach(form => {
      if (form.formType === 'home_visit') {
        const visitDateStr = form.extractedData?.home_visit?.visitDate || form.uploadDate;
        if (visitDateStr) {
          const d = new Date(visitDateStr);
          if (!isNaN(d.getTime())) engagementDates.push(d);
        }
      }
    });
  }

  // If no engagements ever, they are due.
  if (engagementDates.length === 0) return true;

  // Find the latest engagement date
  const latestEngagement = new Date(Math.max(...engagementDates.map(d => d.getTime())));

  // Check 1: Is the latest engagement more than 6 months (180 days) ago?
  const sixMonthsAgo = new Date(today);
  sixMonthsAgo.setMonth(today.getMonth() - 6);
  if (latestEngagement < sixMonthsAgo) return true;

  // Check 2: Financial Year halves check.
  // First half of the Financial Year starting July 1st, and the last six months starting January 1st.
  const currentMonth = today.getMonth(); // 0-indexed (0 = Jan, 11 = Dec)
  if (currentMonth >= 0 && currentMonth <= 5) { // January to June (the last six months of the Financial Year)
    const jan1stOfThisYear = new Date(today.getFullYear(), 0, 1);
    if (latestEngagement < jan1stOfThisYear) {
      return true;
    }
  } else { // July to December (the first six months of the Financial Year)
    if (latestEngagement < fyJuly1st) {
      return true;
    }
  }

  return false;
}

export default function App() {
  // ---- STATE MANAGEMENT DECLARATION ----
  const [participants, setParticipants] = useState<Participant[]>(() => {
    try {
      const local = localStorage.getItem('attendance_tracker_participants');
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to parse participants from localStorage:", e);
    }
    return INITIAL_PARTICIPANTS;
  });

  const [sessions, setSessions] = useState<Session[]>(() => {
    const local = localStorage.getItem('attendance_tracker_sessions');
    const parsed: Session[] = local ? JSON.parse(local) : INITIAL_SESSIONS;
    const seen = new Set<string>();
    return parsed.filter(s => {
      if (!s.date || seen.has(s.date)) return false;
      seen.add(s.date);
      return true;
    });
  });

  const [attendance, setAttendance] = useState<AttendanceRecord>(() => {
    try {
      const local = localStorage.getItem('attendance_tracker_records');
      if (local) {
        const parsed = JSON.parse(local);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to parse attendance records from localStorage:", e);
    }
    return INITIAL_ATTENDANCE;
  });

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCohort, setSelectedCohort] = useState('All Cohorts');
  const [selectedSegment, setSelectedSegment] = useState<'all' | 'male' | 'female' | 'under12' | '12to14' | '15to18' | '19plus'>('all');
  const [selectedFlag, setSelectedFlag] = useState<'all' | 'red' | 'yellow' | 'normal' | 'due_checkin'>('all');
  const [attendanceSortOrder, setAttendanceSortOrder] = useState<'none' | 'best' | 'worst'>('none');
  const [currentTab, setCurrentTab] = useState<'tracker' | 'journal' | 'admin' | 'ai-analyst'>('tracker');
  const [aiReportLoading, setAiReportLoading] = useState(false);
  const [aiCohortReport, setAiCohortReport] = useState<{
    cohortSummary: string;
    overallRiskDistribution: string;
    studentReports: Array<{
      participantId: string;
      name: string;
      attendanceRate: string;
      standing: string;
      synopsis: string;
      recommendedAction: string;
    }>;
  } | null>(() => {
    try {
      const saved = localStorage.getItem('ai_cohort_report');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [aiSingleReports, setAiSingleReports] = useState<Record<string, {
    summary: string;
    attendanceScoreAnalysis: string;
    insights: string[];
    recommendation: string;
    timestamp: string;
  }>>(() => {
    try {
      const saved = localStorage.getItem('ai_single_reports');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Analytics & Report range filters
  const [analyticsPeriod, setAnalyticsPeriod] = useState<'all' | '14days' | '30days' | 'month' | 'year' | 'custom'>('all');
  const [analyticsStartDate, setAnalyticsStartDate] = useState('');
  const [analyticsEndDate, setAnalyticsEndDate] = useState('');

  const [dossierStartDate, setDossierStartDate] = useState('');
  const [dossierEndDate, setDossierEndDate] = useState('');

  // Journal Filters & Search
  const [journalSearchQuery, setJournalSearchQuery] = useState('');
  const [journalStatusFilter, setJournalStatusFilter] = useState<'all' | 'pending' | 'contacted' | 'resolved'>('all');
  const [journalAlertFilter, setJournalAlertFilter] = useState<'all' | 'red_alert'>('all');

  // Interactive Modal UI state
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [isAddParticipantOpen, setIsAddParticipantOpen] = useState(false);
  const [isAddSessionOpen, setIsAddSessionOpen] = useState(false);
  const [isMonthlyReportOpen, setIsMonthlyReportOpen] = useState(false);
  const [selectedMonthlyReportMonth, setSelectedMonthlyReportMonth] = useState<string>('');

  // Google Sheets sync state variables
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [isSyncingToSheets, setIsSyncingToSheets] = useState(false);
  const [syncedSpreadsheetUrl, setSyncedSpreadsheetUrl] = useState<string | null>(null);
  const [sheetSyncError, setSheetSyncError] = useState<string | null>(null);
  const [staffEmailRecipient, setStaffEmailRecipient] = useState<string>(() => {
    return localStorage.getItem('attendance_tracker_staff_email_recipient') || 'lomuriangolecydc@gmail.com';
  });
  const [isSendingEmailAlert, setIsSendingEmailAlert] = useState(false);
  const [emailAlertSuccess, setEmailAlertSuccess] = useState<string | null>(null);
  const [emailAlertError, setEmailAlertError] = useState<string | null>(null);
  const [isAutomaticEmailEnabled, setIsAutomaticEmailEnabled] = useState<boolean>(() => {
    return localStorage.getItem('attendance_tracker_auto_email_enabled') !== 'false';
  });
  const [lastEmailedSessionDate, setLastEmailedSessionDate] = useState<string | null>(() => {
    return localStorage.getItem('attendance_tracker_last_emailed_session_date') || null;
  });
  const [reportFilterMode, setReportFilterMode] = useState<'month' | 'custom'>('month');
  const [reportStartDate, setReportStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [reportEndDate, setReportEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  
  // Forms states
  const [newPartName, setNewPartName] = useState('');
  const [newPartIdNo, setNewPartIdNo] = useState('');
  const [newPartAge, setNewPartAge] = useState('');
  const [newPartDob, setNewPartDob] = useState('');
  const [newPartVillage, setNewPartVillage] = useState('');
  const [newPartCaregiver, setNewPartCaregiver] = useState('');
  const [newPartContact, setNewPartContact] = useState('');
  const [newPartCohort, setNewPartCohort] = useState('Victors Class');
  const [newPartGender, setNewPartGender] = useState('');
  const [newPartNotes, setNewPartNotes] = useState('');

  const [newSessionDate, setNewSessionDate] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [newSessionLabel, setNewSessionLabel] = useState('');

  // Manager log input states (inside participant inspector)
  const [newLogNotes, setNewLogNotes] = useState('');
  const [newLogStatus, setNewLogStatus] = useState<'pending' | 'contacted' | 'resolved'>('pending');
  const [newLoggedBy, setNewLoggedBy] = useState('');
  
  // Visual state helpers
  const [copiedTemplate, setCopiedTemplate] = useState<'subject' | 'body' | null>(null);
  const [justReset, setJustReset] = useState(false);
  const [hoveredHeatmapIndex, setHoveredHeatmapIndex] = useState<number | null>(null);
  const [selectedHeatmapIndex, setSelectedHeatmapIndex] = useState<number | null>(null);

  // Bulk Import state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState('');

  // Attendance Bulk Import state
  const [isAttendanceImportOpen, setIsAttendanceImportOpen] = useState(false);
  const [attendanceImportText, setAttendanceImportText] = useState('');
  const [attendanceImportDate, setAttendanceImportDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [attendanceImportLabel, setAttendanceImportLabel] = useState('');
  const [attendanceUploadedFileName, setAttendanceUploadedFileName] = useState<string | null>(null);
  const [attendanceDragActive, setAttendanceDragActive] = useState(false);

  // Admin & Security Management
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isPasscodeFieldOpen, setIsPasscodeFieldOpen] = useState(false);
  const [passcodeAttempt, setPasscodeAttempt] = useState('');
  const [passcodeError, setPasscodeError] = useState('');

  // Demographics Editing Space
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editIdNo, setEditIdNo] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editGender, setEditGender] = useState('');
  const [editVillage, setEditVillage] = useState('');
  const [editCaregiver, setEditCaregiver] = useState('');
  const [editCohort, setEditCohort] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editRegistrationNotes, setEditRegistrationNotes] = useState('');

  // AI Document Scanning State Variables
  const [scannedFormType, setScannedFormType] = useState<'enrollment' | 'medical' | 'school' | 'home_visit' | 'other'>('enrollment');
  const [isScanningForm, setIsScanningForm] = useState(false);
  const [scanProcessingStep, setScanProcessingStep] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  
  // Official Document Uploads
  const [docUploadProgress, setDocUploadProgress] = useState<number>(0);
  const [isUploadingDoc, setIsUploadingDoc] = useState<boolean>(false);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);
  const [scannedFilePreview, setScannedFilePreview] = useState<string | null>(null);
  const [scanUploadedFileName, setScanUploadedFileName] = useState<string | null>(null);
  const [scanDragActive, setScanDragActive] = useState(false);
  const [selectedScanDocId, setSelectedScanDocId] = useState<string | null>(null);

  // Session Editing States
  const [editingSessionOriginalDate, setEditingSessionOriginalDate] = useState<string | null>(null);
  const [editSessionDate, setEditSessionDate] = useState('');
  const [editSessionLabel, setEditSessionLabel] = useState('');
  const [bulkTargetDate, setBulkTargetDate] = useState('');

  // Heatmap Range Slider States with boundary protection and linkages
  const [heatmapStartIdx, setHeatmapStartIdx] = useState(0);
  const [heatmapEndIdx, setHeatmapEndIdx] = useState(29);

  const handleStartIdxChange = (val: number) => {
    // Prevent the start index from exceeding the current end index
    if (val > heatmapEndIdx) {
      setHeatmapStartIdx(heatmapEndIdx);
    } else {
      setHeatmapStartIdx(Math.max(0, val));
    }
  };

  const handleEndIdxChange = (val: number) => {
    // Prevent the end index from sliding below the current start index
    if (val < heatmapStartIdx) {
      setHeatmapEndIdx(heatmapStartIdx);
    } else {
      setHeatmapEndIdx(Math.min(29, val));
    }
  };

  // Camera Crop and Filters state
  const [cohortGroupingMode, setCohortGroupingMode] = useState<'gender' | 'status'>('gender');

  // Interactive mode for Heatmap status (Standard stats vs. Interactive Absentee list)
  const [isAbsentHoverMode, setIsAbsentHoverMode] = useState<boolean>(true);

  // ---- FIREBASE AUTHENTICATION STATES ----
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isSyncingWithCloud, setIsSyncingWithCloud] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMailMode, setAuthMailMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState<string>('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  // ---- AUTO BACKUP ENGINE STATES ----
  const [isAutoDownloadEnabled, setIsAutoDownloadEnabled] = useState<boolean>(() => {
    const local = localStorage.getItem('attendance_tracker_auto_download_on_finish');
    return local !== 'false'; // defaults to true
  });
  const [autoBackupToast, setAutoBackupToast] = useState<{ show: boolean; message: string; type: 'Exit' | 'SessionFinish' | null }>({
    show: false,
    message: '',
    type: null
  });

  // ---- OFFLINE-FIRST SYNC ENGINE STATES ----
  // ---- MANAGER NOTIFICATION CONTRACT / PDF STATES ----
  const [pdfDiscussionNotes, setPdfDiscussionNotes] = useState<string>('');
  const [pdfCaregiverCommitment, setPdfCaregiverCommitment] = useState<string>('To ensure the student attends all program classes, sessions, and center gatherings regularly and punctually; to communicate any absences with center leaders beforehand; to support the child at home physically and academically.');
  const [pdfActionPoints, setPdfActionPoints] = useState<string>('1. Conduct home check-in visit by center staff.\n2. Dedicate a peer mentorship peer or academic assistant.\n3. Keep continuous physical tracking logs at Center.');
  const [pdfStaffName, setPdfStaffName] = useState<string>('');
  const [pdfCaregiverName, setPdfCaregiverName] = useState<string>('');

  useEffect(() => {
    if (selectedParticipantId) {
      const part = participants.find(p => p.id === selectedParticipantId);
      if (part) {
        setPdfCaregiverName(part.caregiver || '');
        setPdfDiscussionNotes('');
        setPdfCaregiverCommitment('To ensure the student attends all program classes, sessions, and center gatherings regularly and punctually; to communicate any absences with center leaders beforehand; to support the child at home physically and academically.');
        setPdfActionPoints('1. Conduct home check-in visit by center staff.\n2. Dedicate a peer mentorship peer or academic assistant.\n3. Keep continuous physical tracking logs at Center.');
        setPdfStaffName('');
      }
    }
  }, [selectedParticipantId, participants]);

  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [syncStatus, setSyncStatus] = useState<'synced' | 'unsynced' | 'syncing' | 'error'>('synced');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    return localStorage.getItem('attendance_tracker_last_sync_time');
  });
  const [hasPendingUnsavedChanges, setHasPendingUnsavedChanges] = useState<boolean>(() => {
    return localStorage.getItem('attendance_tracker_unsynced_changes') === 'true';
  });
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);

  // Trigger auto-download helper
  const triggerAutomatedDownload = (type: 'Exit' | 'SessionFinish', customData?: { 
    participants?: Participant[], 
    sessions?: Session[], 
    attendance?: AttendanceRecord 
  }) => {
    try {
      const activeParticipants = customData?.participants || participants;
      const activeSessions = customData?.sessions || sessions;
      const activeAttendance = customData?.attendance || attendance;

      const backupObj = {
        backupMetadata: {
          version: "1.0.0",
          exportedAt: new Date().toISOString(),
          totalParticipants: activeParticipants.length,
          totalSessions: activeSessions.length,
          triggerSource: type,
          backupStatus: "automatic"
        },
        participants: activeParticipants,
        sessions: activeSessions,
        attendance: activeAttendance
      };

      const jsonString = JSON.stringify(backupObj, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);

      const timestamp = new Date().toISOString().split('T')[0] + '_' + new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
      link.setAttribute("download", `Lomuriangole_CYDC_AutoBackup_${type}_${timestamp}.json`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setAutoBackupToast({
        show: true,
        message: `Automated JSON Backup Generated! (${type === 'Exit' ? 'Exiting App' : 'Finished Session'})`,
        type
      });

      setTimeout(() => {
        setAutoBackupToast(prev => ({ ...prev, show: false }));
      }, 5000);
    } catch (err) {
      console.warn("Auto-backup failed to download (this is normal if triggered on hard browser unload):", err);
    }
  };

  // ---- CLOUD BACKUP & FIREBASE SECURITY RECOVERY SPEC ----
  enum OperationType {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    LIST = 'list',
    GET = 'get',
    WRITE = 'write',
  }

  interface FirestoreErrorInfo {
    error: string;
    operationType: OperationType;
    path: string | null;
    authInfo: {
      userId?: string | null;
      email?: string | null;
      emailVerified?: boolean | null;
      isAnonymous?: boolean | null;
      tenantId?: string | null;
      providerInfo?: {
        providerId?: string | null;
        email?: string | null;
      }[];
    }
  }

  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Security Error Context: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  };

  // Trigger server sync upload to Cloud Firestore
  const triggerSyncUpload = async (customData?: { 
    participants?: Participant[], 
    sessions?: Session[], 
    attendance?: AttendanceRecord 
  }) => {
    if (!auth.currentUser) return; // Only sync if user is logged in
    
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSyncStatus('unsynced');
      setHasPendingUnsavedChanges(true);
      localStorage.setItem('attendance_tracker_unsynced_changes', 'true');
      return;
    }

    setSyncStatus('syncing');
    setSyncErrorMsg(null);

    // Snapshot of current data or upcoming updated data
    const activeParticipantsList = customData?.participants || participants;
    const activeSessionsList = customData?.sessions || sessions;
    const activeAttendanceRecord = customData?.attendance || attendance;

    const dataToSync = {
      participants: activeParticipantsList,
      sessions: activeSessionsList,
      attendance: activeAttendanceRecord,
      lastUpdated: new Date().toISOString()
    };

    const docPath = `users/${auth.currentUser.uid}/data/metrics`;

    try {
      const docRef = doc(db, 'users', auth.currentUser.uid, 'data', 'metrics');
      await setDoc(docRef, dataToSync);

      setSyncStatus('synced');
      setHasPendingUnsavedChanges(false);
      localStorage.setItem('attendance_tracker_unsynced_changes', 'false');
      
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString();
      setLastSyncTime(nowStr);
      localStorage.setItem('attendance_tracker_last_sync_time', nowStr);
    } catch (err: any) {
      console.error("Cloud Firestore sync failing:", err);
      setSyncStatus('error');
      setSyncErrorMsg(err.message || 'Firestore write failed');
      
      try {
        handleFirestoreError(err, OperationType.WRITE, docPath);
      } catch (_) {
        // Logged diagnostic context to console already
      }
    }
  };

  // Pull database state from Cloud Firestore
  const triggerSyncDownload = async () => {
    if (!auth.currentUser) {
      alert("Please sign in first to fetch cloud data.");
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      alert("You are currently offline. Please restore your connection to fetch cloud backups.");
      return;
    }

    if (window.confirm("Restore from Cloud:\nThis will replace your current local browser attendance data with the synced database saved securely in Cloud Firestore. Do you want to proceed?")) {
      setSyncStatus('syncing');
      setSyncErrorMsg(null);

      const docPath = `users/${auth.currentUser.uid}/data/metrics`;

      try {
        const docRef = doc(db, 'users', auth.currentUser.uid, 'data', 'metrics');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (Array.isArray(data.participants) && Array.isArray(data.sessions) && typeof data.attendance === 'object') {
            setParticipants(data.participants);
            setSessions(data.sessions);
            setAttendance(data.attendance);

            // Save pulled values to local cache
            localStorage.setItem('attendance_tracker_participants', JSON.stringify(data.participants));
            localStorage.setItem('attendance_tracker_sessions', JSON.stringify(data.sessions));
            localStorage.setItem('attendance_tracker_records', JSON.stringify(data.attendance));

            setSyncStatus('synced');
            setHasPendingUnsavedChanges(false);
            localStorage.setItem('attendance_tracker_unsynced_changes', 'false');

            const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString();
            setLastSyncTime(nowStr);
            localStorage.setItem('attendance_tracker_last_sync_time', nowStr);
            
            alert("Success! Your device data is fully synced and updated from major cloud records.");
          } else {
            throw new Error("Cloud backup has an unrecognized structure or was corrupted.");
          }
        } else {
          // If no remote backup exists in Firestore yet, upload local data as initial seed
          alert("No cloud-side database was found yet. Uploading your current browser database as the initial cloud backup standard.");
          await triggerSyncUpload();
        }
      } catch (err: any) {
        console.error("Cloud-first restore download failing:", err);
        setSyncStatus('error');
        setSyncErrorMsg(err.message || 'Restoration task aborted');
        alert(`Failed to restore data from cloud: ${err.message}`);
        
        try {
          handleFirestoreError(err, OperationType.GET, docPath);
        } catch (_) {}
      }
    }
  };
  const [capturedPhotoPreview, setCapturedPhotoPreview] = useState<{ rawUrl: string; cropBox: any; finalUrl: string } | null>(null);
  const [selectedPhotoFilter, setSelectedPhotoFilter] = useState<'none' | 'grayscale' | 'vintage' | 'dramatic' | 'warm' | 'cool'>('none');
  const [parsedImportList, setParsedImportList] = useState<{
    id: string;
    name: string;
    contact: string;
    cohort: string;
    registrationNotes: string;
    isValid: boolean;
    errors: string[];
    importChecked: boolean;
    idNo?: string;
    age?: string;
    village?: string;
    caregiver?: string;
    gender?: string;
  }[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [importTab, setImportTab] = useState<'paste' | 'file'>('paste');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // ---- CAMERA CAPTURE SYSTEM ----
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 320, facingMode: 'user' },
        audio: false
      });
      setMediaStream(stream);
      setIsCameraActive(true);
    } catch (err: any) {
      console.error("Failed to acquire camera: ", err);
      let errorMsg = 'Could not access device camera. Please grant permission.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Camera permission denied. Please enable camera access in your browser.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'No camera device found on your device.';
      }
      setCameraError(errorMsg);
    }
  };

  const stopCamera = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }
    setIsCameraActive(false);
  };

  // Helper to translate filter keys to browser canvas filter strings
  const getCanvasFilterString = (filter: string): string => {
    switch (filter) {
      case 'grayscale':
        return 'grayscale(100%) contrast(115%)';
      case 'vintage':
        return 'sepia(75%) contrast(95%) brightness(105%)';
      case 'dramatic':
        return 'grayscale(100%) contrast(175%) brightness(95%)';
      case 'warm':
        return 'sepia(20%) saturate(145%) brightness(102%)';
      case 'cool':
        return 'saturate(85%) hue-rotate(15deg) brightness(100%)';
      case 'none':
      default:
        return 'none';
    }
  };

  // Human skin tone detection using YCbCr color spaces to automatically find & center the face bounds from a full image context
  const detectFaceInImageData = (canvasCtx: CanvasRenderingContext2D, width: number, height: number) => {
    try {
      const imgData = canvasCtx.getImageData(0, 0, width, height);
      const data = imgData.data;

      let totalX = 0;
      let totalY = 0;
      let count = 0;
      
      let minX = width;
      let maxX = 0;
      let minY = height;
      let maxY = 0;

      // Scan image at a coarse grid (step of 4 pixels) for real-time high speed
      for (let y = 0; y < height; y += 4) {
        for (let x = 0; x < width; x += 4) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          // Compute YCbCr components
          const cb = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
          const cr = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;

          // Standard human skin color boundaries in YCbCr: CB in [77, 127], CR in [133, 173]
          if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) {
            totalX += x;
            totalY += y;
            count++;

            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      // If we found a valid cluster representing the face
      if (count > 40) {
        const centroidX = totalX / count;
        const centroidY = totalY / count;

        const dWidth = maxX - minX;
        const dHeight = maxY - minY;
        const dSize = Math.max(dWidth, dHeight);

        // Add 40% margin of safety to include whole head and hair nicely
        const pSize = Math.min(width, height, dSize * 1.45);
        
        // Offset centering slightly upwards to include forehead & hair top
        let sx = centroidX - pSize / 2;
        let sy = centroidY - pSize * 0.45;

        // Boundaries clipping safety
        sx = Math.max(0, Math.min(width - pSize, sx));
        sy = Math.max(0, Math.min(height - pSize, sy));

        return { x: Math.round(sx), y: Math.round(sy), size: Math.round(pSize), found: true };
      }
    } catch (e) {
      console.error("Skin detection error: ", e);
    }

    // Default fallback: center square crop
    const size = Math.min(width, height);
    return {
      x: Math.round((width - size) / 2),
      y: Math.round((height - size) / 2),
      size: Math.round(size),
      found: false
    };
  };

  const capturePhoto = (participantId: string) => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const originalWidth = video.videoWidth || 320;
      const originalHeight = video.videoHeight || 320;
      
      // Step 1: Draw full capture from stream
      const rawCanvas = document.createElement('canvas');
      rawCanvas.width = originalWidth;
      rawCanvas.height = originalHeight;
      const rawCtx = rawCanvas.getContext('2d');
      if (!rawCtx) return;
      
      // Draw frame
      rawCtx.drawImage(video, 0, 0, originalWidth, originalHeight);
      const rawDataUrl = rawCanvas.toDataURL('image/jpeg', 0.95);
      
      // Step 2: Auto-detect skin centroid/face boundaries
      const faceBox = detectFaceInImageData(rawCtx, originalWidth, originalHeight);
      
      // Step 3: Draw cropped photo on output canvas
      const cropCanvas = document.createElement('canvas');
      const finalSize = 320;
      cropCanvas.width = finalSize;
      cropCanvas.height = finalSize;
      const cropCtx = cropCanvas.getContext('2d');
      if (!cropCtx) return;
      
      // Use current selected filter
      cropCtx.filter = getCanvasFilterString(selectedPhotoFilter);
      
      cropCtx.drawImage(
        rawCanvas,
        faceBox.x,
        faceBox.y,
        faceBox.size,
        faceBox.size,
        0,
        0,
        finalSize,
        finalSize
      );
      
      const croppedDataUrl = cropCanvas.toDataURL('image/jpeg', 0.88);
      
      setCapturedPhotoPreview({
        rawUrl: rawDataUrl,
        cropBox: faceBox,
        finalUrl: croppedDataUrl
      });
      
    } catch (err: any) {
      console.error("Post capture facial centering failed: ", err);
      setCameraError('Image processing failed: ' + err.message);
    }
  };

  const applyFilterToPhoto = (filterType: 'none' | 'grayscale' | 'vintage' | 'dramatic' | 'warm' | 'cool') => {
    setSelectedPhotoFilter(filterType);
    if (!capturedPhotoPreview) return;
    
    // Dynamically re-bake photo with the new filter preset instantly
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const finalSize = 320;
      canvas.width = finalSize;
      canvas.height = finalSize;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.filter = getCanvasFilterString(filterType);
        const box = capturedPhotoPreview.cropBox;
        ctx.drawImage(
          img,
          box.x,
          box.y,
          box.size,
          box.size,
          0,
          0,
          finalSize,
          finalSize
        );
        
        setCapturedPhotoPreview(prev => prev ? {
          ...prev,
          finalUrl: canvas.toDataURL('image/jpeg', 0.88)
        } : null);
      }
    };
    img.src = capturedPhotoPreview.rawUrl;
  };

  const saveCapturedPhoto = (participantId: string) => {
    if (!capturedPhotoPreview) return;
    
    setParticipants(prev => prev.map(p => {
      if (p.id === participantId) {
        return { ...p, photoUrl: capturedPhotoPreview.finalUrl };
      }
      return p;
    }));
    
    // Clear state
    setCapturedPhotoPreview(null);
    setSelectedPhotoFilter('none');
    stopCamera();
  };

  const deleteProfilePhoto = (participantId: string) => {
    if (window.confirm("Are you sure you want to remove this participant's profile photo?")) {
      setParticipants(prev => prev.map(p => {
        if (p.id === participantId) {
          const { photoUrl, ...rest } = p;
          return rest;
        }
        return p;
      }));
    }
  };

  const [aiError, setAiError] = useState<string | null>(null);

  const generateIndividualAIReport = async (participant: Participant, stats: AttendanceStats) => {
    setAiReportLoading(true);
    setAiError(null);
    try {
      const response = await fetch('/api/gemini/analyze-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant, stats })
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Server error generating student AI insights.');
      }
      const data = await response.json();
      const updated = {
        ...aiSingleReports,
        [participant.id]: {
          ...data,
          timestamp: new Date().toLocaleDateString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })
        }
      };
      setAiSingleReports(updated);
      localStorage.setItem('ai_single_reports', JSON.stringify(updated));
    } catch (e: any) {
      console.error("Failed to generate student AI analysis:", e);
      setAiError(e.message || "Failed to generate AI report for this student.");
    } finally {
      setAiReportLoading(false);
    }
  };

  const generateCohortAIReport = async () => {
    setAiReportLoading(true);
    setAiError(null);
    try {
      const response = await fetch('/api/gemini/analyze-cohort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participants, statsMap: participantStatsMap })
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Server error generating cohort-wide digest.');
      }
      const data = await response.json();
      setAiCohortReport(data);
      localStorage.setItem('ai_cohort_report', JSON.stringify(data));
    } catch (e: any) {
      console.error("Cohort AI generation failed:", e);
      setAiError(e.message || "Unable to generate aggregate cohort AI report.");
    } finally {
      setAiReportLoading(false);
    }
  };

  const clearCohortAIReport = () => {
    setAiCohortReport(null);
    localStorage.removeItem('ai_cohort_report');
  };

  const clearSingleAIReport = (participantId: string) => {
    const updated = { ...aiSingleReports };
    delete updated[participantId];
    setAiSingleReports(updated);
    localStorage.setItem('ai_single_reports', JSON.stringify(updated));
  };

  useEffect(() => {
    if (!selectedParticipantId) {
      stopCamera();
    }
  }, [selectedParticipantId]);

  // Smooth scroll effect to the participant drawer when it opens on smaller screens
  useEffect(() => {
    if (selectedParticipantId) {
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        setTimeout(() => {
          if (drawerRef.current) {
            drawerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            const el = document.getElementById('drawer-participant');
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
          // Smoothly scroll the inner scrollable body to the top to start from the top section
          const innerScrollBody = document.querySelector('#drawer-participant .overflow-y-auto');
          if (innerScrollBody) {
            innerScrollBody.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }, 150);
      }
    }
  }, [selectedParticipantId]);

  useEffect(() => {
    if (videoRef.current && mediaStream && isCameraActive) {
      videoRef.current.srcObject = mediaStream;
    }
  }, [mediaStream, isCameraActive]);

  // ---- EFFECT FOR ACTIONS AUTO-PERSISTENCE ----
  useEffect(() => {
    localStorage.setItem('attendance_tracker_participants', JSON.stringify(participants));
  }, [participants]);

  useEffect(() => {
    localStorage.setItem('attendance_tracker_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('attendance_tracker_records', JSON.stringify(attendance));
  }, [attendance]);

  // Monitor tab closing, user exits, or navigates away for automated JSON backup
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleExitAutoBackup = () => {
      // Trigger automatic backup download attempt when exiting
      if (isAutoDownloadEnabled) {
        triggerAutomatedDownload('Exit');
      }
    };

    window.addEventListener('beforeunload', handleExitAutoBackup);
    window.addEventListener('pagehide', handleExitAutoBackup);

    return () => {
      window.removeEventListener('beforeunload', handleExitAutoBackup);
      window.removeEventListener('pagehide', handleExitAutoBackup);
    };
  }, [participants, sessions, attendance, isAutoDownloadEnabled]);

  // Track first load to bypass initial up-sync
  const isFirstMount = useRef(true);

  // Auth State Listener on bootup
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  // Fetch or Seed user database in the Cloud upon successful log in
  useEffect(() => {
    if (!currentUser) return;

    let activeSync = true;
    const fetchOnLogin = async () => {
      setSyncStatus('syncing');
      setSyncErrorMsg(null);
      try {
        const docRef = doc(db, 'users', currentUser.uid, 'data', 'metrics');
        const docSnap = await getDoc(docRef);
        if (!activeSync) return;

        if (docSnap.exists()) {
          const data = docSnap.data();
          if (Array.isArray(data.participants) && Array.isArray(data.sessions) && typeof data.attendance === 'object') {
            setParticipants(data.participants);
            setSessions(data.sessions);
            setAttendance(data.attendance);
            setSyncStatus('synced');
            setHasPendingUnsavedChanges(false);
            localStorage.setItem('attendance_tracker_unsynced_changes', 'false');

            const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString();
            setLastSyncTime(nowStr);
            localStorage.setItem('attendance_tracker_last_sync_time', nowStr);
          }
        } else {
          // Seed cloud database for newly created accounts
          const dataToSync = {
            participants,
            sessions,
            attendance,
            lastUpdated: new Date().toISOString()
          };
          await setDoc(docRef, dataToSync);
          setSyncStatus('synced');
          setHasPendingUnsavedChanges(false);
          localStorage.setItem('attendance_tracker_unsynced_changes', 'false');

          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString();
          setLastSyncTime(nowStr);
          localStorage.setItem('attendance_tracker_last_sync_time', nowStr);
        }
      } catch (err: any) {
        console.error("Failed to automatically synchronize user records on log in:", err);
        setSyncStatus('error');
        setSyncErrorMsg("Cloud database connection lost or restricted");
      }
    };

    fetchOnLogin();
    return () => {
      activeSync = false;
    };
  }, [currentUser]);

  // Monitor online status
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      // Attempt syncing immediately on recovery
      triggerSyncUpload({ participants, sessions, attendance });
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [participants, sessions, attendance, currentUser]);

  // Trigger auto sync on data changes
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    // Flag changes
    setHasPendingUnsavedChanges(true);
    localStorage.setItem('attendance_tracker_unsynced_changes', 'true');
    setSyncStatus('unsynced');

    // Attempt trigger sync upload (debounced)
    const timeoutId = setTimeout(() => {
      triggerSyncUpload({ participants, sessions, attendance });
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [participants, sessions, attendance]);

  // ---- COMPUTING LIVE AGGREGATED METRICS ----
  // Gather metrics for active and former participants
  const activeParticipants = participants.filter(p => !p.isFormer);
  const formerParticipants = participants.filter(p => !!p.isFormer);

  // ---- PREPARE MONTHLY REPORT DATA ----
  const uniqueMonths = (() => {
    const monthsSet = new Set<string>();
    sessions.forEach(s => {
      if (s.date && s.date.includes('-')) {
        const parts = s.date.split('-');
        if (parts.length >= 2) {
          monthsSet.add(`${parts[0]}-${parts[1]}`); // e.g. "2026-06"
        }
      }
    });
    return Array.from(monthsSet).sort((a, b) => b.localeCompare(a)); // sorted latest first
  })();

  useEffect(() => {
    if (uniqueMonths.length > 0 && !selectedMonthlyReportMonth) {
      setSelectedMonthlyReportMonth(uniqueMonths[0]);
    }
  }, [uniqueMonths, selectedMonthlyReportMonth]);

  const monthlyReportData = (() => {
    let sessionsInPeriod;
    if (reportFilterMode === 'custom') {
      sessionsInPeriod = sessions
        .filter(s => {
          if (!s.date) return false;
          // Exact string-based comparison works perfectly because they are both in YYYY-MM-DD dynamic formats
          const start = reportStartDate || '0000-00-00';
          const end = reportEndDate || '9999-12-31';
          return s.date >= start && s.date <= end;
        })
        .sort((a, b) => a.date.localeCompare(b.date));
    } else {
      if (!selectedMonthlyReportMonth) return null;
      sessionsInPeriod = sessions
        .filter(s => s.date && s.date.startsWith(selectedMonthlyReportMonth))
        .sort((a, b) => a.date.localeCompare(b.date));
    }
      
    if (sessionsInPeriod.length === 0) return null;
    
    const customCohorts = Array.from(new Set(participants.map(p => p.cohort))).filter(c => c && c !== 'All Cohorts');
    const allCohorts = Array.from(new Set([...COHORTS.filter(c => c !== 'All Cohorts'), ...customCohorts]));
    
    const cohortReports = allCohorts.map(cohortName => {
      const members = participants.filter(p => p.cohort === cohortName && !p.isFormer);
      
      let totalSessionsPossible = 0;
      let totalPresent = 0;
      let totalAbsent = 0;
      let totalExcused = 0;
      
      const memberBreakdown = members.map(m => {
        const studentRecord = attendance[m.id] || {};
        let sPresent = 0;
        let sAbsent = 0;
        let sExcused = 0;
        let sMarked = 0;
        
        sessionsInPeriod.forEach(s => {
          const status = studentRecord[s.date] || 'unmarked';
          if (status !== 'unmarked') {
            sMarked++;
            if (status === 'present') sPresent++;
            else if (status === 'absent') sAbsent++;
            else if (status === 'excused') sExcused++;
          }
        });
        
        const individualRate = sMarked > 0 
          ? Math.round(((sPresent + sExcused) / sMarked) * 100)
          : 100;
          
        totalSessionsPossible += sMarked;
        totalPresent += sPresent;
        totalAbsent += sAbsent;
        totalExcused += sExcused;
        
        return {
          participant: m,
          present: sPresent,
          absent: sAbsent,
          excused: sExcused,
          marked: sMarked,
          rate: individualRate
        };
      }).sort((a, b) => a.participant.name.localeCompare(b.participant.name));
      
      const aggregateRate = totalSessionsPossible > 0
        ? Math.round(((totalPresent + totalExcused) / totalSessionsPossible) * 100)
        : 100;
        
      return {
        cohortName,
        membersCount: members.length,
        totalPresent,
        totalAbsent,
        totalExcused,
        totalSessionsPossible,
        attendanceRate: aggregateRate,
        students: memberBreakdown
      };
    });
    
    let grandPresent = 0;
    let grandAbsent = 0;
    let grandExcused = 0;
    let grandMarked = 0;
    
    cohortReports.forEach(c => {
      grandPresent += c.totalPresent;
      grandAbsent += c.totalAbsent;
      grandExcused += c.totalExcused;
      grandMarked += c.totalSessionsPossible;
    });
    
    const overallRate = grandMarked > 0
      ? Math.round(((grandPresent + grandExcused) / grandMarked) * 100)
      : 100;
      
    return {
      monthStr: selectedMonthlyReportMonth,
      periodLabel: reportFilterMode === 'custom' 
        ? `${formatToReadableDate(reportStartDate)} to ${formatToReadableDate(reportEndDate)}`
        : formatMonthLabel(selectedMonthlyReportMonth),
      isCustomRange: reportFilterMode === 'custom',
      sessions: sessionsInPeriod,
      cohorts: cohortReports,
      overallStats: {
        totalPresent: grandPresent,
        totalAbsent: grandAbsent,
        totalExcused: grandExcused,
        totalMarked: grandMarked,
        rate: overallRate,
        sessionsCount: sessionsInPeriod.length,
        activeStudentsCount: activeParticipants.length
      }
    };
  })();

  // Sorted list of active participants by ID No ascending
  const sortedActiveParticipants = [...activeParticipants].sort((a, b) => {
    const idA = a.idNo || '';
    const idB = b.idNo || '';
    const hasA = idA && idA !== '-';
    const hasB = idB && idB !== '-';
    if (!hasA && !hasB) return 0;
    if (!hasA) return 1;
    if (!hasB) return -1;
    return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
  });

  // Filter sessions based on Selected Summary Analytics Period
  const filteredSessionsForAnalytics = useMemo(() => {
    const sorted = [...sessions].sort((sa, sb) => sa.date.localeCompare(sb.date));
    
    if (analyticsPeriod === 'all') {
      return sorted;
    }
    
    let cutoffStr = '';
    const now = new Date();
    
    if (analyticsPeriod === '14days') {
      const d = new Date();
      d.setDate(d.getDate() - 14);
      cutoffStr = d.toISOString().split('T')[0];
      return sorted.filter(s => s.date >= cutoffStr);
    } else if (analyticsPeriod === '30days') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      cutoffStr = d.toISOString().split('T')[0];
      return sorted.filter(s => s.date >= cutoffStr);
    } else if (analyticsPeriod === 'month') {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      cutoffStr = d.toISOString().split('T')[0];
      return sorted.filter(s => s.date >= cutoffStr);
    } else if (analyticsPeriod === 'year') {
      const d = new Date(now.getFullYear(), 0, 1);
      cutoffStr = d.toISOString().split('T')[0];
      return sorted.filter(s => s.date >= cutoffStr);
    } else if (analyticsPeriod === 'custom') {
      let filtered = sorted;
      if (analyticsStartDate) {
        filtered = filtered.filter(s => s.date >= analyticsStartDate);
      }
      if (analyticsEndDate) {
        filtered = filtered.filter(s => s.date <= analyticsEndDate);
      }
      return filtered;
    }
    
    return sorted;
  }, [sessions, analyticsPeriod, analyticsStartDate, analyticsEndDate]);

  const participantStatsMap = participants.reduce((acc, p) => {
    acc[p.id] = calculateParticipantStats(p.id, filteredSessionsForAnalytics, attendance);
    return acc;
  }, {} as { [id: string]: ReturnType<typeof calculateParticipantStats> });

  // A participant's red alert is suppressed from the tracker dashboard when they have a saved discussion log with status !== 'resolved'
  const isRedAlertSuppressed = (p: Participant) => {
    return !!(p.outreachNotes && p.outreachNotes.some(log => log.status === 'pending' || log.status === 'contacted'));
  };

  // Override red alert status for dashboard display if suppressed by saved active discussion log
  const getDashboardStats = (pId: string) => {
    const stats = participantStatsMap[pId];
    if (!stats) return null;
    const p = participants.find(part => part.id === pId);
    if (p && isRedAlertSuppressed(p) && stats.hasRedFlag) {
      return {
        ...stats,
        hasRedFlag: false,
        hasYellowFlag: false // also suppress yellow warning so they look clear on the active board
      };
    }
    return stats;
  };

  const totalParticipants = activeParticipants.length;
  
  // Total warnings logic
  const redFlagList = activeParticipants.filter(p => {
    const stats = participantStatsMap[p.id];
    return stats?.hasRedFlag && !isRedAlertSuppressed(p);
  });
  const yellowFlagList = activeParticipants.filter(p => !isRedAlertSuppressed(p) && participantStatsMap[p.id]?.hasYellowFlag);
  
  // Caregiver check-in due list logic (due if no journal logs, last log older than 30 days, or due under the FY 6-month July rule)
  const dueCheckInParticipantsList = useMemo(() => {
    return activeParticipants.filter(p => {
      // 1. Standard 30 days routine caregiver discussion
      let hasNotes = p.outreachNotes && p.outreachNotes.length > 0;
      let routineCheck = false;
      if (!hasNotes) {
        routineCheck = true;
      } else {
        const dates = p.outreachNotes!.map(n => n.date).filter(Boolean);
        if (dates.length === 0) {
          routineCheck = true;
        } else {
          const lastDateStr = dates.reduce((latest, current) => current > latest ? current : latest);
          const lastDate = new Date(lastDateStr);
          const today = new Date();
          const diffTime = Math.abs(today.getTime() - lastDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          routineCheck = diffDays > 30;
        }
      }

      // 2. Financial Year Caregiver Outreach/Home Visit (6 month July rule)
      const fyCheck = isDueForCaregiverOutreach(p);

      return routineCheck || fyCheck;
    });
  }, [activeParticipants]);
  
  // Average program attendance standing
  let sumAvg = 0;
  let activeParticipantCount = 0;
  activeParticipants.forEach(p => {
    const stats = participantStatsMap[p.id];
    if (stats && stats.totalSessions > 0) {
      sumAvg += stats.attendanceRate;
      activeParticipantCount++;
    }
  });
  const overallAttendanceRate = activeParticipantCount > 0 ? Math.round(sumAvg / activeParticipantCount) : 100;

  // Base64Url encoder utility for Gmail API payload conformability
  const base64UrlEncode = (str: string) => {
    const bytes = new TextEncoder().encode(str);
    let binString = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binString += String.fromCharCode(bytes[i]);
    }
    return btoa(binString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  // Safe outreach email notification report to center staff via Gmail API
  const sendOutreachEmailAlert = async (sessionDate: string, force = false) => {
    if (!sessionDate) return;
    
    if (!force && lastEmailedSessionDate === sessionDate) {
      return;
    }

    const sessionObj = sessions.find(s => s.date === sessionDate);
    if (!sessionObj) return;

    const redAlerts = activeParticipants.filter(p => {
      const stats = participantStatsMap[p.id];
      return stats?.hasRedFlag && !isRedAlertSuppressed(p);
    });

    const yellowAlerts = activeParticipants.filter(p => {
      const stats = participantStatsMap[p.id];
      return stats?.hasYellowFlag && !isRedAlertSuppressed(p);
    });

    setIsSendingEmailAlert(true);
    setEmailAlertSuccess(null);
    setEmailAlertError(null);

    try {
      let token = googleAccessToken;

      if (!token) {
        try {
          const result = await signInWithPopup(auth, googleProvider);
          const credential = GoogleAuthProvider.credentialFromResult(result);
          if (credential?.accessToken) {
            token = credential.accessToken;
            setGoogleAccessToken(token);
          } else {
            throw new Error("Unable to obtain Gmail authorization scope from login credential.");
          }
        } catch (authErr: any) {
          throw new Error(`Gmail authorization failed: ${authErr?.message || authErr}`);
        }
      }

      let presentCount = 0;
      let absentCount = 0;
      let excusedCount = 0;
      activeParticipants.forEach(p => {
        const pAtt = attendance[p.id]?.[sessionDate];
        if (pAtt === 'present') presentCount++;
        else if (pAtt === 'absent') absentCount++;
        else if (pAtt === 'excused') excusedCount++;
      });
      const totalMarked = presentCount + absentCount + excusedCount;
      const rate = totalMarked > 0 ? Math.round((presentCount / totalMarked) * 100) : 0;

      const subject = `🚨 Lomuriangole CYDC: Alert Summary Report - Session ${sessionDate} (${sessionObj.label})`;
      
      let redSectionsHTML = '';
      if (redAlerts.length === 0) {
        redSectionsHTML = `
          <tr>
            <td colspan="5" style="padding: 16px; text-align: center; color: #15803d; font-weight: bold; border: 1px solid #cbd5e1; font-size: 13px;">
              ✅ Excellent! No active Red Flag alerts detected.
            </td>
          </tr>
        `;
      } else {
        redSectionsHTML = redAlerts.map(p => {
          const stats = participantStatsMap[p.id];
          return `
            <tr style="background-color: #fff1f2;">
              <td style="padding: 12px 16px; border: 1px solid #fecdd3; font-size: 13px; color: #1e293b; font-weight: bold;">${p.name}</td>
              <td style="padding: 12px 16px; border: 1px solid #fecdd3; font-size: 13px; color: #475569;">${p.cohort}</td>
              <td style="padding: 12px 16px; border: 1px solid #fecdd3; font-size: 12px; color: #be123c; font-weight: bold;">🚨 RED ALERT (${stats?.consecutiveAbsents ?? 0} Absences)</td>
              <td style="padding: 12px 16px; border: 1px solid #fecdd3; font-size: 13px; color: #be123c; font-weight: bold;">${stats?.attendanceRate ?? 0}% rate</td>
              <td style="padding: 12px 16px; border: 1px solid #fecdd3; font-size: 13px; color: #475569; line-height: 1.4;">Caregiver: ${p.caregiver}<br />Contact: ${p.contact}</td>
            </tr>
          `;
        }).join('');
      }

      let yellowSectionsHTML = '';
      if (yellowAlerts.length === 0) {
        yellowSectionsHTML = `
          <tr>
            <td colspan="5" style="padding: 16px; text-align: center; color: #64748b; font-weight: bold; border: 1px solid #cbd5e1; font-size: 13px;">
              ✅ No active Yellow Warning alerts.
            </td>
          </tr>
        `;
      } else {
        yellowSectionsHTML = yellowAlerts.map(p => {
          const stats = participantStatsMap[p.id];
          return `
            <tr style="background-color: #fffbeb;">
              <td style="padding: 12px 16px; border: 1px solid #fde68a; font-size: 13px; color: #1e293b; font-weight: bold;">${p.name}</td>
              <td style="padding: 12px 16px; border: 1px solid #fde68a; font-size: 13px; color: #475569;">${p.cohort}</td>
              <td style="padding: 12px 16px; border: 1px solid #fde68a; font-size: 12px; color: #b45309; font-weight: bold;">⚠️ Yellow Warning</td>
              <td style="padding: 12px 16px; border: 1px solid #fde68a; font-size: 13px; color: #b45309; font-weight: bold;">${stats?.attendanceRate ?? 0}% rate</td>
              <td style="padding: 12px 16px; border: 1px solid #fde68a; font-size: 13px; color: #475569; line-height: 1.4;">Caregiver: ${p.caregiver}<br />Contact: ${p.contact}</td>
            </tr>
          `;
        }).join('');
      }

      const emailBodyHTML = `
        <div style="background-color: #f8fafc; padding: 24px 16px; font-family: sans-serif; min-height: 100%;">
          <div style="max-width: 650px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <!-- Email Header -->
            <div style="background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">Lomuriangole CYDC (UG-1083)</h1>
              <p style="margin: 4px 0 0 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #e0e7ff;">Attendance & Student Welfare Alert Registry</p>
            </div>
            
            <!-- Context Summary -->
            <div style="padding: 24px; border-bottom: 1px solid #f1f5f9;">
              <h3 style="margin: 0 0 12px 0; font-size: 13px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; font-weight: bold;">Completed Session Analytics</h3>
              <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px;">
                <p style="margin: 0 0 8px 0; font-size: 13.5px; color: #334155;"><b>Activity Date:</b> ${sessionDate}</p>
                <p style="margin: 0 0 8px 0; font-size: 13.5px; color: #334155;"><b>Session Label:</b> ${sessionObj.label}</p>
                <p style="margin: 0; font-size: 13.5px; color: #334155;"><b>Participation Ledger:</b> ${presentCount} Present / ${absentCount} Absent / ${excusedCount} Excused <b>(${rate}% representation rate)</b></p>
              </div>
            </div>

            <!-- Red Alert Segment -->
            <div style="padding: 24px;">
              <h2 style="margin: 0 0 16px 0; font-size: 15px; color: #be123c; font-weight: 800; border-bottom: 2px solid #fecdd3; padding-bottom: 8px;">🚨 CRITICAL RED ALERTS (${redAlerts.length})</h2>
              <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead>
                  <tr style="background-color: #f1f5f9;">
                    <th style="padding: 10px 12px; border: 1px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; font-weight: bold;">Student</th>
                    <th style="padding: 10px 12px; border: 1px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; font-weight: bold;">Cohort</th>
                    <th style="padding: 10px 12px; border: 1px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; font-weight: bold;">Alert Status</th>
                    <th style="padding: 10px 12px; border: 1px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; font-weight: bold;">Rate</th>
                    <th style="padding: 10px 12px; border: 1px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; font-weight: bold;">Contact Details</th>
                  </tr>
                </thead>
                <tbody>
                  ${redSectionsHTML}
                </tbody>
              </table>
            </div>

            <!-- Yellow Warning Segment -->
            <div style="padding: 24px; padding-top: 0;">
              <h2 style="margin: 0 0 16px 0; font-size: 15px; color: #d97706; font-weight: 800; border-bottom: 2px solid #fde68a; padding-bottom: 8px;">⚠️ YELLOW WARNINGS (${yellowAlerts.length})</h2>
              <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead>
                  <tr style="background-color: #f1f5f9;">
                    <th style="padding: 10px 12px; border: 1px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; font-weight: bold;">Student</th>
                    <th style="padding: 10px 12px; border: 1px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; font-weight: bold;">Cohort</th>
                    <th style="padding: 10px 12px; border: 1px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; font-weight: bold;">Warning</th>
                    <th style="padding: 10px 12px; border: 1px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; font-weight: bold;">Rate</th>
                    <th style="padding: 10px 12px; border: 1px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; font-weight: bold;">Contact Details</th>
                  </tr>
                </thead>
                <tbody>
                  ${yellowSectionsHTML}
                </tbody>
              </table>
            </div>

            <!-- Email Actions Disclaimer / Footer -->
            <div style="background-color: #fafafa; padding: 20px 24px; border-top: 1px solid #f1f5f9; text-align: center;">
              <p style="margin: 0; font-size: 11px; line-height: 1.5; color: #94a3b8;">
                This automated email summary was compiled by the <b>Lomuriangole CYDC Case Management Engine</b> upon entering the attendance register for session ${sessionDate}. Immediate reach-outs and home visits are recommended for students flagged under Red Alerts.
              </p>
              <p style="margin: 8px 0 0 0; font-size: 10px; color: #cbd5e1; font-weight: bold;">
                Lomuriangole CYDC • UG-1083 Child Development Office
              </p>
            </div>
          </div>
        </div>
      `;

      const emailContentStr = [
        `To: ${staffEmailRecipient.trim()}`,
        `Subject: ${subject}`,
        'Content-Type: text/html; charset="utf-8"',
        'MIME-Version: 1.0',
        '',
        emailBodyHTML
      ].join('\n');

      const encodedMessage = base64UrlEncode(emailContentStr);

      const mailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          raw: encodedMessage
        })
      });

      if (!mailResponse.ok) {
        const errorText = await mailResponse.text();
        throw new Error(`Gmail API returned status ${mailResponse.status}: ${errorText}`);
      }

      setLastEmailedSessionDate(sessionDate);
      localStorage.setItem('attendance_tracker_last_emailed_session_date', sessionDate);
      setEmailAlertSuccess(`Successfully dispatched Red/Yellow alert summary email to staff (${staffEmailRecipient}) for Session ${sessionDate}!`);
      
      setTimeout(() => {
        setEmailAlertSuccess(null);
      }, 5000);

    } catch (err: any) {
      console.error("Gmail report sending error: ", err);
      setEmailAlertError(err?.message || "Failed to dispatch Gmail alert message.");
    } finally {
      setIsSendingEmailAlert(false);
    }
  };

  // Automatically trigger email summary when a session's attendance becomes fully marked
  useEffect(() => {
    if (!isAutomaticEmailEnabled || activeParticipants.length === 0 || sessions.length === 0) {
      return;
    }

    const pendingSessions = sessions.filter(s => s.date !== lastEmailedSessionDate);
    if (pendingSessions.length === 0) return;

    // Find if there is any pending session that is fully marked
    const fullyEnteredSession = pendingSessions.find(s => {
      return activeParticipants.every(p => {
        const status = attendance[p.id]?.[s.date];
        return status && status !== 'unmarked';
      });
    });

    if (fullyEnteredSession && googleAccessToken) {
      sendOutreachEmailAlert(fullyEnteredSession.date);
    }
  }, [
    sessions, 
    attendance, 
    activeParticipants, 
    isAutomaticEmailEnabled, 
    lastEmailedSessionDate, 
    googleAccessToken
  ]);

  // Derived state to check matched/unmatched active participants in the pasted attendance list
  const attendanceMatchingDetails = (() => {
    if (!attendanceImportText.trim()) {
      return { matchedIds: new Set<string>(), parsedRowsCount: 0 };
    }

    // Split raw text by line, clean cell contents
    const rows = attendanceImportText.split(/\r?\n/).map(line => {
      // Find delimiter (tab, semicolon, or comma)
      const delimiter = line.includes('\t') ? '\t' : (line.includes(';') ? ';' : ',');
      return line.split(delimiter)
        .map(cell => cell.trim().replace(/^["']|["']$/g, '').trim())
        .filter(Boolean);
    }).filter(row => row.length > 0);

    const matchedIds = new Set<string>();

    activeParticipants.forEach(p => {
      // Look for a match in any raw row cells
      const hasMatch = rows.some(row => {
        return row.some(cell => {
          const lowerCell = cell.toLowerCase();
          // Match by name (exact)
          if (p.name.toLowerCase() === lowerCell) return true;
          // Match by Name (loose word / split if name is long and close)
          if (lowerCell.length >= 3 && p.name.toLowerCase().includes(lowerCell)) return true;
          if (lowerCell.length >= 3 && lowerCell.includes(p.name.toLowerCase())) return true;
          // Match by contact
          if (p.contact && p.contact !== '-' && p.contact.toLowerCase() === lowerCell) return true;
          // Match by idNo
          if (p.idNo && p.idNo !== '-' && p.idNo.toLowerCase() === lowerCell) return true;
          // Match by database id
          if (p.id === cell) return true;
          return false;
        });
      });

      if (hasMatch) {
        matchedIds.add(p.id);
      }
    });

    return { matchedIds, parsedRowsCount: rows.length };
  })();

  // ---- COMPUTE SESSIONS ATTENDANCE TREND ----
  const sessionsTrendData = [...filteredSessionsForAnalytics]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(session => {
      let presentCount = 0;
      let excusedCount = 0;
      let absentCount = 0;
      
      participants.forEach(p => {
        const status = attendance[p.id]?.[session.date] || 'unmarked';
        if (status === 'present') {
          presentCount++;
        } else if (status === 'excused') {
          excusedCount++;
        } else if (status === 'absent') {
          absentCount++;
        }
      });
      
      const totalMarked = presentCount + excusedCount + absentCount;
      const rate = totalMarked > 0 
        ? Math.round(((presentCount + excusedCount) / totalMarked) * 100)
        : 0;
        
      return {
        date: session.date,
        shortDate: formatToShortDayMonth(session.date),
        label: session.label || 'Session',
        present: presentCount,
        excused: excusedCount,
        absent: absentCount,
        attendanceRate: rate,
        totalStudents: totalMarked,
      };
    });

  // ---- COMPUTE COHORT AVERAGE ATTENDANCE STATS ----
  const cohortComparisonData = (() => {
    const customCohorts = Array.from(new Set(participants.map(p => p.cohort))).filter(c => c && c !== 'All Cohorts');
    const allCohorts = Array.from(new Set([...COHORTS.filter(c => c !== 'All Cohorts'), ...customCohorts]));

    return allCohorts.map(cohortName => {
      const members = participants.filter(p => p.cohort === cohortName);

      const calcAvg = (list: typeof members) => {
        const listWithStats = list.filter(p => {
          const stats = participantStatsMap[p.id];
          return stats && stats.totalSessions > 0;
        });
        if (listWithStats.length === 0) return 0;
        const sum = listWithStats.reduce((acc, p) => acc + (participantStatsMap[p.id]?.attendanceRate || 0), 0);
        return Math.round(sum / listWithStats.length);
      };

      const males = members.filter(p => p.gender === 'Male');
      const females = members.filter(p => p.gender === 'Female');
      const others = members.filter(p => p.gender !== 'Male' && p.gender !== 'Female');

      const activeMembers = members.filter(p => !p.isFormer);
      const formerMembers = members.filter(p => p.isFormer);

      return {
        cohort: cohortName,
        maleRate: calcAvg(males),
        maleCount: males.length,
        femaleRate: calcAvg(females),
        femaleCount: females.length,
        othersRate: calcAvg(others),
        othersCount: others.length,
        activeRate: calcAvg(activeMembers),
        activeCount: activeMembers.length,
        formerRate: calcAvg(formerMembers),
        formerCount: formerMembers.length,
        overallRate: calcAvg(members),
        overallCount: members.length,
      };
    });
  })();

  // ---- COMPUTE 30-DAY HEATMAP DATA ----
  const heatmapDays = (() => {
    // Baseline is June 9, 2026. If standard system today is later, use that or slide based on max session.
    let referenceDate = new Date('2026-06-09');
    const today = new Date();
    if (today > referenceDate) {
      referenceDate = today;
    }
    
    // Check if any session date is later than referenceDate to dynamically slide the window
    sessions.forEach(s => {
      const sDate = new Date(s.date);
      if (!isNaN(sDate.getTime()) && sDate > referenceDate) {
        referenceDate = sDate;
      }
    });

    const dates: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(referenceDate.getTime());
      d.setDate(referenceDate.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
    }
    return dates;
  })();

  const heatmapWeeks = (() => {
    return heatmapDays.map(dateStr => {
      const session = sessions.find(s => s.date === dateStr);
      
      let presentCount = 0;
      let excusedCount = 0;
      let absentCount = 0;
      let unmarkedCount = 0;
      const absentParticipants: Participant[] = [];
      
      if (session) {
        participants.forEach(p => {
          const status = attendance[p.id]?.[dateStr] || 'unmarked';
          if (status === 'present') presentCount++;
          else if (status === 'excused') excusedCount++;
          else if (status === 'absent') {
            absentCount++;
            absentParticipants.push(p);
          }
          else unmarkedCount++;
        });
      }
      
      const totalCount = presentCount + excusedCount + absentCount;
      const rate = totalCount > 0 ? Math.round(((presentCount + excusedCount) / totalCount) * 100) : null;
      
      let statusBucket: 'none' | 'crit' | 'warn' | 'good' | 'empty' = 'none';
      if (session) {
        if (totalCount === 0) {
          statusBucket = 'empty';
        } else if (rate !== null) {
          if (rate >= 80) statusBucket = 'good';
          else if (rate >= 50) statusBucket = 'warn';
          else statusBucket = 'crit';
        }
      }
      
      return {
        date: dateStr,
        session,
        presentCount,
        excusedCount,
        absentCount,
        unmarkedCount,
        attendanceRate: rate,
        totalCount,
        statusBucket,
        absentParticipants,
      };
    });
  })();

  // ---- FILTERING LOGIC ----
  const filteredParticipants = activeParticipants.filter(part => {
    const matchesSearch = 
      part.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (part.idNo && part.idNo.toLowerCase().includes(searchQuery.toLowerCase())) ||
      part.contact.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCohort = selectedCohort === 'All Cohorts' || part.cohort === selectedCohort;
    
    let matchesSegment = true;
    if (selectedSegment !== 'all') {
      if (selectedSegment === 'male') {
        matchesSegment = part.gender === 'Male';
      } else if (selectedSegment === 'female') {
        matchesSegment = part.gender === 'Female';
      } else {
        const ageStr = part.dob ? calculateAgeFromDob(part.dob) : part.age;
        const parsedAge = ageStr ? parseInt(ageStr, 10) : NaN;
        if (isNaN(parsedAge)) {
          matchesSegment = false;
        } else {
          if (selectedSegment === 'under12') {
            matchesSegment = parsedAge < 12;
          } else if (selectedSegment === '12to14') {
            matchesSegment = parsedAge >= 12 && parsedAge <= 14;
          } else if (selectedSegment === '15to18') {
            matchesSegment = parsedAge >= 15 && parsedAge <= 18;
          } else if (selectedSegment === '19plus') {
            matchesSegment = parsedAge >= 19;
          }
        }
      }
    }

    const stats = getDashboardStats(part.id);
    let matchesFlag = true;
    if (selectedFlag === 'red') {
      matchesFlag = stats?.hasRedFlag === true;
    } else if (selectedFlag === 'yellow') {
      matchesFlag = stats?.hasYellowFlag === true;
    } else if (selectedFlag === 'normal') {
      matchesFlag = !stats?.hasRedFlag && !stats?.hasYellowFlag;
    } else if (selectedFlag === 'due_checkin') {
      matchesFlag = dueCheckInParticipantsList.some(dp => dp.id === part.id);
    }

    return matchesSearch && matchesCohort && matchesSegment && matchesFlag;
  }).sort((a, b) => {
    const statsA = getDashboardStats(a.id);
    const statsB = getDashboardStats(b.id);
    const rateA = statsA?.attendanceRate ?? 100;
    const rateB = statsB?.attendanceRate ?? 100;

    if (attendanceSortOrder === 'best') {
      if (rateA !== rateB) {
        return rateB - rateA; // High attendance first
      }
    } else if (attendanceSortOrder === 'worst') {
      if (rateA !== rateB) {
        return rateA - rateB; // Low attendance first
      }
    }

    const idA = a.idNo || '';
    const idB = b.idNo || '';
    
    const hasA = idA && idA !== '-';
    const hasB = idB && idB !== '-';
    
    if (!hasA && !hasB) return 0;
    if (!hasA) return 1; // place missing / placeholder at bottom
    if (!hasB) return -1;
    
    return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
  });

  // Selected participant details (for detailed side-sheet inspection)
  const inspectedParticipant = participants.find(p => p.id === selectedParticipantId);
  const inspectedStats = inspectedParticipant ? participantStatsMap[inspectedParticipant.id] : null;

  // ---- EVENT HANDLERS ----
  
  // Cyclic toggling of attendance for cell clicking
  const toggleAttendanceStatus = (participantId: string, dateStr: string) => {
    setAttendance(prev => {
      const currentRecord = prev[participantId] || {};
      const currentStatusValue: AttendanceStatus = currentRecord[dateStr] || 'unmarked';
      
      let nextStatus: AttendanceStatus = 'present';
      if (currentStatusValue === 'present') {
        nextStatus = 'absent';
      } else if (currentStatusValue === 'absent') {
        nextStatus = 'excused';
      } else if (currentStatusValue === 'excused') {
        nextStatus = 'unmarked';
      } else {
        nextStatus = 'present';
      }

      return {
        ...prev,
        [participantId]: {
          ...currentRecord,
          [dateStr]: nextStatus
        }
      };
    });
  };

  // Specific assignment function for dropdown/select switching
  const setSpecificAttendance = (participantId: string, dateStr: string, status: AttendanceStatus) => {
    setAttendance(prev => {
      const currentRecord = prev[participantId] || {};
      return {
        ...prev,
        [participantId]: {
          ...currentRecord,
          [dateStr]: status
        }
      };
    });
  };

  // Bulk set attendance for all displayed participants
  const handleBulkSetAttendance = (status: 'present' | 'absent') => {
    const targetDate = bulkTargetDate || (sessions[0]?.date || '');
    if (!targetDate) {
      alert("No active sessions exist yet. Please add a session date first before performing bulk updates.");
      return;
    }

    const sessionObj = sessions.find(s => s.date === targetDate);
    const sessionLabel = sessionObj ? `"${sessionObj.label}" (${targetDate})` : targetDate;

    if (!confirm(`Are you sure you want to set the attendance status of all ${filteredParticipants.length} currently displayed participants to "${status === 'present' ? 'Present' : 'Absent'}" for the session ${sessionLabel}?`)) {
      return;
    }

    setAttendance(prev => {
      const updated = { ...prev };
      filteredParticipants.forEach(p => {
        if (!updated[p.id]) {
          updated[p.id] = {};
        }
        updated[p.id] = {
          ...updated[p.id],
          [targetDate]: status
        };
      });

      // Trigger automatic backup download of system data upon session finish / bulk updates
      if (isAutoDownloadEnabled) {
        setTimeout(() => {
          triggerAutomatedDownload('SessionFinish', { attendance: updated });
        }, 150);
      }

      return updated;
    });
  };

  // Safe adding of active participant
  const handleAddParticipant = (e: FormEvent) => {
    e.preventDefault();
    if (!newPartName.trim()) return;

    const newId = `p_${Date.now()}`;
    const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const cleanContact = newPartContact.trim() || '-';
    
    const newParticipant: Participant = {
      id: newId,
      name: newPartName.trim(),
      contact: cleanContact,
      cohort: newPartCohort,
      joinDate: new Date().toISOString().split('T')[0],
      avatarColor: randomColor,
      registrationNotes: newPartNotes.trim() || 'No initial notes registered.',
      outreachNotes: [],
      idNo: newPartIdNo.trim() || '-',
      age: newPartAge.trim() || '-',
      dob: newPartDob.trim() || undefined,
      village: newPartVillage.trim() || '-',
      caregiver: newPartCaregiver.trim() || '-',
      gender: newPartGender.trim() || '-'
    };

    setParticipants(prev => [...prev, newParticipant]);
    
    // Pre-populate unmarked attendance for previous dates
    setAttendance(prev => {
      const recordsForParticipant: { [date: string]: AttendanceStatus } = {};
      sessions.forEach(s => {
        recordsForParticipant[s.date] = 'unmarked';
      });
      return {
        ...prev,
        [newId]: recordsForParticipant
      };
    });

    // Reset Form & Close
    setNewPartName('');
    setNewPartIdNo('');
    setNewPartAge('');
    setNewPartDob('');
    setNewPartVillage('');
    setNewPartCaregiver('');
    setNewPartContact('');
    setNewPartGender('');
    setNewPartNotes('');
    setIsAddParticipantOpen(false);
  };

  // Safe adding of tracking sessions/dates
  const handleAddSession = (e: FormEvent) => {
    e.preventDefault();
    if (!newSessionDate) return;

    // Check if session date already exists
    if (sessions.some(s => s.date === newSessionDate)) {
      alert('A tracker session for this date is already established.');
      return;
    }

    const newSession: Session = {
      date: newSessionDate,
      label: newSessionLabel.trim() || `Session ${sessions.length + 1}`
    };

    // Add session, sorting chronological
    setSessions(prev => {
      const newList = [...prev, newSession];
      return newList.sort((a, b) => a.date.localeCompare(b.date));
    });

    // Initialize participants entries for this session
    setAttendance(prev => {
      const updated = { ...prev };
      participants.forEach(p => {
        if (!updated[p.id]) {
          updated[p.id] = {};
        }
        updated[p.id][newSessionDate] = 'unmarked';
      });
      return updated;
    });

    setNewSessionLabel('');
    setIsAddSessionOpen(false);
  };

  // Safe logging of Outreach action
  const handleAddOutreachLog = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedParticipantId || !newLogNotes.trim()) return;

    const newLog: OutreachLog = {
      id: `l_${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      status: newLogStatus,
      notes: newLogNotes.trim(),
      loggedBy: newLoggedBy.trim() || 'Manager Operation'
    };

    setParticipants(prev => prev.map(p => {
      if (p.id === selectedParticipantId) {
        return {
          ...p,
          outreachNotes: [newLog, ...(p.outreachNotes || [])]
        };
      }
      return p;
    }));

    setNewLogNotes('');
    setNewLoggedBy('');
  };

  // Delete an outreach note
  const handleDeleteOutreachLog = (participantId: string, logId: string) => {
    setParticipants(prev => prev.map(p => {
      if (p.id === participantId) {
        return {
          ...p,
          outreachNotes: (p.outreachNotes || []).filter(log => log.id !== logId)
        };
      }
      return p;
    }));
  };

  // Update outreach log status
  const handleUpdateOutreachLogStatus = (participantId: string, logId: string, newStatus: 'pending' | 'contacted' | 'resolved') => {
    setParticipants(prev => prev.map(p => {
      if (p.id === participantId) {
        return {
          ...p,
          outreachNotes: (p.outreachNotes || []).map(log => 
            log.id === logId ? { ...log, status: newStatus } : log
          )
        };
      }
      return p;
    }));
  };

  // Parser for raw pasted / uploaded text (JSON or CSV format)
  const parseRawText = (text: string) => {
    if (!text.trim()) {
      setParsedImportList([]);
      setImportError(null);
      return;
    }
    
    try {
      const trimmed = text.trim();
      // Try array JSON parsing first
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const json = JSON.parse(trimmed);
        if (Array.isArray(json)) {
          const parsed = json.map((item: any, idx) => {
            const name = String(item.name || item.Name || '').trim();
            const contactInput = String(item.contact || item.Contact || item.phone || item.Phone || item.email || item.Email || '').trim();
            const cohort = String(item.cohort || item.Cohort || 'Victors Class').trim();
            const notes = String(item.notes || item.Notes || item.registrationNotes || '').trim();
            
            const idNo = String(item.idNo || item.id_no || item.id || item['id No.'] || item['ID No.'] || '').trim();
            const age = String(item.age || item.Age || '').trim();
            const gender = String(item.gender || item.Gender || item.sex || item.Sex || '').trim();
            const village = String(item.village || item.Village || '').trim();
            const caregiver = String(item.caregiver || item.Caregiver || '').trim();

            const contact = contactInput || '-';

            const errs: string[] = [];
            if (!name) errs.push('Missing Name');
            
            if (contact && contact !== '-' && participants.some(p => p.contact.toLowerCase() === contact.toLowerCase())) {
              errs.push('Duplicate Contact');
            }

            return {
              id: `temp_${idx}_${Date.now()}`,
              name,
              contact,
              cohort: COHORTS.includes(cohort) ? cohort : 'Victors Class',
              registrationNotes: notes || 'Imported via JSON.',
              isValid: errs.length === 0,
              errors: errs,
              importChecked: errs.length === 0,
              idNo: idNo || '-',
              age: age || '-',
              gender: gender || '-',
              village: village || '-',
              caregiver: caregiver || '-'
            };
          });
          setParsedImportList(parsed);
          setImportError(null);
          return;
        }
      }
    } catch (e) {
      // ignore JSON errors and fallback to CSV/TSV
    }

    // CSV/TSV / Semicolon / Pipe parsing
    const lines = text.split(/\r?\n/);
    const parsedData: any[] = [];
    let detectedHeaders = false;
    let headerIndexMap = { name: 0, idNo: -1, age: -1, gender: -1, village: -1, caregiver: -1, cohort: -1, contact: -1, notes: -1 };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      let delimiter = ',';
      if (line.includes('\t')) delimiter = '\t';
      else if (line.includes(';')) delimiter = ';';
      else if (line.includes('|')) delimiter = '|';

      const columns = line.split(delimiter).map(c => c.replace(/^["']|["']$/g, '').trim());

      // Identify if the row is actually a header row
      const isHeaderRow = i === 0 && columns.some(col => 
        ['name', 'fullname', 'contact', 'phone', 'email', 'cohort', 'notes', 'notes/dietary', 'id no.', 'id no', 'age', 'gender', 'sex', 'village', 'caregiver'].includes(col.toLowerCase().trim())
      );

      if (isHeaderRow) {
        detectedHeaders = true;
        columns.forEach((col, idx) => {
          const lCol = col.toLowerCase().trim();
          if (lCol.includes('name')) headerIndexMap.name = idx;
          if (lCol.includes('contact') || lCol.includes('phone') || lCol.includes('email')) headerIndexMap.contact = idx;
          if (lCol.includes('cohort')) headerIndexMap.cohort = idx;
          if (lCol.includes('note')) headerIndexMap.notes = idx;
          if (lCol.includes('id no') || lCol.includes('id number') || lCol === 'id') headerIndexMap.idNo = idx;
          if (lCol === 'age') headerIndexMap.age = idx;
          if (lCol === 'gender' || lCol === 'sex') headerIndexMap.gender = idx;
          if (lCol === 'village') headerIndexMap.village = idx;
          if (lCol === 'caregiver') headerIndexMap.caregiver = idx;
        });
        continue;
      }

      // Default order mapping if no header is detected: Name, ID No., Age, Gender, Village, Caregiver, Cohort, Contact, Notes
      const name = columns[headerIndexMap.name] || (headerIndexMap.name === 0 || !detectedHeaders ? columns[0] : '') || '';
      const rawContact = headerIndexMap.contact !== -1 ? (columns[headerIndexMap.contact] || '') : (detectedHeaders ? '' : (columns[7] || ''));
      const cohort = headerIndexMap.cohort !== -1 ? (columns[headerIndexMap.cohort] || 'Victors Class') : (detectedHeaders ? 'Victors Class' : (columns[6] || 'Victors Class'));
      const notes = headerIndexMap.notes !== -1 ? (columns[headerIndexMap.notes] || '') : (detectedHeaders ? '' : (columns[8] || ''));
      
      const idNo = headerIndexMap.idNo !== -1 ? (columns[headerIndexMap.idNo] || '') : (detectedHeaders ? '' : (columns[1] || ''));
      const age = headerIndexMap.age !== -1 ? (columns[headerIndexMap.age] || '') : (detectedHeaders ? '' : (columns[2] || ''));
      const gender = headerIndexMap.gender !== -1 ? (columns[headerIndexMap.gender] || '') : (detectedHeaders ? '' : (columns[3] || ''));
      const village = headerIndexMap.village !== -1 ? (columns[headerIndexMap.village] || '') : (detectedHeaders ? '' : (columns[4] || ''));
      const caregiver = headerIndexMap.caregiver !== -1 ? (columns[headerIndexMap.caregiver] || '') : (detectedHeaders ? '' : (columns[5] || ''));

      if (!name) continue;

      const contact = rawContact.trim() || '-';

      const errs: string[] = [];
      if (!name) errs.push('Missing Name');
      
      if (contact && contact !== '-' && participants.some(p => p.contact.toLowerCase() === contact.toLowerCase())) {
        errs.push('Already Enrolled');
      }

      parsedData.push({
        id: `temp_${i}_${Date.now()}`,
        name,
        contact,
        cohort: COHORTS.includes(cohort) ? cohort : 'Victors Class',
        registrationNotes: notes || 'Imported via CSV excel template.',
        isValid: errs.length === 0,
        errors: errs,
        importChecked: errs.length === 0,
        idNo: idNo || '-',
        age: age || '-',
        gender: gender || '-',
        village: village || '-',
        caregiver: caregiver || '-'
      });
    }

    setParsedImportList(parsedData);
    setImportError(null);
  };

  // Drag and drop handlers
  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result || '');
      setImportText(text);
      parseRawText(text);
    };
    reader.readAsText(file);
  };

  // Inline changes to parsed candidates before confirming
  const updateCandidateCohort = (tempId: string, value: string) => {
    setParsedImportList(prev => prev.map(item => 
      item.id === tempId ? { ...item, cohort: value } : item
    ));
  };

  const toggleCandidateCheck = (tempId: string) => {
    setParsedImportList(prev => prev.map(item => 
      item.id === tempId ? { ...item, importChecked: !item.importChecked } : item
    ));
  };

  const executeBulkImport = () => {
    const listToImport = parsedImportList.filter(item => item.importChecked);
    if (listToImport.length === 0) {
      alert('Please check at least one valid participant to import.');
      return;
    }

    const newImportedList: Participant[] = listToImport.map(item => {
      const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
      return {
        id: `p_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        name: item.name,
        contact: item.contact || '-',
        cohort: item.cohort,
        joinDate: new Date().toISOString().split('T')[0],
        avatarColor: randomColor,
        registrationNotes: item.registrationNotes || 'Imported via Bulk List.',
        outreachNotes: [],
        idNo: (item as any).idNo || '-',
        age: (item as any).age || '-',
        gender: (item as any).gender || '-',
        village: (item as any).village || '-',
        caregiver: (item as any).caregiver || '-',
        isPermanent: true,
        isImported: true
      };
    });

    // Merge into participants
    setParticipants(prev => [...prev, ...newImportedList]);

    // Initialize default unmarked statuses for all current program schedule dates
    setAttendance(prev => {
      const updated = { ...prev };
      newImportedList.forEach(p => {
        updated[p.id] = {};
        sessions.forEach(s => {
          updated[p.id][s.date] = 'unmarked';
        });
      });
      return updated;
    });

    // Reset view state
    setIsImportOpen(false);
    setImportText('');
    setParsedImportList([]);
    setUploadedFileName(null);
  };

  // Download Excel/CSV Roster Import template matching specified columns
  const downloadRosterTemplate = () => {
    // Columns order: Name, ID No., Age, Gender, Village, Caregiver, Cohort, Contact, Intake Notes
    const headers = ["Name", "ID No.", "Age", "Gender", "Village", "Caregiver", "Cohort", "Contact", "Intake Notes"];
    const sampleRows = [
      ["Liam Sterling", "ID-88220", "21", "Male", "Eldoret East", "Grace Okafor", "Victors Class", "+254711223344", "Fast learner, prefers morning slot"],
      ["Jane Chep", "ID-56193", "22", "Female", "Kimumu", "Min-Ji Kim", "Champions Class", "+254722334455", "Consistent attendance"],
      ["David Kiprop", "ID-45912", "20", "Male", "Chepkoilel", "Andrew Chen", "Overcomers Class", "+254733445566", "Strong problem solver"]
    ];

    const csvContent = [
      headers.join(","),
      ...sampleRows.map(row => row.map(val => `"${val.replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "participants_import_template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  // High-fidelity PDF document generation for physical folder filing
  const downloadManagerNotificationPDF = (participant: Participant, originalStats: AttendanceStats, shouldPrint: boolean = false) => {
    // Filter sessions based on Selected Export Date Range Filter
    let pdfSessions = [...sessions];
    if (dossierStartDate) {
      pdfSessions = pdfSessions.filter(s => s.date >= dossierStartDate);
    }
    if (dossierEndDate) {
      pdfSessions = pdfSessions.filter(s => s.date <= dossierEndDate);
    }
    const stats = calculateParticipantStats(participant.id, pdfSessions, attendance);

    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Page dimensions
    const width = 210;
    const height = 297;
    const margin = 20;
    const contentWidth = width - (margin * 2); // 170

    let y = 15;

    // ---- OFFICIAL HIGH-FIDELITY HEADER BLOCK (COPIED EXACTLY FROM USER'S FORMAT) ----
    // Left and right visual logos removed per user instructions to maintain official simplicity.

    // Official Text Content in Center (Matching Image Format Exactly)
    const centerX = 105; // 210 / 2

    // 1. LOMURIANGOLE CHILD AND YOUTH DEVELOPMENT CENTER UG-1083
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42); // slate-900 (deep charcoal)
    doc.text("LOMURIANGOLE CHILD AND YOUTH DEVELOPMENT CENTER UG-1083", centerX, 17, { align: 'center' });

    // 2. P.O BOX 57 MOROTO, UGANDA
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85); // slate-700
    doc.text("P.O BOX 57 MOROTO, UGANDA", centerX, 21.5, { align: 'center' });

    // 3. TEL: 0778687473/ 078436428/0784522071
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text("TEL: ", centerX - 33, 26);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(217, 119, 6); // Amber-600
    doc.text("0778687473 / 078436428 / 0784522071", centerX + 5, 26, { align: 'center' });

    // 4. Email: lomuriangolecydc@gmail.com
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text("Email: ", centerX - 25, 30.5);
    
    doc.setTextColor(37, 99, 235); // Blue
    doc.text("lomuriangolecydc@gmail.com", centerX + 8, 30.5, { align: 'center' });

    // Separating thick black horizontal line right below the email
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);
    doc.line(margin, 34.5, width - margin, 34.5);

    // Official Sub-Header / Document title for Intervention
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("OFFICIAL ATTENDANCE INTERVENTION & COMMITMENT CONTRACT", centerX, 39.5, { align: 'center' });

    // Print/Issue Date on Top-Right of sub-header
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139); // slate-500
    const todayStr = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.text(`DATE OF ISSUE: ${todayStr}`, width - margin, 39.5, { align: 'right' });

    // Set starting coordinate for section 1
    y = 44;

    // 1. PARTICIPANT PROFILE & GENERAL IDENTIFIERS
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("1. PARTICIPANT PROFILE & PROGRAM ENROLLMENT", margin + 3, y + 5);
    y += 11;

    // Grid details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text("Participant Name:", margin + 3, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.name, margin + 40, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Assigned Cohort/Class:", margin + 95, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.cohort, margin + 138, y);

    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Caregiver Name:", margin + 3, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(pdfCaregiverName || participant.caregiver || 'N/A', margin + 40, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Village / Location:", margin + 95, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.village || 'N/A', margin + 138, y);

    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Contact Number:", margin + 3, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.contact || 'N/A', margin + 40, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Enrollment Join Date:", margin + 95, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(formatToReadableDate(participant.joinDate), margin + 138, y);

    y += 10;

    // 2. DEFICIENCY ANALYSIS
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text("2. ATTENDANCE TRAJECTORY & DEFICIENCY ANALYSIS", margin + 3, y + 5);
    y += 11;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Overall Presence Rate:", margin + 3, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(stats.attendanceRate < 80 ? 185 : 15, stats.attendanceRate < 80 ? 28 : 23, stats.attendanceRate < 80 ? 28 : 42);
    doc.text(`${stats.attendanceRate}%`, margin + 45, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Total Absent Sessions:", margin + 60, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(`${stats.totalAbsent} program sessions`, margin + 105, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Consecutive Absences:", margin + 122, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(`${stats.consecutiveAbsences} days in a row`, margin + 160, y);

    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(185, 28, 28);
    doc.text("Trigger Status:", margin + 3, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text("CRITICAL RED TRIGGER — Excessive absence patterns detected under the Center guidelines.", margin + 30, y);

    y += 10;

    // 3. DISCUSSION NOTES
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text("3. DETAILED ACTION & HOME OUTREACH DISCUSSION NOTES", margin + 3, y + 5);
    y += 11;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);

    let notesText = pdfDiscussionNotes.trim();
    if (!notesText) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184); // light grey
      notesText = "Use these blank margins to write structured, comprehensive notes from the caregiver check-in discussion:\n" +
                  "...........................................................................................................................................................................................................\n" +
                  "...........................................................................................................................................................................................................\n" +
                  "...........................................................................................................................................................................................................";
    }

    const splitNotes = doc.splitTextToSize(notesText, contentWidth - 6);
    doc.text(splitNotes, margin + 3, y);
    y += (splitNotes.length * 4.5) + 6;

    // 4. CAREGIVER COMMITMENT
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text("4. COMMITMENT OF THE CAREGIVER", margin + 3, y + 5);
    y += 11;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    
    let commitmentText = pdfCaregiverCommitment.trim();
    if (!commitmentText) {
      commitmentText = "The caregiver pledges to support regular developmental learning checks and will ensure continuous weekly attendance at Lomuriangole CYDC programs except under emergency or medical circumstances.";
    }
    const splitCommitment = doc.splitTextToSize(commitmentText, contentWidth - 6);
    doc.text(splitCommitment, margin + 3, y);
    y += (splitCommitment.length * 4.5) + 6;

    // 5. ACTION POINTS
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text("5. SYSTEM ACTION POINTS & AGREED FOLLOW-UPS", margin + 3, y + 5);
    y += 11;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    
    let actionsText = pdfActionPoints.trim();
    if (!actionsText) {
      actionsText = "1. Active phone follow-ups scheduled bi-weekly.\n2. Conduct regular home check-ins by youth tutors and center director.\n3. Keep manual attendance backup records inside client file.";
    }
    const splitActions = doc.splitTextToSize(actionsText, contentWidth - 6);
    doc.text(splitActions, margin + 3, y);
    y += (splitActions.length * 4.5) + 12;

    // Check height overlap for signature blocks. If too high, start fresh page
    if (y > 230) {
      doc.addPage();
      y = 20;
      doc.setFillColor(15, 23, 42);
      doc.rect(margin, y, contentWidth, 2, 'F');
      y += 8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text("Lomuriangole CYDC (UG 1083) - Signature Approvals Contract Continued", margin, y);
      y += 12;
    }

    // 6. SIGNATURES FROM STAFF AND CAREGIVER
    doc.setDrawColor(203, 213, 225); // light grey border
    doc.setLineWidth(0.3);
    
    // Caregiver Box
    doc.rect(margin, y, 77, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text("CAREGIVER AGREEMENT SIGNATURE", margin + 3, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text("I agree to the commitments specified above.", margin + 3, y + 10);
    doc.text(`Name: ${pdfCaregiverName || participant.caregiver || '...................................................'}`, margin + 3, y + 17);
    doc.text("Signature: .....................................................", margin + 3, y + 22);
    doc.text("Date: .............................................................", margin + 3, y + 27);

    // Center Staff Box
    doc.rect(margin + 93, y, 77, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text("CENTER REPRESENTATIVE SIGNATURE", margin + 96, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text("I verified this outreach execution.", margin + 96, y + 10);
    doc.text(`Staff Name: ${pdfStaffName || '.......................................................'}`, margin + 96, y + 17);
    doc.text("Signature: .....................................................", margin + 96, y + 22);
    doc.text("Date: .............................................................", margin + 96, y + 27);

    y += 37;

    // Director Approval Box
    doc.rect(margin, y, 170, 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text("OFFICIAL CENTER DIRECTORS / PROJECT MANAGER VERIFIED APPROVAL FOR FILE BACKUP", margin + 4, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text("Signature & Stamp: ..............................................................................", margin + 4, y + 11);
    doc.text("Date Filed: ....................................", margin + 110, y + 11);

    // Footer copyright
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text("Lomuriangole Child & Youth Development Center UG 1083 - Official Physical Records Document. All Rights Reserved.", width / 2, height - 10, { align: 'center' });

    // Save PDF
    const cleanName = participant.name.replace(/\s+/g, '_').toLowerCase();
    if (shouldPrint) {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
        }, 5000);
      };
    } else {
      doc.save(`manager_notification_${cleanName}.pdf`);
    }
  };

  // Helper to draw a mock scanned form on canvas to create a REAL base64 image representation
  const wrapFormText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
    const words = text.split(' ');
    let line = '';
    let currentY = y;
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, x, currentY);
        line = words[n] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currentY);
  };

  const createSampleFormBase64 = (type: 'enrollment' | 'medical' | 'school' | 'home_visit', studentName: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Draw background
    ctx.fillStyle = '#fcfdfd';
    ctx.fillRect(0, 0, 600, 800);

    // Border line offset
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, 560, 760);

    // Decorative stamps or lines
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let l = 100; l < 700; l += 50) {
      ctx.moveTo(35, l);
      ctx.lineTo(565, l);
    }
    ctx.stroke();

    // Header Fill
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(20, 20, 560, 90);
    ctx.strokeStyle = '#475569';
    ctx.beginPath();
    ctx.moveTo(20, 110);
    ctx.lineTo(580, 110);
    ctx.stroke();

    // Headers text
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('LOMURIANGOLE CHILD & YOUTH DEVELOPMENT CENTER', 40, 53);
    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('OFFICIAL INTEGRATED RECOVERY CASE RECORDS - PROJECT UG-1083', 40, 75);

    ctx.fillStyle = '#4f46e5';
    ctx.font = 'bold 13px sans-serif';

    if (type === 'enrollment') {
      ctx.fillText('INTAKE FILE: STUDENT ENROLLMENT APPLICATION', 45, 145);
      
      ctx.fillStyle = '#1e293b';
      ctx.font = '11px sans-serif';
      ctx.fillText(`Applicant Name: ${studentName}`, 45, 185);
      ctx.fillText('Designated Age: 11 years standard', 45, 215);
      ctx.fillText('Gender Representation: Male child', 45, 245);
      ctx.fillText('Primary Caregiver: Rebecca Akorot (Mother)', 45, 275);
      ctx.fillText('Contact Number: 0782-990-120', 45, 305);
      ctx.fillText('Registered Village Zone: Kalobeyei Outpost', 45, 335);
      ctx.fillText('Assigned Roster Cohort: Males 11-13 division', 45, 365);
      
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('STAFF ASSESSMENT COMMENTS:', 45, 410);
      ctx.font = 'italic 11px sans-serif';
      const notes = "Lokiru shows incredible discipline assisting family herding efforts. He expressed deep interest to learn science and math. Family lacks funds for clothing and books. Suggested to enroll him into Males 11-13 cohort structure with immediate tuition and school supplies support.";
      wrapFormText(ctx, notes, 45, 430, 500, 15);
    } else if (type === 'medical') {
      ctx.fillText('STAFF CLINICAL HEALTH REPORT & WELL-BEING LOGS', 45, 145);
      
      ctx.fillStyle = '#1e293b';
      ctx.font = '11px sans-serif';
      ctx.fillText(`Registered Student: ${studentName}`, 45, 185);
      ctx.fillText('Ascribed Blood Group: O Positive (O+)', 45, 215);
      ctx.fillText('Immunization Audit: Fully Vaccinated (BCG, Polio, Tetanus booster complete)', 45, 245);
      ctx.fillText('Medical Field Exam Date: 2026-05-18', 45, 275);
      
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('CHRONIC DISABILITIES & REHABILITATION NEEDS:', 45, 320);
      ctx.font = 'italic 11px sans-serif';
      const cond = "Child has mild exercise-induced asthma. Caseworkers should keep backup inhaler in staff lockers. No dietary allergies recorded. Body Mass Index is healthy.";
      wrapFormText(ctx, cond, 45, 340, 500, 15);

      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('EXAMINER REMARKS & NUTRIENTS RECOMMENDATION:', 45, 410);
      ctx.font = 'italic 11px sans-serif';
      const remarks = "Youth is physical active. Exhibits clear focus and height. Suggested for regular high-protein iron supplements during center weekend workshops to counter regional deficiencies. Overall clinical checkup is positive.";
      wrapFormText(ctx, remarks, 45, 430, 500, 15);
    } else if (type === 'school') {
      ctx.fillText('SCHOOL ACADEMIC TERMINAL RESULTS & REMARKS', 45, 145);
      
      ctx.fillStyle = '#1e293b';
      ctx.font = '11px sans-serif';
      ctx.fillText(`Target Student: ${studentName}`, 45, 185);
      ctx.fillText('Academic Institution: Moroto Central Primary School', 45, 215);
      ctx.fillText('Grade Level Standard: Primary 5 (P.5)', 45, 245);
      ctx.fillText('Assessment Interval: Term II Examinations', 45, 275);
      ctx.fillText('Terminal Rank: 4th place out of 45 students total', 45, 305);
      ctx.fillText('Aggregated Score Percentage: 82% terminal test average', 45, 335);
      
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('EDUCATOR REMARKS ON BEHAVIOR & INTERVENTIONS:', 45, 380);
      ctx.font = 'italic 11px sans-serif';
      const rem = "Lokiru Caleb is an exceptionally bright and highly participating child. He is highly proficient in mathematics, which is highly impressive. His key obstacle is occasional school absences because of livestock emergencies at home. With regular support, he will easily top the county.";
      wrapFormText(ctx, rem, 45, 400, 500, 15);
    } else {
      ctx.fillText('HOME WELLWARE & HOUSEHOLD SOCIAL FIELD FORM', 45, 145);
      
      ctx.fillStyle = '#1e293b';
      ctx.font = '11px sans-serif';
      ctx.fillText(`Welfare Case Selected: ${studentName}`, 45, 185);
      ctx.fillText('Visitation Date: 2026-06-02', 45, 215);
      ctx.fillText('Active Dependents in Shelter: 7 members standard', 45, 245);
      ctx.fillText('Living Quarters classification: Mud-plastered Manyatta dome structure', 45, 275);
      ctx.fillText('Primary Livelihood Source: Seasonal livestock trade and charcoal trading', 45, 305);
      
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('DETAILED WELFARE RISKS & FOOD SECURITY ANALYSIS:', 45, 350);
      ctx.font = 'italic 11px sans-serif';
      const risk = "Family is exposed to severe heat waves and drinking water is retrieved from shared non-treated local river bedwells. Currently lacks reliable sleeping mosquito nets, which spike high regional malaria cases on rainy seasons.";
      wrapFormText(ctx, risk, 45, 370, 500, 15);

      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('STAFF HOUSEHOLD ACTION RECOMMENDATIONS:', 45, 450);
      ctx.font = 'italic 11px sans-serif';
      const advice = "Provide two treated bednets to prevent malaria. Enroll the caregiver in the next center cereal and drinking-water distribution. Student must continue attending weekend workshop activities where clean filtered hydration is served.";
      wrapFormText(ctx, advice, 45, 470, 500, 15);
    }

    // Official approval stamp
    ctx.strokeStyle = 'rgba(79, 70, 229, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(380, 670, 160, 55);
    ctx.font = 'extrabold 8px monospace';
    ctx.fillStyle = 'rgba(79, 70, 229, 0.7)';
    ctx.fillText('LOMURIANGOLE REGISTRY', 390, 693);
    ctx.fillText('APPROVED FOR SYSTEM SCAN', 390, 710);

    return canvas.toDataURL('image/png');
  };

  const handleScanFormWithGeminiAPI = async (participantId: string) => {
    if (!scannedFilePreview) {
      setScanError("Please upload a file or select a pre-populated sample to scan.");
      return;
    }

    setIsScanningForm(true);
    setScanError(null);
    setScanProcessingStep("Opening secure API channel...");

    try {
      setScanProcessingStep("Transmitting scanned file to Gemini AI Case Scanner...");

      const response = await fetch("/api/gemini/analyze-form", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: scannedFilePreview,
          formType: scannedFormType,
          fileName: scanUploadedFileName || `scanned_${scannedFormType}_${new Date().toISOString().split('T')[0]}.png`
        })
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "Server failed to scan document.");
      }

      const result = await response.json();
      if (!result.success || !result.extracted) {
        throw new Error("No structured facts extracted from document.");
      }

      // Add scanned form to participant's record!
      const newFormRecord = {
        id: `form_${Date.now()}`,
        uploadDate: new Date().toISOString().split('T')[0],
        formType: scannedFormType,
        fileName: scanUploadedFileName || `scanned_${scannedFormType}_${new Date().toISOString().split('T')[0]}.png`,
        fileDataUrl: scannedFilePreview,
        extractedData: {
          [scannedFormType]: result.extracted
        }
      };

      setParticipants(prev => {
        const list = prev.map(p => {
          if (p.id === participantId) {
            const forms = p.scannedForms || [];
            return {
              ...p,
              scannedForms: [newFormRecord, ...forms]
            };
          }
          return p;
        });
        localStorage.setItem('attendance_tracker_participants', JSON.stringify(list));
        return list;
      });

      // Clear uploader fields after success!
      setScannedFilePreview(null);
      setScanUploadedFileName(null);
      setSelectedScanDocId(newFormRecord.id);
      setIsScanningForm(false);
      setScanProcessingStep("");

    } catch (err: any) {
      console.error(err);
      setScanError(err.message || "Failed to scan document. Try ensuring GEMINI_API_KEY is configured.");
      setIsScanningForm(false);
      setScanProcessingStep("");
    }
  };

  const handleApplyExtractedDemographics = (participantId: string, enrollmentData: any) => {
    if (!enrollmentData) return;
    
    setParticipants(prev => {
      const list = prev.map(p => {
        if (p.id === participantId) {
          return {
            ...p,
            name: enrollmentData.name || p.name,
            age: enrollmentData.age || p.age,
            gender: enrollmentData.gender || p.gender,
            village: enrollmentData.village || p.village,
            caregiver: enrollmentData.caregiver || p.caregiver,
            contact: enrollmentData.contact || p.contact,
            cohort: enrollmentData.cohort || p.cohort,
            registrationNotes: enrollmentData.registrationNotes || p.registrationNotes
          };
        }
        return p;
      });
      localStorage.setItem('attendance_tracker_participants', JSON.stringify(list));
      alert("Demographics applied! Student's official profile registration has been updated with the AI-extracted values.");
      return list;
    });
  };

  const handleDeleteScannedForm = (participantId: string, formId: string) => {
    if (window.confirm("Are you sure you want to delete this scanned welfare record from the dossier reports?")) {
      setParticipants(prev => {
        const list = prev.map(p => {
          if (p.id === participantId) {
            const forms = p.scannedForms || [];
            return {
              ...p,
              scannedForms: forms.filter(f => f.id !== formId)
            };
          }
          return p;
        });
        localStorage.setItem('attendance_tracker_participants', JSON.stringify(list));
        return list;
      });
      if (selectedScanDocId === formId) {
        setSelectedScanDocId(null);
      }
    }
  };

  const handleDocumentUpload = async (participantId: string, file: File) => {
    if (!auth.currentUser) {
      setDocUploadError("You must be logged in to upload official documents.");
      return;
    }
    
    setIsUploadingDoc(true);
    setDocUploadProgress(0);
    setDocUploadError(null);

    const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const storageRef = ref(storage, `documents/${participantId}/${docId}_${file.name}`);

    try {
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setDocUploadProgress(progress);
        },
        (error) => {
          console.error("Upload error:", error);
          setDocUploadError("Failed to upload document. Please try again.");
          setIsUploadingDoc(false);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            
            setParticipants(prev => {
              const list = prev.map(p => {
                if (p.id === participantId) {
                  const documents = p.documents || [];
                  return {
                    ...p,
                    documents: [
                      ...documents,
                      {
                        id: docId,
                        name: file.name,
                        uploadDate: new Date().toISOString(),
                        url: downloadURL
                      }
                    ]
                  };
                }
                return p;
              });
              localStorage.setItem('attendance_tracker_participants', JSON.stringify(list));
              return list;
            });
            setIsUploadingDoc(false);
            setDocUploadProgress(100);
            setTimeout(() => setDocUploadProgress(0), 2000);
          } catch (urlError) {
             console.error("Error getting download URL:", urlError);
             setDocUploadError("Failed to secure document URL.");
             setIsUploadingDoc(false);
          }
        }
      );
    } catch (error) {
       console.error("Upload failed", error);
       setDocUploadError("Communication with storage failed.");
       setIsUploadingDoc(false);
    }
  };

  const handleDeleteDocument = (participantId: string, docId: string) => {
    if (window.confirm("Are you sure you want to delete this official document? This action cannot be reverted.")) {
      setParticipants(prev => {
        const list = prev.map(p => {
          if (p.id === participantId) {
            const docs = p.documents || [];
            return {
              ...p,
              documents: docs.filter(d => d.id !== docId)
            };
          }
          return p;
        });
        localStorage.setItem('attendance_tracker_participants', JSON.stringify(list));
        return list;
      });
    }
  };

  // High-fidelity PDF generation for student complete attendance summary & profile
  const downloadStudentSummaryPDF = (participant: Participant, originalStats: AttendanceStats, shouldPrint: boolean = false) => {
    // Filter sessions based on Selected Export Date Range Filter
    let pdfSessions = [...sessions];
    if (dossierStartDate) {
      pdfSessions = pdfSessions.filter(s => s.date >= dossierStartDate);
    }
    if (dossierEndDate) {
      pdfSessions = pdfSessions.filter(s => s.date <= dossierEndDate);
    }
    const stats = calculateParticipantStats(participant.id, pdfSessions, attendance);

    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Page dimensions
    const width = 210;
    const height = 297;
    const margin = 20;
    const contentWidth = width - (margin * 2); // 170

    const centerX = 105; // 210 / 2

    // Helper functions for headers/footers to keep it elegant and DRY
    const drawHeader = (pageNumber: number) => {
      // 1. LOMURIANGOLE CHILD AND YOUTH DEVELOPMENT CENTER UG-1083
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42); // slate-900 (deep charcoal)
      doc.text("LOMURIANGOLE CHILD AND YOUTH DEVELOPMENT CENTER UG-1083", centerX, 17, { align: 'center' });

      // 2. P.O BOX 57 MOROTO, UGANDA
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85); // slate-700
      doc.text("P.O BOX 57 MOROTO, UGANDA", centerX, 21.5, { align: 'center' });

      // 3. TEL: 0778687473/ 078436428/0784522071
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      doc.text("TEL: ", centerX - 33, 26);
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(217, 119, 6); // Amber-600
      doc.text("0778687473 / 078436428 / 0784522071", centerX + 5, 26, { align: 'center' });

      // 4. Email: lomuriangolecydc@gmail.com
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text("Email: ", centerX - 25, 30.5);
      
      doc.setTextColor(37, 99, 235); // Blue
      doc.text("lomuriangolecydc@gmail.com", centerX + 8, 30.5, { align: 'center' });

      // Separating thick black horizontal line right below the email
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.4);
      doc.line(margin, 34.5, width - margin, 34.5);

      // Official Sub-Header / Document title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text("OFFICIAL INDIVIDUAL STUDENT ATTENDANCE & PROFILE DOSSIER", centerX, 39.5, { align: 'center' });

      // Print/Issue Date on Top-Right of sub-header
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139); // slate-500
      const todayStr = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
      doc.text(`DATE OF ISSUE: ${todayStr}`, width - margin, 39.5, { align: 'right' });
    };

    const drawFooter = (pageNo: number, totalPagesPlaceholder: string) => {
      // Footer copyright
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text("Lomuriangole Child & Youth Development Center UG 1083 - Official Physical Records Document. All Rights Reserved.", width / 2, height - 12, { align: 'center' });
    };

    // Draw First Page Header
    drawHeader(1);

    let y = 45;

    // 1. STUDENT PROFILE & GENERAL IDENTIFIERS
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("1. PARTICIPANT DEMOGRAPHICS & BACKGROUND", margin + 3, y + 5);
    y += 11;

    // Grid details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text("Participant Name:", margin + 3, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.name, margin + 35, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Assigned Cohort/Class:", margin + 95, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.cohort, margin + 135, y);

    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Caregiver Name:", margin + 3, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.caregiver || 'N/A', margin + 35, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Village / Location:", margin + 95, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.village || 'N/A', margin + 135, y);

    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Contact Number:", margin + 3, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.contact || 'N/A', margin + 35, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("ID Card Number:", margin + 95, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.idNo || 'N/A', margin + 135, y);

    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Registered Age:", margin + 3, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    const computedYears = participant.dob ? calculateAgeFromDob(participant.dob) : participant.age;
    doc.text(computedYears ? `${computedYears} years` : 'N/A', margin + 35, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Registered Gender:", margin + 95, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.gender || 'N/A', margin + 135, y);

    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Enrollment Join Date:", margin + 3, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(formatToReadableDate(participant.joinDate), margin + 35, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Roster Status:", margin + 95, y);
    doc.setFont('helvetica', 'bold');
    if (stats.hasRedFlag) {
      doc.setTextColor(220, 38, 38); // red-600
      doc.text("🔴 CRITICAL RED ALERT", margin + 135, y);
    } else if (stats.hasYellowFlag) {
      doc.setTextColor(245, 158, 11); // amber-500
      doc.text("🟡 ATTENTION REQUIRED", margin + 135, y);
    } else {
      doc.setTextColor(16, 185, 129); // emerald-500
      doc.text("🟢 IN GOOD STANDING", margin + 135, y);
    }

    y += 8;

    // Staff Notes inside Background Block
    if (participant.registrationNotes) {
      doc.setFillColor(250, 250, 250);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      
      const splitNotes = doc.splitTextToSize(`Staff Intake Remarks: ${participant.registrationNotes}`, contentWidth - 8);
      const boxHeight = (splitNotes.length * 4) + 6;
      doc.rect(margin, y, contentWidth, boxHeight, 'FD');
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(splitNotes, margin + 4, y + 4.5);
      y += boxHeight + 8;
    } else {
      y += 2;
    }

    // 2. PERIOD ATTENDANCE PERFORMANCE METRICS
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("2. ATTENDANCE TRAJECTORY & SUMMARY STATISTICS", margin + 3, y + 5);
    y += 11;

    // Four-column mini metrics grid
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    
    // Column 1: Attendance Rate
    doc.rect(margin, y, 40, 15);
    doc.setFont('helvetica', 'semibold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("ATTENDANCE RATE", margin + 3, y + 4.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(stats.attendanceRate < 80 ? 220 : 15, stats.attendanceRate < 80 ? 38 : 23, stats.attendanceRate < 80 ? 38 : 42);
    doc.text(`${stats.attendanceRate}%`, margin + 3, y + 11.5);

    // Column 2: Present / Absent Ratio
    doc.rect(margin + 42, y, 42, 15);
    doc.setFont('helvetica', 'semibold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("PRESENT / ABSENT", margin + 45, y + 4.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`${stats.totalPresent}P / ${stats.totalAbsent}A`, margin + 45, y + 11.5);

    // Column 3: Excused
    doc.rect(margin + 86, y, 40, 15);
    doc.setFont('helvetica', 'semibold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("EXCUSED SESSIONS", margin + 89, y + 4.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`${stats.totalExcused || 0}`, margin + 89, y + 11.5);

    // Column 4: Consecutive Absences
    doc.rect(margin + 128, y, 42, 15);
    doc.setFont('helvetica', 'semibold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("CURRENT STREAK", margin + 131, y + 4.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    if (stats.consecutiveAbsences > 0) {
      doc.setTextColor(185, 28, 28);
      doc.text(`${stats.consecutiveAbsences} Absences`, margin + 131, y + 11.5);
    } else {
      doc.setTextColor(16, 185, 129);
      doc.text("Active Presence", margin + 131, y + 11.5);
    }

    y += 22;

    // 3. DETAILED ATTENDANCE HISTORICAL LEDGER
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("3. HISTORICAL CHRONOLOGICAL ATTENDANCE ROSTER", margin + 3, y + 5);
    y += 11;

    // Table Headers
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, contentWidth, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("SESSION RECORD DATE", margin + 4, y + 4.5);
    doc.text("SESSION DESCRIPTIVE LABEL", margin + 55, y + 4.5);
    doc.text("ATTENDANCE MARK STATUS", margin + 125, y + 4.5);

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(margin, y + 6, margin + contentWidth, y + 6);
    y += 6;

    // Sort sessions chronologically (oldest to newest)
    const sortedSessions = [...pdfSessions].sort((sa, sb) => sa.date.localeCompare(sb.date));

    let currentPage = 1;

    sortedSessions.forEach((s) => {
      // If table row overflows page bounds, add page split
      if (y > 260) {
        drawFooter(currentPage, "TOTAL_PAGES_PLACEHOLDER");
        
        doc.addPage();
        currentPage++;
        
        // Setup new page header
        drawHeader(currentPage);
        y = 48;

        // Re-draw Table Headers on next page
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text("SESSION RECORD DATE (CONTINUED)", margin + 4, y + 4.5);
        doc.text("SESSION DESCRIPTIVE LABEL", margin + 55, y + 4.5);
        doc.text("ATTENDANCE MARK STATUS", margin + 125, y + 4.5);

        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.2);
        doc.line(margin, y + 6, margin + contentWidth, y + 6);
        y += 6;
      }

      const status = (attendance[participant.id] && attendance[participant.id][s.date]) || 'unmarked';
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);

      // Date column
      doc.text(formatToReadableDate(s.date), margin + 4, y + 4.5);
      
      // Label column
      const labelText = s.label || 'Regular Program Session';
      doc.text(labelText, margin + 55, y + 4.5);

      // Status column (with color)
      if (status === 'present') {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(16, 185, 129); // emerald-600
        doc.text("PRESENT", margin + 125, y + 4.5);
      } else if (status === 'absent') {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(220, 38, 38); // red-600
        doc.text("ABSENT", margin + 125, y + 4.5);
      } else if (status === 'excused') {
        doc.setFont('helvetica', 'semibold');
        doc.setTextColor(100, 116, 139); // slate-500
        doc.text("EXCUSED", margin + 125, y + 4.5);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(156, 163, 175); // gray-400
        doc.text("UNMARKED", margin + 125, y + 4.5);
      }

      // Draw light horizontal divider
      doc.setDrawColor(241, 245, 249);
      doc.line(margin, y + 6, margin + contentWidth, y + 6);
      
      y += 6;
    });

    y += 6;

    // 3.5. COHORT WELFARE SCANNED DOCUMENTS
    if (participant.scannedForms && participant.scannedForms.length > 0) {
      // check space
      if (y > 210) {
        drawFooter(currentPage, "TOTAL_PAGES_PLACEHOLDER");
        doc.addPage();
        currentPage++;
        drawHeader(currentPage);
        y = 48;
      }

      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y, contentWidth, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text("3.5. AI-EXTRACTED HEALTH & WELFARE SCANNED RECORDS", margin + 3, y + 5);
      y += 11;

      participant.scannedForms.forEach((form) => {
        if (y > 230) {
          drawFooter(currentPage, "TOTAL_PAGES_PLACEHOLDER");
          doc.addPage();
          currentPage++;
          drawHeader(currentPage);
          y = 48;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(79, 70, 229); // indigo
        const fType = form.formType.replace('_', ' ').toUpperCase();
        doc.text(`[${fType}] FILE: ${form.fileName} (Scanned: ${form.uploadDate})`, margin + 3, y);
        y += 4;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(51, 65, 85);

        let detailsText = "";
        if (form.formType === 'medical' && form.extractedData.medical) {
          const med = form.extractedData.medical;
          detailsText = `Blood Group: ${med.bloodType || 'N/A'} | Vaccination: ${med.vaccinationStatus || 'N/A'} | Recent Examination: ${med.recentCheckupDate || 'N/A'}\nChronic Conditions & Known Disabilities: ${med.disabilitiesOrConditions || 'None'}\nSummary Remarks: ${med.healthStatusSummary || 'N/A'}`;
        } else if (form.formType === 'school' && form.extractedData.school) {
          const sch = form.extractedData.school;
          detailsText = `School: ${sch.schoolName || 'N/A'} | Year/Grade: ${sch.gradeLevel || 'N/A'} | Assessment Term: ${sch.academicTerm || 'N/A'}\nAcademic Rank: ${sch.academicRank || 'N/A'} | Average Score Percentage: ${sch.averageScorePercentage ? sch.averageScorePercentage + '%' : 'N/A'}\nQualifications/Teacher Remarks: ${sch.teacherRemarks || 'None'}`;
        } else if (form.formType === 'home_visit' && form.extractedData.home_visit) {
          const hv = form.extractedData.home_visit;
          detailsText = `Visitation completed: ${hv.visitDate || 'N/A'} | Household Size: ${hv.householdSize || 'N/A'} residents | Shelter Category: ${hv.dwellingType || 'N/A'}\nFamily Income Livelihood: ${hv.familyLivelihood || 'N/A'}\nCritical Welfare Risks & Vulnerabilities: ${hv.riskVulnerabilitiesSummary || 'None'}\nCasework Staff Recommendations: ${hv.visitingStaffRecommendation || 'N/A'}`;
        } else if (form.formType === 'enrollment' && form.extractedData.enrollment) {
          const en = form.extractedData.enrollment;
          detailsText = `Intake Enrollee: ${en.name || 'N/A'} | Bio Profile: age ${en.age || 'N/A'}, gender ${en.gender || 'N/A'} | Village: ${en.village || 'N/A'}\nGuardian details: Parent ${en.caregiver || 'N/A'}, Phone ${en.contact || 'N/A'}\nRegistration Intake Notes: ${en.registrationNotes || 'N/A'}`;
        } else {
          const other = form.extractedData.other;
          detailsText = `Document Title: ${other?.title || 'Unknown'}\nBrief Summary description: ${other?.rawSummary || 'N/A'}\nTakeaways: ${other?.keyExtractedPoints?.join('; ') || 'N/A'}`;
        }

        const splitDetails = doc.splitTextToSize(detailsText, contentWidth - 10);
        doc.text(splitDetails, margin + 5, y);
        y += (splitDetails.length * 3.8) + 5;
      });
      y += 4;
    }

    // Check height space for signatures block.
    if (y > 235) {
      drawFooter(currentPage, "TOTAL_PAGES_PLACEHOLDER");
      doc.addPage();
      currentPage++;
      drawHeader(currentPage);
      y = 48;
    }

    // 4. SIGNATURES & ARCHIVE RECORD STAMP
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("4. SANCTION, CERTIFICATION & ARCHIVAL FILING", margin + 3, y + 5);
    y += 11;

    doc.setDrawColor(203, 213, 225); // light grey border
    doc.setLineWidth(0.3);
    
    // Parent/Caregiver box left side
    doc.rect(margin, y, 77, 28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text("PARENT / CAREGIVER ACKNOWLEDGEMENT", margin + 3, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text("Signature: .....................................................", margin + 3, y + 13);
    doc.text("Date: .............................................................", margin + 3, y + 21);

    // Center Staff Box right side
    doc.rect(margin + 93, y, 77, 28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text("CASEWORKER / STAFF CERTIFICATION", margin + 96, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text("Reviewing Officer: ............................................", margin + 96, y + 13);
    doc.text("Signature: ............................. Date: ...................", margin + 96, y + 21);

    y += 33;

    // Center Director box
    doc.rect(margin, y, 170, 15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text("OFFICIAL REVIEW AND CONSERVATIVE APPROVAL SEAL", margin + 4, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text("Project Manager Approval Stamp & Signature: .....................................................................  Date Filed: ....................", margin + 4, y + 10);

    // Final page footer draw
    drawFooter(currentPage, "TOTAL_PAGES_PLACEHOLDER");

    // Second pass: overprint correct page numbers on all pages
    const totalPages = currentPage;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(`Page ${i} of ${totalPages}`, width - margin, height - 12, { align: 'right' });
    }

    // Save PDF
    const cleanName = participant.name.replace(/\s+/g, '_').toLowerCase();
    if (shouldPrint) {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
        }, 5000);
      };
    } else {
      doc.save(`student_summary_${cleanName}.pdf`);
    }
  };

  // High-fidelity PDF generation for outreach message with official letterhead
  const downloadOutreachTemplatePDF = (participant: Participant, originalStats: AttendanceStats, flagType: 'yellow' | 'red', shouldPrint: boolean = false) => {
    // Filter sessions based on Selected Export Date Range Filter
    let pdfSessions = [...sessions];
    if (dossierStartDate) {
      pdfSessions = pdfSessions.filter(s => s.date >= dossierStartDate);
    }
    if (dossierEndDate) {
      pdfSessions = pdfSessions.filter(s => s.date <= dossierEndDate);
    }
    const stats = calculateParticipantStats(participant.id, pdfSessions, attendance);

    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Page dimensions
    const width = 210;
    const height = 297;
    const margin = 20;
    const contentWidth = width - (margin * 2); // 170

    // ---- OFFICIAL HIGH-FIDELITY HEADER BLOCK (COPIED EXACTLY FROM USER'S FORMAT) ----
    const centerX = 105; // 210 / 2

    // 1. LOMURIANGOLE CHILD AND YOUTH DEVELOPMENT CENTER UG-1083
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42); // slate-900 (deep charcoal)
    doc.text("LOMURIANGOLE CHILD AND YOUTH DEVELOPMENT CENTER UG-1083", centerX, 17, { align: 'center' });

    // 2. P.O BOX 57 MOROTO, UGANDA
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85); // slate-700
    doc.text("P.O BOX 57 MOROTO, UGANDA", centerX, 21.5, { align: 'center' });

    // 3. TEL: 0778687473/ 078436428/0784522071
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text("TEL: ", centerX - 33, 26);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(217, 119, 6); // Amber-600
    doc.text("0778687473 / 078436428 / 0784522071", centerX + 5, 26, { align: 'center' });

    // 4. Email: lomuriangolecydc@gmail.com
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text("Email: ", centerX - 25, 30.5);
    
    doc.setTextColor(37, 99, 235); // Blue
    doc.text("lomuriangolecydc@gmail.com", centerX + 8, 30.5, { align: 'center' });

    // Separating thick black horizontal line right below the email
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);
    doc.line(margin, 34.5, width - margin, 34.5);

    // Official Sub-Header / Document title for Outreach Communication
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    const titleText = flagType === 'red' 
      ? "OFFICIAL CRITICAL OUTREACH COMMUNIQUE & REPORT"
      : "OFFICIAL PARTICIPANT ENGAGEMENT CHECK-IN COMMUNIQUE";
    doc.text(titleText, centerX, 39.5, { align: 'center' });

    // Print/Issue Date on Top-Right of sub-header
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139); // slate-500
    const todayStr = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.text(`DATE OF ISSUE: ${todayStr}`, width - margin, 39.5, { align: 'right' });

    // Set starting coordinate for section 1
    let y = 44;

    // 1. PARTICIPANT PROFILE
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("1. PARTICIPANT PROFILE & PROGRAM ENROLLMENT", margin + 3, y + 5);
    y += 11;

    // Grid details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text("Participant Name:", margin + 3, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.name, margin + 40, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Assigned Cohort/Class:", margin + 95, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.cohort, margin + 138, y);

    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Caregiver Name:", margin + 3, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.caregiver || 'N/A', margin + 40, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Village / Location:", margin + 95, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.village || 'N/A', margin + 138, y);

    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Contact Number:", margin + 3, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.contact || 'N/A', margin + 40, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Staff Alert Category:", margin + 95, y);
    doc.setFont('helvetica', 'bold');
    if (flagType === 'red') {
      doc.setTextColor(185, 28, 28); // red-700
      doc.text("CRITICAL RED ALERT", margin + 138, y);
    } else {
      doc.setTextColor(217, 119, 6); // yellow-600/amber-600
      doc.text("ATTENTION YELLOW ALERT", margin + 138, y);
    }

    y += 10;

    // 2. ATTENDANCE TRAJECTORY METRICS
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text("2. ATTENDANCE TRAJECTORY METRICS", margin + 3, y + 5);
    y += 11;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Presence Rate:", margin + 3, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(stats.attendanceRate < 80 ? 185 : 15, stats.attendanceRate < 80 ? 28 : 23, stats.attendanceRate < 80 ? 28 : 42);
    doc.text(`${stats.attendanceRate}%`, margin + 40, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Total Absent Sessions:", margin + 70, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(`${stats.totalAbsent} session(s)`, margin + 115, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Consecutive Absences:", margin + 132, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(`${stats.consecutiveAbsences} days in a row`, margin + 172, y);

    y += 10;

    // 3. OUTREACH CORRESPONDENCE SPECIFICATIONS
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text("3. OUTREACH COMMUNICATION SPECIFICATIONS", margin + 3, y + 5);
    y += 11;

    const template = generateOutreachTemplate(participant, stats, flagType);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Suggested Subject:", margin + 3, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    const splitSubject = doc.splitTextToSize(template.subject, contentWidth - 40);
    doc.text(splitSubject, margin + 40, y);
    y += (splitSubject.length * 4.5) + 6;

    // 4. MESSAGE BODY
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text("4. PROPOSED OUTREACH MESSAGE BODY", margin + 3, y + 5);
    y += 11;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    const splitBody = doc.splitTextToSize(template.body, contentWidth - 6);
    doc.text(splitBody, margin + 3, y);
    y += (splitBody.length * 4.5) + 12;

    // Check height overlap for signature block. If close to edge, add new page
    if (y > 235) {
      doc.addPage();
      y = 20;
      doc.setFillColor(15, 23, 42);
      doc.rect(margin, y, contentWidth, 2, 'F');
      y += 8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text("Lomuriangole CYDC (UG 1083) - Outreach Communique Continued", margin, y);
      y += 10;
    }

    // 5. SIGNATURE & VERIFICATION
    doc.setDrawColor(203, 213, 225); // light grey border
    doc.setLineWidth(0.3);
    
    // Director/Staff box
    doc.rect(margin, y, 170, 26);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text("ACTION UNDERTAKEN & VERIFICATION STATEMENT", margin + 3, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text("I hereby certify that this outreach communication draft has been reviewed and successfully dispatched or scheduled for the participant.", margin + 3, y + 10);
    doc.text("Dispatched By Staff Name: .......................................  Signature: ......................................  Date Dispatched: .........................", margin + 3, y + 18);

    // Footer copyright
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text("Lomuriangole Child & Youth Development Center UG 1083 - Official Physical Records Document. All Rights Reserved.", width / 2, height - 10, { align: 'center' });

    // Save PDF
    const cleanName = participant.name.replace(/\s+/g, '_').toLowerCase();
    if (shouldPrint) {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
        }, 5000);
      };
    } else {
      doc.save(`outreach_message_${cleanName}.pdf`);
    }
  };

  // High-fidelity PDF generation for the overall Cohort AI Analytics report with Official Signatures
  const downloadCohortAIReportPDF = () => {
    if (!aiCohortReport) return;
    
    const doc = new jsPDF('p', 'mm', 'a4');
    const width = 210;
    const height = 297;
    const margin = 20;
    const contentWidth = width - (margin * 2); // 170
    const centerX = 105;

    let currentPage = 1;

    // Standard high-fidelity official letterhead header helper
    const drawHeader = (page: number) => {
      // 1. LOMURIANGOLE CHILD AND YOUTH DEVELOPMENT CENTER UG-1083
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42); 
      doc.text("LOMURIANGOLE CHILD AND YOUTH DEVELOPMENT CENTER UG-1083", centerX, 17, { align: 'center' });

      // 2. P.O BOX 57 MOROTO, UGANDA
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85); 
      doc.text("P.O BOX 57 MOROTO, UGANDA", centerX, 21.5, { align: 'center' });

      // 3. TEL: 0778687473/ 078436428/0784522071
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      doc.text("TEL: ", centerX - 33, 26);
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(217, 119, 6); // Amber-600
      doc.text("0778687473 / 078436428 / 0784522071", centerX + 5, 26, { align: 'center' });

      // 4. Email: lomuriangolecydc@gmail.com
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text("Email: ", centerX - 25, 30.5);
      
      doc.setTextColor(37, 99, 235); // Blue
      doc.text("lomuriangolecydc@gmail.com", centerX + 8, 30.5, { align: 'center' });

      // Separating thick black horizontal line
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.4);
      doc.line(margin, 34.5, width - margin, 34.5);

      // Sub-Header Document title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text("OFFICIAL CYDC ROSTER ENGAGEMENT & AI ANALYTICS CONSOLIDATED REPORT", centerX, 39.5, { align: 'center' });

      // Issue date and status line
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      const todayStr = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
      doc.text(`REPORT CONFIRED DATE: ${todayStr}`, margin, 44);
      doc.text(`STATUS: CORE COHORT SUCCESS BLUEPRINT`, width - margin, 44, { align: 'right' });

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.25);
      doc.line(margin, 46, width - margin, 46);
    };

    const drawFooter = (page: number, total: number | string) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(`Confidential Ledger — Lomuriangole Development Center (UG 1083)`, margin, height - 12);
      doc.text(`Page ${page} of ${total}`, width - margin, height - 12, { align: 'right' });
    };

    drawHeader(currentPage);
    let y = 52;

    // --- SECTION 1: EXECUTIVE BRIEF ---
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("1. EXECUTIVE COHORT ENGAGEMENT SYNOPSIS", margin + 3, y + 5);
    y += 11;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    
    const summaryLines = doc.splitTextToSize(aiCohortReport.cohortSummary, contentWidth - 4);
    doc.text(summaryLines, margin + 2, y);
    y += (summaryLines.length * 4) + 6;

    // --- SECTION 2: WELFARE SEGMENTS & RISK METRICS -----
    if (y > 220) {
      drawFooter(currentPage, "TOTAL_PAGES_PLACEHOLDER");
      doc.addPage();
      currentPage++;
      drawHeader(currentPage);
      y = 52;
    }

    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("2. ROSTER HEALTH & ENGAGEMENT CLASSIFICATION DISTRIBUTION", margin + 3, y + 5);
    y += 11;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);

    const riskLines = doc.splitTextToSize(aiCohortReport.overallRiskDistribution, contentWidth - 4);
    doc.text(riskLines, margin + 2, y);
    y += (riskLines.length * 4) + 8;

    // --- SECTION 3: STUDENT ADVISORY BREAKDOWNS -----
    if (y > 210) {
      drawFooter(currentPage, "TOTAL_PAGES_PLACEHOLDER");
      doc.addPage();
      currentPage++;
      drawHeader(currentPage);
      y = 52;
    }

    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("3. PERSONALIZED INDIVIDUAL PARTICIPANT ENGAGEMENT EVALUATIONS", margin + 3, y + 5);
    y += 11;

    // We loop through students inside the report
    aiCohortReport.studentReports.forEach((report, index) => {
      const synSplit = doc.splitTextToSize(`"${report.synopsis}"`, contentWidth - 8);
      const actionSplit = doc.splitTextToSize(`Recommended Action: ${report.recommendedAction}`, contentWidth - 30);
      
      const itemHeight = 6 + (synSplit.length * 4) + (actionSplit.length * 3.8) + 8;
      
      if (y + itemHeight > 265) {
        drawFooter(currentPage, "TOTAL_PAGES_PLACEHOLDER");
        doc.addPage();
        currentPage++;
        drawHeader(currentPage);
        y = 52;
        
        // Lead-in tag
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text("SECTION 3: INDIVIDUAL ADVISORY PROFILE SUMMARY INDEX (CONTINUED)", margin, y);
        y += 6;
      }

      // Draw light outline panel box
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setFillColor(252, 253, 254);
      doc.rect(margin, y, contentWidth, itemHeight - 2, 'FD');

      // Index and Name indicator
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(`${index + 1}. Student: ${report.name}`, margin + 3, y + 5);

      // Status flag color choices
      let stColor = [37, 99, 235]; 
      if (report.standing.toLowerCase().includes('critical') || report.standing.toLowerCase().includes('risk') || report.standing.toLowerCase().includes('warning') || report.standing.toLowerCase().includes('red')) {
        stColor = [220, 38, 38]; 
      } else if (report.standing.toLowerCase().includes('moderate') || report.standing.toLowerCase().includes('yellow') || report.standing.toLowerCase().includes('amber')) {
        stColor = [217, 119, 6]; 
      } else if (report.standing.toLowerCase().includes('safe') || report.standing.toLowerCase().includes('stable') || report.standing.toLowerCase().includes('green')) {
        stColor = [5, 150, 105]; 
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(stColor[0], stColor[1], stColor[2]);
      doc.text(`Standing: ${report.standing}`, margin + contentWidth - 62, y + 5, { align: 'right' });

      doc.setTextColor(100, 116, 139);
      doc.text(`Rate: ${report.attendanceRate}`, margin + contentWidth - 3, y + 5, { align: 'right' });

      let currentSubY = y + 10;

      // Evaluative Synopsis
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(synSplit, margin + 4, currentSubY);
      currentSubY += (synSplit.length * 4) + 1.5;

      // Recommended Staff Actions
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(79, 70, 229); // indigo-600
      doc.text("Field Action Plan: ", margin + 4, currentSubY);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(51, 65, 85);
      doc.text(actionSplit, margin + 26, currentSubY);
      
      y += itemHeight;
    });

    // --- SECTION 4: DOUBLE-STAFF ENDORSEMENT SIGN-OFFS (PREPARED & APPROVED) ---
    // CDO WHO PREPARES & PD WHO APPROVES
    if (y > 220) {
      drawFooter(currentPage, "TOTAL_PAGES_PLACEHOLDER");
      doc.addPage();
      currentPage++;
      drawHeader(currentPage);
      y = 52;
    }

    y += 4;

    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("4. EXECUTIVE ADVISORY SIGN-OFF & ENDORSEMENTS", margin + 3, y + 5);
    y += 11;

    doc.setDrawColor(203, 213, 225); // light Slate border
    doc.setLineWidth(0.35);

    // Left card box: Prepared by CDO
    doc.rect(margin, y, 78, 33);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text("PREPARED BY:", margin + 4, y + 5.5);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text("Signature: ..............................................................", margin + 4, y + 12.5);
    doc.setFont('helvetica', 'bold');
    doc.text("Child Development Officer (CDO)", margin + 4, y + 19.5);
    doc.setFont('helvetica', 'normal');
    doc.text("Date of Preparation: ____ / ____ / ________", margin + 4, y + 26.5);

    // Right card box: Approved by PD
    doc.rect(margin + 92, y, 78, 33);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text("APPROVED BY:", margin + 96, y + 5.5);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text("Signature: ..............................................................", margin + 96, y + 12.5);
    doc.setFont('helvetica', 'bold');
    doc.text("Project Director (PD)", margin + 96, y + 19.5);
    doc.setFont('helvetica', 'normal');
    doc.text("Date of Approval:  ____ / ____ / ________", margin + 96, y + 26.5);

    y += 38;

    // Official sealing line
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text("Official Lomuriangole CYDC Engagement Summary. Retain copy strictly in local master cabinet.", centerX, y, { align: 'center' });

    // Print headers and page counts on all pages in a subsequent loop
    const totalPages = currentPage;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawFooter(i, totalPages);
    }

    doc.save(`Lomuriangole_CYDC_Cohort_AI_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const syncMonthlyReportToGoogleSheets = async () => {
    if (!monthlyReportData) return;

    // Consent dialogue for mutating actions
    const isConfirmed = window.confirm(
      `Sync Monthly Performance Evaluation Report for ${monthlyReportData.periodLabel} directly to your Google Sheets?\n\nThis will create a new high-fidelity spreadsheet in your Google Drive.`
    );
    if (!isConfirmed) return;

    setIsSyncingToSheets(true);
    setSheetSyncError(null);
    setSyncedSpreadsheetUrl(null);

    try {
      let activeToken = googleAccessToken;

      // Lazy load OAuth if accessToken isn't stored in app state
      if (!activeToken) {
        try {
          const result = await signInWithPopup(auth, googleProvider);
          const credential = GoogleAuthProvider.credentialFromResult(result);
          if (credential?.accessToken) {
            activeToken = credential.accessToken;
            setGoogleAccessToken(activeToken);
          } else {
            throw new Error("Failed to retrieve Google Sheets Access Token from login credential. Please try again.");
          }
        } catch (authErr: any) {
          throw new Error(`Google Authentication failed: ${authErr?.message || authErr}`);
        }
      }

      // 1. Create a brand new Google Spreadsheet
      const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          properties: {
            title: `Lomuriangole CYDC Monthly Report - ${monthlyReportData.periodLabel}`
          },
          sheets: [
            { properties: { title: 'Executive Summary' } },
            { properties: { title: 'Cohort Metrics' } },
            { properties: { title: 'Participant Metrics' } }
          ]
        })
      });

      if (!createResponse.ok) {
        const errJson = await createResponse.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `Failed to create spreadsheet (HTTP ${createResponse.status})`);
      }

      const createResult = await createResponse.json();
      const spreadsheetId = createResult.spreadsheetId;
      const spreadsheetUrl = createResult.spreadsheetUrl;

      // Prepare Executive Summary Row Data
      const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const execRows = [
        ["LOMURIANGOLE CHILD AND YOUTH DEVELOPMENT CENTER UG-1083"],
        ["P.O BOX 57 MOROTO, UGANDA"],
        ["TEL: 0778687473 / 078436428 / 0784522071"],
        ["Email: lomuriangolecydc@gmail.com"],
        [],
        ["OFFICIAL CYDC ATTENDANCE & PERFORMANCE EVALUATION SUMMARY"],
        [`REPORT PERIOD: ${monthlyReportData.periodLabel}`],
        [`DATE OF PREPARATION: ${todayStr}`],
        [],
        ["------------------------------------------------------------------------------------------------------"],
        ["EXECUTIVE METRICS SUMMARY"],
        ["------------------------------------------------------------------------------------------------------"],
        ["Metric", "Value"],
        ["Total Tracking Sessions Logged", `${monthlyReportData.overallStats.sessionsCount} session dates`],
        ["Active Participants Enrolled", `${monthlyReportData.overallStats.activeStudentsCount} students`],
        ["Overall Aggregated Attendance Rate", `${monthlyReportData.overallStats.rate}%`],
        ["Cumulative Attendance Present", monthlyReportData.overallStats.totalPresent],
        ["Cumulative Attendance Absent", monthlyReportData.overallStats.totalAbsent],
        ["Cumulative Attendance Excused", monthlyReportData.overallStats.totalExcused],
        ["Total Attendance Slot Ledger Rows", monthlyReportData.overallStats.totalMarked],
        [],
        ["------------------------------------------------------------------------------------------------------"],
        ["OFFICIAL STAFF ENDORSEMENTS & UNDERSIGNING PROVISIONS"],
        ["------------------------------------------------------------------------------------------------------"],
        [],
        ["PREPARED BY (CDO)", "", "", "APPROVED BY (PD)"],
        ["Name: .....................................................", "", "", "Name: ....................................................."],
        ["Title: Child Development Officer (CDO)", "", "", "Title: Project Director (PD)"],
        ["Signature: ................................................", "", "", "Signature: ................................................"],
        ["Date of Preparation: ____ / ____ / ________", "", "", "Date of Approval: ____ / ____ / ________"]
      ];

      // Prepare Cohort Breakdown Rows
      const cohortRows = [
        ["COHORT VELOCITY PERFORMANCE INDEX"],
        ["Values reflect aggregates of active registered participants in each specific class cohort."],
        [],
        ["Cohort Name", "Members Count", "Total Present Days", "Total Absent Days", "Total Excused Days", "Maximum Tracked Capacities", "Average Attendance Rate"],
        ...monthlyReportData.cohorts.map(c => [
          c.cohortName,
          c.membersCount,
          c.totalPresent,
          c.totalAbsent,
          c.totalExcused,
          c.totalSessionsPossible,
          `${c.attendanceRate}%`
        ])
      ];

      // Prepare Participant Breakdown Rows
      const participantRows = [
        ["PARTICIPANT ENGAGEMENT INDEX"],
        ["Details each child's historical attendance metrics across the designated report timeframe."],
        [],
        ["Participant Name", "Cohort Class", "ID Number", "Gender", "Total Present Days", "Total Absent Days", "Total Excused Days", "Total Registered Session Logs", "Avg Engagement Score"],
        ...monthlyReportData.cohorts.flatMap(c =>
          c.students.map(s => [
            s.participant.name,
            c.cohortName,
            s.participant.idNo || '-',
            s.participant.gender || '-',
            s.present,
            s.absent,
            s.excused,
            s.marked,
            `${s.rate}%`
          ])
        )
      ];

      // Send a single batchUpdate to write all sheets' values
      const updateResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: [
            {
              range: "'Executive Summary'!A1",
              values: execRows
            },
            {
              range: "'Cohort Metrics'!A1",
              values: cohortRows
            },
            {
              range: "'Participant Metrics'!A1",
              values: participantRows
            }
          ]
        })
      });

      if (!updateResponse.ok) {
        const errJson = await updateResponse.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `Failed to write values to sheet (HTTP ${updateResponse.status})`);
      }

      setSyncedSpreadsheetUrl(spreadsheetUrl);
    } catch (err: any) {
      console.error("Sheets sync error:", err);
      setSheetSyncError(err?.message || String(err));
    } finally {
      setIsSyncingToSheets(false);
    }
  };

  // Export current filtered/visible view of participants and their metrics to CSV

  const handleExportCSV = () => {
    const csvHeaders = [
      "Name",
      "ID No.",
      "Age",
      "Gender",
      "Village",
      "Caregiver",
      "Cohort",
      "Contact",
      "Total Sessions",
      "Present",
      "Absent",
      "Excused",
      "Attendance Rate (%)",
      "Max Consecutive Absences",
      "Alert Status",
      "Registration Notes"
    ];

    const csvRows = filteredParticipants.map(part => {
      const stats = getDashboardStats(part.id);
      const alertStatus = stats?.hasRedFlag 
        ? "Red Alert" 
        : stats?.hasYellowFlag 
          ? "Yellow Warning" 
          : "On Track";

      return [
        part.name,
        part.idNo || "",
        part.dob ? calculateAgeFromDob(part.dob) : (part.age || ""),
        part.gender || "",
        part.village || "",
        part.caregiver || "",
        part.cohort,
        part.contact,
        stats?.totalSessions ?? 0,
        stats?.totalPresent ?? 0,
        stats?.totalAbsent ?? 0,
        stats?.totalExcused ?? 0,
        stats ? `${stats.attendanceRate}%` : "100%",
        stats?.consecutiveAbsences ?? 0,
        alertStatus,
        part.registrationNotes || ""
      ];
    });

    const escapeCSV = (val: any) => {
      const str = String(val ?? "");
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [
      csvHeaders.join(","),
      ...csvRows.map(row => row.map(escapeCSV).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);

    const cohortName = selectedCohort === 'All Cohorts' ? 'All_Cohorts' : selectedCohort.replace(/\s+/g, '_');
    const flagName = selectedFlag === 'all' ? 'All_Statuses' : selectedFlag;
    const timestamp = new Date().toISOString().split('T')[0];
    
    link.setAttribute("download", `Lomuriangole_CYDC_${cohortName}_${flagName}_Export_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Attendance bulk import handlers
  const handleAttendanceDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setAttendanceDragActive(true);
    } else if (e.type === "dragleave") {
      setAttendanceDragActive(false);
    }
  };

  const handleAttendanceDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAttendanceDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleAttendanceFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleAttendanceFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleAttendanceFileSelected(e.target.files[0]);
    }
  };

  const handleAttendanceFileSelected = (file: File) => {
    setAttendanceUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result || '');
      setAttendanceImportText(text);
    };
    reader.readAsText(file);
  };

  const executeAttendanceImport = () => {
    if (!attendanceImportDate) {
      alert("Please select or enter a session date.");
      return;
    }

    // Determine if the session date already exists, otherwise add it!
    const dateExists = sessions.some(s => s.date === attendanceImportDate);
    let updatedSessions = sessions;
    if (!dateExists) {
      const newLabel = attendanceImportLabel.trim() || `Session ${sessions.length + 1}`;
      updatedSessions = [...sessions, { date: attendanceImportDate, label: newLabel }].sort((a, b) => a.date.localeCompare(b.date));
      setSessions(updatedSessions);
    }

    // Mark matched active participants as present, others as absent
    const matchedIds = attendanceMatchingDetails.matchedIds;

    setAttendance(prev => {
      const updated = { ...prev };
      activeParticipants.forEach(p => {
        if (!updated[p.id]) {
          updated[p.id] = {};
        }
        updated[p.id][attendanceImportDate] = matchedIds.has(p.id) ? 'present' : 'absent';
      });

      // Trigger automatic backup download of system data upon session finish / import complete
      if (isAutoDownloadEnabled) {
        setTimeout(() => {
          triggerAutomatedDownload('SessionFinish', { sessions: updatedSessions, attendance: updated });
        }, 150);
      }

      return updated;
    });

    alert(`Attendance successfully imported! \n- Marked PRESENT: ${matchedIds.size} student(s) \n- Marked ABSENT: ${activeParticipants.length - matchedIds.size} student(s) \n- Date: ${attendanceImportDate}`);
    
    // Close & reset
    setIsAttendanceImportOpen(false);
    setAttendanceImportText('');
    setAttendanceImportLabel('');
    setAttendanceUploadedFileName(null);
  };

  // Download comprehensive JSON state backup of participants, sessions, and attendance logs
  const handleDownloadBackup = () => {
    try {
      const backupData = {
        backupMetadata: {
          version: "1.0.0",
          exportedAt: new Date().toISOString(),
          totalParticipants: participants.length,
          totalSessions: sessions.length,
        },
        participants,
        sessions,
        attendance
      };

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);

      const timestamp = new Date().toISOString().split('T')[0];
      link.setAttribute("download", `Lomuriangole_CYDC_SystemBackup_${timestamp}.json`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Backup failed:", e);
      alert("Failed to export backup file. Check browser console logs.");
    }
  };

  // Upload/Restore state data from offline JSON backup
  const handleRestoreBackup = (e: ChangeEvent<HTMLInputElement>) => {
    if (!isAdminMode) {
      alert("System restore is restricted. Please unlock Admin Mode to upload a backup.");
      setIsPasscodeFieldOpen(true);
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const backupObj = JSON.parse(text);

        if (!backupObj || typeof backupObj !== 'object') {
          throw new Error("Invalid backup JSON format");
        }

        const restoredParticipants = backupObj.participants;
        const restoredSessions = backupObj.sessions;
        const restoredAttendance = backupObj.attendance;

        if (!Array.isArray(restoredParticipants) || !Array.isArray(restoredSessions) || !restoredAttendance) {
          throw new Error("Missing critical items ('participants', 'sessions', or 'attendance') in backup file.");
        }

        const confirmMsg = `⚠️ RESTORE BACKUP SYSTEM WARNING ⚠️\n\n` +
          `File to import: ${file.name}\n` +
          `Students found: ${restoredParticipants.length}\n` +
          `Sessions found: ${restoredSessions.length}\n\n` +
          `Are you absolutely sure you want to RESTORE this backup? This WILL completely overwrite your current database. This action is irreversible.`;

        if (window.confirm(confirmMsg)) {
          setParticipants(restoredParticipants);
          const seen = new Set<string>();
          const dedupedSessions = restoredSessions.filter((s: Session) => {
            if (!s.date || seen.has(s.date)) return false;
            seen.add(s.date);
            return true;
          });
          setSessions(dedupedSessions);
          setAttendance(restoredAttendance);
          alert("🎉 Backup restored successfully! All participants, log dates, and attendance markings have been re-indexed.");
        }
      } catch (err: any) {
        alert(`Failed to restore backup: ${err?.message || "Invalid file"}`);
      } finally {
        // Reset file input so same file can be selected again
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Save edited session date / label
  const handleEditSession = (oldDate: string, newDate: string, newLabel: string) => {
    if (!isAdminMode) {
      alert("Demographics and session modifications are restricted. Please unlock Admin Mode to modify system records.");
      setIsPasscodeFieldOpen(true);
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    
    // Check if newDate is valid: "Only for the previous dates, but active session date, any time session is being conducted" 
    // This translates to <= todayStr
    if (newDate > todayStr) {
      alert("Editing session date to a future date is restricted. Sessions can only occupy past dates or the active calendar date.");
      return;
    }

    if (!newDate) {
      alert("Please provide a valid session date.");
      return;
    }

    const cleanLabel = newLabel.trim() || `Session`;

    if (newDate !== oldDate && sessions.some(s => s.date === newDate)) {
      alert("A tracker session for this date is already established.");
      return;
    }

    // Perform update
    setSessions(prev => {
      const updated = prev.map(s => s.date === oldDate ? { ...s, date: newDate, label: cleanLabel } : s);
      return [...updated].sort((a, b) => a.date.localeCompare(b.date));
    });

    // Update attendance markings
    if (newDate !== oldDate) {
      setAttendance(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(pId => {
          if (updated[pId] && updated[pId][oldDate] !== undefined) {
            const status = updated[pId][oldDate];
            const studentRecord = { ...updated[pId] };
            delete studentRecord[oldDate];
            studentRecord[newDate] = status;
            updated[pId] = studentRecord;
          }
        });
        return updated;
      });
    }

    setEditingSessionOriginalDate(null);
    alert("Session details updated successfully!");
  };

  // Completely wipe data and reset to premium demo defaults
  const handleResetData = () => {
    if (!isAdminMode) {
      alert("System reset is restricted. Please unlock Admin Mode to reset data.");
      setIsPasscodeFieldOpen(true);
      return;
    }
    if (window.confirm('Are you sure you want to restore default tracker demo data? This will overwrite your custom modifications.')) {
      localStorage.removeItem('attendance_tracker_participants');
      localStorage.removeItem('attendance_tracker_sessions');
      localStorage.removeItem('attendance_tracker_records');
      setParticipants(INITIAL_PARTICIPANTS);
      setSessions(INITIAL_SESSIONS);
      setAttendance(INITIAL_ATTENDANCE);
      setJustReset(true);
      setTimeout(() => setJustReset(false), 3000);
    }
  };

  // Wipe EVERYTHING to start clean slate
  const handleClearAllData = () => {
    if (!isAdminMode) {
      alert("System wipe is restricted. Please unlock Admin Mode to clear data.");
      setIsPasscodeFieldOpen(true);
      return;
    }
    if (window.confirm('Wipe all tracked participants and historical dates to start a fresh project list?')) {
      setParticipants([]);
      setSessions([]);
      setAttendance({});
      setSelectedParticipantId(null);
    }
  };

  // Archive or delete a participant (moves to former list, keeping historic data)
  const handleDeleteParticipant = (id: string, permanent = false) => {
    if (!isAdminMode) {
      alert("Demographics and archival modifications are restricted. Please unlock Admin Mode to modify system records.");
      setIsPasscodeFieldOpen(true);
      return;
    }
    if (permanent) {
      if (window.confirm("Are you sure you want to PERMANENTLY delete this student's former/historical record? This action cannot be reverted.")) {
        setParticipants(prev => prev.filter(p => p.id !== id));
        if (selectedParticipantId === id) {
          setSelectedParticipantId(null);
        }
      }
    } else {
      const partName = participants.find(p => p.id === id)?.name || "this student";
      if (window.confirm(`Are you sure you want to archive/remove ${partName}? Their complete historical attendance logs and registered details will be preserved in the \"Former Participants\" list.`)) {
        setParticipants(prev => prev.map(p => p.id === id ? { ...p, isFormer: true, formerDate: new Date().toISOString().split('T')[0] } : p));
        if (selectedParticipantId === id) {
          setSelectedParticipantId(null);
        }
      }
    }
  };

  // Restore a former participant back to active list
  const handleRestoreParticipant = (id: string) => {
    if (!isAdminMode) {
      alert("Demographics and archival modifications are restricted. Please unlock Admin Mode to modify system records.");
      setIsPasscodeFieldOpen(true);
      return;
    }
    const partName = participants.find(p => p.id === id)?.name || "this student";
    if (window.confirm(`Restore ${partName} back to the active participants list?`)) {
      setParticipants(prev => prev.map(p => p.id === id ? { ...p, isFormer: false, formerDate: undefined } : p));
    }
  };

  // Archive ALL current active participants to former list in one click
  const handleArchiveAllActiveParticipants = () => {
    if (!isAdminMode) {
      alert("Demographics and archival modifications are restricted. Please unlock Admin Mode to modify system records.");
      setIsPasscodeFieldOpen(true);
      return;
    }
    if (activeParticipants.length === 0) {
      alert("No active participants to archive!");
      return;
    }
    if (window.confirm(`Are you sure you want to archive ALL ${activeParticipants.length} active participants? All their historical details, contact numbers, and attendance records will be safely kept in the \"Former Participants\" backup directory.`)) {
      const todayStr = new Date().toISOString().split('T')[0];
      setParticipants(prev => prev.map(p => !p.isFormer ? { ...p, isFormer: true, formerDate: todayStr } : p));
      setSelectedParticipantId(null);
    }
  };

  // Export Former Participants as custom formatted CSV spreadsheet data
  const handleExportFormerCSV = () => {
    if (formerParticipants.length === 0) {
      alert("No former participants to export!");
      return;
    }

    const csvHeaders = [
      "Name",
      "ID No.",
      "Age",
      "Gender",
      "Village",
      "Caregiver",
      "Cohort",
      "Contact",
      "Archive Date",
      "Intake Notes"
    ];

    const csvRows = formerParticipants.map(part => {
      return [
        part.name,
        part.idNo || "",
        part.dob ? calculateAgeFromDob(part.dob) : (part.age || ""),
        part.gender || "",
        part.village || "",
        part.caregiver || "",
        part.cohort,
        part.contact,
        part.formerDate || "",
        part.registrationNotes || ""
      ];
    });

    const escapeCSV = (val: any) => {
      const str = String(val ?? "");
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [
      csvHeaders.join(","),
      ...csvRows.map(row => row.map(escapeCSV).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);

    const timestamp = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `Lomuriangole_CYDC_Former_Participants_Export_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy template text helper
  const handleCopyText = (text: string, type: 'subject' | 'body') => {
    navigator.clipboard.writeText(text);
    setCopiedTemplate(type);
    setTimeout(() => {
      setCopiedTemplate(null);
    }, 2000);
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans p-6">
        <div className="flex flex-col items-center space-y-4 max-w-sm text-center">
          <div className="relative">
            <div className="h-14 w-14 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-xl animate-bounce">
              <BookOpen className="h-7 w-7 text-amber-300" />
            </div>
            <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-indigo-600 border-2 border-white flex items-center justify-center">
              <RefreshCw className="h-3 w-3 text-white animate-spin" />
            </div>
          </div>
          <div className="space-y-1.5 mt-2">
            <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">Securing Cloud Pipeline</h3>
            <p className="text-[11.5px] text-slate-500 font-mono">LOMURIANGOLE CYDC UG 1083</p>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    const handleEmailAuth = async (e: FormEvent) => {
      e.preventDefault();
      setAuthError(null);
      setAuthMessage(null);

      if (authMailMode === 'forgot') {
        if (!authEmail.trim()) {
          setAuthError("Email address is required to reset your password.");
          return;
        }
        try {
          setIsAuthLoading(true);
          await sendPasswordResetEmail(auth, authEmail.trim());
          setAuthMessage("Password recovery link has been dispatched to your email address! Please inspect your inbox and spam folders.");
        } catch (error: any) {
          console.error("Password reset failure:", error);
          let errMsg = error?.message || String(error);
          if (error?.code === 'auth/invalid-email') {
            errMsg = "Invalid email formatting. Please enter a double-checked valid email Address.";
          } else if (error?.code === 'auth/user-not-found') {
            errMsg = "No registered account found with this email Address.";
          }
          setAuthError(errMsg);
        } finally {
          setIsAuthLoading(false);
        }
        return;
      }

      if (!authEmail.trim() || !authPassword) {
        setAuthError("Email and password fields are required.");
        return;
      }

      try {
        setIsAuthLoading(true);
        if (authMailMode === 'signup') {
          if (authPassword !== authConfirmPassword) {
            setAuthError("Passwords do not match.");
            setIsAuthLoading(false);
            return;
          }
          if (authPassword.length < 6) {
            setAuthError("Password must be at least 6 characters.");
            setIsAuthLoading(false);
            return;
          }
          await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
          setAuthMessage("Account registered successfully! Synchronizing system data...");
        } else {
          await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
          setAuthMessage("Signed in successfully! Downloading your saved registers...");
        }
      } catch (error: any) {
        console.error("Authentication failed:", error);
        let errMsg = error?.message || String(error);
        if (error?.code === 'auth/invalid-credential' || error?.code === 'auth/wrong-password' || error?.code === 'auth/user-not-found') {
          errMsg = "Invalid email or password. Please verify your credentials or register a new account if you haven't yet.";
        } else if (error?.code === 'auth/email-already-in-use') {
          errMsg = "This email is already registered. Please sign in instead.";
        } else if (error?.code === 'auth/weak-password') {
          errMsg = "Password is too weak. Please choose a stronger password.";
        } else if (error?.code === 'auth/invalid-email') {
          errMsg = "Invalid email formatting. Please enter a double-checked valid email Address.";
        } else if (error?.code === 'auth/operation-not-allowed') {
          errMsg = "Email/Password sign-ins are currently not enabled in this Firebase project. To enable, go to the Firebase Console > Authentication > Sign-in method, select and enable \"Email/Password\", or configure Google Workspace authentication.";
        }
        setAuthError(errMsg);
      } finally {
        setIsAuthLoading(false);
      }
    };

    return (
      <div className="min-h-screen bg-slate-55/40 flex flex-col items-center justify-center font-sans p-4 sm:p-6 selection:bg-indigo-100 selection:text-indigo-900">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden flex flex-col p-6 sm:p-8 space-y-6 relative">
          
          {/* Top Decorative accent */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 via-indigo-500 to-indigo-650" />

          {/* Logo Heading and info */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-xl">
              <BookOpen className="h-6 w-6 text-amber-300" />
            </div>

            <div className="space-y-1">
              <span className="text-[10px] bg-indigo-50 text-indigo-700 font-extrabold px-3 py-1 rounded-full uppercase tracking-wider font-mono">
                🔑 Secure Account Portal
              </span>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                Lomuriangole CYDC
              </h2>
              <p className="text-xs text-slate-500 leading-normal max-w-sm">
                Child & Youth Development Center (UG 1083). Synchronize tracking registers to sign in from your mobile and desktop devices.
              </p>
            </div>
          </div>

          {/* Tab Switch Selector for Credentials */}
          {authMailMode !== 'forgot' ? (
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => {
                  setAuthMailMode('signin');
                  setAuthError(null);
                  setAuthMessage(null);
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer text-center ${
                  authMailMode === 'signin'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                id="switch-signin"
              >
                Sign In Account
              </button>
              <button
                onClick={() => {
                  setAuthMailMode('signup');
                  setAuthError(null);
                  setAuthMessage(null);
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer text-center ${
                  authMailMode === 'signup'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                id="switch-signup"
              >
                Create Account
              </button>
            </div>
          ) : (
            <div className="bg-indigo-50/50 border border-indigo-150 rounded-xl p-3 text-left">
              <span className="text-xs font-black text-indigo-900 uppercase tracking-wide block">
                Reset Forgotten Password
              </span>
              <p className="text-[10px] text-indigo-700 leading-normal mt-0.5 animate-pulse">
                Supply your registered email address below, and we will transmit a personalized link to safely restore your login credentials.
              </p>
            </div>
          )}

          {/* Authentication Status/Error Alerts */}
          {authError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2 text-left">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-[11px] font-black text-rose-800">Authentication Alert</h4>
                <p className="text-[10.5px] text-rose-600 leading-relaxed">
                  {authError}
                </p>
              </div>
            </div>
          )}

          {authMessage && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2 text-left">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-[11px] font-black text-emerald-800">Progress Update</h4>
                <p className="text-[10.5px] text-emerald-700 leading-relaxed">
                  {authMessage}
                </p>
              </div>
            </div>
          )}

          {/* Email and Password Credentials Form */}
          <form onSubmit={handleEmailAuth} className="space-y-3.5 text-left">
            <div>
              <label className="block text-[11px] font-bold text-slate-550 uppercase tracking-wider mb-1.5">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="e.g. administrator@cydc.org"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-250 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all shadow-2xs"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            {authMailMode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-slate-550 uppercase tracking-wider mb-1.5">Password</label>
                  {authMailMode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMailMode('forgot');
                        setAuthError(null);
                        setAuthMessage(null);
                      }}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-extrabold hover:underline mb-1.5 cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Enter secure account password"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-250 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all shadow-2xs"
                    required
                    autoComplete={authMailMode === 'signup' ? 'new-password' : 'current-password'}
                  />
                </div>
              </div>
            )}

            {authMailMode === 'signup' && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-1"
              >
                <label className="block text-[11px] font-bold text-slate-550 uppercase tracking-wider mb-1.5">Confirm Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="password"
                    value={authConfirmPassword}
                    onChange={(e) => setAuthConfirmPassword(e.target.value)}
                    placeholder="Repeat password to verify"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-250 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all shadow-2xs"
                    required
                    autoComplete="new-password"
                  />
                </div>
              </motion.div>
            )}

            <button
              type="submit"
              className="w-full bg-slate-900 hover:bg-slate-950 text-white font-extrabold text-xs py-3 px-4 rounded-xl cursor-pointer transition-all shadow-xs hover:shadow-md flex items-center justify-center gap-1.5"
              id="submit-auth-btn"
            >
              <Lock className="w-3.5 h-3.5 text-amber-300" />
              {authMailMode === 'signup' ? "Create Syncable Account" : authMailMode === 'forgot' ? "Send Password Reset Link" : "Access Syncable Registers"}
            </button>

            {authMailMode === 'forgot' && (
              <div className="text-center pt-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMailMode('signin');
                    setAuthError(null);
                    setAuthMessage(null);
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-extrabold hover:underline cursor-pointer"
                >
                  Return to Sign In Account
                </button>
              </div>
            )}
          </form>

          {/* Visual Divider / Fallback Selector */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">or sign in using</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <div className="space-y-4">
            <button
              onClick={async () => {
                try {
                  setIsAuthLoading(true);
                  setAuthError(null);
                  const result = await signInWithPopup(auth, googleProvider);
                  const credential = GoogleAuthProvider.credentialFromResult(result);
                  if (credential?.accessToken) {
                    setGoogleAccessToken(credential.accessToken);
                  }
                } catch (error: any) {
                  console.error("Authentication popup failed:", error);
                  setAuthError(error?.message || String(error));
                } finally {
                  setIsAuthLoading(false);
                }
              }}
              className="w-full flex items-center justify-center gap-2.5 border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs py-2.5 px-4 rounded-xl cursor-pointer transition-all shadow-2xs"
              id="google-login-btn"
            >
              {/* Custom Google Visual G Icon */}
              <svg className="h-4 w-4 shrink-0 text-slate-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.71 0 3.28.618 4.5 1.636l2.427-2.427C17.437 1.767 14.985 1 12.24 1 6.58 1 2 5.58 2 11.24s4.58 10.24 10.24 10.24c5.92 0 10.17-4.16 10.17-10.24 0-.69-.06-1.35-.18-1.95H12.24z"/>
              </svg>
              <span>Google Account Sign-In</span>
            </button>

            {/* Warning frame detection utility */}
            {typeof window !== 'undefined' && window.self !== window.top && (
              <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3 text-[10.5px] text-amber-850 leading-relaxed text-left">
                <div className="flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <p>
                    <strong>Iframe Sandbox Warning</strong>: In this preview panel, browser cookies inside frames are often isolated, preventing Google OAuth popups. If Google login stalls, create an Email/Password account above or open this tool directly in a full browser tab.
                  </p>
                </div>
                <div className="mt-2 text-center">
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white text-[9.5px] font-extrabold py-1 px-2.5 rounded-md shadow-3xs cursor-pointer"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open App in New Tab to Test
                  </a>
                </div>
              </div>
            )}

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 flex items-start gap-2.5 text-left">
              <Lock className="w-4 h-4 text-slate-450 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <h4 className="text-[11px] font-bold text-slate-700">Protected Endpoint Enclosure</h4>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Databases are encrypted securely in Cloud Run environments. Verified email domains block read-write scrapers entirely to protect CYDC student profiles.
                </p>
              </div>
            </div>
          </div>

          {/* Clean local time and details decoration */}
          <div className="pt-2 text-center text-[10px] text-slate-400 font-mono flex items-center justify-center gap-1.5 border-t border-slate-100">
            <Clock className="w-3.5 h-3.5 animate-pulse" />
            UG-1083 Cloud Vault Active
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 font-sans selection:bg-amber-100 selection:text-amber-900">
      
      {/* HEADER SECTION */}
      <header id="main-header" className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
          
          <div className="flex items-center justify-between xl:justify-start gap-3 w-full xl:w-auto">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-md">
                <BookOpen className="h-5 w-5 text-amber-300" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight font-sans">
                  Lomuriangole CYDC UG 1083 Attendance Tracker
                </h1>
                <p className="text-xs text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Lomuriangole Child and Youth Development Center • June 9, 2026
                </p>
              </div>
            </div>

            {/* Profile badge for Mobile Devices */}
            {currentUser && (
              <div className="xl:hidden">
                <img 
                  src={currentUser.photoURL || undefined} 
                  alt={currentUser.displayName || 'User'} 
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full border border-slate-300 object-cover"
                />
              </div>
            )}
          </div>

          {/* User Sign Out Header Block (Desktop and widescreen) */}
          {currentUser && (
            <div className="hidden xl:flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2 font-sans self-center">
              {currentUser.photoURL ? (
                <img 
                  src={currentUser.photoURL} 
                  alt={currentUser.displayName || 'Offline'} 
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full border border-slate-300 object-cover shrink-0"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs shrink-0 border border-indigo-200">
                  {currentUser.displayName?.charAt(0) || currentUser.email?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <div className="flex flex-col text-left">
                <span className="text-[11.1px] font-extrabold text-slate-800 leading-none tracking-tight">
                  {currentUser.displayName || 'Authorized User'}
                </span>
                <span className="text-[9.5px] text-indigo-650 font-semibold font-mono leading-none mt-0.5">
                  {currentUser.email}
                </span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (window.confirm("Are you sure you want to log out of Lomuriangole Tracker from this device? Unsaved session data will synchronize before exiting.")) {
                    try {
                      setSyncStatus('syncing');
                      await triggerSyncUpload();
                      await signOut(auth);
                    } catch (e) {
                      console.error("Signout error:", e);
                      await signOut(auth);
                    }
                  }
                }}
                className="ml-2 hover:bg-slate-200 text-slate-500 hover:text-slate-900 p-1.5 rounded-lg transition-colors cursor-pointer"
                title="Sign out of child center registrar tracker"
                id="sign-out-btn"
              >
                <LogOut className="w-4 h-4 shrink-0" />
              </button>
            </div>
          )}

          {/* User Email Sign Out inline helper for responsive mobile drawer */}
          {currentUser && (
            <div className="xl:hidden flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-sans">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="text-[10.5px] font-bold text-slate-700 truncate max-w-[200px]">
                  Logged in: {currentUser.email}
                </span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (window.confirm("Log out of Lomuriangole Tracker? Unsaved changes will synchronize automatically before exiting.")) {
                    try {
                      setSyncStatus('syncing');
                      await triggerSyncUpload();
                      await signOut(auth);
                    } catch (e) {
                      console.error("Signout error:", e);
                      await signOut(auth);
                    }
                  }
                }}
                className="text-[10px] bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer"
                id="mobile-logout-btn"
              >
                Sign Out
              </button>
            </div>
          )}

          {/* REAL-TIME OFFLINE/ONLINE BACKUP SYNCHRONIZER CONTROLLER */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs font-sans xl:max-w-md w-full">
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5 font-bold text-slate-850">
                {isOnline ? (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <Wifi className="w-4 h-4 text-emerald-500 shrink-0" />
                    🟢 Online Mode
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-rose-600 animate-pulse">
                    <WifiOff className="w-4 h-4 text-rose-500 shrink-0" />
                    🔴 Offline Mode
                  </span>
                )}
                <span className="text-slate-300 text-[10px] font-normal">|</span>
                
                {/* Sync status identifier pill */}
                {syncStatus === 'synced' && (
                  <span className="text-emerald-700 bg-emerald-50 border border-emerald-150 px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-0.5">
                    <Cloud className="w-3 h-3 text-emerald-500" /> Synced
                  </span>
                )}
                {syncStatus === 'unsynced' && (
                  <span className="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-0.5">
                    <CloudOff className="w-3 h-3 text-amber-500 font-medium" /> Unsaved Changes
                  </span>
                )}
                {syncStatus === 'syncing' && (
                  <span className="text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 animate-pulse">
                    <RefreshCw className="w-2.5 h-2.5 text-indigo-500 animate-spin" /> Saving...
                  </span>
                )}
                {syncStatus === 'error' && (
                  <span className="text-rose-700 bg-rose-50 border border-rose-250 px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-0.5" title={syncErrorMsg || 'Sync problem'}>
                    ⚠️ Connection Error
                  </span>
                )}
              </div>
              
              <div className="text-[10px] text-slate-500 flex flex-col gap-0.5">
                <span className="block font-semibold">
                  {lastSyncTime ? `Last Synced: ${lastSyncTime}` : 'Offline caching active (local only)'}
                </span>
                {hasPendingUnsavedChanges && (
                  <span className="text-amber-600 font-bold text-[9px] uppercase tracking-wider block">
                    ⚠️ Saved locally (unsynced with cloud)
                  </span>
                )}
              </div>
            </div>

            {/* Sync trigger buttons */}
            <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
              <button
                type="button"
                onClick={() => triggerSyncUpload()}
                disabled={syncStatus === 'syncing' || !isOnline}
                title="Save database immediately to server backup storage"
                className={`flex items-center gap-1.5 py-1 px-2.5 rounded-lg border text-[11px] font-bold shadow-3xs transition-all cursor-pointer ${
                  !isOnline 
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-white hover:bg-slate-50 text-indigo-700 border-indigo-200 hover:border-indigo-300'
                }`}
              >
                <Cloud className="w-3.5 h-3.5" />
                Upload
              </button>
              
              <button
                type="button"
                onClick={triggerSyncDownload}
                disabled={syncStatus === 'syncing' || !isOnline}
                title="Restore from last saved server backup"
                className={`flex items-center gap-1.5 py-1 px-2.5 rounded-lg border text-[11px] font-bold shadow-3xs transition-all cursor-pointer ${
                  !isOnline 
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-white hover:bg-slate-50 text-slate-705 border-slate-200 hover:border-slate-300'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                Restore
              </button>
            </div>
          </div>

          {/* Rules policy quick-badge */}
          <div className="bg-slate-100/70 border border-slate-200/80 rounded-xl p-3 text-xs leading-relaxed text-slate-600 block">
            <span className="font-semibold text-slate-900 uppercase tracking-wider text-[10px] block mb-1">
              Automated Center Alert Policies
            </span>
            <div className="flex flex-col sm:flex-row gap-x-4 gap-y-1">
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-amber-400 border border-amber-500 inline-block animate-pulse"></span>
                <span><b>Yellow:</b> 2 Consecutive Absences</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-rose-500 border border-rose-600 inline-block animate-pulse"></span>
                <span><b>Red Alert:</b> Consecutive (3+) or 4/5 Absences</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Main Top Navigation Tabs */}
        <div className="flex border-t border-slate-200 bg-white shadow-3xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex items-center justify-between gap-4">
            <div className="flex gap-4 sm:gap-6">
              <button
                onClick={() => setCurrentTab('tracker')}
                className={`py-3 text-xs sm:text-sm font-semibold border-b-2 px-1 transition-all flex items-center gap-2 cursor-pointer ${
                  currentTab === 'tracker'
                    ? 'border-slate-900 text-slate-900 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <Users className="w-4 h-4" />
                Active Student Board
              </button>
              <button
                onClick={() => setCurrentTab('journal')}
                className={`py-3 text-xs sm:text-sm font-semibold border-b-2 px-1 transition-all flex items-center gap-2 cursor-pointer ${
                  currentTab === 'journal'
                    ? 'border-slate-900 text-slate-900 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <BookOpen className="w-4 h-4 text-emerald-500" />
                Discussion Journal
              </button>
              <button
                onClick={() => setCurrentTab('ai-analyst')}
                className={`py-3 text-xs sm:text-sm font-semibold border-b-2 px-1 transition-all flex items-center gap-2 cursor-pointer ${
                  currentTab === 'ai-analyst'
                    ? 'border-slate-900 text-slate-900 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
                AI Roster Analyst
              </button>
              <button
                onClick={() => setCurrentTab('admin')}
                className={`py-3 text-xs sm:text-sm font-semibold border-b-2 px-1 transition-all flex items-center gap-2 cursor-pointer ${
                  currentTab === 'admin'
                    ? 'border-slate-900 text-slate-900 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <FileCode className="w-4 h-4 text-indigo-500" />
                Admin Panel & Archives
              </button>
            </div>

            {/* Admin Mode Toggle Shield */}
            <div className="flex items-center gap-2 py-2">
              {isAdminMode ? (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10.5px] sm:text-xs font-bold border border-emerald-200 shadow-3xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>🛡️ Staff Admin (Unlocked)</span>
                  <button 
                    onClick={() => {
                      setIsAdminMode(false);
                      setIsEditingProfile(false);
                    }}
                    className="ml-1 text-[9.5px] text-emerald-800 hover:text-rose-600 font-extrabold cursor-pointer border-l pl-1.5 border-emerald-300"
                    title="Lock Admin Mode"
                  >
                    Lock
                  </button>
                </div>
              ) : isPasscodeFieldOpen ? (
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (passcodeAttempt === 'admin1083') {
                      setIsAdminMode(true);
                      setPasscodeAttempt('');
                      setPasscodeError('');
                      setIsPasscodeFieldOpen(false);
                    } else {
                      setPasscodeError('Invalid Code');
                      setTimeout(() => setPasscodeError(''), 2500);
                    }
                  }}
                  className="flex items-center gap-1 bg-slate-50 border border-indigo-200 rounded-xl p-1"
                >
                  <input 
                    type="password"
                    placeholder="PIN (admin1083)"
                    value={passcodeAttempt}
                    onChange={(e) => setPasscodeAttempt(e.target.value)}
                    className="bg-white border border-slate-250 rounded-lg px-2 py-0.5 text-[10px] font-semibold text-slate-700 w-24 sm:w-28 focus:outline-none focus:border-indigo-400 placeholder:text-slate-350"
                  />
                  <button 
                    type="submit"
                    className="bg-indigo-600 text-white rounded-lg px-2 py-0.5 text-[10px] font-bold hover:bg-indigo-700 cursor-pointer"
                  >
                    {passcodeError || 'Unlock'}
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      setIsPasscodeFieldOpen(false);
                      setPasscodeAttempt('');
                    }}
                    className="text-[10px] text-slate-450 hover:text-slate-600 px-1 cursor-pointer"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button 
                  onClick={() => setIsPasscodeFieldOpen(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-[10.5px] sm:text-xs font-semibold border border-slate-200 cursor-pointer shadow-3xs transition-all"
                  title="Unlock Admin Mode (Hint: admin1083)"
                >
                  <span>🔒 Admin Lock (Click to Admin)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* SYSTEM MAIN WORKSPACE */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentTab === 'tracker' && (
          <>
             {/* CAREGIVER CHECK-IN NOTIFICATION BANNER */}
             {dueCheckInParticipantsList.length > 0 && (
               <div id="caregiver-checkin-banner" className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-150 rounded-2xl p-4 mb-6 shadow-3xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-sans animate-fade-in relative overflow-hidden">
                 <div className="absolute top-0 right-0 h-24 w-24 bg-indigo-100/30 rounded-full blur-xl -mr-6 -mt-6"></div>
                 <div className="flex items-start gap-3 relative z-10">
                   <div className="bg-indigo-500 rounded-xl p-2.5 text-white shrink-0 shadow-2xs">
                     <Bell className="w-5 h-5" />
                   </div>
                   <div>
                     <h4 className="text-xs font-bold text-slate-850 flex items-center gap-1.5">
                       📋 Case Outreach Notification: Caregiver Check-ins Outstanding
                       <span className="bg-indigo-200 text-indigo-805 text-[9px] font-extrabold px-1.5 py-0.2 rounded-full font-mono">
                         {dueCheckInParticipantsList.length} Students
                       </span>
                     </h4>
                     <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed max-w-2xl">
                       These participants have either never had any follow-up actions logged or have not had a routine caregiver discussion entry in over <b>30 days</b>. Routine outreach is recommended to maintain active engagement.
                     </p>
                     
                     {/* Suggesting some due students as preview */}
                     <div className="flex flex-wrap gap-2 mt-3.5">
                       <span className="text-[10px] text-indigo-700/80 font-bold uppercase tracking-wider self-center">Due for Check-In:</span>
                       {dueCheckInParticipantsList.slice(0, 4).map(p => {
                         const hasNotes = p.outreachNotes && p.outreachNotes.length > 0;
                         let labelText = 'Never';
                         if (hasNotes) {
                           const dates = p.outreachNotes!.map(n => n.date).filter(Boolean);
                           const lastDateStr = dates.reduce((a, b) => a > b ? a : b);
                           const lastDate = new Date(lastDateStr);
                           const today = new Date();
                           const diffTime = Math.abs(today.getTime() - lastDate.getTime());
                           const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                           labelText = `${diffDays}d ago`;
                         }
                         return (
                           <button
                             key={p.id}
                             type="button"
                             onClick={() => {
                               setSelectedParticipantId(p.id);
                             }}
                             className="bg-white/90 hover:bg-white border border-slate-200/90 py-1 px-2.5 rounded-xl text-[10.5px] text-indigo-700 font-bold hover:text-indigo-800 transition-all flex items-center gap-1 cursor-pointer shadow-3xs hover:scale-102"
                           >
                             <Users className="w-3 h-3 text-indigo-405" />
                             {p.name}
                             <span className="text-[9px] text-slate-450 font-mono font-normal">
                               ({labelText})
                             </span>
                           </button>
                         );
                       })}
                       {dueCheckInParticipantsList.length > 4 && (
                         <span className="text-[10.5px] text-slate-400 font-medium self-center pl-1">
                           and {dueCheckInParticipantsList.length - 4} more...
                         </span>
                       )}
                     </div>
                   </div>
                 </div>
                 
                 <div className="flex shrink-0 gap-2 w-full md:w-auto relative z-10 self-stretch md:self-auto items-end justify-end">
                   {selectedFlag === 'due_checkin' ? (
                     <button
                       type="button"
                       onClick={() => setSelectedFlag('all')}
                       className="w-full md:w-auto bg-slate-200 hover:bg-slate-250 text-slate-700 text-xs font-bold px-4 py-2 rounded-xl transition-colors shrink-0 shadow-3xs cursor-pointer flex items-center justify-center gap-1.5"
                     >
                       Clear Filter
                     </button>
                   ) : (
                     <button
                       type="button"
                       onClick={() => {
                         setSelectedFlag('due_checkin');
                         const el = document.getElementById('filter-controls');
                         if (el) el.scrollIntoView({ behavior: 'smooth' });
                       }}
                       className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors shrink-0 shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                     >
                       <Clock className="w-4 h-4 text-indigo-200" />
                       View All Overdue list
                     </button>
                   )}
                 </div>
               </div>
             )}

             {/* SUMMARY ATTENDANCE PERIOD SELECTOR */}
             <section id="analytics-period-selector" className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 mb-6 shadow-2xs">
               <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                 <div className="space-y-1">
                   <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                     📅 Summary Attendance Period
                   </h3>
                   <p className="text-xs text-slate-500 leading-normal">
                     Filter dynamic performance standing rates, alert levels, and trend data reports.
                   </p>
                 </div>
                 
                 <div className="flex flex-wrap items-center gap-3">
                   <div className="flex items-center gap-2">
                     <span className="text-xs text-slate-400 font-semibold font-mono">Period:</span>
                     <select
                       value={analyticsPeriod}
                       onChange={(e) => setAnalyticsPeriod(e.target.value as any)}
                       className="bg-slate-50 border border-slate-200 rounded-xl text-xs py-2 px-3 font-semibold text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer shadow-3xs"
                     >
                       <option value="all">📅 All-Time Records</option>
                       <option value="14days">⚡ Last 14 Days</option>
                       <option value="30days">📅 Last 30 Days</option>
                       <option value="month">📊 Current Month</option>
                       <option value="year">🏛️ Year to Date</option>
                       <option value="custom">⚙️ Custom Date Range...</option>
                     </select>
                   </div>

                   {analyticsPeriod === 'custom' && (
                     <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                       <input
                         type="date"
                         value={analyticsStartDate}
                         onChange={(e) => setAnalyticsStartDate(e.target.value)}
                         className="bg-white border border-slate-200 rounded-xl text-xs py-1 px-2 text-slate-700 focus:outline-none focus:border-slate-400 font-mono shadow-3xs"
                       />
                       <span className="text-xs text-slate-400 font-semibold font-mono">to</span>
                       <input
                         type="date"
                         value={analyticsEndDate}
                         onChange={(e) => setAnalyticsEndDate(e.target.value)}
                         className="bg-white border border-slate-200 rounded-xl text-xs py-1 px-2 text-slate-700 focus:outline-none focus:border-slate-400 font-mono shadow-3xs"
                       />
                       {(analyticsStartDate || analyticsEndDate) && (
                         <button
                           onClick={() => {
                             setAnalyticsStartDate('');
                             setAnalyticsEndDate('');
                           }}
                           className="text-[10px] text-rose-500 hover:text-rose-600 font-extrabold px-1.5 py-1 rounded bg-rose-50 border border-rose-100 transition-colors"
                         >
                           Clear
                         </button>
                       )}
                     </div>
                   )}

                   <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 shrink-0">
                     <span className="font-mono text-[10.5px] text-indigo-700 font-bold block">
                       {filteredSessionsForAnalytics.length} of {sessions.length} Sessions Active
                     </span>
                   </div>
                 </div>
               </div>
             </section>

            {/* METRICS ROW (4 COLSGRID) */}
            <section id="metrics-summary" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          
          {/* Card 1: Total participants */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between transition-all hover:shadow-sm">
            <div>
              <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold block">
                Tracked Cohort
              </span>
              <span className="text-3xl font-bold text-slate-900 font-sans tracking-tight block mt-1">
                {totalParticipants}
              </span>
              <span className="text-xs text-slate-400 mt-1 block">Active Participants</span>
            </div>
            <div className="h-12 w-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500">
              <Users className="h-6 w-6" />
            </div>
          </div>

          {/* Card 2: Average attendance rate */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between transition-all hover:shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold block">
                  Avg Program Standing
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-bold text-slate-900 tracking-tight block">
                    {overallAttendanceRate}%
                  </span>
                  <span className="text-xs text-emerald-600 font-semibold font-mono">Present</span>
                </div>
              </div>
              <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100 shrink-0">
                <TrendingUp className="h-6 w-6 text-emerald-500" />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] text-slate-500 font-medium">Target threshold: 80%</span>
                <span className="text-[10px] text-slate-600 font-bold">{overallAttendanceRate}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 relative overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${overallAttendanceRate >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                  style={{ width: `${Math.min(overallAttendanceRate, 100)}%` }}
                />
                <div className="absolute top-0 bottom-0 left-[80%] w-0.5 bg-slate-300 z-10" />
              </div>
            </div>
          </div>

          {/* Card 3: Yellow warning indicators */}
          <button 
            onClick={() => setSelectedFlag(selectedFlag === 'yellow' ? 'all' : 'yellow')}
            className={`p-5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
              selectedFlag === 'yellow' 
                ? 'bg-amber-50/60 border-amber-300 ring-2 ring-amber-300/35' 
                : 'bg-white border-slate-200 hover:border-amber-200 hover:bg-amber-50/10'
            }`}
          >
            <div>
              <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold block">
                Needs Follow-Up
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-3xl font-bold text-amber-700 tracking-tight font-sans">
                  {yellowFlagList.length}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100/80 text-amber-800 font-medium text-[10px]">
                  Yellow Warning
                </span>
              </div>
              <span className="text-xs text-amber-600 font-medium mt-1 block">
                {selectedFlag === 'yellow' ? 'Showing filtered yellow' : 'Click to filter yellow'}
              </span>
            </div>
            <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 border border-amber-200">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
          </button>

          {/* Card 4: Red critical list */}
          <button 
            onClick={() => setSelectedFlag(selectedFlag === 'red' ? 'all' : 'red')}
            className={`p-5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
              selectedFlag === 'red' 
                ? 'bg-rose-50/70 border-rose-300 ring-2 ring-rose-300/35' 
                : 'bg-white border-slate-200 hover:border-rose-200 hover:bg-rose-50/10'
            }`}
          >
            <div>
              <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold block">
                Manager Actions Required
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-3xl font-bold text-rose-700 tracking-tight font-sans">
                  {redFlagList.length}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-medium text-[10px]">
                  Red Alert
                </span>
              </div>
              <span className="text-xs text-rose-600 font-medium mt-1 block">
                {selectedFlag === 'red' ? 'Showing filtered red' : 'Click to filter red'}
              </span>
            </div>
            <div className="h-12 w-12 rounded-xl bg-rose-100 flex items-center justify-center text-rose-700 border border-rose-200">
              <AlertCircle className="h-5 w-5 text-rose-600 animate-bounce" />
            </div>
          </button>

        </section>

        {/* 30-DAY DAILY ATTENDANCE HEATMAP */}
        <section id="attendance-heatmap" className="bg-white border border-slate-200 rounded-3xl p-6 mb-6 shadow-2xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" />
                30-Day Center Attendance Heatmap
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Daily participation rate tracking over the last 30 days. Click/Hover blocks to inspect details.
              </p>
            </div>

            {/* INTERACTIVE MODE TOGGLE SWITCHER */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl self-start lg:self-auto shrink-0 border border-slate-200">
              <button
                type="button"
                onClick={() => setIsAbsentHoverMode(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  !isAbsentHoverMode
                    ? 'bg-white text-slate-800 shadow-3xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                id="heatmap-mode-stats"
              >
                📊 Standard Stats
              </button>
              <button
                type="button"
                onClick={() => setIsAbsentHoverMode(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  isAbsentHoverMode
                    ? 'bg-indigo-650 text-white shadow-3xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                id="heatmap-mode-absentees"
              >
                👥 Interactive Absentees
                <span className="flex h-1.5 w-1.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                </span>
              </button>
            </div>
            
            {/* Heatmap Legend */}
            <div className="flex flex-wrap items-center gap-2.5 text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2 self-start lg:self-auto shrink-0">
              <span className="text-slate-400">Rate status:</span>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-xs bg-slate-50 border border-slate-200"></div>
                <span>No Session</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-xs bg-slate-200 border border-slate-300"></div>
                <span>Unmarked</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-xs bg-rose-500 border border-rose-600 shadow-3xs"></div>
                <span>Critical (&lt;50%)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-xs bg-amber-500 border border-amber-600 shadow-3xs"></div>
                <span>Warning (50-79%)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-xs bg-emerald-500 border border-emerald-600 shadow-3xs"></div>
                <span>Excellent (&ge;80%)</span>
              </div>
            </div>
          </div>

          {/* DATE RANGE FILTER SLIDER */}
          <div className="bg-indigo-50/45 border border-indigo-150/70 rounded-2xl p-4 mb-5 font-sans">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  🔍 Custom Heatmap Date Range Slider Indicator
                </h4>
                <p className="text-[11px] text-slate-500">
                  Narrow down the displayed 30-day view to specific custom intervals.
                </p>
              </div>
              {/* Dynamic range label badge */}
              <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-indigo-700 font-mono">
                  {heatmapDays[heatmapStartIdx] ? formatToReadableDate(heatmapDays[heatmapStartIdx]) : ''}
                </span>
                <span className="text-slate-400 text-xs">➔</span>
                <span className="text-xs font-bold text-indigo-700 font-mono">
                  {heatmapDays[heatmapEndIdx] ? formatToReadableDate(heatmapDays[heatmapEndIdx]) : ''}
                </span>
                <span className="text-[10px] bg-indigo-50 border border-indigo-150 text-indigo-700 font-bold px-1.5 py-0.5 rounded-md font-mono">
                  {heatmapEndIdx - heatmapStartIdx + 1} Days Shown
                </span>
              </div>
            </div>

            {/* Sliders layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Start Date Slider */}
              <div className="space-y-1 py-1 px-2.5 bg-white border border-slate-150 rounded-xl">
                <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-indigo-400"></span> Start Bound:
                  </span>
                  <span className="font-extrabold text-indigo-650 font-mono">
                    {heatmapDays[heatmapStartIdx] ? formatToReadableDate(heatmapDays[heatmapStartIdx]) : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={heatmapEndIdx}
                  value={heatmapStartIdx}
                  onChange={(e) => handleStartIdxChange(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-150 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-hidden"
                />
                <div className="flex justify-between text-[9px] text-slate-400 font-mono pt-0.5">
                  <span>Earliest Point</span>
                  <span>Day Index: {heatmapStartIdx}</span>
                </div>
              </div>

              {/* End Date Slider */}
              <div className="space-y-1 py-1 px-2.5 bg-white border border-slate-150 rounded-xl">
                <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span> End Bound:
                  </span>
                  <span className="font-extrabold text-indigo-650 font-mono">
                    {heatmapDays[heatmapEndIdx] ? formatToReadableDate(heatmapDays[heatmapEndIdx]) : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min={heatmapStartIdx}
                  max="29"
                  value={heatmapEndIdx}
                  onChange={(e) => handleEndIdxChange(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-150 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-hidden"
                />
                <div className="flex justify-between text-[9px] text-slate-400 font-mono pt-0.5">
                  <span>Day Index: {heatmapEndIdx}</span>
                  <span>Latest Point</span>
                </div>
              </div>
            </div>

            {/* Range Presets Quick Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-150/50">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Interval Presets:</span>
              <button
                type="button"
                onClick={() => {
                  setHeatmapStartIdx(0);
                  setHeatmapEndIdx(29);
                }}
                className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-[10.5px] font-bold text-slate-600 py-1 px-2.5 rounded-lg shadow-3xs cursor-pointer transition-colors"
              >
                Reset (All 30 Days)
              </button>
              <button
                type="button"
                onClick={() => {
                  setHeatmapStartIdx(15);
                  setHeatmapEndIdx(29);
                }}
                className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-[10.5px] font-bold text-slate-600 py-1 px-2.5 rounded-lg shadow-3xs cursor-pointer transition-colors"
              >
                Last 15 Days
              </button>
              <button
                type="button"
                onClick={() => {
                  setHeatmapStartIdx(0);
                  setHeatmapEndIdx(14);
                }}
                className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-[10.5px] font-bold text-slate-600 py-1 px-2.5 rounded-lg shadow-3xs cursor-pointer transition-colors"
              >
                First 15 Days
              </button>
              <button
                type="button"
                onClick={() => {
                  setHeatmapStartIdx(23);
                  setHeatmapEndIdx(29);
                }}
                className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-[10.5px] font-bold text-slate-600 py-1 px-2.5 rounded-lg shadow-3xs cursor-pointer transition-colors"
              >
                Last 7 Days
              </button>
            </div>
          </div>

          {/* BULK DATA ENTRY CONTROLS ABOVE THE HEATMAP */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 font-sans">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider font-mono flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5" /> Quick Bulk Entry Action
                </span>
                <span className="text-[10px] bg-slate-200 text-slate-700 font-medium px-2 py-0.5 rounded-full">
                  Affects {filteredParticipants.length} displayed students
                </span>
                
                {/* Auto-download feature configuration toggle */}
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-550 select-none ml-2">
                  <input
                    type="checkbox"
                    checked={isAutoDownloadEnabled}
                    onChange={(e) => {
                      setIsAutoDownloadEnabled(e.target.checked);
                      localStorage.setItem('attendance_tracker_auto_download_on_finish', e.target.checked ? 'true' : 'false');
                    }}
                    className="rounded text-indigo-650 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer border-slate-300 bg-white"
                  />
                  <span className="text-[10.5px] font-semibold text-slate-600 leading-none">Auto-Download JSON on Finish</span>
                </label>
              </div>
              <h4 className="text-xs font-bold text-slate-850 mt-1">
                Set Attendance in Bulk for chosen Session
              </h4>
              <p className="text-[10.5px] text-slate-500">
                To simplify data entry for large groups, select a session date below and instantly label all currently active/filtered list students as Present or Absent.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-bold font-mono">Date to Update:</span>
                <select
                  value={bulkTargetDate || (sessions[0]?.date || '')}
                  onChange={(e) => setBulkTargetDate(e.target.value)}
                  className="bg-white border border-slate-250 rounded-xl px-3 py-2 text-xs text-slate-750 font-bold focus:outline-none cursor-pointer hover:bg-slate-50 transition-colors shadow-3xs"
                >
                  {sessions.length === 0 ? (
                    <option value="">No sessions available</option>
                  ) : (
                    <>
                      <option value="" disabled>-- Select Session --</option>
                      {sessions.map(s => (
                        <option key={s.date} value={s.date}>
                          {s.date} — {s.label || 'Regular Session'}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleBulkSetAttendance('present')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-2xs cursor-pointer transition-colors flex items-center gap-1"
                >
                  Bulk Set Present
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkSetAttendance('absent')}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-2xs cursor-pointer transition-colors flex items-center gap-1"
                >
                  Bulk Set Absent
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const targetDate = bulkTargetDate || (sessions[0]?.date || '');
                    if (!targetDate) {
                      alert("Please select or configure a session date to finish class and backup.");
                      return;
                    }
                    triggerAutomatedDownload('SessionFinish');
                  }}
                  className="bg-indigo-650 hover:bg-indigo-750 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-2xs cursor-pointer transition-colors flex items-center gap-1.5"
                  title="Finish compile of session data and trigger download of portable system JSON backup"
                >
                  <Cloud className="w-3.5 h-3.5 shrink-0" />
                  Finish & Backup
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
            {/* The 30 Cells Grid */}
            <div className="md:col-span-8 flex flex-col justify-between">
              <div className="grid grid-cols-5 xs:grid-cols-6 sm:grid-cols-10 md:grid-cols-10 lg:grid-cols-15 gap-2.5">
                {heatmapWeeks.map((day, idx) => {
                  if (idx < heatmapStartIdx || idx > heatmapEndIdx) return null;
                  let cellBg = '';
                  let cellBorder = '';
                  let textCol = '';
                  
                  if (day.statusBucket === 'none') {
                    cellBg = 'bg-slate-50 hover:bg-slate-100/90';
                    cellBorder = 'border-slate-200/60';
                    textCol = 'text-slate-400';
                  } else if (day.statusBucket === 'empty') {
                    cellBg = 'bg-slate-200 hover:bg-slate-300';
                    cellBorder = 'border-slate-300';
                    textCol = 'text-slate-600';
                  } else if (day.statusBucket === 'crit') {
                    cellBg = 'bg-rose-500 hover:bg-rose-600';
                    cellBorder = 'border-rose-600';
                    textCol = 'text-white';
                  } else if (day.statusBucket === 'warn') {
                    cellBg = 'bg-amber-500 hover:bg-amber-600';
                    cellBorder = 'border-amber-600';
                    textCol = 'text-white';
                  } else if (day.statusBucket === 'good') {
                    cellBg = 'bg-emerald-500 hover:bg-emerald-600';
                    cellBorder = 'border-emerald-600';
                    textCol = 'text-white';
                  }

                  const isHovered = hoveredHeatmapIndex === idx;
                  const isSelected = selectedHeatmapIndex === idx;
                  const [, , d] = day.date.split('-');
                  const dayNum = Number(d);
                  
                  // Extract short month name
                  const tempDate = new Date(day.date + 'T00:00:00');
                  const monthName = isNaN(tempDate.getTime()) ? '' : tempDate.toLocaleString('en-US', { month: 'short' });

                  return (
                    <div
                      key={day.date}
                      onMouseEnter={() => setHoveredHeatmapIndex(idx)}
                      onMouseLeave={() => setHoveredHeatmapIndex(null)}
                      onClick={() => {
                        setSelectedHeatmapIndex(isSelected ? null : idx);
                        if (day.session) {
                          setBulkTargetDate(day.session.date);
                        }
                      }}
                      className={`h-11 sm:h-12 border rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all select-none relative ${cellBg} ${cellBorder} ${textCol} ${
                        isHovered ? 'scale-[1.08] z-50 ring-2 ring-indigo-500/25 shadow-md' : ''
                      } ${isSelected ? 'ring-2 ring-indigo-600 ring-offset-2 scale-105 shadow-md' : ''}`}
                    >
                      <span className="text-[9px] uppercase font-bold leading-none tracking-tight">
                        {monthName}
                      </span>
                      <span className="text-sm font-extrabold font-sans mt-0.5 leading-none">
                        {dayNum}
                      </span>
                      
                      {day.session && (
                        <span className="absolute bottom-1 right-1 flex h-1.5 w-1.5 rounded-full bg-white ring-1 ring-black/10"></span>
                      )}

                      {/* Interactive Hover Tooltip */}
                      <AnimatePresence>
                        {isHovered && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 5 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 5 }}
                            transition={{ duration: 0.12 }}
                            className="absolute bottom-[100%] left-1/2 -translate-x-1/2 pb-2.5 z-50 pointer-events-auto"
                          >
                            <div className="w-64 sm:w-72 p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xl text-left leading-normal font-sans text-slate-800 relative">
                              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                {formatToReadableDate(day.date)}
                              </div>
                              <div className="font-sans font-black text-slate-900 text-xs mt-0.5 truncate flex items-center justify-between">
                                <span>{day.session ? day.session.label : "No session scheduled"}</span>
                                {day.session && (
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${
                                    day.statusBucket === 'good' ? 'bg-emerald-100 text-emerald-800' :
                                    day.statusBucket === 'warn' ? 'bg-amber-100 text-amber-800' :
                                    'bg-rose-100 text-rose-800'
                                  }`}>
                                    {day.attendanceRate}%
                                  </span>
                                )}
                              </div>
                              
                              {day.session ? (
                                <>
                                  <div className="border-t border-slate-100 my-2"></div>
                                  
                                  {!isAbsentHoverMode ? (
                                    /* Standard View: Simple counts */
                                    <div className="space-y-1.5 text-xs">
                                      <div className="flex items-center justify-between">
                                        <span className="text-slate-550 flex items-center gap-1.5 text-[10.5px]">
                                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                          Present:
                                        </span>
                                        <span className="font-mono font-bold text-emerald-600">{day.presentCount}</span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-slate-550 flex items-center gap-1.5 text-[10.5px]">
                                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                                          Absent:
                                        </span>
                                        <span className="font-mono font-bold text-rose-600">{day.absentCount}</span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-slate-550 flex items-center gap-1.5 text-[10.5px]">
                                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                                          Excused:
                                        </span>
                                        <span className="font-mono font-bold text-amber-600">{day.excusedCount}</span>
                                      </div>
                                      
                                      <div className="border-t border-dashed border-slate-100 pt-1.5 mt-1.5 flex items-center justify-between text-[11px]">
                                        <span className="font-bold text-slate-600">Attendance Rate:</span>
                                        <span className="font-mono font-extrabold text-indigo-600">
                                          {day.attendanceRate !== null ? `${day.attendanceRate}%` : 'N/A'}
                                        </span>
                                      </div>
                                    </div>
                                  ) : (
                                    /* Interactive Absentee List View */
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between bg-rose-50 border border-rose-100 rounded-lg py-1 px-1.5 text-[10.5px] font-bold text-rose-800">
                                        <span>Absent Members</span>
                                        <span className="bg-rose-600 text-white px-1.5 py-0.2 rounded-full font-mono text-[9px]">
                                          {day.absentCount}
                                        </span>
                                      </div>

                                      {day.absentCount === 0 ? (
                                        <div className="text-center py-3 bg-emerald-50/55 rounded-xl border border-emerald-100/50">
                                          <div className="text-[10.5px] font-bold text-emerald-750">🎉 Perfect Attendance!</div>
                                          <div className="text-[9.5px] text-emerald-605 font-medium mt-0.5">Every cohort member was present.</div>
                                        </div>
                                      ) : (
                                        <div className="max-h-[145px] overflow-y-auto pr-1 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-200">
                                          {day.absentParticipants.map(absParticipant => (
                                            <div 
                                              key={absParticipant.id}
                                              className="flex items-center justify-between p-1 bg-slate-50 border border-slate-150 rounded-lg hover:bg-slate-100 hover:border-slate-250 transition-colors"
                                            >
                                              <div className="flex items-center gap-1.5 max-w-[150px]">
                                                {absParticipant.photoUrl ? (
                                                  <img 
                                                    src={absParticipant.photoUrl} 
                                                    alt={absParticipant.name} 
                                                    className="h-5 w-5 rounded-full object-cover shrink-0" 
                                                    referrerPolicy="no-referrer" 
                                                  />
                                                ) : (
                                                  <div className={`h-5 w-5 rounded-full ${absParticipant.avatarColor || 'bg-slate-300'} flex items-center justify-center text-white text-[8px] font-black shrink-0`}>
                                                    {absParticipant.name.charAt(0)}
                                                  </div>
                                                )}
                                                <div className="truncate text-[10.5px] leading-tight text-slate-850">
                                                  <div className="font-bold text-slate-800 truncate" title={absParticipant.name}>
                                                    {absParticipant.name}
                                                  </div>
                                                  <div className="text-[8px] text-slate-400 font-mono">
                                                    {absParticipant.cohort} • ID {absParticipant.idNo || 'N/A'}
                                                  </div>
                                                </div>
                                              </div>
                                              
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setSelectedParticipantId(absParticipant.id);
                                                }}
                                                className="bg-indigo-50 hover:bg-indigo-600 hover:text-white border border-indigo-150 rounded-md py-0.5 px-1.5 text-[8.5px] font-black text-indigo-750 hover:border-indigo-600 transition-all cursor-pointer flex items-center gap-0.5 shrink-0"
                                                title={`Open ${absParticipant.name}'s profile detail card`}
                                              >
                                                Profile ➔
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      <div className="text-[8px] text-slate-400 italic text-center font-mono leading-none pt-1">
                                        Click profile button to inspect student dossier
                                      </div>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="text-[11px] text-slate-400 italic mt-1.5">
                                  No participation records for this date.
                                </div>
                              )}
                              
                              {/* Triangle anchor pointer */}
                              <div className="absolute top-[100%] left-1/2 -translate-x-1/2 border-x-4 border-t-4 border-transparent border-t-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.08)]"></div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 text-[10.5px] text-slate-400 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-slate-400" />
                <span>Hover cells to view daily stats. Days with small bottom dots signify tracked sessions.</span>
              </div>
            </div>

            {/* Selected/Hovered Detail Inspector Card */}
            <div className="md:col-span-4 bg-slate-50/60 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between min-h-[140px]">
              {(() => {
                const activeIndex = hoveredHeatmapIndex !== null ? hoveredHeatmapIndex : selectedHeatmapIndex;
                if (activeIndex === null) {
                  return (
                    <div className="h-full flex flex-col items-center justify-center text-center py-4">
                      <div className="h-9 w-9 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 mb-1.5">
                        <Info className="w-4.5 h-4.5 text-indigo-550" />
                      </div>
                      <span className="text-xs font-bold text-slate-700">Quick Inspection Card</span>
                      <p className="text-[11px] text-slate-550 max-w-[200px] mt-0.5 leading-normal">
                        Hover or tap any date block to inspect active attendance ratios, session labels, and student counts.
                      </p>
                    </div>
                  );
                }
                const day = heatmapWeeks[activeIndex];
                const isEditingThisSession = day.session && editingSessionOriginalDate === day.session.date;

                if (isEditingThisSession) {
                  return (
                    <div className="space-y-3 font-sans h-full flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                          <span className="text-xs font-bold text-indigo-750 uppercase tracking-wide font-mono">
                            Edit Session Details
                          </span>
                          <span className="text-[10px] px-2 py-0.5 font-bold rounded bg-amber-100 text-amber-800">
                            Admin Mode
                          </span>
                        </div>

                        <div className="space-y-2.5 text-xs">
                          <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
                              Session Date
                            </label>
                            <input
                              type="date"
                              value={editSessionDate}
                              onChange={(e) => setEditSessionDate(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
                              Session Label
                            </label>
                            <input
                              type="text"
                              value={editSessionLabel}
                              onChange={(e) => setEditSessionLabel(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                              placeholder="e.g. Workshop Session"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-3 border-t border-slate-150 mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            handleEditSession(day.session!.date, editSessionDate, editSessionLabel);
                          }}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] py-1.5 px-3 rounded-lg shadow-3xs transition-colors cursor-pointer text-center"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSessionOriginalDate(null)}
                          className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[11px] py-1.5 px-3 rounded-lg shadow-3xs transition-colors cursor-pointer text-center"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3 font-sans h-full flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                        <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide font-mono">
                          {formatToReadableDate(day.date)}
                        </span>
                        {day.session ? (
                          <span className="text-[10px] px-2 py-0.5 font-bold rounded-full bg-indigo-100 text-indigo-800">
                            Session held
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 font-bold rounded-full bg-slate-200/80 text-slate-600">
                            No session
                          </span>
                        )}
                      </div>

                      {day.session ? (
                        <div className="space-y-2 text-xs">
                          <div>
                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Session Label</div>
                            <div className="font-bold text-slate-800 text-sm mt-0.5">{day.session.label || 'Regular Workshop'}</div>
                          </div>

                          <div className="bg-white border border-slate-150 rounded-xl p-2.5 space-y-1.5 shadow-3xs mt-2">
                            <div className="flex justify-between items-center text-[10.5px]">
                              <span className="text-slate-500 font-medium font-sans">Attendance Rating:</span>
                              <span className={`font-extrabold text-[12px] ${
                                day.statusBucket === 'good' ? 'text-emerald-600' :
                                day.statusBucket === 'warn' ? 'text-amber-500' :
                                day.statusBucket === 'crit' ? 'text-rose-500' : 'text-slate-600'
                              }`}>
                                {day.attendanceRate !== null ? `${day.attendanceRate}%` : 'Unmarked'}
                              </span>
                            </div>
                            
                            {day.attendanceRate !== null && (
                              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-1 relative">
                                <div 
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    day.statusBucket === 'good' ? 'bg-emerald-500' :
                                    day.statusBucket === 'warn' ? 'bg-amber-500' : 'bg-rose-500'
                                  }`}
                                  style={{ width: `${day.attendanceRate}%` }}
                                />
                              </div>
                            )}

                            <div className="grid grid-cols-3 gap-1 pt-1 text-center text-[10px]">
                              <div className="bg-emerald-50 text-emerald-850 p-1 rounded-sm">
                                <span className="block font-bold text-[11px]">{day.presentCount}</span>
                                <span className="text-[8px] text-emerald-600 uppercase font-bold tracking-tight">Present</span>
                              </div>
                              <div className="bg-amber-50/75 text-amber-850 p-1 rounded-sm">
                                <span className="block font-bold text-[11px]">{day.excusedCount}</span>
                                <span className="text-[8px] text-amber-600 uppercase font-bold tracking-tight">Excused</span>
                              </div>
                              <div className="bg-rose-50 text-rose-950 p-1 rounded-sm">
                                <span className="block font-bold text-[11px]">{day.absentCount}</span>
                                <span className="text-[8px] text-rose-500 uppercase font-bold tracking-tight">Absent</span>
                              </div>
                            </div>
                          </div>

                          {/* Companion Mobile/Touch Inspect Card - Live Absentee List block */}
                          <div className="mt-3.5 pt-3.5 border-t border-slate-150">
                            <span className="text-[10px] text-slate-450 font-bold uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                              <span className="flex items-center gap-1">❌ Absentees for Session ({day.absentCount})</span>
                              {day.absentCount > 0 && (
                                <span className="bg-rose-100 text-rose-700 text-[8.5px] px-1.5 py-0.2 rounded font-mono font-black animate-pulse">
                                  Requires Outreach
                                </span>
                              )}
                            </span>
                            
                            {day.absentCount === 0 ? (
                              <div className="bg-emerald-50/40 border border-emerald-150 rounded-xl p-2.5 text-center text-[11px] font-bold text-emerald-805">
                                🎉 Excellent! No member was absent.
                              </div>
                            ) : (
                              <div className="max-h-[145px] overflow-y-auto space-y-1.5 pr-0.5 border border-slate-200/60 bg-white p-1.5 rounded-xl shadow-3xs scrollbar-thin scrollbar-thumb-slate-200">
                                {day.absentParticipants.map(absParticipant => (
                                  <div 
                                    key={absParticipant.id}
                                    className="flex items-center justify-between p-1 hover:bg-slate-50 border border-slate-100/40 rounded-lg transition-colors"
                                  >
                                    <div className="flex items-center gap-2 max-w-[150px]">
                                      {absParticipant.photoUrl ? (
                                        <img 
                                          src={absParticipant.photoUrl} 
                                          alt={absParticipant.name} 
                                          className="h-6 w-6 rounded-full object-cover shrink-0" 
                                          referrerPolicy="no-referrer" 
                                        />
                                      ) : (
                                        <div className={`h-6 w-6 rounded-full ${absParticipant.avatarColor || 'bg-slate-300'} flex items-center justify-center text-white text-[9px] font-black shrink-0`}>
                                          {absParticipant.name.charAt(0)}
                                        </div>
                                      )}
                                      <div className="truncate text-[11px] leading-tight text-slate-800">
                                        <div className="font-extrabold text-slate-800 truncate" title={absParticipant.name}>
                                          {absParticipant.name}
                                        </div>
                                        <div className="text-[8.5px] text-slate-400 font-mono">
                                          {absParticipant.cohort} • ID {absParticipant.idNo || 'N/A'}
                                        </div>
                                      </div>
                                    </div>
                                    
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedParticipantId(absParticipant.id);
                                      }}
                                      className="bg-indigo-50 hover:bg-indigo-650 hover:text-white border border-indigo-150 hover:border-indigo-600 rounded-lg py-0.5 px-2 text-[9px] font-black text-indigo-750 transition-all cursor-pointer flex items-center gap-0.5 shrink-0"
                                      title={`View profile for ${absParticipant.name}`}
                                    >
                                      Dossier ➔
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 italic py-4">
                          No workshops or instructional tracking sessions held on this date.
                        </div>
                      )}
                    </div>

                    {day.session ? (
                      <div className="border-t border-slate-150 pt-2 flex items-center justify-between gap-2 mt-auto">
                        <span className="text-[10px] text-slate-450 leading-tight">
                          Evaluated across <span className="font-bold text-slate-600">{day.totalCount} students</span>
                        </span>
                        {day.session.date <= new Date().toISOString().split('T')[0] && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!isAdminMode) {
                                alert("Session modifications are restricted. Please unlock Admin Mode to modify system records.");
                                setIsPasscodeFieldOpen(true);
                                return;
                              }
                              setEditingSessionOriginalDate(day.session!.date);
                              setEditSessionDate(day.session!.date);
                              setEditSessionLabel(day.session!.label || '');
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-lg text-[10px] font-extrabold shrink-0 cursor-pointer transition-colors border border-indigo-150"
                            title={isAdminMode ? "Edit session date/label details" : "Lock - Enable Admin Mode to edit session"}
                          >
                            Edit Session
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </div>
          </div>
        </section>

        {/* CONTROLS & FILTERING RAIL */}
        <section id="filter-controls" className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 shadow-2xs">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4.5 w-4.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search participant name, ID no. or contact..."
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:border-slate-400 focus:outline-none transition-colors text-sm"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Select Dropdowns and Filters */}
            <div className="flex flex-wrap items-center gap-3">
              
              {/* Cohort filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-semibold font-mono">Cohort:</span>
                <select
                  value={selectedCohort || 'All Cohorts'}
                  onChange={(e) => setSelectedCohort(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl text-xs py-2 px-3 font-medium text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
                >
                  {COHORTS.map(cohortStr => (
                    <option key={cohortStr} value={cohortStr}>
                      {cohortStr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Demographics / Segment filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-semibold font-mono">Segment:</span>
                <select
                  value={selectedSegment}
                  onChange={(e) => setSelectedSegment(e.target.value as any)}
                  className="bg-slate-50 border border-slate-200 rounded-xl text-xs py-2 px-3 font-semibold text-slate-705 focus:outline-none focus:border-slate-400 cursor-pointer"
                >
                  <option value="all">All Demographics</option>
                  <optgroup label="GENDER">
                    <option value="male">👦 Male Only</option>
                    <option value="female">👧 Female Only</option>
                  </optgroup>
                  <optgroup label="AGE BRACKETS">
                    <option value="under12">🧒 Under 12 Yrs</option>
                    <option value="12to14">👦👧 12 - 14 Yrs</option>
                    <option value="15to18">🧑‍🏫 15 - 18 Yrs</option>
                    <option value="19plus">🧑‍🎓 19+ Yrs</option>
                  </optgroup>
                </select>
              </div>

              {/* Attendance Sort filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-semibold font-mono font-medium">Rank:</span>
                <select
                  value={attendanceSortOrder}
                  onChange={(e) => setAttendanceSortOrder(e.target.value as 'none' | 'best' | 'worst')}
                  className="bg-slate-50 border border-slate-200 rounded-xl text-xs py-2 px-3 font-bold text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
                >
                  <option value="none">Default (by ID No)</option>
                  <option value="best">🏆 Best Attendance Rate</option>
                  <option value="worst">⚠️ Worst Attendance Rate</option>
                </select>
              </div>

              {/* Status Flag Buttons */}
              <div className="flex bg-slate-100 rounded-xl p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setSelectedFlag('all')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    selectedFlag === 'all' 
                      ? 'bg-white text-slate-900 shadow-2xs' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  All ({participants.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFlag('red')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                    selectedFlag === 'red' 
                      ? 'bg-rose-600 text-white shadow-2xs' 
                      : 'text-rose-600 hover:bg-rose-50/50'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-current"></span>
                  Immediate Action ({redFlagList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFlag('yellow')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                    selectedFlag === 'yellow' 
                      ? 'bg-amber-500 text-white shadow-2xs' 
                      : 'text-amber-700 hover:bg-amber-50/50'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-current"></span>
                  Warning ({yellowFlagList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFlag('normal')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                    selectedFlag === 'normal' 
                      ? 'bg-emerald-600 text-white shadow-2xs' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                  On Track
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFlag('due_checkin')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    selectedFlag === 'due_checkin' 
                      ? 'bg-indigo-650 text-white shadow-2xs' 
                      : 'text-indigo-600 hover:bg-indigo-50/50'
                  }`}
                >
                  <Clock className="h-3.5 w-3.5" />
                  Check-In Due ({dueCheckInParticipantsList.length})
                </button>
              </div>

              {/* ACTION BUTTON UTILITIES */}
              <div className="h-6 w-px bg-slate-200"></div>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddParticipantOpen(true)}
                  className="bg-slate-900 text-white hover:bg-slate-800 px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Add Participant
                </button>
                <button
                  type="button"
                  onClick={() => setIsImportOpen(true)}
                  className="bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <Upload className="h-3.5 w-3.5 text-slate-550" />
                  Import List
                </button>
                <button
                  type="button"
                  onClick={() => setIsAttendanceImportOpen(true)}
                  className="bg-indigo-50 text-indigo-900 border border-indigo-200 hover:bg-indigo-100 px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  title="Import participant attendance for a session. Matching participants are marked present, missing active members are marked absent."
                >
                  <CheckCircle className="h-3.5 w-3.5 text-indigo-700" />
                  Import Attendance
                </button>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="bg-emerald-50 border border-emerald-200 text-emerald-850 hover:bg-emerald-100/70 px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  title="Export currently filtered list and attendance stats as a formatted CSV file"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddSessionOpen(true)}
                  className="bg-white text-slate-800 hover:bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Add Session Date
                </button>
                
                {/* Reset button always visible to ensure developers can inspect */}
                <button
                  type="button"
                  onClick={handleResetData}
                  title="Reset Demo Data"
                  className="bg-white hover:bg-slate-50 text-slate-500 border border-slate-200 p-2 rounded-xl transition-colors cursor-pointer"
                >
                  <RotateCcw className={`h-3.5 w-3.5 ${justReset ? 'animate-spin text-emerald-600' : ''}`} />
                </button>
              </div>

            </div>
          </div>
        </section>

        {/* DEMO SYSTEM RECOVERY CONFIRMATION NOTE */}
        {justReset && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs font-medium mb-4 animate-pulse flex items-center gap-2">
            <Check className="h-4 w-4" /> State restored to high-fidelity demo defaults. Multiple participants are now flagged for yellow & red statuses!
          </div>
        )}

        {/* ATTENDANCE BOARD WORKSPACE */}
        <section id="attendance-board" className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
          
          {filteredParticipants.length === 0 ? (
            <div className="p-16 text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-slate-50 border border-slate-200 text-slate-400 flex items-center justify-center mb-3">
                <Search className="h-6 w-6" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">No participants found</h3>
              <p className="text-sm text-slate-400 max-w-sm mx-auto mt-1">
                No active records match the current search query or filter tags. Try broadening your criteria.
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <button
                  onClick={() => { setSearchQuery(''); setSelectedCohort('All Cohorts'); setSelectedFlag('all'); }}
                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer"
                >
                  Reset Active Filters
                </button>
                <button
                  onClick={() => setIsAddParticipantOpen(true)}
                  className="text-xs bg-slate-900 text-white font-medium hover:bg-slate-800 px-3.5 py-1.5 rounded-xl transition-colors cursor-pointer"
                >
                  Add Participant Directly
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full border-collapse text-left table-fixed">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold font-mono text-[11px] uppercase tracking-wider">
                    {/* Fixed Participant metadata col */}
                    <th className="py-4 px-6 w-80 sticky left-0 bg-slate-50 z-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      Participant Details
                    </th>
                    {/* Compact Dynamic Date columns */}
                    {sessions.map(session => (
                      <th key={session.date} className="py-4 px-3 w-32 border-l border-slate-200/80 text-center select-none relative group">
                        <div className="font-semibold text-slate-800">{formatToShortDayMonth(session.date)}</div>
                        <div className="font-mono text-[9px] text-slate-400/90 font-normal mt-0.5 whitespace-nowrap">
                          {session.label || 'Session'}
                        </div>
                        {/* Hover date details tooltip */}
                        <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-slate-900 text-white text-[10px] py-1 px-2.5 rounded shadow-lg whitespace-nowrap z-10 font-sans normal-case">
                          Date: {formatToReadableDate(session.date)}
                        </div>
                      </th>
                    ))}
                    {/* Inline Stats Overview */}
                    <th className="py-4 px-4 w-44 border-l border-slate-200/80 text-center select-none">
                      <button
                        type="button"
                        onClick={() => {
                          setAttendanceSortOrder(prev => {
                            if (prev === 'none') return 'best';
                            if (prev === 'best') return 'worst';
                            return 'none';
                          });
                        }}
                        className="mx-auto flex items-center justify-center gap-1.5 hover:text-indigo-700 text-slate-500 font-semibold font-mono text-[11px] uppercase tracking-wider group transition-colors cursor-pointer outline-hidden"
                        title="Click to toggle sorting: ID No (Default) -> Best Attendance -> Worst Attendance"
                      >
                        <span>Presence Rate</span>
                        {attendanceSortOrder === 'none' && (
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-400 transition-colors" />
                        )}
                        {attendanceSortOrder === 'best' && (
                          <ArrowDown className="h-3.5 w-3.5 text-emerald-600 animate-pulse" />
                        )}
                        {attendanceSortOrder === 'worst' && (
                          <ArrowUp className="h-3.5 w-3.5 text-rose-500 animate-pulse" />
                        )}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredParticipants.map((part) => {
                    const stats = getDashboardStats(part.id);
                    
                    // Style row highlight borders based on core policy requirements
                    let alertRowStyle = 'hover:bg-slate-50/50';
                    let alertBorderColor = '';
                    let statusLabel = '';
                    
                    if (stats?.hasRedFlag) {
                      alertRowStyle = 'bg-rose-50/25 hover:bg-rose-100/20';
                      alertBorderColor = 'border-l-4 border-l-rose-500';
                      statusLabel = 'Red Alert';
                    } else if (stats?.hasYellowFlag) {
                      alertRowStyle = 'bg-amber-50/30 hover:bg-amber-50/50';
                      alertBorderColor = 'border-l-4 border-l-amber-500';
                      statusLabel = 'Needs Follow-Up';
                    }

                    return (
                      <tr 
                        key={part.id} 
                        className={`transition-colors group ${alertRowStyle} ${alertBorderColor}`}
                      >
                        {/* Participant Details Column (Sticky) */}
                        <td className="p-4 px-6 sticky left-0 bg-white group-hover:bg-slate-50/60 z-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] transition-colors">
                          <div className="flex items-center gap-3">
                            {/* Avatar */}
                            <div 
                              onClick={() => setSelectedParticipantId(part.id)}
                              className={`h-9 w-9 rounded-xl border flex items-center justify-center font-bold text-xs uppercase cursor-pointer transition-transform hover:scale-105 select-none ${part.avatarColor} overflow-hidden`}
                            >
                              {part.photoUrl ? (
                                <img src={part.photoUrl} alt={part.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                part.name.split(' ').map(n => n[0]).join('').slice(0, 2)
                              )}
                            </div>
                            
                            {/* Details clickable text to open Side-inspector info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span 
                                  onClick={() => setSelectedParticipantId(part.id)}
                                  className="font-medium text-slate-900 hover:text-indigo-700 cursor-pointer transition-colors block truncate"
                                >
                                  {part.name}
                                </span>
                                
                                <button
                                  type="button"
                                  onClick={() => setSelectedParticipantId(part.id)}
                                  className="p-1 hover:bg-slate-100 rounded-lg text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                                  title="Analyze Participant & View Details"
                                >
                                  <TrendingUp className="h-3.5 w-3.5" />
                                </button>
                                
                                {/* Status Icon Tag indicators */}
                                {stats?.hasRedFlag && (
                                  <span className="inline-flex h-2 w-2 rounded-full bg-rose-500 animate-pulse" title="Immediate Manager Notification Required"></span>
                                )}
                                {stats?.hasYellowFlag && (
                                  <span className="inline-flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" title="Two Consecutive Absences Follow-Up"></span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                {part.idNo && part.idNo !== '-' && (
                                  <span className="text-[10px] font-mono font-bold text-slate-700 bg-slate-100 rounded px-1.5 py-0.2" title="ID Number">
                                    {part.idNo}
                                  </span>
                                )}
                                {(part.dob || part.age) && (part.dob ? calculateAgeFromDob(part.dob) : part.age) !== '-' && (
                                  <span className="text-[10px] text-slate-500 font-sans" title="Age">
                                    Age: {part.dob ? calculateAgeFromDob(part.dob) : part.age}
                                  </span>
                                )}
                                {part.gender && part.gender !== '-' && (
                                  <span className="text-[10px] text-pink-700 font-sans bg-pink-50 px-1.5 py-0.2 rounded" title="Gender">
                                    Sex: {part.gender}
                                  </span>
                                )}
                                {part.village && part.village !== '-' && (
                                  <span className="text-[10px] text-indigo-650 font-sans bg-indigo-50 px-1 py-0.2 rounded" title="Village">
                                    🏡 {part.village}
                                  </span>
                                )}
                                {part.caregiver && part.caregiver !== '-' && (
                                  <span className="text-[10px] text-slate-600 font-sans" title="Caregiver">
                                    Caregiver: {part.caregiver}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 block truncate mt-0.5">Contact: {part.contact}</span>
                              
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-medium text-slate-500 bg-slate-100 rounded-md px-1.5 py-0.5">
                                  {part.cohort}
                                </span>
                                
                                {/* Flag Labels */}
                                {stats?.hasRedFlag && (
                                  <span className="text-[9px] font-semibold text-rose-700 bg-rose-100/50 rounded px-1.5 py-0.2 select-none border border-rose-200">
                                    🚨 Red Alert (Streak/4 in 5)
                                  </span>
                                )}
                                {stats?.hasYellowFlag && (
                                  <span className="text-[9px] font-semibold text-amber-700 bg-amber-100/60 rounded px-1.5 py-0.2 select-none border border-amber-200">
                                    ⚠️ Yellow Warning (2 Consec)
                                  </span>
                                )}
                                {dueCheckInParticipantsList.some(dp => dp.id === part.id) && (
                                  <span className="text-[9px] font-semibold text-indigo-750 bg-indigo-50 rounded px-1.5 py-0.3 select-none border border-indigo-150 inline-flex items-center gap-0.5">
                                    <Clock className="w-2.5 h-2.5 text-indigo-500" /> Check-In Due
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Interactive dynamic cells */}
                        {sessions.map(session => {
                          const status: AttendanceStatus = (attendance[part.id] && attendance[part.id][session.date]) || 'unmarked';
                          
                          // Style based on cell status values
                          let statusIcon = <HelpCircle className="h-3.5 w-3.5 text-slate-300" />;
                          let cellBgClass = 'hover:bg-slate-100/50';
                          let titleText = `Toggle attendance: currently Unmarked`;

                          if (status === 'present') {
                            statusIcon = <CheckCircle className="h-4.5 w-4.5 text-emerald-600 fill-emerald-50/50" />;
                            cellBgClass = 'bg-emerald-50/15 hover:bg-emerald-50/30';
                            titleText = `${part.name} Present on ${formatToShortDayMonth(session.date)}`;
                          } else if (status === 'absent') {
                            statusIcon = <XCircle className="h-4.5 w-4.5 text-rose-55 fill-rose-50/40" />;
                            cellBgClass = 'bg-rose-55/10 hover:bg-rose-100/30';
                            titleText = `${part.name} Absent on ${formatToShortDayMonth(session.date)}`;
                          } else if (status === 'excused') {
                            statusIcon = <MinusCircle className="h-4.5 w-4.5 text-slate-500/80 fill-slate-100/50" />;
                            cellBgClass = 'bg-slate-50 hover:bg-slate-100/40';
                            titleText = `${part.name} Excused on ${formatToShortDayMonth(session.date)}`;
                          }

                          return (
                            <td 
                              key={session.date} 
                              className={`p-3 text-center border-l border-slate-100/70 select-none ${cellBgClass} transition-colors relative group/cell`}
                            >
                              <div className="flex items-center justify-center">
                                {/* Click to Cycle button */}
                                <button
                                  type="button"
                                  onClick={() => toggleAttendanceStatus(part.id, session.date)}
                                  className="outline-none focus:ring-1 focus:ring-slate-350 p-1.5 rounded-lg transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                                  title={titleText}
                                >
                                  {statusIcon}
                                </button>
                              </div>

                              {/* Small Popover Menu on Cell Hover for Quick Access to Explicit States */}
                              <div className="opacity-0 group-hover/cell:opacity-100 pointer-events-none group-hover/cell:pointer-events-auto absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-slate-900 border border-slate-800 text-white rounded-lg p-1 shadow-md flex items-center gap-1.5 z-10 transition-all text-[10px]">
                                <button 
                                  onClick={() => setSpecificAttendance(part.id, session.date, 'present')} 
                                  className={`px-1.5 py-0.5 rounded text-emerald-400 hover:bg-slate-800 font-medium ${status === 'present' ? 'bg-slate-800 font-bold' : ''}`}
                                >
                                  Present
                                </button>
                                <button 
                                  onClick={() => setSpecificAttendance(part.id, session.date, 'absent')} 
                                  className={`px-1.5 py-0.5 rounded text-rose-450 hover:bg-slate-800 font-medium ${status === 'absent' ? 'bg-slate-800 font-bold' : ''}`}
                                >
                                  Absent
                                </button>
                                <button 
                                  onClick={() => setSpecificAttendance(part.id, session.date, 'excused')} 
                                  className={`px-1.5 py-0.5 rounded text-slate-400 hover:bg-slate-800 font-medium ${status === 'excused' ? 'bg-slate-800 font-bold' : ''}`}
                                >
                                  Excused
                                </button>
                                <button 
                                  onClick={() => setSpecificAttendance(part.id, session.date, 'unmarked')} 
                                  className={`px-1.5 py-0.5 rounded text-slate-400 hover:bg-slate-800 font-medium ${status === 'unmarked' ? 'bg-slate-800 font-bold' : ''}`}
                                >
                                  Clear
                                </button>
                              </div>
                            </td>
                          );
                        })}

                        {/* Attendance percentage overview Column */}
                        <td className="p-4 text-center border-l border-slate-100/70">
                          <button
                            type="button"
                            onClick={() => setSelectedParticipantId(part.id)}
                            className="flex flex-col items-center justify-center mx-auto hover:bg-indigo-50/50 p-1.5 rounded-xl transition-all cursor-pointer border border-transparent hover:border-indigo-150 group/rate outline-hidden"
                            title="Click to view full engagement analysis and details"
                          >
                            <span className="font-mono font-bold text-slate-800 text-xs flex items-center gap-1 group-hover/rate:text-indigo-700">
                              {stats?.attendanceRate}%
                              <TrendingUp className="h-3 w-3 text-indigo-550 opacity-60 group-hover/rate:opacity-100 group-hover/rate:scale-110 transition-all" />
                            </span>
                            
                            {/* Fraction indicator */}
                            <span className="text-[10px] text-slate-450 mt-0.5 block group-hover/rate:text-indigo-650">
                              Absent: {stats?.totalAbsent}/{stats?.totalSessions}
                            </span>

                            {/* Alert labels helper */}
                            {stats && stats.totalAbsent > 0 && (
                              <div className="flex gap-1 mt-1">
                                {stats.consecutiveAbsences >= 2 && (
                                  <span className="text-[9px] px-1 bg-amber-100 text-amber-700 rounded font-bold font-mono">
                                    {stats.consecutiveAbsences} Consec
                                  </span>
                                )}
                              </div>
                            )}
                          </button>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-sans">
                    {/* Sticky Left Turnout Details column label */}
                    <td className="p-4 px-6 sticky left-0 bg-slate-50 z-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-b border-slate-200">
                      <div className="flex flex-col">
                        <span className="font-extrabold text-slate-850 text-[11px] font-mono uppercase tracking-wider">
                          Session Turnout
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal mt-0.5">
                          Turnout of visible ({filteredParticipants.length}) participants
                        </span>
                      </div>
                    </td>

                    {/* Dynamic Date column summaries */}
                    {sessions.map(session => {
                      let presentCount = 0;
                      let absentCount = 0;
                      let excusedCount = 0;

                      filteredParticipants.forEach(p => {
                        const status = attendance[p.id]?.[session.date] || 'unmarked';
                        if (status === 'present') {
                          presentCount++;
                        } else if (status === 'absent') {
                          absentCount++;
                        } else if (status === 'excused') {
                          excusedCount++;
                        }
                      });

                      return (
                        <td 
                          key={`foot-${session.date}`} 
                          className="p-3 text-center border-l border-slate-200 bg-slate-50/75 border-b border-slate-200 select-none"
                        >
                          <div className="flex flex-col items-center justify-center gap-1.5 py-1">
                            {/* Present badge count */}
                            <div 
                              className="flex items-center gap-1.5 text-emerald-850 bg-emerald-100/40 px-2 py-0.5 rounded-full font-bold font-mono text-[9px] w-[64px] justify-start" 
                              title={`${presentCount} student(s) marked Present`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                              <span>P: {presentCount}</span>
                            </div>
                            
                            {/* Absent badge count */}
                            <div 
                              className="flex items-center gap-1.5 text-rose-850 bg-rose-100/50 px-2 py-0.5 rounded-full font-bold font-mono text-[9px] w-[64px] justify-start" 
                              title={`${absentCount} student(s) marked Absent`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                              <span>A: {absentCount}</span>
                            </div>

                            {/* Excused badge count */}
                            <div 
                              className="flex items-center gap-1.5 text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full font-bold font-mono text-[9px] w-[64px] justify-start" 
                              title={`${excusedCount} student(s) marked Excused`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0"></span>
                              <span>E: {excusedCount}</span>
                            </div>
                          </div>
                        </td>
                      );
                    })}

                    {/* Overall presence rate summary */}
                    <td className="p-4 text-center border-l border-slate-200 bg-slate-50/75 border-b border-slate-200">
                      {(() => {
                        let totalRateSum = 0;
                        let countWithSessions = 0;
                        filteredParticipants.forEach(p => {
                          const stats = participantStatsMap[p.id];
                          if (stats && stats.totalSessions > 0) {
                            totalRateSum += stats.attendanceRate;
                            countWithSessions++;
                          }
                        });
                        const averageRate = countWithSessions > 0 ? Math.round(totalRateSum / countWithSessions) : 0;
                        return (
                          <div className="flex flex-col items-center justify-center py-1">
                            <span className="font-mono font-black text-slate-800 text-xs">
                              {averageRate}%
                            </span>
                            <span className="text-[9px] text-slate-400 uppercase font-mono mt-0.5 text-center block">
                              Avg Rate
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* TABLE FOOTER FOR MASS ACTIONS */}
          <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-slate-400">💡 Tip:</span>
              <span>Click on any cell icon directly to cycle states: <b>Present</b> ➔ <b>Absent</b> ➔ <b>Excused</b> ➔ <b>Unmarked</b>.</span>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClearAllData}
                className="text-red-650 hover:text-red-700 font-medium flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear All Data
              </button>
            </div>
          </div>
        </section>
          </>
        )}

        {currentTab === 'journal' && (() => {
          const allJournalEntries = activeParticipants.flatMap(p => 
            (p.outreachNotes || []).map(log => ({
              participant: p,
              stats: participantStatsMap[p.id],
              log: log
            }))
          ).sort((a, b) => b.log.date.localeCompare(a.log.date));

          const filteredJournalEntries = allJournalEntries.filter(entry => {
            const matchesSearch = 
              entry.participant.name.toLowerCase().includes(journalSearchQuery.toLowerCase()) ||
              (entry.participant.idNo && entry.participant.idNo.toLowerCase().includes(journalSearchQuery.toLowerCase())) ||
              entry.log.notes.toLowerCase().includes(journalSearchQuery.toLowerCase()) ||
              entry.log.loggedBy.toLowerCase().includes(journalSearchQuery.toLowerCase());

            const matchesStatus = journalStatusFilter === 'all' || entry.log.status === journalStatusFilter;

            const matchesAlert = journalAlertFilter === 'all' || (journalAlertFilter === 'red_alert' && entry.stats?.hasRedFlag);

            return matchesSearch && matchesStatus && matchesAlert;
          });

          const totalEntries = allJournalEntries.length;
          const activeInterventions = allJournalEntries.filter(e => e.log.status !== 'resolved').length;
          const resolvedCount = allJournalEntries.filter(e => e.log.status === 'resolved').length;

          return (
            <div className="space-y-6">
              {/* JOURNAL BANNER */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-md">
                <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-15 pointer-events-none flex items-center justify-center">
                  <BookOpen className="w-48 h-48 text-emerald-400" />
                </div>
                <div className="relative z-2 max-w-2xl font-sans">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-bold uppercase tracking-wider mb-3.5 border border-emerald-500/20">
                    📖 Student Discussion Intervention Journal
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                    Outreach & Case Management Log
                  </h2>
                  <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                    View and update active caregiver check-ins and student intervention logs. Under center policy, saving an active discussion log for a student with consecutive absences hides their Red Alert indicator in the <b>Active Student Board</b> to declutter action items, retaining the alert only here in the journal until resolved.
                  </p>
                </div>
              </div>

              {/* STATS HIGHLIGHTS GRID */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block">Total Discussions Logged</span>
                  <span className="text-2xl font-black text-slate-800 font-mono block mt-1">{totalEntries}</span>
                  <span className="text-xs text-slate-500 mt-1 block">Historic caregiver correspondence logs</span>
                </div>
                <div className="bg-rose-50/50 border border-rose-200/60 rounded-2xl p-5 shadow-2xs">
                  <span className="text-[10px] text-rose-700 uppercase tracking-wider font-bold block">Active Interventions</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-2xl font-black text-rose-700 font-mono block">{activeInterventions}</span>
                    <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse"></span>
                  </div>
                  <span className="text-xs text-rose-600 mt-1 block">Pending response or in discussion</span>
                </div>
                <div className="bg-emerald-50/40 border border-emerald-200/50 rounded-2xl p-5 shadow-2xs">
                  <span className="text-[10px] text-emerald-700 uppercase tracking-wider font-bold block">Resolved Cases</span>
                  <span className="text-2xl font-black text-emerald-700 font-mono block mt-1">{resolvedCount}</span>
                  <span className="text-xs text-emerald-600 mt-1 block">Successfully resolved & archived</span>
                </div>
              </div>

              {/* FILTERS TOOLBAR */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-3xs flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
                <div className="flex-1 relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search logs by student name, ID, logged by, or note contents..."
                    value={journalSearchQuery}
                    onChange={(e) => setJournalSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-all font-sans"
                  />
                  {journalSearchQuery && (
                    <button 
                      onClick={() => setJournalSearchQuery('')} 
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 cursor-pointer text-xs"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2.5">
                  <div className="flex items-center gap-1.5 font-sans">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">Status:</span>
                    <select
                      value={journalStatusFilter}
                      onChange={(e) => setJournalStatusFilter(e.target.value as any)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-750 font-medium focus:outline-none cursor-pointer hover:bg-slate-100"
                    >
                      <option value="all">All States</option>
                      <option value="pending">⏳ Pending Response</option>
                      <option value="contacted">📞 In Discussion</option>
                      <option value="resolved">✅ Resolved / Actioned</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 font-sans">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">Standing:</span>
                    <select
                      value={journalAlertFilter}
                      onChange={(e) => setJournalAlertFilter(e.target.value as any)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-750 font-medium focus:outline-none cursor-pointer hover:bg-slate-100"
                    >
                      <option value="all">All Students</option>
                      <option value="red_alert">🚨 Red Alert Standing Only</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* LOG ENTRIES FEED */}
              {filteredJournalEntries.length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-12 text-center flex flex-col items-center justify-center font-sans">
                  <BookOpen className="w-12 h-12 text-slate-300 mb-3.5" />
                  <h3 className="text-sm font-bold text-slate-700">No Journal Entries Found</h3>
                  <p className="text-xs text-slate-450 mt-1 max-w-md mx-auto leading-relaxed">
                    {totalEntries === 0 
                      ? "There are no saved outreach or discussion logs in the system yet. To create one, go to the Active Student Board, click on any participant, navigate to their outreach space, and log a conversation."
                      : "Adjust your filters. No logged elements match the search parameters selected above."
                    }
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans">
                  {filteredJournalEntries.map((entry) => {
                    const p = entry.participant;
                    const log = entry.log;
                    const stats = entry.stats;

                    // Compute alert status tag
                    const hasActiveRed = stats?.hasRedFlag;
                    const hasActiveYellow = stats?.hasYellowFlag;

                    let alertTagBg = 'bg-slate-100 text-slate-700 border-slate-200';
                    let alertTagText = 'Normal Attendance Standing';
                    if (hasActiveRed) {
                      alertTagBg = 'bg-rose-50 text-rose-800 border-rose-200 animate-pulse';
                      alertTagText = '🚨 Red Alert Case (Managed via Journal)';
                    } else if (hasActiveYellow) {
                      alertTagBg = 'bg-amber-50 text-amber-800 border-amber-200';
                      alertTagText = '⚠️ Yellow Warning Standing';
                    }

                    return (
                      <div 
                        key={log.id} 
                        className={`bg-white border rounded-2xl p-5 shadow-xs transition-all relative flex flex-col justify-between hover:shadow-md ${
                          log.status === 'pending'
                            ? 'border-l-4 border-l-rose-500'
                            : log.status === 'contacted'
                              ? 'border-l-4 border-l-amber-500'
                              : 'border-l-4 border-l-emerald-500'
                        }`}
                      >
                        <div>
                          {/* Student Info Line */}
                          <div className="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                              {/* Avatar */}
                              <div 
                                onClick={() => setSelectedParticipantId(p.id)}
                                className={`h-10 w-10 rounded-xl border flex items-center justify-center font-bold text-xs uppercase cursor-pointer select-none ${p.avatarColor} overflow-hidden shrink-0 shadow-3xs`}
                              >
                                {p.photoUrl ? (
                                  <img src={p.photoUrl} alt={p.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  p.name.split(' ').map(n => n[0]).join('').slice(0, 2)
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span 
                                  onClick={() => setSelectedParticipantId(p.id)}
                                  className="font-bold text-slate-800 hover:text-indigo-700 cursor-pointer block text-xs truncate"
                                >
                                  {p.name}
                                </span>
                                <span className="text-[10px] text-slate-400 block mt-0.5">
                                  Cohort: {p.cohort} • Contact: {p.contact}
                                </span>
                              </div>
                            </div>

                            {/* Alert Standing Indicator */}
                            <div className={`px-2 py-0.5 rounded-full border text-[9px] font-bold ${alertTagBg}`}>
                              {alertTagText}
                            </div>
                          </div>

                          {/* Log Metadata Info */}
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mb-2">
                            <span>Logged On:</span>
                            <span className="font-bold text-slate-700">{formatToReadableDate(log.date)}</span>
                            <span>• By:</span>
                            <span className="font-bold text-slate-700">{log.loggedBy}</span>
                          </div>

                          {/* Notes block */}
                          <div className="bg-slate-50/75 rounded-xl p-3 text-xs text-slate-650 leading-relaxed border border-slate-100 font-sans italic mb-4">
                            "{log.notes}"
                          </div>
                        </div>

                        {/* Interactive Status controller */}
                        <div className="flex flex-wrap items-center justify-between gap-3 mt-auto pt-2 border-t border-slate-100">
                          {/* Dropdown status update */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase font-mono tracking-wide">Case Status:</span>
                            <select
                              value={log.status}
                              onChange={(e) => handleUpdateOutreachLogStatus(p.id, log.id, e.target.value as any)}
                              className={`text-[11px] rounded-lg px-2 py-1 font-bold cursor-pointer focus:outline-none transition-all border ${
                                log.status === 'resolved' 
                                  ? 'bg-emerald-50 text-emerald-805 border-emerald-200 hover:bg-emerald-100'
                                  : log.status === 'contacted'
                                    ? 'bg-amber-50 text-amber-805 border-amber-200 hover:bg-amber-100'
                                    : 'bg-rose-50 text-rose-805 border-rose-200 hover:bg-rose-100 animate-pulse'
                              }`}
                            >
                              <option value="pending">⏳ Pending Response</option>
                              <option value="contacted">📞 In Discussion</option>
                              <option value="resolved">✅ Resolved / Actioned</option>
                            </select>
                          </div>

                          {/* Action links */}
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this discussion journal entry? This will wipe the intervention log for this student.")) {
                                  handleDeleteOutreachLog(p.id, log.id);
                                }
                              }}
                              className="text-[11px] text-rose-600 hover:text-rose-850 hover:underline cursor-pointer flex items-center gap-0.5"
                              title="Delete this Log Entry"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedParticipantId(p.id)}
                              className="text-[11px] text-indigo-650 hover:text-indigo-850 hover:underline font-bold"
                            >
                              Open Profile ➔
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {currentTab === 'ai-analyst' && (
          <div className="space-y-6">
            {/* AI ANALYST WELCOME BANNER */}
            <div className="bg-gradient-to-r from-indigo-900 via-purple-950 to-indigo-900 border border-slate-200/10 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-md">
              <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none flex items-center justify-center">
                <Sparkles className="w-48 h-48 text-indigo-400 animate-pulse" />
              </div>
              <div className="relative z-2 max-w-2xl">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 text-indigo-200 text-[10px] font-bold uppercase tracking-wider mb-3.5 border border-purple-500/30">
                  ✨ Gemini AI Telemetry Analyst
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-sans text-white">
                  CYDC Student Engagement Analytics
                </h2>
                <p className="text-sm font-sans text-indigo-100 mt-2 leading-relaxed">
                  Utilize advanced agent models to inspect demographic variables, chronological attendance records, alert thresholds, and caseworker case discussions. Generate structured advice reports for every individual participant.
                </p>
              </div>
            </div>

            {/* ERROR DISPLAY */}
            {aiError && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider font-mono">
                    AI Service Alert
                  </h4>
                  <p className="text-xs text-rose-700 leading-normal">
                    {aiError}
                  </p>
                  <button
                    onClick={() => setAiError(null)}
                    className="text-[10px] font-bold text-rose-800 hover:underline mt-1"
                  >
                    Dismiss notification
                  </button>
                </div>
              </div>
            )}

            {/* MAIN AI WORKSPACE PANEL */}
            {!aiCohortReport && !aiReportLoading ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-5 shadow-2xs">
                <div className="h-16 w-16 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center mx-auto shadow-3xs">
                  <Sparkles className="w-8 h-8 text-indigo-650 animate-pulse" />
                </div>
                <div className="max-w-md mx-auto space-y-2">
                  <h3 className="text-base font-bold text-slate-850 font-sans">
                    Generate Comprehensive AI Engagement Report
                  </h3>
                  <p className="text-xs text-slate-500 leading-normal font-sans">
                    Analyzing active students, attendance flag triggers, and historical casework records. Generates a personalized diagnostic report synopsis and tailored next-steps for <b>every single participant</b> in the cydc roster.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    onClick={generateCohortAIReport}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs py-3 px-6 rounded-xl shadow-xs hover:scale-102 active:scale-98 transition-all cursor-pointer inline-flex items-center gap-2"
                  >
                    <Brain className="w-4 h-4 text-amber-300 animate-spin" />
                    <span>Run Cohort-Wide AI Analysis</span>
                  </button>
                </div>
              </div>
            ) : aiReportLoading ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-6 shadow-2xs">
                <div className="relative w-23 h-20 mx-auto">
                  <div className="absolute inset-x-0 inset-y-0 rounded-full border-4 border-slate-100"></div>
                  <div className="absolute inset-x-0 inset-y-0 rounded-full border-4 border-indigo-650 border-t-transparent animate-spin"></div>
                  <div className="absolute inset-x-0 inset-y-0 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-indigo-650 animate-pulse" />
                  </div>
                </div>
                <div className="max-w-sm mx-auto space-y-2">
                  <h4 className="text-xs font-bold text-indigo-650 uppercase tracking-widest font-mono animate-pulse">
                    Synthesizing Engagement Models...
                  </h4>
                  <p className="text-[11px] text-slate-450 leading-normal font-sans">
                    Leveraging Google Gemini to read casework discussion records, trace individual streak patterns, analyze attendance distributions, and formulate counseling directions for {participants.length} participants. This may take 5–10 seconds.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* METRICS DISCOVER ROW */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono flex items-center gap-1.5">
                      📊 Compiled Report Statistics
                    </h3>
                    <p className="text-[10px] text-slate-500">
                      Report cache successfully compiled with Gemini 3.5. Fully persistent offline during local session.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      onClick={generateCohortAIReport}
                      className="bg-indigo-50 border border-indigo-250 text-indigo-700 hover:bg-indigo-100 font-extrabold text-[11px] px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                    >
                      🔄 Regenerate Report
                    </button>
                    <button
                      onClick={clearCohortAIReport}
                      className="bg-white border border-slate-200 text-rose-600 hover:bg-rose-50 font-bold text-[11px] px-3.5 py-1.5 rounded-xl transition-all cursor-pointer"
                    >
                      Clear Report Cache
                    </button>
                    <button
                      onClick={downloadCohortAIReportPDF}
                      className="bg-indigo-600 border border-indigo-700 text-white hover:bg-indigo-700 font-extrabold text-[11px] px-4 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-xs active:scale-95"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                      <span>Download Official Letterhead PDF</span>
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="bg-slate-900 border border-slate-950 text-white hover:bg-black font-extrabold text-[11px] px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0 shadow-3xs"
                    >
                      Print Summary
                    </button>
                  </div>
                </div>

                {/* TWO COLUMN SUMMARY ANALYSIS */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Executive Brief Card */}
                  <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-3xs">
                    <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                      <Brain className="w-5 h-5 text-indigo-650" />
                      <h3 className="text-sm font-bold text-slate-900 font-sans tracking-tight">
                        Executive Cohort Engagement Brief
                      </h3>
                    </div>
                    <p className="text-xs text-slate-650 leading-relaxed font-sans whitespace-pre-line">
                      {aiCohortReport.cohortSummary}
                    </p>
                  </div>

                  {/* Risks Segment Card */}
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-3xs">
                    <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                      <AlertTriangle className="w-5 h-5 text-indigo-650" />
                      <h3 className="text-sm font-bold text-slate-900 font-sans tracking-tight">
                        Cohort Welfare Segments
                      </h3>
                    </div>
                    <p className="text-xs text-slate-650 leading-relaxed font-sans whitespace-pre-line border-b border-slate-100 pb-3">
                      {aiCohortReport.overallRiskDistribution}
                    </p>
                    <div className="bg-indigo-50/50 p-3 rounded-2xl border border-indigo-100 text-[10.5px] text-indigo-750 font-sans leading-normal">
                      💡 <b>Insight:</b> Use the student table below to filter active warnings or jump into individual casework logs.
                    </div>
                  </div>
                </div>

                {/* INDIVIDUAL STUDENTS REPORTS LIST */}
                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
                  <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <h3 className="text-sm font-bold text-slate-900 font-sans">
                        Compiled Student-by-Student Advisory Reports
                      </h3>
                      <p className="text-xs text-slate-500 font-sans">
                        Personalized AI analysis indices detailing engagement synopsis and targeted intervention workflows.
                      </p>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-150 px-2.5 py-1 rounded-full text-[10px] font-bold text-indigo-700 font-mono">
                      {aiCohortReport.studentReports?.length || 0} Participants Listed
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 overflow-x-auto">
                    {/* List matching all reported students */}
                    {aiCohortReport.studentReports?.map((item) => {
                      const origPat = participants.find(p => p.id === item.participantId);
                      const stats = origPat ? participantStatsMap[origPat.id] : null;

                      return (
                        <div key={item.participantId} className="p-5 hover:bg-slate-50/50 transition-colors flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {origPat?.avatarColor && (
                                <div className={`h-6 w-6 rounded-md flex items-center justify-center font-bold text-[9px] uppercase tracking-tight overflow-hidden ${origPat.avatarColor} shrink-0`}>
                                  {origPat.photoUrl ? (
                                    <img src={origPat.photoUrl} alt={origPat.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                                  ) : (
                                    origPat.name.slice(0, 2)
                                  )}
                                </div>
                              )}
                              <h4 className="text-xs font-bold text-slate-900 hover:underline cursor-pointer font-sans" onClick={() => setSelectedParticipantId(item.participantId)}>
                                {item.name}
                              </h4>
                              <span className="text-[10px] text-slate-450 font-mono">
                                ({origPat?.cohort || 'General'})
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                item.standing === 'Safe' || item.standing === 'Stable'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-150'
                                  : item.standing === 'At Risk' || item.standing === 'Moderate'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-150'
                                    : 'bg-rose-50 text-rose-700 border border-rose-150 animate-pulse'
                              }`}>
                                {item.standing}
                              </span>
                              <span className="bg-slate-100 text-slate-600 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-200">
                                Attendance: {item.attendanceRate || (stats ? `${stats.attendanceRate}%` : 'N/A')}
                              </span>
                            </div>

                            <p className="text-[11.5px] text-slate-600 leading-relaxed font-sans">
                              📝 <span className="italic font-normal">"{item.synopsis}"</span>
                            </p>

                            <div className="flex items-center gap-2 text-[10.5px] text-indigo-700 bg-indigo-50/40 px-2.5 py-1.5 rounded-xl border border-indigo-100/50 max-w-fit">
                              <span className="font-mono font-extrabold uppercase text-[9px] text-indigo-500 shrink-0">Action Plan:</span>
                              <span className="font-medium font-sans leading-relaxed">{item.recommendedAction}</span>
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-2 self-stretch md:self-center justify-end">
                            <button
                              onClick={() => {
                                if (origPat && stats) {
                                  generateIndividualAIReport(origPat, stats);
                                  setSelectedParticipantId(origPat.id);
                                }
                              }}
                              className="text-[11px] bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold py-1.5 px-3 border border-slate-200 rounded-xl cursor-pointer shadow-3xs"
                            >
                              Explore Deep Report
                            </button>
                            <button
                              onClick={() => setSelectedParticipantId(item.participantId)}
                              className="text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-1.5 px-3 rounded-xl cursor-pointer shadow-3xs transition-all"
                            >
                              View Dossier
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {currentTab === 'admin' && (
          <div className="space-y-6">
            {/* ADMIN WELCOME BANNER */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-md">
              <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none flex items-center justify-center">
                <FileCode className="w-48 h-48 text-indigo-400" />
              </div>
              <div className="relative z-2 max-w-2xl">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 text-[10px] font-bold uppercase tracking-wider mb-3.5 border border-amber-500/20">
                  🛡️ Administrator Terminal Area
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-sans text-white">
                  Lomuriangole CYDC Admin Panel
                </h2>
                <p className="text-sm font-sans text-slate-300 mt-2 leading-relaxed">
                  Perform system management actions, bulk register or de-register cohorts, inspect student profiles, and download or upload files securely while preserving former student records.
                </p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <button
                    onClick={() => setIsAddParticipantOpen(true)}
                    className="bg-amber-400 hover:bg-amber-500 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <UserPlus className="h-4 w-4" />
                    Register Student
                  </button>
                  <button
                    onClick={() => setIsMonthlyReportOpen(true)}
                    className="bg-indigo-650 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md border border-indigo-550/40"
                  >
                    <FileText className="h-4 w-4 text-indigo-300" />
                    Generate Monthly Report
                  </button>
                  <button
                    onClick={handleExportFormerCSV}
                    className="bg-white/10 hover:bg-white/15 border border-white/25 hover:border-white/35 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="h-4 w-4 text-amber-300" />
                    Download Archives (CSV)
                  </button>
                  <button
                    onClick={handleArchiveAllActiveParticipants}
                    disabled={!isAdminMode}
                    className={`border text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1.5 rounded-xl px-4 py-2 ml-auto ${
                      isAdminMode
                        ? "bg-rose-500/20 hover:bg-rose-500/30 border-rose-500/40 text-rose-200 cursor-pointer"
                        : "bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed opacity-40"
                    }`}
                    title={isAdminMode ? "Archive all active students in bulk" : "Locked - Enable Admin Mode to archive"}
                  >
                    <Trash2 className={`h-4 w-4 ${isAdminMode ? "text-rose-400" : "text-slate-600"}`} />
                    Archive All Current Active ({activeParticipants.length})
                  </button>
                </div>
              </div>
            </div>

            {/* QUICK ANALYTICS CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card A: Active participants count */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold block">Total Active Co-tracked</span>
                  <span className="text-2xl font-bold font-sans text-slate-900 mt-1 block">{activeParticipants.length}</span>
                  <span className="text-[10px] text-emerald-600 font-medium mt-0.5 block">● Fully active in attendance programs</span>
                </div>
                <div className="h-10 w-10 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
              </div>

              {/* Card B: Former participants count */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold block">Former Archived Records</span>
                  <span className="text-2xl font-bold font-sans text-slate-900 mt-1 block">{formerParticipants.length}</span>
                  <span className="text-[10px] text-slate-500 font-medium mt-0.5 block">🏡 Kept in read-only CSV/system logs</span>
                </div>
                <div className="h-10 w-10 bg-slate-100 text-slate-600 rounded-xl border border-slate-250 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
              </div>

              {/* Card C: Gender Distribution active */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold block">Active Male / Female</span>
                  <span className="text-xl font-bold text-slate-900 mt-1 block">
                    {activeParticipants.filter(p => p.gender === 'Male').length}M / {activeParticipants.filter(p => p.gender === 'Female').length}F
                  </span>
                  <span className="text-[10px] text-indigo-600 mt-0.5 block font-medium">Other: {activeParticipants.filter(p => p.gender !== 'Male' && p.gender !== 'Female').length} students</span>
                </div>
                <div className="h-10 w-10 bg-pink-50 text-pink-700 rounded-xl border border-pink-100 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-pink-500" />
                </div>
              </div>

              {/* Card D: Cohort standing counts */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold block">Active Cohorts Size</span>
                  <span className="text-xl font-bold text-slate-900 mt-1 block">
                    {COHORTS.filter(c => c !== 'All Cohorts').length} Groups
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Average {activeParticipants.length ? Math.round(activeParticipants.length / (COHORTS.length - 1)) : 0} per class</span>
                </div>
                <div className="h-10 w-10 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-indigo-500" />
                </div>
              </div>
            </div>

            {/* OVERALL ATTENDANCE RATE TREND BAR CHART */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-indigo-600" />
                    Overall Attendance Rate Trend
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Analyzing participation standing of all students across past and present sessions.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                    {sessions.length} sessions tracked
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                    Avg: {overallAttendanceRate}% Rating
                  </span>
                </div>
              </div>

              {sessionsTrendData.length === 0 ? (
                <div className="py-12 text-center text-slate-400 italic text-xs">
                  No sessions created yet to compute attendance rate trend analytics.
                </div>
              ) : (
                <div className="h-72 w-full font-sans text-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={sessionsTrendData}
                      margin={{ top: 10, right: 10, left: -25, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="shortDate" 
                        stroke="#94a3b8" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                      />
                      <YAxis 
                        stroke="#94a3b8" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white rounded-xl p-3 shadow-lg border border-slate-800 space-y-1 text-[11px] font-sans">
                                <p className="font-bold border-b border-white/10 pb-1 mb-1.5 text-indigo-300">
                                  {data.label} ({formatToReadableDate(data.date)})
                                </p>
                                <div className="space-y-0.5 font-sans">
                                  <div className="flex justify-between gap-6">
                                    <span className="text-slate-400">Attendance Rate:</span>
                                    <span className="font-extrabold text-amber-300">{data.attendanceRate}%</span>
                                  </div>
                                  <div className="flex justify-between gap-6">
                                    <span className="text-slate-400">Total Checked:</span>
                                    <span className="font-bold text-slate-200">{data.totalStudents} students</span>
                                  </div>
                                  <div className="flex justify-between gap-6 pt-1 border-t border-white/5 mt-1 text-[10px]">
                                    <span className="text-emerald-400">Present (Excused):</span>
                                    <span>{data.present + data.excused}</span>
                                  </div>
                                  <div className="flex justify-between gap-6 text-[10px]">
                                    <span className="text-rose-300">Absent:</span>
                                    <span>{data.absent}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar 
                        dataKey="attendanceRate" 
                        radius={[6, 6, 0, 0]}
                        maxBarSize={45}
                      >
                        {sessionsTrendData.map((entry, index) => {
                          const rate = entry.attendanceRate;
                          let barColor = '#4f46e5'; // default indigo-600
                          if (rate >= 80) barColor = '#10b981'; // emerald-500
                          else if (rate >= 50) barColor = '#f59e0b'; // amber-500
                          else if (rate > 0) barColor = '#ef4444'; // red-500
                          return <Cell key={`cell-${index}`} fill={barColor} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* COHORT ATTENDANCE COMPARISON SECTION */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-indigo-655 font-sans" />
                    Cohort Standing & Comparison Dashboard
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Compare average attendance rates across classes grouped by gender or student lifecycle status side-by-side.
                  </p>
                </div>

                {/* Grouping toggler */}
                <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 self-start sm:self-center">
                  <button
                    type="button"
                    onClick={() => setCohortGroupingMode('gender')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      cohortGroupingMode === 'gender'
                        ? 'bg-white text-indigo-700 shadow-3xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Group by Gender
                  </button>
                  <button
                    type="button"
                    onClick={() => setCohortGroupingMode('status')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      cohortGroupingMode === 'status'
                        ? 'bg-white text-indigo-700 shadow-3xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Group by Active Status
                  </button>
                </div>
              </div>

              {/* Chart container */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                {/* Left side: Grouped Bar Chart */}
                <div className="lg:col-span-8 bg-slate-50/50 rounded-2xl border border-slate-100 p-4 flex flex-col justify-between">
                  <div className="w-full h-80 font-sans text-xs">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={cohortComparisonData}
                        margin={{ top: 15, right: 10, left: -25, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
                        <XAxis 
                          dataKey="cohort" 
                          stroke="#64748b" 
                          fontSize={11} 
                          tickLine={false} 
                          axisLine={false}
                        />
                        <YAxis 
                          stroke="#64748b" 
                          fontSize={11} 
                          tickLine={false} 
                          axisLine={false}
                          domain={[0, 100]}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-slate-900 text-white rounded-xl p-4 shadow-lg border border-slate-800 space-y-2 text-[11px] font-sans text-left">
                                  <p className="font-extrabold border-b border-white/10 pb-1.5 text-indigo-300 text-xs">
                                    🏫 {data.cohort}
                                  </p>
                                  <div className="space-y-1 font-sans">
                                    <div className="flex justify-between gap-8 pb-1 border-b border-white/5 font-sans">
                                      <span className="text-slate-400">Overall Attendance:</span>
                                      <span className="font-extrabold text-amber-300">{data.overallRate}%</span>
                                    </div>
                                    {cohortGroupingMode === 'gender' ? (
                                      <>
                                        <div className="flex justify-between gap-8">
                                          <span className="text-sky-300 flex items-center gap-1">♂️ Male ({data.maleCount}):</span>
                                          <span className="font-bold font-mono">{data.maleRate}%</span>
                                        </div>
                                        <div className="flex justify-between gap-8">
                                          <span className="text-pink-300 flex items-center gap-1">♀️ Female ({data.femaleCount}):</span>
                                          <span className="font-bold font-mono">{data.femaleRate}%</span>
                                        </div>
                                        {data.othersCount > 0 && (
                                          <div className="flex justify-between gap-8">
                                            <span className="text-slate-300">Other ({data.othersCount}):</span>
                                            <span className="font-bold font-mono">{data.othersRate}%</span>
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <div className="flex justify-between gap-8">
                                          <span className="text-emerald-300 flex items-center gap-1">🟢 Active ({data.activeCount}):</span>
                                          <span className="font-bold font-mono">{data.activeRate}%</span>
                                        </div>
                                        <div className="flex justify-between gap-8">
                                          <span className="text-rose-300 flex items-center gap-1">🏡 Former ({data.formerCount}):</span>
                                          <span className="font-bold font-mono">{data.formerRate}%</span>
                                        </div>
                                      </>
                                    )}
                                    <div className="text-[10px] text-slate-400 pt-1 text-center font-medium">
                                      Total Students: {data.overallCount}
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Legend verticalAlign="top" height={36} iconType="circle" />
                        {cohortGroupingMode === 'gender' ? (
                          <>
                            <Bar 
                              name="Male Avg Rate (%)" 
                              dataKey="maleRate" 
                              fill="#38bdf8" 
                              radius={[4, 4, 0, 0]}
                              maxBarSize={28}
                            />
                            <Bar 
                              name="Female Avg Rate (%)" 
                              dataKey="femaleRate" 
                              fill="#ec4899" 
                              radius={[4, 4, 0, 0]}
                              maxBarSize={28}
                            />
                            <Bar 
                              name="Combined Avg Rate (%)" 
                              dataKey="overallRate" 
                              fill="#6366f1" 
                              radius={[4, 4, 0, 0]}
                              maxBarSize={28}
                            />
                          </>
                        ) : (
                          <>
                            <Bar 
                              name="Active Avg Rate (%)" 
                              dataKey="activeRate" 
                              fill="#10b981" 
                              radius={[4, 4, 0, 0]}
                              maxBarSize={28}
                            />
                            <Bar 
                              name="Archive Avg Rate (%)" 
                              dataKey="formerRate" 
                              fill="#f43f5e" 
                              radius={[4, 4, 0, 0]}
                              maxBarSize={28}
                            />
                            <Bar 
                              name="Overall Avg Rate (%)" 
                              dataKey="overallRate" 
                              fill="#8b5cf6" 
                              radius={[4, 4, 0, 0]}
                              maxBarSize={28}
                            />
                          </>
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Right side: Detailed Class stats & insight cards */}
                <div className="lg:col-span-4 flex flex-col justify-between gap-4">
                  <div className="space-y-3.5">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Cohort Insights & Summary
                    </h4>

                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {cohortComparisonData.map(c => {
                        let statusText = 'Excellent';
                        let badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-250';
                        if (c.overallRate < 60) {
                          statusText = 'Needs Attention';
                          badgeColor = 'bg-rose-50 text-rose-800 border-rose-250';
                        } else if (c.overallRate < 80) {
                          statusText = 'Satisfactory';
                          badgeColor = 'bg-amber-50 text-amber-800 border-amber-250';
                        }

                        return (
                          <div 
                            key={c.cohort} 
                            className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between gap-2.5 hover:shadow-3xs transition-shadow"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <span className="font-bold text-slate-800 text-xs block truncate" title={c.cohort}>
                                  {c.cohort}
                                </span>
                                <span className="text-[10px] text-slate-400 block font-medium">
                                  {c.overallCount} total participants mapped
                                </span>
                              </div>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${badgeColor} shrink-0`}>
                                {statusText}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-4 border-t border-slate-150 pt-2.5">
                              <div>
                                <span className="text-[9px] text-slate-400 font-bold uppercase block">Avg Rate</span>
                                <span className="text-sm font-extrabold text-slate-900 font-mono">
                                  {c.overallRate}%
                                </span>
                              </div>
                              <div>
                                <span className="text-[9px] text-slate-400 font-bold uppercase block">
                                  {cohortGroupingMode === 'gender' ? 'Girls Avg' : 'Active Avg'}
                                </span>
                                <span className="text-xs font-bold text-slate-750 font-mono">
                                  {cohortGroupingMode === 'gender' ? `${c.femaleRate}%` : `${c.activeRate}%`}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-indigo-50 border border-indigo-150 rounded-xl p-4.5 space-y-2">
                    <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      💡 Smart Recommendation
                    </h5>
                    <p className="text-[11px] text-indigo-700 leading-relaxed font-semibold font-sans">
                      Ensure your target attendance cohort rate is kept above <span className="font-extrabold text-indigo-900 font-mono">80%</span>. 
                      Add saved outreach logs in the active workspace logs to trigger proactive care steps.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* PROGRAM SESSIONS COORDINATOR COMPONENT */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-150 pb-4 mb-4 gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5 font-sans">
                    📅 Program Sessions Coordinator
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 font-sans">
                    Update scheduled teaching session calendars, edit labels, or change previous logging dates using the calendar selectors.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-indigo-50 border border-indigo-150 text-indigo-700 font-bold px-2.5 py-1 rounded-full font-mono shrink-0">
                    {sessions.length} sessions co-tracked
                  </span>
                </div>
              </div>

              {sessions.length === 0 ? (
                <div className="py-8 text-center text-slate-400 italic text-xs font-sans">
                  No tracking sessions exist yet. Add session dates in the active tracker dashboard to begin.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sessions.map((s) => {
                    const isEditing = editingSessionOriginalDate === s.date;
                    return (
                      <div 
                        key={s.date} 
                        className={`p-4 border rounded-2xl relative transition-all flex flex-col justify-between ${
                          isEditing 
                            ? 'border-indigo-500 bg-indigo-50/25 ring-1 ring-indigo-550/20 shadow-xs' 
                            : 'border-slate-200 bg-slate-50/40 hover:bg-slate-50/80 hover:shadow-2xs'
                        }`}
                      >
                        {isEditing ? (
                          <div className="space-y-3 font-sans w-full">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase font-bold text-indigo-700 tracking-wider">
                                Editing Session Details
                              </span>
                              <span className="text-[9px] uppercase font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                Calendar Editing
                              </span>
                            </div>
                            <div className="space-y-2 text-xs">
                              <div>
                                <label className="text-[9px] text-slate-500 font-bold uppercase block mb-0.5">
                                  Select Calendar Date
                                </label>
                                <input
                                  type="date"
                                  value={editSessionDate}
                                  onChange={(e) => setEditSessionDate(e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-white border border-slate-250 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500 shadow-2xs cursor-pointer"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] text-slate-500 font-bold uppercase block mb-0.5">
                                  Session Label / Name
                                </label>
                                <input
                                  type="text"
                                  value={editSessionLabel}
                                  onChange={(e) => setEditSessionLabel(e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-white border border-slate-250 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                                  placeholder="Session Name"
                                />
                              </div>
                            </div>
                            <div className="flex gap-2 pt-2 border-t border-slate-150">
                              <button
                                type="button"
                                onClick={() => {
                                  handleEditSession(s.date, editSessionDate, editSessionLabel);
                                }}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] py-1.5 rounded-lg shadow-3xs cursor-pointer text-center"
                              >
                                Save Changes
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingSessionOriginalDate(null)}
                                className="bg-white hover:bg-slate-100 text-slate-755 border border-slate-200 font-bold text-[10px] py-1.5 px-2.5 rounded-lg shadow-3xs cursor-pointer text-center"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col h-full justify-between gap-3 font-sans">
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-150 px-2 py-0.5 rounded-md">
                                  {s.date}
                                </span>
                                <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">
                                  Recorded Session
                                </span>
                              </div>
                              <h4 className="text-xs font-bold text-slate-800 mt-2 truncate max-w-[170px]" title={s.label}>
                                {s.label}
                              </h4>
                            </div>

                            <div className="flex items-center justify-between border-t border-slate-150 pt-2 mt-1">
                              <span className="text-[10px] font-mono text-slate-450">
                                {formatToReadableDate(s.date)}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!isAdminMode) {
                                    alert("Session modifications are restricted. Please unlock Admin Mode to modify system records.");
                                    setIsPasscodeFieldOpen(true);
                                    return;
                                  }
                                  setEditingSessionOriginalDate(s.date);
                                  setEditSessionDate(s.date);
                                  setEditSessionLabel(s.label);
                                }}
                                className="text-[11px] text-indigo-600 hover:text-indigo-805 hover:underline font-bold cursor-pointer"
                              >
                                Edit Details ➔
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SYSTEM BACKUP, RESTORE & OFFLINE STORAGE CONTROL MODULE */}
            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 shadow-3xs flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1.5 md:max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-150 text-indigo-750 font-bold">
                    🛡️
                  </span>
                  <h3 className="text-sm font-extrabold text-slate-900 font-sans">
                    System Backup & Offline Storage
                  </h3>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed font-sans">
                  Bundle student profiles, active cohorts registration data, historical dates, and physical attendance records into an offline JSON backup file. Store this securely for offline records retention or to restore state later.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                {/* Download backup button */}
                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Download bundled database as a portable static JSON file"
                >
                  <Download className="w-4 h-4 text-indigo-200" />
                  Download Complete Backup (.JSON)
                </button>

                {/* Restore backup button/input */}
                <div className="relative">
                  <input
                    type="file"
                    accept=".json"
                    id="admin-backup-restore-input"
                    onChange={handleRestoreBackup}
                    className="hidden"
                  />
                  <label
                    htmlFor="admin-backup-restore-input"
                    className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs py-2.5 px-4 rounded-xl shadow-3xs transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Upload backup JSON file to restore database data"
                  >
                    <Upload className="w-4 h-4 text-slate-500" />
                    Restore Backup File
                  </label>
                </div>
              </div>
            </div>

            {/* TWO COLUMN GRID FOR DIRECT ACTION REGISTRY */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Active Participants Administration list (left 7 cols) */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs flex flex-col">
                <div className="p-5 border-b border-slate-150 flex items-center justify-between bg-slate-50/50">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Manage Active Roster</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Edit, inspect or archive students out of active attendance logging.</p>
                  </div>
                  <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2.5 py-1 rounded-full">{activeParticipants.length} active</span>
                </div>

                <div className="overflow-x-auto">
                  {activeParticipants.length === 0 ? (
                    <div className="p-10 text-center">
                      <p className="text-xs text-slate-400 italic">No active participants registered! Register some newer ones above or restore former ones below.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 font-mono text-[10px] uppercase text-slate-400 font-bold border-b border-slate-100">
                        <tr>
                          <th className="p-3 pl-5">Student</th>
                          <th className="p-3 border-l border-slate-100">ID No. / Cohort</th>
                          <th className="p-3 border-l border-slate-100">Caregiver</th>
                          <th className="p-3 text-right pr-5 border-l border-slate-100">Control Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedActiveParticipants.map(part => (
                          <tr key={part.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="p-3 pl-5">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-7 h-7 rounded-lg border text-[10px] font-bold flex items-center justify-center overflow-hidden shrink-0 ${part.avatarColor}`}>
                                  {part.photoUrl ? (
                                    <img src={part.photoUrl} alt={part.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                                  ) : (
                                    part.name.split(' ').map(n=>n[0]).join('').slice(0, 2)
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <span className="font-semibold text-slate-900 block truncate max-w-[120px]" title={part.name}>{part.name}</span>
                                  <span className="text-[10px] text-slate-400 block">{part.contact}</span>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 border-l border-slate-100">
                              <span className="font-mono bg-slate-100 text-slate-700 px-1 py-0.2 rounded font-semibold text-[10px]">{part.idNo || 'None'}</span>
                              <span className="text-[10px] text-slate-500 block mt-0.5 truncate max-w-[110px]">{part.cohort}</span>
                            </td>
                            <td className="p-3 text-slate-600 truncate max-w-[110px] border-l border-slate-100" title={part.caregiver || '-'}>
                              {part.caregiver || '-'}
                            </td>
                            <td className="p-3 text-right pr-5 border-l border-slate-100">
                              <div className="inline-flex gap-1.5">
                                <button
                                  onClick={() => setSelectedParticipantId(part.id)}
                                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                                  title="View Full Profile Details"
                                >
                                  <Info className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteParticipant(part.id, false)}
                                  disabled={!isAdminMode}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    isAdminMode
                                      ? "text-rose-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                                      : "text-slate-300 cursor-not-allowed opacity-40"
                                  }`}
                                  title={isAdminMode ? "Archive Student (Keep Records)" : "Locked - Enable Admin Mode to archive"}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Former/Archived Records Registry List (right 5 cols of grid) */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs flex flex-col">
                <div className="p-5 border-b border-slate-150 bg-slate-50/50 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Former Participants Directory</h3>
                    <p className="text-xs text-slate-500 mt-0.5 font-sans">Kept securely in inactive state storage.</p>
                  </div>
                  <span className="text-xs bg-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded-full">{formerParticipants.length} archived</span>
                </div>

                <div className="p-4 bg-indigo-50/45 border-b border-slate-150 text-[11px] text-slate-600 leading-relaxed flex items-start gap-2 font-sans">
                  <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-800">Historical Preservation Policy:</span> De-registered student records are preserved with contact numbers, caregiver histories, and logs for compliance reporting and easy cohort restoration.
                  </div>
                </div>

                <div className="divide-y divide-slate-100 flex-1 overflow-y-auto max-h-[380px] min-h-[220px]">
                  {formerParticipants.length === 0 ? (
                    <div className="p-10 text-center h-full flex flex-col items-center justify-center">
                      <FileText className="w-8 h-8 text-slate-300 mb-2" />
                      <p className="text-xs text-slate-400 italic">Archive directory is empty. Try archiving an active student above to see them preserved here.</p>
                    </div>
                  ) : (
                    formerParticipants.map(part => (
                      <div key={part.id} className="p-4 hover:bg-slate-50/60 transition-all flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900 truncate" title={part.name}>{part.name}</span>
                            <span className="text-[9px] text-pink-700 font-sans bg-pink-50 px-1 rounded">{part.gender || 'Unknown'}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            ID: {part.idNo || '-'} • Archived: {part.formerDate || 'No Date'}
                          </div>
                          <div className="text-[10px] text-indigo-650 mt-1">
                            Cohort: {part.cohort}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleRestoreParticipant(part.id)}
                            className="px-2.5 py-1.5 text-[10px] font-bold bg-slate-100 text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                            title="Restore student back to active tracker"
                          >
                            <Undo className="w-3 h-3 text-slate-600" />
                            Restore
                          </button>
                          <button
                            onClick={() => handleDeleteParticipant(part.id, true)}
                            disabled={!isAdminMode}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isAdminMode
                                ? "text-rose-500 hover:bg-rose-50 cursor-pointer"
                                : "text-slate-350 cursor-not-allowed opacity-40"
                            }`}
                            title={isAdminMode ? "PERMANENTLY erase from system records" : "Locked - Enable Admin Mode to delete"}
                          >
                            <Trash2 className={`w-3.5 h-3.5 ${isAdminMode ? "text-rose-500" : "text-slate-400"}`} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                
                {formerParticipants.length > 0 && (
                  <div className="p-4 bg-slate-50 border-t border-slate-150 text-right">
                    <button
                      onClick={handleExportFormerCSV}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-800"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 animate-pulse" />
                      Export Archives ({formerParticipants.length})
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </main>

      {/* ---- MODALS & SLIDE-OVER SESSIONS ---- */}
      <AnimatePresence>
        
        {/* MODAL SECTION 1: IN-DEPTH PARTICIPANT INSPECT DRAWER */}
        {selectedParticipantId && inspectedParticipant && inspectedStats && (
          <div ref={drawerRef} className="fixed inset-0 z-50 overflow-hidden flex justify-end" id="drawer-participant">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedParticipantId(null)}
              className="absolute inset-0 bg-slate-900"
            />

            {/* Panel */}
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="relative w-full max-w-xl bg-white shadow-2xl h-full flex flex-col z-10"
            >
              
              {/* Drawer Header */}
              <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className={`h-11 w-11 rounded-xl border flex items-center justify-center font-bold text-sm uppercase overflow-hidden shrink-0 ${inspectedParticipant.avatarColor}`}>
                    {inspectedParticipant.photoUrl ? (
                      <img src={inspectedParticipant.photoUrl} alt={inspectedParticipant.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      inspectedParticipant.name.split(' ').map(n => n[0]).join('').slice(0, 2)
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-950 font-sans tracking-tight">
                      {inspectedParticipant.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <p className="text-xs text-slate-400 truncate">Contact: {inspectedParticipant.contact}</p>
                      {inspectedParticipant.contact && inspectedParticipant.contact !== '-' && (
                        <a
                          href={`sms:${inspectedParticipant.contact.replace(/[^0-9+]/g, '')}?body=${encodeURIComponent(`Hello ${inspectedParticipant.caregiver !== '-' ? inspectedParticipant.caregiver : 'Caregiver'},\n\nThis is a gentle reminder regarding ${inspectedParticipant.name}'s engagement with our program. We would like to check in on their progress and discuss their attendance. Please let us know when you are available for a brief chat or home visit.\n\nThank you.`)}`}
                          className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-colors shadow-3xs cursor-pointer border border-indigo-100"
                        >
                          <MessageSquare className="w-3 h-3" />
                          Send SMS Reminder
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={() => setSelectedParticipantId(null)}
                  className="p-1 px-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Body Scrollable */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">

                {/* 🔔 CAREGIVER CHECK-IN OUTSTANDING ALERT */}
                {dueCheckInParticipantsList.some(dp => dp.id === inspectedParticipant.id) && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex flex-col text-left font-sans space-y-2 relative overflow-hidden shadow-3xs animate-fade-in">
                    <div className="absolute top-0 right-0 h-16 w-16 bg-indigo-100/40 rounded-full blur-xl -mr-3 -mt-3"></div>
                    <div className="relative z-10 flex items-center gap-1.5">
                      <span className="text-[10px] bg-indigo-100 text-indigo-805 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3 text-indigo-600" /> Caregiver Outreach Due
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-650 leading-relaxed relative z-10">
                      This participant is flagged as <b>Due for caregiver outreach</b>. Under current guidelines, check-ins are due if there is no recorded outreach or custom home visit logged for more than 30 days, or for the last six months from July of the current Financial Year. 
                      {inspectedParticipant.outreachNotes && inspectedParticipant.outreachNotes.length > 0 ? (
                        <> Their last conversation details date back to <b>{inspectedParticipant.outreachNotes.map(n => n.date).reduce((a, b) => a > b ? a : b)}</b>.</>
                      ) : (
                        <> No caregiver outreach or home visit logs are recorded for this period.</>
                      )} Use the form in the <b>Manager Outreach & Discussion History</b> section below or upload a scanned Home Visit form to resolve this.
                    </p>
                    {inspectedParticipant.contact && inspectedParticipant.contact !== '-' && (
                      <div className="relative z-10 pt-1">
                        <a
                          href={`sms:${inspectedParticipant.contact.replace(/[^0-9+]/g, '')}?body=${encodeURIComponent(`Hello ${inspectedParticipant.caregiver !== '-' ? inspectedParticipant.caregiver : 'Caregiver'},\n\nThis is a gentle reminder regarding ${inspectedParticipant.name}. We noticed we haven't checked in recently. Please let us know when you are available for a brief chat or home visit.\n\nThank you.`)}`}
                          className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-3xs cursor-pointer w-fit"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          Send Outreach SMS Alert
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* 🗓️ REPORT EXPORT DATE RANGE FILTER (BEFORE YOU DOWNLOAD) */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-3xs">
                  <div className="flex items-center gap-2 text-indigo-700">
                    <Calendar className="w-4 h-4 text-indigo-650 shrink-0" />
                    <h4 className="text-xs font-extrabold uppercase tracking-wider font-mono">
                      🗓️ Report Export Date Range
                    </h4>
                  </div>
                  <p className="text-[10.5px] text-slate-550 leading-normal">
                    Specify custom dates to restrict the chronological session records printed on dossiers & outreach files generated below.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider font-mono block">From Date</label>
                      <input
                        type="date"
                        value={dossierStartDate}
                        onChange={(e) => setDossierStartDate(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl text-xs py-2 px-2.5 text-slate-700 focus:outline-none focus:border-slate-400 font-mono shadow-3xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider font-mono block">To Date</label>
                      <input
                        type="date"
                        value={dossierEndDate}
                        onChange={(e) => setDossierEndDate(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl text-xs py-2 px-2.5 text-slate-700 focus:outline-none focus:border-slate-400 font-mono shadow-3xs"
                      />
                    </div>
                  </div>
                  {(dossierStartDate || dossierEndDate) && (
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/50 mt-1">
                      <span className="text-[10px] text-indigo-650 font-bold font-mono">
                        Date constraint active
                      </span>
                      <button
                        onClick={() => {
                          setDossierStartDate('');
                          setDossierEndDate('');
                        }}
                        className="text-[10px] text-rose-600 hover:text-rose-700 hover:underline font-bold"
                      >
                        Reset Date Filter
                      </button>
                    </div>
                  )}
                </div>

                {/* QUICK-ACTION SUMMARY SUMMARY REPORT GENERATION BUTTON */}
                <div className="bg-gradient-to-r from-indigo-50 to-slate-50 border border-indigo-100 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                      📄 Printable Student Dossier
                    </h4>
                    <p className="text-[10.5px] text-slate-500 leading-normal max-w-[280px] sm:max-w-[340px]">
                      Generate an official, binder-ready physical folder PDF summary containing complete demographics, trajectory metrics, and chronological session roster.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => downloadStudentSummaryPDF(inspectedParticipant, inspectedStats)}
                      className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs py-2.5 px-3.5 rounded-xl cursor-pointer transition-all shadow-xs flex items-center gap-1.5 hover:scale-102 active:scale-98"
                      id="download-student-summary-pdf-btn"
                      title="Download student history PDF summary"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-300" />
                      <span>Download PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadStudentSummaryPDF(inspectedParticipant, inspectedStats, true)}
                      className="shrink-0 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs py-2.5 px-3.5 rounded-xl cursor-pointer transition-all shadow-xs flex items-center gap-1.5 hover:scale-102 active:scale-98"
                      id="print-student-summary-pdf-btn"
                      title="Direct print student history summary"
                    >
                      <Printer className="w-3.5 h-3.5 text-white" />
                      <span>Print Dossier</span>
                    </button>
                  </div>
                </div>

                {/* 📋 AI FORMS SCANNER & WELFARE DATA RETRIEVER */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4 shadow-3xs text-left" id="ai-document-scanner-section">
                  <div className="flex items-center gap-2 text-indigo-750">
                    <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                    <h4 className="text-xs font-extrabold uppercase tracking-wider font-mono">
                      📋 AI Welfare Document Scanner & Fact Retriever
                    </h4>
                  </div>
                  <p className="text-[10.5px] text-slate-550 leading-normal">
                    Securely upload or select official forms (registration intakes, health cards, primary school cards, or social field visit forms). Gemini AI will scan the layout, retrieve parameters, and embed them into academic dossier reports.
                  </p>

                  {/* 1. FILE PICKER & FORM TYPE SELECTION */}
                  <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3 shadow-3xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider font-mono block">Form Type Category</label>
                        <select
                          value={scannedFormType}
                          onChange={(e) => setScannedFormType(e.target.value as any)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs py-2 px-2 text-slate-705 font-bold focus:outline-none focus:border-slate-400 cursor-pointer"
                        >
                          <option value="enrollment">📝 Enrollment Intake</option>
                          <option value="medical">🏥 Medical Health Check</option>
                          <option value="school">🏫 School Report Card</option>
                          <option value="home_visit">🏡 Home Visit Assessment</option>
                          <option value="other">📎 Other Official Records</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider font-mono block">Simulation Helper</label>
                        <div className="flex gap-1.5 h-full items-center">
                          <button
                            type="button"
                            onClick={() => {
                              const b64 = createSampleFormBase64(scannedFormType === 'other' ? 'enrollment' : scannedFormType, inspectedParticipant.name);
                              setScannedFilePreview(b64);
                              setScanUploadedFileName(`sample_${scannedFormType}_sheet.png`);
                              setScanError(null);
                            }}
                            className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-[10.5px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-97"
                          >
                            <Sparkles className="w-3 h-3 text-indigo-500" /> Populate Sample Data
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Drag and Drop Dropzone */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); setScanDragActive(true); }}
                      onDragLeave={() => setScanDragActive(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setScanDragActive(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => {
                            setScannedFilePreview(reader.result as string);
                            setScanUploadedFileName(file.name);
                            setScanError(null);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-1 text-center transition-all ${
                        scanDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        id="form-image-uploader"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = () => {
                              setScannedFilePreview(reader.result as string);
                              setScanUploadedFileName(file.name);
                              setScanError(null);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      <label htmlFor="form-image-uploader" className="flex flex-col items-center justify-center cursor-pointer space-y-1.5 w-full">
                        <Upload className="w-6 h-6 text-slate-400" />
                        <span className="text-[11px] font-medium text-slate-700 hover:text-indigo-600 block">
                          Drag scanned image or <span className="text-indigo-600 font-bold hover:underline">browse files</span>
                        </span>
                        <span className="text-[9px] text-slate-400 block">Supports JPEG, PNG formats</span>
                      </label>
                    </div>

                    {/* Selected File Preview */}
                    {scannedFilePreview && (
                      <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 flex items-center justify-between gap-3 animate-fade-in">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <img src={scannedFilePreview} className="w-8 h-10 object-cover rounded border border-slate-300 shadow-3xs" alt="scanned preview" />
                          <div className="text-left overflow-hidden">
                            <span className="text-[10px] font-bold text-slate-800 block truncate">{scanUploadedFileName || "scanned_document.png"}</span>
                            <span className="text-[9px] text-slate-400 block uppercase font-mono tracking-wider">{scannedFormType} payload</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setScannedFilePreview(null);
                            setScanUploadedFileName(null);
                          }}
                          className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Trigger Scan Button */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => handleScanFormWithGeminiAPI(inspectedParticipant.id)}
                        disabled={isScanningForm || !scannedFilePreview}
                        className={`w-full py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 tracking-wide cursor-pointer ${
                          isScanningForm || !scannedFilePreview
                            ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-md text-white hover:scale-101 active:scale-99'
                        }`}
                      >
                        {isScanningForm ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 text-white animate-spin" />
                            <span>{scanProcessingStep}</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                            <span>Scan and Analyze with Gemini Case AI</span>
                          </>
                        )}
                      </button>
                    </div>

                    {scanError && (
                      <div className="p-2 bg-rose-50 border border-rose-150 rounded-xl flex items-start gap-1.5 text-rose-700 text-[10px] leading-snug animate-fade-in">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-500 mt-0.5" />
                        <div>
                          <span className="font-bold">Extraction Impediment:</span> {scanError}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. PREVIOUSLY SCANNED DOCUMENTS ACCORDION LIST */}
                  <div className="space-y-2">
                    <h5 className="text-[9.5px] font-bold text-slate-450 uppercase tracking-wider font-mono">
                      📁 Archived Dossier Forms Ledger ({(inspectedParticipant.scannedForms || []).length})
                    </h5>

                    {(!inspectedParticipant.scannedForms || inspectedParticipant.scannedForms.length === 0) ? (
                      <div className="bg-white border border-slate-150 p-6 rounded-xl text-center space-y-1 shadow-3xs">
                        <FileText className="w-7 h-7 mx-auto text-slate-350" />
                        <h6 className="text-[11px] font-bold text-slate-700">Registry Ledger Empty</h6>
                        <p className="text-[10px] text-slate-450 max-w-xs mx-auto">
                          No clinic documents, report cards, or home visit checkups have been uploaded. Select a form type above and populate demo text to try it!
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {inspectedParticipant.scannedForms.map((form) => {
                          const isSelected = selectedScanDocId === form.id;
                          const fTypeNice = form.formType.replace('_', ' ').toUpperCase();
                          return (
                            <div key={form.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-3xs transition-all">
                              {/* Accordion Trigger Header */}
                              <div
                                onClick={() => setSelectedScanDocId(isSelected ? null : form.id)}
                                className={`p-3 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors ${
                                  isSelected ? 'bg-indigo-50/40 border-b border-slate-150' : 'hover:bg-slate-50'
                                }`}
                              >
                                <div className="flex items-center gap-2 overflow-hidden text-left">
                                  <div className="p-1.5 bg-indigo-100 text-indigo-750 rounded-lg shrink-0">
                                    <FileText className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="overflow-hidden">
                                    <span className="text-[10.5px] font-extrabold text-slate-800 block truncate leading-tight">
                                      {form.fileName}
                                    </span>
                                    <span className="text-[9px] text-slate-450 font-mono flex items-center gap-1.5 mt-0.5">
                                      <span className="font-extrabold bg-indigo-50 text-indigo-650 text-[8px] px-1 py-0.2 rounded uppercase">
                                        {fTypeNice}
                                      </span>
                                      &bull; Scanned: {form.uploadDate}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteScannedForm(inspectedParticipant.id, form.id);
                                    }}
                                    className="p-1 text-slate-400 hover:text-rose-650 hover:bg-rose-50 rounded transition-colors"
                                    title="Delete record from dossier"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                  <span className="text-slate-400 text-[10px] font-bold font-mono">
                                    {isSelected ? '▲' : '▼'}
                                  </span>
                                </div>
                              </div>

                              {/* Accordion Expandable Content Panel */}
                              {isSelected && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  className="p-3 bg-slate-50/50 border-t border-slate-100 text-left space-y-3 font-sans"
                                >
                                  {/* Base64 Scanned Attachment Miniature Preview */}
                                  <div className="flex gap-2 bg-white border border-slate-205 rounded-xl p-2 items-center">
                                    <img src={form.fileDataUrl} className="w-12 h-16 object-cover rounded border border-slate-200 shrink-0" alt="Scanned file miniature" />
                                    <div className="text-left space-y-0.5 min-w-0">
                                      <span className="text-[9.5px] uppercase font-bold tracking-widest font-mono text-slate-400 block">OCR PHYSICAL ORIGIN</span>
                                      <span className="text-[10px] font-extrabold text-slate-650 block truncate">Official Verification Stamp Registered</span>
                                      <span className="text-[9.5px] text-indigo-650 font-extrabold block bg-indigo-50/50 rounded border border-indigo-150 px-1.5 py-0.5 w-fit">
                                        ✅ Gemini Visual Retrieval OK
                                      </span>
                                    </div>
                                  </div>

                                  {/* Dynamic Fields List depending on form type */}
                                  <div className="space-y-2 bg-white rounded-xl border border-slate-200 p-3">
                                    <span className="text-[9.5px] uppercase font-bold tracking-wider font-mono text-slate-450 block border-b pb-1">Extracted Structured Facts</span>
                                    
                                    {form.formType === 'enrollment' && form.extractedData.enrollment && (
                                      <div className="space-y-2 text-[10.5px]">
                                        <div className="grid grid-cols-2 gap-2 text-[11px] leading-relaxed">
                                          <div><span className="font-bold text-slate-455 font-mono text-[9px] uppercase">extracted Name:</span> <b className="text-slate-900">{form.extractedData.enrollment.name || 'N/A'}</b></div>
                                          <div><span className="font-bold text-slate-455 font-mono text-[9px] uppercase">extracted Age:</span> <span className="text-slate-800">{form.extractedData.enrollment.age || 'N/A'}</span></div>
                                          <div><span className="font-bold text-slate-455 font-mono text-[9px] uppercase">extracted Gender:</span> <span className="text-slate-800">{form.extractedData.enrollment.gender || 'N/A'}</span></div>
                                          <div><span className="font-bold text-slate-455 font-mono text-[9px] uppercase">extracted Village:</span> <b className="text-indigo-800">{form.extractedData.enrollment.village || 'N/A'}</b></div>
                                          <div><span className="font-bold text-slate-455 font-mono text-[9px] uppercase">Caregiver:</span> <span className="text-slate-800">{form.extractedData.enrollment.caregiver || 'N/A'}</span></div>
                                          <div><span className="font-bold text-slate-455 font-mono text-[9px] uppercase">Contact:</span> <span className="text-slate-800">{form.extractedData.enrollment.contact || 'N/A'}</span></div>
                                        </div>
                                        <div className="border-t border-slate-100 pt-1.5 text-left">
                                          <span className="font-bold text-slate-455 font-mono text-[9px] uppercase block">Assigned Cohort Group Recommendation:</span>
                                          <span className="text-slate-700 bg-amber-50 text-amber-800 font-bold px-1.5 py-0.2 rounded font-mono text-[10px] inline-block mt-0.5">
                                            {form.extractedData.enrollment.cohort || 'N/A'}
                                          </span>
                                        </div>
                                        <div className="border-t border-slate-100 pt-1.5 text-left">
                                          <span className="font-bold text-slate-455 font-mono text-[9px] uppercase block">Extracted Registration Background notes:</span>
                                          <p className="text-slate-650 leading-normal italic text-[10.5px] mt-0.5">
                                            "{form.extractedData.enrollment.registrationNotes || 'No notes extracted'}"
                                          </p>
                                        </div>

                                        {/* Dynamic Apply demographics Action Button */}
                                        <div className="pt-2 border-t border-slate-150">
                                          <button
                                            type="button"
                                            onClick={() => handleApplyExtractedDemographics(inspectedParticipant.id, form.extractedData.enrollment)}
                                            className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-[10.5px] flex items-center justify-center gap-1 shadow-3xs cursor-pointer active:scale-98"
                                          >
                                            <Sparkles className="w-3 h-3 text-amber-300" /> Apply Data to Student Profile
                                          </button>
                                        </div>
                                      </div>
                                    )}

                                    {form.formType === 'medical' && form.extractedData.medical && (
                                      <div className="space-y-2 text-[10.5px]">
                                        <div className="grid grid-cols-2 gap-2 text-[11px] leading-relaxed">
                                          <div><span className="font-bold text-slate-455 font-mono text-[9px] uppercase">blood type:</span> <b className="text-rose-600">{form.extractedData.medical.bloodType || 'N/A'}</b></div>
                                          <div><span className="font-bold text-slate-455 font-mono text-[9px] uppercase">Immunization:</span> <span className="text-slate-800">{form.extractedData.medical.vaccinationStatus || 'N/A'}</span></div>
                                          <div className="col-span-2"><span className="font-bold text-slate-455 font-mono text-[9px] uppercase">evaluation Checkup Date:</span> <span className="text-slate-805 font-mono">{form.extractedData.medical.recentCheckupDate || 'N/A'}</span></div>
                                        </div>
                                        <div className="border-t border-slate-100 pt-1.5">
                                          <span className="font-bold text-slate-455 font-mono text-[9px] uppercase block">Extracted conditions / allergies:</span>
                                          <span className="text-slate-700 font-bold flex items-center gap-1.5 mt-0.5">
                                            ⚠️ {form.extractedData.medical.disabilitiesOrConditions || 'None chronic registered'}
                                          </span>
                                        </div>
                                        <div className="border-t border-slate-100 pt-1.5 text-left">
                                          <span className="font-bold text-slate-455 font-mono text-[9px] uppercase block">Health Summary analysis:</span>
                                          <p className="text-slate-650 leading-relaxed mt-0.5 italic text-left">
                                            "{form.extractedData.medical.healthStatusSummary || 'N/A'}"
                                          </p>
                                        </div>
                                      </div>
                                    )}

                                    {form.formType === 'school' && form.extractedData.school && (
                                      <div className="space-y-2 text-[10.5px]">
                                        <div className="grid grid-cols-2 gap-2 text-[11px] leading-relaxed">
                                          <div className="col-span-2"><span className="font-bold text-slate-455 font-mono text-[9px] uppercase">academic school Name:</span> <b className="text-slate-900">{form.extractedData.school.schoolName || 'N/A'}</b></div>
                                          <div><span className="font-bold text-slate-455 font-mono text-[9px] uppercase">Grade Standard:</span> <span className="text-slate-800 font-semibold">{form.extractedData.school.gradeLevel || 'N/A'}</span></div>
                                          <div><span className="font-bold text-slate-455 font-mono text-[9px] uppercase">Exam Term:</span> <span className="text-slate-800">{form.extractedData.school.academicTerm || 'N/A'}</span></div>
                                          <div><span className="font-bold text-slate-455 font-mono text-[9px] uppercase">Classroom Rank:</span> <span className="text-slate-880 font-bold text-teal-700">{form.extractedData.school.academicRank || 'N/A'}</span></div>
                                          <div><span className="font-bold text-slate-455 font-mono text-[9px] uppercase">test average score:</span> <span className="text-slate-800 font-extrabold text-indigo-650">{form.extractedData.school.averageScorePercentage ? `${form.extractedData.school.averageScorePercentage}%` : 'N/A'}</span></div>
                                        </div>
                                        <div className="border-t border-slate-100 pt-1.5 text-left">
                                          <span className="font-bold text-slate-455 font-mono text-[9px] uppercase block">Classroom Educator Notes:</span>
                                          <p className="text-slate-650 leading-relaxed mt-0.5 italic">
                                            "{form.extractedData.school.teacherRemarks || 'N/A'}"
                                          </p>
                                        </div>
                                      </div>
                                    )}

                                    {form.formType === 'home_visit' && form.extractedData.home_visit && (
                                      <div className="space-y-2 text-[10.5px]">
                                        <div className="grid grid-cols-2 gap-2 text-[11px] leading-relaxed font-sans">
                                          <div><span className="font-bold text-slate-455 font-mono text-[9px] uppercase">visit completed:</span> <span className="text-slate-800 font-mono">{form.extractedData.home_visit.visitDate || 'N/A'}</span></div>
                                          <div><span className="font-bold text-slate-455 font-mono text-[9px] uppercase">household Size:</span> <span className="text-slate-800 font-medium">{form.extractedData.home_visit.householdSize || 'N/A'} residents</span></div>
                                          <div className="col-span-2 text-left mt-0.5"><span className="font-bold text-slate-455 font-mono text-[9px] uppercase">dwelling Shelter Type:</span> <span className="text-slate-805 leading-normal block">{form.extractedData.home_visit.dwellingType || 'N/A'}</span></div>
                                        </div>
                                        <div className="border-t border-slate-100 pt-1.5 text-left">
                                          <span className="font-bold text-slate-455 font-mono text-[9px] uppercase block">Caregiver livelihood income:</span>
                                          <span className="text-slate-800 block leading-normal mt-0.5 font-extrabold">
                                            💼 {form.extractedData.home_visit.familyLivelihood || 'N/A'}
                                          </span>
                                        </div>
                                        <div className="border-t border-slate-100 pt-1.5 text-left">
                                          <span className="font-bold text-slate-455 font-mono text-[9px] uppercase block text-rose-700">Welfare vulnerabilities & risks:</span>
                                          <p className="text-slate-650 leading-relaxed mt-0.5 bg-rose-50 border border-rose-100 p-2 rounded-lg text-[10px]">
                                            {form.extractedData.home_visit.riskVulnerabilitiesSummary || 'N/A'}
                                          </p>
                                        </div>
                                        <div className="border-t border-slate-100 pt-1.5 text-left">
                                          <span className="font-bold text-slate-455 font-mono text-[9px] uppercase block text-indigo-755">Staff visitation advisory:</span>
                                          <p className="text-slate-650 leading-relaxed mt-0.5 bg-indigo-50/50 border border-indigo-100 p-2 rounded-lg text-[10px]">
                                            {form.extractedData.home_visit.visitingStaffRecommendation || 'N/A'}
                                          </p>
                                        </div>
                                      </div>
                                    )}

                                    {form.formType === 'other' && form.extractedData.other && (
                                      <div className="space-y-2 text-[10.5px]">
                                        <div><span className="font-bold text-slate-455 font-mono text-[9px] uppercase">Attachment Title:</span> <span className="text-slate-900 font-bold block">{form.extractedData.other.title || 'Other Attachment'}</span></div>
                                        <div className="border-t border-slate-100 pt-1.5 text-left">
                                          <span className="font-bold text-slate-455 font-mono text-[9px] uppercase block">General overview summary:</span>
                                          <p className="text-slate-650 leading-relaxed mt-0.5">
                                            {form.extractedData.other.rawSummary || 'N/A'}
                                          </p>
                                        </div>
                                        {form.extractedData.other.keyExtractedPoints && form.extractedData.other.keyExtractedPoints.length > 0 && (
                                          <div className="border-t border-slate-100 pt-1.5 text-left">
                                            <span className="font-bold text-slate-455 font-mono text-[9px] uppercase block">Key extracted points:</span>
                                            <ul className="list-disc list-inside space-y-0.5 mt-1 text-[10px] text-slate-600 block text-left">
                                              {form.extractedData.other.keyExtractedPoints.map((pt, i) => (
                                                <li key={i}>{pt}</li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* GEMINI AI SINGLE STUDENT INSIGHTS REPORT */}
                <div className="bg-white border border-indigo-150 rounded-2xl p-4 space-y-4 shadow-3xs relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-indigo-750">
                      <Sparkles className="h-4 w-4 text-indigo-600 animate-pulse" />
                      <h4 className="text-xs font-bold uppercase tracking-wider font-mono">
                        ✨ Gemini AI Performance Insights
                      </h4>
                    </div>
                    {aiSingleReports[inspectedParticipant.id] && (
                      <span className="text-[9px] text-slate-400 font-mono">
                        Compiled: {aiSingleReports[inspectedParticipant.id].timestamp}
                      </span>
                    )}
                  </div>

                  {aiSingleReports[inspectedParticipant.id] ? (
                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold tracking-wider font-mono text-slate-400">Analysis standing:</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          inspectedStats.hasRedFlag 
                            ? 'bg-rose-50 text-rose-700 border border-rose-150 animate-pulse' 
                            : inspectedStats.hasYellowFlag 
                              ? 'bg-amber-50 text-amber-700 border border-amber-150' 
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-150'
                        }`}>
                          {aiSingleReports[inspectedParticipant.id].attendanceScoreAnalysis}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[9.5px] uppercase font-bold tracking-wide font-mono text-slate-450 block">AI Evaluation Brief:</span>
                        <p className="text-[11px] text-slate-650 leading-relaxed font-sans font-medium">
                          {aiSingleReports[inspectedParticipant.id].summary}
                        </p>
                      </div>

                      {aiSingleReports[inspectedParticipant.id].insights && aiSingleReports[inspectedParticipant.id].insights.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[9.5px] uppercase font-bold tracking-wide font-mono text-slate-450 block">Behavioral & Case Trace:</span>
                          <ul className="space-y-1 text-[10.5px] text-slate-550 leading-relaxed font-sans pl-3.5 list-disc">
                            {aiSingleReports[inspectedParticipant.id].insights.map((ins: string, idx: number) => (
                              <li key={idx}>{ins}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 text-[11px] text-indigo-750 font-sans leading-relaxed">
                        💡 <b>Staff Action Step:</b> {aiSingleReports[inspectedParticipant.id].recommendation}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          disabled={aiReportLoading}
                          onClick={() => generateIndividualAIReport(inspectedParticipant, inspectedStats)}
                          className="text-[10px] font-bold text-indigo-705 hover:text-indigo-850 hover:underline cursor-pointer disabled:opacity-50"
                        >
                          🔄 Regenerate analysis insights
                        </button>
                        <button
                          type="button"
                          onClick={() => clearSingleAIReport(inspectedParticipant.id)}
                          className="text-[10px] font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                        >
                          Remove from cache
                        </button>
                      </div>
                    </div>
                  ) : aiReportLoading ? (
                    <div className="py-6 flex flex-col items-center justify-center space-y-2 text-center">
                      <RefreshCw className="h-6 w-6 text-indigo-650 animate-spin" />
                      <div>
                        <p className="text-[10.5px] font-bold text-indigo-650 uppercase font-mono animate-pulse">Running AI models...</p>
                        <p className="text-[9.5px] text-slate-400">Parsing historic sessions, risk ratios & outreach note registers.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-[11px] text-slate-450 leading-normal">
                        Generate private, deep-reasoning academic progress & welfare analytical evaluation reports powered by Gemini AI for student {inspectedParticipant.name}.
                      </p>
                      <button
                        type="button"
                        onClick={() => generateIndividualAIReport(inspectedParticipant, inspectedStats)}
                        className="w-full bg-slate-900 border border-slate-950 hover:bg-black text-white font-extrabold text-[11px] py-3 px-3 rounded-xl cursor-pointer shadow-3xs flex items-center justify-center gap-1.5 transition-all text-center"
                      >
                        <Brain className="w-3.5 h-3.5 text-amber-300" />
                        <span>Compile Student AI Advisory Report</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* PROFILE PHOTO CAMERA CAPTURE SECTION */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Camera className="h-4 w-4 text-indigo-600" />
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                        Participant Profile Picture  
                      </h4>
                    </div>
                    {inspectedParticipant.photoUrl && (
                      <button 
                        onClick={() => deleteProfilePhoto(inspectedParticipant.id)}
                        className="text-[10px] font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer font-sans"
                      >
                        Remove Photo
                      </button>
                    )}
                  </div>

                  {!isCameraActive ? (
                    <div className="flex items-center gap-4">
                      <div className={`h-16 w-16 rounded-xl border flex items-center justify-center font-bold text-xl uppercase ${inspectedParticipant.avatarColor} overflow-hidden shrink-0 shadow-2xs`}>
                        {inspectedParticipant.photoUrl ? (
                          <img src={inspectedParticipant.photoUrl} alt={inspectedParticipant.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          inspectedParticipant.name.split(' ').map(n => n[0]).join('').slice(0, 2)
                        )}
                      </div>
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            setCapturedPhotoPreview(null);
                            setSelectedPhotoFilter('none');
                            startCamera();
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          {inspectedParticipant.photoUrl ? 'Update Profile Photo' : 'Capture Live Photo'}
                        </button>
                        <p className="text-[10px] text-slate-450 leading-normal max-w-[280px] font-sans">
                          Trigger the device camera to register a formal profile picture for attendance rosters.
                        </p>
                      </div>
                    </div>
                  ) : capturedPhotoPreview ? (
                    <div className="space-y-4">
                      {/* Photo Captured & Cropped Preview */}
                      <div className="text-center space-y-1.5">
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-250 px-2.5 py-1 rounded-full font-bold uppercase inline-block leading-none">
                          ✨ Centered Automatically (Facial Centroid)
                        </span>
                        
                        <div className="relative w-full aspect-square max-w-[185px] mx-auto bg-slate-905 rounded-2xl border border-indigo-300 overflow-hidden shadow-md">
                          <img 
                            src={capturedPhotoPreview.finalUrl} 
                            alt="Cropped Preview" 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer" 
                          />
                        </div>
                      </div>

                      {/* Photo Filters Choice list */}
                      <div className="space-y-1.5 bg-slate-100/50 p-2.5 rounded-xl border border-slate-205">
                        <label className="text-[10.5px] text-slate-500 font-mono uppercase block font-bold tracking-wider">
                          Apply Portrait Filter
                        </label>
                        <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                          {(['none', 'grayscale', 'vintage', 'dramatic', 'warm', 'cool'] as const).map(f => {
                            let label = 'None';
                            if (f === 'grayscale') label = 'BW Normal';
                            if (f === 'vintage') label = 'Vintage';
                            if (f === 'dramatic') label = 'BW Drama';
                            if (f === 'warm') label = 'Golden';
                            if (f === 'cool') label = 'Jade';

                            return (
                              <button
                                key={f}
                                type="button"
                                onClick={() => applyFilterToPhoto(f)}
                                className={`py-1 px-2 border rounded-lg font-medium text-center transition-all cursor-pointer truncate ${
                                  selectedPhotoFilter === f
                                    ? 'bg-indigo-600 border-indigo-700 text-white font-bold'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Control buttons */}
                      <div className="flex items-center justify-center gap-2 pt-2.5 border-t border-slate-150">
                        <button
                          type="button"
                          onClick={() => saveCapturedPhoto(inspectedParticipant.id)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Save Photo
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => {
                            setCapturedPhotoPreview(null);
                            setSelectedPhotoFilter('none');
                          }}
                          className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          Re-take
                        </button>

                        <button
                          type="button"
                          onClick={stopCamera}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-medium rounded-xl transition-all cursor-pointer ml-auto"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Live Camera View Finder with guidance overlay */}
                      <div className="relative w-full aspect-square max-w-[240px] mx-auto bg-slate-900 rounded-2xl border border-indigo-550 overflow-hidden shadow-inner flex items-center justify-center">
                        <video 
                          ref={videoRef}
                          autoPlay 
                          playsInline 
                          muted 
                          className="w-full h-full object-cover"
                        />
                        
                        {/* Visual head alignment grid overlay */}
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                          {/* Dark overlay surrounding focal crop square */}
                          <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-2xs" style={{ clipPath: 'polygon(0% 0%, 0% 100%, 15% 100%, 15% 15%, 85% 15%, 85% 85%, 15% 85%, 15% 100%, 100% 100%, 100% 0%)' }}></div>
                          
                          {/* Centered guide grid square overlay */}
                          <div className="w-36 h-36 border-2 border-indigo-400 border-dashed rounded-3xl relative flex items-center justify-center animate-pulse">
                            {/* Focal ticks */}
                            <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-indigo-550 rounded-tl-xl overflow-hidden"></div>
                            <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-indigo-550 rounded-tr-xl overflow-hidden"></div>
                            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-indigo-550 rounded-bl-xl overflow-hidden"></div>
                            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-indigo-550 rounded-br-xl overflow-hidden"></div>
                            
                            {/* Head shape guide ellipse */}
                            <div className="w-20 h-28 border border-white/20 rounded-[50%_50%_40%_40%] opacity-40 bg-indigo-500/5"></div>
                          </div>
                        </div>

                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-rose-600 text-white font-mono text-[9px] font-bold rounded-full animate-pulse flex items-center gap-1">
                          <span className="block h-1.5 w-1.5 bg-white rounded-full"></span>
                          LIVE CAM
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-450 leading-normal text-center max-w-[200px] mx-auto font-medium font-sans">
                        Align the face inside the central dashed square guidelines prior to snapping.
                      </p>

                      {cameraError && (
                        <div className="text-rose-600 text-[10px] font-bold text-center bg-rose-55 p-2 rounded-lg border border-rose-150">
                          {cameraError}
                        </div>
                      )}

                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => capturePhoto(inspectedParticipant.id)}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Snap Photo
                        </button>
                        
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 1. COMPREHENSIVE ATTENDANCE STATS SECTION */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest font-mono">
                    Program Engagement Metrics
                  </h4>
                  
                  <div className="grid grid-cols-3 gap-3">
                    
                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                      <span className="text-[10px] text-slate-450 block font-semibold uppercase">Presence Rate</span>
                      <span className={`text-xl font-mono font-bold block mt-1 ${inspectedStats.attendanceRate < 80 ? 'text-amber-600' : 'text-slate-900'}`}>
                        {inspectedStats.attendanceRate}%
                      </span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                      <span className="text-[10px] text-slate-450 block font-semibold uppercase">Total Absences</span>
                      <span className={`text-xl font-mono font-bold block mt-1 ${inspectedStats.totalAbsent >= 3 ? 'text-rose-600' : 'text-slate-900'}`}>
                        {inspectedStats.totalAbsent} <span className="text-xs font-normal text-slate-400">Total</span>
                      </span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
                      <span className="text-[10px] text-slate-450 block font-semibold uppercase">Consecutive Streak</span>
                      <span className={`text-xl font-mono font-bold block mt-1 ${inspectedStats.consecutiveAbsences >= 2 ? 'text-amber-600' : 'text-slate-900'}`}>
                        {inspectedStats.consecutiveAbsences} <span className="text-xs font-normal text-slate-400">Days</span>
                      </span>
                    </div>

                  </div>
                </div>

                {/* 2. LIVE ALERT SUMMARY WITH EXCELLENT FEEDBACK */}
                <div>
                  {inspectedStats.hasRedFlag ? (
                    <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-rose-800 space-y-2">
                      <div className="flex items-center gap-2 font-semibold">
                        <AlertCircle className="h-5 w-5 text-rose-605 animate-pulse" />
                        <span>CRITICAL OUTREACH REQUIRED (Red Alert)</span>
                      </div>
                      <p className="text-xs leading-relaxed text-rose-700">
                        This participant has triggered a critical Red Alert at Lomuriangole CYDC due to consecutive empty streaks (3+) or missing 4 of their last 5 sessions. 
                        Under governance guidelines, immediate staff communication and caregiver outreach are required.
                      </p>
                    </div>
                  ) : inspectedStats.hasYellowFlag ? (
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-900 space-y-2">
                      <div className="flex items-center gap-2 font-semibold">
                        <AlertTriangle className="h-5 w-5 text-amber-505 animate-pulse" />
                        <span>IMPORTANT FOLLOW-UP ADVISED (Yellow Alert)</span>
                      </div>
                      <p className="text-xs leading-relaxed text-amber-700">
                        This participant has missed <b>{inspectedStats.consecutiveAbsences} consecutive sessions</b>. 
                        Please execute follow-up communication to check for blockers before they fall behind programs.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl text-emerald-800 flex items-center gap-2.5">
                      <CheckCircle className="h-5 w-5 text-emerald-600" />
                      <div className="text-xs">
                        <span className="font-semibold block">Participant On Track</span>
                        <span className="text-emerald-700 block mt-0.5">Meets healthy engagement benchmarks. No operational triggers.</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. OUTREACH CORRESPONDENCE TEMPLATE GENERATOR */}
                {(inspectedStats.hasRedFlag || inspectedStats.hasYellowFlag) && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {inspectedStats.hasRedFlag ? (
                          <Mail className="h-4 w-4 text-rose-600" />
                        ) : (
                          <Mail className="h-4 w-4 text-amber-600" />
                        )}
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                          {inspectedStats.hasRedFlag ? 'Manager Notification Template' : 'Participant Outreach Template'}
                        </h4>
                      </div>
                      <span className="text-[9px] bg-slate-200 px-1.5 py-0.5 rounded font-bold uppercase text-slate-500 font-mono">
                        {inspectedStats.hasRedFlag ? 'Red Alert' : 'Yellow Alert'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {inspectedStats.hasRedFlag 
                        ? 'Draft reporting block for project managers, tutors, and team leaders.'
                        : 'Checking-in friendly template to seek engagement status with participant.'
                      }
                    </p>

                    {/* Pre-computed values */}
                    {(() => {
                      const template = generateOutreachTemplate(
                        inspectedParticipant, 
                        inspectedStats, 
                        inspectedStats.hasRedFlag ? 'red' : 'yellow'
                      );
                      
                      return (
                        <div className="space-y-3 mt-2 text-xs">
                          {/* Subject Box */}
                          <div>
                            <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono uppercase mb-1">
                              <span>Subject Line</span>
                              <button 
                                onClick={() => handleCopyText(template.subject, 'subject')}
                                className="hover:text-slate-700 flex items-center gap-1 cursor-pointer"
                              >
                                {copiedTemplate === 'subject' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                                {copiedTemplate === 'subject' ? 'Copied!' : 'Copy'}
                              </button>
                            </div>
                            <input 
                              type="text" 
                              readOnly 
                              value={template.subject}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2 font-sans font-medium text-slate-800"
                            />
                          </div>

                          {/* Body box */}
                          <div>
                            <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono uppercase mb-1">
                              <span>Outreach Message Template Body</span>
                              <button 
                                onClick={() => handleCopyText(template.body, 'body')}
                                className="hover:text-slate-700 flex items-center gap-1 cursor-pointer"
                              >
                                {copiedTemplate === 'body' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                                {copiedTemplate === 'body' ? 'Copied!' : 'Copy'}
                              </button>
                            </div>
                            <textarea 
                              readOnly 
                              rows={8}
                              value={template.body}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 font-sans text-slate-700 text-xs leading-relaxed"
                            />
                          </div>

                          {/* Beautiful direct PDF Download block */}
                          <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-[10px] font-mono text-slate-400">
                              Official Communique PDF format ready
                            </span>
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => downloadOutreachTemplatePDF(
                                  inspectedParticipant,
                                  inspectedStats,
                                  inspectedStats.hasRedFlag ? 'red' : 'yellow'
                                )}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] py-2 px-3.5 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs hover:shadow-xs active:scale-98"
                              >
                                <Download className="w-3.5 h-3.5 text-amber-300" />
                                <span>Download PDF</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadOutreachTemplatePDF(
                                  inspectedParticipant,
                                  inspectedStats,
                                  inspectedStats.hasRedFlag ? 'red' : 'yellow',
                                  true
                                )}
                                className="bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-[11px] py-2 px-3.5 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs hover:shadow-xs active:scale-98"
                              >
                                <Printer className="w-3.5 h-3.5 text-white" />
                                <span>Print Message</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* DEDICATED OFFICIAL PDF CONTRACT ARCHIVING SYSTEM (RED FLAG EXCLUSIVE) */}
                {inspectedStats.hasRedFlag && (
                  <div className="bg-slate-50 border border-slate-300 rounded-2xl p-4.5 space-y-4 shadow-sm border-t-indigo-600 border-t-2" id="contract-pdf-editor">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-indigo-600 shrink-0" />
                      <div>
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider font-mono">
                          Attendance Intervention & Commitment Filing
                        </h4>
                        <p className="text-[10px] text-slate-450 mt-0.5 leading-normal">
                          Configure physical file parameters to compile the official printable PDF contract matching the youth's status.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 pt-1">
                      {/* Caregiver and Staff Name row */}
                      <div className="grid grid-cols-2 gap-3 text-left">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Caregiver Name</label>
                          <input
                            type="text"
                            value={pdfCaregiverName}
                            onChange={(e) => setPdfCaregiverName(e.target.value)}
                            placeholder="e.g. Grace Okafor"
                            className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100"
                            id="pdf-caregiver-name-input"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Verifying Staff Name</label>
                          <input
                            type="text"
                            value={pdfStaffName}
                            onChange={(e) => setPdfStaffName(e.target.value)}
                            placeholder="e.g. Tutor Caleb / Director"
                            className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100"
                            id="pdf-staff-name-input"
                          />
                        </div>
                      </div>

                      {/* Interactive Discussion Notes */}
                      <div className="text-left">
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Discussion Notes</label>
                          <span className="text-[9px] text-slate-400 font-mono">Will print empty lines for physical handwriting if left blank</span>
                        </div>
                        <textarea
                          rows={3}
                          value={pdfDiscussionNotes}
                          onChange={(e) => setPdfDiscussionNotes(e.target.value)}
                          placeholder="e.g. Visited the home on Tuesday. Caregiver reports child was sick with malaria, medicine is being administered. Will monitor weekly return..."
                          className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-705 leading-normal focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100"
                          id="pdf-notes-input"
                        />
                      </div>

                      {/* Caregiver Commitment */}
                      <div className="text-left">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Caregiver Engagement Commitment</label>
                        <textarea
                          rows={2.5}
                          value={pdfCaregiverCommitment}
                          onChange={(e) => setPdfCaregiverCommitment(e.target.value)}
                          placeholder="Enter commitment terms..."
                          className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-705 leading-normal focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100"
                          id="pdf-commitment-input"
                        />
                      </div>

                      {/* Action points */}
                      <div className="text-left">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Agreed Program Action Points</label>
                        <textarea
                          rows={2.5}
                          value={pdfActionPoints}
                          onChange={(e) => setPdfActionPoints(e.target.value)}
                          placeholder="Action items (one per line)..."
                          className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-705 leading-normal focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100"
                          id="pdf-actions-input"
                        />
                      </div>

                       {/* Compilation Button */}
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                         <button
                           type="button"
                           onClick={() => downloadManagerNotificationPDF(inspectedParticipant, inspectedStats)}
                           className="w-full bg-indigo-650 hover:bg-indigo-700 text-white font-extrabold text-xs py-3 rounded-xl cursor-pointer transition-all shadow-xs flex items-center justify-center gap-1.5 focus:ring-2 focus:ring-indigo-500"
                           id="compile-contract-pdf-btn"
                         >
                           <Download className="w-4 h-4 text-amber-300" />
                           <span>Download Folder PDF</span>
                         </button>
                         <button
                           type="button"
                           onClick={() => downloadManagerNotificationPDF(inspectedParticipant, inspectedStats, true)}
                           className="w-full bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs py-3 rounded-xl cursor-pointer transition-all shadow-xs flex items-center justify-center gap-1.5 focus:ring-2 focus:ring-teal-500"
                           id="print-contract-pdf-btn"
                         >
                           <Printer className="w-4 h-4 text-white" />
                           <span>Print Document</span>
                         </button>
                       </div>
                    </div>
                  </div>
                )}

                {/* 4. DETAILS TIMELINE - CELL HISTOGRAM */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest font-mono">
                    Attendance Calendar Records
                  </h4>
                  
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                    {sessions.map(s => {
                      const stat = (attendance[inspectedParticipant.id] && attendance[inspectedParticipant.id][s.date]) || 'unmarked';
                      
                      let badge = <span className="bg-slate-100 text-slate-400 font-mono text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase">Unmarked</span>;
                      if (stat === 'present') badge = <span className="bg-emerald-50 border border-emerald-150 text-emerald-700 font-mono text-[10px] px-2 py-0.5 rounded-md font-semibold uppercase">Present</span>;
                      if (stat === 'absent') badge = <span className="bg-rose-50 border border-rose-150 text-rose-700 font-mono text-[10px] px-2 py-0.5 rounded-md font-semibold uppercase">Absent</span>;
                      if (stat === 'excused') badge = <span className="bg-slate-100 border border-slate-200 text-slate-500 font-mono text-[10px] px-2 py-0.5 rounded-md font-semibold uppercase">Excused</span>;

                      return (
                        <div key={s.date} className="flex items-center justify-between p-3 hover:bg-slate-50/50">
                          <div>
                            <span className="font-semibold text-slate-800 text-xs">{formatToReadableDate(s.date)}</span>
                            <span className="text-slate-400 text-[10px] font-mono block mt-0.5">{s.label || 'Session'}</span>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            {/* Inline Switch Options */}
                            <select
                              value={stat}
                              onChange={(e) => setSpecificAttendance(inspectedParticipant.id, s.date, e.target.value as AttendanceStatus)}
                              className="bg-white border border-slate-200 rounded-lg text-[10px] p-1 font-medium text-slate-700 cursor-pointer focus:outline-none"
                            >
                              <option value="present">Present</option>
                              <option value="absent">Absent</option>
                              <option value="excused">Excused</option>
                              <option value="unmarked">Unmarked</option>
                            </select>
                            {badge}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* OFFICIAL DOCUMENTS SECURE STORAGE */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest font-mono">
                      Official Documents Cloud Storage
                    </h4>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-3xs">
                    {/* List Existing Documents */}
                    {inspectedParticipant.documents && inspectedParticipant.documents.length > 0 ? (
                      <div className="space-y-2 mb-4">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block font-mono">Stored Files</span>
                        {inspectedParticipant.documents.map((doc) => (
                          <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 gap-2">
                            <div className="overflow-hidden">
                              <span className="text-xs font-semibold text-slate-700 block truncate">{doc.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">{formatToReadableDate(doc.uploadDate)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <a
                                href={doc.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-2 py-1 rounded text-[10px] font-bold transition-colors"
                              >
                                View / Download
                              </a>
                              <button
                                type="button"
                                onClick={() => handleDeleteDocument(inspectedParticipant.id, doc.id)}
                                className="bg-rose-50 hover:bg-rose-100 text-rose-600 px-2 py-1 rounded text-[10px] font-bold transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 mb-4 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                        <span className="text-xs text-slate-400 font-medium font-sans">No official documents have been uploaded for this student yet.</span>
                      </div>
                    )}

                    {/* Upload new document form */}
                    <div className="space-y-2 border-t border-slate-100 pt-3 mt-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block font-mono">Upload to Cloud Vault</span>
                      
                      <div className="flex flex-col sm:flex-row items-stretch gap-2">
                        <input
                          type="file"
                          id="document-upload-input"
                          className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs text-slate-600 w-full"
                          accept=".pdf,image/*,.doc,.docx"
                        />
                        <button
                          type="button"
                          disabled={isUploadingDoc}
                          onClick={() => {
                            const input = document.getElementById('document-upload-input') as HTMLInputElement;
                            if (input && input.files && input.files.length > 0) {
                              handleDocumentUpload(inspectedParticipant.id, input.files[0]);
                              input.value = '';
                            }
                          }}
                          className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-xs font-bold transition-all shrink-0 shadow-3xs"
                        >
                          {isUploadingDoc ? 'Uploading...' : 'Save to Cloud'}
                        </button>
                      </div>

                      {isUploadingDoc && (
                        <div className="w-full bg-slate-100 rounded-full h-1 mt-2">
                          <div
                            className="bg-indigo-500 h-1 rounded-full transition-all duration-300"
                            style={{ width: `${docUploadProgress}%` }}
                          />
                        </div>
                      )}

                      {docUploadError && (
                        <div className="text-rose-600 text-[10px] font-medium mt-1">
                          {docUploadError}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 5. MANAGER ACTION NOTES LOG */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest font-mono">
                    Manager Outreach & Discussion History
                  </h4>

                  {/* Form to log new note */}
                  <form onSubmit={handleAddOutreachLog} className="bg-slate-50 p-4 border border-slate-200 rounded-xl space-y-3">
                    <span className="text-xs font-semibold text-slate-800 block">Log New Follow-Up Action</span>
                    
                    <div>
                      <textarea
                        required
                        rows={2}
                        value={newLogNotes}
                        onChange={(e) => setNewLogNotes(e.target.value)}
                        placeholder="Log notes about call, message discussion or reasons given (e.g. sick leave, travel blocker)..."
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:outline-none focus:border-slate-400 placeholder:text-slate-450"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">State Update</label>
                        <select
                          value={newLogStatus}
                          onChange={(e) => setNewLogStatus(e.target.value as any)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-slate-700 focus:outline-none cursor-pointer"
                        >
                          <option value="pending">Pending Response</option>
                          <option value="contacted">Contacted / In Discussion</option>
                          <option value="resolved">Resolved / Actioned</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Logged By</label>
                        <input
                          type="text"
                          value={newLoggedBy}
                          onChange={(e) => setNewLoggedBy(e.target.value)}
                          placeholder="Your Name"
                          className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-slate-700 focus:outline-none"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-slate-900 text-white hover:bg-slate-800 p-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Save Discussion Log Note
                    </button>
                  </form>

                  {/* Log list */}
                  <div className="space-y-2">
                    {(!inspectedParticipant.outreachNotes || inspectedParticipant.outreachNotes.length === 0) ? (
                      <em className="text-xs text-slate-400 block text-center py-4 bg-slate-50/50 border border-dashed border-slate-200 rounded-xl">
                        No previous outreach logs on file. Use the workspace above to track first contact.
                      </em>
                    ) : (
                      inspectedParticipant.outreachNotes.map(log => {
                        let statusColor = 'bg-amber-100 text-amber-800';
                        if (log.status === 'resolved') statusColor = 'bg-emerald-150 text-emerald-800 border border-emerald-250';
                        if (log.status === 'contacted') statusColor = 'bg-sky-100 text-sky-805 border border-sky-200';

                        return (
                          <div key={log.id} className="p-3.5 bg-white border border-slate-250 rounded-xl space-y-1.5 relative group/log shadow-3xs">
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className={`text-[9px] font-bold uppercase rounded px-1.5 py-0.2 ${statusColor}`}>
                                  {log.status}
                                </span>
                                <span className="font-semibold text-slate-750 font-mono">{formatToReadableDate(log.date)}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono">By {log.loggedBy}</span>
                            </div>
                            
                            <p className="text-xs text-slate-650 leading-relaxed pr-6">{log.notes}</p>
                            
                            {/* Delete note button */}
                            <button
                              type="button"
                              onClick={() => handleDeleteOutreachLog(inspectedParticipant.id, log.id)}
                              className="opacity-0 group-hover/log:opacity-100 absolute right-2 top-2 text-slate-350 hover:text-red-500 transition-opacity p-1 rounded-md"
                              title="Delete Note"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* 6. ENROLLMENT INTENTION DETAILS & EDITOR */}
                {isEditingProfile ? (
                  <div className="bg-indigo-50/50 border border-indigo-200 rounded-2xl p-4 text-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-indigo-150 pb-2">
                      <span className="font-bold text-indigo-950 uppercase tracking-widest font-mono text-[10px]">
                        ✏️ Edit Intake Demographics
                      </span>
                      <span className="text-[9px] bg-indigo-200 text-indigo-950 px-1.5 py-0.5 rounded font-bold font-mono">
                        ADMIN AUTHENTICATED
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <label className="text-[10px] text-slate-500 font-bold block mb-1">NAME</label>
                        <input 
                          type="text" 
                          value={editName} 
                          onChange={(e) => setEditName(e.target.value)} 
                          className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-xs focus:outline-none focus:border-indigo-500" 
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold block mb-1">ID NUMBER</label>
                          <input 
                            type="text" 
                            value={editIdNo} 
                            onChange={(e) => setEditIdNo(e.target.value)} 
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-xs focus:outline-none focus:border-indigo-500" 
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold block mb-1">DATE OF BIRTH</label>
                          <input 
                            type="date" 
                            value={editDob} 
                            onChange={(e) => {
                              const dobVal = e.target.value;
                              setEditDob(dobVal);
                              if (dobVal) {
                                const calculatedAge = calculateAgeFromDob(dobVal);
                                setEditAge(calculatedAge);
                              }
                            }} 
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-[10.5px] focus:outline-none focus:border-indigo-500 text-slate-750" 
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold block mb-1">AGE</label>
                          <input 
                            type="text" 
                            value={editAge} 
                            onChange={(e) => setEditAge(e.target.value)} 
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-xs focus:outline-none focus:border-indigo-500 font-mono" 
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold block mb-1">GENDER</label>
                          <input 
                            type="text" 
                            value={editGender} 
                            onChange={(e) => setEditGender(e.target.value)} 
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-xs focus:outline-none focus:border-indigo-500" 
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold block mb-1">VILLAGE</label>
                          <input 
                            type="text" 
                            value={editVillage} 
                            onChange={(e) => setEditVillage(e.target.value)} 
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-xs focus:outline-none focus:border-indigo-500" 
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold block mb-1">CAREGIVER</label>
                          <input 
                            type="text" 
                            value={editCaregiver} 
                            onChange={(e) => setEditCaregiver(e.target.value)} 
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-xs focus:outline-none focus:border-indigo-500" 
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold block mb-1">COHORT GROUP</label>
                          <select 
                            value={editCohort} 
                            onChange={(e) => setEditCohort(e.target.value)} 
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-[11px] focus:outline-none focus:border-indigo-500"
                          >
                            <option value="Victors Class">Victors Class</option>
                            <option value="Champions Class">Champions Class</option>
                            <option value="Explorers Class">Explorers Class</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-500 font-bold block mb-1">CONTACT INFO</label>
                        <input 
                          type="text" 
                          value={editContact} 
                          onChange={(e) => setEditContact(e.target.value)} 
                          className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-xs focus:outline-none focus:border-indigo-500" 
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-500 font-bold block mb-1">REMARKS & CASE DETAILS</label>
                        <textarea 
                          value={editRegistrationNotes} 
                          onChange={(e) => setEditRegistrationNotes(e.target.value)} 
                          rows={3}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-800 text-xs focus:outline-none focus:border-indigo-500 leading-normal" 
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-indigo-200">
                      <button
                        type="button"
                        onClick={() => {
                          if (!editName.trim()) {
                            alert('Please fill in student name.');
                            return;
                          }
                          // Save profile changes
                          setParticipants(prev => prev.map(p => {
                            if (p.id === inspectedParticipant.id) {
                              return {
                                ...p,
                                name: editName.trim(),
                                idNo: editIdNo.trim() || '-',
                                age: editAge.trim() || '-',
                                dob: editDob.trim() || undefined,
                                gender: editGender.trim() || '-',
                                village: editVillage.trim() || '-',
                                caregiver: editCaregiver.trim() || '-',
                                cohort: editCohort,
                                contact: editContact.trim() || '-',
                                registrationNotes: editRegistrationNotes.trim()
                              };
                            }
                            return p;
                          }));
                          setIsEditingProfile(false);
                        }}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-center flex-1 cursor-pointer transition-colors shadow-2xs"
                      >
                        Save Demographics
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingProfile(false)}
                        className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-750 rounded-xl font-bold text-center cursor-pointer transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 text-xs space-y-1.5 relative">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2">
                      <span className="font-semibold text-slate-500 uppercase tracking-widest block font-mono text-[10px]">
                        Registration Intake Details
                      </span>
                      {inspectedParticipant.isImported && (
                        <span className="text-[8px] font-bold uppercase py-0.5 px-2 rounded-full bg-slate-200 text-slate-600 border border-slate-300 leading-none">
                          💾 PERM SAVE
                        </span>
                      )}
                    </div>
                    
                    <div className="text-slate-600 leading-relaxed space-y-1.5 font-sans">
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-400 font-medium">Name:</span>
                        <span className="font-semibold text-slate-900">{inspectedParticipant.name}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-400 font-medium">ID Number:</span>
                        <span className="font-mono font-bold text-slate-800">{inspectedParticipant.idNo || '-'}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-400 font-medium">Date of Birth:</span>
                        <span className="font-mono font-medium text-slate-850">{inspectedParticipant.dob ? formatToReadableDate(inspectedParticipant.dob) : '-'}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-400 font-medium">Age:</span>
                        <span className="font-medium text-slate-800">
                          {inspectedParticipant.dob ? calculateAgeFromDob(inspectedParticipant.dob) : (inspectedParticipant.age || '-')}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-400 font-medium">Gender:</span>
                        <span className="font-medium text-slate-800">{inspectedParticipant.gender || '-'}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-400 font-medium">Village:</span>
                        <span className="font-medium text-slate-800">{inspectedParticipant.village || '-'}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-400 font-medium">Caregiver:</span>
                        <span className="font-medium text-slate-800">{inspectedParticipant.caregiver || '-'}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-400 font-medium">Date Enrolled:</span>
                        <span className="font-medium text-slate-800">{formatToReadableDate(inspectedParticipant.joinDate)}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-400 font-medium">Cohort/Group:</span>
                        <span className="font-medium text-slate-800 bg-slate-100 px-1.5 py-0.2 rounded text-[10px]">{inspectedParticipant.cohort}</span>
                      </div>
                      <div className="pt-1.5">
                        <span className="text-slate-400 font-medium block mb-1">Staff Intake Notes:</span>
                        <p className="bg-white border border-slate-150 rounded-lg p-2 text-slate-600 text-[11px] leading-relaxed">
                          {inspectedParticipant.registrationNotes || 'None specified.'}
                        </p>
                      </div>
                    </div>

                    {/* Editing Actions Panel based on Admin mode */}
                    {isAdminMode ? (
                      <div className="pt-3.5 border-t border-slate-200 mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditName(inspectedParticipant.name);
                            setEditIdNo(inspectedParticipant.idNo || '');
                            setEditAge(inspectedParticipant.age || '');
                            setEditDob(inspectedParticipant.dob || '');
                            setEditGender(inspectedParticipant.gender || '');
                            setEditVillage(inspectedParticipant.village || '');
                            setEditCaregiver(inspectedParticipant.caregiver || '');
                            setEditCohort(inspectedParticipant.cohort);
                            setEditContact(inspectedParticipant.contact);
                            setEditRegistrationNotes(inspectedParticipant.registrationNotes || '');
                            setIsEditingProfile(true);
                          }}
                          className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-center text-[11px] font-bold transition-all shadow-3xs cursor-pointer flex items-center justify-center gap-1"
                        >
                          ✏️ Edit Demographics as Administrator
                        </button>
                      </div>
                    ) : (
                      <div className="pt-3 border-t border-slate-200 mt-2.5">
                        <div className="bg-slate-100 border border-slate-200 p-2.5 rounded-xl flex items-start gap-2 text-slate-500 text-[10.5px] leading-normal font-sans">
                          <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-slate-700 block text-[11px] mb-0.5">Demographics Edit Protected</span>
                            This file is saved permanently. Unlock Admin Mode in the top navigation tab bar to modify enrollment intake parameters.
                            <button
                              type="button"
                              onClick={() => setIsPasscodeFieldOpen(true)}
                              className="mt-1.5 font-bold text-indigo-600 hover:text-indigo-800 block cursor-pointer text-left focus:outline-none"
                            >
                              Unlock Admin Mode with Code (PIN: admin1083)
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
                <button
                  onClick={() => setSelectedParticipantId(null)}
                  className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer shadow-3xs transition-all"
                >
                  Close Inspection
                </button>
              </div>

            </motion.div>
          </div>
        )}

        {/* MODAL SECTION 2: ADD PARTICIPANT FORM */}
        {isAddParticipantOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4" id="modal-add-participant">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddParticipantOpen(false)}
              className="absolute inset-0 bg-slate-900"
            />

            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-250 rounded-2xl w-full max-w-md shadow-2xl relative z-10 overflow-hidden"
            >
              <div className="p-5 border-b border-slate-150 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-slate-700" />
                  <h3 className="text-sm font-bold text-slate-900 font-sans tracking-tight">
                    Add New Cohort Participant
                  </h3>
                </div>
                <button 
                  onClick={() => setIsAddParticipantOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleAddParticipant} className="p-5 space-y-4">
                
                {/* 1. Full Name */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Full Name (Participant Name)</label>
                  <input
                    type="text"
                    required
                    value={newPartName}
                    onChange={(e) => setNewPartName(e.target.value)}
                    placeholder="e.g. Liam Sterling"
                    className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none focus:border-slate-400"
                  />
                </div>

                {/* 2. ID Number & Gender */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">ID Number</label>
                    <input
                      type="text"
                      required
                      value={newPartIdNo}
                      onChange={(e) => setNewPartIdNo(e.target.value)}
                      placeholder="e.g. ID-88220"
                      className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none focus:border-slate-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">Gender</label>
                    <select
                      required
                      value={newPartGender}
                      onChange={(e) => setNewPartGender(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none cursor-pointer text-slate-700"
                    >
                      <option value="">Select...</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* 3. DOB and Live Calculated Age */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">Date of Birth</label>
                    <input
                      type="date"
                      value={newPartDob}
                      onChange={(e) => {
                        const dob = e.target.value;
                        setNewPartDob(dob);
                        if (dob) {
                          const calculatedAge = calculateAgeFromDob(dob);
                          setNewPartAge(calculatedAge);
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none focus:border-slate-400 text-slate-750"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">Age (Calculated Years)</label>
                    <input
                      type="text"
                      required
                      value={newPartAge}
                      onChange={(e) => setNewPartAge(e.target.value)}
                      placeholder="e.g. 21"
                      className="w-full bg-slate-50 border border-slate-155 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none focus:border-slate-400 font-mono"
                    />
                  </div>
                </div>

                {/* 4. Village & 5. Caregiver */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">Village</label>
                    <input
                      type="text"
                      required
                      value={newPartVillage}
                      onChange={(e) => setNewPartVillage(e.target.value)}
                      placeholder="e.g. Eldoret East"
                      className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none focus:border-slate-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">Caregiver</label>
                    <input
                      type="text"
                      required
                      value={newPartCaregiver}
                      onChange={(e) => setNewPartCaregiver(e.target.value)}
                      placeholder="e.g. Grace Okafor"
                      className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>

                {/* Optional Supplementary Contacts */}
                <div className="border-t border-slate-100 pt-3 mt-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Supplementary Details</span>
                  
                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1.5">Contact / Phone (Optional)</label>
                      <input
                        type="text"
                        value={newPartContact}
                        onChange={(e) => setNewPartContact(e.target.value)}
                        placeholder="e.g. +254 711 223344"
                        className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none focus:border-slate-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1.5">Cohort Group Assignment</label>
                      <select
                        value={newPartCohort}
                        onChange={(e) => setNewPartCohort(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none cursor-pointer text-slate-700"
                      >
                        {COHORTS.filter(c => c !== 'All Cohorts').map(coh => (
                          <option key={coh} value={coh}>{coh}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1.5">Intake Notes / Dietary concerns (Optional)</label>
                  <textarea
                    rows={2}
                    value={newPartNotes}
                    onChange={(e) => setNewPartNotes(e.target.value)}
                    placeholder="E.g. Experienced freelancer expanding professional skills..."
                    className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none focus:border-slate-400 placeholder:text-slate-400"
                  />
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddParticipantOpen(false)}
                    className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Register Participant
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}

        {/* MODAL SECTION 3: ADD TRACKER SESSION DATE FORM */}
        {isAddSessionOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4" id="modal-add-session">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddSessionOpen(false)}
              className="absolute inset-0 bg-slate-900"
            />

            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-250 rounded-2xl w-full max-w-sm shadow-2xl relative z-10 overflow-hidden"
            >
              <div className="p-5 border-b border-slate-150 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-slate-700" />
                  <h3 className="text-sm font-bold text-slate-900 font-sans tracking-tight">
                    Add Session Tracking Date
                  </h3>
                </div>
                <button 
                  onClick={() => setIsAddSessionOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleAddSession} className="p-5 space-y-4">
                
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Calendar Date</label>
                  <input
                    type="date"
                    required
                    value={newSessionDate}
                    onChange={(e) => setNewSessionDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2.5 text-xs text-slate-700 focus:bg-white focus:outline-none focus:border-slate-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Custom Label</label>
                  <input
                    type="text"
                    value={newSessionLabel}
                    onChange={(e) => setNewSessionLabel(e.target.value)}
                    placeholder="e.g. Week 2 Session 3"
                    className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none focus:border-slate-400"
                  />
                  <span className="text-[10px] text-slate-450 block mt-1">If blank, defaults automatically to &quot;Session {sessions.length + 1}&quot;</span>
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddSessionOpen(false)}
                    className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Create Tracker Date
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}

        {/* MODAL SECTION 4: BULK IMPORT PARTICIPANTS WORKSPACE */}
        {isImportOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4" id="modal-bulk-import">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsImportOpen(false);
                setUploadedFileName(null);
                setImportText('');
                setParsedImportList([]);
              }}
              className="absolute inset-0 bg-slate-900"
            />

            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-250 rounded-2xl w-full max-w-2xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-5 border-b border-slate-150 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-indigo-650" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 font-sans tracking-tight">
                      Bulk Import Program Participants
                    </h3>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">CSV, TSV, OR JSON LIST PARSER</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setIsImportOpen(false);
                    setUploadedFileName(null);
                    setImportText('');
                    setParsedImportList([]);
                  }}
                  className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-4 flex-1">
                {/* Excel Template Downloader section */}
                <div className="bg-emerald-50/60 border border-emerald-150 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex gap-3 items-start">
                    <div className="h-9 w-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Download Excel / CSV Template</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">
                        Get our official import spreadsheet template pre-configured in order: 
                        <strong className="text-emerald-800 font-semibold block mt-0.5">Name, ID No., Age, Village, Caregiver</strong>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={downloadRosterTemplate}
                    className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-2 px-3.5 rounded-xl shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5 focus:ring-2 focus:ring-emerald-500"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download Template (.csv)
                  </button>
                </div>

                {/* Mode Selector Tabs */}
                <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                  <button
                    type="button"
                    onClick={() => setImportTab('paste')}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      importTab === 'paste' 
                        ? 'bg-white text-slate-900 shadow-2xs' 
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Paste Text List
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportTab('file')}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      importTab === 'file' 
                        ? 'bg-white text-slate-900 shadow-2xs' 
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Upload / Drop File
                  </button>
                </div>

                {/* Tab content 1: Paste CSV/JSON Text area */}
                {importTab === 'paste' && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono uppercase">
                      <span>Paste your row list (comma split or JSON array)</span>
                      <span className="text-[9px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-605 font-bold font-mono">
                        Formats: JSON, CSV, TSV
                      </span>
                    </div>
                    <textarea
                      rows={5}
                      value={importText}
                      onChange={(e) => {
                        setImportText(e.target.value);
                        parseRawText(e.target.value);
                      }}
                      placeholder={`Example CSV Format:\nName, Contact, Cohort, Notes\nLiam Sterling, +254711223344, Victors Class, Quick study\n\nOr JSON Format:\n[\n  {"name": "Liam Sterling", "contact": "+254711223344", "cohort": "Victors Class", "notes": "Registered"}\n]`}
                      className="w-full bg-slate-50 border border-slate-250 rounded-xl p-3 text-xs font-mono focus:bg-white focus:outline-none focus:border-slate-400 placeholder:text-slate-400 leading-relaxed focus:ring-1 focus:ring-slate-300"
                    />
                  </div>
                )}

                {/* Tab content 2: Drag & Drop File Loader Zone */}
                {importTab === 'file' && (
                  <div className="space-y-3">
                    <div 
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all relative flex flex-col items-center justify-center ${
                        dragActive 
                          ? 'border-indigo-500 bg-indigo-50/40' 
                          : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-350'
                      }`}
                    >
                      <input 
                        type="file" 
                        id="import-file-upload" 
                        accept=".csv,.json,.txt"
                        onChange={handleFileInputChange}
                        className="hidden" 
                      />
                      <label htmlFor="import-file-upload" className="cursor-pointer flex flex-col items-center justify-center w-full h-full p-4">
                        <div className="h-10 w-10 rounded-full bg-indigo-50 border border-indigo-150 flex items-center justify-center text-indigo-500 mb-2 sm:mb-3">
                          <Upload className="h-5 w-5" />
                        </div>
                        <span className="text-xs font-semibold text-slate-800 block">
                          Drag and drop your roster template here
                        </span>
                        <span className="text-[11px] text-slate-400 block mt-1 font-sans">
                          Accepts .csv, .json, or .txt format spreadsheet rosters
                        </span>
                        <span className="mt-3 bg-white text-slate-750 hover:bg-slate-50 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all shadow-3xs cursor-pointer inline-block">
                          Select Roster File Manually
                        </span>
                      </label>
                    </div>

                    {uploadedFileName && (
                      <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 flex items-center justify-between text-xs text-slate-700 animate-fadeIn">
                        <div className="flex items-center gap-2 font-medium">
                          {uploadedFileName.endsWith('.json') ? (
                            <FileCode className="h-4 w-4 text-amber-500" />
                          ) : (
                            <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                          )}
                          <span className="truncate max-w-[200px] sm:max-w-xs">{uploadedFileName}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setUploadedFileName(null);
                            setImportText('');
                            setParsedImportList([]);
                          }}
                          className="text-slate-400 hover:text-red-500 font-bold p-1 cursor-pointer transition-colors font-mono uppercase text-[9px]"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Live Candidate Preview Panel */}
                {parsedImportList.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
                        Discovered Candidates List ({parsedImportList.length})
                      </h4>
                      
                      {/* Global action summary label */}
                      {(() => {
                        const valids = parsedImportList.filter(p => p.isValid).length;
                        const invalids = parsedImportList.length - valids;
                        return (
                          <span className="text-[10px] text-slate-500 font-medium font-sans">
                            {valids} ready to import{invalids > 0 ? ` • ${invalids} errors to review` : ''}
                          </span>
                        );
                      })()}
                    </div>

                    {/* Header Columns details */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[220px] overflow-y-auto shadow-3xs">
                      <table className="w-full text-left text-xs text-slate-700 border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-mono text-[10px] uppercase font-bold sticky top-0 bg-opacity-95 z-10 backdrop-blur-xs">
                            <th className="p-2.5 text-center w-10">
                              <input 
                                type="checkbox"
                                checked={parsedImportList.length > 0 && parsedImportList.every(p => p.importChecked)}
                                onChange={() => {
                                  const allChecked = parsedImportList.every(p => p.importChecked);
                                  setParsedImportList(prev => prev.map(p => ({
                                    ...p,
                                    importChecked: p.isValid ? !allChecked : false
                                  })));
                                }}
                                className="rounded text-indigo-600 focus:ring-indigo-400 cursor-pointer h-3.5 w-3.5"
                                title="Toggle all valid"
                              />
                            </th>
                            <th className="p-2.5">Participant Candidate</th>
                            <th className="p-2.5 w-36">Cohort</th>
                            <th className="p-2.5 text-right w-24">Integrity</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {parsedImportList.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/50">
                              {/* Selection switch */}
                              <td className="p-2.5 text-center">
                                <input 
                                  type="checkbox"
                                  disabled={!item.isValid}
                                  checked={item.importChecked}
                                  onChange={() => toggleCandidateCheck(item.id)}
                                  className="rounded text-indigo-600 focus:ring-indigo-400 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed h-3.5 w-3.5"
                                />
                              </td>
                              {/* Identity */}
                              <td className="p-2.5">
                                <div className="space-y-1">
                                  <span className={`font-semibold block ${item.isValid ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                                    {item.name || <em className="text-red-400">Missing Name</em>}
                                  </span>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {item.idNo && item.idNo !== '-' && (
                                      <span className="text-[9px] font-mono font-bold text-slate-700 bg-slate-100 rounded px-1.5 py-0.2" title="ID Number">
                                        {item.idNo}
                                      </span>
                                    )}
                                    {(item.dob || item.age) && (item.dob ? calculateAgeFromDob(item.dob) : item.age) !== '-' && (
                                      <span className="text-[9px] text-slate-500 font-sans" title="Age">
                                        Age: {item.dob ? calculateAgeFromDob(item.dob) : item.age}
                                      </span>
                                    )}
                                    {item.gender && item.gender !== '-' && (
                                      <span className="text-[9px] text-pink-700 font-sans bg-pink-50 px-1.5 py-0.2 rounded" title="Gender">
                                        Sex: {item.gender}
                                      </span>
                                    )}
                                    {item.village && item.village !== '-' && (
                                      <span className="text-[9px] text-indigo-700 font-sans bg-indigo-50 px-1 py-0.2/50 rounded" title="Village">
                                        🏡 {item.village}
                                      </span>
                                    )}
                                    {item.caregiver && item.caregiver !== '-' && (
                                      <span className="text-[9px] text-slate-600 font-sans" title="Caregiver">
                                        Caregiver: {item.caregiver}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[9px] text-slate-400 font-mono block">
                                    {item.contact}
                                  </span>
                                </div>
                              </td>
                              {/* Cohort Select option */}
                              <td className="p-2.5">
                                <select
                                  value={item.cohort}
                                  onChange={(e) => updateCandidateCohort(item.id, e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-1 text-[11px] font-medium text-slate-700 cursor-pointer focus:outline-none"
                                >
                                  {COHORTS.filter(c => c !== 'All Cohorts').map(coh => (
                                    <option key={coh} value={coh}>{coh}</option>
                                  ))}
                                </select>
                              </td>
                              {/* Safety Indicator */}
                              <td className="p-2.5 text-right">
                                {item.isValid ? (
                                  <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded uppercase font-mono">
                                    Ready
                                  </span>
                                ) : (
                                  <div className="flex flex-col items-end gap-0.5" title={item.errors.join(', ')}>
                                    <span className="text-[9px] text-rose-600 font-bold bg-rose-50 px-1 py-0.2 rounded uppercase font-mono max-w-[85px] truncate block">
                                      {item.errors[0]}
                                    </span>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Blank slate description banner */}
                {parsedImportList.length === 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed text-slate-500">
                    <Info className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-800 block mb-0.5">Instruction Guidelines:</span>
                      <p>Excel or spreadsheet CSV lists can be imported in bulk. Organize columns in order: <code className="bg-slate-200 px-1 py-0.2 rounded font-mono text-indigo-750 font-bold">Name, ID No., Age, Gender, Village, Caregiver, Cohort, Contact, Intake Notes</code>. You can click the download template button above to get a working sample.</p>
                      <p className="mt-1">Already registered active participants are automatically cross-checked by name or contact details to avoid duplicate records.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-mono uppercase pl-2">
                  CONSERVATIVE OUTREACH ALERT SYSTEM ACTIVE
                </span>
                
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsImportOpen(false);
                      setUploadedFileName(null);
                      setImportText('');
                      setParsedImportList([]);
                    }}
                    className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Close Dialog
                  </button>
                  <button
                    type="button"
                    disabled={parsedImportList.length === 0 || !parsedImportList.some(p => p.importChecked)}
                    onClick={executeBulkImport}
                    className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors disabled:opacity-35 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <span>Import Selected</span>
                    {parsedImportList.some(p => p.importChecked) && (
                      <span className="text-xs text-indigo-200 bg-indigo-900 border border-indigo-700 px-1.5 py-0.2 select-none font-bold rounded ml-1 scale-90">
                        {parsedImportList.filter(p => p.importChecked).length}
                      </span>
                    )}
                  </button>
                </div>
              </div>

            </motion.div>
          </div>
        )}

        {/* MODAL SECTION 5: INDEPENDENT BULK ATTENDANCE IMPORT */}
        {isAttendanceImportOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4" id="modal-attendance-import">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsAttendanceImportOpen(false);
                setAttendanceUploadedFileName(null);
                setAttendanceImportText('');
                setAttendanceImportLabel('');
              }}
              className="absolute inset-0 bg-slate-900"
            />

            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-250 rounded-2xl w-full max-w-3xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-5 border-b border-slate-150 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-indigo-700 animate-pulse" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 font-sans tracking-tight">
                      Bulk Import Session Attendance
                    </h3>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">INDEPENDENT ATTENDANCE SCANNER</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setIsAttendanceImportOpen(false);
                    setAttendanceUploadedFileName(null);
                    setAttendanceImportText('');
                    setAttendanceImportLabel('');
                  }}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Scrollable Container */}
              <div className="p-6 overflow-y-auto space-y-5 flex-1 min-h-0 bg-slate-50/50">
                {/* 1. Date & Session Setup */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-3xs grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block mb-1.5">
                      Session Date
                    </label>
                    <input
                      type="date"
                      required
                      value={attendanceImportDate}
                      onChange={(e) => setAttendanceImportDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2.5 text-xs text-slate-700 focus:bg-white focus:outline-hidden focus:border-indigo-500"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block leading-tight">
                      {sessions.some(s => s.date === attendanceImportDate) 
                        ? `⚠️ Matches existing session: "${sessions.find(s => s.date === attendanceImportDate)?.label || 'Regular Session'}"`
                        : "✨ Date is new! System will automatically create this session."
                      }
                    </span>
                  </div>

                  <div>
                    <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block mb-1.5">
                      Session Label (for new dates)
                    </label>
                    <input
                      type="text"
                      value={attendanceImportLabel}
                      onChange={(e) => setAttendanceImportLabel(e.target.value)}
                      disabled={sessions.some(s => s.date === attendanceImportDate)}
                      placeholder="e.g. Workshop Session 4"
                      className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-hidden focus:border-indigo-500 disabled:opacity-45 disabled:cursor-not-allowed"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block leading-tight">
                      {sessions.some(s => s.date === attendanceImportDate)
                        ? "Using label of established session."
                        : "Name given to the session on establish."
                      }
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0">
                  {/* Left: Input Textarea and File Upload (7 cols) */}
                  <div className="lg:col-span-7 flex flex-col space-y-3">
                    <div>
                      <span className="text-xs font-bold text-slate-700 block mb-1">
                        Pasted Attendance Roster text / CSV
                      </span>
                      <p className="text-[11px] text-slate-500 leading-normal font-sans mb-2">
                        Paste a list of names, phone contacts, or ID numbers (one student per line) of people who actually attended this session. Unmatched active students are automatically marked as absent.
                      </p>
                    </div>

                    {/* Drag and Drop Box */}
                    <div
                      onDragEnter={handleAttendanceDrag}
                      onDragOver={handleAttendanceDrag}
                      onDragLeave={handleAttendanceDrag}
                      onDrop={handleAttendanceDrop}
                      className={`border-2 border-dashed rounded-2xl p-4 flex flex-col items-center justify-center transition-all ${
                        attendanceDragActive 
                          ? "border-indigo-500 bg-indigo-50/50" 
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <Upload className="h-5 w-5 text-indigo-500 mb-1.5 shrink-0" />
                      <span className="text-[11px] font-semibold text-slate-700">
                        {attendanceUploadedFileName ? `Uploaded: ${attendanceUploadedFileName}` : "Drag and drop attendance sheet file (*.csv, *.txt)"}
                      </span>
                      <label className="mt-1.5 inline-block bg-slate-100 hover:bg-slate-250 text-slate-700 transition px-2.5 py-1 text-[10px] font-bold rounded-lg cursor-pointer">
                        Browse Files
                        <input
                          type="file"
                          accept=".csv,.txt"
                          onChange={handleAttendanceFileInputChange}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Input Textarea Area */}
                    <div className="flex-1 min-h-[160px] flex flex-col">
                      <textarea
                        value={attendanceImportText}
                        onChange={(e) => setAttendanceImportText(e.target.value)}
                        className="w-full flex-1 p-3 text-xs bg-white border border-slate-250 rounded-2xl focus:outline-hidden focus:border-indigo-500 font-mono focus:bg-white resize-y min-h-[160px]"
                        placeholder="Paste list here... e.g.:&#10;Liam Sterling&#10;+254711223344&#10;Jane Chep&#10;ID-45912"
                      />
                    </div>
                  </div>

                  {/* Right: Live Preview Verification Sheet (5 cols) */}
                  <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs flex flex-col max-h-[420px] lg:max-h-none">
                    <div className="p-4 border-b border-slate-150 bg-slate-50/50">
                      <h4 className="text-xs font-bold text-slate-900">Live Verification Sheet</h4>
                      <p className="text-[10px] text-slate-450 mt-0.5">Scanned from database of active members.</p>
                    </div>

                    <div className="p-3 bg-indigo-50/45 border-b border-indigo-100 flex items-center justify-between text-xs font-semibold">
                      <span className="text-emerald-700 font-bold">Present: {attendanceMatchingDetails.matchedIds.size}</span>
                      <span className="text-slate-350">|</span>
                      <span className="text-rose-600 font-bold">Absent: {activeParticipants.length - attendanceMatchingDetails.matchedIds.size}</span>
                    </div>

                    <div className="p-2 overflow-y-auto flex-1 divide-y divide-slate-100 max-h-[300px] lg:max-h-[340px]">
                      {activeParticipants.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 text-xs">
                          No active participants registered.
                        </div>
                      ) : (
                        activeParticipants.map(p => {
                          const isMatched = attendanceMatchingDetails.matchedIds.has(p.id);
                          return (
                            <div key={`preview-att-${p.id}`} className="p-2 flex items-center justify-between gap-1 text-xs hover:bg-slate-50 transition-colors">
                              <div className="min-w-0">
                                <span className="font-bold text-slate-850 block truncate">{p.name}</span>
                                <span className="text-[10px] text-slate-400 font-mono block">
                                  ID: {p.idNo || p.id} • {p.cohort}
                                </span>
                              </div>
                              <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase shrink-0 ${
                                isMatched 
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-150 animate-pulse" 
                                  : "bg-rose-50 text-rose-700 border border-rose-150"
                              }`}>
                                {isMatched ? "PRESENT" : "ABSENT"}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sticky Footer actions */}
              <div className="p-4 border-t border-slate-150 bg-slate-50 flex items-center justify-between">
                <span className="text-[11px] text-slate-550 font-mono">
                  Parsed: {attendanceMatchingDetails.parsedRowsCount} row(s)
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAttendanceImportOpen(false);
                      setAttendanceUploadedFileName(null);
                      setAttendanceImportText('');
                      setAttendanceImportLabel('');
                    }}
                    className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Close Dialog
                  </button>
                  <button
                    type="button"
                    disabled={!attendanceImportText.trim()}
                    onClick={executeAttendanceImport}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all disabled:opacity-35 disabled:cursor-not-allowed flex items-center gap-1 shadow-2xs"
                  >
                    <span>Execute Attendance Import</span>
                  </button>
                </div>
              </div>

            </motion.div>
          </div>
        )}

        {/* MODAL SECTION 6: MONTHLY REPORT MODAL */}
        {isMonthlyReportOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4" id="modal-monthly-report">
            <style>{`
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #printable-report, #printable-report * {
                  visibility: visible !important;
                }
                #printable-report {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  background: white !important;
                  color: #000000 !important;
                  box-shadow: none !important;
                  border: none !important;
                  padding-top: 10px !important;
                }
                .no-print {
                  display: none !important;
                }
              }
            `}</style>
            
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMonthlyReportOpen(false)}
              className="absolute inset-0 bg-slate-900 no-print"
            />

            {/* Modal Body Card */}
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-250 rounded-2xl w-full max-w-5xl h-[90vh] shadow-2xl relative z-10 flex flex-col overflow-hidden font-sans"
            >
              {/* Controls bar (Hidden on print) */}
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-3 no-print">
                <div className="flex items-center gap-2">
                  <FileText className="text-indigo-600 h-5 w-5 shrink-0" />
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 font-sans tracking-tight flex items-center gap-2">
                      High-Fidelity Performance Evaluation Report
                      <span className="bg-indigo-100 text-indigo-800 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold font-mono">
                        PDF-Ready
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-550 leading-none mt-1">
                      Aggregates attendance metrics per cohort dynamically over selected periods.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Selector Pill Switch */}
                  <div className="flex items-center bg-slate-200/80 p-1 rounded-xl border border-slate-250 shrink-0">
                    <button
                      onClick={() => setReportFilterMode('month')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                        reportFilterMode === 'month'
                          ? 'bg-white text-indigo-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      By Month
                    </button>
                    <button
                      onClick={() => setReportFilterMode('custom')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                        reportFilterMode === 'custom'
                          ? 'bg-white text-indigo-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Custom Range
                    </button>
                  </div>

                  {reportFilterMode === 'month' ? (
                    /* Month Selector dropdown */
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-550 font-bold">Month:</span>
                      <select
                        value={selectedMonthlyReportMonth}
                        onChange={(e) => setSelectedMonthlyReportMonth(e.target.value)}
                        className="bg-white border border-slate-250 text-slate-800 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-hidden focus:border-indigo-500 shadow-xs cursor-pointer"
                      >
                        {uniqueMonths.length === 0 ? (
                          <option value="">No Month Logged</option>
                        ) : (
                          uniqueMonths.map(m => (
                            <option key={m} value={m}>{formatMonthLabel(m)}</option>
                          ))
                        )}
                      </select>
                    </div>
                  ) : (
                    /* Custom Date Range pickers */
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-550 font-bold">From:</span>
                        <input
                          type="date"
                          value={reportStartDate}
                          onChange={(e) => setReportStartDate(e.target.value)}
                          className="bg-white border border-slate-250 text-slate-800 rounded-xl px-2 py-1 text-xs font-bold focus:outline-hidden focus:border-indigo-550 shadow-xs cursor-pointer"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-550 font-bold">To:</span>
                        <input
                          type="date"
                          value={reportEndDate}
                          onChange={(e) => setReportEndDate(e.target.value)}
                          className="bg-white border border-slate-250 text-slate-800 rounded-xl px-2 py-1 text-xs font-bold focus:outline-hidden focus:border-indigo-550 shadow-xs cursor-pointer"
                        />
                      </div>
                    </div>
                  )}

                  {/* Print / Save as PDF Button */}
                  <button
                    onClick={() => window.print()}
                    disabled={!monthlyReportData}
                    className="bg-emerald-600 hover:bg-emerald-750 text-white font-extrabold rounded-xl px-4 py-1.5 text-xs transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="h-4 w-4" />
                    Print / Save PDF
                  </button>

                  {/* Google Sheets Sync Button */}
                  <button
                    onClick={syncMonthlyReportToGoogleSheets}
                    disabled={!monthlyReportData || isSyncingToSheets}
                    className="bg-indigo-600 hover:bg-indigo-750 text-white font-extrabold rounded-xl px-4 py-1.5 text-xs transition-all flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 active:scale-97 border border-indigo-550/40"
                  >
                    {isSyncingToSheets ? (
                      <span className="flex items-center gap-1.5">
                        <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Syncing...
                      </span>
                    ) : (
                      <>
                        <ExternalLink className="h-4 w-4 text-emerald-300" />
                        Sync to Google Sheets
                      </>
                    )}
                  </button>

                  {/* Close dialog button */}
                  <button
                    onClick={() => setIsMonthlyReportOpen(false)}
                    className="bg-slate-200 hover:bg-slate-300 hover:text-slate-900 border border-slate-300 rounded-xl p-1.5 text-slate-500 transition-colors cursor-pointer"
                    title="Close document viewer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Google Sheets Sync Notification Banner */}
              {syncedSpreadsheetUrl && (
                <div className="bg-emerald-50 border-b border-emerald-250 p-3 px-6 flex flex-col sm:flex-row items-center justify-between gap-3 no-print">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                    <p className="text-xs text-emerald-800 font-sans">
                      <b>Sync Complete!</b> The evaluation report has successfully been transferred to Google Sheets.
                    </p>
                  </div>
                  <a
                    href={syncedSpreadsheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] py-1.5 px-4 rounded-xl shadow-xs transition-transform hover:scale-103 inline-flex items-center gap-1.5 shrink-0"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open Live Google Sheet
                  </a>
                </div>
              )}

              {sheetSyncError && (
                <div className="bg-rose-50 border-b border-rose-200 p-3 px-6 flex items-center justify-between gap-3 no-print">
                  <div className="flex items-center gap-2">
                    <span className="text-rose-500 shrink-0 font-bold text-sm">⚠️</span>
                    <p className="text-xs text-rose-850 font-sans">
                      <b>Sync Error:</b> {sheetSyncError}
                    </p>
                  </div>
                  <button
                    onClick={() => setSheetSyncError(null)}
                    className="text-[10px] font-bold text-rose-700 hover:underline shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Scrollable Document Container */}
              <div className="flex-1 overflow-y-auto bg-slate-100 p-4 md:p-8">
                {sessions.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-xs">
                    <div className="text-slate-450 h-12 w-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3.5">
                      <Calendar className="w-6 h-6 text-slate-400" />
                    </div>
                    <h4 className="text-sm font-extrabold text-slate-800">No Historical Sessions Logged</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
                      Lomuriangole CYDC database has no tracked sessions. Please create a session using the Tracker Workspace in order to generate a performance report.
                    </p>
                  </div>
                ) : !monthlyReportData ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-xs">
                    <div className="text-slate-450 h-12 w-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3.5">
                      <Calendar className="w-6 h-6 text-indigo-400" />
                    </div>
                    <h4 className="text-sm font-extrabold text-slate-800">
                      {reportFilterMode === 'custom' ? "No Sessions in Date Range" : "Unresolved Monthly Period"}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {reportFilterMode === 'custom' 
                        ? `There are no sessions registered between ${formatToReadableDate(reportStartDate)} and ${formatToReadableDate(reportEndDate)}. Adjust the custom date range values above.` 
                        : "Please select an active tracking period from the dropdown."}
                    </p>
                  </div>
                ) : (
                  /* Formal Official Printable Document Box */
                  <div 
                    id="printable-report"
                    className="bg-white border border-slate-300 rounded-2xl shadow-lg p-6 sm:p-12 max-w-4xl mx-auto space-y-8 font-sans text-slate-900 overflow-hidden leading-relaxed"
                  >
                    {/* Official Banner Header */}
                    <div className="border-b-4 border-double border-slate-900 pb-5">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex items-center gap-3">
                          {/* Logo graphics */}
                          <div className="h-12 w-12 rounded-xl bg-slate-950 flex items-center justify-center text-indigo-400 border border-slate-800 shrink-0 font-sans tracking-tighter shadow-sm">
                            <span className="font-extrabold text-white text-base">CYDC</span>
                          </div>
                          
                          <div>
                            <div className="text-[10px] tracking-wider uppercase font-black text-rose-600 font-mono">
                              Lomuriangole CYDC • Official Document
                            </div>
                            <h1 className="text-lg sm:text-xl font-black text-slate-950 font-sans tracking-tight">
                              Lomuriangole Community Youth Development Center
                            </h1>
                            <p className="text-xs text-slate-500 leading-tight">
                              Attendance and Participation Performance Evaluation Summary
                            </p>
                          </div>
                        </div>

                        <div className="sm:text-right font-mono text-[10px]">
                          <div className="font-extrabold text-indigo-900 bg-indigo-50 border border-indigo-200/80 rounded-md px-2 py-1 inline-block shrink-0 mb-1.5 uppercase font-sans">
                            🔒 Confidential Archive
                          </div>
                          <div className="text-slate-450 mt-1 text-[9.5px]">
                            Generated on: <span className="text-slate-700 font-bold">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Metadata Header Block */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 font-mono block">REPORT PERIOD</span>
                        <span className="font-bold text-slate-800 mt-0.5 block">{monthlyReportData.periodLabel}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 font-mono block">SESSIONS LOGGED</span>
                        <span className="font-bold text-slate-800 mt-0.5 block">{monthlyReportData.overallStats.sessionsCount} session dates</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 font-mono block">ACTIVE STUDENTS</span>
                        <span className="font-bold text-slate-800 mt-0.5 block">{monthlyReportData.overallStats.activeStudentsCount} enrolled</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 font-mono block">AUTHORIZED BY</span>
                        <span className="font-bold text-slate-800 mt-0.5 block truncate" title={currentUser?.email || 'System'}>
                          {currentUser ? currentUser.displayName || currentUser.email : "Admin Team"}
                        </span>
                      </div>
                    </div>

                    {/* Executive Overview Analytics */}
                    <div className="space-y-3.5">
                      <h3 className="text-xs uppercase tracking-wider font-extrabold text-slate-450 border-b border-slate-100 pb-1 flex items-center gap-1">
                        Executive Summary Metrics
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {/* Summary Rate */}
                        <div className="border border-indigo-200/60 bg-indigo-50/20 p-4 rounded-xl flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-indigo-900 uppercase font-bold block">
                              {monthlyReportData.isCustomRange ? "Aggregated Period Average" : "Aggregated Monthly Average"}
                            </span>
                            <span className="text-3xl font-black text-indigo-900 font-mono block mt-1">
                              {monthlyReportData.overallStats.rate}%
                            </span>
                            <span className="text-[9.5px] text-indigo-650 font-medium block mt-1">
                              Across all class cohorts
                            </span>
                          </div>
                          <div className={`h-11 w-11 rounded-full uppercase text-[9px] font-black border flex items-center justify-center shrink-0 ${
                            monthlyReportData.overallStats.rate >= 90 
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-250' 
                              : monthlyReportData.overallStats.rate >= 70
                              ? 'bg-amber-50 text-amber-800 border-amber-250'
                              : 'bg-rose-50 text-rose-800 border-rose-250'
                          }`}>
                            {monthlyReportData.overallStats.rate >= 90 ? 'GOOD' : monthlyReportData.overallStats.rate >= 70 ? 'WARN' : 'ALERT'}
                          </div>
                        </div>

                        {/* Summary Headcounts */}
                        <div className="border border-slate-200 bg-white p-4 rounded-xl">
                          <span className="text-[10px] text-slate-450 uppercase font-bold block">Total Markings Cast</span>
                          <span className="text-3.5xl font-black text-slate-800 font-mono block mt-1">
                            {monthlyReportData.overallStats.totalMarked}
                          </span>
                          <span className="text-[9.5px] text-slate-550 block mt-1">
                            Individual attendance records verified
                          </span>
                        </div>

                        {/* Ledger breakdown states */}
                        <div className="border border-slate-200 bg-white p-4 rounded-xl flex flex-col justify-between">
                          <span className="text-[10px] text-slate-450 uppercase font-bold block">Breakdown headcounts</span>
                          <div className="mt-1.5 space-y-1 text-[11px]">
                            <div className="flex justify-between">
                              <span className="text-slate-450">● Present Entries</span>
                              <span className="font-mono font-bold text-emerald-700">{monthlyReportData.overallStats.totalPresent}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-450">● Excused Days</span>
                              <span className="font-mono font-bold text-amber-600">{monthlyReportData.overallStats.totalExcused}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-450">● Absent Days</span>
                              <span className="font-mono font-bold text-rose-600">{monthlyReportData.overallStats.totalAbsent}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Regional Cohorts Performance Comparison */}
                    <div className="space-y-4">
                      <h3 className="text-xs uppercase tracking-wider font-extrabold text-slate-450 border-b border-slate-100 pb-1">
                        {monthlyReportData.isCustomRange ? "Cohorts Performance Evaluation" : "Cohorts Monthly Evaluation"}
                      </h3>

                      <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-mono text-[10px] font-bold uppercase">
                              <th className="py-3 px-4">Cohort Group</th>
                              <th className="py-3 px-4">Active Enrolled</th>
                              <th className="py-3 px-4">Session Log Entries</th>
                              <th className="py-3 px-4">Present / Excused / Absent</th>
                              <th className="py-3 px-4 text-right">
                                {monthlyReportData.isCustomRange ? "Average Period Rate" : "Average Monthly rate"}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {monthlyReportData.cohorts.map((cohort) => (
                              <tr key={cohort.cohortName} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-3.5 px-4 font-bold text-slate-900">{cohort.cohortName}</td>
                                <td className="py-3.5 px-4 font-mono font-semibold">{cohort.membersCount} students</td>
                                <td className="py-3.5 px-4 font-mono font-semibold">{cohort.totalSessionsPossible} entries</td>
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                                    <span className="text-emerald-700 font-bold">{cohort.totalPresent}p</span>
                                    <span className="text-slate-350">/</span>
                                    <span className="text-amber-600 font-bold">{cohort.totalExcused}e</span>
                                    <span className="text-slate-350">/</span>
                                    <span className="text-rose-500 font-bold">{cohort.totalAbsent}a</span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 text-right font-black text-sm">
                                  <div className="flex items-center justify-end gap-2.5">
                                    <div className="w-16 bg-slate-100 rounded-full h-1.5 shrink-0 hidden sm:block overflow-hidden border border-slate-200/50">
                                      <div 
                                        className={`h-1.5 rounded-full ${
                                          cohort.attendanceRate >= 90 ? 'bg-emerald-500' :
                                          cohort.attendanceRate >= 70 ? 'bg-amber-500' :
                                          'bg-rose-500'
                                        }`}
                                        style={{ width: `${cohort.attendanceRate}%` }}
                                      />
                                    </div>
                                    <span className={`font-mono text-xs px-2 py-0.5 rounded font-black ${
                                      cohort.attendanceRate >= 90 ? 'bg-emerald-100 text-emerald-800' :
                                      cohort.attendanceRate >= 70 ? 'bg-amber-100 text-amber-800' :
                                      'bg-rose-100 text-rose-800'
                                    }`}>
                                      {cohort.attendanceRate}%
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Detailed Active Members Attendance List (Divided by Cohort Ledger for physical review) */}
                    <div className="space-y-6 pt-2">
                      <div className="border-b border-slate-100 pb-1.5 flex items-center justify-between">
                        <h3 className="text-xs uppercase tracking-wider font-extrabold text-slate-450">
                          Individual Member Ledger breakdowns
                        </h3>
                        <span className="text-[10px] font-mono text-slate-400 no-print">All cohorts shown</span>
                      </div>

                      <div className="space-y-8 flex flex-col">
                        {monthlyReportData.cohorts.map((cohort) => (
                          <div key={`ledger-${cohort.cohortName}`} className="space-y-2.5 flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-slate-800"></span>
                              <h4 className="text-xs font-black text-slate-900 tracking-tight">{cohort.cohortName} - Student Dossier Log ({cohort.students.length})</h4>
                            </div>

                            {cohort.students.length === 0 ? (
                              <div className="text-center py-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs italic">
                                No active students registered in {cohort.cohortName} group.
                              </div>
                            ) : (
                              <div className="overflow-hidden border border-slate-150 rounded-xl bg-white">
                                <table className="w-full text-left border-collapse text-[11px] font-sans">
                                  <thead>
                                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-mono text-[9px] font-bold uppercase">
                                      <th className="py-2.5 px-3">Student Name</th>
                                      <th className="py-2.5 px-3">Enrolled ID</th>
                                      <th className="py-2.5 px-3">Village / Caregiver</th>
                                      <th className="py-2.5 px-3">Sessions marked</th>
                                      <th className="py-2.5 px-3">Present / Excused / Absent</th>
                                      <th className="py-2.5 px-3 text-right">
                                        {monthlyReportData.isCustomRange ? "Individual Period Rate" : "Individual Monthly average"}
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 text-slate-700">
                                    {cohort.students.map((stRow) => (
                                      <tr key={stRow.participant.id} className="hover:bg-slate-50/30 transition-colors">
                                        <td className="py-2 px-3 font-bold text-slate-800">{stRow.participant.name}</td>
                                        <td className="py-1.5 px-3 font-mono text-slate-500">{stRow.participant.idNo || 'N/A'}</td>
                                        <td className="py-1.5 px-3 text-slate-550">
                                          {stRow.participant.village || "N/A"} {stRow.participant.caregiver ? `(${stRow.participant.caregiver})` : ''}
                                        </td>
                                        <td className="py-1.5 px-3 font-mono text-slate-500">{stRow.marked} dates</td>
                                        <td className="py-1.5 px-3 font-mono">
                                          <span className="text-emerald-700 font-bold">{stRow.present}p</span>
                                          <span className="text-slate-300 mx-1">/</span>
                                          <span className="text-amber-600 font-semibold">{stRow.excused}e</span>
                                          <span className="text-slate-300 mx-1">/</span>
                                          <span className="text-rose-500 font-semibold">{stRow.absent}a</span>
                                        </td>
                                        <td className="py-1.5 px-3 text-right font-bold text-[11.5px]">
                                          <span className={`font-mono px-1.5 py-0.2 rounded ${
                                            stRow.rate >= 90 ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' :
                                            stRow.rate >= 70 ? 'bg-amber-50 text-amber-800 border border-amber-100' :
                                            'bg-rose-50 text-rose-800 border border-rose-100'
                                          }`}>
                                            {stRow.rate}%
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Official signature footer */}
                    <div className="pt-8 mt-12 border-t border-slate-200">
                      <div className="text-[10px] text-slate-450 italic mb-6">
                        This document serves as an evaluation log generated and synced dynamically from Lomuriangole CYDC Firestore security sandbox. For physical file record keeping, print the document and register official physical sign-off:
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
                        <div className="space-y-1">
                          <div className="border-b border-slate-405 h-8"></div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block pt-1 font-mono">
                            PREPARED BY (ADMINISTRATIVE OFFICERS)
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="border-b border-slate-405 h-8"></div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block pt-1 font-mono">
                            APPROVED BY (LOMURIANGOLE CYDC MAIN DIRECTOR)
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="border-b border-slate-405 h-8"></div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block pt-1 font-mono">
                            DATE AND STAMP
                          </span>
                        </div>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

      </AnimatePresence>

      {/* AUTOMATED BACKUP FLOATING TOAST NOTIFICATION */}
      <AnimatePresence>
        {autoBackupToast.show && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-slate-900 text-white rounded-2xl shadow-xl border border-slate-750 p-4 font-sans flex items-start gap-3"
          >
            <div className="h-9 w-9 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0 border border-indigo-500/15">
              <Cloud className="w-5 h-5 text-indigo-400 animate-pulse" />
            </div>
            <div className="flex-1 space-y-1">
              <h5 className="text-xs font-extrabold uppercase font-mono tracking-wider text-indigo-300">
                System Auto-Backup
              </h5>
              <p className="text-[11.5px] text-slate-200 leading-normal font-medium">
                {autoBackupToast.message}
              </p>
              <div className="text-[9px] text-slate-400 font-mono">
                A portable JSON backup of your database was downloaded to your device automatically.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
