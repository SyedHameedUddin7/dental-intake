import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { visits, profiles } from '../../../db/schema'
import { visitNotesSchema } from '#shared/schemas/visit'
import { logAudit } from '../../../utils/audit'
import { serverSupabaseUser } from '#supabase/server'

// Chart notes are clinical — only dentists and admins may write them.
const CAN_EDIT_NOTES = ['admin', 'dentist']

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
  if (!CAN_EDIT_NOTES.includes(profile.role)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'Valid visit id is required' })

  const body = visitNotesSchema.safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Valid notes are required' })

  const [updated] = await db
    .update(visits)
    .set({
      diagnosis: body.data.diagnosis || null,
      comments: body.data.comments || null,
      updatedAt: new Date(),
    })
    .where(eq(visits.id, id.data))
    .returning({ id: visits.id, diagnosis: visits.diagnosis, comments: visits.comments })
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Visit not found' })

  await logAudit({ actorId: userId, action: 'update', entityType: 'visit', entityId: id.data, metadata: { field: 'chart_notes' } })

  return updated
})
