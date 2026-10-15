"use client";

import { useState, useEffect, type FormEvent } from "react";
import {
  getConsigneesData,
  createConsigneeAction,
  updateConsigneeAction,
  deleteConsigneeAction,
  createConsignmentLotAction,
  deleteConsignmentLotAction,
  addConsignmentPaymentAction,
  getConsignmentLotDetailAction,
  liquidateConsignmentItemsAction,
  returnConsignmentItemsAction,
  getInventoryModels,
  getConfigData,
} from "@/lib/db/actions";
import { formatUSD } from "@/lib/utils";
import { SYSTEM_DEFAULTS } from "@/lib/app-config";
import { SearchCreateSelect, type SearchCreateOption } from "@/components/ui/SearchCreateSelect";
import { useUser } from "../UserContext";

const trashIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
);

const printIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

type FxSource = "paralelo" | "bcv" | "manual";

const plusIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

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
  const user = useUser();
  const isAdmin = user?.role === "admin";

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

  // Consignee detail view (null = list view)
  const [detailConsigneeId, setDetailConsigneeId] = useState<number | null>(null);

  // Forms state - New Consignee
  const [cName, setCName] = useState("");
  const [cContact, setCContact] = useState("");
  const [cLocation, setCLocation] = useState("");

  // Edit consignee modal
  const [editConsignee, setEditConsignee] = useState<any | null>(null);
  const [eName, setEName] = useState("");
  const [eContact, setEContact] = useState("");
  const [eLocation, setELocation] = useState("");

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
  const [payCurrency, setPayCurrency] = useState<"USD" | "BS">("USD");
  const [payRateSource, setPayRateSource] = useState<FxSource>("paralelo");
  const [payRate, setPayRate] = useState(String(SYSTEM_DEFAULTS.rates.paralelo));
  const [lotActionQuantities, setLotActionQuantities] = useState<Record<number, number>>({});

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function loadData() {
    try {
      setLoading(true);
      // These three reads are independent — run them concurrently instead of
      // paying the sum of three round-trips.
      const [data, models, config] = await Promise.all([
        getConsigneesData(),
        getInventoryModels(),
        getConfigData(),
      ]);

      setConsigneesList(data);

      setModelsList(models);
      if (models.length > 0) {
        setSelectedModelId(models[0].id);
      }

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

  function openEditConsignee(c: any) {
    setErrorMsg("");
    setEditConsignee(c);
    setEName(c.name || "");
    // getConsigneesData substitutes placeholder text for empty values — don't
    // pre-fill those into the edit form.
    setEContact(c.contact && c.contact !== "Sin contacto" ? c.contact : "");
    setELocation(c.ubicacion && c.ubicacion !== "Sin ubicación" ? c.ubicacion : "");
  }

  async function handleUpdateConsignee(e: FormEvent) {
    e.preventDefault();
    if (!editConsignee || !eName.trim()) return;
    setSubmitting(true);
    const res = await updateConsigneeAction(editConsignee.id, eName.trim(), eContact, eLocation);
    setSubmitting(false);
    if (res.success) {
      setEditConsignee(null);
      loadData();
    } else {
      setErrorMsg(res.error || "Error al actualizar consignataria");
    }
  }

  async function handleDeleteConsignee(c: any) {
    setErrorMsg("");
    if (!window.confirm(`¿Eliminar la consignataria "${c.name}"?`)) return;
    setSubmitting(true);
    const res = await deleteConsigneeAction(c.id);
    setSubmitting(false);
    if (res.success) {
      setDetailConsigneeId(null);
      loadData();
    } else {
      setErrorMsg(res.error || "No se pudo eliminar la consignataria.");
    }
  }

  async function handleDeleteLot(lotId: number) {
    setErrorMsg("");
    if (!window.confirm("¿Eliminar este lote? Se reincorporará el stock.")) return;
    setSubmitting(true);
    const res = await deleteConsignmentLotAction(lotId);
    setSubmitting(false);
    if (res.success) {
      loadData();
    } else {
      setErrorMsg(res.error || "No se pudo eliminar el lote.");
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
      if (lotConsigneeId) {
        setDetailConsigneeId(Number(lotConsigneeId));
      }
      if (res.lotId) {
        window.open(`/api/documentos/consignacion/${res.lotId}`, "_blank");
      }
    } else {
      setErrorMsg(res.error || "Error al registrar entrega");
    }
  }

  async function handleAddPayment(e: FormEvent) {
    e.preventDefault();
    if (!showPayModal || !payMethodId || !payAmount) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) return;

    const isBs = payCurrency === "BS";
    const rate = parseFloat(payRate);
    if (isBs && (!Number.isFinite(rate) || rate <= 0)) {
      setErrorMsg("Indique una tasa válida para el abono en bolívares.");
      return;
    }
    const amountUsd = isBs ? amount / rate : amount;

    setSubmitting(true);
    const res = await addConsignmentPaymentAction({
      lotId: showPayModal.id,
      methodId: Number(payMethodId),
      amountUsd,
      currency: payCurrency,
      amountOriginal: amount,
      rateUsed: isBs ? rate : undefined,
      rateSource: isBs ? payRateSource : "manual",
      reference: payRef,
    });
    setSubmitting(false);

    if (res.success) {
      setShowPayModal(null);
      setPayAmount("");
      setPayRef("");
      setPayCurrency("USD");
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

  // Resolve the selected consignee from the freshly-loaded list so the detail
  // view reflects edits/payments/liquidations without extra state to sync.
  const detailConsignee = detailConsigneeId
    ? consigneesList.find((c) => c.id === detailConsigneeId)
    : null;

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loader">Cargando consignatarias...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {detailConsignee ? (
        /* ─── Consignee detail view ─── */
        <div>
          <button
            onClick={() => { setDetailConsigneeId(null); setErrorMsg(""); }}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-md)", color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 16 }}
          >
            {chevronLeft} Volver a consignatarias
          </button>

          <div className="grid-2-sidebar">
            {/* Lots */}
            <div className="card" style={{ padding: 24, borderRadius: "var(--radius-5xl)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
                <div>
                  <div className="section-label" style={{ marginBottom: 6 }}>Detalle de consignataria</div>
                  <h2 style={{ fontSize: "var(--text-3xl)", fontWeight: 800, letterSpacing: "-0.02em" }}>{detailConsignee.name}</h2>
                  <div style={{ fontSize: "var(--text-base2)", color: "var(--text-muted)", marginTop: 2 }}>
                    {detailConsignee.ubicacion} · {detailConsignee.contact}
                  </div>
                </div>
                {isAdmin && (
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEditConsignee(detailConsignee)}>Editar</button>
                    <button className="btn btn-secondary btn-sm" style={{ color: "var(--danger)" }} disabled={submitting} onClick={() => handleDeleteConsignee(detailConsignee)}>Eliminar</button>
                  </div>
                )}
              </div>

              {errorMsg && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{errorMsg}</div>}

              {detailConsignee.lots.length === 0 ? (
                <div className="empty-state-card">
                  Sin entregas registradas. Usa “Nueva entrega” para entregar mercancía en consignación.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {detailConsignee.lots.map((lot: any) => {
                    const deletable =
                      (lot.paidUsd || 0) <= 0 &&
                      (lot.liquidatedUnits || 0) <= 0 &&
                      (lot.returnedUnits || 0) <= 0;
                    return (
                      <div key={lot.id} style={{ border: "1px solid var(--border-light)", borderRadius: 14, padding: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <a
                              href={`/api/documentos/consignacion/${lot.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono"
                              style={{
                                fontWeight: 700,
                                fontSize: "var(--text-md2)",
                                color: "inherit",
                                textDecoration: "underline",
                                textUnderlineOffset: 3,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                              title="Ver / Imprimir comprobante de entrega"
                            >
                              Lote #{lot.id}
                            </a>
                            <span className="font-mono" style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{lot.date}</span>
                          </div>
                          <span className={estadoBadge(lot.status)}>{estadoLabel(lot.status)}</span>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
                          {[
                            { label: "Entregadas", value: lot.deliveredUnits },
                            { label: "Vendidas", value: lot.liquidatedUnits },
                            { label: "Devueltas", value: lot.returnedUnits },
                            { label: "Disponibles", value: lot.remainingUnits },
                          ].map((m) => (
                            <div key={m.label}>
                              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.label}</div>
                              <div style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>{m.value}</div>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", paddingTop: 12, borderTop: "1px solid var(--border-light)" }}>
                          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                            Deuda: <strong style={{ color: lot.debtUsd > 0 ? "var(--warning)" : "var(--success)" }}>{formatUSD(lot.debtUsd)}</strong>
                            <span style={{ color: "var(--text-muted)" }}> · Abonado {formatUSD(lot.paidUsd)}</span>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <a
                              href={`/api/documentos/consignacion/${lot.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-xs btn-secondary"
                              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                              title="Imprimir documento de lote entregado en consignación"
                            >
                              {printIcon} Imprimir
                            </a>
                            {lot.remainingUnits > 0 && (
                              <button className="btn btn-xs btn-secondary" onClick={() => openLotActionModal(lot.id, "liquidar")}>Liquidar</button>
                            )}
                            {lot.debtUsd > 0 && (
                              <button className="btn btn-xs btn-secondary" onClick={() => setShowPayModal(lot)}>Abonar</button>
                            )}
                            {lot.remainingUnits > 0 && (
                              <button className="btn btn-xs btn-danger" onClick={() => openLotActionModal(lot.id, "devolver")}>Devolver</button>
                            )}
                            {isAdmin && deletable && (
                              <button className="icon-btn icon-btn-danger" title="Eliminar lote" disabled={submitting} onClick={() => handleDeleteLot(lot.id)}>{trashIcon}</button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Summary sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="card" style={{ borderRadius: "var(--radius-5xl)", padding: 20 }}>
                <div className="section-label" style={{ marginBottom: 14 }}>Resumen</div>
                {[
                  { label: "Unidades entregadas", value: String(detailConsignee.entregados) },
                  { label: "Unidades vendidas", value: String(detailConsignee.vendidos) },
                  { label: "Por vender", value: String(detailConsignee.porVender) },
                  { label: "Deuda total", value: formatUSD(detailConsignee.deuda), color: detailConsignee.deuda > 0 ? "var(--warning)" : "var(--success)" },
                ].map((row, i, arr) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--border-light)" : "none" }}>
                    <span style={{ fontSize: "var(--text-md)", color: "var(--text-tertiary)" }}>{row.label}</span>
                    <span style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: row.color }}>{row.value}</span>
                  </div>
                ))}
              </div>
              <button
                className="btn btn-primary btn-block"
                style={{ padding: 12, borderRadius: "var(--radius-2xl)" }}
                onClick={() => { setErrorMsg(""); setLotConsigneeId(String(detailConsignee.id)); setShowLotModal(true); }}
              >
                {plusIcon} Nueva entrega
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
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
                  display: "grid", gridTemplateColumns: "1.8fr 1fr 0.8fr 0.8fr 1fr 1fr 40px",
                  gap: 14, minWidth: 900, padding: "13px 22px", borderBottom: "1px solid var(--border-header)",
                  font: "600 10.5px/1 var(--font-sans)", letterSpacing: "0.1em",
                  textTransform: "uppercase", color: "var(--text-muted)",
                }}>
                  <span>Consignataria</span><span>Ubicación</span><span>Entregados</span><span>Vendidos</span><span>Deuda</span><span>Estado</span><span />
                </div>
                {consigneesList.map((c) => (
                  <div
                    key={c.id}
                    className="table-row"
                    style={{
                      display: "grid", gridTemplateColumns: "1.8fr 1fr 0.8fr 0.8fr 1fr 1fr 40px", gap: 14, minWidth: 900,
                      cursor: "pointer",
                    }}
                    onClick={() => { setErrorMsg(""); setDetailConsigneeId(c.id); }}
                  >
                    <div>
                      <span style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{c.name}</span>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{c.contact}</div>
                    </div>
                    <span style={{ fontSize: "var(--text-base2)", color: "var(--text-tertiary)", display: "flex", alignItems: "center" }}>{c.ubicacion}</span>
                    <span style={{ fontSize: "var(--text-md)", fontWeight: 700, display: "flex", alignItems: "center" }}>{c.entregados}</span>
                    <span style={{ fontSize: "var(--text-md)", fontWeight: 700, display: "flex", alignItems: "center" }}>{c.vendidos}</span>
                    <span style={{ fontSize: "var(--text-md2)", fontWeight: 700, display: "flex", alignItems: "center", color: c.deuda > 0 ? "var(--warning)" : "var(--success)" }}>
                      {formatUSD(c.deuda)}
                    </span>
                    <span style={{ display: "flex", alignItems: "center" }}>
                      <span className={estadoBadge(c.estado)}>{estadoLabel(c.estado)}</span>
                    </span>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {chevronRight}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* New Consignee Modal */}
      {showConsigneeModal && (
        <div className="modal-backdrop">
          <div className="modal-content animate-pop-in" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h4>Nueva Consignataria</h4>
              <button className="btn-close" onClick={() => setShowConsigneeModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateConsignee}>

              
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

              <div className="modal-footer-sticky">
                {errorMsg && <div className="alert alert-danger" style={{ marginBottom: 0 }}>{errorMsg}</div>}
                <div className="sales-form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowConsigneeModal(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? "Registrando..." : "Registrar"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Consignee Modal */}
      {editConsignee && (
        <div className="modal-backdrop">
          <div className="modal-content animate-pop-in" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h4>Editar Consignataria</h4>
              <button className="btn-close" onClick={() => setEditConsignee(null)}>×</button>
            </div>
            <form onSubmit={handleUpdateConsignee}>


              <div className="form-group">
                <label>Nombre de la Consignataria</label>
                <input
                  type="text"
                  value={eName}
                  onChange={(e) => setEName(e.target.value)}
                  placeholder="Ej. Rosángela Perozo"
                  required
                />
              </div>

              <div className="form-group">
                <label>Contacto (Teléfono)</label>
                <input
                  type="text"
                  value={eContact}
                  onChange={(e) => setEContact(e.target.value)}
                  placeholder="Ej. 0424-1234567"
                />
              </div>

              <div className="form-group">
                <label>Ubicación / Ciudad</label>
                <input
                  type="text"
                  value={eLocation}
                  onChange={(e) => setELocation(e.target.value)}
                  placeholder="Ej. Maracaibo"
                />
              </div>

              <div className="modal-footer-sticky">
                {errorMsg && <div className="alert alert-danger" style={{ marginBottom: 0 }}>{errorMsg}</div>}
                <div className="sales-form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setEditConsignee(null)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
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

              <div className="modal-footer-sticky">
                {errorMsg && <div className="alert alert-danger" style={{ marginBottom: 0 }}>{errorMsg}</div>}
                <div className="sales-form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowLotModal(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting || lotCart.length === 0}>
                    {submitting ? "Registrando..." : "Registrar Entrega"}
                  </button>
                </div>
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
                <label>Moneda del abono</label>
                <div className="range-selector" style={{ width: "max-content" }}>
                  <button type="button" className={`range-btn ${payCurrency === "USD" ? "active" : ""}`} onClick={() => setPayCurrency("USD")}>USD</button>
                  <button type="button" className={`range-btn ${payCurrency === "BS" ? "active" : ""}`} onClick={() => setPayCurrency("BS")}>Bs</button>
                </div>
              </div>

              <div className="form-group">
                <label>Monto a Abonar ({payCurrency === "BS" ? "Bs" : "USD"})</label>
                <input
                  type="number"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder={payCurrency === "BS" ? "Ej. 4000" : "Ej. 50"}
                  required
                />
              </div>

              {payCurrency === "BS" && (
                <div className="form-group" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label>Tasa</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payRate}
                      onChange={(e) => setPayRate(e.target.value)}
                      placeholder="Bs/USD"
                    />
                  </div>
                  <div>
                    <label>Fuente</label>
                    <select value={payRateSource} onChange={(e) => setPayRateSource(e.target.value as FxSource)}>
                      <option value="paralelo">Paralelo</option>
                      <option value="bcv">BCV</option>
                      <option value="manual">Manual</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                    Equivale a {payAmount && parseFloat(payRate) > 0 ? formatUSD(parseFloat(payAmount) / parseFloat(payRate)) : formatUSD(0)} USD
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Referencia / Detalle</label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="Ej. Pago móvil ref: 8842"
                />
              </div>

              <div className="modal-footer-sticky">
                {errorMsg && <div className="alert alert-danger" style={{ marginBottom: 0 }}>{errorMsg}</div>}
                <div className="sales-form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowPayModal(null)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? "Registrando..." : "Registrar Abono"}
                  </button>
                </div>
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


              <div style={{ background: "var(--bg-subtle)", borderRadius: 8, padding: 12, marginBottom: 12, fontSize: "var(--text-sm)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div>Lote: <strong>#{selectedLotDetail.id}</strong></div>
                  <a
                    href={`/api/documentos/consignacion/${selectedLotDetail.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-xs btn-secondary"
                    style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                    title="Imprimir documento de entrega del lote"
                  >
                    {printIcon} Imprimir comprobante
                  </a>
                </div>
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

              <div className="modal-footer-sticky">
                {errorMsg && <div className="alert alert-danger" style={{ marginBottom: 0 }}>{errorMsg}</div>}
                <div className="sales-form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => { setLotActionMode(null); setSelectedLotDetail(null); }}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting
                      ? "Procesando..."
                      : (lotActionMode === "liquidar" ? "Registrar liquidación" : "Registrar devolución")}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
