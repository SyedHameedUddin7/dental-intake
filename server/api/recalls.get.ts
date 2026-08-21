import { eq, sql, max } from 'drizzle-orm'
import { db } from '../db'
import { patients, visits, profiles } from '../db/schema'
import { RECALL_MONTHS, type RecallPatient } from '#shared/schemas/recall'
import { serverSupabaseUser } from '#supabase/server'

// Recalls are a front-desk workflow.
const CAN_VIEW = ['admin', 'front_desk']

export default defineEventHandler(async (event): Promise<RecallPatient[]> => {
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

  const recallBefore = new Date()
  recallBefore.setMonth(recallBefore.getMonth() - RECALL_MONTHS)

  // Patients whose most recent actual visit is older than the recall window and
  // who have no future scheduled appointment. Longest-overdue first.
  const rows = await db
    .select({
      id: patients.id,
      firstName: patients.firstName,
      lastName: patients.lastName,
      phone: patients.phone,
      email: patients.email,
      lastVisitAt: max(visits.checkedInAt),
    })
    .from(patients)
    .innerJoin(visits, eq(visits.patientId, patients.id))
    .groupBy(patients.id)
    .having(
      sql`max(${visits.checkedInAt}) < ${recallBefore}
        and coalesce(max(case when ${visits.status} = 'scheduled' and ${visits.scheduledAt} > now() then 1 else 0 end), 0) = 0`,
    )
    .orderBy(sql`max(${visits.checkedInAt}) asc`)
    .limit(100)

  return rows.map((r) => ({
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    phone: r.phone,
    email: r.email,
    lastVisitAt: new Date(r.lastVisitAt as string | number | Date).toISOString(),
  }))
})
