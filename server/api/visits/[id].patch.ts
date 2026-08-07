import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { visits, profiles } from '../../db/schema'
import { visitUpdateSchema } from '#shared/schemas/visit'
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

  const [updated] = await db
    .update(visits)
    .set({ status: body.data.status, updatedAt: new Date() })
    .where(eq(visits.id, id.data))
    .returning({ id: visits.id, status: visits.status })
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Visit not found' })

  return updated
})
