"use client";

import { useState, useEffect, useMemo } from "react";
import { getInventoryModels } from "@/lib/db/actions";
import { formatUSD } from "@/lib/utils";
import { filterCatalogModels } from "@/lib/catalog-filter";

type CatFilter = "all" | string;

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "XXL", "3XL"];

export default function CatalogoPage() {
  const [loading, setLoading] = useState(true);
  const [modelsList, setModelsList] = useState<any[]>([]);
  const [catFilter, setCatFilter] = useState<CatFilter>("all");
  const [genderFilter, setGenderFilter] = useState<"all" | "dama" | "caballero" | "unisex">("all");
  const [onlyStock, setOnlyStock] = useState(false);
  const [sizeFilter, setSizeFilter] = useState<string[]>([]);
  const [colorFilter, setColorFilter] = useState<string[]>([]);
  const [showPrices, setShowPrices] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  async function loadData() {
    try {
      setLoading(true);
      const models = await getInventoryModels();
      setModelsList(models);
      setErrorMsg("");
    } catch (e) {
      console.error(e);
      setErrorMsg("Error al cargar el catálogo.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const allCats = [...new Set(modelsList.map((m) => m.category))];

  // Build the available size + color universe from the loaded models.
  const allSizes = useMemo(() => {
    const set = new Set<string>();
    for (const m of modelsList) {
      if (m.type !== "con_tallas") continue;
      for (const s of m.skus || []) {
        if (s.sizeId == null) continue;
        const sz = (s.compositeCode || "").split("-").pop();
        if (sz) set.add(sz);
      }
    }
    return [...set].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));
  }, [modelsList]);

  const allColors = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of modelsList) for (const c of m.colors || []) if (!map.has(c.code)) map.set(c.code, c);
    return [...map.values()];
  }, [modelsList]);

  const filtered = useMemo(
    () => filterCatalogModels(modelsList, {
      category: catFilter,
      gender: genderFilter,
      onlyStock,
      sizes: sizeFilter,
      colors: colorFilter,
    }),
    [modelsList, catFilter, genderFilter, onlyStock, sizeFilter, colorFilter]
  );

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  function handleExportPdf() {
    const params = new URLSearchParams();
    params.set("showPrices", String(showPrices));
    if (catFilter !== "all") params.set("category", catFilter);
    if (genderFilter !== "all") params.set("gender", genderFilter);
    if (onlyStock) params.set("onlyStock", "true");
    if (sizeFilter.length) params.set("sizes", sizeFilter.join(","));
    if (colorFilter.length) params.set("colors", colorFilter.join(","));
    window.open(`/api/catalogo?${params.toString()}`, "_blank");
  }

  const activeFilterCount =
    (catFilter !== "all" ? 1 : 0) + (genderFilter !== "all" ? 1 : 0) +
    (onlyStock ? 1 : 0) + sizeFilter.length + colorFilter.length;

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loader">Cargando catálogo dinámico...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {errorMsg && (
        <div className="alert-banner alert-banner-danger">
          <p>{errorMsg}</p>
        </div>
      )}

      {/* Filter bar */}
      <div className="page-toolbar">
        <div className="range-selector is-scrollable">
          <button className={`range-btn ${catFilter === "all" ? "active" : ""}`} onClick={() => setCatFilter("all")}>
            Todos
          </button>
          {allCats.map((c) => (
            <button
              key={c}
              className={`range-btn ${catFilter === c ? "active" : ""}`}
              onClick={() => setCatFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="page-toolbar-spacer" />
        <label className="toolbar-checkbox">
          <input
            type="checkbox"
            checked={showPrices}
            onChange={(e) => setShowPrices(e.target.checked)}
          />
          Mostrar precios
        </label>
        <button className="btn btn-primary btn-sm" onClick={handleExportPdf}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Exportar PDF
        </button>
      </div>

      {/* Secondary filters */}
      <div className="card" style={{ borderRadius: "var(--radius-4xl)", padding: 16, marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 18, alignItems: "flex-start" }}>
        <div>
          <div className="section-label" style={{ fontSize: "var(--text-xs2)", marginBottom: 6 }}>Género</div>
          <div className="range-selector is-scrollable" style={{ maxWidth: "100%" }}>
            {(["all", "dama", "caballero", "unisex"] as const).map((g) => (
              <button key={g} className={`range-btn ${genderFilter === g ? "active" : ""}`} onClick={() => setGenderFilter(g)}>
                {g === "all" ? "Todos" : g === "dama" ? "Dama" : g === "caballero" ? "Caballero" : "Unisex"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="section-label" style={{ fontSize: "var(--text-xs2)", marginBottom: 6 }}>Disponibilidad</div>
          <label className="toolbar-checkbox">
            <input type="checkbox" checked={onlyStock} onChange={(e) => setOnlyStock(e.target.checked)} />
            Solo con stock
          </label>
        </div>

        {allSizes.length > 0 && (
          <div style={{ minWidth: 0 }}>
            <div className="section-label" style={{ fontSize: "var(--text-xs2)", marginBottom: 6 }}>Tallas</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {allSizes.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  className={`range-btn ${sizeFilter.includes(sz) ? "active" : ""}`}
                  style={{ padding: "5px 11px" }}
                  onClick={() => toggle(sizeFilter, setSizeFilter, sz)}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>
        )}

        {allColors.length > 0 && (
          <div style={{ minWidth: 0, flex: "1 1 240px" }}>
            <div className="section-label" style={{ fontSize: "var(--text-xs2)", marginBottom: 6 }}>Colores</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 96, overflowY: "auto" }}>
              {allColors.map((c) => {
                const active = colorFilter.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggle(colorFilter, setColorFilter, c.code)}
                    title={`${c.code} · ${c.name}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "4px 8px", borderRadius: 7,
                      border: active ? "1.5px solid #15151A" : "1.5px solid var(--border-light)",
                      background: active ? "#F0EEE8" : "#fff", cursor: "pointer", fontSize: "var(--text-sm)", fontWeight: 600,
                    }}
                  >
                    <span style={{ width: 11, height: 11, borderRadius: "50%", background: c.hex, border: "1px solid rgba(0,0,0,.12)" }} />
                    {c.code}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeFilterCount > 0 && (
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            style={{ alignSelf: "center" }}
            onClick={() => { setCatFilter("all"); setGenderFilter("all"); setOnlyStock(false); setSizeFilter([]); setColorFilter([]); }}
          >
            Limpiar filtros ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Product grid */}
      {filtered.length === 0 ? (
        <div className="empty-state-card">
          <strong>Sin prendas en esta categoría.</strong> Ajusta el filtro o carga nuevos modelos para verlos aquí.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {filtered.map((m) =>
            m.colors.map((color: any) => {
              return (
                <div key={`${m.id}-${color.code}`} className="card" style={{ borderRadius: "var(--radius-5xl)", padding: 0, overflow: "hidden" }}>
                  {/* Image area */}
                  <div style={{
                    height: 240,
                    background: `linear-gradient(135deg, ${color.hex}22, ${color.hex}44)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    overflow: "hidden",
                  }}>
                    {color.imageUrl ? (
                      <img
                        src={color.imageUrl}
                        alt={`${m.name} color ${color.name}`}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                        K-UNIFORMES
                      </span>
                    )}
                    <div style={{
                      position: "absolute", top: 12, right: 12,
                      display: "flex", alignItems: "center", gap: 6,
                      background: "rgba(255,255,255,0.9)", borderRadius: 8, padding: "4px 10px",
                    }}>
                      <span className="color-swatch" style={{ background: color.hex }} />
                      <span style={{ fontSize: "var(--text-sm2)", fontWeight: 600 }}>{color.name}</span>
                    </div>
                  </div>
                  {/* Info */}
                  <div style={{ padding: "14px 18px" }}>
                    <div style={{ fontSize: "var(--text-md2)", fontWeight: 700 }}>{m.name}</div>
                    <div className="font-mono" style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: 2 }}>
                      {m.id}-{color.code} · {m.category}
                    </div>
                    {showPrices && (
                      <div style={{ fontSize: "var(--text-lg)", fontWeight: 800, marginTop: 8 }}>
                        {formatUSD(m.basePrice)}
                      </div>
                    )}
                    {m.type === "con_tallas" && (
                      <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                        {m.skus
                          .filter((sku: any) => sku.colorId === color.id)
                          .map((sku: any) => {
                            const sizeName = sku.compositeCode.split("-").pop();
                            return (
                              <span key={sku.id} style={{
                                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                                background: sku.stock > 0 ? "var(--bg-subtle)" : "rgba(255, 0, 0, 0.05)",
                                borderRadius: 4, padding: "3px 7px",
                                color: sku.stock > 0 ? "var(--text-tertiary)" : "rgba(255, 0, 0, 0.4)",
                              }} title={`Stock: ${sku.stock}`}>
                                {sizeName}
                              </span>
                            );
                          })
                        }
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
