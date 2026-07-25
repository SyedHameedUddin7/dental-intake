import { eq } from 'drizzle-orm'
import { db } from '../db'
import { profiles } from '../db/schema'
import { serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  const userId = claims?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const [profile] = await db
    .select({ id: profiles.id, role: profiles.role, fullName: profiles.fullName })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)

  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Profile not found' })
  return profile
})