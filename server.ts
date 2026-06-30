import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { db } from "./src/db/index.ts";
import { users, participants, sessions, attendance } from "./src/db/schema.ts";
import { eq, and } from "drizzle-orm";
import { requireAuth, AuthRequest } from "./src/middleware/auth.ts";
import { getOrCreateUser } from "./src/db/users.ts";
import { adminAuth } from "./src/lib/firebase-admin.ts";

// Helper function to call Gemini with exponential backoff and automatic model fallback for maximum resilience
async function callGeminiWithRetry(
  ai: GoogleGenAI,
  params: {
    model?: string;
    contents: any;
    config?: any;
  },
  maxRetries = 4,
  initialDelay = 1500
): Promise<any> {
  const baseModel = params.model || "gemini-3.5-flash";
  const fallbackModels = [baseModel, "gemini-flash-latest", "gemini-3.1-flash-lite"];
  
  let attempt = 0;
  let modelIndex = 0;
  
  while (true) {
    const activeModel = fallbackModels[modelIndex];
    try {
      return await ai.models.generateContent({
        ...params,
        model: activeModel,
      });
    } catch (error: any) {
      attempt++;
      const errMsg = error?.message || '';
      const status = error?.status;
      const isTransient = status === 503 || status === 429 || status === 500 ||
                          errMsg.includes("503") || 
                          errMsg.includes("UNAVAILABLE") ||
                          errMsg.includes("Resource exhausted") ||
                          errMsg.includes("high demand") ||
                          errMsg.includes("overloaded");
                          
      if (isTransient && attempt < maxRetries) {
        // Switch to next fallback model on retry
        if (modelIndex < fallbackModels.length - 1) {
          modelIndex++;
          console.warn(`[WARNING] Gemini model ${fallbackModels[modelIndex-1]} failed with transient error (status: ${status || 'unknown'}, msg: "${errMsg}"). Falling back to ${fallbackModels[modelIndex]}...`);
        } else {
          // Wrap around or keep trying the last one
          modelIndex = 0;
        }
        const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 800;
        console.warn(`[WARNING] Gemini API call failed with transient error. Retrying attempt ${attempt}/${maxRetries} in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to support JSON parsing with reasonable limit for backing up large student lists
  app.use(express.json({ limit: "50mb" }));

  // API Route - Get latest backed up database from Postgres/Cloud SQL
  app.get("/api/sync", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // 1. Get or create user
      const dbUser = await getOrCreateUser(req.user.uid, req.user.email || "");

      // 2. Fetch all participants
      const dbParticipants = await db.select()
        .from(participants)
        .where(eq(participants.userId, dbUser.id));

      // 3. Fetch all sessions
      const dbSessions = await db.select()
        .from(sessions)
        .where(eq(sessions.userId, dbUser.id));

      // 4. Fetch all attendance records
      const dbAttendance = await db.select()
        .from(attendance)
        .where(eq(attendance.userId, dbUser.id));

      // 5. Structure attendance records as a Map: Record<participantId, Record<dateStr, status>>
      const attendanceMap: Record<string, Record<string, string>> = {};
      for (const record of dbAttendance) {
        if (!attendanceMap[record.participantId]) {
          attendanceMap[record.participantId] = {};
        }
        attendanceMap[record.participantId][record.date] = record.status;
      }

      const metadata: any = dbUser.metadata || {};

      return res.json({
        participants: dbParticipants.map(p => ({
          ...p,
          scannedForms: p.scannedForms || [],
          documents: p.documents || [],
          filledForms: p.filledForms || [],
          outreachNotes: p.outreachNotes || [],
        })),
        sessions: dbSessions,
        attendance: attendanceMap,
        emailedSessionDates: metadata.emailedSessionDates || [],
        dismissedEmailDates: metadata.dismissedEmailDates || [],
        lastEmailedSessionDate: metadata.lastEmailedSessionDate || "",
        staffEmailRecipient: metadata.staffEmailRecipient || "",
        isAutomaticEmailEnabled: metadata.isAutomaticEmailEnabled || false,
        staffTasks: metadata.staffTasks || [],
        complianceStatus: metadata.complianceStatus || null,
        userRole: metadata.userRole || "ADMINISTRATOR",
        budgets: metadata.budgets || [],
        pettyCashRequests: metadata.pettyCashRequests || [],
        performanceCycles: metadata.performanceCycles || [],
        monthlyJournals: metadata.monthlyJournals || [],
        annualTargetsJournals: metadata.annualTargetsJournals || [],
        monthlyPerformanceTargets: metadata.monthlyPerformanceTargets || [],
        closedMonthlyPerformanceJournals: metadata.closedMonthlyPerformanceJournals || []
      });
    } catch (error: any) {
      console.error("Failed to read database records from Cloud SQL:", error);
      return res.status(500).json({ error: "Cloud SQL lookup failed. Please try again later.", details: error.message });
    }
  });

  // API Route - Save/Backup database to relational Cloud SQL storage
  app.post("/api/sync", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { 
        participants: clientParticipants, 
        sessions: clientSessions, 
        attendance: clientAttendance,
        emailedSessionDates,
        dismissedEmailDates,
        lastEmailedSessionDate,
        staffEmailRecipient,
        isAutomaticEmailEnabled,
        staffTasks,
        complianceStatus,
        userRole,
        budgets,
        pettyCashRequests,
        performanceCycles,
        monthlyJournals,
        annualTargetsJournals,
        monthlyPerformanceTargets,
        closedMonthlyPerformanceJournals
      } = req.body;

      // 1. Get or create user in DB
      const dbUser = await getOrCreateUser(req.user.uid, req.user.email || "");

      // 2. Update user metadata
      await db.update(users)
        .set({
          metadata: {
            emailedSessionDates: emailedSessionDates || [],
            dismissedEmailDates: dismissedEmailDates || [],
            lastEmailedSessionDate: lastEmailedSessionDate || "",
            staffEmailRecipient: staffEmailRecipient || "",
            isAutomaticEmailEnabled: !!isAutomaticEmailEnabled,
            staffTasks: staffTasks || [],
            complianceStatus: complianceStatus || null,
            userRole: userRole || (dbUser.metadata as any)?.userRole || "ADMINISTRATOR",
            budgets: budgets || [],
            pettyCashRequests: pettyCashRequests || [],
            performanceCycles: performanceCycles || [],
            monthlyJournals: monthlyJournals || [],
            annualTargetsJournals: annualTargetsJournals || [],
            monthlyPerformanceTargets: monthlyPerformanceTargets || [],
            closedMonthlyPerformanceJournals: closedMonthlyPerformanceJournals || []
          }
        })
        .where(eq(users.id, dbUser.id));

      // 3. Sync participants in batch (sequentially/upsertly)
      if (clientParticipants && Array.isArray(clientParticipants)) {
        for (const p of clientParticipants) {
          if (!p.id || !p.name) continue;
          await db.insert(participants)
            .values({
              id: p.id,
              userId: dbUser.id,
              name: p.name,
              contact: p.contact || "",
              cohort: p.cohort || "",
              joinDate: p.joinDate || new Date().toISOString().split('T')[0],
              avatarColor: p.avatarColor || "#CBD5E1",
              registrationNotes: p.registrationNotes || null,
              idNo: p.idNo || null,
              age: p.age ? String(p.age) : null,
              dob: p.dob || null,
              village: p.village || null,
              caregiver: p.caregiver || null,
              gender: p.gender || null,
              schoolingStatus: p.schoolingStatus || null,
              schoolClass: p.schoolClass || null,
              isFormer: !!p.isFormer,
              formerDate: p.formerDate || null,
              photoUrl: p.photoUrl || null,
              isPermanent: !!p.isPermanent,
              isImported: !!p.isImported,
              scannedForms: p.scannedForms || null,
              documents: p.documents || null,
              filledForms: p.filledForms || null,
              outreachNotes: p.outreachNotes || null,
            })
            .onConflictDoUpdate({
              target: participants.id,
              set: {
                name: p.name,
                contact: p.contact || "",
                cohort: p.cohort || "",
                joinDate: p.joinDate || new Date().toISOString().split('T')[0],
                avatarColor: p.avatarColor || "#CBD5E1",
                registrationNotes: p.registrationNotes || null,
                idNo: p.idNo || null,
                age: p.age ? String(p.age) : null,
                dob: p.dob || null,
                village: p.village || null,
                caregiver: p.caregiver || null,
                gender: p.gender || null,
                schoolingStatus: p.schoolingStatus || null,
                schoolClass: p.schoolClass || null,
                isFormer: !!p.isFormer,
                formerDate: p.formerDate || null,
                photoUrl: p.photoUrl || null,
                isPermanent: !!p.isPermanent,
                isImported: !!p.isImported,
                scannedForms: p.scannedForms || null,
                documents: p.documents || null,
                filledForms: p.filledForms || null,
                outreachNotes: p.outreachNotes || null,
              }
            });
        }
      }

      // 4. Sync sessions in batch (sequentially/upsertly)
      if (clientSessions && Array.isArray(clientSessions)) {
        for (const s of clientSessions) {
          if (!s.date) continue;
          await db.insert(sessions)
            .values({
              userId: dbUser.id,
              date: s.date,
              label: s.label || null,
              checklist: s.checklist || null,
              notes: s.notes || null,
            })
            .onConflictDoUpdate({
              target: [sessions.userId, sessions.date],
              set: {
                label: s.label || null,
                checklist: s.checklist || null,
                notes: s.notes || null,
              }
            });
        }
      }

      // 5. Sync attendance records
      if (clientAttendance && typeof clientAttendance === 'object') {
        for (const [pId, datesObj] of Object.entries(clientAttendance)) {
          if (!datesObj || typeof datesObj !== 'object') continue;
          for (const [dStr, statusVal] of Object.entries(datesObj)) {
            if (!statusVal) continue;
            await db.insert(attendance)
              .values({
                userId: dbUser.id,
                participantId: pId,
                date: dStr,
                status: statusVal as string,
              })
              .onConflictDoUpdate({
                target: [attendance.userId, attendance.participantId, attendance.date],
                set: {
                  status: statusVal as string,
                }
              });
          }
        }
      }

      return res.json({ 
        success: true, 
        timestamp: new Date().toISOString(),
        message: "Data successfully synchronized and saved on Cloud SQL Postgres instance."
      });
    } catch (error: any) {
      console.error("Failed to commit synchronize records to Cloud SQL:", error);
      return res.status(500).json({ error: "Cloud SQL sync failed. Please try again later.", details: error.message });
    }
  });

  // OTP Store map
  const otpStore = new Map<string, { code: string; expiresAt: number }>();

  // API Route - Get all user accounts (Admin only)
  app.get("/api/admin/users", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const adminUser = await getOrCreateUser(req.user.uid, req.user.email || "");
      const adminRole = (adminUser.metadata as any)?.userRole || "ADMINISTRATOR";
      if (adminRole !== "ADMINISTRATOR") {
        return res.status(403).json({ error: "Forbidden: Administrator access required" });
      }

      const allUsers = await db.select().from(users);
      return res.json(allUsers.map(u => ({
        id: u.id,
        uid: u.uid,
        email: u.email,
        role: (u.metadata as any)?.userRole || "STAFF",
        createdAt: u.createdAt,
      })));
    } catch (error: any) {
      console.error("Failed to fetch user accounts:", error);
      return res.status(500).json({ error: "Failed to fetch user accounts", details: error.message });
    }
  });

  // API Route - Create/Configure a user account (Admin only)
  app.post("/api/admin/users", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const adminUser = await getOrCreateUser(req.user.uid, req.user.email || "");
      const adminRole = (adminUser.metadata as any)?.userRole || "ADMINISTRATOR";
      if (adminRole !== "ADMINISTRATOR") {
        return res.status(403).json({ error: "Forbidden: Administrator access required" });
      }

      const { email, role } = req.body;
      if (!email || !role) {
        return res.status(400).json({ error: "Email and role are required" });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // 1. Create or get Firebase User
      let firebaseUser;
      try {
        firebaseUser = await adminAuth.getUserByEmail(normalizedEmail);
      } catch (err: any) {
        if (err.code === "auth/user-not-found") {
          firebaseUser = await adminAuth.createUser({
            email: normalizedEmail,
            emailVerified: true,
          });
        } else {
          throw err;
        }
      }

      // 2. Insert or update in Cloud SQL Postgres
      const existingUsers = await db.select().from(users).where(eq(users.uid, firebaseUser.uid));
      
      if (existingUsers.length > 0) {
        const currentUserRecord = existingUsers[0];
        const existingMetadata = (currentUserRecord.metadata as any) || {};
        const updatedMetadata = {
          ...existingMetadata,
          userRole: role,
        };
        
        await db.update(users)
          .set({
            email: normalizedEmail,
            metadata: updatedMetadata,
          })
          .where(eq(users.id, currentUserRecord.id));
      } else {
        await db.insert(users)
          .values({
            uid: firebaseUser.uid,
            email: normalizedEmail,
            metadata: {
              userRole: role,
              participants: [],
              sessions: [],
              attendance: {},
            },
          });
      }

      return res.json({ success: true, message: `Account created/configured for ${normalizedEmail} as ${role}.` });
    } catch (error: any) {
      console.error("Failed to create user account:", error);
      return res.status(500).json({ error: "Failed to create user account", details: error.message });
    }
  });

  // API Route - Delete a user account (Admin only)
  app.delete("/api/admin/users/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const adminUser = await getOrCreateUser(req.user.uid, req.user.email || "");
      const adminRole = (adminUser.metadata as any)?.userRole || "ADMINISTRATOR";
      if (adminRole !== "ADMINISTRATOR") {
        return res.status(403).json({ error: "Forbidden: Administrator access required" });
      }

      const targetId = parseInt(req.params.id);
      if (isNaN(targetId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      if (targetId === adminUser.id) {
        return res.status(400).json({ error: "You cannot delete your own admin account!" });
      }

      const targetUser = await db.select().from(users).where(eq(users.id, targetId));
      if (targetUser.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      await db.delete(users).where(eq(users.id, targetId));

      try {
        await adminAuth.deleteUser(targetUser[0].uid);
      } catch (fbErr) {
        console.warn(`Could not delete user ${targetUser[0].uid} from Firebase Auth:`, fbErr);
      }

      return res.json({ success: true, message: "User account successfully deleted" });
    } catch (error: any) {
      console.error("Failed to delete user account:", error);
      return res.status(500).json({ error: "Failed to delete user account", details: error.message });
    }
  });

  // API Route - Send OTP Code
  app.post("/api/auth/otp/send", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const dbUsers = await db.select().from(users).where(eq(users.email, normalizedEmail));
      if (dbUsers.length === 0) {
        return res.status(404).json({ error: "Access Denied: This email has not been registered by the system administrator." });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      otpStore.set(normalizedEmail, { code, expiresAt });

      console.log(`\n========================================\n[OTP LOGIN] Verification Code for ${normalizedEmail}: ${code}\n========================================\n`);

      return res.json({
        success: true,
        message: "Verification code generated.",
        devPreviewCode: code
      });
    } catch (error: any) {
      console.error("Failed to send verification code:", error);
      return res.status(500).json({ error: "Failed to process login request", details: error.message });
    }
  });

  // API Route - Verify OTP Code and login
  app.post("/api/auth/otp/verify", async (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ error: "Email and code are required" });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const otpData = otpStore.get(normalizedEmail);

      if (!otpData) {
        return res.status(400).json({ error: "No active verification request found for this email." });
      }

      if (Date.now() > otpData.expiresAt) {
        otpStore.delete(normalizedEmail);
        return res.status(400).json({ error: "The verification code has expired. Please request a new one." });
      }

      if (otpData.code !== code.trim()) {
        return res.status(400).json({ error: "Invalid verification code. Please double-check and try again." });
      }

      otpStore.delete(normalizedEmail);

      const dbUsers = await db.select().from(users).where(eq(users.email, normalizedEmail));
      if (dbUsers.length === 0) {
        return res.status(404).json({ error: "User record not found in system." });
      }

      const userRecord = dbUsers[0];
      const customToken = await adminAuth.createCustomToken(userRecord.uid);

      return res.json({
        success: true,
        customToken,
        message: "Code verified successfully."
      });
    } catch (error: any) {
      console.error("Failed to verify code:", error);
      return res.status(500).json({ error: "Failed to complete verification", details: error.message });
    }
  });


  // API Route - Analyze student performance
  app.post("/api/gemini/analyze-student", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: "GEMINI_API_KEY environment variable is not configured. Please add your Gemini API Key in Settings > Secrets." });
      }

      const { participant, stats, dateRange, attendanceHistory } = req.body;
      if (!participant || !stats) {
        return res.status(400).json({ error: "Missing participant or stats data." });
      }

      // Filter structured forms and casework history based on dateRange
      let filteredForms = participant.filledForms || [];
      let filteredLogs = participant.outreachNotes || [];
      
      if (dateRange && dateRange.start) {
        filteredForms = filteredForms.filter((f: any) => f.date >= dateRange.start);
        filteredLogs = filteredLogs.filter((l: any) => l.date >= dateRange.start);
      }
      if (dateRange && dateRange.end) {
        filteredForms = filteredForms.filter((f: any) => f.date <= dateRange.end);
        filteredLogs = filteredLogs.filter((l: any) => l.date <= dateRange.end);
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

STRUCTURED ASSESSMENT FORMS FILLED:
${filteredForms.map((form: any) => `- Type: ${form.type}, Date: ${form.date}, Content: ${JSON.stringify(form.data)}`).join('\n') || 'No structured forms recorded within this period.'}

ATTENDANCE SUMMARY:
- Total sessions: ${stats.totalSessions}
- Attended: ${stats.totalPresent} (Rate: ${stats.attendanceRate}%)
- Unexcused Absences: ${stats.totalAbsent} (Consecutive absences: ${stats.consecutiveAbsences})
- Excused: ${stats.totalExcused}
- Alerts status: ${stats.hasRedFlag ? '🔴 RED WARNING ALERT (3+ missed)' : stats.hasYellowFlag ? '🟡 YELLOW WARNING ALERT (2 consecutive miss)' : '🟢 Normal standing'}

RECENT CHRONOLOGICAL SESSION-BY-SESSION ATTENDANCE TIMELINE:
${attendanceHistory && attendanceHistory.length > 0 
  ? attendanceHistory.map((rec: any) => `- Date: ${rec.date} | Session: ${rec.label || 'Regular Session'} | Status: ${rec.status.toUpperCase()}`).join('\n')
  : 'No detailed session historical records registered.'}

CASEWORK HISTORY NOTES:
${filteredLogs.map((note: any) => `- Date: ${note.date}, Status: ${note.status}, LoggedBy: ${note.loggedBy}, Details: ${note.notes}`).join('\n') || 'No casework logs on record within this period.'}

Please return a JSON-structured performance report. Provide deep, qualitative insights to assist the staff in optimizing their outreach or counseling interventions. Reference any noteworthy medical warnings, academic performances, or home visit difficulties that were retrieved from their scanned files.
${dateRange?.start || dateRange?.end ? `PLEASE NOTE: This report is focused on the date range from ${dateRange.start || 'Beginning'} to ${dateRange.end || 'Now'}.` : ''}
`;

      const response = await callGeminiWithRetry(ai, {
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

      const { participants, statsMap, dateRange, computedStats, attendance, sessions } = req.body;
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
        
        // Find general info extracted from scanned forms
        const medicalForm = p.scannedForms?.find((f: any) => f.formType === 'medical')?.extractedData?.medical || {};
        const schoolForm = p.scannedForms?.find((f: any) => f.formType === 'school')?.extractedData?.school || {};
        const homeVisitForm = p.scannedForms?.find((f: any) => f.formType === 'home_visit')?.extractedData?.home_visit || {};

        let forms = p.filledForms || [];
        let logs = p.outreachNotes || [];
        
        if (dateRange && dateRange.start) {
          forms = forms.filter((f: any) => f.date >= dateRange.start);
          logs = logs.filter((l: any) => l.date >= dateRange.start);
        }
        if (dateRange && dateRange.end) {
          forms = forms.filter((f: any) => f.date <= dateRange.end);
          logs = logs.filter((l: any) => l.date <= dateRange.end);
        }

        // Derive recent chronological session status
        let pSessions = sessions || [];
        if (dateRange && dateRange.start) {
          pSessions = pSessions.filter((s: any) => s.date >= dateRange.start);
        }
        if (dateRange && dateRange.end) {
          pSessions = pSessions.filter((s: any) => s.date <= dateRange.end);
        }
        const sortedPSessions = [...pSessions].sort((a: any, b: any) => b.date.localeCompare(a.date));
        const pRecord = (attendance && attendance[p.id]) || {};
        const recentAttendance = sortedPSessions.slice(0, 10).map((s: any) => ({
          date: s.date,
          label: s.label || "Regular Session",
          status: pRecord[s.date] || 'unmarked'
        }));
 
        return {
          id: p.id,
          name: p.name,
          gender: p.gender || 'N/A',
          age: p.age || 'N/A',
          cohort: p.cohort,
          village: p.village || 'N/A',
          schoolingStatus: p.schoolingStatus || 'N/A',
          rate: `${stats.attendanceRate}%`,
          present: stats.totalPresent,
          absent: stats.totalAbsent,
          alert: alertStr,
          logsCount: logs.length,
          formsCount: forms.length,
          medicalSummary: medicalForm.healthStatusSummary || medicalForm.disabilitiesOrConditions || 'None',
          academicGrade: schoolForm.gradeLevel || 'N/A',
          academicScore: schoolForm.averageScorePercentage ? `${schoolForm.averageScorePercentage}%` : 'N/A',
          academicRemarks: schoolForm.teacherRemarks || 'None',
          lastLog: logs.length > 0 ? logs[0].notes.slice(0, 100) : 'None',
          recentAttendance: recentAttendance,
          formsDetails: forms.slice(0, 3).map((f: any) => ({ type: f.type, date: f.date, summary: JSON.stringify(f.data).slice(0, 150) }))
        };
      });

      const prompt = `
You are an expert Social Welfare & Educational Cohort Success Director at Lomuriangole Child and Youth Development Center.
Please review this aggregated performance roster of students, along with pre-calculated system-wide statistics detailing overall cohort attendance, gender comparisons, village-level vulnerabilities, and schooling model performance. 

You MUST create:
1. A high-fidelity comprehensive overview of student progress, considering every system detail (school status, village access difficulties, medical issues).
2. A rigorous comparative analysis of trends.
3. Multi-thematic tactical recommendations at the end of the report.
4. An analytical progress evaluation synopsis and next-steps for EVERY single student.

${dateRange?.start || dateRange?.end ? `\nPLEASE NOTE: This report is focused on date range from ${dateRange.start || 'Beginning'} to ${dateRange.end || 'Now'}.\n` : ''}

COMPUTED SYSTEM-WIDE COHORT STATISTICS:
${computedStats ? JSON.stringify(computedStats, null, 2) : 'No client-side calculated variables provided.'}

STUDENTS DATA ROSTER DIGEST (WITH RECENT CHRONOLOGICAL DAILY ATTENDANCE RECORDS):
${JSON.stringify(studentDigest, null, 2)}

Ensure you pay precise, critical attention to the "recentAttendance" chronological array for each student, looking for drop-off curves, sudden changes, or intermittent attendance to make your customized student evaluation synopsis and strategic recommendations.

Provide a structured, unified report in JSON including:
1. "cohortSummary": A high-level qualitative overview (1-2 paragraphs) detailing overall cohort enrollment robustness, common engagement trends, or environmental challenges.
2. "overallRiskDistribution": Text-based statistical estimation detailing cohort health segments (e.g. Safe/Stable vs Moderate/Risk vs Critical Intervention).
3. "comparativeAnalysis": A rich comparative text (2-3 paragraphs) contrasting performance, health variables, and attendance across genders, villages, schooling models, or age bands. Discuss the math/stats explicitly.
4. "systemStats": An object containing deep statistical commentary:
   - "villageBreakdown": review of village-by-village participation dynamics or physical hurdles.
   - "genderComparison": contrasts of engagement and attendance levels between male and female enrollees.
   - "schoolingImpact": compares academic scores and attendance trends between Day Scholars and Boarding enrollees.
5. "strategicRecommendations": An array of 3-5 high-quality, actionable, and concrete recommendations at the end of the report, each having a category (e.g., Medical Intervention, Academic Coaching, Travel & Logistical Aid, Family Counseling), specific initiative, priority level ("High", "Medium", or "Low"), and detailed qualitative rationale.
6. "studentReports": An array containing an entry for EVERY single participant in the input roster.

Each entry in "studentReports" must exactly have:
- "participantId": string matching the student's id.
- "name": student's name.
- "attendanceRate": string representing actual rate (e.g., "75%").
- "standing": string representing performance standing (e.g. "Safe", "At Risk", or "Critical").
- "synopsis": a precise, respectful, and hyper-personalized 1-to-2 sentence attendance/welfare performance evaluation report.
- "recommendedAction": a specific, direct next step for the field counselor or staff to take (such as caregiver consultation, home visitation, or local transport assistance).
`;

      const response = await callGeminiWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              cohortSummary: { type: "STRING" },
              overallRiskDistribution: { type: "STRING" },
              comparativeAnalysis: { type: "STRING" },
              systemStats: {
                type: "OBJECT",
                properties: {
                  villageBreakdown: { type: "STRING" },
                  genderComparison: { type: "STRING" },
                  schoolingImpact: { type: "STRING" }
                },
                required: ["villageBreakdown", "genderComparison", "schoolingImpact"]
              },
              strategicRecommendations: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    category: { type: "STRING" },
                    initiative: { type: "STRING" },
                    priority: { type: "STRING" },
                    rationale: { type: "STRING" }
                  },
                  required: ["category", "initiative", "priority", "rationale"]
                }
              },
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
            required: ["cohortSummary", "overallRiskDistribution", "comparativeAnalysis", "systemStats", "strategicRecommendations", "studentReports"]
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

  // API Route - Generate structured session report from a template and attendance stats
  app.post("/api/gemini/analyze-session", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: "GEMINI_API_KEY environment variable is not configured. Please add your Gemini API Key in Settings > Secrets." });
      }

      const { session, attendanceStats, templateData, participants } = req.body;
      if (!session || !attendanceStats || !templateData) {
        return res.status(400).json({ error: "Missing required session, attendanceStats or templateData." });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Construct student-by-student attendance list string
      let participantsListStr = "No participant list provided.";
      if (Array.isArray(participants) && participants.length > 0) {
        participantsListStr = participants.map((p: any) => {
          const status = p.status || 'unmarked';
          return `- Student: ${p.name} | Cohort: ${p.cohort} | Status: ${status.toUpperCase()}`;
        }).join('\n');
      }

      const prompt = `
You are an expert Educational Cohort Success & Welfare Analyst at Lomuriangole Child and Youth Development Center.
Your task is to draft a professional, detailed, and highly constructive Session Report based on:
1. General Session Details
2. Attendance Stats for this session
3. The specific student-by-student attendance list (focusing on present/absent/excused statuses)
4. A staff-provided template of notes/highlights/challenges

---
SESSION DETAILS:
- Date: ${session.date}
- Session Label: ${session.label || 'Regular Session'}
- Activities Checklist completed: ${Object.entries(session.checklist || {}).filter(([_, val]) => val).map(([key]) => key).join(', ') || 'None'}

ATTENDANCE STATS:
- Attendance Rate: ${attendanceStats.rate}%
- Present: ${attendanceStats.present}
- Absent: ${attendanceStats.absent}
- Excused: ${attendanceStats.excused}

STAFF-PROVIDED KEY POINTS (TEMPLATE):
- Topic/Lessons: ${templateData.topic || 'N/A'}
- Highlights/Milestones: ${templateData.highlights || 'N/A'}
- Challenges/Materials Needed: ${templateData.challenges || 'N/A'}
- Individual Student Updates: ${templateData.studentUpdates || 'N/A'}

STUDENT ATTENDANCE REGISTRY (FOR THIS SESSION):
${participantsListStr}

---
REQUIREMENTS FOR THE REPORT:
Please compose a beautifully written, formal and encouraging session report in Markdown format.
The report MUST contain the following sections:
1. **Executive Summary**: A concise paragraph summarizing the session's overall turnout and success. Speak warmly of the child support initiative at Lomuriangole.
2. **Key Learning Points & Activities**: Discuss the lessons or workshops delivered, expanding on the topic provided.
3. **Notable Highlights & Individual Milestones**: Detail any success stories, milestones, or specific updates about children mentioned in the template or who had exceptional attendance behavior.
4. **Challenges & Resource Constraints**: Identify any roadblocks (e.g., shortages of materials, late arrivals) and list actionable resources or support required.
5. **Absentee Follow-Up Plan**: Specifically list the names of the students who were ABSENT or EXCUSED during this session. Outline a brief, caring outreach strategy for each or for the group to ensure they are visited by caseworkers or supported.

Write in a highly professional, compassionate, and structured tone. Use elegant clear spacing and beautiful markdown bullet points. Return a JSON object with a single "report" key containing the Markdown string.
`;

      const response = await callGeminiWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              report: { type: "STRING", description: "The drafted markdown report content" }
            },
            required: ["report"]
          }
        }
      });

      const responseText = response.text || "{}";
      const parsed = JSON.parse(responseText.trim());
      return res.json(parsed);

    } catch (error: any) {
      console.error("Gemini session report generation failed:", error);
      return res.status(500).json({ error: error.message || "Failed to generate session report." });
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

      const response = await callGeminiWithRetry(ai, {
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

  // API Route - Compose personalized caregiver SMS outreach message
  app.post("/api/gemini/compose-sms", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: "GEMINI_API_KEY environment variable is not configured. Please add your Gemini API Key in Settings > Secrets." });
      }

      const { student, type, tone, extraContext } = req.body;
      if (!student) {
        return res.status(400).json({ error: "Missing required student parameter." });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const statsText = `Attendance Rate: ${student.attendanceRate || 'N/A'}. Alert status: ${student.alertStatus || 'stable'}.`;
      const caregiverName = student.caregiver && student.caregiver !== '-' ? student.caregiver : 'Caregiver';

      // Parse scanned forms if any to customize the outreach
      const medicalForm = student.scannedForms?.find((f: any) => f.formType === 'medical')?.extractedData?.medical || {};
      const schoolForm = student.scannedForms?.find((f: any) => f.formType === 'school')?.extractedData?.school || {};
      const homeVisitForm = student.scannedForms?.find((f: any) => f.formType === 'home_visit')?.extractedData?.home_visit || {};

      let detailsContext = "";
      if (medicalForm.healthStatusSummary) detailsContext += `Medical Notes: "${medicalForm.healthStatusSummary}". `;
      if (schoolForm.averageScorePercentage) detailsContext += `Academic: "${schoolForm.schoolName}" school, Grade ${schoolForm.gradeLevel}, average score ${schoolForm.averageScorePercentage}%. `;
      if (homeVisitForm.riskVulnerabilitiesSummary) detailsContext += `Home visit vulnerability notes: "${homeVisitForm.riskVulnerabilitiesSummary}". `;

      const prompt = `
You are an expert student counselor and caseworker communications assistant at Lomuriangole Child and Youth Development Center in Moroto, Uganda.
Please compose a short, respectful, and culturally appropriate SMS invitation/notification message to send to a student's caregiver.

RECIPIENT & CONTEXT:
- Caregiver Name: ${caregiverName}
- Student Name: ${student.name}
- Student Age/Gender: ${student.age || 'N/A'} (${student.gender || 'N/A'})
- Stats & Alerts: ${statsText}
- Scanned Welfare Dossier Context (if any): ${detailsContext}
- Communication Campaign Topic: ${type}
- Desired Tone: ${tone}
- Additional Staff Guidance/Context: ${extraContext || 'None'}

CONSTRAINTS:
1. The message must be concise (ideally under 140-160 characters, suitable for basic SMS length, though can go slightly longer if needed).
2. Use extremely polite, humble language, ideally opening with a humble greeting (e.g. "We greet you", "Greetings from Lomuriangole CYDC", "Hello [Caregiver Name], greetings of peace from Lomuriangole").
3. Ensure the message is supportive, clear, and invites collaboration, making the parent feel valued.
4. Keep the text simple, direct, and straightforward to translate into Karimojong (Ngakarimojong) language or plain English. Avoid complex slang.
5. Do NOT output markdown, quotes, formatting prefixes, or anything else. Just output the raw message text ready to copy or send immediately.
`;

      const response = await callGeminiWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      const responseText = (response.text || "").trim();
      return res.json({ success: true, sms: responseText });

    } catch (error: any) {
      console.error("Gemini SMS outreach composer failed:", error);
      return res.status(500).json({ error: error.message || "Failed to compose SMS message." });
    }
  });

  // API Route - Enhance Petty Cash Request description using AI
  app.post("/api/gemini/enhance-petty-cash", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: "GEMINI_API_KEY environment variable is not configured. Please add your Gemini API Key in Settings > Secrets." });
      }

      const { amount, purpose, dates, submittedBy } = req.body;
      if (!amount || !purpose || !dates || !submittedBy) {
        return res.status(400).json({ error: "Missing required parameters (amount, purpose, dates, or submittedBy)." });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `You are a professional administrative assistant for the Lomuriangole Child and Youth Development Center.
A petty cash request is being submitted by the department: "${submittedBy}".
Request Details:
- Amount requested: UGX ${amount}
- Purpose: "${purpose}"
- Intended dates: "${dates}"

Write a highly professional, well-reasoned, and polite justification statement for this petty cash request. The statement should expand on the purpose, explaining why it is critical for the center's activities during the requested dates, ensuring proper care for our children/participants, and showing accountability. Keep the response to 1-2 concise and professional paragraphs. Avoid placeholders; generate concrete, realistic reasoning appropriate for the Lomuriangole child care center context. Do not include subject lines or greetings, just the body paragraphs of the justification.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      const explanation = (response.text || "").trim();
      return res.json({ success: true, explanation });

    } catch (error: any) {
      console.error("Gemini Petty Cash Enhancer failed:", error);
      return res.status(500).json({ error: error.message || "Failed to enhance petty cash request." });
    }
  });

  // API Route - Direct Mobile SMS Transmitter via Africa's Talking Gateway
  app.post("/api/africastalking/send-sms", async (req, res) => {
    try {
      const username = process.env.AFRICASTALKING_USERNAME;
      const apiKey = process.env.AFRICASTALKING_API_KEY;
      const senderId = process.env.AFRICASTALKING_SENDER_ID; // Optional

      const { to, message } = req.body;

      if (!to || !message) {
        return res.status(400).json({ error: "Missing required 'to' (recipient cell) or 'message' parameters." });
      }

      // Check if Africa's Talking is configured. If not, toggle safe simulation mode with verbose setup details.
      if (!apiKey) {
        console.warn("[Africa's Talking] API Key not configured. Running safe sandbox simulator.");
        return res.json({
          success: true,
          isSimulated: true,
          message: `[SIMULATED TRANSMISSION] Successfully transmitted message to Africa's Talking virtual gateway for number ${to}: "${message}"`,
          recipient: to,
          info: "To transition to live broadcast, configure AFRICASTALKING_API_KEY and AFRICASTALKING_USERNAME in your Settings > Secrets or environment."
        });
      }

      const apiUsername = username || "sandbox";
      const isSandbox = apiUsername.toLowerCase() === "sandbox";
      const endpoint = isSandbox
        ? "https://api.sandbox.africastalking.com/version1/messaging"
        : "https://api.africastalking.com/version1/messaging";

      const params = new URLSearchParams();
      params.append("username", apiUsername);
      params.append("to", to);
      params.append("message", message);
      if (senderId) {
        params.append("from", senderId);
      }

      // Perform node fetch request
      const atResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "apiKey": apiKey
        },
        body: params.toString()
      });

      const responseText = await atResponse.text();
      let result: any = {};
      try {
        result = JSON.parse(responseText);
      } catch (parseErr) {
        result = { raw: responseText };
      }

      if (!atResponse.ok) {
        return res.status(atResponse.status).json({
          success: false,
          error: `Africa's Talking gateway reported an error: ${result.errorMessage || responseText || 'Unknown gateway exception'}`
        });
      }

      return res.json({
        success: true,
        isSimulated: false,
        data: result
      });

    } catch (error: any) {
      console.error("Africa's Talking SMS delivery exception:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to deliver SMS through local Express proxy."
      });
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
