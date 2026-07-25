import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { patients, intakeSubmissions, profiles } from '../db/schema'
import { intakeSchema } from '#shared/schemas/intake'
import { serverSupabaseUser } from '#supabase/server'

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

  const parsed = intakeSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: z.flattenError(parsed.error),
    })
  }
  const input = parsed.data

  // Create the patient and their intake record atomically.
  const result = await db.transaction(async (tx) => {
    const [patient] = await tx
      .insert(patients)
      .values({
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth,
        phone: input.phone || null,
        email: input.email || null,
        createdBy: userId,
      })
      .returning({ id: patients.id })

    const [intake] = await tx
      .insert(intakeSubmissions)
      .values({
        patientId: patient.id,
        source: input.rawTranscript ? 'voice' : 'form',
        allergies: input.allergies,
        conditions: input.conditions,
        medications: input.medications,
        symptoms: input.symptoms || null,
        rawTranscript: input.rawTranscript || null,
      })
      .returning({ id: intakeSubmissions.id })

    return { patientId: patient.id, intakeId: intake.id }
  })

  setResponseStatus(event, 201)
  return result
})
