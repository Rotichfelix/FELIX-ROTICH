import { StaffTask } from './workplanPdf';
import { Budget } from '../types';
import { StaffPerformanceCycle } from '../types';

/**
 * Downloads a structured HTML string as a .doc (Word) file.
 */
export const downloadAsWordFile = (htmlContent: string, fileName: string) => {
  const header = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' 
          xmlns:w='urn:schemas-microsoft-com:office:word' 
          xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <title>Lomuriangole CYDC Official Document</title>
      <meta charset='utf-8'>
      <style>
        body {
          font-family: Arial, sans-serif;
          font-size: 11pt;
          line-height: 1.5;
          color: #0f172a;
          margin: 1in;
        }
        h1 {
          font-size: 18pt;
          font-weight: bold;
          color: #1e1b4b;
          text-align: center;
          margin-bottom: 5px;
        }
        h2 {
          font-size: 14pt;
          font-weight: bold;
          color: #312e81;
          margin-top: 20px;
          margin-bottom: 10px;
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 5px;
        }
        h3 {
          font-size: 11pt;
          font-weight: bold;
          color: #4338ca;
          margin-top: 15px;
          margin-bottom: 5px;
        }
        .header-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        .header-cell {
          text-align: center;
          color: #334155;
        }
        .meta-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 25px;
          background-color: #f8fafc;
          border: 1px solid #cbd5e1;
        }
        .meta-table td {
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          font-size: 10pt;
        }
        .meta-label {
          font-weight: bold;
          color: #475569;
          width: 25%;
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 25px;
        }
        .data-table th {
          background-color: #f1f5f9;
          color: #334155;
          font-weight: bold;
          font-size: 10pt;
          padding: 10px;
          border: 1px solid #cbd5e1;
          text-align: left;
        }
        .data-table td {
          padding: 10px;
          border: 1px solid #cbd5e1;
          font-size: 9.5pt;
          vertical-align: top;
        }
        .badge {
          display: inline-block;
          padding: 3px 8px;
          font-weight: bold;
          font-size: 8.5pt;
          text-transform: uppercase;
          border-radius: 4px;
        }
        .badge-approved { background-color: #d1fae5; color: #065f46; }
        .badge-pending { background-color: #fef3c7; color: #92400e; }
        .badge-returned { background-color: #fee2e2; color: #991b1b; }
        .signature-section {
          width: 100%;
          border-collapse: collapse;
          margin-top: 30px;
        }
        .signature-box {
          width: 33%;
          border: 1px solid #cbd5e1;
          padding: 15px;
          vertical-align: top;
          background-color: #fafafa;
        }
        .signature-title {
          font-size: 9pt;
          font-weight: bold;
          color: #475569;
          text-transform: uppercase;
          margin-bottom: 15px;
        }
        .signature-line {
          font-style: italic;
          font-weight: bold;
          border-bottom: 1px dashed #cbd5e1;
          padding-bottom: 5px;
          margin-bottom: 5px;
        }
        .footer-note {
          font-size: 8pt;
          color: #94a3b8;
          text-align: center;
          margin-top: 40px;
          border-t: 1px solid #e2e8f0;
          padding-top: 10px;
        }
      </style>
    </head>
    <body>
  `;

  const footer = `
      <div class="footer-note">
        Disclaimer: This Word document is an official synchronized administrative copy from Lomuriangole CYDC UG-1083. 
        Secure digital signature entries are automatically validated against role credentials upon submission.
      </div>
    </body>
    </html>
  `;

  const fullContent = header + htmlContent + footer;
  const blob = new Blob(['\ufeff' + fullContent], {
    type: 'application/msword;charset=utf-8'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Word Document for Workplan Task
 */
export const generateWorkplanWord = (task: StaffTask) => {
  const html = `
    <table class="header-table">
      <tr>
        <td class="header-cell">
          <strong style="font-size: 13pt; color: #0f172a;">LOMURIANGOLE CHILD AND YOUTH DEVELOPMENT CENTER UG-1083</strong><br/>
          <span style="font-size: 9.5pt; color: #475569;">P.O BOX 57 MOROTO, UGANDA • TEL: 0778687473 / 078436428 / 0784522071</span><br/>
          <span style="font-size: 9.5pt; color: #2563eb;">Email: lomuriangolecydc@gmail.com</span>
        </td>
      </tr>
    </table>
    
    <hr style="border: none; border-top: 3px double #0f172a; margin-bottom: 20px;"/>
    
    <h1 style="font-size: 16pt;">OFFICIAL PROGRAM WORKPLAN & TASK BRIEF</h1>
    
    <h2>1. WORKPLAN GENERAL METADATA</h2>
    <table class="meta-table">
      <tr>
        <td class="meta-label">Workplan Task ID:</td>
        <td><strong>${task.id}</strong></td>
        <td class="meta-label">Approval Status:</td>
        <td>
          <span class="badge ${
            task.approvalStatus === 'approved' ? 'badge-approved' : 
            task.approvalStatus === 'returned' ? 'badge-returned' : 'badge-pending'
          }">
            ${task.approvalStatus || 'pending'}
          </span>
        </td>
      </tr>
      <tr>
        <td class="meta-label">Department Role:</td>
        <td>${task.assignedRole}</td>
        <td class="meta-label">Task Priority:</td>
        <td><strong style="color: ${task.priority === 'high' ? '#dc2626' : '#475569'}">${task.priority.toUpperCase()}</strong></td>
      </tr>
      <tr>
        <td class="meta-label">Proposed By:</td>
        <td>${task.createdByRole || 'PROJECT DIRECTOR'}</td>
        <td class="meta-label">Target Due Date:</td>
        <td><strong>${task.dueDate}</strong></td>
      </tr>
    </table>

    <h2>2. MISSION TASK DESCRIPTION</h2>
    <div style="background-color: #fdfdfd; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
      <h3 style="margin-top: 0;">${task.title}</h3>
      <p style="font-size: 10.5pt; color: #334155; white-space: pre-line;">${task.description}</p>
    </div>

    ${task.descriptions && task.descriptions.length > 0 ? `
      <h2>3. ACTIVITY MILESTONES & SUB-TASKS</h2>
      <ol style="margin-left: 20px; padding-left: 0; font-size: 10.5pt; color: #334155; line-height: 1.6;">
        ${task.descriptions.map(desc => `<li>${desc}</li>`).join('')}
      </ol>
    ` : ''}

    ${task.correctionNotes ? `
      <div style="background-color: #fffaf0; border: 1px solid #fbd38d; padding: 12px; border-radius: 6px; margin-top: 20px; margin-bottom: 20px;">
        <strong style="color: #c05621; font-size: 10pt;">PD Return Corrections Feedback:</strong>
        <p style="font-style: italic; color: #7b341e; margin-top: 5px; font-size: 9.5pt;">"${task.correctionNotes}"</p>
      </div>
    ` : ''}

    <h2>4. AUTHORIZATION LOGS</h2>
    <table class="signature-section">
      <tr>
        <td class="signature-box">
          <div class="signature-title">1. Assigned Staff Member</div>
          <div class="signature-line">✍️ ${task.assignedRole}</div>
          <div style="font-size: 8.5pt; color: #64748b;">Status: Authorized execution</div>
        </td>
        <td class="signature-box" style="width: 2%;"></td>
        <td class="signature-box">
          <div class="signature-title">2. Supervisor (Project Director)</div>
          <div class="signature-line">✍️ Approved via Portal</div>
          <div style="font-size: 8.5pt; color: #64748b;">Role: Administrator</div>
        </td>
      </tr>
    </table>
  `;
  
  const cleanName = task.title.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
  downloadAsWordFile(html, `workplan_${cleanName}`);
};

/**
 * Word Document for Budget Proposal
 */
export const generateBudgetWord = (budget: Budget) => {
  const html = `
    <table class="header-table">
      <tr>
        <td class="header-cell">
          <strong style="font-size: 13pt; color: #0f172a;">LOMURIANGOLE CHILD AND YOUTH DEVELOPMENT CENTER UG-1083</strong><br/>
          <span style="font-size: 9.5pt; color: #475569;">P.O BOX 57 MOROTO, UGANDA • TEL: 0778687473 / 078436428 / 0784522071</span><br/>
          <span style="font-size: 9.5pt; color: #2563eb;">Email: lomuriangolecydc@gmail.com</span>
        </td>
      </tr>
    </table>
    
    <hr style="border: none; border-top: 3px double #0f172a; margin-bottom: 20px;"/>
    
    <h1 style="font-size: 16pt;">OFFICIAL PROGRAM BUDGET STATEMENT</h1>
    
    <h2>1. GENERAL METADATA</h2>
    <table class="meta-table">
      <tr>
        <td class="meta-label">Budget Reference ID:</td>
        <td><strong>${budget.id}</strong></td>
        <td class="meta-label">Proposal Status:</td>
        <td>
          <span class="badge ${
            budget.status === 'Approved' || budget.status === 'Signed-off' ? 'badge-approved' : 
            budget.status === 'Returned for Correction' ? 'badge-returned' : 'badge-pending'
          }">
            ${budget.status}
          </span>
        </td>
      </tr>
      <tr>
        <td class="meta-label">Department Category:</td>
        <td>${budget.category.toUpperCase()}</td>
        <td class="meta-label">Grand Total Amount:</td>
        <td><strong style="font-size: 12pt; color: #1e1b4b; font-family: monospace;">UGX ${budget.amount.toLocaleString()}</strong></td>
      </tr>
      <tr>
        <td class="meta-label">Prepared & Submitted By:</td>
        <td>${budget.submittedBy}</td>
        <td class="meta-label">Date Submitted:</td>
        <td><strong>${budget.submittedAt}</strong></td>
      </tr>
    </table>

    <h2>2. PROPOSAL OVERVIEW</h2>
    <div style="background-color: #fdfdfd; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
      <h3 style="margin-top: 0;">${budget.title}</h3>
      <p style="font-size: 10.5pt; color: #334155; white-space: pre-line;">${budget.description}</p>
    </div>

    <h2>3. DETAILED EXPENSE ESTIMATION SCHEDULER</h2>
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 5%;">No.</th>
          <th style="width: 45%;">Expense Item Description</th>
          <th style="width: 15%; text-align: right;">Quantity</th>
          <th style="width: 15%; text-align: right;">Unit Cost (UGX)</th>
          <th style="width: 20%; text-align: right;">Subtotal Amount (UGX)</th>
        </tr>
      </thead>
      <tbody>
        ${(budget.items || []).map((item, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td><strong>${item.name || 'Expense Item'}</strong></td>
            <td style="text-align: right;">${item.qty || 0}</td>
            <td style="text-align: right;">${(item.unitCost || 0).toLocaleString()}</td>
            <td style="text-align: right; font-weight: bold;">${((item.qty || 0) * (item.unitCost || 0)).toLocaleString()}</td>
          </tr>
        `).join('')}
        <tr style="background-color: #fafbfd; font-weight: bold;">
          <td colspan="4" style="text-align: right; padding: 12px; font-size: 11pt; border-top: 2px solid #94a3b8;">GRAND TOTAL AMOUNT:</td>
          <td style="text-align: right; padding: 12px; font-size: 11pt; color: #1e1b4b; border-top: 2px solid #94a3b8;">UGX ${budget.amount.toLocaleString()}</td>
        </tr>
      </tbody>
    </table>

    ${budget.correctionNotes ? `
      <div style="background-color: #fffaf0; border: 1px solid #fbd38d; padding: 12px; border-radius: 6px; margin-top: 20px; margin-bottom: 20px;">
        <strong style="color: #c05621; font-size: 10pt;">PD Correction Feedback:</strong>
        <p style="font-style: italic; color: #7b341e; margin-top: 5px; font-size: 9.5pt;">"${budget.correctionNotes}"</p>
      </div>
    ` : ''}

    <h2>4. AUTHORIZATION SIGNATURES</h2>
    <table class="signature-section">
      <tr>
        <td class="signature-box">
          <div class="signature-title">1. Assigned Staff Member</div>
          <div class="signature-line">✍️ ${budget.submittedBy}</div>
          <div style="font-size: 8.5pt; color: #64748b;">Submitted: ${budget.submittedAt}</div>
        </td>
        <td class="signature-box" style="width: 2%;"></td>
        <td class="signature-box">
          <div class="signature-title">2. Supervisor (Project Director)</div>
          <div class="signature-line">✍️ Approved via Portal</div>
          <div style="font-size: 8.5pt; color: #64748b;">Status: Authorized budget</div>
        </td>
      </tr>
    </table>
  `;

  const cleanName = budget.title.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
  downloadAsWordFile(html, `budget_${cleanName}`);
};

/**
 * Word Document for Staff Performance Cycle
 */
export const generatePerformanceWord = (cycle: StaffPerformanceCycle) => {
  const html = `
    <table class="header-table">
      <tr>
        <td class="header-cell">
          <strong style="font-size: 13pt; color: #0f172a;">LOMURIANGOLE CHILD AND YOUTH DEVELOPMENT CENTER UG-1083</strong><br/>
          <span style="font-size: 9.5pt; color: #475569;">P.O BOX 57 MOROTO, UGANDA • TEL: 0778687473 / 078436428 / 0784522071</span><br/>
          <span style="font-size: 9.5pt; color: #2563eb;">Email: lomuriangolecydc@gmail.com</span>
        </td>
      </tr>
    </table>
    
    <hr style="border: none; border-top: 3px double #0f172a; margin-bottom: 20px;"/>
    
    <h1 style="font-size: 16pt;">OFFICIAL STAFF PERFORMANCE PLAN & APPRAISAL</h1>
    
    <h2>1. RECIPIENT & CONTEXT INFORMATION</h2>
    <table class="meta-table">
      <tr>
        <td class="meta-label">Performance Plan ID:</td>
        <td><strong>${cycle.id}</strong></td>
        <td class="meta-label">Cycle Status:</td>
        <td>
          <span class="badge ${
            cycle.status === 'Approved' ? 'badge-approved' : 
            cycle.status === 'Returned for Correction' ? 'badge-returned' : 'badge-pending'
          }">
            ${cycle.status}
          </span>
        </td>
      </tr>
      <tr>
        <td class="meta-label">Staff Member Name:</td>
        <td><strong>${cycle.staffName}</strong></td>
        <td class="meta-label">Department / Role:</td>
        <td>${cycle.staffRole}</td>
      </tr>
      <tr>
        <td class="meta-label">Fiscal Cycle Year:</td>
        <td>${cycle.fiscalYear}</td>
        <td class="meta-label">Date Submitted:</td>
        <td><strong>${cycle.submittedAt}</strong></td>
      </tr>
    </table>

    <h2>2. KEY RESULT AREAS (KRA), PLANNED ACTIVITIES & SUCCESS MEASURES</h2>
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 5%;">No.</th>
          <th style="width: 20%;">Key Result Area (KRA)</th>
          <th style="width: 25%;">Planned Activities</th>
          <th style="width: 20%;">Measure of Success</th>
          <th style="width: 10%;">Target Date</th>
          <th style="width: 20%;">Assessments (Staff / Supervisor)</th>
        </tr>
      </thead>
      <tbody>
        ${(cycle.targets || []).map((target, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td><strong>${target.kra}</strong></td>
            <td>${target.plannedActivities}</td>
            <td>${target.measureOfSuccess}</td>
            <td style="font-family: monospace; font-size: 9pt;">${target.targetDate}</td>
            <td>
              <div style="font-size: 8.5pt; color: #1e293b;">
                <strong>Self:</strong> ${target.selfAssessment || 'Pending self appraisal'}
              </div>
              <div style="font-size: 8.5pt; color: #4338ca; margin-top: 4px;">
                <strong>PD:</strong> ${target.supervisorAssessment || 'Pending evaluation'}
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h2>3. OVERALL ASSESSMENTS & COMMENTARY</h2>
    <table class="meta-table">
      <tr>
        <td class="meta-label" style="width: 30%;">Staff Reflections/Comments:</td>
        <td style="font-style: italic;">"${cycle.approvals.overallSelfComment || 'No overall comments logged by staff.'}"</td>
      </tr>
      <tr>
        <td class="meta-label">Project Director Commentary:</td>
        <td style="font-style: italic; color: #4338ca;">"${cycle.approvals.overallSupervisorComment || 'No comments logged by PD.'}"</td>
      </tr>
      <tr>
        <td class="meta-label">Governing Reviewer Comments:</td>
        <td style="font-style: italic; color: #6b21a8;">"${cycle.approvals.reviewerComment || 'No comments logged by Overseer.'}"</td>
      </tr>
    </table>

    ${cycle.correctionNotes ? `
      <div style="background-color: #fffaf0; border: 1px solid #fbd38d; padding: 12px; border-radius: 6px; margin-bottom: 20px;">
        <strong style="color: #c05621; font-size: 10pt;">PD Correction Feedback:</strong>
        <p style="font-style: italic; color: #7b341e; margin-top: 5px; font-size: 9.5pt;">"${cycle.correctionNotes}"</p>
      </div>
    ` : ''}

    <h2>4. AUTHORIZATION SIGNATURES</h2>
    <table class="signature-section">
      <tr>
        <td class="signature-box">
          <div class="signature-title">1. Staff Member Sign-off</div>
          <div class="signature-line">✍️ ${cycle.approvals.staffSignedName || 'UNSIGNED'}</div>
          <div style="font-size: 8pt; color: #64748b;">Date: ${cycle.approvals.staffSignedDate || 'Pending'}</div>
        </td>
        <td class="signature-box" style="width: 2%;"></td>
        <td class="signature-box">
          <div class="signature-title">2. Supervisor (PD) Sign-off</div>
          <div class="signature-line">✍️ ${cycle.approvals.supervisorSignedName || 'PENDING ACTION'}</div>
          <div style="font-size: 8pt; color: #64748b;">Date: ${cycle.approvals.supervisorSignedDate || 'Pending'}</div>
        </td>
        <td class="signature-box" style="width: 2%;"></td>
        <td class="signature-box">
          <div class="signature-title">3. Governing Reviewer (Overseer)</div>
          <div class="signature-line">✍️ ${cycle.approvals.reviewerSignedName || 'PENDING ACTIONS'}</div>
          <div style="font-size: 8pt; color: #64748b;">Date: ${cycle.approvals.reviewerSignedDate || 'Pending'}</div>
        </td>
      </tr>
    </table>
  `;

  const cleanName = cycle.staffName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  downloadAsWordFile(html, `performance_plan_${cleanName}`);
};
