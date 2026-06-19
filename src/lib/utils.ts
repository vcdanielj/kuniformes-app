/**
 * K-Uniformes — Utility Helpers
 *
 * Formatting, SKU generation, and shared logic used across the app.
 */

/* ────────────────────────────────────────────
   Currency Formatting (Venezuela conventions)
   ──────────────────────────────────────────── */

const usdFmt = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const bsFmt = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a number as "$1.234,56" */
export function formatUSD(n: number): string {
  return "$" + usdFmt.format(n);
}

/** Format a number as "Bs 1.234,56" */
export function formatBs(n: number): string {
  return "Bs " + bsFmt.format(n);
}

/** Format a number as "1.234,56" (no prefix) */
export function formatNumber(n: number): string {
  return usdFmt.format(n);
}

/** Formats rate: "801,50" */
export function formatRate(n: number): string {
  return n.toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/* ────────────────────────────────────────────
   SKU Helpers
   ──────────────────────────────────────────── */

/**
 * Generate a composite SKU code.
 * Products with sizes: "42168-Z21-M"
 * Products without sizes (gorros): "33010-Z18"
 */
export function generateSkuCode(
  modelId: string,
  colorCode: string,
  sizeName?: string | null
): string {
  if (sizeName) {
    return `${modelId}-${colorCode}-${sizeName}`;
  }
  return `${modelId}-${colorCode}`;
}

/* ────────────────────────────────────────────
   Document Numbers
   ──────────────────────────────────────────── */

/** Generate NE-00184 style numbers */
export function formatDocNumber(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(5, "0")}`;
}

/* ────────────────────────────────────────────
   Date Helpers
   ──────────────────────────────────────────── */

/** Today as "YYYY-MM-DD" */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Format "2026-06-18" → "18 Jun" */
export function formatDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const months = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
  ];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

/** Format "2026-06-18" → "18 de junio de 2026" */
export function formatDateLong(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-VE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/* ────────────────────────────────────────────
   Misc
   ──────────────────────────────────────────── */

/** Generate a random ID (for non-crypto uses like session tokens) */
export function generateId(length = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (const byte of array) {
    result += chars[byte % chars.length];
  }
  return result;
}

/** User initials from "Yoselin K." → "YK" */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Avatar background color deterministic from name */
const avatarColors = ["#3a3a44", "#5a4a3a", "#3a4a44", "#4a3a44", "#44443a"];
export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

/** Clamp a number between min and max */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
