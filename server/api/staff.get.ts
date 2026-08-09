import { eq, asc } from 'drizzle-orm'
import { db } from '../db'
import { profiles } from '../db/schema'
import { getSupabaseAdmin } from '../utils/supabaseAdmin'
import type { StaffMember } from '#shared/schemas/staff'
import { serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event): Promise<StaffMember[]> => {
  const claims = await serverSupabaseUser(event)
  const userId = claims?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // Only admins can list staff.
  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Profile not found' })
  if (profile.role !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const staff = await db
    .select({ id: profiles.id, fullName: profiles.fullName, role: profiles.role })
    .from(profiles)
    .orderBy(asc(profiles.fullName))

  // Emails live on auth.users, not profiles — pull them from the admin API and
  // join by id. A demo roster fits comfortably in the first page.
  const admin = getSupabaseAdmin()
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  const emailById = new Map((data?.users ?? []).map((u) => [u.id, u.email ?? null]))

  return staff.map((s) => ({ ...s, email: emailById.get(s.id) ?? null }))
})
