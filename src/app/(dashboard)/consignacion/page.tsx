"use client";

import { useState, useEffect, type FormEvent } from "react";
import {
  getConsigneesData,
  createConsigneeAction,
  createConsignmentLotAction,
  addConsignmentPaymentAction,
  getConsignmentLotDetailAction,
  liquidateConsignmentItemsAction,
  returnConsignmentItemsAction,
  getInventoryModels,
  getConfigData,
} from "@/lib/db/actions";
import { formatUSD } from "@/lib/utils";
import { SearchCreateSelect, type SearchCreateOption } from "@/components/ui/SearchCreateSelect";

const plusIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

function estadoBadge(e: string): string {
  if (e === "liquidado") return "badge badge-success";
  if (e === "pago_parcial") return "badge badge-info";
  if (e === "pendiente") return "badge badge-warning";
  return "badge badge-neutral";
}

function estadoLabel(e: string): string {
  if (e === "liquidado") return "Liquidado";
  if (e === "pago_parcial") return "Pago parcial";
  if (e === "pendiente") return "Pendiente";
  if (e === "devuelto") return "Devuelto";
  if (e === "sin_lotes") return "Sin entregas";
  return e;
}

export default function ConsignacionPage() {
  const [loading, setLoading] = useState(true);
  const [consigneesList, setConsigneesList] = useState<any[]>([]);
  const [modelsList, setModelsList] = useState<any[]>([]);
  const [paymentMethodsList, setPaymentMethodsList] = useState<any[]>([]);

  // Modals
  const [showConsigneeModal, setShowConsigneeModal] = useState(false);
  const [showLotModal, setShowLotModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState<any | null>(null); // selected lot for payment
  const [lotActionMode, setLotActionMode] = useState<"liquidar" | "devolver" | null>(null);
  const [selectedLotDetail, setSelectedLotDetail] = useState<any | null>(null);

  // Forms state - New Consignee
  const [cName, setCName] = useState("");
  const [cContact, setCContact] = useState("");
  const [cLocation, setCLocation] = useState("");

  // Forms state - New Lot
  const [lotConsigneeId, setLotConsigneeId] = useState("");
  const [lotDate, setLotDate] = useState(new Date().toISOString().slice(0, 10));
  const [lotCart, setLotCart] = useState<{ skuId: number; quantity: number; unitPrice: number; code: string; stock: number }[]>([]);

  // Item Adder State
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedColorId, setSelectedColorId] = useState("");
  const [selectedSizeId, setSelectedSizeId] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [itemPrice, setItemPrice] = useState("28");

  // Payment Form State
  const [payMethodId, setPayMethodId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payRef, setPayRef] = useState("");
  const [lotActionQuantities, setLotActionQuantities] = useState<Record<number, number>>({});

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function loadData() {
    try {
      setLoading(true);
      const data = await getConsigneesData();
      setConsigneesList(data);

      const models = await getInventoryModels();
      setModelsList(models);
      if (models.length > 0) {
        setSelectedModelId(models[0].id);
      }

      const config = await getConfigData();
      setPaymentMethodsList(config.paymentMethods);
      if (config.paymentMethods.length > 0) {
        setPayMethodId(String(config.paymentMethods[0].id));
      }

      if (data.length > 0) {
        setLotConsigneeId(String(data[0].id));
      }

      setErrorMsg("");
    } catch (e) {
      console.error(e);
      setErrorMsg("Error al cargar consignaciones.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Update lot form selectors
  const activeModel = modelsList.find((m) => m.id === selectedModelId);
  const activeModelColors = activeModel?.colors || [];
  const activeModelSkus = activeModel?.skus || [];

  useEffect(() => {
    if (activeModelColors.length > 0) {
      setSelectedColorId(String(activeModelColors[0].id));
    }
    if (activeModel) {
      setItemPrice(String(activeModel.basePrice));
    }
  }, [selectedModelId]);

  const activeSkusForColor = activeModelSkus.filter((s: any) => s.colorId === Number(selectedColorId));
  
  useEffect(() => {
    if (activeSkusForColor.length > 0) {
      setSelectedSizeId(String(activeSkusForColor[0].sizeId || ""));
    }
  }, [selectedColorId, selectedModelId]);

  const consigneeOptions: SearchCreateOption[] = consigneesList.map((consignee) => ({
    value: String(consignee.id),
    label: consignee.name,
    meta: consignee.location || consignee.contact || "Sin ubicacion",
    keywords: [consignee.contact || "", consignee.location || ""],
  }));

  const modelOptions: SearchCreateOption[] = modelsList.map((model) => ({
    value: String(model.id),
    label: `${model.id} · ${model.name}`,
    meta: `${model.category} · ${model.totalStock} und`,
    keywords: [model.category, model.name, model.id],
  }));

  const paymentMethodOptions: SearchCreateOption[] = paymentMethodsList.map((method) => ({
    value: String(method.id),
    label: method.name,
    meta: method.currency,
    keywords: [method.currency],
  }));

  // Cart item management
  function handleAddToCart() {
    if (!selectedModelId || !selectedColorId) return;
    const qty = parseInt(itemQty);
    const price = parseFloat(itemPrice);
    if (isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) return;

    // Find SKU
    const colorIdNum = Number(selectedColorId);
    const sizeIdNum = selectedSizeId ? Number(selectedSizeId) : null;
    const matchedSku = activeModelSkus.find(
      (s: any) => s.colorId === colorIdNum && (sizeIdNum === null ? s.sizeId === null : s.sizeId === sizeIdNum)
    );

    if (!matchedSku) {
      setErrorMsg("SKU no encontrado en este modelo/color/talla.");
      return;
    }

    if (matchedSku.stock < qty) {
      setErrorMsg(`Stock insuficiente de ${matchedSku.compositeCode} (disponible: ${matchedSku.stock}).`);
      return;
    }

    // Check if already in cart
    const existsIndex = lotCart.findIndex((x) => x.skuId === matchedSku.id);
    if (existsIndex > -1) {
      const updated = [...lotCart];
      if (matchedSku.stock < updated[existsIndex].quantity + qty) {
        setErrorMsg(`Stock insuficiente de ${matchedSku.compositeCode} (disponible: ${matchedSku.stock}).`);
        return;
      }
      updated[existsIndex].quantity += qty;
      updated[existsIndex].unitPrice = price;
      setLotCart(updated);
    } else {
      setLotCart([
        ...lotCart,
        {
          skuId: matchedSku.id,
          quantity: qty,
          unitPrice: price,
          code: matchedSku.compositeCode,
          stock: matchedSku.stock,
        },
      ]);
    }
    setErrorMsg("");
  }

  function handleRemoveFromCart(skuId: number) {
    setLotCart(lotCart.filter((x) => x.skuId !== skuId));
  }

  // Submit forms
  async function handleCreateConsignee(e: FormEvent) {
    e.preventDefault();
    if (!cName) return;
    setSubmitting(true);
    const res = await createConsigneeAction(cName, cContact, cLocation);
    setSubmitting(false);
    if (res.success) {
      setShowConsigneeModal(false);
      setCName("");
      setCContact("");
      setCLocation("");
      loadData();
    } else {
      setErrorMsg(res.error || "Error al registrar consignataria");
    }
  }

  async function handleCreateConsigneeFromSearch(query: string) {
    const name = query.trim();
    if (!name) return;
    setSubmitting(true);
    const res = await createConsigneeAction(name, "", "");
    const freshData = await getConsigneesData();
    setConsigneesList(freshData);
    setSubmitting(false);
    if (!res.success) {
      throw new Error(res.error || "Error al registrar consignataria.");
    }
    const created = freshData.find((consignee: any) => consignee.name.toLowerCase() === name.toLowerCase());
    if (created) {
      setLotConsigneeId(String(created.id));
    }
  }

  async function handleCreateLot(e: FormEvent) {
    e.preventDefault();
    if (!lotConsigneeId || lotCart.length === 0) return;
    setSubmitting(true);
    const res = await createConsignmentLotAction({
      consigneeId: Number(lotConsigneeId),
      date: lotDate,
      items: lotCart.map(item => ({ skuId: item.skuId, quantity: item.quantity, unitPrice: item.unitPrice })),
    });
    setSubmitting(false);
    if (res.success) {
      setShowLotModal(false);
      setLotCart([]);
      loadData();
    } else {
      setErrorMsg(res.error || "Error al registrar entrega");
    }
  }

  async function handleAddPayment(e: FormEvent) {
    e.preventDefault();
    if (!showPayModal || !payMethodId || !payAmount) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) return;

    setSubmitting(true);
    const res = await addConsignmentPaymentAction(
      showPayModal.id,
      Number(payMethodId),
      amount,
      payRef
    );
    setSubmitting(false);

    if (res.success) {
      setShowPayModal(null);
      setPayAmount("");
      setPayRef("");
      loadData();
    } else {
      setErrorMsg(res.error || "Error al registrar abono");
    }
  }

  async function openLotActionModal(lotId: number, mode: "liquidar" | "devolver") {
    try {
      setErrorMsg("");
      const detail = await getConsignmentLotDetailAction(lotId);
      const initialQuantities: Record<number, number> = {};
      detail.items.forEach((item: any) => {
        initialQuantities[item.id] = 0;
      });
      setLotActionQuantities(initialQuantities);
      setSelectedLotDetail(detail);
      setLotActionMode(mode);
    } catch (e: any) {
      setErrorMsg(e?.message || "No se pudo cargar el detalle del lote.");
    }
  }

  async function handleSubmitLotAction(e: FormEvent) {
    e.preventDefault();
    if (!selectedLotDetail || !lotActionMode) return;

    const items = selectedLotDetail.items
      .map((item: any) => ({
        consignmentItemId: item.id,
        quantity: lotActionQuantities[item.id] || 0,
      }))
      .filter((item: any) => item.quantity > 0);

    if (items.length === 0) {
      setErrorMsg(
        lotActionMode === "liquidar"
          ? "Debes indicar al menos una unidad liquidada."
          : "Debes indicar al menos una unidad a devolver."
      );
      return;
    }

    setSubmitting(true);
    const res = lotActionMode === "liquidar"
      ? await liquidateConsignmentItemsAction({ lotId: selectedLotDetail.id, items })
      : await returnConsignmentItemsAction({ lotId: selectedLotDetail.id, items });
    setSubmitting(false);

    if (res.success) {
      setLotActionMode(null);
      setSelectedLotDetail(null);
      setLotActionQuantities({});
      loadData();
    } else {
      setErrorMsg(res.error || "No se pudo completar la operación del lote.");
    }
  }

  function handleLotActionQtyChange(itemId: number, value: number, max: number) {
    const qty = Math.min(max, Math.max(0, value));
    setLotActionQuantities((prev) => ({
      ...prev,
      [itemId]: qty,
    }));
  }

  const totalDeuda = consigneesList.reduce((sum, c) => sum + c.deuda, 0);
  const totalEntregados = consigneesList.reduce((sum, c) => sum + c.entregados, 0);
  const totalVendidos = consigneesList.reduce((sum, c) => sum + c.vendidos, 0);

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loader">Cargando consignatarias...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* KPIs */}
      <div className="grid-3 mb-18">
        <div className="card card-dark card-compact">
          <div className="kpi-label">Deuda total</div>
          <div style={{ fontSize: "var(--text-5xl)", fontWeight: 800, marginTop: 8 }}>
            {formatUSD(totalDeuda)}
          </div>
          <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-sidebar-inactive)", marginTop: 2 }}>
            {consigneesList.filter(c => c.deuda > 0).length} consignatarias con saldo
          </div>
        </div>
        <div className="card card-compact">
          <div className="section-label">Unidades entregadas</div>
          <div style={{ fontSize: "var(--text-5xl)", fontWeight: 800, marginTop: 8 }}>{totalEntregados}</div>
          <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", marginTop: 2 }}>en consignación activa</div>
        </div>
        <div className="card card-compact">
          <div className="section-label">Unidades vendidas</div>
          <div style={{ fontSize: "var(--text-5xl)", fontWeight: 800, marginTop: 8 }}>{totalVendidos}</div>
          <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", marginTop: 2 }}>
            {totalEntregados - totalVendidos} por vender
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <div className="table-header-row">
          <h3>Consignatarias</h3>
          <div className="inline-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setShowConsigneeModal(true)}>
              {plusIcon} Nueva consignataria
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowLotModal(true)}>
              {plusIcon} Nueva entrega
            </button>
          </div>
        </div>
        
        {consigneesList.length === 0 ? (
          <div className="empty-state-card" style={{ margin: 22 }}>
            <strong>Sin consignatarias registradas.</strong> Registra una consignataria para controlar entregas, deuda y abonos.
          </div>
        ) : (
          <div className="responsive-table-scroll">
            <div style={{
              display: "grid", gridTemplateColumns: "1.8fr 1fr 0.8fr 0.8fr 1fr 1fr 0.8fr",
              gap: 14, minWidth: 900, padding: "13px 22px", borderBottom: "1px solid var(--border-header)",
              font: "600 10.5px/1 var(--font-sans)", letterSpacing: "0.1em",
              textTransform: "uppercase", color: "var(--text-muted)",
            }}>
              <span>Consignataria</span><span>Ubicación</span><span>Entregados</span><span>Vendidos</span><span>Deuda</span><span>Estado</span><span />
            </div>
            {consigneesList.map((c) => {
              const lotToLiquidate = c.lots.find((lot: any) => lot.remainingUnits > 0);
              const lotToReturn = c.lots.find((lot: any) => lot.remainingUnits > 0);
              const lotToPay = c.lots.find((lot: any) => lot.debtUsd > 0);

              return (
                <div key={c.id} className="table-row" style={{
                  display: "grid", gridTemplateColumns: "1.8fr 1fr 0.8fr 0.8fr 1fr 1fr 0.8fr", gap: 14, minWidth: 900,
                }}>
                  <div>
                    <span style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{c.name}</span>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{c.contact}</div>
                  </div>
                  <span style={{ fontSize: "var(--text-base2)", color: "var(--text-tertiary)" }}>{c.ubicacion}</span>
                  <span style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>{c.entregados}</span>
                  <span style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>{c.vendidos}</span>
                  <span style={{ fontSize: "var(--text-md2)", fontWeight: 700, color: c.deuda > 0 ? "var(--warning)" : "var(--success)" }}>
                    {formatUSD(c.deuda)}
                  </span>
                  <span className={estadoBadge(c.estado)}>{estadoLabel(c.estado)}</span>
                  <span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {lotToLiquidate && (
                        <button className="btn btn-xs btn-secondary" onClick={() => openLotActionModal(lotToLiquidate.id, "liquidar")}>
                          Liquidar
                        </button>
                      )}
                      {lotToPay && (
                        <button className="btn btn-xs btn-secondary" onClick={() => setShowPayModal(lotToPay)}>
                          Abonar
                        </button>
                      )}
                      {lotToReturn && (
                        <button className="btn btn-xs btn-danger" onClick={() => openLotActionModal(lotToReturn.id, "devolver")}>
                          Devolver
                        </button>
                      )}
                    </div>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Consignee Modal */}
      {showConsigneeModal && (
        <div className="modal-backdrop">
          <div className="modal-content animate-pop-in" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h4>Nueva Consignataria</h4>
              <button className="btn-close" onClick={() => setShowConsigneeModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateConsignee}>
              {errorMsg && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{errorMsg}</div>}
              
              <div className="form-group">
                <label>Nombre de la Consignataria</label>
                <input
                  type="text"
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  placeholder="Ej. Rosángela Perozo"
                  required
                />
              </div>

              <div className="form-group">
                <label>Contacto (Teléfono)</label>
                <input
                  type="text"
                  value={cContact}
                  onChange={(e) => setCContact(e.target.value)}
                  placeholder="Ej. 0424-1234567"
                />
              </div>

              <div className="form-group">
                <label>Ubicación / Ciudad</label>
                <input
                  type="text"
                  value={cLocation}
                  onChange={(e) => setCLocation(e.target.value)}
                  placeholder="Ej. Maracaibo"
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowConsigneeModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Registrando..." : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Consignment Lot Modal */}
      {showLotModal && (
        <div className="modal-backdrop">
          <div className="modal-content animate-pop-in" style={{ maxWidth: 650 }}>
            <div className="modal-header">
              <h4>Nueva Entrega de Lote en Consignación</h4>
              <button className="btn-close" onClick={() => setShowLotModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateLot}>
              {errorMsg && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{errorMsg}</div>}
              
              <div className="grid-2" style={{ gap: 12 }}>
                <div className="form-group">
                  <SearchCreateSelect
                    label="Consignataria"
                    value={lotConsigneeId}
                    options={consigneeOptions}
                    onChange={setLotConsigneeId}
                    onCreate={handleCreateConsigneeFromSearch}
                    placeholder="Buscar o crear consignataria"
                    createLabel={(query) => `+ Crear consignataria "${query}"`}
                    emptyMessage="No hay consignatarias con ese criterio."
                  />
                </div>
                <div className="form-group">
                  <label>Fecha de Entrega</label>
                  <input
                    type="date"
                    value={lotDate}
                    onChange={(e) => setLotDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Add Item section */}
              <div className="card card-compact mb-14" style={{ padding: 12, background: "var(--bg-subtle)" }}>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginBottom: 8 }}>Agregar prenda al lote</div>
                <div className="responsive-table-scroll">
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 0.8fr 1fr", gap: 10, minWidth: 620 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <SearchCreateSelect
                      value={selectedModelId}
                      options={modelOptions}
                      onChange={setSelectedModelId}
                      placeholder="Buscar modelo"
                      emptyMessage="No hay modelos con ese criterio."
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <select value={selectedColorId} onChange={(e) => setSelectedColorId(e.target.value)}>
                      {activeModelColors.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <select value={selectedSizeId} onChange={(e) => setSelectedSizeId(e.target.value)}>
                      {activeSkusForColor.map((s: any) => (
                        <option key={s.id} value={s.sizeId || ""}>
                          {s.sizeId ? s.compositeCode.split("-").pop() : "Sin Talla"} (Disp.: {s.stock})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <input
                      type="number"
                      value={itemQty}
                      onChange={(e) => setItemQty(e.target.value)}
                      placeholder="Cant."
                    />
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddToCart} style={{ height: "100%" }}>
                    Añadir
                  </button>
                </div>
                </div>
              </div>

              {/* Cart List */}
              <div className="form-group">
                <label>Detalle de la Entrega</label>
                <div style={{ border: "1px solid var(--border-light)", borderRadius: 8, maxHeight: 150, overflowY: "auto" }}>
                  {lotCart.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
                      Ninguna prenda agregada.
                    </div>
                  ) : (
                    lotCart.map((item) => (
                      <div key={item.skuId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border-light)", fontSize: "var(--text-sm)" }}>
                        <span className="font-mono" style={{ fontWeight: 600 }}>{item.code}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <span>{item.quantity} und × {formatUSD(item.unitPrice)}</span>
                          <button type="button" className="btn btn-danger btn-icon" onClick={() => handleRemoveFromCart(item.skuId)} style={{ padding: "4px" }}>
                            ×
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="modal-footer" style={{ marginTop: 18 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowLotModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={submitting || lotCart.length === 0}>
                  {submitting ? "Registrando..." : "Registrar Entrega"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Consignment Payment Modal */}
      {showPayModal && (
        <div className="modal-backdrop">
          <div className="modal-content animate-pop-in" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h4>Registrar Abono — Lote Nº {showPayModal.id}</h4>
              <button className="btn-close" onClick={() => setShowPayModal(null)}>×</button>
            </div>
            <form onSubmit={handleAddPayment}>
              {errorMsg && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{errorMsg}</div>}
              
              <div style={{ background: "var(--bg-subtle)", borderRadius: 8, padding: 12, marginBottom: 12, fontSize: "var(--text-sm)" }}>
                <div>Valor entregado: <strong>{formatUSD(showPayModal.deliveredValue || showPayModal.totalUsd)}</strong></div>
                <div>Valor liquidado: <strong>{formatUSD(showPayModal.liquidatedValue || 0)}</strong></div>
                <div>Abonado: <strong>{formatUSD(showPayModal.paidUsd)}</strong></div>
                <div>Pendiente: <strong style={{ color: "var(--warning)" }}>{formatUSD(showPayModal.debtUsd || 0)}</strong></div>
              </div>

              <div className="form-group">
                <SearchCreateSelect
                  label="Método de Pago"
                  value={payMethodId}
                  options={paymentMethodOptions}
                  onChange={setPayMethodId}
                  placeholder="Buscar método"
                  emptyMessage="No hay métodos disponibles."
                />
              </div>

              <div className="form-group">
                <label>Monto a Abonar (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="Ej. 50"
                  required
                />
              </div>

              <div className="form-group">
                <label>Referencia / Detalle</label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="Ej. Pago móvil ref: 8842"
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPayModal(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Registrando..." : "Registrar Abono"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {lotActionMode && selectedLotDetail && (
        <div className="modal-backdrop">
          <div className="modal-content animate-pop-in" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h4>{lotActionMode === "liquidar" ? "Liquidar unidades vendidas" : "Devolver mercancía al inventario"}</h4>
              <button
                className="btn-close"
                onClick={() => {
                  setLotActionMode(null);
                  setSelectedLotDetail(null);
                }}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmitLotAction}>
              {errorMsg && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{errorMsg}</div>}

              <div style={{ background: "var(--bg-subtle)", borderRadius: 8, padding: 12, marginBottom: 12, fontSize: "var(--text-sm)" }}>
                <div>Lote: <strong>#{selectedLotDetail.id}</strong></div>
                <div>Entregadas: <strong>{selectedLotDetail.deliveredUnits}</strong></div>
                <div>Liquidadas: <strong>{selectedLotDetail.liquidatedUnits}</strong></div>
                <div>Devueltas: <strong>{selectedLotDetail.returnedUnits}</strong></div>
                <div>Disponibles en consignación: <strong>{selectedLotDetail.remainingUnits}</strong></div>
              </div>

              <div className="form-group">
                <label>{lotActionMode === "liquidar" ? "Unidades a liquidar" : "Unidades a devolver"}</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 240, overflowY: "auto", background: "var(--bg-subtle)", borderRadius: 8, padding: 10 }}>
                  {selectedLotDetail.items.map((item: any) => (
                    <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr auto", gap: 12, alignItems: "center" }}>
                      <div>
                        <div className="font-mono" style={{ fontWeight: 600 }}>{item.code}</div>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                          Entregadas: {item.quantity} · Liquidadas: {item.liquidatedQuantity} · Devueltas: {item.returnedQuantity}
                        </div>
                      </div>
                      <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-secondary)" }}>
                        Pendientes: {item.remainingQuantity}
                      </div>
                      <input
                        type="number"
                        min="0"
                        max={item.remainingQuantity}
                        value={lotActionQuantities[item.id] || 0}
                        onChange={(e) => handleLotActionQtyChange(item.id, parseInt(e.target.value) || 0, item.remainingQuantity)}
                        style={{ width: 74, textAlign: "center" }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setLotActionMode(null); setSelectedLotDetail(null); }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting
                    ? "Procesando..."
                    : (lotActionMode === "liquidar" ? "Registrar liquidación" : "Registrar devolución")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
