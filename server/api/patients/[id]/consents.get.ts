import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../../../db'
import { consents, profiles } from '../../../db/schema'
import { CONSENT_TEMPLATES, CONSENT_TYPES, type ConsentStatus } from '#shared/schemas/consent'
import { serverSupabaseUser } from '#supabase/server'

const CAN_VIEW = ['admin', 'front_desk', 'dentist']

export default defineEventHandler(async (event): Promise<ConsentStatus[]> => {
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

  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'Valid patient id is required' })

  const signer = alias(profiles, 'signer')
  const rows = await db
    .select({
      id: consents.id,
      type: consents.type,
      version: consents.version,
      signedAt: consents.signedAt,
      signedByName: signer.fullName,
    })
    .from(consents)
    .leftJoin(signer, eq(consents.signedBy, signer.id))
    .where(eq(consents.patientId, id.data))
    .orderBy(desc(consents.signedAt))

  // Latest signed row per type.
  const latest = new Map<string, (typeof rows)[number]>()
  for (const r of rows) if (!latest.has(r.type)) latest.set(r.type, r)

  return CONSENT_TYPES.map((type) => {
    const tmpl = CONSENT_TEMPLATES[type]
    const r = latest.get(type)
    return {
      type,
      title: tmpl.title,
      currentVersion: tmpl.version,
      signed: r
        ? {
            id: r.id,
            version: r.version,
            signedAt: new Date(r.signedAt).toISOString(),
            signedByName: r.signedByName,
            outdated: r.version !== tmpl.version,
          }
        : null,
    }
  })
})
