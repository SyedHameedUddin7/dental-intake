import { z } from 'zod'
import { and, eq, gte, lt, asc } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../db'
import { visits, patients, profiles } from '../db/schema'
import type { Appointment } from '#shared/schemas/appointment'
import { serverSupabaseUser } from '#supabase/server'

const CAN_VIEW = ['admin', 'front_desk', 'dentist']

// Local-day [start, end) for a 'YYYY-MM-DD' string (defaults to today).
function dayRange(dateStr?: string) {
  const now = new Date()
  const parts = dateStr ? dateStr.split('-').map(Number) : []
  const y = parts[0] ?? now.getFullYear()
  const m = parts[1] ?? now.getMonth() + 1
  const d = parts[2] ?? now.getDate()
  return { start: new Date(y, m - 1, d), end: new Date(y, m - 1, d + 1) }
}

export default defineEventHandler(async (event): Promise<Appointment[]> => {
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

  const dateParam = z.iso.date().optional().catch(undefined).parse(getQuery(event).date)
  const { start, end } = dayRange(dateParam)

  const provider = alias(profiles, 'provider')
  const rows = await db
    .select({
      id: visits.id,
      patientId: visits.patientId,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
      scheduledAt: visits.scheduledAt,
      reason: visits.reason,
      status: visits.status,
      providerName: provider.fullName,
    })
    .from(visits)
    .innerJoin(patients, eq(visits.patientId, patients.id))
    .leftJoin(provider, eq(visits.providerId, provider.id))
    .where(and(eq(visits.status, 'scheduled'), gte(visits.scheduledAt, start), lt(visits.scheduledAt, end)))
    .orderBy(asc(visits.scheduledAt))

  return rows.map((r) => ({
    id: r.id,
    patientId: r.patientId,
    patientName: `${r.patientFirstName} ${r.patientLastName}`,
    scheduledAt: r.scheduledAt ? new Date(r.scheduledAt).toISOString() : '',
    reason: r.reason,
    providerName: r.providerName,
    status: r.status,
  }))
})
