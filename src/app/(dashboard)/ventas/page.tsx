"use client";

import { useState, useEffect } from "react";
import {
  getSalesAndQuotesData,
  getCustomers,
  createCustomerAction,
  getInventoryModels,
  getConfigData,
  createSaleOrQuote,
  convertQuoteToSaleAction,
} from "@/lib/db/actions";
import { formatBs, formatRate, formatUSD } from "@/lib/utils";
import { SETTINGS_KEYS, SYSTEM_DEFAULTS } from "@/lib/app-config";
import { SearchCreateSelect, type SearchCreateOption } from "@/components/ui/SearchCreateSelect";

type FxSource = "paralelo" | "bcv" | "manual";

type PaymentEntry = {
  methodId: number;
  name: string;
  currency: string;
  amountOriginal: number;
  amountUsd: number;
  rateUsed: number;
  rateSource: FxSource;
  reference?: string;
};

function isBolivarCurrency(currency: string): boolean {
  const normalized = currency.trim().toUpperCase();
  return normalized === "BS" || normalized === "VES";
}

function payBadge(m: string): string {
  if (m === "Zelle" || m === "Binance" || m === "Efectivo") return "badge badge-neutral";
  if (m === "Bs") return "badge badge-neutral";
  if (m === "Mixto") return "badge badge-info";
  return "badge badge-neutral";
}

function estadoBadge(e: string): string {
  if (e === "Pagada") return "badge badge-success";
  if (e === "Cotización") return "badge badge-warning";
  if (e === "Convertida") return "badge badge-info";
  if (e === "Pendiente") return "badge badge-warning";
  if (e === "Anulada") return "badge badge-danger";
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

export default function VentasPage() {
  const [loading, setLoading] = useState(true);
  const [salesList, setSalesList] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [modelsList, setModelsList] = useState<any[]>([]);
  const [configDb, setConfigDb] = useState<any | null>(null);

  // Modals
  const [showDocModal, setShowDocModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState<any | null>(null);

  // Document Form State
  const [docType, setDocType] = useState<"venta" | "cotizacion">("venta");
  const [docCustomerId, setDocCustomerId] = useState("");
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [docRateSource, setDocRateSource] = useState<FxSource>("paralelo");
  const [docRateVal, setDocRateVal] = useState(String(SYSTEM_DEFAULTS.rates.paralelo));
  const [convertRateSource, setConvertRateSource] = useState<FxSource>("paralelo");
  const [convertRateVal, setConvertRateVal] = useState(String(SYSTEM_DEFAULTS.rates.paralelo));
  const [docNotes, setDocNotes] = useState("");
  const [docCart, setDocCart] = useState<{ skuId: number; quantity: number; unitPrice: number; code: string; stock: number }[]>([]);

  // Item Adder State
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedColorId, setSelectedColorId] = useState("");
  const [selectedSizeId, setSelectedSizeId] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [itemPrice, setItemPrice] = useState("28");

  // Payment method inputs (Venta only)
  const [purPayments, setPurPayments] = useState<PaymentEntry[]>([]);
  const [payMethodId, setPayMethodId] = useState("");
  const [payAmountOriginal, setPayAmountOriginal] = useState("");
  const [payRef, setPayRef] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  async function loadData() {
    try {
      setLoading(true);
      const docs = await getSalesAndQuotesData();
      setSalesList(docs);

      const custs = await getCustomers();
      setCustomersList(custs);

      const models = await getInventoryModels();
      setModelsList(models);
      if (models.length > 0) {
        setSelectedModelId(models[0].id);
      }

      const config = await getConfigData();
      setConfigDb(config);
      
      const tasaP =
        config.settings[SETTINGS_KEYS.parallelRate] || String(SYSTEM_DEFAULTS.rates.paralelo);
      setDocRateVal(tasaP);
      setConvertRateVal(tasaP);
      
      if (config.paymentMethods.length > 0) {
        setPayMethodId(String(config.paymentMethods[0].id));
      }

      setErrorMsg("");
      setSuccessMsg("");
    } catch (e) {
      console.error(e);
      setErrorMsg("Error al cargar datos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Update colors & sizes lists when selected model changes
  const activeModel = modelsList.find((m) => m.id === selectedModelId);
  const activeModelColors = activeModel?.colors || [];
  const activeModelSkus = activeModel?.skus || [];

  // Update selectors
  useEffect(() => {
    if (activeModelColors.length > 0) {
      setSelectedColorId(String(activeModelColors[0].id));
    }
    if (activeModel) {
      setItemPrice(String(activeModel.basePrice));
    }
  }, [selectedModelId]);

  // Available sizes for this model-color SKU
  const activeSkusForColor = activeModelSkus.filter((s: any) => s.colorId === Number(selectedColorId));
  
  useEffect(() => {
    if (activeSkusForColor.length > 0) {
      setSelectedSizeId(String(activeSkusForColor[0].sizeId || ""));
    }
  }, [selectedColorId, selectedModelId]);

  const customerOptions: SearchCreateOption[] = customersList.map((customer: any) => ({
    value: String(customer.id),
    label: customer.name,
    meta: customer.phone || "Sin telefono",
    keywords: [customer.phone || "", customer.notes || ""],
  }));

  const modelOptions: SearchCreateOption[] = modelsList.map((model: any) => ({
    value: String(model.id),
    label: `${model.id} · ${model.name}`,
    meta: `${model.category} · ${model.totalStock} und`,
    keywords: [model.id, model.name, model.category, ...(model.colorCodes || [])],
  }));

  const paymentMethodOptions: SearchCreateOption[] = (configDb?.paymentMethods || [])
    .filter((method: any) => method.active)
    .map((method: any) => ({
      value: String(method.id),
      label: method.name,
      meta: method.currency,
      keywords: [method.currency, method.name],
    }));

  const selectedColorData = activeModelColors.find((color: any) => String(color.id) === selectedColorId) || null;
  const uniqueSizeOptions = Array.from(
    new Map<string, { value: string; label: string; stock: number }>(
      activeSkusForColor.map((sku: any) => [
        String(sku.sizeId || ""),
        {
          value: String(sku.sizeId || ""),
          label:
            activeModel?.type === "sin_tallas"
              ? "Unica"
              : configDb?.sizes.find((size: any) => size.id === sku.sizeId)?.name || "Talla",
          stock: sku.stock,
        },
      ])
    ).values()
  );

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "300px" }}>
        <div className="loader">Cargando facturación y ventas...</div>
      </div>
    );
  }

  // Rate Helper
  const tasaParalelo = parseFloat(
    configDb?.settings[SETTINGS_KEYS.parallelRate] || String(SYSTEM_DEFAULTS.rates.paralelo)
  );
  const tasaBcv = parseFloat(
    configDb?.settings[SETTINGS_KEYS.bcvRate] || String(SYSTEM_DEFAULTS.rates.bcv)
  );

  function handleRateSourceChange(
    src: FxSource,
    target: "document" | "conversion" = "document"
  ) {
    const setSource = target === "document" ? setDocRateSource : setConvertRateSource;
    const setValue = target === "document" ? setDocRateVal : setConvertRateVal;

    setSource(src);
    if (src === "paralelo") setValue(String(tasaParalelo));
    else if (src === "bcv") setValue(String(tasaBcv));
  }

  function resetPaymentDraft() {
    setPayAmountOriginal("");
    setPayRef("");
  }

  function openNewDocumentModal() {
    setErrorMsg("");
    setShowConvertModal(null);
    setDocType("venta");
    setDocCustomerId("");
    setDocDate(new Date().toISOString().slice(0, 10));
    setDocRateSource("paralelo");
    setDocRateVal(String(tasaParalelo));
    setDocNotes("");
    setDocCart([]);
    setPurPayments([]);
    setSuccessMsg("");
    resetPaymentDraft();
    setShowDocModal(true);
  }

  function openConvertQuoteModal(quote: any) {
    setErrorMsg("");
    setShowDocModal(false);
    setPurPayments([]);
    resetPaymentDraft();
    setConvertRateSource("paralelo");
    setConvertRateVal(String(tasaParalelo));
    setSuccessMsg("");
    setShowConvertModal(quote);
  }

  // Cart Management
  function handleAddToCart() {
    const qty = parseInt(itemQty);
    const price = parseFloat(itemPrice);
    if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) return;

    // Find the correct SKU record
    const targetSku = activeSkusForColor.find((s: any) => {
      if (activeModel.type === "sin_tallas") return s.sizeId === null;
      return s.sizeId === (selectedSizeId ? Number(selectedSizeId) : null);
    });

    if (!targetSku) {
      setErrorMsg("La variación seleccionada no está disponible.");
      return;
    }

    const currentCartQty = docCart.find((item) => item.skuId === targetSku.id)?.quantity || 0;
    if (docType === "venta" && currentCartQty + qty > targetSku.stock) {
      setErrorMsg(
        `No hay stock suficiente para ${targetSku.compositeCode}. Disponible: ${targetSku.stock}, ya agregado: ${currentCartQty}.`
      );
      return;
    }

    setErrorMsg("");
    const existsIndex = docCart.findIndex((x) => x.skuId === targetSku.id);
    if (existsIndex > -1) {
      const updated = [...docCart];
      updated[existsIndex].quantity += qty;
      updated[existsIndex].unitPrice = price;
      setDocCart(updated);
    } else {
      setDocCart([
        ...docCart,
        {
          skuId: targetSku.id,
          quantity: qty,
          unitPrice: price,
          code: targetSku.compositeCode,
          stock: targetSku.stock,
        },
      ]);
    }
  }

  function handleRemoveFromCart(index: number) {
    setDocCart(docCart.filter((_, i) => i !== index));
  }

  const cartTotalUsd = docCart.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const docRateNumber = Number.parseFloat(docRateVal) || 0;
  const convertRateNumber = Number.parseFloat(convertRateVal) || 0;
  const cartTotalBs = cartTotalUsd * docRateNumber;
  const selectedPaymentMethod = configDb?.paymentMethods.find((p: any) => p.id === Number(payMethodId)) || null;
  const selectedPaymentCurrency = (selectedPaymentMethod?.currency || "USD").trim().toUpperCase();
  const paymentUsesBolivares = isBolivarCurrency(selectedPaymentCurrency);
  const activePaymentRate = showConvertModal ? convertRateNumber : docRateNumber;
  const activePaymentRateSource = showConvertModal ? convertRateSource : docRateSource;
  const payAmountOriginalNumber = Number.parseFloat(payAmountOriginal);
  const paymentPreviewUsd = Number.isFinite(payAmountOriginalNumber) && payAmountOriginalNumber > 0
    ? paymentUsesBolivares
      ? activePaymentRate > 0
        ? payAmountOriginalNumber / activePaymentRate
        : 0
      : payAmountOriginalNumber
    : 0;

  // Payments Management
  function handleAddPayment() {
    const amountOriginal = parseFloat(payAmountOriginal);
    if (isNaN(amountOriginal) || amountOriginal <= 0 || !payMethodId) return;

    const pm = configDb.paymentMethods.find((p: any) => p.id === Number(payMethodId));
    if (!pm) return;

    const currency = (pm.currency || "USD").trim().toUpperCase();
    const bolivarPayment = isBolivarCurrency(currency);
    const rateUsed = bolivarPayment ? activePaymentRate : 1;
    if (bolivarPayment && (!Number.isFinite(rateUsed) || rateUsed <= 0)) {
      setErrorMsg("La tasa usada para pagos en bolívares debe ser mayor a cero.");
      return;
    }

    const amountUsd = bolivarPayment ? amountOriginal / rateUsed : amountOriginal;

    setPurPayments([
      ...purPayments,
      {
        methodId: pm.id,
        currency,
        amountOriginal,
        amountUsd,
        rateUsed,
        rateSource: bolivarPayment ? activePaymentRateSource : "manual",
        reference: payRef,
        name: pm.name,
      },
    ]);
    resetPaymentDraft();
    setErrorMsg("");
  }

  function handleRemovePayment(idx: number) {
    setPurPayments(purPayments.filter((_, i) => i !== idx));
  }

  const paymentsTotalUsd = purPayments.reduce((sum, p) => sum + p.amountUsd, 0);
  const paymentRemainingUsd = cartTotalUsd - paymentsTotalUsd;

  async function handleCreateCustomerFromSearch(query: string) {
    const name = query.trim();
    if (!name) return;
    setSubmitting(true);
    const res = await createCustomerAction(name, "");
    const freshCusts = await getCustomers();
    setCustomersList(freshCusts);
    setSubmitting(false);

    if (res.success) {
      const created = freshCusts.find((customer: any) => customer.name.toLowerCase() === name.toLowerCase());
      if (created) {
        setDocCustomerId(String(created.id));
      }
      return;
    }

    throw new Error(res.error || "Error al crear cliente.");
  }

  // Document Submission
  async function handleSubmitDocument(e: React.FormEvent) {
    e.preventDefault();
    if (docCart.length === 0) {
      setErrorMsg("Debe agregar al menos un ítem al carrito.");
      return;
    }

    if (docType === "venta") {
      // Validate payment matches total
      if (Math.abs(paymentRemainingUsd) > 0.01) {
        setErrorMsg(`Los pagos agregados (${formatUSD(paymentsTotalUsd)}) deben coincidir exactamente con el total de la venta (${formatUSD(cartTotalUsd)}).`);
        return;
      }
    }

    const resolvedDocRate = Number.parseFloat(docRateVal);
    if (!Number.isFinite(resolvedDocRate) || resolvedDocRate <= 0) {
      setErrorMsg("Debe indicar una tasa valida para la transacción.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    const res = await createSaleOrQuote({
      type: docType,
      customerId: docCustomerId ? Number(docCustomerId) : null,
      date: docDate,
      totalUsd: cartTotalUsd,
      rateUsed: parseFloat(docRateVal),
      rateSource: docRateSource,
      notes: docNotes,
      items: docCart.map((x) => ({
        skuId: x.skuId,
        quantity: x.quantity,
        unitPrice: x.unitPrice,
      })),
      payments: docType === "venta" ? purPayments.map((x) => ({
        methodId: x.methodId,
        amountUsd: x.amountUsd,
        amountOriginal: x.amountOriginal,
        currency: x.currency,
        rateUsed: x.rateUsed,
        rateSource: x.rateSource,
        reference: x.reference,
      })) : undefined,
    });
    setSubmitting(false);

    if (res.success) {
      setShowDocModal(false);
      setDocCart([]);
      setPurPayments([]);
      setDocNotes("");
      resetPaymentDraft();
      loadData();
      setSuccessMsg(`${docType === "venta" ? "Venta" : "Cotización"} registrada correctamente.`);
    } else {
      setErrorMsg(res.error || "Error al registrar documento");
    }
  }

  // Conversion Submission
  async function handleConvertQuote(e: React.FormEvent) {
    e.preventDefault();
    if (!showConvertModal) return;

    const remaining = showConvertModal.totalUsd - paymentsTotalUsd;
    if (Math.abs(remaining) > 0.01) {
      setErrorMsg(`Los pagos agregados (${formatUSD(paymentsTotalUsd)}) deben coincidir exactamente con el total de la cotización (${formatUSD(showConvertModal.totalUsd)}).`);
      return;
    }

    const resolvedConvertRate = Number.parseFloat(convertRateVal);
    if (!Number.isFinite(resolvedConvertRate) || resolvedConvertRate <= 0) {
      setErrorMsg("Debe indicar una tasa valida para la conversión.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    const res = await convertQuoteToSaleAction(
      showConvertModal.id,
      purPayments.map((x) => ({
        methodId: x.methodId,
        amountUsd: x.amountUsd,
        amountOriginal: x.amountOriginal,
        currency: x.currency,
        rateUsed: x.rateUsed,
        rateSource: x.rateSource,
        reference: x.reference,
      })),
      resolvedConvertRate,
      convertRateSource
    );
    setSubmitting(false);

    if (res.success) {
      setShowConvertModal(null);
      setPurPayments([]);
      resetPaymentDraft();
      loadData();
      setSuccessMsg("Cotización convertida a venta correctamente.");
    } else {
      setErrorMsg(res.error || "Error al convertir cotización");
    }
  }

  // Calculate KPIs
  const today = new Date().toISOString().slice(0, 10);
  const salesToday = salesList.filter((d) => d.type === "venta" && d.date === today);
  const totalSalesTodayUsd = salesToday.reduce((sum, d) => sum + d.totalUsd, 0);
  const totalSalesTodayBs = totalSalesTodayUsd * tasaParalelo;

  const allVentas = salesList.filter((d) => d.type === "venta");
  const ticketPromUsd = allVentas.length > 0
    ? allVentas.reduce((sum, d) => sum + d.totalUsd, 0) / allVentas.length
    : 0;

  const lastNe = salesList.find((d) => d.type === "venta")?.number || "NE-00000";
  const lastCot = salesList.find((d) => d.type === "cotizacion")?.number || "COT-00000";

  return (
    <div className="animate-fade-in">
      {successMsg ? (
        <div className="alert-banner alert-banner-success" style={{ marginBottom: 14 }}>
          <p>{successMsg}</p>
        </div>
      ) : null}
      {/* KPIs */}
      <div className="grid-3 mb-18">
        <div className="card card-compact">
          <div className="section-label">Ventas hoy</div>
          <div style={{ fontSize: "var(--text-5xl)", fontWeight: 800, letterSpacing: "-0.02em", marginTop: 8 }}>
            {formatUSD(totalSalesTodayUsd)}
          </div>
          <div className="font-mono" style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", marginTop: 2 }}>
            Bs {totalSalesTodayBs.toLocaleString("es-VE", { maximumFractionDigits: 0 })} · {salesToday.length} ventas
          </div>
        </div>

        <div className="card card-compact">
          <div className="section-label">Ticket promedio</div>
          <div style={{ fontSize: "var(--text-5xl)", fontWeight: 800, letterSpacing: "-0.02em", marginTop: 8 }}>
            {formatUSD(ticketPromUsd)}
          </div>
          <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", marginTop: 2 }}>
            calculado del histórico de ventas
          </div>
        </div>

        <div className="card card-compact">
          <div className="section-label">Documentos</div>
          <div style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginTop: 8, display: "flex", gap: 14 }}>
            <span className="font-mono">{lastNe}</span>
            <span className="font-mono" style={{ color: "var(--text-muted)" }}>{lastCot}</span>
          </div>
          <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", marginTop: 2 }}>
            Última Venta / Cotización
          </div>
        </div>
      </div>

      {/* Sales table */}
      <div className="table-container">
        <div className="table-header-row">
          <h3>Cotizaciones y ventas</h3>
          <button className="btn btn-primary btn-sm" onClick={openNewDocumentModal}>
            {plusIcon} Nueva
          </button>
        </div>

        {/* Column headers */}
        <div className="responsive-table-scroll">
        <div style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 0.8fr 1.8fr 0.6fr 1.1fr 1fr 1.6fr",
          gap: 14,
          minWidth: 980,
          padding: "13px 22px",
          borderBottom: "1px solid var(--border-header)",
          font: "600 10.5px/1 var(--font-sans)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}>
          <span>Documento</span>
          <span>Fecha</span>
          <span>Cliente</span>
          <span>Cant.</span>
          <span>Pago</span>
          <span style={{ textAlign: "right" }}>Total USD</span>
          <span style={{ textAlign: "right" }}>Estado / Acciones</span>
        </div>

        {/* Rows */}
        {salesList.map((v) => (
          <div
            key={v.number}
            className="table-row"
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 0.8fr 1.8fr 0.6fr 1.1fr 1fr 1.6fr",
              gap: 14,
              minWidth: 980,
              alignItems: "center",
            }}
          >
            <a
              href={`/api/documentos/${v.type}/${v.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono"
              style={{ fontSize: "var(--text-base2)", fontWeight: 600, textDecoration: "underline" }}
            >
              {v.number}
            </a>
            <span style={{ fontSize: "var(--text-base2)", color: "var(--text-tertiary)" }}>{v.date}</span>
            <span style={{ fontSize: "var(--text-md)", fontWeight: 500 }}>{v.customerName}</span>
            <span style={{ fontSize: "var(--text-md)", color: "var(--text-secondary)" }}>{v.itemsCount}</span>
            <span className={payBadge(v.payMethodSummary)}>{v.payMethodSummary}</span>
            <span style={{ fontSize: "var(--text-md2)", fontWeight: 700, textAlign: "right" }}>{formatUSD(v.totalUsd)}</span>
            <span style={{ textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
              {v.type === "cotizacion" && v.rawStatus === "abierta" && (
                <button
                  className="btn btn-secondary btn-xs"
                  style={{ fontSize: "10.5px", padding: "4px 8px" }}
                  onClick={() => openConvertQuoteModal(v)}
                >
                  Cobrar
                </button>
              )}
              <span className={estadoBadge(v.status)}>{v.status}</span>
            </span>
          </div>
        ))}
        </div>
      </div>

      {/* --- NUEVA VENTA / COTIZACION MODAL --- */}
      {showDocModal && (
        <div className="modal-backdrop">
          <div className="modal sales-modal">
            <div className="modal-header">
              <h2>Registrar Documento Comercial</h2>
              <button className="modal-close" onClick={() => setShowDocModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmitDocument}>
              {errorMsg && <div className="alert-banner alert-banner-danger" style={{ marginBottom: 14 }}><p>{errorMsg}</p></div>}

              {/* Document Type Toggle */}
              <div style={{ marginBottom: 14 }}>
                <label className="input-label" style={{ marginBottom: 4 }}>Tipo de documento</label>
                <div className="range-selector" style={{ width: "max-content" }}>
                  <button type="button" className={`range-btn ${docType === "venta" ? "active" : ""}`} onClick={() => setDocType("venta")}>Nota de Entrega (Venta)</button>
                  <button type="button" className={`range-btn ${docType === "cotizacion" ? "active" : ""}`} onClick={() => { setDocType("cotizacion"); setPurPayments([]); resetPaymentDraft(); }}>Cotización (No descuenta stock)</button>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <SearchCreateSelect
                  label="Cliente (CRM)"
                  value={docCustomerId}
                  options={customerOptions}
                  onChange={setDocCustomerId}
                  onCreate={handleCreateCustomerFromSearch}
                  allowClear
                  placeholder="Buscar cliente por nombre o telefono"
                  createLabel={(query) => `+ Crear cliente "${query}"`}
                  emptyMessage="No hay clientes con ese criterio."
                />
              </div>

              <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
                <div>
                  <label className="input-label">Fecha</label>
                  <input className="input" type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} required />
                </div>
                <div>
                  <label className="input-label">Tasa de cambio aplicada</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select className="input" style={{ width: "110px", flex: "none" }} value={docRateSource} onChange={(e) => handleRateSourceChange(e.target.value as FxSource, "document")}>
                      <option value="paralelo">Paralelo</option>
                      <option value="bcv">BCV</option>
                      <option value="manual">Manual</option>
                    </select>
                    <input className="input" type="number" step="0.01" value={docRateVal} onChange={(e) => setDocRateVal(e.target.value)} disabled={docRateSource !== "manual"} required />
                  </div>
                  <div style={{ fontSize: "var(--text-xs2)", color: "var(--text-muted)", marginTop: 4 }}>
                    La venta se consolida en USD y guarda esta tasa exacta para el histórico.
                  </div>
                </div>
              </div>

              <div className="divider" style={{ margin: "16px 0" }} />

              <div className="sales-composer" style={{ marginBottom: 14 }}>
                <div className="sales-panel">
                  <div className="sales-panel-title">Agregar artículo</div>
                  <div style={{ marginBottom: 14 }}>
                    <SearchCreateSelect
                      label="Producto"
                      value={selectedModelId}
                      options={modelOptions}
                      onChange={setSelectedModelId}
                      placeholder="Buscar por código, nombre o categoría"
                      emptyMessage="No hay modelos que coincidan."
                    />
                  </div>

                  <div className="sales-product-preview">
                    <div className="sales-product-image">
                      {selectedColorData?.imageUrl ? (
                        <img src={selectedColorData.imageUrl} alt={selectedColorData.name} />
                      ) : (
                        <span className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>K-UNIFORMES</span>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: "var(--text-2xl)", fontWeight: 800 }}>
                        {activeModel?.name || "Selecciona un producto"}
                      </div>
                      <div className="font-mono" style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", marginTop: 4 }}>
                        {activeModel ? `${activeModel.id} · ${activeModel.category}` : "Sin selección"}
                      </div>
                      <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-secondary)", marginTop: 8 }}>
                        {selectedColorData ? `${selectedColorData.name} (${selectedColorData.code})` : "Elige color y talla para agregar rápido al carrito."}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label className="input-label" style={{ marginBottom: 6 }}>Color</label>
                    <div className="sales-color-grid">
                      {activeModelColors.map((color: any) => (
                        <button
                          key={color.id}
                          type="button"
                          className={`sales-choice-chip ${selectedColorId === String(color.id) ? "is-active" : ""}`}
                          onClick={() => setSelectedColorId(String(color.id))}
                        >
                          <span className="color-swatch" style={{ background: color.hex, borderColor: selectedColorId === String(color.id) ? "rgba(255,255,255,.4)" : "var(--border-subtle)" }} />
                          {color.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label className="input-label" style={{ marginBottom: 6 }}>Talla</label>
                    <div className="sales-size-grid">
                      {uniqueSizeOptions.map((size) => (
                        <button
                          key={size.value || "unica"}
                          type="button"
                          className={`sales-choice-chip ${selectedSizeId === size.value ? "is-active" : ""} ${size.stock <= 0 ? "is-disabled" : ""}`}
                          onClick={() => setSelectedSizeId(size.value)}
                        >
                          {size.label} <span style={{ fontSize: "var(--text-sm2)", opacity: 0.75 }}>{size.stock} und</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid-2" style={{ gap: 12, alignItems: "end" }}>
                    <div>
                      <label className="input-label" style={{ marginBottom: 4 }}>Cantidad</label>
                      <input className="input" type="number" min="1" value={itemQty} onChange={(e) => setItemQty(e.target.value)} />
                    </div>
                    <div>
                      <label className="input-label" style={{ marginBottom: 4 }}>Precio unitario</label>
                      <input className="input" type="number" min="0.5" step="0.5" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} />
                    </div>
                  </div>
                  <button type="button" className="btn btn-primary" style={{ marginTop: 14, width: "100%" }} onClick={handleAddToCart}>
                    {plusIcon} Agregar al carrito
                  </button>
                </div>

                <div className="sales-panel">
                  <div className="sales-panel-title">Resumen rápido</div>
                  <div className="sales-kpi-strip">
                    <div className="sales-kpi-card">
                      <div className="sales-kpi-card-label">Stock actual</div>
                      <div className="sales-kpi-card-value">
                        {activeSkusForColor.find((sku: any) => String(sku.sizeId || "") === selectedSizeId)?.stock ?? activeModel?.totalStock ?? 0}
                      </div>
                    </div>
                    <div className="sales-kpi-card">
                      <div className="sales-kpi-card-label">Precio base</div>
                      <div className="sales-kpi-card-value">{formatUSD(activeModel?.basePrice || 0)}</div>
                    </div>
                    <div className="sales-kpi-card">
                      <div className="sales-kpi-card-label">Carrito</div>
                      <div className="sales-kpi-card-value">{docCart.length} items</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <label className="input-label" style={{ marginBottom: 6 }}>Artículos agregados</label>
                    {docCart.length === 0 ? (
                      <div style={{ fontSize: "var(--text-base)", color: "var(--text-muted)", padding: "12px 0" }}>
                        Carrito vacío.
                      </div>
                    ) : (
                      <div style={{ maxHeight: 220, overflowY: "auto" }}>
                        {docCart.map((item, idx) => (
                          <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border-light)", background: "#fff", borderRadius: 8, marginBottom: 6 }}>
                            <div>
                              <div className="font-mono" style={{ fontSize: "var(--text-sm2)", fontWeight: 600 }}>{item.code}</div>
                              <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)" }}>{item.quantity}u · {formatUSD(item.unitPrice)} · {item.stock} disp</div>
                            </div>
                            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                              <span style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>{formatUSD(item.quantity * item.unitPrice)}</span>
                              <button type="button" className="btn-icon" style={{ color: "var(--danger)", padding: 4 }} onClick={() => handleRemoveFromCart(idx)}>
                                {trashIcon}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
                      <div>
                        <div style={{ fontSize: "var(--text-xs2)", color: "var(--text-muted)" }}>Total en Bolívares</div>
                        <div className="font-mono" style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>{formatBs(cartTotalBs)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "var(--text-xs2)", color: "var(--text-muted)" }}>Total USD</div>
                        <div style={{ fontSize: "var(--text-2xl)", fontWeight: 800 }}>{formatUSD(cartTotalUsd)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payments Section (Venta only) */}
              {docType === "venta" && (
                <div style={{ background: "var(--bg-subtle)", padding: 14, borderRadius: "var(--radius-3xl)", marginBottom: 20 }}>
                  <h4 style={{ fontSize: "var(--text-base2)", fontWeight: 700, marginBottom: 8 }}>Registrar Pagos (División Mixta)</h4>
                  
                  <div className="responsive-table-scroll">
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.5fr auto", gap: 10, alignItems: "flex-end", marginBottom: 12, minWidth: 620 }}>
                    <div>
                      <SearchCreateSelect
                        label="Método de pago"
                        value={payMethodId}
                        options={paymentMethodOptions}
                        onChange={setPayMethodId}
                        placeholder="Buscar método"
                        emptyMessage="Sin métodos activos."
                      />
                    </div>
                    <div>
                      <label className="input-label" style={{ marginBottom: 4 }}>
                        {paymentUsesBolivares ? "Monto recibido (Bs)" : `Monto recibido (${selectedPaymentCurrency || "USD"})`}
                      </label>
                      <input className="input" type="number" min="0.1" step="0.01" value={payAmountOriginal} onChange={(e) => setPayAmountOriginal(e.target.value)} placeholder={paymentUsesBolivares ? "68650.00" : "86.00"} />
                    </div>
                    <div>
                      <label className="input-label" style={{ marginBottom: 4 }}>Referencia / Operación</label>
                      <input className="input" type="text" placeholder="Zelle ID, Binance hash, etc." value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" style={{ height: "40px" }} onClick={handleAddPayment}>
                      Registrar
                    </button>
                  </div>
                  </div>

                  <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", marginBottom: 12 }}>
                    {paymentUsesBolivares
                      ? `Se convertirán ${payAmountOriginalNumber > 0 ? formatBs(payAmountOriginalNumber) : "los Bs ingresados"} a ${paymentPreviewUsd > 0 ? formatUSD(paymentPreviewUsd) : "$0,00"} usando tasa ${formatRate(activePaymentRate || 0)} (${activePaymentRateSource}).`
                      : `Los pagos en ${selectedPaymentCurrency || "USD"} se registran 1:1 en USD.`}
                  </div>

                  {/* Payments list summary */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                    {purPayments.map((p, idx) => (
                      <span key={idx} className="badge badge-info" style={{ display: "flex", gap: 6, padding: "6px 10px", height: "auto", fontSize: "12px" }}>
                        {p.name}: {isBolivarCurrency(p.currency) ? `${formatBs(p.amountOriginal)} -> ${formatUSD(p.amountUsd)} @ ${formatRate(p.rateUsed)}` : formatUSD(p.amountUsd)} {p.reference ? `(ref: ${p.reference})` : ""}
                        <button type="button" style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", fontWeight: 700 }} onClick={() => handleRemovePayment(idx)}>×</button>
                      </span>
                    ))}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: 600 }}>
                    <span style={{ color: "var(--text-secondary)" }}>Total Pagado: {formatUSD(paymentsTotalUsd)}</span>
                    <span style={{ color: Math.abs(paymentRemainingUsd) < 0.01 ? "var(--success)" : "var(--danger)" }}>
                      {Math.abs(paymentRemainingUsd) < 0.01 ? "Completado ✓" : `Restante por pagar: ${formatUSD(paymentRemainingUsd)}${docRateNumber > 0 ? ` / ${formatBs(paymentRemainingUsd * docRateNumber)}` : ""}`}
                    </span>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label className="input-label">Notas / Instrucciones de despacho</label>
                <input className="input" type="text" placeholder="Entregar en consultorio, retirar por tienda..." value={docNotes} onChange={(e) => setDocNotes(e.target.value)} />
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowDocModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>Emitir Documento</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- COBRAR / CONVERTIR COTIZACION MODAL --- */}
      {showConvertModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h2>Cobrar Cotización {showConvertModal.number}</h2>
              <button className="modal-close" onClick={() => setShowConvertModal(null)}>×</button>
            </div>
            <form onSubmit={handleConvertQuote}>
              {errorMsg && <div className="alert-banner alert-banner-danger" style={{ marginBottom: 14 }}><p>{errorMsg}</p></div>}
              
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Cliente: <strong>{showConvertModal.customerName}</strong></div>
                <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: 4 }}>Monto total a cobrar: <strong style={{ fontSize: "18px", color: "#15151A" }}>{formatUSD(showConvertModal.totalUsd)}</strong></div>
                <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: 4 }}>Equivalente: <strong>{formatBs(showConvertModal.totalUsd * convertRateNumber)}</strong></div>
              </div>

              <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
                <div>
                  <label className="input-label">Tasa para cobrar esta venta</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select className="input" style={{ width: "110px", flex: "none" }} value={convertRateSource} onChange={(e) => handleRateSourceChange(e.target.value as FxSource, "conversion")}>
                      <option value="paralelo">Paralelo</option>
                      <option value="bcv">BCV</option>
                      <option value="manual">Manual</option>
                    </select>
                    <input className="input" type="number" step="0.01" value={convertRateVal} onChange={(e) => setConvertRateVal(e.target.value)} disabled={convertRateSource !== "manual"} required />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", fontSize: "var(--text-sm2)", color: "var(--text-muted)" }}>
                  La venta final guarda la tasa aplicada al convertir la cotización.
                </div>
              </div>

              {/* Payments Section */}
              <div style={{ background: "var(--bg-subtle)", padding: 14, borderRadius: "var(--radius-3xl)", marginBottom: 20 }}>
                <h4 style={{ fontSize: "var(--text-base2)", fontWeight: 700, marginBottom: 8 }}>Registrar Pagos</h4>
                
                <div className="responsive-table-scroll">
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.2fr auto", gap: 10, alignItems: "flex-end", marginBottom: 12, minWidth: 580 }}>
                  <div>
                    <SearchCreateSelect
                      label="Método"
                      value={payMethodId}
                      options={paymentMethodOptions}
                      onChange={setPayMethodId}
                      placeholder="Buscar método"
                      emptyMessage="Sin métodos activos."
                    />
                  </div>
                  <div>
                    <label className="input-label" style={{ marginBottom: 4 }}>
                      {paymentUsesBolivares ? "Monto recibido (Bs)" : `Monto recibido (${selectedPaymentCurrency || "USD"})`}
                    </label>
                    <input className="input" type="number" min="0.1" step="0.01" value={payAmountOriginal} onChange={(e) => setPayAmountOriginal(e.target.value)} placeholder={paymentUsesBolivares ? "40120.00" : "50.00"} />
                  </div>
                  <div>
                    <label className="input-label" style={{ marginBottom: 4 }}>Referencia</label>
                    <input className="input" type="text" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ height: "40px" }} onClick={handleAddPayment}>
                    Agregar
                  </button>
                </div>
                </div>

                <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", marginBottom: 12 }}>
                  {paymentUsesBolivares
                    ? `Conversión estimada: ${paymentPreviewUsd > 0 ? formatUSD(paymentPreviewUsd) : "$0,00"} con tasa ${formatRate(activePaymentRate || 0)} (${activePaymentRateSource}).`
                    : `Los pagos en ${selectedPaymentCurrency || "USD"} se registran 1:1 en USD.`}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                  {purPayments.map((p, idx) => (
                    <span key={idx} className="badge badge-info" style={{ display: "flex", gap: 6, padding: "6px 10px", height: "auto", fontSize: "12px" }}>
                      {p.name}: {isBolivarCurrency(p.currency) ? `${formatBs(p.amountOriginal)} -> ${formatUSD(p.amountUsd)} @ ${formatRate(p.rateUsed)}` : formatUSD(p.amountUsd)}
                      <button type="button" style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer" }} onClick={() => handleRemovePayment(idx)}>×</button>
                    </span>
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: 600 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Total Pagado: {formatUSD(paymentsTotalUsd)}</span>
                  <span style={{ color: Math.abs(showConvertModal.totalUsd - paymentsTotalUsd) < 0.01 ? "var(--success)" : "var(--danger)" }}>
                    {Math.abs(showConvertModal.totalUsd - paymentsTotalUsd) < 0.01 ? "Completado ✓" : `Restante: ${formatUSD(showConvertModal.totalUsd - paymentsTotalUsd)}`}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowConvertModal(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>Confirmar Venta</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
