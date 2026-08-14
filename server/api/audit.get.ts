import { z } from 'zod'
import { and, eq, desc } from 'drizzle-orm'
import { db } from '../db'
import { auditLog, profiles } from '../db/schema'
import type { AuditEntry } from '#shared/schemas/audit'
import { serverSupabaseUser } from '#supabase/server'

// The audit trail is admin-only.
export default defineEventHandler(async (event): Promise<AuditEntry[]> => {
  const claims = await serverSupabaseUser(event)
  const userId = claims?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Profile not found' })
  if (profile.role !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const q = getQuery(event)
  const entityId = z.uuid().optional().catch(undefined).parse(q.entityId)
  const entityType = z.string().max(50).optional().catch(undefined).parse(q.entityType)
  const action = z.enum(['view', 'create', 'update', 'delete']).optional().catch(undefined).parse(q.action)
  const limit = z.coerce.number().int().min(1).max(200).catch(100).parse(q.limit)

  const conds = [
    entityId ? eq(auditLog.entityId, entityId) : undefined,
    entityType ? eq(auditLog.entityType, entityType) : undefined,
    action ? eq(auditLog.action, action) : undefined,
  ].filter(Boolean)

  const rows = await db
    .select({
      id: auditLog.id,
      actorId: auditLog.actorId,
      actorName: profiles.fullName,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(profiles, eq(auditLog.actorId, profiles.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)

  return rows.map((r) => ({
    ...r,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    createdAt: new Date(r.createdAt).toISOString(),
  }))
})
