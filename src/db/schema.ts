import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, boolean, json, unique } from 'drizzle-orm/pg-core';

// Users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  metadata: json('metadata'), // JSON representing extra user states
  createdAt: timestamp('created_at').defaultNow(),
});

// Participants table
export const participants = pgTable('participants', {
  id: text('id').primaryKey(), // Using string ID (e.g., UUID or local sync ID)
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  contact: text('contact').notNull(),
  cohort: text('cohort').notNull(),
  joinDate: text('join_date').notNull(),
  avatarColor: text('avatar_color').notNull(),
  registrationNotes: text('registration_notes'),
  idNo: text('id_no'),
  age: text('age'),
  dob: text('dob'),
  village: text('village'),
  caregiver: text('caregiver'),
  gender: text('gender'),
  schoolingStatus: text('schooling_status'),
  schoolClass: text('school_class'),
  isFormer: boolean('is_former').default(false).notNull(),
  formerDate: text('former_date'),
  photoUrl: text('photo_url'),
  isPermanent: boolean('is_permanent').default(false).notNull(),
  isImported: boolean('is_imported').default(false).notNull(),
  scannedForms: json('scanned_forms'), // JSON array of ScannedForm
  documents: json('documents'),       // JSON array of OfficialDocument
  filledForms: json('filled_forms'),   // JSON array of FilledForm
  outreachNotes: json('outreach_notes'), // JSON array of OutreachLog
  createdAt: timestamp('created_at').defaultNow(),
});

// Sessions table
export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  date: text('date').notNull(), // Format YYYY-MM-DD
  label: text('label'),
  checklist: json('checklist'), // Record<string, boolean>
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  unique('session_user_date_uq').on(t.userId, t.date)
]);

// Attendance table (each attendance record maps a participant to a date)
export const attendance = pgTable('attendance', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  participantId: text('participant_id').notNull().references(() => participants.id, { onDelete: 'cascade' }),
  date: text('date').notNull(), // Format YYYY-MM-DD
  status: text('status').notNull(), // 'present' | 'absent' | 'excused' | 'unmarked'
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  unique('attendance_user_participant_date_uq').on(t.userId, t.participantId, t.date)
]);

// Define Drizzle Relationships
export const usersRelations = relations(users, ({ many }) => ({
  participants: many(participants),
  sessions: many(sessions),
  attendance: many(attendance),
}));

export const participantsRelations = relations(participants, ({ one, many }) => ({
  user: one(users, {
    fields: [participants.userId],
    references: [users.id],
  }),
  attendance: many(attendance),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  user: one(users, {
    fields: [attendance.userId],
    references: [users.id],
  }),
  participant: one(participants, {
    fields: [attendance.participantId],
    references: [participants.id],
  }),
}));
