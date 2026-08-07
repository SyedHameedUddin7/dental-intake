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

// A row as shown on the live status board.
export type BoardVisit = {
  id: string
  status: VisitStatus
  reason: string | null
  checkedInAt: string | null
  createdAt: string
  patientFirstName: string
  patientLastName: string
}
