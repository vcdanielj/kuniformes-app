"use client";

import { useEffect, useMemo, useState } from "react";
import { getActivityLogAction } from "@/lib/db/actions";
import { useUser } from "../UserContext";

type ActivityRow = {
  id: number;
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  createdAt: string;
  userName: string;
  severity: "danger" | "warning" | "normal";
};

const ACTION_LABEL: Record<string, string> = {
  CREAR: "Creó",
  MODIFICAR: "Modificó",
  ELIMINAR: "Eliminó",
  ANULAR: "Anuló",
  AJUSTE_STOCK: "Ajustó stock",
  VENTA_BAJO_COSTO: "Venta bajo costo",
};

const ENTITY_LABEL: Record<string, string> = {
  model: "Modelo",
  sku: "SKU",
  sale: "Venta",
  quote: "Cotización",
  customer: "Cliente",
  purchase: "Compra",
  return: "Devolución",
  shipment: "Despacho",
  consignment_lot: "Lote consignación",
  expense: "Gasto",
};

function fmtDate(s: string): string {
  // createdAt is stored as "YYYY-MM-DD HH:MM:SS" (UTC). Render compactly.
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ActividadPage() {
  const user = useUser();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function loadData() {
    try {
      setLoading(true);
      const data = await getActivityLogAction();
      setRows(data as ActivityRow[]);
      setErrorMsg("");
    } catch (e) {
      console.error(e);
      setErrorMsg("Error al cargar la actividad.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.role === "admin") loadData();
    else setLoading(false);
  }, [user?.role]);

  const filtered = useMemo(
    () => (onlyAlerts ? rows.filter((r) => r.severity !== "normal") : rows),
    [rows, onlyAlerts]
  );
  const alertCount = useMemo(() => rows.filter((r) => r.severity !== "normal").length, [rows]);

  if (user && user.role !== "admin") {
    return (
      <div className="access-state-card animate-pop-in" style={{ marginTop: 40 }}>
        <div className="access-state-icon" aria-hidden="true">!</div>
        <h2 className="state-title">Acceso no autorizado</h2>
        <p className="state-copy">El registro de actividad es exclusivo de administración.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
        <div className="loader">Cargando actividad…</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-toolbar" style={{ marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: "var(--text-2xl)", fontWeight: 800, letterSpacing: "-0.02em" }}>Actividad</h3>
          <div style={{ fontSize: "var(--text-base)", color: "var(--text-muted)", marginTop: 2 }}>
            Registro de todas las acciones realizadas en el sistema
          </div>
        </div>
        <div className="page-toolbar-spacer" />
        <label className="toolbar-checkbox">
          <input type="checkbox" checked={onlyAlerts} onChange={(e) => setOnlyAlerts(e.target.checked)} />
          Solo alertas{alertCount > 0 ? ` (${alertCount})` : ""}
        </label>
      </div>

      {errorMsg && (
        <div className="alert-banner alert-banner-danger" style={{ marginBottom: 16 }}>
          <p>{errorMsg}</p>
        </div>
      )}

      <div className="card" style={{ borderRadius: "var(--radius-5xl)", padding: 0, overflow: "hidden" }}>
        <div className="responsive-table-scroll">
          <div style={{
            display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1.2fr 3fr", gap: 14, minWidth: 760,
            padding: "13px 22px", borderBottom: "1px solid var(--border-header)",
            font: "600 10.5px/1 var(--font-sans)", letterSpacing: "0.1em",
            textTransform: "uppercase", color: "var(--text-muted)",
          }}>
            <span>Fecha</span><span>Usuario</span><span>Acción</span><span>Detalle</span>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state-card" style={{ margin: 22 }}>
              <strong>Sin actividad registrada.</strong> Las acciones (ventas, ajustes, eliminaciones, etc.) aparecerán aquí.
            </div>
          ) : (
            filtered.map((r) => {
              const accent = r.severity === "danger" ? "var(--danger)" : r.severity === "warning" ? "var(--warning)" : "transparent";
              const bg = r.severity === "danger" ? "var(--danger-bg)" : r.severity === "warning" ? "var(--warning-bg)" : "transparent";
              const actionLabel = ACTION_LABEL[String(r.action).toUpperCase()] || r.action;
              const entityLabel = ENTITY_LABEL[r.entity] || r.entity;
              return (
                <div key={r.id} className="table-row" style={{
                  display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1.2fr 3fr", gap: 14, minWidth: 760,
                  alignItems: "center", borderLeft: `3px solid ${accent}`, background: bg,
                }}>
                  <span style={{ fontSize: "var(--text-sm2)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{fmtDate(r.createdAt)}</span>
                  <span style={{ fontSize: "var(--text-md)", fontWeight: 500 }}>{r.userName}</span>
                  <span>
                    <span
                      className={`badge ${r.severity === "danger" ? "badge-danger" : r.severity === "warning" ? "badge-warning" : "badge-neutral"}`}
                      style={{ fontSize: "10px" }}
                    >
                      {actionLabel}
                    </span>{" "}
                    <span style={{ fontSize: "var(--text-sm2)", color: "var(--text-tertiary)" }}>{entityLabel}</span>
                  </span>
                  <span style={{ fontSize: "var(--text-sm2)", color: r.severity === "normal" ? "var(--text-secondary)" : "var(--text-primary)", fontWeight: r.severity === "normal" ? 400 : 600 }}>
                    {r.details || "—"}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
