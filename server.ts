import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to support JSON parsing with reasonable limit for backing up large student lists
  app.use(express.json({ limit: "50mb" }));

  // Ensure backup directory exists
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, "backup_db.json");

  // API Route - Get latest backed up database
  app.get("/api/sync", (req, res) => {
    try {
      if (fs.existsSync(dbPath)) {
        const data = fs.readFileSync(dbPath, "utf8");
        return res.json(JSON.parse(data));
      }
      return res.json(null);
    } catch (error: any) {
      console.error("Failed to read server backup file:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // API Route - Save/Backup database to server-side storage
  app.post("/api/sync", (req, res) => {
    try {
      const payload = req.body;
      if (!payload || typeof payload !== "object") {
        return res.status(400).json({ error: "Invalid payload format" });
      }

      fs.writeFileSync(dbPath, JSON.stringify(payload, null, 2), "utf8");
      return res.json({ 
        success: true, 
        timestamp: new Date().toISOString(),
        message: "Data successfully synchronized and saved on server storage."
      });
    } catch (error: any) {
      console.error("Failed to write server backup file:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // API Route - Analyze student performance
  app.post("/api/gemini/analyze-student", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: "GEMINI_API_KEY environment variable is not configured. Please add your Gemini API Key in Settings > Secrets." });
      }

      const { participant, stats } = req.body;
      if (!participant || !stats) {
        return res.status(400).json({ error: "Missing participant or stats data." });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `
You are an expert Educational Cohort Success & Welfare Roster Analyst at Lomuriangole Child and Youth Development Center.
Please analyze the attendance records and casework outreach history for this student:

STUDENT PROFILE:
- Name: ${participant.name}
- Age: ${participant.age || 'N/A'} (Gender: ${participant.gender || 'N/A'})
- Cohort Group: ${participant.cohort}
- Village: ${participant.village || 'N/A'}
- Caregiver: ${participant.caregiver || 'N/A'}
- Join Date: ${participant.joinDate || 'N/A'}
- Registration Notes: ${participant.registrationNotes || 'None'}

SCANNED FORMS & WELFARE RECORDS ON DOSSIER:
${(participant.scannedForms || []).map((form: any) => {
  let formDetailsStr = "";
  if (form.formType === 'medical' && form.extractedData.medical) {
    const med = form.extractedData.medical;
    formDetailsStr = `Blood group: ${med.bloodType || 'N/A'}, Conditions: ${med.disabilitiesOrConditions || 'N/A'}, Vaccination: ${med.vaccinationStatus || 'N/A'}, Summary: ${med.healthStatusSummary || 'N/A'}`;
  } else if (form.formType === 'school' && form.extractedData.school) {
    const sch = form.extractedData.school;
    formDetailsStr = `School: ${sch.schoolName || 'N/A'}, Grade: ${sch.gradeLevel || 'N/A'}, Avg Score: ${sch.averageScorePercentage || 'N/A'}%, Rank: ${sch.academicRank || 'N/A'}, Remarks: ${sch.teacherRemarks || 'N/A'}`;
  } else if (form.formType === 'home_visit' && form.extractedData.home_visit) {
    const hv = form.extractedData.home_visit;
    formDetailsStr = `Visit Date: ${hv.visitDate || 'N/A'}, House Size: ${hv.householdSize || 'N/A'}, Shelter: ${hv.dwellingType || 'N/A'}, Income Livelihood: ${hv.familyLivelihood || 'N/A'}, Vulnerabilities: ${hv.riskVulnerabilitiesSummary || 'N/A'}, Staff Advice: ${hv.visitingStaffRecommendation || 'N/A'}`;
  } else if (form.formType === 'enrollment' && form.extractedData.enrollment) {
    const en = form.extractedData.enrollment;
    formDetailsStr = `Intake Enrollee: ${en.name || 'N/A'}, Bio: ${en.gender || 'N/A'} age ${en.age || 'N/A'}, Area: ${en.village || 'N/A'}, Parent: ${en.caregiver || 'N/A'}, Contact: ${en.contact || 'N/A'}, Remarks: ${en.registrationNotes || 'N/A'}`;
  } else {
    formDetailsStr = `Title: ${form.extractedData.other?.title || 'N/A'}, Summary: ${form.extractedData.other?.rawSummary || 'N/A'}`;
  }
  return `- File [${form.formType.toUpperCase()}]: ${form.fileName} (Uploaded: ${form.uploadDate}) -> ${formDetailsStr}`;
}).join('\n') || 'No scanned welfare forms or academic checkup records registered on file.'}

ATTENDANCE SUMMARY:
- Total sessions: ${stats.totalSessions}
- Attended: ${stats.totalPresent} (Rate: ${stats.attendanceRate}%)
- Unexcused Absences: ${stats.totalAbsent} (Consecutive absences: ${stats.consecutiveAbsences})
- Excused: ${stats.totalExcused}
- Alerts status: ${stats.hasRedFlag ? '🔴 RED WARNING ALERT (3+ missed)' : stats.hasYellowFlag ? '🟡 YELLOW WARNING ALERT (2 consecutive miss)' : '🟢 Normal standing'}

CASEWORK HISTORY NOTES:
${(participant.outreachNotes || []).map((note: any) => `- Date: ${note.date}, Status: ${note.status}, LoggedBy: ${note.loggedBy}, Details: ${note.notes}`).join('\n') || 'No casework logs on record.'}

Please return a JSON-structured performance report. Provide deep, qualitative insights to assist the staff in optimizing their outreach or counseling interventions. Reference any noteworthy medical warnings, academic performances, or home visit difficulties that were retrieved from their scanned files.
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              summary: { type: "STRING", description: "One paragraph qualitative attendance summary" },
              attendanceScoreAnalysis: { type: "STRING", description: "Overall classification e.g. Optimal, Moderate Risk, Critical Alert" },
              insights: {
                type: "ARRAY",
                items: { type: "STRING" },
                description: "List of 2-3 specific behavioral or chronological insights derived from records"
              },
              recommendation: { type: "STRING", description: "Actionable counseling or support recommendation" }
            },
            required: ["summary", "attendanceScoreAnalysis", "insights", "recommendation"]
          }
        }
      });

      const responseText = response.text || "{}";
      const parsed = JSON.parse(responseText.trim());
      return res.json(parsed);

    } catch (error: any) {
      console.error("Gemini student analysis failed:", error);
      return res.status(500).json({ error: error.message || "Failed to generate student analysis." });
    }
  });

  // API Route - Analyze entire cohort / roster and create individual evaluations for every single participant
  app.post("/api/gemini/analyze-cohort", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: "GEMINI_API_KEY environment variable is not configured. Please add your Gemini API Key in Settings > Secrets." });
      }

      const { participants, statsMap } = req.body;
      if (!participants || !Array.isArray(participants) || !statsMap) {
        return res.status(400).json({ error: "Missing participants or stats map list." });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Construct a concise digest of every student to avoid overflowing token limit
      const studentDigest = participants.map((p: any) => {
        const stats = statsMap[p.id] || { attendanceRate: 100, totalSessions: 0, totalPresent: 0, totalAbsent: 0, hasRedFlag: false, hasYellowFlag: false };
        const alertStr = stats.hasRedFlag ? '🔴 Red Alert' : stats.hasYellowFlag ? '🟡 Yellow Alert' : '🟢 Stable';
        
        return {
          id: p.id,
          name: p.name,
          gender: p.gender || 'N/A',
          age: p.age || 'N/A',
          cohort: p.cohort,
          rate: `${stats.attendanceRate}%`,
          present: stats.totalPresent,
          absent: stats.totalAbsent,
          alert: alertStr,
          logsCount: p.outreachNotes?.length || 0,
          lastLog: p.outreachNotes?.length > 0 ? p.outreachNotes[p.outreachNotes.length - 1].notes.slice(0, 80) : 'None'
        };
      });

      const prompt = `
You are an expert Social Welfare & Educational Cohort Success Director at Lomuriangole Child and Youth Development Center.
Please review this aggregated performance roster of students. You MUST create an analytical progress evaluation synopsis for every participant listed.

STUDENTS DATA ROSTER DIGEST:
${JSON.stringify(studentDigest, null, 2)}

Provide a structured, unified report in JSON including:
1. "cohortSummary": A high-level qualitative overview (1-2 paragraphs) detailing overall cohort enrollment robustness, common engagement trends, or environmental challenges.
2. "overallRiskDistribution": Text-based statistical estimation detailing cohort health segments (e.g. Safe/Stable vs Moderate/Risk vs Critical Intervention).
3. "studentReports": An array containing an entry for EVERY single participant in the input roster.

Each entry in "studentReports" must exactly have:
- "participantId": string matching the student's id.
- "name": student's name.
- "attendanceRate": string representing actual rate (e.g., "75%").
- "standing": string representing performance standing (e.g. "Safe", "At Risk", or "Critical").
- "synopsis": a precise, respectful, and hyper-personalized 1-to-2 sentence attendance/welfare performance evaluation report.
- "recommendedAction": a specific, direct next step for the field counselor or staff to take (such as caregiver consultation, home visitation, or local transport assistance).
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              cohortSummary: { type: "STRING" },
              overallRiskDistribution: { type: "STRING" },
              studentReports: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    participantId: { type: "STRING" },
                    name: { type: "STRING" },
                    attendanceRate: { type: "STRING" },
                    standing: { type: "STRING" },
                    synopsis: { type: "STRING" },
                    recommendedAction: { type: "STRING" }
                  },
                  required: ["participantId", "name", "attendanceRate", "standing", "synopsis", "recommendedAction"]
                }
              }
            },
            required: ["cohortSummary", "overallRiskDistribution", "studentReports"]
          }
        }
      });

      const responseText = response.text || "{}";
      const parsed = JSON.parse(responseText.trim());
      return res.json(parsed);

    } catch (error: any) {
      console.error("Gemini cohort analysis failed:", error);
      return res.status(500).json({ error: error.message || "Failed to generate cohort analysis." });
    }
  });

  // API Route - Analyze various scanned forms and retrieve structured information
  app.post("/api/gemini/analyze-form", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: "GEMINI_API_KEY environment variable is not configured. Please add your Gemini API Key in Settings > Secrets." });
      }

      const { image, formType, fileName } = req.body;
      if (!image || !formType) {
        return res.status(400).json({ error: "Missing required parameters (image or formType)." });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Split the data URL if present
      let mimeType = "image/png";
      let base64Data = image;
      if (image.startsWith("data:")) {
        const parts = image.split(",");
        base64Data = parts[1];
        const mimePart = parts[0].match(/data:(.*?);/);
        if (mimePart) {
          mimeType = mimePart[1];
        }
      }

      // We support the categories: 'enrollment', 'medical', 'school', 'home_visit', 'other'
      let schemaProperties: any = {};
      let formPrompt = "";

      if (formType === 'enrollment') {
        formPrompt = `You are scanning an Enrollment Application Form for a participant of Lomuriangole Child and Youth Development Center.
Please extract the following fields if they are mentioned or visible in the document. Do not invent any data; only output what is present or reasonably inferred.`;
        schemaProperties = {
          name: { type: "STRING", description: "First name, last name, or full name of the student/enrollee." },
          age: { type: "STRING", description: "Age of the student (as a string, e.g. '12' or 'under 12')." },
          gender: { type: "STRING", description: "Gender of the student, either Male or Female." },
          village: { type: "STRING", description: "Home village name in Lomuriangole (e.g. Nakoraye, Lokopo, Kalobeyei, etc.)" },
          caregiver: { type: "STRING", description: "Parent or primary guardian/caregiver name." },
          contact: { type: "STRING", description: "Emergency contact or phone number found on the form." },
          cohort: { type: "STRING", description: "Suggested or designated cohort category." },
          registrationNotes: { type: "STRING", description: "Any detailed background notes, intake comments or specific registration circumstances of the student." }
        };
      } else if (formType === 'medical') {
        formPrompt = `You are scanning a Health Check / Medical report Form for a participant of Lomuriangole Child and Youth Development Center.
Please extract the health statistics, status, vaccine records, or dietary info.`;
        schemaProperties = {
          bloodType: { type: "STRING", description: "Blood type group, e.g., A+, O-, B+, etc." },
          disabilitiesOrConditions: { type: "STRING", description: "Chronological medical issues, allergies, disabilities or conditions listed (e.g. Asthma, peanut allergy, None)." },
          vaccinationStatus: { type: "STRING", description: "Vaccine immunization status e.g. Fully Immunized, Partially, Missing details." },
          recentCheckupDate: { type: "STRING", description: "Date of medical examination or checkup." },
          healthStatusSummary: { type: "STRING", description: "Summary comment regarding the overall physical safety, symptoms, or nutritional status of the child." }
        };
      } else if (formType === 'school') {
        formPrompt = `You are scanning a School Academic Report Card or progress form for a participant of Lomuriangole Child and Youth Development Center.
Please extract the school name, grades, rank, term, or teacher notes.`;
        schemaProperties = {
          schoolName: { type: "STRING", description: "Name of the local day or boarding academic school." },
          gradeLevel: { type: "STRING", description: "Grade, year, class or primary grade level (e.g. Primary 5, Grade 8, Form 2)." },
          academicTerm: { type: "STRING", description: "Term of exams being assessed (e.g. Term I, Term II, Year End)." },
          academicRank: { type: "STRING", description: "Student's rank or place in group class (e.g. '4th out of 45', or 'N/A')." },
          averageScorePercentage: { type: "NUMBER", description: "Averaged total percentage score from subject cards combined (number grade between 0 and 100)." },
          teacherRemarks: { type: "STRING", description: "Comprehensive qualitative remarks or performance commentary by teacher on progress." }
        };
      } else if (formType === 'home_visit') {
        formPrompt = `You are scanning a Home Visit Assessment / Social Casework Field Form for a participant of Lomuriangole Child and Youth Development Center.
Please extract well-being facts, home dynamics, vulnerabilities, or staff recommendations.`;
        schemaProperties = {
          visitDate: { type: "STRING", description: "Date on which the caseworker completed the home visitation (YYYY-MM-DD)." },
          householdSize: { type: "NUMBER", description: "Total people residing in the household." },
          dwellingType: { type: "STRING", description: "Nature of shelter structure, e.g. Manyatta mud hut, brick house, iron sheet shelter." },
          familyLivelihood: { type: "STRING", description: "Primary household income/survival source (e.g. Livestock herding, Charcoal burning, Retail shop, Crop agriculture)." },
          riskVulnerabilitiesSummary: { type: "STRING", description: "Summary of major welfare vulnerabilities, drought/food shortages, lack of bednets, water quality issues, etc." },
          visitingStaffRecommendation: { type: "STRING", description: "Action recommendations log details, food aid distribution, medical referral, prayer, counseling." }
        };
      } else {
        formPrompt = `You are scanning an unspecified type of document/image for a participant.
Extract a general title, summary and key takeaways.`;
        schemaProperties = {
          title: { type: "STRING", description: "Extracted or inferred title of the scanned document." },
          rawSummary: { type: "STRING", description: "Comprehensive textual recap of what the document contains." },
          keyExtractedPoints: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "List of 2-4 important factual takeaways or metrics retrieved."
          }
        };
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            },
            {
              text: `${formPrompt}\nPlease process the document image and extract all requested parameters. Return the results in structured JSON format.`
            }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: schemaProperties
          }
        }
      });

      const textResult = response.text || "{}";
      const parsedData = JSON.parse(textResult.trim());
      
      return res.json({
        success: true,
        extracted: parsedData
      });

    } catch (error: any) {
      console.error("Gemini form scanner analysis failed:", error);
      return res.status(505).json({ error: error.message || "Failed to analyze and scan the document." });
    }
  });

  // Serve static UI assets or mount Vite dev middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Lomuriangole Server] Full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to boot full-stack Express server:", err);
});
