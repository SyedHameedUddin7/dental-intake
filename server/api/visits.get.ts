import { eq, and, gte, inArray, desc } from 'drizzle-orm'
import { db } from '../db'
import { visits, patients, profiles } from '../db/schema'
import { serverSupabaseUser } from '#supabase/server'

// Active statuses shown on the live board.
const ACTIVE = ['checked_in', 'in_progress', 'done'] as const

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  const userId = claims?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // Any authenticated staff member can view the board.
  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Profile not found' })

  // Scope the board to today so completed visits clear overnight instead of
  // accumulating forever in the "Done" column.
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const rows = await db
    .select({
      id: visits.id,
      status: visits.status,
      reason: visits.reason,
      checkedInAt: visits.checkedInAt,
      createdAt: visits.createdAt,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
    })
    .from(visits)
    .innerJoin(patients, eq(visits.patientId, patients.id))
    .where(and(inArray(visits.status, [...ACTIVE]), gte(visits.checkedInAt, startOfToday)))
    .orderBy(desc(visits.checkedInAt))

  return rows
})
