import { Participant, AttendanceRecord, Session } from './types';

export const INITIAL_SESSIONS: Session[] = [
  { date: '2026-06-01', label: 'W1 Session 1' },
  { date: '2026-06-02', label: 'W1 Session 2' },
  { date: '2026-06-03', label: 'W1 Session 3' },
  { date: '2026-06-04', label: 'W1 Session 4' },
  { date: '2026-06-05', label: 'W1 Review' },
  { date: '2026-06-08', label: 'W2 Session 1' },
  { date: '2026-06-09', label: 'W2 Session 2' }, // Today's session
];

export const INITIAL_PARTICIPANTS: Participant[] = [];

export const INITIAL_ATTENDANCE: AttendanceRecord = {};

export const COHORTS = [
  'All Cohorts',
  'Victors Class',
  'Champions Class',
  'Overcomers Class'
];

export const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-800 border-emerald-300',
  'bg-sky-100 text-sky-800 border-sky-300',
  'bg-indigo-100 text-indigo-800 border-indigo-300',
  'bg-violet-100 text-violet-800 border-violet-300',
  'bg-rose-100 text-rose-800 border-rose-300',
  'bg-amber-100 text-amber-800 border-amber-300',
  'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300',
  'bg-teal-100 text-teal-800 border-teal-300',
];
