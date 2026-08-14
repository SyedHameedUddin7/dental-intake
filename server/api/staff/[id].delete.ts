import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { profiles } from '../../db/schema'
import { getSupabaseAdmin } from '../../utils/supabaseAdmin'
import { logAudit } from '../../utils/audit'
import { serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  const userId = claims?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // Only admins can delete staff.
  const [me] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)
  if (!me) throw createError({ statusCode: 404, statusMessage: 'Profile not found' })
  if (me.role !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'Valid staff id is required' })

  const [target] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, id.data))
    .limit(1)
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Staff member not found' })

  // Protect admin accounts (this also blocks deleting yourself).
  if (target.role === 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin accounts cannot be deleted here' })
  }

  // Deleting the auth user cascades the profile (FK on delete cascade); the
  // user's visits fall back to unassigned (provider_id on delete set null).
  const admin = getSupabaseAdmin()
  const { error } = await admin.auth.admin.deleteUser(id.data)
  if (error) throw createError({ statusCode: 400, statusMessage: error.message })

  await logAudit({ actorId: userId, action: 'delete', entityType: 'staff', entityId: id.data, metadata: { role: target.role } })

  return { id: id.data, deleted: true }
})
