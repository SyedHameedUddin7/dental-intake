import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { visits, profiles } from '../../db/schema'
import { visitUpdateSchema } from '#shared/schemas/visit'
import { logAudit } from '../../utils/audit'
import { serverSupabaseUser } from '#supabase/server'

// Matches the visits_update RLS policy.
const CAN_UPDATE = ['admin', 'front_desk', 'dentist']

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
  if (!CAN_UPDATE.includes(profile.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'Valid visit id is required' })

  const body = visitUpdateSchema.safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Valid status is required' })

  // When a dentist starts a visit, they claim ownership of it if it's still
  // unassigned — this is what makes it "their patient" on their board.
  const fields: { status: typeof body.data.status; updatedAt: Date; providerId?: string; checkedInAt?: Date } = {
    status: body.data.status,
    updatedAt: new Date(),
  }
  // Checking a scheduled appointment in stamps checkedInAt so it appears on
  // today's board.
  if (body.data.status === 'checked_in') fields.checkedInAt = new Date()
  if (profile.role === 'dentist' && body.data.status === 'in_progress') {
    const [current] = await db
      .select({ providerId: visits.providerId })
      .from(visits)
      .where(eq(visits.id, id.data))
      .limit(1)
    if (current && !current.providerId) fields.providerId = userId
  }

  const [updated] = await db
    .update(visits)
    .set(fields)
    .where(eq(visits.id, id.data))
    .returning({ id: visits.id, status: visits.status, providerId: visits.providerId })
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Visit not found' })

  await logAudit({ actorId: userId, action: 'update', entityType: 'visit', entityId: id.data, metadata: { status: updated.status } })

  return updated
})
