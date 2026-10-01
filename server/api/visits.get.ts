import { z } from 'zod'
import { eq, and, or, gte, lt, isNull, inArray, desc, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../db'
import { visits, patients, profiles } from '../db/schema'
import { serverSupabaseUser } from '#supabase/server'

// Statuses for people who have physically arrived — placed on the board by
// when they checked in.
const ARRIVED = ['checked_in', 'in_progress', 'done'] as const

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
      patientId: visits.patientId,
      status: visits.status,
      reason: visits.reason,
      checkedInAt: visits.checkedInAt,
      scheduledAt: visits.scheduledAt,
      durationMinutes: visits.durationMinutes,
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
        // The board covers a whole day in two senses, because a visit is dated
        // by a different column depending on where it is in its life: someone
        // who has arrived is placed by checkedInAt, someone still expected by
        // scheduledAt. Carrying both is what lets the board show the rest of
        // the day instead of only who is already in the building.
        or(
          and(
            inArray(visits.status, [...ARRIVED]),
            gte(visits.checkedInAt, start),
            lt(visits.checkedInAt, end),
          ),
          and(
            eq(visits.status, 'scheduled'),
            gte(visits.scheduledAt, start),
            lt(visits.scheduledAt, end),
          ),
        ),
        scope,
      ),
    )
    .orderBy(desc(sql`coalesce(${visits.checkedInAt}, ${visits.scheduledAt})`))

  return rows
})
