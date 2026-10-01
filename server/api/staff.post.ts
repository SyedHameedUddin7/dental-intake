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
  //
  // app_metadata.provisioned is what the on_auth_user_created trigger looks for
  // before it will create a profile at all. It has to live in app_metadata
  // rather than user_metadata because only the service role can write that —
  // a client could set user_metadata on itself during sign-up and self-promote.
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { provisioned: true },
  })
  if (error || !data.user) {
    // e.g. "A user with this email address has already been registered".
    throw createError({ statusCode: 400, statusMessage: error?.message || 'Could not create user' })
  }

  // The trigger inserts the profile; upsert rather than update so creating a
  // login never depends on that having happened, and so the role is set in one
  // place either way.
  await db
    .insert(profiles)
    .values({ id: data.user.id, role, fullName })
    .onConflictDoUpdate({
      target: profiles.id,
      set: { role, fullName, updatedAt: new Date() },
    })

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
