import { z } from 'zod'
import { eq, or, ilike, count, max, sql } from 'drizzle-orm'
import { db } from '../db'
import { patients, visits, profiles } from '../db/schema'
import type { PatientListItem } from '#shared/schemas/patient'
import { serverSupabaseUser } from '#supabase/server'

// Any staff member can browse the patient directory.
const CAN_VIEW = ['admin', 'front_desk', 'dentist']

export default defineEventHandler(async (event): Promise<PatientListItem[]> => {
  const claims = await serverSupabaseUser(event)
  const userId = claims?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Profile not found' })
  if (!CAN_VIEW.includes(profile.role)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const q = z.string().trim().max(100).optional().catch(undefined).parse(getQuery(event).q)
  const filter = q
    ? or(ilike(patients.firstName, `%${q}%`), ilike(patients.lastName, `%${q}%`))
    : undefined

  const rows = await db
    .select({
      id: patients.id,
      firstName: patients.firstName,
      lastName: patients.lastName,
      dateOfBirth: patients.dateOfBirth,
      lastVisitAt: max(visits.checkedInAt),
      visitCount: count(visits.id),
    })
    .from(patients)
    .leftJoin(visits, eq(visits.patientId, patients.id))
    .where(filter)
    .groupBy(patients.id)
    .orderBy(sql`max(${visits.checkedInAt}) desc nulls last`, patients.lastName)
    .limit(50)

  return rows.map((r) => ({
    ...r,
    lastVisitAt: r.lastVisitAt ? new Date(r.lastVisitAt).toISOString() : null,
  }))
})
