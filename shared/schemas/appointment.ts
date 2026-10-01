import { z } from 'zod'

// Appointment lengths the front desk can pick, in minutes.
export const APPOINTMENT_DURATIONS = [15, 30, 45, 60, 90] as const
export type AppointmentDuration = (typeof APPOINTMENT_DURATIONS)[number]
export const DEFAULT_DURATION_MINUTES: AppointmentDuration = 30

// When the practice is open, as whole hours on a 24h clock. One window for the
// whole practice: per-dentist working hours would need their own table, and
// this is enough to keep bookings inside the working day.
//
// These are local hours. The board and schedule already build their day
// boundaries from local date parts, so the server is assumed to run in the
// practice's own timezone.
export const CLINIC_OPEN_HOUR = 9
export const CLINIC_CLOSE_HOUR = 17

export function clinicHoursLabel() {
  const fmt = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`
  return `${fmt(CLINIC_OPEN_HOUR)}–${fmt(CLINIC_CLOSE_HOUR)}`
}

const durationSchema = z.coerce
  .number()
  .int()
  .refine(
    (n) => (APPOINTMENT_DURATIONS as readonly number[]).includes(n),
    `Pick one of: ${APPOINTMENT_DURATIONS.join(', ')} minutes`,
  )

// Book a future visit. scheduledAt is a full ISO datetime (the client converts
// its datetime-local input via toISOString()).
export const createAppointmentSchema = z.object({
  patientId: z.uuid(),
  scheduledAt: z.iso.datetime(),
  durationMinutes: durationSchema.default(DEFAULT_DURATION_MINUTES),
  providerId: z.union([z.literal(''), z.uuid()]).optional(),
  reason: z.string().trim().max(2000).optional(),
})
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>

// Returned with a 409 when the chosen dentist is already busy, so the UI can
// name the clash instead of just refusing.
export type BookingConflict = {
  scheduledAt: string
  durationMinutes: number
  patientName: string
  providerName: string | null
}

// A booked appointment as shown on the schedule.
export type Appointment = {
  id: string
  patientId: string
  patientName: string
  scheduledAt: string
  durationMinutes: number
  reason: string | null
  providerName: string | null
  status: string
}
