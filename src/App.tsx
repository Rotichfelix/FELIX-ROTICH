import { useState, useEffect, useRef, FormEvent, ChangeEvent, DragEvent, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, Legend, LineChart, Line } from 'recharts';
import { 
  Activity,
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
  LayoutGrid, 
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
  Receipt,
  Sparkles,
  Brain,
  Bell
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { getLogoBase64DataUri, getLogoPngDataUri, LogoSVG } from './components/LogoSVG';
import { db, auth, googleProvider, storage } from './firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, sendEmailVerification } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { 
  Participant, 
  Session, 
  AttendanceRecord, 
  AttendanceStatus,
  OutreachLog,
  AttendanceStats,
  OfficialDocument,
  FilledForm
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
import { FormModal } from './components/FormModal';
import { generateFormPDF } from './utils/formPdf';
import { generateBudgetPDF } from './utils/budgetPdf';
import { SessionInspectorModal } from './components/SessionInspectorModal';
import { CdoStaffPortals } from './components/CdoStaffPortals';

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

export const AGE_BRACKETS = [
  { id: 'all', label: 'All Age Brackets', min: '', max: '' },
  { id: 'ecd', label: '👶 ECD (3 - 5 yrs)', min: '3', max: '5' },
  { id: 'early-primary', label: '🧒 Early Primary (6 - 8 yrs)', min: '6', max: '8' },
  { id: 'pre-teen', label: '👦 Pre-Teen (9 - 12 yrs)', min: '9', max: '12' },
  { id: 'adolescents', label: '🧑 Adolescents (13 - 17 yrs)', min: '13', max: '17' },
  { id: 'youth', label: '🧑‍🎓 Youth / Adults (18+  yrs)', min: '18', max: '22' }
];

export default function App() {
  // ---- STATE MANAGEMENT DECLARATION ----
  const [participants, setParticipants] = useState<Participant[]>(() => {
    try {
      const local = localStorage.getItem('attendance_tracker_participants');
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const seen = new Set<string>();
          return parsed.filter(p => {
            if (!p || !p.id || seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          });
        }
      }
    } catch (e) {
      console.error("Failed to parse participants from localStorage:", e);
    }
    return INITIAL_PARTICIPANTS;
  });

  const [sessions, setSessions] = useState<Session[]>(() => {
    try {
      const local = localStorage.getItem('attendance_tracker_sessions');
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          const seen = new Set<string>();
          return parsed.filter(s => {
            if (!s || !s.date || seen.has(s.date)) return false;
            seen.add(s.date);
            return true;
          });
        }
      }
    } catch (e) {
      console.error("Failed to parse sessions from localStorage:", e);
    }
    return INITIAL_SESSIONS;
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
  const [adminActiveSearchQuery, setAdminActiveSearchQuery] = useState('');
  const [adminFormerSearchQuery, setAdminFormerSearchQuery] = useState('');
  const [liveVerificationSearchQuery, setLiveVerificationSearchQuery] = useState('');
  const [selectedCohort, setSelectedCohort] = useState('All Cohorts');
  const [selectedVillage, setSelectedVillage] = useState('All Villages');
  const [selectedSegment, setSelectedSegment] = useState<'all' | 'male' | 'female' | 'under12' | '12to14' | '15to18' | '19plus'>('all');
  const [selectedSchoolingStatus, setSelectedSchoolingStatus] = useState('All');
  const [selectedSchoolClass, setSelectedSchoolClass] = useState('All');
  const [selectedFlag, setSelectedFlag] = useState<'all' | 'red' | 'yellow' | 'normal' | 'due_checkin'>('all');
  const [attendanceSortOrder, setAttendanceSortOrder] = useState<'none' | 'best' | 'worst'>('none');
  const [filterYearStart, setFilterYearStart] = useState<string>('');
  const [filterYearEnd, setFilterYearEnd] = useState<string>('');
  const [filterYearType, setFilterYearType] = useState<'join' | 'dob'>('join');
  const [filterAgeStart, setFilterAgeStart] = useState<string>('');
  const [filterAgeEnd, setFilterAgeEnd] = useState<string>('');
  const [currentTab, setCurrentTab] = useState<'tracker' | 'journal' | 'admin' | 'ai-analyst' | 'staff-portals' | 'roster-gallery'>('tracker');
  const [gallerySelectedSessionDate, setGallerySelectedSessionDate] = useState<string>('');
  const [gallerySearchQuery, setGallerySearchQuery] = useState('');
  const [gallerySelectedCohort, setGallerySelectedCohort] = useState('All Cohorts');
  const [gallerySelectedVillage, setGallerySelectedVillage] = useState('All Villages');
  const [galleryStatusFilter, setGalleryStatusFilter] = useState<'all' | AttendanceStatus>('all');
  const [staffTasks, setStaffTasks] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('attendance_tracker_staff_tasks');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error("Failed to load staff tasks:", e);
    }
    return [
      {
        id: 'task_default_0',
        title: 'Conduct Immunization Verification Round',
        assignedRole: 'CDO HEALTH',
        priority: 'high',
        status: 'pending',
        dueDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
        description: 'Verify and register all incoming vaccination files for children in Cohorts A & B.'
      },
      {
        id: 'task_default_1',
        title: 'Sponsor Letter Intake Session',
        assignedRole: 'CDO SDR',
        priority: 'medium',
        status: 'in-progress',
        dueDate: new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0],
        description: 'Host the physical child-to-sponsor writing session for active sponsor codes.'
      }
    ];
  });

  const [complianceStatus, setComplianceStatus] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('attendance_tracker_compliance_status');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return {
      childProtectionSigned: true,
      healthComplianceMet: true,
      financialAuditingApproved: false,
      staffCertificationsUpdated: true
    };
  });

  const [budgets, setBudgets] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('attendance_tracker_budgets');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error("Failed to load budgets:", e);
    }
    return [
      {
        id: 'BGT-2026-001',
        title: 'Emergency Medical Camp Supplies',
        category: 'Health',
        amount: 450000,
        description: 'Procurement of basic medical supplies, first aid kits, and child multi-vitamins for the upcoming community healthcare outreach day.',
        submittedBy: 'CDO HEALTH',
        submittedAt: '2026-06-20',
        status: 'Approved',
        items: [
          { name: 'Multi-vitamins (100 pack)', qty: 5, unitCost: 30000 },
          { name: 'First Aid Kit Refills', qty: 10, unitCost: 15000 },
          { name: 'Paracetamol Tablets', qty: 50, unitCost: 3000 }
        ]
      },
      {
        id: 'BGT-2026-002',
        title: 'Sponsor Appreciation Letters & Stationery',
        category: 'Sponsor Relations',
        amount: 120000,
        description: 'Buying letterhead envelopes, custom drawing crayons, and hard boards for the children to write physical letters to their international sponsors.',
        submittedBy: 'CDO SDR',
        submittedAt: '2026-06-22',
        status: 'Pending',
        items: [
          { name: 'Custom drawing pads', qty: 50, unitCost: 1000 },
          { name: 'Colored pencils (12-pack)', qty: 20, unitCost: 2000 },
          { name: 'Envelopes (box of 500)', qty: 1, unitCost: 30000 }
        ]
      }
    ];
  });

  const [aiReportLoading, setAiReportLoading] = useState(false);
  const [activeStatsTab, setActiveStatsTab] = useState<'cohorts' | 'villages' | 'genders' | 'schooling'>('cohorts');
  const [aiCohortReport, setAiCohortReport] = useState<{
    cohortSummary: string;
    overallRiskDistribution: string;
    comparativeAnalysis: string;
    systemStats: {
      villageBreakdown: string;
      genderComparison: string;
      schoolingImpact: string;
    };
    strategicRecommendations: Array<{
      category: string;
      initiative: string;
      priority: string;
      rationale: string;
    }>;
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
  const [journalStartDate, setJournalStartDate] = useState('');
  const [journalEndDate, setJournalEndDate] = useState('');

  // Interactive Modal UI state
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [selectedSessionDate, setSelectedSessionDate] = useState<string | null>(null);
  const [isAddParticipantOpen, setIsAddParticipantOpen] = useState(false);
  const [isAddSessionOpen, setIsAddSessionOpen] = useState(false);
  const [isMonthlyReportOpen, setIsMonthlyReportOpen] = useState(false);
  const [selectedMonthlyReportMonth, setSelectedMonthlyReportMonth] = useState<string>('');

  // Google Sheets sync state variables
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [isSyncingToSheets, setIsSyncingToSheets] = useState(false);
  const [syncedSpreadsheetUrl, setSyncedSpreadsheetUrl] = useState<string | null>(null);
  const [sheetSyncError, setSheetSyncError] = useState<string | null>(null);

  // Google Calendar sync state variables
  const [isSyncingToCalendar, setIsSyncingToCalendar] = useState(false);
  const [calendarSyncSuccess, setCalendarSyncSuccess] = useState<string | null>(null);
  const [calendarSyncError, setCalendarSyncError] = useState<string | null>(null);
  const [staffEmailRecipient, setStaffEmailRecipient] = useState<string>(() => {
    return localStorage.getItem('attendance_tracker_staff_email_recipient') || 'lomuriangolecydc@gmail.com';
  });
  const [isSendingEmailAlert, setIsSendingEmailAlert] = useState(false);
  const [emailAlertSuccess, setEmailAlertSuccess] = useState<string | null>(null);
  const [emailAlertError, setEmailAlertError] = useState<string | null>(null);
  const [isAutomaticEmailEnabled, setIsAutomaticEmailEnabled] = useState<boolean>(() => {
    return localStorage.getItem('attendance_tracker_auto_email_enabled') === 'true'; // Default to false (conservative) to prevent unsolicited background emails
  });
  const [lastEmailedSessionDate, setLastEmailedSessionDate] = useState<string | null>(() => {
    return localStorage.getItem('attendance_tracker_last_emailed_session_date') || null;
  });
  const [emailedSessionDates, setEmailedSessionDates] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('attendance_tracker_emailed_session_dates');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    const legacy = localStorage.getItem('attendance_tracker_last_emailed_session_date');
    return legacy ? [legacy] : [];
  });
  const [dismissedEmailDates, setDismissedEmailDates] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('attendance_tracker_dismissed_email_dates');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  });
  const [isEmailAlertModalOpen, setIsEmailAlertModalOpen] = useState(false);
  const [emailModalSelectedDate, setEmailModalSelectedDate] = useState<string | null>(null);

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
  const [newPartSchoolingStatus, setNewPartSchoolingStatus] = useState('Day Scholar');
  const [newPartSchoolClass, setNewPartSchoolClass] = useState('');
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

  // AI-Powered Caregiver SMS Composer States
  const [smsCampaignType, setSmsCampaignType] = useState<'absenteeism' | 'praise' | 'home_visit' | 'medical' | 'academic'>('absenteeism');
  const [smsTone, setSmsTone] = useState<'polite' | 'urgent' | 'collaborative'>('polite');
  const [smsExtraContext, setSmsExtraContext] = useState('');
  const [smsDraftMessage, setSmsDraftMessage] = useState('');
  const [isSmsGenerating, setIsSmsGenerating] = useState(false);
  const [smsCopied, setSmsCopied] = useState(false);
  const [smsSuccessMsg, setSmsSuccessMsg] = useState<string | null>(null);
  const [smsAccordionExpanded, setSmsAccordionExpanded] = useState(false);

  const getSmsDefaultMessage = (student: Participant, campaign: string, tone: string) => {
    const caregiverName = student.caregiver && student.caregiver !== '-' ? student.caregiver : 'Caregiver';
    const rate = participantStatsMap[student?.id]?.attendanceRate !== undefined ? `${participantStatsMap[student.id].attendanceRate}%` : '100%';
    
    switch (campaign) {
      case 'absenteeism':
        return `Dear ${caregiverName}, greetings from Lomuriangole CYDC. We are concerned about ${student.name}'s attendance which is currently at ${rate}. Please reach out to us at 0778687473 so we can discuss any challenges and support their continuity. Thank you and stay blessed.`;
      case 'praise':
        return `Dear ${caregiverName}, greetings of peace from Lomuriangole CYDC! We want to appreciate and congratulate you on ${student.name}'s excellent attendance of ${rate}. Your dedication to their growth is highly inspiring. Thank you for partnering with us.`;
      case 'home_visit':
        return `Dear ${caregiverName}, greetings from Lomuriangole CYDC. Our caseworkers would love to conduct a routine home visit to check in on ${student.name}'s well-being and family welfare. Please let us know if you will be home this week or call us at 0778687473.`;
      case 'medical': {
        const medicalForm = student.scannedForms?.find(f => f.formType === 'medical')?.extractedData?.medical || {};
        const medCondStr = medicalForm.healthStatusSummary ? ` (${medicalForm.healthStatusSummary})` : '';
        return `Dear ${caregiverName}, greetings from Lomuriangole CYDC health ministry. We would like to follow up on ${student.name}'s medical records and ongoing health status${medCondStr}. Please call us at 0778687473 or visit our office. Stay well.`;
      }
      case 'academic': {
        const schoolForm = student.scannedForms?.find(f => f.formType === 'school')?.extractedData?.school || {};
        const scoreStr = schoolForm.averageScorePercentage ? ` (${schoolForm.averageScorePercentage}% avg)` : '';
        return `Dear ${caregiverName}, greetings from Lomuriangole CYDC. We are tracking ${student.name}'s academic progress${scoreStr}. We would love to review their school reports and performance cards. Please share details or visit us for coaching support. Thank you.`;
      }
      default:
        return `Dear ${caregiverName}, greetings from Lomuriangole CYDC. Please contact our caseworker office regarding ${student.name} at 0778687473 at your earliest convenience. Thank you.`;
    }
  };

  const handleGenerateSmsWithGemini = async () => {
    if (!inspectedParticipant) return;
    setIsSmsGenerating(true);
    setSmsSuccessMsg(null);
    try {
      const response = await fetch('/api/gemini/compose-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          student: inspectedParticipant,
          type: smsCampaignType,
          tone: smsTone,
          extraContext: smsExtraContext
        })
      });

      if (!response.ok) {
        throw new Error('Could not optimize SMS draft back-end request.');
      }
      const data = await response.json();
      if (data.success && data.sms) {
        setSmsDraftMessage(data.sms);
        setSmsSuccessMsg('✨ Optimized with Gemini AI!');
      } else {
        throw new Error('Unable to optimize message.');
      }
    } catch (e: any) {
      console.error(e);
      setSmsSuccessMsg('⚠️ Error. Reverted to standard offline template.');
    } finally {
      setIsSmsGenerating(false);
    }
  };

  // Re-generate message instantly when selecting a different participant or campaign topic
  useEffect(() => {
    if (inspectedParticipant) {
      setSmsDraftMessage(getSmsDefaultMessage(inspectedParticipant, smsCampaignType, smsTone));
      setSmsSuccessMsg(null);
    }
  }, [selectedParticipantId, smsCampaignType, smsTone]);

  // Africa's Talking Direct Transmit handlers
  const [isSendingDirectSms, setIsSendingDirectSms] = useState(false);
  const [directSmsResponse, setDirectSmsResponse] = useState<{success: boolean; message: string; isSimulated: boolean} | null>(null);

  const handleSendDirectSms = async () => {
    if (!inspectedParticipant) return;
    const rawNo = inspectedParticipant.contact || '';
    // Normalize number - Africa's Talking requires international formats e.g. +256...
    let cleanNo = rawNo.replace(/[^0-9+]/g, '');
    if (!cleanNo.startsWith('+')) {
      if (cleanNo.startsWith('0')) {
        // Assume Uganda (+256) default for Moroto prefix
        cleanNo = '+256' + cleanNo.slice(1);
      } else if (cleanNo.length >= 9) {
        cleanNo = '+256' + cleanNo;
      }
    }

    if (cleanNo.length < 10) {
      alert(`Invalid contact number format: "${rawNo}". Please configure a country code (e.g. +256778...) on this caregiver's profile before sending direct messages.`);
      return;
    }

    if (!smsDraftMessage.trim()) {
      alert("Please enter a valid message draft first.");
      return;
    }

    setIsSendingDirectSms(true);
    setDirectSmsResponse(null);
    try {
      const response = await fetch('/api/africastalking/send-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: cleanNo,
          message: smsDraftMessage
        })
      });

      const resData = await response.json();
      if (response.ok && resData.success) {
        setDirectSmsResponse({
          success: true,
          message: resData.isSimulated 
            ? `[TEST MODE] Successfully queued message to simulated gateway for contact ${cleanNo}`
            : `[LOMURIALGOLE SMS] Successfully delivered message to Africa's Talking network!`,
          isSimulated: !!resData.isSimulated
        });
        
        // Log outreach log dynamically inside participant file records
        const actorName = "Admin / Caseworker (via AT API)";
        const newLogEntry = {
          id: `outreach-${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          by: actorName,
          status: 'contacted' as const,
          notes: `[AT Gateway Direct SMS] Campaign: "${smsCampaignType}". Message: "${smsDraftMessage}"`
        };

        const updatedParticipants = participants.map(p => {
          if (p.id === inspectedParticipant.id) {
            return {
              ...p,
              outreachNotes: [newLogEntry, ...(p.outreachNotes || [])]
            };
          }
          return p;
        });
        setParticipants(updatedParticipants);
      } else {
        throw new Error(resData.error || "Africa's Talking connection returned warnings.");
      }
    } catch (err: any) {
      console.error("Direct SMS error:", err);
      setDirectSmsResponse({
        success: false,
        message: err.message || "Failed to process SMS over local Express gateway.",
        isSimulated: false
      });
    } finally {
      setIsSendingDirectSms(false);
    }
  };
  
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
  const [operatorName, setOperatorName] = useState(() => {
    return localStorage.getItem('attendance_tracker_operator_name') || '';
  });

  const handleUpdateOperatorName = (name: string) => {
    setOperatorName(name);
    localStorage.setItem('attendance_tracker_operator_name', name);
  };

  // Demographics Editing Space
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [expandedFormId, setExpandedFormId] = useState<string | null>(null);
  const [formType, setFormType] = useState<Required<FilledForm>['type']>('School Visit');
  const [formData, setFormData] = useState<any>({});
  const [editName, setEditName] = useState('');
  const [editIdNo, setEditIdNo] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editGender, setEditGender] = useState('');
  const [editVillage, setEditVillage] = useState('');
  const [editCaregiver, setEditCaregiver] = useState('');
  const [editCohort, setEditCohort] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editSchoolingStatus, setEditSchoolingStatus] = useState('');
  const [editSchoolClass, setEditSchoolClass] = useState('');
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

  // System activity journals and transaction logs audit trails
  const [systemLogs, setSystemLogs] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('attendance_tracker_system_logs');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to parse system logs from localStorage:", e);
    }
    return [
      {
        id: 'log_init_0',
        timestamp: new Date(Date.now() - 3600000 * 2.5).toISOString(),
        category: 'audit',
        action: 'System Initialization',
        details: 'Lomuriangole CYDC registry database loaded successfully into browser memory.',
        operator: 'System Core'
      },
      {
        id: 'log_init_1',
        timestamp: new Date(Date.now() - 3600000 * 1.2).toISOString(),
        category: 'transaction',
        action: 'Roster Synchronization',
        details: 'Checked offline data records and calibrated active candidate directories.',
        operator: 'Sync Agent'
      }
    ];
  });

  const logSystemAction = (category: 'audit' | 'transaction', action: string, details: string, customOperator?: string) => {
    setSystemLogs(prev => {
      const defaultOpString = isAdminMode 
        ? (operatorName.trim() ? `${operatorName.trim()} (Admin)` : 'Unlocked Administrator')
        : (operatorName.trim() ? `${operatorName.trim()} (Staff)` : 'Staff Operator');
      const op = customOperator || defaultOpString;
      const newLog = {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        timestamp: new Date().toISOString(),
        category,
        action,
        details,
        operator: op
      };
      const updated = [newLog, ...prev].slice(0, 500);
      localStorage.setItem('attendance_tracker_system_logs', JSON.stringify(updated));
      return updated;
    });
  };

  // Synchronize official browser icon favicon and window title with raw custom vector logo
  useEffect(() => {
    try {
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement || document.createElement('link');
      link.type = 'image/svg+xml';
      link.rel = 'icon';
      link.href = getLogoBase64DataUri();
      document.getElementsByTagName('head')[0].appendChild(link);
      document.title = "Lomuriangole CYDC Tracker";
    } catch (e) {
      console.error("Failed to inject vector favicon:", e);
    }
  }, []);

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

    // Save locally
    localStorage.setItem('attendance_tracker_staff_tasks', JSON.stringify(staffTasks));
    localStorage.setItem('attendance_tracker_compliance_status', JSON.stringify(complianceStatus));

    const dataToSync = {
      participants: activeParticipantsList,
      sessions: activeSessionsList,
      attendance: activeAttendanceRecord,
      emailedSessionDates,
      dismissedEmailDates,
      lastEmailedSessionDate,
      staffEmailRecipient,
      isAutomaticEmailEnabled,
      staffTasks,
      complianceStatus,
      lastUpdated: new Date().toISOString()
    };

    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(dataToSync)
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || errData.details || 'Server sync failed');
      }

      setSyncStatus('synced');
      setHasPendingUnsavedChanges(false);
      localStorage.setItem('attendance_tracker_unsynced_changes', 'false');
      
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString();
      setLastSyncTime(nowStr);
      localStorage.setItem('attendance_tracker_last_sync_time', nowStr);
    } catch (err: any) {
      console.error("Cloud SQL sync failing:", err);
      setSyncStatus('error');
      setSyncErrorMsg(err.message || 'Cloud SQL write failed');
    }
  };

  // Pull database state from Cloud SQL
  const triggerSyncDownload = async () => {
    if (!auth.currentUser) {
      alert("Please sign in first to fetch cloud data.");
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      alert("You are currently offline. Please restore your connection to fetch cloud backups.");
      return;
    }

    if (window.confirm("Restore from Cloud:\nThis will replace your current local browser attendance data with the synced database saved securely in Cloud SQL. Do you want to proceed?")) {
      setSyncStatus('syncing');
      setSyncErrorMsg(null);

      try {
        const token = await auth.currentUser.getIdToken();
        const response = await fetch('/api/sync', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Server download failed');
        }

        const data = await response.json();
        
        if (Array.isArray(data.participants) && Array.isArray(data.sessions) && typeof data.attendance === 'object') {
          const seen = new Set<string>();
          const uniqueParticipants = data.participants.filter(p => {
            if (!p || !p.id || seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          });

          setParticipants(uniqueParticipants);
          setSessions(data.sessions);
          setAttendance(data.attendance);

          if (Array.isArray(data.emailedSessionDates)) {
            setEmailedSessionDates(data.emailedSessionDates);
            localStorage.setItem('attendance_tracker_emailed_session_dates', JSON.stringify(data.emailedSessionDates));
          }
          if (Array.isArray(data.dismissedEmailDates)) {
            setDismissedEmailDates(data.dismissedEmailDates);
            localStorage.setItem('attendance_tracker_dismissed_email_dates', JSON.stringify(data.dismissedEmailDates));
          }
          if (data.lastEmailedSessionDate) {
            setLastEmailedSessionDate(data.lastEmailedSessionDate);
            localStorage.setItem('attendance_tracker_last_emailed_session_date', data.lastEmailedSessionDate);
          }
          if (data.staffEmailRecipient) {
            setStaffEmailRecipient(data.staffEmailRecipient);
            localStorage.setItem('attendance_tracker_staff_email_recipient', data.staffEmailRecipient);
          }
          if (typeof data.isAutomaticEmailEnabled === 'boolean') {
            setIsAutomaticEmailEnabled(data.isAutomaticEmailEnabled);
            localStorage.setItem('attendance_tracker_auto_email_enabled', String(data.isAutomaticEmailEnabled));
          }

          if (Array.isArray(data.staffTasks)) {
            setStaffTasks(data.staffTasks);
            localStorage.setItem('attendance_tracker_staff_tasks', JSON.stringify(data.staffTasks));
          }
          if (data.complianceStatus) {
            setComplianceStatus(data.complianceStatus);
            localStorage.setItem('attendance_tracker_compliance_status', JSON.stringify(data.complianceStatus));
          }

          // Save pulled values to local cache
          localStorage.setItem('attendance_tracker_participants', JSON.stringify(uniqueParticipants));
          localStorage.setItem('attendance_tracker_sessions', JSON.stringify(data.sessions));
          localStorage.setItem('attendance_tracker_records', JSON.stringify(data.attendance));

          setSyncStatus('synced');
          setHasPendingUnsavedChanges(false);
          localStorage.setItem('attendance_tracker_unsynced_changes', 'false');

          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString();
          setLastSyncTime(nowStr);
          localStorage.setItem('attendance_tracker_last_sync_time', nowStr);
          
          alert("Success! Your device data is fully synced and updated from major cloud SQL records.");
        } else {
          // If no remote backup exists yet, upload local data as initial seed
          alert("No cloud-side database was found yet. Uploading your current browser database as the initial cloud backup standard.");
          await triggerSyncUpload();
        }
      } catch (err: any) {
        console.error("Cloud-first restore download failing:", err);
        setSyncStatus('error');
        setSyncErrorMsg(err.message || 'REST download failed');
        alert("Failed to restore cloud database: " + err.message);
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
    warnings?: string[];
    importChecked: boolean;
    idNo?: string;
    age?: string;
    village?: string;
    caregiver?: string;
    gender?: string;
    schoolingStatus?: string;
    schoolClass?: string;
  }[]>([]);
  const [manualHeaderMapping, setManualHeaderMapping] = useState<Record<string, number>>({
    name: 0,
    idNo: -1,
    age: -1,
    gender: -1,
    village: -1,
    caregiver: -1,
    cohort: -1,
    contact: -1,
    notes: -1,
    schoolingStatus: -1,
    schoolClass: -1
  });
  const [detectedHeadersList, setDetectedHeadersList] = useState<string[]>([]);
  const [rawCSVRows, setRawCSVRows] = useState<string[][]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [importTab, setImportTab] = useState<'paste' | 'file' | 'google-forms'>('paste');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importStrategy, setImportStrategy] = useState<'upsert' | 'create'>('upsert');

  // Google Forms Integration States
  const [googleFormUrlOrId, setGoogleFormUrlOrId] = useState('');
  const [googleFormsList, setGoogleFormsList] = useState<{ id: string; name: string }[]>([]);
  const [selectedGoogleFormId, setSelectedGoogleFormId] = useState('');
  const [googleFormTitle, setGoogleFormTitle] = useState('');
  const [googleFormQuestions, setGoogleFormQuestions] = useState<{ questionId: string; title: string; type: string }[]>([]);
  const [googleFormResponses, setGoogleFormResponses] = useState<any[]>([]);
  const [googleFormImportMapping, setGoogleFormImportMapping] = useState<Record<string, string>>({
    name: '',
    idNo: '',
    age: '',
    gender: '',
    village: '',
    caregiver: '',
    cohort: '',
    contact: '',
    notes: '',
    schoolingStatus: '',
    schoolClass: ''
  });
  const [googleFormLoading, setGoogleFormLoading] = useState(false);
  const [googleFormStatusText, setGoogleFormStatusText] = useState('');
  const [googleFormError, setGoogleFormError] = useState<string | null>(null);

  // ---- QUICK-LOG ATTENDANCE INTERVENTION STATE ----
  const [quickLogParticipantId, setQuickLogParticipantId] = useState<string | null>(null);
  const [quickLogNotes, setQuickLogNotes] = useState('');
  const [quickLogBy, setQuickLogBy] = useState('');
  const [quickLogStatus, setQuickLogStatus] = useState<'pending' | 'contacted' | 'resolved'>('contacted');

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
      const dateRange = { start: aiReportStartDate, end: aiReportEndDate };
      
      let filteredSessions = sessions;
      if (aiReportStartDate) filteredSessions = filteredSessions.filter(s => s.date >= aiReportStartDate);
      if (aiReportEndDate) filteredSessions = filteredSessions.filter(s => s.date <= aiReportEndDate);
      
      const filteredStats = calculateParticipantStats(participant.id, filteredSessions, attendance);

      // Extract recent session-by-session records for the AI to analyze chronic patterns/trends
      const attendanceHistory = [...filteredSessions]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(s => ({
          date: s.date,
          label: s.label || "Regular Session",
          status: (attendance[participant.id] || {})[s.date] || 'unmarked'
        }));

      const response = await fetch('/api/gemini/analyze-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant, stats: filteredStats, dateRange, attendanceHistory })
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

  const [aiReportStartDate, setAiReportStartDate] = useState('');
  const [aiReportEndDate, setAiReportEndDate] = useState('');

  const generateCohortAIReport = async () => {
    setAiReportLoading(true);
    setAiError(null);
    try {
      let filteredSessions = sessions;
      if (aiReportStartDate) filteredSessions = filteredSessions.filter(s => s.date >= aiReportStartDate);
      if (aiReportEndDate) filteredSessions = filteredSessions.filter(s => s.date <= aiReportEndDate);

      const customStatsMap: Record<string, AttendanceStats> = {};
      activeParticipants.forEach(p => {
        customStatsMap[p.id] = calculateParticipantStats(p.id, filteredSessions, attendance);
      });

      // Compute system-wide stats in detail on client
      const activeList = activeParticipants;
      const total = activeList.length;
      let computedStatsPayload = null;
      if (total > 0) {
        const cohortData: Record<string, { count: number; sumAttendance: number; redFlags: number; totalScores: number; countScores: number }> = {};
        const villageData: Record<string, { count: number; sumAttendance: number; redFlags: number }> = {};
        const genderData: Record<string, { count: number; sumAttendance: number; redFlags: number; totalScores: number; countScores: number }> = {};
        const schoolingData: Record<string, { count: number; sumAttendance: number; totalScores: number; countScores: number }> = {};

        activeList.forEach(p => {
          const stats = customStatsMap[p.id] || { attendanceRate: 100, hasRedFlag: false };
          const attendanceVal = stats.attendanceRate;

          const schoolForm = p.scannedForms?.find(f => f.formType === 'school')?.extractedData?.school;
          const scoreVal = schoolForm?.averageScorePercentage;

          const c = p.cohort || 'General';
          if (!cohortData[c]) cohortData[c] = { count: 0, sumAttendance: 0, redFlags: 0, totalScores: 0, countScores: 0 };
          cohortData[c].count += 1;
          cohortData[c].sumAttendance += attendanceVal;
          if (stats.hasRedFlag) cohortData[c].redFlags += 1;
          if (typeof scoreVal === 'number') {
            cohortData[c].totalScores += scoreVal;
            cohortData[c].countScores += 1;
          }

          const v = p.village || 'Other';
          if (!villageData[v]) villageData[v] = { count: 0, sumAttendance: 0, redFlags: 0 };
          villageData[v].count += 1;
          villageData[v].sumAttendance += attendanceVal;
          if (stats.hasRedFlag) villageData[v].redFlags += 1;

          const g = p.gender || 'N/A';
          if (!genderData[g]) genderData[g] = { count: 0, sumAttendance: 0, redFlags: 0, totalScores: 0, countScores: 0 };
          genderData[g].count += 1;
          genderData[g].sumAttendance += attendanceVal;
          if (stats.hasRedFlag) genderData[g].redFlags += 1;
          if (typeof scoreVal === 'number') {
            genderData[g].totalScores += scoreVal;
            genderData[g].countScores += 1;
          }

          const s = p.schoolingStatus || 'Not Specified';
          if (!schoolingData[s]) schoolingData[s] = { count: 0, sumAttendance: 0, totalScores: 0, countScores: 0 };
          schoolingData[s].count += 1;
          schoolingData[s].sumAttendance += attendanceVal;
          if (typeof scoreVal === 'number') {
            schoolingData[s].totalScores += scoreVal;
            schoolingData[s].countScores += 1;
          }
        });

        computedStatsPayload = {
          totalParticipants: total,
          cohortsBreakdown: Object.entries(cohortData).map(([name, d]) => ({
            cohort: name,
            count: d.count,
            averageAttendance: Math.round(d.sumAttendance / d.count),
            redFlagsCount: d.redFlags,
            averageAcademicScore: d.countScores > 0 ? Math.round(d.totalScores / d.countScores) : null
          })),
          villagesBreakdown: Object.entries(villageData).map(([name, d]) => ({
            village: name,
            count: d.count,
            averageAttendance: Math.round(d.sumAttendance / d.count),
            redFlagsCount: d.redFlags
          })),
          gendersBreakdown: Object.entries(genderData).map(([name, d]) => ({
            gender: name,
            count: d.count,
            averageAttendance: Math.round(d.sumAttendance / d.count),
            redFlagsCount: d.redFlags,
            averageAcademicScore: d.countScores > 0 ? Math.round(d.totalScores / d.countScores) : null
          })),
          schoolingBreakdown: Object.entries(schoolingData).map(([name, d]) => ({
            schoolingStatus: name,
            count: d.count,
            averageAttendance: Math.round(d.sumAttendance / d.count),
            averageAcademicScore: d.countScores > 0 ? Math.round(d.totalScores / d.countScores) : null
          }))
        };
      }

      const response = await fetch('/api/gemini/analyze-cohort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          participants: activeParticipants, 
          statsMap: customStatsMap, 
          dateRange: { start: aiReportStartDate, end: aiReportEndDate },
          computedStats: computedStatsPayload,
          attendance,
          sessions
        })
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

  useEffect(() => {
    localStorage.setItem('attendance_tracker_budgets', JSON.stringify(budgets));
  }, [budgets]);

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
            const seen = new Set<string>();
            const uniqueParticipants = data.participants.filter(p => {
              if (!p || !p.id || seen.has(p.id)) return false;
              seen.add(p.id);
              return true;
            });

            setParticipants(uniqueParticipants);
            setSessions(data.sessions);
            setAttendance(data.attendance);

            if (Array.isArray(data.emailedSessionDates)) {
              setEmailedSessionDates(data.emailedSessionDates);
              localStorage.setItem('attendance_tracker_emailed_session_dates', JSON.stringify(data.emailedSessionDates));
            }
            if (Array.isArray(data.dismissedEmailDates)) {
              setDismissedEmailDates(data.dismissedEmailDates);
              localStorage.setItem('attendance_tracker_dismissed_email_dates', JSON.stringify(data.dismissedEmailDates));
            }
            if (data.lastEmailedSessionDate) {
              setLastEmailedSessionDate(data.lastEmailedSessionDate);
              localStorage.setItem('attendance_tracker_last_emailed_session_date', data.lastEmailedSessionDate);
            }
            if (data.staffEmailRecipient) {
              setStaffEmailRecipient(data.staffEmailRecipient);
              localStorage.setItem('attendance_tracker_staff_email_recipient', data.staffEmailRecipient);
            }
            if (typeof data.isAutomaticEmailEnabled === 'boolean') {
              setIsAutomaticEmailEnabled(data.isAutomaticEmailEnabled);
              localStorage.setItem('attendance_tracker_auto_email_enabled', String(data.isAutomaticEmailEnabled));
            }

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
            emailedSessionDates,
            dismissedEmailDates,
            lastEmailedSessionDate,
            staffEmailRecipient,
            isAutomaticEmailEnabled,
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
        const errMsg = err?.message || '';
        const isOffline = errMsg.toLowerCase().includes('offline') || !navigator.onLine;
        
        if (isOffline) {
          console.warn("[Firebase Login Sync] Client is offline, bypassing auto-sync and continuing with local state:", err);
          setSyncStatus('offline');
        } else {
          console.error("Failed to automatically synchronize user records on log in:", err);
          setSyncStatus('error');
          setSyncErrorMsg("Cloud database connection lost or restricted");
        }
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

  const uniqueVillages = useMemo(() => {
    const villagesSet = new Set<string>();
    activeParticipants.forEach(p => {
      if (p.village) {
        const trimmed = p.village.trim();
        const baseLower = trimmed.toLowerCase();
        if (
          trimmed && 
          trimmed !== '-' && 
          baseLower !== 'n/a' && 
          baseLower !== 'na' && 
          baseLower !== 'none' && 
          baseLower !== 'null' && 
          baseLower !== 'undefined' &&
          baseLower !== 'all villages' &&
          baseLower !== 'all'
        ) {
          const formatted = trimmed
            .split(/\s+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
          
          if (formatted) {
            villagesSet.add(formatted);
          }
        }
      }
    });
    return Array.from(villagesSet).sort();
  }, [activeParticipants]);

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

  useEffect(() => {
    if (sessions && sessions.length > 0 && !gallerySelectedSessionDate) {
      setGallerySelectedSessionDate(sessions[sessions.length - 1].date);
    }
  }, [sessions, gallerySelectedSessionDate]);

  const galleryFilteredParticipants = useMemo(() => {
    return activeParticipants.filter(p => {
      // 1. Search Query
      if (gallerySearchQuery.trim()) {
        const query = gallerySearchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(query);
        const matchesId = p.idNo && p.idNo.toLowerCase().includes(query);
        const matchesCode = p.id && p.id.toLowerCase().includes(query);
        if (!matchesName && !matchesId && !matchesCode) {
          return false;
        }
      }

      // 2. Cohort Filter
      if (gallerySelectedCohort !== 'All Cohorts') {
        if (p.cohort !== gallerySelectedCohort) {
          return false;
        }
      }

      // 3. Village Filter
      if (gallerySelectedVillage !== 'All Villages') {
        if (!p.village || p.village.trim().toLowerCase() !== gallerySelectedVillage.trim().toLowerCase()) {
          return false;
        }
      }

      // 4. Status Filter
      if (galleryStatusFilter !== 'all') {
        const sessionDate = gallerySelectedSessionDate || (sessions[sessions.length - 1]?.date || '');
        const currentStatus = (attendance[p.id] && attendance[p.id][sessionDate]) || 'unmarked';
        if (currentStatus !== galleryStatusFilter) {
          return false;
        }
      }

      return true;
    });
  }, [activeParticipants, gallerySearchQuery, gallerySelectedCohort, gallerySelectedVillage, galleryStatusFilter, gallerySelectedSessionDate, attendance, sessions]);

  const galleryStatsForSelectedSession = useMemo(() => {
    const sessionDate = gallerySelectedSessionDate || (sessions[sessions.length - 1]?.date || '');
    let present = 0;
    let absent = 0;
    let excused = 0;
    let unmarked = 0;

    activeParticipants.forEach(p => {
      const status = (attendance[p.id] && attendance[p.id][sessionDate]) || 'unmarked';
      if (status === 'present') present++;
      else if (status === 'absent') absent++;
      else if (status === 'excused') excused++;
      else unmarked++;
    });

    return { present, absent, excused, unmarked, total: activeParticipants.length };
  }, [activeParticipants, gallerySelectedSessionDate, attendance, sessions]);

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

  const currentSessionObj = sessions.find(s => s.date === selectedSessionDate) || null;
  const currentSessionStats = useMemo(() => {
    if (!currentSessionObj) return null;
    let present = 0;
    let absent = 0;
    let excused = 0;
    activeParticipants.forEach(p => {
      const status = attendance[p.id]?.[currentSessionObj.date];
      if (status === 'present') present++;
      if (status === 'absent') absent++;
      if (status === 'excused') excused++;
    });
    const total = present + absent + excused;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    return { present, absent, excused, rate };
  }, [currentSessionObj, activeParticipants, attendance]);
  
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
    
    if (!force && (lastEmailedSessionDate === sessionDate || emailedSessionDates.includes(sessionDate))) {
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
      
      const updatedEmailed = emailedSessionDates.includes(sessionDate) ? emailedSessionDates : [...emailedSessionDates, sessionDate];
      setEmailedSessionDates(updatedEmailed);
      localStorage.setItem('attendance_tracker_emailed_session_dates', JSON.stringify(updatedEmailed));
      
      // Persist the dispatch state to Firestore securely
      setTimeout(() => {
        triggerSyncUpload();
      }, 100);
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

  // Identify if there's any fully completed session that hasn't been emailed or dismissed yet
  const firstUnemailedFullyMarkedSession = (() => {
    if (activeParticipants.length === 0 || sessions.length === 0) return null;
    
    // Find all sessions that are completely marked (each active participant status is filled and not unmarked)
    const completed = sessions.filter(s => {
      return activeParticipants.every(p => {
        const status = attendance[p.id]?.[s.date];
        return status && status !== 'unmarked';
      });
    });
    
    // Find first completed session that is NOT emailed AND NOT dismissed
    return completed.find(s => !emailedSessionDates.includes(s.date) && !dismissedEmailDates.includes(s.date)) || null;
  })();

  // Dismiss a complete session from the reminder prompts
  const dismissEmailAlertPrompt = (sessionDate: string) => {
    setDismissedEmailDates(prev => {
      const updated = prev.includes(sessionDate) ? prev : [...prev, sessionDate];
      localStorage.setItem('attendance_tracker_dismissed_email_dates', JSON.stringify(updated));
      
      // Sync dismissed states to Firestore
      setTimeout(() => {
        triggerSyncUpload();
      }, 100);
      return updated;
    });
  };

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
        .map(cell => cell.trim().replace(/^["']|["']$/g, '').trim());
    }).filter(row => row.some(cell => cell !== ''));

    const matchedIds = new Set<string>();
    if (rows.length === 0) {
      return { matchedIds, parsedRowsCount: 0 };
    }

    // Attempt to recognize a header row
    const firstRowLower = rows[0].map(c => c.toLowerCase());
    const hasHeader = firstRowLower.some(c => c.includes('status') || c.includes('attendance') || c.includes('id') || c.includes('name'));

    let idColIdx = -1;
    let nameColIdx = -1;
    let statusColIdx = -1;

    if (hasHeader) {
      firstRowLower.forEach((col, idx) => {
        if (col.includes('id') || col.includes('id no') || col === 'id') {
          idColIdx = idx;
        } else if (col.includes('name') || col.includes('student')) {
          nameColIdx = idx;
        } else if (col.includes('status') || col.includes('attendance') || col.includes('present')) {
          statusColIdx = idx;
        }
      });
    }

    // If we have a structured header and can find a status column, perform precise lookup:
    if (hasHeader && statusColIdx !== -1) {
      const dataRows = rows.slice(1);
      
      activeParticipants.forEach(p => {
        const matchedRow = dataRows.find(row => {
          // Try id match
          if (idColIdx !== -1 && row[idColIdx]) {
            const rowId = row[idColIdx].toLowerCase();
            if (p.idNo && p.idNo.toLowerCase() === rowId) return true;
            if (p.id.toLowerCase() === rowId) return true;
          }
          // Try name match
          if (nameColIdx !== -1 && row[nameColIdx]) {
            const rowName = row[nameColIdx].toLowerCase();
            if (p.name.toLowerCase() === rowName) return true;
            if (rowName.length >= 3 && p.name.toLowerCase().includes(rowName)) return true;
            if (rowName.length >= 3 && rowName.includes(p.name.toLowerCase())) return true;
          }
          // Fallback if neither matches directly or columns aren't quite aligned
          if (idColIdx === -1 && nameColIdx === -1) {
            return row.some((cell, cellIdx) => {
              if (cellIdx === statusColIdx) return false; // don't match on status cell
              const lowerCell = cell.toLowerCase();
              if (p.name.toLowerCase() === lowerCell) return true;
              if (p.contact && p.contact !== '-' && p.contact.toLowerCase() === lowerCell) return true;
              if (p.idNo && p.idNo !== '-' && p.idNo.toLowerCase() === lowerCell) return true;
              if (p.id === cell) return true;
              return false;
            });
          }
          return false;
        });

        if (matchedRow) {
          const statusVal = matchedRow[statusColIdx] ? matchedRow[statusColIdx].toLowerCase() : '';
          const isPresent = statusVal.includes('present') || 
                            statusVal === 'p' || 
                            statusVal === '1' || 
                            statusVal === 'yes' || 
                            statusVal === 'true' ||
                            statusVal === 'checked' ||
                            statusVal === 'attended';
          if (isPresent) {
            matchedIds.add(p.id);
          }
        }
      });

      return { matchedIds, parsedRowsCount: dataRows.length };
    }

    // Fallback: Loose scan/paste list where any mention equals PRESENT
    const parseRows = hasHeader ? rows.slice(1) : rows;
    activeParticipants.forEach(p => {
      const hasMatch = parseRows.some(row => {
        return row.some(cell => {
          const lowerCell = cell.toLowerCase();
          if (p.name.toLowerCase() === lowerCell) return true;
          if (lowerCell.length >= 3 && p.name.toLowerCase().includes(lowerCell)) return true;
          if (lowerCell.length >= 3 && lowerCell.includes(p.name.toLowerCase())) return true;
          if (p.contact && p.contact !== '-' && p.contact.toLowerCase() === lowerCell) return true;
          if (p.idNo && p.idNo !== '-' && p.idNo.toLowerCase() === lowerCell) return true;
          if (p.id === cell) return true;
          return false;
        });
      });

      if (hasMatch) {
        matchedIds.add(p.id);
      }
    });

    return { matchedIds, parsedRowsCount: parseRows.length };
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

  // ---- COMPUTE COHORT 7-DAY ROLLING ATTENDANCE TREND ----
  const cohortRollingTrendData = useMemo(() => {
    const sorted = [...filteredSessionsForAnalytics].sort((sa, sb) => sa.date.localeCompare(sb.date));
    
    const targetCohort = selectedCohort || 'All Cohorts';
    const cohortParticipants = targetCohort === 'All Cohorts' 
      ? participants 
      : participants.filter(p => p.cohort === targetCohort);

    if (cohortParticipants.length === 0 || sorted.length === 0) {
      return [];
    }

    return sorted.map((session) => {
      // Find all session dates within [session.date - 6 days, session.date]
      const currentDate = new Date(session.date);
      const startDate = new Date(currentDate);
      startDate.setDate(startDate.getDate() - 6);

      const sessionsInWindow = sorted.filter(s => {
        const sDate = new Date(s.date);
        return sDate >= startDate && sDate <= currentDate;
      });

      let rollingPresentExcused = 0;
      let rollingMarked = 0;

      sessionsInWindow.forEach(s => {
        cohortParticipants.forEach(p => {
          const status = attendance[p.id]?.[s.date] || 'unmarked';
          if (status === 'present' || status === 'excused') {
            rollingPresentExcused++;
          }
          if (status === 'present' || status === 'excused' || status === 'absent') {
            rollingMarked++;
          }
        });
      });

      const rollingAverage = rollingMarked > 0 
        ? Math.round((rollingPresentExcused / rollingMarked) * 100) 
        : 0;

      // Calculate single session cohort average as well
      let singlePresentExcused = 0;
      let singleMarked = 0;
      cohortParticipants.forEach(p => {
        const status = attendance[p.id]?.[session.date] || 'unmarked';
        if (status === 'present' || status === 'excused') {
          singlePresentExcused++;
        }
        if (status === 'present' || status === 'excused' || status === 'absent') {
          singleMarked++;
        }
      });

      const singleSessionRate = singleMarked > 0 
        ? Math.round((singlePresentExcused / singleMarked) * 100) 
        : 0;

      return {
        date: session.date,
        shortDate: formatToShortDayMonth(session.date),
        label: session.label || 'Session',
        singleSessionRate,
        rollingAverage,
        sessionsInWindowCount: sessionsInWindow.length,
      };
    });
  }, [filteredSessionsForAnalytics, participants, attendance, selectedCohort]);

  // ---- CSV DOWNLOAD FOR ROLLING ATTENDANCE TREND ----
  const handleDownloadRollingCSV = () => {
    if (cohortRollingTrendData.length === 0) return;
    
    const targetCohort = selectedCohort || 'All Cohorts';
    const csvRows = [
      ['Date', 'Session Label', 'Daily Session Rate (%)', '7-Day Rolling Average (%)', 'Sessions in Window Count'],
      ...cohortRollingTrendData.map(item => [
        item.date,
        item.label,
        `${item.singleSessionRate}%`,
        `${item.rollingAverage}%`,
        item.sessionsInWindowCount
      ])
    ];

    const csvContent = csvRows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    
    const cleanDate = new Date().toISOString().split('T')[0];
    const filename = `rolling_attendance_${targetCohort.replace(/\s+/g, '_').toLowerCase()}_${cleanDate}.csv`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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

  // Dynamically compute the list of distinct years for filter dropdowns
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    // Pre-populate standard registration / birth range for defaults
    const currentYear = new Date().getFullYear();
    for (let yr = 2012; yr <= currentYear + 1; yr++) {
      yearsSet.add(yr);
    }
    // Gather any other custom years from participants to make sure they are on the list
    participants.forEach(p => {
      if (p.joinDate) {
        const joinYear = parseInt(p.joinDate.split('-')[0], 10);
        if (!isNaN(joinYear) && joinYear > 1900) yearsSet.add(joinYear);
      }
      if (p.dob) {
        const dobYear = parseInt(p.dob.split('-')[0], 10);
        if (!isNaN(dobYear) && dobYear > 1900) yearsSet.add(dobYear);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a); // descending order
  }, [participants]);

  // Derived active age bracket ID if custom selection matches one of the presets
  const derivedAgeBracket = useMemo(() => {
    const match = AGE_BRACKETS.find(b => b.min === filterAgeStart && b.max === filterAgeEnd);
    return match ? match.id : (filterAgeStart || filterAgeEnd ? 'custom' : 'all');
  }, [filterAgeStart, filterAgeEnd]);

  // ---- FILTERING LOGIC ----
  const filteredParticipants = activeParticipants.filter(part => {
    const matchesSearch = 
      part.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (part.idNo && part.idNo.toLowerCase().includes(searchQuery.toLowerCase())) ||
      part.contact.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCohort = selectedCohort === 'All Cohorts' || part.cohort === selectedCohort;
    const matchesVillage = (() => {
      if (selectedVillage === 'All Villages') return true;
      if (!part.village) return false;
      const vTrimmed = part.village.trim();
      const formatted = vTrimmed
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      return formatted === selectedVillage;
    })();
    const matchesSchoolingStatus = selectedSchoolingStatus === 'All' || part.schoolingStatus === selectedSchoolingStatus;
    const matchesSchoolClass = selectedSchoolClass === 'All' 
                            || (part.schoolClass ? part.schoolClass.toLowerCase().includes(selectedSchoolClass.toLowerCase()) : false)
                            || (selectedSchoolClass === 'Unassigned' && (!part.schoolClass || part.schoolClass === ''));
    
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

    const matchesYearRange = (() => {
      if (!filterYearStart && !filterYearEnd) return true;
      let yr = NaN;
      if (filterYearType === 'join') {
        if (part.joinDate) {
          yr = parseInt(part.joinDate.split('-')[0], 10);
        }
      } else if (filterYearType === 'dob') {
        if (part.dob) {
          yr = parseInt(part.dob.split('-')[0], 10);
        } else if (part.age) {
          const parsedAge = parseInt(part.age, 10);
          if (!isNaN(parsedAge)) {
            yr = new Date().getFullYear() - parsedAge;
          }
        }
      }
      
      if (isNaN(yr)) return false;
      
      const start = filterYearStart ? parseInt(filterYearStart, 10) : -Infinity;
      const end = filterYearEnd ? parseInt(filterYearEnd, 10) : Infinity;
      
      // Check if within bounds (inclusive)
      return yr >= start && yr <= end;
    })();

    const matchesAgeRange = (() => {
      if (!filterAgeStart && !filterAgeEnd) return true;
      const ageStr = part.dob ? calculateAgeFromDob(part.dob) : part.age;
      const ageNum = ageStr ? parseInt(ageStr, 10) : NaN;
      if (isNaN(ageNum)) return false;
      const start = filterAgeStart ? parseInt(filterAgeStart, 10) : -Infinity;
      const end = filterAgeEnd ? parseInt(filterAgeEnd, 10) : Infinity;
      return ageNum >= start && ageNum <= end;
    })();

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

    return matchesSearch && matchesCohort && matchesVillage && matchesSegment && matchesFlag && matchesSchoolingStatus && matchesSchoolClass && matchesYearRange && matchesAgeRange;
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
    if (!isAdminMode) {
      alert("Oops! Accidental alteration prevented. Please unlock Admin Mode to edit attendance markings.");
      return;
    }
    const student = participants.find(p => p.id === participantId);
    const studentName = student ? student.name : 'Candidate';
    let targetOld: AttendanceStatus = 'unmarked';
    let targetNext: AttendanceStatus = 'present';

    setAttendance(prev => {
      const currentRecord = prev[participantId] || {};
      const currentStatusValue: AttendanceStatus = currentRecord[dateStr] || 'unmarked';
      targetOld = currentStatusValue;
      
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
      targetNext = nextStatus;

      return {
        ...prev,
        [participantId]: {
          ...currentRecord,
          [dateStr]: nextStatus
        }
      };
    });
    const opTrace = operatorName.trim() ? `${operatorName.trim()} (Admin)` : 'Unlocked Administrator';
    logSystemAction(
      'audit',
      'Attendance Manually Altered',
      `Manual toggle for student "${studentName}" on session ${dateStr}: changed status from ${targetOld.toUpperCase()} to ${targetNext.toUpperCase()}.`,
      opTrace
    );
  };

  // Specific assignment function for dropdown/select switching
  const setSpecificAttendance = (participantId: string, dateStr: string, status: AttendanceStatus) => {
    if (!isAdminMode) {
      alert("Oops! Accidental alteration prevented. Please unlock Admin Mode to edit attendance markings.");
      return;
    }
    const student = participants.find(p => p.id === participantId);
    const studentName = student ? student.name : 'Candidate';
    let targetOld: AttendanceStatus = 'unmarked';

    setAttendance(prev => {
      const currentRecord = prev[participantId] || {};
      targetOld = currentRecord[dateStr] || 'unmarked';
      return {
        ...prev,
        [participantId]: {
          ...currentRecord,
          [dateStr]: status
        }
      };
    });
    const opTrace = operatorName.trim() ? `${operatorName.trim()} (Admin)` : 'Unlocked Administrator';
    logSystemAction(
      'audit',
      'Attendance Manually Altered',
      `Manual change for student "${studentName}" on session ${dateStr}: explicitly assigned status ${status.toUpperCase()} (was ${targetOld.toUpperCase()}).`,
      opTrace
    );
  };

  // Bulk set attendance for all displayed participants
  const handleBulkSetAttendance = (status: 'present' | 'absent') => {
    if (!isAdminMode) {
      alert("Oops! Please unlock Admin Mode first to perform bulk session modifications.");
      return;
    }
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
    const opTrace = operatorName.trim() ? `${operatorName.trim()} (Admin)` : 'Unlocked Administrator';
    logSystemAction(
      'audit',
      'Bulk Attendance Altered',
      `Batch overwrite applied to all ${filteredParticipants.length} students: forced status to ${status.toUpperCase()} for session ${targetDate}.`,
      opTrace
    );
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
      gender: newPartGender.trim() || '-',
      schoolingStatus: newPartSchoolingStatus.trim() || 'Day Scholar',
      schoolClass: newPartSchoolClass.trim() || '-',
    };

    setParticipants(prev => [...prev, newParticipant]);
    logSystemAction('transaction', 'Student Registered', `Enrolled participant [${newParticipant.name}] (ID: ${newParticipant.idNo}) into cohort group "${newParticipant.cohort}".`);
    
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
    setNewPartSchoolingStatus('Day Scholar');
    setNewPartSchoolClass('');
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
      id: `l_${Date.now()}_${Math.floor(Math.random() * 1000000)}`,
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

  // Quick Action Low Attendance Outreach Logging
  const handleQuickLogSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!quickLogParticipantId || !quickLogNotes.trim()) return;

    const newLog: OutreachLog = {
      id: `l_ql_${Date.now()}_${Math.floor(Math.random() * 1000000)}`,
      date: new Date().toISOString().split('T')[0],
      status: quickLogStatus,
      notes: quickLogNotes.trim(),
      loggedBy: quickLogBy.trim() || 'Staff/Educator (Quick)'
    };

    setParticipants(prev => prev.map(p => {
      if (p.id === quickLogParticipantId) {
        return {
          ...p,
          outreachNotes: [newLog, ...(p.outreachNotes || [])]
        };
      }
      return p;
    }));

    setQuickLogParticipantId(null);
    setQuickLogNotes('');
    setQuickLogBy('');
    setQuickLogStatus('contacted');
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

  // Helper to find a matching participant
  const findMatchingParticipant = (pData: { name: string; idNo?: string; contact?: string }) => {
    const normName = pData.name ? pData.name.trim().toLowerCase() : '';
    const normId = pData.idNo && pData.idNo !== '-' && pData.idNo !== '' ? pData.idNo.trim().toLowerCase() : '';
    const normPhone = pData.contact && pData.contact !== '-' && pData.contact !== '' ? pData.contact.trim().toLowerCase() : '';

    return participants.find(p => {
      if (normId && p.idNo && p.idNo !== '-' && p.idNo.trim().toLowerCase() === normId) {
        return true;
      }
      if (normPhone && p.contact && p.contact !== '-' && p.contact.trim().toLowerCase() === normPhone) {
        return true;
      }
      if (normName && p.name && p.name.trim().toLowerCase() === normName) {
        return true;
      }
      return false;
    });
  };

  // Google Forms Integration Handlers
  const extractGoogleFormId = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return '';
    if (trimmed.includes('docs.google.com/forms')) {
      const match = trimmed.match(/\/forms\/d\/(e\/)?([^/]+)/);
      if (match && match[2]) {
        return match[2];
      }
    }
    return trimmed;
  };

  const handleBrowseGoogleForms = async (customToken?: string) => {
    setGoogleFormLoading(true);
    setGoogleFormError(null);
    setGoogleFormStatusText('Browsing form files in your Google Drive...');
    try {
      let token = customToken || googleAccessToken;
      if (!token) {
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        token = credential?.accessToken || null;
        if (token) {
          setGoogleAccessToken(token);
        } else {
          throw new Error("Unable to obtain authorization token.");
        }
      }

      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.form'&orderBy=modifiedTime desc&pageSize=50",
         {
           headers: {
             Authorization: `Bearer ${token}`
           }
         }
      );

      if (!response.ok) {
        if (response.status === 401) {
          setGoogleAccessToken(null);
          throw new Error("Google access expired. Please sign in again.");
        }
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Drive service returned status ${response.status}`);
      }

      const data = await response.json();
      const files = (data.files || []).map((f: any) => ({
        id: f.id,
        name: f.name || 'Untitled Google Form'
      }));
      setGoogleFormsList(files);
      setGoogleFormStatusText(`Successfully retrieved ${files.length} Forms from Google Drive.`);
    } catch (err: any) {
      console.error("Browse forms error:", err);
      setGoogleFormError(err.message || 'Unknown error while listing Google Forms.');
    } finally {
      setGoogleFormLoading(false);
    }
  };

  const handleFetchGoogleFormStructureAndResponses = async (rawFormIdOrUrl: string, customToken?: string) => {
    const formId = extractGoogleFormId(rawFormIdOrUrl);
    if (!formId) {
      setGoogleFormError("Please enter or select a valid Google Form ID or Google Form URL.");
      return;
    }
    setGoogleFormLoading(true);
    setGoogleFormError(null);
    setGoogleFormStatusText('Fetching Form structure and query schemas...');
    try {
      let token = customToken || googleAccessToken;
      if (!token) {
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        token = credential?.accessToken || null;
        if (token) {
          setGoogleAccessToken(token);
        } else {
          throw new Error("Unable to obtain Google Form authentication token.");
        }
      }

      // 1. Fetch Form Structure
      const schemaRes = await fetch(`https://forms.googleapis.com/v1/forms/${formId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!schemaRes.ok) {
        const errData = await schemaRes.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Failed to fetch form details (Status ${schemaRes.status}). Verify Form ID and permissions.`);
      }

      const schemaData = await schemaRes.json();
      setGoogleFormTitle(schemaData.info?.title || schemaData.info?.documentTitle || 'Untitled Form');

      // Parse questions
      const questions: any[] = [];
      if (schemaData.items && Array.isArray(schemaData.items)) {
        schemaData.items.forEach((item: any) => {
          if (item.questionItem && item.questionItem.question) {
            const q = item.questionItem.question;
            questions.push({
              questionId: q.questionId,
              title: item.title || q.title || `Question ID: ${q.questionId}`,
              type: q.textQuestion ? 'text' : q.choiceQuestion ? 'choice' : 'other'
            });
          } else if (item.questionGroupItem && Array.isArray(item.questionGroupItem.questions)) {
            item.questionGroupItem.questions.forEach((q: any) => {
              questions.push({
                questionId: q.questionId,
                title: `${item.title || ''} - ${q.title || `Question ID: ${q.questionId}`}`.trim(),
                type: q.textQuestion ? 'text' : q.choiceQuestion ? 'choice' : 'other'
              });
            });
          }
        });
      }

      setGoogleFormQuestions(questions);

      // Guess Auto-Mapping based on field name matches
      const autoMapping = {
        name: '',
        idNo: '',
        age: '',
        gender: '',
        village: '',
        caregiver: '',
        cohort: '',
        contact: '',
        notes: '',
        schoolingStatus: '',
        schoolClass: ''
      };
      
      questions.forEach(q => {
        const text = q.title.toLowerCase();
        if (text.includes('name') || text.includes('full name') || text.includes('jina') || text.includes('mwanafunzi')) {
          if (!autoMapping.name) autoMapping.name = q.questionId;
        } else if (text.includes('id no') || text.includes('id number') || text.includes('national id') || text.includes('namba ya kitambulisho')) {
          if (!autoMapping.idNo) autoMapping.idNo = q.questionId;
        } else if (text.includes('age') || text.includes('miaka') || text.includes('years old')) {
          if (!autoMapping.age) autoMapping.age = q.questionId;
        } else if (text.includes('gender') || text.includes('jinsia') || text.includes('sex')) {
          if (!autoMapping.gender) autoMapping.gender = q.questionId;
        } else if (text.includes('village') || text.includes('kijiji') || text.includes('location') || text.includes('home')) {
          if (!autoMapping.village) autoMapping.village = q.questionId;
        } else if (text.includes('caregiver') || text.includes('parent') || text.includes('guardian') || text.includes('mlezi') || text.includes('mzazi')) {
          if (!autoMapping.caregiver) autoMapping.caregiver = q.questionId;
        } else if (text.includes('boarding') || text.includes('school status') || text.includes('schooling') || text.includes('day')) {
          if (!autoMapping.schoolingStatus) autoMapping.schoolingStatus = q.questionId;
        } else if (text.includes('class') || text.includes('grade') || text.includes('form') || text.includes('standard')) {
          if (!autoMapping.schoolClass) autoMapping.schoolClass = q.questionId;
        } else if (text.includes('cohort') || text.includes('course') || text.includes('kikundi')) {
          if (!autoMapping.cohort) autoMapping.cohort = q.questionId;
        } else if (text.includes('contact') || text.includes('phone') || text.includes('simu') || text.includes('nambari') || text.includes('email') || text.includes('baruapepe')) {
          if (!autoMapping.contact) autoMapping.contact = q.questionId;
        } else if (text.includes('notes') || text.includes('diet') || text.includes('allergy') || text.includes('comment') || text.includes('remarks')) {
          if (!autoMapping.notes) autoMapping.notes = q.questionId;
        }
      });
      setGoogleFormImportMapping(autoMapping);

      // 2. Fetch Form Responses
      setGoogleFormStatusText('Fetching responses from Google Form...');
      const responseRes = await fetch(`https://forms.googleapis.com/v1/forms/${formId}/responses`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!responseRes.ok) {
        if (responseRes.status === 404 || responseRes.status === 403) {
          throw new Error("Form is not accepting responses or access is restricted. Make sure responses are enabled and you have permission.");
        }
        const errData = await responseRes.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Failed to fetch responses (Status ${responseRes.status})`);
      }

      const responseData = await responseRes.json();
      const responsesList = responseData.responses || [];
      setGoogleFormResponses(responsesList);
      setGoogleFormStatusText(`Successfully retrieved Form layout with ${questions.length} fields and ${responsesList.length} total responses.`);
    } catch (err: any) {
      console.error("Fetch form structure and responses error:", err);
      setGoogleFormError(err.message || "An error occurred while connecting to Google Forms.");
    } finally {
      setGoogleFormLoading(false);
    }
  };

  const applyGoogleFormMapping = () => {
    if (!googleFormResponses || googleFormResponses.length === 0) {
      setGoogleFormError("No Google Form responses found to map.");
      return;
    }

    const nameQId = googleFormImportMapping.name;
    if (!nameQId) {
      setGoogleFormError("Please configure the 'Full Name' field mapping before attempting to preview form responses.");
      return;
    }

    const candidates = googleFormResponses.map((resp: any, idx: number) => {
      const getAnswerText = (qId: string) => {
        if (!qId || !resp.answers) return '-';
        const answerObj = resp.answers[qId];
        if (!answerObj || !answerObj.textAnswers || !answerObj.textAnswers.answers) return '-';
        return answerObj.textAnswers.answers.map((a: any) => a.value).join(', ');
      };

      const name = getAnswerText(nameQId).trim();
      const idNo = getAnswerText(googleFormImportMapping.idNo).trim();
      const age = getAnswerText(googleFormImportMapping.age).trim();
      const gender = getAnswerText(googleFormImportMapping.gender).trim();
      const village = getAnswerText(googleFormImportMapping.village).trim();
      const caregiver = getAnswerText(googleFormImportMapping.caregiver).trim();
      
      const rawCohort = getAnswerText(googleFormImportMapping.cohort).trim();
      const cohort = COHORTS.includes(rawCohort) ? rawCohort : 'Victors Class';

      const contact = getAnswerText(googleFormImportMapping.contact).trim();
      const notes = getAnswerText(googleFormImportMapping.notes).trim();
      const schoolingStatus = getAnswerText(googleFormImportMapping.schoolingStatus).trim();
      const schoolClass = getAnswerText(googleFormImportMapping.schoolClass).trim();

      return {
        id: `form_${resp.responseId || idx}_${Date.now()}`,
        name: name !== '-' ? name : '',
        idNo: idNo || '-',
        age: age || '-',
        gender: gender || '-',
        village: village || '-',
        caregiver: caregiver || '-',
        cohort,
        contact: contact || '-',
        schoolingStatus: schoolingStatus || '-',
        schoolClass: schoolClass || '-',
        registrationNotes: notes !== '-' ? notes : `Imported via Google Form response.`,
        isValid: true,
        errors: [],
        warnings: [],
        importChecked: true
      };
    });

    const evaluated = reevaluateParsedImportList(candidates, importStrategy);
    setParsedImportList(evaluated);
    setGoogleFormError(null);
  };

  // Helper code to map dynamic evaluation details on imported candidates
  const reevaluateParsedImportList = (items: any[], strategy: 'upsert' | 'create') => {
    return items.map(item => {
      const name = item.name || '';
      const idNo = item.idNo || '';
      const contact = item.contact || '';

      const errs: string[] = [];
      const warnings: string[] = [];
      let matchType: 'none' | 'update' = 'none';
      let matchedParticipantId: string | undefined = undefined;
      let matchedParticipantName: string | undefined = undefined;

      const matchedStudent = findMatchingParticipant({ name, idNo, contact });
      if (matchedStudent) {
        matchType = 'update';
        matchedParticipantId = matchedStudent.id;
        matchedParticipantName = matchedStudent.name;
      }

      if (!name) {
        errs.push('Missing Name');
      }

      if (strategy === 'create') {
        if (name) {
          const similarPart = participants.find(p => p.name.trim().toLowerCase() === name.toLowerCase());
          if (similarPart) {
            warnings.push(`Similar/Match Name: Already matched with registered student "${similarPart.name}" (${similarPart.cohort})`);
          }
        }
        if (idNo && idNo !== '-' && idNo !== '') {
          const idMatch = participants.find(p => p.idNo && p.idNo !== '-' && p.idNo.trim().toLowerCase() === idNo.toLowerCase());
          if (idMatch) {
            errs.push(`ID Number Conflict: Matches registered student "${idMatch.name}" (${idMatch.idNo})`);
          }
        }
        if (contact && contact !== '-' && contact !== '') {
          const phoneMatch = participants.find(p => p.contact && p.contact !== '-' && p.contact.trim().toLowerCase() === contact.toLowerCase());
          if (phoneMatch) {
            warnings.push(`Duplicate Contact: Shared contact with enrolled student "${phoneMatch.name}"`);
          }
        }
      } else {
        // Upsert strategy
        if (matchedStudent) {
          warnings.push(`Profile Match: Will update profile of existing participant "${matchedStudent.name}" (${matchedStudent.cohort}) with new class, contact, and details.`);
        }
      }

      return {
        ...item,
        isValid: errs.length === 0,
        errors: errs,
        warnings,
        matchType,
        matchedParticipantId,
        matchedParticipantName,
        importChecked: errs.length === 0 ? item.importChecked : false
      };
    });
  };

  useEffect(() => {
    if (parsedImportList.length > 0) {
      setParsedImportList(prev => {
        const reevaluated = reevaluateParsedImportList(prev, importStrategy);
        let changed = false;
        if (reevaluated.length !== prev.length) {
          changed = true;
        } else {
          for (let i = 0; i < prev.length; i++) {
            if (prev[i].isValid !== reevaluated[i].isValid ||
                prev[i].importChecked !== reevaluated[i].importChecked ||
                prev[i].errors.join(",") !== reevaluated[i].errors.join(",") ||
                (prev[i].warnings || []).join(",") !== (reevaluated[i].warnings || []).join(",")) {
              changed = true;
              break;
            }
          }
        }
        return changed ? reevaluated : prev;
      });
    }
  }, [importStrategy]);

  // Reactive mapper for spreadsheet raw rows with extensive validation & data safety conflict checks
  const applyMappingOnRawRows = (rows: string[][], mapping: Record<string, number>) => {
    const parsedData: any[] = [];
    
    for (let i = 0; i < rows.length; i++) {
       const columns = rows[i];
       if (columns.length === 0 || (columns.length === 1 && !columns[0])) continue;

       const name = mapping.name !== -1 && columns[mapping.name] ? columns[mapping.name].replace(/^["']|["']$/g, '').trim() : '';
       const idNo = mapping.idNo !== -1 && columns[mapping.idNo] ? columns[mapping.idNo].replace(/^["']|["']$/g, '').trim() : '';
       const age = mapping.age !== -1 && columns[mapping.age] ? columns[mapping.age].replace(/^["']|["']$/g, '').trim() : '';
       const gender = mapping.gender !== -1 && columns[mapping.gender] ? columns[mapping.gender].replace(/^["']|["']$/g, '').trim() : '';
       const village = mapping.village !== -1 && columns[mapping.village] ? columns[mapping.village].replace(/^["']|["']$/g, '').trim() : '';
       const caregiver = mapping.caregiver !== -1 && columns[mapping.caregiver] ? columns[mapping.caregiver].replace(/^["']|["']$/g, '').trim() : '';
       const rawCohort = mapping.cohort !== -1 && columns[mapping.cohort] ? columns[mapping.cohort].replace(/^["']|["']$/g, '').trim() : '';
       const rawContact = mapping.contact !== -1 && columns[mapping.contact] ? columns[mapping.contact].replace(/^["']|["']$/g, '').trim() : '';
       const notes = mapping.notes !== -1 && columns[mapping.notes] ? columns[mapping.notes].replace(/^["']|["']$/g, '').trim() : '';
       const schoolingStatus = mapping.schoolingStatus !== -1 && columns[mapping.schoolingStatus] ? columns[mapping.schoolingStatus].replace(/^["']|["']$/g, '').trim() : '';
       const schoolClass = mapping.schoolClass !== -1 && columns[mapping.schoolClass] ? columns[mapping.schoolClass].replace(/^["']|["']$/g, '').trim() : '';

       const contact = rawContact || '-';
       const cohort = COHORTS.includes(rawCohort) ? rawCohort : 'Victors Class';

       parsedData.push({
         id: `temp_${i}_${Date.now()}`,
         name,
         contact,
         cohort,
         registrationNotes: notes || 'Imported via spreadsheet preview mapper.',
         isValid: true,
         errors: [],
         warnings: [],
         importChecked: true,
         idNo: idNo || '-',
         age: age || '-',
         gender: gender || '-',
         village: village || '-',
         caregiver: caregiver || '-',
         schoolingStatus: schoolingStatus || '-',
         schoolClass: schoolClass || '-'
       });
    }

    const evaluated = reevaluateParsedImportList(parsedData, importStrategy);
    setParsedImportList(evaluated);
  };

  const updateHeaderMapping = (field: string, colIdx: number) => {
    const updated = { ...manualHeaderMapping, [field]: colIdx };
    setManualHeaderMapping(updated);
    applyMappingOnRawRows(rawCSVRows, updated);
  };

  // Parser for raw pasted / uploaded text (JSON or CSV format)
  const parseRawText = (text: string) => {
    if (!text.trim()) {
      setParsedImportList([]);
      setRawCSVRows([]);
      setDetectedHeadersList([]);
      setImportError(null);
      return;
    }
    
    try {
      const trimmed = text.trim();
      // Try array JSON parsing first
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const json = JSON.parse(trimmed);
        if (Array.isArray(json)) {
          const parsedTemp = json.map((item: any, idx) => {
            const name = String(item.name || item.Name || '').trim();
            const contactInput = String(item.contact || item.Contact || item.phone || item.Phone || item.email || item.Email || '').trim();
            const cohort = String(item.cohort || item.Cohort || 'Victors Class').trim();
            const notes = String(item.notes || item.Notes || item.registrationNotes || '').trim();
            
            const idNo = String(item.idNo || item.id_no || item.id || item['id No.'] || item['ID No.'] || '').trim();
            const age = String(item.age || item.Age || '').trim();
            const gender = String(item.gender || item.Gender || item.sex || item.Sex || '').trim();
            const village = String(item.village || item.Village || '').trim();
            const caregiver = String(item.caregiver || item.Caregiver || '').trim();
            const schoolingStatus = String(item.schoolingStatus || item.school_status || item['school status'] || item.schooling_status || item['Schooling Status'] || '').trim();
            const schoolClass = String(item.schoolClass || item.school_class || item['school class'] || item['School Class'] || item.grade || item['Grade'] || '').trim();

            const contact = contactInput || '-';

            return {
              id: `temp_${idx}_${Date.now()}`,
              name,
              contact,
              cohort: COHORTS.includes(cohort) ? cohort : 'Victors Class',
              registrationNotes: notes || 'Imported via JSON.',
              isValid: true,
              errors: [],
              warnings: [],
              importChecked: true,
              idNo: idNo || '-',
              age: age || '-',
              gender: gender || '-',
              village: village || '-',
              caregiver: caregiver || '-',
              schoolingStatus: schoolingStatus || '-',
              schoolClass: schoolClass || '-'
            };
          });

          const evaluated = reevaluateParsedImportList(parsedTemp, importStrategy);
          setParsedImportList(evaluated);
          setImportError(null);
          return;
        }
      }
    } catch (e) {
      // ignore JSON errors and fallback to CSV/TSV
    }

    // CSV/TSV / Semicolon / Pipe parsing
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
    if (lines.length === 0) return;

    let delimiter = ',';
    const firstLine = lines[0];
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes(';')) delimiter = ';';
    else if (firstLine.includes('|')) delimiter = '|';

    const firstLineColumns = firstLine.split(delimiter).map(c => c.replace(/^["']|["']$/g, '').trim());

    // Identify if the row is actually a header row
    const isHeaderRow = firstLineColumns.some(col => 
      ['name', 'fullname', 'contact', 'phone', 'email', 'cohort', 'notes', 'notes/dietary', 'id no.', 'id no', 'age', 'gender', 'sex', 'village', 'caregiver', 'schooling status', 'school class', 'class', 'grade'].includes(col.toLowerCase().trim())
    );

    let rawHeaders: string[] = [];
    let dataRowsStr: string[][] = [];
    let initialMapping: Record<string, number> = {
      name: 0,
      idNo: -1,
      age: -1,
      gender: -1,
      village: -1,
      caregiver: -1,
      cohort: -1,
      contact: -1,
      notes: -1,
      schoolingStatus: -1,
      schoolClass: -1
    };

    if (isHeaderRow) {
      rawHeaders = firstLineColumns;
      dataRowsStr = lines.slice(1).map(line => line.split(delimiter).map(c => c.replace(/^["']|["']$/g, '').trim()));
      
      rawHeaders.forEach((col, idx) => {
        const lCol = col.toLowerCase().trim();
        if (lCol.includes('name')) initialMapping.name = idx;
        if (lCol.includes('contact') || lCol.includes('phone') || lCol.includes('email')) initialMapping.contact = idx;
        if (lCol.includes('cohort')) initialMapping.cohort = idx;
        if (lCol.includes('note')) initialMapping.notes = idx;
        if (lCol.includes('id no') || lCol.includes('id number') || lCol === 'id') initialMapping.idNo = idx;
        if (lCol === 'age') initialMapping.age = idx;
        if (lCol === 'gender' || lCol === 'sex') initialMapping.gender = idx;
        if (lCol === 'village') initialMapping.village = idx;
        if (lCol === 'caregiver') initialMapping.caregiver = idx;
        if (lCol.includes('schooling') || lCol.includes('boarding') || lCol.includes('school status')) initialMapping.schoolingStatus = idx;
        if (lCol === 'class' || lCol === 'grade' || lCol.includes('school class')) initialMapping.schoolClass = idx;
      });
    } else {
      // Missing original headers list - generate fallback Column names
      const maxColsCount = Math.max(...lines.map(line => line.split(delimiter).length));
      for (let c = 0; c < maxColsCount; c++) {
        rawHeaders.push(`Column ${String.fromCharCode(65 + (c % 26))}${c >= 26 ? Math.floor(c / 26) : ''}`);
      }
      dataRowsStr = lines.map(line => line.split(delimiter).map(c => c.replace(/^["']|["']$/g, '').trim()));
      
      // Default guess fallback mapping assignment
      initialMapping = {
        name: 0,
        idNo: maxColsCount > 1 ? 1 : -1,
        age: maxColsCount > 2 ? 2 : -1,
        gender: maxColsCount > 3 ? 3 : -1,
        village: maxColsCount > 4 ? 4 : -1,
        caregiver: maxColsCount > 5 ? 5 : -1,
        cohort: maxColsCount > 6 ? 6 : -1,
        contact: maxColsCount > 7 ? 7 : -1,
        notes: maxColsCount > 8 ? 8 : -1,
        schoolingStatus: maxColsCount > 9 ? 9 : -1,
        schoolClass: maxColsCount > 10 ? 10 : -1
      };
    }

    setDetectedHeadersList(rawHeaders);
    setRawCSVRows(dataRowsStr);
    setManualHeaderMapping(initialMapping);
    applyMappingOnRawRows(dataRowsStr, initialMapping);
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

    let updatedCount = 0;
    let addedCount = 0;

    setParticipants(prev => {
      const currentParticipants = [...prev];
      const newImportedList: Participant[] = [];

      listToImport.forEach(item => {
        const matched = importStrategy === 'upsert' ? findMatchingParticipant({ name: item.name, idNo: item.idNo, contact: item.contact }) : null;
        if (matched) {
          // Update the existing participant profile!
          const idx = currentParticipants.findIndex(p => p.id === matched.id);
          if (idx !== -1) {
            const existing = currentParticipants[idx];
            // Merge fields
            currentParticipants[idx] = {
              ...existing,
              name: item.name || existing.name,
              contact: (item.contact && item.contact !== '-') ? item.contact : existing.contact,
              cohort: item.cohort || existing.cohort,
              idNo: (item.idNo && item.idNo !== '-') ? item.idNo : existing.idNo,
              age: (item.age && item.age !== '-') ? item.age : existing.age,
              gender: (item.gender && item.gender !== '-') ? item.gender : existing.gender,
              village: (item.village && item.village !== '-') ? item.village : existing.village,
              caregiver: (item.caregiver && item.caregiver !== '-') ? item.caregiver : existing.caregiver,
              schoolingStatus: (item.schoolingStatus && item.schoolingStatus !== '-') ? item.schoolingStatus : existing.schoolingStatus,
              schoolClass: (item.schoolClass && item.schoolClass !== '-') ? item.schoolClass : existing.schoolClass,
              registrationNotes: item.registrationNotes && item.registrationNotes !== 'Imported via spreadsheet preview mapper.' && item.registrationNotes !== 'Imported via JSON.'
                ? `${existing.registrationNotes || ''}\n[Update]: ${item.registrationNotes}`
                : existing.registrationNotes,
              isImported: true
            };
            updatedCount++;
          }
        } else {
          // Create a new participant model!
          const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
          newImportedList.push({
            id: `p_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
            name: item.name,
            contact: item.contact || '-',
            cohort: item.cohort,
            joinDate: new Date().toISOString().split('T')[0],
            avatarColor: randomColor,
            registrationNotes: item.registrationNotes || 'Imported via Bulk List.',
            outreachNotes: [],
            idNo: item.idNo || '-',
            age: item.age || '-',
            gender: item.gender || '-',
            village: item.village || '-',
            caregiver: item.caregiver || '-',
            schoolingStatus: item.schoolingStatus || '-',
            schoolClass: item.schoolClass || '-',
            isPermanent: true,
            isImported: true
          });
          addedCount++;
        }
      });

      // Initialize default unmarked statuses for newly added participants
      if (newImportedList.length > 0) {
        setAttendance(attendancePrev => {
          const updated = { ...attendancePrev };
          newImportedList.forEach(p => {
            updated[p.id] = {};
            sessions.forEach(s => {
              updated[p.id][s.date] = 'unmarked';
            });
          });
          return updated;
        });
      }

      // Append new participants to updated current list
      return [...currentParticipants, ...newImportedList];
    });

    alert(`Successfully processed bulk import:\n- New participants added: ${addedCount}\n- Existing profiles updated: ${updatedCount}`);

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

  // Download Excel/CSV Attendance Import template pre-configured with active roster
  const downloadAttendanceTemplate = () => {
    // Columns: ID No., Student Name, Cohort, Status (Present/Absent)
    const headers = ["ID No.", "Student Name", "Cohort", "Status (Present/Absent)"];
    
    // Dynamic generation from existing active participants
    const rows = activeParticipants.map(p => [
      p.idNo || p.id,
      p.name,
      p.cohort,
      "Present"
    ]);

    const sampleRows = rows.length > 0 ? rows : [
      ["ID-88220", "Liam Sterling", "Victors Class", "Present"],
      ["ID-56193", "Jane Chep", "Champions Class", "Absent"],
      ["ID-45912", "David Kiprop", "Overcomers Class", "Present"]
    ];

    const csvContent = [
      headers.join(","),
      ...sampleRows.map(row => row.map(val => `"${val.replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `attendance_import_template_${attendanceImportDate || new Date().toISOString().split('T')[0]}.csv`);
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
    // Add the Logo on the left of the header
    try {
      doc.addImage(getLogoPngDataUri(), 'PNG', 22, 11, 15, 15);
    } catch (e) {
      console.error("Failed to add logo:", e);
    }

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
        try {
          const cw = iframe.contentWindow;
          if (cw) {
            cw.focus();
            cw.print();
          } else {
            console.warn("Iframe contentWindow is not accessible. Downloading instead.");
            doc.save(`manager_notification_${cleanName}.pdf`);
          }
        } catch (printErr) {
          console.warn("Iframe printing blocked by security policies. Downloading file instead:", printErr);
          doc.save(`manager_notification_${cleanName}.pdf`);
        }
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

    // Drawing the circular logo synchronously on the canvas
    try {
      // Outer silver ring
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(60, 65, 28, 0, Math.PI * 2);
      ctx.stroke();

      // Inner yellow ring highlight
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(60, 65, 25, -Math.PI * 0.8, Math.PI * 0.8);
      ctx.stroke();

      // Left orange parent body swoosh & head
      ctx.fillStyle = '#ff9a00';
      ctx.beginPath();
      ctx.arc(55, 56, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(53, 67, 7, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.fill();

      // Right purple child body swoosh & head
      ctx.fillStyle = '#ad1457';
      ctx.beginPath();
      ctx.arc(67, 63, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(67, 72, 5, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.fill();

      // Open book base
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(48, 74, 24, 2);
    } catch (e) {
      console.error("Canvas logo drawing failed:", e);
    }

    // Headers text (shifted right to fit the logo)
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('LOMURIANGOLE CHILD & YOUTH DEVELOPMENT CENTER', 105, 53);
    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('OFFICIAL INTEGRATED RECOVERY CASE RECORDS - PROJECT UG-1083', 105, 75);

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
    if (!isAdminMode) {
      alert("Demographics and document deletions are restricted. Please unlock Admin Mode to delete records.");
      return;
    }
    const part = participants.find(p => p.id === participantId);
    if (!part) return;
    const formToDelete = (part.scannedForms || []).find(f => f.id === formId);
    if (!formToDelete) return;

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
      logSystemAction('audit', 'Scanned Document Reference Deleted', `Deleted scanned record reference of type ${formToDelete.formType} (ID: ${formId}) for student ${part.name}.`);
    }
  };

  const handleSaveFilledForm = (participantId: string) => {
    const newForm: FilledForm = {
      id: `form_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      type: formType,
      date: new Date().toISOString(),
      data: formData
    };

    setParticipants(prev => {
      const list = prev.map(p => {
        if (p.id === participantId) {
          const filledForms = p.filledForms || [];
          return {
            ...p,
            filledForms: [newForm, ...filledForms]
          };
        }
        return p;
      });
      localStorage.setItem('attendance_tracker_participants', JSON.stringify(list));
      return list;
    });

    setIsFormModalOpen(false);
    setFormData({});
  };

  const handleDeleteFilledForm = (participantId: string, formId: string) => {
    if (!isAdminMode) {
      alert("Form deletion is restricted. Please unlock Admin Mode to delete saved forms.");
      return;
    }
    const part = participants.find(p => p.id === participantId);
    if (!part) return;
    const formToDelete = (part.filledForms || []).find(f => f.id === formId);
    if (!formToDelete) return;

    if (window.confirm(`Are you sure you want to delete this ${formToDelete.type} form filled on ${formToDelete.date.slice(0, 10)}?`)) {
      setParticipants(prev => {
        const list = prev.map(p => {
          if (p.id === participantId) {
            const filledForms = p.filledForms || [];
            return {
              ...p,
              filledForms: filledForms.filter(f => f.id !== formId)
            };
          }
          return p;
        });
        localStorage.setItem('attendance_tracker_participants', JSON.stringify(list));
        return list;
      });
      logSystemAction('audit', 'Assessment Form Deleted', `Permanently deleted saved ${formToDelete.type} form (ID: ${formId}) completed for student ${part.name}.`);
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
    if (!isAdminMode) {
      alert("Document deletion is restricted. Please unlock Admin Mode to delete official files.");
      return;
    }
    const part = participants.find(p => p.id === participantId);
    if (!part) return;
    const docToDelete = (part.documents || []).find(d => d.id === docId);
    if (!docToDelete) return;

    if (window.confirm(`Are you sure you want to delete this official document "${docToDelete.name}"? This action cannot be reverted.`)) {
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
      logSystemAction('audit', 'Official Document File Pruned', `Permanently deleted official document attachment "${docToDelete.name}" (ID: ${docId}) for student ${part.name}.`);
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
      // Add the Logo on the left of the header
      try {
        doc.addImage(getLogoPngDataUri(), 'PNG', 22, 11, 15, 15);
      } catch (e) {
        console.error("Failed to add logo:", e);
      }

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
        try {
          const cw = iframe.contentWindow;
          if (cw) {
            cw.focus();
            cw.print();
          } else {
            console.warn("Iframe contentWindow is not accessible. Downloading instead.");
            doc.save(`student_summary_${cleanName}.pdf`);
          }
        } catch (printErr) {
          console.warn("Iframe printing blocked by security policies. Downloading file instead:", printErr);
          doc.save(`student_summary_${cleanName}.pdf`);
        }
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
    // Add the Logo on the left of the header
    try {
      doc.addImage(getLogoPngDataUri(), 'PNG', 22, 11, 15, 15);
    } catch (e) {
      console.error("Failed to add logo:", e);
    }

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
        try {
          const cw = iframe.contentWindow;
          if (cw) {
            cw.focus();
            cw.print();
          } else {
            console.warn("Iframe contentWindow is not accessible. Downloading instead.");
            doc.save(`outreach_message_${cleanName}.pdf`);
          }
        } catch (printErr) {
          console.warn("Iframe printing blocked by security policies. Downloading file instead:", printErr);
          doc.save(`outreach_message_${cleanName}.pdf`);
        }
        setTimeout(() => {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
        }, 5000);
      };
    } else {
      doc.save(`outreach_message_${cleanName}.pdf`);
    }
  };

  // High-fidelity individual evaluation report PDF generation based on AI report cache and physical student dossiers
  const downloadIndividualAIReportPDF = (participant: Participant, originalStats: AttendanceStats) => {
    const aiReport = aiSingleReports[participant.id];
    if (!aiReport) return;

    // Filter sessions based on Chosen Period
    let pdfSessions = [...sessions];
    if (aiReportStartDate) {
      pdfSessions = pdfSessions.filter(s => s.date >= aiReportStartDate);
    }
    if (aiReportEndDate) {
      pdfSessions = pdfSessions.filter(s => s.date <= aiReportEndDate);
    }
    const periodStats = calculateParticipantStats(participant.id, pdfSessions, attendance);

    const doc = new jsPDF('p', 'mm', 'a4');
    const width = 210;
    const height = 297;
    const margin = 20;
    const contentWidth = width - (margin * 2); // 170
    const centerX = 105;

    let currentPage = 1;

    // Standard high-fidelity official letterhead header (cleaned of AI/Gemini branding)
    const drawHeader = (page: number) => {
      // Add the Logo on the left of the header
      try {
        doc.addImage(getLogoPngDataUri(), 'PNG', 22, 11, 15, 15);
      } catch (e) {
        console.error("Failed to add logo:", e);
      }

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
      doc.setTextColor(217, 119, 6); // Amber-500
      doc.text("0778687473 / 078436428 / 0784522071", centerX + 5, 26, { align: 'center' });

      // 4. Email: lomuriangolecydc@gmail.com
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text("Email: ", centerX - 25, 30.5);
      
      doc.setTextColor(37, 99, 235); // Blue
      doc.text("lomuriangolecydc@gmail.com", centerX + 8, 30.5, { align: 'center' });

      // Divider Line
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.4);
      doc.line(margin, 34.5, width - margin, 34.5);

      // Sub-Header Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text("OFFICIAL PROGRESS, WELFARE & INDIVIDUAL PERFORMANCE EVALUATION REPORT", centerX, 39.5, { align: 'center' });

      // Date of Issue
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      const todayStr = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
      doc.text(`DATE OF ASSESSMENT: ${todayStr}`, margin, 44);
      doc.text(`RECORD STANDING: OFFICIAL DEVELOPMENT DOSSIER`, width - margin, 44, { align: 'right' });

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.25);
      doc.line(margin, 46, width - margin, 46);
    };

    const drawFooter = (page: number, total: number | string) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(`Official Student Progress Evaluation Ledger — Lomuriangole Development Center (UG 1083)`, margin, height - 12);
      doc.text(`Page ${page} of ${total}`, width - margin, height - 12, { align: 'right' });
    };

    drawHeader(currentPage);
    let y = 52;

    // A helper to replace Gemini / AI string patterns so it remains purely official
    const sanitizeText = (txt: string) => {
      if (!txt) return '';
      return txt
        .replace(/gemini/gi, 'Official Registry System')
        .replace(/ artificial intelligence /gi, ' Staff Analytics ')
        .replace(/AI evaluation/gi, 'Formal Progress assessment')
        .replace(/AI report/gi, 'Progress report')
        .replace(/AI system/gi, 'Registry Protocol')
        .replace(/ ai /gi, ' evaluation ')
        .replace(/powered by Gemini/gi, 'Official Comprehensive Assessment')
        .replace(/ai model/gi, 'Assessment Protocol')
        .replace(/large language model/gi, 'Analytical System')
        .replace(/llm/gi, 'System');
    };

    // --- SECTION 1: BENEFICIARY PROFILE & REGISTRATION STATUS ---
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("1. BENEFICIARY PROFILE & PROGRAM RECOGNITION STATUS", margin + 3, y + 5);
    y += 11;

    // Multi-column info layout
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text("Full Name:", margin + 3, y);
    doc.setFont('helvetica', 'bold'); 
    doc.setTextColor(15, 23, 42);
    doc.text(participant.name.toUpperCase(), margin + 42, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Assigned Cohort Group:", margin + 95, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.cohort, margin + 142, y);

    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Age / Gender Status:", margin + 3, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    const ageSexStr = `${participant.age || 'N/A'} yrs / ${participant.gender || 'N/A'}`;
    doc.text(ageSexStr, margin + 42, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Home Village/Location:", margin + 95, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.village || 'N/A', margin + 142, y);

    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Primary Caregiver Name:", margin + 3, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.caregiver || 'N/A', margin + 42, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text("Original Date of Join:", margin + 95, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(participant.joinDate || 'N/A', margin + 142, y);

    y += 10;

    // --- SECTION 2: ATTENDANCE & ATTENDANCE COMPLIANCE STATS ----
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("2. COMPLIANCE & ATTENDANCE METRIC SEGMENTS", margin + 3, y + 5);
    y += 11;

    // Draw Stats Table inside Evaluation Period
    const dateRangeStr = (aiReportStartDate || aiReportEndDate)
      ? `${aiReportStartDate || 'Beginning'} to ${aiReportEndDate || 'Today'}`
      : "Full Cumulative History";

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Evaluation Window Period: `, margin + 3, y);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(15, 23, 42);
    doc.text(dateRangeStr, margin + 42, y);

    y += 6;

    // Quick Grid box for stats
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(250, 251, 252);
    doc.rect(margin, y, contentWidth, 16, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text("LOGGED SESSIONS", margin + 5, y + 5);
    doc.text("PRESENT", margin + 40, y + 5);
    doc.text("ABSENT", margin + 70, y + 5);
    doc.text("EXCUSED", margin + 100, y + 5);
    doc.text("COMPLIANCE RATE & STANDING", margin + 130, y + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${periodStats.totalSessions} dates`, margin + 5, y + 12);
    doc.text(`${periodStats.totalPresent}`, margin + 40, y + 12);
    doc.text(`${periodStats.totalAbsent}`, margin + 70, y + 12);
    doc.text(`${periodStats.totalExcused}`, margin + 100, y + 12);

    const scoreStandingStr = sanitizeText(aiReport.attendanceScoreAnalysis || "Normal");
    doc.text(`${periodStats.attendanceRate}% [${scoreStandingStr}]`, margin + 130, y + 12);

    y += 24;

    // --- SECTION 3: PROGRESS EVALUATION SUMMARY BRIEF ----
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("3. ADMINISTRATIVE EVALUATION SUMMARY & ANALYSIS BRIEF", margin + 3, y + 5);
    y += 11;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);

    const sanitizedSummary = sanitizeText(aiReport.summary);
    const summaryLines = doc.splitTextToSize(sanitizedSummary, contentWidth - 4);
    doc.text(summaryLines, margin + 2, y);
    y += (summaryLines.length * 4) + 6;

    // Insights List
    if (aiReport.insights && aiReport.insights.length > 0) {
      if (y > 230) {
        drawFooter(currentPage, "TOTAL_PAGES_PLACEHOLDER");
        doc.addPage();
        currentPage++;
        drawHeader(currentPage);
        y = 52;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text("Case Chronicles & Assessment Details:", margin + 2, y);
      y += 5.5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);

      aiReport.insights.forEach((ins: string) => {
        const cleanIns = sanitizeText(ins);
        const insLines = doc.splitTextToSize(`• ${cleanIns}`, contentWidth - 6);
        doc.text(insLines, margin + 4, y);
        y += (insLines.length * 3.8) + 2;
      });
      y += 3;
    }

    // Recommendation
    if (y > 230) {
      drawFooter(currentPage, "TOTAL_PAGES_PLACEHOLDER");
      doc.addPage();
      currentPage++;
      drawHeader(currentPage);
      y = 52;
    }

    doc.setFillColor(249, 250, 251);
    doc.setDrawColor(226, 232, 240);
    const sanitizedRec = sanitizeText(aiReport.recommendation);
    const recLines = doc.splitTextToSize(sanitizedRec, contentWidth - 8);
    const recBoxHeight = (recLines.length * 4) + 8;

    doc.rect(margin, y, contentWidth, recBoxHeight, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(79, 70, 229); // Indigo-600
    doc.text("DIRECTED STAFF ACTION STEP / COMPLIANCE STRATEGY:", margin + 4, y + 5.5);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(recLines, margin + 4, y + 10.5);

    y += recBoxHeight + 8;

    // --- SECTION 4: HISTORIC WELFARE & HEALTH DOSSIER RECOGNIZED RECORDS ---
    let userForms = participant.filledForms || [];
    let userScanned = participant.scannedForms || [];
    let userDocs = participant.documents || [];

    if (aiReportStartDate) {
      userForms = userForms.filter(f => f.date >= aiReportStartDate);
      userScanned = userScanned.filter(f => f.uploadDate >= aiReportStartDate);
      userDocs = userDocs.filter(d => d.uploadDate >= aiReportStartDate);
    }
    if (aiReportEndDate) {
      userForms = userForms.filter(f => f.date <= aiReportEndDate);
      userScanned = userScanned.filter(f => f.uploadDate <= aiReportEndDate);
      userDocs = userDocs.filter(d => d.uploadDate <= aiReportEndDate);
    }

    if (y > 200) {
      drawFooter(currentPage, "TOTAL_PAGES_PLACEHOLDER");
      doc.addPage();
      currentPage++;
      drawHeader(currentPage);
      y = 52;
    }

    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("4. RETRIEVED RECORD DOSSIERS & DOCUMENT DIGEST", margin + 3, y + 5);
    y += 11;

    const hasNoDocs = userForms.length === 0 && userScanned.length === 0 && userDocs.length === 0;

    if (hasNoDocs) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("No primary health, school visits, or caregiver assessment reports filed within this window.", margin + 3, y);
      y += 8;
    } else {
      // List filled forms
      if (userForms.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text("Structured Social Assessment Forms Filed:", margin + 2, y);
        y += 5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(51, 65, 85);

        userForms.forEach(f => {
          if (y > 265) {
            drawFooter(currentPage, "TOTAL_PAGES_PLACEHOLDER");
            doc.addPage();
            currentPage++;
            drawHeader(currentPage);
            y = 52;
          }
          let recapParts = [];
          if (f.data.idNo) recapParts.push(`ID: ${f.data.idNo}`);
          if (f.data.general_condition) recapParts.push(`Condition Code: ${f.data.general_condition}`);
          if (f.data.average_score_percentage || f.data.average_total) recapParts.push(`Avg Exam: ${f.data.average_score_percentage || f.data.average_total}%`);
          if (f.data.visitDate || f.data.date_of_visit) recapParts.push(`Date: ${f.data.visitDate || f.data.date_of_visit}`);
          
          const textLine = `• [FORM] ${f.type} Assessment — Filed on ${f.date} ${recapParts.length > 0 ? `(${recapParts.join(', ')})` : ''}`;
          doc.text(textLine, margin + 4, y);
          y += 4;
        });
        y += 2;
      }

      // List scanned OCR forms
      if (userScanned.length > 0) {
        if (y > 250) {
          drawFooter(currentPage, "TOTAL_PAGES_PLACEHOLDER");
          doc.addPage();
          currentPage++;
          drawHeader(currentPage);
          y = 52;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text("Scanned Paperwork & Welfare Records Extracted:", margin + 2, y);
        y += 5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(51, 65, 85);

        userScanned.forEach(f => {
          if (y > 265) {
            drawFooter(currentPage, "TOTAL_PAGES_PLACEHOLDER");
            doc.addPage();
            currentPage++;
            drawHeader(currentPage);
            y = 52;
          }
          let ocrSummaryText = "";
          if (f.formType === 'medical' && f.extractedData.medical) {
            ocrSummaryText = `Blood group: ${f.extractedData.medical.bloodType || 'N/A'}, Disabilities: ${f.extractedData.medical.disabilitiesOrConditions || 'N/A'}`;
          } else if (f.formType === 'school' && f.extractedData.school) {
            ocrSummaryText = `School: ${f.extractedData.school.schoolName || 'N/A'}, Grade: ${f.extractedData.school.gradeLevel || 'N/A'}`;
          } else if (f.formType === 'home_visit' && f.extractedData.home_visit) {
            ocrSummaryText = `Shelter: ${f.extractedData.home_visit.dwellingType || 'N/A'}, Vulnerabilities: ${f.extractedData.home_visit.riskVulnerabilitiesSummary || 'N/A'}`;
          } else {
            ocrSummaryText = `Summary: ${f.extractedData.other?.rawSummary?.slice(0, 100) || 'Verified file content.'}`;
          }

          const fileLine = `• [SCAN OCR] ${f.formType.toUpperCase()} - ${f.fileName} (Uploaded: ${f.uploadDate}) -> ${ocrSummaryText}`;
          const splitFileLine = doc.splitTextToSize(fileLine, contentWidth - 6);
          doc.text(splitFileLine, margin + 4, y);
          y += (splitFileLine.length * 3.8);
        });
        y += 2;
      }

      // List official documents
      if (userDocs.length > 0) {
        if (y > 255) {
          drawFooter(currentPage, "TOTAL_PAGES_PLACEHOLDER");
          doc.addPage();
          currentPage++;
          drawHeader(currentPage);
          y = 52;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text("Uploaded Certificates & Credentials:", margin + 2, y);
        y += 5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(51, 65, 85);

        userDocs.forEach(d => {
          if (y > 265) {
            drawFooter(currentPage, "TOTAL_PAGES_PLACEHOLDER");
            doc.addPage();
            currentPage++;
            drawHeader(currentPage);
            y = 52;
          }
          const docLine = `• [DOCUMENT] ${d.name} — Registered in database on ${d.uploadDate}`;
          doc.text(docLine, margin + 4, y);
          y += 4;
        });
        y += 2;
      }
    }

    // --- SECTION 5: SIGN-OFFS (CDO AND PD SIGNATURE BLOCKS) ---
    if (y > 215) {
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
    doc.text("5. WELFARE ENDORSEMENT & COMPLIANCE STAMP BLOCK", margin + 3, y + 5);
    y += 11;

    doc.setDrawColor(203, 213, 225); // light Slate border
    doc.setLineWidth(0.35);

    // Left card box: Prepared by CDO
    doc.rect(margin, y, 78, 33);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text("PREPARED BY (CYDC OFFICER):", margin + 4, y + 5.5);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text("Signature: ..............................................................", margin + 4, y + 12.5);
    doc.setFont('helvetica', 'bold');
    doc.text("Child Development Officer (CDO)", margin + 4, y + 19.5);
    doc.setFont('helvetica', 'normal');
    doc.text("Date of Evaluation: ____ / ____ / ________", margin + 4, y + 26.5);

    // Right card box: Approved by PD
    doc.rect(margin + 92, y, 78, 33);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text("APPROVED BY (DIRECTORATE):", margin + 96, y + 5.5);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text("Signature: ..............................................................", margin + 96, y + 12.5);
    doc.setFont('helvetica', 'bold');
    doc.text("Project Director (PD)", margin + 96, y + 19.5);
    doc.setFont('helvetica', 'normal');
    doc.text("Date of Approval:  ____ / ____ / ________", margin + 96, y + 26.5);

    y += 38;

    // Stamp Guide Area
    doc.setDrawColor(226, 232, 240);
    doc.rect(centerX - 35, y, 70, 16);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text("LOMURIANGOLE DEVELOPMENT CENTER SEAL / STAMP", centerX, y + 6.5, { align: 'center' });
    doc.text("PLACED UPON FINAL ENDORSEMENT", centerX, y + 11.5, { align: 'center' });

    y += 24;

    // Bottom file code
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    const docControlNo = `DOC-ID: ${participant.idNo || 'N/A'}-${Math.floor(1000 + Math.random() * 9000)}-${new Date().getFullYear()}`;
    doc.text(docControlNo, centerX, y, { align: 'center' });

    // Loop through all pages to replace the TOTAL_PAGES_PLACEHOLDER
    const totalPages = currentPage;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawFooter(i, totalPages);
    }

    const cleanName = participant.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    doc.save(`evaluation_report_${cleanName}.pdf`);
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
      // Add the Logo on the left of the header
      try {
        doc.addImage(getLogoPngDataUri(), 'PNG', 22, 11, 15, 15);
      } catch (e) {
        console.error("Failed to add logo:", e);
      }
 
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
      doc.text("Confidential Ledger — Lomuriangole Development Center (UG 1083)", margin, height - 12);
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
 
    // --- SECTION 2.1: COMPARATIVE ANALYSIS & STATISTICAL SUBGROUPS -----
    if (y > 200) {
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
    doc.text("2.1 DETAILS-BASED COMPARATIVE SUBGROUP ANALYSIS", margin + 3, y + 5);
    y += 11;
 
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
 
    const compLines = doc.splitTextToSize(aiCohortReport.comparativeAnalysis || "No custom comparative data analyzed.", contentWidth - 4);
    doc.text(compLines, margin + 2, y);
    y += (compLines.length * 4) + 6;
 
    // System Stats Subsections
    const statsCategories = [
      { label: "A. Village Access & Spatial Travel Hurdles", text: aiCohortReport.systemStats?.villageBreakdown },
      { label: "B. Gender Level Attendance & Support Comparisons", text: aiCohortReport.systemStats?.genderComparison },
      { label: "C. Schooling Boarder vs Day-Scholar Impact Factors", text: aiCohortReport.systemStats?.schoolingImpact }
    ];
 
    statsCategories.forEach(cat => {
      if (y > 235) {
        drawFooter(currentPage, "TOTAL_PAGES_PLACEHOLDER");
        doc.addPage();
        currentPage++;
        drawHeader(currentPage);
        y = 52;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(cat.label, margin + 2, y);
      y += 4.5;
 
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      const catLines = doc.splitTextToSize(cat.text || "Diagnostic review details pending.", contentWidth - 8);
      doc.text(catLines, margin + 4, y);
      y += (catLines.length * 3.8) + 5;
    });
 
    // --- SECTION 2.2: STRATEGIC POLICY RECOMMENDATIONS -----
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
    doc.text("2.2 ACTIONABLE PROGRAM STRATEGIC POLICY & INTERVENTION RECOMMENDATIONS", margin + 3, y + 5);
    y += 11;
 
    const recommendations = aiCohortReport.strategicRecommendations || [];
    recommendations.forEach((rec, idx) => {
      const recTitle = `${idx + 1}. [${rec.category.toUpperCase()}] Initiative: ${rec.initiative}`;
      const titleSplit = doc.splitTextToSize(recTitle, contentWidth - 8);
      const ratSplit = doc.splitTextToSize(`Rationale & Execution: ${rec.rationale}`, contentWidth - 10);
      const sizeNeeded = (titleSplit.length * 4.5) + (ratSplit.length * 3.8) + 10;
 
      if (y + sizeNeeded > 265) {
        drawFooter(currentPage, "TOTAL_PAGES_PLACEHOLDER");
        doc.addPage();
        currentPage++;
        drawHeader(currentPage);
        y = 52;
      }
 
      // Draw a light grey box
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.35);
      doc.setFillColor(254, 254, 255);
      doc.rect(margin, y, contentWidth, sizeNeeded - 2, 'FD');
 
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(titleSplit, margin + 3, y + 5);
      
      doc.setFontSize(7);
      doc.setTextColor(180, 83, 9); // Amber
      doc.text(`Priority: ${rec.priority}`, margin + contentWidth - 30, y + 5, { align: 'right' });
 
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(ratSplit, margin + 4, y + 6 + (titleSplit.length * 4.2));
 
      y += sizeNeeded;
    });
 
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

  const syncSessionToCalendar = async (session: Session) => {
    // Consent dialogue for mutating actions
    const isConfirmed = window.confirm(
      `Synchronize session date [${session.date} - ${session.label || 'Regular Session'}] directly to the dedicated 'CYDC Lomuriangole' Google Calendar?\n\nThis will configure/create the calendar if it does not exist, and will insert or update the session event.`
    );
    if (!isConfirmed) return;

    setIsSyncingToCalendar(true);
    setCalendarSyncError(null);
    setCalendarSyncSuccess(null);

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
            throw new Error("Failed to retrieve Google Calendar Access Token from login credential. Please try again.");
          }
        } catch (authErr: any) {
          throw new Error(`Google Authentication failed: ${authErr?.message || authErr}`);
        }
      }

      // 1. Get or create the dedicated 'CYDC Lomuriangole' Calendar
      const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      if (!listRes.ok) {
        throw new Error(`Failed to list calendars: ${listRes.statusText}`);
      }
      const listData = await listRes.json();
      let calendarId = null;
      if (listData.items) {
        const targetCal = listData.items.find((c: any) => c.summary === 'CYDC Lomuriangole');
        if (targetCal) {
          calendarId = targetCal.id;
        }
      }

      if (!calendarId) {
        const createCalRes = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeToken}`
          },
          body: JSON.stringify({
            summary: 'CYDC Lomuriangole',
            description: 'Dedicated program tracking calendar for the Lomuriangole Child & Youth Development Center (UG 1083).'
          })
        });
        if (!createCalRes.ok) {
          throw new Error(`Failed to create CYDC Lomuriangole calendar: ${createCalRes.statusText}`);
        }
        const createdCal = await createCalRes.json();
        calendarId = createdCal.id;
      }

      // Calculate attendance statistics of the session
      let present = 0;
      let absent = 0;
      let excused = 0;
      activeParticipants.forEach(p => {
        const status = attendance[p.id]?.[session.date];
        if (status === 'present') present++;
        if (status === 'absent') absent++;
        if (status === 'excused') excused++;
      });
      const total = present + absent + excused;
      const rate = total > 0 ? Math.round((present / total) * 100) : 0;

      // Construct detailed description text
      const checklistText = Object.entries(session.checklist || {})
        .map(([task, checked]) => `${checked ? '✅' : '⬜'} ${task}`)
        .join('\n') || 'No checklist activities logged for this session.';

      const notesText = session.notes || 'No notes compiled for this session.';

      const descriptionText = `📋 CYDC Lomuriangole Program Session Report File
Date: ${session.date}
Session Type/Label: ${session.label || 'Regular Session'}

📊 Attendance Statistics Summary:
- Total Participants: ${total}
- Presence Rate: ${rate}%
- Present: ${present}
- Absent: ${absent}
- Excused: ${excused}

✅ Required Activities Checklist:
${checklistText}

📝 Session Report Notes:
${notesText}

---
Generated and synchronized securely via CYDC Lomuriangole Case Management Engine.
UG 1083 Child Development Office All Rights Reserved.`;

      // Helper to compute end date (exclusive) securely
      const getNextDay = (dateStr: string) => {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const day = parseInt(parts[2], 10);
          const d = new Date(year, month, day);
          d.setDate(d.getDate() + 1);
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        }
        return dateStr;
      };

      const eventBody = {
        summary: `Lomuriangole CYDC: ${session.label || 'Regular Session'}`,
        description: descriptionText,
        colorId: "9", // Beautiful blueberry color accent
        start: { date: session.date },
        end: { date: getNextDay(session.date) }
      };

      // 2. See if event already exists on that date
      const minTime = `${session.date}T00:00:00Z`;
      const maxTime = `${session.date}T23:59:59Z`;
      const eventsRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?timeMin=${minTime}&timeMax=${maxTime}`, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });

      let existingEventId = null;
      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        const found = eventsData.items?.find((item: any) => item.summary?.includes('Lomuriangole CYDC') || item.start?.date === session.date);
        if (found) {
          existingEventId = found.id;
        }
      }

      if (existingEventId) {
        // Update existing calendar event
        const updateRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${existingEventId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeToken}`
          },
          body: JSON.stringify(eventBody)
        });
        if (!updateRes.ok) {
          throw new Error(`Failed to update calendar event: ${updateRes.statusText}`);
        }
      } else {
        // Create brand new calendar event
        const createEventRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeToken}`
          },
          body: JSON.stringify(eventBody)
        });
        if (!createEventRes.ok) {
          throw new Error(`Failed to create calendar event: ${createEventRes.statusText}`);
        }
      }

      setCalendarSyncSuccess(`Successfully synchronized session on ${session.date} to 'CYDC Lomuriangole' Google Calendar!`);
      logSystemAction('audit', 'Calendar Saved/Synced', `Synchronized program session date "${session.date}" directly to 'CYDC Lomuriangole' Google Calendar.`);
    } catch (err: any) {
      console.error("Google Calendar sync error:", err);
      setCalendarSyncError(err.message || 'Unknown calendar sync error');
    } finally {
      setIsSyncingToCalendar(false);
    }
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
    logSystemAction('transaction', 'Bulk Attendance Imported', `Processed roster scan for session "${attendanceImportDate}": marked ${matchedIds.size} present and ${activeParticipants.length - matchedIds.size} absent.`);
    
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
      logSystemAction('transaction', 'Database Backup Downloaded', `Exported comprehensive database JSON backup with ${participants.length} students.`);
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
          const pSeen = new Set<string>();
          const dedupedParticipants = restoredParticipants.filter((p: Participant) => {
            if (!p || !p.id || pSeen.has(p.id)) return false;
            pSeen.add(p.id);
            return true;
          });
          setParticipants(dedupedParticipants);
          const seen = new Set<string>();
          const dedupedSessions = restoredSessions.filter((s: Session) => {
            if (!s.date || seen.has(s.date)) return false;
            seen.add(s.date);
            return true;
          });
          setSessions(dedupedSessions);
          setAttendance(restoredAttendance);
          logSystemAction('audit', 'Database Backup Restored', `Overwrote database contents from backup file "${file.name}" with ${restoredParticipants.length} student files.`);
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
  const handleUpdateSessionData = (date: string, checklist?: Record<string, boolean>, notes?: string) => {
    setSessions(prev => prev.map(s => {
      if (s.date === date) {
        return { ...s, checklist: checklist !== undefined ? checklist : s.checklist, notes: notes !== undefined ? notes : s.notes };
      }
      return s;
    }));
  };

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
      logSystemAction('audit', 'System Demo Reset', 'Wiped database registries and reset the student roster to Lomuriangole CYDC defaults.');
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
      logSystemAction('audit', 'System Database Wipe', 'Completed full database wipe of student files, logs, and attendance markings.');
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
        logSystemAction('audit', 'Student Deleted Permanently', `Permanently erased archived student record ID: ${id} from Lomuriangole registries.`);
      }
    } else {
      const partName = participants.find(p => p.id === id)?.name || "this student";
      if (window.confirm(`Are you sure you want to archive/remove ${partName}? Their complete historical attendance logs and registered details will be preserved in the \"Former Participants\" list.`)) {
        setParticipants(prev => prev.map(p => p.id === id ? { ...p, isFormer: true, formerDate: new Date().toISOString().split('T')[0] } : p));
        if (selectedParticipantId === id) {
          setSelectedParticipantId(null);
        }
        logSystemAction('audit', 'Student Archived', `Archived active student [${partName}] into the Former Participants directory.`);
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
      logSystemAction('audit', 'Student Restored', `Restored archived student [${partName}] (ID: ${id}) back to the active tracking roster.`);
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
      logSystemAction('audit', 'Bulk Archive Registry', `Batch archived all ${activeParticipants.length} active students to Former Partners archives.`);
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
          const userCredential = await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
          if (userCredential.user) {
            await sendEmailVerification(userCredential.user);
          }
          setAuthMessage("Account registered successfully! A secure verification link has been dispatched to your email address. Please click the link inside your email (inspecting spam if necessary) to complete authentication and synchronize system data.");
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
              <div className="h-11 w-11 rounded-full overflow-hidden flex items-center justify-center bg-white shadow-md border border-slate-200">
                <LogoSVG className="h-full w-full" />
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
                onClick={() => setCurrentTab('roster-gallery')}
                className={`py-3 text-xs sm:text-sm font-semibold border-b-2 px-1 transition-all flex items-center gap-2 cursor-pointer ${
                  currentTab === 'roster-gallery'
                    ? 'border-slate-900 text-slate-900 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <LayoutGrid className="w-4 h-4 text-indigo-500" />
                Roster Gallery
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
                onClick={() => setCurrentTab('staff-portals')}
                className={`py-3 text-xs sm:text-sm font-semibold border-b-2 px-1 transition-all flex items-center gap-2 cursor-pointer ${
                  currentTab === 'staff-portals'
                    ? 'border-slate-900 text-slate-900 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <Activity className="w-4 h-4 text-rose-500 animate-pulse" />
                Staff Portals
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
              {/* Case Welfare Email Alerts Launcher */}
              <button
                onClick={() => {
                  const defaultDate = firstUnemailedFullyMarkedSession?.date || (sessions[0]?.date || null);
                  setEmailModalSelectedDate(defaultDate);
                  setIsEmailAlertModalOpen(true);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10.5px] sm:text-xs font-bold shadow-3xs cursor-pointer transition-all ${
                  firstUnemailedFullyMarkedSession
                    ? "bg-amber-500/10 border-amber-300 hover:bg-amber-500/20 text-amber-700 animate-pulse"
                    : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600"
                }`}
                title="Manage Case Alerts Email Dispatches & Settings"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Email Alerts</span>
                {firstUnemailedFullyMarkedSession && (
                  <span className="bg-amber-500 text-slate-950 text-[9px] font-extrabold px-1 py-0.2 rounded font-mono">
                    PENDING
                  </span>
                )}
              </button>

              {isAdminMode ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-[10.5px] sm:text-xs font-bold border border-emerald-200 shadow-3xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                  <span>🛡️ Staff Admin (Unlocked)</span>
                  <span className="text-emerald-300 pointer-events-none">|</span>
                  <span className="text-[10px] text-slate-500 font-sans font-medium shrink-0">Operator:</span>
                  <input
                    type="text"
                    placeholder="Enter your name to sign logs..."
                    value={operatorName}
                    onChange={(e) => handleUpdateOperatorName(e.target.value)}
                    className="bg-white border border-emerald-200 rounded px-2 py-0.5 text-[10px] font-bold text-slate-800 w-32 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                    title="Enter your custom name to trace changes in the Security Audit Trail and Transaction Journals"
                  />
                  <button 
                    onClick={() => {
                      setIsAdminMode(false);
                      setIsEditingProfile(false);
                      logSystemAction('audit', 'Admin Session Terminated', `${operatorName.trim() || 'Staff Administrator'} session terminated and status locked down.`, operatorName.trim());
                    }}
                    className="ml-1 text-[9.5px] text-emerald-800 hover:text-rose-600 font-extrabold cursor-pointer border-l pl-2 border-emerald-300"
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
                      logSystemAction('audit', 'Admin Space Unlocked', 'Privileged Administrator session initiated using verification passcode.', 'Admin Operator');
                    } else {
                      setPasscodeError('Invalid Code');
                      logSystemAction('audit', 'Admin Unlock Failed', 'Unauthorized access warning: incorrect PIN security key entered during validation.', 'Secured Terminal');
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
             {/* COMPLETED SESSION ALERT PROMPT BANNER */}
             {isAutomaticEmailEnabled && firstUnemailedFullyMarkedSession && (
               <div id="session-email-prompt-banner" className="bg-gradient-to-r from-amber-50 to-amber-100/55 border border-amber-200/90 rounded-2xl p-4 mb-6 shadow-3xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-sans animate-fade-in relative overflow-hidden">
                 <div className="absolute top-0 right-0 h-24 w-24 bg-amber-500/10 rounded-full blur-xl -mr-6 -mt-6"></div>
                 <div className="flex items-start gap-3 relative z-10">
                   <div className="bg-amber-500 rounded-xl p-2.5 text-slate-950 shrink-0 shadow-2xs animate-pulse">
                     <Mail className="w-5 h-5" />
                   </div>
                   <div>
                     <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 uppercase tracking-wide">
                       📧 Case Welfare Alerts Ready for Dispatch
                     </h4>
                     <p className="text-[11px] text-slate-800 mt-1 leading-relaxed max-w-2xl font-medium">
                       Class session on <strong>{firstUnemailedFullyMarkedSession.date} {firstUnemailedFullyMarkedSession.label ? `(${firstUnemailedFullyMarkedSession.label})` : ''}</strong> is completely marked. An alert summary email outlining red and yellow student status flags has not been dispatched to staff yet.
                     </p>
                   </div>
                 </div>
                 
                 <div className="flex shrink-0 gap-2 w-full md:w-auto relative z-10 self-stretch md:self-auto items-end justify-end">
                   <button
                     type="button"
                     onClick={() => {
                       dismissEmailAlertPrompt(firstUnemailedFullyMarkedSession.date);
                     }}
                     className="w-full md:w-auto bg-white/80 hover:bg-white text-slate-750 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 shadow-3xs cursor-pointer transition-all"
                     title="Dismiss this reminder. You can still email alert summaries manually from the Email Alerts button."
                   >
                     Skip / Dismiss
                   </button>
                   <button
                     type="button"
                     onClick={() => {
                       setEmailModalSelectedDate(firstUnemailedFullyMarkedSession.date);
                       setIsEmailAlertModalOpen(true);
                     }}
                     className="w-full md:w-auto bg-amber-500 hover:bg-amber-600 text-slate-955 text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-2xs cursor-pointer flex items-center justify-center gap-1.5 hover:scale-[1.01]"
                     title="Review details and dispatch Single alert email securely to Lomuriangole staff."
                   >
                     <Mail className="w-3.5 h-3.5 shrink-0" />
                     Review & Send Email
                   </button>
                 </div>
               </div>
             )}

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
                       {dueCheckInParticipantsList.slice(0, 4).map((p, pIdx) => {
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
                             key={`${p.id}-${pIdx}`}
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
                      {sessions.map((s, sIdx) => (
                        <option key={`${s.date}-${sIdx}`} value={s.date}>
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
                  disabled={!isAdminMode}
                  onClick={() => handleBulkSetAttendance('present')}
                  className={`font-bold text-xs py-2 px-4 rounded-xl shadow-2xs transition-colors flex items-center gap-1 ${
                    isAdminMode
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                      : "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed text-[11px] pointer-events-none"
                  }`}
                  title={isAdminMode ? "Set all currently displayed participants as Present" : "Accidental edit protection: please unlock Admin Mode first"}
                >
                  Bulk Set Present
                </button>
                <button
                  type="button"
                  disabled={!isAdminMode}
                  onClick={() => handleBulkSetAttendance('absent')}
                  className={`font-bold text-xs py-2 px-4 rounded-xl shadow-2xs transition-colors flex items-center gap-1 ${
                    isAdminMode
                      ? "bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                      : "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed text-[11px] pointer-events-none"
                  }`}
                  title={isAdminMode ? "Set all currently displayed participants as Absent" : "Accidental edit protection: please unlock Admin Mode first"}
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
                      key={`${day.date}-${idx}`}
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
                                          {day.absentParticipants.map((absParticipant, absIdx) => (
                                            <div 
                                              key={`${absParticipant.id}-${absIdx}`}
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
                                {day.absentParticipants.map((absParticipant, absIdx) => (
                                  <div 
                                    key={`${absParticipant.id}-${absIdx}`}
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
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setSelectedSessionDate(day.session!.date)}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg text-[10px] font-extrabold cursor-pointer transition-colors border border-emerald-150"
                              title="Inspect session notes and checklist"
                            >
                              Inspect
                            </button>
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
                              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg text-[10px] font-extrabold cursor-pointer transition-colors border border-indigo-150"
                              title={isAdminMode ? "Edit session date/label details" : "Lock - Enable Admin Mode to edit session"}
                            >
                              Edit
                            </button>
                          </div>
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

              {/* Village Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-semibold font-mono">Village:</span>
                <select
                  value={selectedVillage}
                  onChange={(e) => setSelectedVillage(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl text-xs py-2 px-3 font-medium text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
                >
                  <option value="All Villages">All Villages</option>
                  {uniqueVillages.map(v => (
                    <option key={v} value={v}>
                      🏡 {v}
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

              {/* School Status & Class Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-semibold font-mono">School:</span>
                <select
                  value={selectedSchoolingStatus}
                  onChange={(e) => setSelectedSchoolingStatus(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl text-xs py-2 px-3 font-semibold text-slate-705 focus:outline-none focus:border-slate-400 cursor-pointer"
                >
                  <option value="All">All Period</option>
                  <option value="Day Scholar">School Time (Day Scholars)</option>
                  <option value="Boarder">Boarders</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-semibold font-mono">Class:</span>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={selectedSchoolClass === 'All' ? '' : selectedSchoolClass}
                    onChange={(e) => setSelectedSchoolClass(e.target.value || 'All')}
                    placeholder="All Classes"
                    className="bg-slate-50 border border-slate-200 rounded-xl text-xs py-2 px-3 font-semibold text-slate-705 focus:outline-none focus:border-slate-400 w-28"
                  />
                  {selectedSchoolClass !== 'All' && (
                    <button 
                      onClick={() => setSelectedSchoolClass('All')}
                      className="absolute right-2 text-slate-400 hover:text-slate-600"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
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

              {/* Year Range Filter */}
              <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                <span className="text-xs text-slate-400 font-semibold font-mono">Years:</span>
                <select
                  value={filterYearType}
                  onChange={(e) => setFilterYearType(e.target.value as 'join' | 'dob')}
                  className="bg-slate-50 border border-slate-200 rounded-xl text-xs py-2 px-2.5 font-semibold text-slate-705 focus:outline-none focus:border-slate-400 cursor-pointer"
                  title="Choose whether to filter by Join/Enrollment Year or Birth Year (DOB)"
                >
                  <option value="join">📅 Join Year</option>
                  <option value="dob">🎂 Birth Year</option>
                </select>
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 focus-within:border-slate-400 transition-colors">
                  <select
                    value={filterYearStart}
                    onChange={(e) => setFilterYearStart(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer w-16"
                    title="Minimum/Start Year"
                  >
                    <option key="start-placeholder" value="">Start</option>
                    {availableYears.map(yr => (
                      <option key={`start-yr-${yr}`} value={yr}>{yr}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-slate-400 font-bold font-mono">-</span>
                  <select
                    value={filterYearEnd}
                    onChange={(e) => setFilterYearEnd(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer w-16"
                    title="Maximum/End Year"
                  >
                    <option key="end-placeholder" value="">End</option>
                    {availableYears.map(yr => (
                      <option key={`end-yr-${yr}`} value={yr}>{yr}</option>
                    ))}
                  </select>
                  {(filterYearStart || filterYearEnd) && (
                    <button 
                      type="button"
                      onClick={() => { setFilterYearStart(''); setFilterYearEnd(''); }}
                      className="text-slate-400 hover:text-slate-600 ml-1 cursor-pointer transition-colors"
                      title="Clear year range"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Age Range & Bracket Filter */}
              <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                <span className="text-xs text-slate-400 font-semibold font-mono">Age Bracket:</span>
                <select
                  value={derivedAgeBracket}
                  onChange={(e) => {
                    const selected = AGE_BRACKETS.find(b => b.id === e.target.value);
                    if (selected) {
                      setFilterAgeStart(selected.min);
                      setFilterAgeEnd(selected.max);
                    }
                  }}
                  className="bg-slate-50 border border-slate-200 rounded-xl text-xs py-2 px-2.5 font-semibold text-slate-705 focus:outline-none focus:border-slate-400 cursor-pointer"
                  title="Choose preset Age Bracket or edit exact years range"
                >
                  {AGE_BRACKETS.map(b => (
                    <option key={`bracket-${b.id}`} value={b.id}>{b.label}</option>
                  ))}
                  {derivedAgeBracket === 'custom' && (
                    <option key="bracket-custom" value="custom">⚙️ Custom Limits</option>
                  )}
                </select>

                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 focus-within:border-slate-400 transition-colors">
                  <span className="text-[10px] text-slate-400 font-bold font-mono">Min:</span>
                  <select
                    value={filterAgeStart}
                    onChange={(e) => setFilterAgeStart(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer w-12"
                    title="Minimum Age"
                  >
                    <option key="age-start-any" value="">Any</option>
                    {Array.from({ length: 23 }, (_, i) => i + 3).map(age => (
                      <option key={`age-start-val-${age}`} value={age}>{age}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-slate-400 font-bold font-mono">Max:</span>
                  <select
                    value={filterAgeEnd}
                    onChange={(e) => setFilterAgeEnd(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer w-12"
                    title="Maximum Age"
                  >
                    <option key="age-end-any" value="">Any</option>
                    {Array.from({ length: 23 }, (_, i) => i + 3).map(age => (
                      <option key={`age-end-val-${age}`} value={age}>{age}</option>
                    ))}
                  </select>
                  {(filterAgeStart || filterAgeEnd) && (
                    <button 
                      type="button"
                      onClick={() => { setFilterAgeStart(''); setFilterAgeEnd(''); }}
                      className="text-slate-400 hover:text-slate-600 ml-1 cursor-pointer transition-colors"
                      title="Clear age filters"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
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
                  onClick={() => { setSearchQuery(''); setSelectedCohort('All Cohorts'); setSelectedVillage('All Villages'); setSelectedFlag('all'); }}
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
                    {sessions.map((session, sIdx) => {
                      const isFullyMarked = activeParticipants.length > 0 && activeParticipants.every(p => {
                        const status = attendance[p.id]?.[session.date];
                        return status && status !== 'unmarked';
                      });
                      const isEmailed = emailedSessionDates.includes(session.date);
                      return (
                        <th key={`${session.date}-${sIdx}`} className="py-3 px-3 w-32 border-l border-slate-200/80 text-center select-none shadow-3xs hover:bg-slate-50/50 transition-colors relative group">
                          <div className="font-semibold text-slate-800">{formatToShortDayMonth(session.date)}</div>
                          <div className="font-mono text-[9px] text-slate-400/90 font-normal mt-0.5 whitespace-nowrap">
                            {session.label || 'Session'}
                          </div>
                          
                          {/* Interactive Email Dispatch Trigger Icon */}
                          {isFullyMarked && (
                            <div className="mt-1 flex items-center justify-center">
                              {isEmailed ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEmailModalSelectedDate(session.date);
                                    setIsEmailAlertModalOpen(true);
                                  }}
                                  className="text-emerald-600 hover:text-emerald-700 hover:scale-105 transition-all inline-flex items-center gap-1 py-0.5 px-1.5 rounded-md bg-emerald-50 border border-emerald-100 cursor-pointer"
                                  title="Welfare Alert email has been successfully dispatched. Click to inspect or re-transmit."
                                >
                                  <CheckCircle className="h-2.5 w-2.5 shrink-0" />
                                  <span className="text-[8.5px] font-bold font-mono tracking-wide uppercase">Sent</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEmailModalSelectedDate(session.date);
                                    setIsEmailAlertModalOpen(true);
                                  }}
                                  className="text-amber-600 hover:text-indigo-650 hover:scale-105 transition-all inline-flex items-center gap-1 py-0.5 px-1.5 rounded-md bg-amber-50 border border-amber-200 cursor-pointer animate-pulse"
                                  title="Welfare Alert email is pending! Click to dispatch this session report to staff."
                                >
                                  <Mail className="h-2.5 w-2.5 shrink-0" />
                                  <span className="text-[8.5px] font-bold font-mono tracking-wide uppercase">Alert</span>
                                </button>
                              )}
                            </div>
                          )}

                          {/* Hover date details tooltip */}
                          <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-slate-900 text-white text-[10px] py-1 px-2.5 rounded shadow-lg whitespace-nowrap z-10 font-sans normal-case">
                            Date: {formatToReadableDate(session.date)}
                          </div>
                        </th>
                      );
                    })}
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
                  {filteredParticipants.map((part, partIdx) => {
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
                        key={`${part.id}-${partIdx}`} 
                        className={`transition-colors group ${alertRowStyle} ${alertBorderColor}`}
                      >
                        {/* Participant Details Column (Sticky) */}
                        <td className="p-3 sm:p-4 px-3 sm:px-4 sticky left-0 bg-white group-hover:bg-slate-50/60 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] transition-colors min-w-[195px] sm:min-w-[260px] max-w-[215px] sm:max-w-[300px] select-none">
                          <div className="flex items-center gap-2.5">
                            {/* Avatar */}
                            <div 
                              onClick={() => setSelectedParticipantId(part.id)}
                              className={`h-8 w-8 sm:h-9 sm:w-9 rounded-xl border flex items-center justify-center font-bold text-xs uppercase cursor-pointer transition-transform hover:scale-105 select-none ${part.avatarColor} overflow-hidden shrink-0`}
                            >
                              {part.photoUrl ? (
                                <img src={part.photoUrl} alt={part.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                part.name.split(' ').map(n => n[0]).join('').slice(0, 2)
                              )}
                            </div>
                            
                            {/* Details clickable text to open Side-inspector info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span 
                                  onClick={() => setSelectedParticipantId(part.id)}
                                  className="font-semibold text-slate-850 hover:text-indigo-700 cursor-pointer transition-colors block truncate max-w-[95px] sm:max-w-[160px]"
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
                        {sessions.map((session, sIdx) => {
                          const status: AttendanceStatus = (attendance[part.id] && attendance[part.id][session.date]) || 'unmarked';
                          
                          // Style based on cell status values
                          let statusIcon = <HelpCircle className="h-3.5 w-3.5 text-slate-300" />;
                          let cellBgClass = isAdminMode ? 'hover:bg-slate-100/50' : '';
                          let titleText = `Toggle attendance: currently Unmarked`;

                          if (status === 'present') {
                            statusIcon = <CheckCircle className={`h-4.5 w-4.5 ${isAdminMode ? 'text-emerald-600' : 'text-emerald-500/80'} fill-emerald-50/50`} />;
                            cellBgClass = 'bg-emerald-50/15' + (isAdminMode ? ' hover:bg-emerald-50/30' : '');
                            titleText = `${part.name} Present on ${formatToShortDayMonth(session.date)}`;
                          } else if (status === 'absent') {
                            statusIcon = <XCircle className={`h-4.5 w-4.5 ${isAdminMode ? 'text-rose-55' : 'text-rose-400/85'} fill-rose-50/40`} />;
                            cellBgClass = 'bg-rose-55/10' + (isAdminMode ? ' hover:bg-rose-100/30' : '');
                            titleText = `${part.name} Absent on ${formatToShortDayMonth(session.date)}`;
                          } else if (status === 'excused') {
                            statusIcon = <MinusCircle className={`h-4.5 w-4.5 ${isAdminMode ? 'text-slate-500/80' : 'text-slate-400/80'} fill-slate-100/50`} />;
                            cellBgClass = 'bg-slate-50' + (isAdminMode ? ' hover:bg-slate-100/40' : '');
                            titleText = `${part.name} Excused on ${formatToShortDayMonth(session.date)}`;
                          }

                          if (!isAdminMode) {
                            titleText += " (Locked - Unlock Admin Mode to alter)";
                          }

                          return (
                            <td 
                              key={`${session.date}-${sIdx}`} 
                              className={`p-3 text-center border-l border-slate-100/70 select-none ${cellBgClass} transition-colors relative group/cell`}
                            >
                              <div className="flex items-center justify-center">
                                {/* Click to Cycle button */}
                                <button
                                  type="button"
                                  disabled={!isAdminMode}
                                  onClick={() => toggleAttendanceStatus(part.id, session.date)}
                                  className={`outline-none p-1.5 rounded-lg transition-transform ${
                                    isAdminMode 
                                      ? "focus:ring-1 focus:ring-slate-350 hover:scale-110 active:scale-95 cursor-pointer" 
                                      : "cursor-not-allowed opacity-75 pointer-events-none"
                                  }`}
                                  title={titleText}
                                >
                                  {statusIcon}
                                </button>
                              </div>

                              {/* Small Popover Menu on Cell Hover for Quick Access to Explicit States */}
                              {isAdminMode && (
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
                              )}
                            </td>
                          );
                        })}

                        {/* Attendance percentage overview Column */}
                        <td className={`p-4 text-center border-l border-slate-100/70 ${stats && stats.attendanceRate < 80 && stats.totalSessions > 0 ? 'bg-rose-50/30' : ''}`}>
                          <div className="flex flex-col items-center justify-center mx-auto">
                            <button
                              type="button"
                              onClick={() => setSelectedParticipantId(part.id)}
                              className="flex flex-col items-center justify-center hover:bg-indigo-50/50 p-1.5 rounded-xl transition-all cursor-pointer border border-transparent hover:border-indigo-150 group/rate outline-hidden animate-fadeIn"
                              title="Click to view full engagement analysis and details"
                            >
                              <span className={`font-mono font-bold text-xs flex items-center gap-1 ${stats && stats.attendanceRate < 80 && stats.totalSessions > 0 ? 'text-rose-700 font-extrabold' : 'text-slate-800'} group-hover/rate:text-indigo-700`}>
                                {stats?.attendanceRate}%
                                <TrendingUp className="h-3 w-3 text-indigo-550 opacity-60 group-hover/rate:opacity-100 group-hover/rate:scale-110 transition-all" />
                              </span>
                              
                              {/* Fraction indicator */}
                              <span className="text-[10px] text-slate-450 mt-0.5 block group-hover/rate:text-indigo-650">
                                Absent: {stats?.totalAbsent}/{stats?.totalSessions}
                              </span>

                              {/* Alert labels helper */}
                              {stats && stats.totalAbsent > 0 && (
                                <div className="flex flex-col items-center gap-1 mt-1">
                                  {stats.consecutiveAbsences >= 2 && (
                                    <span className="text-[9px] px-1 bg-amber-100 text-amber-700 rounded font-bold font-mono">
                                      {stats.consecutiveAbsences} Consec
                                    </span>
                                  )}
                                  {stats.attendanceRate < 80 && (
                                    <span className="text-[8px] px-1.5 py-0.2 bg-rose-100 text-rose-700 border border-rose-200 rounded-md font-bold uppercase tracking-tight scale-95 font-sans animate-pulse">
                                      ⚠️ Low Attendance
                                    </span>
                                  )}
                                </div>
                              )}
                            </button>

                            {/* Quick intervention action button */}
                            {stats && stats.attendanceRate < 80 && stats.totalSessions > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setQuickLogParticipantId(part.id);
                                  setQuickLogNotes(`Rapid response home visit or phone check-in logged. Contacted caregiver regarding recent child enrollment attendance rate falling down to ${stats.attendanceRate}%.`);
                                }}
                                className="mt-1.5 px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-extrabold uppercase tracking-wider rounded-md transition-all shadow-3xs cursor-pointer hover:scale-102 flex items-center gap-1"
                                title={`Click to quickly log a caregiver discussion for ${part.name}`}
                              >
                                📞 Quick Log
                              </button>
                            )}
                          </div>
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
                    {sessions.map((session, sIdx) => {
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
                          key={`foot-${session.date}-${sIdx}`} 
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

        {currentTab === 'roster-gallery' && (
          <div className="space-y-6 animate-fade-in font-sans">
            {/* Header section with admin mode status */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white rounded-3xl p-6 shadow-md relative overflow-hidden">
              <div className="absolute top-0 right-0 h-32 w-32 bg-indigo-500/10 rounded-full blur-2xl -mr-8 -mt-8"></div>
              <div className="relative z-10">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
                  <LayoutGrid className="w-6 h-6 text-indigo-400" />
                  Roster Gallery
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 mt-1">
                  Grid-based visual check-in dashboard with real-time student profiles and direct check-in actions.
                </p>
              </div>

              {/* Status Shield */}
              <div className="relative z-10 flex flex-wrap items-center gap-3">
                {isAdminMode ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl px-4 py-2 flex items-center gap-2 text-xs font-semibold">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    🔓 Admin Edit Mode: Unlocked
                  </div>
                ) : (
                  <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-2xl px-4 py-2 flex items-center gap-2 text-xs font-semibold">
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse"></span>
                    🔒 Admin Edit Lock: Locked (Read-Only)
                  </div>
                )}
                
                {/* Session select dropdown */}
                <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-2xl px-3 py-1.5 text-xs">
                  <span className="text-slate-400 font-medium">Session:</span>
                  <select
                    value={gallerySelectedSessionDate}
                    onChange={(e) => setGallerySelectedSessionDate(e.target.value)}
                    className="bg-transparent font-bold text-white border-none outline-none focus:ring-0 cursor-pointer text-xs"
                  >
                    {sessions.map((s) => (
                      <option key={s.date} value={s.date} className="bg-slate-800 text-white">
                        {formatToShortDayMonth(s.date)} {s.label ? `(${s.label})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Quick Session Stats Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-3xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Session Target</span>
                <span className="text-lg font-extrabold text-slate-800 mt-1">
                  {galleryStatsForSelectedSession.total} <span className="text-xs font-normal text-slate-400">students</span>
                </span>
              </div>
              
              <div className="p-3 bg-emerald-50/45 rounded-xl border border-emerald-100/65 flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-emerald-600 font-mono flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Present
                </span>
                <span className="text-lg font-extrabold text-emerald-800 mt-1">
                  {galleryStatsForSelectedSession.present}
                  <span className="text-xs font-normal text-emerald-500 ml-1.5">
                    ({galleryStatsForSelectedSession.total > 0 ? Math.round((galleryStatsForSelectedSession.present / galleryStatsForSelectedSession.total) * 100) : 0}%)
                  </span>
                </span>
              </div>

              <div className="p-3 bg-rose-50/45 rounded-xl border border-rose-100/65 flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-rose-500/90 font-mono flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-450"></span> Absent
                </span>
                <span className="text-lg font-extrabold text-rose-800 mt-1">
                  {galleryStatsForSelectedSession.absent}
                  <span className="text-xs font-normal text-rose-400 ml-1.5">
                    ({galleryStatsForSelectedSession.total > 0 ? Math.round((galleryStatsForSelectedSession.absent / galleryStatsForSelectedSession.total) * 100) : 0}%)
                  </span>
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-150 flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-slate-500 font-mono flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span> Excused
                </span>
                <span className="text-lg font-extrabold text-slate-700 mt-1">
                  {galleryStatsForSelectedSession.excused}
                  <span className="text-xs font-normal text-slate-400 ml-1.5">
                    ({galleryStatsForSelectedSession.total > 0 ? Math.round((galleryStatsForSelectedSession.excused / galleryStatsForSelectedSession.total) * 100) : 0}%)
                  </span>
                </span>
              </div>

              <div className="col-span-2 sm:col-span-1 p-3 bg-amber-50/45 rounded-xl border border-amber-100 flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-amber-600 font-mono flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span> Unmarked
                </span>
                <span className="text-lg font-extrabold text-amber-800 mt-1">
                  {galleryStatsForSelectedSession.unmarked}
                  <span className="text-xs font-normal text-amber-500 ml-1.5">
                    ({galleryStatsForSelectedSession.total > 0 ? Math.round((galleryStatsForSelectedSession.unmarked / galleryStatsForSelectedSession.total) * 100) : 0}%)
                  </span>
                </span>
              </div>
            </div>

            {/* Gallery Filter Toolbar */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-3xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                {/* Search query */}
                <div className="relative min-w-[200px] flex-1 md:flex-initial">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search student name or ID..."
                    value={gallerySearchQuery}
                    onChange={(e) => setGallerySearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs w-full focus:outline-none focus:border-indigo-500 transition-colors placeholder-slate-400 shadow-3xs"
                  />
                  {gallerySearchQuery && (
                    <button
                      onClick={() => setGallerySearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Cohort Select dropdown */}
                <select
                  value={gallerySelectedCohort}
                  onChange={(e) => setGallerySelectedCohort(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer shadow-3xs"
                >
                  {COHORTS.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                {/* Village select dropdown */}
                <select
                  value={gallerySelectedVillage}
                  onChange={(e) => setGallerySelectedVillage(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer shadow-3xs"
                >
                  <option value="All Villages">All Villages</option>
                  {uniqueVillages.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>

                {/* Status select dropdown */}
                <select
                  value={galleryStatusFilter}
                  onChange={(e) => setGalleryStatusFilter(e.target.value as any)}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer shadow-3xs"
                >
                  <option value="all">All Attendance States</option>
                  <option value="present">Present Only</option>
                  <option value="absent">Absent Only</option>
                  <option value="excused">Excused Only</option>
                  <option value="unmarked">Unmarked Only</option>
                </select>
              </div>

              {/* Reset Filters button */}
              {(gallerySearchQuery || gallerySelectedCohort !== 'All Cohorts' || gallerySelectedVillage !== 'All Villages' || galleryStatusFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setGallerySearchQuery('');
                    setGallerySelectedCohort('All Cohorts');
                    setGallerySelectedVillage('All Villages');
                    setGalleryStatusFilter('all');
                  }}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 cursor-pointer self-end md:self-auto bg-indigo-50 hover:bg-indigo-100/75 px-3 py-2 rounded-xl transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Filters
                </button>
              )}
            </div>

            {/* Gallery Grid */}
            {galleryFilteredParticipants.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-3xs animate-fade-in">
                <LayoutGrid className="w-12 h-12 text-slate-300 mx-auto stroke-[1.2]" />
                <h3 className="font-bold text-slate-800 mt-4 text-sm">No Participants Found</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Try adjusting your search queries or dropdown filters to find students in the active roster.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-fade-in">
                {galleryFilteredParticipants.map((p) => {
                  const sessionDate = gallerySelectedSessionDate || (sessions[sessions.length - 1]?.date || '');
                  const currentStatus = (attendance[p.id] && attendance[p.id][sessionDate]) || 'unmarked';

                  // Styles for state badges
                  let statusLabel = 'Unmarked';
                  let statusBadgeStyles = 'bg-slate-100 text-slate-500 border-slate-200';
                  
                  if (currentStatus === 'present') {
                    statusLabel = 'Present';
                    statusBadgeStyles = 'bg-emerald-50 text-emerald-700 border-emerald-100 font-bold';
                  } else if (currentStatus === 'absent') {
                    statusLabel = 'Absent';
                    statusBadgeStyles = 'bg-rose-50 text-rose-700 border-rose-150 font-bold';
                  } else if (currentStatus === 'excused') {
                    statusLabel = 'Excused';
                    statusBadgeStyles = 'bg-slate-50 text-slate-600 border-slate-150 font-bold';
                  }

                  return (
                    <div 
                      key={p.id}
                      className="bg-white border border-slate-200 rounded-2xl p-4 shadow-3xs hover:shadow-2xs transition-all relative group flex flex-col justify-between"
                    >
                      {/* Interactive Inspector trigger block */}
                      <div className="flex flex-col items-center text-center cursor-pointer mb-3.5" onClick={() => setSelectedParticipantId(p.id)}>
                        {/* Profile photo with hover zoom effect */}
                        <div className="relative mb-3">
                          <div className={`h-20 w-20 rounded-full border-4 border-slate-50 flex items-center justify-center font-extrabold text-lg uppercase shadow-3xs overflow-hidden select-none transition-transform group-hover:scale-105 ${p.avatarColor}`}>
                            {p.photoUrl ? (
                              <img src={p.photoUrl} alt={p.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              p.name.split(' ').map(n => n[0]).join('').slice(0, 2)
                            )}
                          </div>
                          
                          {/* Top corner gender badge */}
                          {p.gender && (
                            <span className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold shadow-3xs ${
                              p.gender.toLowerCase() === 'female' ? 'bg-fuchsia-100 text-fuchsia-700' : 'bg-sky-100 text-sky-700'
                            }`}>
                              {p.gender.toLowerCase() === 'female' ? 'F' : 'M'}
                            </span>
                          )}
                        </div>

                        {/* Name and Cohort details */}
                        <h4 className="font-bold text-sm text-slate-800 hover:text-indigo-700 transition-colors line-clamp-1">
                          {p.name}
                        </h4>
                        
                        <div className="flex flex-wrap justify-center gap-1.5 mt-1.5">
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 rounded-md px-1.5 py-0.5">
                            {p.cohort}
                          </span>
                          {p.village && (
                            <span className="text-[10px] font-semibold text-slate-400 bg-slate-50 border border-slate-100 rounded-md px-1.5 py-0.5 max-w-[90px] truncate" title={p.village}>
                              🏡 {p.village}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Attendance current badge and actions */}
                      <div className="border-t border-slate-100 pt-3">
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Status:</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border text-center select-none ${statusBadgeStyles}`}>
                            {statusLabel}
                          </span>
                        </div>

                        {/* Quick toggle check-in action group */}
                        <div className="grid grid-cols-4 gap-1">
                          <button
                            type="button"
                            onClick={() => setSpecificAttendance(p.id, sessionDate, 'present')}
                            className={`py-1 text-[10px] font-bold rounded-lg border cursor-pointer transition-all ${
                              currentStatus === 'present'
                                ? 'bg-emerald-500 border-emerald-500 text-white shadow-3xs'
                                : 'bg-white hover:bg-emerald-50 text-emerald-600 border-emerald-100'
                            }`}
                            title={`Mark ${p.name} as Present`}
                          >
                            P
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => setSpecificAttendance(p.id, sessionDate, 'absent')}
                            className={`py-1 text-[10px] font-bold rounded-lg border cursor-pointer transition-all ${
                              currentStatus === 'absent'
                                ? 'bg-rose-500 border-rose-500 text-white shadow-3xs'
                                : 'bg-white hover:bg-rose-50 text-rose-600 border-rose-100'
                            }`}
                            title={`Mark ${p.name} as Absent`}
                          >
                            A
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => setSpecificAttendance(p.id, sessionDate, 'excused')}
                            className={`py-1 text-[10px] font-bold rounded-lg border cursor-pointer transition-all ${
                              currentStatus === 'excused'
                                ? 'bg-slate-500 border-slate-500 text-white shadow-3xs'
                                : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-150'
                            }`}
                            title={`Mark ${p.name} as Excused`}
                          >
                            E
                          </button>

                          <button
                            type="button"
                            onClick={() => setSpecificAttendance(p.id, sessionDate, 'unmarked')}
                            className="py-1 text-[10px] font-bold rounded-lg border bg-white hover:bg-slate-100 text-slate-500 border-slate-200 cursor-pointer transition-all"
                            title={`Clear ${p.name}'s attendance markings`}
                          >
                            C
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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

            const matchesStartDate = !journalStartDate || entry.log.date >= journalStartDate;
            const matchesEndDate = !journalEndDate || entry.log.date <= journalEndDate;

            return matchesSearch && matchesStatus && matchesAlert && matchesStartDate && matchesEndDate;
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
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-3xs space-y-3.5">
                <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
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

                {/* DATE RANGE FILTER ROW */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex items-center gap-1.5 font-sans">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">Date Range:</span>
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={journalStartDate}
                        onChange={(e) => setJournalStartDate(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-750 font-medium focus:outline-none cursor-pointer hover:bg-slate-100 font-sans"
                      />
                      <span className="text-slate-400 text-xs font-mono">to</span>
                      <input
                        type="date"
                        value={journalEndDate}
                        onChange={(e) => setJournalEndDate(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-750 font-medium focus:outline-none cursor-pointer hover:bg-slate-100 font-sans"
                      />
                    </div>

                    {(journalStartDate || journalEndDate) && (
                      <button
                        onClick={() => {
                          setJournalStartDate('');
                          setJournalEndDate('');
                        }}
                        className="text-[11px] font-medium text-red-600 hover:text-red-750 bg-red-50 hover:bg-red-100/70 border border-red-100 rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        Reset Dates
                      </button>
                    )}
                  </div>

                  {(journalStartDate || journalEndDate) && (
                    <div className="text-[11px] text-slate-500 bg-slate-100/50 border border-slate-200 rounded-lg px-2.5 py-1 font-sans">
                      Filtering logs: <span className="font-mono text-indigo-700 font-semibold">{journalStartDate || 'Anytime'}</span> to <span className="font-mono text-indigo-700 font-semibold">{journalEndDate || 'Anytime'}</span>
                    </div>
                  )}
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
                  {filteredJournalEntries.map((entry, entryIdx) => {
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
                        key={`journal-${entry.participant.id}-${entryIdx}`} 
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

              {/* APPROVED BUDGETS LEDGER SECTION */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs mt-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 mb-6 gap-3">
                  <div>
                    <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                      <span className="p-1.5 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-600">
                        <Receipt className="w-4 h-4" />
                      </span>
                      📋 Approved Activity Budgets Ledger
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">Official authorized program activity estimates and budget authorizations.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {budgets.filter(b => b.status === 'Approved').map(budget => (
                    <div key={budget.id} className="border border-slate-200 hover:border-slate-300 rounded-2xl p-5 bg-slate-50/40 hover:bg-slate-50/75 transition-all shadow-3xs flex flex-col justify-between relative overflow-hidden">
                      {/* Status indicator strip */}
                      <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />

                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold">
                              {budget.id}
                            </span>
                            <span className="text-[10px] font-black uppercase bg-emerald-50 border border-emerald-150 text-emerald-700 px-2.5 py-0.5 rounded-lg">
                              {budget.category}
                            </span>
                            <span className="text-xs text-slate-400 font-mono">Approved: {budget.submittedAt}</span>
                            <span className="text-xs text-slate-400 font-bold font-mono">Department: {budget.submittedBy}</span>
                          </div>
                          <h4 className="text-sm font-extrabold text-slate-900 mt-1">{budget.title}</h4>
                          <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">{budget.description}</p>
                        </div>

                        <div className="flex flex-col items-start md:items-end gap-1.5 shrink-0">
                          <p className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">AUTHORIZED AMOUNT</p>
                          <p className="text-lg font-black text-slate-900 font-mono">UGX {budget.amount.toLocaleString()}</p>
                        </div>
                      </div>

                      {/* Detailed line items */}
                      {budget.items && budget.items.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 font-mono">Authorized Expenditure Breakdown</p>
                          <div className="flex flex-wrap gap-2">
                            {(budget.items || []).map((item, idx) => {
                              if (!item) return null;
                              return (
                                <span key={`bgt-item-journal-${budget.id}-${idx}`} className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-[10.5px] text-slate-600 font-medium">
                                  {item.name || 'Expense Item'} <span className="text-slate-400 font-normal">({item.qty || 0} × UGX {(item.unitCost || 0).toLocaleString()})</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Action buttons (Print/Save in journal) */}
                      <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => generateBudgetPDF(budget, true)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] py-1.5 px-3 rounded-lg border border-slate-250 cursor-pointer flex items-center gap-1 shadow-3xs"
                            title="Print this budget report"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Print Budget
                          </button>
                          <button
                            type="button"
                            onClick={() => generateBudgetPDF(budget, false)}
                            className="bg-white hover:bg-slate-50 text-slate-600 font-bold text-[11px] py-1.5 px-3 rounded-lg border border-slate-200 cursor-pointer flex items-center gap-1"
                            title="Download official PDF document"
                          >
                            Download PDF
                          </button>
                        </div>
                        
                        <div className="text-[10.5px] text-slate-400 font-mono italic">
                          Authorized Official Record • Lomuriangole CDC
                        </div>
                      </div>

                    </div>
                  ))}

                  {budgets.filter(b => b.status === 'Approved').length === 0 && (
                    <div className="text-center py-8 text-slate-400 italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                      No approved budgets currently in ledger. Once Project Director approves a department budget, it will appear here.
                    </div>
                  )}
                </div>
              </div>
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
            {/* AI REPORT FILTERS */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row items-end gap-4 shadow-3xs">
              <div className="flex-1 space-y-1 w-full relative">
                <label className="text-xs font-semibold text-slate-500 block">Report Start Date (Optional)</label>
                <input
                  type="date"
                  value={aiReportStartDate}
                  onChange={(e) => setAiReportStartDate(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none placeholder:text-slate-300 transition-colors"
                />
              </div>
              <div className="flex-1 space-y-1 w-full relative">
                <label className="text-xs font-semibold text-slate-500 block">Report End Date (Optional)</label>
                <input
                  type="date"
                  value={aiReportEndDate}
                  onChange={(e) => setAiReportEndDate(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none placeholder:text-slate-300 transition-colors"
                />
              </div>
            </div>

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
                      onClick={() => {
                        try {
                          window.print();
                        } catch (err) {
                          console.warn("Window printing not supported in iframe sandbox:", err);
                        }
                      }}
                      className="bg-slate-900 border border-slate-950 text-white hover:bg-black font-extrabold text-[11px] px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0 shadow-3xs"
                    >
                      Print Summary
                    </button>
                  </div>
                </div>

                {/* TWO COLUMN SUMMARY ANALYSIS */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Executive Brief Card */}
                  <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-3xs hover:shadow-2xs transition-shadow">
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
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-3xs hover:shadow-2xs transition-shadow">
                    <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                      <AlertTriangle className="w-5 h-5 text-indigo-650" />
                      <h3 className="text-sm font-bold text-slate-900 font-sans tracking-tight">
                        Cohort Welfare Segments
                      </h3>
                    </div>
                    <p className="text-xs text-slate-650 leading-relaxed font-sans whitespace-pre-line border-b border-slate-100 pb-2">
                      {aiCohortReport.overallRiskDistribution}
                    </p>
                    <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 text-[10px] text-indigo-750 font-sans leading-normal">
                      💡 <b>Insight:</b> Filter the advisory listing block at the bottom to check customized actions for red-flag cases.
                    </div>
                  </div>
                </div>

                {/* GRAPHICAL COMPARATIVE DASHBOARD INTERFACE */}
                {(() => {
                  const activeList = activeParticipants;
                  const total = activeList.length;
                  const statsPrecomputed = (() => {
                    if (total === 0) return { cohorts: [], villages: [], genders: [], schooling: [] };

                    const cohortData: Record<string, { count: number; sumAttendance: number; redFlags: number; totalScores: number; countScores: number }> = {};
                    const villageData: Record<string, { count: number; sumAttendance: number; redFlags: number }> = {};
                    const genderData: Record<string, { count: number; sumAttendance: number; redFlags: number; totalScores: number; countScores: number }> = {};
                    const schoolingData: Record<string, { count: number; sumAttendance: number; totalScores: number; countScores: number }> = {};

                    activeList.forEach(p => {
                      const stats = participantStatsMap[p.id] || { attendanceRate: 100, hasRedFlag: false };
                      const attendanceVal = stats.attendanceRate;

                      const schoolForm = p.scannedForms?.find(f => f.formType === 'school')?.extractedData?.school;
                      const scoreVal = schoolForm?.averageScorePercentage;

                      const c = p.cohort || 'General';
                      if (!cohortData[c]) cohortData[c] = { count: 0, sumAttendance: 0, redFlags: 0, totalScores: 0, countScores: 0 };
                      cohortData[c].count += 1;
                      cohortData[c].sumAttendance += attendanceVal;
                      if (stats.hasRedFlag) cohortData[c].redFlags += 1;
                      if (typeof scoreVal === 'number') {
                        cohortData[c].totalScores += scoreVal;
                        cohortData[c].countScores += 1;
                      }

                      const v = p.village || 'Other';
                      if (!villageData[v]) villageData[v] = { count: 0, sumAttendance: 0, redFlags: 0 };
                      villageData[v].count += 1;
                      villageData[v].sumAttendance += attendanceVal;
                      if (stats.hasRedFlag) villageData[v].redFlags += 1;

                      const g = p.gender || 'N/A';
                      if (!genderData[g]) genderData[g] = { count: 0, sumAttendance: 0, redFlags: 0, totalScores: 0, countScores: 0 };
                      genderData[g].count += 1;
                      genderData[g].sumAttendance += attendanceVal;
                      if (stats.hasRedFlag) genderData[g].redFlags += 1;
                      if (typeof scoreVal === 'number') {
                        genderData[g].totalScores += scoreVal;
                        genderData[g].countScores += 1;
                      }

                      const s = p.schoolingStatus || 'Not Specified';
                      if (!schoolingData[s]) schoolingData[s] = { count: 0, sumAttendance: 0, totalScores: 0, countScores: 0 };
                      schoolingData[s].count += 1;
                      schoolingData[s].sumAttendance += attendanceVal;
                      if (typeof scoreVal === 'number') {
                        schoolingData[s].totalScores += scoreVal;
                        schoolingData[s].countScores += 1;
                      }
                    });

                    return {
                      cohorts: Object.entries(cohortData).map(([name, d]) => ({
                        name,
                        "Attendees Logged": d.count,
                        "Avg Attendance %": Math.round(d.sumAttendance / d.count),
                        "Red Warning Flags": d.redFlags,
                        "Avg Academic Exam %": d.countScores > 0 ? Math.round(d.totalScores / d.countScores) : 0
                      })),
                      villages: Object.entries(villageData).map(([name, d]) => ({
                        name,
                        "Attendees Logged": d.count,
                        "Avg Attendance %": Math.round(d.sumAttendance / d.count),
                        "Red Warning Flags": d.redFlags
                      })),
                      genders: Object.entries(genderData).map(([name, d]) => ({
                        name,
                        "Attendees Logged": d.count,
                        "Avg Attendance %": Math.round(d.sumAttendance / d.count),
                        "Red Warning Flags": d.redFlags,
                        "Avg Academic Exam %": d.countScores > 0 ? Math.round(d.totalScores / d.countScores) : 0
                      })),
                      schooling: Object.entries(schoolingData).map(([name, d]) => ({
                        name,
                        "Attendees Logged": d.count,
                        "Avg Attendance %": Math.round(d.sumAttendance / d.count),
                        "Avg Academic Exam %": d.countScores > 0 ? Math.round(d.totalScores / d.countScores) : 0
                      }))
                    };
                  })();

                  const chartData = statsPrecomputed[activeStatsTab];

                  return (
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-5 shadow-3xs hover:shadow-2xs transition-shadow">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-slate-100">
                        <div className="space-y-1">
                          <h3 className="text-sm font-bold text-slate-905 flex items-center gap-2 font-sans">
                            <TrendingUp className="w-5 h-5 text-indigo-600" />
                            <span>Interactive Cohort Ratios & Subgroup Comparator</span>
                          </h3>
                          <p className="text-[10.5px] text-slate-500 font-sans">
                            Toggle dimensions below to view computed mathematical aggregations matched with the AI's respective analytical brief.
                          </p>
                        </div>
                        
                        {/* Interactive dimension selectors */}
                        <div className="inline-flex items-center gap-1.5 p-1 rounded-xl bg-slate-50 border border-slate-150 relative z-2 self-stretch sm:self-auto overflow-x-auto shrink-0">
                          {(['cohorts', 'villages', 'genders', 'schooling'] as const).map(tab => (
                            <button
                              key={tab}
                              onClick={() => setActiveStatsTab(tab)}
                              className={`px-3 py-1.5 text-[10.5px] font-extrabold capitalize rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                                activeStatsTab === tab
                                  ? 'bg-white text-indigo-655 shadow-xs border border-slate-205'
                                  : 'text-slate-500 hover:text-slate-800'
                              }`}
                            >
                              {tab}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
                        {/* CHART VISUALIZER STAGE */}
                        <div className="lg:col-span-2 space-y-2">
                          <div className="h-68 block min-h-[270px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData} margin={{ top: 15, right: 10, left: -25, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" stroke="#94a3b8" fontSize={9.5} tickLine={false} axisLine={false} />
                                <YAxis stroke="#94a3b8" fontSize={9.5} tickLine={false} axisLine={false} domain={[0, 100]} />
                                <Tooltip
                                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: 12, borderColor: '#e2e8f0', fontFamily: 'sans-serif', fontSize: 11 }}
                                  cursor={{ fill: '#f8fafc' }}
                                />
                                <Legend wrapperStyle={{ fontSize: 10.5, fontFamily: 'sans-serif', paddingTop: 10 }} />
                                
                                <Bar dataKey="Avg Attendance %" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={28}>
                                  {chartData.map((entry, index) => (
                                    <Cell key={`cell-att-${index}`} fill={index % 2 === 0 ? "#4f46e5" : "#6366f1"} />
                                  ))}
                                </Bar>
                                
                                {activeStatsTab !== 'villages' && (
                                  <Bar dataKey="Avg Academic Exam %" fill="#e0f2fe" radius={[4, 4, 0, 0]} barSize={28}>
                                    {chartData.map((entry, index) => (
                                      <Cell key={`cell-acad-${index}`} fill="#fbbf24" stroke="#d97706" strokeWidth={0.5} />
                                    ))}
                                  </Bar>
                                )}

                                {activeStatsTab !== 'schooling' && (
                                  <Bar dataKey="Red Warning Flags" fill="#fecdd3" radius={[4, 4, 0, 0]} barSize={20}>
                                    {chartData.map((entry, index) => (
                                      <Cell key={`cell-flags-${index}`} fill="#ef4444" />
                                    ))}
                                  </Bar>
                                )}
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* INTERPRETATION BRIEF CARD */}
                        <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-150 flex flex-col justify-between">
                          <div className="space-y-3.5">
                            <div className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                              🖋️ Gemini Interpretation Side-Brief
                            </div>
                            <h4 className="text-xs font-bold text-slate-800 font-sans">
                              {activeStatsTab === 'cohorts' && "Cohort Participation & Progress Variables"}
                              {activeStatsTab === 'villages' && "Village Spatial Layout Accessibility Insights"}
                              {activeStatsTab === 'genders' && "Gender Attendance & Performance Contrasts"}
                              {activeStatsTab === 'schooling' && "Schooling Type Engagement Analysis"}
                            </h4>
                            <p className="text-[11px] text-slate-650 leading-relaxed font-sans italic">
                              {activeStatsTab === 'cohorts' && "This chart compares average attendance rates, general participant sizes, red warning alerts, and computed terminal examination ratings across registered cohort groups, tracking relative academic progress levels."}
                              {activeStatsTab === 'villages' && (aiCohortReport.systemStats?.villageBreakdown || "No village assessment generated.")}
                              {activeStatsTab === 'genders' && (aiCohortReport.systemStats?.genderComparison || "No gender evaluation generated.")}
                              {activeStatsTab === 'schooling' && (aiCohortReport.systemStats?.schoolingImpact || "No schooling impact generated.")}
                            </p>
                          </div>
                          
                          <div className="pt-4 border-t border-slate-200/55 text-[9.5px] text-slate-400 font-mono">
                            COMPARATIVE DIMENSION: {activeStatsTab.toUpperCase()}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* THE DETAILS-BASED NARRATIVE ANALYSIS */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4.5 shadow-3xs hover:shadow-2xs transition-shadow">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <TrendingUp className="w-5 h-5 text-indigo-650 animate-pulse" />
                    <h3 className="text-sm font-bold text-slate-900 font-sans tracking-tight">
                      Roster Analytical Demographics & Comparative Ratios
                    </h3>
                  </div>
                  <div className="text-xs text-slate-650 leading-relaxed font-sans space-y-4 markdown-body">
                    {aiCohortReport.comparativeAnalysis ? (
                      aiCohortReport.comparativeAnalysis.split('\n\n').map((para, i) => (
                        <p key={`comp-para-${i}`} className="whitespace-pre-line leading-relaxed">
                          {para}
                        </p>
                      ))
                    ) : (
                      <p className="italic text-slate-450">Empty comparative analysis narration.</p>
                    )}
                  </div>
                </div>

                {/* STRATEGIC LEVEL SYSTEM RECOMMENDATIONS */}
                <div className="bg-gradient-to-b from-slate-900 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 space-y-6 shadow-md border border-slate-150/10">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2 font-sans">
                        <Zap className="w-5 h-5 text-amber-300" />
                        <span>Tactical Program Strategic Initiatives & Welfare Recommendations</span>
                      </h3>
                      <p className="text-xs text-slate-300 font-sans">
                        System-wide structural recommendations provided at the end of the compiled Gemini Cohort-Wide report.
                      </p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-slate-800 text-[10px] font-bold text-amber-300 border border-slate-700 font-mono shrink-0 uppercase tracking-widest">
                      {aiCohortReport.strategicRecommendations?.length || 0} Mandates Formulated
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {aiCohortReport.strategicRecommendations?.map((rec, rIdx) => (
                      <div key={`rec-card-${rIdx}`} className="bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 rounded-2xl p-5 space-y-3.5 flex flex-col justify-between transition-colors">
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[9.5px] font-bold tracking-wider font-mono text-indigo-300 bg-indigo-500/15 px-2.5 py-1 rounded-lg border border-indigo-500/25 uppercase">
                              {rec.category || "General Intervention"}
                            </span>
                            <span className={`text-[9.5px] font-extrabold px-2 py-0.5 rounded ${
                              rec.priority === 'High' 
                                ? 'bg-rose-500/15 text-rose-350 border border-rose-500/25'
                                : rec.priority === 'Medium'
                                  ? 'bg-amber-500/15 text-amber-305 border border-amber-500/25'
                                  : 'bg-emerald-500/15 text-emerald-305 border border-emerald-500/25'
                            }`}>
                              {rec.priority} Priority
                            </span>
                          </div>
                          
                          <h4 className="text-xs font-bold leading-snug font-sans text-slate-100">
                            {rec.initiative}
                          </h4>
                          
                          <p className="text-[11px] text-slate-350 leading-relaxed font-sans">
                            {rec.rationale}
                          </p>
                        </div>
                      </div>
                    ))}
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
                    {aiCohortReport.studentReports?.map((item, idx) => {
                      const origPat = participants.find(p => p.id === item.participantId);
                      const stats = origPat ? participantStatsMap[origPat.id] : null;

                      return (
                        <div key={`${item.participantId || 'unknown'}-${idx}`} className="p-5 hover:bg-slate-50/50 transition-colors flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
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

        {currentTab === 'staff-portals' && (
          <CdoStaffPortals
            participants={participants}
            setParticipants={setParticipants}
            staffTasks={staffTasks}
            setStaffTasks={setStaffTasks}
            complianceStatus={complianceStatus}
            setComplianceStatus={setComplianceStatus}
            onLogAudit={(action, details) => logSystemAction('audit', action, details)}
            triggerSyncUpload={triggerSyncUpload}
            currentUserEmail={currentUser?.email || 'admin@ug1083.org'}
            auditTrailLogs={systemLogs}
            budgets={budgets}
            setBudgets={setBudgets}
            isAdminMode={isAdminMode}
          />
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

            {/* ANALYTICS CHARTS GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

              {/* COHORT 7-DAY ROLLING ATTENDANCE AVERAGE LINE CHART */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-indigo-650" />
                      Cohort 7-Day Rolling Average
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      7-day attendance smoothed rate trend for cohort: <span className="font-semibold text-indigo-700">{selectedCohort || 'All Cohorts'}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                      {cohortRollingTrendData.length} sessions
                    </span>
                    {cohortRollingTrendData.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                        Latest: {cohortRollingTrendData[cohortRollingTrendData.length - 1].rollingAverage}%
                      </span>
                    )}
                    {cohortRollingTrendData.length > 0 && (
                      <button
                        onClick={handleDownloadRollingCSV}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 text-emerald-700 text-[10px] font-extrabold transition-all cursor-pointer shadow-3xs"
                        title="Download CSV report of 7-day rolling attendance trend"
                      >
                        <Download className="w-3 h-3 text-emerald-600" />
                        Download CSV
                      </button>
                    )}
                  </div>
                </div>

                {cohortRollingTrendData.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 italic text-xs">
                    No session data available for cohort style average chart.
                  </div>
                ) : (
                  <div className="h-72 w-full font-sans text-xs">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={cohortRollingTrendData}
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
                                <div className="bg-slate-900 text-white rounded-xl p-3 shadow-lg border border-slate-800 space-y-1.5 text-[11px] font-sans">
                                  <p className="font-bold border-b border-white/10 pb-1 mb-1.5 text-indigo-300">
                                    {data.label} ({formatToReadableDate(data.date)})
                                  </p>
                                  <div className="space-y-0.5 font-sans">
                                    <div className="flex justify-between gap-6">
                                      <span className="text-slate-400">7-Day Rolling Avg:</span>
                                      <span className="font-extrabold text-indigo-300">{data.rollingAverage}%</span>
                                    </div>
                                    <div className="flex justify-between gap-6">
                                      <span className="text-slate-400">Daily Session Rate:</span>
                                      <span className="font-bold text-slate-300">{data.singleSessionRate}%</span>
                                    </div>
                                    <div className="flex justify-between gap-6 text-[10px] pt-1 mt-1 border-t border-white/5">
                                      <span className="text-slate-400">Sessions in 7d Window:</span>
                                      <span>{data.sessionsInWindowCount}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Legend verticalAlign="top" height={36} iconType="circle" />
                        <Line
                          type="monotone"
                          dataKey="singleSessionRate"
                          name="Daily Session Rate"
                          stroke="#cbd5e1"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          dot={{ r: 2 }}
                          activeDot={{ r: 4 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="rollingAverage"
                          name="7-Day Rolling Average"
                          stroke="#4f46e5"
                          strokeWidth={3}
                          dot={{ r: 4, strokeWidth: 1 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
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
                      {cohortComparisonData.map((c, cIdx) => {
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
                            key={`${c.cohort}-${cIdx}`} 
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
                  {sessions.map((s, sIdx) => {
                    const isEditing = editingSessionOriginalDate === s.date;
                    return (
                      <div 
                        key={`${s.date}-${sIdx}`} 
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
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedSessionDate(s.date)}
                                  className="text-[11px] text-emerald-600 hover:text-emerald-805 hover:underline font-bold cursor-pointer"
                                >
                                  Inspect ➔
                                </button>
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
                                  Edit ➔
                                </button>
                              </div>
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

                {/* Search Active Registry */}
                <div className="p-3 bg-slate-50/50 border-b border-slate-150 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search active roster by name or ID..."
                      value={adminActiveSearchQuery}
                      onChange={(e) => setAdminActiveSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-12 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 placeholder:text-slate-450 focus:outline-none focus:border-slate-400 font-sans"
                    />
                    {adminActiveSearchQuery && (
                      <button 
                        onClick={() => setAdminActiveSearchQuery('')} 
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] bg-slate-150 hover:bg-slate-200 text-slate-600 rounded px-1.5 py-0.5 tracking-tight font-medium"
                      >
                        Clear
                      </button>
                    )}
                  </div>
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
                        {(() => {
                          const list = sortedActiveParticipants.filter(part => {
                            if (!adminActiveSearchQuery.trim()) return true;
                            const q = adminActiveSearchQuery.toLowerCase();
                            return part.name.toLowerCase().includes(q) || 
                              (part.idNo && part.idNo.toLowerCase().includes(q)) ||
                              part.contact.toLowerCase().includes(q);
                          });

                          if (list.length === 0) {
                            return (
                              <tr>
                                <td colSpan={4} className="p-10 text-center text-slate-400 italic font-sans bg-white">
                                  No active roster students match "{adminActiveSearchQuery}"
                                </td>
                              </tr>
                            );
                          }

                          return list.map((part, partIdx) => (
                            <tr key={`${part.id}-${partIdx}`} className="hover:bg-slate-50/60 transition-colors">
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
                          ));
                        })()}
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

                {/* Search Former Registry */}
                <div className="p-3 bg-slate-50/50 border-b border-slate-150 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search archives by name or ID..."
                      value={adminFormerSearchQuery}
                      onChange={(e) => setAdminFormerSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-12 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 placeholder:text-slate-450 focus:outline-none focus:border-slate-400 font-sans"
                    />
                    {adminFormerSearchQuery && (
                      <button 
                        onClick={() => setAdminFormerSearchQuery('')} 
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] bg-slate-150 hover:bg-slate-200 text-slate-600 rounded px-1.5 py-0.5 tracking-tight font-medium"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-slate-100 flex-1 overflow-y-auto max-h-[380px] min-h-[220px]">
                  {formerParticipants.length === 0 ? (
                    <div className="p-10 text-center h-full flex flex-col items-center justify-center">
                      <FileText className="w-8 h-8 text-slate-300 mb-2" />
                      <p className="text-xs text-slate-400 italic">Archive directory is empty. Try archiving an active student above to see them preserved here.</p>
                    </div>
                  ) : (
                    (() => {
                      const list = formerParticipants.filter(part => {
                        if (!adminFormerSearchQuery.trim()) return true;
                        const q = adminFormerSearchQuery.toLowerCase();
                        return part.name.toLowerCase().includes(q) || 
                          (part.idNo && part.idNo.toLowerCase().includes(q)) ||
                          part.contact.toLowerCase().includes(q);
                      });

                      if (list.length === 0) {
                        return (
                          <div className="p-8 text-center text-slate-400 italic font-sans text-xs">
                            No archived directory records match "{adminFormerSearchQuery}"
                          </div>
                        );
                      }

                      return list.map((part, partIdx) => (
                        <div key={`${part.id}-${partIdx}`} className="p-4 hover:bg-slate-50/60 transition-all flex items-center justify-between gap-3 text-xs">
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
                      ));
                    })()
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

            {/* AUDIT TRAIL LOGS & TRANSACTION JOURNALS AREA */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
              
              {/* Left Column: TRANSACTION JOURNAL */}
              <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs flex flex-col">
                <div className="p-5 border-b border-slate-150 bg-slate-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-700">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">System Transaction Journal</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Real-time tracker records & save events</p>
                    </div>
                  </div>
                  <span className="text-xs bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">
                    {systemLogs.filter(l => l.category === 'transaction').length} active
                  </span>
                </div>

                <div className="p-4 bg-slate-50/80 border-b border-slate-150 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500 font-medium font-sans">Automatic operation registry & database adjustments</span>
                  <button
                    onClick={() => {
                      const csvContent = "data:text/csv;charset=utf-8," 
                        + ["Timestamp,Action,Details,Operator"].join(",") + "\n"
                        + systemLogs.filter(l => l.category === 'transaction').map(l => `"${l.timestamp}","${l.action.replace(/"/g, '""')}","${l.details.replace(/"/g, '""')}","${l.operator.replace(/"/g, '""')}"`).join("\n");
                      const encodedUri = encodeURI(csvContent);
                      const link = document.createElement("a");
                      link.setAttribute("href", encodedUri);
                      link.setAttribute("download", "Lomuriangole_CYDC_Transactions.csv");
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="text-[11px] font-bold text-indigo-700 hover:text-indigo-850 flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Export Journal
                  </button>
                </div>

                <div className="divide-y divide-slate-100 flex-1 overflow-y-auto max-h-[380px] min-h-[300px]">
                  {systemLogs.filter(l => l.category === 'transaction').length === 0 ? (
                    <div className="p-10 text-center h-full flex flex-col items-center justify-center text-slate-400 italic">
                      No transactions recorded in this session.
                    </div>
                  ) : (
                    systemLogs.filter(l => l.category === 'transaction').map((log, idx) => (
                      <div key={`${log.id}-${idx}`} className="p-4 hover:bg-slate-50/50 transition-all flex flex-col gap-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">{log.action}</span>
                          <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-350" /> {log.timestamp.replace('T', ' ').slice(0, 19)}
                          </span>
                        </div>
                        <p className="text-slate-600 leading-normal font-sans pr-2">{log.details}</p>
                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono mt-0.5">
                          <span>Operator: <b className="text-indigo-650">{log.operator}</b></span>
                          <span className="bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded font-sans uppercase font-bold tracking-wider scale-90">ID: {log.id.slice(4,10)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right Column: SECURITY AUDIT TRAIL */}
              <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs flex flex-col">
                <div className="p-5 border-b border-slate-150 bg-slate-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-rose-50 rounded-lg text-rose-700">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Security Audit Trail</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Privileged actions & security exceptions</p>
                    </div>
                  </div>
                  <span className="text-xs bg-rose-100 text-rose-800 font-extrabold px-2 py-0.5 rounded-full">
                    {systemLogs.filter(l => l.category === 'audit').length} active
                  </span>
                </div>

                <div className="p-4 bg-slate-50/80 border-b border-slate-150 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500 font-medium font-sans">Immutable verification log & deletion audits</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        const csvContent = "data:text/csv;charset=utf-8," 
                          + ["Timestamp,SecurityAction,Details,Operator"].join(",") + "\n"
                          + systemLogs.filter(l => l.category === 'audit').map(l => `"${l.timestamp}","${l.action.replace(/"/g, '""')}","${l.details.replace(/"/g, '""')}","${l.operator.replace(/"/g, '""')}"`).join("\n");
                        const encodedUri = encodeURI(csvContent);
                        const link = document.createElement("a");
                        link.setAttribute("href", encodedUri);
                        link.setAttribute("download", "Lomuriangole_CYDC_AuditTrail.csv");
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className="text-[11px] font-bold text-indigo-700 hover:text-indigo-850 flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" /> Export Trail
                    </button>
                    {systemLogs.length > 2 && (
                      <button
                        onClick={() => {
                          if (!isAdminMode) {
                            alert("Only privileged Administrators can clear log databases.");
                            return;
                          }
                          if (window.confirm("Purge all logs from this browser's database and keep only the standard initialization traces?")) {
                            localStorage.removeItem('attendance_tracker_system_logs');
                            setSystemLogs([
                              {
                                id: 'log_init_0',
                                timestamp: new Date().toISOString(),
                                category: 'audit',
                                action: 'System Logs Cleared',
                                details: 'Lomuriangole CYDC database logs cleared manually by Unlocked Administrator.',
                                operator: 'Unlocked Administrator'
                              }
                            ]);
                          }
                        }}
                        disabled={!isAdminMode}
                        className={`text-[11px] font-bold flex items-center gap-1 ${
                          isAdminMode 
                            ? "text-rose-600 hover:text-rose-800 cursor-pointer" 
                            : "text-slate-300 cursor-not-allowed opacity-40"
                        }`}
                        title={isAdminMode ? "Purge log database" : "Locked - Please unlock Admin Mode to purge logs"}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Purge Logs
                      </button>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-slate-100 flex-1 overflow-y-auto max-h-[380px] min-h-[300px]">
                  {systemLogs.filter(l => l.category === 'audit').length === 0 ? (
                    <div className="p-10 text-center h-full flex flex-col items-center justify-center text-slate-400 italic">
                      No security audit events logged yet.
                    </div>
                  ) : (
                    systemLogs.filter(l => l.category === 'audit').map((log, idx) => (
                      <div key={`${log.id}-${idx}`} className="p-4 hover:bg-rose-50/20 transition-all flex flex-col gap-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-rose-950 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                            {log.action}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-350" /> {log.timestamp.replace('T', ' ').slice(0, 19)}
                          </span>
                        </div>
                        <p className="text-slate-650 leading-normal font-sans pr-2">{log.details}</p>
                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono mt-0.5">
                          <span>Operator: <b className="text-rose-800">{log.operator}</b></span>
                          <span className="bg-rose-50 text-rose-600 px-1.5 py-0.2 rounded font-sans uppercase font-bold tracking-wider scale-90 border border-rose-100">AUDIT</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
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
                        {inspectedParticipant.scannedForms.map((form, fIdx) => {
                          const isSelected = selectedScanDocId === form.id;
                          const fTypeNice = form.formType.replace('_', ' ').toUpperCase();
                          return (
                            <div key={`${form.id}-${fIdx}`} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-3xs transition-all">
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
                                    disabled={!isAdminMode}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteScannedForm(inspectedParticipant.id, form.id);
                                    }}
                                    className={`p-1 rounded transition-colors ${
                                      isAdminMode 
                                        ? "text-slate-400 hover:text-rose-650 hover:bg-rose-50 cursor-pointer" 
                                        : "text-slate-200 cursor-not-allowed opacity-50"
                                    }`}
                                    title={isAdminMode ? "Delete record from dossier" : "Locked - Please unlock Admin Mode to delete"}
                                  >
                                    {isAdminMode ? <Trash2 className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5 text-slate-300" />}
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

                      <button
                        type="button"
                        id="download-official-report-pdf"
                        onClick={() => downloadIndividualAIReportPDF(inspectedParticipant, inspectedStats)}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[12px] py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-xs hover:shadow-md active:scale-98"
                      >
                        <Download className="w-4 h-4 text-emerald-200" />
                        <span>Download Official Evaluation Report</span>
                      </button>

                      <div className="pt-2 border-t border-slate-100 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Start Date</label>
                            <input
                              type="date"
                              value={aiReportStartDate}
                              onChange={(e) => setAiReportStartDate(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded p-1 text-[10px] focus:outline-none"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">End Date</label>
                            <input
                              type="date"
                              value={aiReportEndDate}
                              onChange={(e) => setAiReportEndDate(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded p-1 text-[10px] focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
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
                      
                      {/* AI REPORT FILTERS FOR INDIVIDUAL */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1">
                          <label className="text-[9px] font-bold text-slate-500 uppercase">Start Date</label>
                          <input
                            type="date"
                            value={aiReportStartDate}
                            onChange={(e) => setAiReportStartDate(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded p-1.5 text-[10px] focus:outline-none"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[9px] font-bold text-slate-500 uppercase">End Date</label>
                          <input
                            type="date"
                            value={aiReportEndDate}
                            onChange={(e) => setAiReportEndDate(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded p-1.5 text-[10px] focus:outline-none"
                          />
                        </div>
                      </div>

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
                    {sessions.map((s, sIdx) => {
                      const stat = (attendance[inspectedParticipant.id] && attendance[inspectedParticipant.id][s.date]) || 'unmarked';
                      
                      let badge = <span className="bg-slate-100 text-slate-400 font-mono text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase">Unmarked</span>;
                      if (stat === 'present') badge = <span className="bg-emerald-50 border border-emerald-150 text-emerald-700 font-mono text-[10px] px-2 py-0.5 rounded-md font-semibold uppercase">Present</span>;
                      if (stat === 'absent') badge = <span className="bg-rose-50 border border-rose-150 text-rose-700 font-mono text-[10px] px-2 py-0.5 rounded-md font-semibold uppercase">Absent</span>;
                      if (stat === 'excused') badge = <span className="bg-slate-100 border border-slate-200 text-slate-500 font-mono text-[10px] px-2 py-0.5 rounded-md font-semibold uppercase">Excused</span>;

                      return (
                        <div key={`${s.date}-${sIdx}`} className="flex items-center justify-between p-3 hover:bg-slate-50/50">
                          <div>
                            <span className="font-semibold text-slate-800 text-xs">{formatToReadableDate(s.date)}</span>
                            <span className="text-slate-400 text-[10px] font-mono block mt-0.5">{s.label || 'Session'}</span>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            {/* Inline Switch Options */}
                            <select
                              value={stat}
                              disabled={!isAdminMode}
                              onChange={(e) => setSpecificAttendance(inspectedParticipant.id, s.date, e.target.value as AttendanceStatus)}
                              className={`bg-white border border-slate-200 rounded-lg text-[10px] p-1 font-medium focus:outline-none ${
                                isAdminMode 
                                  ? "text-slate-700 cursor-pointer" 
                                  : "text-slate-400 cursor-not-allowed bg-slate-50 pointer-events-none"
                              }`}
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
                        {inspectedParticipant.documents.map((doc, docIdx) => (
                          <div key={`${doc.id}-${docIdx}`} className="flex flex-col sm:flex-row sm:items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 gap-2">
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
                                disabled={!isAdminMode}
                                onClick={() => handleDeleteDocument(inspectedParticipant.id, doc.id)}
                                className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                                  isAdminMode 
                                    ? "bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer" 
                                    : "bg-slate-55 bg-slate-50 border border-slate-150 text-slate-350 cursor-not-allowed opacity-50 font-medium"
                                }`}
                                title={isAdminMode ? "Delete official document attachment" : "Locked - Please unlock Admin Mode to delete"}
                              >
                                {isAdminMode ? "Delete" : "Locked 🔒"}
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

                {/* CUSTOM FORMS & ASSESSMENTS */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest font-mono">
                        Forms & Assessments
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsFormModalOpen(true)}
                      className="text-[10px] bg-slate-900 hover:bg-slate-800 text-white font-bold px-2 py-1 rounded shadow-3xs transition-colors"
                    >
                      + Create New Form
                    </button>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-3xs space-y-4">
                    <p className="text-xs text-slate-500 leading-relaxed max-w-lg">
                      Generate structured assessments forms (e.g. Home Visit, School Visit) for AI context processing.
                    </p>
                    
                    {inspectedParticipant.filledForms && inspectedParticipant.filledForms.length > 0 ? (
                      <div className="space-y-2">
                        {inspectedParticipant.filledForms.map((form, fIdx) => {
                          const isExpanded = expandedFormId === form.id;
                          return (
                            <div key={`${form.id}-${fIdx}`} className="border border-slate-200 rounded-xl bg-slate-50 overflow-hidden shadow-3xs transition-all text-left">
                              <div 
                                onClick={() => setExpandedFormId(isExpanded ? null : form.id)}
                                className="p-3 bg-white hover:bg-slate-50 flex items-center justify-between gap-3 cursor-pointer select-none"
                              >
                                <div className="text-left">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[11px] font-extrabold text-indigo-900 font-mono uppercase tracking-wider">{form.type}</span>
                                    <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-md font-mono font-bold tracking-wider">
                                      {formatToReadableDate(form.date)}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-500 font-medium line-clamp-1">
                                    {form.data.primaryIntervention || form.data.purpose || form.data.observations || form.data.summary || "Structured questionnaire completed."}
                                  </p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      generateFormPDF(form.type, form.data, false, inspectedParticipant.name);
                                    }}
                                    className="text-[10px] text-emerald-600 bg-emerald-50/50 hover:bg-emerald-50 px-2 py-1 rounded transition-colors border border-emerald-100 flex items-center gap-1 font-bold"
                                    title="Download filled-out form as official printable PDF dossier"
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>Download PDF</span>
                                  </button>
                                  <span className="text-[10px] text-indigo-650 font-bold hover:underline">
                                    {isExpanded ? "Collapse ▲" : "View Details ▼"}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={!isAdminMode}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteFilledForm(inspectedParticipant.id, form.id);
                                    }}
                                    className={`text-[10px] font-extrabold px-2 py-1 rounded transition-colors border flex items-center gap-1 ${
                                      isAdminMode 
                                        ? "text-rose-600 hover:bg-rose-50 border-rose-100 hover:border-rose-200 cursor-pointer" 
                                        : "text-slate-350 bg-slate-50 border-slate-150 cursor-not-allowed opacity-60"
                                    }`}
                                    title={isAdminMode ? "Permanently delete this completed form" : "Lock - Please unlock Admin Mode to delete saved forms"}
                                  >
                                    {isAdminMode ? <Trash2 className="w-3 h-3 text-rose-500" /> : <Lock className="w-3 h-3 text-slate-400" />}
                                    <span>Delete</span>
                                  </button>
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="p-4 border-t border-slate-150 bg-slate-50/50 text-left space-y-4 animate-fade-in text-[10.5px] leading-relaxed text-slate-705">
                                  {/* Render Home Visit Questionnaire Details */}
                                  {form.type === 'Home Visit' && (
                                    <div className="space-y-4 text-slate-705">
                                      
                                      {/* Section 1: Basic Information */}
                                      <div className="border border-slate-205 rounded-xl bg-white overflow-hidden shadow-2xs">
                                        <div className="bg-rose-50 px-3.5 py-2 border-b border-rose-100 flex justify-between items-center">
                                          <span className="font-bold text-rose-950 font-serif text-[11px] uppercase tracking-wider">1. Basic Information</span>
                                          <span className="font-mono text-[9px] bg-white text-rose-600 border border-rose-200 px-2 py-0.5 rounded-full font-bold">
                                            ID: {form.data.idNo || 'N/A'}
                                          </span>
                                        </div>
                                        <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-[10px]">
                                          <div><span className="font-semibold text-slate-400 uppercase text-[8px] font-mono block">Assessor:</span> <span className="font-bold text-slate-800">{form.data.assessorName || 'N/A'}</span></div>
                                          <div><span className="font-semibold text-slate-400 uppercase text-[8px] font-mono block">Position / Org:</span> <span className="font-medium text-slate-700">{form.data.assessorPosition || 'N/A'}</span></div>
                                          <div><span className="font-semibold text-slate-400 uppercase text-[8px] font-mono block">Date of Assessment:</span> <span className="font-bold text-slate-800">{form.data.date || 'N/A'}</span></div>
                                          <div><span className="font-semibold text-slate-400 uppercase text-[8px] font-mono block">Village/Community:</span> <span className="font-medium text-slate-700">{form.data.village || 'N/A'}</span></div>
                                          <div><span className="font-semibold text-slate-400 uppercase text-[8px] font-mono block">Sub-county/District:</span> <span className="font-medium text-slate-700">{form.data.district || 'N/A'}</span></div>
                                        </div>
                                      </div>

                                      {/* Section 2: Family Composition */}
                                      <div className="border border-slate-205 rounded-xl bg-white overflow-hidden shadow-2xs">
                                        <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-205">
                                          <span className="font-bold text-slate-800 font-serif text-[11px] uppercase tracking-wider">2. Family Composition</span>
                                        </div>
                                        <div className="p-2.5 space-y-2">
                                          {[0, 1, 2].some(idx => form.data[`fam_name_${idx}`]) ? (
                                            <div className="divide-y divide-slate-100 text-[10.5px]">
                                              {[0, 1, 2].map(idx => {
                                                const hasData = form.data[`fam_name_${idx}`];
                                                if (!hasData) return null;
                                                return (
                                                  <div key={idx} className="py-2 first:pt-0 last:pb-0 grid grid-cols-1 sm:grid-cols-4 gap-2">
                                                    <div><span className="text-[9px] font-mono text-slate-400 uppercase block">Name</span> <span className="font-semibold text-slate-800">{form.data[`fam_name_${idx}`] || 'N/A'}</span></div>
                                                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                                                      <div><span className="text-[9px] font-mono text-slate-400 uppercase block">Sex</span> <span className="text-slate-700">{form.data[`fam_sex_${idx}`] || 'N/A'}</span></div>
                                                      <div><span className="text-[9px] font-mono text-slate-400 uppercase block">Age</span> <span className="text-slate-700">{form.data[`fam_age_${idx}`] || 'N/A'}</span></div>
                                                    </div>
                                                    <div><span className="text-[9px] font-mono text-slate-400 uppercase block">Relationship</span> <span className="text-indigo-900 font-medium">{form.data[`fam_rel_${idx}`] || 'N/A'}</span></div>
                                                    <div><span className="text-[9px] font-mono text-slate-400 uppercase block">Occupation</span> <span className="text-slate-600 block truncate">{form.data[`fam_occ_${idx}`] || 'N/A'}</span></div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          ) : (
                                            <p className="text-[10px] text-slate-400 italic p-1 text-center">No household family members listed in compositional record.</p>
                                          )}
                                        </div>
                                      </div>

                                      {/* Section 3: The Four Aspects of Well-Being */}
                                      <div className="space-y-3">
                                        <h5 className="font-mono font-bold text-[9px] tracking-widest text-[#d97706] uppercase">3. Aspect-by-Aspect Assessment Results</h5>
                                        
                                        {/* Social Aspect */}
                                        <div className="p-3 bg-indigo-50/20 border border-indigo-100 rounded-xl space-y-2">
                                          <div className="flex justify-between items-center border-b border-indigo-100/50 pb-1.5">
                                            <span className="font-bold text-indigo-950 uppercase text-[10px]">🟢 Aspect A: Social Well-being</span>
                                            <span className="font-mono text-[9.5px] font-bold bg-indigo-100 text-indigo-805 px-2.5 py-0.5 rounded-full">
                                              Score: {form.data.soc_rating ? `★ ${form.data.soc_rating}/5` : 'N/A'}
                                            </span>
                                          </div>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                                            <div><span className="text-slate-400 font-mono text-[8.5px] uppercase block">Family Relations:</span> <span className="font-semibold text-slate-800">{form.data.soc_relationships || 'N/A'}</span></div>
                                            <div><span className="text-slate-400 font-mono text-[8.5px] uppercase block">Decision Maker:</span> <span className="font-semibold text-slate-800">{form.data.soc_decisionMaking || 'N/A'}</span></div>
                                            <div><span className="text-slate-400 font-mono text-[8.5px] uppercase block">Child Care & Protection:</span> <span className="font-semibold text-slate-800">{form.data.soc_childrenCare || 'N/A'}</span></div>
                                            <div><span className="text-slate-400 font-mono text-[8.5px] uppercase block">Social Support Network:</span> <span className="font-semibold text-slate-800">{form.data.soc_socialSupport || 'N/A'}</span></div>
                                          </div>
                                          {form.data.social_abuse_reported === 'Yes' && (
                                            <div className="mt-1.5 p-2 bg-rose-50 border border-rose-100 rounded text-[9.5px] leading-relaxed text-rose-900 font-mono block">
                                              ⚠ <strong>ABUSE REPORTED:</strong> {form.data.social_abuse_explanation || 'No explanation specified.'}
                                            </div>
                                          )}
                                        </div>

                                        {/* Economic Aspect */}
                                        <div className="p-3 bg-rose-50/20 border border-rose-100 rounded-xl space-y-2">
                                          <div className="flex justify-between items-center border-b border-rose-100/50 pb-1.5">
                                            <span className="font-bold text-rose-955 uppercase text-[10px]">🟢 Aspect B: Economic Well-being</span>
                                            <span className="font-mono text-[9.5px] font-bold bg-rose-100 text-rose-805 px-2.5 py-0.5 rounded-full">
                                              Score: {form.data.econ_rating ? `★ ${form.data.econ_rating}/5` : 'N/A'}
                                            </span>
                                          </div>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                                            <div><span className="text-slate-400 font-mono text-[8.5px] uppercase block">Livelihood Income:</span> <span className="font-semibold text-slate-800">{form.data.econ_incomeSource || 'N/A'}</span></div>
                                            <div><span className="text-slate-400 font-mono text-[8.5px] uppercase block">Employment:</span> <span className="font-semibold text-slate-800">{form.data.econ_employmentStatus || 'N/A'}</span></div>
                                            <div><span className="text-slate-400 font-mono text-[8.5px] uppercase block">Monthly Income Est:</span> <span className="font-semibold text-slate-800">{form.data.econ_monthlyIncome || 'N/A'}</span></div>
                                            <div><span className="text-slate-400 font-mono text-[8.5px] uppercase block">Food Security Level:</span> <span className="font-semibold text-rose-950 font-medium">{form.data.econ_foodSecurity || 'N/A'}</span></div>
                                            <div><span className="text-slate-400 font-mono text-[8.5px] uppercase block">Livelihood Assets:</span> <span className="font-medium text-slate-700">{form.data.econ_assets || 'N/A'}</span></div>
                                            <div><span className="text-slate-400 font-mono text-[8.5px] uppercase block">Economic Challenges:</span> <span className="font-medium text-slate-700">{form.data.econ_challenges || 'N/A'}</span></div>
                                          </div>
                                        </div>

                                        {/* Health Aspect */}
                                        <div className="p-3 bg-emerald-50/20 border border-emerald-110 rounded-xl space-y-2">
                                          <div className="flex justify-between items-center border-b border-emerald-100/50 pb-1.5">
                                            <span className="font-bold text-emerald-950 uppercase text-[10px]">🟢 Aspect C: Health & Sanitation</span>
                                            <span className="font-mono text-[9.5px] font-bold bg-emerald-100 text-emerald-805 px-2.5 py-0.5 rounded-full">
                                              Score: {form.data.health_rating ? `★ ${form.data.health_rating}/5` : 'N/A'}
                                            </span>
                                          </div>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                                            <div><span className="text-slate-400 font-mono text-[8.5px] uppercase block">Health Facility Access:</span> <span className="font-semibold text-slate-800">{form.data.health_access || 'N/A'}</span></div>
                                            <div><span className="text-slate-400 font-mono text-[8.5px] uppercase block">Facility Distance:</span> <span className="font-semibold text-slate-800">{form.data.health_distance || 'N/A'}</span></div>
                                            <div><span className="text-slate-400 font-mono text-[8.5px] uppercase block">Immunized Fully:</span> <span className="font-semibold text-slate-800">{form.data.health_immunization || 'N/A'}</span></div>
                                            <div><span className="text-slate-400 font-mono text-[8.5px] uppercase block">Pit Latrine / Cleanliness:</span> <span className="font-semibold text-slate-800">{form.data.health_sanitation || 'N/A'}</span></div>
                                            <div><span className="text-slate-400 font-mono text-[8.5px] uppercase block">Water Source:</span> <span className="font-medium text-slate-700">{form.data.health_waterSource || 'N/A'}</span></div>
                                            <div><span className="text-slate-400 font-mono text-[8.5px] uppercase block">Common Illnesses:</span> <span className="font-medium text-slate-700">{form.data.health_illnesses || 'N/A'}</span></div>
                                          </div>
                                          {form.data.health_concerns && (
                                            <p className="p-1 px-2 border-l-2 border-emerald-400 text-emerald-950 italic text-[9.5px] bg-emerald-50/50 rounded-r">
                                              💡 <strong>Health Concerns:</strong> "{form.data.health_concerns}"
                                            </p>
                                          )}
                                        </div>

                                        {/* Education Aspect */}
                                        <div className="p-3 bg-teal-50/20 border border-teal-110 rounded-xl space-y-2">
                                          <div className="flex justify-between items-center border-b border-teal-100/50 pb-1.5">
                                            <span className="font-bold text-teal-950 uppercase text-[10px]">🟢 Aspect D: Education Well-being</span>
                                            <span className="font-mono text-[9.5px] font-bold bg-teal-100 text-teal-805 px-2.5 py-0.5 rounded-full">
                                              Score: {form.data.edu_rating ? `★ ${form.data.edu_rating}/5` : 'N/A'}
                                            </span>
                                          </div>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                                            <div><span className="text-slate-400 font-mono text-[8.5px] uppercase block">Attendance Level:</span> <span className="font-semibold text-slate-800">{form.data.edu_attendance || 'N/A'}</span></div>
                                            <div><span className="text-slate-400 font-mono text-[8.5px] uppercase block">Home Study Area:</span> <span className="font-semibold text-slate-800">{form.data.edu_environment || 'N/A'}</span></div>
                                            <div className="sm:col-span-2"><span className="text-slate-400 font-mono text-[8.5px] uppercase block">Aesthetic Involvement:</span> <span className="font-semibold text-slate-800">{form.data.edu_involvement || 'N/A'}</span></div>
                                            
                                            <div className="sm:col-span-2">
                                              <span className="text-slate-400 font-mono text-[8.5px] uppercase block">Educational Barriers Detected:</span>
                                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                {['Fees', 'Child_labour', 'Distance', 'Early_marriage'].map(b => {
                                                  const active = form.data[`edu_barrier_${b}`];
                                                  if (!active) return null;
                                                  return <span key={b} className="bg-teal-50 border border-teal-200 text-teal-800 text-[8px] font-bold tracking-wide px-2 py-0.5 rounded-full font-mono">{b.replace('_', ' ').toUpperCase()}</span>;
                                                })}
                                                {form.data.edu_barrier_other && <span className="bg-slate-100 border text-slate-700 text-[8.5px] italic px-2 py-0.5 rounded font-serif">Other: {form.data.edu_barrier_other}</span>}
                                              </div>
                                            </div>
                                          </div>
                                          {form.data.edu_comments && (
                                            <p className="p-1 px-2 border-l-2 border-teal-400 text-teal-950 italic text-[9.5px] bg-teal-50/50 rounded-r">
                                              💡 <strong>Assessment Remarks:</strong> "{form.data.edu_comments}"
                                            </p>
                                          )}
                                        </div>
                                      </div>

                                      {/* Section 4: General Family Well-Being */}
                                      <div className="border border-amber-205 rounded-xl bg-white overflow-hidden shadow-2xs">
                                        <div className="bg-amber-50/50 px-3.5 py-2 border-b border-amber-100 flex justify-between items-center">
                                          <span className="font-bold text-slate-900 font-serif text-[11px] uppercase tracking-wider">4. General Wellbeing Summary</span>
                                          <span className="font-mono text-[9px] bg-amber-105 text-amber-950 font-extrabold border border-amber-200 px-2 py-0.5 rounded-full uppercase">
                                            Status: {form.data.general_condition || 'N/A'}
                                          </span>
                                        </div>
                                        <div className="p-3 space-y-2 text-[10px]">
                                          <div>
                                            <span className="font-semibold text-slate-450 block uppercase text-[8px]">Urgent Intervention Needs:</span>
                                            <div className="flex flex-wrap gap-1.5 mt-1">
                                              {[
                                                { label: 'Food support', key: 'need_Food' },
                                                { label: 'Medical support', key: 'need_Medical' },
                                                { label: 'School support', key: 'need_School' },
                                                { label: 'Shelter improvement', key: 'need_Shelter' },
                                                { label: 'Protection intervention', key: 'need_Protection' },
                                                { label: 'Livelihood support', key: 'need_Livelihood' }
                                              ].map((item) => {
                                                const checked = form.data[item.key];
                                                if (!checked) return null;
                                                return <span key={item.key} className="bg-rose-50 border border-rose-200 text-rose-700 text-[8.5px] font-bold px-2 py-0.5 rounded-md font-mono">{item.label.toUpperCase()}</span>;
                                              })}
                                            </div>
                                          </div>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                                            <div><span className="font-semibold text-slate-450 block uppercase text-[8px]">Key Strengths:</span> <div className="text-slate-800 italic leading-relaxed">"{form.data.general_strengths || 'N/A'}"</div></div>
                                            <div><span className="font-semibold text-slate-450 block uppercase text-[8px]">Vulnerabilities & stress factors:</span> <div className="text-slate-800 italic leading-relaxed">"{form.data.general_vulnerabilities || 'N/A'}"</div></div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Section 5: Action Plan & Recommendations */}
                                      <div className="border border-indigo-205 rounded-xl bg-indigo-50/10 p-3 space-y-2 text-[10px]">
                                        <h5 className="font-bold text-indigo-950 uppercase text-[10.5px]">📋 5. Recommendation Action Plan</h5>
                                        <div className="space-y-1.5 leading-relaxed text-slate-800">
                                          <div><strong>Immediate Actions Required:</strong> <p className="text-indigo-900 bg-white/70 p-2 rounded border border-indigo-100 font-sans">{form.data.plan_immediate || 'N/A'}</p></div>
                                          <div><strong>Long-term Support Plan:</strong> <p className="bg-white/70 p-2 rounded border border-indigo-100">{form.data.plan_longTerm || 'N/A'}</p></div>
                                          <div><strong>External Referrals Made:</strong> <p className="bg-white/70 p-2 rounded border border-indigo-100 font-mono text-[9px]">{form.data.plan_referrals || 'None'}</p></div>
                                        </div>
                                      </div>

                                      {/* Section 6 & 7: Follow-up & Declaration */}
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-[10px]">
                                        <div className="p-3 bg-slate-50 border rounded-xl">
                                          <span className="font-bold text-slate-800 block uppercase text-[8.5px] font-mono border-b pb-1 mb-1.5">📅 6. Follow-up Tracking</span>
                                          <div><strong>Next Visit Date:</strong> {form.data.followUp_nextDate || 'N/A'}</div>
                                          <div><strong>Responsible Officer:</strong> {form.data.followUp_officer || 'N/A'}</div>
                                        </div>
                                        <div className="p-3 bg-slate-50 border rounded-xl">
                                          <span className="font-bold text-slate-800 block uppercase text-[8.5px] font-mono border-b pb-1 mb-1.5">🖋 7. Declaration signatures</span>
                                          <div><strong>Assessor Action Signature:</strong> {form.data.declaration_assessor || 'N/A'}</div>
                                          <div><strong>Representative thumbs/sig:</strong> {form.data.declaration_representative || 'N/A'}</div>
                                        </div>
                                      </div>

                                    </div>
                                  )}

                                  {/* Render School Visit Questionnaire Details */}
                                  {form.type === 'School Visit' && (
                                    <div className="space-y-3">
                                      <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-200">
                                        <div><span className="font-bold text-slate-450 block uppercase text-[8.5px] font-mono">Visiting Staff:</span> {form.data.staffName || 'N/A'}</div>
                                        <div><span className="font-bold text-slate-450 block uppercase text-[8.5px] font-mono">FCP Church Partner:</span> {form.data.fcpName || 'N/A'}</div>
                                        <div><span className="font-bold text-slate-450 block uppercase text-[8.5px] font-mono">School Assessment:</span> {form.data.schoolName || 'N/A'} ({form.data.schoolLocation || 'N/A'})</div>
                                        <div><span className="font-bold text-slate-450 block uppercase text-[8.5px] font-mono">School Type & Level:</span> {form.data.schoolType || 'N/A'} ({form.data.schoolLevel || 'N/A'})</div>
                                      </div>

                                      <div className="space-y-1">
                                        <span className="font-bold text-teal-800 block uppercase text-[9px] tracking-wider font-mono">🏫 Learner Welfare Ratings:</span>
                                        <div className="space-y-1 p-2 bg-white border border-slate-200 rounded-lg text-[10px]">
                                          <div className="flex justify-between border-b pb-1"><span>Has School Uniform:</span> <span className="font-bold text-slate-800">{form.data.welfare_0 || 'N/A'} ({form.data.welfare_remarks_0 || '-'})</span></div>
                                          <div className="flex justify-between border-b pb-1"><span>Has Learning Materials:</span> <span className="font-bold text-slate-800">{form.data.welfare_1 || 'N/A'} ({form.data.welfare_remarks_1 || '-'})</span></div>
                                          <div className="flex justify-between border-b pb-1"><span>Appears Healthy:</span> <span className="font-bold text-slate-800">{form.data.welfare_2 || 'N/A'} ({form.data.welfare_remarks_2 || '-'})</span></div>
                                          <div className="flex justify-between border-b pb-1"><span>Attends School Regularly:</span> <span className="font-bold text-slate-800">{form.data.welfare_3 || 'N/A'} ({form.data.welfare_remarks_3 || '-'})</span></div>
                                        </div>
                                      </div>

                                      <div className="space-y-1">
                                        <span className="font-bold text-teal-800 block uppercase text-[9px] tracking-wider font-mono">🧑‍🏫 Educator & Learner Discussion notes:</span>
                                        <div className="p-2 bg-white border border-slate-200 rounded-lg space-y-2">
                                          {form.data.metTeacher === 'Yes' && (
                                            <div>
                                              <span className="font-bold text-slate-600 block">Class Teacher Met ({form.data.teacherName || 'N/A'}):</span>
                                              <p className="italic text-slate-650 font-serif">"{form.data.teacherComments || 'No comments'}"</p>
                                            </div>
                                          )}
                                          {form.data.metPrincipal === 'Yes' && (
                                            <div>
                                              <span className="font-bold text-slate-600 block">Head Teacher Met ({form.data.principalName || 'N/A'}):</span>
                                              <p className="italic text-slate-650 font-serif">"{form.data.principalComments || 'No comments'}"</p>
                                            </div>
                                          )}
                                          <div>
                                            <span className="font-bold text-slate-600 block">Learner's Feedback in Own Words:</span>
                                            <p className="italic text-slate-650 text-[10.5px]">"{form.data.learnerFeedback || 'N/A'}"</p>
                                          </div>
                                        </div>
                                      </div>

                                      <div className="space-y-1">
                                        <span className="font-bold text-teal-800 block uppercase text-[9px] tracking-wider font-mono">🎁 Support Usage Status:</span>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 p-2 bg-white border border-slate-200 rounded-lg text-[10px]">
                                          <div><span>SCHOOL FEES:</span> <span className="font-bold text-slate-800">{form.data.feesPaid === 'Yes' ? `Paid (${form.data.feesAmt || 'N/A'})` : 'No'}</span></div>
                                          <div><span>UNIFORM SUPPLY:</span> <span className="font-semibold text-slate-800">{form.data.uniformProv === 'Yes' ? `Provided (${form.data.uniformDate || 'N/A'})` : 'No'}</span></div>
                                          <div><span>BOOKS PROVIDED:</span> <span className="font-semibold text-slate-800">{form.data.booksProv === 'Yes' ? `${form.data.booksList || 'Yes'}` : 'No'}</span></div>
                                          <div><span>OTHER SUPPORT:</span> <span className="font-semibold text-slate-800">{form.data.otherSupport || 'None'}</span></div>
                                        </div>
                                      </div>

                                      <div className="space-y-1">
                                        <span className="font-bold text-indigo-805 block uppercase text-[9px] tracking-wider font-mono">📋 Observations & Recommendations:</span>
                                        <div className="space-y-1.5 p-2.5 bg-slate-100 rounded-lg text-slate-800">
                                          <div><span className="font-bold text-slate-550 mr-1 text-[9px] font-mono">GENERAL NOTES:</span> {form.data.observations || 'N/A'}</div>
                                          <div><span className="font-bold text-slate-550 mr-1 text-[9px] font-mono">ACTION RECOMMENDATIONS:</span> <span className="font-medium text-indigo-905">{form.data.recommendations || 'N/A'}</span></div>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Fallback rendering of any other simple form */}
                                  {form.type !== 'Home Visit' && form.type !== 'School Visit' && (
                                    <div className="space-y-2">
                                      <div><span className="font-bold text-slate-500 block uppercase text-[8.5px] font-mono">Date:</span> {formatToReadableDate(form.date)}</div>
                                      <div><span className="font-bold text-slate-500 block uppercase text-[8.5px] font-mono">Reason:</span> {form.data.purpose || 'N/A'}</div>
                                      <div>
                                        <span className="font-bold text-slate-500 block uppercase text-[8.5px] font-mono">Summary Notes:</span>
                                        <div className="p-2 bg-white rounded border border-slate-200 mt-1 font-mono text-[10px] whitespace-pre-wrap">{form.data.summary || 'N/A'}</div>
                                      </div>
                                      {form.data.actionItems && (
                                        <div>
                                          <span className="font-bold text-slate-500 block uppercase text-[8.5px] font-mono">Action Items:</span>
                                          <div className="p-2 bg-white rounded border border-slate-200 mt-1">{form.data.actionItems}</div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-4 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                        <span className="text-xs text-slate-400 font-medium font-sans">No assessments have been recorded.</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* ✨ AI CAREGIVER SMS OUTREACH & COMMUNICATION HUB */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-3xs text-left">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-indigo-750">
                      <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                      <h4 className="text-xs font-extrabold uppercase tracking-wider font-mono">
                        ✨ AI Caregiver SMS Outreach Hub
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSmsAccordionExpanded(!smsAccordionExpanded)}
                      className="text-[10px] font-bold text-indigo-700 hover:text-indigo-850 bg-white border border-slate-200 px-2.5 py-1 rounded-lg transition-all hover:bg-slate-100 cursor-pointer shadow-3xs"
                    >
                      {smsAccordionExpanded ? 'Hide Workspace' : 'Open Workspace'}
                    </button>
                  </div>
                  <p className="text-[10.5px] text-slate-550 leading-relaxed">
                    Instantly compose respectful, supportive Karimojong child-development SMS check-ins. Convert dashboard stats or dossier metrics on file into outreach messages.
                  </p>

                  {smsAccordionExpanded && (
                    <div className="space-y-3 bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-2xs">
                      {/* Campaign Selection */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider font-mono block">Outreach Campaign</label>
                          <select
                            value={smsCampaignType}
                            onChange={(e) => setSmsCampaignType(e.target.value as any)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg text-xs py-1.5 px-2 text-slate-705 font-bold focus:outline-none cursor-pointer"
                          >
                            <option value="absenteeism">⚠️ Absenteeism Warning</option>
                            <option value="praise">🎉 Attendance Praise</option>
                            <option value="home_visit">🏡 Home Visit Proposal</option>
                            <option value="medical">🏥 Medical Follow-up</option>
                            <option value="academic">🏫 Academic Check-in</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider font-mono block">Tone & Disposition</label>
                          <select
                            value={smsTone}
                            onChange={(e) => setSmsTone(e.target.value as any)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg text-xs py-1.5 px-2 text-slate-705 font-bold focus:outline-none cursor-pointer"
                          >
                            <option value="polite">🤝 Polite & Direct</option>
                            <option value="urgent">📢 Urgent & Actionable</option>
                            <option value="collaborative">❤️ Warm & Collaborative</option>
                          </select>
                        </div>
                      </div>

                      {/* Optional Context */}
                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider font-mono block">Additional Caseworker Context (Optional)</label>
                        <input
                          type="text"
                          value={smsExtraContext}
                          onChange={(e) => setSmsExtraContext(e.target.value)}
                          placeholder="e.g., mention medical rest, ask about road conditions, include family prayer request..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:outline-none focus:border-indigo-500 placeholder:text-slate-400"
                        />
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleGenerateSmsWithGemini}
                          disabled={isSmsGenerating}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[10.5px] py-2 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {isSmsGenerating ? (
                            <>
                              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              <span>Optimizing with Gemini...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                              <span>✨ Optimize Message with Gemini AI</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Display draft message */}
                      <div className="space-y-1 pt-1">
                        <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold uppercase tracking-wider font-mono">
                          <span>SMS Copy Draft Preview</span>
                          <span>{smsDraftMessage.length} characters</span>
                        </div>
                        <div className="relative">
                          <textarea
                            value={smsDraftMessage}
                            onChange={(e) => setSmsDraftMessage(e.target.value)}
                            rows={4}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-700 leading-relaxed font-sans placeholder:text-slate-400 focus:outline-none focus:border-slate-350"
                          />
                        </div>
                      </div>

                      {/* Success / Status Info */}
                      {smsSuccessMsg && (
                        <div className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg p-1.5 px-2.5 text-center transition-all animate-fade-in animate-duration-300">
                          {smsSuccessMsg}
                        </div>
                      )}

                      {/* Africa's Talking API Dispatch Status */}
                      {directSmsResponse && (
                        <div className={`p-2.5 rounded-xl border text-[10.5px] font-bold transition-all ${
                          directSmsResponse.success 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                            : 'bg-rose-50 border-rose-200 text-rose-800'
                        }`}>
                          <div className="flex items-start gap-2">
                            {directSmsResponse.success ? (
                              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                            )}
                            <div className="space-y-1">
                              <p className="leading-snug">{directSmsResponse.message}</p>
                              {directSmsResponse.isSimulated && (
                                <p className="text-[9.5px] text-indigo-700 font-normal leading-relaxed">
                                  💡 <b>Credentials Setup:</b> To send live messages directly from the system, configure <b>AFRICASTALKING_API_KEY</b> and <b>AFRICASTALKING_USERNAME</b> in the AI Studio Settings menu.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Primary Direct Send Action */}
                      <button
                        type="button"
                        onClick={handleSendDirectSms}
                        disabled={isSendingDirectSms || !smsDraftMessage.trim()}
                        className="w-full bg-slate-900 hover:bg-slate-950 text-white font-extrabold text-xs py-2.5 px-4 rounded-xl shadow-2xs hover:shadow-3xs transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 border border-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSendingDirectSms ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>Broadcasting directly to mobile...</span>
                          </>
                        ) : (
                          <>
                            <Wifi className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
                            <span>⚡ Send Direct via Africa's Talking API Gateway</span>
                          </>
                        )}
                      </button>

                      <div className="grid grid-cols-2 gap-2 pt-0.5 border-t border-slate-100 mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(smsDraftMessage);
                            setSmsCopied(true);
                            setTimeout(() => setSmsCopied(false), 2000);
                          }}
                          className="py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-3xs"
                        >
                          {smsCopied ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-500" />
                              <span className="text-emerald-600 font-extrabold">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                              <span>Copy Message</span>
                            </>
                          )}
                        </button>

                        <a
                          href={`sms:${inspectedParticipant.contact?.replace(/[^0-9+]/g, '') || ''}?body=${encodeURIComponent(smsDraftMessage)}`}
                          className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-705 font-bold text-xs rounded-xl text-center cursor-pointer transition-all flex items-center justify-center gap-2 shadow-3xs border border-slate-200/60"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>Use Native SMS</span>
                        </a>
                      </div>
                    </div>
                  )}
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
                      inspectedParticipant.outreachNotes.map((log, idx) => {
                        let statusColor = 'bg-amber-100 text-amber-800';
                        if (log.status === 'resolved') statusColor = 'bg-emerald-150 text-emerald-800 border border-emerald-250';
                        if (log.status === 'contacted') statusColor = 'bg-sky-100 text-sky-805 border border-sky-200';

                        return (
                          <div key={`${log.id}-${idx}`} className="p-3.5 bg-white border border-slate-250 rounded-xl space-y-1.5 relative group/log shadow-3xs">
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
                          <label className="text-[10px] text-slate-500 font-bold block mb-1">SCHOOL STATUS</label>
                          <select 
                            value={editSchoolingStatus} 
                            onChange={(e) => setEditSchoolingStatus(e.target.value)} 
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-xs focus:outline-none focus:border-indigo-500" 
                          >
                            <option value="Day Scholar">Day Scholar</option>
                            <option value="Boarder">Boarder</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold block mb-1">CLASS</label>
                          <input 
                            type="text" 
                            value={editSchoolClass} 
                            onChange={(e) => setEditSchoolClass(e.target.value)} 
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-xs focus:outline-none focus:border-indigo-500" 
                            placeholder="e.g. Primary 4"
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
                                schoolingStatus: editSchoolingStatus.trim() || 'Day Scholar',
                                schoolClass: editSchoolClass.trim() || '-',
                                cohort: editCohort,
                                contact: editContact.trim() || '-',
                                registrationNotes: editRegistrationNotes.trim()
                              };
                            }
                            return p;
                          }));
                          logSystemAction('transaction', 'Profile Manually Updated', `Updated registration details and intake demographics for active student ${editName.trim()} (ID: ${editIdNo.trim()}).`);
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
                        <span className="text-slate-400 font-medium">School Status:</span>
                        <span className="font-medium text-slate-800">{inspectedParticipant.schoolingStatus || 'Day Scholar'}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1">
                        <span className="text-slate-400 font-medium">Class:</span>
                        <span className="font-medium text-slate-800">{inspectedParticipant.schoolClass || '-'}</span>
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
                            setEditSchoolingStatus(inspectedParticipant.schoolingStatus || 'Day Scholar');
                            setEditSchoolClass(inspectedParticipant.schoolClass || '');
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

        {/* STRUCTURED FORMS MODAL */}
        <FormModal 
          isOpen={isFormModalOpen}
          onClose={() => setIsFormModalOpen(false)}
          participantName={inspectedParticipant?.name}
          onSave={(type, data) => {
            if (inspectedParticipant) {
              // Reusing state from App: setFormType and formData temporarily
              // but handled immediately by handleSaveFilledForm using arguments if we adjust it.
              // Wait, handleSaveFilledForm reads from `formType` & `formData` state. 
              // We should pass them directly to the function.
              
              // We will just call a refactored bound block or use the states:
              setFormType(type as any);
              setFormData(data);
              
              // We can't rely on state updates immediately, so let's call the updated handleSave.
              // Actually we can just create the object here:
              const newForm: FilledForm = {
                id: `form_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                type: type as any,
                date: new Date().toISOString(),
                data: data
              };
              
              setParticipants(prev => prev.map(p => {
                if (p.id === inspectedParticipant.id) {
                  return { ...p, filledForms: [newForm, ...(p.filledForms || [])] };
                }
                return p;
              }));
              setIsFormModalOpen(false);
            }
          }}
        />

        <SessionInspectorModal 
          isOpen={!!selectedSessionDate}
          onClose={() => {
            setSelectedSessionDate(null);
            setCalendarSyncError(null);
            setCalendarSyncSuccess(null);
          }}
          session={currentSessionObj}
          attendanceStats={currentSessionStats}
          onUpdateSession={handleUpdateSessionData}
          googleAccessToken={googleAccessToken}
          onSyncToCalendar={syncSessionToCalendar}
          isSyncingToCalendar={isSyncingToCalendar}
          calendarSyncSuccess={calendarSyncSuccess}
          calendarSyncError={calendarSyncError}
          activeParticipants={activeParticipants}
          attendance={attendance}
        />

        {/* EMAIL ALERT DISPATCH & SETTINGS MODAL */}
        {isEmailAlertModalOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4" id="modal-email-alerts">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsEmailAlertModalOpen(false);
                setEmailAlertSuccess(null);
                setEmailAlertError(null);
              }}
              className="absolute inset-0 bg-slate-900"
            />

            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-white border border-slate-250 rounded-2xl w-full max-w-lg shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-4 border-b border-indigo-100 flex items-center justify-between bg-indigo-50/50">
                <div className="flex items-center gap-2">
                  <div className="p-1 px-1.5 rounded-lg bg-indigo-100 text-indigo-700 font-bold">
                    <Mail className="h-4 w-4 inline-block align-middle" />
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest font-mono">
                      Welfare Alert Center
                    </h3>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setIsEmailAlertModalOpen(false);
                    setEmailAlertSuccess(null);
                    setEmailAlertError(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 overflow-y-auto space-y-5 shrink">
                
                {/* 1. Target Session Selection */}
                <div className="bg-slate-50 border border-slate-205 p-3 rounded-xl space-y-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                    Target Session
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={emailModalSelectedDate || ''}
                      onChange={(e) => setEmailModalSelectedDate(e.target.value)}
                      className="bg-white border border-slate-250 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-850 focus:outline-none focus:border-indigo-500 flex-1"
                    >
                      <option value="">-- Choose session --</option>
                      {sessions.map((s, idx) => {
                        const isEmailed = emailedSessionDates.includes(s.date);
                        // Is it fully marked?
                        const isFullyMarked = activeParticipants.length > 0 && activeParticipants.every(p => {
                          const status = attendance[p.id]?.[s.date];
                          return status && status !== 'unmarked';
                        });
                        return (
                          <option key={`${s.date}-${idx}`} value={s.date}>
                            {s.date} {s.label ? `(${s.label})` : ''} 
                            {isFullyMarked ? " [Marked Complete]" : " [Incomplete]"}
                            {isEmailed ? " 📧 [Dispatched]" : " ⚠️ [Unscheduled]"}
                          </option>
                        );
                      })}
                    </select>
                    {emailModalSelectedDate && (
                      <button
                        type="button"
                        onClick={() => {
                          if (emailedSessionDates.includes(emailModalSelectedDate)) {
                            setEmailedSessionDates(prev => {
                              const updated = prev.filter(d => d !== emailModalSelectedDate);
                              localStorage.setItem('attendance_tracker_emailed_session_dates', JSON.stringify(updated));
                              return updated;
                            });
                          } else {
                            setEmailedSessionDates(prev => {
                              const updated = [...prev, emailModalSelectedDate];
                              localStorage.setItem('attendance_tracker_emailed_session_dates', JSON.stringify(updated));
                              return updated;
                            });
                          }
                        }}
                        className="text-[9px] bg-slate-200 hover:bg-slate-300 text-slate-805 transition-colors font-bold px-2.5 py-1.5 rounded-lg cursor-pointer shrink-0"
                        title="Toggle whether this session is marked as already emailed manually."
                      >
                        {emailedSessionDates.includes(emailModalSelectedDate) ? "Mark Unsend" : "Mark Sent"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Overviews */}
                {emailModalSelectedDate && (() => {
                  const sObj = sessions.find(s => s.date === emailModalSelectedDate);
                  if (!sObj) return null;
                  
                  // Compute statistics
                  const stats = activeParticipants.reduce((acc, p) => {
                    const status = attendance[p.id]?.[sObj.date] || 'unmarked';
                    acc[status] = (acc[status] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>);

                  const rAlerts = activeParticipants.filter(p => {
                    const stat = participantStatsMap[p.id];
                    return stat?.hasRedFlag && !isRedAlertSuppressed(p);
                  });

                  const yAlerts = activeParticipants.filter(p => {
                    const stat = participantStatsMap[p.id];
                    return stat?.hasYellowFlag && !isRedAlertSuppressed(p);
                  });

                  return (
                    <div className="border border-indigo-100 rounded-xl p-3 bg-indigo-50/20 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-800 font-mono">Transmitting Preview</span>
                        <span className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded ${
                          emailedSessionDates.includes(sObj.date) ? 'bg-emerald-100 text-emerald-800 border border-emerald-250' : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {emailedSessionDates.includes(sObj.date) ? "Dispatched" : "Awaiting Dispatch"}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 text-center text-xs pt-1">
                        <div className="bg-white border rounded p-1.5 shadow-3xs">
                          <span className="block text-[8px] text-slate-405 uppercase font-black font-mono">Present</span>
                          <span className="font-bold text-emerald-600 font-mono text-xs">{stats.present || 0}</span>
                        </div>
                        <div className="bg-white border rounded p-1.5 shadow-3xs">
                          <span className="block text-[8px] text-slate-405 uppercase font-black font-mono">Absent</span>
                          <span className="font-bold text-rose-500 font-mono text-xs">{stats.absent || 0}</span>
                        </div>
                        <div className="bg-white border rounded p-1.5 shadow-3xs">
                          <span className="block text-[8px] text-slate-405 uppercase font-black font-mono">Red Cases</span>
                          <span className="font-bold text-red-600 font-mono text-xs">{rAlerts.length}</span>
                        </div>
                        <div className="bg-white border rounded p-1.5 shadow-3xs">
                          <span className="block text-[8px] text-slate-405 uppercase font-black font-mono">Yellow Cases</span>
                          <span className="font-bold text-amber-500 font-mono text-xs">{yAlerts.length}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* 2. Editable Recipient Info */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                    Recipient Staff Email (Editable)
                  </label>
                  <input
                    type="email"
                    value={staffEmailRecipient}
                    onChange={(e) => {
                      setStaffEmailRecipient(e.target.value);
                      localStorage.setItem('attendance_tracker_staff_email_recipient', e.target.value);
                    }}
                    placeholder="e.g., lomuriangolecydc@gmail.com"
                    className="w-full bg-slate-50 hover:bg-slate-100/50 border border-slate-205 focus:bg-white rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <p className="text-[9.5px] text-slate-450 leading-relaxed font-sans mt-0.5">
                    Alert letters are dispatched directly to this recipient. Defaults to <strong>lomuriangolecydc@gmail.com</strong>.
                  </p>
                </div>

                {/* 3. Toggle for banner prompts */}
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="auto-email-alerts-toggle-modal"
                    checked={isAutomaticEmailEnabled}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setIsAutomaticEmailEnabled(val);
                      localStorage.setItem('attendance_tracker_auto_email_enabled', String(val));
                    }}
                    className="mt-0.5 h-3.5 w-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <label htmlFor="auto-email-alerts-toggle-modal" className="block text-[10.5px] font-bold text-slate-700 uppercase tracking-wider font-mono cursor-pointer select-none">
                      Enable App Workspace Prompt Banners
                    </label>
                    <p className="text-[9px] text-slate-400 leading-relaxed mt-0.5 font-sans">
                      Displays interactive banners proposing alert email dispatch whenever session registers are complete. Will never transmit emails without explicit clicking.
                    </p>
                  </div>
                </div>

                {/* Messages */}
                {emailAlertSuccess && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-805 text-[10.5px] font-medium leading-relaxed">
                    🎉 {emailAlertSuccess}
                  </div>
                )}
                {emailAlertError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-250 rounded-xl text-rose-805 text-[10.5px] font-medium leading-relaxed">
                    ⚠️ {emailAlertError}
                  </div>
                )}

              </div>

              {/* Footer */}
              <div className="p-3 border-t border-slate-150 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsEmailAlertModalOpen(false);
                    setEmailAlertSuccess(null);
                    setEmailAlertError(null);
                  }}
                  className="px-3 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-750 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!emailModalSelectedDate) {
                      alert("Please choose a target session first!");
                      return;
                    }
                    let confirmMsg = `Are you sure you want to dispatch the Case alerts email summary for Session ${emailModalSelectedDate} to ${staffEmailRecipient}?`;
                    if (emailedSessionDates.includes(emailModalSelectedDate)) {
                      confirmMsg = `🚨 WARNING: An alert summary has ALREADY been successfully dispatched to staff for Session ${emailModalSelectedDate}.\n\nTo prevent sending hundreds of duplicate emails, we highly advise sending only one alert summary per completed session.\n\nAre you sure you want to RE-SEND / RE-TRANSMIT this alert summary anyway?`;
                    }
                    if (googleAccessToken) {
                      if (window.confirm(confirmMsg)) {
                        sendOutreachEmailAlert(emailModalSelectedDate, true);
                      }
                    } else {
                      alert("This action will request Google Account permission to send an email secure proxy. Please authorize the email permission popup.");
                      sendOutreachEmailAlert(emailModalSelectedDate, true);
                    }
                  }}
                  disabled={!emailModalSelectedDate || isSendingEmailAlert}
                  className={`px-3 py-1.5 border border-transparent rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-3xs transition-colors ${
                    !emailModalSelectedDate
                      ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      : isSendingEmailAlert
                      ? 'bg-indigo-400 text-white cursor-wait'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  {isSendingEmailAlert ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Mail className="h-3 w-3 shrink-0" />
                      <span>Send Single Email Now</span>
                    </>
                  )}
                </button>
              </div>

            </motion.div>
          </div>
        )}

        {/* MODAL: QUICK INTERVENTION LOG FOR LOW ATTENDANCE */}
        {quickLogParticipantId && (() => {
          const quickP = participants.find(p => p.id === quickLogParticipantId);
          if (!quickP) return null;
          return (
            <div className="fixed inset-0 z-[70] overflow-hidden flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                exit={{ opacity: 0 }}
                onClick={() => setQuickLogParticipantId(null)}
                className="absolute inset-0 bg-slate-900"
              />

              <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                className="relative bg-white border border-slate-250 rounded-2xl w-full max-w-md shadow-2xl z-10 overflow-hidden"
              >
                {/* Header */}
                <div className="p-4 border-b border-rose-100 flex items-center justify-between bg-rose-50/50">
                  <div className="flex items-center gap-2 text-rose-850">
                    <span className="p-1 px-1.5 bg-rose-600 rounded-lg text-white font-sans text-[10px] font-bold">CASE</span>
                    <div>
                      <h4 className="text-xs font-bold text-rose-900 uppercase tracking-wide font-sans">
                        Quick Intervention Log
                      </h4>
                      <p className="text-[10px] text-rose-700/80 font-sans font-medium">
                        For low attendance threshold drop (&lt;80%)
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setQuickLogParticipantId(null)}
                    type="button"
                    className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Form */}
                <form onSubmit={handleQuickLogSubmit} className="p-5 space-y-4 text-xs">
                  <div className="bg-slate-50 border border-slate-150 p-3 rounded-xl">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Target Participant</span>
                    <span className="font-bold text-slate-850 text-sm block">{quickP.name}</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5 font-mono">Primary Contact: {quickP.contact}</span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-705 block">Outreach Call/Visit Notes *</label>
                    <textarea
                      required
                      value={quickLogNotes}
                      onChange={(e) => setQuickLogNotes(e.target.value)}
                      placeholder="e.g. Spoke to caregiver. Student had malaria last week but is fully recovering and will attend starting tomorrow."
                      className="w-full h-24 bg-slate-150 border border-slate-200 p-2.5 rounded-xl text-slate-800 focus:bg-white focus:outline-hidden focus:border-rose-500 transition-colors resize-none leading-relaxed"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-705 block">Logged By Name *</label>
                      <input
                        type="text"
                        required
                        value={quickLogBy}
                        onChange={(e) => setQuickLogBy(e.target.value)}
                        placeholder="Educator / Social Worker"
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:outline-hidden focus:border-rose-500 transition-all"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-705 block">Intervention Status *</label>
                      <select
                        value={quickLogStatus}
                        onChange={(e) => setQuickLogStatus(e.target.value as any)}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-705 cursor-pointer focus:bg-white focus:outline-hidden"
                      >
                        <option value="pending">⏳ Pending/Follow-Up</option>
                        <option value="contacted">📞 Connected/Contacted</option>
                        <option value="resolved">✅ Resolved/Settled</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setQuickLogParticipantId(null)}
                      className="px-4 py-2 border border-slate-200 text-slate-650 hover:bg-slate-50 rounded-xl font-bold font-sans transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold font-sans transition-all cursor-pointer shadow-3xs"
                    >
                      Save Outreach Entry
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          );
        })()}

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

                <div className="grid grid-cols-2 gap-3.5 mb-3.5 mt-3.5">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">Schooling Status</label>
                    <div className="relative">
                      <select
                        value={newPartSchoolingStatus}
                        onChange={(e) => setNewPartSchoolingStatus(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none focus:border-slate-400 appearance-none font-medium"
                      >
                        <option value="Day Scholar">Day Scholar</option>
                        <option value="Boarder">Boarder</option>
                      </select>
                      <div className="absolute right-3 top-[50%] -translate-y-1/2 pointer-events-none">
                        <svg className="h-3 w-3 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">Class</label>
                    <input
                      type="text"
                      value={newPartSchoolClass}
                      onChange={(e) => setNewPartSchoolClass(e.target.value)}
                      placeholder="e.g. Primary 5"
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
              className="bg-white border border-slate-250 rounded-2xl w-full max-w-4xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
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
                  <button
                    type="button"
                    onClick={() => {
                      setImportTab('google-forms');
                      if (googleAccessToken && googleFormsList.length === 0) {
                        handleBrowseGoogleForms(googleAccessToken);
                      }
                    }}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      importTab === 'google-forms' 
                        ? 'bg-indigo-650 text-white shadow-2xs' 
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <Sparkles className="h-3 w-3 animate-pulse text-indigo-200 animate-bounce" />
                    Google Forms Sync
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

                {/* Tab content 3: Google Forms Integration Panel */}
                {importTab === 'google-forms' && (
                  <div className="space-y-4 animate-fadeIn">
                    {/* Authorization Status / Trigger Banner */}
                    {!googleAccessToken ? (
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center flex flex-col items-center justify-center space-y-4">
                        <div className="h-12 w-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                          <Lock className="h-6 w-6" />
                        </div>
                        <div className="max-w-md space-y-1">
                          <h4 className="text-sm font-bold text-slate-800">Verify Google Forms Account Connection</h4>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            To load questions and dynamically fetch student/participant registration details from your Google Forms, authorize your workspace now.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleBrowseGoogleForms()}
                          className="gsi-material-button text-xs font-semibold py-2.5 px-4 shadow-sm"
                          style={{
                            background: '#F2F2F2',
                            color: '#1f1f1f',
                            alignItems: 'center',
                            borderRadius: '4px',
                            border: '1px solid #dadce0',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            height: '40px',
                            justifyContent: 'center',
                            padding: '0 12px',
                            minWidth: '200px'
                          }}
                        >
                          <div className="gsi-material-button-icon" style={{ height: '20px', marginRight: '12px', width: '20px' }}>
                            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                            </svg>
                          </div>
                          <span className="gsi-material-button-contents font-medium font-sans">Authorize Access to Google Forms</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Connected Status header widget */}
                        <div className="bg-emerald-50/60 border border-emerald-155 rounded-xl p-3 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 text-emerald-850 font-semibold">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span>Google Forms Account Link Verified</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setGoogleAccessToken(null);
                              setGoogleFormsList([]);
                              setGoogleFormQuestions([]);
                              setGoogleFormResponses([]);
                            }}
                            className="text-slate-400 hover:text-red-550 font-bold transition-all flex items-center gap-1 cursor-pointer font-sans"
                          >
                            <LogOut className="h-3.5 w-3.5 pb-0.5" />
                            Disconnect Account
                          </button>
                        </div>

                        {/* Connection Inputs Panel */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Pane 1: Direct link connection */}
                          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                            <div>
                              <h4 className="text-xs font-bold text-slate-800">Option A: Link Form URL or ID</h4>
                              <p className="text-[10px] text-slate-400 mt-0.5">Paste links directly from docs.google.com/forms/d/...</p>
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={googleFormUrlOrId}
                                onChange={(e) => setGoogleFormUrlOrId(e.target.value)}
                                placeholder="Paste Google Form Link or ID here..."
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <button
                                type="button"
                                disabled={googleFormLoading || !googleFormUrlOrId.trim()}
                                onClick={() => handleFetchGoogleFormStructureAndResponses(googleFormUrlOrId)}
                                className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] px-3 py-1.5 font-bold rounded-xl transition-all cursor-pointer inline-flex items-center gap-1 shrink-0"
                              >
                                {googleFormLoading ? 'Syncing...' : 'Fetch Form Layout'}
                              </button>
                            </div>
                          </div>

                          {/* Pane 2: Browse and Select Existing from Drive */}
                          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="text-xs font-bold text-slate-800">Option B: Browse Forms from Drive</h4>
                                <p className="text-[10px] text-slate-400 mt-0.5">Select from your recently updated Google Forms</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleBrowseGoogleForms()}
                                className="text-[10px] font-bold text-indigo-650 hover:text-indigo-800 flex items-center gap-0.5 pointer"
                              >
                                <RefreshCw className={`h-3 w-3 ${googleFormLoading ? 'animate-spin' : ''}`} />
                                Refresh list
                              </button>
                            </div>

                            {googleFormsList.length > 0 ? (
                              <select
                                value={selectedGoogleFormId}
                                onChange={(e) => {
                                  setSelectedGoogleFormId(e.target.value);
                                  if (e.target.value) {
                                    setGoogleFormUrlOrId(e.target.value);
                                    handleFetchGoogleFormStructureAndResponses(e.target.value);
                                  }
                                }}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-medium text-slate-700 cursor-pointer"
                              >
                                <option value="">-- Choose a Form from your Drive --</option>
                                {googleFormsList.map((f) => (
                                  <option key={f.id} value={f.id}>{f.name}</option>
                                ))}
                              </select>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleBrowseGoogleForms()}
                                className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-150 border-dashed rounded-xl py-3.5 text-center text-xs text-slate-500 font-bold transition-all cursor-pointer"
                              >
                                {googleFormLoading ? 'Listing Forms in Drive...' : '🔍 Browse My Google Forms'}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Status Message / Error Area */}
                        {(googleFormStatusText || googleFormError) && (
                          <div className={`p-3 rounded-xl border text-xs leading-relaxed ${
                            googleFormError 
                              ? 'bg-red-50 border-red-150 text-red-800' 
                              : 'bg-indigo-50/70 border-indigo-100 text-indigo-800 font-medium'
                          }`}>
                            <div className="flex items-start gap-2">
                              {googleFormError ? (
                                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                              ) : (
                                <Sparkles className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5 animate-pulse" />
                              )}
                              <div>
                                <span className="block font-semibold">{googleFormError ? 'Integration Issue' : 'Sync Progress'}</span>
                                <span className="block text-[11px] mt-0.5">{googleFormError || googleFormStatusText}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Mapping grid (Renders once questions structure fetched successfully) */}
                        {googleFormQuestions.length > 0 && (
                          <div className="border border-slate-200 rounded-2xl p-4 bg-gradient-to-br from-indigo-50/30 to-slate-50 space-y-4 shadow-3xs animate-fadeIn">
                            {/* Header details */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-200/60 pb-3">
                              <div>
                                <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider font-sans">
                                  Google Form Layout Structure detected
                                </h4>
                                <p className="text-[10px] text-slate-505">
                                  Active target form: <span className="font-semibold text-slate-700">"{googleFormTitle}"</span> ({googleFormResponses.length} registered submissions)
                                </p>
                              </div>
                              <div className="bg-indigo-100/50 text-indigo-800 px-2 py-0.5 rounded text-[10px] font-bold self-start mt-1 sm:mt-0 font-mono">
                                SCHEMA GENERATED
                              </div>
                            </div>

                            {/* Dropdowns mapping Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                              {/* Field 1: Name */}
                              <div className="space-y-1 bg-white border border-slate-200/50 p-2 rounded-xl">
                                <label className="text-[10px] font-bold text-slate-705 block flex items-center justify-between">
                                  <span>Full Participant Name</span>
                                  <span className="text-[9px] bg-red-100 text-red-700 px-1 rounded font-bold uppercase scale-90">Required</span>
                                </label>
                                <select
                                  value={googleFormImportMapping.name}
                                  onChange={(e) => setGoogleFormImportMapping(prev => ({ ...prev, name: e.target.value }))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:bg-white"
                                >
                                  <option value="">-- Choose Name Field --</option>
                                  {googleFormQuestions.map((q) => (
                                    <option key={q.questionId} value={q.questionId}>{q.title}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Field 2: Contact */}
                              <div className="space-y-1 bg-white border border-slate-200/50 p-2 rounded-xl">
                                <label className="text-[10px] font-bold text-slate-705 block">Contact / Email / Phone</label>
                                <select
                                  value={googleFormImportMapping.contact}
                                  onChange={(e) => setGoogleFormImportMapping(prev => ({ ...prev, contact: e.target.value }))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:bg-white"
                                >
                                  <option value="">-- Skip / Choose Question --</option>
                                  {googleFormQuestions.map((q) => (
                                    <option key={q.questionId} value={q.questionId}>{q.title}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Field 3: Cohort */}
                              <div className="space-y-1 bg-white border border-slate-200/50 p-2 rounded-xl">
                                <label className="text-[10px] font-bold text-slate-705 block">Group Cohort</label>
                                <select
                                  value={googleFormImportMapping.cohort}
                                  onChange={(e) => setGoogleFormImportMapping(prev => ({ ...prev, cohort: e.target.value }))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:bg-white"
                                >
                                  <option value="">-- Skip / Default assignment --</option>
                                  {googleFormQuestions.map((q) => (
                                    <option key={q.questionId} value={q.questionId}>{q.title}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Field 4: ID Number */}
                              <div className="space-y-1 bg-white border border-slate-200/50 p-2 rounded-xl">
                                <label className="text-[10px] font-bold text-slate-705 block">National ID / ID Number</label>
                                <select
                                  value={googleFormImportMapping.idNo}
                                  onChange={(e) => setGoogleFormImportMapping(prev => ({ ...prev, idNo: e.target.value }))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:bg-white"
                                >
                                  <option value="">-- Skip / Choose Question --</option>
                                  {googleFormQuestions.map((q) => (
                                    <option key={q.questionId} value={q.questionId}>{q.title}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Field 5: Schooling Status */}
                              <div className="space-y-1 bg-white border border-slate-200/50 p-2 rounded-xl">
                                <label className="text-[10px] font-bold text-slate-705 block">Schooling (Day/Boarding)</label>
                                <select
                                  value={googleFormImportMapping.schoolingStatus}
                                  onChange={(e) => setGoogleFormImportMapping(prev => ({ ...prev, schoolingStatus: e.target.value }))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:bg-white"
                                >
                                  <option value="">-- Skip / Choose Question --</option>
                                  {googleFormQuestions.map((q) => (
                                    <option key={q.questionId} value={q.questionId}>{q.title}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Field 6: School Class/Grade */}
                              <div className="space-y-1 bg-white border border-slate-200/50 p-2 rounded-xl">
                                <label className="text-[10px] font-bold text-slate-705 block">Class / Grade Level</label>
                                <select
                                  value={googleFormImportMapping.schoolClass}
                                  onChange={(e) => setGoogleFormImportMapping(prev => ({ ...prev, schoolClass: e.target.value }))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:bg-white"
                                >
                                  <option value="">-- Skip / Choose Question --</option>
                                  {googleFormQuestions.map((q) => (
                                    <option key={q.questionId} value={q.questionId}>{q.title}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Field 7: Village */}
                              <div className="space-y-1 bg-white border border-slate-200/50 p-2 rounded-xl">
                                <label className="text-[10px] font-bold text-slate-705 block">Village / Location</label>
                                <select
                                  value={googleFormImportMapping.village}
                                  onChange={(e) => setGoogleFormImportMapping(prev => ({ ...prev, village: e.target.value }))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:bg-white"
                                >
                                  <option value="">-- Skip / Choose Question --</option>
                                  {googleFormQuestions.map((q) => (
                                    <option key={q.questionId} value={q.questionId}>{q.title}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Field 8: Caregiver */}
                              <div className="space-y-1 bg-white border border-slate-200/50 p-2 rounded-xl">
                                <label className="text-[10px] font-bold text-slate-705 block">Caregiver Name / Parent</label>
                                <select
                                  value={googleFormImportMapping.caregiver}
                                  onChange={(e) => setGoogleFormImportMapping(prev => ({ ...prev, caregiver: e.target.value }))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:bg-white"
                                >
                                  <option value="">-- Skip / Choose Question --</option>
                                  {googleFormQuestions.map((q) => (
                                    <option key={q.questionId} value={q.questionId}>{q.title}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Field 9: Notes */}
                              <div className="space-y-1 bg-white border border-slate-200/50 p-2 rounded-xl">
                                <label className="text-[10px] font-bold text-slate-705 block">Registration Notes / Remarks</label>
                                <select
                                  value={googleFormImportMapping.notes}
                                  onChange={(e) => setGoogleFormImportMapping(prev => ({ ...prev, notes: e.target.value }))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:bg-white"
                                >
                                  <option value="">-- Skip / Choose Question --</option>
                                  {googleFormQuestions.map((q) => (
                                    <option key={q.questionId} value={q.questionId}>{q.title}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* Trigger Preview compiler button */}
                            <div className="pt-3 border-t border-slate-200/60 flex justify-end">
                              <button
                                type="button"
                                onClick={applyGoogleFormMapping}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] py-2 px-5 rounded-xl shadow-md transition-all cursor-pointer inline-flex items-center gap-1.5"
                              >
                                <RefreshCw className="h-3.5 w-3.5 animate-spin-slow" />
                                Generate & Preview Workspace Candidates ({googleFormResponses.length} Submissions)
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Live Candidate Preview Panel */}
                {parsedImportList.length > 0 && (
                  <div className="space-y-4">
                    {/* Part 1: Interactive Header Mapping Selection Area */}
                    {detectedHeadersList.length > 0 && (
                      <div className="bg-gradient-to-br from-indigo-50/50 to-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 animate-fadeIn">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="p-1 px-1.5 bg-indigo-600 rounded-lg text-white font-sans text-[10px] font-bold">MAP</span>
                            <div>
                              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide font-sans">
                                CSV Smart Column Header Mapping
                              </h4>
                              <p className="text-[10px] text-slate-500 font-sans">
                                Associate file columns with youth registration fields below
                              </p>
                            </div>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => {
                              // Reset to position-based fallback guess
                              const maxC = detectedHeadersList.length;
                              const defaultMap = {
                                name: 0,
                                idNo: maxC > 1 ? 1 : -1,
                                age: maxC > 2 ? 2 : -1,
                                gender: maxC > 3 ? 3 : -1,
                                village: maxC > 4 ? 4 : -1,
                                caregiver: maxC > 5 ? 5 : -1,
                                cohort: maxC > 6 ? 6 : -1,
                                contact: maxC > 7 ? 7 : -1,
                                notes: maxC > 8 ? 8 : -1,
                                schoolingStatus: maxC > 9 ? 9 : -1,
                                schoolClass: maxC > 10 ? 10 : -1
                              };
                              setManualHeaderMapping(defaultMap);
                              applyMappingOnRawRows(rawCSVRows, defaultMap);
                            }}
                            className="text-[10px] bg-white border border-slate-200 text-indigo-650 hover:bg-indigo-50 px-2 py-1 rounded-md font-bold transition-all cursor-pointer"
                          >
                            Reset to Default guess
                          </button>
                        </div>

                        {/* Interactive Droppers Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                          {/* Name Map */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-700 block flex items-center gap-1">
                              <span className="h-1.5 w-1.5 bg-red-500 rounded-full"></span>
                              Participant Name *
                            </label>
                            <select
                              value={manualHeaderMapping.name}
                              onChange={(e) => updateHeaderMapping('name', parseInt(e.target.value, 10))}
                              className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-550"
                            >
                              <option value={-1}>-- Ignore column (Not Valid) --</option>
                              {detectedHeadersList.map((head, hIdx) => (
                                <option key={hIdx} value={hIdx}>{head} (Col {String.fromCharCode(65 + (hIdx % 26))})</option>
                              ))}
                            </select>
                          </div>

                          {/* National ID No Map */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-705 block flex items-center gap-1">
                              National ID No.
                            </label>
                            <select
                              value={manualHeaderMapping.idNo}
                              onChange={(e) => updateHeaderMapping('idNo', parseInt(e.target.value, 10))}
                              className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-550"
                            >
                              <option value={-1}>-- Not Map / Skip --</option>
                              {detectedHeadersList.map((head, hIdx) => (
                                <option key={hIdx} value={hIdx}>{head} (Col {String.fromCharCode(65 + (hIdx % 26))})</option>
                              ))}
                            </select>
                          </div>

                          {/* Age Map */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-705 block">Estimated Age / Dob</label>
                            <select
                              value={manualHeaderMapping.age}
                              onChange={(e) => updateHeaderMapping('age', parseInt(e.target.value, 10))}
                              className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-550"
                            >
                              <option value={-1}>-- Not Map / Skip --</option>
                              {detectedHeadersList.map((head, hIdx) => (
                                <option key={hIdx} value={hIdx}>{head} (Col {String.fromCharCode(65 + (hIdx % 26))})</option>
                              ))}
                            </select>
                          </div>

                          {/* Sex Map */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-705 block">Gender / Sex</label>
                            <select
                              value={manualHeaderMapping.gender}
                              onChange={(e) => updateHeaderMapping('gender', parseInt(e.target.value, 10))}
                              className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-550"
                            >
                              <option value={-1}>-- Not Map / Skip --</option>
                              {detectedHeadersList.map((head, hIdx) => (
                                <option key={hIdx} value={hIdx}>{head} (Col {String.fromCharCode(65 + (hIdx % 26))})</option>
                              ))}
                            </select>
                          </div>

                          {/* Village Map */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-705 block">Home Village Address</label>
                            <select
                              value={manualHeaderMapping.village}
                              onChange={(e) => updateHeaderMapping('village', parseInt(e.target.value, 10))}
                              className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-550"
                            >
                              <option value={-1}>-- Not Map / Skip --</option>
                              {detectedHeadersList.map((head, hIdx) => (
                                <option key={hIdx} value={hIdx}>{head} (Col {String.fromCharCode(65 + (hIdx % 26))})</option>
                              ))}
                            </select>
                          </div>

                          {/* Caregiver Map */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-705 block">Primary Caregiver</label>
                            <select
                              value={manualHeaderMapping.caregiver}
                              onChange={(e) => updateHeaderMapping('caregiver', parseInt(e.target.value, 10))}
                              className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-550"
                            >
                              <option value={-1}>-- Not Map / Skip --</option>
                              {detectedHeadersList.map((head, hIdx) => (
                                <option key={hIdx} value={hIdx}>{head} (Col {String.fromCharCode(65 + (hIdx % 26))})</option>
                              ))}
                            </select>
                          </div>

                          {/* Cohort Map */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-705 block">Suggested Cohort / Class</label>
                            <select
                              value={manualHeaderMapping.cohort}
                              onChange={(e) => updateHeaderMapping('cohort', parseInt(e.target.value, 10))}
                              className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-550"
                            >
                              <option value={-1}>-- Not Map / Fallback --</option>
                              {detectedHeadersList.map((head, hIdx) => (
                                <option key={hIdx} value={hIdx}>{head} (Col {String.fromCharCode(65 + (hIdx % 26))})</option>
                              ))}
                            </select>
                          </div>

                          {/* Contact Mobile Map */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-705 block">Mobile Contact Phone</label>
                            <select
                              value={manualHeaderMapping.contact}
                              onChange={(e) => updateHeaderMapping('contact', parseInt(e.target.value, 10))}
                              className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-550"
                            >
                              <option value={-1}>-- Not Map / Skip --</option>
                              {detectedHeadersList.map((head, hIdx) => (
                                <option key={hIdx} value={hIdx}>{head} (Col {String.fromCharCode(65 + (hIdx % 26))})</option>
                              ))}
                            </select>
                          </div>

                          {/* Intake Notes Map */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-705 block">Intake Notes / Dietary</label>
                            <select
                              value={manualHeaderMapping.notes}
                              onChange={(e) => updateHeaderMapping('notes', parseInt(e.target.value, 10))}
                              className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-550"
                            >
                              <option value={-1}>-- Not Map / Skip --</option>
                              {detectedHeadersList.map((head, hIdx) => (
                                <option key={hIdx} value={hIdx}>{head} (Col {String.fromCharCode(65 + (hIdx % 26))})</option>
                              ))}
                            </select>
                          </div>

                          {/* Schooling Status Map */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-705 block">Schooling (Day/Boarder)</label>
                            <select
                              value={manualHeaderMapping.schoolingStatus}
                              onChange={(e) => updateHeaderMapping('schoolingStatus', parseInt(e.target.value, 10))}
                              className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-550"
                            >
                              <option value={-1}>-- Not Map / Skip --</option>
                              {detectedHeadersList.map((head, hIdx) => (
                                <option key={hIdx} value={hIdx}>{head} (Col {String.fromCharCode(65 + (hIdx % 26))})</option>
                              ))}
                            </select>
                          </div>

                          {/* School Class Map */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-705 block">Class / Grade Level</label>
                            <select
                              value={manualHeaderMapping.schoolClass}
                              onChange={(e) => updateHeaderMapping('schoolClass', parseInt(e.target.value, 10))}
                              className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-[11px] font-medium text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-550"
                            >
                              <option value={-1}>-- Not Map / Skip --</option>
                              {detectedHeadersList.map((head, hIdx) => (
                                <option key={hIdx} value={hIdx}>{head} (Col {String.fromCharCode(65 + (hIdx % 26))})</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Part 1b: Horizontal spreadsheet cells preview grid */}
                        {rawCSVRows.length > 0 && (
                          <div className="space-y-1.5 mt-2 pt-2 border-t border-slate-200/50">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-semibold text-slate-700 font-mono tracking-tight flex items-center gap-1">
                                <span className="h-1.5 w-1.5 bg-indigo-550 rounded-full"></span>
                                Spreadsheet Cells Raw Grid Preview (First 4 Rows)
                              </span>
                              <span className="text-slate-400 font-sans font-mono text-[9px]">
                                {rawCSVRows.length} rows inside file
                              </span>
                            </div>
                            <div className="border border-slate-200 rounded-lg overflow-hidden overflow-x-auto shadow-3xs max-h-[140px] bg-white">
                              <table className="w-full text-[10px] text-slate-650 font-mono border-collapse divide-y divide-slate-200">
                                <thead className="bg-slate-50 sticky top-0 bg-opacity-95 z-20">
                                  <tr className="divide-x divide-slate-150">
                                    {detectedHeadersList.map((header, colIdx) => {
                                      const isMapped = Object.values(manualHeaderMapping).includes(colIdx);
                                      const mappedField = Object.entries(manualHeaderMapping).find(([_, cIdx]) => cIdx === colIdx)?.[0];
                                      return (
                                        <th key={colIdx} className={`p-1 text-center font-mono text-[9px] min-w-[130px] font-bold ${isMapped ? 'bg-indigo-50/70 text-indigo-750 border-b-2 border-b-indigo-500' : 'text-slate-400'}`}>
                                          <div className="text-[8px] opacity-70">Col {String.fromCharCode(65 + (colIdx % 26))}</div>
                                          <div className="truncate max-w-[150px]">{header}</div>
                                          {isMapped && (
                                            <span className="inline-block mt-0.5 px-1 py-0.2 bg-indigo-600 text-white font-sans text-[7px] leading-3 uppercase rounded font-extrabold tracking-tight">
                                              {mappedField === 'idNo' ? 'ID NO' : mappedField?.toUpperCase()}
                                            </span>
                                          )}
                                        </th>
                                      );
                                    })}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-150">
                                  {rawCSVRows.slice(0, 4).map((row, rIdx) => (
                                    <tr key={rIdx} className="hover:bg-slate-50 divide-x divide-slate-100">
                                      {row.map((cell, cIdx) => (
                                        <td key={cIdx} className="p-1 px-2 text-center text-slate-700 truncate max-w-[150px] font-sans" title={cell}>
                                          {cell || <span className="text-slate-350 italic text-[9px]">-</span>}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Part 2: Active Data Integrity Conflict Monitor / alerts dashboard */}
                    {(() => {
                      const idErrors = parsedImportList.filter(p => p.errors.some(e => e.includes('ID Number') || e.includes('Conflict'))).length;
                      const nameWarnings = parsedImportList.filter(p => p.warnings && p.warnings.some(w => w.includes('Name'))).length;
                      const contactWarnings = parsedImportList.filter(p => p.warnings && p.warnings.some(w => w.includes('Contact'))).length;
                      const missingNameErrors = parsedImportList.filter(p => p.errors.includes('Missing Name')).length;

                      if (idErrors === 0 && nameWarnings === 0 && contactWarnings === 0 && missingNameErrors === 0) return null;

                      return (
                        <div className="bg-rose-50/50 border border-rose-200 rounded-xl p-3 text-xs text-rose-950 space-y-1.5">
                          <h5 className="font-bold flex items-center gap-1.5 text-rose-900">
                            <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping"></span>
                            Data Integrity Warnings & Conflicts Identified
                          </h5>
                          <div className="flex flex-wrap gap-2 text-[10px] font-semibold text-slate-700 select-none">
                            {idErrors > 0 && <span className="bg-red-100 border border-red-200 text-red-700 px-2 py-0.5 rounded-lg">🚨 {idErrors} Duplicate National ID Conflicts (Blocked)</span>}
                            {missingNameErrors > 0 && <span className="bg-red-100 border border-red-200 text-red-700 px-2 py-0.5 rounded-lg">❌ {missingNameErrors} Missing Name Entries (Blocked)</span>}
                            {nameWarnings > 0 && <span className="bg-amber-100 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-lg">⚠️ {nameWarnings} Registered Students with Matching Names</span>}
                            {contactWarnings > 0 && <span className="bg-amber-100 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-lg">📱 {contactWarnings} Shared Contact Number Alerts</span>}
                          </div>
                          <p className="text-[9px] text-slate-500 font-medium">Any student record highlighting red ID conflicts cannot be checked for import unless mapping columns is resolved.</p>
                        </div>
                      );
                    })()}

                    {/* Part 3: Render Candidates list */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
                          Candidates Ready for Final Import Selection ({parsedImportList.length})
                        </h4>
                        
                        {/* Global action summary label */}
                        {(() => {
                          const valids = parsedImportList.filter(p => p.isValid).length;
                          const invalids = parsedImportList.length - valids;
                          return (
                            <span className="text-[10px] text-slate-500 font-medium font-sans">
                              {valids} ready to import{invalids > 0 ? ` • ${invalids} errors to evaluate` : ''}
                            </span>
                          );
                        })()}
                      </div>

                      {/* Header Columns details */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[220px] overflow-y-auto shadow-3xs">
                        <table className="w-full text-left text-xs text-slate-700 border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-mono text-[10px] uppercase font-bold sticky top-0 bg-opacity-95 z-20 backdrop-blur-xs">
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
                              <th className="p-2.5 w-36">Cohort Selection</th>
                              <th className="p-2.5 text-right w-24">Integrity Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {parsedImportList.map((item, idx) => (
                              <tr key={`${item.id}-${idx}`} className="hover:bg-slate-50/50">
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
                                      {item.name || <em className="text-red-400 font-sans text-[11px]">Missing Name</em>}
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
                                      {item.schoolingStatus && item.schoolingStatus !== '-' && (
                                        <span className="text-[9px] text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded font-sans" title="Schooling">
                                          School: {item.schoolingStatus}
                                        </span>
                                      )}
                                      {item.schoolClass && item.schoolClass !== '-' && (
                                        <span className="text-[9px] text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded font-sans" title="Class">
                                          Class: {item.schoolClass}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[9px] text-slate-400 font-mono block">
                                      {item.contact}
                                    </span>
                                    
                                    {/* Warnings list */}
                                    {item.warnings && item.warnings.map((warn, wIdx) => (
                                      <span key={wIdx} className="text-[9px] font-medium text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 leading-tight block select-none max-w-lg mt-1 border border-amber-100">
                                        ⚠️ {warn}
                                      </span>
                                    ))}
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
                                <td className="p-2.5 text-right font-mono">
                                  {item.isValid ? (
                                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded uppercase font-mono border border-emerald-100">
                                      Ready
                                    </span>
                                  ) : (
                                    <div className="flex flex-col items-end gap-0.5" title={item.errors.join(', ')}>
                                      <span className="text-[9px] text-rose-600 font-bold bg-rose-50 px-1 py-0.5 rounded uppercase font-mono max-w-[120px] truncate block border border-rose-100" title={item.errors.join(', ')}>
                                        Conflict
                                      </span>
                                      <span className="text-[8px] text-red-500 font-sans block text-right mt-0.5" title={item.errors.join(', ')}>
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

                {/* Excel Template Downloader section for Attendance */}
                <div className="bg-indigo-50/60 border border-indigo-150 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex gap-3 items-start">
                    <div className="h-9 w-9 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 shrink-0">
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 font-sans">Download Attendance Excel / CSV Template</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">
                        Generate a pre-filled Excel spreadsheet loaded with your current active student roster:
                        <strong className="text-indigo-800 font-semibold block mt-0.5">ID No., Student Name, Cohort, Status (Present/Absent)</strong>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={downloadAttendanceTemplate}
                    className="shrink-0 bg-indigo-600 hover:bg-indigo-750 text-white font-semibold text-xs py-2 px-3.5 rounded-xl shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5 focus:ring-2 focus:ring-indigo-500"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download Roster Sheet (.csv)
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0">
                  {/* Left: Input Textarea and File Upload (7 cols) */}
                  <div className="lg:col-span-7 flex flex-col space-y-3">
                    <div>
                      <span className="text-xs font-bold text-slate-700 block mb-1">
                        Pasted Attendance Roster text / CSV
                      </span>
                      <p className="text-[11px] text-slate-500 leading-normal font-sans mb-2">
                        Paste or drag-and-drop a spreadsheet. Supports structured Excel/CSV templates (with <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-indigo-750 font-bold">ID No., Student Name, Cohort, Status (Present/Absent)</code>) or simple loose barcode/name scanner rosters.
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

                    {/* Search Live Verification */}
                    <div className="p-2 border-b border-slate-150 flex items-center gap-2 bg-slate-50/55">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Filter live list by name or ID..."
                          value={liveVerificationSearchQuery}
                          onChange={(e) => setLiveVerificationSearchQuery(e.target.value)}
                          className="w-full pl-7 pr-10 py-1 bg-white border border-slate-200 rounded-xl text-[10px] text-slate-700 placeholder:text-slate-450 focus:outline-none focus:border-slate-400 font-sans"
                        />
                        {liveVerificationSearchQuery && (
                          <button 
                            type="button"
                            onClick={() => setLiveVerificationSearchQuery('')} 
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] bg-slate-150 hover:bg-slate-200 text-slate-600 rounded px-1"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="p-2 overflow-y-auto flex-1 divide-y divide-slate-100 max-h-[300px] lg:max-h-[340px]">
                      {activeParticipants.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 text-xs">
                          No active participants registered.
                        </div>
                      ) : (
                        (() => {
                          const list = activeParticipants.filter(p => {
                            if (!liveVerificationSearchQuery.trim()) return true;
                            const q = liveVerificationSearchQuery.toLowerCase();
                            return p.name.toLowerCase().includes(q) || 
                              (p.idNo && p.idNo.toLowerCase().includes(q));
                          });

                          if (list.length === 0) {
                            return (
                              <div className="p-6 text-center text-slate-400 italic font-sans text-xs">
                                No matching active students found for "{liveVerificationSearchQuery}"
                              </div>
                            );
                          }

                          return list.map((p, pIdx) => {
                            const isMatched = attendanceMatchingDetails.matchedIds.has(p.id);
                            return (
                              <div key={`preview-att-${p.id}-${pIdx}`} className="p-2 flex items-center justify-between gap-1 text-xs hover:bg-slate-50 transition-colors">
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
                          });
                        })()
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
                    onClick={() => {
                      try {
                        window.print();
                      } catch (err) {
                        console.warn("Window printing not supported in iframe sandbox:", err);
                      }
                    }}
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
                            {monthlyReportData.cohorts.map((cohort, cIdx) => (
                              <tr key={`${cohort.cohortName}-${cIdx}`} className="hover:bg-slate-50/50 transition-colors">
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
                        {monthlyReportData.cohorts.map((cohort, cIdx) => (
                          <div key={`ledger-${cohort.cohortName}-${cIdx}`} className="space-y-2.5 flex flex-col">
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
                                    {cohort.students.map((stRow, stRowIdx) => (
                                      <tr key={`${stRow.participant.id}-${stRowIdx}`} className="hover:bg-slate-50/30 transition-colors">
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
