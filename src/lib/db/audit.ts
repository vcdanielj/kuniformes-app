import { db } from "./index";
import { auditLog } from "./schema";
import { getSessionUser } from "../auth/session";

export interface AuditParams {
  action: string;      // e.g., "CREAR", "MODIFICAR", "ELIMINAR", "AJUSTE_STOCK"
  entity: string;      // e.g., "model", "sku", "customer", "sale", "expense", "shipment"
  entityId?: string;   // e.g., "42168" or custom id
  details?: string;    // JSON string or description
}

/**
 * Logs an administrative action to the auditLog table.
 *
 * Callers that already resolved the user (via requireAuth/requireAdmin) should
 * pass `knownUserId` to avoid a redundant session lookup (a sessions⋈users join)
 * on every mutation. Falls back to resolving from session cookies otherwise.
 */
export async function logAuditAction(params: AuditParams, knownUserId?: string) {
  try {
    let userId = knownUserId;
    if (!userId) {
      const { user } = await getSessionUser();
      if (!user) {
        console.warn("Audit log attempted without authenticated user:", params);
        return;
      }
      userId = user.id;
    }

    await db.insert(auditLog).values({
      userId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId || null,
      details: params.details || null,
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}
