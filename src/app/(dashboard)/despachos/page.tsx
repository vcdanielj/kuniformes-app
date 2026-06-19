"use client";

import { useState, useEffect } from "react";
import { getShipmentsData, createShipmentAction, updateShipmentStatusAction, getSalesAndQuotesData, getConfigData } from "@/lib/db/actions";
import { formatUSD } from "@/lib/utils";

function estadoBadge(e: string): string {
  if (e === "Entregado") return "badge badge-success";
  if (e === "Despachado") return "badge badge-info";
  if (e === "Pendiente") return "badge badge-warning";
  return "badge badge-neutral";
}

export default function DespachosPage() {
  const [loading, setLoading] = useState(true);
  const [shipmentsList, setShipmentsList] = useState<any[]>([]);
  const [salesList, setSalesList] = useState<any[]>([]);
  const [carriersList, setCarriersList] = useState<any[]>([]);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Form State
  const [trackingNumber, setTrackingNumber] = useState("");
  const [saleId, setSaleId] = useState("");
  const [carrierId, setCarrierId] = useState("");
  const [destination, setDestination] = useState("");
  const [costUsd, setCostUsd] = useState("");
  const [status, setStatus] = useState<"pendiente" | "despachado" | "entregado">("pendiente");

  async function loadData() {
    try {
      setLoading(true);
      const data = await getShipmentsData();
      setShipmentsList(data);

      const allDocs = await getSalesAndQuotesData();
      const onlySales = allDocs.filter((d: any) => d.type === "venta");
      setSalesList(onlySales);
      if (onlySales.length > 0) {
        setSaleId(String(onlySales[0].id));
      }

      const config = await getConfigData();
      setCarriersList(config.carriers);
      if (config.carriers.length > 0) {
        setCarrierId(String(config.carriers[0].id));
      }

      setErrorMsg("");
    } catch (e) {
      console.error(e);
      setErrorMsg("Error al cargar despachos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trackingNumber || !saleId || !carrierId || !destination || !costUsd) return;
    const cost = parseFloat(costUsd);
    if (isNaN(cost) || cost < 0) return;

    setSubmitting(true);
    const res = await createShipmentAction({
      trackingNumber,
      saleId: Number(saleId),
      carrierId: Number(carrierId),
      destination,
      costUsd: cost,
      status,
    });
    setSubmitting(false);

    if (res.success) {
      setShowModal(false);
      setTrackingNumber("");
      setDestination("");
      setCostUsd("");
      setStatus("pendiente");
      loadData();
    } else {
      setErrorMsg(res.error || "Error al registrar despacho");
    }
  }

  async function handleStatusTransition(shipmentId: number, nextStatus: "pendiente" | "despachado" | "entregado") {
    const res = await updateShipmentStatusAction(shipmentId, nextStatus);
    if (res.success) {
      loadData();
    } else {
      alert("Error al actualizar despacho: " + res.error);
    }
  }

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loader">Cargando despachos y envíos...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="table-container">
        <div className="table-header-row">
          <h3>Envíos</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Registrar despacho
          </button>
        </div>
        <div className="responsive-table-scroll">
        <div style={{
          display: "grid", gridTemplateColumns: "1.3fr 1fr 0.8fr 1.6fr 0.7fr 1.2fr 0.8fr",
          gap: 14, minWidth: 860, padding: "13px 22px", borderBottom: "1px solid var(--border-header)",
          font: "600 10.5px/1 var(--font-sans)", letterSpacing: "0.1em",
          textTransform: "uppercase", color: "var(--text-muted)",
        }}>
          <span>Guía</span><span>Venta</span><span>Transportista</span><span>Destino</span><span>Costo</span><span>Estado</span><span />
        </div>
        
        {shipmentsList.length === 0 ? (
          <div className="empty-state-card" style={{ margin: 22 }}>
            <strong>Sin despachos registrados.</strong> Cuando generes un envío aparecerá aquí con su guía, destino y estado.
          </div>
        ) : (
          shipmentsList.map((s) => (
            <div key={s.id} className="table-row" style={{
              display: "grid", gridTemplateColumns: "1.3fr 1fr 0.8fr 1.6fr 0.7fr 1.2fr 0.8fr", gap: 14, minWidth: 860,
            }}>
              <span className="font-mono" style={{ fontSize: "var(--text-base2)", fontWeight: 600 }}>{s.guia}</span>
              <span className="font-mono" style={{ fontSize: "var(--text-base2)", color: "var(--text-tertiary)" }}>{s.venta}</span>
              <span style={{ fontSize: "var(--text-base2)", fontWeight: 500 }}>{s.transp}</span>
              <span style={{ fontSize: "var(--text-md)", color: "var(--text-secondary)" }}>{s.destino}</span>
              <span style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{formatUSD(s.costo)}</span>
              <span><span className={estadoBadge(s.estado)}>{s.estado}</span></span>
              <span style={{ display: "flex", gap: 4 }}>
                {s.rawStatus === "pendiente" && (
                  <button className="btn btn-sm btn-secondary" style={{ padding: "4px 8px", fontSize: 10 }} onClick={() => handleStatusTransition(s.id, "despachado")}>Despachar</button>
                )}
                {s.rawStatus === "despachado" && (
                  <button className="btn btn-sm btn-secondary" style={{ padding: "4px 8px", fontSize: 10 }} onClick={() => handleStatusTransition(s.id, "entregado")}>Entregar</button>
                )}
              </span>
            </div>
          ))
        )}
        </div>
      </div>

      {/* Registrar Despacho Modal */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-content animate-pop-in" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h4>Registrar Despacho</h4>
              <button className="btn-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              {errorMsg && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{errorMsg}</div>}
              
              <div className="grid-2" style={{ gap: 12 }}>
                <div className="form-group">
                  <label>Número de guía</label>
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="Ej. MRW-88412"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Venta Relacionada</label>
                  <select
                    value={saleId}
                    onChange={(e) => setSaleId(e.target.value)}
                    required
                  >
                    {salesList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.number} — {s.customerName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid-2" style={{ gap: 12 }}>
                <div className="form-group">
                  <label>Transportista</label>
                  <select
                    value={carrierId}
                    onChange={(e) => setCarrierId(e.target.value)}
                    required
                  >
                    {carriersList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Estado Inicial</label>
                  <select
                    value={status}
                    onChange={(e: any) => setStatus(e.target.value)}
                    required
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="despachado">Despachado</option>
                    <option value="entregado">Entregado</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Destino (Dirección)</label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Ej. Maracaibo, Zulia"
                  required
                />
              </div>

              <div className="form-group">
                <label>Costo de Envío (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  value={costUsd}
                  onChange={(e) => setCostUsd(e.target.value)}
                  placeholder="Ej. 6.00"
                  required
                />
              </div>

              <div className="modal-footer" style={{ marginTop: 18 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Registrando..." : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
