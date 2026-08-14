import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { profiles } from '../db/schema'
import { createStaffSchema } from '#shared/schemas/staff'
import { getSupabaseAdmin } from '../utils/supabaseAdmin'
import { logAudit } from '../utils/audit'
import { serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const claims = await serverSupabaseUser(event)
  const userId = claims?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // Only admins can create staff logins.
  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Profile not found' })
  if (profile.role !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const parsed = createStaffSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      data: z.flattenError(parsed.error),
    })
  }
  const { fullName, email, role, password } = parsed.data

  // Create the auth user with the secret key. email_confirm skips the email
  // verification step so the account is usable immediately.
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error || !data.user) {
    // e.g. "A user with this email address has already been registered".
    throw createError({ statusCode: 400, statusMessage: error?.message || 'Could not create user' })
  }

  // The on_auth_user_created trigger inserts the profile (role defaults to
  // front_desk); set the chosen role and name here.
  await db
    .update(profiles)
    .set({ role, fullName, updatedAt: new Date() })
    .where(eq(profiles.id, data.user.id))

  await logAudit({
    actorId: userId,
    action: 'create',
    entityType: 'staff',
    entityId: data.user.id,
    metadata: { role, email },
  })

  setResponseStatus(event, 201)
  return { id: data.user.id, fullName, role, email }
})
