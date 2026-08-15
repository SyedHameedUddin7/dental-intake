import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { consents, patients, profiles } from '../../../db/schema'
import { CONSENT_TEMPLATES, signConsentSchema } from '#shared/schemas/consent'
import { logAudit } from '../../../utils/audit'
import { serverSupabaseUser } from '#supabase/server'

// Front desk collects consent (patient signs on their device); admins too.
const CAN_SIGN = ['admin', 'front_desk']

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
  if (!CAN_SIGN.includes(profile.role)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'Valid patient id is required' })

  const [patient] = await db.select({ id: patients.id }).from(patients).where(eq(patients.id, id.data)).limit(1)
  if (!patient) throw createError({ statusCode: 404, statusMessage: 'Patient not found' })

  const body = signConsentSchema.safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'A signature and consent type are required' })

  // Snapshot the current template text + version onto the signed record.
  const tmpl = CONSENT_TEMPLATES[body.data.type]
  const [saved] = await db
    .insert(consents)
    .values({
      patientId: id.data,
      type: body.data.type,
      version: tmpl.version,
      bodySnapshot: tmpl.body,
      signatureData: body.data.signatureData,
      signedBy: userId,
    })
    .returning({ id: consents.id, signedAt: consents.signedAt })
  if (!saved) throw createError({ statusCode: 500, statusMessage: 'Failed to save consent' })

  await logAudit({
    actorId: userId,
    action: 'create',
    entityType: 'consent',
    entityId: saved.id,
    metadata: { patientId: id.data, type: body.data.type, version: tmpl.version },
  })

  setResponseStatus(event, 201)
  return { id: saved.id, type: body.data.type, version: tmpl.version, signedAt: saved.signedAt }
})
