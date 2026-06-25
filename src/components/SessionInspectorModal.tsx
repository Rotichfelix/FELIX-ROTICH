import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckSquare, AlignLeft, Calendar as CalendarIcon, Users, RefreshCw, CheckCircle, AlertCircle, Download } from 'lucide-react';
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

  useEffect(() => {
    if (session) {
      setChecklist(session.checklist || {});
      setNotes(session.notes || '');
    }
  }, [session]);

  if (!isOpen || !session) return null;

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
            <div className="flex items-center gap-2 text-slate-700 font-bold text-xs uppercase tracking-wider">
              <AlignLeft className="w-4 h-4" />
              Session Report Notes
            </div>
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
