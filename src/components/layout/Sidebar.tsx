"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useState, useEffect } from "react";
import { getConfigData, getInventoryModels, getConsigneesData } from "@/lib/db/actions";
import { logoutAction } from "@/lib/auth/actions";
import { canAccessNavItem, SETTINGS_KEYS, SYSTEM_DEFAULTS } from "@/lib/app-config";

/* ────────────────────────────────────────────
   SVG icons — inline for zero-dependency perf
   ──────────────────────────────────────────── */
const icons: Record<string, React.ReactNode> = {
  panel: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  inventario: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </svg>
  ),
  compras: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18M3 7l9 4 9-4M3 7v10l9 4 9-4V7" />
      <path d="M16 5l3 2-3 2" />
    </svg>
  ),
  ventas: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h2.2l2.3 12.3a1 1 0 001 .8h9a1 1 0 001-.8L20 7H6" />
    </svg>
  ),
  clientes: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="3.2" />
      <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  catalogo: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  consignacion: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12V8H6a2 2 0 01-2-2c0-1.1.9-2 2-2h12v4" />
      <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
      <path d="M18 12a2 2 0 000 4h4v-4z" />
    </svg>
  ),
  devoluciones: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14l-4-4 4-4" />
      <path d="M5 10h11a4 4 0 014 4v0a4 4 0 01-4 4H7" />
    </svg>
  ),
  gastos: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 2v20l2-1.2L9 22l2-1.2L13 22l2-1.2L17 22l2-1.2V2l-2 1.2L15 2l-2 1.2L11 2 9 3.2 7 2 5 3.2z" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </svg>
  ),
  despachos: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="14" height="12" rx="1.5" />
      <path d="M15 8h4l3 3.5V16h-7" />
      <circle cx="5.5" cy="18.5" r="1.7" />
      <circle cx="17.5" cy="18.5" r="1.7" />
    </svg>
  ),
  config: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-2.82 1.17V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.31.22.65.22 1z" />
    </svg>
  ),
  logout: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7E7E86" strokeWidth="2" strokeLinecap="round">
      <path d="M16 17l5-5-5-5M21 12H9M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    </svg>
  ),
};

/* ─── Nav structure (matches handoff v2 exactly) ─── */
type NavItem = { key: string; label: string; href: string; badge?: number };
type NavSection = { title: string; items: NavItem[] };

const navSections: NavSection[] = [
  {
    title: "Operación",
    items: [
      { key: "panel", label: "Panel", href: "/" },
      { key: "inventario", label: "Inventario", href: "/inventario" },
      { key: "compras", label: "Compras", href: "/compras" },
      { key: "ventas", label: "Ventas", href: "/ventas" },
      { key: "clientes", label: "Clientes", href: "/clientes" },
      { key: "catalogo", label: "Catálogo", href: "/catalogo" },
    ],
  },
  {
    title: "Gestión",
    items: [
      { key: "consignacion", label: "Consignación", href: "/consignacion" },
      { key: "devoluciones", label: "Devoluciones", href: "/devoluciones" },
      { key: "gastos", label: "Gastos", href: "/gastos" },
      { key: "despachos", label: "Despachos", href: "/despachos" },
    ],
  },
  {
    title: "Sistema",
    items: [
      { key: "config", label: "Configuración", href: "/configuracion" },
    ],
  },
];

/* ─── Format helpers ─── */
function formatRate(n: number): string {
  return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ──────────────────────────────────────────── */
interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "vendedor";
  active: boolean;
}

export default function Sidebar({
  isOpen,
  onClose,
  user,
}: {
  isOpen: boolean;
  onClose: () => void;
  user: User;
}) {
  const pathname = usePathname();

  const [rates, setRates] = useState<{ paralelo: number; bcv: number }>({
    paralelo: SYSTEM_DEFAULTS.rates.paralelo,
    bcv: SYSTEM_DEFAULTS.rates.bcv,
  });
  const [lowStockCount, setLowStockCount] = useState(0);
  const [consignacionPendiente, setConsignacionPendiente] = useState(0);

  const userName = user?.name || "Usuario";
  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "US";
  const userRole = user?.role === "admin" ? "Administradora" : "Vendedora";

  useEffect(() => {
    async function loadStats() {
      try {
        const config = await getConfigData();
        const pRate = parseFloat(
          config.settings[SETTINGS_KEYS.parallelRate] || String(SYSTEM_DEFAULTS.rates.paralelo)
        );
        const bRate = parseFloat(
          config.settings[SETTINGS_KEYS.bcvRate] || String(SYSTEM_DEFAULTS.rates.bcv)
        );
        setRates({ paralelo: pRate, bcv: bRate });

        const models = await getInventoryModels();
        const lowStockThreshold = parseInt(
          config.settings[SETTINGS_KEYS.lowStockThreshold] ||
            String(SYSTEM_DEFAULTS.lowStockThreshold),
          10
        );
        let lowCount = 0;
        models.forEach((m: any) => {
          m.skus.forEach((s: any) => {
            if (s.stock <= lowStockThreshold) {
              lowCount++;
            }
          });
        });
        setLowStockCount(lowCount);

        const cons = await getConsigneesData();
        let pendingCons = 0;
        cons.forEach((c: any) => {
          c.lots.forEach((l: any) => {
            if (l.status === "pendiente" || l.status === "pago_parcial") {
              pendingCons++;
            }
          });
        });
        setConsignacionPendiente(pendingCons);
      } catch (e) {
        console.error("Error loading sidebar stats:", e);
      }
    }
    loadStats();
  }, [pathname]);

  /* Determine active nav key from pathname */
  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  /* Inject badges */
  function getBadge(key: string): number | undefined {
    if (key === "inventario") return lowStockCount;
    if (key === "consignacion") return consignacionPendiente;
    return undefined;
  }

  const handleLogout = async () => {
    await logoutAction();
    window.location.href = "/login";
  };

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccessNavItem(user.role, item.key)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className={`sidebar ${isOpen ? "open" : ""}`}>
      {/* Brand */}
      <div className="sidebar-brand" style={{ display: "flex", alignItems: "center" }}>
        <div className="sidebar-brand-logo" style={{ flexShrink: 0 }}>
          <Image src="/assets/logo.jpg" alt="K" width={34} height={34} />
        </div>
        <div style={{ flex: 1, marginLeft: 12 }}>
          <div className="sidebar-brand-name">K-Uniformes</div>
          <div className="sidebar-brand-sub">Venezuela</div>
        </div>
        <button
          className="mobile-close-btn"
          onClick={onClose}
          style={{ background: "none", border: "none", color: "var(--text-sidebar-inactive)", fontSize: 24, padding: "0 8px", cursor: "pointer" }}
          aria-label="Cerrar menú"
        >
          ×
        </button>
      </div>

      {/* Scrollable nav */}
      <div className="sidebar-scroll">
        {visibleSections.map((section) => (
          <div key={section.title}>
            <div className="sidebar-section-label">{section.title}</div>
            <nav className="sidebar-nav">
              {section.items.map((item) => {
                const badge = getBadge(item.key);
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`sidebar-nav-item ${isActive(item.href) ? "active" : ""}`}
                  >
                    {icons[item.key]}
                    <span>{item.label}</span>
                    {badge !== undefined && (
                      <span className="sidebar-badge">{badge}</span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* Footer: Tasa + User */}
      <div className="sidebar-footer">
        {/* Tasa widget */}
        <div className="sidebar-tasa">
          <div className="sidebar-tasa-label">
            <span>Tasa de venta</span>
            <span className="sidebar-tasa-dot" />
          </div>
          <div className="sidebar-tasa-value">
            <span className="rate">{formatRate(rates.paralelo)}</span>
            <span className="tag">Paralelo</span>
          </div>
          <div className="sidebar-tasa-bcv">
            <span className="rate">{formatRate(rates.bcv)}</span>
            <span className="label">BCV oficial</span>
          </div>
        </div>

        {/* User */}
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{userInitials}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{userName}</div>
            <div className="sidebar-user-role">{userRole}</div>
          </div>
          <button aria-label="Cerrar sesión" onClick={handleLogout}>{icons.logout}</button>
        </div>
      </div>
    </aside>
  );
}
