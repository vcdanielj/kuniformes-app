"use client";

import { useState, useEffect } from "react";
import { getInventoryModels } from "@/lib/db/actions";
import { formatUSD } from "@/lib/utils";

type CatFilter = "all" | string;

export default function CatalogoPage() {
  const [loading, setLoading] = useState(true);
  const [modelsList, setModelsList] = useState<any[]>([]);
  const [catFilter, setCatFilter] = useState<CatFilter>("all");
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
  const filtered = catFilter === "all" ? modelsList : modelsList.filter((m) => m.category === catFilter);

  function handleExportPdf() {
    window.open(`/api/catalogo?showPrices=${showPrices}`, "_blank");
  }

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
        <div className="range-selector">
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

      {/* Product grid */}
      {filtered.length === 0 ? (
        <div className="empty-state-card">
          <strong>Sin prendas en esta categoría.</strong> Ajusta el filtro o carga nuevos modelos para verlos aquí.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {filtered.map((m) =>
            m.colors.map((color: any) => {
              return (
                <div key={`${m.id}-${color.code}`} className="card" style={{ borderRadius: "var(--radius-5xl)", padding: 0, overflow: "hidden" }}>
                  {/* Image area */}
                  <div style={{
                    height: 140,
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
