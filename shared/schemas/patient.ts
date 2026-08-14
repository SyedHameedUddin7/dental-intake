import { z } from 'zod'

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
