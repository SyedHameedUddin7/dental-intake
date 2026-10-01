import { z } from 'zod'
import { and, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../db'
import { visits, patients, profiles } from '../db/schema'
import {
  CLINIC_CLOSE_HOUR,
  CLINIC_OPEN_HOUR,
  clinicHoursLabel,
  createAppointmentSchema,
} from '#shared/schemas/appointment'
import { logAudit } from '../utils/audit'
import { serverSupabaseUser } from '#supabase/server'

const CAN_BOOK = ['admin', 'front_desk']

// Statuses that occupy a dentist's chair. A cancelled or no-show booking frees
// the slot; a completed one is in the past and cannot clash with a new booking.
const OCCUPIES_CHAIR = ['scheduled', 'checked_in', 'in_progress'] as const

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  const userId = claims?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Profile not found' })
  if (!CAN_BOOK.includes(profile.role)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const parsed = createAppointmentSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: z.flattenError(parsed.error),
    })
  }
  const input = parsed.data

  const [patient] = await db.select({ id: patients.id }).from(patients).where(eq(patients.id, input.patientId)).limit(1)
  if (!patient) throw createError({ statusCode: 404, statusMessage: 'Patient not found' })

  const startsAt = new Date(input.scheduledAt)
  const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000)

  // Keep the booking inside the working day. Local hours, matching how the
  // board and schedule derive their day boundaries.
  const startHour = startsAt.getHours() + startsAt.getMinutes() / 60
  const endHour = endsAt.getHours() + endsAt.getMinutes() / 60
  const spillsPastMidnight = endsAt.getDate() !== startsAt.getDate()
  if (startHour < CLINIC_OPEN_HOUR || spillsPastMidnight || endHour > CLINIC_CLOSE_HOUR) {
    throw createError({
      statusCode: 400,
      statusMessage: `Appointments run ${clinicHoursLabel()} — this one would finish outside opening hours`,
    })
  }

  // Double-booking check. Only a named dentist is a bookable resource; leaving
  // the appointment unassigned puts it in the pool, which has no single chair
  // to clash over.
  if (input.providerId) {
    const other = alias(patients, 'other_patient')
    const clashProvider = alias(profiles, 'clash_provider')
    const [clash] = await db
      .select({
        scheduledAt: visits.scheduledAt,
        durationMinutes: visits.durationMinutes,
        patientFirstName: other.firstName,
        patientLastName: other.lastName,
        providerName: clashProvider.fullName,
      })
      .from(visits)
      .innerJoin(other, eq(visits.patientId, other.id))
      .leftJoin(clashProvider, eq(visits.providerId, clashProvider.id))
      .where(
        and(
          eq(visits.providerId, input.providerId),
          inArray(visits.status, [...OCCUPIES_CHAIR]),
          isNotNull(visits.scheduledAt),
          // Two ranges overlap when each starts before the other ends.
          // toISOString(): a bare Date in a raw sql fragment has no column type
          // mapper attached and postgres.js would reject it.
          lt(visits.scheduledAt, endsAt),
          sql`${visits.scheduledAt} + make_interval(mins => ${visits.durationMinutes}) > ${startsAt.toISOString()}`,
        ),
      )
      .limit(1)

    if (clash) {
      throw createError({
        statusCode: 409,
        statusMessage: 'That dentist is already booked at this time',
        data: {
          conflict: {
            scheduledAt: clash.scheduledAt ? new Date(clash.scheduledAt).toISOString() : '',
            durationMinutes: clash.durationMinutes,
            patientName: `${clash.patientFirstName} ${clash.patientLastName}`,
            providerName: clash.providerName,
          },
        },
      })
    }
  }

  const [visit] = await db
    .insert(visits)
    .values({
      patientId: input.patientId,
      status: 'scheduled',
      scheduledAt: startsAt,
      durationMinutes: input.durationMinutes,
      providerId: input.providerId || null,
      reason: input.reason || null,
    })
    .returning({ id: visits.id })

  await logAudit({
    actorId: userId,
    action: 'create',
    entityType: 'visit',
    entityId: visit.id,
    metadata: {
      patientId: input.patientId,
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      kind: 'appointment',
    },
  })

  setResponseStatus(event, 201)
  return { id: visit.id }
})
