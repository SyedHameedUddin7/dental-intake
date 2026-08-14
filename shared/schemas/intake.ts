import { z } from 'zod'

// Single source of truth for intake validation, shared by the form (client)
// and POST /api/intake (server) via the Nuxt `#shared` alias.

const name = z.string().trim().min(1, 'Required').max(100)

// Optional free text: treat blank as "not provided".
const optionalText = (max: number) =>
  z.string().trim().max(max).optional()

// A list of short free-text tags (allergies, conditions, medications).
const tagList = z
  .array(z.string().trim().min(1).max(200))
  .max(50)
  .default([])

export const intakeSchema = z.object({
  // Set when checking in a returning patient — reuse their record instead of
  // creating a new one. Omitted for a brand-new patient.
  patientId: z.uuid().optional(),
  firstName: name,
  lastName: name,
  // HTML date inputs produce 'YYYY-MM-DD'; matches the `date` column.
  dateOfBirth: z
    .iso.date('Enter a valid date')
    .refine((d) => new Date(d) <= new Date(), 'Date of birth cannot be in the future'),
  phone: optionalText(30),
  email: z.union([z.literal(''), z.email('Enter a valid email')]).optional(),
  insuranceProvider: optionalText(100),
  insuranceMemberId: optionalText(100),
  allergies: tagList,
  conditions: tagList,
  medications: tagList,
  symptoms: optionalText(2000),
  // Optional preferred dentist. When set, the visit is assigned to them so it
  // lands on their board immediately; when blank the patient stays in the
  // unassigned pool for any dentist to pick up.
  providerId: z.union([z.literal(''), z.uuid()]).optional(),
  // Present when the intake originated from a voice recording; the server
  // uses it to mark source='voice' and retain the raw transcript.
  rawTranscript: z.string().trim().max(20000).optional(),
})

export type IntakeInput = z.infer<typeof intakeSchema>
