"use client";

import { useState, useEffect, type ChangeEvent, type ComponentProps } from "react";
import {
  getInventoryModels,
  getModelDetail,
  adjustSkuStock,
  createModel,
  getConfigData,
  addCategory,
  upsertModelColorImageAction,
  deleteModelColorImageAction,
} from "@/lib/db/actions";
import { formatUSD } from "@/lib/utils";
import { SETTINGS_KEYS, SYSTEM_DEFAULTS } from "@/lib/app-config";
import { SearchCreateSelect, type SearchCreateOption } from "@/components/ui/SearchCreateSelect";

/* ─── Filter categories ─── */
type FilterType = "all" | "uniformes" | "gorros" | "accesorios";
const uniformeCats = ["Cuello V", "Cuello Mao", "Cuello Neru", "Pantalón"];

function filterModelsList(models: any[], filter: FilterType) {
  return models.filter((m) => {
    if (filter === "all") return true;
    if (filter === "uniformes") return uniformeCats.includes(m.category);
    if (filter === "gorros") return m.category === "Gorros";
    if (filter === "accesorios") return m.category === "Accesorio";
    return true;
  });
}

/* ─── SVG icons ─── */
const chevronRight = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C4C4BC" strokeWidth="2.2" strokeLinecap="round">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

const chevronLeft = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

const plusIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const catalogIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const infoIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4M12 16h.01" />
  </svg>
);

/* ─── Product silhouette placeholder ─── */
function ProductThumb({ category }: { category: string }) {
  const isBig = uniformeCats.includes(category) || category === "Pantalón";
  const size = isBig ? 42 : 38;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        background: "#f0f0ec",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "#9A9A93" }}>
        {category.slice(0, 3).toUpperCase()}
      </span>
    </div>
  );
}

/* ─── Stock cell styling ─── */
function stockCellStyle(v: number, threshold = 5) {
  if (v === 0) return { fontSize: "12.5px", fontWeight: 700, color: "#C2392E", background: "#FBEAE8", borderRadius: 6, padding: "4px 10px", textAlign: "center" as const, minWidth: 40 };
  if (v <= threshold) return { fontSize: "12.5px", fontWeight: 700, color: "#B07A1A", background: "#FBF1E0", borderRadius: 6, padding: "4px 10px", textAlign: "center" as const, minWidth: 40 };
  return { fontSize: "12.5px", fontWeight: 600, color: "#4A4A45", background: "#F0EEE8", borderRadius: 6, padding: "4px 10px", textAlign: "center" as const, minWidth: 40 };
}

const COLOR_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";
const COLOR_IMAGE_MAX_BYTES = 1_500_000;
type FormSubmitEvent = Parameters<NonNullable<ComponentProps<"form">["onSubmit"]>>[0];

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("No se pudo leer la imagen seleccionada."));
    reader.readAsDataURL(file);
  });
}

function ColorImagePreview({
  color,
  imageUrl,
  size = 64,
}: {
  color: { name: string; hex: string };
  imageUrl?: string;
  size?: number;
}) {
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={`Foto del color ${color.name}`}
          style={{
            width: size,
            height: size,
            borderRadius: 12,
            objectFit: "cover",
            border: "1px solid var(--border-light)",
            background: "var(--bg-subtle)",
          }}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: 12,
            background: "linear-gradient(135deg, #f4f2ec, #ebe7dd)",
            border: "1px solid var(--border-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "#9A9A93" }}>
            IMG
          </span>
        </div>
      )}
      <div
        style={{
          position: "absolute",
          bottom: -3,
          right: -3,
          width: 16,
          height: 16,
          borderRadius: 5,
          background: color.hex,
          border: "2px solid #fff",
        }}
      />
    </div>
  );
}

export default function InventarioPage() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState(true);
  const [modelsList, setModelsList] = useState<any[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [modelDetail, setModelDetail] = useState<any | null>(null);

  // Config parameters from database
  const [colorsDb, setColorsDb] = useState<any[]>([]);
  const [sizesDb, setSizesDb] = useState<any[]>([]);
  const [categoriesDb, setCategoriesDb] = useState<any[]>([]);
  const [settingsDb, setSettingsDb] = useState<Record<string, string>>({});

  // Modal control
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  // Add Model Form State
  const [newModelId, setNewModelId] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [newModelCategory, setNewModelCategory] = useState("Cuello V");
  const [newModelComp, setNewModelComp] = useState("");
  const [newModelPrice, setNewModelPrice] = useState("28");
  const [newModelCost, setNewModelCost] = useState("16");
  const [newModelType, setNewModelType] = useState<"con_tallas" | "sin_tallas">("con_tallas");
  const [selectedColorIds, setSelectedColorIds] = useState<number[]>([]);
  const [selectedSizeIds, setSelectedSizeIds] = useState<number[]>([]);

  // Adjust Stock Form State
  const [adjustSkuId, setAdjustSkuId] = useState<number | null>(null);
  const [adjustQty, setAdjustQty] = useState("5");
  const [adjustType, setAdjustType] = useState<"sum" | "sub">("sum");
  const [adjustReason, setAdjustReason] = useState("Entrada de importación");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [imageBusyColorId, setImageBusyColorId] = useState<number | null>(null);

  const threshold = parseInt(
    settingsDb[SETTINGS_KEYS.lowStockThreshold] || String(SYSTEM_DEFAULTS.lowStockThreshold),
    10
  );

  async function loadModels() {
    try {
      setLoading(true);
      const data = await getInventoryModels();
      setModelsList(data);
      const config = await getConfigData();
      setColorsDb(config.colors);
      setSizesDb(config.sizes);
      setCategoriesDb(config.categories.filter((category: any) => category.type === "product"));
      setSettingsDb(config.settings);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadModels();
  }, []);

  const productCategoryOptions: SearchCreateOption[] = categoriesDb.map((category: any) => ({
    value: category.name,
    label: category.name,
    meta: "Categoría de producto",
  }));

  async function handleCreateProductCategory(query: string) {
    const name = query.trim();
    if (!name) return;
    setSubmitting(true);
    const res = await addCategory(name, "product");
    setSubmitting(false);
    if (!res.success) {
      throw new Error(res.error || "No se pudo crear la categoría.");
    }
    const config = await getConfigData();
    const productCategories = config.categories.filter((category: any) => category.type === "product");
    setCategoriesDb(productCategories);
    setNewModelCategory(name);
  }

  async function loadDetailById(modelId: string) {
    const detail = await getModelDetail(modelId);
    setModelDetail(detail);
  }

  // Watch detailId to load detail card
  useEffect(() => {
    async function loadDetail() {
      if (!detailId) {
        setModelDetail(null);
        return;
      }
      try {
        await loadDetailById(detailId);
      } catch (e) {
        console.error(e);
      }
    }
    loadDetail();
  }, [detailId]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "300px" }}>
        <div className="loader">Cargando inventario...</div>
      </div>
    );
  }

  // Model detail helpers
  const detailModel = modelDetail?.model;
  const detailColors = modelDetail?.colors || [];
  const detailSizes = modelDetail?.sizes || [];
  const detailSkus = modelDetail?.skus || [];

  function getSkuStock(colorId: number, sizeId: number | null): number {
    const s = detailSkus.find((x: any) => x.colorId === colorId && x.sizeId === sizeId);
    return s ? s.stock : 0;
  }

  const modelTotalStockVal = detailSkus.reduce((sum: number, x: any) => sum + x.stock, 0);
  const lowSkuCount = detailSkus.filter((x: any) => x.stock <= threshold).length;

  const filtered = filterModelsList(modelsList, filter);

  // Handlers
  async function handleCreateModel(e: FormSubmitEvent) {
    e.preventDefault();
    if (!newModelId || !newModelName || !newModelCategory) return;
    if (selectedColorIds.length === 0) {
      setErrorMsg("Debe seleccionar al menos un color");
      return;
    }
    if (newModelType === "con_tallas" && selectedSizeIds.length === 0) {
      setErrorMsg("Debe seleccionar al menos una talla");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    const res = await createModel({
      id: newModelId,
      name: newModelName,
      categoryName: newModelCategory,
      composition: newModelComp,
      basePrice: parseFloat(newModelPrice),
      avgCost: parseFloat(newModelCost),
      type: newModelType,
      colorIds: selectedColorIds,
      sizeIds: selectedSizeIds,
    });
    setSubmitting(false);

    if (res.success) {
      setShowAddModal(false);
      // reset states
      setNewModelId("");
      setNewModelName("");
      setNewModelComp("");
      setSelectedColorIds([]);
      setSelectedSizeIds([]);
      loadModels();
    } else {
      setErrorMsg(res.error || "Error al crear modelo");
    }
  }

  async function handleAdjustStock(e: FormSubmitEvent) {
    e.preventDefault();
    if (!adjustSkuId) return;
    const qty = parseInt(adjustQty);
    if (isNaN(qty) || qty <= 0) return;

    setSubmitting(true);
    setErrorMsg("");
    const actualQty = adjustType === "sum" ? qty : -qty;
    const res = await adjustSkuStock(adjustSkuId, actualQty, adjustReason);
    setSubmitting(false);

    if (res.success) {
      setShowAdjustModal(false);
      setAdjustSkuId(null);
      // Reload details
      if (detailId) {
        await loadDetailById(detailId);
      }
      loadModels();
    } else {
      setErrorMsg(res.error || "Error al ajustar stock");
    }
  }

  async function handleColorImageChange(colorId: number, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !detailId) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErrorMsg("Solo se permiten imágenes PNG, JPG o WEBP.");
      return;
    }
    if (file.size > COLOR_IMAGE_MAX_BYTES) {
      setErrorMsg("La imagen supera el tamaño máximo permitido de 1.5 MB.");
      return;
    }

    try {
      setErrorMsg("");
      setImageBusyColorId(colorId);
      const imageDataUrl = await readFileAsDataUrl(file);
      const res = await upsertModelColorImageAction({
        modelId: detailId,
        colorId,
        imageDataUrl,
      });

      if (!res.success) {
        setErrorMsg(res.error || "No se pudo guardar la foto por color.");
        return;
      }

      await loadDetailById(detailId);
      await loadModels();
    } catch (err: any) {
      setErrorMsg(err?.message || "No se pudo procesar la imagen seleccionada.");
    } finally {
      setImageBusyColorId(null);
    }
  }

  async function handleDeleteColorImage(colorId: number) {
    if (!detailId) return;

    try {
      setErrorMsg("");
      setImageBusyColorId(colorId);
      const res = await deleteModelColorImageAction(detailId, colorId);
      if (!res.success) {
        setErrorMsg(res.error || "No se pudo eliminar la foto por color.");
        return;
      }

      await loadDetailById(detailId);
      await loadModels();
    } finally {
      setImageBusyColorId(null);
    }
  }

  /* ─── Detail view ─── */
  if (detailId && detailModel) {
    return (
      <div className="animate-fade-in">
        {/* Back button */}
        <button
          onClick={() => setDetailId(null)}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-md)", color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 16 }}
        >
          {chevronLeft} Volver a inventario
        </button>

        <div className="grid-2-sidebar">
          {/* Main matrix card */}
          <div className="card" style={{ padding: 24, borderRadius: "var(--radius-5xl)" }}>
            <div className="section-label" style={{ marginBottom: 6 }}>Existencias · foto por color</div>
            <h2 style={{ fontSize: "var(--text-3xl)", fontWeight: 800, letterSpacing: "-0.02em" }}>
              {detailModel.name}
            </h2>
            <div className="font-mono" style={{ fontSize: "var(--text-base2)", color: "var(--text-muted)", marginTop: 2, marginBottom: 20 }}>
              {detailModel.id} · {detailModel.category}
            </div>
            {errorMsg && (
              <div className="alert-banner alert-banner-danger" style={{ marginBottom: 14 }}>
                <p>{errorMsg}</p>
              </div>
            )}

            {/* Sin tallas info banner */}
            {detailModel.type === "sin_tallas" && (
              <div style={{
                background: "var(--warning-info-bg)",
                border: "1px solid var(--warning-info-border)",
                borderRadius: 9,
                padding: "9px 13px",
                fontSize: "var(--text-base)",
                color: "var(--warning-info-text)",
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                {infoIcon}
                Producto sin tallas — SKU por modelo + color únicamente.
              </div>
            )}

            {/* Con tallas: color×talla matrix */}
            {detailModel.type === "con_tallas" && detailColors.map((color: any) => {
              const colorBusy = imageBusyColorId === color.id;
              return (
                <div key={color.code} style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", padding: "14px 0", borderTop: "1px solid var(--border-light)" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 84 }}>
                    <ColorImagePreview color={color} imageUrl={color.imageUrl} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <label
                        className="btn btn-secondary btn-sm"
                        style={{ cursor: colorBusy ? "progress" : "pointer", justifyContent: "center" }}
                      >
                        {colorBusy ? "Guardando..." : color.imageUrl ? "Cambiar foto" : "Subir foto"}
                        <input
                          type="file"
                          accept={COLOR_IMAGE_ACCEPT}
                          style={{ display: "none" }}
                          disabled={colorBusy}
                          onChange={(e) => handleColorImageChange(color.id, e)}
                        />
                      </label>
                      {color.imageUrl && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={colorBusy}
                          onClick={() => handleDeleteColorImage(color.id)}
                        >
                          Quitar foto
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Color name */}
                  <div style={{ flex: "none", width: 110 }}>
                    <div style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{color.name}</div>
                    <div className="font-mono" style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{color.code}</div>
                  </div>

                  {/* Talla cells */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
                    {detailSizes.map((size: any) => {
                      const v = getSkuStock(color.id, size.id);
                      return (
                        <div key={size.name} style={{ textAlign: "center" }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 10, color: "var(--text-muted)", marginBottom: 5 }}>{size.name}</div>
                          <span style={stockCellStyle(v, threshold)}>{v}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Sin tallas: simple row per color */}
            {detailModel.type === "sin_tallas" && detailColors.map((color: any) => {
              const v = getSkuStock(color.id, null);
              const colorBusy = imageBusyColorId === color.id;
              return (
                <div key={color.code} style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", padding: "14px 0", borderTop: "1px solid var(--border-light)" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <ColorImagePreview color={color} imageUrl={color.imageUrl} />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <label
                        className="btn btn-secondary btn-sm"
                        style={{ cursor: colorBusy ? "progress" : "pointer", justifyContent: "center" }}
                      >
                        {colorBusy ? "Guardando..." : color.imageUrl ? "Cambiar foto" : "Subir foto"}
                        <input
                          type="file"
                          accept={COLOR_IMAGE_ACCEPT}
                          style={{ display: "none" }}
                          disabled={colorBusy}
                          onChange={(e) => handleColorImageChange(color.id, e)}
                        />
                      </label>
                      {color.imageUrl && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={colorBusy}
                          onClick={() => handleDeleteColorImage(color.id)}
                        >
                          Quitar foto
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "var(--text-md2)", fontWeight: 600 }}>{color.name}</div>
                    <div className="font-mono" style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                      {detailModel.id}-{color.code}
                    </div>
                  </div>
                  <span style={stockCellStyle(v, threshold)}>{v} und</span>
                </div>
              );
            })}
          </div>

          {/* Sidebar: Summary + Composition */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Summary card */}
            <div className="card" style={{ borderRadius: "var(--radius-5xl)", padding: 20 }}>
              <div className="section-label" style={{ marginBottom: 14 }}>Resumen</div>
              {[
                { label: "Stock total", value: `${modelTotalStockVal} und` },
                { label: "SKUs activos", value: String(detailSkus.length) },
                { label: "Bajo umbral", value: String(lowSkuCount), color: lowSkuCount > 0 ? "var(--danger)" : undefined },
                { label: "Costo prom.", value: formatUSD(detailModel.avgCost) },
                { label: "Precio venta", value: formatUSD(detailModel.basePrice) },
              ].map((row, i, arr) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", padding: "8px 0",
                  borderBottom: i < arr.length - 1 ? "1px solid var(--border-light)" : "none",
                }}>
                  <span style={{ fontSize: "var(--text-md)", color: "var(--text-tertiary)" }}>{row.label}</span>
                  <span style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: row.color }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Composition card */}
            <div className="card" style={{ borderRadius: "var(--radius-5xl)", padding: 20 }}>
              <div className="section-label" style={{ marginBottom: 6 }}>Composición</div>
              <div style={{ fontSize: "var(--text-md)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {detailModel.composition || "Sin composición registrada"}
              </div>
            </div>

            {/* Adjust stock button */}
            <button
              className="btn btn-primary btn-block"
              style={{ padding: 12, borderRadius: "var(--radius-2xl)" }}
              onClick={() => {
                setErrorMsg("");
                setAdjustSkuId(detailSkus[0]?.id || null);
                setShowAdjustModal(true);
              }}
            >
              Ajustar stock
            </button>
          </div>
        </div>

        {/* --- ADJUST STOCK MODAL --- */}
        {showAdjustModal && (
          <div className="modal-backdrop">
            <div className="modal" style={{ maxWidth: 440 }}>
              <div className="modal-header">
                <h2>Ajustar Existencias</h2>
                <button className="modal-close" onClick={() => setShowAdjustModal(false)}>×</button>
              </div>
              <form onSubmit={handleAdjustStock}>
                {errorMsg && <div className="alert-banner alert-banner-danger" style={{ marginBottom: 14 }}><p>{errorMsg}</p></div>}
                
                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Seleccionar SKU / Variación</label>
                  <select
                    className="input"
                    value={adjustSkuId || ""}
                    onChange={(e) => setAdjustSkuId(Number(e.target.value))}
                    required
                  >
                    {detailSkus.map((sku: any) => (
                      <option key={sku.id} value={sku.id}>
                        {sku.compositeCode} (Stock actual: {sku.stock})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Tipo de ajuste</label>
                  <div className="range-selector" style={{ width: "max-content" }}>
                    <button type="button" className={`range-btn ${adjustType === "sum" ? "active" : ""}`} onClick={() => setAdjustType("sum")}>Agregar (+)</button>
                    <button type="button" className={`range-btn ${adjustType === "sub" ? "active" : ""}`} onClick={() => setAdjustType("sub")}>Descontar (-)</button>
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Cantidad</label>
                  <input className="input" type="number" min="1" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} required />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label className="input-label">Motivo del ajuste</label>
                  <input className="input" type="text" placeholder="Entrada de importación, conteo físico, etc." value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} required />
                </div>

                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAdjustModal(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>Aplicar Ajuste</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─── List view ─── */
  return (
    <div className="animate-fade-in">
      {/* Filter bar */}
      <div className="page-toolbar">
        <div className="range-selector">
          {(["all", "uniformes", "gorros", "accesorios"] as FilterType[]).map((f) => (
            <button
              key={f}
              className={`range-btn ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "Todos" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="page-toolbar-spacer" />
        <button className="btn btn-secondary btn-sm">{catalogIcon} Generar catálogo</button>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            setErrorMsg("");
            setShowAddModal(true);
          }}
        >
          {plusIcon} Cargar mercancía
        </button>
      </div>

      {/* Models table */}
      <div className="table-container">
        {/* Column headers */}
        <div className="responsive-table-scroll">
        <div style={{
          display: "grid",
          gridTemplateColumns: "2.6fr 1.1fr 1.4fr 0.9fr 1fr 40px",
          gap: 14,
          minWidth: 860,
          padding: "14px 22px",
          borderBottom: "1px solid var(--border-header)",
          font: "600 10.5px/1 var(--font-sans)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}>
          <span>Modelo</span>
          <span>Categoría</span>
          <span>Colores</span>
          <span>Precio</span>
          <span>Stock</span>
          <span />
        </div>

        {/* Model rows */}
        {filtered.map((m) => {
          const hasZero = m.skus.some((s: any) => s.stock === 0);
          const lowCount = m.skus.filter((s: any) => s.stock <= threshold && s.stock > 0).length;
          const tagLabel = hasZero ? "Agotado" : lowCount > 0 ? `${lowCount} bajo` : "";
          const tagClass = hasZero ? "badge badge-danger" : lowCount > 0 ? "badge badge-warning" : "";

          return (
            <div
              key={m.id}
              className="table-row"
              style={{
                display: "grid",
                gridTemplateColumns: "2.6fr 1.1fr 1.4fr 0.9fr 1fr 40px",
                gap: 14,
                minWidth: 860,
                cursor: "pointer",
              }}
              onClick={() => setDetailId(m.id)}
            >
              {/* Model info */}
              <div style={{ display: "flex", alignItems: "center", gap: 13, minWidth: 0 }}>
                <ProductThumb category={m.category} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "var(--text-md2)", fontWeight: 600 }}>{m.name}</div>
                  <div className="font-mono" style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                    {m.id} · {m.composition}
                  </div>
                </div>
              </div>

              {/* Category */}
              <span style={{ fontSize: "var(--text-base2)", color: "var(--text-secondary)", display: "flex", alignItems: "center" }}>
                {m.category}
              </span>

              {/* Color dots */}
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {m.colors.map((c: any) => (
                  <div key={c.code} className="color-swatch" title={c.name} style={{ background: c.hex || "#ccc" }} />
                ))}
              </div>

              {/* Price */}
              <span style={{ fontSize: "var(--text-md2)", fontWeight: 700, display: "flex", alignItems: "center" }}>
                {formatUSD(m.basePrice)}
              </span>

              {/* Stock */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>{m.totalStock}</span>
                {tagLabel && <span className={tagClass}>{tagLabel}</span>}
              </div>

              {/* Chevron */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                {chevronRight}
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {/* --- ADD MODEL MODAL --- */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h2>Cargar Nueva Mercancía (Modelo)</h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateModel}>
              {errorMsg && <div className="alert-banner alert-banner-danger" style={{ marginBottom: 14 }}><p>{errorMsg}</p></div>}

              <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
                <div>
                  <label className="input-label">Código del modelo (ej: 42168)</label>
                  <input className="input" type="text" placeholder="42168" value={newModelId} onChange={(e) => setNewModelId(e.target.value)} required />
                </div>
                <div>
                  <label className="input-label">Nombre comercial</label>
                  <input className="input" type="text" placeholder="Cuello V bota recta" value={newModelName} onChange={(e) => setNewModelName(e.target.value)} required />
                </div>
              </div>

              <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
                <div>
                  <SearchCreateSelect
                    label="Categoría"
                    value={newModelCategory}
                    options={productCategoryOptions}
                    onChange={setNewModelCategory}
                    onCreate={handleCreateProductCategory}
                    placeholder="Buscar o crear categoría"
                    createLabel={(query) => `+ Crear categoría "${query}"`}
                    emptyMessage="No hay categorías con ese criterio."
                  />
                </div>
                <div>
                  <label className="input-label">Tipo de producto</label>
                  <select className="input" value={newModelType} onChange={(e) => setNewModelType(e.target.value as any)}>
                    <option value="con_tallas">Con Matriz de Tallas (XS-2XL)</option>
                    <option value="sin_tallas">Talla Única (sin matriz)</option>
                  </select>
                </div>
              </div>

              <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
                <div>
                  <label className="input-label">Precio de venta (USD)</label>
                  <input className="input" type="number" step="0.5" value={newModelPrice} onChange={(e) => setNewModelPrice(e.target.value)} required />
                </div>
                <div>
                  <label className="input-label">Costo promedio inicial (USD)</label>
                  <input className="input" type="number" step="0.5" value={newModelCost} onChange={(e) => setNewModelCost(e.target.value)} required />
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label className="input-label">Composición de tela</label>
                <input className="input" type="text" placeholder="94% Poliéster · 6% Spandex" value={newModelComp} onChange={(e) => setNewModelComp(e.target.value)} />
              </div>

              {/* Color swatches checklist */}
              <div style={{ marginBottom: 14 }}>
                <label className="input-label">Colores disponibles</label>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                  {colorsDb.map((c) => {
                    const active = selectedColorIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          if (active) setSelectedColorIds(selectedColorIds.filter(id => id !== c.id));
                          else setSelectedColorIds([...selectedColorIds, c.id]);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: active ? "1.5px solid #15151A" : "1.5px solid var(--border-light)",
                          background: active ? "#F0EEE8" : "#fff",
                          cursor: "pointer",
                          fontSize: "var(--text-sm2)",
                          fontWeight: 600,
                        }}
                      >
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.hex, border: "1px solid rgba(0,0,0,.1)" }} />
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Size checklist (if con_tallas) */}
              {newModelType === "con_tallas" && (
                <div style={{ marginBottom: 20 }}>
                  <label className="input-label">Tallas aplicables</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    {sizesDb.map((s) => {
                      const active = selectedSizeIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            if (active) setSelectedSizeIds(selectedSizeIds.filter(id => id !== s.id));
                            else setSelectedSizeIds([...selectedSizeIds, s.id]);
                          }}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 8,
                            border: active ? "1.5px solid #15151A" : "1.5px solid var(--border-light)",
                            background: active ? "#F0EEE8" : "#fff",
                            cursor: "pointer",
                            fontSize: "var(--text-sm2)",
                            fontWeight: 700,
                            minWidth: 42,
                            textAlign: "center",
                          }}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>Crear Modelo</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
