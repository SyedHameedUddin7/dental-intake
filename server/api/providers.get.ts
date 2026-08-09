import { eq, asc } from 'drizzle-orm'
import { db } from '../db'
import { profiles } from '../db/schema'
import { serverSupabaseUser } from '#supabase/server'

// Roles allowed to assign a preferred dentist at intake.
const CAN_LIST = ['admin', 'front_desk']

// Returns the dentists a patient can be assigned to at intake time.
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
  if (!CAN_LIST.includes(profile.role)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  return db
    .select({ id: profiles.id, fullName: profiles.fullName })
    .from(profiles)
    .where(eq(profiles.role, 'dentist'))
    .orderBy(asc(profiles.fullName))
})
