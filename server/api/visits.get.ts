import { z } from 'zod'
import { eq, and, or, gte, lt, isNull, inArray, desc } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../db'
import { visits, patients, profiles } from '../db/schema'
import { serverSupabaseUser } from '#supabase/server'

// Active statuses shown on the live board.
const ACTIVE = ['checked_in', 'in_progress', 'done'] as const

// Local-day [start, end) range for a 'YYYY-MM-DD' string (defaults to today).
function dayRange(dateStr?: string) {
  const now = new Date()
  const parts = dateStr ? dateStr.split('-').map(Number) : []
  const y = parts[0] ?? now.getFullYear()
  const m = parts[1] ?? now.getMonth() + 1
  const d = parts[2] ?? now.getDate()
  return { start: new Date(y, m - 1, d), end: new Date(y, m - 1, d + 1) }
}

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

  // Scope the board to a single day (defaults to today) so it stays a focused
  // worklist. A `date` query param lets staff review any day's patients.
  const dateParam = z.iso.date().optional().catch(undefined).parse(getQuery(event).date)
  const { start, end } = dayRange(dateParam)

  // A dentist sees only their own workload: visits assigned to them plus the
  // unassigned pool they can pick up. Admin and front desk see the whole floor.
  const scope =
    profile.role === 'dentist'
      ? or(eq(visits.providerId, userId), isNull(visits.providerId))
      : undefined

  // Join the assigned provider (if any) so the board can show who owns a visit.
  const provider = alias(profiles, 'provider')

  const rows = await db
    .select({
      id: visits.id,
      status: visits.status,
      reason: visits.reason,
      checkedInAt: visits.checkedInAt,
      createdAt: visits.createdAt,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
      providerId: visits.providerId,
      providerName: provider.fullName,
    })
    .from(visits)
    .innerJoin(patients, eq(visits.patientId, patients.id))
    .leftJoin(provider, eq(visits.providerId, provider.id))
    .where(
      and(
        inArray(visits.status, [...ACTIVE]),
        gte(visits.checkedInAt, start),
        lt(visits.checkedInAt, end),
        scope,
      ),
    )
    .orderBy(desc(visits.checkedInAt))

  return rows
})
