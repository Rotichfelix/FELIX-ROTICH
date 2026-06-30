import { jsPDF } from 'jspdf';
import { getLogoPngDataUri } from '../components/LogoSVG';
import { PettyCashRequest } from '../types';

export const generatePettyCashPDF = (request: PettyCashRequest, shouldPrint: boolean = false) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  
  // Page dimensions
  const width = 210;
  const height = 297;
  const margin = 20;
  const contentWidth = width - (margin * 2); // 170

  let y = 15;

  // Header Block
  try {
    doc.addImage(getLogoPngDataUri(), 'PNG', 22, 11, 15, 15);
  } catch (e) {
    console.error("Failed to add logo:", e);
  }

  const centerX = 105;

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

  // Separating thick horizontal line
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.4);
  doc.line(margin, 34.5, width - margin, 34.5);

  // Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("OFFICIAL PETTY CASH VOUCHER / REQUEST", centerX, 41, { align: 'center' });

  // Status & Details Metadata Grid
  y = 48;
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setFillColor(248, 250, 252); // slate-50
  doc.rect(margin, y, contentWidth, 32, 'F');
  doc.rect(margin, y, contentWidth, 32, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // slate-600

  // Left column
  doc.text("Voucher Reference ID:", margin + 5, y + 6);
  doc.text("Department/Requester:", margin + 5, y + 12);
  doc.text("Request/Activity Date:", margin + 5, y + 18);
  doc.text("Date Submitted:", margin + 5, y + 24);

  // Values left column
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(request.id, margin + 45, y + 6);
  doc.text(request.submittedBy, margin + 45, y + 12);
  doc.text(request.dates, margin + 45, y + 18);
  doc.text(request.submittedAt, margin + 45, y + 24);

  // Right column
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text("Status:", margin + 110, y + 6);
  doc.text("Requested Amount:", margin + 110, y + 12);

  // Values right column
  doc.setFont('helvetica', 'bold');
  let statusColor = [51, 65, 85]; // slate-700
  if (request.status === 'Approved') {
    statusColor = [16, 185, 129]; // emerald-500
  } else if (request.status === 'Rejected') {
    statusColor = [239, 68, 68]; // red-500
  } else if (request.status === 'Returned for Correction') {
    statusColor = [168, 85, 247]; // purple-500
  } else {
    statusColor = [217, 119, 6]; // amber-600
  }
  doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.text(request.status.toUpperCase(), margin + 145, y + 6);

  doc.setTextColor(15, 23, 42);
  doc.text(`UGX ${request.amount.toLocaleString()}`, margin + 145, y + 12);

  // Justification Title
  y = 86;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text("PURPOSE & JUSTIFICATION DETAILS", margin, y);

  // Purpose box
  y = 91;
  doc.setDrawColor(241, 245, 249);
  doc.setFillColor(255, 255, 255);
  doc.rect(margin, y, contentWidth, 75, 'F');
  doc.rect(margin, y, contentWidth, 75, 'S');

  // Draw Raw Purpose
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text("Initial Purpose Statement:", margin + 5, y + 6);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const splitRawPurpose = doc.splitTextToSize(request.purpose, contentWidth - 10);
  doc.text(splitRawPurpose, margin + 5, y + 11);

  // Draw AI Enhanced Justification if present
  let nextYOffset = 16 + (splitRawPurpose.length * 3.5);
  if (request.aiEnhancedExplanation) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(37, 99, 235); // Blue
    doc.text("Formal Justification:", margin + 5, y + nextYOffset);

    doc.setFont('helvetica', 'oblique');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    const splitAiJustification = doc.splitTextToSize(request.aiEnhancedExplanation, contentWidth - 10);
    doc.text(splitAiJustification, margin + 5, y + nextYOffset + 5);
  }

  // Draw Correction Notes if returned
  if (request.correctionNotes) {
    y = 172;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(239, 68, 68); // Red
    doc.text("PROJECT DIRECTOR CORRECTION FEEDBACK", margin, y);

    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(252, 165, 165);
    doc.rect(margin, y + 3, contentWidth, 20, 'F');
    doc.rect(margin, y + 3, contentWidth, 20, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(153, 27, 27);
    const splitNotes = doc.splitTextToSize(request.correctionNotes, contentWidth - 10);
    doc.text(splitNotes, margin + 5, y + 10);
  }

  // Signature Block
  y = 210;
  doc.setLineWidth(0.2);
  doc.setDrawColor(203, 213, 225); // slate-300

  // 1st Signature Line (Requester)
  doc.line(margin, y + 15, margin + 55, y + 15);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text("Requester Signature", margin, y + 19);
  doc.setFont('helvetica', 'normal');
  doc.text(`${request.submittedBy} Officer`, margin, y + 23);

  // 2nd Signature Line (Project Director)
  doc.line(centerX - 27.5, y + 15, centerX + 27.5, y + 15);
  doc.setFont('helvetica', 'bold');
  doc.text("Project Director Approval", centerX, y + 19, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text(request.status === 'Approved' ? "APPROVED - SIGNED ELECTRONICALLY" : "PENDING REVIEW", centerX, y + 23, { align: 'center' });

  // 3rd Signature Line (Petty Cash Manager)
  doc.line(width - margin - 55, y + 15, width - margin, y + 15);
  doc.setFont('helvetica', 'bold');
  doc.text("Petty Cash Manager", width - margin, y + 19, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(request.status === 'Approved' ? "Awaiting Disbursement" : "Awaiting PD Approval", width - margin, y + 23, { align: 'right' });

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`Voucher ID: ${request.id} • Printed on ${new Date().toLocaleDateString()}`, centerX, height - 10, { align: 'center' });

  if (shouldPrint) {
    const stringData = doc.output('bloburl');
    window.open(stringData, '_blank');
  } else {
    doc.save(`Lomuriangole_PettyCash_${request.id}.pdf`);
  }
};
