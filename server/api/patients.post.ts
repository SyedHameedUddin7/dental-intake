import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { patients, profiles } from '../db/schema'
import { createPatientSchema } from '#shared/schemas/patient'
import { logAudit } from '../utils/audit'
import { serverSupabaseUser } from '#supabase/server'

// Same roles that run an intake may register a patient ahead of a booking.
const CAN_CREATE = ['admin', 'front_desk']

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  const userId = claims?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // Server is the source of truth for role — never trust the client.
  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Profile not found' })
  if (!CAN_CREATE.includes(profile.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const parsed = createPatientSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: z.flattenError(parsed.error),
    })
  }
  const input = parsed.data

  // Exact name + DOB is the same identity rule the intake form matches on.
  // Refuse rather than silently forking a second record for the same person —
  // the caller gets the existing id back so it can just use them instead.
  const [duplicate] = await db
    .select({ id: patients.id, firstName: patients.firstName, lastName: patients.lastName })
    .from(patients)
    .where(
      and(
        eq(patients.firstName, input.firstName),
        eq(patients.lastName, input.lastName),
        eq(patients.dateOfBirth, input.dateOfBirth),
      ),
    )
    .limit(1)
  if (duplicate) {
    throw createError({
      statusCode: 409,
      statusMessage: 'A patient with this name and date of birth already exists',
      data: { existing: duplicate },
    })
  }

  const [patient] = await db
    .insert(patients)
    .values({
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: input.dateOfBirth,
      phone: input.phone || null,
      email: input.email || null,
      createdBy: userId,
    })
    .returning({
      id: patients.id,
      firstName: patients.firstName,
      lastName: patients.lastName,
      dateOfBirth: patients.dateOfBirth,
    })
  if (!patient) throw createError({ statusCode: 500, statusMessage: 'Failed to create patient' })

  await logAudit({
    actorId: userId,
    action: 'create',
    entityType: 'patient',
    entityId: patient.id,
    metadata: { source: 'booking' },
  })

  setResponseStatus(event, 201)
  return patient
})
