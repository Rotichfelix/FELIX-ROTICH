import React, { useState, useMemo } from 'react';
import { 
  Heart, 
  Activity, 
  Mail, 
  Gift, 
  Home, 
  TrendingUp, 
  Eye, 
  ShieldCheck, 
  CheckCircle, 
  AlertTriangle, 
  Plus, 
  Search, 
  Filter, 
  Check, 
  Trash2, 
  Edit3, 
  User, 
  Calendar, 
  Clock, 
  CheckSquare, 
  X, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  Info,
  Award,
  AlertCircle,
  Stethoscope,
  BookOpen,
  MessageSquare,
  Printer,
  Receipt,
  DollarSign,
  Download,
  Minus,
  Lock,
  Unlock,
  FileText,
  Sparkles
} from 'lucide-react';
import { Participant, FilledForm, OutreachLog, Budget, PettyCashRequest, PerformanceTargetItem, StaffPerformanceCycle } from '../types';
import { generateBudgetPDF } from '../utils/budgetPdf';
import { generateWorkplanPDF } from '../utils/workplanPdf';
import { generatePerformancePDF } from '../utils/performancePdf';
import { generatePettyCashPDF } from '../utils/pettyCashPdf';
import { generateWorkplanWord, generateBudgetWord, generatePerformanceWord } from '../utils/wordExport';

export const STANDARD_CDO_KRAS = [
  {
    kra: 'Sponsor Letters & Correspondence',
    plannedActivities: 'Collect, translate, scan, and dispatch 100% of children\'s letters in accordance with programmatic deadlines.',
    measureOfSuccess: 'Zero backlog of correspondence; 100% timely correspondence rate for all assigned children.',
  },
  {
    kra: 'Child Health, Sanitation & Nutrition Support',
    plannedActivities: 'Coordinate routine deworming campaigns, physical medical examinations, growth monitoring, and sanitary hygiene kit distributions.',
    measureOfSuccess: '95%+ attendance of children on deworming and medical checkup days; 100% distribution logs maintained.',
  },
  {
    kra: 'Saturday Curriculum Delivery & Caregiver Meetings',
    plannedActivities: 'Prepare age-appropriate lesson plans, facilitate cognitive and spiritual lessons, and conduct periodic caregiver meetings.',
    measureOfSuccess: '100% of curriculum lessons delivered as per syllabus; minutes taken for all caregiver support group gatherings.',
  },
  {
    kra: 'Home Visitations & Family Case Management',
    plannedActivities: 'Conduct home visits for assigned households, prioritizing highly vulnerable children, and document case development profiles.',
    measureOfSuccess: 'Complete at least 15 comprehensive home visit records per month on system files.',
  },
  {
    kra: 'Child Information Portfolio & Photographic Updates',
    plannedActivities: 'Update and verify school report cards, medical reports, heights, weights, and high-fidelity photographs on the platform.',
    measureOfSuccess: '100% up-to-date and complete child files with zero outstanding platform warnings.',
  },
  {
    kra: 'Financial Integrity & Voucher Accountability',
    plannedActivities: 'Request center activities petty cash funds, match accurate supplier receipts, and generate official petty cash vouchers.',
    measureOfSuccess: '100% reconciliation of petty cash receipts with center expense ledgers with zero discrepancy.',
  }
];

export interface StaffTask {
  id: string;
  title: string;
  assignedRole: 'CDO HEALTH' | 'CDO SDR' | 'CDO HBP';
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in-progress' | 'completed';
  dueDate: string;
  description: string;
  descriptions?: string[];
  createdByRole?: 'CDO HEALTH' | 'CDO SDR' | 'CDO HBP' | 'PROJECT DIRECTOR';
  approvalStatus?: 'pending_approval' | 'approved' | 'returned' | 'draft';
  correctionNotes?: string;
}

interface ComplianceMetrics {
  childProtectionSigned: boolean;
  healthComplianceMet: boolean;
  financialAuditingApproved: boolean;
  staffCertificationsUpdated: boolean;
}

interface CdoStaffPortalsProps {
  participants: Participant[];
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>;
  staffTasks: StaffTask[];
  setStaffTasks: (tasks: StaffTask[]) => void;
  complianceStatus: ComplianceMetrics | null;
  setComplianceStatus: (status: ComplianceMetrics) => void;
  onLogAudit: (action: string, details: string) => void;
  triggerSyncUpload: (customData?: any) => Promise<void>;
  currentUserEmail: string;
  auditTrailLogs: { id: string; timestamp: string; category: string; action: string; details: string; operator?: string }[];
  budgets: Budget[];
  setBudgets: React.Dispatch<React.SetStateAction<Budget[]>>;
  pettyCashRequests: PettyCashRequest[];
  setPettyCashRequests: React.Dispatch<React.SetStateAction<PettyCashRequest[]>>;
  performanceCycles: StaffPerformanceCycle[];
  setPerformanceCycles: React.Dispatch<React.SetStateAction<StaffPerformanceCycle[]>>;
  isAdminMode?: boolean;
  userRole?: string;
  monthlyJournals?: any[];
  setMonthlyJournals?: React.Dispatch<React.SetStateAction<any[]>>;
  annualTargetsJournals?: any[];
  setAnnualTargetsJournals?: React.Dispatch<React.SetStateAction<any[]>>;
  monthlyPerformanceTargets?: any[];
  setMonthlyPerformanceTargets?: React.Dispatch<React.SetStateAction<any[]>>;
  closedMonthlyPerformanceJournals?: any[];
  setClosedMonthlyPerformanceJournals?: React.Dispatch<React.SetStateAction<any[]>>;
}

export const CdoStaffPortals: React.FC<CdoStaffPortalsProps> = ({
  participants,
  setParticipants,
  staffTasks,
  setStaffTasks,
  complianceStatus,
  setComplianceStatus,
  onLogAudit,
  triggerSyncUpload,
  currentUserEmail,
  auditTrailLogs,
  budgets,
  setBudgets,
  pettyCashRequests,
  setPettyCashRequests,
  performanceCycles,
  setPerformanceCycles,
  isAdminMode = false,
  userRole = 'ADMINISTRATOR',
  monthlyJournals = [],
  setMonthlyJournals = (() => {}) as React.Dispatch<React.SetStateAction<any[]>>,
  annualTargetsJournals = [],
  setAnnualTargetsJournals = (() => {}) as React.Dispatch<React.SetStateAction<any[]>>,
  monthlyPerformanceTargets = [],
  setMonthlyPerformanceTargets = (() => {}) as React.Dispatch<React.SetStateAction<any[]>>,
  closedMonthlyPerformanceJournals = [],
  setClosedMonthlyPerformanceJournals = (() => {}) as React.Dispatch<React.SetStateAction<any[]>>
}) => {
  const [activeRole, setActiveRole] = useState<'CDO HEALTH' | 'CDO SDR' | 'CDO HBP' | 'PROJECT DIRECTOR' | 'OVERSEER' | 'OFFICIAL JOURNALS'>(() => {
    if (userRole && ['CDO HEALTH', 'CDO SDR', 'CDO HBP', 'PROJECT DIRECTOR', 'OVERSEER', 'OFFICIAL JOURNALS'].includes(userRole)) {
      return userRole as any;
    }
    return 'CDO HEALTH';
  });

  React.useEffect(() => {
    if (userRole && ['CDO HEALTH', 'CDO SDR', 'CDO HBP', 'PROJECT DIRECTOR', 'OVERSEER', 'OFFICIAL JOURNALS'].includes(userRole)) {
      setActiveRole(userRole as any);
    }
  }, [userRole]);
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [cohortFilter, setCohortFilter] = useState('all');

  // Interactive Forms State
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  
  // Health Screening Form
  const [bloodType, setBloodType] = useState('O+');
  const [allergies, setAllergies] = useState('');
  const [vaccinations, setVaccinations] = useState('Fully Vaccinated');
  const [recentCheckup, setRecentCheckup] = useState('');
  const [healthSummary, setHealthSummary] = useState('');
  const [isEmergency, setIsEmergency] = useState(false);

  // Correspondence Form
  const [letterType, setLetterType] = useState('Sponsor Letter');
  const [letterStatus, setLetterStatus] = useState('Drafting');
  const [donorName, setDonorName] = useState('');
  const [sdrNotes, setSdrNotes] = useState('');

  // Home Visit & Milestones Form
  const [visitDate, setVisitDate] = useState('');
  const [cognitiveMilestone, setCognitiveMilestone] = useState<'Emerging' | 'Achieved' | 'Concern'>('Achieved');
  const [motorMilestone, setMotorMilestone] = useState<'Emerging' | 'Achieved' | 'Concern'>('Achieved');
  const [languageMilestone, setLanguageMilestone] = useState<'Emerging' | 'Achieved' | 'Concern'>('Achieved');
  const [caregiverFeedback, setCaregiverFeedback] = useState('');
  const [nextVisitDate, setNextVisitDate] = useState('');

  // Project Director Task Form
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskRole, setTaskRole] = useState<'CDO HEALTH' | 'CDO SDR' | 'CDO HBP'>('CDO HEALTH');
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskDescription, setTaskDescription] = useState('');

  // Budgets Portal States
  const [isCreatingBudget, setIsCreatingBudget] = useState(false);
  const [budgetTitle, setBudgetTitle] = useState('');
  const [budgetDescription, setBudgetDescription] = useState('');
  const [budgetCategory, setBudgetCategory] = useState<'Health' | 'Sponsor Relations' | 'Home-Based' | 'General'>('General');
  const [budgetItems, setBudgetItems] = useState<Array<{ name: string; qty: number; unitCost: number }>>([{ name: '', qty: 1, unitCost: 0 }]);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);

  // Petty Cash Request States
  const [isCreatingPettyCash, setIsCreatingPettyCash] = useState(false);
  const [pettyCashAmount, setPettyCashAmount] = useState<number>(0);
  const [pettyCashPurpose, setPettyCashPurpose] = useState('');
  const [pettyCashDates, setPettyCashDates] = useState('');
  const [isEnhancingPettyCash, setIsEnhancingPettyCash] = useState(false);
  const [enhancedPettyCashExplanation, setEnhancedPettyCashExplanation] = useState('');
  const [editingPettyCashId, setEditingPettyCashId] = useState<string | null>(null);
  const [cdoPettyCashFilter, setCdoPettyCashFilter] = useState<'All' | 'Draft' | 'Pending' | 'Approved' | 'Returned for Correction' | 'Rejected'>('All');
  const [activePettyCashCorrectionId, setActivePettyCashCorrectionId] = useState<string | null>(null);
  const [currentPettyCashCorrectionNotes, setCurrentPettyCashCorrectionNotes] = useState('');
  
  // PD Correction states
  const [activeCorrectionId, setActiveCorrectionId] = useState<string | null>(null);
  const [currentCorrectionNotes, setCurrentCorrectionNotes] = useState('');
  const [pdBudgetFilter, setPdBudgetFilter] = useState<'All' | 'Pending' | 'Approved' | 'Returned for Correction' | 'Signed-off'>('All');
  const [pdPettyCashFilter, setPdPettyCashFilter] = useState<'All' | 'Pending' | 'Approved' | 'Returned for Correction' | 'Rejected'>('All');
  const [cdoBudgetFilter, setCdoBudgetFilter] = useState<'All' | 'Draft' | 'Pending' | 'Approved' | 'Returned for Correction' | 'Signed-off'>('All');

  // Archival Journals States
  const [selectedJournalType, setSelectedJournalType] = useState<'budgets' | 'active_tasks' | 'completed_tasks'>('budgets');
  const [journalSearchQuery, setJournalSearchQuery] = useState('');
  const [journalCategoryFilter, setJournalCategoryFilter] = useState('all');

  // Enhanced Collapsible Archival Journals & Performance States
  const [selectedJournalSubtab, setSelectedJournalSubtab] = useState<'monthly_snapshots' | 'annual_targets' | 'monthly_performance'>('monthly_snapshots');
  const [customFiscalYear, setCustomFiscalYear] = useState('FY 2026/2027');
  const [targetStaffName, setTargetStaffName] = useState('DR. JOHN OKORI');
  const [journalStaffRole, setJournalStaffRole] = useState('CDO HEALTH');
  
  // Accordion toggle states
  const [expandedMonthlyJournalId, setExpandedMonthlyJournalId] = useState<string | null>(null);
  const [expandedAnnualJournalId, setExpandedAnnualJournalId] = useState<string | null>(null);
  const [expandedClosedPerformanceId, setExpandedClosedPerformanceId] = useState<string | null>(null);

  // Forms for adding targets & progress notes
  const [isAddingAnnualTarget, setIsAddingAnnualTarget] = useState(false);
  const [isAddingMonthlyTarget, setIsAddingMonthlyTarget] = useState(false);
  
  const [newTargetKra, setNewTargetKra] = useState('');
  const [newTargetActivities, setNewTargetActivities] = useState('');
  const [newTargetSuccess, setNewTargetSuccess] = useState('');
  const [journalTargetDate, setJournalTargetDate] = useState('');
  const [targetMonthName, setTargetMonthName] = useState('June 2026');

  // Progress Note states
  const [activeNoteTargetId, setActiveNoteTargetId] = useState<{ journalId?: string; targetId: string; type: 'annual' | 'monthly' } | null>(null);
  const [newProgressNoteText, setNewProgressNoteText] = useState('');

  // Close Month Form States
  const [isClosingMonthModal, setIsClosingMonthModal] = useState(false);
  const [monthToClose, setMonthToClose] = useState('June 2026');

  // --- ACTIONS FOR JOURNAL SYSTEMS ---

  const handleCloseMonth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!monthToClose.trim()) return;

    // Capture current states
    const activeBudgets = [...budgets];
    const activeTasks = [...staffTasks];
    const activePettyCash = [...pettyCashRequests];

    // Create a new monthly journal snapshot
    const newJournal = {
      id: `MJ-${Date.now()}`,
      monthName: monthToClose,
      closedAt: new Date().toISOString(),
      closedBy: currentUserEmail || "PROJECT DIRECTOR",
      budgets: activeBudgets,
      staffTasks: activeTasks,
      pettyCashRequests: activePettyCash
    };

    // Append to journals and clear active records
    const updatedJournals = [newJournal, ...monthlyJournals];
    setMonthlyJournals(updatedJournals);

    // Reset active tables to open another journal for subsequent months
    setBudgets([]);
    setPettyCashRequests([]);
    // Optionally keep tasks that are incomplete, or reset to a clean slate
    setStaffTasks([]);

    onLogAudit(
      'Journal Closure',
      `Project Director closed budgets, tasks, workplans, and petty cash requests for ${monthToClose} and archived them permanently.`
    );

    setIsClosingMonthModal(false);
    
    // Save to local storage right away (triggers effect too)
    localStorage.setItem('attendance_tracker_monthly_journals', JSON.stringify(updatedJournals));
    localStorage.setItem('attendance_tracker_budgets', JSON.stringify([]));
    localStorage.setItem('attendance_tracker_petty_cash', JSON.stringify([]));
    localStorage.setItem('attendance_tracker_staff_tasks', JSON.stringify([]));

    // Push up to secure Postgres DB
    setTimeout(() => {
      triggerSyncUpload({
        budgets: [],
        pettyCashRequests: [],
        staffTasks: [],
        monthlyJournals: updatedJournals
      });
    }, 100);

    alert(`Success! All active budgets, tasks, workplans, and petty cash records for ${monthToClose} are now frozen permanently in the journals under Center archives. A clean ledger is now open for subsequent months.`);
  };

  const handleAddAnnualTarget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTargetKra || !newTargetActivities) return;

    const newTarget = {
      id: `AT-${Date.now()}`,
      kra: newTargetKra,
      plannedActivities: newTargetActivities,
      measureOfSuccess: newTargetSuccess,
      targetDate: journalTargetDate || new Date().toISOString().split('T')[0],
      progressNotes: []
    };

    let updatedJournals = [...annualTargetsJournals];
    const existingIndex = updatedJournals.findIndex(
      j => j.fiscalYear === customFiscalYear && j.staffRole === journalStaffRole
    );

    if (existingIndex > -1) {
      updatedJournals[existingIndex].targets.push(newTarget);
    } else {
      updatedJournals.push({
        id: `ATJ-${Date.now()}`,
        fiscalYear: customFiscalYear,
        staffRole: journalStaffRole,
        staffName: targetStaffName || "UNASSIGNED STAFF",
        targets: [newTarget]
      });
    }

    setAnnualTargetsJournals(updatedJournals);
    setIsAddingAnnualTarget(false);
    setNewTargetKra('');
    setNewTargetActivities('');
    setNewTargetSuccess('');
    setJournalTargetDate('');

    onLogAudit(
      'Target Creation',
      `Added independent annual target for KRA "${newTarget.kra}" in fiscal year ${customFiscalYear} for role ${journalStaffRole}.`
    );

    localStorage.setItem('attendance_tracker_annual_targets_journals', JSON.stringify(updatedJournals));
    setTimeout(() => {
      triggerSyncUpload({ annualTargetsJournals: updatedJournals });
    }, 100);
  };

  const handleAddMonthlyTarget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTargetKra || !newTargetActivities) return;

    const newTarget = {
      id: `MPT-${Date.now()}`,
      kra: newTargetKra,
      plannedActivities: newTargetActivities,
      measureOfSuccess: newTargetSuccess,
      targetDate: journalTargetDate || new Date().toISOString().split('T')[0],
      staffRole: journalStaffRole,
      staffName: targetStaffName || "UNASSIGNED STAFF",
      progressNotes: []
    };

    const updated = [newTarget, ...monthlyPerformanceTargets];
    setMonthlyPerformanceTargets(updated);
    setIsAddingMonthlyTarget(false);
    setNewTargetKra('');
    setNewTargetActivities('');
    setNewTargetSuccess('');
    setJournalTargetDate('');

    onLogAudit(
      'Monthly Target',
      `Added active monthly target for KRA "${newTarget.kra}" for ${targetMonthName}.`
    );

    localStorage.setItem('attendance_tracker_monthly_performance_targets', JSON.stringify(updated));
    setTimeout(() => {
      triggerSyncUpload({ monthlyPerformanceTargets: updated });
    }, 100);
  };

  const handleAddProgressNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeNoteTargetId || !newProgressNoteText.trim()) return;

    const noteItem = {
      id: `PN-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      note: newProgressNoteText,
      author: currentUserEmail || "PROJECT DIRECTOR"
    };

    if (activeNoteTargetId.type === 'annual') {
      const updatedJournals = annualTargetsJournals.map(journal => {
        if (journal.id === activeNoteTargetId.journalId) {
          return {
            ...journal,
            targets: journal.targets.map((t: any) => {
              if (t.id === activeNoteTargetId.targetId) {
                return {
                  ...t,
                  progressNotes: [...(t.progressNotes || []), noteItem]
                };
              }
              return t;
            })
          };
        }
        return journal;
      });

      setAnnualTargetsJournals(updatedJournals);
      localStorage.setItem('attendance_tracker_annual_targets_journals', JSON.stringify(updatedJournals));
      setTimeout(() => {
        triggerSyncUpload({ annualTargetsJournals: updatedJournals });
      }, 100);

    } else {
      // Monthly target note
      const updatedTargets = monthlyPerformanceTargets.map(t => {
        if (t.id === activeNoteTargetId.targetId) {
          return {
            ...t,
            progressNotes: [...(t.progressNotes || []), noteItem]
          };
        }
        return t;
      });

      setMonthlyPerformanceTargets(updatedTargets);
      localStorage.setItem('attendance_tracker_monthly_performance_targets', JSON.stringify(updatedTargets));
      setTimeout(() => {
        triggerSyncUpload({ monthlyPerformanceTargets: updatedTargets });
      }, 100);
    }

    onLogAudit(
      'Progress Note',
      `Entered progress note for ${activeNoteTargetId.type} target id: ${activeNoteTargetId.targetId}.`
    );

    setNewProgressNoteText('');
    setActiveNoteTargetId(null);
  };

  const handleCloseMonthlyPerformanceTargets = (monthName: string) => {
    if (!window.confirm(`Close and archive active monthly targets for ${monthName}? This freezes targets permanently in journals and clears active workspaces for the subsequent month.`)) return;

    const activeTargets = [...monthlyPerformanceTargets];

    const newClosedJournal = {
      id: `CMPJ-${Date.now()}`,
      monthName,
      closedAt: new Date().toISOString(),
      closedBy: currentUserEmail || "PROJECT DIRECTOR",
      targets: activeTargets
    };

    const updatedJournals = [newClosedJournal, ...closedMonthlyPerformanceJournals];
    setClosedMonthlyPerformanceJournals(updatedJournals);
    setMonthlyPerformanceTargets([]); // Clear active targets

    onLogAudit(
      'Monthly Targets Closed',
      `Closed and archived monthly targets for ${monthName} permanently.`
    );

    localStorage.setItem('attendance_tracker_closed_monthly_performance_journals', JSON.stringify(updatedJournals));
    localStorage.setItem('attendance_tracker_monthly_performance_targets', JSON.stringify([]));

    setTimeout(() => {
      triggerSyncUpload({
        monthlyPerformanceTargets: [],
        closedMonthlyPerformanceJournals: updatedJournals
      });
    }, 100);

    alert(`Success! Monthly performance targets for ${monthName} have been safely closed and permanently archived. Active workspace is now ready for subsequent month's targets.`);
  };

  // CDO Task & PD Workplan Approval states
  const [isCreatingCdoTask, setIsCreatingCdoTask] = useState(false);
  const [cdoTaskTitle, setCdoTaskTitle] = useState('');
  const [cdoTaskDescription, setCdoTaskDescription] = useState('');
  const [cdoTaskDueDate, setCdoTaskDueDate] = useState('');
  const [cdoTaskPriority, setCdoTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [cdoTaskFilter, setCdoTaskFilter] = useState<'All' | 'My Approved Tasks' | 'Pending PD Approval' | 'Returned for Correction' | 'Drafts'>('All');

  // Performance targets form states
  const [isCreatingCycle, setIsCreatingCycle] = useState(false);
  const [cycleFiscalYear, setCycleFiscalYear] = useState('FY 2024/2025');
  const [cycleStaffName, setCycleStaffName] = useState('');
  const [cycleTargets, setCycleTargets] = useState<PerformanceTargetItem[]>([]);
  const [newKra, setNewKra] = useState('');
  const [newActivities, setNewActivities] = useState('');
  const [newSuccessMeasure, setNewSuccessMeasure] = useState('');
  const [newTargetDate, setNewTargetDate] = useState('');
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [staffSign, setStaffSign] = useState('');
  const [selfComments, setSelfComments] = useState('');
  const [editingInlineId, setEditingInlineId] = useState<string | null>(null);
  
  // Inline individual target self-assessment edits
  const [editingSelfAssessmentId, setEditingSelfAssessmentId] = useState<string | null>(null);
  const [tempSelfAssessmentValue, setTempSelfAssessmentValue] = useState('');

  // Project Director assessments
  const [pdOverallSupervisorComment, setPdOverallSupervisorComment] = useState('');
  const [pdSupervisorSignedName, setPdSupervisorSignedName] = useState('');
  const [editingSupervisorAssessmentId, setEditingSupervisorAssessmentId] = useState<string | null>(null);
  const [tempSupervisorAssessmentValue, setTempSupervisorAssessmentValue] = useState('');

  // Overseer reviews
  const [overseerReviewerComment, setOverseerReviewerComment] = useState('');
  const [overseerSignedName, setOverseerSignedName] = useState('');
  const [activeTaskCorrectionId, setActiveTaskCorrectionId] = useState<string | null>(null);
  const [currentTaskCorrectionNotes, setCurrentTaskCorrectionNotes] = useState('');
  const [cdoTaskDescriptions, setCdoTaskDescriptions] = useState<string[]>(['']);

  // New states for Overseer and PD appraisal editing
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [targetStaffRole, setTargetStaffRole] = useState<'CDO HEALTH' | 'CDO SDR' | 'CDO HBP' | 'OVERSEER'>('OVERSEER');
  const [editingCycleId, setEditingCycleId] = useState<string | null>(null);
  const [editingSelfAssessmentIdByPd, setEditingSelfAssessmentIdByPd] = useState<string | null>(null);
  const [tempSelfAssessmentValueByPd, setTempSelfAssessmentValueByPd] = useState('');

  // Detailed Modal Viewing States
  const [viewingBudget, setViewingBudget] = useState<Budget | null>(null);
  const [viewingTask, setViewingTask] = useState<StaffTask | null>(null);

  // Journal and Month states
  const [currentJournalMonth, setCurrentJournalMonth] = useState<string>(() => {
    return localStorage.getItem('current_journal_month') || '2026-06';
  });
  const [signedOffMonths, setSignedOffMonths] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('signed_off_months');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  // Sync journal states to localStorage
  React.useEffect(() => {
    localStorage.setItem('current_journal_month', currentJournalMonth);
  }, [currentJournalMonth]);

  React.useEffect(() => {
    localStorage.setItem('signed_off_months', JSON.stringify(signedOffMonths));
  }, [signedOffMonths]);

  // Status flags / feedback
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  
  // State to hold the last submission details for instant download
  const [lastSubmission, setLastSubmission] = useState<{
    type: 'workplan' | 'budget' | 'performance' | 'pettycash';
    data: any;
  } | null>(null);

  const handleDownloadSubmittedPdf = () => {
    if (!lastSubmission) return;
    if (lastSubmission.type === 'workplan') {
      generateWorkplanPDF(lastSubmission.data);
    } else if (lastSubmission.type === 'budget') {
      generateBudgetPDF(lastSubmission.data, false);
    } else if (lastSubmission.type === 'performance') {
      generatePerformancePDF(lastSubmission.data);
    } else if (lastSubmission.type === 'pettycash') {
      generatePettyCashPDF(lastSubmission.data, false);
    }
  };

  const handleDownloadSubmittedWord = () => {
    if (!lastSubmission) return;
    if (lastSubmission.type === 'workplan') {
      generateWorkplanWord(lastSubmission.data);
    } else if (lastSubmission.type === 'budget') {
      generateBudgetWord(lastSubmission.data);
    } else if (lastSubmission.type === 'performance') {
      generatePerformanceWord(lastSubmission.data);
    }
  };

  // Get active cohort list
  const cohorts = useMemo(() => {
    const list = new Set(participants.map(p => p.cohort).filter(Boolean));
    return ['all', ...Array.from(list).filter((c): c is string => typeof c === 'string' && c.toLowerCase() !== 'all')];
  }, [participants]);

  // Filter participants
  const filteredParticipants = useMemo(() => {
    return participants.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (p.idNo && p.idNo.toLowerCase().includes(searchQuery.toLowerCase())) ||
                            (p.village && p.village.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCohort = cohortFilter === 'all' || p.cohort === cohortFilter;
      return matchesSearch && matchesCohort && !p.isFormer;
    });
  }, [participants, searchQuery, cohortFilter]);

  // Handle Medical screening submission
  const handleSaveMedicalLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) return;

    const student = participants.find(p => p.id === selectedStudentId);
    if (!student) return;

    const medicalRecord: FilledForm = {
      id: 'MED-' + Date.now(),
      type: 'Sick Participant Follow', // mapping under existing schema types
      date: recentCheckup || new Date().toISOString().split('T')[0],
      data: {
        bloodType,
        allergies,
        vaccinationStatus: vaccinations,
        recentCheckupDate: recentCheckup,
        healthStatusSummary: healthSummary,
        isEmergencyAlert: isEmergency,
        recordedBy: currentUserEmail || 'CDO HEALTH Officer'
      }
    };

    const updatedParticipants = participants.map(p => {
      if (p.id === selectedStudentId) {
        // Build medical update
        const updatedForms = [...(p.filledForms || []), medicalRecord];
        return {
          ...p,
          filledForms: updatedForms,
          // Sync with structured schemas
          registrationNotes: isEmergency 
            ? `🚨 EMERGENCY MEDICAL FLAG: ${healthSummary}. Allergies: ${allergies}. ${p.registrationNotes || ''}`
            : p.registrationNotes
        };
      }
      return p;
    });

    setParticipants(updatedParticipants);
    onLogAudit(
      'Medical Screening Logged', 
      `Recorded medical details for student "${student.name}" - ${vaccinations}, Blood: ${bloodType}. Emergency Status: ${isEmergency ? 'YES' : 'NO'}`
    );
    
    // Clear Form
    setRecentCheckup('');
    setHealthSummary('');
    setAllergies('');
    setIsEmergency(false);
    setFormSuccess(`Health screening saved successfully for ${student.name}!`);
    setTimeout(() => setFormSuccess(null), 3000);

    // Sync database
    await triggerSyncUpload({ participants: updatedParticipants });
  };

  // Handle SDR Correspondence submission
  const handleSaveCorrespondenceLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) return;

    const student = participants.find(p => p.id === selectedStudentId);
    if (!student) return;

    const sdrRecord: FilledForm = {
      id: 'SDR-' + Date.now(),
      type: 'Referral', // mapping under existing schema types
      date: new Date().toISOString().split('T')[0],
      data: {
        letterType,
        status: letterStatus,
        sponsorName: donorName || 'Assigned Sponsor',
        notes: sdrNotes,
        recordedBy: currentUserEmail || 'CDO SDR Officer'
      }
    };

    const updatedParticipants = participants.map(p => {
      if (p.id === selectedStudentId) {
        return {
          ...p,
          filledForms: [...(p.filledForms || []), sdrRecord]
        };
      }
      return p;
    });

    setParticipants(updatedParticipants);
    onLogAudit(
      'SDR Record Updated', 
      `Logged sponsorship letter [${letterType}] status "${letterStatus}" for participant "${student.name}".`
    );

    setDonorName('');
    setSdrNotes('');
    setFormSuccess(`Sponsor correspondence updated successfully for ${student.name}!`);
    setTimeout(() => setFormSuccess(null), 3000);

    await triggerSyncUpload({ participants: updatedParticipants });
  };

  // Handle Home-Based Program Visit & Milestones submission
  const handleSaveHbpLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) return;

    const student = participants.find(p => p.id === selectedStudentId);
    if (!student) return;

    const hbpRecord: FilledForm = {
      id: 'HBP-' + Date.now(),
      type: 'Home Visit', // existing schema native support
      date: visitDate || new Date().toISOString().split('T')[0],
      data: {
        cognitiveMilestone,
        motorMilestone,
        languageMilestone,
        caregiverFeedback,
        nextVisitDate,
        recordedBy: currentUserEmail || 'CDO HBP Specialist'
      }
    };

    const updatedParticipants = participants.map(p => {
      if (p.id === selectedStudentId) {
        return {
          ...p,
          filledForms: [...(p.filledForms || []), hbpRecord]
        };
      }
      return p;
    });

    setParticipants(updatedParticipants);
    onLogAudit(
      'Home Visit Registered', 
      `Recorded Home-Based Program visit and milestone assessments (Motor: ${motorMilestone}, Cognitive: ${cognitiveMilestone}) for "${student.name}".`
    );

    setVisitDate('');
    setCaregiverFeedback('');
    setNextVisitDate('');
    setFormSuccess(`HBP visit check-in saved successfully for ${student.name}!`);
    setTimeout(() => setFormSuccess(null), 3000);

    await triggerSyncUpload({ participants: updatedParticipants });
  };

  // Project Director adds a task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !taskDueDate) return;

    const newTask: StaffTask = {
      id: 'TASK-' + Date.now(),
      title: taskTitle.trim(),
      assignedRole: taskRole,
      priority: taskPriority,
      status: 'pending',
      dueDate: taskDueDate,
      description: taskDescription.trim(),
      createdByRole: 'PROJECT DIRECTOR',
      approvalStatus: 'approved'
    };

    const updatedTasks = [...staffTasks, newTask];
    setStaffTasks(updatedTasks);
    onLogAudit(
      'Staff Task Assigned', 
      `Project Director assigned task "${taskTitle}" to ${taskRole} role due ${taskDueDate}.`
    );

    setTaskTitle('');
    setTaskDescription('');
    setTaskDueDate('');
    setIsAddTaskOpen(false);
    
    setFormSuccess('Task assigned to CDO staff successfully!');
    setTimeout(() => setFormSuccess(null), 3000);

    // Sync via general endpoint
    await triggerSyncUpload();
  };

  // CDO Creates or Resubmits a Workplan/Task
  const handleCreateOrUpdateCdoTask = async (e?: React.FormEvent, isDraftInput: boolean = false) => {
    if (e) e.preventDefault();
    if (!cdoTaskTitle.trim() || !cdoTaskDueDate) return;

    const filteredDescriptions = cdoTaskDescriptions.map(d => d.trim()).filter(Boolean);
    const calculatedStatus = isDraftInput ? ('draft' as const) : ('pending_approval' as const);
    const taskIdToUse = editingTaskId || ('TASK-' + Date.now());

    const submittedTask: StaffTask = {
      id: taskIdToUse,
      title: cdoTaskTitle.trim(),
      assignedRole: activeRole as 'CDO HEALTH' | 'CDO SDR' | 'CDO HBP',
      priority: cdoTaskPriority,
      status: 'pending',
      dueDate: cdoTaskDueDate,
      description: cdoTaskDescription.trim(),
      descriptions: filteredDescriptions,
      createdByRole: activeRole as 'CDO HEALTH' | 'CDO SDR' | 'CDO HBP',
      approvalStatus: calculatedStatus
    };

    if (editingTaskId) {
      const updatedTasks = staffTasks.map(t => {
        if (t.id === editingTaskId) {
          return {
            ...t,
            title: cdoTaskTitle.trim(),
            description: cdoTaskDescription.trim(),
            descriptions: filteredDescriptions,
            dueDate: cdoTaskDueDate,
            priority: cdoTaskPriority,
            approvalStatus: calculatedStatus,
            correctionNotes: undefined
          };
        }
        return t;
      });
      setStaffTasks(updatedTasks);
      onLogAudit(
        isDraftInput ? 'Staff Task Saved as Draft' : 'Staff Task Resubmitted',
        `${activeRole} ${isDraftInput ? 'saved task workplan as draft' : 'resubmitted task workplan'} "${cdoTaskTitle.trim()}".`
      );
      setEditingTaskId(null);
    } else {
      const updatedTasks = [...staffTasks, submittedTask];
      setStaffTasks(updatedTasks);
      onLogAudit(
        isDraftInput ? 'Staff Task Saved as Draft' : 'Staff Task Submitted',
        `${activeRole} ${isDraftInput ? 'saved new task workplan as draft' : 'submitted a new workplan task'} "${cdoTaskTitle.trim()}".`
      );
    }

    setCdoTaskTitle('');
    setCdoTaskDescription('');
    setCdoTaskDueDate('');
    setCdoTaskPriority('medium');
    setCdoTaskDescriptions(['']);
    setIsCreatingCdoTask(false);

    if (!isDraftInput) {
      setLastSubmission({
        type: 'workplan',
        data: submittedTask
      });
      setFormSuccess('Workplan task submitted for PD approval successfully! You can download official PDF/Word copies below.');
      setTimeout(() => setFormSuccess(null), 15000);
    } else {
      setLastSubmission(null);
      setFormSuccess('Workplan task saved as draft successfully!');
      setTimeout(() => setFormSuccess(null), 3000);
    }

    await triggerSyncUpload();
  };

  // CDO Deletes/Retracts their Task
  const handleDeleteCdoTask = async (taskId: string) => {
    const targetTask = staffTasks.find(t => t.id === taskId);
    if (!targetTask) return;
    if (!window.confirm(`Are you sure you want to retract/delete workplan task "${targetTask.title}"?`)) return;

    const updatedTasks = staffTasks.filter(t => t.id !== taskId);
    setStaffTasks(updatedTasks);
    onLogAudit(
      'Staff Task Retracted',
      `${activeRole} retracted task workplan "${targetTask.title}".`
    );
    await triggerSyncUpload();
  };

  // PD Approves CDO Task Workplan
  const handleApproveCdoTask = async (taskId: string) => {
    const targetTask = staffTasks.find(t => t.id === taskId);
    if (!targetTask) return;

    const updatedTasks = staffTasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          approvalStatus: 'approved' as const,
          correctionNotes: undefined
        };
      }
      return t;
    });
    setStaffTasks(updatedTasks);
    onLogAudit(
      'Staff Task Approved',
      `Project Director approved workplan task "${targetTask.title}" submitted by ${targetTask.createdByRole}.`
    );
    setFormSuccess(`Workplan task "${targetTask.title}" approved successfully!`);
    setTimeout(() => setFormSuccess(null), 3000);

    await triggerSyncUpload();
  };

  // PD Returns CDO Task Workplan with comments
  const handleReturnTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTaskCorrectionId) return;

    const targetTask = staffTasks.find(t => t.id === activeTaskCorrectionId);
    if (!targetTask) return;

    const updatedTasks = staffTasks.map(t => {
      if (t.id === activeTaskCorrectionId) {
        return {
          ...t,
          approvalStatus: 'returned' as const,
          correctionNotes: currentTaskCorrectionNotes
        };
      }
      return t;
    });
    setStaffTasks(updatedTasks);
    onLogAudit(
      'Staff Task Returned',
      `Project Director returned workplan task "${targetTask.title}" to ${targetTask.createdByRole} for correction. Notes: ${currentTaskCorrectionNotes}`
    );
    setFormSuccess('Workplan task returned to CDO with correction notes.');
    setTimeout(() => setFormSuccess(null), 3000);

    setActiveTaskCorrectionId(null);
    setCurrentTaskCorrectionNotes('');

    await triggerSyncUpload();
  };

  // Toggle Task status
  const handleToggleTaskStatus = async (taskId: string, nextStatus: 'pending' | 'in-progress' | 'completed') => {
    const updatedTasks = staffTasks.map(t => {
      if (t.id === taskId) {
        return { ...t, status: nextStatus };
      }
      return t;
    });
    setStaffTasks(updatedTasks);
    
    const targetTask = staffTasks.find(t => t.id === taskId);
    onLogAudit(
      'Task Status Changed',
      `Updated task "${targetTask?.title}" status to "${nextStatus}".`
    );
    await triggerSyncUpload();
  };

  // Delete Task
  const handleDeleteTask = async (taskId: string) => {
    const targetTask = staffTasks.find(t => t.id === taskId);
    if (!window.confirm(`Are you sure you want to retract task "${targetTask?.title}"?`)) return;

    const updatedTasks = staffTasks.filter(t => t.id !== taskId);
    setStaffTasks(updatedTasks);
    onLogAudit(
      'Task Retracted', 
      `Project Director deleted staff task assignment "${targetTask?.title}".`
    );
    await triggerSyncUpload();
  };

  // Toggle Compliance setting
  const handleToggleCompliance = async (field: keyof ComplianceMetrics) => {
    const current = complianceStatus || {
      childProtectionSigned: true,
      healthComplianceMet: true,
      financialAuditingApproved: false,
      staffCertificationsUpdated: true
    };
    const updated: ComplianceMetrics = {
      ...current,
      [field]: !current[field]
    };
    setComplianceStatus(updated);
    onLogAudit(
      'Governance Audit Toggled',
      `Modified compliance parameter [${field}] state to ${updated[field] ? 'APPROVED' : 'PENDING'}.`
    );
    await triggerSyncUpload();
  };

  // --- BUDGET PORTAL HANDLERS ---
  const handleAddBudgetItem = () => {
    setBudgetItems(prev => [...prev, { name: '', qty: 1, unitCost: 0 }]);
  };

  const handleRemoveBudgetItem = (index: number) => {
    setBudgetItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleBudgetItemChange = (index: number, field: 'name' | 'qty' | 'unitCost', value: any) => {
    setBudgetItems(prev => {
      const updated = [...prev];
      if (field === 'qty') {
        updated[index].qty = parseInt(value) || 0;
      } else if (field === 'unitCost') {
        updated[index].unitCost = parseInt(value) || 0;
      } else {
        updated[index].name = value;
      }
      return updated;
    });
  };

  const handleSubmitBudget = async (e?: React.FormEvent, isDraftInput: boolean = false) => {
    if (e) e.preventDefault();
    const totalAmount = budgetItems.reduce((acc, item) => acc + (item.qty * item.unitCost), 0);
    const todayStr = new Date().toISOString().split('T')[0];
    const calculatedStatus = isDraftInput ? ('Draft' as const) : ('Pending' as const);
    const budgetIdToUse = editingBudgetId || `BGT-2026-${Math.floor(Math.random() * 900 + 100)}`;

    const submittedBudget: Budget = {
      id: budgetIdToUse,
      title: budgetTitle,
      category: budgetCategory,
      amount: totalAmount,
      description: budgetDescription,
      submittedBy: activeRole,
      submittedAt: todayStr,
      status: calculatedStatus,
      items: budgetItems
    };

    if (editingBudgetId) {
      // Edit and resubmit
      const updated = budgets.map(b => {
        if (b.id === editingBudgetId) {
          return {
            ...b,
            title: budgetTitle,
            category: budgetCategory,
            description: budgetDescription,
            amount: totalAmount,
            items: budgetItems,
            status: calculatedStatus,
            correctionNotes: undefined
          };
        }
        return b;
      });
      setBudgets(updated);
      onLogAudit(
        isDraftInput ? 'Budget Saved as Draft' : 'Budget Resubmitted', 
        `Updated budget [${editingBudgetId}] - ${budgetTitle} and ${isDraftInput ? 'saved as draft' : 'submitted for approval'}.`
      );
      setEditingBudgetId(null);
    } else {
      // New budget
      setBudgets(prev => [submittedBudget, ...prev]);
      onLogAudit(
        isDraftInput ? 'Budget Saved as Draft' : 'Budget Submitted', 
        `Prepared budget proposal [${budgetIdToUse}] for UGX ${totalAmount.toLocaleString()} and ${isDraftInput ? 'saved as draft' : 'submitted under department ' + budgetCategory}.`
      );
    }

    // Reset Form
    setBudgetTitle('');
    setBudgetDescription('');
    setBudgetCategory('General');
    setBudgetItems([{ name: '', qty: 1, unitCost: 0 }]);
    setIsCreatingBudget(false);

    if (!isDraftInput) {
      setLastSubmission({
        type: 'budget',
        data: submittedBudget
      });
      setFormSuccess(`Budget Proposal ${budgetIdToUse} successfully submitted! Official PDF/Word copy available for instant download below.`);
      setTimeout(() => setFormSuccess(null), 15000);
    } else {
      setLastSubmission(null);
      setFormSuccess(`Budget Proposal ${budgetIdToUse} successfully saved as draft.`);
      setTimeout(() => setFormSuccess(null), 3000);
    }
  };

  const handleStartEditBudget = (budget: Budget) => {
    setBudgetTitle(budget.title);
    setBudgetDescription(budget.description);
    setBudgetCategory(budget.category);
    setBudgetItems(budget.items && budget.items.length > 0 ? budget.items : [{ name: '', qty: 1, unitCost: 0 }]);
    setEditingBudgetId(budget.id);
    setIsCreatingBudget(true);
  };

  const handleApproveBudget = async (budgetId: string) => {
    const updated = budgets.map(b => {
      if (b.id === budgetId) {
        return {
          ...b,
          status: 'Approved' as const
        };
      }
      return b;
    });
    setBudgets(updated);
    onLogAudit('Budget Approved', `Authorized and approved budget proposal [${budgetId}]. Transferred record to official journal.`);
    setFormSuccess(`Budget ${budgetId} approved successfully! It has been committed to the Discussion Journal.`);
  };

  const handleReturnBudgetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCorrectionId) return;

    const updated = budgets.map(b => {
      if (b.id === activeCorrectionId) {
        return {
          ...b,
          status: 'Returned for Correction' as const,
          correctionNotes: currentCorrectionNotes
        };
      }
      return b;
    });
    setBudgets(updated);
    onLogAudit('Budget Returned', `Returned budget [${activeCorrectionId}] for corrections. Reason: ${currentCorrectionNotes}`);
    setFormSuccess(`Budget ${activeCorrectionId} successfully returned for correction.`);
    
    // Clear state
    setActiveCorrectionId(null);
    setCurrentCorrectionNotes('');
  };

  const handleDeleteBudget = async (budgetId: string) => {
    if (window.confirm(`Are you sure you want to permanently delete budget proposal ${budgetId}?`)) {
      setBudgets(prev => prev.filter(b => b.id !== budgetId));
      onLogAudit('Budget Deleted', `Deleted budget proposal record [${budgetId}].`);
      setFormSuccess(`Budget proposal ${budgetId} was deleted.`);
    }
  };

  const handleSubmitPettyCash = async (e?: React.FormEvent, isDraftInput: boolean = false) => {
    if (e) e.preventDefault();
    const todayStr = new Date().toISOString().split('T')[0];
    const calculatedStatus = isDraftInput ? ('Draft' as const) : ('Pending' as const);
    const requestIdToUse = editingPettyCashId || `PC-2026-${Math.floor(Math.random() * 9000 + 1000)}`;

    const submittedRequest: PettyCashRequest = {
      id: requestIdToUse,
      amount: pettyCashAmount,
      purpose: pettyCashPurpose,
      dates: pettyCashDates,
      submittedBy: activeRole,
      submittedAt: todayStr,
      status: calculatedStatus,
      aiEnhancedExplanation: enhancedPettyCashExplanation || undefined,
      isAiEnhanced: !!enhancedPettyCashExplanation
    };

    if (editingPettyCashId) {
      // Edit and resubmit
      const updated = pettyCashRequests.map(r => {
        if (r.id === editingPettyCashId) {
          return {
            ...r,
            amount: pettyCashAmount,
            purpose: pettyCashPurpose,
            dates: pettyCashDates,
            status: calculatedStatus,
            aiEnhancedExplanation: enhancedPettyCashExplanation || undefined,
            isAiEnhanced: !!enhancedPettyCashExplanation,
            correctionNotes: undefined
          };
        }
        return r;
      });
      setPettyCashRequests(updated);
      onLogAudit(
        isDraftInput ? 'Petty Cash Request Saved as Draft' : 'Petty Cash Request Resubmitted', 
        `Updated petty cash request [${editingPettyCashId}] for UGX ${pettyCashAmount.toLocaleString()} and ${isDraftInput ? 'saved as draft' : 'submitted for approval'}.`
      );
      setEditingPettyCashId(null);
    } else {
      // New request
      setPettyCashRequests(prev => [submittedRequest, ...prev]);
      onLogAudit(
        isDraftInput ? 'Petty Cash Saved as Draft' : 'Petty Cash Submitted', 
        `Prepared petty cash request [${requestIdToUse}] for UGX ${pettyCashAmount.toLocaleString()} and ${isDraftInput ? 'saved as draft' : 'submitted for PD approval'}.`
      );
    }

    // Reset Form
    setPettyCashAmount(0);
    setPettyCashPurpose('');
    setPettyCashDates('');
    setEnhancedPettyCashExplanation('');
    setIsCreatingPettyCash(false);

    if (!isDraftInput) {
      setLastSubmission({
        type: 'pettycash',
        data: submittedRequest
      });
      setFormSuccess(`Petty Cash Request ${requestIdToUse} successfully submitted! Official PDF copy available for instant download below.`);
      setTimeout(() => setFormSuccess(null), 15000);
    } else {
      setLastSubmission(null);
      setFormSuccess(`Petty Cash Request ${requestIdToUse} successfully saved as draft.`);
      setTimeout(() => setFormSuccess(null), 3000);
    }
  };

  const handleStartEditPettyCash = (request: PettyCashRequest) => {
    setPettyCashAmount(request.amount);
    setPettyCashPurpose(request.purpose);
    setPettyCashDates(request.dates);
    setEnhancedPettyCashExplanation(request.aiEnhancedExplanation || '');
    setEditingPettyCashId(request.id);
    setIsCreatingPettyCash(true);
  };

  const handleDeletePettyCash = async (requestId: string) => {
    if (window.confirm(`Are you sure you want to permanently delete petty cash request ${requestId}?`)) {
      setPettyCashRequests(prev => prev.filter(r => r.id !== requestId));
      onLogAudit('Petty Cash Request Deleted', `Deleted petty cash request [${requestId}].`);
      setFormSuccess(`Petty Cash Request ${requestId} was deleted.`);
    }
  };

  const handleEnhancePettyCashWithAI = async () => {
    if (!pettyCashAmount || !pettyCashPurpose || !pettyCashDates) {
      alert("Please specify the amount, purpose, and dates before requesting AI enhancement.");
      return;
    }

    setIsEnhancingPettyCash(true);
    try {
      const response = await fetch('/api/gemini/enhance-petty-cash', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: pettyCashAmount,
          purpose: pettyCashPurpose,
          dates: pettyCashDates,
          submittedBy: activeRole
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setEnhancedPettyCashExplanation(data.explanation);
        onLogAudit('Petty Cash AI Enhanced', `Enhanced petty cash request purpose statement using Lomuriangole AI Assistant.`);
      } else {
        alert(data.error || "Failed to enhance request using AI.");
      }
    } catch (error: any) {
      console.error("AI enhancement request failed:", error);
      alert("An error occurred while connecting to Lomuriangole AI server. Please make sure the service is running and try again.");
    } finally {
      setIsEnhancingPettyCash(false);
    }
  };

  const handleApprovePettyCash = async (requestId: string) => {
    const updated = pettyCashRequests.map(r => {
      if (r.id === requestId) {
        return {
          ...r,
          status: 'Approved' as const
        };
      }
      return r;
    });
    setPettyCashRequests(updated);
    onLogAudit('Petty Cash Approved', `Authorized and approved petty cash request [${requestId}].`);
    setFormSuccess(`Petty Cash Request ${requestId} approved successfully!`);
  };

  const handleRejectPettyCash = async (requestId: string) => {
    if (window.confirm(`Are you sure you want to reject petty cash request ${requestId}?`)) {
      const updated = pettyCashRequests.map(r => {
        if (r.id === requestId) {
          return {
            ...r,
            status: 'Rejected' as const
          };
        }
        return r;
      });
      setPettyCashRequests(updated);
      onLogAudit('Petty Cash Rejected', `Rejected petty cash request [${requestId}].`);
      setFormSuccess(`Petty Cash Request ${requestId} has been rejected.`);
    }
  };

  const handleReturnPettyCashSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePettyCashCorrectionId) return;

    const updated = pettyCashRequests.map(r => {
      if (r.id === activePettyCashCorrectionId) {
        return {
          ...r,
          status: 'Returned for Correction' as const,
          correctionNotes: currentPettyCashCorrectionNotes
        };
      }
      return r;
    });
    setPettyCashRequests(updated);
    onLogAudit('Petty Cash Returned', `Returned petty cash request [${activePettyCashCorrectionId}] for corrections. Reason: ${currentPettyCashCorrectionNotes}`);
    setFormSuccess(`Petty Cash Request ${activePettyCashCorrectionId} successfully returned for correction.`);
    
    // Clear state
    setActivePettyCashCorrectionId(null);
    setCurrentPettyCashCorrectionNotes('');
  };

  const formatMonthLabel = (mStr: string) => {
    const parts = mStr.split('-');
    if (parts.length < 2) return mStr;
    const year = parts[0];
    const month = parseInt(parts[1], 10);
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${months[month - 1]} ${year}`;
  };

  const handleSignOffBudgets = async () => {
    if (!window.confirm(`Are you sure you want to sign off on all budgets for ${formatMonthLabel(currentJournalMonth)} and open a new journal period? This will lock all approved budgets of this period.`)) return;

    // 1. Mark all approved budgets for the currentJournalMonth as "Signed-off"
    const updatedBudgets = budgets.map(b => {
      const matchesMonth = b.submittedAt && b.submittedAt.startsWith(currentJournalMonth);
      if (matchesMonth && b.status === 'Approved') {
        return {
          ...b,
          status: 'Signed-off' as const,
          signedOffMonth: currentJournalMonth
        };
      }
      return b;
    });

    setBudgets(updatedBudgets);

    // 2. Add current month to signedOffMonths list
    if (!signedOffMonths.includes(currentJournalMonth)) {
      setSignedOffMonths(prev => [...prev, currentJournalMonth]);
    }

    // 3. Compute next month (e.g. "2026-06" -> "2026-07")
    const parts = currentJournalMonth.split('-');
    let year = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const nextMonthStr = `${year}-${month.toString().padStart(2, '0')}`;

    // 4. Update currentJournalMonth
    setCurrentJournalMonth(nextMonthStr);

    onLogAudit(
      'Journal Monthly Sign-Off',
      `Project Director signed off all budgets for ${formatMonthLabel(currentJournalMonth)} and opened new journal period for ${formatMonthLabel(nextMonthStr)}.`
    );
    setFormSuccess(`Successfully signed off all budgets for ${formatMonthLabel(currentJournalMonth)}! The new journal period for ${formatMonthLabel(nextMonthStr)} has been opened.`);

    await triggerSyncUpload();
  };

  const renderCdoTaskPanel = () => {
    const roleTasks = staffTasks.filter(t => t.assignedRole === activeRole);

    // Calculate sub-counts
    const countAll = roleTasks.filter(t => t.approvalStatus !== 'draft').length;
    const countApproved = roleTasks.filter(t => !t.approvalStatus || t.approvalStatus === 'approved' || t.createdByRole === 'PROJECT DIRECTOR').length;
    const countPending = roleTasks.filter(t => t.approvalStatus === 'pending_approval').length;
    const countReturned = roleTasks.filter(t => t.approvalStatus === 'returned').length;
    const countDrafts = roleTasks.filter(t => t.approvalStatus === 'draft').length;

    // Filtered list based on cdoTaskFilter
    const filteredTasks = roleTasks.filter(t => {
      if (cdoTaskFilter === 'My Approved Tasks') {
        return (!t.approvalStatus || t.approvalStatus === 'approved' || t.createdByRole === 'PROJECT DIRECTOR') && t.status !== 'completed';
      }
      if (cdoTaskFilter === 'Pending PD Approval') {
        return t.approvalStatus === 'pending_approval';
      }
      if (cdoTaskFilter === 'Returned for Correction') {
        return t.approvalStatus === 'returned';
      }
      if (cdoTaskFilter === 'Drafts') {
        return t.approvalStatus === 'draft';
      }
      // 'All' - return everything except drafts
      return t.approvalStatus !== 'draft';
    });

    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-3xs mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 mb-6 gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase text-slate-800 tracking-widest font-mono flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-indigo-600" />
              Role Workplans & Tasks Dashboard
            </h3>
            <p className="text-xs text-slate-400 mt-1">Submit activity workplans for Project Director approval and execute authorized program tasks.</p>
          </div>
          {!isCreatingCdoTask && (
            <button
              onClick={() => {
                setEditingTaskId(null);
                setCdoTaskTitle('');
                setCdoTaskDescription('');
                setCdoTaskDueDate('');
                setCdoTaskPriority('medium');
                setCdoTaskDescriptions(['']);
                setIsCreatingCdoTask(true);
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-3.5 rounded-xl cursor-pointer flex items-center gap-1.5 transition-all shadow-3xs self-start"
            >
              <Plus className="w-4 h-4" />
              Propose Workplan Task
            </button>
          )}
        </div>

        {/* CDO Task Forms */}
        {isCreatingCdoTask && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-mono flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4 text-indigo-600" />
                {editingTaskId ? 'Edit Returned Workplan Task' : 'Propose New Workplan Task'}
              </h4>
              <button
                onClick={() => {
                  setIsCreatingCdoTask(false);
                  setEditingTaskId(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateOrUpdateCdoTask} className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-6">
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Task Title</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Community Health Outreach Clinic"
                  value={cdoTaskTitle}
                  onChange={(e) => setCdoTaskTitle(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="md:col-span-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Priority</label>
                <select
                  value={cdoTaskPriority}
                  onChange={(e) => setCdoTaskPriority(e.target.value as any)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Target Due Date</label>
                <input
                  required
                  type="date"
                  value={cdoTaskDueDate}
                  onChange={(e) => setCdoTaskDueDate(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="md:col-span-12">
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Detailed Description & Expected Outcomes</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Specify task requirements, timeline, target cohort, and necessary resources."
                  value={cdoTaskDescription}
                  onChange={(e) => setCdoTaskDescription(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="md:col-span-12 border-t border-slate-200/60 pt-4 mt-2">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block">Additional Workplan Descriptions & Key Activities (Optional)</label>
                    <p className="text-[10px] text-slate-400">Add granular milestone details, targets, or step-by-step activity plans.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCdoTaskDescriptions([...cdoTaskDescriptions, ''])}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1 cursor-pointer bg-indigo-50 hover:bg-indigo-100/70 px-2.5 py-1.5 rounded-xl transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Description Line
                  </button>
                </div>
                
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {cdoTaskDescriptions.map((desc, idx) => (
                    <div key={idx} className="flex gap-2 items-center animate-fade-in">
                      <span className="text-[10px] font-bold font-mono text-slate-400 bg-slate-200/50 w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        placeholder={`e.g. Activity/Milestone step ${idx + 1} description and deliverables...`}
                        value={desc}
                        onChange={(e) => {
                          const updated = [...cdoTaskDescriptions];
                          updated[idx] = e.target.value;
                          setCdoTaskDescriptions(updated);
                        }}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-indigo-500"
                      />
                      {cdoTaskDescriptions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = cdoTaskDescriptions.filter((_, i) => i !== idx);
                            setCdoTaskDescriptions(updated);
                          }}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 p-2.5 rounded-xl cursor-pointer shrink-0 transition-all"
                          title="Remove description line"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="md:col-span-12 flex justify-end gap-2.5 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingCdoTask(false);
                    setEditingTaskId(null);
                  }}
                  className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs py-2 px-4 rounded-xl cursor-pointer transition-all"
                >
                  Cancel
                </button>
                 <button
                  type="button"
                  onClick={() => handleCreateOrUpdateCdoTask(undefined, true)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-2 px-5 rounded-xl cursor-pointer transition-all border border-slate-200"
                >
                  Save as Draft
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-5 rounded-xl cursor-pointer transition-all shadow-3xs"
                >
                  {editingTaskId ? 'Resubmit Workplan' : 'Submit Workplan to PD'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Task Statistics/Filters bar */}
        {!isCreatingCdoTask && (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
            {/* Counts metrics */}
            <div className="grid grid-cols-5 gap-2.5 w-full md:w-auto">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 px-3 text-center">
                <span className="text-slate-400 text-[9px] font-mono font-bold uppercase block">Active</span>
                <span className="text-slate-800 text-sm font-black font-mono">{countAll}</span>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2 px-3 text-center">
                <span className="text-emerald-500 text-[9px] font-mono font-bold uppercase block">Approved</span>
                <span className="text-emerald-800 text-sm font-black font-mono">{countApproved}</span>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-2 px-3 text-center">
                <span className="text-amber-500 text-[9px] font-mono font-bold uppercase block">Pending</span>
                <span className="text-amber-800 text-sm font-black font-mono">{countPending}</span>
              </div>
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-2 px-3 text-center">
                <span className="text-rose-500 text-[9px] font-mono font-bold uppercase block">Returned</span>
                <span className="text-rose-800 text-sm font-black font-mono">{countReturned}</span>
              </div>
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-2 px-3 text-center">
                <span className="text-slate-500 text-[9px] font-mono font-bold uppercase block">Drafts</span>
                <span className="text-slate-800 text-sm font-black font-mono">{countDrafts}</span>
              </div>
            </div>

            {/* Filter buttons */}
            <div className="flex flex-wrap items-center gap-1.5 self-end">
              {(['All', 'My Approved Tasks', 'Pending PD Approval', 'Returned for Correction', 'Drafts'] as const).map(f => (
                <button
                  key={`cdo-task-filter-${f}`}
                  type="button"
                  onClick={() => setCdoTaskFilter(f)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all border ${
                    cdoTaskFilter === f
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-3xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Task Cards List */}
        {!isCreatingCdoTask && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTasks.map(task => {
              const isApproved = !task.approvalStatus || task.approvalStatus === 'approved';
              
              return (
                <div
                  key={task.id}
                  className={`border rounded-2xl p-4.5 shadow-2xs transition-all relative flex flex-col justify-between ${
                    task.approvalStatus === 'returned'
                      ? 'bg-rose-50/40 border-rose-100 hover:bg-rose-50/70'
                      : task.approvalStatus === 'pending_approval'
                      ? 'bg-amber-50/30 border-amber-100 hover:bg-amber-50/50'
                      : 'bg-white border-slate-200 hover:border-indigo-200 hover:shadow-xs'
                  }`}
                >
                  <div>
                    {/* Badges/Tags Header */}
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <span className={`text-[9px] font-bold rounded-lg px-2 py-0.5 uppercase tracking-wide ${
                        task.priority === 'high'
                          ? 'bg-rose-100 text-rose-700'
                          : task.priority === 'medium'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {task.priority} Priority
                      </span>

                      {/* Approval Status Badge */}
                      {task.approvalStatus === 'draft' ? (
                        <span className="bg-slate-100 text-slate-800 border border-slate-200 text-[9px] font-bold rounded-lg px-2 py-0.5 flex items-center gap-1">
                          <Info className="w-3 h-3 text-slate-500" /> Draft
                        </span>
                      ) : task.approvalStatus === 'pending_approval' ? (
                        <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[9px] font-bold rounded-lg px-2 py-0.5 flex items-center gap-1 animate-pulse">
                          <Clock className="w-3 h-3" /> Pending PD Approval
                        </span>
                      ) : task.approvalStatus === 'returned' ? (
                        <span className="bg-rose-100 text-rose-800 border border-rose-200 text-[9px] font-bold rounded-lg px-2 py-0.5 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Correction Needed
                        </span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[9px] font-bold rounded-lg px-2 py-0.5 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Authorized
                        </span>
                      )}
                    </div>

                    <h4 className="font-bold text-slate-900 text-sm leading-snug tracking-tight mb-1.5">{task.title}</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed mb-3.5 line-clamp-3">{task.description}</p>

                    {/* Return feedback/rejection box */}
                    {task.approvalStatus === 'returned' && task.correctionNotes && (
                      <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 mb-4 text-[10px] text-rose-950">
                        <p className="font-bold font-mono text-rose-800 flex items-center gap-1 mb-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> PD CORRECTION REQUEST:
                        </p>
                        <p className="italic leading-normal bg-white/70 border border-rose-100/40 p-2 rounded-lg">{task.correctionNotes}</p>
                      </div>
                    )}
                  </div>

                  {/* Footer control section */}
                  <div className="border-t border-slate-100 mt-2 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-mono font-semibold text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" /> Due: {task.dueDate}
                      </span>
                      {/* View Details button */}
                      <button
                        type="button"
                        onClick={() => setViewingTask(task)}
                        className="text-indigo-600 hover:text-indigo-800 font-bold text-[10px] flex items-center gap-1 mt-0.5"
                      >
                        <Eye className="w-3 h-3" /> View Details
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Approved Tasks: Download PDF & Change Status */}
                      {isApproved ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => generateWorkplanPDF(task)}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100 font-bold text-[10px] px-2 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-3xs"
                            title="Download authorized workplan brief as PDF"
                          >
                            <Download className="w-3 h-3" />
                            <span>PDF</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => generateWorkplanWord(task)}
                            className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-100 font-bold text-[10px] px-2 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-3xs"
                            title="Download authorized workplan brief as Word document"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Word</span>
                          </button>
                          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 font-mono">Status:</span>
                            <select
                              value={task.status}
                              onChange={(e) => handleToggleTaskStatus(task.id, e.target.value as any)}
                              className="bg-transparent font-bold text-[10px] text-slate-700 cursor-pointer focus:outline-none p-0 border-none"
                            >
                              <option value="pending">Pending</option>
                              <option value="in-progress">In Progress</option>
                              <option value="completed">Completed</option>
                            </select>
                          </div>
                          
                          {/* Admin Edit/Delete for authorized tasks */}
                          {isAdminMode && (
                            <div className="flex items-center gap-1 border-l border-slate-200 pl-1.5 ml-0.5">
                              <button
                                onClick={() => {
                                  setEditingTaskId(task.id);
                                  setCdoTaskTitle(task.title);
                                  setCdoTaskDescription(task.description);
                                  setCdoTaskDueDate(task.dueDate);
                                  setCdoTaskPriority(task.priority);
                                  setCdoTaskDescriptions(task.descriptions && task.descriptions.length > 0 ? task.descriptions : ['']);
                                  setIsCreatingCdoTask(true);
                                }}
                                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] px-2 py-1 rounded-lg flex items-center gap-0.5 transition-all"
                                title="Admin override: Edit task"
                              >
                                <Unlock className="w-3 h-3" /> Admin Edit
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Pending/Returned/Draft tasks: Actions */
                        <div className="flex items-center gap-1">
                          {(task.approvalStatus === 'returned' || task.approvalStatus === 'draft') && (
                            <button
                              onClick={() => {
                                setEditingTaskId(task.id);
                                setCdoTaskTitle(task.title);
                                setCdoTaskDescription(task.description);
                                setCdoTaskDueDate(task.dueDate);
                                setCdoTaskPriority(task.priority);
                                setCdoTaskDescriptions(task.descriptions && task.descriptions.length > 0 ? task.descriptions : ['']);
                                setIsCreatingCdoTask(true);
                              }}
                              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] px-2.5 py-1 rounded-lg border border-indigo-100 flex items-center gap-1 transition-all"
                            >
                              <Edit3 className="w-3 h-3" /> {task.approvalStatus === 'draft' ? 'Edit & Submit' : 'Edit & Resubmit'}
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteCdoTask(task.id)}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[10px] px-2 py-1 rounded-lg border border-rose-100 flex items-center gap-1 transition-all"
                          >
                            <Trash2 className="w-3 h-3" /> {task.approvalStatus === 'draft' ? 'Delete' : 'Retract'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredTasks.length === 0 && (
              <div className="col-span-full bg-slate-50 border border-dashed border-slate-200 rounded-2xl py-12 text-center">
                <CheckSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-medium">No tasks match your selected filter.</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderCdoBudgetPanel = () => {
    const roleCategory = activeRole === 'CDO HEALTH' ? 'Health' : activeRole === 'CDO SDR' ? 'Sponsor Relations' : 'Home-Based';
    const roleBudgets = budgets.filter(b => b.submittedBy === activeRole);

    // Calculate micro-financial statistics for this CDO's department
    const statsAll = roleBudgets.filter(b => b.status !== 'Draft' && b.status !== 'Signed-off').length;
    const statsDraft = roleBudgets.filter(b => b.status === 'Draft').length;
    const statsPending = roleBudgets.filter(b => b.status === 'Pending').length;
    const statsApproved = roleBudgets.filter(b => b.status === 'Approved').length;
    const statsReturned = roleBudgets.filter(b => b.status === 'Returned for Correction').length;
    const statsSignedOff = roleBudgets.filter(b => b.status === 'Signed-off').length;

    const totalAmtApproved = roleBudgets.filter(b => b.status === 'Approved' || b.status === 'Signed-off').reduce((sum, b) => sum + b.amount, 0);
    const totalAmtPending = roleBudgets.filter(b => b.status === 'Pending').reduce((sum, b) => sum + b.amount, 0);

    // Filter budgets based on cdoBudgetFilter
    const filteredRoleBudgets = roleBudgets.filter(b => {
      if (cdoBudgetFilter === 'All') {
        return b.status !== 'Draft' && b.status !== 'Signed-off';
      }
      return b.status === cdoBudgetFilter;
    });

    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-3xs mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 mb-6 gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase text-slate-800 tracking-widest font-mono flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-600" />
              Department Budgets & Financial Proposals
            </h3>
            <p className="text-xs text-slate-400 mt-1">Submit activity budgets and track approvals from the Project Director.</p>
          </div>
          {!isCreatingBudget && (
            <button
              onClick={() => {
                setEditingBudgetId(null);
                setBudgetTitle('');
                setBudgetDescription('');
                setBudgetCategory(roleCategory as any);
                setBudgetItems([{ name: '', qty: 1, unitCost: 0 }]);
                setIsCreatingBudget(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-3.5 rounded-xl cursor-pointer flex items-center gap-1.5 transition-all shadow-3xs self-start"
            >
              <Plus className="w-4 h-4" />
              Prepare New Budget
            </button>
          )}
        </div>

        {/* CDO Budget summary metrics cards */}
        {!isCreatingBudget && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase">My Submissions</span>
              <div className="text-sm font-black text-slate-800 mt-1">{statsAll} Proposals</div>
              <span className="text-[10px] text-slate-400 mt-0.5 block">{statsPending} pending review</span>
            </div>
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3">
              <span className="text-[9px] font-mono font-bold text-emerald-600 uppercase">Total Approved</span>
              <div className="text-sm font-black text-emerald-950 mt-1">UGX {totalAmtApproved.toLocaleString()}</div>
              <span className="text-[10px] text-emerald-600 mt-0.5 block">{statsApproved} budgets authorized</span>
            </div>
            <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3">
              <span className="text-[9px] font-mono font-bold text-amber-600 uppercase">Pending Review</span>
              <div className="text-sm font-black text-amber-950 mt-1">UGX {totalAmtPending.toLocaleString()}</div>
              <span className="text-[10px] text-amber-600 mt-0.5 block">{statsPending} awaiting PD signoff</span>
            </div>
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-3">
              <span className="text-[9px] font-mono font-bold text-rose-600 uppercase">Returned</span>
              <div className="text-sm font-black text-rose-950 mt-1">{statsReturned} Requiring Action</div>
              <span className="text-[10px] text-rose-500 mt-0.5 block">Correction feedback provided</span>
            </div>
          </div>
        )}

        {isCreatingBudget && (
          <form onSubmit={handleSubmitBudget} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6 animate-fade-in space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-mono">
                {editingBudgetId ? `✏️ Edit Budget Proposal: ${editingBudgetId}` : '📋 Prepare Activity Budget'}
              </h4>
              <button
                type="button"
                onClick={() => setIsCreatingBudget(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Budget Title / Purpose</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Purchase of child vaccines, SDR Letters printing paper"
                  value={budgetTitle}
                  onChange={(e) => setBudgetTitle(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Budget Category</label>
                <select
                  value={budgetCategory}
                  onChange={(e) => setBudgetCategory(e.target.value as any)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none"
                >
                  <option value="Health">Health Department</option>
                  <option value="Sponsor Relations">Sponsor Relations (SDR)</option>
                  <option value="Home-Based">Home-Based Program</option>
                  <option value="General">General / Administrative</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Detailed Justification / Notes</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Describe the activity, target population, and why this expenditure is required..."
                  value={budgetDescription}
                  onChange={(e) => setBudgetDescription(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>
            </div>

            {/* Line Items Grid */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase block">Financial Line Items Breakdown</label>
              <div className="space-y-2">
                {budgetItems.map((item, index) => (
                  <div key={index} className="flex flex-col sm:flex-row items-center gap-3 bg-white p-3 border border-slate-200 rounded-xl">
                    <div className="flex-1 w-full">
                      <label className="text-[9px] font-semibold text-slate-400 uppercase sm:hidden mb-0.5">Item Name</label>
                      <input
                        required
                        type="text"
                        placeholder="Item Description"
                        value={item.name}
                        onChange={(e) => handleBudgetItemChange(index, 'name', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-150 rounded-lg p-2 text-xs focus:outline-none"
                      />
                    </div>
                    <div className="w-full sm:w-24">
                      <label className="text-[9px] font-semibold text-slate-400 uppercase sm:hidden mb-0.5">Qty</label>
                      <input
                        required
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={item.qty}
                        onChange={(e) => handleBudgetItemChange(index, 'qty', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-150 rounded-lg p-2 text-xs focus:outline-none"
                      />
                    </div>
                    <div className="w-full sm:w-36">
                      <label className="text-[9px] font-semibold text-slate-400 uppercase sm:hidden mb-0.5">Unit Cost (UGX)</label>
                      <input
                        required
                        type="number"
                        min="0"
                        placeholder="Unit Cost (UGX)"
                        value={item.unitCost}
                        onChange={(e) => handleBudgetItemChange(index, 'unitCost', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-150 rounded-lg p-2 text-xs focus:outline-none"
                      />
                    </div>
                    <div className="w-full sm:w-32 text-right px-2">
                      <label className="text-[9px] font-semibold text-slate-400 uppercase block sm:hidden mb-0.5">Total</label>
                      <span className="font-mono text-xs font-bold text-slate-700">
                        UGX {((item.qty || 0) * (item.unitCost || 0)).toLocaleString()}
                      </span>
                    </div>
                    {budgetItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveBudgetItem(index)}
                        className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg border border-rose-100 hover:bg-rose-50 cursor-pointer self-end sm:self-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between pt-2 gap-3">
                <button
                  type="button"
                  onClick={handleAddBudgetItem}
                  className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer bg-emerald-50 hover:bg-emerald-100/70 py-1.5 px-3 rounded-lg border border-emerald-100"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Budget Line Item
                </button>

                <div className="bg-emerald-50 border border-emerald-150 rounded-xl px-4 py-2.5 flex items-baseline gap-2 self-stretch sm:self-auto justify-between sm:justify-start">
                  <span className="text-[10px] font-mono uppercase text-emerald-700 font-bold">Estimated Grand Total:</span>
                  <span className="text-base font-black text-slate-900 font-mono">
                    UGX {budgetItems.reduce((acc, item) => acc + ((item.qty || 0) * (item.unitCost || 0)), 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreatingBudget(false)}
                className="bg-white border border-slate-250 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-all hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSubmitBudget(undefined, true)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-250 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Save as Draft
              </button>
              <button
                type="submit"
                className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1"
              >
                <Check className="w-4 h-4" />
                {editingBudgetId ? 'Update & Resubmit' : 'Submit for PD Approval'}
              </button>
            </div>
          </form>
        )}

        {/* List of budgets */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">Our Budget Proposals History</h4>
            
            {/* CDO Budget Status Filters */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(['All', 'Draft', 'Pending', 'Approved', 'Returned for Correction', 'Signed-off'] as const).map(f => (
                <button
                  key={`cdo-filter-${f}`}
                  type="button"
                  onClick={() => setCdoBudgetFilter(f)}
                  className={`px-2.5 py-1 text-[10.5px] font-bold rounded-lg cursor-pointer transition-all border ${
                    cdoBudgetFilter === f
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-3xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {f} ({
                    f === 'All' 
                      ? roleBudgets.filter(b => b.status !== 'Draft' && b.status !== 'Signed-off').length 
                      : roleBudgets.filter(b => b.status === f).length
                  })
                </button>
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {filteredRoleBudgets.map((budget, bIdx) => {
              const hasCorrection = budget.status === 'Returned for Correction';
              return (
                <div key={`${budget.id}-${bIdx}`} className="border border-slate-200 hover:border-slate-300 rounded-2xl p-5 bg-slate-50/40 hover:bg-slate-50/70 transition-all shadow-3xs flex flex-col justify-between relative overflow-hidden">
                  
                  {/* Status strip */}
                  <div className={`absolute top-0 left-0 right-0 h-1 ${
                    budget.status === 'Approved' ? 'bg-emerald-500' : hasCorrection ? 'bg-rose-500' : 'bg-amber-500'
                  }`} />

                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold">
                          {budget.id}
                        </span>
                        <span className="text-[10px] font-bold uppercase bg-slate-100 text-indigo-700 px-2 py-0.5 rounded border border-slate-200">
                          {budget.category}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">{budget.submittedAt}</span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-800">{budget.title}</h4>
                      <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">{budget.description}</p>
                    </div>

                    <div className="flex flex-col items-start md:items-end gap-1.5 shrink-0">
                      <p className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">GRAND TOTAL</p>
                      <p className="text-lg font-black text-slate-900 font-mono">UGX {budget.amount.toLocaleString()}</p>
                      
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full border ${
                          budget.status === 'Approved'
                            ? 'bg-emerald-50 border-emerald-150 text-emerald-600'
                            : hasCorrection
                            ? 'bg-rose-50 border-rose-150 text-rose-600'
                            : 'bg-amber-50 border-amber-150 text-amber-600'
                        }`}>
                          {budget.status === 'Approved' && <CheckCircle className="w-3.5 h-3.5" />}
                          {hasCorrection && <AlertCircle className="w-3.5 h-3.5" />}
                          {budget.status === 'Pending' && <Clock className="w-3.5 h-3.5" />}
                          {budget.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Line Items brief */}
                  {budget.items && budget.items.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 font-mono">Estimated Items ({budget.items.length})</p>
                      <div className="flex flex-wrap gap-2">
                        {(budget.items || []).map((item, idx) => {
                          if (!item) return null;
                          return (
                            <span key={`bgt-item-cdo-${budget.id}-${idx}`} className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-[10.5px] text-slate-600 font-medium">
                              {item.name || 'Expense Item'} <span className="text-slate-400 font-normal">({item.qty || 0} × UGX {(item.unitCost || 0).toLocaleString()})</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Correction Notice box */}
                  {hasCorrection && budget.correctionNotes && (
                    <div className="mt-4 p-3.5 bg-rose-50 border border-rose-150 rounded-xl">
                      <p className="text-[10px] font-bold uppercase text-rose-700 font-mono flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                        PD Correction Request Feedback
                      </p>
                      <p className="text-xs text-rose-950 mt-1 italic font-medium leading-relaxed">
                        "{budget.correctionNotes}"
                      </p>
                    </div>
                  )}

                  {/* Action buttons (Print/Save, Edit if Returned, Delete/Cancel) */}
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
                      <button
                        type="button"
                        onClick={() => generateBudgetWord(budget)}
                        className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] py-1.5 px-3 rounded-lg border border-blue-200 cursor-pointer flex items-center gap-1"
                        title="Download official Word document"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Download Word
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewingBudget(budget)}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] py-1.5 px-3 rounded-lg border border-indigo-100 cursor-pointer flex items-center gap-1"
                        title="View detailed line items and subtotal"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View Details
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Status lock indicator */}
                      {(budget.status === 'Signed-off' || budget.status === 'Approved') && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg font-mono">
                          <Lock className="w-3 h-3 text-slate-400" />
                          Journal Locked
                        </span>
                      )}

                      {(hasCorrection || budget.status === 'Draft') && (
                        <button
                          type="button"
                          onClick={() => handleStartEditBudget(budget)}
                          className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] py-1.5 px-3.5 rounded-lg cursor-pointer flex items-center gap-1 shadow-3xs"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit & Resubmit
                        </button>
                      )}
                      
                      {/* Allow CDO to cancel/delete their own budget proposals if they are Pending, Returned, or Draft */}
                      {(budget.status === 'Pending' || budget.status === 'Returned for Correction' || budget.status === 'Draft') && (
                        <button
                          type="button"
                          onClick={() => handleDeleteBudget(budget.id)}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-150 font-bold text-[11px] py-1.5 px-3 rounded-lg cursor-pointer flex items-center gap-1 shadow-3xs transition-all"
                          title="Permanently remove budget proposal"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Cancel Proposal
                        </button>
                      )}

                      {/* Admin overrides */}
                      {isAdminMode && (budget.status === 'Approved' || budget.status === 'Signed-off') && (
                        <div className="flex items-center gap-1.5 border-l border-slate-200 pl-1.5 ml-1.5">
                          <button
                            type="button"
                            onClick={() => handleStartEditBudget(budget)}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] py-1.5 px-3 rounded-lg cursor-pointer flex items-center gap-1 shadow-3xs"
                            title="Admin Override: Edit approved/signed-off budget"
                          >
                            <Unlock className="w-3 h-3" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteBudget(budget.id)}
                            className="bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-700 font-bold text-[11px] py-1.5 px-3 rounded-lg cursor-pointer flex items-center gap-1 shadow-3xs"
                            title="Admin Override: Delete approved/signed-off budget"
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              );
            })}

            {filteredRoleBudgets.length === 0 && (
              <div className="text-center py-8 text-slate-400 italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                No budget proposals found matching this status filter.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ==========================================
  // CDO PERFORMANCE TARGETS & APPRAISALS ACTIONS
  // ==========================================
  const handleStartCreatePerformanceCycle = () => {
    setIsCreatingCycle(true);
    setEditingCycleId(null);
    setCycleFiscalYear('FY 2024/2025');
    if (activeRole === 'CDO SDR') setCycleStaffName('AUMA FILDA NOMA');
    else if (activeRole === 'CDO HEALTH') setCycleStaffName('DR. JOHN OKORI');
    else if (activeRole === 'CDO HBP') setCycleStaffName('MARIA CHEGEM');
    else if (activeRole === 'OVERSEER' || activeRole === 'PROJECT DIRECTOR') {
      const effectiveStaffRole = (targetStaffRole === 'OVERSEER' && activeRole === 'PROJECT DIRECTOR') ? 'CDO HEALTH' : targetStaffRole;
      if (effectiveStaffRole === 'CDO SDR') setCycleStaffName('AUMA FILDA NOMA');
      else if (effectiveStaffRole === 'CDO HEALTH') setCycleStaffName('DR. JOHN OKORI');
      else if (effectiveStaffRole === 'CDO HBP') setCycleStaffName('MARIA CHEGEM');
      else setCycleStaffName(activeRole === 'OVERSEER' ? 'BISHOP LOMONG' : 'PROJECT DIRECTOR');
    }
    else setCycleStaffName('');
    setCycleTargets([]);
    setNewKra('');
    setNewActivities('');
    setNewSuccessMeasure('');
    setNewTargetDate('');
    setEditingTargetId(null);
    setStaffSign('');
  };

  const handleAddTargetToDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKra || !newActivities || !newSuccessMeasure || !newTargetDate) return;

    if (editingTargetId) {
      setCycleTargets(prev => prev.map(t => t.id === editingTargetId ? {
        ...t,
        kra: newKra,
        plannedActivities: newActivities,
        measureOfSuccess: newSuccessMeasure,
        targetDate: newTargetDate
      } : t));
      setEditingTargetId(null);
    } else {
      const target: PerformanceTargetItem = {
        id: `T-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        kra: newKra,
        plannedActivities: newActivities,
        measureOfSuccess: newSuccessMeasure,
        targetDate: newTargetDate
      };
      setCycleTargets(prev => [...prev, target]);
    }

    setNewKra('');
    setNewActivities('');
    setNewSuccessMeasure('');
    setNewTargetDate('');
  };

  const handleRemoveTargetFromDraft = (id: string) => {
    setCycleTargets(prev => prev.filter(t => t.id !== id));
    if (editingTargetId === id) {
      setEditingTargetId(null);
      setNewKra('');
      setNewActivities('');
      setNewSuccessMeasure('');
      setNewTargetDate('');
    }
  };

  const handleStartEditTargetInDraft = (target: PerformanceTargetItem) => {
    setEditingTargetId(target.id);
    setNewKra(target.kra);
    setNewActivities(target.plannedActivities);
    setNewSuccessMeasure(target.measureOfSuccess);
    setNewTargetDate(target.targetDate);
  };

  const handleAddPredefinedKraRow = (index: number) => {
    const template = STANDARD_CDO_KRAS[index];
    const defaultDate = newTargetDate || new Date().toISOString().split('T')[0];
    const target: PerformanceTargetItem = {
      id: `T-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      kra: template.kra,
      plannedActivities: template.plannedActivities,
      measureOfSuccess: template.measureOfSuccess,
      targetDate: defaultDate
    };
    setCycleTargets(prev => [...prev, target]);
    setEditingInlineId(target.id); // Focus inline editing immediately so they can adjust date or details
  };

  const handleAddBlankRow = () => {
    const defaultDate = newTargetDate || new Date().toISOString().split('T')[0];
    const target: PerformanceTargetItem = {
      id: `T-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      kra: '',
      plannedActivities: '',
      measureOfSuccess: '',
      targetDate: defaultDate
    };
    setCycleTargets(prev => [...prev, target]);
    setEditingInlineId(target.id); // Focus inline editing immediately
  };

  const handleSubmitPerformanceCycle = (e: React.FormEvent, asDraft: boolean = false) => {
    e.preventDefault();
    if (!cycleStaffName) return;
    if (cycleTargets.length === 0 && !asDraft) return;
    if (!asDraft && !staffSign) return;

    const roleToUse = (activeRole === 'OVERSEER' || activeRole === 'PROJECT DIRECTOR') 
      ? (targetStaffRole === 'OVERSEER' && activeRole === 'PROJECT DIRECTOR' ? 'CDO HEALTH' : targetStaffRole) 
      : activeRole;
    
    const cycleId = editingCycleId || `PERF-${Date.now()}`;
    const newCycle: StaffPerformanceCycle = {
      id: cycleId,
      isActive: true, // Auto-activate newly created/submitted cycle
      staffName: cycleStaffName,
      staffRole: roleToUse,
      fiscalYear: cycleFiscalYear,
      status: asDraft ? 'Draft' : 'Submitted',
      submittedAt: new Date().toISOString().split('T')[0],
      targets: cycleTargets,
      approvals: {
        staffSignedName: asDraft ? undefined : staffSign,
        staffSignedDate: asDraft ? undefined : new Date().toISOString().split('T')[0]
      }
    };

    setPerformanceCycles(prev => {
      // Deactivate other cycles of same role
      const updatedPrev = prev.map(c => {
        if (c.staffRole === roleToUse) {
          return { ...c, isActive: false };
        }
        return c;
      });
      // Filter out this cycle if it existed
      const filtered = updatedPrev.filter(c => c.id !== cycleId);
      return [...filtered, newCycle];
    });

    onLogAudit(
      editingCycleId ? 'Performance Cycle Updated' : 'Performance Cycle Submitted', 
      `Staff ${cycleStaffName} (${roleToUse}) ${editingCycleId ? 'updated' : 'submitted'} performance targets for ${cycleFiscalYear}.`
    );
    setIsCreatingCycle(false);
    setEditingCycleId(null);
    setSelectedCycleId(cycleId);

    if (!asDraft) {
      setLastSubmission({
        type: 'performance',
        data: newCycle
      });
      setFormSuccess(`Performance plan for ${cycleFiscalYear} successfully signed & submitted! Official PDF/Word copies are available for download below.`);
      setTimeout(() => setFormSuccess(null), 15000);
    } else {
      setLastSubmission(null);
      setFormSuccess(`Performance plan draft for ${cycleFiscalYear} saved successfully.`);
      setTimeout(() => setFormSuccess(null), 5000);
    }
  };

  const handleEditExistingCycle = (cycle: StaffPerformanceCycle) => {
    setIsCreatingCycle(true);
    setEditingCycleId(cycle.id);
    setCycleFiscalYear(cycle.fiscalYear);
    setCycleStaffName(cycle.staffName);
    setCycleTargets(cycle.targets);
    setNewKra('');
    setNewActivities('');
    setNewSuccessMeasure('');
    setNewTargetDate('');
    setEditingTargetId(null);
    setStaffSign(cycle.approvals.staffSignedName || '');
  };

  const handleActivatePerformanceCycle = (cycleId: string) => {
    const targetCycle = performanceCycles.find(c => c.id === cycleId);
    if (!targetCycle) return;
    
    setPerformanceCycles(prev => prev.map(c => {
      if (c.staffRole === targetCycle.staffRole) {
        return { ...c, isActive: c.id === cycleId };
      }
      return c;
    }));
    
    onLogAudit('Performance Cycle Activated', `Activated performance cycle ${targetCycle.fiscalYear} for staff member ${targetCycle.staffName} (${targetCycle.staffRole}).`);
    
    setFormSuccess(`Performance Target for ${targetCycle.fiscalYear} has been activated and is now active on their dashboards.`);
    setTimeout(() => setFormSuccess(null), 5000);
  };

  const handleSaveIndividualSelfAssessment = (cycleId: string, targetId: string) => {
    setPerformanceCycles(prev => prev.map(c => {
      if (c.id === cycleId) {
        return {
          ...c,
          targets: c.targets.map(t => t.id === targetId ? { ...t, selfAssessment: tempSelfAssessmentValue } : t)
        };
      }
      return c;
    }));
    setEditingSelfAssessmentId(null);
    setTempSelfAssessmentValue('');
    onLogAudit('Self Assessment Saved', `Saved self-assessment for target ${targetId} on cycle ${cycleId}.`);
  };

  const handleSaveOverallSelfComments = (cycleId: string, comment: string, signature: string) => {
    setPerformanceCycles(prev => prev.map(c => {
      if (c.id === cycleId) {
        return {
          ...c,
          approvals: {
            ...c.approvals,
            overallSelfComment: comment,
            staffSignedName: signature,
            staffSignedDate: new Date().toISOString().split('T')[0]
          }
        };
      }
      return c;
    }));
    onLogAudit('Overall Self Assessment Saved', `Saved overall self-assessment comments on cycle ${cycleId}.`);
  };

  const handleSaveSupervisorAssessment = (cycleId: string, targetId: string) => {
    setPerformanceCycles(prev => prev.map(c => {
      if (c.id === cycleId) {
        return {
          ...c,
          targets: c.targets.map(t => t.id === targetId ? { 
            ...t, 
            supervisorAssessment: tempSupervisorAssessmentValue
          } : t)
        };
      }
      return c;
    }));
    setEditingSupervisorAssessmentId(null);
    setTempSupervisorAssessmentValue('');
    setTempSelfAssessmentValueByPd('');
    onLogAudit('Supervisor Assessment Saved by PD', `Saved supervisor evaluation comments for target ${targetId} on cycle ${cycleId}.`);
  };

  const handleSaveSelfAssessmentByPd = (cycleId: string, targetId: string, value: string) => {
    setPerformanceCycles(prev => prev.map(c => {
      if (c.id === cycleId) {
        return {
          ...c,
          targets: c.targets.map(t => t.id === targetId ? { ...t, selfAssessment: value } : t)
        };
      }
      return c;
    }));
    setEditingSelfAssessmentIdByPd(null);
    setTempSelfAssessmentValueByPd('');
    onLogAudit('Progress Edited by PD', `Project Director edited self-assessment/progress for target ${targetId} on cycle ${cycleId}.`);
  };

  const handlePdApprovePerformanceCycle = (cycleId: string, supervisorComment: string, supervisorSign: string) => {
    setPerformanceCycles(prev => prev.map(c => {
      if (c.id === cycleId) {
        return {
          ...c,
          status: 'Approved',
          approvals: {
            ...c.approvals,
            overallSupervisorComment: supervisorComment,
            supervisorSignedName: supervisorSign,
            supervisorSignedDate: new Date().toISOString().split('T')[0]
          }
        };
      }
      return c;
    }));
    onLogAudit('Performance Cycle Approved', `Project Director approved performance targets for cycle ${cycleId}.`);
  };

  const handlePdReturnPerformanceCycle = (cycleId: string, notes: string) => {
    setPerformanceCycles(prev => prev.map(c => {
      if (c.id === cycleId) {
        return {
          ...c,
          status: 'Returned for Correction',
          correctionNotes: notes
        };
      }
      return c;
    }));
    onLogAudit('Performance Cycle Returned', `Project Director returned performance cycle ${cycleId} for correction with notes: "${notes}".`);
  };

  const handleOverseerSignOffPerformanceCycle = (cycleId: string, reviewerComment: string, reviewerSign: string) => {
    setPerformanceCycles(prev => prev.map(c => {
      if (c.id === cycleId) {
        return {
          ...c,
          approvals: {
            ...c.approvals,
            reviewerComment: reviewerComment,
            reviewerSignedName: reviewerSign,
            reviewerSignedDate: new Date().toISOString().split('T')[0]
          }
        };
      }
      return c;
    }));
    onLogAudit('Performance Cycle Reviewed by Overseer', `Overseer signed off on performance cycle ${cycleId}.`);
  };

  const renderCdoPettyCashPanel = () => {
    const roleRequests = pettyCashRequests.filter(r => r.submittedBy === activeRole);

    // Calculate statistics
    const totalAmtApproved = roleRequests.filter(r => r.status === 'Approved').reduce((sum, r) => sum + r.amount, 0);
    const totalAmtPending = roleRequests.filter(r => r.status === 'Pending').reduce((sum, r) => sum + r.amount, 0);

    // Filter based on cdoPettyCashFilter
    const filteredRequests = roleRequests.filter(r => {
      if (cdoPettyCashFilter === 'All') return true;
      return r.status === cdoPettyCashFilter;
    });

    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-3xs mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 mb-6 gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase text-slate-800 tracking-widest font-mono flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-600" />
              Department Petty Cash & Operational Vouchers
            </h3>
            <p className="text-xs text-slate-400 mt-1">Request small-value funds, generate justified vouchers, or print official PDFs.</p>
          </div>

          {!isCreatingPettyCash && (
            <button
              type="button"
              onClick={() => {
                setEditingPettyCashId(null);
                setPettyCashAmount(0);
                setPettyCashPurpose('');
                setPettyCashDates('');
                setEnhancedPettyCashExplanation('');
                setIsCreatingPettyCash(true);
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-2 px-3 rounded-lg cursor-pointer transition-all flex items-center gap-1.5 shadow-3xs shrink-0 self-start sm:self-center"
            >
              <Plus className="w-3.5 h-3.5" />
              Request Petty Cash
            </button>
          )}
        </div>

        {/* Quick Statistics Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3.5 flex items-center gap-3">
            <div className="bg-emerald-50 text-emerald-600 p-2 rounded-lg">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Total Approved</p>
              <p className="text-sm font-bold text-slate-800 font-mono mt-0.5">UGX {totalAmtApproved.toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3.5 flex items-center gap-3">
            <div className="bg-amber-50 text-amber-600 p-2 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Total Pending Review</p>
              <p className="text-sm font-bold text-slate-800 font-mono mt-0.5">UGX {totalAmtPending.toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3.5 flex items-center gap-3">
            <div className="bg-slate-100 text-slate-500 p-2 rounded-lg">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Total Drafts & Returns</p>
              <p className="text-sm font-bold text-slate-800 font-mono mt-0.5">
                {roleRequests.filter(r => r.status === 'Draft' || r.status === 'Returned for Correction').length} Requests
              </p>
            </div>
          </div>
        </div>

        {/* Create / Edit Modal */}
        {isCreatingPettyCash && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
            <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-scale-up">
              <form onSubmit={(e) => handleSubmitPettyCash(e, false)} className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800 font-mono">
                        {editingPettyCashId ? `Modify Request: ${editingPettyCashId}` : 'Submit New Petty Cash Request'}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono">Lomuriangole Financial Operations System</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCreatingPettyCash(false)}
                    className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full cursor-pointer transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Scrollable Content */}
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Requested Amount (UGX)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold font-mono">UGX</span>
                        <input
                          required
                          type="number"
                          min="1"
                          placeholder="Enter amount"
                          value={pettyCashAmount || ''}
                          onChange={(e) => setPettyCashAmount(Number(e.target.value))}
                          className="w-full bg-white border border-slate-200 rounded-xl p-2.5 pl-12 text-xs focus:outline-none focus:border-amber-500 font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Activity / Intended Date(s)</label>
                      <input
                        required
                        type="text"
                        placeholder="e.g. 2026-06-30 or Saturday Sessions"
                        value={pettyCashDates}
                        onChange={(e) => setPettyCashDates(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Core Purpose Statement</label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Describe why these funds are needed (e.g. 'To purchase fresh drinking water and biscuits for Saturday play-based therapy classes.')"
                      value={pettyCashPurpose}
                      onChange={(e) => setPettyCashPurpose(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* AI Justification Assistant */}
                  <div className="bg-amber-50/50 border border-amber-200/60 rounded-2xl p-4.5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-amber-900 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                          Lomuriangole AI Justification Writer
                        </p>
                        <p className="text-[10px] text-amber-700">Convert raw statements into beautiful administrative explanations.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleEnhancePettyCashWithAI}
                        disabled={isEnhancingPettyCash}
                        className="bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-bold text-[10px] py-1.5 px-3 rounded-lg cursor-pointer transition-all flex items-center gap-1 shadow-3xs font-mono shrink-0"
                      >
                        {isEnhancingPettyCash ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Refining...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            Generate Explanation
                          </>
                        )}
                      </button>
                    </div>

                    {enhancedPettyCashExplanation && (
                      <div className="bg-white border border-amber-100 rounded-xl p-3.5 space-y-2 animate-fade-in">
                        <p className="text-[10px] font-bold text-amber-800 uppercase font-mono tracking-wider">Proposed Formal Justification</p>
                        <p className="text-xs text-slate-600 italic leading-relaxed">"{enhancedPettyCashExplanation}"</p>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setEnhancedPettyCashExplanation('')}
                            className="text-slate-400 hover:text-slate-600 text-[10px] font-semibold cursor-pointer"
                          >
                            Clear AI Proposal
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer / Actions */}
                <div className="flex flex-col sm:flex-row justify-end gap-2 p-5 border-t border-slate-100 bg-slate-50/50">
                  <button
                    type="button"
                    onClick={() => setIsCreatingPettyCash(false)}
                    className="bg-white border border-slate-250 text-slate-700 font-bold py-2 px-4 rounded-xl text-xs hover:bg-slate-50 cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubmitPettyCash(undefined, true)}
                    className="bg-slate-200 hover:bg-slate-250 text-slate-800 font-bold py-2 px-4 rounded-xl text-xs cursor-pointer transition-all"
                  >
                    Save as Draft
                  </button>
                  <button
                    type="submit"
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-5 rounded-xl text-xs cursor-pointer transition-all shadow-3xs"
                  >
                    Submit Request
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Requests Filter and List Grid */}
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3">
              {(['All', 'Draft', 'Pending', 'Approved', 'Returned for Correction', 'Rejected'] as const).map(f => (
                <button
                  key={`cdo-petty-cash-${f}`}
                  type="button"
                  onClick={() => setCdoPettyCashFilter(f)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all border ${
                    cdoPettyCashFilter === f
                      ? 'bg-amber-600 border-amber-600 text-white shadow-3xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* List */}
            {filteredRequests.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                No petty cash requests found for filter: <span className="font-bold">{cdoPettyCashFilter}</span>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRequests.map((request) => {
                  const hasCorrection = request.status === 'Returned for Correction';
                  return (
                    <div key={request.id} className="border border-slate-200 rounded-xl p-4.5 bg-slate-50/20 hover:bg-slate-50/50 transition-all flex flex-col justify-between relative overflow-hidden">
                      <div className={`absolute top-0 left-0 right-0 h-1 ${
                        request.status === 'Approved'
                          ? 'bg-emerald-500'
                          : request.status === 'Rejected'
                          ? 'bg-rose-500'
                          : hasCorrection
                          ? 'bg-purple-500'
                          : request.status === 'Draft'
                          ? 'bg-slate-400'
                          : 'bg-amber-500'
                      }`} />

                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10px] font-black text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                              {request.id}
                            </span>
                            <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                              request.status === 'Approved'
                                ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                : request.status === 'Rejected'
                                ? 'bg-rose-50 border-rose-100 text-rose-700'
                                : hasCorrection
                                ? 'bg-purple-50 border-purple-100 text-purple-700'
                                : request.status === 'Draft'
                                ? 'bg-slate-100 border-slate-200 text-slate-600'
                                : 'bg-amber-50 border-amber-100 text-amber-700 font-mono pulse-subtle'
                            }`}>
                              {request.status}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              Dates: <span className="text-slate-600 font-semibold">{request.dates}</span>
                            </span>
                          </div>

                          <p className="text-xs font-bold text-slate-800">{request.purpose}</p>

                          {request.aiEnhancedExplanation && (
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 mt-1">
                              <p className="text-[9px] font-bold text-blue-600 uppercase font-mono tracking-wider flex items-center gap-1 mb-0.5">
                                <Sparkles className="w-3 h-3 text-blue-500" />
                                Formal Justification
                              </p>
                              <p className="text-[11px] text-slate-500 italic">"{request.aiEnhancedExplanation}"</p>
                            </div>
                          )}

                          {request.correctionNotes && (
                            <div className="bg-rose-50 border border-rose-150 rounded-lg p-2.5 mt-1 text-rose-800">
                              <p className="text-[9px] font-bold uppercase font-mono tracking-wider flex items-center gap-1 mb-0.5 text-rose-700">
                                <AlertCircle className="w-3 h-3 text-rose-600" />
                                Correction Notes from Project Director
                              </p>
                              <p className="text-[11px] text-rose-600 font-medium">"{request.correctionNotes}"</p>
                            </div>
                          )}
                        </div>

                        <div className="sm:text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 shrink-0">
                          <div>
                            <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider font-mono">Amount Requested</span>
                            <span className="font-mono text-sm font-black text-slate-800">UGX {request.amount.toLocaleString()}</span>
                          </div>

                          <div className="flex items-center gap-1.5 mt-1">
                            <button
                              type="button"
                              onClick={() => generatePettyCashPDF(request, false)}
                              title="Download Vouchers PDF"
                              className="bg-white hover:bg-slate-50 text-slate-600 p-1.5 rounded-lg border border-slate-200 cursor-pointer shadow-3xs flex items-center justify-center transition-all"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>

                            {(request.status === 'Draft' || hasCorrection) && (
                              <button
                                type="button"
                                onClick={() => handleStartEditPettyCash(request)}
                                title="Edit Request"
                                className="bg-white hover:bg-slate-50 text-indigo-600 p-1.5 rounded-lg border border-slate-200 cursor-pointer shadow-3xs flex items-center justify-center transition-all"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {request.status === 'Draft' && (
                              <button
                                type="button"
                                onClick={() => handleDeletePettyCash(request.id)}
                                title="Delete Request"
                                className="bg-white hover:bg-rose-50 text-rose-600 p-1.5 rounded-lg border border-slate-200 cursor-pointer shadow-3xs flex items-center justify-center transition-all hover:border-rose-100"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    };

  const renderCdoPerformancePanel = () => {
    const roleToFilter = (activeRole === 'OVERSEER' || activeRole === 'PROJECT DIRECTOR')
      ? (targetStaffRole === 'OVERSEER' && activeRole === 'PROJECT DIRECTOR' ? 'CDO HEALTH' : targetStaffRole)
      : activeRole;
    const roleCycles = performanceCycles.filter(c => c.staffRole === roleToFilter);
    const currentCycle = selectedCycleId
      ? (roleCycles.find(c => c.id === selectedCycleId) || roleCycles.find(c => c.isActive) || roleCycles[0] || null)
      : (roleCycles.find(c => c.isActive) || roleCycles[0] || null);

    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-3xs mt-6">
        {(activeRole === 'OVERSEER' || activeRole === 'PROJECT DIRECTOR') && (
          <div className="mb-6 p-4 bg-indigo-50 border border-indigo-150 rounded-2xl flex flex-wrap items-center gap-4">
            <div>
              <span className="text-xs text-indigo-950 font-bold uppercase tracking-wider block mb-1">Select Target Staff Role</span>
              <select
                value={targetStaffRole === 'OVERSEER' && activeRole === 'PROJECT DIRECTOR' ? 'CDO HEALTH' : targetStaffRole}
                onChange={(e) => {
                  setTargetStaffRole(e.target.value as any);
                  setSelectedCycleId(null);
                }}
                className="bg-white border border-indigo-200 rounded-xl px-3 py-1.5 text-xs font-bold text-indigo-950 focus:ring-1 focus:ring-indigo-600"
              >
                {activeRole === 'OVERSEER' && <option value="OVERSEER">OVERSEER (Bishop Lomong)</option>}
                <option value="CDO HEALTH">CDO HEALTH (Dr. John Okori)</option>
                <option value="CDO SDR">CDO SDR (Auma Filda Noma)</option>
                <option value="CDO HBP">CDO HBP (Maria Chegem)</option>
              </select>
            </div>
            <div className="text-[11px] text-indigo-700 max-w-md">
              <span className="font-bold">{activeRole === 'PROJECT DIRECTOR' ? 'Project Director' : 'Overseer'} Creation Authority:</span> You are authorized to initialize, edit, and manage performance target plans and appraisals for all staff roles (Quarterly & Monthly).
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 mb-6 gap-3">
          <div className="space-y-1">
            <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Award className="w-5 h-5 text-indigo-600" />
              {activeRole === 'OVERSEER' 
                ? '📋 Overseer Performance Management Console' 
                : activeRole === 'PROJECT DIRECTOR'
                ? '📋 Project Director Performance Management Console'
                : '📈 Performance Targets & Appraisals'
              }
            </h3>
            <p className="text-xs text-slate-400">
              {activeRole === 'OVERSEER' || activeRole === 'PROJECT DIRECTOR'
                ? 'Initialize and define performance cycles, target objectives, and evaluations for any ministry role.'
                : "Establish performance metrics, record target dates, and conduct self-assessments in alignment with the supervisor's reviews."
              }
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {!isCreatingCycle && currentCycle && (currentCycle.status === 'Draft' || currentCycle.status === 'Returned for Correction') && (
              <button
                type="button"
                onClick={() => handleEditExistingCycle(currentCycle)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2 px-3.5 rounded-xl cursor-pointer shadow-3xs flex items-center gap-1.5 transition-all"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit Targets Plan
              </button>
            )}

            {!isCreatingCycle && (
              <button
                type="button"
                onClick={handleStartCreatePerformanceCycle}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-3.5 rounded-xl cursor-pointer shadow-3xs flex items-center gap-1.5 transition-all"
                title="Initialize another performance target cycle"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Performance Target
              </button>
            )}
          </div>
        </div>

        {/* Cycle Switcher & Activator for multiple cycles of the same role */}
        {!isCreatingCycle && roleCycles.length > 0 && (
          <div className="mb-6 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-3xs">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-bold text-slate-500 uppercase">Target Period / Cycle:</span>
              <select
                value={currentCycle?.id || ''}
                onChange={(e) => setSelectedCycleId(e.target.value)}
                className="bg-white border border-slate-250 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 focus:ring-1 focus:ring-slate-900"
              >
                {roleCycles.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.fiscalYear} ({c.status}){c.isActive ? ' 🟢 [Active]' : ''}
                  </option>
                ))}
              </select>
            </div>
            
            {currentCycle && !currentCycle.isActive && (
              <button
                type="button"
                onClick={() => handleActivatePerformanceCycle(currentCycle.id)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10.5px] px-3 py-1 rounded-lg cursor-pointer flex items-center gap-1 transition-all shadow-3xs"
              >
                🟢 Set as Active Period
              </button>
            )}
            {currentCycle && currentCycle.isActive && (
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1 flex items-center gap-1 font-mono">
                🟢 This Target Period is currently Active on Dashboard
              </span>
            )}
          </div>
        )}

        {isCreatingCycle ? (
          <form onSubmit={(e) => handleSubmitPerformanceCycle(e, false)} className="space-y-6">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 font-mono">
                1. Performance Plan Details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Fiscal Year Cycle / Target Period</label>
                  <select
                    value={cycleFiscalYear}
                    onChange={(e) => setCycleFiscalYear(e.target.value)}
                    className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-slate-900 font-medium"
                  >
                    <option value="FY 2024/2025">FY 2024/2025 (Active Cycle)</option>
                    <option value="FY 2025/2026">FY 2025/2026</option>
                    <optgroup label="Quarterly Cycles">
                      <option value="Quarter 1 (Q1)">Quarter 1 (Q1) - Jul-Sep</option>
                      <option value="Quarter 2 (Q2)">Quarter 2 (Q2) - Oct-Dec</option>
                      <option value="Quarter 3 (Q3)">Quarter 3 (Q3) - Jan-Mar</option>
                      <option value="Quarter 4 (Q4)">Quarter 4 (Q4) - Apr-Jun</option>
                    </optgroup>
                    <optgroup label="Monthly Cycles">
                      <option value="January Target Cycle">January Monthly Cycle</option>
                      <option value="February Target Cycle">February Monthly Cycle</option>
                      <option value="March Target Cycle">March Monthly Cycle</option>
                      <option value="April Monthly Cycle">April Monthly Cycle</option>
                      <option value="May Monthly Cycle">May Monthly Cycle</option>
                      <option value="June Monthly Cycle">June Monthly Cycle</option>
                      <option value="July Monthly Cycle">July Monthly Cycle</option>
                      <option value="August Monthly Cycle">August Monthly Cycle</option>
                      <option value="September Monthly Cycle">September Monthly Cycle</option>
                      <option value="October Monthly Cycle">October Monthly Cycle</option>
                      <option value="November Monthly Cycle">November Monthly Cycle</option>
                      <option value="December Monthly Cycle">December Monthly Cycle</option>
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Staff Member Name</label>
                  <input
                    type="text"
                    required
                    value={cycleStaffName}
                    onChange={(e) => setCycleStaffName(e.target.value)}
                    className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-slate-900 font-mono font-bold"
                    placeholder="Enter official signed name"
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 font-mono flex items-center gap-1.5">
                    🎯 2. Add / Edit Performance Target Items
                  </h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Specify key result areas (KRAs), activities, success metrics, and completion deadlines.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleAddBlankRow}
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-[11px] py-1.5 px-3 rounded-xl flex items-center gap-1 transition-all shadow-3xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> ➕ Insert New Blank Row
                  </button>
                  {cycleTargets.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Are you sure you want to clear all targets?")) {
                          setCycleTargets([]);
                        }
                      }}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] py-1.5 px-3 rounded-xl transition-all cursor-pointer"
                    >
                      🗑️ Clear All
                    </button>
                  )}
                </div>
              </div>

              {/* Predefined Templates Section */}
              <div className="p-4 bg-indigo-50/40 rounded-xl border border-indigo-150 space-y-3">
                <div className="flex items-center gap-1.5 text-indigo-950 font-bold text-xs">
                  <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
                  <span>⚡ Quick-Add Standard Key Result Area (KRA) Templates</span>
                </div>
                <p className="text-[10px] text-slate-600 leading-normal">
                  Click any standard CDO core responsibility below to instantly append it as a new editable row in your active performance plan table:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {STANDARD_CDO_KRAS.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleAddPredefinedKraRow(idx)}
                      className="bg-white hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-300 text-left p-2.5 rounded-xl transition-all shadow-3xs flex flex-col justify-between group h-full cursor-pointer hover:shadow-2xs"
                    >
                      <div className="text-[10px] font-bold text-slate-800 group-hover:text-indigo-900 font-sans line-clamp-1">
                        🎯 {item.kra}
                      </div>
                      <div className="text-[9px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                        {item.plannedActivities}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Traditional Form Drawer */}
              <div className="border border-slate-200/80 bg-white rounded-xl p-4 space-y-3">
                <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider block">
                  Or enter target details manually below:
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Key Result Area (KRA)</label>
                    <input
                      type="text"
                      value={newKra}
                      onChange={(e) => setNewKra(e.target.value)}
                      className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-slate-900 font-medium"
                      placeholder="e.g. Sponsor Correspondence & Child Portfolios"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Target Achievement Date</label>
                    <input
                      type="date"
                      value={newTargetDate}
                      onChange={(e) => setNewTargetDate(e.target.value)}
                      className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-slate-900 font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Planned Activities</label>
                    <textarea
                      value={newActivities}
                      onChange={(e) => setNewActivities(e.target.value)}
                      className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-slate-900 min-h-[50px]"
                      placeholder="Describe specific activities to achieve this result"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Measure of Success</label>
                    <textarea
                      value={newSuccessMeasure}
                      onChange={(e) => setNewSuccessMeasure(e.target.value)}
                      className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-slate-900 min-h-[50px]"
                      placeholder="e.g. 100% of letter translations scanned; zero backlog"
                    />
                  </div>
                </div>

                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={handleAddTargetToDraft}
                    disabled={!newKra || !newActivities || !newSuccessMeasure || !newTargetDate}
                    className="bg-slate-900 hover:bg-black disabled:opacity-40 text-white font-bold text-xs py-1.5 px-4 rounded-xl cursor-pointer shadow-3xs flex items-center gap-1.5 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {editingTargetId ? 'Update Target Item' : 'Add Target Row to List'}
                  </button>
                </div>
              </div>

              {/* Targets List & Spreadsheet Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white mt-4 shadow-3xs">
                {cycleTargets.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 italic font-sans text-xs bg-slate-50/30">
                    No targets added to this plan yet. Use the standard templates above or add custom ones inline!
                  </div>
                ) : (
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-mono font-bold text-slate-500 uppercase">
                        <th className="p-3 w-[25%]">Key Result Area (KRA)</th>
                        <th className="p-3 w-[30%]">Planned Activities</th>
                        <th className="p-3 w-[25%]">Measure of Success</th>
                        <th className="p-3 w-[12%]">Target Date</th>
                        <th className="p-3 w-[8%] text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                      {cycleTargets.map((target, idx) => {
                        const isEditingInline = editingInlineId === target.id;
                        return (
                          <tr key={target.id} className={`transition-all ${isEditingInline ? 'bg-indigo-50/40' : 'hover:bg-slate-50/40'}`}>
                            {isEditingInline ? (
                              <>
                                <td className="p-2.5">
                                  <div className="flex gap-1 items-start">
                                    <span className="font-mono text-slate-400 font-bold mt-1.5">{idx + 1}.</span>
                                    <input
                                      type="text"
                                      value={target.kra}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setCycleTargets(prev => prev.map(t => t.id === target.id ? { ...t, kra: val } : t));
                                      }}
                                      className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-semibold focus:ring-1 focus:ring-indigo-500"
                                      placeholder="KRA Area Name..."
                                    />
                                  </div>
                                </td>
                                <td className="p-2.5">
                                  <textarea
                                    value={target.plannedActivities}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setCycleTargets(prev => prev.map(t => t.id === target.id ? { ...t, plannedActivities: val } : t));
                                    }}
                                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs min-h-[60px] focus:ring-1 focus:ring-indigo-500"
                                    placeholder="Planned activities description..."
                                  />
                                </td>
                                <td className="p-2.5">
                                  <textarea
                                    value={target.measureOfSuccess}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setCycleTargets(prev => prev.map(t => t.id === target.id ? { ...t, measureOfSuccess: val } : t));
                                    }}
                                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs min-h-[60px] focus:ring-1 focus:ring-indigo-500"
                                    placeholder="Measure of success description..."
                                  />
                                </td>
                                <td className="p-2.5">
                                  <input
                                    type="date"
                                    value={target.targetDate}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setCycleTargets(prev => prev.map(t => t.id === target.id ? { ...t, targetDate: val } : t));
                                    }}
                                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 font-mono"
                                  />
                                </td>
                                <td className="p-2.5 text-right whitespace-nowrap space-x-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditingInlineId(null)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] py-1 px-2.5 rounded-lg shadow-3xs cursor-pointer"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveTargetFromDraft(target.id)}
                                    className="bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-[10px] py-1 px-2.5 rounded-lg cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="p-3 font-semibold text-slate-900 align-top">
                                  <span className="text-slate-400 font-mono mr-1">{idx + 1}.</span> {target.kra}
                                </td>
                                <td className="p-3 text-[11px] text-slate-600 leading-relaxed align-top">{target.plannedActivities}</td>
                                <td className="p-3 leading-relaxed text-slate-600 align-top">{target.measureOfSuccess}</td>
                                <td className="p-3 font-mono text-[11px] text-slate-500 align-top">{target.targetDate}</td>
                                <td className="p-3 text-right space-y-1 whitespace-nowrap align-top">
                                  <button
                                    type="button"
                                    onClick={() => setEditingInlineId(target.id)}
                                    className="text-indigo-600 hover:text-indigo-800 text-[11px] font-bold block w-full text-right hover:underline"
                                  >
                                    ✏️ Inline Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveTargetFromDraft(target.id)}
                                    className="text-rose-600 hover:text-rose-800 text-[11px] font-bold block w-full text-right hover:underline"
                                  >
                                    🗑️ Remove
                                  </button>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {cycleTargets.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 font-mono">
                  3. Sign-off and Submit
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Staff Electronic Signature</label>
                    <input
                      type="text"
                      required
                      value={staffSign}
                      onChange={(e) => setStaffSign(e.target.value)}
                      className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-slate-900 font-mono uppercase"
                      placeholder="Type official name to sign e.g. AUMA FILDA NOMA"
                    />
                    <p className="text-[9px] text-slate-400 mt-1 font-sans">
                      This is done at the beginning of the performance cycle and agreed upon by the staff and their supervisor.
                    </p>
                  </div>
                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 flex flex-col justify-center">
                    <p className="text-[11px] text-indigo-950 font-bold">Electronic Consent Agreement</p>
                    <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                      By typing your name, you declare agreement to these planned targets and success measures, submitting them for supervisor approval.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsCreatingCycle(false)}
                className="bg-white border border-slate-250 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={(e) => handleSubmitPerformanceCycle(e, true)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-250 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
              >
                Save Draft
              </button>
              <button
                type="submit"
                disabled={cycleTargets.length === 0 || !staffSign}
                className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-xs font-bold cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                Sign & Submit to PD
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            {!currentCycle ? (
              <div className="text-center py-10 bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl">
                <Award className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-bold">No Active Performance Plan Initiated</p>
                <p className="text-[11px] text-slate-400 mt-1">Start your performance cycle targets sheet for the current fiscal cycle.</p>
                <button
                  onClick={handleStartCreatePerformanceCycle}
                  className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-4 rounded-xl cursor-pointer shadow-3xs inline-flex items-center gap-1.5 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Initialize Performance Targets FY
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Status Indicator Bar */}
                <div className={`border rounded-2xl p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  currentCycle.status === 'Approved' ? 'bg-emerald-50 border-emerald-150 text-emerald-950' :
                  currentCycle.status === 'Returned for Correction' ? 'bg-rose-50 border-rose-150 text-rose-950' :
                  currentCycle.status === 'Submitted' ? 'bg-amber-50 border-amber-150 text-amber-950' :
                  'bg-slate-50 border-slate-200 text-slate-900'
                }`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md uppercase tracking-wide bg-white/80 border border-black/5 shadow-2xs">
                        {currentCycle.fiscalYear}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide ${
                        currentCycle.status === 'Approved' ? 'bg-emerald-600 text-white' :
                        currentCycle.status === 'Returned for Correction' ? 'bg-rose-600 text-white' :
                        currentCycle.status === 'Submitted' ? 'bg-amber-600 text-white' :
                        'bg-slate-600 text-white'
                      }`}>
                        {currentCycle.status}
                      </span>
                    </div>
                    <p className="text-xs font-semibold mt-1.5">
                      Assigned to: <span className="font-mono font-bold">{currentCycle.staffName}</span> ({activeRole})
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Submitted: {currentCycle.submittedAt}</p>
                  </div>

                  {/* PDF/Word Downloads */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => generatePerformancePDF(currentCycle)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10.5px] px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-3xs"
                      title="Download Performance Plan PDF"
                    >
                      <Download className="w-3.5 h-3.5" /> PDF Document
                    </button>
                    <button
                      type="button"
                      onClick={() => generatePerformanceWord(currentCycle)}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10.5px] px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-3xs"
                      title="Download Performance Plan Word Document"
                    >
                      <FileText className="w-3.5 h-3.5" /> Word Document
                    </button>
                  </div>

                  {currentCycle.status === 'Returned for Correction' && currentCycle.correctionNotes && (
                    <div className="bg-white/85 border border-rose-200 rounded-xl p-3 text-xs max-w-md">
                      <p className="font-bold text-rose-800">PD Correction Feedback:</p>
                      <p className="text-[11px] text-rose-700 mt-1">{currentCycle.correctionNotes}</p>
                    </div>
                  )}
                </div>

                {/* Targets table matching prompt */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-3xs">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono font-bold text-slate-400 uppercase">
                        <th className="p-3 w-1/6">Key Result Area (KRA)</th>
                        <th className="p-3 w-1/4">Planned Activities</th>
                        <th className="p-3 w-1/4">Measure of Success</th>
                        <th className="p-3 w-1/12">Target Date</th>
                        <th className="p-3 w-3/20">Self Assessment (Staff)</th>
                        <th className="p-3 w-3/20">Supervisor Assessment (PD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                      {currentCycle.targets.map((target, idx) => {
                        const isEditingSelf = editingSelfAssessmentId === target.id;
                        return (
                          <tr key={target.id} className="hover:bg-slate-50/30 transition-all">
                            <td className="p-3 font-bold text-slate-900">{idx + 1}. {target.kra}</td>
                            <td className="p-3 text-[11px] text-slate-500 leading-normal">{target.plannedActivities}</td>
                            <td className="p-3 leading-normal">{target.measureOfSuccess}</td>
                            <td className="p-3 font-mono text-[11px]">{target.targetDate}</td>
                            
                            {/* Self Assessment */}
                            <td className="p-3 bg-slate-50/25">
                              {isEditingSelf ? (
                                <div className="space-y-2">
                                  <textarea
                                    value={tempSelfAssessmentValue}
                                    onChange={(e) => setTempSelfAssessmentValue(e.target.value)}
                                    className="w-full bg-white border border-slate-250 rounded-lg p-1.5 text-xs min-h-[50px]"
                                    placeholder="Enter your progress self-assessment"
                                  />
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleSaveIndividualSelfAssessment(currentCycle.id, target.id)}
                                      className="bg-emerald-600 text-white text-[9px] font-bold py-1 px-2 rounded-md hover:bg-emerald-700"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingSelfAssessmentId(null)}
                                      className="bg-slate-200 text-slate-700 text-[9px] font-bold py-1 px-2 rounded-md hover:bg-slate-300"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  {target.selfAssessment ? (
                                    <p className="text-[11px] italic text-slate-800 leading-normal">{target.selfAssessment}</p>
                                  ) : (
                                    <p className="text-[10px] text-slate-400 italic">No progress logged yet.</p>
                                  )}
                                  {(currentCycle.status === 'Approved' || currentCycle.status === 'Submitted' || currentCycle.status === 'Returned for Correction') && (
                                    <button
                                      onClick={() => {
                                        setEditingSelfAssessmentId(target.id);
                                        setTempSelfAssessmentValue(target.selfAssessment || '');
                                      }}
                                      className="text-indigo-600 hover:text-indigo-800 text-[10px] font-bold block hover:underline text-left mt-1 cursor-pointer"
                                    >
                                      {target.selfAssessment ? '✏️ Edit Progress' : '✍️ Record Progress'}
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Supervisor Assessment */}
                            <td className="p-3 bg-slate-50/50">
                              <div className="space-y-1">
                                {target.supervisorAssessment ? (
                                  <p className="text-[11px] font-medium text-slate-900 leading-normal italic">{target.supervisorAssessment}</p>
                                ) : (
                                  <p className="text-[10px] text-slate-400 italic">Awaiting Supervisor evaluation.</p>
                                )}
                                <span className="text-[10px] text-slate-400 block italic mt-1 font-sans">
                                  🔒 Deactivated for CDO. Managed by Project Director / Supervisor.
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Overall Comments and Signatures Block */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 font-mono">
                    🖋️ Cycle Approvals & Signature Block
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    {/* Staff sign */}
                    <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1">
                      <p className="font-bold text-slate-400 uppercase tracking-wide text-[9px] font-mono">1. Staff Electronic Signature</p>
                      <p className="font-mono text-slate-900 font-bold uppercase border-b border-slate-100 pb-1 pt-1">
                        ✍️ {currentCycle.approvals.staffSignedName || 'UNSIGNED'}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono mt-1">Date: {currentCycle.approvals.staffSignedDate || 'Pending'}</p>
                    </div>

                    {/* Supervisor sign */}
                    <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1">
                      <p className="font-bold text-slate-400 uppercase tracking-wide text-[9px] font-mono">2. Supervisor (PD) Sign-off</p>
                      <p className="font-mono text-indigo-700 font-bold uppercase border-b border-slate-100 pb-1 pt-1">
                        🛡️ {currentCycle.approvals.supervisorSignedName || 'PENDING PD ACTION'}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono mt-1">Date: {currentCycle.approvals.supervisorSignedDate || 'Pending'}</p>
                    </div>

                    {/* Reviewer sign */}
                    <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1">
                      <p className="font-bold text-slate-400 uppercase tracking-wide text-[9px] font-mono">3. Governing Reviewer (Overseer)</p>
                      <p className="font-mono text-purple-700 font-bold uppercase border-b border-slate-100 pb-1 pt-1">
                        ⛪ {currentCycle.approvals.reviewerSignedName || 'PENDING REVIEW'}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono mt-1">Date: {currentCycle.approvals.reviewerSignedDate || 'Pending'}</p>
                    </div>
                  </div>

                  {/* Overall Assessments comment text blocks */}
                  <div className="space-y-2.5 pt-2">
                    {/* Overall Staff Self Comment */}
                    <div className="bg-white border border-slate-200 rounded-xl p-3.5">
                      <p className="text-[9px] font-mono font-bold text-slate-400 uppercase">Staff Overall Self-Assessment Comment</p>
                      {currentCycle.approvals.overallSelfComment ? (
                        <p className="text-xs text-slate-800 leading-normal mt-1">{currentCycle.approvals.overallSelfComment}</p>
                      ) : (
                        <p className="text-xs text-amber-600 font-medium italic mt-1">
                          ⚠️ CDO reflection commentary deactivated. Managed by Project Director / Supervisor.
                        </p>
                      )}
                    </div>

                    {/* PD overall comments */}
                    {currentCycle.approvals.overallSupervisorComment && (
                      <div className="bg-white border border-slate-200 rounded-xl p-3.5">
                        <p className="text-[9px] font-mono font-bold text-indigo-500 uppercase">Supervisor Overall Assessment Commentary</p>
                        <p className="text-xs text-indigo-950 leading-normal mt-1 italic">"{currentCycle.approvals.overallSupervisorComment}"</p>
                      </div>
                    )}

                    {/* Reviewer Comments */}
                    {currentCycle.approvals.reviewerComment && (
                      <div className="bg-white border border-slate-200 rounded-xl p-3.5">
                        <p className="text-[9px] font-mono font-bold text-purple-500 uppercase">Governing Reviewer Comments</p>
                        <p className="text-xs text-purple-950 leading-normal mt-1 italic">"{currentCycle.approvals.reviewerComment}"</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Helper stats definitions for metrics dashboard
  const medicalStats = useMemo(() => {
    let emergencyCount = 0;
    let vaccineCount = 0;
    let screeningCount = 0;

    participants.forEach(p => {
      const medForms = p.filledForms?.filter(f => f.type === 'Sick Participant Follow' || f.data?.bloodType) || [];
      if (medForms.length > 0) {
        screeningCount++;
        const latest = medForms[medForms.length - 1];
        if (latest.data?.isEmergencyAlert) emergencyCount++;
        if (latest.data?.vaccinationStatus === 'Fully Vaccinated') vaccineCount++;
      }
    });

    const totalActive = participants.filter(p => !p.isFormer).length;
    return {
      coverage: totalActive > 0 ? Math.round((screeningCount / totalActive) * 100) : 0,
      emergencyCount,
      vaccineRate: screeningCount > 0 ? Math.round((vaccineCount / screeningCount) * 100) : 100,
      totalActive
    };
  }, [participants]);

  const sdrStats = useMemo(() => {
    let lettersLogged = 0;
    let drafting = 0;
    let completed = 0;

    participants.forEach(p => {
      const sdrForms = p.filledForms?.filter(f => f.type === 'Referral' || f.data?.letterType) || [];
      lettersLogged += sdrForms.length;
      sdrForms.forEach(f => {
        if (f.data?.status === 'Drafting') drafting++;
        if (f.data?.status === 'Sent' || f.data?.status === 'Completed') completed++;
      });
    });

    return {
      lettersLogged,
      drafting,
      completed,
      completionRate: (drafting + completed) > 0 ? Math.round((completed / (drafting + completed)) * 100) : 0
    };
  }, [participants]);

  const hbpStats = useMemo(() => {
    let visitCount = 0;
    let concernCount = 0;

    participants.forEach(p => {
      const hbpForms = p.filledForms?.filter(f => f.type === 'Home Visit') || [];
      visitCount += hbpForms.length;
      hbpForms.forEach(f => {
        if (f.data?.cognitiveMilestone === 'Concern' || f.data?.motorMilestone === 'Concern' || f.data?.languageMilestone === 'Concern') {
          concernCount++;
        }
      });
    });

    return {
      visitCount,
      concernCount
    };
  }, [participants]);

  const actualCompliance = complianceStatus || {
    childProtectionSigned: true,
    healthComplianceMet: true,
    financialAuditingApproved: false,
    staffCertificationsUpdated: true
  };

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Role-Based Portals Navigation Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between py-4 gap-4">
            <div>
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-1 uppercase tracking-wider font-mono">
                Multi-Role Command Station
              </span>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight mt-1">
                Lomuriangole CYDC Staff Portals
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Role-specific workflows, metrics dashboards, and compliance checks for UG-1083 staff.
              </p>
            </div>

            {/* Current operator credential */}
            <div className="bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-2 max-w-max self-start md:self-auto">
              <User className="w-4 h-4 text-slate-600" />
              <div className="text-left">
                <p className="text-[10px] font-bold text-slate-700 leading-none">Active Administrator</p>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">{currentUserEmail}</p>
              </div>
            </div>
          </div>

          {/* Quick Role Selection Tabs */}
          {(!userRole || userRole === 'ADMINISTRATOR') ? (
            <div className="flex flex-nowrap overflow-x-auto border-t border-slate-100 py-2.5 gap-2 scrollbar-none">
              {[
                { id: 'CDO HEALTH', label: 'CDO Health', icon: Stethoscope, color: 'text-rose-500 border-rose-100 bg-rose-50' },
                { id: 'CDO SDR', label: 'CDO Sponsor Relations', icon: Mail, color: 'text-amber-500 border-amber-100 bg-amber-50' },
                { id: 'CDO HBP', label: 'CDO Home-Based Program', icon: Home, color: 'text-emerald-500 border-emerald-100 bg-emerald-50' },
                { id: 'PROJECT DIRECTOR', label: 'Project Director', icon: TrendingUp, color: 'text-indigo-600 border-indigo-100 bg-indigo-50' },
                { id: 'OVERSEER', label: 'Church Overseer Desk', icon: Award, color: 'text-purple-600 border-purple-100 bg-purple-50' },
                { id: 'OFFICIAL JOURNALS', label: 'Archival Journals', icon: BookOpen, color: 'text-teal-600 border-teal-100 bg-teal-50' }
              ].map((role) => {
                const RoleIcon = role.icon;
                const isSelected = activeRole === role.id;
                return (
                  <button
                    key={role.id}
                    onClick={() => {
                      setActiveRole(role.id as any);
                      setSelectedStudentId('');
                      setFormSuccess(null);
                    }}
                    className={`flex items-center gap-2 text-xs font-bold py-2.5 px-4 rounded-xl border shrink-0 transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-slate-900 border-slate-900 text-white shadow-xs' 
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <RoleIcon className={`w-4 h-4 ${isSelected ? 'text-white' : ''}`} />
                    {role.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="border-t border-slate-100 pt-3 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] bg-indigo-50 text-indigo-700 font-extrabold px-3 py-1 rounded-full uppercase tracking-wider font-mono">
                🔒 Locked Workspace: {userRole}
              </span>
              <span className="text-[10.5px] text-slate-500">
                You are viewing your assigned workspace. Secondary administrative staff dashboards are disabled.
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Alerts & Feedback banner */}
        {formSuccess && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in shadow-2xs">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-xs font-bold leading-normal">{formSuccess}</p>
                {lastSubmission && (
                  <p className="text-[10px] text-emerald-600 font-medium mt-0.5">
                    Authorized document copy generated for <span className="font-bold">{lastSubmission.type.toUpperCase()}</span> ({lastSubmission.data.id || lastSubmission.data.title})
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3 shrink-0">
              {lastSubmission && (
                <>
                  <button
                    type="button"
                    onClick={handleDownloadSubmittedPdf}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-3xs transition-all border border-emerald-650"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadSubmittedWord}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-3xs transition-all border border-blue-650"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Download Word</span>
                  </button>
                </>
              )}
              
              <button
                type="button"
                onClick={() => setFormSuccess(null)}
                className="text-emerald-700 hover:text-emerald-950 p-1 rounded-lg hover:bg-emerald-100 transition-all cursor-pointer ml-1"
                title="Dismiss message"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* CDO HEALTH DASHBOARD */}
        {activeRole === 'CDO HEALTH' && (
          <div className="space-y-6">
            {/* Health Bento Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Health Screened %</p>
                    <span className="p-1.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-500">
                      <Stethoscope className="w-4 h-4" />
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight mt-3">{medicalStats.coverage}%</h3>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
                  <div className="bg-rose-500 h-1.5 rounded-full" style={{ width: `${medicalStats.coverage}%` }} />
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Fully Immunized Rate</p>
                    <span className="p-1.5 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-500">
                      <CheckCircle className="w-4 h-4" />
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight mt-3">{medicalStats.vaccineRate}%</h3>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
                  <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${medicalStats.vaccineRate}%` }} />
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                <div className="flex justify-between items-start">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Critical Health Alerts</p>
                  <span className={`p-1.5 rounded-xl ${medicalStats.emergencyCount > 0 ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-slate-50 text-slate-400'}`}>
                    <AlertTriangle className="w-4 h-4" />
                  </span>
                </div>
                <h3 className={`text-2xl font-black tracking-tight mt-3 ${medicalStats.emergencyCount > 0 ? 'text-rose-600 font-extrabold' : 'text-slate-900'}`}>
                  {medicalStats.emergencyCount} Active
                </h3>
                <p className="text-[10px] text-slate-400 mt-1">Requires immediate medical assessment or checkup.</p>
              </div>

              <div className="bg-rose-900 border border-rose-950 text-rose-50 rounded-2xl p-5 shadow-3xs">
                <h4 className="text-xs font-bold uppercase tracking-widest font-mono text-rose-200">CDO Health Officer Scope</h4>
                <p className="text-[11px] mt-2 leading-relaxed text-rose-100">
                  Responsible for coordinating health assessments, tracking immunization compliance, recording sick children followups, and updating nutritional registers.
                </p>
              </div>
            </div>

            {/* Health Actions Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Add Health Log Form */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
                  <Plus className="w-4 h-4 text-rose-500" />
                  <h3 className="text-sm font-bold uppercase text-slate-800 tracking-widest font-mono">Log Health Assessment</h3>
                </div>

                <form onSubmit={handleSaveMedicalLog} className="space-y-4 mt-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Select Student</label>
                    <select
                      required
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none focus:border-rose-500"
                    >
                      <option value="">-- Choose Participant --</option>
                      {participants.filter(p => !p.isFormer).map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.cohort})</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Blood Type</label>
                      <select
                        value={bloodType}
                        onChange={(e) => setBloodType(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-500"
                      >
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Immunization</label>
                      <select
                        value={vaccinations}
                        onChange={(e) => setVaccinations(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-500"
                      >
                        <option value="Fully Vaccinated">Fully Vaccinated</option>
                        <option value="Partially Vaccinated">Partially Vaccinated</option>
                        <option value="Unvaccinated">Unvaccinated</option>
                        <option value="Unknown">Unknown</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Date of Checkup</label>
                    <input
                      required
                      type="date"
                      value={recentCheckup}
                      onChange={(e) => setRecentCheckup(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Allergies / Special Conditions</label>
                    <input
                      type="text"
                      placeholder="e.g. Asthma, Penicillin allergy, None"
                      value={allergies}
                      onChange={(e) => setAllergies(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Health Summary Notes</label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Enter details of checkup, prescriptions, nutritional status or current medical issues."
                      value={healthSummary}
                      onChange={(e) => setHealthSummary(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-500 resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 py-1 bg-rose-50 border border-rose-100 rounded-xl p-3">
                    <input
                      type="checkbox"
                      id="emergency-checkbox"
                      checked={isEmergency}
                      onChange={(e) => setIsEmergency(e.target.checked)}
                      className="h-4 w-4 text-rose-600 focus:ring-rose-500 border-slate-300 rounded"
                    />
                    <label htmlFor="emergency-checkbox" className="text-[11px] font-bold text-rose-700 cursor-pointer">
                      🚨 Flag as Urgent Health Alert / Case Outreach
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={!selectedStudentId}
                    className={`w-full text-xs font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-3xs ${
                      !selectedStudentId 
                        ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' 
                        : 'bg-rose-600 hover:bg-rose-700 text-white hover:scale-[1.01]'
                    }`}
                  >
                    <Activity className="w-4 h-4" />
                    Save Health Intake Report
                  </button>
                </form>
              </div>

              {/* Roster & Medical Status Table */}
              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <h3 className="text-sm font-bold uppercase text-slate-800 tracking-widest font-mono">
                    Participant Medical Register
                  </h3>
                  
                  {/* Search and filtering */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search student..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs w-full sm:w-48 focus:outline-none focus:bg-white"
                      />
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    </div>

                    <select
                      value={cohortFilter}
                      onChange={(e) => setCohortFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs focus:outline-none"
                    >
                      {cohorts.map(c => (
                        <option key={c} value={c}>{c === 'all' ? 'All Cohorts' : c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex-1 overflow-x-auto mt-4">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-500 font-bold bg-slate-50/50">
                        <th className="py-2.5 px-3">Participant</th>
                        <th className="py-2.5 px-3">Group</th>
                        <th className="py-2.5 px-3">Blood Type</th>
                        <th className="py-2.5 px-3">Immunization</th>
                        <th className="py-2.5 px-3">Recent Report</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredParticipants.map((student, idx) => {
                        const medLogs = student.filledForms?.filter(f => f.type === 'Sick Participant Follow' || f.data?.bloodType) || [];
                        const latestLog = medLogs[medLogs.length - 1];
                        const bloodStr = latestLog?.data?.bloodType || student.filledForms?.find(f => f.data?.bloodType)?.data?.bloodType || '—';
                        const isRedAlert = latestLog?.data?.isEmergencyAlert;
                        
                        return (
                          <tr key={`${student.id}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-3">
                              <p className="font-bold text-slate-800">{student.name}</p>
                              <p className="text-[10px] text-slate-400">{student.village || 'No Village'}</p>
                            </td>
                            <td className="py-3 px-3">
                              <span className="bg-slate-100 text-slate-600 rounded-lg px-2 py-0.5 font-bold text-[10px]">
                                {student.cohort}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-slate-700">{bloodStr}</td>
                            <td className="py-3 px-3">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                                latestLog?.data?.vaccinationStatus === 'Fully Vaccinated'
                                  ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                                  : latestLog?.data?.vaccinationStatus === 'Partially Vaccinated'
                                  ? 'bg-amber-50 border-amber-100 text-amber-600'
                                  : 'bg-slate-50 border-slate-200 text-slate-500'
                              }`}>
                                {latestLog?.data?.vaccinationStatus || 'Unrecorded'}
                              </span>
                            </td>
                            <td className="py-3 px-3 max-w-xs truncate">
                              {latestLog ? (
                                <div>
                                  <p className="font-medium text-slate-700 truncate">{latestLog.data.healthStatusSummary}</p>
                                  <p className="text-[9px] text-slate-400 font-mono">{latestLog.date}</p>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">No logs</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right">
                              {isRedAlert ? (
                                <span className="bg-rose-100 border border-rose-200 text-rose-700 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase animate-pulse">
                                  🚨 Urgent
                                </span>
                              ) : latestLog ? (
                                <span className="bg-emerald-50 border border-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                                  Normal
                                </span>
                              ) : (
                                <button
                                  onClick={() => {
                                    setSelectedStudentId(student.id);
                                    document.getElementById('structured-form')?.scrollIntoView({ behavior: 'smooth' });
                                  }}
                                  className="text-[10px] font-bold text-indigo-600 hover:underline"
                                >
                                  + Add Log
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredParticipants.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-8 text-slate-400 italic">No matching participant registries found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            {renderCdoTaskPanel()}
            {renderCdoBudgetPanel()}
            {renderCdoPettyCashPanel()}
            {renderCdoPerformancePanel()}
          </div>
        )}

        {/* CDO SDR DASHBOARD */}
        {activeRole === 'CDO SDR' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                <div className="flex justify-between items-start">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Correspondence Rate</p>
                  <span className="p-1.5 bg-amber-50 border border-amber-100 rounded-xl text-amber-500">
                    <Mail className="w-4 h-4" />
                  </span>
                </div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight mt-3">{sdrStats.completionRate}%</h3>
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
                  <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${sdrStats.completionRate}%` }} />
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                <div className="flex justify-between items-start">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Total Sponsor Letters Sent</p>
                  <span className="p-1.5 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-500">
                    <CheckSquare className="w-4 h-4" />
                  </span>
                </div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight mt-3">{sdrStats.completed}</h3>
                <p className="text-[10px] text-slate-400 mt-1">Successfully dispatched to global sponsor hubs.</p>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                <div className="flex justify-between items-start">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Letters In Draft</p>
                  <span className="p-1.5 bg-blue-50 border border-blue-100 rounded-xl text-blue-500">
                    <Clock className="w-4 h-4" />
                  </span>
                </div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight mt-3">{sdrStats.drafting}</h3>
                <p className="text-[10px] text-slate-400 mt-1">Requires follow-up review before final dispatch.</p>
              </div>

              <div className="bg-amber-900 border border-amber-950 text-amber-50 rounded-2xl p-5 shadow-3xs">
                <h4 className="text-xs font-bold uppercase tracking-widest font-mono text-amber-200">SDR Scope of Responsibility</h4>
                <p className="text-[11px] mt-2 leading-relaxed text-amber-100">
                  Responsible for coordinating sponsor letter writing sessions, cataloging received donor gifts, managing annual child progress files, and maintaining active donor relation tracking logs.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Log Letter Form */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
                  <Plus className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-bold uppercase text-slate-800 tracking-widest font-mono">Log Correspondence</h3>
                </div>

                <form onSubmit={handleSaveCorrespondenceLog} className="space-y-4 mt-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Select Student</label>
                    <select
                      required
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Choose Participant --</option>
                      {participants.filter(p => !p.isFormer).map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.cohort})</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Letter/Task Type</label>
                      <select
                        value={letterType}
                        onChange={(e) => setLetterType(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-amber-500"
                      >
                        <option value="Sponsor Letter">Sponsor Letter</option>
                        <option value="Birthday Card">Birthday Card</option>
                        <option value="Annual Progress Update">Annual Update</option>
                        <option value="Sponsor Gift Thank You">Thank You Card</option>
                        <option value="Other">Other Log</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Current Status</label>
                      <select
                        value={letterStatus}
                        onChange={(e) => setLetterStatus(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-amber-500"
                      >
                        <option value="Drafting">Drafting</option>
                        <option value="Completed">Ready (Signed)</option>
                        <option value="Sent">Dispatched/Sent</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Sponsor / Donor Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Compassion International, Mr. Smith"
                      value={donorName}
                      onChange={(e) => setDonorName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Activity Notes / Special Messages</label>
                    <textarea
                      rows={4}
                      placeholder="Enter description, sponsor codes, child feedback, gift details, or correspondence issues."
                      value={sdrNotes}
                      onChange={(e) => setSdrNotes(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-amber-500 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!selectedStudentId}
                    className={`w-full text-xs font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-3xs ${
                      !selectedStudentId 
                        ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' 
                        : 'bg-amber-600 hover:bg-amber-700 text-white hover:scale-[1.01]'
                    }`}
                  >
                    <Gift className="w-4 h-4" />
                    Save Correspondence Record
                  </button>
                </form>
              </div>

              {/* Roster & Letter Tracker Table */}
              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <h3 className="text-sm font-bold uppercase text-slate-800 tracking-widest font-mono">
                    Sponsor Relations & Correspondence Directory
                  </h3>
                  
                  {/* Search and filtering */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search student..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs w-full sm:w-48 focus:outline-none"
                      />
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-x-auto mt-4">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-500 font-bold bg-slate-50/50">
                        <th className="py-2.5 px-3">Participant</th>
                        <th className="py-2.5 px-3">Group</th>
                        <th className="py-2.5 px-3">Assigned Donor</th>
                        <th className="py-2.5 px-3">Last Activity</th>
                        <th className="py-2.5 px-3">Letters Logged</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredParticipants.map((student, idx) => {
                        const sdrLogs = student.filledForms?.filter(f => f.type === 'Referral' || f.data?.letterType) || [];
                        const latestSdr = sdrLogs[sdrLogs.length - 1];
                        const donorStr = latestSdr?.data?.sponsorName || 'No Sponsor Assigned';
                        
                        return (
                          <tr key={`${student.id}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-3">
                              <p className="font-bold text-slate-800">{student.name}</p>
                              <p className="text-[10px] text-slate-400">ID: {student.idNo || 'No ID'}</p>
                            </td>
                            <td className="py-3 px-3">
                              <span className="bg-slate-100 text-slate-600 rounded-lg px-2 py-0.5 font-bold text-[10px]">
                                {student.cohort}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-semibold text-slate-600">{donorStr}</td>
                            <td className="py-3 px-3">
                              {latestSdr ? (
                                <div>
                                  <p className="font-bold text-slate-700">{latestSdr.data.letterType}</p>
                                  <p className="text-[9px] text-slate-400 font-mono">{latestSdr.date}</p>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">No correspondence</span>
                              )}
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-slate-600">{sdrLogs.length} logged</td>
                            <td className="py-3 px-3 text-right">
                              {latestSdr?.data?.status === 'Sent' ? (
                                <span className="bg-emerald-50 border border-emerald-100 text-emerald-600 px-2 py-1 rounded-lg text-[10px] font-bold">
                                  ✓ Sent
                                </span>
                              ) : latestSdr?.data?.status === 'Drafting' ? (
                                <span className="bg-blue-50 border border-blue-100 text-blue-600 px-2 py-1 rounded-lg text-[10px] font-bold">
                                  ✏ Drafting
                                </span>
                              ) : latestSdr ? (
                                <span className="bg-amber-50 border border-amber-150 text-amber-600 px-2 py-1 rounded-lg text-[10px] font-bold">
                                  Ready
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">Pending letter</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            {renderCdoTaskPanel()}
            {renderCdoBudgetPanel()}
            {renderCdoPettyCashPanel()}
            {renderCdoPerformancePanel()}
          </div>
        )}

        {/* CDO HBP DASHBOARD */}
        {activeRole === 'CDO HBP' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                <div className="flex justify-between items-start">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Completed Home Visits</p>
                  <span className="p-1.5 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-500">
                    <Home className="w-4 h-4" />
                  </span>
                </div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight mt-3">{hbpStats.visitCount} visits</h3>
                <p className="text-[10px] text-slate-400 mt-1">Successfully recorded caregivers checkups.</p>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                <div className="flex justify-between items-start">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Developmental Concern Flags</p>
                  <span className={`p-1.5 rounded-xl ${hbpStats.concernCount > 0 ? 'bg-amber-100 text-amber-600 animate-pulse' : 'bg-slate-50 text-slate-400'}`}>
                    <AlertTriangle className="w-4 h-4" />
                  </span>
                </div>
                <h3 className={`text-2xl font-black tracking-tight mt-3 ${hbpStats.concernCount > 0 ? 'text-amber-600 font-extrabold' : 'text-slate-900'}`}>
                  {hbpStats.concernCount} Active
                </h3>
                <p className="text-[10px] text-slate-400 mt-1">Milestones flagged with concerns by visiting CDOs.</p>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                <div className="flex justify-between items-start">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">HBP Active Registry</p>
                  <span className="p-1.5 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-500">
                    <User className="w-4 h-4" />
                  </span>
                </div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight mt-3">
                  {participants.filter(p => p.cohort?.toLowerCase().includes('home') || p.cohort?.toLowerCase().includes('toddler') || p.cohort?.toLowerCase().includes('infant')).length} Active
                </h3>
                <p className="text-[10px] text-slate-400 mt-1">Infants, toddlers and parents enrolled.</p>
              </div>

              <div className="bg-emerald-900 border border-emerald-950 text-emerald-50 rounded-2xl p-5 shadow-3xs">
                <h4 className="text-xs font-bold uppercase tracking-widest font-mono text-emerald-200">CDO HBP Officer Scope</h4>
                <p className="text-[11px] mt-2 leading-relaxed text-emerald-100">
                  Responsible for coordinating monthly caregiver visitations, recording child cognitive/motor progress logs, and monitoring overall household vulnerabilities.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Log Home Visit Form */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
                  <Plus className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-sm font-bold uppercase text-slate-800 tracking-widest font-mono">Log Home Visit & Milestones</h3>
                </div>

                <form onSubmit={handleSaveHbpLog} className="space-y-4 mt-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Select HBP Child / Toddler</label>
                    <select
                      required
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:bg-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">-- Choose Participant --</option>
                      {participants.filter(p => !p.isFormer).map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.cohort})</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Date of Visit</label>
                      <input
                        type="date"
                        required
                        value={visitDate}
                        onChange={(e) => setVisitDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Next Visit Date</label>
                      <input
                        type="date"
                        required
                        value={nextVisitDate}
                        onChange={(e) => setNextVisitDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest font-mono border-b border-slate-200 pb-1.5 mb-1">
                      Developmental Milestone Checks
                    </p>
                    
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">Cognitive & Focus Skills</span>
                      <select
                        value={cognitiveMilestone}
                        onChange={(e) => setCognitiveMilestone(e.target.value as any)}
                        className="bg-white border border-slate-200 rounded-lg p-1 text-[11px] focus:outline-none"
                      >
                        <option value="Achieved">Achieved</option>
                        <option value="Emerging">Emerging</option>
                        <option value="Concern">Concern</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">Gross/Fine Motor Skills</span>
                      <select
                        value={motorMilestone}
                        onChange={(e) => setMotorMilestone(e.target.value as any)}
                        className="bg-white border border-slate-200 rounded-lg p-1 text-[11px] focus:outline-none"
                      >
                        <option value="Achieved">Achieved</option>
                        <option value="Emerging">Emerging</option>
                        <option value="Concern">Concern</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">Language & Expression</span>
                      <select
                        value={languageMilestone}
                        onChange={(e) => setLanguageMilestone(e.target.value as any)}
                        className="bg-white border border-slate-200 rounded-lg p-1 text-[11px] focus:outline-none"
                      >
                        <option value="Achieved">Achieved</option>
                        <option value="Emerging">Emerging</option>
                        <option value="Concern">Concern</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Caregiver Counseling & Observation Notes</label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Enter caregiver support details, developmental feedback, feeding status, or living conditions."
                      value={caregiverFeedback}
                      onChange={(e) => setCaregiverFeedback(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!selectedStudentId}
                    className={`w-full text-xs font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-3xs ${
                      !selectedStudentId 
                        ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' 
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:scale-[1.01]'
                    }`}
                  >
                    <Home className="w-4 h-4" />
                    Save Home Visit Checkup
                  </button>
                </form>
              </div>

              {/* HBP visitation history Table */}
              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <h3 className="text-sm font-bold uppercase text-slate-800 tracking-widest font-mono">
                    Home-Based Program Cohort Directory
                  </h3>
                </div>

                <div className="flex-1 overflow-x-auto mt-4">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-500 font-bold bg-slate-50/50">
                        <th className="py-2.5 px-3">Participant</th>
                        <th className="py-2.5 px-3">Cohort</th>
                        <th className="py-2.5 px-3">Caregiver Name</th>
                        <th className="py-2.5 px-3">Last Visit</th>
                        <th className="py-2.5 px-3">Milestone Progress Status</th>
                        <th className="py-2.5 px-3 text-right">Action Needed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredParticipants.map((student, idx) => {
                        const hbpLogs = student.filledForms?.filter(f => f.type === 'Home Visit') || [];
                        const latestHbp = hbpLogs[hbpLogs.length - 1];
                        const hasConcern = latestHbp?.data?.cognitiveMilestone === 'Concern' || 
                                           latestHbp?.data?.motorMilestone === 'Concern' || 
                                           latestHbp?.data?.languageMilestone === 'Concern';
                        
                        return (
                          <tr key={`${student.id}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-3">
                              <p className="font-bold text-slate-800">{student.name}</p>
                              <p className="text-[10px] text-slate-400">Village: {student.village || '—'}</p>
                            </td>
                            <td className="py-3 px-3">
                              <span className="bg-emerald-50 text-emerald-700 rounded-lg px-2 py-0.5 font-bold text-[10px]">
                                {student.cohort}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-600 font-semibold">{student.caregiver || '—'}</td>
                            <td className="py-3 px-3">
                              {latestHbp ? (
                                <div>
                                  <p className="font-bold text-slate-700">Visited</p>
                                  <p className="text-[9px] text-slate-400 font-mono">{latestHbp.date}</p>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">No visits logged</span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              {latestHbp ? (
                                <div className="space-y-0.5">
                                  <p className="text-[10px] font-medium text-slate-600">Cognitive: {latestHbp.data.cognitiveMilestone}</p>
                                  <p className="text-[10px] font-medium text-slate-600">Motor: {latestHbp.data.motorMilestone}</p>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">—</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right">
                              {hasConcern ? (
                                <span className="bg-amber-100 border border-amber-200 text-amber-700 px-2 py-1 rounded-full text-[10px] font-bold">
                                  ⚠️ Monitor Milestone
                                </span>
                              ) : latestHbp?.data?.nextVisitDate ? (
                                <span className="text-[10px] font-bold text-slate-600 bg-slate-100 rounded-lg px-2 py-1">
                                  Next: {latestHbp.data.nextVisitDate}
                                </span>
                              ) : (
                                <button
                                  onClick={() => setSelectedStudentId(student.id)}
                                  className="text-[10px] font-bold text-emerald-600 hover:underline"
                                >
                                  + Schedule Visit
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            {renderCdoTaskPanel()}
            {renderCdoBudgetPanel()}
            {renderCdoPettyCashPanel()}
            {renderCdoPerformancePanel()}
          </div>
        )}

        {/* PROJECT DIRECTOR DASHBOARD */}
        {activeRole === 'PROJECT DIRECTOR' && (
          <div className="space-y-6 animate-fade-in">
            {/* High level executive indicators bento */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-md flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider font-mono">Center KPI Progress</p>
                  <h3 className="text-2xl font-black mt-2 tracking-tight">Executive Summary</h3>
                  <p className="text-xs text-slate-400 mt-2">Overall indicators of program delivery, health screened, letter completions and visitor safety.</p>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
                  <span>Center Code:</span>
                  <span className="font-mono font-bold text-indigo-400">UG-1083 (Lomuriangole)</span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Health & Screening Coverage</p>
                <div className="flex items-baseline gap-2 mt-3">
                  <h3 className="text-3xl font-black text-slate-950 tracking-tight">{medicalStats.coverage}%</h3>
                  <span className="text-[10px] font-bold text-slate-400">Target: 95%</span>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
                  <div className="bg-rose-500 h-1.5 rounded-full" style={{ width: `${medicalStats.coverage}%` }} />
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Sponsor Letter Completion</p>
                <div className="flex items-baseline gap-2 mt-3">
                  <h3 className="text-3xl font-black text-slate-950 tracking-tight">{sdrStats.completionRate}%</h3>
                  <span className="text-[10px] font-bold text-slate-400">Target: 90%</span>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
                  <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${sdrStats.completionRate}%` }} />
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Total Outreach Visits Done</p>
                <div className="flex items-baseline gap-2 mt-3">
                  <h3 className="text-3xl font-black text-slate-950 tracking-tight">{hbpStats.visitCount} visits</h3>
                  <span className="text-[10px] font-bold text-slate-400">HBP Program</span>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
                  <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '100%' }} />
                </div>
              </div>
            </div>

            {/* Task Delegation Board */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-3xs">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold uppercase text-slate-800 tracking-widest font-mono flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-indigo-600" />
                    CDO Tasks & Delegations Panel
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">Assign, track, and manage specific program execution tasks for CDO roles.</p>
                </div>

                <button
                  onClick={() => setIsAddTaskOpen(!isAddTaskOpen)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-3.5 rounded-xl cursor-pointer flex items-center gap-1.5 transition-all shadow-3xs"
                >
                  <Plus className="w-4 h-4" />
                  Assign New Task
                </button>
              </div>

              {/* Task Add Form Overlay */}
              {isAddTaskOpen && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mt-4 animate-fade-in">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-mono">Add Staff Task</h4>
                    <button onClick={() => setIsAddTaskOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <form onSubmit={handleCreateTask} className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-4">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Task Title</label>
                      <input
                        required
                        type="text"
                        placeholder="e.g. Schedule health screens, Complete child letters"
                        value={taskTitle}
                        onChange={(e) => setTaskTitle(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Assigned Staff Role</label>
                      <select
                        value={taskRole}
                        onChange={(e) => setTaskRole(e.target.value as any)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none"
                      >
                        <option value="CDO HEALTH">CDO HEALTH</option>
                        <option value="CDO SDR">CDO SDR</option>
                        <option value="CDO HBP">CDO HBP</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Priority</label>
                      <select
                        value={taskPriority}
                        onChange={(e) => setTaskPriority(e.target.value as any)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Due Date</label>
                      <input
                        required
                        type="date"
                        value={taskDueDate}
                        onChange={(e) => setTaskDueDate(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none"
                      />
                    </div>

                    <div className="md:col-span-12 flex flex-col md:flex-row items-end gap-3">
                      <div className="flex-1 w-full">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Task Description</label>
                        <input
                          type="text"
                          placeholder="Provide context and requirements for the assigned task."
                          value={taskDescription}
                          onChange={(e) => setTaskDescription(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 px-5 rounded-xl cursor-pointer w-full md:w-auto h-10 shadow-3xs shrink-0 transition-all"
                      >
                        Assign Task
                      </button>
                    </div>
                  </form>
                </div>
              )}
              
              <div id="tasks-anchor" />

              {/* CDO Task Correction Overlay */}
              {activeTaskCorrectionId && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 mb-6 mt-4 animate-fade-in">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700 font-mono flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    Specify Correction Requirements for Workplan: {activeTaskCorrectionId}
                  </h4>
                  <form onSubmit={handleReturnTaskSubmit} className="mt-3 space-y-3">
                    <textarea
                      required
                      rows={3}
                      value={currentTaskCorrectionNotes}
                      onChange={(e) => setCurrentTaskCorrectionNotes(e.target.value)}
                      placeholder="Write feedback detailing what needs to be changed before this workplan task can be approved."
                      className="w-full bg-white border border-rose-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTaskCorrectionId(null);
                          setCurrentTaskCorrectionNotes('');
                        }}
                        className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs py-1.5 px-4 rounded-xl cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-1.5 px-4 rounded-xl cursor-pointer shadow-3xs"
                      >
                        Send Correction Feedback
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Submitted CDO Workplans for PD Approval */}
              {staffTasks.some(t => t.approvalStatus === 'pending_approval') && (
                <div className="bg-indigo-50/40 border border-indigo-100 rounded-2xl p-5 mt-4 mb-6">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-950 font-mono flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-indigo-600 animate-pulse" />
                    Submitted CDO Workplans Pending PD Approval ({staffTasks.filter(t => t.approvalStatus === 'pending_approval').length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {staffTasks.filter(t => t.approvalStatus === 'pending_approval').map(task => (
                      <div key={task.id} className="bg-white border border-indigo-100 rounded-xl p-4 shadow-3xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-1.5 mb-2">
                            <span className="bg-indigo-100 text-indigo-800 text-[9px] font-mono font-bold px-2 py-0.5 rounded-lg uppercase">
                              {task.assignedRole}
                            </span>
                            <span className={`text-[9px] font-bold rounded-lg px-2 py-0.5 uppercase tracking-wide shrink-0 ${
                              task.priority === 'high' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {task.priority}
                            </span>
                          </div>
                          <h5 className="font-bold text-slate-800 text-xs leading-snug mb-1">{task.title}</h5>
                          <p className="text-[11px] text-slate-500 leading-normal line-clamp-3 mb-3">{task.description}</p>
                        </div>
                        <div className="border-t border-slate-100 pt-3 flex flex-col gap-2.5">
                          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                            <span>Due: {task.dueDate}</span>
                            <span className="font-sans font-bold text-indigo-600">Pending Review</span>
                          </div>

                          {/* View Details Button */}
                          <button
                            type="button"
                            onClick={() => setViewingTask(task)}
                            className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer shadow-3xs"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Workplan Details</span>
                          </button>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => handleApproveCdoTask(task.id)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] py-1.5 px-3 rounded-lg cursor-pointer text-center transition-all shadow-3xs flex items-center justify-center gap-1"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button
                              onClick={() => {
                                setActiveTaskCorrectionId(task.id);
                                setCurrentTaskCorrectionNotes('');
                                document.getElementById('tasks-anchor')?.scrollIntoView({ behavior: 'smooth' });
                              }}
                              className="bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[10px] py-1.5 px-3 rounded-lg cursor-pointer text-center transition-all flex items-center justify-center gap-1"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" /> Return
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tasks Board Columns */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                {/* CDO HEALTH TASKS */}
                <div className="bg-rose-50/40 border border-rose-100 rounded-2xl p-4">
                  <div className="flex items-center justify-between pb-3 border-b border-rose-100 mb-3">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-rose-500 animate-pulse" />
                      <h4 className="font-bold text-rose-950 text-xs uppercase tracking-wider font-mono">CDO Health Tasks</h4>
                    </div>
                    <span className="bg-rose-100 text-rose-800 rounded-full px-2.5 py-0.5 text-[10px] font-bold font-mono">
                      {staffTasks.filter(t => t.assignedRole === 'CDO HEALTH' && (!t.approvalStatus || t.approvalStatus === 'approved') && t.status !== 'completed').length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {staffTasks.filter(t => t.assignedRole === 'CDO HEALTH' && (!t.approvalStatus || t.approvalStatus === 'approved') && t.status !== 'completed').map((task, idx) => (
                      <div key={`${task.id}-${idx}`} className="bg-white border border-rose-100 rounded-xl p-3.5 shadow-2xs">
                        <div className="flex items-start justify-between gap-1.5">
                          <h5 className="font-bold text-slate-800 text-xs leading-snug">{task.title}</h5>
                          <span className={`text-[9px] font-bold rounded-lg px-1.5 py-0.5 uppercase tracking-wide shrink-0 ${
                            task.priority === 'high' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {task.priority}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1.5 line-clamp-2">{task.description}</p>
                        
                        <div className="flex items-center justify-between border-t border-slate-100 mt-3 pt-2">
                          <span className="text-[10px] font-mono font-semibold text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {task.dueDate}
                          </span>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setViewingTask(task)}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded-md transition-all cursor-pointer"
                              title="View full task details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => generateWorkplanPDF(task)}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded-md transition-all cursor-pointer"
                              title="Download approved workplan brief as PDF"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                              task.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : task.status === 'in-progress'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                                : 'bg-slate-100 text-slate-800 border border-slate-200'
                            }`}>
                              {task.status === 'in-progress' ? 'In Progress' : task.status || 'Pending'}
                            </span>
                            <button onClick={() => handleDeleteTask(task.id)} className="p-1 text-slate-400 hover:text-rose-600 rounded-md">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {staffTasks.filter(t => t.assignedRole === 'CDO HEALTH' && (!t.approvalStatus || t.approvalStatus === 'approved') && t.status !== 'completed').length === 0 && (
                      <p className="text-center py-6 text-xs text-slate-400 italic">No active health tasks.</p>
                    )}
                  </div>
                </div>

                {/* CDO SDR TASKS */}
                <div className="bg-amber-50/40 border border-amber-100 rounded-2xl p-4">
                  <div className="flex items-center justify-between pb-3 border-b border-amber-100 mb-3">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-amber-500 animate-pulse" />
                      <h4 className="font-bold text-amber-950 text-xs uppercase tracking-wider font-mono">CDO Sponsor Tasks</h4>
                    </div>
                    <span className="bg-amber-100 text-amber-800 rounded-full px-2.5 py-0.5 text-[10px] font-bold font-mono">
                      {staffTasks.filter(t => t.assignedRole === 'CDO SDR' && (!t.approvalStatus || t.approvalStatus === 'approved') && t.status !== 'completed').length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {staffTasks.filter(t => t.assignedRole === 'CDO SDR' && (!t.approvalStatus || t.approvalStatus === 'approved') && t.status !== 'completed').map((task, idx) => (
                      <div key={`${task.id}-${idx}`} className="bg-white border border-amber-100 rounded-xl p-3.5 shadow-2xs">
                        <div className="flex items-start justify-between gap-1.5">
                          <h5 className="font-bold text-slate-800 text-xs leading-snug">{task.title}</h5>
                          <span className={`text-[9px] font-bold rounded-lg px-1.5 py-0.5 uppercase tracking-wide shrink-0 ${
                            task.priority === 'high' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {task.priority}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1.5 line-clamp-2">{task.description}</p>
                        
                        <div className="flex items-center justify-between border-t border-slate-100 mt-3 pt-2">
                          <span className="text-[10px] font-mono font-semibold text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {task.dueDate}
                          </span>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setViewingTask(task)}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded-md transition-all cursor-pointer"
                              title="View full task details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => generateWorkplanPDF(task)}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded-md transition-all cursor-pointer"
                              title="Download approved workplan brief as PDF"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                              task.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : task.status === 'in-progress'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                                : 'bg-slate-100 text-slate-800 border border-slate-200'
                            }`}>
                              {task.status === 'in-progress' ? 'In Progress' : task.status || 'Pending'}
                            </span>
                            <button onClick={() => handleDeleteTask(task.id)} className="p-1 text-slate-400 hover:text-rose-600 rounded-md">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {staffTasks.filter(t => t.assignedRole === 'CDO SDR' && (!t.approvalStatus || t.approvalStatus === 'approved') && t.status !== 'completed').length === 0 && (
                      <p className="text-center py-6 text-xs text-slate-400 italic">No active correspondence tasks.</p>
                    )}
                  </div>
                </div>

                {/* CDO HBP TASKS */}
                <div className="bg-emerald-50/40 border border-emerald-100 rounded-2xl p-4">
                  <div className="flex items-center justify-between pb-3 border-b border-emerald-100 mb-3">
                    <div className="flex items-center gap-2">
                      <Home className="w-4 h-4 text-emerald-500 animate-pulse" />
                      <h4 className="font-bold text-emerald-950 text-xs uppercase tracking-wider font-mono">CDO Home-Visit Tasks</h4>
                    </div>
                    <span className="bg-emerald-100 text-emerald-800 rounded-full px-2.5 py-0.5 text-[10px] font-bold font-mono">
                      {staffTasks.filter(t => t.assignedRole === 'CDO HBP' && (!t.approvalStatus || t.approvalStatus === 'approved') && t.status !== 'completed').length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {staffTasks.filter(t => t.assignedRole === 'CDO HBP' && (!t.approvalStatus || t.approvalStatus === 'approved') && t.status !== 'completed').map((task, idx) => (
                      <div key={`${task.id}-${idx}`} className="bg-white border border-emerald-100 rounded-xl p-3.5 shadow-2xs">
                        <div className="flex items-start justify-between gap-1.5">
                          <h5 className="font-bold text-slate-800 text-xs leading-snug">{task.title}</h5>
                          <span className={`text-[9px] font-bold rounded-lg px-1.5 py-0.5 uppercase tracking-wide shrink-0 ${
                            task.priority === 'high' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {task.priority}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1.5 line-clamp-2">{task.description}</p>
                        
                        <div className="flex items-center justify-between border-t border-slate-100 mt-3 pt-2">
                          <span className="text-[10px] font-mono font-semibold text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {task.dueDate}
                          </span>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setViewingTask(task)}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded-md transition-all cursor-pointer"
                              title="View full task details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => generateWorkplanPDF(task)}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded-md transition-all cursor-pointer"
                              title="Download approved workplan brief as PDF"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                              task.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : task.status === 'in-progress'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                                : 'bg-slate-100 text-slate-800 border border-slate-200'
                            }`}>
                              {task.status === 'in-progress' ? 'In Progress' : task.status || 'Pending'}
                            </span>
                            <button onClick={() => handleDeleteTask(task.id)} className="p-1 text-slate-400 hover:text-rose-600 rounded-md">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {staffTasks.filter(t => t.assignedRole === 'CDO HBP' && (!t.approvalStatus || t.approvalStatus === 'approved') && t.status !== 'completed').length === 0 && (
                      <p className="text-center py-6 text-xs text-slate-400 italic">No active home visit tasks.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Project Director Financial Approvals Panel */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs mt-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-100 mb-6 gap-3">
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-indigo-600" />
                    📋 Financial Approvals & Budget Control Panel
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">Review activity estimates, authorize program funds, or return for corrections.</p>
                </div>
                
                {/* Status Filters */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['All', 'Pending', 'Approved', 'Returned for Correction', 'Signed-off'] as const).map(f => (
                    <button
                      key={`pd-budget-filter-${f}`}
                      type="button"
                      onClick={() => setPdBudgetFilter(f)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all border ${
                        pdBudgetFilter === f
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-3xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Monthly Journal Sign-Off Panel for Project Director */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-fade-in">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-800 uppercase font-mono tracking-wider flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-emerald-600" />
                    Active Discussion Journal Period: {formatMonthLabel(currentJournalMonth)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Approved budgets in this period will be signed off, archived, and locked. New proposals will automatically open under the next monthly period.
                  </p>
                  {signedOffMonths.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px] text-slate-400">
                      <span>Signed-off months:</span>
                      {signedOffMonths.map(m => (
                        <span key={m} className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono font-medium">
                          {formatMonthLabel(m)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleSignOffBudgets}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-3xs shrink-0"
                >
                  <Check className="w-4 h-4" />
                  Sign Off All Budgets & Open Next Month
                </button>
              </div>

              {/* Correction modal/overlay inline if activeCorrectionId is selected */}
              {activeCorrectionId && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 mb-6 animate-fade-in">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700 font-mono flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    Specify Correction Requirements for Budget: {activeCorrectionId}
                  </h4>
                  <form onSubmit={handleReturnBudgetSubmit} className="mt-3 space-y-3">
                    <textarea
                      required
                      rows={3}
                      value={currentCorrectionNotes}
                      onChange={(e) => setCurrentCorrectionNotes(e.target.value)}
                      placeholder="Explain what needs to be changed (e.g. 'Unit cost for printing is too high. Please reduce quantity or source cheaper supplies...')"
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-rose-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveCorrectionId(null);
                          setCurrentCorrectionNotes('');
                        }}
                        className="bg-white border border-slate-250 text-slate-700 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer shadow-3xs flex items-center gap-1"
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        Confirm Return for Correction
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Budgets Review Grid */}
              <div className="space-y-4">
                {budgets
                  .filter(b => pdBudgetFilter === 'All' || b.status === pdBudgetFilter)
                  .map((budget, bIdx) => {
                    const hasCorrection = budget.status === 'Returned for Correction';
                    return (
                      <div key={`${budget.id}-${bIdx}`} className="border border-slate-200 rounded-2xl p-5 bg-slate-50/30 hover:bg-slate-50/70 transition-all flex flex-col justify-between relative overflow-hidden">
                        
                        <div className={`absolute top-0 left-0 right-0 h-1 ${
                          budget.status === 'Approved' ? 'bg-emerald-500' : hasCorrection ? 'bg-rose-500' : 'bg-amber-500'
                        }`} />

                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                          <div className="space-y-1.5 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold">
                                {budget.id}
                              </span>
                              <span className="text-[10px] font-black uppercase bg-indigo-50 border border-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-lg">
                                {budget.category}
                              </span>
                              <span className="text-xs text-slate-400 font-mono">Submitted: {budget.submittedAt}</span>
                              <span className="text-xs text-slate-400 font-bold font-mono">By: {budget.submittedBy}</span>
                            </div>
                            <h4 className="text-sm font-extrabold text-slate-950 mt-1">{budget.title}</h4>
                            <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">{budget.description}</p>
                          </div>

                          <div className="flex flex-col items-start md:items-end gap-1.5 shrink-0">
                            <p className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">PROPOSED TOTAL</p>
                            <p className="text-lg font-black text-slate-900 font-mono">UGX {budget.amount.toLocaleString()}</p>
                            
                            <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full border ${
                              budget.status === 'Signed-off'
                                ? 'bg-slate-100 border-slate-250 text-slate-500'
                                : budget.status === 'Approved'
                                ? 'bg-emerald-50 border-emerald-150 text-emerald-600'
                                : hasCorrection
                                ? 'bg-rose-50 border-rose-150 text-rose-600'
                                : 'bg-amber-50 border-amber-150 text-amber-600'
                            }`}>
                              {budget.status === 'Signed-off' && <Lock className="w-3.5 h-3.5" />}
                              {budget.status === 'Approved' && <CheckCircle className="w-3.5 h-3.5" />}
                              {hasCorrection && <AlertCircle className="w-3.5 h-3.5" />}
                              {budget.status === 'Pending' && <Clock className="w-3.5 h-3.5" />}
                              {budget.status}
                            </span>
                          </div>
                        </div>

                        {/* Detailed line items display */}
                        {budget.items && budget.items.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-slate-100">
                            <div className="overflow-x-auto">
                              <table className="w-full text-[11px] text-slate-600">
                                <thead>
                                  <tr className="border-b border-slate-150 text-slate-400 text-left">
                                    <th className="pb-1.5 font-bold uppercase tracking-wider font-mono text-[9px] w-2/3">Item Description</th>
                                    <th className="pb-1.5 font-bold uppercase tracking-wider font-mono text-[9px] text-right">Qty</th>
                                    <th className="pb-1.5 font-bold uppercase tracking-wider font-mono text-[9px] text-right">Unit Cost (UGX)</th>
                                    <th className="pb-1.5 font-bold uppercase tracking-wider font-mono text-[9px] text-right">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(budget.items || []).map((item, idx) => {
                                    if (!item) return null;
                                    return (
                                      <tr key={`bgt-item-pd-${budget.id}-${idx}`} className="border-b border-slate-100/50">
                                        <td className="py-2 font-medium text-slate-700">{item.name || 'Expense Item'}</td>
                                        <td className="py-2 text-right font-mono">{item.qty || 0}</td>
                                        <td className="py-2 text-right font-mono">UGX {(item.unitCost || 0).toLocaleString()}</td>
                                        <td className="py-2 text-right font-mono font-bold text-slate-800">
                                          UGX {((item.qty || 0) * (item.unitCost || 0)).toLocaleString()}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Active Correction reason displayed */}
                        {hasCorrection && budget.correctionNotes && (
                          <div className="mt-3.5 p-3.5 bg-rose-50 border border-rose-150 rounded-xl">
                            <p className="text-[10px] font-bold uppercase text-rose-700 font-mono flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                              Correction Request Instructions
                            </p>
                            <p className="text-xs text-rose-950 mt-1 italic font-medium">
                              "{budget.correctionNotes}"
                            </p>
                          </div>
                        )}

                        {/* Control actions */}
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
                            <button
                              type="button"
                              onClick={() => setViewingBudget(budget)}
                              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] py-1.5 px-3 rounded-lg border border-indigo-150 cursor-pointer flex items-center gap-1 shadow-3xs"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View Details
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            {budget.status === 'Pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveCorrectionId(budget.id);
                                    setCurrentCorrectionNotes('');
                                  }}
                                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-150 font-bold text-[11px] py-1.5 px-3.5 rounded-lg cursor-pointer flex items-center gap-1 transition-all"
                                >
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  Return for Correction
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleApproveBudget(budget.id)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] py-1.5 px-4 rounded-lg cursor-pointer flex items-center gap-1 shadow-3xs transition-all"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  Approve Budget
                                </button>
                              </>
                            )}

                            {/* Admin Overrides for PD approved/signed-off budgets */}
                            {isAdminMode && (budget.status === 'Approved' || budget.status === 'Signed-off') && (
                              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
                                <span className="text-[9px] font-bold text-slate-400 px-1 font-mono">Admin Override:</span>
                                <button
                                  type="button"
                                  onClick={() => handleStartEditBudget(budget)}
                                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] py-1 px-2 rounded-lg cursor-pointer flex items-center gap-1"
                                >
                                  <Unlock className="w-3 h-3" /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteBudget(budget.id)}
                                  className="bg-rose-650 hover:bg-rose-700 text-white font-bold text-[10px] py-1 px-2 rounded-lg cursor-pointer flex items-center gap-1"
                                >
                                  <Trash2 className="w-3 h-3" /> Delete
                                </button>
                              </div>
                            )}
                            
                            <button
                              type="button"
                              onClick={() => handleDeleteBudget(budget.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer"
                              title="Permanently remove budget record"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                      </div>
                    );
                  })}

                {budgets.filter(b => pdBudgetFilter === 'All' || b.status === pdBudgetFilter).length === 0 && (
                  <div className="text-center py-10 text-slate-400 italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    No budget proposals matching this status found.
                  </div>
                )}
              </div>
            </div>

            {/* Project Director Performance Appraisal & Target Review Panel */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs mt-6">
              <div className="pb-4 border-b border-slate-100 mb-6">
                <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Award className="w-5 h-5 text-indigo-600" />
                  📊 Staff Performance Targets & Appraisals Review Panel
                </h3>
                <p className="text-xs text-slate-400 mt-1 font-sans">
                  Review and evaluate Key Result Areas (KRAs) and planned targets submitted by CDO Staff. Authorize performance plans or request corrections.
                </p>
              </div>

              <div className="space-y-6">
                {performanceCycles.filter(c => c.status !== 'Draft').length === 0 ? (
                  <div className="text-center py-10 text-slate-400 italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <Award className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    No staff performance plans have been submitted for review yet.
                  </div>
                ) : (
                  performanceCycles.filter(c => c.status !== 'Draft').map((cycle) => {
                    const isSubmitted = cycle.status === 'Submitted';
                    return (
                      <div key={cycle.id} className="border border-slate-200 rounded-2xl p-5 bg-slate-50/20 hover:bg-slate-50/40 transition-all shadow-3xs space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-black text-slate-800">{cycle.staffName}</h4>
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wide bg-indigo-50 border border-indigo-150 text-indigo-800">
                                {cycle.staffRole}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5">Fiscal Year: {cycle.fiscalYear} • Submitted: {cycle.submittedAt}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => generatePerformancePDF(cycle)}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-150 font-bold text-[10px] px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-all"
                              title="Download Performance Plan PDF"
                            >
                              <Download className="w-3 h-3" /> PDF
                            </button>
                            <button
                              type="button"
                              onClick={() => generatePerformanceWord(cycle)}
                              className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-150 font-bold text-[10px] px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-all"
                              title="Download Performance Plan Word Doc"
                            >
                              <FileText className="w-3 h-3" /> Word
                            </button>
                            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wide ${
                              cycle.status === 'Approved' ? 'bg-emerald-600 text-white shadow-3xs' :
                              cycle.status === 'Returned for Correction' ? 'bg-rose-600 text-white shadow-3xs' :
                              'bg-amber-600 text-white shadow-3xs'
                            }`}>
                              {cycle.status}
                            </span>
                          </div>
                        </div>

                        {/* Targets Table */}
                        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-4xs">
                          <table className="w-full border-collapse text-left">
                            <thead>
                              <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-mono font-bold text-slate-400 uppercase">
                                <th className="p-3 w-1/6">Key Result Area (KRA)</th>
                                <th className="p-3 w-1/4">Planned Activities</th>
                                <th className="p-3 w-1/4">Measure of Success</th>
                                <th className="p-3 w-1/12">Target Date</th>
                                <th className="p-3 w-3/20">Self Assessment</th>
                                <th className="p-3 w-3/20">Supervisor Assessment (PD)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                              {cycle.targets.map((target, idx) => {
                                const isEditingSupervisor = editingSupervisorAssessmentId === target.id;
                                const isEditingProgressByPd = editingSelfAssessmentIdByPd === target.id;
                                return (
                                  <tr key={target.id} className="hover:bg-slate-50/30 transition-all">
                                    <td className="p-3 font-bold text-slate-900">{idx + 1}. {target.kra}</td>
                                    <td className="p-3 text-[11px] text-slate-500 leading-normal">{target.plannedActivities}</td>
                                    <td className="p-3 leading-normal">{target.measureOfSuccess}</td>
                                    <td className="p-3 font-mono text-[11px]">{target.targetDate}</td>
                                    <td className="p-3 bg-slate-50/20 leading-normal italic text-[11px] text-slate-600">
                                      <div className="space-y-1">
                                        <p className="text-slate-800 not-italic font-medium">{target.selfAssessment || 'No progress logged yet.'}</p>
                                        <span className="text-[10px] text-slate-400 block italic mt-1 font-sans">
                                          🔒 Read-only for PD. Managed by CDO Staff.
                                        </span>
                                      </div>
                                    </td>
                                    <td className="p-3 bg-indigo-50/5">
                                      {isEditingSupervisor ? (
                                        <div className="space-y-3 p-2 bg-indigo-50/50 rounded-xl border border-indigo-150">
                                          <div>
                                            <label className="text-[10px] font-bold font-mono uppercase text-indigo-950 block mb-1">
                                              🛡️ Supervisor Assessment Comments (PD)
                                            </label>
                                            <textarea
                                              value={tempSupervisorAssessmentValue}
                                              onChange={(e) => setTempSupervisorAssessmentValue(e.target.value)}
                                              className="w-full bg-white border border-slate-250 rounded-lg p-1.5 text-xs min-h-[55px] focus:ring-1 focus:ring-indigo-500"
                                              placeholder="Write supervisor evaluation comments..."
                                            />
                                          </div>
                                          <div className="flex gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() => handleSaveSupervisorAssessment(cycle.id, target.id)}
                                              className="bg-indigo-600 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg hover:bg-indigo-700 cursor-pointer shadow-3xs"
                                            >
                                              Save Assessment
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEditingSupervisorAssessmentId(null);
                                                setTempSupervisorAssessmentValue('');
                                                setTempSelfAssessmentValueByPd('');
                                              }}
                                              className="bg-slate-200 text-slate-700 text-[10px] font-bold py-1.5 px-3 rounded-lg hover:bg-slate-300 cursor-pointer"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="space-y-1.5">
                                          {target.supervisorAssessment ? (
                                            <p className="text-[11px] font-semibold text-indigo-950 leading-normal italic">
                                              {target.supervisorAssessment}
                                            </p>
                                          ) : (
                                            <p className="text-[10px] text-slate-400 italic font-medium">No supervisor assessment logged yet.</p>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingSupervisorAssessmentId(target.id);
                                              setTempSupervisorAssessmentValue(target.supervisorAssessment || '');
                                              setTempSelfAssessmentValueByPd(target.selfAssessment || '');
                                            }}
                                            className="text-indigo-600 hover:text-indigo-800 text-[10.5px] font-bold block hover:underline text-left mt-1 cursor-pointer font-sans"
                                          >
                                            {target.supervisorAssessment ? '✏️ Edit Supervisor Assessment' : '✍️ Write Supervisor Assessment'}
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* PD Decision Action Box */}
                        {isSubmitted ? (
                          <div className="bg-indigo-50/30 border border-indigo-100 rounded-xl p-4.5 space-y-4">
                            <h5 className="text-xs font-bold text-indigo-950 uppercase font-mono tracking-wider">
                              Supervisor Final Review & Sign-off
                            </h5>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="text-[10px] font-mono text-slate-400 uppercase block mb-1">
                                  Overall Supervisor Commentary
                                </label>
                                <textarea
                                  id={`pd-comment-${cycle.id}`}
                                  className="w-full bg-white border border-slate-250 rounded-xl p-2.5 text-xs min-h-[60px]"
                                  placeholder="Write overall reflection, feedback, or coaching comments..."
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-mono text-slate-400 uppercase block mb-1">
                                  Supervisor Electronic Signature
                                </label>
                                <input
                                  type="text"
                                  id={`pd-sign-${cycle.id}`}
                                  className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2 text-xs font-mono uppercase"
                                  placeholder="Type your official name e.g. HARRIET ANENA"
                                />
                              </div>
                            </div>

                            <div className="flex flex-col sm:flex-row justify-end items-center gap-2 pt-1.5 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => {
                                  const notes = prompt("Enter specific correction instructions for this staff member:");
                                  if (notes) {
                                    handlePdReturnPerformanceCycle(cycle.id, notes);
                                  }
                                }}
                                className="w-full sm:w-auto bg-rose-50 border border-rose-100 text-rose-700 hover:bg-rose-100 font-bold text-xs py-2 px-4 rounded-xl cursor-pointer shadow-3xs"
                              >
                                Return for Correction
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const ta = document.getElementById(`pd-comment-${cycle.id}`) as HTMLTextAreaElement;
                                  const sig = document.getElementById(`pd-sign-${cycle.id}`) as HTMLInputElement;
                                  if (!sig || !sig.value) {
                                    alert("Please sign your name before approving.");
                                    return;
                                  }
                                  handlePdApprovePerformanceCycle(cycle.id, ta?.value || '', sig.value);
                                }}
                                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-5 rounded-xl cursor-pointer shadow-3xs"
                              >
                                Sign & Approve Performance Plan
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4.5 space-y-3.5 text-xs">
                            <h5 className="font-bold text-slate-500 uppercase font-mono tracking-wider text-[10px]">
                              Approved Signatures & Commentary
                            </h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1 bg-white border border-slate-100 rounded-lg p-3">
                                <p className="text-[9px] font-mono font-bold text-slate-400 uppercase">Supervisor Commentary</p>
                                <p className="italic text-slate-800 font-medium">"{cycle.approvals.overallSupervisorComment || 'No commentary provided.'}"</p>
                              </div>
                              <div className="space-y-1 bg-white border border-slate-100 rounded-lg p-3">
                                <p className="text-[9px] font-mono font-bold text-slate-400 uppercase">Authorized Approvals</p>
                                <p className="font-mono text-slate-800">
                                  Supervisor: <span className="font-bold uppercase text-indigo-700">🛡️ {cycle.approvals.supervisorSignedName}</span>
                                </p>
                                <p className="font-mono text-[10px] text-slate-400 mt-1">Signed Date: {cycle.approvals.supervisorSignedDate}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Embedded Performance Plan Creation & Editing Console for Project Director */}
            {renderCdoPerformancePanel()}

            {/* Project Director Petty Cash Approvals Panel */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs mt-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-100 mb-6 gap-3">
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-amber-600" />
                    📋 Petty Cash Approvals & Disbursal Control
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">Review small-value operational fund requests, inspect AI justifications, and authorize electronic disbursements.</p>
                </div>
                
                {/* Status Filters */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['All', 'Pending', 'Approved', 'Returned for Correction', 'Rejected'] as const).map(f => (
                    <button
                      key={`pd-pettycash-filter-${f}`}
                      type="button"
                      onClick={() => setPdPettyCashFilter(f)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all border ${
                        pdPettyCashFilter === f
                          ? 'bg-amber-600 border-amber-600 text-white shadow-3xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Petty Cash Return for Correction modal/overlay inline if activePettyCashCorrectionId is selected */}
              {activePettyCashCorrectionId && (
                <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5 mb-6 animate-fade-in">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-purple-700 font-mono flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-purple-600" />
                    Specify Correction Requirements for Petty Cash Request: {activePettyCashCorrectionId}
                  </h4>
                  <form onSubmit={handleReturnPettyCashSubmit} className="mt-3 space-y-3">
                    <textarea
                      required
                      rows={3}
                      value={currentPettyCashCorrectionNotes}
                      onChange={(e) => setCurrentPettyCashCorrectionNotes(e.target.value)}
                      placeholder="Explain what needs to be corrected (e.g. 'Please provide a more detailed list of materials required, or source from our primary vendor for discount...')"
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-purple-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActivePettyCashCorrectionId(null);
                          setCurrentPettyCashCorrectionNotes('');
                        }}
                        className="bg-white border border-slate-250 text-slate-700 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer shadow-3xs flex items-center gap-1"
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        Confirm Return for Correction
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Petty Cash Requests Review Grid */}
              <div className="space-y-4">
                {pettyCashRequests
                  .filter(r => pdPettyCashFilter === 'All' || r.status === pdPettyCashFilter)
                  .map((request, rIdx) => {
                    const hasCorrection = request.status === 'Returned for Correction';
                    return (
                      <div key={`${request.id}-${rIdx}`} className="border border-slate-200 rounded-2xl p-5 bg-slate-50/30 hover:bg-slate-50/70 transition-all flex flex-col justify-between relative overflow-hidden">
                        
                        <div className={`absolute top-0 left-0 right-0 h-1 ${
                          request.status === 'Approved'
                            ? 'bg-emerald-500'
                            : request.status === 'Rejected'
                            ? 'bg-rose-500'
                            : hasCorrection
                            ? 'bg-purple-500'
                            : 'bg-amber-500'
                        }`} />

                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                          <div className="space-y-1.5 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[10px] font-black text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                                {request.id}
                              </span>
                              <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                                request.status === 'Approved'
                                  ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                  : request.status === 'Rejected'
                                  ? 'bg-rose-50 border-rose-100 text-rose-700'
                                  : hasCorrection
                                  ? 'bg-purple-50 border-purple-100 text-purple-700'
                                  : 'bg-amber-50 border-amber-100 text-amber-700 font-mono'
                              }`}>
                                {request.status}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">
                                Submitted By: <span className="text-indigo-600 font-extrabold">{request.submittedBy}</span>
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">
                                Intended Dates: <span className="text-slate-600 font-bold">{request.dates}</span>
                              </span>
                            </div>

                            <p className="text-xs font-bold text-slate-800">{request.purpose}</p>

                            {request.aiEnhancedExplanation && (
                              <div className="bg-white border border-amber-100 rounded-lg p-3 mt-2 space-y-1">
                                <p className="text-[9px] font-bold text-amber-800 uppercase font-mono tracking-wider flex items-center gap-1">
                                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                                  Formal justification
                                </p>
                                <p className="text-xs text-slate-600 italic">"{request.aiEnhancedExplanation}"</p>
                              </div>
                            )}

                            {request.correctionNotes && (
                              <div className="bg-rose-50 border border-rose-100 rounded-lg p-3 mt-2 text-rose-800 space-y-1">
                                <p className="text-[9px] font-bold text-rose-800 uppercase font-mono tracking-wider flex items-center gap-1">
                                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                                  Previous Correction Feedback
                                </p>
                                <p className="text-xs text-rose-600 font-medium">"{request.correctionNotes}"</p>
                              </div>
                            )}
                          </div>

                          <div className="md:text-right flex md:flex-col items-center md:items-end justify-between md:justify-start gap-3 shrink-0">
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider font-mono">Amount Requested</span>
                              <span className="font-mono text-sm font-black text-slate-800">UGX {request.amount.toLocaleString()}</span>
                            </div>

                            <div className="flex items-center gap-1.5 mt-2">
                              {request.status === 'Pending' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleApprovePettyCash(request.id)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] py-1.5 px-3 rounded-lg cursor-pointer transition-all flex items-center gap-1 shadow-3xs"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    Approve
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActivePettyCashCorrectionId(request.id);
                                      setCurrentPettyCashCorrectionNotes(request.correctionNotes || '');
                                    }}
                                    className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-[10px] py-1.5 px-3 rounded-lg cursor-pointer transition-all flex items-center gap-1 shadow-3xs"
                                  >
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    Return
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleRejectPettyCash(request.id)}
                                    className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] py-1.5 px-3 rounded-lg cursor-pointer transition-all flex items-center gap-1 shadow-3xs"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    Reject
                                  </button>
                                </>
                              )}

                              <button
                                type="button"
                                onClick={() => generatePettyCashPDF(request, false)}
                                className="bg-white hover:bg-slate-50 text-slate-600 p-1.5 rounded-lg border border-slate-200 cursor-pointer shadow-3xs flex items-center justify-center transition-all"
                                title="Download Official PDF"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                {pettyCashRequests.filter(r => pdPettyCashFilter === 'All' || r.status === pdPettyCashFilter).length === 0 && (
                  <div className="text-center py-10 text-slate-400 text-xs italic">
                    No petty cash requests registered under this filter category.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* OVERSEER DASHBOARD */}
        {activeRole === 'OVERSEER' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-purple-900 border border-purple-950 text-purple-50 rounded-2xl p-5 shadow-3xs md:col-span-2 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest font-mono text-purple-200">Governance & Overseer Mandate</h4>
                  <p className="text-sm font-extrabold text-white tracking-tight mt-1">Stewardship Transparency Index</p>
                  <p className="text-[11px] mt-2 leading-relaxed text-purple-100">
                    Responsible for reviewing administrative compliance metrics, checking Child Protection code of conduct updates, and inspecting the transparent audit trails generated in Lomuriangole registries.
                  </p>
                </div>
                <div className="pt-3 border-t border-purple-800 mt-4 flex items-center justify-between text-xs font-mono">
                  <span>Authorized Representative:</span>
                  <span className="font-bold text-amber-300">Governing Overseer</span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Governance Compliance</p>
                  <div className="flex items-baseline gap-2 mt-3">
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                      {Object.values(actualCompliance).filter(Boolean).length}/4
                    </h3>
                    <span className="text-xs text-slate-400">Rules met</span>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 mt-2 font-mono flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-lg p-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" /> Fully Compliant
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">System Audit Log Trail</p>
                  <div className="flex items-baseline gap-2 mt-3">
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">{auditTrailLogs.length}</h3>
                    <span className="text-xs text-slate-400">Total actions recorded</span>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 mt-2 font-mono flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-lg p-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" /> Active auditing
                </div>
              </div>
            </div>

            {/* Compliance Checklist and Audits */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Compliance checklist */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs">
                <div className="flex items-center gap-2 pb-4 border-b border-slate-100 mb-4">
                  <Award className="w-4 h-4 text-purple-500" />
                  <h3 className="text-sm font-bold uppercase text-slate-800 tracking-widest font-mono">
                    Center Compliance Register
                  </h3>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start justify-between bg-slate-50/50 border border-slate-100 rounded-xl p-3">
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs">Child Protection Policy Signed</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">Mandatory annual staff commitment sign-off.</p>
                    </div>
                    <button
                      onClick={() => handleToggleCompliance('childProtectionSigned')}
                      className={`text-xs font-bold py-1.5 px-3 rounded-lg border transition-all cursor-pointer ${
                        actualCompliance.childProtectionSigned
                          ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                          : 'bg-rose-50 border-rose-100 text-rose-600'
                      }`}
                    >
                      {actualCompliance.childProtectionSigned ? '✓ SIGNED' : '✗ PENDING'}
                    </button>
                  </div>

                  <div className="flex items-start justify-between bg-slate-50/50 border border-slate-100 rounded-xl p-3">
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs">Health Screen Compliance (90%+)</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">Participants must undergo annual immunization & checks.</p>
                    </div>
                    <button
                      onClick={() => handleToggleCompliance('healthComplianceMet')}
                      className={`text-xs font-bold py-1.5 px-3 rounded-lg border transition-all cursor-pointer ${
                        actualCompliance.healthComplianceMet
                          ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                          : 'bg-rose-50 border-rose-100 text-rose-600'
                      }`}
                    >
                      {actualCompliance.healthComplianceMet ? '✓ COMPLIANT' : '✗ PENDING'}
                    </button>
                  </div>

                  <div className="flex items-start justify-between bg-slate-50/50 border border-slate-100 rounded-xl p-3">
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs">Quarterly Audits & Books Reconciliation</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">Requires Church Elder / Overseer signature validation.</p>
                    </div>
                    <button
                      onClick={() => handleToggleCompliance('financialAuditingApproved')}
                      className={`text-xs font-bold py-1.5 px-3 rounded-lg border transition-all cursor-pointer ${
                        actualCompliance.financialAuditingApproved
                          ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                          : 'bg-rose-50 border-rose-100 text-rose-600'
                      }`}
                    >
                      {actualCompliance.financialAuditingApproved ? '✓ APPROVED' : '✗ PENDING'}
                    </button>
                  </div>

                  <div className="flex items-start justify-between bg-slate-50/50 border border-slate-100 rounded-xl p-3">
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs">Staff Professional Certifications</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">CDO specialists training files updated.</p>
                    </div>
                    <button
                      onClick={() => handleToggleCompliance('staffCertificationsUpdated')}
                      className={`text-xs font-bold py-1.5 px-3 rounded-lg border transition-all cursor-pointer ${
                        actualCompliance.staffCertificationsUpdated
                          ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                          : 'bg-rose-50 border-rose-100 text-rose-600'
                      }`}
                    >
                      {actualCompliance.staffCertificationsUpdated ? '✓ COMPLIANT' : '✗ PENDING'}
                    </button>
                  </div>
                </div>
              </div>

              {/* System audit log list */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs flex flex-col">
                <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
                  <ShieldCheck className="w-4 h-4 text-purple-500" />
                  <h3 className="text-sm font-bold uppercase text-slate-800 tracking-widest font-mono">
                    System Audit Trail Ledger
                  </h3>
                </div>

                <div className="flex-1 overflow-y-auto max-h-[400px] divide-y divide-slate-100 mt-3.5 pr-2">
                  {auditTrailLogs.map((log, idx) => (
                    <div key={`${log.id || 'log'}-${idx}`} className="py-2.5 flex items-start gap-3 text-xs">
                      <div className="bg-slate-100 rounded-lg p-1.5 shrink-0 text-slate-500 font-mono text-[9px] font-bold">
                        {log.category.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 leading-tight">{log.action}</p>
                        <p className="text-slate-500 text-[11px] mt-0.5">{log.details}</p>
                        <div className="flex items-center gap-2 mt-1 text-[9px] text-slate-400 font-mono">
                          <span>⏱ {log.timestamp}</span>
                          <span>•</span>
                          <span>👤 {log.operator || 'System Operator'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {auditTrailLogs.length === 0 && (
                    <p className="text-center py-10 text-slate-400 italic">No system events compiled in this session.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Governing Overseer Staff Performance Target Sign-off Panel */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs mt-6">
              <div className="pb-4 border-b border-slate-100 mb-6 text-left">
                <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Award className="w-5 h-5 text-purple-600" />
                  ⛪ Staff Performance Appraisals - Governing Reviewer Sign-off
                </h3>
                <p className="text-xs text-slate-400 mt-1 font-sans">
                  Inspect approved staff performance cycles and provide the governance endorsement sign-off.
                </p>
              </div>

              <div className="space-y-6">
                {performanceCycles.filter(c => c.status === 'Approved').length === 0 ? (
                  <div className="text-center py-10 text-slate-400 italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <Award className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    No approved staff performance cycles are awaiting governance review.
                  </div>
                ) : (
                  performanceCycles.filter(c => c.status === 'Approved').map((cycle) => {
                    const isReviewedByOverseer = !!cycle.approvals.reviewerSignedName;
                    return (
                      <div key={cycle.id} className="border border-slate-200 rounded-2xl p-5 bg-slate-50/20 hover:bg-slate-50/40 transition-all shadow-3xs space-y-5 text-left">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-black text-slate-800">{cycle.staffName}</h4>
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wide bg-purple-50 border border-purple-150 text-purple-800">
                                {cycle.staffRole}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5">Fiscal Year: {cycle.fiscalYear} • Signed by PD: {cycle.approvals.supervisorSignedDate}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => generatePerformancePDF(cycle)}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-150 font-bold text-[10px] px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-all"
                              title="Download Performance Plan PDF"
                            >
                              <Download className="w-3 h-3" /> PDF
                            </button>
                            <button
                              type="button"
                              onClick={() => generatePerformanceWord(cycle)}
                              className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-150 font-bold text-[10px] px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-all"
                              title="Download Performance Plan Word Doc"
                            >
                              <FileText className="w-3 h-3" /> Word
                            </button>
                            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wide ${
                              isReviewedByOverseer ? 'bg-purple-600 text-white shadow-3xs' : 'bg-amber-600 text-white shadow-3xs'
                            }`}>
                              {isReviewedByOverseer ? 'Review Endorsed' : 'Awaiting Reviewer Sign-off'}
                            </span>
                          </div>
                        </div>

                        {/* Summary of Performance Targets in a condensed layout */}
                        <div className="space-y-3.5 bg-white border border-slate-200 rounded-xl p-4 shadow-4xs text-xs">
                          <h5 className="font-bold text-slate-600 font-mono tracking-wider text-[10px] uppercase">
                            KRA & Progress Summary
                          </h5>
                          <div className="space-y-3 divide-y divide-slate-100">
                            {cycle.targets.map((target, idx) => (
                              <div key={target.id} className={`pt-2.5 ${idx === 0 ? 'pt-0' : ''} space-y-1`}>
                                <p className="font-bold text-slate-900">{idx + 1}. KRA: {target.kra}</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-3 text-[11px] mt-1 text-slate-600">
                                  <div>
                                    <span className="font-semibold text-slate-500">Staff Achievement:</span>
                                    <p className="italic mt-0.5">"{target.selfAssessment || 'No progress logged yet.'}"</p>
                                  </div>
                                  <div>
                                    <span className="font-semibold text-slate-500">PD Rating/Evaluation:</span>
                                    <p className="italic mt-0.5 text-indigo-950">"{target.supervisorAssessment || 'No evaluation logged.'}"</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Signatures & overall comment cards */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4.5 space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1 bg-white border border-slate-100 rounded-lg p-3 text-xs">
                              <p className="text-[9px] font-mono font-bold text-slate-400 uppercase">Supervisor Commentary</p>
                              <p className="italic text-slate-800 font-medium">"{cycle.approvals.overallSupervisorComment || 'No commentary provided.'}"</p>
                            </div>
                            <div className="space-y-1 bg-white border border-slate-100 rounded-lg p-3 text-xs">
                              <p className="text-[9px] font-mono font-bold text-slate-400 uppercase">Staff Agreement Comment</p>
                              <p className="italic text-slate-800 font-medium">"{cycle.approvals.overallSelfComment || 'No agreement commentary recorded.'}"</p>
                            </div>
                          </div>

                          {!isReviewedByOverseer ? (
                            <div className="bg-purple-50/40 border border-purple-100 rounded-xl p-4 space-y-4">
                              <h5 className="text-xs font-bold text-purple-950 uppercase font-mono tracking-wider">
                                Governing Endorsement Sign-off
                              </h5>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                <div>
                                  <label className="text-[10px] font-mono text-slate-400 uppercase block mb-1">
                                    Reviewer Comments
                                  </label>
                                  <textarea
                                    id={`overseer-comment-${cycle.id}`}
                                    className="w-full bg-white border border-slate-250 rounded-xl p-2.5 text-xs min-h-[60px]"
                                    placeholder="Write governing body comments, notes, or sign-off recommendations..."
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-mono text-slate-400 uppercase block mb-1">
                                    Reviewer Electronic Signature
                                  </label>
                                  <input
                                    type="text"
                                    id={`overseer-sign-${cycle.id}`}
                                    className="w-full bg-white border border-slate-250 rounded-xl px-3 py-2 text-xs font-mono uppercase"
                                    placeholder="Type official sign-off name e.g. BISHOP LOMONG"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end pt-2 border-t border-slate-100">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const ta = document.getElementById(`overseer-comment-${cycle.id}`) as HTMLTextAreaElement;
                                    const sig = document.getElementById(`overseer-sign-${cycle.id}`) as HTMLInputElement;
                                    if (!sig || !sig.value) {
                                      alert("Please sign your name before endorsing.");
                                      return;
                                    }
                                    handleOverseerSignOffPerformanceCycle(cycle.id, ta?.value || '', sig.value);
                                  }}
                                  className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs py-2 px-5 rounded-xl cursor-pointer shadow-3xs"
                                >
                                  Endorse & Sign Performance Cycle
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-white border border-slate-200 rounded-xl p-3.5 text-xs">
                              <p className="text-[9px] font-mono font-bold text-purple-500 uppercase">Reviewer Comments</p>
                              <p className="italic text-slate-800 leading-normal mt-1">"{cycle.approvals.reviewerComment}"</p>
                              <div className="pt-3 border-t border-slate-100 mt-2.5 flex justify-between items-center text-[10px] font-mono">
                                <span className="text-slate-400">Governance Signature:</span>
                                <span className="font-bold text-purple-700 uppercase">⛪ {cycle.approvals.reviewerSignedName}</span>
                                <span className="text-slate-400">Date: {cycle.approvals.reviewerSignedDate}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Embedded Performance Plan Creation & Editing Console for Overseer */}
            <div className="mt-8 pt-6 border-t border-slate-150">
              {renderCdoPerformancePanel()}
            </div>
          </div>
        )}

        {/* OFFICIAL ARCHIVAL JOURNALS */}
        {activeRole === 'OFFICIAL JOURNALS' && (
          <div className="space-y-6 animate-fade-in text-left">
            {/* Archival Journals Header Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-lg border border-slate-800">
              <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -ml-20 -mb-20"></div>
              
              <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 z-10">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 bg-teal-500/20 text-teal-300 font-mono text-[10px] uppercase font-black px-3 py-1 rounded-full border border-teal-500/30">
                    <BookOpen className="w-3.5 h-3.5 text-teal-400" /> Center Official Archives
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight font-sans">
                    Official Archival Journals
                  </h2>
                  <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
                    Access permanent ledger records for all signed-off budgets, authorized workplans, and historically completed tasks for audit compliance.
                  </p>
                </div>
              </div>
            </div>

            {/* Custom Archival Subtabs */}
            <div className="flex flex-wrap border-b border-slate-200 gap-1 pb-px">
              <button
                type="button"
                onClick={() => setSelectedJournalSubtab('monthly_snapshots')}
                className={`px-5 py-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
                  selectedJournalSubtab === 'monthly_snapshots'
                    ? 'border-indigo-600 text-indigo-600 font-black'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                📂 Monthly Snapshots Journals ({monthlyJournals?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setSelectedJournalSubtab('annual_targets')}
                className={`px-5 py-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
                  selectedJournalSubtab === 'annual_targets'
                    ? 'border-indigo-600 text-indigo-600 font-black'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                🎯 Custom Annual FY Targets ({annualTargetsJournals?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setSelectedJournalSubtab('monthly_performance')}
                className={`px-5 py-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
                  selectedJournalSubtab === 'monthly_performance'
                    ? 'border-indigo-600 text-indigo-600 font-black'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                📈 Monthly Performance Targets ({monthlyPerformanceTargets?.length || 0} Active, {closedMonthlyPerformanceJournals?.length || 0} Closed)
              </button>
            </div>

            {/* --- SUBTAB 1: MONTHLY SNAPSHOTS --- */}
            {selectedJournalSubtab === 'monthly_snapshots' && (
              <div className="space-y-6">
                {/* Close Active Month Panel (Project Director Only) */}
                {userRole === 'PROJECT DIRECTOR' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                        <Lock className="w-4 h-4 text-amber-600" /> Monthly Closing Operations Console
                      </h4>
                      <p className="text-xs text-amber-700 leading-relaxed max-w-2xl">
                        As the Project Director, you have official authority to freeze and sign off the current month's active budgets, approved workplans, and petty cash requests. This creates an unmodifiable permanent snapshot in archives and wipes active desks to let staff initiate the subsequent month's workflows.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsClosingMonthModal(true)}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-2.5 px-5 rounded-xl cursor-pointer shadow-sm shrink-0 flex items-center gap-2"
                    >
                      <Lock className="w-3.5 h-3.5" /> Close & Archive Active Month...
                    </button>
                  </div>
                )}

                {/* Close Month Modal */}
                {isClosingMonthModal && (
                  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <form onSubmit={handleCloseMonth} className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-150 animate-fade-in text-left">
                      <div className="p-6 bg-slate-900 text-white">
                        <h3 className="text-base font-black tracking-tight flex items-center gap-2">
                          <Lock className="w-5 h-5 text-amber-400" /> Archive & Close Current Month
                        </h3>
                        <p className="text-slate-400 text-[10px] mt-1">Permanently freezes current data and starts a subsequent month</p>
                      </div>
                      <div className="p-6 space-y-4 text-xs font-medium text-slate-700">
                        <div className="space-y-1.5 text-left">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Specify Month & Year to Archive</label>
                          <input
                            type="text"
                            value={monthToClose}
                            onChange={(e) => setMonthToClose(e.target.value)}
                            placeholder="e.g. June 2026"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
                            required
                          />
                          <p className="text-[9px] text-slate-400 leading-tight">Specify the month descriptor (e.g. June 2026, July 2026). All current budgets, workplans/tasks, and petty cash will be compiled under this tag.</p>
                        </div>
                        <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-[10px] text-rose-700 leading-relaxed text-left">
                          ⚠️ <strong>CRITICAL WARNING:</strong> This action cannot be undone. Active items will be moved to read-only archives, and the live workspace will be cleared.
                        </div>
                      </div>
                      <div className="p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setIsClosingMonthModal(false)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2 px-4 rounded-xl cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2 px-5 rounded-xl cursor-pointer shadow-3xs"
                        >
                          Proceed with Closing
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* List of Permanent Closed Monthly Snapshots */}
                <div className="space-y-4 text-left">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">📂 Collapsible Monthly Snapshots Archives</h3>
                  {monthlyJournals?.map((journal, idx) => {
                    const isExpanded = expandedMonthlyJournalId === journal.id;
                    const budgetsCount = journal.budgets?.length || 0;
                    const tasksCount = journal.staffTasks?.length || 0;
                    const pettyCashCount = journal.pettyCashRequests?.length || 0;

                    return (
                      <div key={`m-journal-${journal.id || idx}-${idx}`} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-3xs transition-all">
                        {/* Header Trigger */}
                        <button
                          type="button"
                          onClick={() => setExpandedMonthlyJournalId(isExpanded ? null : journal.id)}
                          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-all cursor-pointer text-left"
                        >
                          <div className="space-y-1 text-left">
                            <div className="flex items-center gap-2">
                              <span className="font-sans font-black text-slate-900 text-base">{journal.monthName}</span>
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                                <Lock className="w-2.5 h-2.5" /> Permanent Archive
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 font-mono">
                              <span>📅 Closed: {new Date(journal.closedAt).toLocaleDateString()}</span>
                              <span>•</span>
                              <span>👤 Operator: {journal.closedBy}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4 shrink-0">
                            <div className="flex gap-2 text-[10px] font-bold">
                              <span className="bg-rose-50 text-rose-700 border border-rose-100 px-2 py-0.5 rounded-lg">🪙 Budgets ({budgetsCount})</span>
                              <span className="bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-lg">📋 Tasks ({tasksCount})</span>
                              <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-lg">💸 Petty Cash ({pettyCashCount})</span>
                            </div>
                            {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                          </div>
                        </button>

                        {/* Collapsible Content */}
                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50/50 p-6 space-y-6">
                            {/* Inner Budgets Section */}
                            <div className="space-y-2">
                              <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono text-left">🪙 Closed Budgets Journal</h5>
                              {budgetsCount === 0 ? (
                                <p className="text-slate-400 text-xs italic bg-white p-3 border border-slate-200 rounded-xl">No budgets archived for this period.</p>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
                                  {journal.budgets.map((b: any, idx: number) => (
                                    <div key={idx} className="bg-white p-4 border border-slate-200 rounded-xl shadow-4xs space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-bold font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{b.id}</span>
                                        <span className="text-[10px] font-bold text-indigo-700">{b.category}</span>
                                      </div>
                                      <h6 className="font-bold text-slate-800 text-xs">{b.title}</h6>
                                      <p className="text-[11px] text-slate-500 line-clamp-2">{b.description}</p>
                                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono">
                                        <span className="text-slate-400 font-sans">Total Approved:</span>
                                        <span className="font-black text-slate-900">UGX {b.amount.toLocaleString()}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Inner Tasks Section */}
                            <div className="space-y-2">
                              <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono text-left">📋 Closed Tasks & Workplans Journal</h5>
                              {tasksCount === 0 ? (
                                <p className="text-slate-400 text-xs italic bg-white p-3 border border-slate-200 rounded-xl">No tasks/workplans archived for this period.</p>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
                                  {journal.staffTasks.map((t: any, idx: number) => (
                                    <div key={idx} className="bg-white p-4 border border-slate-200 rounded-xl shadow-4xs space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-bold font-mono bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{t.id}</span>
                                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50/50 px-2 py-0.5 rounded">{t.assignedRole}</span>
                                      </div>
                                      <h6 className="font-bold text-slate-800 text-xs">{t.title}</h6>
                                      <p className="text-[11px] text-slate-500 line-clamp-2">{t.description}</p>
                                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                                        <span className="text-slate-400 font-mono">Due: {t.dueDate}</span>
                                        <span className="text-emerald-700 font-bold uppercase text-[10px]">{t.status || 'completed'}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Inner Petty Cash Section */}
                            <div className="space-y-2">
                              <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono text-left">💸 Closed Petty Cash Requests Journal</h5>
                              {pettyCashCount === 0 ? (
                                <p className="text-slate-400 text-xs italic bg-white p-3 border border-slate-200 rounded-xl">No petty cash requests archived for this period.</p>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
                                  {journal.pettyCashRequests.map((p: any, idx: number) => (
                                    <div key={idx} className="bg-white p-4 border border-slate-200 rounded-xl shadow-4xs space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-bold font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{p.id}</span>
                                        <span className="text-[10px] font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded">{p.department}</span>
                                      </div>
                                      <h6 className="font-bold text-slate-800 text-xs">{p.title}</h6>
                                      <p className="text-[11px] text-slate-500 line-clamp-1">{p.purpose}</p>
                                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono">
                                        <span className="text-slate-400">Amount requested:</span>
                                        <span className="font-black text-slate-900">UGX {p.amount.toLocaleString()}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {(!monthlyJournals || monthlyJournals.length === 0) && (
                    <div className="text-center py-12 bg-white border border-slate-200 rounded-2xl">
                      <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-slate-500 text-sm font-bold">No Monthly Snapshots Closed Yet</p>
                      <p className="text-slate-400 text-xs mt-1">When the Project Director closes an active month, snapshots of active sheets appear here.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* --- SUBTAB 2: ANNUAL TARGETS --- */}
            {selectedJournalSubtab === 'annual_targets' && (
              <div className="space-y-6">
                {/* Independent FY Target Builder */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-0.5 text-left">
                      <h3 className="text-base font-black text-slate-900">Annual Fiscal Year Targets Registry</h3>
                      <p className="text-xs text-slate-500">Manage independent long-term organizational targets per Financial Year (FY) and write active progress notes.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddingAnnualTarget(!isAddingAnnualTarget)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-4 rounded-xl cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                      <Plus className="w-4 h-4" /> {isAddingAnnualTarget ? "Collapse Registry Form" : "Initiate Independent FY Target"}
                    </button>
                  </div>

                  {/* Add Annual Target Form */}
                  {isAddingAnnualTarget && (
                    <form onSubmit={handleAddAnnualTarget} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 animate-fade-in text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
                        <div className="space-y-1.5">
                          <label className="font-bold text-slate-400 uppercase tracking-wider font-mono text-[9px]">Custom Financial Year (FY)</label>
                          <input
                            type="text"
                            value={customFiscalYear}
                            onChange={(e) => setCustomFiscalYear(e.target.value)}
                            placeholder="e.g. FY 2026/2027"
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="font-bold text-slate-400 uppercase tracking-wider font-mono text-[9px]">Target Staff Name</label>
                          <input
                            type="text"
                            value={targetStaffName}
                            onChange={(e) => setTargetStaffName(e.target.value)}
                            placeholder="e.g. Dr. John Okori"
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="font-bold text-slate-400 uppercase tracking-wider font-mono text-[9px]">Staff Department Role</label>
                          <select
                            value={journalStaffRole}
                            onChange={(e) => setJournalStaffRole(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="CDO HEALTH">Health Department (CDO HEALTH)</option>
                            <option value="CDO SDR">Sponsor Relations (CDO SDR)</option>
                            <option value="CDO HBP">Home-Based Department (CDO HBP)</option>
                            <option value="PROJECT DIRECTOR">Project Director (PD)</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                        <div className="space-y-1.5">
                          <label className="font-bold text-slate-400 uppercase tracking-wider font-mono text-[9px]">Key Result Area (KRA)</label>
                          <input
                            type="text"
                            value={newTargetKra}
                            onChange={(e) => setNewTargetKra(e.target.value)}
                            placeholder="e.g. Health Interventions & Medical Compliance"
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="font-bold text-slate-400 uppercase tracking-wider font-mono text-[9px]">Planned Activities / Targets Description</label>
                          <input
                            type="text"
                            value={newTargetActivities}
                            onChange={(e) => setNewTargetActivities(e.target.value)}
                            placeholder="e.g. Organize 4 quarterly health monitoring campaigns across cydc beneficiaries"
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                        <div className="space-y-1.5">
                          <label className="font-bold text-slate-400 uppercase tracking-wider font-mono text-[9px]">Measure of Success</label>
                          <input
                            type="text"
                            value={newTargetSuccess}
                            onChange={(e) => setNewTargetSuccess(e.target.value)}
                            placeholder="e.g. 100% of child health reports filed by deadline"
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="font-bold text-slate-400 uppercase tracking-wider font-mono text-[9px]">Target Date</label>
                          <input
                            type="date"
                            value={newTargetDate}
                            onChange={(e) => setNewTargetDate(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="submit"
                          className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-2 rounded-xl cursor-pointer shadow-3xs"
                        >
                          Register FY Target in Journal
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Progress Note Form Overlay */}
                {activeNoteTargetId && (
                  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <form onSubmit={handleAddProgressNote} className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-150 animate-fade-in text-left text-xs text-slate-700 font-medium">
                      <div className="p-6 bg-indigo-950 text-white">
                        <h3 className="text-base font-black tracking-tight flex items-center gap-2">
                          <Edit3 className="w-5 h-5 text-indigo-400" /> Enter Target Progress Note
                        </h3>
                        <p className="text-slate-400 text-[10px] mt-1">Write notes regarding milestones and implementation progress throughout the cycle</p>
                      </div>
                      <div className="p-6 space-y-4">
                        <div className="space-y-1.5 text-left">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Progress Note Text</label>
                          <textarea
                            value={newProgressNoteText}
                            onChange={(e) => setNewProgressNoteText(e.target.value)}
                            placeholder="Write down any updates, percentages achieved, obstacles met, or milestones accomplished..."
                            rows={4}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white font-medium text-slate-800 animate-fade-in"
                            required
                          />
                        </div>
                      </div>
                      <div className="p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveNoteTargetId(null);
                            setNewProgressNoteText('');
                          }}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2 px-4 rounded-xl cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-5 rounded-xl cursor-pointer shadow-3xs"
                        >
                          Save Note
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Collapsible List of Annual Target Journals */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono text-left">🎯 Collapsible Annual Targets Journals</h3>
                  {annualTargetsJournals?.map((journal, idx) => {
                    const isExpanded = expandedAnnualJournalId === journal.id;
                    return (
                      <div key={`a-journal-${journal.id || idx}-${idx}`} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-3xs transition-all text-xs">
                        {/* Header trigger */}
                        <button
                          type="button"
                          onClick={() => setExpandedAnnualJournalId(isExpanded ? null : journal.id)}
                          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-all cursor-pointer text-left"
                        >
                          <div className="space-y-1 text-left">
                            <div className="flex items-center gap-2">
                              <span className="font-sans font-black text-slate-900 text-base">{journal.fiscalYear}</span>
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                                {journal.staffRole}
                              </span>
                            </div>
                            <p className="text-slate-500 text-xs">Assigned Officer: <strong className="text-slate-800">{journal.staffName}</strong></p>
                          </div>
                          
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-bold font-mono text-[10px]">
                              {journal.targets?.length || 0} FY Targets
                            </span>
                            {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                          </div>
                        </button>

                        {/* Collapsible Targets List */}
                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50/50 p-6 space-y-4">
                            {journal.targets?.map((target: any, tIdx: number) => (
                              <div key={target.id || tIdx} className="bg-white border border-slate-200 rounded-xl p-5 shadow-4xs space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-3">
                                  <div className="space-y-1 text-left">
                                    <span className="text-[9px] font-bold font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                                      KRA {tIdx + 1}
                                    </span>
                                    <h4 className="font-black text-slate-950 text-sm">{target.kra}</h4>
                                  </div>
                                  <div className="text-left sm:text-right text-[10px] font-mono text-slate-400">
                                    <span>📅 Target Date: {target.targetDate}</span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                                  <div>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Planned Activities</p>
                                    <p className="text-slate-700 font-medium leading-relaxed mt-1 text-xs">{target.plannedActivities}</p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Measure of Success</p>
                                    <p className="text-slate-700 font-medium leading-relaxed mt-1 text-xs">{target.measureOfSuccess || "Not specified"}</p>
                                  </div>
                                </div>

                                {/* Progress Notes History inside Target */}
                                <div className="pt-3 border-t border-slate-100 space-y-2 text-left">
                                  <div className="flex items-center justify-between">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">📝 Progress Log Notes</p>
                                    <button
                                      type="button"
                                      onClick={() => setActiveNoteTargetId({ journalId: journal.id, targetId: target.id, type: 'annual' })}
                                      className="text-indigo-600 hover:text-indigo-800 font-black text-[10px] cursor-pointer flex items-center gap-1"
                                    >
                                      <Plus className="w-3.5 h-3.5" /> Append Progress Note
                                    </button>
                                  </div>

                                  <div className="space-y-2">
                                    {target.progressNotes?.map((n: any, nIdx: number) => (
                                      <div key={n.id || nIdx} className="bg-slate-50 p-3 rounded-lg border border-slate-150 relative text-left">
                                        <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono mb-1">
                                          <span>✍️ {n.author}</span>
                                          <span>📅 {n.date}</span>
                                        </div>
                                        <p className="text-slate-700 leading-relaxed font-medium">{n.note}</p>
                                      </div>
                                    ))}
                                    {(!target.progressNotes || target.progressNotes.length === 0) && (
                                      <p className="text-slate-400 text-xs italic">No progress notes entered yet. Click "Append Progress Note" to log updates throughout the period.</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {(!annualTargetsJournals || annualTargetsJournals.length === 0) && (
                    <div className="text-center py-12 bg-white border border-slate-200 rounded-2xl text-xs">
                      <Award className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-slate-500 font-bold">No Annual Target Journals Registered</p>
                      <p className="text-slate-400 mt-1">Initiate a custom Financial Year ledger above to register annual independent targets.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* --- SUBTAB 3: MONTHLY PERFORMANCE --- */}
            {selectedJournalSubtab === 'monthly_performance' && (
              <div className="space-y-6">
                {/* Active Monthly Targets Board */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-0.5 text-left">
                      <h3 className="text-base font-black text-slate-900">Active Monthly Performance Targets</h3>
                      <p className="text-xs text-slate-500">Add targets for the active month and close them permanently into snapshot journals when progress notes have been filed.</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setIsAddingMonthlyTarget(!isAddingMonthlyTarget)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-4 rounded-xl cursor-pointer flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" /> {isAddingMonthlyTarget ? "Hide Target Form" : "Initiate Active Monthly Target"}
                      </button>
                      {(monthlyPerformanceTargets?.length || 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => handleCloseMonthlyPerformanceTargets(targetMonthName)}
                          className="bg-slate-950 hover:bg-slate-800 text-white font-bold text-xs py-2 px-4 rounded-xl cursor-pointer flex items-center gap-1.5 shadow-3xs"
                        >
                          <Lock className="w-3.5 h-3.5 text-amber-400" /> Close & Archive {targetMonthName} Targets
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Add Monthly Target Form */}
                  {isAddingMonthlyTarget && (
                    <form onSubmit={handleAddMonthlyTarget} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 animate-fade-in text-xs text-left">
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div className="space-y-1.5 text-left">
                          <label className="font-bold text-slate-400 uppercase tracking-wider font-mono text-[9px]">Target Month Descriptor</label>
                          <input
                            type="text"
                            value={targetMonthName}
                            onChange={(e) => setMonthToClose(e.target.value)}
                            placeholder="e.g. June 2026"
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            required
                          />
                        </div>
                        <div className="space-y-1.5 text-left">
                          <label className="font-bold text-slate-400 uppercase tracking-wider font-mono text-[9px]">Target Staff Name</label>
                          <input
                            type="text"
                            value={targetStaffName}
                            onChange={(e) => setTargetStaffName(e.target.value)}
                            placeholder="e.g. Dr. John Okori"
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                        <div className="space-y-1.5 text-left">
                          <label className="font-bold text-slate-400 uppercase tracking-wider font-mono text-[9px]">Staff Department Role</label>
                          <select
                            value={journalStaffRole}
                            onChange={(e) => setJournalStaffRole(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="CDO HEALTH">Health Department (CDO HEALTH)</option>
                            <option value="CDO SDR">Sponsor Relations (CDO SDR)</option>
                            <option value="CDO HBP">Home-Based Department (CDO HBP)</option>
                            <option value="PROJECT DIRECTOR">Project Director (PD)</option>
                          </select>
                        </div>
                        <div className="space-y-1.5 text-left">
                          <label className="font-bold text-slate-400 uppercase tracking-wider font-mono text-[9px]">Target Date</label>
                          <input
                            type="date"
                            value={journalTargetDate}
                            onChange={(e) => setJournalTargetDate(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                        <div className="space-y-1.5 text-left">
                          <label className="font-bold text-slate-400 uppercase tracking-wider font-mono text-[9px]">Key Result Area (KRA)</label>
                          <input
                            type="text"
                            value={newTargetKra}
                            onChange={(e) => setNewTargetKra(e.target.value)}
                            placeholder="e.g. Medical treatment camp logistics"
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            required
                          />
                        </div>
                        <div className="space-y-1.5 text-left">
                          <label className="font-bold text-slate-400 uppercase tracking-wider font-mono text-[9px]">Planned Activities</label>
                          <input
                            type="text"
                            value={newTargetActivities}
                            onChange={(e) => setNewTargetActivities(e.target.value)}
                            placeholder="e.g. Dispense medications and perform checkups for 50 child beneficiaries"
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5 text-left">
                        <label className="font-bold text-slate-400 uppercase tracking-wider font-mono text-[9px]">Measure of Success</label>
                        <input
                          type="text"
                          value={newTargetSuccess}
                          onChange={(e) => setNewTargetSuccess(e.target.value)}
                          placeholder="e.g. 100% of attending children recorded with medical profile cards"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-2 rounded-xl cursor-pointer shadow-3xs"
                        >
                          Initiate Active Monthly Target
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Active Monthly Targets List */}
                  <div className="space-y-4">
                    {monthlyPerformanceTargets?.map((target, idx) => (
                      <div key={target.id || idx} className="border border-slate-200 rounded-2xl p-5 bg-slate-50/20 text-xs space-y-4 shadow-4xs text-left">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-3">
                          <div className="space-y-1 text-left">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[9px] font-bold font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                                Active Monthly Target (Month: {monthToClose || 'Current Month'})
                              </span>
                              <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold px-2 py-0.5 rounded-full">
                                {target.staffRole}
                              </span>
                            </div>
                            <h4 className="font-black text-slate-950 text-sm">{target.kra}</h4>
                          </div>
                          <div className="font-mono text-slate-400 text-[10px] text-left">
                            <span>👤 Owner: {target.staffName}</span>
                            <span className="mx-2">•</span>
                            <span>📅 Date: {target.targetDate}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Planned Activities</p>
                            <p className="text-slate-700 font-medium leading-relaxed mt-1">{target.plannedActivities}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Measure of Success</p>
                            <p className="text-slate-700 font-medium leading-relaxed mt-1">{target.measureOfSuccess || "Not specified"}</p>
                          </div>
                        </div>

                        {/* Progress Notes inside Active Target */}
                        <div className="pt-3 border-t border-slate-100 space-y-2 text-left">
                          <div className="flex items-center justify-between">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">📝 Progress Log Notes</p>
                            <button
                              type="button"
                              onClick={() => setActiveNoteTargetId({ targetId: target.id, type: 'monthly' })}
                              className="text-indigo-600 hover:text-indigo-800 font-black text-[10px] cursor-pointer flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" /> Append Progress Note
                            </button>
                          </div>

                          <div className="space-y-2">
                            {target.progressNotes?.map((n: any, nIdx: number) => (
                              <div key={n.id || nIdx} className="bg-white p-3 rounded-lg border border-slate-150 relative shadow-4xs text-left">
                                <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono mb-1">
                                  <span>✍️ {n.author}</span>
                                  <span>📅 {n.date}</span>
                                </div>
                                <p className="text-slate-700 leading-relaxed font-medium">{n.note}</p>
                              </div>
                            ))}
                            {(!target.progressNotes || target.progressNotes.length === 0) && (
                              <p className="text-slate-400 text-xs italic">No progress notes logged yet. Please enter progress updates before closing this month's targets.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {(!monthlyPerformanceTargets || monthlyPerformanceTargets.length === 0) && (
                      <p className="text-slate-400 italic text-center py-6 bg-slate-50 border border-slate-150 border-dashed rounded-xl">No active monthly targets registered. Click "Initiate Active Monthly Target" to start ledger.</p>
                    )}
                  </div>
                </div>

                {/* Collapsible Closed Monthly performance Targets Journals */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono text-left">📂 Archived Monthly Targets Journals</h3>
                  {closedMonthlyPerformanceJournals?.map((journal, idx) => {
                    const isExpanded = expandedClosedPerformanceId === journal.id;
                    return (
                      <div key={`c-journal-${journal.id || idx}-${idx}`} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-3xs transition-all text-xs">
                        {/* Header Trigger */}
                        <button
                          type="button"
                          onClick={() => setExpandedClosedPerformanceId(isExpanded ? null : journal.id)}
                          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-all cursor-pointer text-left"
                        >
                          <div className="space-y-1 font-medium text-left">
                            <div className="flex items-center gap-2">
                              <span className="font-sans font-black text-slate-900 text-base">Targets Archive: {journal.monthName}</span>
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                                <Lock className="w-2.5 h-2.5" /> Frozen Journal
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono">
                              <span>📅 Closed Date: {new Date(journal.closedAt).toLocaleDateString()}</span>
                              <span>•</span>
                              <span>👤 Closed By: {journal.closedBy}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-bold font-mono text-[10px]">
                              {journal.targets?.length || 0} Targets Closed
                            </span>
                            {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                          </div>
                        </button>

                        {/* Collapsible Content */}
                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50/50 p-6 space-y-4">
                            {journal.targets?.map((target: any, tIdx: number) => (
                              <div key={target.id || tIdx} className="bg-white border border-slate-200 rounded-xl p-5 shadow-4xs space-y-3 text-left">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                                    {target.staffRole}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">👤 Owner: {target.staffName}</span>
                                </div>
                                <h4 className="font-black text-slate-900 text-xs">{target.kra}</h4>
                                <div className="grid grid-cols-2 gap-4 text-[11px] text-slate-600 font-medium text-left">
                                  <div>
                                    <strong className="text-slate-400 text-[9px] uppercase font-mono block mb-0.5">Planned Activities:</strong>
                                    {target.plannedActivities}
                                  </div>
                                  <div>
                                    <strong className="text-slate-400 text-[9px] uppercase font-mono block mb-0.5">Measure of Success:</strong>
                                    {target.measureOfSuccess || "Not specified"}
                                  </div>
                                </div>

                                <div className="pt-2 border-t border-slate-100 space-y-2 text-left">
                                  <strong className="text-slate-400 text-[9px] uppercase font-mono block">📝 Signed Progress Notes:</strong>
                                  <div className="space-y-1.5 text-left">
                                    {target.progressNotes?.map((n: any, nIdx: number) => (
                                      <div key={nIdx} className="bg-slate-50 p-2.5 rounded-lg border border-slate-150 text-[11px] text-left">
                                        <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono mb-0.5">
                                          <span>✍️ {n.author}</span>
                                          <span>📅 {n.date}</span>
                                        </div>
                                        <p className="text-slate-700 font-medium leading-relaxed">{n.note}</p>
                                      </div>
                                    ))}
                                    {(!target.progressNotes || target.progressNotes.length === 0) && (
                                      <p className="text-slate-400 text-xs italic">No progress notes were filed during closing.</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {(!closedMonthlyPerformanceJournals || closedMonthlyPerformanceJournals.length === 0) && (
                    <div className="text-center py-12 bg-white border border-slate-200 rounded-2xl text-xs">
                      <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-slate-500 font-bold">No Monthly Targets Snapshots Archived Yet</p>
                      <p className="text-slate-400 mt-1">Archived journals will be listed here after you click the "Close & Archive Targets" button.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* View Budget Detail Modal */}
        {viewingBudget && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] animate-fade-in text-left">
              {/* Header */}
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <span className="text-[10px] bg-indigo-500 text-white font-bold font-mono px-2 py-0.5 rounded mr-2">
                    {viewingBudget.id}
                  </span>
                  <span className="text-[10px] bg-slate-800 text-slate-300 font-bold uppercase px-2 py-0.5 rounded">
                    {viewingBudget.category}
                  </span>
                  <h3 className="text-base font-black tracking-tight mt-1">{viewingBudget.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingBudget(null)}
                  className="text-slate-400 hover:text-white cursor-pointer transition-all p-1"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Content body */}
              <div className="p-6 overflow-y-auto space-y-5 flex-1 text-slate-800 text-xs">
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-mono">Description</h4>
                  <p className="text-slate-600 leading-relaxed font-medium bg-slate-50 p-3 rounded-xl border border-slate-100">
                    {viewingBudget.description || "No description provided."}
                  </p>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 font-mono">Submission Details</h4>
                  <div className="grid grid-cols-2 gap-4 bg-slate-50/50 p-3.5 rounded-xl border border-slate-150 font-medium">
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase">Submitted By</p>
                      <p className="text-slate-700 font-bold mt-0.5">{viewingBudget.submittedBy}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase">Date Logged</p>
                      <p className="text-slate-700 font-mono mt-0.5">{viewingBudget.submittedAt}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase">Current Status</p>
                      <span className="inline-flex items-center gap-1 font-bold uppercase text-[9px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded mt-0.5">
                        {viewingBudget.status}
                      </span>
                    </div>
                    {viewingBudget.signedOffMonth && (
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase">Signed Off Month</p>
                        <p className="text-emerald-700 font-bold mt-0.5">{formatMonthLabel(viewingBudget.signedOffMonth)}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 font-mono">Line Items Breakdown</h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-slate-600">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[9px] uppercase font-bold">
                          <th className="p-3">Item Name</th>
                          <th className="p-3 text-right">Qty</th>
                          <th className="p-3 text-right">Unit Cost</th>
                          <th className="p-3 text-right">Total (UGX)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {(viewingBudget.items || []).map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-3">{item.name || "Expense Item"}</td>
                            <td className="p-3 text-right font-mono">{item.qty}</td>
                            <td className="p-3 text-right font-mono">UGX {item.unitCost.toLocaleString()}</td>
                            <td className="p-3 text-right font-mono font-bold text-slate-800">
                              UGX {(item.qty * item.unitCost).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-900 text-white font-mono font-bold">
                          <td colSpan={3} className="p-3 uppercase text-[10px] text-right">Grand Total:</td>
                          <td className="p-3 text-right font-mono">
                            UGX {viewingBudget.amount.toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>

              {/* Footer buttons */}
              <div className="p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-slate-400">
                  {(viewingBudget.status === 'Signed-off' || viewingBudget.status === 'Approved') ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 font-mono">
                      <Lock className="w-3.5 h-3.5" /> Journal Locked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 font-mono">
                      <Unlock className="w-3.5 h-3.5 animate-pulse" /> Modifiable Draft/Pending State
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setViewingBudget(null)}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2 px-5 rounded-xl cursor-pointer shadow-3xs"
                >
                  Close View
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Task Detail Modal */}
        {viewingTask && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] animate-fade-in text-left">
              {/* Header */}
              <div className="p-6 bg-indigo-950 text-white flex items-center justify-between">
                <div>
                  <span className={`text-[10px] font-bold rounded px-2 py-0.5 uppercase mr-2 ${
                    viewingTask.priority === 'high' ? 'bg-rose-600 text-white' : 'bg-amber-600 text-white'
                  }`}>
                    {viewingTask.priority} Priority
                  </span>
                  <span className="text-[10px] bg-slate-800 text-slate-300 font-bold uppercase px-2 py-0.5 rounded">
                    {viewingTask.assignedRole}
                  </span>
                  <h3 className="text-base font-black mt-1.5 tracking-tight">{viewingTask.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingTask(null)}
                  className="text-slate-400 hover:text-white cursor-pointer transition-all p-1"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Content body */}
              <div className="p-6 overflow-y-auto space-y-5 flex-1 text-slate-800 text-xs">
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-mono">Scope of Work Description</h4>
                  <p className="text-slate-600 leading-relaxed font-medium bg-slate-50 p-3 rounded-xl border border-slate-100">
                    {viewingTask.description || "No main description details entered."}
                  </p>
                </div>

                {viewingTask.descriptions && viewingTask.descriptions.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 font-mono">Activity Milestones & Sub-tasks</h4>
                    <div className="space-y-2">
                      {viewingTask.descriptions.map((desc, idx) => (
                        <div key={idx} className="flex items-start gap-2 bg-slate-50/50 p-2.5 rounded-lg border border-slate-150 font-medium">
                          <span className="font-mono bg-slate-200 text-slate-600 text-[9px] rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <span className="text-slate-700 leading-tight">{desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 font-mono">Workflow Meta Parameters</h4>
                  <div className="grid grid-cols-2 gap-4 bg-slate-50/50 p-3.5 rounded-xl border border-slate-150 font-medium">
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase">Assigned To</p>
                      <p className="text-slate-700 font-bold mt-0.5">{viewingTask.assignedRole}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase">Target Due Date</p>
                      <p className="text-slate-700 font-mono mt-0.5">{viewingTask.dueDate}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase">Execution Status</p>
                      <span className="inline-flex items-center gap-1 font-bold uppercase text-[9px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded mt-0.5">
                        {viewingTask.status || "pending"}
                      </span>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase">Approval State</p>
                      <span className="inline-flex items-center gap-1 font-bold uppercase text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded mt-0.5">
                        {viewingTask.approvalStatus || "approved"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setViewingTask(null)}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2 px-5 rounded-xl cursor-pointer shadow-3xs"
                >
                  Close View
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
