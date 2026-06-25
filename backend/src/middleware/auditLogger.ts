import { PrismaClient, Prisma } from '@prisma/client';

// ── Types ────────────────────────────────────────────────────────────

export interface AuditEntry {
  /** The kind of entity being logged: 'transaction', 'product', 'inventory' */
  entityType: string;
  /** The UUID (or other id) of the entity */
  entityId: string;
  /** The action performed: 'create', 'update', 'void', 'refund', 'adjust' */
  action: string;
  /** Arbitrary JSON describing before/after or relevant metadata */
  changes: Prisma.InputJsonValue;
  /** UUID of the user who performed the action */
  performedBy: string;
  /** UUID of the location where the action occurred */
  locationId: string;
  /** Optional client IP address */
  ipAddress?: string;
}

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

// ── Append-only audit log writer ─────────────────────────────────────

/**
 * Write one audit-log row.
 *
 * IMMUTABILITY GUARANTEE: This function (and all direct callers throughout the
 * codebase) only ever calls `auditLog.create()`. There are zero `update` or
 * `delete` operations on the audit_log table anywhere in the system — no route,
 * no service, no migration touches existing rows. The log is append-only by
 * construction, not by convention.
 *
 * Pass an optional transaction client (`tx`) to commit the audit entry
 * atomically with its parent operation. Callers inside a `prisma.$transaction`
 * block should pass the transaction client; standalone callers can omit it.
 */
export async function writeAuditLog(
  entry: AuditEntry,
  tx?: TxClient,
): Promise<void> {
  const client = tx ?? (await import('../index')).prisma;
  await client.auditLog.create({ data: entry });
}
