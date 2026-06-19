"use client";

import { useState, useEffect, type FormEvent } from "react";
import {
  getReturnsData,
  getSalesAndQuotesData,
  getSaleItemsAction,
  createReturnAction,
  getInventoryModels,
} from "@/lib/db/actions";
import { formatUSD } from "@/lib/utils";

function tipoBadge(t: string): string {
  return t === "Cambio" ? "badge badge-info" : "badge badge-warning";
}

function estadoBadge(e: string): string {
  return e === "Procesada" ? "badge badge-success" : "badge badge-danger";
}

export default function DevolucionesPage() {
  const [loading, setLoading] = useState(true);
  const [returnsList, setReturnsList] = useState<any[]>([]);
  const [salesList, setSalesList] = useState<any[]>([]);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Form state
  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [returnType, setReturnType] = useState<"devolucion" | "cambio">("devolucion");
  const [reason, setReason] = useState("");
  const [addCredit, setAddCredit] = useState(true);
  
  // Items from selected sale
  const [saleItemsList, setSaleItemsList] = useState<any[]>([]);
  const [returnQuantities, setReturnQuantities] = useState<Record<number, number>>({}); // skuId -> quantity to return
  const [inventorySkus, setInventorySkus] = useState<{ id: number; compositeCode: string; stock: number }[]>([]);
  const [replacementSelections, setReplacementSelections] = useState<Record<number, { replacementSkuId: string; quantity: number }>>({});

  async function loadData() {
    try {
      setLoading(true);
      const data = await getReturnsData();
      setReturnsList(data);

      const allSalesAndQuotes = await getSalesAndQuotesData();
      const onlySales = allSalesAndQuotes.filter((d: any) => d.type === "venta" && d.rawStatus !== "anulada");
      setSalesList(onlySales);
      if (onlySales.length > 0) {
        setSelectedSaleId(String(onlySales[0].id));
      }

      const inventoryModels = await getInventoryModels();
      const flattenedSkus = inventoryModels
        .flatMap((model: any) => model.skus)
        .map((sku: any) => ({
          id: sku.id,
          compositeCode: sku.compositeCode,
          stock: sku.stock,
        }))
        .sort((a: any, b: any) => a.compositeCode.localeCompare(b.compositeCode));
      setInventorySkus(flattenedSkus);
      setErrorMsg("");
    } catch (e) {
      console.error(e);
      setErrorMsg("Error al cargar devoluciones.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Fetch sale items when selected sale changes
  useEffect(() => {
    if (!selectedSaleId) return;
    async function fetchItems() {
      const items = await getSaleItemsAction(Number(selectedSaleId));
      setSaleItemsList(items);
      const defaultQtys: Record<number, number> = {};
      items.forEach((item: any) => {
        defaultQtys[item.skuId] = 0; // default to returning 0
      });
      setReturnQuantities(defaultQtys);
      setReplacementSelections({});
    }
    fetchItems();
  }, [selectedSaleId]);

  const activeSale = salesList.find((s) => s.id === Number(selectedSaleId));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedSaleId || !reason) return;

    // Filter items to return
    const itemsToReturn = saleItemsList
      .map((item) => ({
        skuId: item.skuId,
        quantity: returnQuantities[item.skuId] || 0,
        unitPrice: item.unitPrice,
      }))
      .filter((item) => item.quantity > 0);

    if (itemsToReturn.length === 0) {
      setErrorMsg("Debes seleccionar al menos 1 prenda para retornar.");
      return;
    }

    // Validate quantities
    for (const item of itemsToReturn) {
      const originalItem = saleItemsList.find((x) => x.skuId === item.skuId);
      if (originalItem && item.quantity > originalItem.quantity) {
        setErrorMsg(`La cantidad a retornar de ${originalItem.compositeCode} no puede exceder las ${originalItem.quantity} unidades vendidas.`);
        return;
      }
    }

    const replacements = returnType === "cambio"
      ? itemsToReturn.map((item) => {
          const selection = replacementSelections[item.skuId];
          return {
            originalSkuId: item.skuId,
            replacementSkuId: Number(selection?.replacementSkuId),
            quantity: selection?.quantity ?? item.quantity,
          };
        })
      : [];

    if (returnType === "cambio") {
      for (const item of itemsToReturn) {
        const selection = replacementSelections[item.skuId];
        if (!selection?.replacementSkuId) {
          setErrorMsg(`Debes seleccionar la prenda de reemplazo para ${item.skuId}.`);
          return;
        }
        if (!selection.quantity || selection.quantity <= 0) {
          setErrorMsg("La cantidad de reemplazo debe ser mayor a cero.");
          return;
        }
        if (selection.quantity > item.quantity) {
          setErrorMsg("La cantidad de reemplazo no puede exceder lo devuelto.");
          return;
        }
      }
    }

    setSubmitting(true);
    const res = await createReturnAction({
      saleId: Number(selectedSaleId),
      type: returnType,
      reason,
      items: itemsToReturn,
      replacements,
      addCredit: activeSale?.customerName !== "Venta anónima" ? addCredit : false,
    });
    setSubmitting(false);

    if (res.success) {
      setShowModal(false);
      setReason("");
      setSelectedSaleId(salesList[0]?.id ? String(salesList[0].id) : "");
      setReturnType("devolucion");
      setReplacementSelections({});
      loadData();
    } else {
      setErrorMsg(res.error || "Error al procesar devolución");
    }
  }

  function handleQtyChange(skuId: number, val: number, max: number) {
    const qty = Math.min(max, Math.max(0, val));
    setReturnQuantities({
      ...returnQuantities,
      [skuId]: qty,
    });

    setReplacementSelections((prev) => {
      const current = prev[skuId];
      if (!current) return prev;
      return {
        ...prev,
        [skuId]: {
          ...current,
          quantity: Math.min(current.quantity || qty, qty),
        },
      };
    });
  }

  function handleReplacementChange(originalSkuId: number, field: "replacementSkuId" | "quantity", value: string) {
    const maxQty = returnQuantities[originalSkuId] || 0;
    setReplacementSelections((prev) => {
      const current = prev[originalSkuId] || { replacementSkuId: "", quantity: maxQty || 1 };
      return {
        ...prev,
        [originalSkuId]: {
          ...current,
          [field]: field === "quantity"
            ? Math.max(0, Math.min(maxQty, Number(value) || 0))
            : value,
        },
      };
    });
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "300px" }}>
        <div className="loader">Cargando devoluciones...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="table-container">
        <div className="table-header-row">
          <h3>Devoluciones y cambios</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Registrar devolución
          </button>
        </div>
        <div className="responsive-table-scroll">
        <div style={{
          display: "grid", gridTemplateColumns: "0.9fr 0.9fr 1.8fr 0.8fr 1.5fr 1fr",
          gap: 14, minWidth: 860, padding: "13px 22px", borderBottom: "1px solid var(--border-header)",
          font: "600 10.5px/1 var(--font-sans)", letterSpacing: "0.1em",
          textTransform: "uppercase", color: "var(--text-muted)",
        }}>
          <span>Ref.</span><span>Venta</span><span>Cliente</span><span>Tipo</span><span>Motivo</span><span style={{ textAlign: "right" }}>Estado</span>
        </div>
        
        {returnsList.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
            No hay devoluciones registradas en el sistema.
          </div>
        ) : (
          returnsList.map((r) => (
            <div key={r.id} className="table-row" style={{
              display: "grid", gridTemplateColumns: "0.9fr 0.9fr 1.8fr 0.8fr 1.5fr 1fr", gap: 14, minWidth: 860,
            }}>
              <span className="font-mono" style={{ fontSize: "var(--text-base2)", fontWeight: 600 }}>{r.ref}</span>
              <span className="font-mono" style={{ fontSize: "var(--text-base2)", color: "var(--text-tertiary)" }}>{r.venta}</span>
              <span style={{ fontSize: "var(--text-md)", fontWeight: 500 }}>{r.cliente}</span>
              <span className={tipoBadge(r.tipo)}>{r.tipo}</span>
              <span style={{ fontSize: "var(--text-base2)", color: "var(--text-secondary)" }}>
                {r.motivo} {r.resolution && <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>({r.resolution})</span>}
              </span>
              <span style={{ textAlign: "right" }}><span className={estadoBadge(r.estado)}>{r.estado}</span></span>
            </div>
          ))
        )}
        </div>
      </div>

      {/* Register Return Modal */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-content animate-pop-in" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h4>Registrar Devolución o Cambio</h4>
              <button className="btn-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              {errorMsg && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{errorMsg}</div>}
              
              <div className="form-group">
                <label>Seleccionar Venta (Nota de Entrega)</label>
                <select
                  value={selectedSaleId}
                  onChange={(e) => setSelectedSaleId(e.target.value)}
                  required
                >
                  {salesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.number} — {s.customerName} ({formatUSD(s.totalUsd)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Tipo de Transacción</label>
                <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="returnType"
                      checked={returnType === "devolucion"}
                      onChange={() => setReturnType("devolucion")}
                      style={{ accentColor: "var(--bg-card-dark)" }}
                    />
                    Devolución (Nota de crédito)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="returnType"
                      checked={returnType === "cambio"}
                      onChange={() => setReturnType("cambio")}
                      style={{ accentColor: "var(--bg-card-dark)" }}
                    />
                    Cambio (Reemplazo de prenda)
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>Motivo</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej. Talla M le quedó muy grande, cambia a S"
                  required
                />
              </div>

              <div className="form-group">
                <label>Prendas de la Venta a Retornar</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6, maxHeight: 150, overflowY: "auto", background: "var(--bg-subtle)", borderRadius: 8, padding: 10 }}>
                  {saleItemsList.map((item) => (
                    <div key={item.skuId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
                      <span className="font-mono" style={{ fontWeight: 600 }}>{item.compositeCode}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "var(--text-muted)" }}>({item.quantity} compradas)</span>
                        <input
                          type="number"
                          value={returnQuantities[item.skuId] || 0}
                          onChange={(e) => handleQtyChange(item.skuId, parseInt(e.target.value) || 0, item.quantity)}
                          min="0"
                          max={item.quantity}
                          style={{ width: 60, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--border-light)", textAlign: "center" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {returnType === "cambio" && (
                <div className="form-group">
                  <label>Prendas de reemplazo</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6, maxHeight: 210, overflowY: "auto", background: "var(--bg-subtle)", borderRadius: 8, padding: 10 }}>
                    {saleItemsList.filter((item) => (returnQuantities[item.skuId] || 0) > 0).length === 0 ? (
                      <div style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
                        Primero selecciona las prendas que entran en el cambio.
                      </div>
                    ) : (
                      saleItemsList
                        .filter((item) => (returnQuantities[item.skuId] || 0) > 0)
                        .map((item) => {
                          const selection = replacementSelections[item.skuId] || {
                            replacementSkuId: "",
                            quantity: returnQuantities[item.skuId] || 0,
                          };
                          return (
                            <div key={`replacement-${item.skuId}`} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.6fr 80px", gap: 10, alignItems: "center" }}>
                              <div className="font-mono" style={{ fontSize: "var(--text-sm2)", fontWeight: 600 }}>
                                {item.compositeCode} x{returnQuantities[item.skuId]}
                              </div>
                              <select
                                value={selection.replacementSkuId}
                                onChange={(e) => handleReplacementChange(item.skuId, "replacementSkuId", e.target.value)}
                              >
                                <option value="">Selecciona reemplazo</option>
                                {inventorySkus.map((sku) => (
                                  <option key={sku.id} value={sku.id}>
                                    {sku.compositeCode} (Disp.: {sku.stock})
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number"
                                min="1"
                                max={returnQuantities[item.skuId] || 1}
                                value={selection.quantity}
                                onChange={(e) => handleReplacementChange(item.skuId, "quantity", e.target.value)}
                                style={{ textAlign: "center" }}
                              />
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>
              )}

              {activeSale && activeSale.customerName !== "Venta anónima" && returnType === "devolucion" && (
                <div className="form-group" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                  <input
                    type="checkbox"
                    id="addCredit"
                    checked={addCredit}
                    onChange={(e) => setAddCredit(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: "var(--bg-card-dark)", cursor: "pointer" }}
                  />
                  <label htmlFor="addCredit" style={{ fontSize: "var(--text-sm)", fontWeight: 500, cursor: "pointer", userSelect: "none" }}>
                    Acreditar saldo a favor del cliente ({activeSale.customerName})
                  </label>
                </div>
              )}

              <div className="modal-footer" style={{ marginTop: 18 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Procesando..." : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
