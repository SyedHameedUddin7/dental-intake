import { z } from 'zod'

// Mirrors the visit_status pgEnum in the DB schema.
export const VISIT_STATUSES = [
  'scheduled',
  'checked_in',
  'in_progress',
  'done',
  'cancelled',
  'no_show',
] as const

export const visitStatusSchema = z.enum(VISIT_STATUSES)
export type VisitStatus = (typeof VISIT_STATUSES)[number]

// Payload for updating a visit's status from the board.
export const visitUpdateSchema = z.object({
  status: visitStatusSchema,
})

// Payload for a dentist's post-visit chart notes. Empty strings clear a field.
export const visitNotesSchema = z.object({
  diagnosis: z.string().trim().max(500),
  comments: z.string().trim().max(5000),
})
export type VisitNotesInput = z.infer<typeof visitNotesSchema>

// A row as shown on the live status board.
export type BoardVisit = {
  id: string
  patientId: string
  status: VisitStatus
  reason: string | null
  checkedInAt: string | null
  createdAt: string
  patientFirstName: string
  patientLastName: string
  providerId: string | null
  providerName: string | null
}
