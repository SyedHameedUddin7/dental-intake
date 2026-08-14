import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { patients, profiles } from '../../../db/schema'
import { insuranceSchema } from '#shared/schemas/insurance'
import { serverSupabaseUser } from '#supabase/server'

// Front desk owns insurance details; admins too.
const CAN_EDIT = ['admin', 'front_desk']

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
  if (!CAN_EDIT.includes(profile.role)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'Valid patient id is required' })

  const body = insuranceSchema.safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Valid insurance details are required' })

  const [updated] = await db
    .update(patients)
    .set({
      insuranceProvider: body.data.insuranceProvider || null,
      insuranceMemberId: body.data.insuranceMemberId || null,
      updatedAt: new Date(),
    })
    .where(eq(patients.id, id.data))
    .returning({ provider: patients.insuranceProvider, memberId: patients.insuranceMemberId })
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Patient not found' })

  return updated
})
