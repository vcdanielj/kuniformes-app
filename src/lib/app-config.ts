export const SETTINGS_KEYS = {
  brand: "marca",
  rif: "rif",
  phone: "telefono",
  instagram: "instagram",
  lowStockThreshold: "umbral_stock_bajo",
  defaultRateSource: "tasa_default",
  parallelRate: "tasa_paralelo",
  bcvRate: "tasa_bcv",
  euroParallelRate: "tasa_euro_paralelo",
  euroBcvRate: "tasa_euro_bcv",
  lastRatesSyncAt: "tasas_sync_at",
  lastRatesSyncStatus: "tasas_sync_status",
  neCounter: "ne_counter",
  quoteCounter: "cot_counter",
  returnCounter: "dv_counter",
} as const;

export const SYSTEM_DEFAULTS = {
  rates: {
    paralelo: 801.5,
    bcv: 600.2,
    euroParalelo: 915,
    euroBcv: 690,
  },
  lowStockThreshold: 5,
  counters: {
    ne: 184,
    quote: 11,
    return: 42,
  },
} as const;

export const ADMIN_ONLY_NAV_ITEMS = new Set([
  "compras",
  "gastos",
  "config",
]);

export function canAccessNavItem(role: "admin" | "vendedor", key: string) {
  return role === "admin" || !ADMIN_ONLY_NAV_ITEMS.has(key);
}
