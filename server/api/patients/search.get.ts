import { and, eq, inArray, desc, count, max, sql } from 'drizzle-orm'
import { db } from '../../db'
import { patients, visits, intakeSubmissions, profiles } from '../../db/schema'
import { patientSearchSchema, type PatientMatch } from '#shared/schemas/patient'
import { serverSupabaseUser } from '#supabase/server'

// Same roles that can create an intake can look patients up.
const CAN_SEARCH = ['admin', 'front_desk']

export default defineEventHandler(async (event): Promise<PatientMatch[]> => {
  const claims = await serverSupabaseUser(event)
  const userId = claims?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Profile not found' })
  if (!CAN_SEARCH.includes(profile.role)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const parsed = patientSearchSchema.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'firstName, lastName and dateOfBirth are required' })
  const { firstName, lastName, dateOfBirth } = parsed.data

  // Exact match on name (case-insensitive) + date of birth.
  const matches = await db
    .select({
      id: patients.id,
      firstName: patients.firstName,
      lastName: patients.lastName,
      dateOfBirth: patients.dateOfBirth,
      phone: patients.phone,
      email: patients.email,
    })
    .from(patients)
    .where(
      and(
        sql`lower(${patients.firstName}) = ${firstName.toLowerCase()}`,
        sql`lower(${patients.lastName}) = ${lastName.toLowerCase()}`,
        eq(patients.dateOfBirth, dateOfBirth),
      ),
    )
    .limit(5)
  if (!matches.length) return []

  const ids = matches.map((m) => m.id)

  // Visit count + last visit time per matched patient.
  const visitAgg = await db
    .select({ patientId: visits.patientId, visits: count(), last: max(visits.checkedInAt) })
    .from(visits)
    .where(inArray(visits.patientId, ids))
    .groupBy(visits.patientId)
  const visitByPatient = new Map(visitAgg.map((v) => [v.patientId, v]))

  // Most recent intake per patient supplies the history to prefill.
  const intakes = await db
    .select({
      patientId: intakeSubmissions.patientId,
      allergies: intakeSubmissions.allergies,
      conditions: intakeSubmissions.conditions,
      medications: intakeSubmissions.medications,
      symptoms: intakeSubmissions.symptoms,
    })
    .from(intakeSubmissions)
    .where(inArray(intakeSubmissions.patientId, ids))
    .orderBy(desc(intakeSubmissions.createdAt))
  const latestIntake = new Map<string, (typeof intakes)[number]>()
  for (const it of intakes) if (!latestIntake.has(it.patientId)) latestIntake.set(it.patientId, it)

  return matches.map((m) => {
    const v = visitByPatient.get(m.id)
    const it = latestIntake.get(m.id)
    return {
      ...m,
      lastVisitAt: v?.last ? new Date(v.last).toISOString() : null,
      visitCount: v?.visits ?? 0,
      history: it
        ? {
            allergies: it.allergies,
            conditions: it.conditions,
            medications: it.medications,
            symptoms: it.symptoms,
          }
        : null,
    }
  })
})
