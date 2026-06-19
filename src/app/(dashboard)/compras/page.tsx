"use client";

import { useState, useEffect } from "react";
import { useUser } from "../UserContext";
import {
  getSuppliers,
  createSupplier,
  getPurchasesData,
  createPurchase,
  receivePurchase,
  getInventoryModels,
} from "@/lib/db/actions";
import { formatUSD } from "@/lib/utils";
import { SearchCreateSelect, type SearchCreateOption } from "@/components/ui/SearchCreateSelect";

function estadoBadge(e: string): string {
  if (e === "recibida") return "badge badge-success";
  if (e === "en_transito") return "badge badge-warning";
  if (e === "borrador") return "badge badge-neutral";
  return "badge badge-neutral";
}

const plusIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const trashIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

export default function ComprasPage() {
  const user = useUser();
  const [loading, setLoading] = useState(true);
  const [suppliersList, setSuppliersList] = useState<any[]>([]);
  const [purchasesList, setPurchasesList] = useState<any[]>([]);
  const [modelsList, setModelsList] = useState<any[]>([]);

  // Modals
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  // New Supplier Form
  const [supName, setSupName] = useState("");
  const [supItems, setSupItems] = useState("");
  const [supContact, setSupContact] = useState("");

  // New Purchase Form
  const [purSupplierId, setPurSupplierId] = useState("");
  const [purDate, setPurDate] = useState(new Date().toISOString().slice(0, 10));
  const [purStatus, setPurStatus] = useState<"borrador" | "en_transito" | "recibida">("recibida");
  const [purNotes, setPurNotes] = useState("");
  const [purItems, setPurItems] = useState<{ skuId: number; quantity: number; unitCost: number; code: string }[]>([]);

  // Add Item to Purchase Form State
  const [itemSkuId, setItemSkuId] = useState<number | null>(null);
  const [itemQty, setItemQty] = useState("10");
  const [itemCost, setItemCost] = useState("16");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function loadData() {
    try {
      setLoading(true);
      const sups = await getSuppliers();
      setSuppliersList(sups);
      
      const purs = await getPurchasesData();
      setPurchasesList(purs);

      const models = await getInventoryModels();
      setModelsList(models);

      // set default selected items if lists loaded
      if (sups.length > 0) setPurSupplierId(String(sups[0].id));
      
      // Flatten all SKUs to choose from
      const flatSkus = models.flatMap((m) => m.skus);
      if (flatSkus.length > 0) {
        setItemSkuId(flatSkus[0].id);
        setItemCost(String(flatSkus[0].avgCost || 16));
      }

      setErrorMsg("");
    } catch (e) {
      console.error(e);
      setErrorMsg("Error al conectar base de datos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.role === "admin") {
      loadData();
      return;
    }

    setLoading(false);
  }, [user?.role]);

  if (user && user.role !== "admin") {
    return (
      <div className="access-state-card animate-pop-in" style={{ marginTop: 40 }}>
        <div className="access-state-icon" aria-hidden="true">!</div>
        <h2 className="state-title">Acceso no autorizado</h2>
        <p className="state-copy">
          Solo administraci&oacute;n puede consultar compras, costos y recepciones de mercanc&iacute;a.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "300px" }}>
        <div className="loader">Cargando módulo de compras...</div>
      </div>
    );
  }

  // Flatten SKUs for helper mapping in items dropdown
  const allSkusFlat = modelsList.flatMap((m) => m.skus);
  const supplierOptions: SearchCreateOption[] = suppliersList.map((supplier) => ({
    value: String(supplier.id),
    label: supplier.name,
    meta: supplier.contact || supplier.items || "Sin contacto",
    keywords: [supplier.items || "", supplier.contact || ""],
  }));
  const skuOptions: SearchCreateOption[] = allSkusFlat.map((sku) => ({
    value: String(sku.id),
    label: sku.compositeCode,
    meta: `${sku.stock} und · costo prom ${formatUSD(sku.avgCost || 0)}`,
    keywords: [sku.modelId || ""],
  }));

  // Form Submissions
  async function handleCreateSupplier(e: React.FormEvent) {
    e.preventDefault();
    if (!supName) return;
    setSubmitting(true);
    const res = await createSupplier(supName, supItems, supContact);
    setSubmitting(false);
    if (res.success) {
      setShowSupplierModal(false);
      setSupName("");
      setSupItems("");
      setSupContact("");
      loadData();
    } else {
      setErrorMsg(res.error || "Error al agregar proveedor");
    }
  }

  async function handleCreateSupplierFromSearch(query: string) {
    const name = query.trim();
    if (!name) return;
    setSubmitting(true);
    const res = await createSupplier(name, "", "");
    const freshSuppliers = await getSuppliers();
    setSuppliersList(freshSuppliers);
    setSubmitting(false);
    if (!res.success) {
      throw new Error(res.error || "Error al crear proveedor.");
    }
    const created = freshSuppliers.find((supplier: any) => supplier.name.toLowerCase() === name.toLowerCase());
    if (created) {
      setPurSupplierId(String(created.id));
    }
  }

  function handleAddItem() {
    if (!itemSkuId) return;
    const qty = parseInt(itemQty);
    const cost = parseFloat(itemCost);
    if (isNaN(qty) || qty <= 0 || isNaN(cost) || cost <= 0) return;

    const matchedSku = allSkusFlat.find((s) => s.id === itemSkuId);
    if (!matchedSku) return;

    // Check if already in items list
    const existsIndex = purItems.findIndex((x) => x.skuId === itemSkuId);
    if (existsIndex > -1) {
      const updated = [...purItems];
      updated[existsIndex].quantity += qty;
      // update cost to latest
      updated[existsIndex].unitCost = cost;
      setPurItems(updated);
    } else {
      setPurItems([
        ...purItems,
        {
          skuId: itemSkuId,
          quantity: qty,
          unitCost: cost,
          code: matchedSku.compositeCode,
        },
      ]);
    }
  }

  function handleRemoveItem(index: number) {
    setPurItems(purItems.filter((_, i) => i !== index));
  }

  async function handleCreatePurchase(e: React.FormEvent) {
    e.preventDefault();
    if (!purSupplierId || !purDate) return;
    if (purItems.length === 0) {
      setErrorMsg("Debe agregar al menos un SKU a la lista de compra.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    const res = await createPurchase({
      supplierId: parseInt(purSupplierId),
      date: purDate,
      status: purStatus,
      notes: purNotes,
      items: purItems.map((x) => ({
        skuId: x.skuId,
        quantity: x.quantity,
        unitCost: x.unitCost,
      })),
    });
    setSubmitting(false);

    if (res.success) {
      setShowPurchaseModal(false);
      setPurItems([]);
      setPurNotes("");
      loadData();
    } else {
      setErrorMsg(res.error || "Error al registrar compra");
    }
  }

  async function handleReceivePurchase(purchaseId: number) {
    if (!confirm("¿Está seguro de que desea marcar esta compra como RECIBIDA? Esto incrementará el stock de sus SKUs y actualizará el costo promedio ponderado.")) return;
    try {
      const res = await receivePurchase(purchaseId);
      if (res.success) {
        loadData();
      } else {
        alert(res.error);
      }
    } catch (e) {
      console.error(e);
      alert("Error al recibir compra.");
    }
  }

  // Calculate KPIs
  const monthlyPurchases = purchasesList.filter((p) => p.status === "recibida");
  const totalCostMonth = monthlyPurchases.reduce((sum, p) => sum + p.totalCost, 0);
  const totalUnitsMonth = monthlyPurchases.reduce((sum, p) => sum + p.totalUnits, 0);
  
  const pendingPurchases = purchasesList.filter((p) => p.status === "en_transito" || p.status === "borrador");

  return (
    <div className="animate-fade-in">
      {/* KPIs */}
      <div className="grid-3 mb-18">
        <div className="card card-dark card-compact">
          <div className="kpi-label">Compras del mes</div>
          <div style={{ fontSize: "var(--text-5xl)", fontWeight: 800, marginTop: 8 }}>
            {formatUSD(totalCostMonth)}
          </div>
          <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-sidebar-inactive)", marginTop: 2 }}>
            {monthlyPurchases.length} entradas recibidas
          </div>
        </div>
        <div className="card card-compact">
          <div className="section-label">Unidades ingresadas</div>
          <div style={{ fontSize: "var(--text-5xl)", fontWeight: 800, marginTop: 8 }}>{totalUnitsMonth} und</div>
          <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", marginTop: 2 }}>
            recalculan costo promedio
          </div>
        </div>
        <div className="card card-compact">
          <div className="section-label">Por recibir</div>
          <div style={{ fontSize: "var(--text-5xl)", fontWeight: 800, marginTop: 8 }}>
            {pendingPurchases.length} {pendingPurchases.length === 1 ? "lote" : "lotes"}
          </div>
          <div style={{ fontSize: "var(--text-sm2)", color: pendingPurchases.length > 0 ? "var(--warning)" : "var(--text-muted)", marginTop: 2 }}>
            {pendingPurchases.length > 0 ? "en tránsito / borrador" : "sin envíos pendientes"}
          </div>
        </div>
      </div>

      {/* Table + Suppliers */}
      <div className="grid-2-sidebar">
        {/* Purchases table */}
        <div className="table-container">
          <div className="table-header-row">
            <h3>Entradas de stock</h3>
            <button className="btn btn-primary btn-sm" onClick={() => { setErrorMsg(""); setShowPurchaseModal(true); }}>
              {plusIcon} Registrar entrada
            </button>
          </div>
          <div className="responsive-table-scroll">
          <div style={{
            display: "grid",
            gridTemplateColumns: "0.7fr 1.6fr 1.8fr 0.6fr 1.2fr 1fr",
            gap: 12,
            minWidth: 900,
            padding: "13px 22px",
            borderBottom: "1px solid var(--border-header)",
            font: "600 10px/1 var(--font-sans)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}>
            <span>Fecha</span><span>Proveedor</span><span>Ítems</span><span>Cant.</span><span>Costo Tot.</span><span style={{ textAlign: "right" }}>Acciones / Estado</span>
          </div>
          {purchasesList.map((p) => {
            const firstItemStr = p.items[0]
              ? `${p.items[0].compositeCode} (${p.items[0].quantity}u)`
              : "Sin ítems";
            const restCount = p.items.length - 1;
            const itemsSummary = restCount > 0 ? `${firstItemStr} + ${restCount}` : firstItemStr;

            return (
              <div key={p.id} className="table-row" style={{
                display: "grid",
                gridTemplateColumns: "0.7fr 1.6fr 1.8fr 0.6fr 1.2fr 1fr",
                gap: 12,
                minWidth: 900,
                alignItems: "center",
              }}>
                <span style={{ fontSize: "var(--text-base2)", color: "var(--text-tertiary)" }}>{p.date}</span>
                <span style={{ fontSize: "var(--text-base2)", fontWeight: 500 }}>{p.supplierName}</span>
                <span className="font-mono" style={{ fontSize: "var(--text-sm2)", color: "var(--text-secondary)" }}>{itemsSummary}</span>
                <span style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>{p.totalUnits}</span>
                <span style={{ fontSize: "var(--text-base2)", fontWeight: 600 }}>{formatUSD(p.totalCost)}</span>
                <span style={{ textAlign: "right", display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
                  {p.status !== "recibida" && (
                    <button
                      className="btn btn-secondary btn-xs"
                      onClick={() => handleReceivePurchase(p.id)}
                      style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "5px" }}
                    >
                      Recibir
                    </button>
                  )}
                  <span className={estadoBadge(p.status)}>{p.status === "recibida" ? "Recibido" : p.status === "en_transito" ? "En tránsito" : "Borrador"}</span>
                </span>
              </div>
            );
          })}
          </div>
        </div>

        {/* Suppliers sidebar */}
        <div className="card" style={{ borderRadius: "var(--radius-5xl)", padding: 20, height: "max-content" }}>
          <div className="section-label" style={{ marginBottom: 14 }}>Proveedores</div>
          {suppliersList.map((s) => (
            <div key={s.id} style={{ padding: "12px 0", borderTop: "1px solid var(--border-light)" }}>
              <div style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{s.name}</div>
              <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", marginTop: 1 }}>{s.items || "Sin items configurados"}</div>
              <div className="font-mono" style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: 3 }}>{s.contact || "Sin teléfono"}</div>
            </div>
          ))}
          <button className="btn btn-secondary btn-block" style={{ marginTop: 14 }} onClick={() => { setErrorMsg(""); setShowSupplierModal(true); }}>
            + Nuevo proveedor
          </button>
        </div>
      </div>

      {/* --- ADD SUPPLIER MODAL --- */}
      {showSupplierModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2>Agregar Nuevo Proveedor</h2>
              <button className="modal-close" onClick={() => setShowSupplierModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateSupplier}>
              {errorMsg && <div className="alert-banner alert-banner-danger" style={{ marginBottom: 14 }}><p>{errorMsg}</p></div>}
              
              <div style={{ marginBottom: 14 }}>
                <label className="input-label">Nombre de la Empresa</label>
                <input className="input" type="text" placeholder="TexTina Imports C.A." value={supName} onChange={(e) => setSupName(e.target.value)} required />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label className="input-label">Artículos provistos</label>
                <input className="input" type="text" placeholder="Scrubs · Gorros quirúrgicos" value={supItems} onChange={(e) => setSupItems(e.target.value)} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label className="input-label">Teléfono de contacto</label>
                <input className="input" type="text" placeholder="+58 424-555-5555" value={supContact} onChange={(e) => setSupContact(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowSupplierModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>Guardar Proveedor</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- REGISTER STOCK ENTRY MODAL --- */}
      {showPurchaseModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h2>Registrar Entrada de Stock (Compra)</h2>
              <button className="modal-close" onClick={() => setShowPurchaseModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreatePurchase}>
              {errorMsg && <div className="alert-banner alert-banner-danger" style={{ marginBottom: 14 }}><p>{errorMsg}</p></div>}

              <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
                <div>
                  <SearchCreateSelect
                    label="Proveedor"
                    value={purSupplierId}
                    options={supplierOptions}
                    onChange={setPurSupplierId}
                    onCreate={handleCreateSupplierFromSearch}
                    placeholder="Buscar o crear proveedor"
                    createLabel={(query) => `+ Crear proveedor "${query}"`}
                    emptyMessage="No hay proveedores con ese criterio."
                  />
                </div>
                <div>
                  <label className="input-label">Fecha de entrada</label>
                  <input className="input" type="date" value={purDate} onChange={(e) => setPurDate(e.target.value)} required />
                </div>
              </div>

              <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
                <div>
                  <label className="input-label">Estado de la entrega</label>
                  <select className="input" value={purStatus} onChange={(e) => setPurStatus(e.target.value as any)} required>
                    <option value="recibida">Recibido (Afecta stock y costo de inmediato)</option>
                    <option value="en_transito">En tránsito (Miami → Vzla, no afecta stock)</option>
                    <option value="borrador">Borrador (Cotización de importación)</option>
                  </select>
                </div>
                <div>
                  <label className="input-label">Notas / Lote de importación</label>
                  <input className="input" type="text" placeholder="Flete aéreo junio, lote #42" value={purNotes} onChange={(e) => setPurNotes(e.target.value)} />
                </div>
              </div>

              <div className="divider" style={{ margin: "16px 0" }} />
              
              {/* Item Adder */}
              <div style={{ background: "var(--bg-subtle)", padding: 16, borderRadius: "var(--radius-3xl)", marginBottom: 16 }}>
                <h4 style={{ fontSize: "var(--text-base2)", fontWeight: 700, marginBottom: 12 }}>Agregar SKU a la lista</h4>
                
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 12, alignItems: "flex-end" }}>
                  <div>
                    <SearchCreateSelect
                      label="Variación SKU"
                      value={itemSkuId ? String(itemSkuId) : ""}
                      options={skuOptions}
                      onChange={(selectedValue) => {
                        const val = Number(selectedValue);
                        setItemSkuId(val);
                        const matched = allSkusFlat.find((sku) => sku.id === val);
                        if (matched) setItemCost(String(matched.avgCost || 16));
                      }}
                      placeholder="Buscar SKU"
                      emptyMessage="No hay SKUs con ese criterio."
                    />
                  </div>
                  <div>
                    <label className="input-label" style={{ marginBottom: 4 }}>Cantidad (u)</label>
                    <input className="input" type="number" min="1" value={itemQty} onChange={(e) => setItemQty(e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label" style={{ marginBottom: 4 }}>Costo Unit. (USD)</label>
                    <input className="input" type="number" min="0.1" step="0.01" value={itemCost} onChange={(e) => setItemCost(e.target.value)} />
                  </div>
                  <button type="button" className="btn btn-secondary" style={{ padding: "10px 14px" }} onClick={handleAddItem}>
                    Agregar
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div style={{ marginBottom: 20 }}>
                <label className="input-label" style={{ marginBottom: 6 }}>SKUs cargados en esta compra</label>
                {purItems.length === 0 ? (
                  <div style={{ fontSize: "var(--text-base)", color: "var(--text-muted)", padding: "12px 0", borderBottom: "1px solid var(--border-light)" }}>
                    Lista vacía. Agrega SKUs arriba.
                  </div>
                ) : (
                  <div style={{ maxHeight: 180, overflowY: "auto" }}>
                    {purItems.map((item, idx) => (
                      <div key={idx} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "8px 12px", borderBottom: "1px solid var(--border-light)",
                        background: "#fff", borderRadius: 8, marginBottom: 6,
                      }}>
                        <span className="font-mono" style={{ fontSize: "var(--text-sm2)", fontWeight: 600 }}>{item.code}</span>
                        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
                          <span style={{ fontSize: "var(--text-base2)", color: "var(--text-secondary)" }}>{item.quantity} und · {formatUSD(item.unitCost)} c/u</span>
                          <span style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>{formatUSD(item.quantity * item.unitCost)}</span>
                          <button type="button" className="btn-icon" style={{ color: "var(--danger)", padding: 4 }} onClick={() => handleRemoveItem(idx)}>
                            {trashIcon}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPurchaseModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>Cargar Compra</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
