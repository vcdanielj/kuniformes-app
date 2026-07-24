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

export type UserRole = "admin" | "vendedor" | "usuario";

// Nav items each non-admin role may NOT access. Admin sees everything.
// - usuario (operador): everything except the dashboard/metrics and the audit log.
// - vendedor: operational only (no compras/gastos/config/actividad).
const NAV_DENY_BY_ROLE: Record<UserRole, Set<string>> = {
  admin: new Set<string>(),
  usuario: new Set<string>(["panel", "actividad"]),
  vendedor: new Set<string>(["compras", "gastos", "config", "actividad"]),
};

// Config tabs the role may NOT see (user management stays admin-only).
const CONFIG_TAB_DENY_BY_ROLE: Record<UserRole, Set<string>> = {
  admin: new Set<string>(),
  usuario: new Set<string>(["usuarios"]),
  vendedor: new Set<string>(["usuarios"]),
};

export function canAccessNavItem(role: UserRole, key: string) {
  return !(NAV_DENY_BY_ROLE[role] ?? new Set<string>()).has(key);
}

export function canAccessConfigTab(role: UserRole, tab: string) {
  return !(CONFIG_TAB_DENY_BY_ROLE[role] ?? new Set<string>()).has(tab);
}
