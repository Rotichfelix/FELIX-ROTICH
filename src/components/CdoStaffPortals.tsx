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
  Unlock
} from 'lucide-react';
import { Participant, FilledForm, OutreachLog, Budget } from '../types';
import { generateBudgetPDF } from '../utils/budgetPdf';
import { generateWorkplanPDF } from '../utils/workplanPdf';

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
  isAdminMode?: boolean;
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
  isAdminMode = false
}) => {
  const [activeRole, setActiveRole] = useState<'CDO HEALTH' | 'CDO SDR' | 'CDO HBP' | 'PROJECT DIRECTOR' | 'OVERSEER' | 'OFFICIAL JOURNALS'>('CDO HEALTH');
  
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
  
  // PD Correction states
  const [activeCorrectionId, setActiveCorrectionId] = useState<string | null>(null);
  const [currentCorrectionNotes, setCurrentCorrectionNotes] = useState('');
  const [pdBudgetFilter, setPdBudgetFilter] = useState<'All' | 'Pending' | 'Approved' | 'Returned for Correction' | 'Signed-off'>('All');
  const [cdoBudgetFilter, setCdoBudgetFilter] = useState<'All' | 'Draft' | 'Pending' | 'Approved' | 'Returned for Correction' | 'Signed-off'>('All');

  // Archival Journals States
  const [selectedJournalType, setSelectedJournalType] = useState<'budgets' | 'active_tasks' | 'completed_tasks'>('budgets');
  const [journalSearchQuery, setJournalSearchQuery] = useState('');
  const [journalCategoryFilter, setJournalCategoryFilter] = useState('all');

  // CDO Task & PD Workplan Approval states
  const [isCreatingCdoTask, setIsCreatingCdoTask] = useState(false);
  const [cdoTaskTitle, setCdoTaskTitle] = useState('');
  const [cdoTaskDescription, setCdoTaskDescription] = useState('');
  const [cdoTaskDueDate, setCdoTaskDueDate] = useState('');
  const [cdoTaskPriority, setCdoTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [cdoTaskFilter, setCdoTaskFilter] = useState<'All' | 'My Approved Tasks' | 'Pending PD Approval' | 'Returned for Correction' | 'Drafts'>('All');
  const [activeTaskCorrectionId, setActiveTaskCorrectionId] = useState<string | null>(null);
  const [currentTaskCorrectionNotes, setCurrentTaskCorrectionNotes] = useState('');
  const [cdoTaskDescriptions, setCdoTaskDescriptions] = useState<string[]>(['']);

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
      const newTask: StaffTask = {
        id: 'TASK-' + Date.now(),
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
      const updatedTasks = [...staffTasks, newTask];
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

    setFormSuccess(isDraftInput ? 'Workplan task saved as draft successfully!' : 'Workplan task submitted for PD approval successfully!');
    setTimeout(() => setFormSuccess(null), 3000);

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
      setFormSuccess(`Budget Proposal ${editingBudgetId} successfully updated and ${isDraftInput ? 'saved as draft' : 'resubmitted for approval'}.`);
      setEditingBudgetId(null);
    } else {
      // New budget
      const newId = `BGT-2026-${Math.floor(Math.random() * 900 + 100)}`;
      const newBgt: Budget = {
        id: newId,
        title: budgetTitle,
        category: budgetCategory,
        amount: totalAmount,
        description: budgetDescription,
        submittedBy: activeRole,
        submittedAt: todayStr,
        status: calculatedStatus,
        items: budgetItems
      };
      setBudgets(prev => [newBgt, ...prev]);
      onLogAudit(
        isDraftInput ? 'Budget Saved as Draft' : 'Budget Submitted', 
        `Prepared budget proposal [${newId}] for UGX ${totalAmount.toLocaleString()} and ${isDraftInput ? 'saved as draft' : 'submitted under department ' + budgetCategory}.`
      );
      setFormSuccess(`Budget Proposal ${newId} successfully ${isDraftInput ? 'saved as draft' : 'submitted to the Project Director for approval'}.`);
    }

    // Reset Form
    setBudgetTitle('');
    setBudgetDescription('');
    setBudgetCategory('General');
    setBudgetItems([{ name: '', qty: 1, unitCost: 0 }]);
    setIsCreatingBudget(false);
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
                  key={f}
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
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100 font-bold text-[10px] px-2 py-1 flex items-center gap-1 transition-all cursor-pointer shadow-3xs"
                            title="Download authorized workplan brief as PDF"
                          >
                            <Download className="w-3 h-3" />
                            <span>PDF</span>
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
            {filteredRoleBudgets.map(budget => {
              const hasCorrection = budget.status === 'Returned for Correction';
              return (
                <div key={budget.id} className="border border-slate-200 hover:border-slate-300 rounded-2xl p-5 bg-slate-50/40 hover:bg-slate-50/70 transition-all shadow-3xs flex flex-col justify-between relative overflow-hidden">
                  
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
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Alerts & Feedback banner */}
        {formSuccess && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-3 animate-fade-in">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            <p className="text-xs font-bold">{formSuccess}</p>
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
                      key={f}
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
                  .map(budget => {
                    const hasCorrection = budget.status === 'Returned for Correction';
                    return (
                      <div key={budget.id} className="border border-slate-200 rounded-2xl p-5 bg-slate-50/30 hover:bg-slate-50/70 transition-all flex flex-col justify-between relative overflow-hidden">
                        
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
                
                {/* Visual Stats Block */}
                <div className="flex flex-wrap gap-4 shrink-0">
                  <div className="bg-slate-800/40 backdrop-blur-md border border-slate-700/50 rounded-2xl px-4 py-3 min-w-[120px] text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Total Budgets</p>
                    <p className="text-2xl font-black text-white mt-1">{budgets.length}</p>
                  </div>
                  <div className="bg-slate-800/40 backdrop-blur-md border border-slate-700/50 rounded-2xl px-4 py-3 min-w-[120px] text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Active Tasks</p>
                    <p className="text-2xl font-black text-amber-400 mt-1">
                      {staffTasks.filter(t => (!t.approvalStatus || t.approvalStatus === 'approved') && t.status !== 'completed').length}
                    </p>
                  </div>
                  <div className="bg-slate-800/40 backdrop-blur-md border border-slate-700/50 rounded-2xl px-4 py-3 min-w-[120px] text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Completed Tasks</p>
                    <p className="text-2xl font-black text-emerald-400 mt-1">
                      {staffTasks.filter(t => t.status === 'completed').length}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Selector Switch & Filters */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-3xs space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-1">
                {/* Journal Tab Switcher */}
                <div className="flex flex-wrap p-1 bg-slate-100 rounded-xl gap-1 shrink-0 self-start lg:self-auto">
                  <button
                    onClick={() => {
                      setSelectedJournalType('budgets');
                      setJournalCategoryFilter('all');
                    }}
                    className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg transition-all cursor-pointer ${
                      selectedJournalType === 'budgets'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Budgets Journal</span>
                    <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                      selectedJournalType === 'budgets' ? 'bg-slate-100 text-slate-800' : 'bg-slate-200/50 text-slate-600'
                    }`}>
                      {budgets.length}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedJournalType('active_tasks');
                      setJournalCategoryFilter('all');
                    }}
                    className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg transition-all cursor-pointer ${
                      selectedJournalType === 'active_tasks'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Tasks/Workplans Journal</span>
                    <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                      selectedJournalType === 'active_tasks' ? 'bg-slate-100 text-slate-800' : 'bg-slate-200/50 text-slate-600'
                    }`}>
                      {staffTasks.filter(t => (!t.approvalStatus || t.approvalStatus === 'approved') && t.status !== 'completed').length}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedJournalType('completed_tasks');
                      setJournalCategoryFilter('all');
                    }}
                    className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg transition-all cursor-pointer ${
                      selectedJournalType === 'completed_tasks'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Completed Tasks Journal</span>
                    <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                      selectedJournalType === 'completed_tasks' ? 'bg-slate-100 text-slate-800' : 'bg-slate-200/50 text-slate-600'
                    }`}>
                      {staffTasks.filter(t => t.status === 'completed').length}
                    </span>
                  </button>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-xl lg:justify-end">
                  {/* Search bar */}
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder={`Search journal...`}
                      value={journalSearchQuery}
                      onChange={(e) => setJournalSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>

                  {/* Department Category Filter */}
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <select
                      value={journalCategoryFilter}
                      onChange={(e) => setJournalCategoryFilter(e.target.value)}
                      className="bg-transparent text-xs font-bold text-slate-700 cursor-pointer focus:outline-none"
                    >
                      <option value="all">All Departments</option>
                      <option value="health">Health</option>
                      <option value="sponsor">Sponsor Relations</option>
                      <option value="home">Home-Based</option>
                      {selectedJournalType === 'budgets' && <option value="general">General</option>}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* List Content */}
            <div className="grid grid-cols-1 gap-4">
              {/* BUDGETS JOURNAL CONTENT */}
              {selectedJournalType === 'budgets' && (() => {
                // Filter budgets
                const filteredBudgets = budgets.filter(b => {
                  // Search query match
                  const matchesSearch = b.title.toLowerCase().includes(journalSearchQuery.toLowerCase()) || 
                                       (b.description || '').toLowerCase().includes(journalSearchQuery.toLowerCase()) ||
                                       b.id.toLowerCase().includes(journalSearchQuery.toLowerCase());
                  
                  // Department Category filter match
                  let matchesCategory = true;
                  if (journalCategoryFilter === 'health') matchesCategory = b.category === 'Health';
                  else if (journalCategoryFilter === 'sponsor') matchesCategory = b.category === 'Sponsor Relations';
                  else if (journalCategoryFilter === 'home') matchesCategory = b.category === 'Home-Based';
                  else if (journalCategoryFilter === 'general') matchesCategory = b.category === 'General';

                  return matchesSearch && matchesCategory;
                });

                return (
                  <div className="space-y-3">
                    {filteredBudgets.map((budget, idx) => {
                      const totalCost = budget.items?.reduce((sum, item) => sum + (item.qty * item.unitCost), 0) || 0;
                      return (
                        <div key={`${budget.id}-${idx}`} className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-slate-300 transition-all shadow-3xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200 rounded-md px-1.5 py-0.5">
                                {budget.id}
                              </span>
                              <span className={`text-[10px] font-bold rounded-lg px-2 py-0.5 ${
                                budget.category === 'Health' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                                budget.category === 'Sponsor Relations' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                budget.category === 'Home-Based' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                'bg-slate-50 text-slate-700 border border-slate-100'
                              }`}>
                                {budget.category} Department
                              </span>
                              {budget.status === 'Signed-off' ? (
                                <span className="text-[10px] font-bold bg-teal-500 text-white border border-teal-600 rounded-lg px-2 py-0.5 flex items-center gap-0.5 shadow-3xs">
                                  <Lock className="w-2.5 h-2.5" /> Permanent Signed-off
                                </span>
                              ) : budget.status === 'Approved' ? (
                                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg px-2 py-0.5 flex items-center gap-0.5">
                                  <CheckCircle className="w-2.5 h-2.5 text-emerald-600" /> Approved
                                </span>
                              ) : budget.status === 'Returned for Correction' ? (
                                <span className="text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 rounded-lg px-2 py-0.5 flex items-center gap-0.5">
                                  <AlertCircle className="w-2.5 h-2.5 text-rose-600" /> Returned
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 rounded-lg px-2 py-0.5">
                                  {budget.status || 'Draft'}
                                </span>
                              )}
                            </div>
                            <h4 className="font-bold text-slate-900 text-sm tracking-tight">{budget.title}</h4>
                            <p className="text-[11px] text-slate-500 line-clamp-2 max-w-4xl">{budget.description || 'No detailed description annotated.'}</p>
                            <div className="flex items-center gap-4 text-[10px] text-slate-400 font-mono mt-1">
                              <span>📅 Submitted: {budget.submittedAt ? budget.submittedAt.substring(0, 10) : 'N/A'}</span>
                              <span>•</span>
                              <span>👤 Operator: {budget.submittedBy}</span>
                            </div>
                          </div>

                          <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-3 shrink-0 border-t md:border-t-0 border-slate-100 pt-3 md:pt-0">
                            <div className="text-right">
                              <p className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">Estimated Total</p>
                              <p className="text-base font-black text-slate-950 font-mono mt-0.5">UGX {totalCost.toLocaleString()}</p>
                            </div>
                            
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setViewingBudget(budget)}
                                className="bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[11px] px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all cursor-pointer shadow-3xs"
                              >
                                <Eye className="w-3.5 h-3.5 text-slate-500" />
                                <span>Details</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => generateBudgetPDF(budget)}
                                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 font-bold text-[11px] px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all cursor-pointer shadow-3xs"
                                title="Download and archive budget proposal as PDF"
                              >
                                <Download className="w-3.5 h-3.5 text-indigo-500" />
                                <span>Print</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {filteredBudgets.length === 0 && (
                      <div className="text-center py-12 bg-white border border-slate-200 rounded-2xl">
                        <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                        <p className="text-slate-500 text-sm font-bold">No budgets matched your criteria.</p>
                        <p className="text-slate-400 text-xs mt-1">Try relaxing filters or search queries.</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ACTIVE TASKS JOURNAL CONTENT */}
              {selectedJournalType === 'active_tasks' && (() => {
                // Filter approved tasks that are not complete
                const filteredTasks = staffTasks.filter(t => {
                  const isApproved = !t.approvalStatus || t.approvalStatus === 'approved';
                  const isNotCompleted = t.status !== 'completed';
                  if (!isApproved || !isNotCompleted) return false;

                  // Search match
                  const matchesSearch = t.title.toLowerCase().includes(journalSearchQuery.toLowerCase()) || 
                                       t.description.toLowerCase().includes(journalSearchQuery.toLowerCase());

                  // Department Category filter match
                  let matchesCategory = true;
                  if (journalCategoryFilter === 'health') matchesCategory = t.assignedRole === 'CDO HEALTH';
                  else if (journalCategoryFilter === 'sponsor') matchesCategory = t.assignedRole === 'CDO SDR';
                  else if (journalCategoryFilter === 'home') matchesCategory = t.assignedRole === 'CDO HBP';

                  return matchesSearch && matchesCategory;
                });

                return (
                  <div className="space-y-3">
                    {filteredTasks.map((task, idx) => (
                      <div key={`${task.id}-${idx}`} className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-slate-300 transition-all shadow-3xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-md px-1.5 py-0.5">
                              {task.id}
                            </span>
                            <span className={`text-[10px] font-bold rounded-lg px-2 py-0.5 ${
                              task.assignedRole === 'CDO HEALTH' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                              task.assignedRole === 'CDO SDR' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                              'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            }`}>
                              {task.assignedRole === 'CDO HEALTH' ? 'Health Department' : task.assignedRole === 'CDO SDR' ? 'Sponsor Relations' : 'Home-Based Department'}
                            </span>
                            <span className={`text-[9px] font-bold rounded-lg px-1.5 py-0.5 uppercase tracking-wide ${
                              task.priority === 'high' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {task.priority} Priority
                            </span>
                            <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-2 py-0.5 flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5 text-amber-500" /> In Task Journal
                            </span>
                          </div>
                          <h4 className="font-bold text-slate-900 text-sm tracking-tight">{task.title}</h4>
                          <p className="text-[11px] text-slate-500 line-clamp-2 max-w-4xl">{task.description}</p>
                          <div className="flex items-center gap-4 text-[10px] text-slate-400 font-mono mt-1">
                            <span>📅 Due Date: {task.dueDate}</span>
                            <span>•</span>
                            <span>⚡ Current Execution: {task.status === 'in-progress' ? 'In Progress' : task.status || 'Pending'}</span>
                          </div>
                        </div>

                        <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-3 shrink-0 border-t md:border-t-0 border-slate-100 pt-3 md:pt-0">
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">Current Status</p>
                            <p className="text-xs font-black text-slate-950 uppercase mt-0.5">{task.status || 'Pending'}</p>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setViewingTask(task)}
                              className="bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[11px] px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all cursor-pointer shadow-3xs"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-500" />
                              <span>Details</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => generateWorkplanPDF(task)}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100 font-bold text-[11px] px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all cursor-pointer shadow-3xs"
                              title="Download authorized workplan brief as PDF"
                            >
                              <Download className="w-3.5 h-3.5 text-emerald-500" />
                              <span>Print</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredTasks.length === 0 && (
                      <div className="text-center py-12 bg-white border border-slate-200 rounded-2xl">
                        <Clock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                        <p className="text-slate-500 text-sm font-bold">No approved tasks matched your criteria.</p>
                        <p className="text-slate-400 text-xs mt-1">Try relaxing filters or search queries.</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* COMPLETED TASKS JOURNAL CONTENT */}
              {selectedJournalType === 'completed_tasks' && (() => {
                // Filter completed tasks
                const filteredTasks = staffTasks.filter(t => {
                  const isCompleted = t.status === 'completed';
                  if (!isCompleted) return false;

                  // Search match
                  const matchesSearch = t.title.toLowerCase().includes(journalSearchQuery.toLowerCase()) || 
                                       t.description.toLowerCase().includes(journalSearchQuery.toLowerCase());

                  // Department Category filter match
                  let matchesCategory = true;
                  if (journalCategoryFilter === 'health') matchesCategory = t.assignedRole === 'CDO HEALTH';
                  else if (journalCategoryFilter === 'sponsor') matchesCategory = t.assignedRole === 'CDO SDR';
                  else if (journalCategoryFilter === 'home') matchesCategory = t.assignedRole === 'CDO HBP';

                  return matchesSearch && matchesCategory;
                });

                return (
                  <div className="space-y-3">
                    {filteredTasks.map((task, idx) => (
                      <div key={`${task.id}-${idx}`} className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-slate-300 transition-all shadow-3xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md px-1.5 py-0.5">
                              {task.id}
                            </span>
                            <span className={`text-[10px] font-bold rounded-lg px-2 py-0.5 ${
                              task.assignedRole === 'CDO HEALTH' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                              task.assignedRole === 'CDO SDR' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                              'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            }`}>
                              {task.assignedRole === 'CDO HEALTH' ? 'Health Department' : task.assignedRole === 'CDO SDR' ? 'Sponsor Relations' : 'Home-Based Department'}
                            </span>
                            <span className="text-[10px] font-bold bg-emerald-500 text-white border border-emerald-600 rounded-lg px-2 py-0.5 flex items-center gap-0.5 shadow-3xs">
                              <CheckCircle className="w-2.5 h-2.5 text-white" /> Complete Archive
                            </span>
                          </div>
                          <h4 className="font-bold text-slate-900 text-sm tracking-tight">{task.title}</h4>
                          <p className="text-[11px] text-slate-500 line-clamp-2 max-w-4xl">{task.description}</p>
                          <div className="flex items-center gap-4 text-[10px] text-slate-400 font-mono mt-1">
                            <span>📅 Due Date: {task.dueDate}</span>
                            <span>•</span>
                            <span>🏆 Verified Complete: YES</span>
                          </div>
                        </div>

                        <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-3 shrink-0 border-t md:border-t-0 border-slate-100 pt-3 md:pt-0">
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">Mission Result</p>
                            <p className="text-xs font-black text-emerald-600 uppercase mt-0.5">Accomplished</p>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setViewingTask(task)}
                              className="bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[11px] px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all cursor-pointer shadow-3xs"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-500" />
                              <span>Details</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => generateWorkplanPDF(task)}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100 font-bold text-[11px] px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all cursor-pointer shadow-3xs"
                              title="Download authorized workplan brief as PDF"
                            >
                              <Download className="w-3.5 h-3.5 text-emerald-500" />
                              <span>Print</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredTasks.length === 0 && (
                      <div className="text-center py-12 bg-white border border-slate-200 rounded-2xl">
                        <CheckCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                        <p className="text-slate-500 text-sm font-bold">No completed tasks matched your criteria.</p>
                        <p className="text-slate-400 text-xs mt-1">Mark assigned tasks completed in the CDO views to move them here.</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
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
