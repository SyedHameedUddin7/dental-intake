import { z } from 'zod'
import type { SummaryStructured } from './summary'
import type { PatientInsurance } from './insurance'

// Query for looking up an existing patient before starting a fresh intake.
// Matching is exact on name + date of birth (predictable and safe).
export const patientSearchSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  dateOfBirth: z.iso.date(),
})
export type PatientSearchInput = z.infer<typeof patientSearchSchema>

// The most recent medical history on file for a matched patient — used to
// prefill the intake form ("anything changed since last visit?").
export type PatientHistory = {
  allergies: string[]
  conditions: string[]
  medications: string[]
  symptoms: string | null
}

// A patient matched by name + DOB, with enough context to prefill the form.
export type PatientMatch = {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string
  phone: string | null
  email: string | null
  lastVisitAt: string | null
  visitCount: number
  history: PatientHistory | null
}

// A row in the patients directory.
export type PatientListItem = {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string
  lastVisitAt: string | null
  visitCount: number
}

// One visit in a patient's longitudinal history.
export type TimelineVisit = {
  id: string
  status: string
  reason: string | null
  checkedInAt: string | null
  createdAt: string
  providerName: string | null
  diagnosis: string | null
  comments: string | null
  history: PatientHistory | null
  summary: { summaryText: string; structured: SummaryStructured } | null
}

// A patient with their full visit timeline (most recent first).
export type PatientDetail = {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string
  phone: string | null
  email: string | null
  createdAt: string
  insurance: PatientInsurance
  visits: TimelineVisit[]
}
