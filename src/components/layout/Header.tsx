"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";

const menuIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const searchIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A6A69E" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

const plusIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/* Title mapping from handoff v2 */
const pageMeta: Record<string, { kicker: string; title: string }> = {
  "/": { kicker: "Resumen del negocio", title: "Panel" },
  "/inventario": { kicker: "Existencias por SKU", title: "Inventario" },
  "/compras": { kicker: "Reposición y proveedores", title: "Compras" },
  "/ventas": { kicker: "Cotizaciones y notas", title: "Ventas" },
  "/clientes": { kicker: "Historial y tallas habituales", title: "Clientes" },
  "/catalogo": { kicker: "Catálogo dinámico de marca", title: "Catálogo" },
  "/consignacion": { kicker: "Cuenta corriente de terceros", title: "Consignación" },
  "/devoluciones": { kicker: "Devoluciones y cambios", title: "Devoluciones" },
  "/gastos": { kicker: "Egresos del período", title: "Gastos" },
  "/despachos": { kicker: "Envíos y transportistas", title: "Despachos" },
  "/configuracion": { kicker: "Catálogos y parámetros", title: "Configuración" },
};

interface HeaderProps {
  onNuevaVenta?: () => void;
  onToggleSidebar?: () => void;
}

export default function Header({ onNuevaVenta, onToggleSidebar }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any>({ customers: [], models: [], sales: [], quotes: [] });
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults({ customers: [], models: [], sales: [], quotes: [] });
      setShowPopup(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
          setShowPopup(true);
        }
      } catch (e) {
        console.error("Search fetch error:", e);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleItemClick = (type: string) => {
    setShowPopup(false);
    setSearchQuery("");
    if (type === "customer") {
      router.push(`/clientes`);
    } else if (type === "model") {
      router.push(`/inventario`);
    } else if (type === "sale" || type === "quote") {
      router.push(`/ventas`);
    }
  };

  /* Match pathname to meta */
  const meta = Object.entries(pageMeta).find(([path]) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  })?.[1] ?? { kicker: "", title: "K-Uniformes" };

  return (
    <header className="header" style={{ display: "flex", alignItems: "center" }}>
      <button
        className="hamburger-btn"
        onClick={onToggleSidebar}
        aria-label="Menú"
        style={{ marginRight: 16, background: "none", border: "none", color: "var(--text-primary)", cursor: "pointer", display: "none" }}
      >
        {menuIcon}
      </button>

      <div className="header-title">
        <div className="header-kicker">{meta.kicker}</div>
        <h1 className="header-heading">{meta.title}</h1>
      </div>

      <div className="header-actions">
        {/* Search */}
        <div className="search-bar">
          {searchIcon}
          <input
            type="text"
            placeholder="Buscar…"
            aria-label="Buscar"
            aria-expanded={showPopup}
            aria-haspopup="listbox"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (searchQuery.trim().length >= 2) setShowPopup(true);
            }}
            onBlur={() => {
              // delay to let item onClick fire
              setTimeout(() => setShowPopup(false), 200);
            }}
          />

          {showPopup && (
            <div className="search-results-popup" role="listbox" aria-label="Resultados de búsqueda">
              {searchResults.customers.length > 0 && (
                <>
                  <div className="search-group-title">Clientes</div>
                  {searchResults.customers.map((c: any) => (
                    <button key={c.id} className="search-item" onClick={() => handleItemClick("customer")}>
                      {c.name} {c.phone && `(${c.phone})`}
                    </button>
                  ))}
                </>
              )}

              {searchResults.models.length > 0 && (
                <>
                  <div className="search-group-title">Modelos / SKUs</div>
                  {searchResults.models.map((m: any) => (
                    <button key={m.id} className="search-item" onClick={() => handleItemClick("model")}>
                      {m.id} — {m.name}
                    </button>
                  ))}
                </>
              )}

              {searchResults.sales.length > 0 && (
                <>
                  <div className="search-group-title">Ventas (NE)</div>
                  {searchResults.sales.map((s: any) => (
                    <button key={s.id} className="search-item" onClick={() => handleItemClick("sale")}>
                      {s.number}
                    </button>
                  ))}
                </>
              )}

              {searchResults.quotes.length > 0 && (
                <>
                  <div className="search-group-title">Cotizaciones</div>
                  {searchResults.quotes.map((q: any) => (
                    <button key={q.id} className="search-item" onClick={() => handleItemClick("quote")}>
                      {q.number}
                    </button>
                  ))}
                </>
              )}

              {searchResults.customers.length === 0 &&
               searchResults.models.length === 0 &&
               searchResults.sales.length === 0 &&
               searchResults.quotes.length === 0 && (
                <div className="search-empty">
                  Sin resultados.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Range selector */}
        <div className="range-selector">
          <button className="range-btn active">Hoy</button>
          <button className="range-btn">Semana</button>
          <button className="range-btn">Mes</button>
        </div>

        {/* Nueva venta */}
        <button
          className="btn btn-primary"
          onClick={() => {
            if (onNuevaVenta) {
              onNuevaVenta();
            } else {
              router.push("/ventas?openModal=true");
            }
          }}
        >
          {plusIcon}
          Nueva venta
        </button>
      </div>
    </header>
  );
}
