"use server";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { db } from "./index";
import {
  users,
  sessions,
  colors,
  sizes,
  categories,
  paymentMethods,
  carriers,
  settings,
  models,
  skus,
  modelColors,
  modelColorImages,
  modelSizes,
  stockAdjustments,
  suppliers,
  purchases,
  purchaseItems,
  sales,
  saleItems,
  salePayments,
  quotes,
  quoteItems,
  customers,
  returns,
  returnItems,
  consignees,
  consignmentLots,
  consignmentItems,
  consignmentPayments,
  expenses,
  shipments,
  auditLog,
  pushSubscriptions,
} from "./schema";
import { eq, ne, and, sql, gte, lte, inArray, or, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { generateSkuCode } from "../utils";
import { logAuditAction } from "./audit";
import { getSessionUser } from "../auth/session";
import { hashPassword } from "../auth/password";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sendWebPush } from "../push/web-push";
import { SETTINGS_KEYS, SYSTEM_DEFAULTS } from "../app-config";
import {
  convertToUsd,
  getExchangeRatesOverview,
  getTransactionRate,
  isBolivarCurrency,
  normalizeTransactionRate,
  saveManualRates,
  syncDolarApiRates,
  type FxSource,
} from "../exchange-rates/service";

/**
 * Cloudflare D1 does NOT support interactive transactions over the binding:
 * drizzle's `db.transaction()` emits a `BEGIN` that D1 rejects ("Failed query: begin").
 * (It only works on the local better-sqlite3 driver.) D1 already gave no real
 * atomicity here, so we run the callback sequentially on `db`. Validations still
 * throw and surface as { success:false } via each action's try/catch.
 * For true atomicity use `db.batch([...])` (see memory: d1-transactions-not-atomic).
 */
async function runInTx<T>(cb: (tx: typeof db) => Promise<T>): Promise<T> {
  return cb(db);
}

async function requireAuth() {
  const { session, user } = await getSessionUser();
  if (!session || !user) {
    throw new Error("No autorizado. Inicie sesión para continuar.");
  }
  return { session, user };
}

/* ============================================================
   Web Push notifications (admins only)
   ============================================================ */

// Save (or refresh) the current user's browser push subscription.
export async function savePushSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  try {
    const { user } = await requireAuth();
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      return { success: false, error: "Suscripción inválida." };
    }
    await db
      .insert(pushSubscriptions)
      .values({
        userId: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "No se pudo registrar la suscripción." };
  }
}

export async function removePushSubscription(endpoint: string) {
  try {
    await requireAuth();
    if (endpoint) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "No se pudo eliminar la suscripción." };
  }
}

// Fire a no-payload push to every active admin's subscriptions. Best-effort:
// never throws (a notification failure must not break the sale), prunes dead
// subscriptions (404/410), and runs in the background via ctx.waitUntil when
// available so it doesn't delay the response.
async function notifyAdminsNewSale() {
  try {
    const { env, ctx } = getCloudflareContext();
    const privateKey = (env as unknown as Record<string, string | undefined>).VAPID_PRIVATE_KEY;
    if (!privateKey) return; // push not configured (no secret set) — skip silently

    const subs = await db
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .innerJoin(users, eq(pushSubscriptions.userId, users.id))
      .where(and(eq(users.role, "admin"), eq(users.active, true)));

    if (subs.length === 0) return;

    const deliver = async () => {
      for (const sub of subs) {
        try {
          const result = await sendWebPush(sub, privateKey);
          if (result.gone) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
          }
        } catch {
          // Ignore individual delivery failures.
        }
      }
    };

    if (ctx?.waitUntil) ctx.waitUntil(deliver());
    else await deliver();
  } catch {
    // Notifications are best-effort and must never affect the transaction.
  }
}

async function requireAdmin() {
  const { session, user } = await requireAuth();
  if (user.role !== "admin") {
    throw new Error("Acceso denegado. Se requieren privilegios de Administrador.");
  }
  return { session, user };
}

// Staff = operational access (admin + usuario), but not "vendedor". Used for
// inventory, purchases, expenses, config catalogs, rates, consignment, etc.
// User management and the activity log stay strictly requireAdmin.
async function requireStaff() {
  const { session, user } = await requireAuth();
  if (user.role !== "admin" && user.role !== "usuario") {
    throw new Error("Acceso denegado. Se requieren privilegios de Administrador.");
  }
  return { session, user };
}

function aggregateQuantitiesBySku(items: { skuId: number; quantity: number }[]) {
  const quantities = new Map<number, number>();

  for (const item of items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error("Todas las cantidades deben ser mayores a cero.");
    }

    quantities.set(item.skuId, (quantities.get(item.skuId) || 0) + item.quantity);
  }

  return quantities;
}

async function getNextCounterValue(tx: any, key: string, fallbackValue: number) {
  const [counterSetting] = await tx
    .select()
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);

  const currentValue = Number.parseInt(counterSetting?.value || "", 10);
  const nextValue = Number.isFinite(currentValue) ? currentValue + 1 : fallbackValue + 1;

  await tx
    .insert(settings)
    .values({ key, value: String(nextValue) })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: String(nextValue) },
    });

  return nextValue;
}

async function assertStockAvailable(
  tx: any,
  items: { skuId: number; quantity: number }[],
  actionLabel: string
) {
  const requestedBySku = aggregateQuantitiesBySku(items);
  const skuIds = Array.from(requestedBySku.keys());
  const skuRecords = await tx.select().from(skus).where(inArray(skus.id, skuIds));
  const stockBySku = new Map<number, any>(skuRecords.map((sku: any) => [sku.id, sku]));

  for (const [skuId, requestedQty] of requestedBySku.entries()) {
    const skuRecord = stockBySku.get(skuId);
    if (!skuRecord) {
      throw new Error(`SKU ${skuId} no encontrado para ${actionLabel}.`);
    }

    if (skuRecord.stock < requestedQty) {
      throw new Error(
        `Stock insuficiente para ${skuRecord.compositeCode}. Disponible: ${skuRecord.stock}, solicitado: ${requestedQty}.`
      );
    }
  }
}

async function assertReturnQuantitiesAvailable(
  tx: any,
  saleId: number,
  items: { skuId: number; quantity: number }[]
) {
  const requestedBySku = aggregateQuantitiesBySku(items);
  const soldItems = await tx
    .select({
      skuId: saleItems.skuId,
      quantity: saleItems.quantity,
    })
    .from(saleItems)
    .where(eq(saleItems.saleId, saleId));

  const soldBySku = aggregateQuantitiesBySku(soldItems);

  const priorReturnItems = await tx
    .select({
      skuId: returnItems.skuId,
      quantity: returnItems.quantity,
    })
    .from(returnItems)
    .innerJoin(returns, eq(returnItems.returnId, returns.id))
    .where(and(eq(returns.saleId, saleId), sql`${returns.status} != 'anulada'`));

  const returnedBySku = aggregateQuantitiesBySku(priorReturnItems);

  for (const [skuId, requestedQty] of requestedBySku.entries()) {
    const soldQty = soldBySku.get(skuId) || 0;
    const alreadyReturnedQty = returnedBySku.get(skuId) || 0;
    const remainingQty = soldQty - alreadyReturnedQty;

    if (soldQty === 0) {
      throw new Error(`El SKU ${skuId} no pertenece a la venta seleccionada.`);
    }

    if (requestedQty > remainingQty) {
      throw new Error(
        `La devolución supera el remanente disponible del SKU ${skuId}. Vendido: ${soldQty}, ya devuelto: ${alreadyReturnedQty}, solicitado: ${requestedQty}.`
      );
    }
  }
}

async function assertReplacementStockAvailable(
  tx: any,
  replacements: { replacementSkuId: number; quantity: number }[]
) {
  await assertStockAvailable(
    tx,
    replacements.map((item) => ({
      skuId: item.replacementSkuId,
      quantity: item.quantity,
    })),
    "el cambio de prenda"
  );
}

function getConsignmentItemRemaining(item: {
  quantity: number;
  liquidatedQuantity?: number | null;
  returnedQuantity?: number | null;
}) {
  return Math.max(
    0,
    item.quantity - (item.liquidatedQuantity || 0) - (item.returnedQuantity || 0)
  );
}

function calculateConsignmentLotMetrics(
  lot: { paidUsd: number },
  items: Array<{
    quantity: number;
    unitPrice: number;
    liquidatedQuantity?: number | null;
    returnedQuantity?: number | null;
  }>
) {
  const deliveredUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  const liquidatedUnits = items.reduce((sum, item) => sum + (item.liquidatedQuantity || 0), 0);
  const returnedUnits = items.reduce((sum, item) => sum + (item.returnedQuantity || 0), 0);
  const remainingUnits = items.reduce((sum, item) => sum + getConsignmentItemRemaining(item), 0);

  const deliveredValue = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const liquidatedValue = items.reduce(
    (sum, item) => sum + ((item.liquidatedQuantity || 0) * item.unitPrice),
    0
  );
  const returnedValue = items.reduce(
    (sum, item) => sum + ((item.returnedQuantity || 0) * item.unitPrice),
    0
  );
  const debtUsd = Math.max(0, liquidatedValue - lot.paidUsd);

  let status: "pendiente" | "pago_parcial" | "liquidado" | "devuelto" = "pendiente";
  if (remainingUnits === 0) {
    if (liquidatedUnits === 0) {
      status = "devuelto";
    } else if (debtUsd <= 0) {
      status = "liquidado";
    } else {
      status = "pago_parcial";
    }
  } else if (liquidatedUnits > 0 || returnedUnits > 0 || lot.paidUsd > 0) {
    status = "pago_parcial";
  }

  return {
    deliveredUnits,
    liquidatedUnits,
    returnedUnits,
    remainingUnits,
    deliveredValue,
    liquidatedValue,
    returnedValue,
    debtUsd,
    status,
  };
}

async function getConsignmentLotSnapshot(tx: any, lotId: number) {
  const [lot] = await tx
    .select()
    .from(consignmentLots)
    .where(eq(consignmentLots.id, lotId))
    .limit(1);
  if (!lot) {
    throw new Error("Lote no encontrado");
  }

  const items = await tx
    .select({
      id: consignmentItems.id,
      lotId: consignmentItems.lotId,
      skuId: consignmentItems.skuId,
      quantity: consignmentItems.quantity,
      unitPrice: consignmentItems.unitPrice,
      liquidatedQuantity: consignmentItems.liquidatedQuantity,
      returnedQuantity: consignmentItems.returnedQuantity,
      compositeCode: skus.compositeCode,
    })
    .from(consignmentItems)
    .innerJoin(skus, eq(consignmentItems.skuId, skus.id))
    .where(eq(consignmentItems.lotId, lotId));

  const metrics = calculateConsignmentLotMetrics(lot, items);
  return { lot, items, ...metrics };
}

async function syncConsignmentLotStatus(tx: any, lotId: number) {
  const snapshot = await getConsignmentLotSnapshot(tx, lotId);
  await tx
    .update(consignmentLots)
    .set({ status: snapshot.status })
    .where(eq(consignmentLots.id, lotId));

  return snapshot;
}

const MODEL_COLOR_IMAGE_MAX_BYTES = 1_500_000;
const MODEL_COLOR_IMAGE_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function estimateBase64Bytes(base64: string) {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function parseModelColorImageDataUrl(imageDataUrl: string) {
  const trimmed = imageDataUrl.trim();
  const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);

  if (!match) {
    throw new Error("La imagen debe enviarse en formato PNG, JPG o WEBP.");
  }

  const [, mimeType, base64] = match;
  if (!MODEL_COLOR_IMAGE_ALLOWED_TYPES.has(mimeType)) {
    throw new Error("Solo se permiten imágenes PNG, JPG o WEBP.");
  }

  const sizeInBytes = estimateBase64Bytes(base64);
  if (sizeInBytes > MODEL_COLOR_IMAGE_MAX_BYTES) {
    throw new Error("La imagen supera el tamaño máximo permitido de 1.5 MB.");
  }

  return trimmed;
}

/* ============================================================
   Configuration Actions (S1)
   ============================================================ */

export async function getConfigData() {
  await requireAuth();
  const [
    allColors,
    allSizes,
    allCategories,
    allPaymentMethods,
    allCarriers,
    allSettings,
    ratesOverview,
  ] = await Promise.all([
    db.select().from(colors).orderBy(colors.sortOrder),
    db.select().from(sizes).orderBy(sizes.sortOrder),
    db.select().from(categories),
    db.select().from(paymentMethods),
    db.select().from(carriers),
    db.select().from(settings),
    getExchangeRatesOverview(),
  ]);

  const settingsRecord: Record<string, string> = {};
  allSettings.forEach((s: any) => {
    settingsRecord[s.key] = s.value;
  });

  const result = {
    colors: allColors,
    sizes: allSizes,
    categories: allCategories,
    paymentMethods: allPaymentMethods,
    carriers: allCarriers,
    settings: settingsRecord,
    exchangeRates: ratesOverview.history.slice(-10),
    fxOverview: ratesOverview,
  };
  return result;
}

/**
 * Lightweight rate read for the persistent Sidebar widget. Avoids running the
 * full getConfigData() (8 table scans incl. the whole exchange_rates table) on
 * every navigation just to display two numbers.
 */
export async function getRatesForDisplayAction() {
  await requireAuth();
  const rows = await db
    .select()
    .from(settings)
    .where(inArray(settings.key, [SETTINGS_KEYS.parallelRate, SETTINGS_KEYS.bcvRate]));
  const map = new Map<string, string>(rows.map((r: any) => [r.key, r.value]));
  return {
    paralelo:
      Number.parseFloat(map.get(SETTINGS_KEYS.parallelRate) || "") || SYSTEM_DEFAULTS.rates.paralelo,
    bcv: Number.parseFloat(map.get(SETTINGS_KEYS.bcvRate) || "") || SYSTEM_DEFAULTS.rates.bcv,
  };
}

export async function getExchangeRatesOverviewAction() {
  await requireAuth();
  return getExchangeRatesOverview();
}

export async function syncExchangeRatesAction(includeHistory = true) {
  try {
    await requireStaff();
    const result = await syncDolarApiRates({ includeHistory });
    if (!result.success) {
      throw new Error(result.error);
    }

    revalidatePath("/configuracion");
    revalidatePath("/ventas");
    revalidatePath("/gastos");
    revalidatePath("/");
    return { success: true, inserted: result.inserted };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al sincronizar tasas" };
  }
}

export async function saveManualExchangeRatesAction(data: {
  usdParalelo: number;
  usdBcv: number;
  eurParalelo?: number;
  eurBcv?: number;
}) {
  try {
    await requireStaff();
    const result = await saveManualRates([
      { currencyCode: "USD", source: "paralelo", rate: data.usdParalelo },
      { currencyCode: "USD", source: "bcv", rate: data.usdBcv },
      { currencyCode: "EUR", source: "paralelo", rate: data.eurParalelo || 0 },
      { currencyCode: "EUR", source: "bcv", rate: data.eurBcv || 0 },
    ]);

    revalidatePath("/configuracion");
    revalidatePath("/ventas");
    revalidatePath("/gastos");
    revalidatePath("/");
    return { success: true, inserted: result.inserted };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al guardar tasas manuales" };
  }
}

export async function getUsersListAction() {
  await requireAdmin();
  const allUsers = await db.select().from(users);
  const formattedUsers = allUsers
    .map((user: any) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: !!user.active,
      createdAt: user.createdAt,
    }));

  return formattedUsers.sort((a: any, b: any) => a.name.localeCompare(b.name));
}

/**
 * Activity log (admin only) — every audited action across the app, newest first,
 * with the acting user's name and a severity for the UI to highlight: "danger"
 * for deletions/voids, "warning" for below-cost sales.
 */
export async function getActivityLogAction(limit = 250) {
  await requireAdmin();
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      details: auditLog.details,
      createdAt: auditLog.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit);

  return rows.map((r: any) => {
    const action = String(r.action || "").toUpperCase();
    let severity: "danger" | "warning" | "normal" = "normal";
    if (action.includes("ELIMINAR") || action.includes("ANULAR")) severity = "danger";
    else if (action.includes("BAJO_COSTO")) severity = "warning";
    return {
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      details: r.details,
      createdAt: r.createdAt,
      userName: r.userName || "Sistema",
      severity,
    };
  });
}

function normalizeRequiredText(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} es obligatorio.`);
  }
  return normalized;
}

async function countRows(query: Promise<Array<{ count: number }>>) {
  const [row] = await query;
  return Number(row?.count || 0);
}

async function ensureUserManagementAllowed(targetUserId: string) {
  const { user } = await requireAdmin();
  const [targetUser] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!targetUser) {
    throw new Error("Usuario no encontrado.");
  }

  const adminCount = await countRows(
    db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.active, true)))
  );

  return {
    currentUser: user,
    targetUser,
    adminCount,
    isLastActiveAdmin: targetUser.role === "admin" && !!targetUser.active && adminCount <= 1,
  };
}

export async function createUserAction(data: {
  name: string;
  email: string;
  password: string;
  role: "admin" | "vendedor" | "usuario";
}) {
  try {
    await requireAdmin();
    if (!data.name.trim() || !data.email.trim() || !data.password.trim()) {
      throw new Error("Nombre, correo y contraseña son obligatorios.");
    }
    if (data.password.trim().length < 6) {
      throw new Error("La contraseña debe tener al menos 6 caracteres.");
    }

    const passwordHash = await hashPassword(data.password.trim());
    await db.insert(users).values({
      id: crypto.randomUUID(),
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      passwordHash,
      role: data.role,
      active: true,
    });

    revalidatePath("/configuracion");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al crear usuario" };
  }
}

export async function updateUserAction(data: {
  id: string;
  name: string;
  email: string;
}) {
  try {
    await requireAdmin();
    await db
      .update(users)
      .set({
        name: normalizeRequiredText(data.name, "Nombre"),
        email: normalizeRequiredText(data.email, "Correo").toLowerCase(),
      })
      .where(eq(users.id, data.id));
    revalidatePath("/configuracion");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al actualizar usuario" };
  }
}

export async function updateUserRoleAction(id: string, role: "admin" | "vendedor" | "usuario") {
  try {
    const context = await ensureUserManagementAllowed(id);
    if (context.isLastActiveAdmin && role !== "admin") {
      throw new Error("No puedes quitar el rol al ultimo administrador activo.");
    }
    await db.update(users).set({ role }).where(eq(users.id, id));
    revalidatePath("/configuracion");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al actualizar rol" };
  }
}

export async function updateUserActiveAction(id: string, active: boolean) {
  try {
    const context = await ensureUserManagementAllowed(id);
    if (!active && context.isLastActiveAdmin) {
      throw new Error("No puedes desactivar al ultimo administrador activo.");
    }
    await db.update(users).set({ active }).where(eq(users.id, id));
    if (!active) {
      await db.delete(sessions).where(eq(sessions.userId, id));
    }
    revalidatePath("/configuracion");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al actualizar estatus del usuario" };
  }
}

export async function changeUserPasswordAction(id: string, password: string) {
  try {
    await requireAdmin();
    const normalizedPassword = password.trim();
    if (normalizedPassword.length < 6) {
      throw new Error("La contraseña debe tener al menos 6 caracteres.");
    }
    const passwordHash = await hashPassword(normalizedPassword);
    await db.update(users).set({ passwordHash }).where(eq(users.id, id));
    await db.delete(sessions).where(eq(sessions.userId, id));
    revalidatePath("/configuracion");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al cambiar contraseña" };
  }
}

export async function deleteUserAction(id: string) {
  try {
    const context = await ensureUserManagementAllowed(id);
    if (context.currentUser.id === id) {
      throw new Error("No puedes eliminar tu propio usuario.");
    }
    if (context.isLastActiveAdmin) {
      throw new Error("No puedes eliminar al ultimo administrador activo.");
    }

    const usageCounts = await Promise.all([
      countRows(db.select({ count: sql<number>`count(*)` }).from(stockAdjustments).where(eq(stockAdjustments.userId, id))),
      countRows(db.select({ count: sql<number>`count(*)` }).from(sales).where(eq(sales.userId, id))),
      countRows(db.select({ count: sql<number>`count(*)` }).from(returns).where(eq(returns.userId, id))),
      countRows(db.select({ count: sql<number>`count(*)` }).from(auditLog).where(eq(auditLog.userId, id))),
    ]);

    if (usageCounts.some((count) => count > 0)) {
      throw new Error("No puedes eliminar un usuario con movimientos historicos. Desactivalo en su lugar.");
    }

    await db.delete(sessions).where(eq(sessions.userId, id));
    await db.delete(users).where(eq(users.id, id));
    revalidatePath("/configuracion");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al eliminar usuario" };
  }
}

export async function addColor(code: string, name: string, hex: string) {
  try {
    await requireStaff();
    const res = await db.insert(colors).values({
      code,
      name,
      hex,
      sortOrder: 0,
    }).returning();
    revalidatePath("/configuracion");
    return { success: true, color: res[0] };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al agregar color" };
  }
}

export async function updateColorAction(id: number, code: string, name: string, hex: string) {
  try {
    await requireStaff();
    await db
      .update(colors)
      .set({
        code: normalizeRequiredText(code, "Codigo"),
        name: normalizeRequiredText(name, "Nombre"),
        hex: normalizeRequiredText(hex, "Hex"),
      })
      .where(eq(colors.id, id));
    revalidatePath("/configuracion");
    revalidatePath("/inventario");
    revalidatePath("/catalogo");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al actualizar color" };
  }
}

export async function deleteColorAction(id: number) {
  try {
    await requireStaff();
    const [modelColorCount, imageCount, skuCount] = await Promise.all([
      countRows(db.select({ count: sql<number>`count(*)` }).from(modelColors).where(eq(modelColors.colorId, id))),
      countRows(db.select({ count: sql<number>`count(*)` }).from(modelColorImages).where(eq(modelColorImages.colorId, id))),
      countRows(db.select({ count: sql<number>`count(*)` }).from(skus).where(eq(skus.colorId, id))),
    ]);
    if (modelColorCount > 0 || imageCount > 0 || skuCount > 0) {
      throw new Error("No puedes eliminar un color que ya esta en uso por modelos, imagenes o SKUs.");
    }
    await db.delete(colors).where(eq(colors.id, id));
    revalidatePath("/configuracion");
    revalidatePath("/inventario");
    revalidatePath("/catalogo");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al eliminar color" };
  }
}

export async function addSize(name: string) {
  try {
    await requireStaff();
    await db.insert(sizes).values({
      name,
      sortOrder: 0,
    });
    revalidatePath("/configuracion");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al agregar talla" };
  }
}

export async function updateSizeAction(id: number, name: string) {
  try {
    await requireStaff();
    await db.update(sizes).set({ name: normalizeRequiredText(name, "Nombre") }).where(eq(sizes.id, id));
    revalidatePath("/configuracion");
    revalidatePath("/inventario");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al actualizar talla" };
  }
}

export async function deleteSizeAction(id: number) {
  try {
    await requireStaff();
    const [modelSizeCount, skuCount] = await Promise.all([
      countRows(db.select({ count: sql<number>`count(*)` }).from(modelSizes).where(eq(modelSizes.sizeId, id))),
      countRows(db.select({ count: sql<number>`count(*)` }).from(skus).where(eq(skus.sizeId, id))),
    ]);
    if (modelSizeCount > 0 || skuCount > 0) {
      throw new Error("No puedes eliminar una talla que ya esta en uso por modelos o SKUs.");
    }
    await db.delete(sizes).where(eq(sizes.id, id));
    revalidatePath("/configuracion");
    revalidatePath("/inventario");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al eliminar talla" };
  }
}

export async function addCategory(name: string, type: "product" | "expense") {
  try {
    await requireStaff();
    await db.insert(categories).values({
      name,
      type,
    });
    revalidatePath("/configuracion");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al agregar categoría" };
  }
}

export async function updateCategoryAction(id: number, name: string, type: "product" | "expense") {
  try {
    await requireStaff();
    await db
      .update(categories)
      .set({ name: normalizeRequiredText(name, "Nombre"), type })
      .where(eq(categories.id, id));
    revalidatePath("/configuracion");
    revalidatePath("/inventario");
    revalidatePath("/gastos");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al actualizar categoría" };
  }
}

export async function deleteCategoryAction(id: number) {
  try {
    await requireStaff();
    const [modelCount, expenseCount] = await Promise.all([
      countRows(db.select({ count: sql<number>`count(*)` }).from(models).where(eq(models.categoryId, id))),
      countRows(db.select({ count: sql<number>`count(*)` }).from(expenses).where(eq(expenses.categoryId, id))),
    ]);
    if (modelCount > 0 || expenseCount > 0) {
      throw new Error("No puedes eliminar una categoria que ya esta asociada a modelos o gastos.");
    }
    await db.delete(categories).where(eq(categories.id, id));
    revalidatePath("/configuracion");
    revalidatePath("/inventario");
    revalidatePath("/gastos");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al eliminar categoría" };
  }
}

export async function addPaymentMethod(name: string, currency: string) {
  try {
    await requireStaff();
    await db.insert(paymentMethods).values({
      name,
      currency,
      active: true,
    });
    revalidatePath("/configuracion");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al agregar método de pago" };
  }
}

export async function updatePaymentMethodAction(id: number, data: { name: string; currency: string; active: boolean }) {
  try {
    await requireStaff();
    await db
      .update(paymentMethods)
      .set({
        name: normalizeRequiredText(data.name, "Nombre"),
        currency: normalizeRequiredText(data.currency, "Moneda").toUpperCase(),
        active: !!data.active,
      })
      .where(eq(paymentMethods.id, id));
    revalidatePath("/configuracion");
    revalidatePath("/ventas");
    revalidatePath("/consignacion");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al actualizar método de pago" };
  }
}

export async function deletePaymentMethodAction(id: number) {
  try {
    await requireStaff();
    const [salePaymentCount, consignmentPaymentCount] = await Promise.all([
      countRows(db.select({ count: sql<number>`count(*)` }).from(salePayments).where(eq(salePayments.methodId, id))),
      countRows(db.select({ count: sql<number>`count(*)` }).from(consignmentPayments).where(eq(consignmentPayments.methodId, id))),
    ]);
    if (salePaymentCount > 0 || consignmentPaymentCount > 0) {
      throw new Error("No puedes eliminar un metodo de pago con operaciones historicas.");
    }
    await db.delete(paymentMethods).where(eq(paymentMethods.id, id));
    revalidatePath("/configuracion");
    revalidatePath("/ventas");
    revalidatePath("/consignacion");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al eliminar método de pago" };
  }
}

export async function addCarrier(name: string, tag: string) {
  try {
    await requireStaff();
    await db.insert(carriers).values({
      name,
      tag,
    });
    revalidatePath("/configuracion");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al agregar transportista" };
  }
}

export async function updateCarrierAction(id: number, name: string, tag: string) {
  try {
    await requireStaff();
    await db
      .update(carriers)
      .set({
        name: normalizeRequiredText(name, "Nombre"),
        tag: normalizeRequiredText(tag, "Etiqueta"),
      })
      .where(eq(carriers.id, id));
    revalidatePath("/configuracion");
    revalidatePath("/despachos");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al actualizar transportista" };
  }
}

export async function deleteCarrierAction(id: number) {
  try {
    await requireStaff();
    const shipmentCount = await countRows(
      db.select({ count: sql<number>`count(*)` }).from(shipments).where(eq(shipments.carrierId, id))
    );
    if (shipmentCount > 0) {
      throw new Error("No puedes eliminar un transportista con despachos historicos.");
    }
    await db.delete(carriers).where(eq(carriers.id, id));
    revalidatePath("/configuracion");
    revalidatePath("/despachos");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al eliminar transportista" };
  }
}

export async function updateSetting(key: string, value: string) {
  try {
    const { user } = await requireAuth();
    // Key validation: any authenticated user can bump invoice/return counters.
    // Brand identity + raw FX rate snapshots are admin-only. The low-stock
    // threshold and default rate source live on the "Tasa & umbrales" config
    // tab that is also shown to "usuario", so staff (admin OR usuario) may set them.
    const adminKeys: string[] = [
      SETTINGS_KEYS.brand,
      SETTINGS_KEYS.rif,
      SETTINGS_KEYS.phone,
      SETTINGS_KEYS.instagram,
      SETTINGS_KEYS.parallelRate,
      SETTINGS_KEYS.bcvRate,
      SETTINGS_KEYS.euroParallelRate,
      SETTINGS_KEYS.euroBcvRate,
      SETTINGS_KEYS.lastRatesSyncAt,
      SETTINGS_KEYS.lastRatesSyncStatus,
    ];
    const staffKeys: string[] = [
      SETTINGS_KEYS.lowStockThreshold,
      SETTINGS_KEYS.defaultRateSource,
    ];
    if (adminKeys.includes(key) && user.role !== "admin") {
      throw new Error("Acceso denegado. Se requieren privilegios de Administrador.");
    }
    if (staffKeys.includes(key) && user.role !== "admin" && user.role !== "usuario") {
      throw new Error("Acceso denegado. Se requieren privilegios de Administrador.");
    }

    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value },
      });
    revalidatePath("/configuracion");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al actualizar parámetro" };
  }
}

export async function addExchangeRate(rate: number, source: "paralelo" | "bcv" | "manual") {
  try {
    await requireStaff();
    if (source === "manual") {
      throw new Error("Usa la accion de guardado manual de tasas para esta operacion.");
    }

    await saveManualRates([
      { currencyCode: "USD", source, rate },
    ]);

    revalidatePath("/configuracion");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al registrar tasa de cambio" };
  }
}

/* ============================================================
   Inventory Actions (S2)
   ============================================================ */

export async function getInventoryModels() {
  await requireAuth();
  const [allModels, allSkus, allCategories, allColorImages, allModelColors] = await Promise.all([
    db.select().from(models),
    db.select().from(skus),
    db.select().from(categories),
    db.select().from(modelColorImages),
    db
      .select({
        modelId: modelColors.modelId,
        code: colors.code,
        name: colors.name,
        hex: colors.hex,
        colorId: colors.id,
      })
      .from(modelColors)
      .innerJoin(colors, eq(modelColors.colorId, colors.id)),
  ]);

  const categoriesMap = new Map<number, string>(allCategories.map((c: any) => [c.id, c.name]));
  const skusByModel = new Map<string, any[]>();
  for (const sku of allSkus as any[]) {
    const list = skusByModel.get(sku.modelId) || [];
    list.push(sku);
    skusByModel.set(sku.modelId, list);
  }

  // Group model colors in-memory
  const modelColorsMap = new Map<string, any[]>();
  const modelColorImagesMap = new Map<string, string>();
  allColorImages.forEach((image: any) => {
    modelColorImagesMap.set(`${image.modelId}:${image.colorId}`, image.imageUrl);
  });
  allModelColors.forEach((mc: any) => {
    const list = modelColorsMap.get(mc.modelId) || [];
    list.push({
      code: mc.code,
      name: mc.name,
      hex: mc.hex,
      id: mc.colorId,
      imageUrl: modelColorImagesMap.get(`${mc.modelId}:${mc.colorId}`) || "",
    });
    modelColorsMap.set(mc.modelId, list);
  });

  const result = [];
  for (const m of allModels as any[]) {
    const modelSkus = skusByModel.get(m.id) || [];
    const totalStock = modelSkus.reduce((sum: number, s: any) => sum + s.stock, 0);

    const mColorsList = modelColorsMap.get(m.id) || [];
    const colorCodes = mColorsList.map((c: any) => c.code);

    result.push({
      id: m.id,
      name: m.name,
      composition: m.composition || "",
      category: categoriesMap.get(m.categoryId || 0) || "Sin Categoría",
      basePrice: m.basePrice,
      type: m.type,
      gender: m.gender || "dama",
      lowStockThreshold: m.lowStockThreshold ?? 3,
      colorCodes,
      colors: mColorsList,
      totalStock,
      skus: modelSkus,
    });
  }
  return result;
}

export async function getModelDetail(modelId: string) {
  const [modelRecord] = await db.select().from(models).where(eq(models.id, modelId)).limit(1);
  if (!modelRecord) throw new Error("Modelo no encontrado");
  const [categoryRecord] = modelRecord.categoryId
    ? await db.select().from(categories).where(eq(categories.id, modelRecord.categoryId)).limit(1)
    : [null];

  // Fetch color relations
  const mColors = await db
    .select({ id: colors.id, code: colors.code, name: colors.name, hex: colors.hex })
    .from(modelColors)
    .innerJoin(colors, eq(modelColors.colorId, colors.id))
    .where(eq(modelColors.modelId, modelId));
  const colorImages = await db
    .select({
      colorId: modelColorImages.colorId,
      imageUrl: modelColorImages.imageUrl,
    })
    .from(modelColorImages)
    .where(eq(modelColorImages.modelId, modelId));
  const colorImageMap = new Map<number, string>(
    colorImages.map((image: any) => [image.colorId, image.imageUrl])
  );

  // Fetch size relations
  const mSizes = await db
    .select({ id: sizes.id, name: sizes.name })
    .from(modelSizes)
    .innerJoin(sizes, eq(modelSizes.sizeId, sizes.id))
    .where(eq(modelSizes.modelId, modelId));

  // Fetch SKUs
  const mSkus = await db.select().from(skus).where(eq(skus.modelId, modelId));

  return {
    model: {
      ...modelRecord,
      category: categoryRecord?.name || "Sin Categoría",
    },
    colors: mColors.map((color: any) => ({
      ...color,
      imageUrl: colorImageMap.get(color.id) || "",
    })),
    sizes: mSizes,
    skus: mSkus,
  };
}

export async function upsertModelColorImageAction(data: {
  modelId: string;
  colorId: number;
  imageDataUrl: string;
}) {
  try {
    await requireStaff();
    const modelId = data.modelId.trim();
    if (!modelId || !Number.isFinite(data.colorId) || data.colorId <= 0) {
      throw new Error("Modelo o color inválido.");
    }

    const normalizedImage = parseModelColorImageDataUrl(data.imageDataUrl);
    const [colorLink] = await db
      .select()
      .from(modelColors)
      .where(and(eq(modelColors.modelId, modelId), eq(modelColors.colorId, data.colorId)))
      .limit(1);
    if (!colorLink) {
      throw new Error("El color seleccionado no pertenece a este modelo.");
    }

    const existingImage = await db
      .select({ id: modelColorImages.id })
      .from(modelColorImages)
      .where(and(eq(modelColorImages.modelId, modelId), eq(modelColorImages.colorId, data.colorId)))
      .limit(1);

    if (existingImage[0]) {
      await db
        .update(modelColorImages)
        .set({ imageUrl: normalizedImage })
        .where(eq(modelColorImages.id, existingImage[0].id));
    } else {
      await db.insert(modelColorImages).values({
        modelId,
        colorId: data.colorId,
        imageUrl: normalizedImage,
      });
    }

    revalidatePath("/inventario");
    revalidatePath("/catalogo");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al guardar la imagen por color" };
  }
}

export async function deleteModelColorImageAction(modelId: string, colorId: number) {
  try {
    await requireStaff();
    await db
      .delete(modelColorImages)
      .where(and(eq(modelColorImages.modelId, modelId), eq(modelColorImages.colorId, colorId)));

    revalidatePath("/inventario");
    revalidatePath("/catalogo");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al eliminar la imagen por color" };
  }
}

export async function adjustSkuStock(skuId: number, quantity: number, reason: string) {
  try {
    const { user } = await requireStaff();
    const resolvedUserId = user.id;

    await runInTx(async (tx: any) => {
      const [skuRecord] = await tx.select().from(skus).where(eq(skus.id, skuId)).limit(1);
      if (!skuRecord) {
        throw new Error("SKU no encontrado.");
      }
      if (skuRecord.stock + quantity < 0) {
        throw new Error(
          `El ajuste dejaría stock negativo para ${skuRecord.compositeCode}. Disponible: ${skuRecord.stock}.`
        );
      }

      // 1. Log stock adjustment
      await tx.insert(stockAdjustments).values({
        skuId,
        quantity,
        reason,
        userId: resolvedUserId,
      });

      // 2. Update stock in skus table
      await tx
        .update(skus)
        .set({
          stock: sql`stock + ${quantity}`,
        })
        .where(eq(skus.id, skuId));

      // Audit log
      await logAuditAction({
        action: "AJUSTE_STOCK",
        entity: "sku",
        entityId: skuId.toString(),
        details: `Ajuste de ${quantity} unidades por motivo: ${reason}`,
      }, user.id);
    });

    revalidatePath("/inventario");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al ajustar stock" };
  }
}

export async function createModel(data: {
  id: string;
  name: string;
  categoryName: string;
  composition: string;
  basePrice: number;
  avgCost: number;
  type: "con_tallas" | "sin_tallas";
  gender?: "dama" | "caballero" | "unisex";
  lowStockThreshold?: number;
  colorIds: number[];
  sizeIds: number[];
}) {
  try {
    await requireStaff();

    await runInTx(async (tx: any) => {
      // 1. Get or create category
      let [categoryRecord] = await tx
        .select()
        .from(categories)
        .where(and(eq(categories.name, data.categoryName), eq(categories.type, "product")))
        .limit(1);

      if (!categoryRecord) {
        const [res] = await tx
          .insert(categories)
          .values({ name: data.categoryName, type: "product" })
          .returning({ id: categories.id });
        categoryRecord = { id: res.id, name: data.categoryName, type: "product" };
      }

      // 2. Insert Model
      await tx.insert(models).values({
        id: data.id,
        name: data.name,
        composition: data.composition,
        categoryId: categoryRecord.id,
        type: data.type,
        gender: data.gender || "dama",
        basePrice: data.basePrice,
        avgCost: data.avgCost,
        lowStockThreshold:
          data.lowStockThreshold != null && Number.isFinite(data.lowStockThreshold)
            ? Math.max(0, Math.floor(data.lowStockThreshold))
            : 3,
      });

      // 3. Link colors
      for (const cId of data.colorIds) {
        await tx.insert(modelColors).values({
          modelId: data.id,
          colorId: cId,
        });
      }

      // 4. Link sizes
      for (const sId of data.sizeIds) {
        await tx.insert(modelSizes).values({
          modelId: data.id,
          sizeId: sId,
        });
      }

      // 5. Generate SKUs
      const allColors = await tx.select().from(colors);
      const allSizes = await tx.select().from(sizes);

      const colorsMap = new Map<number, any>(allColors.map((c: any) => [c.id, c]));
      const sizesMap = new Map<number, any>(allSizes.map((s: any) => [s.id, s]));

      if (data.type === "con_tallas") {
        for (const cId of data.colorIds) {
          const colorCode = colorsMap.get(cId)?.code || "Z00";
          for (const sId of data.sizeIds) {
            const sizeName = sizesMap.get(sId)?.name || "M";
            const composite = generateSkuCode(data.id, colorCode, sizeName);

            await tx.insert(skus).values({
              modelId: data.id,
              colorId: cId,
              sizeId: sId,
              compositeCode: composite,
              stock: 0,
              avgCost: data.avgCost,
            });
          }
        }
      } else {
        // sin_tallas
        for (const cId of data.colorIds) {
          const colorCode = colorsMap.get(cId)?.code || "Z00";
          const composite = generateSkuCode(data.id, colorCode);

          await tx.insert(skus).values({
            modelId: data.id,
            colorId: cId,
            sizeId: null,
            compositeCode: composite,
            stock: 0,
            avgCost: data.avgCost,
          });
        }
      }

      // Audit log
      await logAuditAction({
        action: "CREAR",
        entity: "model",
        entityId: data.id,
        details: `Modelo ${data.name} creado (categoría: ${data.categoryName}, basePrice: ${data.basePrice})`,
      });
    });

    revalidatePath("/inventario");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al crear modelo" };
  }
}

export async function updateModelAction(data: {
  id: string;
  name: string;
  categoryName: string;
  composition: string;
  basePrice: number;
  gender?: "dama" | "caballero" | "unisex";
  avgCost?: number;
  lowStockThreshold?: number;
}) {
  try {
    await requireStaff();
    const [model] = await db.select().from(models).where(eq(models.id, data.id)).limit(1);
    if (!model) return { success: false, error: "Modelo no encontrado" };

    let [categoryRecord] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.name, data.categoryName), eq(categories.type, "product")))
      .limit(1);
    if (!categoryRecord) {
      const [res] = await db
        .insert(categories)
        .values({ name: data.categoryName, type: "product" })
        .returning({ id: categories.id });
      categoryRecord = { id: res.id, name: data.categoryName, type: "product" };
    }

    // Scalar update only — avgCost is auto-managed, and existing sale/quote line
    // prices are snapshotted (unitPrice) so they are unaffected by a basePrice change.
    await db
      .update(models)
      .set({
        name: data.name,
        composition: data.composition,
        categoryId: categoryRecord.id,
        basePrice: data.basePrice,
        ...(data.gender ? { gender: data.gender } : {}),
        ...(data.avgCost != null && Number.isFinite(data.avgCost) ? { avgCost: data.avgCost } : {}),
        ...(data.lowStockThreshold != null && Number.isFinite(data.lowStockThreshold)
          ? { lowStockThreshold: Math.max(0, Math.floor(data.lowStockThreshold)) }
          : {}),
      })
      .where(eq(models.id, data.id));

    // Set the baseline cost on SKUs that have not been costed by a purchase yet
    // (stock 0). Costed SKUs keep their weighted-average cost.
    if (data.avgCost != null && Number.isFinite(data.avgCost)) {
      await db
        .update(skus)
        .set({ avgCost: data.avgCost })
        .where(and(eq(skus.modelId, data.id), eq(skus.stock, 0)));
    }

    await logAuditAction({
      action: "MODIFICAR",
      entity: "model",
      entityId: data.id,
      details: `Modelo ${data.name} actualizado (basePrice: ${data.basePrice})`,
    });

    revalidatePath("/inventario");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al actualizar modelo" };
  }
}

export async function addColorsToModelAction(modelId: string, colorIds: number[]) {
  try {
    await requireStaff();

    const [modelRecord] = await db.select().from(models).where(eq(models.id, modelId)).limit(1);
    if (!modelRecord) {
      return { success: false, error: "Modelo no encontrado" };
    }

    if (!Array.isArray(colorIds) || colorIds.length === 0) {
      return { success: false, error: "Seleccione al menos un color para agregar." };
    }

    const selectedColors = await db.select().from(colors).where(inArray(colors.id, colorIds));
    if (selectedColors.length === 0) {
      return { success: false, error: "Los colores seleccionados no existen en el catálogo." };
    }

    const existingModelColors = await db
      .select({ colorId: modelColors.colorId })
      .from(modelColors)
      .where(eq(modelColors.modelId, modelId));
    const existingColorIds = new Set<number>(existingModelColors.map((mc: any) => mc.colorId));

    const colorsToAdd = selectedColors.filter((c: any) => !existingColorIds.has(c.id));
    if (colorsToAdd.length === 0) {
      return { success: false, error: "Todos los colores seleccionados ya están asignados a este modelo." };
    }

    // Determine target sizes if model has sizes
    let targetSizes: { sizeId: number; name: string }[] = [];
    if (modelRecord.type === "con_tallas") {
      const linkedSizes = await db
        .select({ sizeId: modelSizes.sizeId, name: sizes.name })
        .from(modelSizes)
        .innerJoin(sizes, eq(modelSizes.sizeId, sizes.id))
        .where(eq(modelSizes.modelId, modelId));

      targetSizes = linkedSizes;

      // Fallback: If no linked sizes in modelSizes, check existing SKUs for this model
      if (targetSizes.length === 0) {
        const skuSizes = await db
          .select({ sizeId: skus.sizeId, name: sizes.name })
          .from(skus)
          .innerJoin(sizes, eq(skus.sizeId, sizes.id))
          .where(eq(skus.modelId, modelId));
        const seen = new Set<number>();
        for (const s of skuSizes) {
          if (s.sizeId && !seen.has(s.sizeId)) {
            seen.add(s.sizeId);
            targetSizes.push({ sizeId: s.sizeId, name: s.name });
          }
        }
      }

      // If still empty, link all standard sizes in the system
      if (targetSizes.length === 0) {
        const allSizes = await db.select().from(sizes);
        targetSizes = allSizes.map((s: any) => ({ sizeId: s.id, name: s.name }));
        for (const s of targetSizes) {
          await db.insert(modelSizes).values({ modelId, sizeId: s.sizeId });
        }
      }
    }

    await runInTx(async (tx: any) => {
      for (const color of colorsToAdd) {
        // 1. Link color to model
        await tx.insert(modelColors).values({
          modelId,
          colorId: color.id,
        });

        // 2. Generate SKUs
        if (modelRecord.type === "con_tallas") {
          for (const size of targetSizes) {
            const composite = generateSkuCode(modelId, color.code, size.name);
            const [existing] = await tx
              .select({ id: skus.id })
              .from(skus)
              .where(eq(skus.compositeCode, composite))
              .limit(1);

            if (!existing) {
              await tx.insert(skus).values({
                modelId,
                colorId: color.id,
                sizeId: size.sizeId,
                compositeCode: composite,
                stock: 0,
                avgCost: modelRecord.avgCost || 0,
              });
            }
          }
        } else {
          // sin_tallas
          const composite = generateSkuCode(modelId, color.code);
          const [existing] = await tx
            .select({ id: skus.id })
            .from(skus)
            .where(eq(skus.compositeCode, composite))
            .limit(1);

          if (!existing) {
            await tx.insert(skus).values({
              modelId,
              colorId: color.id,
              sizeId: null,
              compositeCode: composite,
              stock: 0,
              avgCost: modelRecord.avgCost || 0,
            });
          }
        }
      }

      const colorNames = colorsToAdd.map((c: any) => `${c.name} (${c.code})`).join(", ");
      await logAuditAction({
        action: "MODIFICAR",
        entity: "model",
        entityId: modelId,
        details: `Colores agregados al modelo ${modelRecord.name} (${modelId}): ${colorNames}`,
      });
    });

    revalidatePath("/inventario");
    revalidatePath("/catalogo");
    revalidatePath("/ventas");
    revalidatePath("/consignacion");

    return { success: true, count: colorsToAdd.length };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al agregar colores al modelo" };
  }
}

export async function addColorToModelAction(modelId: string, colorId: number) {
  return addColorsToModelAction(modelId, [colorId]);
}

export async function removeColorFromModelAction(modelId: string, colorId: number) {
  try {
    await requireStaff();

    const [modelRecord] = await db.select().from(models).where(eq(models.id, modelId)).limit(1);
    if (!modelRecord) {
      return { success: false, error: "Modelo no encontrado" };
    }

    const [colorRecord] = await db.select().from(colors).where(eq(colors.id, colorId)).limit(1);
    if (!colorRecord) {
      return { success: false, error: "Color no encontrado" };
    }

    const allModelColors = await db.select().from(modelColors).where(eq(modelColors.modelId, modelId));
    if (allModelColors.length <= 1) {
      return {
        success: false,
        error: "No se puede quitar el color: el modelo debe tener al menos un color registrado.",
      };
    }

    const hasColor = allModelColors.some((mc: any) => mc.colorId === colorId);
    if (!hasColor) {
      return { success: false, error: "El modelo no tiene asignado este color." };
    }

    // Fetch all SKUs for this model + color
    const colorSkus = await db
      .select()
      .from(skus)
      .where(and(eq(skus.modelId, modelId), eq(skus.colorId, colorId)));
    const skuIds = colorSkus.map((s: any) => s.id);

    // Validation 1: Stock must be 0
    const withStock = colorSkus.find((s: any) => s.stock !== 0);
    if (withStock) {
      return {
        success: false,
        error: `No se puede quitar el color ${colorRecord.name}: la variación ${withStock.compositeCode} tiene stock (${withStock.stock}). Ajuste el stock a 0 antes de quitarlo.`,
      };
    }

    // Validation 2: Operational movement references
    if (skuIds.length > 0) {
      const [refSale] = await db
        .select({ id: saleItems.id })
        .from(saleItems)
        .where(inArray(saleItems.skuId, skuIds))
        .limit(1);
      if (refSale) {
        return {
          success: false,
          error: `No se puede quitar el color ${colorRecord.name}: existen ventas asociadas a este color. Para dejar de ofrecerlo, mantenga su stock en 0.`,
        };
      }

      const [refQuote] = await db
        .select({ id: quoteItems.id })
        .from(quoteItems)
        .where(inArray(quoteItems.skuId, skuIds))
        .limit(1);
      if (refQuote) {
        return {
          success: false,
          error: `No se puede quitar el color ${colorRecord.name}: existen cotizaciones asociadas a este color.`,
        };
      }

      const [refPurchase] = await db
        .select({ id: purchaseItems.id })
        .from(purchaseItems)
        .where(inArray(purchaseItems.skuId, skuIds))
        .limit(1);
      if (refPurchase) {
        return {
          success: false,
          error: `No se puede quitar el color ${colorRecord.name}: existen compras de mercancía asociadas a este color.`,
        };
      }

      const [refConsign] = await db
        .select({ id: consignmentItems.id })
        .from(consignmentItems)
        .where(inArray(consignmentItems.skuId, skuIds))
        .limit(1);
      if (refConsign) {
        return {
          success: false,
          error: `No se puede quitar el color ${colorRecord.name}: existen consignaciones asociadas a este color.`,
        };
      }

      const [refReturn] = await db
        .select({ id: returnItems.id })
        .from(returnItems)
        .where(or(inArray(returnItems.skuId, skuIds), inArray(returnItems.replacementSkuId, skuIds)))
        .limit(1);
      if (refReturn) {
        return {
          success: false,
          error: `No se puede quitar el color ${colorRecord.name}: existen devoluciones asociadas a este color.`,
        };
      }
    }

    await runInTx(async (tx: any) => {
      if (skuIds.length > 0) {
        await tx.delete(stockAdjustments).where(inArray(stockAdjustments.skuId, skuIds));
        await tx.delete(skus).where(and(eq(skus.modelId, modelId), eq(skus.colorId, colorId)));
      }
      await tx
        .delete(modelColorImages)
        .where(and(eq(modelColorImages.modelId, modelId), eq(modelColorImages.colorId, colorId)));
      await tx
        .delete(modelColors)
        .where(and(eq(modelColors.modelId, modelId), eq(modelColors.colorId, colorId)));

      await logAuditAction({
        action: "ELIMINAR",
        entity: "model",
        entityId: modelId,
        details: `Color ${colorRecord.name} (${colorRecord.code}) quitado del modelo ${modelRecord.name} (${modelId})`,
      });
    });

    revalidatePath("/inventario");
    revalidatePath("/catalogo");
    revalidatePath("/ventas");
    revalidatePath("/consignacion");

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al quitar color del modelo" };
  }
}

export async function deleteModelAction(modelId: string) {
  try {
    await requireStaff();
    const modelSkus = await db.select().from(skus).where(eq(skus.modelId, modelId));
    const skuIds = modelSkus.map((s: any) => s.id);

    const withStock = modelSkus.find((s: any) => s.stock !== 0);
    if (withStock) {
      return {
        success: false,
        error: `No se puede eliminar: el SKU ${withStock.compositeCode} tiene stock (${withStock.stock}). Ajuste el stock a 0 primero.`,
      };
    }

    if (skuIds.length > 0) {
      const [refSale] = await db.select({ id: saleItems.id }).from(saleItems).where(inArray(saleItems.skuId, skuIds)).limit(1);
      if (refSale) return { success: false, error: "No se puede eliminar: el modelo tiene ventas asociadas." };
      const [refQuote] = await db.select({ id: quoteItems.id }).from(quoteItems).where(inArray(quoteItems.skuId, skuIds)).limit(1);
      if (refQuote) return { success: false, error: "No se puede eliminar: el modelo tiene cotizaciones asociadas." };
      const [refPurchase] = await db.select({ id: purchaseItems.id }).from(purchaseItems).where(inArray(purchaseItems.skuId, skuIds)).limit(1);
      if (refPurchase) return { success: false, error: "No se puede eliminar: el modelo tiene compras asociadas." };
      const [refConsign] = await db.select({ id: consignmentItems.id }).from(consignmentItems).where(inArray(consignmentItems.skuId, skuIds)).limit(1);
      if (refConsign) return { success: false, error: "No se puede eliminar: el modelo tiene consignaciones asociadas." };
      const [refReturn] = await db
        .select({ id: returnItems.id })
        .from(returnItems)
        .where(or(inArray(returnItems.skuId, skuIds), inArray(returnItems.replacementSkuId, skuIds)))
        .limit(1);
      if (refReturn) return { success: false, error: "No se puede eliminar: el modelo tiene devoluciones asociadas." };
    }

    await runInTx(async (tx: any) => {
      if (skuIds.length > 0) {
        await tx.delete(stockAdjustments).where(inArray(stockAdjustments.skuId, skuIds));
      }
      await tx.delete(skus).where(eq(skus.modelId, modelId));
      await tx.delete(modelColorImages).where(eq(modelColorImages.modelId, modelId));
      await tx.delete(modelColors).where(eq(modelColors.modelId, modelId));
      await tx.delete(modelSizes).where(eq(modelSizes.modelId, modelId));
      await tx.delete(models).where(eq(models.id, modelId));
    });

    await logAuditAction({
      action: "ELIMINAR",
      entity: "model",
      entityId: modelId,
      details: `Modelo ${modelId} eliminado`,
    });

    revalidatePath("/inventario");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al eliminar modelo" };
  }
}

/* ============================================================
   Purchases Actions (S3)
   ============================================================ */

export async function getSuppliers() {
  await requireStaff();
  const result = await db.select().from(suppliers);
  return result;
}

export async function createSupplier(name: string, items: string, contact: string) {
  try {
    await requireStaff();
    await db.insert(suppliers).values({
      name,
      items,
      contact,
    });
    revalidatePath("/compras");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al crear proveedor" };
  }
}

export async function updateSupplierAction(id: number, name: string, items: string, contact: string) {
  try {
    await requireStaff();
    await db.update(suppliers).set({ name, items, contact }).where(eq(suppliers.id, id));
    revalidatePath("/compras");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al actualizar proveedor" };
  }
}

export async function deleteSupplierAction(id: number) {
  try {
    await requireStaff();
    const [ref] = await db.select({ id: purchases.id }).from(purchases).where(eq(purchases.supplierId, id)).limit(1);
    if (ref) return { success: false, error: "No se puede eliminar: el proveedor tiene compras asociadas." };
    await db.delete(suppliers).where(eq(suppliers.id, id));
    revalidatePath("/compras");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al eliminar proveedor" };
  }
}

export async function getPurchasesData() {
  await requireStaff();
  const [allPurchases, allPurchaseItems, allSuppliers] = await Promise.all([
    db.select().from(purchases),
    db.select().from(purchaseItems),
    db.select().from(suppliers),
  ]);

  // Only load the SKUs actually referenced by purchase items (for labels) rather
  // than scanning the whole catalog.
  const referencedSkuIds: number[] = Array.from(new Set(allPurchaseItems.map((it: any) => it.skuId as number)));
  const allSkus = referencedSkuIds.length > 0
    ? await db.select().from(skus).where(inArray(skus.id, referencedSkuIds))
    : [];

  const suppliersMap = new Map<number, any>(allSuppliers.map((s: any) => [s.id, s]));
  const skusMap = new Map<number, any>(allSkus.map((s: any) => [s.id, s]));
  const itemsByPurchase = new Map<number, any[]>();
  for (const item of allPurchaseItems as any[]) {
    const list = itemsByPurchase.get(item.purchaseId) || [];
    list.push(item);
    itemsByPurchase.set(item.purchaseId, list);
  }

  const result = [];
  for (const p of allPurchases as any[]) {
    const pItems = itemsByPurchase.get(p.id) || [];
    const supplier = suppliersMap.get(p.supplierId) || { name: "Desconocido" };

    const itemsFormatted = pItems.map((item: any) => {
      const sku = skusMap.get(item.skuId) || { compositeCode: "Desconocido", avgCost: 0 };
      return {
        ...item,
        compositeCode: sku.compositeCode,
        skuAvgCost: sku.avgCost,
      };
    });

    const totalCost = pItems.reduce((sum: number, item: any) => sum + (item.quantity * item.unitCost), 0);
    const totalUnits = pItems.reduce((sum: number, item: any) => sum + item.quantity, 0);

    result.push({
      ...p,
      supplierName: supplier.name,
      items: itemsFormatted,
      totalCost,
      totalUnits,
    });
  }

  const reversed = result.reverse();
  return reversed;
}

export async function createPurchase(data: {
  supplierId: number;
  date: string;
  status: "borrador" | "en_transito" | "recibida" | "parcial";
  notes?: string;
  items: { skuId: number; quantity: number; unitCost: number }[];
}) {
  try {
    const { user } = await requireStaff();

    await runInTx(async (tx: any) => {
      const [purchaseRecord] = await tx
        .insert(purchases)
        .values({
          supplierId: data.supplierId,
          date: data.date,
          status: data.status,
          notes: data.notes || "",
        })
        .returning({ id: purchases.id });

      for (const item of data.items) {
        await tx.insert(purchaseItems).values({
          purchaseId: purchaseRecord.id,
          skuId: item.skuId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          receivedQuantity: data.status === "recibida" ? item.quantity : 0,
        });

        if (data.status === "recibida") {
          await applySkuPurchaseUpdate(tx, item.skuId, item.quantity, item.unitCost, purchaseRecord.id, user.id);
        }
      }

      await logAuditAction({
        action: "CREAR",
        entity: "purchase",
        entityId: purchaseRecord.id.toString(),
        details: `Compra creada con estado: ${data.status} para proveedor ID: ${data.supplierId}`,
      }, user.id);
    });

    revalidatePath("/compras");
    revalidatePath("/inventario");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al crear compra" };
  }
}

export async function receivePurchase(purchaseId: number) {
  try {
    const { user } = await requireStaff();

    await runInTx(async (tx: any) => {
      const [purchaseRecord] = await tx.select().from(purchases).where(eq(purchases.id, purchaseId)).limit(1);
      if (!purchaseRecord) throw new Error("Compra no encontrada");
      if (purchaseRecord.status === "recibida") throw new Error("La compra ya ha sido recibida");

      const pItems = await tx.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, purchaseId));

      for (const item of pItems) {
        // Only receive the still-pending quantity (supports completing a partial).
        const pending = item.quantity - (item.receivedQuantity || 0);
        if (pending > 0) {
          await applySkuPurchaseUpdate(tx, item.skuId, pending, item.unitCost, purchaseId, user.id);
          await tx
            .update(purchaseItems)
            .set({ receivedQuantity: item.quantity })
            .where(eq(purchaseItems.id, item.id));
        }
      }

      await tx
        .update(purchases)
        .set({ status: "recibida" })
        .where(eq(purchases.id, purchaseId));

      await logAuditAction({
        action: "MODIFICAR",
        entity: "purchase",
        entityId: purchaseId.toString(),
        details: `Compra recibida y stock de ítems reingresado`,
      }, user.id);
    });

    revalidatePath("/compras");
    revalidatePath("/inventario");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al recibir compra" };
  }
}

/**
 * Receive a subset of a purchase's pending quantities. Raises stock for the
 * received amount, updates received_quantity per item, and sets the purchase to
 * "parcial" (or "recibida" once everything has arrived).
 */
export async function receivePurchaseItemsAction(
  purchaseId: number,
  receipts: { itemId: number; quantity: number }[]
) {
  try {
    const { user } = await requireStaff();
    const receiptMap = new Map<number, number>();
    for (const r of receipts) {
      if (r.quantity > 0) receiptMap.set(r.itemId, (receiptMap.get(r.itemId) || 0) + r.quantity);
    }
    if (receiptMap.size === 0) return { success: false, error: "Indique al menos una cantidad a recibir." };

    await runInTx(async (tx: any) => {
      const [purchaseRecord] = await tx.select().from(purchases).where(eq(purchases.id, purchaseId)).limit(1);
      if (!purchaseRecord) throw new Error("Compra no encontrada");
      if (purchaseRecord.status === "recibida") throw new Error("La compra ya ha sido recibida por completo");

      const pItems = await tx.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, purchaseId));
      const itemsById = new Map<number, any>(pItems.map((it: any) => [it.id, it]));

      for (const [itemId, qty] of receiptMap.entries()) {
        const item = itemsById.get(itemId);
        if (!item) throw new Error(`Ítem ${itemId} no pertenece a la compra.`);
        const pending = item.quantity - (item.receivedQuantity || 0);
        const toReceive = Math.min(qty, pending);
        if (toReceive <= 0) continue;
        await applySkuPurchaseUpdate(tx, item.skuId, toReceive, item.unitCost, purchaseId, user.id);
        await tx
          .update(purchaseItems)
          .set({ receivedQuantity: (item.receivedQuantity || 0) + toReceive })
          .where(eq(purchaseItems.id, item.id));
        item.receivedQuantity = (item.receivedQuantity || 0) + toReceive;
      }

      const allReceived = pItems.every((it: any) => (it.receivedQuantity || 0) >= it.quantity);
      await tx
        .update(purchases)
        .set({ status: allReceived ? "recibida" : "parcial" })
        .where(eq(purchases.id, purchaseId));

      await logAuditAction({
        action: "MODIFICAR",
        entity: "purchase",
        entityId: purchaseId.toString(),
        details: `Recepción parcial de compra (estado: ${allReceived ? "recibida" : "parcial"})`,
      }, user.id);
    });

    revalidatePath("/compras");
    revalidatePath("/inventario");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al recibir compra parcialmente" };
  }
}

export async function updatePurchaseAction(data: {
  id: number;
  supplierId: number;
  date: string;
  notes?: string;
}) {
  try {
    await requireStaff();
    const [purchaseRecord] = await db.select().from(purchases).where(eq(purchases.id, data.id)).limit(1);
    if (!purchaseRecord) return { success: false, error: "Compra no encontrada" };
    if (purchaseRecord.status === "recibida" || purchaseRecord.status === "parcial") {
      return {
        success: false,
        error: "No se puede editar una compra ya recibida (total o parcial), porque afecta el costo promedio. Cree una nueva.",
      };
    }

    await db
      .update(purchases)
      .set({ supplierId: data.supplierId, date: data.date, notes: data.notes || "" })
      .where(eq(purchases.id, data.id));

    revalidatePath("/compras");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al editar compra" };
  }
}

export async function deletePurchaseAction(purchaseId: number) {
  try {
    const { user } = await requireStaff();
    const [purchaseRecord] = await db.select().from(purchases).where(eq(purchases.id, purchaseId)).limit(1);
    if (!purchaseRecord) return { success: false, error: "Compra no encontrada" };
    if (purchaseRecord.status === "recibida" || purchaseRecord.status === "parcial") {
      return {
        success: false,
        error: "No se puede eliminar una compra ya recibida (total o parcial). Su stock y costo ya fueron aplicados.",
      };
    }

    await runInTx(async (tx: any) => {
      await tx.delete(purchaseItems).where(eq(purchaseItems.purchaseId, purchaseId));
      await tx.delete(purchases).where(eq(purchases.id, purchaseId));
    });

    await logAuditAction({
      action: "ELIMINAR",
      entity: "purchase",
      entityId: purchaseId.toString(),
      details: `Compra ${purchaseId} eliminada (estado previo: ${purchaseRecord.status})`,
    }, user.id);

    revalidatePath("/compras");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al eliminar compra" };
  }
}

async function applySkuPurchaseUpdate(
  tx: any,
  skuId: number,
  qtyReceived: number,
  unitCost: number,
  purchaseId: number,
  userId: string
) {
  const [skuRecord] = await tx.select().from(skus).where(eq(skus.id, skuId)).limit(1);
  if (!skuRecord) return;

  const currentStock = skuRecord.stock;
  const currentAvgCost = skuRecord.avgCost;

  const totalQty = currentStock + qtyReceived;
  let newAvgCost = currentAvgCost;
  if (totalQty > 0) {
    newAvgCost = (currentStock * currentAvgCost + qtyReceived * unitCost) / totalQty;
  }

  await tx
    .update(skus)
    .set({
      stock: totalQty,
      avgCost: newAvgCost,
    })
    .where(eq(skus.id, skuId));

  await tx.insert(stockAdjustments).values({
    skuId,
    quantity: qtyReceived,
    reason: `Entrada por Compra Nº ${purchaseId}`,
    userId,
  });
}

/* ============================================================
   Sales & CRM Actions (S4)
   ============================================================ */

export async function getCustomers() {
  await requireAuth();
  return await db.select().from(customers);
}

export async function createCustomerAction(name: string, phone: string, notes?: string) {
  try {
    await requireAuth();
    const [inserted] = await db.insert(customers).values({
      name,
      phone,
      notes: notes || "",
    }).returning({ id: customers.id });

    // Audit log
    await logAuditAction({
      action: "CREAR",
      entity: "customer",
      entityId: inserted.id.toString(),
      details: `Cliente ${name} creado con teléfono ${phone}`,
    });

    revalidatePath("/clientes");
    revalidatePath("/ventas");
    return { success: true, id: inserted.id };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al crear cliente" };
  }
}

export async function getSalesAndQuotesData() {
  await requireAuth();
  const [
    allSales,
    allSaleItems,
    allSalePayments,
    allQuotes,
    allQuoteItems,
    allCustomers,
    allPaymentMethods,
  ] = await Promise.all([
    db.select().from(sales),
    db.select().from(saleItems),
    db.select().from(salePayments),
    db.select().from(quotes),
    db.select().from(quoteItems),
    db.select().from(customers),
    db.select().from(paymentMethods),
  ]);

  const customersMap = new Map<number, any>(allCustomers.map((c: any) => [c.id, c]));
  const payMethodsMap = new Map<number, any>(allPaymentMethods.map((pm: any) => [pm.id, pm]));
  const saleItemsBySale = new Map<number, any[]>();
  const salePaymentsBySale = new Map<number, any[]>();
  const quoteItemsByQuote = new Map<number, any[]>();

  for (const item of allSaleItems as any[]) {
    const list = saleItemsBySale.get(item.saleId) || [];
    list.push(item);
    saleItemsBySale.set(item.saleId, list);
  }

  for (const payment of allSalePayments as any[]) {
    const list = salePaymentsBySale.get(payment.saleId) || [];
    list.push(payment);
    salePaymentsBySale.set(payment.saleId, list);
  }

  for (const item of allQuoteItems as any[]) {
    const list = quoteItemsByQuote.get(item.quoteId) || [];
    list.push(item);
    quoteItemsByQuote.set(item.quoteId, list);
  }

  const result = [];
  const today = new Date().toISOString().slice(0, 10);

  // Map Sales
  for (const s of allSales as any[]) {
    const sItems = saleItemsBySale.get(s.id) || [];
    const sPayments = salePaymentsBySale.get(s.id) || [];
    const customer = s.customerId ? customersMap.get(s.customerId) : null;
    const itemsCount = sItems.reduce((sum: number, item: any) => sum + item.quantity, 0);

    // Get payment method summary
    let payMethodSummary = "—";
    if (sPayments.length > 0) {
      if (sPayments.length === 1) {
        payMethodSummary = payMethodsMap.get(sPayments[0].methodId)?.name || "Otro";
      } else {
        payMethodSummary = "Mixto";
      }
    }

    result.push({
      id: s.id,
      number: s.number,
      date: s.date,
      customerName: customer ? customer.name : "Venta anónima",
      itemsCount,
      totalUsd: s.totalUsd,
      totalBs: s.totalBs,
      rateUsed: s.rateUsed,
      rateSource: s.rateSource,
      payMethodSummary,
      status: s.status === "pagada" ? "Pagada" : s.status === "pendiente" ? "Pendiente" : "Anulada",
      type: "venta" as const,
      rawStatus: s.status,
    });
  }

  // Map Quotes
  for (const q of allQuotes as any[]) {
    const qItems = quoteItemsByQuote.get(q.id) || [];
    const customer = q.customerId ? customersMap.get(q.customerId) : null;
    const itemsCount = qItems.reduce((sum: number, item: any) => sum + item.quantity, 0);
    // Compute-on-read expiry: an open quote past its validUntil is shown as
    // "Vencida" without mutating the row (validUntil was purely decorative).
    const isExpired = q.status === "abierta" && !!q.validUntil && q.validUntil < today;

    result.push({
      id: q.id,
      number: q.number,
      date: q.date,
      customerName: customer ? customer.name : "Anónimo",
      itemsCount,
      totalUsd: q.totalUsd,
      totalBs: q.totalUsd * q.rateUsed,
      rateUsed: q.rateUsed,
      rateSource: q.rateSource,
      payMethodSummary: "—",
      status: q.status === "abierta"
        ? (isExpired ? "Vencida" : "Cotización")
        : q.status === "convertida" ? "Convertida" : q.status === "vencida" ? "Vencida" : "Anulada",
      type: "cotizacion" as const,
      rawStatus: q.status,
      isExpired,
      validUntil: q.validUntil,
    });
  }

  // Order by date descending, then by number descending
  const sorted = result.sort((a, b) => {
    const dCompare = b.date.localeCompare(a.date);
    if (dCompare !== 0) return dCompare;
    return b.number.localeCompare(a.number);
  });
  return sorted;
}

async function getOrCreateCreditMethodId(tx: any) {
  const [existing] = await tx
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.name, "Saldo a favor"))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await tx
    .insert(paymentMethods)
    .values({ name: "Saldo a favor", currency: "USD", active: true })
    .returning({ id: paymentMethods.id });
  return created.id;
}

export async function createSaleOrQuote(data: {
  type: "venta" | "cotizacion";
  customerId?: number | null;
  date: string;
  totalUsd: number;
  rateUsed: number;
  rateSource: FxSource;
  notes?: string;
  items: { skuId: number; quantity: number; unitPrice: number }[];
  payments?: {
    methodId: number;
    amountUsd: number;
    amountOriginal?: number;
    currency?: string;
    rateUsed?: number;
    rateSource?: FxSource;
    reference?: string;
  }[];
  creditApplied?: number;
  userId?: string;
}) {
  try {
    const { user } = await requireAuth();
    const resolvedUserId = user.id;
    const fallbackRate = await getTransactionRate(
      data.rateSource === "bcv" ? "bcv" : "paralelo"
    );
    const resolvedRateUsed = normalizeTransactionRate(
      data.rateSource,
      data.rateUsed,
      fallbackRate
    );

    await runInTx(async (tx: any) => {
      if (data.type === "venta") {
        const nextNeCount = await getNextCounterValue(
          tx,
          SETTINGS_KEYS.neCounter,
          SYSTEM_DEFAULTS.counters.ne
        );
        const docNumber = `NE-${String(nextNeCount).padStart(5, "0")}`;

        // Validate stock for ALL items up-front: on D1 there is no rollback, so we
        // must fail before inserting the sale header to avoid orphan documents.
        await assertStockAvailable(tx, data.items, `la venta ${docNumber}`);

        // 2. Insert Sale
        const [saleRecord] = await tx
          .insert(sales)
          .values({
            number: docNumber,
            customerId: data.customerId || null,
            date: data.date,
            totalUsd: data.totalUsd,
            totalBs: data.totalUsd * resolvedRateUsed,
            rateUsed: resolvedRateUsed,
            rateSource: data.rateSource,
            status: "pagada",
            userId: resolvedUserId,
          })
          .returning({ id: sales.id });

        // 3. Process items & deduct stock
        for (const item of data.items) {
          await tx.insert(saleItems).values({
            saleId: saleRecord.id,
            skuId: item.skuId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          });

          // Deduct SKU stock (guarded so it can never drive stock negative)
          const saleStockDeduct = await tx
            .update(skus)
            .set({
              stock: sql`stock - ${item.quantity}`,
            })
            .where(and(eq(skus.id, item.skuId), gte(skus.stock, item.quantity)))
            .returning({ id: skus.id });
          if (saleStockDeduct.length === 0) {
            throw new Error(`Stock insuficiente para el SKU ${item.skuId} durante la venta.`);
          }

          // Log adjustment (kardex)
          await tx.insert(stockAdjustments).values({
            skuId: item.skuId,
            quantity: -item.quantity,
            reason: `Venta Nota de Entrega ${docNumber}`,
            userId: resolvedUserId,
          });
        }

        // 4. Insert Payments
        if (data.payments) {
          for (const pay of data.payments) {
            await tx.insert(salePayments).values({
              saleId: saleRecord.id,
              methodId: pay.methodId,
              amountUsd: pay.amountUsd,
              currency: (pay.currency || "USD").trim().toUpperCase(),
              amountOriginal: pay.amountOriginal ?? pay.amountUsd,
              rateUsed: pay.rateUsed ?? (isBolivarCurrency(pay.currency || "USD") ? resolvedRateUsed : 1),
              rateSource: pay.rateSource || (isBolivarCurrency(pay.currency || "USD") ? data.rateSource : "manual"),
              reference: pay.reference || "",
            });
          }
        }

        // 5. Apply customer store credit ("saldo a favor"), if requested.
        if (data.creditApplied && data.creditApplied > 0) {
          if (!data.customerId) {
            throw new Error("Para aplicar saldo a favor debe seleccionar un cliente.");
          }
          const [cust] = await tx.select().from(customers).where(eq(customers.id, data.customerId)).limit(1);
          if (!cust) throw new Error("Cliente no encontrado para aplicar saldo a favor.");
          const creditToApply = Math.min(data.creditApplied, cust.creditBalance, data.totalUsd);
          if (data.creditApplied > cust.creditBalance + 0.01) {
            throw new Error(
              `Saldo a favor insuficiente. Disponible: ${cust.creditBalance.toFixed(2)} USD.`
            );
          }
          if (creditToApply > 0) {
            const creditMethodId = await getOrCreateCreditMethodId(tx);
            await tx.insert(salePayments).values({
              saleId: saleRecord.id,
              methodId: creditMethodId,
              amountUsd: creditToApply,
              currency: "USD",
              amountOriginal: creditToApply,
              rateUsed: 1,
              rateSource: "manual",
              reference: "Saldo a favor",
            });
            await tx
              .update(customers)
              .set({ creditBalance: sql`${customers.creditBalance} - ${creditToApply}` })
              .where(eq(customers.id, data.customerId));
          }
        }

        // 6. Audit the sale, flagging below-cost sales (total < COGS).
        const saleItemSkuIds = Array.from(new Set(data.items.map((i) => i.skuId)));
        const costRows = saleItemSkuIds.length > 0
          ? await tx.select({ id: skus.id, avgCost: skus.avgCost }).from(skus).where(inArray(skus.id, saleItemSkuIds))
          : [];
        const costMap = new Map<number, number>(costRows.map((r: any) => [r.id, r.avgCost]));
        const cogs = data.items.reduce((sum, it) => sum + it.quantity * (costMap.get(it.skuId) || 0), 0);
        const belowCost = cogs > 0 && data.totalUsd < cogs - 0.01;
        await logAuditAction(
          {
            action: belowCost ? "VENTA_BAJO_COSTO" : "CREAR",
            entity: "sale",
            entityId: saleRecord.id.toString(),
            details: `Venta ${docNumber} · total $${data.totalUsd.toFixed(2)}${belowCost ? ` · ⚠ por debajo del costo ($${cogs.toFixed(2)})` : ""}`,
          },
          resolvedUserId
        );
      } else {
        // It's a Cotización (Quote)
        const nextCotCount = await getNextCounterValue(
          tx,
          SETTINGS_KEYS.quoteCounter,
          SYSTEM_DEFAULTS.counters.quote
        );
        const docNumber = `COT-${String(nextCotCount).padStart(5, "0")}`;

        // 2. Insert Quote
        const [quoteRecord] = await tx
          .insert(quotes)
          .values({
            number: docNumber,
            customerId: data.customerId || null,
            date: data.date,
            totalUsd: data.totalUsd,
            rateUsed: resolvedRateUsed,
            rateSource: data.rateSource,
            status: "abierta",
            validUntil: new Date(new Date(data.date).getTime() + 7 * 24 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10), // valid 7 days
          })
          .returning({ id: quotes.id });

        // 3. Insert items (No stock discount!)
        for (const item of data.items) {
          await tx.insert(quoteItems).values({
            quoteId: quoteRecord.id,
            skuId: item.skuId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          });
        }
      }
    });

    if (data.type === "venta") {
      await notifyAdminsNewSale();
    }

    revalidatePath("/ventas");
    revalidatePath("/inventario");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al registrar documento" };
  }
}

export async function convertQuoteToSaleAction(
  quoteId: number,
  payments: {
    methodId: number;
    amountUsd: number;
    amountOriginal?: number;
    currency?: string;
    rateUsed?: number;
    rateSource?: FxSource;
    reference?: string;
  }[],
  rateUsed?: number,
  rateSource: FxSource = "paralelo"
) {
  try {
    const { user } = await requireAuth();
    const resolvedUserId = user.id;
    const fallbackRate = await getTransactionRate(
      rateSource === "bcv" ? "bcv" : "paralelo"
    );
    const resolvedRateUsed = normalizeTransactionRate(
      rateSource,
      rateUsed || fallbackRate,
      fallbackRate
    );

    await runInTx(async (tx: any) => {
      const [quoteRecord] = await tx
        .select()
        .from(quotes)
        .where(eq(quotes.id, quoteId))
        .limit(1);
      if (!quoteRecord) throw new Error("Cotización no encontrada");
      if (quoteRecord.status !== "abierta")
        throw new Error("La cotización ya no está disponible para conversión");

      const qItems = await tx
        .select()
        .from(quoteItems)
        .where(eq(quoteItems.quoteId, quoteId));

      await assertStockAvailable(tx, qItems, `la cotización ${quoteRecord.number}`);

      const nextNeCount = await getNextCounterValue(
        tx,
        SETTINGS_KEYS.neCounter,
        SYSTEM_DEFAULTS.counters.ne
      );
      const docNumber = `NE-${String(nextNeCount).padStart(5, "0")}`;

      // Insert Sale
      const [saleRecord] = await tx
        .insert(sales)
        .values({
          number: docNumber,
          customerId: quoteRecord.customerId,
          date: new Date().toISOString().slice(0, 10),
          totalUsd: quoteRecord.totalUsd,
          totalBs: quoteRecord.totalUsd * resolvedRateUsed,
          rateUsed: resolvedRateUsed,
          rateSource,
          status: "pagada",
          userId: resolvedUserId,
        })
        .returning({ id: sales.id });

      // Move items & deduct stock
      for (const item of qItems) {
        await tx.insert(saleItems).values({
          saleId: saleRecord.id,
          skuId: item.skuId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        });

        // Deduct stock (guarded against negative stock)
        const convertStockDeduct = await tx
          .update(skus)
          .set({
            stock: sql`stock - ${item.quantity}`,
          })
          .where(and(eq(skus.id, item.skuId), gte(skus.stock, item.quantity)))
          .returning({ id: skus.id });
        if (convertStockDeduct.length === 0) {
          throw new Error(`Stock insuficiente para el SKU ${item.skuId} al convertir la cotización.`);
        }

        // Log adjustment
        await tx.insert(stockAdjustments).values({
          skuId: item.skuId,
          quantity: -item.quantity,
          reason: `Conversión Cotización ${quoteRecord.number} → Venta ${docNumber}`,
          userId: resolvedUserId,
        });
      }

      // Insert payments
      for (const pay of payments) {
        await tx.insert(salePayments).values({
          saleId: saleRecord.id,
          methodId: pay.methodId,
          amountUsd: pay.amountUsd,
          currency: (pay.currency || "USD").trim().toUpperCase(),
          amountOriginal: pay.amountOriginal ?? pay.amountUsd,
          rateUsed: pay.rateUsed ?? (isBolivarCurrency(pay.currency || "USD") ? resolvedRateUsed : 1),
          rateSource: pay.rateSource || (isBolivarCurrency(pay.currency || "USD") ? rateSource : "manual"),
          reference: pay.reference || "",
        });
      }

      // Update quote status
      await tx
        .update(quotes)
        .set({
          status: "convertida",
          convertedToSaleId: saleRecord.id,
        })
        .where(eq(quotes.id, quoteId));

      // Audit the resulting sale, flagging below-cost.
      const convSkuIds: number[] = Array.from(new Set(qItems.map((i: any) => i.skuId as number)));
      const convCostRows = convSkuIds.length > 0
        ? await tx.select({ id: skus.id, avgCost: skus.avgCost }).from(skus).where(inArray(skus.id, convSkuIds))
        : [];
      const convCostMap = new Map<number, number>(convCostRows.map((r: any) => [r.id, r.avgCost]));
      const convCogs = qItems.reduce((sum: number, it: any) => sum + it.quantity * (convCostMap.get(it.skuId) || 0), 0);
      const convBelowCost = convCogs > 0 && quoteRecord.totalUsd < convCogs - 0.01;
      await logAuditAction(
        {
          action: convBelowCost ? "VENTA_BAJO_COSTO" : "CREAR",
          entity: "sale",
          entityId: saleRecord.id.toString(),
          details: `Venta ${docNumber} (conversión ${quoteRecord.number}) · total $${quoteRecord.totalUsd.toFixed(2)}${convBelowCost ? ` · ⚠ por debajo del costo ($${convCogs.toFixed(2)})` : ""}`,
        },
        resolvedUserId
      );
    });

    await notifyAdminsNewSale();

    revalidatePath("/ventas");
    revalidatePath("/inventario");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al convertir cotización" };
  }
}

export async function anularQuoteAction(quoteId: number) {
  try {
    await requireAuth();
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1);
    if (!quote) {
      return { success: false, error: "Cotización no encontrada" };
    }
    if (quote.status !== "abierta") {
      return { success: false, error: "Solo se pueden anular cotizaciones abiertas." };
    }

    await db.update(quotes).set({ status: "anulada" }).where(eq(quotes.id, quoteId));

    revalidatePath("/ventas");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al anular cotización" };
  }
}

export async function deleteQuoteAction(quoteId: number) {
  try {
    const { user } = await requireStaff();
    const [q] = await db.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1);
    if (!q) return { success: false, error: "Cotización no encontrada" };
    if (q.status === "convertida") {
      return { success: false, error: "No se puede eliminar una cotización ya convertida en venta." };
    }
    await runInTx(async (tx: any) => {
      await tx.delete(quoteItems).where(eq(quoteItems.quoteId, quoteId));
      await tx.delete(quotes).where(eq(quotes.id, quoteId));
    });
    await logAuditAction(
      { action: "ELIMINAR", entity: "quote", entityId: quoteId.toString(), details: `Cotización ${q.number} eliminada` },
      user.id
    );
    revalidatePath("/ventas");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al eliminar cotización" };
  }
}

export async function voidSaleAction(saleId: number) {
  try {
    const { user } = await requireStaff();

    await runInTx(async (tx: any) => {
      const [sale] = await tx.select().from(sales).where(eq(sales.id, saleId)).limit(1);
      if (!sale) throw new Error("Venta no encontrada");
      if (sale.status === "anulada") throw new Error("La venta ya está anulada");

      // Block if the sale has active returns/exchanges — their stock/credit was
      // already restored, so voiding too would double-count.
      const saleReturns = await tx
        .select()
        .from(returns)
        .where(and(eq(returns.saleId, saleId), sql`${returns.status} != 'anulada'`));
      if (saleReturns.length > 0) {
        throw new Error(
          "No se puede anular: la venta tiene devoluciones/cambios asociados. Anule primero las devoluciones."
        );
      }

      const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, saleId));
      for (const item of items) {
        await tx
          .update(skus)
          .set({ stock: sql`stock + ${item.quantity}` })
          .where(eq(skus.id, item.skuId));
        await tx.insert(stockAdjustments).values({
          skuId: item.skuId,
          quantity: item.quantity,
          reason: `Anulación venta ${sale.number}`,
          userId: user.id,
        });
      }

      await tx.update(sales).set({ status: "anulada" }).where(eq(sales.id, saleId));
    });

    await logAuditAction(
      {
        action: "ANULAR",
        entity: "sale",
        entityId: saleId.toString(),
        details: `Venta ${saleId} anulada y stock repuesto`,
      },
      user.id
    );

    revalidatePath("/ventas");
    revalidatePath("/inventario");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al anular venta" };
  }
}

/* ============================================================
   CRM / Customers Actions (S6)
   ============================================================ */

export async function getCustomersDetailList() {
  await requireAuth();
  const allCustomers = await db.select().from(customers);
  const allSales = await db.select().from(sales);
  const allSaleItems = await db
    .select({
      saleId: saleItems.saleId,
      quantity: saleItems.quantity,
      unitPrice: saleItems.unitPrice,
      sizeName: sizes.name,
      colorCode: colors.code,
    })
    .from(saleItems)
    .innerJoin(skus, eq(saleItems.skuId, skus.id))
    .innerJoin(colors, eq(skus.colorId, colors.id))
    .leftJoin(sizes, eq(skus.sizeId, sizes.id));

  // Build maps
  const salesMap = new Map<number, any[]>();
  for (const s of allSales) {
    if (!s.customerId) continue;
    const list = salesMap.get(s.customerId) || [];
    list.push(s);
    salesMap.set(s.customerId, list);
  }

  const itemsMap = new Map<number, any[]>();
  for (const item of allSaleItems) {
    const list = itemsMap.get(item.saleId) || [];
    list.push(item);
    itemsMap.set(item.saleId, list);
  }

  const result = [];
  for (const c of allCustomers) {
    const cSales = salesMap.get(c.id) || [];
    
    // Sort sales by date desc
    cSales.sort((a, b) => b.date.localeCompare(a.date));

    let totalSpent = 0;
    const sizeCounts = new Map<string, number>();
    const colorCounts = new Map<string, number>();
    const uniqueSizes = new Set<string>();
    const historyList = [];

    for (const s of cSales) {
      totalSpent += s.totalUsd;
      const sItems = itemsMap.get(s.id) || [];
      const totalUnits = sItems.reduce((sum, item) => sum + item.quantity, 0);

      // Add to history
      historyList.push({
        number: s.number,
        date: s.date,
        quantityText: `${totalUnits} und`,
        totalUsd: s.totalUsd,
      });

      for (const item of sItems) {
        if (item.sizeName) {
          uniqueSizes.add(item.sizeName);
          sizeCounts.set(item.sizeName, (sizeCounts.get(item.sizeName) || 0) + item.quantity);
        }
        if (item.colorCode) {
          colorCounts.set(item.colorCode, (colorCounts.get(item.colorCode) || 0) + item.quantity);
        }
      }
    }

    // Find favorite size
    let favSize = "—";
    let maxSizeCount = 0;
    for (const [sz, count] of sizeCounts.entries()) {
      if (count > maxSizeCount) {
        maxSizeCount = count;
        favSize = sz;
      }
    }

    // Find favorite color
    let favColor = "—";
    let maxColorCount = 0;
    for (const [col, count] of colorCounts.entries()) {
      if (count > maxColorCount) {
        maxColorCount = count;
        favColor = col;
      }
    }

    result.push({
      id: c.id,
      name: c.name,
      phone: c.phone || "Sin registrar",
      notes: c.notes || "",
      creditBalance: c.creditBalance,
      pedidos: cSales.length,
      total: totalSpent,
      talla: favSize,
      colorFav: favColor,
      tallas: Array.from(uniqueSizes),
      hist: historyList.map(h => [h.number, h.date, h.quantityText, h.totalUsd]),
    });
  }
  return result;
}

export async function updateCustomerAction(id: number, name: string, phone: string, notes?: string) {
  try {
    await requireAuth();
    await db
      .update(customers)
      .set({
        name,
        phone,
        notes: notes || "",
      })
      .where(eq(customers.id, id));

    // Audit log
    await logAuditAction({
      action: "MODIFICAR",
      entity: "customer",
      entityId: id.toString(),
      details: `Cliente ID ${id} modificado (nuevo nombre: ${name}, nuevo teléfono: ${phone})`,
    });

    revalidatePath("/clientes");
    revalidatePath("/ventas");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al actualizar cliente" };
  }
}

export async function deleteCustomerAction(id: number) {
  try {
    await requireStaff();
    const [refSale] = await db.select({ id: sales.id }).from(sales).where(eq(sales.customerId, id)).limit(1);
    if (refSale) return { success: false, error: "No se puede eliminar: el cliente tiene ventas asociadas." };
    const [refQuote] = await db.select({ id: quotes.id }).from(quotes).where(eq(quotes.customerId, id)).limit(1);
    if (refQuote) return { success: false, error: "No se puede eliminar: el cliente tiene cotizaciones asociadas." };
    await db.delete(customers).where(eq(customers.id, id));
    revalidatePath("/clientes");
    revalidatePath("/ventas");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al eliminar cliente" };
  }
}

/* ============================================================
   Returns / Devoluciones Actions (S6)
   ============================================================ */

export async function getReturnsData() {
  await requireAuth();
  const allReturns = await db.select().from(returns);
  const allSales = await db.select().from(sales);
  const allCustomers = await db.select().from(customers);
  const allReplacementSkus = await db.select().from(skus);
  
  const salesMap = new Map<number, any>(allSales.map((s: any) => [s.id, s]));
  const customersMap = new Map<number, any>(allCustomers.map((c: any) => [c.id, c]));
  const skuMap = new Map<number, any>(allReplacementSkus.map((sku: any) => [sku.id, sku]));
  const returnItemRows = await db.select().from(returnItems);
  const returnItemsMap = new Map<number, any[]>();
  for (const item of returnItemRows as any[]) {
    const list = returnItemsMap.get(item.returnId) || [];
    list.push(item);
    returnItemsMap.set(item.returnId, list);
  }

  return allReturns.map((r: any) => {
    const sale = salesMap.get(r.saleId);
    const customer = sale?.customerId ? customersMap.get(sale.customerId) : null;
    const items = returnItemsMap.get(r.id) || [];
    const replacementSummary = items
      .filter((item: any) => item.replacementSkuId && item.replacementQuantity > 0)
      .map((item: any) => {
        const replacementSku = skuMap.get(item.replacementSkuId);
        return `${replacementSku?.compositeCode || `SKU ${item.replacementSkuId}`} x${item.replacementQuantity}`;
      });

    return {
      id: r.id,
      ref: r.reference,
      saleId: r.saleId,
      venta: sale?.number || "Desconocido",
      cliente: customer?.name || "Venta anónima",
      tipo: r.type === "cambio" ? "Cambio" : "Devolución",
      motivo: r.reason,
      estado: r.status === "procesada" ? "Procesada" : r.status === "pendiente" ? "Pendiente" : "Anulada",
      rawStatus: r.status,
      resolution: replacementSummary.length > 0
        ? `${r.resolution || ""} · Reemplazo: ${replacementSummary.join(", ")}`
        : (r.resolution || ""),
    };
  }).reverse();
}

export async function createReturnAction(data: {
  saleId: number;
  type: "devolucion" | "cambio";
  reason: string;
  items: { skuId: number; quantity: number; unitPrice: number }[];
  replacements?: { originalSkuId: number; replacementSkuId: number; quantity: number }[];
  resolution?: string;
  addCredit?: boolean;
}) {
  try {
    const { user } = await requireAuth();
    const userId = user.id;
    await assertReturnQuantitiesAvailable(db, data.saleId, data.items);

    const replacements = (data.replacements || []).filter((item) => item.quantity > 0);
    if (data.type === "cambio") {
      if (replacements.length === 0) {
        throw new Error("Debes indicar al menos una prenda de reemplazo para completar el cambio.");
      }

      const requestedByOriginal = aggregateQuantitiesBySku(data.items);
      const replacementByOriginal = new Map<number, number>();
      for (const replacement of replacements) {
        replacementByOriginal.set(
          replacement.originalSkuId,
          (replacementByOriginal.get(replacement.originalSkuId) || 0) + replacement.quantity
        );
      }

      for (const [originalSkuId, requestedQty] of requestedByOriginal.entries()) {
        const replacementQty = replacementByOriginal.get(originalSkuId) || 0;
        if (replacementQty <= 0) {
          throw new Error(`Debes seleccionar una prenda de reemplazo para el SKU ${originalSkuId}.`);
        }
        if (replacementQty > requestedQty) {
          throw new Error(`El reemplazo del SKU ${originalSkuId} no puede exceder la cantidad devuelta.`);
        }
      }

      await assertReplacementStockAvailable(
        db,
        replacements.map((item) => ({
          replacementSkuId: item.replacementSkuId,
          quantity: item.quantity,
        }))
      );
    }

    let docNumber = "";
    await runInTx(async (tx: any) => {
      const nextDvCount = await getNextCounterValue(
        tx,
        SETTINGS_KEYS.returnCounter,
        SYSTEM_DEFAULTS.counters.return
      );
      docNumber = `DV-${String(nextDvCount).padStart(4, "0")}`;

      // 2. Insert Return Record
      const [returnRecord] = await tx
        .insert(returns)
        .values({
          reference: docNumber,
          saleId: data.saleId,
          type: data.type,
          reason: data.reason,
          status: "procesada",
          resolution: data.resolution || (data.type === "devolucion" ? "Nota de crédito" : "Cambio de prenda"),
          userId,
        })
        .returning({ id: returns.id });

      let totalRefundAmount = 0;

      // 3. Process items & rollback stock
      for (const item of data.items) {
        const replacementForItem = replacements.find((replacement) => replacement.originalSkuId === item.skuId);
        await tx.insert(returnItems).values({
          returnId: returnRecord.id,
          skuId: item.skuId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          replacementSkuId: replacementForItem?.replacementSkuId || null,
          replacementQuantity: replacementForItem?.quantity || 0,
        });

        // Rollback stock (add back returned items)
        await tx
          .update(skus)
          .set({
            stock: sql`stock + ${item.quantity}`,
          })
          .where(eq(skus.id, item.skuId));

        // Log stock adjustment (kardex)
        await tx.insert(stockAdjustments).values({
          skuId: item.skuId,
          quantity: item.quantity,
          reason: `Retorno por Devolución ${docNumber}`,
          userId,
        });

        if (replacementForItem && replacementForItem.quantity > 0) {
          const replacementDeduct = await tx
            .update(skus)
            .set({
              stock: sql`stock - ${replacementForItem.quantity}`,
            })
            .where(and(eq(skus.id, replacementForItem.replacementSkuId), gte(skus.stock, replacementForItem.quantity)))
            .returning({ id: skus.id });
          if (replacementDeduct.length === 0) {
            throw new Error(`Stock insuficiente para el SKU de cambio ${replacementForItem.replacementSkuId}.`);
          }

          await tx.insert(stockAdjustments).values({
            skuId: replacementForItem.replacementSkuId,
            quantity: -replacementForItem.quantity,
            reason: `Salida por Cambio ${docNumber}`,
            userId,
          });
        }

        totalRefundAmount += item.quantity * item.unitPrice;
      }

      // 4. Update customer credit balance if requested
      if (data.type === "devolucion" && data.addCredit && totalRefundAmount > 0) {
        const [saleRecord] = await tx
          .select()
          .from(sales)
          .where(eq(sales.id, data.saleId))
          .limit(1);
        if (saleRecord?.customerId) {
          await tx
            .update(customers)
            .set({
              creditBalance: sql`credit_balance + ${totalRefundAmount}`,
            })
            .where(eq(customers.id, saleRecord.customerId));
        }
      }

      // Audit log
      await logAuditAction({
        action: "CREAR",
        entity: "return",
        entityId: returnRecord.id.toString(),
        details: `Devolución/Cambio ${docNumber} (${data.type}) creado para Venta ID: ${data.saleId} por motivo: ${data.reason}`,
      }, user.id);
    });

    revalidatePath("/devoluciones");
    revalidatePath("/clientes");
    revalidatePath("/inventario");
    revalidatePath("/");
    return { success: true, reference: docNumber };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al registrar devolución" };
  }
}

export async function anularReturnAction(returnId: number) {
  try {
    const { user } = await requireStaff();
    await runInTx(async (tx: any) => {
      const [ret] = await tx.select().from(returns).where(eq(returns.id, returnId)).limit(1);
      if (!ret) throw new Error("Devolución no encontrada");
      if (ret.status === "anulada") throw new Error("La devolución ya está anulada");

      const items = await tx.select().from(returnItems).where(eq(returnItems.returnId, returnId));
      let totalRefund = 0;
      for (const it of items) {
        // Reverse the stock that the return re-added.
        const dec = await tx
          .update(skus)
          .set({ stock: sql`stock - ${it.quantity}` })
          .where(and(eq(skus.id, it.skuId), gte(skus.stock, it.quantity)))
          .returning({ id: skus.id });
        if (dec.length === 0) {
          throw new Error(`No se puede anular: stock insuficiente para revertir el SKU ${it.skuId} (posiblemente ya se vendió).`);
        }
        await tx.insert(stockAdjustments).values({
          skuId: it.skuId,
          quantity: -it.quantity,
          reason: `Anulación devolución ${ret.reference}`,
          userId: user.id,
        });

        // Give back any replacement stock the exchange deducted.
        if (it.replacementSkuId && (it.replacementQuantity || 0) > 0) {
          await tx.update(skus).set({ stock: sql`stock + ${it.replacementQuantity}` }).where(eq(skus.id, it.replacementSkuId));
          await tx.insert(stockAdjustments).values({
            skuId: it.replacementSkuId,
            quantity: it.replacementQuantity,
            reason: `Anulación cambio ${ret.reference}`,
            userId: user.id,
          });
        }
        totalRefund += it.quantity * it.unitPrice;
      }

      // Reverse customer store credit granted by a devolución (floored at 0).
      if (ret.type === "devolucion" && totalRefund > 0) {
        const [sale] = await tx.select().from(sales).where(eq(sales.id, ret.saleId)).limit(1);
        if (sale?.customerId) {
          await tx
            .update(customers)
            .set({ creditBalance: sql`MAX(0, ${customers.creditBalance} - ${totalRefund})` })
            .where(eq(customers.id, sale.customerId));
        }
      }

      await tx.update(returns).set({ status: "anulada" }).where(eq(returns.id, returnId));
    });

    await logAuditAction(
      { action: "ANULAR", entity: "return", entityId: returnId.toString(), details: "Devolución anulada y stock revertido" },
      user.id
    );
    revalidatePath("/devoluciones");
    revalidatePath("/clientes");
    revalidatePath("/inventario");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al anular devolución" };
  }
}

/* ============================================================
   Consignments / Consignación Actions (S7)
   ============================================================ */

export async function getConsigneesData() {
  await requireAuth();
  const [allConsignees, allLots, allItems] = await Promise.all([
    db.select().from(consignees),
    db.select().from(consignmentLots),
    db.select().from(consignmentItems),
  ]);
  const lotsByConsignee = new Map<number, any[]>();
  const itemsByLot = new Map<number, any[]>();

  for (const lot of allLots as any[]) {
    const list = lotsByConsignee.get(lot.consigneeId) || [];
    list.push(lot);
    lotsByConsignee.set(lot.consigneeId, list);
  }

  for (const item of allItems as any[]) {
    const list = itemsByLot.get(item.lotId) || [];
    list.push(item);
    itemsByLot.set(item.lotId, list);
  }

  const result = [];
  for (const c of allConsignees) {
    const cLots = lotsByConsignee.get(c.id) || [];
    
    let totalEntregados = 0;
    let totalVendidos = 0;
    let totalDeuda = 0;
    let totalPorVender = 0;
    
    // Determine overall status based on lots
    let activeStatus = "sin_lotes";
    const hasLots = cLots.length > 0;
    const computedLots = [];
    
    for (const lot of cLots) {
      const lotItems = itemsByLot.get(lot.id) || [];
      const metrics = calculateConsignmentLotMetrics(lot, lotItems);

      totalEntregados += metrics.deliveredUnits;
      totalVendidos += metrics.liquidatedUnits;
      totalDeuda += metrics.debtUsd;
      totalPorVender += metrics.remainingUnits;
      computedLots.push({
        ...lot,
        ...metrics,
      });
    }

    if (hasLots) {
      if (computedLots.some((lot) => lot.status === "pendiente")) {
        activeStatus = "pendiente";
      } else if (computedLots.some((lot) => lot.status === "pago_parcial")) {
        activeStatus = "pago_parcial";
      } else if (computedLots.some((lot) => lot.status === "liquidado")) {
        activeStatus = "liquidado";
      } else if (computedLots.every((lot) => lot.status === "devuelto")) {
        activeStatus = "devuelto";
      }
    }

    result.push({
      id: c.id,
      name: c.name,
      ubicacion: c.location || "Sin ubicación",
      contact: c.contact || "Sin contacto",
      entregados: totalEntregados,
      vendidos: totalVendidos,
      deuda: totalDeuda,
      porVender: totalPorVender,
      estado: hasLots ? activeStatus : "sin_lotes",
      lots: computedLots,
    });
  }
  return result;
}

export async function getConsignmentLotDetailAction(lotId: number) {
  await requireStaff();
  const snapshot = await getConsignmentLotSnapshot(db, lotId);

  return {
    id: snapshot.lot.id,
    date: snapshot.lot.date,
    status: snapshot.status,
    paidUsd: snapshot.lot.paidUsd,
    deliveredValue: snapshot.deliveredValue,
    liquidatedValue: snapshot.liquidatedValue,
    returnedValue: snapshot.returnedValue,
    debtUsd: snapshot.debtUsd,
    deliveredUnits: snapshot.deliveredUnits,
    liquidatedUnits: snapshot.liquidatedUnits,
    returnedUnits: snapshot.returnedUnits,
    remainingUnits: snapshot.remainingUnits,
    items: snapshot.items.map((item: any) => ({
      id: item.id,
      skuId: item.skuId,
      code: item.compositeCode,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      liquidatedQuantity: item.liquidatedQuantity || 0,
      returnedQuantity: item.returnedQuantity || 0,
      remainingQuantity: getConsignmentItemRemaining(item),
    })),
  };
}

export async function createConsigneeAction(name: string, contact: string, location: string) {
  try {
    await requireStaff();
    await db.insert(consignees).values({
      name,
      contact,
      location,
    });
    revalidatePath("/consignacion");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al crear consignataria" };
  }
}

export async function updateConsigneeAction(id: number, name: string, contact: string, location: string) {
  try {
    await requireStaff();
    await db.update(consignees).set({ name, contact, location }).where(eq(consignees.id, id));
    revalidatePath("/consignacion");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al actualizar consignataria" };
  }
}

export async function deleteConsigneeAction(id: number) {
  try {
    await requireStaff();
    const [ref] = await db.select({ id: consignmentLots.id }).from(consignmentLots).where(eq(consignmentLots.consigneeId, id)).limit(1);
    if (ref) return { success: false, error: "No se puede eliminar: la consignataria tiene lotes asociados." };
    await db.delete(consignees).where(eq(consignees.id, id));
    revalidatePath("/consignacion");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al eliminar consignataria" };
  }
}

export async function createConsignmentLotAction(data: {
  consigneeId: number;
  date: string;
  items: { skuId: number; quantity: number; unitPrice: number }[];
}): Promise<{ success: true; lotId: number | null } | { success: false; error: string }> {
  try {
    const { user } = await requireStaff();
    const userId = user.id;

    let createdLotId: number | null = null;
    await runInTx(async (tx: any) => {
      // 1. Calculate lot total value
      const totalUsd = data.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      await assertStockAvailable(tx, data.items, "la consignación");

      // 2. Insert Lot Record
      const [lotRecord] = await tx
        .insert(consignmentLots)
        .values({
          consigneeId: data.consigneeId,
          date: data.date,
          status: "pendiente",
          totalUsd,
          paidUsd: 0,
        })
        .returning({ id: consignmentLots.id });
      createdLotId = lotRecord.id;

      // 3. Process items & deduct stock
      for (const item of data.items) {
        await tx.insert(consignmentItems).values({
          lotId: lotRecord.id,
          skuId: item.skuId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          liquidatedQuantity: 0,
          returnedQuantity: 0,
        });

        // Deduct stock from main inventory (guarded against negative stock)
        const consignStockDeduct = await tx
          .update(skus)
          .set({
            stock: sql`stock - ${item.quantity}`,
          })
          .where(and(eq(skus.id, item.skuId), gte(skus.stock, item.quantity)))
          .returning({ id: skus.id });
        if (consignStockDeduct.length === 0) {
          throw new Error(`Stock insuficiente para el SKU ${item.skuId} en la consignación.`);
        }

        // Log stock adjustment (kardex)
        await tx.insert(stockAdjustments).values({
          skuId: item.skuId,
          quantity: -item.quantity,
          reason: `Salida por Consignación Lote Nº ${lotRecord.id}`,
          userId,
        });
      }
    });

    revalidatePath("/consignacion");
    revalidatePath("/inventario");
    revalidatePath("/");
    return { success: true, lotId: createdLotId };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al registrar lote de consignación" };
  }
}

export async function liquidateConsignmentItemsAction(data: {
  lotId: number;
  items: { consignmentItemId: number; quantity: number }[];
}) {
  try {
    await requireStaff();
    const validItems = data.items.filter((item) => item.quantity > 0);
    if (validItems.length === 0) {
      throw new Error("Debes indicar al menos una unidad liquidada.");
    }

    await runInTx(async (tx: any) => {
      const snapshot = await getConsignmentLotSnapshot(tx, data.lotId);
      const itemsById = new Map<number, any>(snapshot.items.map((item: any) => [item.id, item]));

      for (const item of validItems) {
        const existingItem = itemsById.get(item.consignmentItemId);
        if (!existingItem) {
          throw new Error("Ítem de consignación no encontrado.");
        }

        const remaining = getConsignmentItemRemaining(existingItem);
        if (item.quantity > remaining) {
          throw new Error(`No puedes liquidar más de ${remaining} unidad(es) de ${existingItem.compositeCode}.`);
        }

        await tx
          .update(consignmentItems)
          .set({
            liquidatedQuantity: sql`${consignmentItems.liquidatedQuantity} + ${item.quantity}`,
          })
          .where(eq(consignmentItems.id, item.consignmentItemId));
      }

      await syncConsignmentLotStatus(tx, data.lotId);
    });

    revalidatePath("/consignacion");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al liquidar unidades de consignación" };
  }
}

export async function returnConsignmentItemsAction(data: {
  lotId: number;
  items: { consignmentItemId: number; quantity: number }[];
}) {
  try {
    const { user } = await requireStaff();
    const validItems = data.items.filter((item) => item.quantity > 0);
    if (validItems.length === 0) {
      throw new Error("Debes indicar al menos una unidad a devolver.");
    }

    await runInTx(async (tx: any) => {
      const snapshot = await getConsignmentLotSnapshot(tx, data.lotId);
      const itemsById = new Map<number, any>(snapshot.items.map((item: any) => [item.id, item]));

      for (const item of validItems) {
        const existingItem = itemsById.get(item.consignmentItemId);
        if (!existingItem) {
          throw new Error("Ítem de consignación no encontrado.");
        }

        const remaining = getConsignmentItemRemaining(existingItem);
        if (item.quantity > remaining) {
          throw new Error(`No puedes devolver más de ${remaining} unidad(es) de ${existingItem.compositeCode}.`);
        }

        await tx
          .update(consignmentItems)
          .set({
            returnedQuantity: sql`${consignmentItems.returnedQuantity} + ${item.quantity}`,
          })
          .where(eq(consignmentItems.id, item.consignmentItemId));

        await tx
          .update(skus)
          .set({
            stock: sql`stock + ${item.quantity}`,
          })
          .where(eq(skus.id, existingItem.skuId));

        await tx.insert(stockAdjustments).values({
          skuId: existingItem.skuId,
          quantity: item.quantity,
          reason: `Retorno por devolución de consignación Lote Nº ${data.lotId}`,
          userId: user.id,
        });
      }

      await syncConsignmentLotStatus(tx, data.lotId);
    });

    revalidatePath("/consignacion");
    revalidatePath("/inventario");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al devolver unidades en consignación" };
  }
}

export async function deleteConsignmentLotAction(lotId: number) {
  try {
    const { user } = await requireStaff();
    await runInTx(async (tx: any) => {
      const [lot] = await tx.select().from(consignmentLots).where(eq(consignmentLots.id, lotId)).limit(1);
      if (!lot) throw new Error("Lote no encontrado");
      const [pay] = await tx.select().from(consignmentPayments).where(eq(consignmentPayments.lotId, lotId)).limit(1);
      if (pay || lot.paidUsd > 0) throw new Error("No se puede eliminar: el lote tiene abonos registrados.");

      const items = await tx.select().from(consignmentItems).where(eq(consignmentItems.lotId, lotId));
      const hasActivity = items.some((i: any) => (i.liquidatedQuantity || 0) > 0 || (i.returnedQuantity || 0) > 0);
      if (hasActivity) {
        throw new Error("No se puede eliminar: el lote ya tiene liquidaciones o devoluciones registradas.");
      }

      // Lot creation deducted stock — reincorporate it.
      for (const it of items) {
        await tx.update(skus).set({ stock: sql`stock + ${it.quantity}` }).where(eq(skus.id, it.skuId));
        await tx.insert(stockAdjustments).values({
          skuId: it.skuId,
          quantity: it.quantity,
          reason: `Eliminación lote consignación #${lotId}`,
          userId: user.id,
        });
      }
      await tx.delete(consignmentItems).where(eq(consignmentItems.lotId, lotId));
      await tx.delete(consignmentLots).where(eq(consignmentLots.id, lotId));
    });

    await logAuditAction(
      { action: "ELIMINAR", entity: "consignment_lot", entityId: lotId.toString(), details: "Lote de consignación eliminado y stock reincorporado" },
      user.id
    );
    revalidatePath("/consignacion");
    revalidatePath("/inventario");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al eliminar lote de consignación" };
  }
}

export async function addConsignmentPaymentAction(data: {
  lotId: number;
  methodId: number;
  amountUsd: number;
  currency?: string;
  amountOriginal?: number;
  rateUsed?: number;
  rateSource?: FxSource;
  reference?: string;
}) {
  try {
    await requireStaff();
    const today = new Date().toISOString().slice(0, 10);

    // Symmetric Bolívar handling with sales/expenses: if paid in Bs, derive the
    // USD-equivalent from the original amount and the per-transaction rate.
    const currency = (data.currency || "USD").trim().toUpperCase();
    const originalAmount = data.amountOriginal ?? data.amountUsd;
    const fallbackRate = await getTransactionRate(data.rateSource === "bcv" ? "bcv" : "paralelo");
    const resolvedRateUsed = isBolivarCurrency(currency)
      ? normalizeTransactionRate(data.rateSource || "paralelo", data.rateUsed || fallbackRate, fallbackRate)
      : 1;
    const resolvedAmountUsd = isBolivarCurrency(currency)
      ? convertToUsd(originalAmount, currency, resolvedRateUsed)
      : data.amountUsd;

    await runInTx(async (tx: any) => {
      const snapshotBeforePayment = await getConsignmentLotSnapshot(tx, data.lotId);
      if (snapshotBeforePayment.debtUsd <= 0) {
        throw new Error("No hay saldo liquidado pendiente por abonar en este lote.");
      }
      if (resolvedAmountUsd > snapshotBeforePayment.debtUsd + 0.01) {
        throw new Error(
          `El abono excede el saldo pendiente del lote. Máximo permitido: ${snapshotBeforePayment.debtUsd.toFixed(2)} USD.`
        );
      }

      // 1. Insert Payment
      await tx.insert(consignmentPayments).values({
        lotId: data.lotId,
        methodId: data.methodId,
        amountUsd: resolvedAmountUsd,
        currency,
        amountOriginal: originalAmount,
        rateUsed: resolvedRateUsed,
        rateSource: isBolivarCurrency(currency) ? (data.rateSource || "paralelo") : "manual",
        date: today,
        reference: data.reference || "",
      });

      // 2. Update paid amount and recompute status from liquidated units
      await tx
        .update(consignmentLots)
        .set({
          paidUsd: sql`${consignmentLots.paidUsd} + ${resolvedAmountUsd}`,
        })
        .where(eq(consignmentLots.id, data.lotId));

      await syncConsignmentLotStatus(tx, data.lotId);
    });

    revalidatePath("/consignacion");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al abonar pago" };
  }
}

/* ============================================================
   Expenses / Gastos Actions (S8)
   ============================================================ */

export async function getExpensesData() {
  await requireStaff();
  const allExpenses = await db.select().from(expenses);
  const allCategories = await db.select().from(categories).where(eq(categories.type, "expense"));

  const categoriesMap = new Map<number, string>(allCategories.map((c: any) => [c.id, c.name]));

  // Calculate totals and percentages
  const total = allExpenses.reduce((sum: number, e: any) => sum + e.amountUsd, 0);

  const catTotals = new Map<string, number>();
  for (const e of allExpenses) {
    const catName = e.categoryId ? (categoriesMap.get(e.categoryId) || "Otros") : "Otros";
    catTotals.set(catName, (catTotals.get(catName) || 0) + e.amountUsd);
  }

  const breakdown = Array.from(catTotals.entries()).map(([name, val]) => {
    return {
      name,
      total: val,
      pct: total > 0 ? (val / total) * 100 : 0,
    };
  }).sort((a, b) => b.total - a.total);

  const formattedExpenses = allExpenses.map((e: any) => {
    return {
      id: e.id,
      fecha: e.date,
      nota: e.note,
      cat: e.categoryId ? (categoriesMap.get(e.categoryId) || "Otros") : "Otros",
      monto: e.amountUsd,
      moneda: e.currency,
      montoOriginal: e.amountOriginal,
      tasa: e.rateUsed,
      fuenteTasa: e.rateSource || "manual",
    };
  }).reverse();

  const result = {
    expensesList: formattedExpenses,
    categoriesBreakdown: breakdown,
    totalExpenses: total,
    expenseCategories: allCategories,
  };
  return result;
}

export async function createExpenseAction(data: {
  date: string;
  note: string;
  categoryId: number;
  amountUsd: number;
  currency?: string;
  amountOriginal?: number;
  rateUsed?: number;
  rateSource?: FxSource;
}) {
  try {
    await requireStaff();
    const currency = (data.currency || "USD").trim().toUpperCase();
    const originalAmount = data.amountOriginal ?? data.amountUsd;
    const fallbackRate = await getTransactionRate(
      data.rateSource === "bcv" ? "bcv" : "paralelo"
    );
    const resolvedRateUsed = isBolivarCurrency(currency)
      ? normalizeTransactionRate(
          data.rateSource || "paralelo",
          data.rateUsed || fallbackRate,
          fallbackRate
        )
      : 1;
    const resolvedAmountUsd = isBolivarCurrency(currency)
      ? convertToUsd(originalAmount, currency, resolvedRateUsed)
      : data.amountUsd;

    await db.insert(expenses).values({
      date: data.date,
      note: data.note,
      categoryId: data.categoryId,
      amountUsd: resolvedAmountUsd,
      currency,
      amountOriginal: originalAmount,
      rateUsed: resolvedRateUsed,
      rateSource: isBolivarCurrency(currency) ? (data.rateSource || "paralelo") : "manual",
    });

    revalidatePath("/gastos");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al registrar gasto" };
  }
}

export async function deleteExpenseAction(id: number) {
  try {
    const { user } = await requireStaff();
    const [existing] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
    if (!existing) {
      return { success: false, error: "Gasto no encontrado" };
    }

    await db.delete(expenses).where(eq(expenses.id, id));

    await logAuditAction(
      {
        action: "ELIMINAR",
        entity: "expense",
        entityId: id.toString(),
        details: `Gasto eliminado: ${existing.note} (USD ${existing.amountUsd.toFixed(2)})`,
      },
      user.id
    );

    revalidatePath("/gastos");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al eliminar gasto" };
  }
}

export async function updateExpenseAction(data: {
  id: number;
  date: string;
  note: string;
  categoryId: number;
  amountUsd: number;
  currency?: string;
  amountOriginal?: number;
  rateUsed?: number;
  rateSource?: FxSource;
}) {
  try {
    await requireStaff();
    const currency = (data.currency || "USD").trim().toUpperCase();
    const originalAmount = data.amountOriginal ?? data.amountUsd;
    const fallbackRate = await getTransactionRate(data.rateSource === "bcv" ? "bcv" : "paralelo");
    const resolvedRateUsed = isBolivarCurrency(currency)
      ? normalizeTransactionRate(data.rateSource || "paralelo", data.rateUsed || fallbackRate, fallbackRate)
      : 1;
    const resolvedAmountUsd = isBolivarCurrency(currency)
      ? convertToUsd(originalAmount, currency, resolvedRateUsed)
      : data.amountUsd;

    await db
      .update(expenses)
      .set({
        date: data.date,
        note: data.note,
        categoryId: data.categoryId,
        amountUsd: resolvedAmountUsd,
        currency,
        amountOriginal: originalAmount,
        rateUsed: resolvedRateUsed,
        rateSource: isBolivarCurrency(currency) ? (data.rateSource || "paralelo") : "manual",
      })
      .where(eq(expenses.id, data.id));

    revalidatePath("/gastos");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al actualizar gasto" };
  }
}

/* ============================================================
   Shipments / Despachos Actions (S8)
   ============================================================ */

export async function getShipmentsData() {
  await requireAuth();
  const allShipments = await db.select().from(shipments);
  const allSales = await db.select().from(sales);
  const allCarriers = await db.select().from(carriers);

  const salesMap = new Map<number, any>(allSales.map((s: any) => [s.id, s]));
  const carriersMap = new Map<number, any>(allCarriers.map((c: any) => [c.id, c]));

  const result = allShipments.map((s: any) => {
    const sale = salesMap.get(s.saleId);
    const carrier = carriersMap.get(s.carrierId);
    return {
      id: s.id,
      guia: s.trackingNumber,
      saleId: s.saleId,
      venta: sale?.number || "Desconocido",
      transp: carrier?.name || "Principal",
      destino: s.destination,
      costo: s.costUsd,
      estado: s.status === "pendiente" ? "Pendiente" : s.status === "despachado" ? "Despachado" : "Entregado",
      rawStatus: s.status,
    };
  }).reverse();
  return result;
}

export async function createShipmentAction(data: {
  trackingNumber: string;
  saleId: number;
  carrierId: number;
  destination: string;
  costUsd: number;
  status: "pendiente" | "despachado" | "entregado";
}) {
  try {
    await requireAuth();
    await db.insert(shipments).values({
      trackingNumber: data.trackingNumber,
      saleId: data.saleId,
      carrierId: data.carrierId,
      destination: data.destination,
      costUsd: data.costUsd,
      status: data.status,
    });

    revalidatePath("/despachos");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al registrar despacho" };
  }
}

export async function updateShipmentStatusAction(id: number, status: "pendiente" | "despachado" | "entregado") {
  try {
    await requireAuth();
    await db
      .update(shipments)
      .set({ status })
      .where(eq(shipments.id, id));

    revalidatePath("/despachos");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al actualizar estado del despacho" };
  }
}

export async function deleteShipmentAction(id: number) {
  try {
    const { user } = await requireStaff();
    const [s] = await db.select().from(shipments).where(eq(shipments.id, id)).limit(1);
    if (!s) return { success: false, error: "Despacho no encontrado" };
    await db.delete(shipments).where(eq(shipments.id, id));
    await logAuditAction(
      { action: "ELIMINAR", entity: "shipment", entityId: id.toString(), details: `Despacho ${s.trackingNumber} eliminado` },
      user.id
    );
    revalidatePath("/despachos");
    revalidatePath("/");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Error al eliminar despacho" };
  }
}

export async function getSaleItemsAction(saleId: number) {
  try {
    await requireAuth();
    return await db
      .select({
        id: saleItems.id,
        skuId: saleItems.skuId,
        quantity: saleItems.quantity,
        unitPrice: saleItems.unitPrice,
        compositeCode: skus.compositeCode,
      })
      .from(saleItems)
      .innerJoin(skus, eq(saleItems.skuId, skus.id))
      .where(eq(saleItems.saleId, saleId));
  } catch (e: any) {
    console.error(e);
    return [];
  }
}

export async function getDashboardData() {
  const { user } = await requireAuth();
  // The "usuario" role has no access to dashboard metrics.
  if (user.role === "usuario") return null;
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const startOfMonth = `${year}-${month}-01`;

    const [allSales, allExpenses, allQuotes, allReturns, allShipments, allLots, allPaymentMethods, inventoryAggRows] = await Promise.all([
      db.select().from(sales).where(and(gte(sales.date, startOfMonth), ne(sales.status, "anulada"))),
      db.select().from(expenses).where(gte(expenses.date, startOfMonth)),
      db.select().from(quotes).where(gte(quotes.date, startOfMonth)),
      db.select().from(returns).where(gte(returns.createdAt, startOfMonth)),
      db.select().from(shipments).where(eq(shipments.status, "pendiente")),
      db.select().from(consignmentLots).where(or(eq(consignmentLots.status, "pendiente"), eq(consignmentLots.status, "pago_parcial"))),
      db.select().from(paymentMethods),
      // Inventory valuation (cost), units in stock, value at sale price, and
      // zero-stock count — all computed in SQL (one row).
      db
        .select({
          valuation: sql<number>`COALESCE(SUM(${skus.stock} * ${skus.avgCost}), 0)`,
          units: sql<number>`COALESCE(SUM(${skus.stock}), 0)`,
          retail: sql<number>`COALESCE(SUM(${skus.stock} * COALESCE(${skus.priceOverride}, ${models.basePrice})), 0)`,
          zeroCount: sql<number>`COALESCE(SUM(CASE WHEN ${skus.stock} <= 0 THEN 1 ELSE 0 END), 0)`,
        })
        .from(skus)
        .innerJoin(models, eq(skus.modelId, models.id)),
    ]);

    const inventoryValuation = Number(inventoryAggRows[0]?.valuation || 0);
    const inventoryUnits = Number(inventoryAggRows[0]?.units || 0);
    const inventoryRetail = Number(inventoryAggRows[0]?.retail || 0);
    const inventoryPotentialMargin = inventoryRetail - inventoryValuation;
    const skusCeroCount = Number(inventoryAggRows[0]?.zeroCount || 0);

    const activeLotIds = allLots.map((l: any) => l.id);
    const allItems = activeLotIds.length > 0
      ? await db.select().from(consignmentItems).where(inArray(consignmentItems.lotId, activeLotIds))
      : [];

    // Filter sale payments and items to the current month's sales
    const monthlySaleIds = allSales.map((s: any) => s.id);
    const allSalePayments = monthlySaleIds.length > 0
      ? await db.select().from(salePayments).where(inArray(salePayments.saleId, monthlySaleIds))
      : [];
    const allSaleItems = monthlySaleIds.length > 0
      ? await db.select().from(saleItems).where(inArray(saleItems.saleId, monthlySaleIds))
      : [];

    // Only load the SKUs (with model name) actually referenced by this month's
    // sale items — for COGS and top-products — instead of the whole catalog.
    const saleItemSkuIds: number[] = Array.from(new Set(allSaleItems.map((i: any) => i.skuId as number)));
    const cogsRows = saleItemSkuIds.length > 0
      ? await db
          .select({ id: skus.id, avgCost: skus.avgCost, modelId: skus.modelId, modelName: models.name })
          .from(skus)
          .innerJoin(models, eq(skus.modelId, models.id))
          .where(inArray(skus.id, saleItemSkuIds))
      : [];
    const skusMap = new Map<number, any>(cogsRows.map((s: any) => [s.id, s]));

    // Lowest-stock SKUs, bounded in SQL using the configured threshold.
    const lowSkusRows = await db
      .select({ compositeCode: skus.compositeCode, stock: skus.stock, modelName: models.name })
      .from(skus)
      .innerJoin(models, eq(skus.modelId, models.id))
      .where(lte(skus.stock, models.lowStockThreshold))
      .orderBy(skus.stock)
      .limit(5);

    const payMethodsMap = new Map<number, any>(allPaymentMethods.map((pm: any) => [pm.id, pm]));
    const itemsByLot = new Map<number, any[]>();
    for (const item of allItems as any[]) {
      const list = itemsByLot.get(item.lotId) || [];
      list.push(item);
      itemsByLot.set(item.lotId, list);
    }

    // KPIs
    const totalVentasUsd = allSales.reduce((sum: number, s: any) => sum + s.totalUsd, 0);
    const totalVentasCount = allSales.length;

    const totalGastosUsd = allExpenses.reduce((sum: number, e: any) => sum + e.amountUsd, 0);

    // Deuda + ingresos liquidados de consignación (lotes activos).
    let totalDeudaCons = 0;
    let totalConsignLiquidatedUsd = 0;
    for (const lot of allLots) {
      const lotItems = itemsByLot.get(lot.id) || [];
      const metrics = calculateConsignmentLotMetrics(lot, lotItems);
      totalDeudaCons += metrics.debtUsd;
      totalConsignLiquidatedUsd += metrics.liquidatedValue;
    }

    // Cost of Goods Sold (COGS)
    let totalCogs = 0;
    for (const item of allSaleItems) {
      const sku = skusMap.get(item.skuId);
      const cost = sku ? sku.avgCost : 0;
      totalCogs += item.quantity * cost;
    }

    const netProfit = totalVentasUsd - totalCogs - totalGastosUsd;
    const marginPct = totalVentasUsd > 0 ? (netProfit / totalVentasUsd) * 100 : 0;

    const pendingDesp = allShipments.filter((s: any) => s.status === "pendiente").length;
    const pendingDevol = allReturns.filter((r: any) => r.status === "pendiente").length;
    const quotesAbiertas = allQuotes.filter((q: any) => q.status === "abierta").length;
    const totalDevolucionesCount = allReturns.length;

    // Top products
    const productQuantities = new Map<string, { name: string; units: number; revenue: number }>();
    for (const item of allSaleItems) {
      const sku = skusMap.get(item.skuId);
      if (!sku) continue;
      const modelId = sku.modelId;
      const modelName = sku.modelName || "Modelo desconocido";
      const current = productQuantities.get(modelId) || { name: modelName, units: 0, revenue: 0 };
      current.units += item.quantity;
      current.revenue += item.quantity * item.unitPrice;
      productQuantities.set(modelId, current);
    }

    const topProductsList = Array.from(productQuantities.entries())
      .map(([id, val], i) => ({
        rank: String(i + 1),
        codigo: id,
        nombre: val.name,
        unidades: val.units,
        monto: val.revenue,
      }))
      .sort((a, b) => b.unidades - a.unidades)
      .slice(0, 4);

    // Re-rank
    topProductsList.forEach((p, idx) => {
      p.rank = String(idx + 1);
    });

    // Low Skus (already bounded + ordered in SQL above)
    const lowSkusList = lowSkusRows.map((s: any) => ({
      codigo: s.compositeCode,
      modelo: s.modelName || "Modelo",
      color: s.compositeCode.split("-")[1] || "Color",
      stock: s.stock,
    }));

    // Recent activity
    const activities: { dot: string; txt: string; monto: string; date: string; timestamp: number }[] = [];

    allSales.slice(-5).forEach((s: any) => {
      activities.push({
        dot: "#1E7A4D",
        txt: `Venta ${s.number}`,
        monto: `+$${s.totalUsd.toFixed(2)}`,
        date: s.date,
        timestamp: new Date(s.createdAt).getTime(),
      });
    });

    allQuotes.slice(-5).forEach((q: any) => {
      activities.push({
        dot: "#6A6A63",
        txt: `Cotización ${q.number}`,
        monto: `$${q.totalUsd.toFixed(2)}`,
        date: q.date,
        timestamp: new Date(q.createdAt).getTime(),
      });
    });

    allReturns.slice(-3).forEach((r: any) => {
      activities.push({
        dot: "#B07A1A",
        txt: `Devolución ${r.reference}`,
        monto: `−$${r.type === "devolucion" ? "Devolución" : "Cambio"}`,
        date: r.createdAt.slice(0, 10),
        timestamp: new Date(r.createdAt).getTime(),
      });
    });

    const recentActivities = activities
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5)
      .map(act => ({
        dot: act.dot,
        txt: act.txt,
        monto: act.monto,
        fecha: act.date.split("-").slice(1).reverse().join("/"),
      }));

    // Payment Methods Breakdown
    const methodTotals = new Map<number, number>();
    for (const pay of allSalePayments) {
      methodTotals.set(pay.methodId, (methodTotals.get(pay.methodId) || 0) + pay.amountUsd);
    }
    const totalPaymentsUsd = Array.from(methodTotals.values()).reduce((sum, val) => sum + val, 0);

    // Real payment-method mix for the month (no fabricated fallback).
    const PAY_PALETTE = ["#15151A", "#4A4A52", "#8A8A82", "#B8B8B0", "#D7D5CD"];
    const payMethodsBreakdown = Array.from(methodTotals.entries())
      .map(([id, val]) => ({ id, name: payMethodsMap.get(id)?.name || "Otro", value: val }))
      .sort((a, b) => b.value - a.value)
      .map((m, i) => ({
        name: m.name,
        pct: totalPaymentsUsd > 0 ? Math.round((m.value / totalPaymentsUsd) * 100) : 0,
        color: PAY_PALETTE[i % PAY_PALETTE.length],
      }));

    // Real weekly buckets (by day-of-month) for the facturación vs. gastos chart.
    const weekFacturacion = [0, 0, 0, 0];
    const weekGastos = [0, 0, 0, 0];
    const weekBucket = (dateStr: string) => {
      const day = Number((dateStr || "").slice(8, 10)) || 1;
      return Math.min(3, Math.max(0, Math.floor((day - 1) / 7)));
    };
    for (const s of allSales as any[]) weekFacturacion[weekBucket(s.date)] += s.totalUsd;
    for (const e of allExpenses as any[]) weekGastos[weekBucket(e.date)] += e.amountUsd;
    const weeksData = weekFacturacion.map((fact, i) => ({
      label: `Sem ${i + 1}`,
      facturacion: Math.round(fact),
      gastos: Math.round(weekGastos[i]),
    }));

    const result = {
      ventasMes: totalVentasUsd,
      totalVentasCount,
      gananciaNeta: netProfit,
      marginPct,
      deudaCons: totalDeudaCons,
      consignLiquidado: totalConsignLiquidatedUsd,
      gastosMes: totalGastosUsd,
      skusCero: skusCeroCount,
      despPend: pendingDesp,
      devolPend: pendingDevol,
      invVal: inventoryValuation,
      invUnits: inventoryUnits,
      invRetail: inventoryRetail,
      invPotencial: inventoryPotentialMargin,
      cotAbiertas: quotesAbiertas,
      devolTotal: totalDevolucionesCount,
      topProducts: topProductsList,
      lowSkus: lowSkusList,
      activity: recentActivities,
      payMethods: payMethodsBreakdown,
      weeks: weeksData,
    };
    return result;
  } catch (e: any) {
    console.error("Error in getDashboardData:", e);
    return null;
  }
}
