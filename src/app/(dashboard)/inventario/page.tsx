"use client";

import { useState, useEffect, type ChangeEvent, type ComponentProps } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getInventoryModels,
  getModelDetail,
  adjustSkuStock,
  createModel,
  updateModelAction,
  deleteModelAction,
  getConfigData,
  addCategory,
  addColor,
  addColorsToModelAction,
  addColorToModelAction,
  removeColorFromModelAction,
  upsertModelColorImageAction,
  deleteModelColorImageAction,
} from "@/lib/db/actions";
import { formatUSD } from "@/lib/utils";
import { SETTINGS_KEYS, SYSTEM_DEFAULTS } from "@/lib/app-config";
import { SearchCreateSelect, type SearchCreateOption } from "@/components/ui/SearchCreateSelect";
import { useUser } from "../UserContext";

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
type FormSubmitEvent = Parameters<NonNullable<ComponentProps<"form">["onSubmit"]>>[0];

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("No se pudo leer la imagen seleccionada."));
    reader.readAsDataURL(file);
  });
}

/**
 * Downscale + re-encode the image in the browser before uploading. This keeps
 * the Server Action payload small (well under the 1MB default limit) and shrinks
 * what is stored in D1. Returns a JPEG data URL.
 */
async function compressImageToDataUrl(file: File, maxDim = 1280, quality = 0.82): Promise<string> {
  const sourceDataUrl = await readFileAsDataUrl(file);
  return new Promise<string>((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      let { width, height } = img;
      if (!width || !height) return resolve(sourceDataUrl);
      const scale = Math.min(1, maxDim / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(sourceDataUrl);
      ctx.fillStyle = "#ffffff"; // flatten any transparency for JPEG
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(sourceDataUrl);
      }
    };
    img.onerror = () => resolve(sourceDataUrl);
    img.src = sourceDataUrl;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useUser();
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
  const [newModelGender, setNewModelGender] = useState<"dama" | "caballero" | "unisex">("dama");
  const [newModelThreshold, setNewModelThreshold] = useState("3");
  const [selectedColorIds, setSelectedColorIds] = useState<number[]>([]);
  const [selectedSizeIds, setSelectedSizeIds] = useState<number[]>([]);
  const [colorSearch, setColorSearch] = useState("");

  // Adjust Stock Form State
  const [adjustSkuId, setAdjustSkuId] = useState<number | null>(null);
  const [adjustQty, setAdjustQty] = useState("5");
  const [adjustType, setAdjustType] = useState<"sum" | "sub">("sum");
  const [adjustReason, setAdjustReason] = useState("Entrada de importación");

  // Edit Model Form State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editComp, setEditComp] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editGender, setEditGender] = useState<"dama" | "caballero" | "unisex">("dama");
  const [editThreshold, setEditThreshold] = useState("3");

  // Add Color to Model Modal State
  const [showAddColorModal, setShowAddColorModal] = useState(false);
  const [selectedNewColorIds, setSelectedNewColorIds] = useState<number[]>([]);
  const [colorModalSearch, setColorModalSearch] = useState("");
  const [showCreateColorInline, setShowCreateColorInline] = useState(false);
  const [inlineColorCode, setInlineColorCode] = useState("");
  const [inlineColorName, setInlineColorName] = useState("");
  const [inlineColorHex, setInlineColorHex] = useState("#15151A");

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
      const [data, config] = await Promise.all([
        getInventoryModels(),
        getConfigData(),
      ]);
      setModelsList(data);
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

  useEffect(() => {
    if (searchParams.get("newModel") !== "1") return;
    setErrorMsg("");
    setShowAddModal(true);
    router.replace("/inventario");
  }, [router, searchParams]);

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
  const detailThreshold = detailModel?.lowStockThreshold ?? threshold;

  function getSkuStock(colorId: number, sizeId: number | null): number {
    const s = detailSkus.find((x: any) => x.colorId === colorId && x.sizeId === sizeId);
    return s ? s.stock : 0;
  }

  const modelTotalStockVal = detailSkus.reduce((sum: number, x: any) => sum + x.stock, 0);
  const lowSkuCount = detailSkus.filter((x: any) => x.stock <= detailThreshold).length;

  // Searchable options for the adjust-stock picker — typing filters by code,
  // color or size instead of scrolling a long native <select> (relevant for
  // models with many color/size combinations).
  const skuOptions: SearchCreateOption[] = detailSkus.map((sku: any) => {
    const color = detailColors.find((c: any) => c.id === sku.colorId);
    const size = sku.sizeId ? detailSizes.find((s: any) => s.id === sku.sizeId) : null;
    const descriptor = [color?.name, size?.name].filter(Boolean).join(" · ");
    return {
      value: String(sku.id),
      label: sku.compositeCode,
      meta: `${descriptor ? descriptor + " · " : ""}Stock actual: ${sku.stock}`,
      keywords: [sku.compositeCode, color?.name, color?.code, size?.name].filter(Boolean) as string[],
    };
  });

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
      gender: newModelGender,
      lowStockThreshold: Number.parseInt(newModelThreshold, 10),
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
      setNewModelThreshold("3");
      setSelectedColorIds([]);
      setSelectedSizeIds([]);
      setColorSearch("");
      loadModels();
    } else {
      setErrorMsg(res.error || "Error al crear modelo");
    }
  }

  function openEditModel() {
    if (!detailModel) return;
    setEditName(detailModel.name);
    setEditCategory(detailModel.category || "");
    setEditComp(detailModel.composition || "");
    setEditPrice(String(detailModel.basePrice ?? ""));
    setEditCost(String(detailModel.avgCost ?? ""));
    setEditGender(detailModel.gender || "dama");
    setEditThreshold(String(detailModel.lowStockThreshold ?? 3));
    setErrorMsg("");
    setShowEditModal(true);
  }

  async function handleUpdateModel(e: FormSubmitEvent) {
    e.preventDefault();
    if (!detailModel || !editName.trim() || !editCategory.trim()) return;
    const price = parseFloat(editPrice);
    if (!Number.isFinite(price) || price < 0) {
      setErrorMsg("Indique un precio válido.");
      return;
    }
    setSubmitting(true);
    setErrorMsg("");
    const parsedCost = parseFloat(editCost);
    const res = await updateModelAction({
      id: detailModel.id,
      name: editName.trim(),
      categoryName: editCategory.trim(),
      composition: editComp,
      basePrice: price,
      gender: editGender,
      avgCost: Number.isFinite(parsedCost) && parsedCost >= 0 ? parsedCost : undefined,
      lowStockThreshold: Number.parseInt(editThreshold, 10),
    });
    setSubmitting(false);
    if (res.success) {
      setShowEditModal(false);
      await loadDetailById(detailModel.id);
      loadModels();
    } else {
      setErrorMsg(res.error || "Error al actualizar modelo");
    }
  }

  async function handleDeleteModel() {
    if (!detailModel) return;
    if (!window.confirm(`¿Eliminar el modelo ${detailModel.id} (${detailModel.name})? Esta acción no se puede deshacer.`)) return;
    setSubmitting(true);
    setErrorMsg("");
    const res = await deleteModelAction(detailModel.id);
    setSubmitting(false);
    if (res.success) {
      setDetailId(null);
      setModelDetail(null);
      loadModels();
    } else {
      setErrorMsg(res.error || "Error al eliminar modelo");
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
    // Accept large source photos (e.g. straight from a phone); they are
    // downscaled client-side before upload.
    if (file.size > 25_000_000) {
      setErrorMsg("La imagen es demasiado grande (máx. 25 MB).");
      return;
    }

    try {
      setErrorMsg("");
      setImageBusyColorId(colorId);
      const imageDataUrl = await compressImageToDataUrl(file);
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

  async function handleAddColorsToModel(e?: FormSubmitEvent) {
    if (e) e.preventDefault();
    if (!detailId || selectedNewColorIds.length === 0) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      const res = await addColorsToModelAction(detailId, selectedNewColorIds);
      if (res.success) {
        setShowAddColorModal(false);
        setSelectedNewColorIds([]);
        setColorModalSearch("");
        setShowCreateColorInline(false);
        await loadDetailById(detailId);
        await loadModels();
      } else {
        setErrorMsg(res.error || "Error al agregar colores al modelo.");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Error al agregar colores.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateAndAddColorInline(e: FormSubmitEvent) {
    e.preventDefault();
    if (!detailId || !inlineColorCode.trim() || !inlineColorName.trim()) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      const addRes = await addColor(inlineColorCode.trim(), inlineColorName.trim(), inlineColorHex.trim());
      if (!addRes.success) {
        setErrorMsg(addRes.error || "Error al registrar el nuevo color.");
        return;
      }

      // Re-fetch config to get the newly added color
      const config = await getConfigData();
      setColorsDb(config.colors);

      const createdColorId = (addRes as any)?.color?.id || config.colors.find((c: any) => c.code.toLowerCase() === inlineColorCode.trim().toLowerCase())?.id;
      if (createdColorId) {
        const attachRes = await addColorToModelAction(detailId, createdColorId);
        if (attachRes.success) {
          setShowAddColorModal(false);
          setSelectedNewColorIds([]);
          setColorModalSearch("");
          setInlineColorCode("");
          setInlineColorName("");
          setShowCreateColorInline(false);
          await loadDetailById(detailId);
          await loadModels();
        } else {
          setErrorMsg(attachRes.error || "El color fue creado pero ocurrió un problema al vincularlo al modelo.");
        }
      } else {
        setErrorMsg("Color creado, pero no se pudo determinar su ID para vincularlo.");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Error al crear el color.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveColor(colorId: number, colorName: string, colorCode: string) {
    if (!detailId) return;
    if (!window.confirm(`¿Quitar el color ${colorName} (${colorCode}) del modelo? Se eliminarán los SKUs asociados a este color si no tienen stock ni historial.`)) {
      return;
    }
    setSubmitting(true);
    setErrorMsg("");
    try {
      const res = await removeColorFromModelAction(detailId, colorId);
      if (res.success) {
        await loadDetailById(detailId);
        await loadModels();
      } else {
        setErrorMsg(res.error || "No se pudo quitar el color del modelo.");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Error al quitar color.");
    } finally {
      setSubmitting(false);
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div className="section-label" style={{ marginBottom: 6 }}>Existencias · foto por color</div>
                <h2 style={{ fontSize: "var(--text-3xl)", fontWeight: 800, letterSpacing: "-0.02em" }}>
                  {detailModel.name}
                </h2>
                <div className="font-mono" style={{ fontSize: "var(--text-base2)", color: "var(--text-muted)", marginTop: 2, marginBottom: 20 }}>
                  {detailModel.id} · {detailModel.category} · {detailModel.gender === "caballero" ? "Caballero" : detailModel.gender === "unisex" ? "Unisex" : "Dama"}
                </div>
              </div>
              {(user?.role === "admin" || user?.role === "usuario") && (
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button className="btn btn-secondary btn-sm" onClick={openEditModel}>Editar</button>
                  {user?.role === "admin" && (
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ color: "var(--danger)" }}
                      onClick={handleDeleteModel}
                      disabled={submitting}
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              )}
            </div>
            {errorMsg && (
              <div className="alert-banner alert-banner-danger" style={{ marginBottom: 14 }}>
                <p>{errorMsg}</p>
              </div>
            )}

            {/* Header for colors section with "Agregar color" button */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingBottom: 12,
              marginBottom: 8,
              borderBottom: "1px solid var(--border-light)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>
                  Colores del modelo ({detailColors.length})
                </span>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  {detailModel.type === "con_tallas" ? "Con matriz de tallas" : "Talla única"}
                </span>
              </div>
              {(user?.role === "admin" || user?.role === "usuario") && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  onClick={() => {
                    setErrorMsg("");
                    setSelectedNewColorIds([]);
                    setColorModalSearch("");
                    setShowCreateColorInline(false);
                    setShowAddColorModal(true);
                  }}
                >
                  {plusIcon} Agregar color
                </button>
              )}
            </div>

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
                          <span style={stockCellStyle(v, detailThreshold)}>{v}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Remove color action */}
                  {(user?.role === "admin" || user?.role === "usuario") && (
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{
                          color: detailColors.length <= 1 ? "var(--text-muted)" : "var(--danger)",
                          borderColor: "transparent",
                          background: "transparent",
                          padding: "6px 8px",
                          fontSize: "var(--text-xs)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          cursor: detailColors.length <= 1 ? "not-allowed" : "pointer",
                        }}
                        disabled={detailColors.length <= 1 || submitting}
                        title={
                          detailColors.length <= 1
                            ? "El modelo debe tener al menos un color registrado"
                            : `Quitar color ${color.name} (${color.code})`
                        }
                        onClick={() => handleRemoveColor(color.id, color.name, color.code)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        Quitar color
                      </button>
                    </div>
                  )}
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
                  <span style={stockCellStyle(v, detailThreshold)}>{v} und</span>

                  {/* Remove color action */}
                  {(user?.role === "admin" || user?.role === "usuario") && (
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{
                          color: detailColors.length <= 1 ? "var(--text-muted)" : "var(--danger)",
                          borderColor: "transparent",
                          background: "transparent",
                          padding: "6px 8px",
                          fontSize: "var(--text-xs)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          cursor: detailColors.length <= 1 ? "not-allowed" : "pointer",
                        }}
                        disabled={detailColors.length <= 1 || submitting}
                        title={
                          detailColors.length <= 1
                            ? "El modelo debe tener al menos un color registrado"
                            : `Quitar color ${color.name} (${color.code})`
                        }
                        onClick={() => handleRemoveColor(color.id, color.name, color.code)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        Quitar color
                      </button>
                    </div>
                  )}
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

                
                <div style={{ marginBottom: 14 }}>
                  <SearchCreateSelect
                    label="Seleccionar SKU / Variación"
                    value={adjustSkuId ? String(adjustSkuId) : ""}
                    options={skuOptions}
                    onChange={(v) => setAdjustSkuId(v ? Number(v) : null)}
                    placeholder="Buscar por código, color o talla…"
                    emptyMessage="No hay variaciones con ese criterio."
                  />
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

                <div className="modal-footer-sticky">
                  {errorMsg && <div className="alert-banner alert-banner-danger" style={{ marginBottom: 0 }}><p>{errorMsg}</p></div>}
                  <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowAdjustModal(false)}>Cancelar</button>
                    <button type="submit" className="btn btn-primary" disabled={submitting}>Aplicar Ajuste</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {showEditModal && detailModel && (
          <div className="modal-backdrop">
            <div className="modal" style={{ maxWidth: 480 }}>
              <div className="modal-header">
                <h2>Editar modelo {detailModel.id}</h2>
                <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
              </div>
              <form onSubmit={handleUpdateModel}>


                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Nombre</label>
                  <input className="input" type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Categoría</label>
                  <input className="input" type="text" list="edit-model-categories" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} required />
                  <datalist id="edit-model-categories">
                    {categoriesDb.map((c: any) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Composición</label>
                  <input className="input" type="text" value={editComp} onChange={(e) => setEditComp(e.target.value)} />
                </div>

                <div className="grid-2" style={{ gap: 14, marginBottom: 16 }}>
                  <div>
                    <label className="input-label">Precio de venta (USD)</label>
                    <input className="input" type="number" min="0" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} required />
                  </div>
                  <div>
                    <label className="input-label">Costo (USD)</label>
                    <input className="input" type="number" min="0" step="0.01" value={editCost} onChange={(e) => setEditCost(e.target.value)} placeholder="Costo unitario" />
                  </div>
                </div>
                <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: 16, marginTop: -6 }}>
                  El costo se aplica a las variantes sin stock. Cuando registres compras, el costo promedio se recalcula automáticamente.
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label className="input-label">Umbral de stock bajo</label>
                  <input className="input" type="number" min="0" step="1" value={editThreshold} onChange={(e) => setEditThreshold(e.target.value)} placeholder="3" style={{ maxWidth: 160 }} />
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: 4 }}>Las tallas con stock ≤ este número se marcan como bajas. Por defecto 3.</div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label className="input-label">Género</label>
                  <div className="range-selector" style={{ width: "max-content" }}>
                    <button type="button" className={`range-btn ${editGender === "dama" ? "active" : ""}`} onClick={() => setEditGender("dama")}>Dama</button>
                    <button type="button" className={`range-btn ${editGender === "caballero" ? "active" : ""}`} onClick={() => setEditGender("caballero")}>Caballero</button>
                    <button type="button" className={`range-btn ${editGender === "unisex" ? "active" : ""}`} onClick={() => setEditGender("unisex")}>Unisex</button>
                  </div>
                </div>

                {/* Colors section in edit modal */}
                <div style={{
                  marginBottom: 20,
                  padding: "12px 14px",
                  background: "var(--bg-subtle)",
                  borderRadius: 10,
                  border: "1px solid var(--border-light)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>
                      Colores del modelo ({detailColors.length})
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }}
                      onClick={() => {
                        setShowEditModal(false);
                        setSelectedNewColorIds([]);
                        setColorModalSearch("");
                        setShowCreateColorInline(false);
                        setShowAddColorModal(true);
                      }}
                    >
                      + Agregar color
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {detailColors.map((c: any) => (
                      <span
                        key={c.id}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 8px",
                          borderRadius: 8,
                          background: "#fff",
                          border: "1px solid var(--border-light)",
                          fontSize: "var(--text-xs)",
                          fontWeight: 600,
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: c.hex,
                            border: "1px solid rgba(0,0,0,0.15)",
                          }}
                        />
                        <span style={{ color: "var(--text-muted)", fontWeight: 700 }}>{c.code}</span>
                        <span>{c.name}</span>
                        {detailColors.length > 1 && (
                          <button
                            type="button"
                            title={`Quitar color ${c.name} (${c.code})`}
                            style={{
                              border: "none",
                              background: "none",
                              cursor: "pointer",
                              padding: "0 2px",
                              color: "var(--danger)",
                              fontSize: 14,
                              lineHeight: 1,
                              marginLeft: 2,
                            }}
                            onClick={async () => {
                              await handleRemoveColor(c.id, c.name, c.code);
                            }}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="modal-footer-sticky">
                  {errorMsg && <div className="alert-banner alert-banner-danger" style={{ marginBottom: 0 }}><p>{errorMsg}</p></div>}
                  <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancelar</button>
                    <button type="submit" className="btn btn-primary" disabled={submitting}>Guardar cambios</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* --- ADD COLOR TO MODEL MODAL --- */}
        {showAddColorModal && detailModel && (
          <div className="modal-backdrop">
            <div className="modal" style={{ maxWidth: 520 }}>
              <div className="modal-header">
                <div>
                  <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>Agregar Color al Modelo</h2>
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: 2 }}>
                    {detailModel.id} · {detailModel.name}
                  </div>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => {
                    setShowAddColorModal(false);
                    setSelectedNewColorIds([]);
                    setShowCreateColorInline(false);
                  }}
                >
                  ×
                </button>
              </div>

              {!showCreateColorInline ? (
                <form onSubmit={handleAddColorsToModel}>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <label className="input-label" style={{ marginBottom: 0 }}>Seleccionar de la paleta</label>
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                        {selectedNewColorIds.length} seleccionado(s)
                      </span>
                    </div>

                    <input
                      className="input"
                      type="text"
                      placeholder="Buscar por código o nombre (ej. Z16, Verde)..."
                      value={colorModalSearch}
                      onChange={(e) => setColorModalSearch(e.target.value)}
                      style={{ marginBottom: 10 }}
                    />

                    {/* Palette swatches excluding colors already on the model */}
                    {(() => {
                      const existingIds = new Set(detailColors.map((dc: any) => dc.id));
                      const availableColors = colorsDb.filter((c: any) => !existingIds.has(c.id));
                      const filteredAvailable = availableColors.filter((c: any) => {
                        const q = colorModalSearch.trim().toLowerCase();
                        if (!q) return true;
                        return `${c.code} ${c.name}`.toLowerCase().includes(q);
                      });

                      if (availableColors.length === 0) {
                        return (
                          <div style={{
                            padding: "16px",
                            textAlign: "center",
                            background: "var(--bg-subtle)",
                            borderRadius: 8,
                            fontSize: "var(--text-sm)",
                            color: "var(--text-muted)",
                          }}>
                            Todos los colores registrados en el sistema ya están asignados a este modelo.
                          </div>
                        );
                      }

                      if (filteredAvailable.length === 0) {
                        return (
                          <div style={{
                            padding: "16px",
                            textAlign: "center",
                            background: "var(--bg-subtle)",
                            borderRadius: 8,
                            fontSize: "var(--text-sm)",
                            color: "var(--text-muted)",
                          }}>
                            No se encontraron colores con &quot;{colorModalSearch}&quot;.
                          </div>
                        );
                      }

                      return (
                        <div style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          maxHeight: 220,
                          overflowY: "auto",
                          padding: "4px 2px",
                        }}>
                          {filteredAvailable.map((c: any) => {
                            const active = selectedNewColorIds.includes(c.id);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  if (active) {
                                    setSelectedNewColorIds(selectedNewColorIds.filter((id) => id !== c.id));
                                  } else {
                                    setSelectedNewColorIds([...selectedNewColorIds, c.id]);
                                  }
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
                                <span
                                  style={{
                                    width: 12,
                                    height: 12,
                                    borderRadius: "50%",
                                    background: c.hex,
                                    border: "1px solid rgba(0,0,0,.15)",
                                  }}
                                />
                                <span style={{ color: "var(--text-muted)", fontWeight: 700 }}>{c.code}</span>
                                <span>{c.name}</span>
                                {active && (
                                  <span style={{ fontSize: 11, color: "#15151A", marginLeft: 2 }}>✓</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Option to create a new color in the system right here */}
                  <div style={{
                    padding: "10px 12px",
                    background: "var(--bg-subtle)",
                    borderRadius: 8,
                    marginBottom: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
                      ¿El color que buscas no existe en el catálogo?
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: "var(--text-xs)", padding: "4px 8px", flexShrink: 0 }}
                      onClick={() => setShowCreateColorInline(true)}
                    >
                      + Crear nuevo color
                    </button>
                  </div>

                  <div className="modal-footer-sticky">
                    {errorMsg && (
                      <div className="alert-banner alert-banner-danger" style={{ marginBottom: 0 }}>
                        <p>{errorMsg}</p>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setShowAddColorModal(false);
                          setSelectedNewColorIds([]);
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submitting || selectedNewColorIds.length === 0}
                      >
                        {submitting
                          ? "Agregando..."
                          : selectedNewColorIds.length > 1
                          ? `Agregar ${selectedNewColorIds.length} colores`
                          : "Agregar color al modelo"}
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                /* Inline Create & Add New Color Form */
                <form onSubmit={handleCreateAndAddColorInline}>
                  <div style={{
                    fontSize: "var(--text-sm)",
                    color: "var(--text-muted)",
                    marginBottom: 14,
                  }}>
                    Registra un nuevo color en el sistema y agrégalo directamente a este modelo.
                  </div>

                  <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                    <div>
                      <label className="input-label">Código (ej. Z35)</label>
                      <input
                        className="input"
                        type="text"
                        placeholder="Z35"
                        value={inlineColorCode}
                        onChange={(e) => setInlineColorCode(e.target.value.toUpperCase())}
                        required
                      />
                    </div>
                    <div>
                      <label className="input-label">Nombre del color</label>
                      <input
                        className="input"
                        type="text"
                        placeholder="Verde Militar"
                        value={inlineColorName}
                        onChange={(e) => setInlineColorName(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label className="input-label">Muestra de color (HEX)</label>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input
                        type="color"
                        value={inlineColorHex}
                        onChange={(e) => setInlineColorHex(e.target.value)}
                        style={{
                          width: 44,
                          height: 38,
                          borderRadius: 8,
                          border: "1px solid var(--border-light)",
                          cursor: "pointer",
                          padding: 2,
                        }}
                      />
                      <input
                        className="input"
                        type="text"
                        placeholder="#15151A"
                        value={inlineColorHex}
                        onChange={(e) => setInlineColorHex(e.target.value)}
                        style={{ maxWidth: 140, fontFamily: "var(--font-mono)" }}
                        required
                      />
                    </div>
                  </div>

                  <div className="modal-footer-sticky">
                    {errorMsg && (
                      <div className="alert-banner alert-banner-danger" style={{ marginBottom: 0 }}>
                        <p>{errorMsg}</p>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setShowCreateColorInline(false)}
                      >
                        Volver a la lista
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submitting || !inlineColorCode.trim() || !inlineColorName.trim()}
                      >
                        {submitting ? "Creando y asignando..." : "Crear y agregar"}
                      </button>
                    </div>
                  </div>
                </form>
              )}
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
        <button className="btn btn-secondary btn-sm" onClick={() => router.push("/catalogo")}>{catalogIcon} Generar catálogo</button>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            setErrorMsg("");
            setShowAddModal(true);
          }}
        >
          {plusIcon} Nuevo modelo
        </button>
      </div>

      {/* Models table */}
      <div className="table-container">
        {/* Column headers */}
        <div className="responsive-table-scroll">
        <div style={{
          display: "grid",
          gridTemplateColumns: "2.4fr 1fr 2fr 0.9fr 1fr 40px",
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
          const lowCount = m.skus.filter((s: any) => s.stock <= (m.lowStockThreshold ?? threshold) && s.stock > 0).length;
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
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: "var(--text-md2)", fontWeight: 600 }}>{m.name}</span>
                    <span className="badge badge-neutral" style={{ fontSize: "9px", padding: "1px 6px" }}>
                      {m.gender === "caballero" ? "Caballero" : m.gender === "unisex" ? "Unisex" : "Dama"}
                    </span>
                  </div>
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
              <div style={{ display: "flex", gap: 4, alignItems: "center", alignContent: "center", flexWrap: "wrap", minWidth: 0 }}>
                {m.colors.map((c: any) => (
                  <div key={c.code} className="color-swatch" title={`${c.code} · ${c.name}`} style={{ background: c.hex || "#ccc" }} />
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

              <div style={{ marginBottom: 14 }}>
                <label className="input-label">Género</label>
                <div className="range-selector" style={{ width: "max-content" }}>
                  <button type="button" className={`range-btn ${newModelGender === "dama" ? "active" : ""}`} onClick={() => setNewModelGender("dama")}>Dama</button>
                  <button type="button" className={`range-btn ${newModelGender === "caballero" ? "active" : ""}`} onClick={() => setNewModelGender("caballero")}>Caballero</button>
                  <button type="button" className={`range-btn ${newModelGender === "unisex" ? "active" : ""}`} onClick={() => setNewModelGender("unisex")}>Unisex</button>
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
                <label className="input-label">Umbral de stock bajo</label>
                <input className="input" type="number" min="0" step="1" value={newModelThreshold} onChange={(e) => setNewModelThreshold(e.target.value)} placeholder="3" style={{ maxWidth: 160 }} />
                <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: 4 }}>Las tallas con stock ≤ este número se marcan como bajas. Por defecto 3.</div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label className="input-label">Composición de tela</label>
                <input className="input" type="text" placeholder="94% Poliéster · 6% Spandex" value={newModelComp} onChange={(e) => setNewModelComp(e.target.value)} />
              </div>

              {/* Color swatches checklist with search */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label className="input-label" style={{ marginBottom: 0 }}>Colores disponibles</label>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{selectedColorIds.length} seleccionados</span>
                </div>
                <input
                  className="input"
                  type="text"
                  placeholder="Buscar color por código o nombre (ej. Z16, verde)…"
                  value={colorSearch}
                  onChange={(e) => setColorSearch(e.target.value)}
                  style={{ marginBottom: 10 }}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxHeight: 200, overflowY: "auto" }}>
                  {colorsDb
                    .filter((c) => {
                      const q = colorSearch.trim().toLowerCase();
                      if (!q) return true;
                      return `${c.code} ${c.name}`.toLowerCase().includes(q);
                    })
                    .map((c) => {
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
                          <span style={{ color: "var(--text-muted)", fontWeight: 700 }}>{c.code}</span>
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

              <div className="modal-footer-sticky">
                {errorMsg && <div className="alert-banner alert-banner-danger" style={{ marginBottom: 0 }}><p>{errorMsg}</p></div>}
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>Crear Modelo</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
