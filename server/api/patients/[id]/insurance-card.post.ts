import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { patients, profiles } from '../../../db/schema'
import { getSupabaseAdmin } from '../../../utils/supabaseAdmin'
import {
  ensureInsuranceBucket,
  signedCardUrl,
  INSURANCE_BUCKET,
  ALLOWED_CARD_TYPES,
  MAX_CARD_BYTES,
} from '../../../utils/storage'
import { logAudit } from '../../../utils/audit'
import { serverSupabaseUser } from '#supabase/server'

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

  const [patient] = await db.select({ id: patients.id }).from(patients).where(eq(patients.id, id.data)).limit(1)
  if (!patient) throw createError({ statusCode: 404, statusMessage: 'Patient not found' })

  const form = await readMultipartFormData(event)
  const file = form?.find((p) => p.name === 'file' && p.filename)
  if (!file || !file.data) throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  if (!file.type || !ALLOWED_CARD_TYPES.includes(file.type)) {
    throw createError({ statusCode: 400, statusMessage: 'Card must be a PNG, JPEG or WebP image' })
  }
  if (file.data.length > MAX_CARD_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Card image must be under 5 MB' })
  }

  await ensureInsuranceBucket()

  // One stable object per patient; overwrite on re-upload.
  const path = `${id.data}/card`
  const admin = getSupabaseAdmin()
  const { error } = await admin.storage
    .from(INSURANCE_BUCKET)
    .upload(path, file.data, { contentType: file.type, upsert: true })
  if (error) throw createError({ statusCode: 502, statusMessage: `Upload failed: ${error.message}` })

  await db.update(patients).set({ insuranceCardPath: path, updatedAt: new Date() }).where(eq(patients.id, id.data))

  await logAudit({
    actorId: userId,
    action: 'update',
    entityType: 'patient',
    entityId: id.data,
    metadata: { field: 'insurance_card' },
  })

  return { hasCard: true, cardUrl: await signedCardUrl(path) }
})
