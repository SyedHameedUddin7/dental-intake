import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../../../../db'
import { consents, profiles } from '../../../../db/schema'
import { CONSENT_TEMPLATES, type SignedConsent, type ConsentType } from '#shared/schemas/consent'
import { serverSupabaseUser } from '#supabase/server'

const CAN_VIEW = ['admin', 'front_desk', 'dentist']

export default defineEventHandler(async (event): Promise<SignedConsent> => {
  const claims = await serverSupabaseUser(event)
  const userId = claims?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Profile not found' })
  if (!CAN_VIEW.includes(profile.role)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const patientId = z.uuid().safeParse(getRouterParam(event, 'id'))
  const consentId = z.uuid().safeParse(getRouterParam(event, 'consentId'))
  if (!patientId.success || !consentId.success) {
    throw createError({ statusCode: 400, statusMessage: 'Valid ids are required' })
  }

  const signer = alias(profiles, 'signer')
  const [row] = await db
    .select({
      id: consents.id,
      type: consents.type,
      version: consents.version,
      bodySnapshot: consents.bodySnapshot,
      signatureData: consents.signatureData,
      signedAt: consents.signedAt,
      signedByName: signer.fullName,
    })
    .from(consents)
    .leftJoin(signer, eq(consents.signedBy, signer.id))
    .where(and(eq(consents.id, consentId.data), eq(consents.patientId, patientId.data)))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Consent not found' })

  return {
    id: row.id,
    type: row.type as ConsentType,
    title: CONSENT_TEMPLATES[row.type as ConsentType].title,
    version: row.version,
    bodySnapshot: row.bodySnapshot,
    signatureData: row.signatureData,
    signedAt: new Date(row.signedAt).toISOString(),
    signedByName: row.signedByName,
  }
})
