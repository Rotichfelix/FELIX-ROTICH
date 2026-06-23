import { jsPDF } from 'jspdf';
import { getLogoBase64DataUri } from '../components/LogoSVG';

interface PageNumState {
  current: number;
}

// Check page flow and add new pages dynamically
function drawDividerAndY(doc: jsPDF, y: number, heightNeeded: number, title: string, isEmpty: boolean, pageState: PageNumState): number {
  const pageHeight = 297;
  const margin = 20;
  
  if (y + heightNeeded > pageHeight - margin) {
    doc.addPage();
    pageState.current += 1;
    
    // Header on subsequent pages
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(`LOMURIANGOLE CYDC UG-1083 - ${title.toUpperCase()} ${isEmpty ? '(TEMPLATE)' : '(OFFICIAL RECORD)'}`, 105, 12, { align: 'center' });
    
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.line(20, 14, 190, 14);
    
    // Footer line
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Page ${pageState.current}`, 105, 287, { align: 'center' });
    
    return 20; // reset y to top of content
  }
  return y;
}

// Draw official header
function addOfficialHeader(doc: jsPDF, title: string, participantName?: string) {
  const centerX = 105;
  
  // Add the Logo on the left of the header
  try {
    const logoUri = getLogoBase64DataUri();
    doc.addImage(logoUri, 'SVG', 22, 11, 15, 15);
  } catch (error) {
    console.error("Failed to add SVG logo to form PDF:", error);
  }
  
  // Center Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text("LOMURIANGOLE CHILD AND YOUTH DEVELOPMENT CENTER UG-1083", centerX, 15, { align: 'center' });

  // Address
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text("P.O BOX 57 MOROTO, UGANDA", centerX, 19.5, { align: 'center' });

  // Telephone
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text("TEL: ", centerX - 35, 24);
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(217, 119, 6); // Amber-500
  doc.text("0778687473 / 078436428 / 0784522071", centerX + 5, 24, { align: 'center' });

  // Divider Line
  doc.setDrawColor(217, 119, 6);
  doc.setLineWidth(0.8);
  doc.line(20, 27, 190, 27);

  // Subtitle (The Form Name)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(190, 24, 74); // Rose-700
  doc.text(title.toUpperCase(), centerX, 33, { align: 'center' });

  if (participantName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(`BENEFICIARY APPLICANT: ${participantName.toUpperCase()}`, centerX, 38, { align: 'center' });
    return 43;
  }
  return 39;
}

// Utility to print key-value label in the PDF
function drawField(
  doc: jsPDF, 
  x: number, 
  y: number, 
  label: string, 
  value: string | undefined, 
  isEmpty: boolean, 
  width: number = 80
) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(`${label}:`, x, y);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  
  const labelWidth = doc.getTextWidth(`${label}: `);
  const valX = x + labelWidth;
  
  if (isEmpty) {
    // Print handwriting underline lines
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.setLineWidth(0.2);
    doc.line(valX, y + 0.5, x + width, y + 0.5);
  } else {
    const displayVal = value && value.trim() ? value : 'N/A';
    doc.text(displayVal, valX, y);
  }
}

// Draw custom checkbox item
function drawCheckbox(
  doc: jsPDF, 
  x: number, 
  y: number, 
  label: string, 
  isChecked: boolean, 
  isEmpty: boolean
) {
  // Draw checkbox square box
  doc.setDrawColor(71, 85, 105);
  doc.setLineWidth(0.3);
  doc.rect(x, y - 2.8, 3, 3);
  
  if (!isEmpty && isChecked) {
    // Fill/check color
    doc.setFillColor(190, 24, 74); // Rose-700
    doc.rect(x + 0.6, y - 2.2, 1.8, 1.8, 'F');
  }
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(label, x + 4.5, y - 0.2);
}

// Draw custom paragraph block with support for word wrap
function drawParagraph(
  doc: jsPDF, 
  x: number, 
  y: number, 
  label: string, 
  value: string | undefined, 
  isEmpty: boolean, 
  width: number = 170,
  rowHeight: number = 4
): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(label, x, y);
  
  let currentY = y + 4.5;
  
  if (isEmpty) {
    // Print empty parallel handwriting guide lines
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.line(x, currentY, x + width, currentY);
    currentY += 6;
    doc.line(x, currentY, x + width, currentY);
    currentY += 6;
    doc.line(x, currentY, x + width, currentY);
    return currentY + 2;
  }
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  
  const displayVal = value && value.trim() ? value : 'None recorded / Not specified.';
  const splitText = doc.splitTextToSize(displayVal, width);
  
  doc.text(splitText, x, currentY);
  currentY += (splitText.length * rowHeight);
  return currentY + 2;
}

// Generate the high fidelity PDF
export function generateFormPDF(
  formType: 'Home Visit' | 'School Visit' | 'Sick Participant Follow' | 'Follow-Up' | 'Referral' | 'Discharge Summary',
  formData: any,
  isEmpty: boolean = false,
  participantName?: string
) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageState: PageNumState = { current: 1 };
  
  // Setup first page footer
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(`Page 1`, 105, 287, { align: 'center' });

  // Initial title
  const title = `${formType} Questionnaire Form`;
  let y = addOfficialHeader(doc, title, participantName);
  
  // ----------------------------------------------------
  // SCHOOL VISIT FORM LAYOUT
  // ----------------------------------------------------
  if (formType === 'School Visit') {
    // -- Section 1: General Info
    y = drawDividerAndY(doc, y, 35, formType, isEmpty, pageState);
    doc.setFillColor(248, 250, 252); // slate-50 background for section header
    doc.rect(20, y, 170, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text("1. GENERAL IDENTIFICATION & VISIT LOG", 23, y + 3.8);
    y += 10;
    
    drawField(doc, 20, y, "Staff Name", formData.staffName, isEmpty, 75);
    drawField(doc, 105, y, "FCP Name", formData.fcpName, isEmpty, 85);
    y += 6;
    drawField(doc, 20, y, "Date of Visit", formData.date, isEmpty, 75);
    drawField(doc, 105, y, "Duration", (formData.timeFrom && formData.timeTo) ? `${formData.timeFrom} to ${formData.timeTo}` : undefined, isEmpty, 85);
    y += 6;
    drawField(doc, 20, y, "School Name", formData.schoolName, isEmpty, 75);
    drawField(doc, 105, y, "School Location", formData.schoolLocation, isEmpty, 85);
    y += 6;
    drawField(doc, 20, y, "School Type", formData.schoolType, isEmpty, 75);
    drawField(doc, 105, y, "School Level", formData.schoolLevel, isEmpty, 85);
    y += 10;
    
    // -- Section 2: Purpose of Visit
    y = drawDividerAndY(doc, y, 25, formType, isEmpty, pageState);
    doc.setFillColor(248, 250, 252);
    doc.rect(20, y, 170, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text("2. PURPOSES OF THE RECONNAISSANCE VISIT", 23, y + 3.8);
    y += 10;
    
    const purposes = [
      'Check on Sponsored Learners',
      'Monitor School Environment',
      'Follow-Up on Support Given',
      'Hold Discussions with Teachers/Admin',
      'Assess Performance and Attendance'
    ];
    
    purposes.forEach((p, idx) => {
      const isChecked = formData[`purpose_${p}`] === true;
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const px = col === 0 ? 20 : 105;
      const py = y + (row * 6);
      drawCheckbox(doc, px, py, p, isChecked, isEmpty);
    });
    
    // Other description
    const isOtherChecked = formData.purpose_Other_Checked === true;
    const otherY = y + 18;
    drawCheckbox(doc, 20, otherY, "Other:", isOtherChecked, isEmpty);
    drawField(doc, 35, otherY - 0.5, "Specify", formData.purpose_Other, isEmpty, 155);
    y += 26;
    
    // -- Section 3: Student Registry
    y = drawDividerAndY(doc, y, 32, formType, isEmpty, pageState);
    doc.setFillColor(248, 250, 252);
    doc.rect(20, y, 170, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text("3. COVERED LEARNERS / STUDENTS RECORD", 23, y + 3.8);
    y += 9;
    y = drawParagraph(doc, 20, y, "Record Details (Name, Class, Sex, General Progress Notes)", formData.participantInfo, isEmpty);
    y += 4;
    
    // -- Section 4: Welfare ratings
    y = drawDividerAndY(doc, y, 35, formType, isEmpty, pageState);
    doc.setFillColor(248, 250, 252);
    doc.rect(20, y, 170, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text("4. GENERAL SCHOOL WELL-BEING RATINGS", 23, y + 3.8);
    y += 8;
    
    const welfareTopics = [
      'Learner has school uniform',
      'Learner has learning materials',
      'Learner appears physically healthy',
      'Attends school regularly',
      'Receives school meals',
      'Shows signs of distress or abuse'
    ];
    
    welfareTopics.forEach((topic, idx) => {
      y = drawDividerAndY(doc, y, 8, formType, isEmpty, pageState);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.text(`${idx + 1}. ${topic}`, 20, y);
      
      const ratingVal = formData[`welfare_${idx}`];
      drawField(doc, 110, y, "Status(Yes/No)", ratingVal, isEmpty, 25);
      
      const remarksVal = formData[`welfare_remarks_${idx}`];
      drawField(doc, 145, y, "Remarks", remarksVal, isEmpty, 45);
      y += 6;
    });
    y += 4;
    
    // -- Section 5: Educator Consultation
    y = drawDividerAndY(doc, y, 40, formType, isEmpty, pageState);
    doc.setFillColor(248, 250, 252);
    doc.rect(20, y, 170, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text("5. EDUCATION CONSULTATION & DISCUSSIONS", 23, y + 3.8);
    y += 8;
    
    drawField(doc, 20, y, "Class Teacher Met", formData.metTeacher, isEmpty, 45);
    drawField(doc, 75, y, "Teacher Name(s)", formData.teacherName, isEmpty, 115);
    y += 6;
    y = drawParagraph(doc, 20, y, "Teacher Notes / Feedback Assessment", formData.teacherComments, isEmpty);
    y += 3;
    
    y = drawDividerAndY(doc, y, 30, formType, isEmpty, pageState);
    drawField(doc, 20, y, "Head Teacher Met", formData.metPrincipal, isEmpty, 45);
    drawField(doc, 75, y, "Principal Name", formData.principalName, isEmpty, 115);
    y += 6;
    y = drawParagraph(doc, 20, y, "Lead/Head Master Comments & Requests", formData.principalComments, isEmpty);
    y += 3;
    
    y = drawDividerAndY(doc, y, 20, formType, isEmpty, pageState);
    y = drawParagraph(doc, 20, y, "Learner feedback (in student's own quotes)", formData.learnerFeedback, isEmpty);
    y += 4;
    
    // -- Section 6: Support Usage tracking
    y = drawDividerAndY(doc, y, 35, formType, isEmpty, pageState);
    doc.setFillColor(248, 250, 252);
    doc.rect(20, y, 170, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text("6. FCP TUITION, UNIFORMS & MATERIAL PROVISION", 23, y + 3.8);
    y += 10;
    
    drawField(doc, 20, y, "Tuition Fees Covered", formData.feesPaid, isEmpty, 45);
    drawField(doc, 75, y, "Fees Amount Paid", formData.feesAmt, isEmpty, 115);
    y += 6;
    drawField(doc, 20, y, "Uniform Provided", formData.uniformProv, isEmpty, 45);
    drawField(doc, 75, y, "Uniform Date", formData.uniformDate, isEmpty, 115);
    y += 6;
    drawField(doc, 20, y, "Textbooks Provided", formData.booksProv, isEmpty, 45);
    drawField(doc, 75, y, "Specific items / inventory", formData.booksList, isEmpty, 115);
    y += 6;
    drawField(doc, 20, y, "Extra / Auxiliary Support", formData.otherSupport, isEmpty, 170);
    y += 10;
    
    // -- Section 7: Observations & Recommendations
    y = drawDividerAndY(doc, y, 40, formType, isEmpty, pageState);
    doc.setFillColor(248, 250, 252);
    doc.rect(20, y, 170, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text("7. OBSERVER ASSESSMENT & RECOMMENDATIONS", 23, y + 3.8);
    y += 8;
    y = drawParagraph(doc, 20, y, "General Assessor Field Observations", formData.observations, isEmpty);
    y += 3;
    y = drawDividerAndY(doc, y, 20, formType, isEmpty, pageState);
    y = drawParagraph(doc, 20, y, "Core Action Recommendations & Immediate Needs", formData.recommendations, isEmpty);
  }
  
  // ----------------------------------------------------
  // HOME VISIT FORM LAYOUT
  // ----------------------------------------------------
  else if (formType === 'Home Visit') {
    // -- Section 1: Basic Information
    y = drawDividerAndY(doc, y, 35, formType, isEmpty, pageState);
    doc.setFillColor(248, 250, 252);
    doc.rect(20, y, 170, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text("1. BASIC DEMOGRAPHIC IDENTIFICATION DETAILS", 23, y + 3.8);
    y += 10;
    
    drawField(doc, 20, y, "ID NO (Record #)", formData.idNo, isEmpty, 75);
    drawField(doc, 105, y, "Date of Visit", formData.date, isEmpty, 85);
    y += 6;
    drawField(doc, 20, y, "Village/Community", formData.village, isEmpty, 75);
    drawField(doc, 105, y, "Sub-county/District", formData.district, isEmpty, 85);
    y += 6;
    drawField(doc, 20, y, "Visiting Officer", formData.assessorName, isEmpty, 75);
    drawField(doc, 105, y, "Position / Org", formData.assessorPosition, isEmpty, 85);
    y += 10;
    
    // -- Section 2: Family Composition Table (Up to 3 members)
    y = drawDividerAndY(doc, y, 40, formType, isEmpty, pageState);
    doc.setFillColor(248, 250, 252);
    doc.rect(20, y, 170, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text("2. COMPACT HOUSEHOLD FAMILY COMPOSITION", 23, y + 3.8);
    y += 8;
    
    // Draw columns
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setFillColor(241, 245, 249); // slate-100 table header
    doc.rect(20, y, 170, 5, 'F');
    doc.setTextColor(51, 65, 85);
    doc.text("Name", 22, y + 3.6);
    doc.text("Sex", 75, y + 3.6);
    doc.text("Age", 90, y + 3.6);
    doc.text("Relationship to Learner", 105, y + 3.6);
    doc.text("Primary Occupation", 145, y + 3.6);
    y += 5;
    
    // Drawing rows
    for (let idx = 0; idx < 3; idx++) {
      y = drawDividerAndY(doc, y, 8, formType, isEmpty, pageState);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      
      const name = formData[`fam_name_${idx}`];
      const sex = formData[`fam_sex_${idx}`];
      const age = formData[`fam_age_${idx}`];
      const rel = formData[`fam_rel_${idx}`];
      const occ = formData[`fam_occ_${idx}`];
      
      if (isEmpty) {
        doc.line(20, y + 4.5, 70, y + 4.5);
        doc.line(75, y + 4.5, 85, y + 4.5);
        doc.line(90, y + 4.5, 100, y + 4.5);
        doc.line(105, y + 4.5, 140, y + 4.5);
        doc.line(145, y + 4.5, 190, y + 4.5);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text(name || '-', 22, y + 3.6);
        doc.text(sex || '-', 75, y + 3.6);
        doc.text(age !== undefined ? String(age) : '-', 90, y + 3.6);
        doc.text(rel || '-', 105, y + 3.6);
        doc.text(occ || '-', 145, y + 3.6);
      }
      y += 6;
    }
    y += 4;
    
    // -- Section 3: The 4 Aspects of Well Being
    y = drawDividerAndY(doc, y, 12, formType, isEmpty, pageState);
    doc.setFillColor(224, 242, 254); // sky-100 headers
    doc.rect(20, y, 170, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(12, 74, 110); // sky-900
    doc.text("3. DETAILED CORE WELL-BEING ASPECTS ASSESSMENT", 23, y + 4.2);
    y += 10;
    
    // ASPECT A: Social Well-Being
    y = drawDividerAndY(doc, y, 40, formType, isEmpty, pageState);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(190, 24, 74); // Rose-700
    doc.text("🟢 ASPECT A: SOCIAL WELL-BEING (DYNAMICS & SAFETY)", 20, y);
    y += 5;
    
    drawField(doc, 20, y, "Household relationships", formData.soc_relationships, isEmpty, 75);
    drawField(doc, 105, y, "Decision Maker", formData.soc_decisionMaking, isEmpty, 85);
    y += 6;
    drawField(doc, 20, y, "Protection & Child Care", formData.soc_childrenCare, isEmpty, 75);
    drawField(doc, 105, y, "Community Social Support", formData.soc_socialSupport, isEmpty, 85);
    y += 6;
    drawField(doc, 20, y, "Core Abuse cases detected", formData.social_abuse_reported, isEmpty, 75);
    drawField(doc, 105, y, "Aspect A Rating", formData.soc_rating ? `★ ${formData.soc_rating}/5` : undefined, isEmpty, 85);
    y += 6;
    if (formData.social_abuse_reported === 'Yes' && !isEmpty) {
      y = drawDividerAndY(doc, y, 15, formType, isEmpty, pageState);
      y = drawParagraph(doc, 20, y, "Observed Abuse or Neglect Incidents Details", formData.social_abuse_explanation, isEmpty);
    }
    y += 5;
    
    // ASPECT B: Economic Well-Being
    y = drawDividerAndY(doc, y, 40, formType, isEmpty, pageState);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(190, 24, 74);
    doc.text("🟢 ASPECT B: ECONOMIC INDEPENDENT Livelihood", 20, y);
    y += 5;
    
    drawField(doc, 20, y, "Income Source", formData.econ_incomeSource, isEmpty, 75);
    drawField(doc, 105, y, "Employment", formData.econ_employmentStatus, isEmpty, 85);
    y += 6;
    drawField(doc, 20, y, "Monthly Income Range", formData.econ_monthlyIncome, isEmpty, 75);
    drawField(doc, 105, y, "Food Security level", formData.econ_foodSecurity, isEmpty, 85);
    y += 6;
    drawField(doc, 20, y, "Livelihood Capital Assets", formData.econ_assets, isEmpty, 75);
    drawField(doc, 105, y, "Aspect B Rating", formData.econ_rating ? `★ ${formData.econ_rating}/5` : undefined, isEmpty, 85);
    y += 6;
    drawField(doc, 20, y, "Primary Financial Stress Challenges", formData.econ_challenges, isEmpty, 170);
    y += 10;
    
    // ASPECT C: Health & Sanitation
    y = drawDividerAndY(doc, y, 40, formType, isEmpty, pageState);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(190, 24, 74);
    doc.text("🟢 ASPECT C: SANITATION, INFRASTRUCTURE & SANITARY CONDITIONS", 20, y);
    y += 5;
    
    drawField(doc, 20, y, "Health Services Access", formData.health_access, isEmpty, 75);
    drawField(doc, 105, y, "Distance to dispensary", formData.health_distance, isEmpty, 85);
    y += 6;
    drawField(doc, 20, y, "Immunization status", formData.health_immunization, isEmpty, 75);
    drawField(doc, 105, y, "Latrine / Toilet Type", formData.health_sanitation, isEmpty, 85);
    y += 6;
    drawField(doc, 20, y, "Drinking Water Source", formData.health_waterSource, isEmpty, 75);
    drawField(doc, 105, y, "Aspect C Rating", formData.health_rating ? `★ ${formData.health_rating}/5` : undefined, isEmpty, 85);
    y += 6;
    drawField(doc, 20, y, "Endemic Illnesses Identified", formData.health_illnesses, isEmpty, 75);
    drawField(doc, 105, y, "Serious Medical Concerns Details", formData.health_concerns, isEmpty, 85);
    y += 10;
    
    // ASPECT D: Education Well-Being
    y = drawDividerAndY(doc, y, 40, formType, isEmpty, pageState);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(190, 24, 74);
    doc.text("🟢 ASPECT D: EDUCATION QUALITY & SCHOLASTIC READINESS", 20, y);
    y += 5;
    
    drawField(doc, 20, y, "Learner Attendance Trend", formData.edu_attendance, isEmpty, 75);
    drawField(doc, 105, y, "Homework study area", formData.edu_environment, isEmpty, 85);
    y += 6;
    drawField(doc, 20, y, "Caregiver involvement rate", formData.edu_involvement, isEmpty, 170);
    y += 6;
    drawField(doc, 20, y, "Aspect D Rating", formData.edu_rating ? `★ ${formData.edu_rating}/5` : undefined, isEmpty, 75);
    drawField(doc, 105, y, "Other Scholastic concerns", formData.edu_barrier_other, isEmpty, 85);
    y += 6;
    
    // Educational Barriers Detect Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text("Detected barriers to education participation:", 20, y);
    y += 4.5;
    
    const barriersList = [
      { label: 'Fees', field: 'edu_barrier_Fees' },
      { label: 'Child Domestic labor', field: 'edu_barrier_Child_labour' },
      { label: 'School Distance', field: 'edu_barrier_Distance' },
      { label: 'Early marriage exposure', field: 'edu_barrier_Early_marriage' }
    ];
    
    barriersList.forEach((b, bi) => {
      const isB = formData[b.field] === true;
      const bx = 20 + (bi * 42);
      drawCheckbox(doc, bx, y, b.label, isB, isEmpty);
    });
    y += 7;
    y = drawParagraph(doc, 20, y, "Key Educational Context notes & constraints", formData.edu_comments, isEmpty);
    y += 4;
    
    // -- Section 4: General Family Well-Being Condition
    y = drawDividerAndY(doc, y, 45, formType, isEmpty, pageState);
    doc.setFillColor(248, 250, 252);
    doc.rect(20, y, 170, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text("4. GENERAL HOUSEHOLD OUTLINE SUMMARY", 23, y + 3.8);
    y += 9;
    
    drawField(doc, 20, y, "Summary Case Evaluation Code", formData.general_condition, isEmpty, 170);
    y += 6;
    
    // Urgent immediate assistance checkboxes
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("Urgent immediate assistant categories required:", 20, y);
    y += 4.5;
    
    const needsList = [
      { label: 'Food basket', key: 'need_Food' },
      { label: 'Clinical care', key: 'need_Medical' },
      { label: 'Uniform/materials', key: 'need_School' },
      { label: 'Shelter reform', key: 'need_Shelter' },
      { label: 'Protection protection', key: 'need_Protection' },
      { label: 'Micro Enterprise', key: 'need_Livelihood' }
    ];
    
    needsList.forEach((need, ni) => {
      const isN = formData[need.key] === true;
      const col = ni % 3;
      const row = Math.floor(ni / 3);
      const nx = 20 + (col * 56);
      const ny = y + (row * 5);
      drawCheckbox(doc, nx, ny, need.label, isN, isEmpty);
    });
    y += 14;
    
    y = drawParagraph(doc, 20, y, "Primary Strengths, Assets, or Coping abilities of family", formData.general_strengths, isEmpty);
    y += 3;
    y = drawDividerAndY(doc, y, 20, formType, isEmpty, pageState);
    y = drawParagraph(doc, 20, y, "Socio-economic vulnerabilities & risks observed", formData.general_vulnerabilities, isEmpty);
    y += 4;
    
    // -- Section 5: Action Plan Recommendations
    y = drawDividerAndY(doc, y, 35, formType, isEmpty, pageState);
    doc.setFillColor(248, 250, 252);
    doc.rect(20, y, 170, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text("5. SOCIAL WORK CASE MANAGEMENT ACTION PLAN", 23, y + 3.8);
    y += 8;
    y = drawParagraph(doc, 20, y, "Immediate Support Actions Suggested (within 1-2 weeks)", formData.plan_immediate, isEmpty);
    y += 3;
    y = drawDividerAndY(doc, y, 20, formType, isEmpty, pageState);
    y = drawParagraph(doc, 20, y, "Long-term Sustainable Empowerment Strategy (within 6+ months)", formData.plan_longTerm, isEmpty);
    y += 3;
    y = drawDividerAndY(doc, y, 20, formType, isEmpty, pageState);
    y = drawParagraph(doc, 20, y, "External Inter-agency Referrals Initiated", formData.plan_referrals, isEmpty);
    y += 4;
    
    // -- Section 6 & 7: Follow-up and Signatures
    y = drawDividerAndY(doc, y, 35, formType, isEmpty, pageState);
    doc.setFillColor(248, 250, 252);
    doc.rect(20, y, 170, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text("6. ACTION TRACKING FOLLOW-UP & SIGN-OFF", 23, y + 3.8);
    y += 10;
    
    drawField(doc, 20, y, "Next Scheduled Visit Date", formData.followUp_nextDate, isEmpty, 75);
    drawField(doc, 105, y, "Responsible follow-up Officer", formData.followUp_officer, isEmpty, 85);
    y += 12;
    
    // Signature Thumbprint block
    drawField(doc, 20, y, "Assessor Affirmation Signature", formData.declaration_assessor, isEmpty, 75);
    drawField(doc, 105, y, "Household Rep Affirmation (thumbprint)", formData.declaration_representative, isEmpty, 85);
  }
  
  // ----------------------------------------------------
  // GENERAL FALLBACK FORMS (Discharge, Sick, Referral, etc.)
  // ----------------------------------------------------
  else {
    y = drawDividerAndY(doc, y, 35, formType, isEmpty, pageState);
    doc.setFillColor(241, 245, 249);
    doc.rect(20, y, 170, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text("1. BASIC DISCOVERY & VISIT LOG DETAILS", 23, y + 3.8);
    y += 10;
    
    drawField(doc, 20, y, "Report/Log Date", formData.date, isEmpty, 170);
    y += 8;
    drawField(doc, 20, y, "Reason / Purpose Statement", formData.purpose, isEmpty, 170);
    y += 12;
    
    y = drawDividerAndY(doc, y, 50, formType, isEmpty, pageState);
    doc.setFillColor(241, 245, 249);
    doc.rect(20, y, 170, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text("2. COMPREHENSIVE CASE LOG NARRATIVE SYNOPSIS", 23, y + 3.8);
    y += 8;
    y = drawParagraph(doc, 20, y, "Detailed notes / Qualitative summary", formData.summary, isEmpty);
    y += 6;
    
    y = drawDividerAndY(doc, y, 35, formType, isEmpty, pageState);
    doc.setFillColor(241, 245, 249);
    doc.rect(20, y, 170, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text("3. FOLLOW-UP INTERVENTIONS & OUTCOMES REQUIRED", 23, y + 3.8);
    y += 8;
    y = drawParagraph(doc, 20, y, "Recommended Actions / Next Steps Checklist", formData.actionItems, isEmpty);
    y += 12;
    
    // Empty writing lines for physical signature verification
    y = drawDividerAndY(doc, y, 20, formType, isEmpty, pageState);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("Affirmation signatures log verification details:", 20, y);
    y += 8;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(20, y, 90, y);
    doc.line(105, y, 190, y);
    y += 3.5;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text("Authorised Case Worker Signature", 20, y);
    doc.text("Reviewed by Lomuriangole Director Signature", 105, y);
  }
  
  // Clean final compilation steps and action
  doc.save(`${formType.replace(/\s+/g, '_')}_${isEmpty ? 'Template' : 'Record'}.pdf`);
}
