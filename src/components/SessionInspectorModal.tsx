import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckSquare, AlignLeft, Calendar as CalendarIcon, Users, RefreshCw, CheckCircle, AlertCircle, Download, Sparkles } from 'lucide-react';
import { Session, Participant, AttendanceRecord } from '../types';
import { generateDailyTurnoutPDF } from '../utils/dailyTurnoutPdf';

interface SessionInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session | null;
  onUpdateSession: (date: string, checklist: Record<string, boolean>, notes: string) => void;
  attendanceStats: { present: number; absent: number; excused: number; rate: number } | null;
  googleAccessToken?: string | null;
  onSyncToCalendar?: (session: Session) => Promise<void>;
  isSyncingToCalendar?: boolean;
  calendarSyncSuccess?: string | null;
  calendarSyncError?: string | null;
  activeParticipants?: Participant[];
  attendance?: AttendanceRecord;
}

const DEFAULT_CHECKLIST = [
  'Lunch Distribution',
  'Material Collection',
  'Register Marking',
  'Site Cleaning / Tidying',
  'Announcements Delivered'
];

export const SessionInspectorModal: React.FC<SessionInspectorModalProps> = ({ 
  isOpen, 
  onClose, 
  session, 
  onUpdateSession, 
  attendanceStats,
  googleAccessToken,
  onSyncToCalendar,
  isSyncingToCalendar,
  calendarSyncSuccess,
  calendarSyncError,
  activeParticipants = [],
  attendance = {}
}) => {
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');

  // AI report states
  const [topic, setTopic] = useState('');
  const [highlights, setHighlights] = useState('');
  const [challenges, setChallenges] = useState('');
  const [studentUpdates, setStudentUpdates] = useState('');
  const [showAiHelper, setShowAiHelper] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      setChecklist(session.checklist || {});
      setNotes(session.notes || '');
      // Clear or reset AI fields for the new session
      setTopic('');
      setHighlights('');
      setChallenges('');
      setStudentUpdates('');
      setGeneratedReport(null);
      setGenerationError(null);
    }
  }, [session]);

  if (!isOpen || !session) return null;

  const handleGenerateAiReport = async () => {
    setIsGeneratingReport(true);
    setGenerationError(null);
    setGeneratedReport(null);
    try {
      // Find each participant's status for the current session date
      const participantsWithStatus = activeParticipants.map(p => {
        const status = attendance[p.id]?.[session.date] || 'unmarked';
        return {
          id: p.id,
          name: p.name,
          cohort: p.cohort,
          status
        };
      });

      const res = await fetch("/api/gemini/analyze-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          session,
          attendanceStats,
          templateData: {
            topic,
            highlights,
            challenges,
            studentUpdates
          },
          participants: participantsWithStatus
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to generate report.");
      }

      const data = await res.json();
      if (data.report) {
        setGeneratedReport(data.report);
      } else {
        throw new Error("Report not returned in server response.");
      }
    } catch (err: any) {
      console.error(err);
      setGenerationError(err.message || "An unexpected error occurred during report drafting.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleApplyReport = () => {
    if (generatedReport) {
      setNotes(generatedReport);
      setShowAiHelper(false);
    }
  };

  const handleToggleCheck = (item: string) => {
    setChecklist(prev => ({ ...prev, [item]: !prev[item] }));
  };

  const handleSave = () => {
    onUpdateSession(session.date, checklist, notes);
    onClose();
  };

  const handleDownloadPDF = () => {
    generateDailyTurnoutPDF(
      { ...session, checklist, notes },
      activeParticipants,
      attendance,
      attendanceStats
    );
  };

  const handleExportCSV = () => {
    const headers = ["Student ID", "Student Name", "Cohort", "Gender", "Contact", "Attendance Status"];
    const rows = activeParticipants.map(p => [
      p.idNo || p.id,
      p.name,
      p.cohort,
      p.gender || 'N/A',
      p.contact || 'N/A',
      attendance[p.id]?.[session.date] || 'unmarked'
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `attendance_record_${session.date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900"
      />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest font-mono">
              Session Inspector
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 px-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Header */}
          <div>
            <h2 className="text-xl font-bold text-slate-900">{session.label || 'Regular Session'}</h2>
            <p className="text-sm text-slate-500 font-mono mt-1">{session.date}</p>
          </div>

          {/* Stats */}
          {attendanceStats && (
            <div className="grid grid-cols-4 gap-2 bg-indigo-50 border border-indigo-100 rounded-xl p-3">
              <div className="text-center">
                <div className="text-xs text-indigo-600 font-bold uppercase">Rate</div>
                <div className="font-bold text-slate-800">{attendanceStats.rate}%</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-emerald-600 font-bold uppercase">Present</div>
                <div className="font-bold text-slate-800">{attendanceStats.present}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-rose-600 font-bold uppercase">Absent</div>
                <div className="font-bold text-slate-800">{attendanceStats.absent}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-amber-600 font-bold uppercase">Excused</div>
                <div className="font-bold text-slate-800">{attendanceStats.excused}</div>
              </div>
            </div>
          )}

          {/* Checklist */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-slate-700 font-bold text-xs uppercase tracking-wider">
              <CheckSquare className="w-4 h-4" />
              Required Activities Checklist
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              {DEFAULT_CHECKLIST.map(item => (
                <label key={item} className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${checklist[item] ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300'}`}>
                    <input type="checkbox" className="hidden" checked={!!checklist[item]} onChange={() => handleToggleCheck(item)} />
                    {checklist[item] && <CheckSquare className="w-3.5 h-3.5 opacity-100" />}
                  </div>
                  <span className={`text-sm font-medium ${checklist[item] ? 'text-slate-400 line-through' : 'text-slate-700 group-hover:text-slate-900'}`}>{item}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-slate-700 font-bold text-xs uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <AlignLeft className="w-4 h-4" />
                Session Report Notes
              </div>
            </div>

            {/* AI Assistant Banner */}
            <button
              type="button"
              onClick={() => setShowAiHelper(!showAiHelper)}
              className="w-full flex items-center justify-between p-3.5 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border border-indigo-100 rounded-xl text-left transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse shrink-0" />
                <div>
                  <div className="text-xs font-bold text-indigo-900 uppercase tracking-wide">✨ AI Report Writer</div>
                  <div className="text-[10.5px] text-indigo-700 font-medium">Draft a structured professional report with Gemini AI</div>
                </div>
              </div>
              <span className="text-[10px] font-bold text-indigo-600 bg-white px-2 py-0.5 rounded-md border border-indigo-100 shrink-0">
                {showAiHelper ? 'Hide' : 'Open Assistant'}
              </span>
            </button>

            {showAiHelper && (
              <div className="border border-indigo-100 bg-slate-50/50 rounded-xl p-4 space-y-3.5 shadow-2xs animate-fade-in text-xs">
                <div className="text-[11px] text-slate-600 leading-relaxed">
                  Provide brief points below. Gemini will weave them together with turnout statistics and individual attendance flags for this session.
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">1. Main Topic or Activity Taught <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="e.g., Sponsor letters writing, health workshop, math division"
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">2. Key Highlights / Milestones</label>
                    <textarea
                      value={highlights}
                      onChange={(e) => setHighlights(e.target.value)}
                      placeholder="e.g., Victors class completed letters, John helped latecomers"
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 h-14 resize-none focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">3. Challenges / Materials Needed</label>
                    <textarea
                      value={challenges}
                      onChange={(e) => setChallenges(e.target.value)}
                      placeholder="e.g., Ran out of notebooks. Delay due to heavy rain"
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 h-14 resize-none focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">4. Individual Child Updates (Optional)</label>
                    <input
                      type="text"
                      value={studentUpdates}
                      onChange={(e) => setStudentUpdates(e.target.value)}
                      placeholder="e.g., Sarah was extremely active; Silas needs spelling help"
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleGenerateAiReport}
                    disabled={isGeneratingReport || !topic.trim()}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all shadow-3xs cursor-pointer ${
                      isGeneratingReport
                        ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                        : !topic.trim()
                        ? 'bg-indigo-50 text-indigo-400 border border-indigo-100 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:scale-[1.01]'
                    }`}
                  >
                    {isGeneratingReport ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Generating report...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3 w-3 text-indigo-200" />
                        Draft Report with AI
                      </>
                    )}
                  </button>
                </div>

                {generationError && (
                  <div className="text-[11px] text-rose-600 font-semibold bg-rose-50 border border-rose-100 rounded-lg p-2.5 flex items-start gap-1.5 animate-fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <span>{generationError}</span>
                  </div>
                )}

                {generatedReport && (
                  <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-3.5 space-y-2.5 shadow-3xs animate-fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-indigo-900 uppercase font-mono">Drafted Report Preview</span>
                      <button
                        type="button"
                        onClick={handleApplyReport}
                        className="flex items-center gap-1 text-[10px] font-bold text-indigo-700 hover:text-white bg-indigo-50 hover:bg-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Apply to Notes
                      </button>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto text-xs text-slate-700 leading-relaxed font-sans prose prose-sm whitespace-pre-wrap">
                      {generatedReport}
                    </div>
                  </div>
                )}
              </div>
            )}

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter details about how the session went, incidents, material shortages..."
              className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors resize-none"
            />
          </div>

          {/* Google Calendar Sync Section */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 text-slate-700 font-bold text-xs uppercase tracking-wider">
              <CalendarIcon className="w-4 h-4 text-indigo-600" />
              Lomuriangole Calendar Integration
            </div>
            
            <div className="bg-indigo-50/55 border border-indigo-100 rounded-xl p-4 flex flex-col gap-3">
              <p className="text-[11px] text-slate-600 leading-relaxed font-sans font-medium">
                Keep the dedicated <strong className="text-indigo-700">CYDC Lomuriangole</strong> Google Calendar perfectly updated. This will sync general session details, activities checklist, and attendance statistics directly for shared scheduling.
              </p>
              
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onSyncToCalendar?.(session)}
                  disabled={isSyncingToCalendar}
                  className={`flex items-center justify-center gap-2 text-xs font-bold py-2 px-4 rounded-xl transition-all shadow-3xs cursor-pointer ${
                    isSyncingToCalendar
                      ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:scale-[1.01]'
                  }`}
                >
                  {isSyncingToCalendar ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CalendarIcon className="h-3.5 w-3.5" />
                  )}
                  {isSyncingToCalendar ? 'Synchronizing... (auth if required)' : 'Sync Session to Google Calendar'}
                </button>
              </div>

              {calendarSyncSuccess && (
                <div className="text-[11.5px] font-semibold text-emerald-600 flex items-start gap-1.5 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5 mt-1 font-sans animate-fade-in">
                  <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{calendarSyncSuccess}</span>
                </div>
              )}

              {calendarSyncError && (
                <div className="text-[11.5px] font-semibold text-rose-600 flex items-start gap-1.5 bg-rose-50 border border-rose-100 rounded-lg p-2.5 mt-1 font-sans animate-fade-in">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                  <span>{calendarSyncError}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-200 hover:bg-emerald-50 text-emerald-700 bg-emerald-50/50 rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-3xs"
              title="Download authorized daily turnout report as PDF"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Turnout (PDF)</span>
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-200 hover:bg-blue-50 text-blue-700 bg-blue-50/50 rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-3xs"
              title="Export session attendance registry as a clean CSV table"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>Attendance (CSV)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 border border-transparent bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-3xs"
            >
              Save Session Report
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
