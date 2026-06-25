import { jsPDF } from 'jspdf';
import { getLogoPngDataUri } from '../components/LogoSVG';

export interface StaffTask {
  id: string;
  title: string;
  assignedRole: 'CDO HEALTH' | 'CDO SDR' | 'CDO HBP';
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in-progress' | 'completed';
  dueDate: string;
  description: string;
  descriptions?: string[]; // Multiple description/activities
  createdByRole?: 'CDO HEALTH' | 'CDO SDR' | 'CDO HBP' | 'PROJECT DIRECTOR';
  approvalStatus?: 'pending_approval' | 'approved' | 'returned';
  correctionNotes?: string;
}

export const generateWorkplanPDF = (task: StaffTask, shouldPrint: boolean = false) => {
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
  doc.text("OFFICIAL PROGRAM WORKPLAN & TASK BRIEF", centerX, 41, { align: 'center' });

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
  doc.text("Workplan/Task ID:", margin + 5, y + 6);
  doc.text("Department Role:", margin + 5, y + 12);
  doc.text("Proposed/Created By:", margin + 5, y + 18);
  doc.text("Target Due Date:", margin + 5, y + 24);

  // Values left column
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(task.id, margin + 45, y + 6);
  doc.text(task.assignedRole, margin + 45, y + 12);
  doc.text(task.createdByRole || 'PROJECT DIRECTOR', margin + 45, y + 18);
  doc.text(task.dueDate, margin + 45, y + 24);

  // Right column
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text("Approval Status:", margin + 110, y + 6);
  doc.text("Priority Level:", margin + 110, y + 12);
  doc.text("Execution Status:", margin + 110, y + 18);

  // Values right column
  doc.setFont('helvetica', 'bold');
  const isApproved = !task.approvalStatus || task.approvalStatus === 'approved';
  const approvalLabel = isApproved ? 'APPROVED / AUTHORIZED' : task.approvalStatus === 'pending_approval' ? 'PENDING APPROVAL' : 'RETURNED FOR CORRECTION';
  const approvalColor = isApproved ? [16, 185, 129] : task.approvalStatus === 'pending_approval' ? [217, 119, 6] : [239, 68, 68];
  
  doc.setTextColor(approvalColor[0], approvalColor[1], approvalColor[2]);
  doc.text(approvalLabel, margin + 138, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(task.priority.toUpperCase(), margin + 138, y + 12);
  doc.text(task.status.toUpperCase(), margin + 138, y + 18);

  // Task Title Section
  y = 88;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("WORKPLAN TASK TITLE", margin, y);
  
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(79, 70, 229); // Indigo-600
  doc.text(task.title.toUpperCase(), margin, y);

  // Main Description Section
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("CORE OBJECTIVES & SPECIFICATIONS", margin, y);

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);

  const splitMainDesc = doc.splitTextToSize(task.description, contentWidth);
  doc.text(splitMainDesc, margin, y);
  
  y += (splitMainDesc.length * 4.5) + 6;

  // Additional Descriptions / Activities
  if (task.descriptions && task.descriptions.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text("PROPOSED ACTIVITY STEPS & DESCRIPTIONS", margin, y);

    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);

    task.descriptions.forEach((desc, index) => {
      if (!desc.trim()) return;
      
      // Page overflow check
      if (y > height - 40) {
        doc.addPage();
        y = 20;
      }

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(79, 70, 229); // Indigo
      doc.text(`Activity ${index + 1}:`, margin, y);
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      
      const splitDesc = doc.splitTextToSize(desc, contentWidth - 25);
      doc.text(splitDesc, margin + 22, y);
      
      y += (splitDesc.length * 4.5) + 6;
    });
  }

  // Divider
  if (y > height - 55) {
    doc.addPage();
    y = 25;
  } else {
    y += 4;
  }

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(margin, y, width - margin, y);
  y += 8;

  // Signatures Section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);

  doc.text("PREPARED & LOGGED BY:", margin, y);
  doc.text("AUTHORIZED & REVIEWED BY:", margin + 95, y);

  y += 12;
  doc.setDrawColor(148, 163, 184); // Slate-400
  doc.line(margin, y, margin + 65, y);
  doc.line(margin + 95, y, margin + 160, y);

  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);

  const creatorRoleLabel = task.createdByRole || 'PROJECT DIRECTOR';
  doc.text(`Role Specialist: ${creatorRoleLabel}`, margin, y);
  doc.text("Project Director (PD) / Center PM", margin + 95, y);

  y += 3.5;
  doc.text(`Lomuriangole CYDC Staff Office`, margin, y);
  doc.text(`Approval Verification Stamp: ${isApproved ? 'VERIFIED ACTIVE' : 'PENDING'}`, margin + 95, y);

  if (shouldPrint) {
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  } else {
    doc.save(`UG1083_Workplan_${task.id}.pdf`);
  }
};
