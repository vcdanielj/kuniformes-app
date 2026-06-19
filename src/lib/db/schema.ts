/**
 * K-Uniformes — Database Schema (Drizzle ORM / SQLite / D1)
 *
 * Covers S0-S8 tables with explicit indexes for all foreign key
 * references and search attributes to optimize for Cloudflare D1.
 */

import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const now = sql`(datetime('now'))`;

/* ============================================================
   Auth (S1)
   ============================================================ */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "vendedor"] }).notNull().default("vendedor"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(now),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
}, (table) => ({
  userIdIdx: index("sessions_user_id_idx").on(table.userId),
}));

/* ============================================================
   Configuration Catalogs (S1)
   ============================================================ */

export const colors = sqliteTable("colors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),   // Z21, Z22, etc.
  name: text("name").notNull(),
  hex: text("hex").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const sizes = sqliteTable("sizes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),   // XS, S, M, L, XL, 2XL, 3XL
  sortOrder: integer("sort_order").notNull().default(0),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  type: text("type", { enum: ["product", "expense"] })
    .notNull()
    .default("product"),
});

export const paymentMethods = sqliteTable("payment_methods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  currency: text("currency").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const carriers = sqliteTable("carriers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  tag: text("tag").notNull().default("Principal"),
});

export const exchangeRates = sqliteTable("exchange_rates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  rate: real("rate").notNull(),
  source: text("source", { enum: ["paralelo", "bcv", "manual"] }).notNull(),
  currencyCode: text("currency_code").notNull().default("USD"),
  provider: text("provider").notNull().default("manual"),
  displayName: text("display_name").notNull().default("Dolar"),
  buy: real("buy"),
  sell: real("sell"),
  average: real("average"),
  externalUpdatedAt: text("external_updated_at"),
  createdAt: text("created_at").notNull().default(now),
}, (table) => ({
  dateIdx: index("exchange_rates_date_idx").on(table.date),
  currencySourceIdx: index("exchange_rates_currency_source_idx").on(
    table.currencyCode,
    table.source,
    table.date
  ),
}));

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/* ============================================================
   Inventory (S2)
   ============================================================ */

export const models = sqliteTable("models", {
  id: text("id").primaryKey(),  // user-facing code: 42168
  name: text("name").notNull(),
  design: text("design"),
  composition: text("composition"),
  categoryId: integer("category_id").references(() => categories.id),
  type: text("type", { enum: ["con_tallas", "sin_tallas"] })
    .notNull()
    .default("con_tallas"),
  basePrice: real("base_price").notNull(),
  avgCost: real("avg_cost").notNull().default(0),
  createdAt: text("created_at").notNull().default(now),
}, (table) => ({
  categoryIdIdx: index("models_category_id_idx").on(table.categoryId),
  nameIdx: index("models_name_idx").on(table.name),
}));

export const modelColors = sqliteTable("model_colors", {
  modelId: text("model_id")
    .notNull()
    .references(() => models.id),
  colorId: integer("color_id")
    .notNull()
    .references(() => colors.id),
}, (table) => ({
  modelIdIdx: index("model_colors_model_id_idx").on(table.modelId),
  colorIdIdx: index("model_colors_color_id_idx").on(table.colorId),
}));

export const modelSizes = sqliteTable("model_sizes", {
  modelId: text("model_id")
    .notNull()
    .references(() => models.id),
  sizeId: integer("size_id")
    .notNull()
    .references(() => sizes.id),
}, (table) => ({
  modelIdIdx: index("model_sizes_model_id_idx").on(table.modelId),
  sizeIdIdx: index("model_sizes_size_id_idx").on(table.sizeId),
}));

export const modelColorImages = sqliteTable("model_color_images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  modelId: text("model_id")
    .notNull()
    .references(() => models.id),
  colorId: integer("color_id")
    .notNull()
    .references(() => colors.id),
  imageUrl: text("image_url").notNull(),
}, (table) => ({
  modelColorIdx: index("model_color_images_lookup_idx").on(table.modelId, table.colorId),
}));

export const skus = sqliteTable("skus", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  modelId: text("model_id")
    .notNull()
    .references(() => models.id),
  colorId: integer("color_id")
    .notNull()
    .references(() => colors.id),
  sizeId: integer("size_id").references(() => sizes.id), // NULL for sin_tallas
  compositeCode: text("composite_code").notNull().unique(), // 42168-Z21-M
  stock: integer("stock").notNull().default(0),
  avgCost: real("avg_cost").notNull().default(0),
  priceOverride: real("price_override"),
  createdAt: text("created_at").notNull().default(now),
}, (table) => ({
  modelIdIdx: index("skus_model_id_idx").on(table.modelId),
  colorIdIdx: index("skus_color_id_idx").on(table.colorId),
  sizeIdIdx: index("skus_size_id_idx").on(table.sizeId),
  compositeCodeIdx: uniqueIndex("skus_composite_code_uidx").on(table.compositeCode),
}));

export const stockAdjustments = sqliteTable("stock_adjustments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  skuId: integer("sku_id")
    .notNull()
    .references(() => skus.id),
  quantity: integer("quantity").notNull(),
  reason: text("reason").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull().default(now),
}, (table) => ({
  skuIdIdx: index("stock_adjustments_sku_id_idx").on(table.skuId),
  userIdIdx: index("stock_adjustments_user_id_idx").on(table.userId),
}));

/* ============================================================
   Suppliers & Purchases (S3)
   ============================================================ */

export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  items: text("items"),          // description: "Scrubs · Joggers"
  contact: text("contact"),      // phone
  createdAt: text("created_at").notNull().default(now),
});

export const purchases = sqliteTable("purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  supplierId: integer("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  date: text("date").notNull(),
  status: text("status", { enum: ["borrador", "en_transito", "recibida", "parcial"] })
    .notNull()
    .default("borrador"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(now),
}, (table) => ({
  supplierIdIdx: index("purchases_supplier_id_idx").on(table.supplierId),
  dateIdx: index("purchases_date_idx").on(table.date),
}));

export const purchaseItems = sqliteTable("purchase_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  purchaseId: integer("purchase_id")
    .notNull()
    .references(() => purchases.id),
  skuId: integer("sku_id")
    .notNull()
    .references(() => skus.id),
  quantity: integer("quantity").notNull(),
  unitCost: real("unit_cost").notNull(),
}, (table) => ({
  purchaseIdIdx: index("purchase_items_purchase_id_idx").on(table.purchaseId),
  skuIdIdx: index("purchase_items_sku_id_idx").on(table.skuId),
}));

/* ============================================================
   Customers & Sales (S4)
   ============================================================ */

export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phone: text("phone"),
  notes: text("notes"),
  creditBalance: real("credit_balance").notNull().default(0),
  createdAt: text("created_at").notNull().default(now),
}, (table) => ({
  nameIdx: index("customers_name_idx").on(table.name),
  phoneIdx: index("customers_phone_idx").on(table.phone),
}));

export const sales = sqliteTable("sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  number: text("number").notNull().unique(),        // NE-00184
  customerId: integer("customer_id").references(() => customers.id),
  date: text("date").notNull(),
  totalUsd: real("total_usd").notNull(),
  totalBs: real("total_bs").notNull(),
  rateUsed: real("rate_used").notNull(),
  rateSource: text("rate_source", { enum: ["paralelo", "bcv", "manual"] }).notNull(),
  status: text("status", { enum: ["pagada", "pendiente", "anulada"] })
    .notNull()
    .default("pagada"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull().default(now),
}, (table) => ({
  customerIdIdx: index("sales_customer_id_idx").on(table.customerId),
  userIdIdx: index("sales_user_id_idx").on(table.userId),
  dateIdx: index("sales_date_idx").on(table.date),
  numberIdx: index("sales_number_idx").on(table.number),
}));

export const saleItems = sqliteTable("sale_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  saleId: integer("sale_id")
    .notNull()
    .references(() => sales.id),
  skuId: integer("sku_id")
    .notNull()
    .references(() => skus.id),
  quantity: integer("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
}, (table) => ({
  saleIdIdx: index("sale_items_sale_id_idx").on(table.saleId),
  skuIdIdx: index("sale_items_sku_id_idx").on(table.skuId),
}));

export const salePayments = sqliteTable("sale_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  saleId: integer("sale_id")
    .notNull()
    .references(() => sales.id),
  methodId: integer("method_id")
    .notNull()
    .references(() => paymentMethods.id),
  amountUsd: real("amount_usd").notNull(),
  currency: text("currency").notNull().default("USD"),
  amountOriginal: real("amount_original"),
  rateUsed: real("rate_used"),
  rateSource: text("rate_source", { enum: ["paralelo", "bcv", "manual"] }).default("manual"),
  reference: text("reference"),
}, (table) => ({
  saleIdIdx: index("sale_payments_sale_id_idx").on(table.saleId),
  methodIdIdx: index("sale_payments_method_id_idx").on(table.methodId),
}));

/* ============================================================
   Quotes (S4)
   ============================================================ */

export const quotes = sqliteTable("quotes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  number: text("number").notNull().unique(),  // COT-0011
  customerId: integer("customer_id").references(() => customers.id),
  date: text("date").notNull(),
  totalUsd: real("total_usd").notNull(),
  rateUsed: real("rate_used").notNull(),
  rateSource: text("rate_source", { enum: ["paralelo", "bcv", "manual"] }).notNull(),
  status: text("status", { enum: ["abierta", "convertida", "vencida", "anulada"] })
    .notNull()
    .default("abierta"),
  validUntil: text("valid_until"),
  convertedToSaleId: integer("converted_to_sale_id").references(() => sales.id),
  createdAt: text("created_at").notNull().default(now),
}, (table) => ({
  customerIdIdx: index("quotes_customer_id_idx").on(table.customerId),
  dateIdx: index("quotes_date_idx").on(table.date),
  numberIdx: index("quotes_number_idx").on(table.number),
  convertedToSaleIdIdx: index("quotes_converted_to_sale_id_idx").on(table.convertedToSaleId),
}));

export const quoteItems = sqliteTable("quote_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  quoteId: integer("quote_id")
    .notNull()
    .references(() => quotes.id),
  skuId: integer("sku_id")
    .notNull()
    .references(() => skus.id),
  quantity: integer("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
}, (table) => ({
  quoteIdIdx: index("quote_items_quote_id_idx").on(table.quoteId),
  skuIdIdx: index("quote_items_sku_id_idx").on(table.skuId),
}));

/* ============================================================
   Returns (S6)
   ============================================================ */

export const returns = sqliteTable("returns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reference: text("reference").notNull().unique(), // DV-0042
  saleId: integer("sale_id")
    .notNull()
    .references(() => sales.id),
  type: text("type", { enum: ["devolucion", "cambio"] }).notNull(),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["pendiente", "procesada", "anulada"] })
    .notNull()
    .default("pendiente"),
  resolution: text("resolution"), // "Nota de crédito" | "Reembolso" | "Cambio por SKU XXXX"
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull().default(now),
}, (table) => ({
  saleIdIdx: index("returns_sale_id_idx").on(table.saleId),
  userIdIdx: index("returns_user_id_idx").on(table.userId),
  referenceIdx: index("returns_reference_idx").on(table.reference),
  createdAtIdx: index("returns_created_at_idx").on(table.createdAt),
}));

export const returnItems = sqliteTable("return_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  returnId: integer("return_id")
    .notNull()
    .references(() => returns.id),
  skuId: integer("sku_id")
    .notNull()
    .references(() => skus.id),
  quantity: integer("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  replacementSkuId: integer("replacement_sku_id").references(() => skus.id),
  replacementQuantity: integer("replacement_quantity").notNull().default(0),
}, (table) => ({
  returnIdIdx: index("return_items_return_id_idx").on(table.returnId),
  skuIdIdx: index("return_items_sku_id_idx").on(table.skuId),
}));

/* ============================================================
   Consignment (S7)
   ============================================================ */

export const consignees = sqliteTable("consignees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  contact: text("contact"),
  location: text("location"),
  createdAt: text("created_at").notNull().default(now),
});

export const consignmentLots = sqliteTable("consignment_lots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  consigneeId: integer("consignee_id")
    .notNull()
    .references(() => consignees.id),
  date: text("date").notNull(),
  status: text("status", {
    enum: ["pendiente", "pago_parcial", "liquidado", "devuelto"],
  })
    .notNull()
    .default("pendiente"),
  totalUsd: real("total_usd").notNull().default(0),
  paidUsd: real("paid_usd").notNull().default(0),
  createdAt: text("created_at").notNull().default(now),
}, (table) => ({
  consigneeIdIdx: index("consignment_lots_consignee_id_idx").on(table.consigneeId),
  dateIdx: index("consignment_lots_date_idx").on(table.date),
}));

export const consignmentItems = sqliteTable("consignment_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lotId: integer("lot_id")
    .notNull()
    .references(() => consignmentLots.id),
  skuId: integer("sku_id")
    .notNull()
    .references(() => skus.id),
  quantity: integer("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  liquidatedQuantity: integer("liquidated_quantity").notNull().default(0),
  returnedQuantity: integer("returned_quantity").notNull().default(0),
}, (table) => ({
  lotIdIdx: index("consignment_items_lot_id_idx").on(table.lotId),
  skuIdIdx: index("consignment_items_sku_id_idx").on(table.skuId),
}));

export const consignmentPayments = sqliteTable("consignment_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lotId: integer("lot_id")
    .notNull()
    .references(() => consignmentLots.id),
  methodId: integer("method_id")
    .notNull()
    .references(() => paymentMethods.id),
  amountUsd: real("amount_usd").notNull(),
  date: text("date").notNull(),
  reference: text("reference"),
}, (table) => ({
  lotIdIdx: index("consignment_payments_lot_id_idx").on(table.lotId),
  methodIdIdx: index("consignment_payments_method_id_idx").on(table.methodId),
}));

/* ============================================================
   Expenses (S8)
   ============================================================ */

export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  note: text("note").notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  amountUsd: real("amount_usd").notNull(),
  currency: text("currency").notNull().default("USD"),
  amountOriginal: real("amount_original"),
  rateUsed: real("rate_used"),
  rateSource: text("rate_source", { enum: ["paralelo", "bcv", "manual"] }).default("manual"),
  createdAt: text("created_at").notNull().default(now),
}, (table) => ({
  categoryIdIdx: index("expenses_category_id_idx").on(table.categoryId),
  dateIdx: index("expenses_date_idx").on(table.date),
}));

/* ============================================================
   Shipments (S8)
   ============================================================ */

export const shipments = sqliteTable("shipments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  trackingNumber: text("tracking_number").notNull(),
  saleId: integer("sale_id")
    .notNull()
    .references(() => sales.id),
  carrierId: integer("carrier_id")
    .notNull()
    .references(() => carriers.id),
  destination: text("destination").notNull(),
  costUsd: real("cost_usd").notNull().default(0),
  status: text("status", { enum: ["pendiente", "despachado", "entregado"] })
    .notNull()
    .default("pendiente"),
  createdAt: text("created_at").notNull().default(now),
}, (table) => ({
  saleIdIdx: index("shipments_sale_id_idx").on(table.saleId),
  carrierIdIdx: index("shipments_carrier_id_idx").on(table.carrierId),
  trackingNumberIdx: index("shipments_tracking_number_idx").on(table.trackingNumber),
}));

/* ============================================================
   Documents (S5)
   ============================================================ */

export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type", { enum: ["nota_entrega", "cotizacion", "comprobante", "catalogo"] })
    .notNull(),
  number: text("number").notNull(),
  relatedId: integer("related_id"),  // sale_id or quote_id
  pdfUrl: text("pdf_url"),          // R2 URL
  createdAt: text("created_at").notNull().default(now),
}, (table) => ({
  relatedIdIdx: index("documents_related_id_idx").on(table.relatedId),
  numberIdx: index("documents_number_idx").on(table.number),
}));

/* ============================================================
   Audit Log (S11)
   ============================================================ */

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  details: text("details"),
  createdAt: text("created_at").notNull().default(now),
}, (table) => ({
  userIdIdx: index("audit_log_user_id_idx").on(table.userId),
  createdAtIdx: index("audit_log_created_at_idx").on(table.createdAt),
}));
