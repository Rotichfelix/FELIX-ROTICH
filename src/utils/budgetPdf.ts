import { jsPDF } from 'jspdf';
import { getLogoPngDataUri } from '../components/LogoSVG';
import { Budget } from '../types';

export const generateBudgetPDF = (budget: Budget, shouldPrint: boolean = false) => {
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

  // Separating thick black horizontal line
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.4);
  doc.line(margin, 34.5, width - margin, 34.5);

  // Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("OFFICIAL PROGRAM BUDGET STATEMENT", centerX, 41, { align: 'center' });

  // Budget Status & Details Metadata Grid
  y = 48;
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setFillColor(248, 250, 252); // slate-50
  doc.rect(margin, y, contentWidth, 32, 'F');
  doc.rect(margin, y, contentWidth, 32, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // slate-600

  // Left column
  doc.text("Budget Reference ID:", margin + 5, y + 6);
  doc.text("Department Category:", margin + 5, y + 12);
  doc.text("Date Submitted:", margin + 5, y + 18);
  doc.text("Prepared & Submitted By:", margin + 5, y + 24);

  // Values left column
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(budget.id, margin + 45, y + 6);
  doc.text(budget.category.toUpperCase(), margin + 45, y + 12);
  doc.text(budget.submittedAt, margin + 45, y + 18);
  doc.text(budget.submittedBy, margin + 45, y + 24);

  // Right column
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text("Status:", margin + 110, y + 6);
  doc.text("Grand Total Amount:", margin + 110, y + 12);

  // Values right column
  doc.setFont('helvetica', 'bold');
  let statusColor = [51, 65, 85]; // slate-700
  if (budget.status === 'Approved') {
    statusColor = [16, 185, 129]; // emerald-500
  } else if (budget.status === 'Returned for Correction') {
    statusColor = [239, 68, 68]; // red-500
  } else {
    statusColor = [217, 119, 6]; // amber-600
  }
  doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.text(budget.status.toUpperCase(), margin + 145, y + 6);

  doc.setTextColor(15, 23, 42);
  doc.text(`UGX ${budget.amount.toLocaleString()}`, margin + 145, y + 12);

  // Line items Title
  y = 86;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("DETAILED FINANCIAL ESTIMATES / PROPOSAL ITEMS", margin, y);

  // Table Headers
  y = 91;
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(margin, y, contentWidth, 8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text("#", margin + 3, y + 5.5);
  doc.text("Item / Expense Description", margin + 12, y + 5.5);
  doc.text("Quantity", margin + 95, y + 5.5, { align: 'right' });
  doc.text("Unit Cost (UGX)", margin + 130, y + 5.5, { align: 'right' });
  doc.text("Total (UGX)", margin + 165, y + 5.5, { align: 'right' });

  // Items rows
  y = 99;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  
  if (budget.items && budget.items.length > 0) {
    budget.items.forEach((item, index) => {
      // Row Background alternating
      if (index % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, 7, 'F');
      }
      // Row borders
      doc.setDrawColor(241, 245, 249);
      doc.line(margin, y + 7, width - margin, y + 7);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(String(index + 1), margin + 3, y + 4.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(item.name, margin + 12, y + 4.5);
      doc.text(String(item.qty), margin + 95, y + 4.5, { align: 'right' });
      doc.text(item.unitCost.toLocaleString(), margin + 130, y + 4.5, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text((item.qty * item.unitCost).toLocaleString(), margin + 165, y + 4.5, { align: 'right' });

      y += 7;
    });
  } else {
    // Single row with total if no split items
    doc.text("1", margin + 3, y + 4.5);
    doc.text(budget.title, margin + 12, y + 4.5);
    doc.text("1", margin + 95, y + 4.5, { align: 'right' });
    doc.text(budget.amount.toLocaleString(), margin + 130, y + 4.5, { align: 'right' });
    doc.text(budget.amount.toLocaleString(), margin + 165, y + 4.5, { align: 'right' });
    y += 7;
  }

  // Summary Row (Grand Total)
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.line(margin, y, width - margin, y);
  doc.line(margin, y + 8, width - margin, y + 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text("GRAND TOTAL BUDGET ESTIMATE", margin + 12, y + 5.5);
  doc.text(`UGX ${budget.amount.toLocaleString()}`, margin + 165, y + 5.5, { align: 'right' });

  y += 14;

  // Description / Justification block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text("BUDGET JUSTIFICATION & COMPLIANCE NOTES", margin, y);

  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  
  const splitDesc = doc.splitTextToSize(budget.description || "No description provided.", contentWidth);
  doc.text(splitDesc, margin, y);
  y += splitDesc.length * 3.5;

  // Correction Notes (if returned)
  if (budget.status === 'Returned for Correction' && budget.correctionNotes) {
    y += 5;
    doc.setFillColor(254, 242, 242); // red-50
    doc.setDrawColor(254, 202, 202); // red-200
    doc.rect(margin, y, contentWidth, 18, 'F');
    doc.rect(margin, y, contentWidth, 18, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(220, 38, 38); // red-600
    doc.text("CORRECTION REQUEST FROM PROJECT DIRECTOR (RETURNED):", margin + 4, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(153, 27, 27); // red-800
    const splitCorr = doc.splitTextToSize(budget.correctionNotes, contentWidth - 8);
    doc.text(splitCorr, margin + 4, y + 9.5);
    y += 22;
  }

  // Signature Block
  y = Math.max(y + 12, 220); // Push to bottom if space is available, otherwise normal flow

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(margin, y, margin + 65, y);
  doc.line(width - margin - 65, y, width - margin, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text("Prepared By: CDO / Department Head", margin + 2, y + 4.5);
  doc.text("Authorized By: Project Director (PD)", width - margin - 63, y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text("Signature: ................................................", margin + 2, y + 10);
  doc.text("Signature: ................................................", width - margin - 63, y + 10);

  doc.text(`Date: ......................................................`, margin + 2, y + 15.5);
  doc.text(`Date: ......................................................`, width - margin - 63, y + 15.5);

  // Footer info
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text("Lomuriangole Child & Youth Development Center UG 1083 - Official Budgets Registry. Confidential.", width / 2, height - 10, { align: 'center' });

  // Handle Action (Print vs Download)
  const cleanTitle = (budget.title || 'budget').replace(/\s+/g, '_').toLowerCase();
  const fileName = `budget_proposal_${cleanTitle}_${budget.id}.pdf`;

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
          doc.save(fileName);
        }
      } catch (printErr) {
        console.warn("Iframe printing blocked by security policies. Downloading file instead:", printErr);
        doc.save(fileName);
      }
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 5000);
    };
  } else {
    doc.save(fileName);
  }
};
