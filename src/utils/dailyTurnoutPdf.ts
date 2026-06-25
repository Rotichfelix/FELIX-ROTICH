import { jsPDF } from 'jspdf';
import { getLogoPngDataUri } from '../components/LogoSVG';
import { Participant, Session } from '../types';

export const generateDailyTurnoutPDF = (
  session: Session,
  activeParticipants: Participant[],
  attendance: Record<string, Record<string, string>>,
  stats: { present: number; absent: number; excused: number; rate: number } | null,
  shouldPrint: boolean = false
) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const width = 210;
  const height = 297;
  const margin = 20;
  const contentWidth = width - (margin * 2); // 170

  let pageNum = 1;

  // Helper to draw the header on any page
  const drawPageHeader = () => {
    // Add the Logo
    try {
      doc.addImage(getLogoPngDataUri(), 'PNG', 22, 11, 15, 15);
    } catch (e) {
      console.error("Failed to add SVG logo to Daily Turnout PDF:", e);
    }

    // Center Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text("LOMURIANGOLE CHILD AND YOUTH DEVELOPMENT CENTER UG-1083", 105, 15, { align: 'center' });

    // Address & details
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85); // slate-700
    doc.text("P.O BOX 57 MOROTO, UGANDA", 105, 19.5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text("TEL: ", 105 - 35, 24);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(217, 119, 6); // Amber-600
    doc.text("0778687473 / 078436428 / 0784522071", 105 + 5, 24, { align: 'center' });

    // Header divider
    doc.setDrawColor(79, 70, 229); // Indigo-600
    doc.setLineWidth(0.6);
    doc.line(margin, 27, width - margin, 27);
  };

  // Helper to draw the footer on any page
  const drawPageFooter = () => {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Daily Turnout & Session Archival Report - Date: ${session.date} - Page ${pageNum}`, 105, height - 10, { align: 'center' });
  };

  // Check overflow and add page if needed
  const checkOverflow = (currentY: number, neededHeight: number): number => {
    if (currentY + neededHeight > height - 20) {
      doc.addPage();
      pageNum++;
      drawPageHeader();
      drawPageFooter();
      return 35; // New page top content coordinate
    }
    return currentY;
  };

  // Initial draw
  drawPageHeader();
  drawPageFooter();

  let y = 35;

  // Title block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text("DAILY TURNOUT & SESSION ARCHIVAL REPORT", 105, y, { align: 'center' });

  y += 7;

  // General Metadata Grid
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setFillColor(248, 250, 252); // slate-50
  doc.rect(margin, y, contentWidth, 32, 'F');
  doc.rect(margin, y, contentWidth, 32, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105); // slate-600

  // Column 1
  doc.text("Session Label / Title:", margin + 5, y + 7);
  doc.text("Session Target Date:", margin + 5, y + 14);
  doc.text("Overall Turnout Rate:", margin + 5, y + 21);
  doc.text("Report Status:", margin + 5, y + 28);

  // Values Column 1
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(session.label || 'Regular CYDC Session', margin + 45, y + 7);
  doc.text(session.date, margin + 45, y + 14);

  const turnoutRate = stats ? `${stats.rate}%` : 'N/A';
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(79, 70, 229); // Indigo-600
  doc.text(turnoutRate, margin + 45, y + 21);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(16, 185, 129); // Emerald-600
  doc.text("OFFICIALLY ARCHIVED RECORD", margin + 45, y + 28);

  // Column 2
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text("Present Count:", margin + 110, y + 7);
  doc.text("Absent Count:", margin + 110, y + 14);
  doc.text("Excused Count:", margin + 110, y + 21);
  doc.text("Registered Total:", margin + 110, y + 28);

  // Values Column 2
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(stats ? String(stats.present) : '0', margin + 145, y + 7);
  doc.text(stats ? String(stats.absent) : '0', margin + 145, y + 14);
  doc.text(stats ? String(stats.excused) : '0', margin + 145, y + 21);
  doc.text(String(activeParticipants.length), margin + 145, y + 28);

  y += 40;

  // Activities Checklist Section
  y = checkOverflow(y, 35);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("REQUIRED ACTIVITIES CHECKLIST & EXECUTION STATE", margin, y);

  y += 5;

  const checklistItems = [
    'Lunch Distribution',
    'Material Collection',
    'Register Marking',
    'Site Cleaning / Tidying',
    'Announcements Delivered'
  ];

  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.rect(margin, y, contentWidth, checklistItems.length * 6 + 4, 'S');

  let checklistY = y + 5;
  checklistItems.forEach(item => {
    const isChecked = !!(session.checklist?.[item]);
    
    // Draw Checkbox
    doc.setDrawColor(71, 85, 105);
    doc.setFillColor(isChecked ? 240 : 255, isChecked ? 243 : 255, isChecked ? 255 : 255);
    doc.rect(margin + 5, checklistY - 3, 4, 4, isChecked ? 'DF' : 'S');
    
    if (isChecked) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(79, 70, 229); // Indigo
      doc.text("Y", margin + 6, checklistY);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(isChecked ? 71 : 15, isChecked ? 85 : 23, isChecked ? 105 : 42);
    doc.text(item, margin + 13, checklistY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(isChecked ? 16 : 100, isChecked ? 185 : 116, isChecked ? 129 : 139);
    doc.text(isChecked ? "COMPLETED" : "PENDING / NOT RECORDED", margin + 120, checklistY);

    checklistY += 6;
  });

  y += checklistItems.length * 6 + 12;

  // Notes Section
  y = checkOverflow(y, 25);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("SESSION ARCHIVAL NOTES & INCIDENTS", margin, y);

  y += 5;
  const notesText = session.notes || "No additional report notes or specific session incidents were logged for this date.";
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const splitNotes = doc.splitTextToSize(notesText, contentWidth - 10);
  
  const notesHeight = (splitNotes.length * 4) + 6;
  y = checkOverflow(y, notesHeight);
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(250, 250, 250);
  doc.rect(margin, y, contentWidth, notesHeight, 'DF');
  doc.text(splitNotes, margin + 5, y + 5);

  y += notesHeight + 12;

  // Student list categorized
  const presentStudents = activeParticipants.filter(p => attendance[p.id]?.[session.date] === 'present');
  const absentStudents = activeParticipants.filter(p => attendance[p.id]?.[session.date] === 'absent');
  const excusedStudents = activeParticipants.filter(p => attendance[p.id]?.[session.date] === 'excused');

  const drawCategoryTable = (title: string, students: Participant[], titleColor: [number, number, number]) => {
    y = checkOverflow(y, 25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
    doc.text(`${title.toUpperCase()} (COUNT: ${students.length})`, margin, y);

    y += 4;

    if (students.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184);
      doc.text("No students recorded in this division.", margin + 5, y + 3);
      y += 10;
      return;
    }

    // Table Header
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 6, 'DF');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text("No.", margin + 3, y + 4.5);
    doc.text("Student ID No.", margin + 15, y + 4.5);
    doc.text("Full Name", margin + 45, y + 4.5);
    doc.text("Cohort Division", margin + 115, y + 4.5);
    doc.text("Contact", margin + 145, y + 4.5);

    y += 6;

    students.forEach((student, index) => {
      y = checkOverflow(y, 6.5);
      
      // Draw background row borders
      doc.setDrawColor(241, 245, 249);
      doc.line(margin, y + 5.5, width - margin, y + 5.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);

      doc.text(String(index + 1), margin + 3, y + 4);
      doc.text(student.idNo || student.id, margin + 15, y + 4);

      // Truncate name if too long
      const truncatedName = student.name.length > 35 ? student.name.substring(0, 32) + "..." : student.name;
      doc.text(truncatedName, margin + 45, y + 4);

      doc.text(student.cohort, margin + 115, y + 4);
      doc.text(student.contact || "N/A", margin + 145, y + 4);

      y += 5.5;
    });

    y += 6; // spacing after table
  };

  // Draw each category
  drawCategoryTable("Present Students", presentStudents, [16, 185, 129]); // Emerald
  drawCategoryTable("Absent Students", absentStudents, [225, 29, 72]); // Rose
  drawCategoryTable("Excused Students", excusedStudents, [217, 119, 6]); // Amber

  // Sign-off signature fields
  y = checkOverflow(y, 35);
  y += 5;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(margin, y, width - margin, y);

  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text("PREPARED BY:", margin, y);
  doc.text("COUNTERSIGNED & VERIFIED BY:", margin + 95, y);

  y += 12;
  doc.setDrawColor(148, 163, 184); // Slate-400
  doc.line(margin, y, margin + 65, y);
  doc.line(margin + 95, y, margin + 160, y);

  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text("CYDC Attendance Registrar Specialist", margin, y);
  doc.text("Project Director (PD) / Center PM", margin + 95, y);

  y += 3.5;
  doc.text("Lomuriangole CYDC UG-1083 Staff", margin, y);
  doc.text("Official Archival & Audit Stamp Verified", margin + 95, y);

  // Save or Print
  if (shouldPrint) {
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  } else {
    doc.save(`UG1083_Daily_Turnout_${session.date}.pdf`);
  }
};
