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
 * Automatically resolves the logged-in user from session cookies.
 */
export async function logAuditAction(params: AuditParams) {
  try {
    const { user } = await getSessionUser();
    if (!user) {
      console.warn("Audit log attempted without authenticated user:", params);
      return;
    }

    await db.insert(auditLog).values({
      userId: user.id,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId || null,
      details: params.details || null,
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}
