export const AUDIT_ACTIONS = ['view', 'create', 'update', 'delete'] as const
export type AuditActionType = (typeof AUDIT_ACTIONS)[number]

// One row in the audit trail, as shown to admins.
export type AuditEntry = {
  id: string
  actorId: string | null
  actorName: string | null
  action: AuditActionType
  entityType: string
  entityId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}
