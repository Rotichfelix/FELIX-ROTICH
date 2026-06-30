import { jsPDF } from 'jspdf';
import { getLogoPngDataUri } from '../components/LogoSVG';
import { StaffPerformanceCycle } from '../types';

export const generatePerformancePDF = (cycle: StaffPerformanceCycle) => {
  const doc = new jsPDF('l', 'mm', 'a4');
  
  // Page dimensions in landscape
  const width = 297;
  const height = 210;
  const margin = 20;
  const contentWidth = width - (margin * 2); // 257

  let y = 15;

  // Header Block
  try {
    doc.addImage(getLogoPngDataUri(), 'PNG', 22, 11, 15, 15);
  } catch (e) {
    console.error("Failed to add logo:", e);
  }

  const centerX = width / 2; // 148.5

  // Center text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text("LOMURIANGOLE CHILD AND YOUTH DEVELOPMENT CENTER UG-1083", centerX, 17, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85); // slate-700
  doc.text("P.O BOX 57 MOROTO, UGANDA", centerX, 21.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text("TEL: ", centerX - 33, 26);
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(217, 119, 6); // Amber-600
  doc.text("0778687473 / 078436428 / 0784522071", centerX + 5, 26, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text("Email: ", centerX - 25, 30.5);
  
  doc.setTextColor(37, 99, 235); // Blue
  doc.text("lomuriangolecydc@gmail.com", centerX + 8, 30.5, { align: 'center' });

  // Separating thick black horizontal line
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.4);
  doc.line(margin, 34.5, width - margin, 34.5);

  // Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("OFFICIAL STAFF PERFORMANCE PLAN & APPRAISAL", centerX, 41, { align: 'center' });

  // Metadata Grid
  y = 48;
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setFillColor(248, 250, 252); // slate-50
  doc.rect(margin, y, contentWidth, 32, 'F');
  doc.rect(margin, y, contentWidth, 32, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // slate-600

  // Left column
  doc.text("Performance Plan ID:", margin + 5, y + 6);
  doc.text("Staff Member Name:", margin + 5, y + 12);
  doc.text("Department / Role:", margin + 5, y + 18);
  doc.text("Fiscal Cycle Year:", margin + 5, y + 24);

  // Values left column
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(cycle.id, margin + 45, y + 6);
  doc.text(cycle.staffName, margin + 45, y + 12);
  doc.text(cycle.staffRole, margin + 45, y + 18);
  doc.text(cycle.fiscalYear, margin + 45, y + 24);

  // Right column
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text("Status:", margin + 140, y + 6);
  doc.text("Date Submitted:", margin + 140, y + 12);

  // Values right column
  doc.setFont('helvetica', 'bold');
  let statusColor = [51, 65, 85];
  if (cycle.status === 'Approved') {
    statusColor = [16, 185, 129]; // emerald-500
  } else if (cycle.status === 'Returned for Correction') {
    statusColor = [239, 68, 68]; // red-500
  } else if (cycle.status === 'Submitted') {
    statusColor = [217, 119, 6]; // amber-500
  }
  doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.text(cycle.status.toUpperCase(), margin + 175, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(cycle.submittedAt || 'N/A', margin + 175, y + 12);

  // Section: Planned Targets & Key Result Areas
  y = 86;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("KEY RESULT AREAS (KRA), PLANNED ACTIVITIES & SUCCESS MEASURES", margin, y);

  y += 3;
  // Table header
  doc.setFillColor(241, 245, 249); // slate-100
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.rect(margin, y, contentWidth, 8, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text("No. / Key Result Area (KRA)", margin + 3, y + 5.5);
  doc.text("Planned Activities", margin + 62, y + 5.5);
  doc.text("Measure of Success", margin + 139, y + 5.5);
  doc.text("Due Date", margin + 201, y + 5.5);
  doc.text("Assessments (Staff / Supervisor)", margin + 225, y + 5.5);

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);

  // Render rows
  (cycle.targets || []).forEach((target, idx) => {
    // Check page height limit in landscape
    if (y > 155) {
      doc.addPage();
      y = 20;
      // Re-draw small header on new page
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(`Staff Performance Targets & Appraisals - ${cycle.staffName} (Cont.)`, margin, y);
      y += 4;
      doc.line(margin, y, width - margin, y);
      y += 6;
    }

    const rowStart = y;
    
    // Multi-line wrap in landscape
    const wrapKra = doc.splitTextToSize(`${idx + 1}. ${target.kra}`, 56);
    const wrapActivities = doc.splitTextToSize(target.plannedActivities, 72);
    const wrapSuccess = doc.splitTextToSize(target.measureOfSuccess, 56);
    
    const selfText = target.selfAssessment ? `Self: "${target.selfAssessment}"` : "Self: Pending";
    const supText = target.supervisorAssessment ? `PD: "${target.supervisorAssessment}"` : "PD: Pending";
    const assessmentText = `${selfText}\n${supText}`;
    const wrapAssessment = doc.splitTextToSize(assessmentText, 30);

    // Write texts
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(wrapKra, margin + 2, y + 4);
    doc.text(wrapActivities, margin + 62, y + 4);
    doc.text(wrapSuccess, margin + 139, y + 4);
    doc.text(target.targetDate, margin + 201, y + 4);
    doc.text(wrapAssessment, margin + 225, y + 4);

    // Calculate row height
    const maxLines = Math.max(wrapKra.length, wrapActivities.length, wrapSuccess.length, wrapAssessment.length);
    const rowHeight = Math.max(12, maxLines * 4 + 2);

    // Draw lines
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.line(margin, rowStart + rowHeight, width - margin, rowStart + rowHeight);

    y += rowHeight;
  });

  // End of table border
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, width - margin, y);

  y += 8;

  // Comments & Feedback block
  if (y > 145) {
    doc.addPage();
    y = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("OVERALL ASSESSMENTS & SIGNOFF FEEDBACK", margin, y);
  
  y += 4;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.rect(margin, y, contentWidth, 38, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  
  doc.text("Staff Reflections/Comment:", margin + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  const wrapSelfComment = doc.splitTextToSize(cycle.approvals.overallSelfComment || "No self comments logged yet.", contentWidth - 8);
  doc.text(wrapSelfComment, margin + 4, y + 10);

  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text("Project Director Commentary:", margin + 4, y + 4);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  const wrapSupervisorComment = doc.splitTextToSize(cycle.approvals.overallSupervisorComment || "No supervisor comments logged yet.", contentWidth - 8);
  doc.text(wrapSupervisorComment, margin + 4, y + 8);

  y += 26;

  // Signature Block
  if (y > 155) {
    doc.addPage();
    y = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("AUTHORIZATION SIGNATURE LAYOUT", margin, y);

  y += 6;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.rect(margin, y, contentWidth, 32, 'S');

  // Three signature columns
  const colWidth = contentWidth / 3;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  
  // 1. Staff Sign
  doc.text("1. STAFF MEMBER SIGN", margin + 5, y + 6);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(15, 23, 42);
  doc.text(cycle.approvals.staffSignedName ? `Signed: ${cycle.approvals.staffSignedName}` : "UNSIGNED", margin + 5, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Date: ${cycle.approvals.staffSignedDate || 'Pending'}`, margin + 5, y + 24);

  // 2. PD Sign
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text("2. PROJECT DIRECTOR SIGN", margin + colWidth + 5, y + 6);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(15, 23, 42);
  doc.text(cycle.approvals.supervisorSignedName ? `Signed: ${cycle.approvals.supervisorSignedName}` : "PENDING", margin + colWidth + 5, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Date: ${cycle.approvals.supervisorSignedDate || 'Pending'}`, margin + colWidth + 5, y + 24);

  // 3. Overseer Sign
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text("3. REVIEWING OVERSEER SIGN", margin + (colWidth * 2) + 5, y + 6);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(15, 23, 42);
  doc.text(cycle.approvals.reviewerSignedName ? `Signed: ${cycle.approvals.reviewerSignedName}` : "PENDING", margin + (colWidth * 2) + 5, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Date: ${cycle.approvals.reviewerSignedDate || 'Pending'}`, margin + (colWidth * 2) + 5, y + 24);

  y += 42;

  // Footer / Disclaimer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184); // slate-400
  const disclaimerText = "Disclaimer: This document is a digitally synchronized official staff performance blueprint from the Lomuriangole Child and Youth Development Center UG-1083. Signature fields are electronic logs validated with secure user roles upon submission.";
  const wrapDisclaimer = doc.splitTextToSize(disclaimerText, contentWidth);
  doc.text(wrapDisclaimer, margin, height - 15);

  // Save the PDF
  const cleanName = cycle.staffName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  doc.save(`performance_plan_${cleanName}_${cycle.fiscalYear.replace(/[^a-zA-Z0-9]/g, '')}.pdf`);
};
