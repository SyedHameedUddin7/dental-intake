import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { visits, patients, profiles } from '../db/schema'
import { createAppointmentSchema } from '#shared/schemas/appointment'
import { logAudit } from '../utils/audit'
import { serverSupabaseUser } from '#supabase/server'

const CAN_BOOK = ['admin', 'front_desk']

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

  const [visit] = await db
    .insert(visits)
    .values({
      patientId: input.patientId,
      status: 'scheduled',
      scheduledAt: new Date(input.scheduledAt),
      providerId: input.providerId || null,
      reason: input.reason || null,
    })
    .returning({ id: visits.id })

  await logAudit({
    actorId: userId,
    action: 'create',
    entityType: 'visit',
    entityId: visit.id,
    metadata: { patientId: input.patientId, scheduledAt: input.scheduledAt, kind: 'appointment' },
  })

  setResponseStatus(event, 201)
  return { id: visit.id }
})
