import { db } from '../db'
import { auditLog } from '../db/schema'

type AuditAction = 'view' | 'create' | 'update' | 'delete'

// Append an entry to the audit trail. Best-effort: a logging failure must never
// break the request that triggered it, so errors are swallowed (and reported).
export async function logAudit(entry: {
  actorId: string
  action: AuditAction
  entityType: string
  entityId?: string | null
  metadata?: Record<string, unknown> | null
}) {
  try {
    await db.insert(auditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? null,
    })
  } catch (e) {
    console.error('audit log failed:', e)
  }
}
