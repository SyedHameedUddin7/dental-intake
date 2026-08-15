import { pgTable, pgEnum, uuid, text, date, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const userRole = pgEnum('user_role', ['admin', 'front_desk', 'dentist']);
export const visitStatus = pgEnum('visit_status', ['scheduled', 'checked_in', 'in_progress', 'done', 'cancelled', 'no_show']);
export const intakeSource = pgEnum('intake_source', ['form', 'voice']);
export const auditAction = pgEnum('audit_action', ['view', 'create', 'update', 'delete']);
export const insuranceStatus = pgEnum('insurance_status', ['unverified', 'pending', 'verified', 'expired']);
export const consentType = pgEnum('consent_type', ['hipaa', 'treatment', 'financial']);

// Staff. id will be constrained to auth.users.id via SQL migration in Step 4.
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  role: userRole('role').notNull().default('front_desk'),
  fullName: text('full_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const patients = pgTable('patients', {
  id: uuid('id').primaryKey().defaultRandom(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  dateOfBirth: date('date_of_birth').notNull(),
  phone: text('phone'),
  email: text('email'),
  insuranceProvider: text('insurance_provider'),
  insuranceMemberId: text('insurance_member_id'),
  // Storage object path for the scanned insurance card (private bucket).
  insuranceCardPath: text('insurance_card_path'),
  insuranceStatus: insuranceStatus('insurance_status').notNull().default('unverified'),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const visits = pgTable('visits', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  providerId: uuid('provider_id').references(() => profiles.id, { onDelete: 'set null' }),
  status: visitStatus('status').notNull().default('scheduled'),
  reason: text('reason'),
  diagnosis: text('diagnosis'),
  comments: text('comments'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const intakeSubmissions = pgTable('intake_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  visitId: uuid('visit_id').references(() => visits.id, { onDelete: 'set null' }),
  source: intakeSource('source').notNull().default('form'),
  allergies: jsonb('allergies').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  conditions: jsonb('conditions').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  medications: jsonb('medications').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  symptoms: text('symptoms'),
  rawTranscript: text('raw_transcript'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiSummaries = pgTable('ai_summaries', {
  id: uuid('id').primaryKey().defaultRandom(),
  intakeId: uuid('intake_id').notNull().references(() => intakeSubmissions.id, { onDelete: 'cascade' }),
  summaryText: text('summary_text').notNull(),
  structured: jsonb('structured'),
  model: text('model'),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
  action: auditAction('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// A signed consent form. Snapshots the exact wording + version the patient
// agreed to, so the record stands even if the template text changes later.
export const consents = pgTable('consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  type: consentType('type').notNull(),
  version: text('version').notNull(),
  bodySnapshot: text('body_snapshot').notNull(),
  signatureData: text('signature_data').notNull(),
  signedBy: uuid('signed_by').references(() => profiles.id, { onDelete: 'set null' }),
  signedAt: timestamp('signed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});