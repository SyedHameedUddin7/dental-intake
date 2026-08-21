import { z } from 'zod'

// Book a future visit. scheduledAt is a full ISO datetime (the client converts
// its datetime-local input via toISOString()).
export const createAppointmentSchema = z.object({
  patientId: z.uuid(),
  scheduledAt: z.iso.datetime(),
  providerId: z.union([z.literal(''), z.uuid()]).optional(),
  reason: z.string().trim().max(2000).optional(),
})
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>

// A booked appointment as shown on the schedule.
export type Appointment = {
  id: string
  patientId: string
  patientName: string
  scheduledAt: string
  reason: string | null
  providerName: string | null
  status: string
}
