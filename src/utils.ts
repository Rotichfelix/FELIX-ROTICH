import { Session, AttendanceStatus, AttendanceRecord, AttendanceStats, Participant } from './types';

/**
 * Calculates attendance statistics for a participant based on stored attendance records and sessions.
 */
export function calculateParticipantStats(
  participantId: string,
  sessions: Session[],
  attendance: AttendanceRecord
): AttendanceStats {
  const sortedSessions = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const record = attendance[participantId] || {};

  let totalPresent = 0;
  let totalAbsent = 0;
  let totalExcused = 0;
  let totalSessions = 0;

  const markedStatuses: AttendanceStatus[] = [];

  let currentConsecutive = 0;
  let maxConsecutive = 0;

  for (const session of sortedSessions) {
    const status: AttendanceStatus = record[session.date] || 'unmarked';

    if (status !== 'unmarked') {
      totalSessions++;
      markedStatuses.push(status);
    }

    if (status === 'present') {
      totalPresent++;
      currentConsecutive = 0;
    } else if (status === 'absent') {
      totalAbsent++;
      currentConsecutive++;
      if (currentConsecutive > maxConsecutive) {
        maxConsecutive = currentConsecutive;
      }
    } else if (status === 'excused') {
      totalExcused++;
      currentConsecutive = 0; // Excused breaks consecutive unexcused absence streaks
    } else {
      // Unmarked does not increment the streak, and does not formally break/reset it for historical calculation,
      // but to be conservative, we reset it so we do not trigger warnings on future untracked days.
      currentConsecutive = 0;
    }
  }

  const attendanceRate = totalSessions > 0 
    ? Math.round(((totalPresent + totalExcused) / totalSessions) * 100) // Excused can count towards standing or adjust denominator
    : 100;

  // Real engagement calculations:
  // "Consider the red alert when the absenteeism is consecutive (3 or more) or four times in five sessions."
  let hasFourInFive = false;
  for (let i = 0; i <= markedStatuses.length - 5; i++) {
    const windowSlice = markedStatuses.slice(i, i + 5);
    const absentCount = windowSlice.filter(s => s === 'absent').length;
    if (absentCount >= 4) {
      hasFourInFive = true;
      break;
    }
  }

  const hasRedFlag = maxConsecutive >= 3 || hasFourInFive;
  const hasYellowFlag = !hasRedFlag && maxConsecutive >= 2;

  return {
    totalPresent,
    totalAbsent,
    totalExcused,
    totalSessions,
    attendanceRate,
    consecutiveAbsences: maxConsecutive,
    hasYellowFlag,
    hasRedFlag,
  };
}

/**
 * Find consecutive absent session dates for a participant to show in their visual timeline
 */
export function findConsecutiveAbsentDates(
  participantId: string,
  sessions: Session[],
  attendance: AttendanceRecord
): string[][] {
  const sortedSessions = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const record = attendance[participantId] || {};
  
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (const session of sortedSessions) {
    const status = record[session.date] || 'unmarked';
    if (status === 'absent') {
      currentBlock.push(session.date);
    } else {
      if (currentBlock.length >= 2) {
        blocks.push([...currentBlock]);
      }
      currentBlock = [];
    }
  }
  
  if (currentBlock.length >= 2) {
    blocks.push(currentBlock);
  }

  return blocks;
}

/**
 * Generates automated draft messaging templates based on alert levels.
 */
export function generateOutreachTemplate(
  participant: Participant,
  stats: AttendanceStats,
  flagType: 'yellow' | 'red'
): { subject: string; body: string } {
  if (flagType === 'red') {
    return {
      subject: `⚠️ IMMEDIATE ATTENDANCE OUTREACH: ${participant.name} (Lomuriangole CYDC UG 1083)`,
      body: `Hi Director / Manager,\n\nThis is an automated attendance alert from the Lomuriangole Child & Youth Development Center UG 1083 attendance system.\n\nParticipant ${participant.name} (Contact: ${participant.contact}) has triggered a CRITICAL RED ALERT. Under our Center guidelines, this occurs when an individual misses consecutive sessions (3 or more) or is absent four times in a 5-session window.\n\nImmediate support and outreach are required to check on this youth and coordinate with their caregiver.\n\nParticipant Records:\n- Name: ${participant.name}\n- Cohort/Class: ${participant.cohort}\n- Contact: ${participant.contact}\n- Active Absences: ${stats.totalAbsent} sessions\n- Consecutive Misses: ${stats.consecutiveAbsences}\n- Center ID: UG 1083\n\nPlease reach out to ${participant.name} or their caregiver directly, log an official outreach interaction note, and update their attendance status once addressed.\n\nBest regards,\nLomuriangole Child & Youth Development Center (UG 1083) Administration`
    };
  } else {
    return {
      subject: `Attendance Check-in: Lomuriangole Child & Youth Development Center UG 1083`,
      body: `Hi ${participant.name.split(' ')[0] || participant.name},\n\nHope this message finds you well!\n\nWe noticed you have missed our last two consecutive program sessions at Lomuriangole Child & Youth Development Center UG 1083. You are a valued part of our center, and we want to check in to make sure everything is okay and see how we can support you or your caregiver.\n\nWe would love to help you catch up on the lessons or activities you missed. Please let us know when you can attend or if you need to schedule a support check-in.\n\nLooking forward to seeing you soon!\n\nWith warm regards,\nLomuriangole CYDC UG 1083 Support Team`
    };
  }
}

/**
 * Format a calendar date to a readable standard (e.g. "Jun 9")
 */
export function formatToReadableDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-');
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}
export function formatToShortDayMonth(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-');
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

export function formatMonthLabel(monthStr: string): string {
  try {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const date = new Date(Number(year), Number(month) - 1, 2);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } catch (e) {
    return monthStr;
  }
}

/**
 * Calculates current age in years based on a date of birth string (YYYY-MM-DD).
 */
export function calculateAgeFromDob(dobString: string): string {
  if (!dobString) return '';
  const birthDate = new Date(dobString);
  if (isNaN(birthDate.getTime())) return '';
  const today = new Date();
  let years = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    years--;
  }
  return years >= 0 ? years.toString() : '0';
}

