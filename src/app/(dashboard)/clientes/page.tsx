"use client";

import { useState, useEffect } from "react";
import { getCustomersDetailList, createCustomerAction, updateCustomerAction, getConfigData } from "@/lib/db/actions";
import { formatUSD, getInitials, getAvatarColor } from "@/lib/utils";

const plusIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const editIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
  </svg>
);

export default function ClientesPage() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<any[]>([]);
  const [colorMap, setColorMap] = useState<Record<string, { name: string; hex: string }>>({});
  const [selIdx, setSelIdx] = useState(0);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function loadData() {
    try {
      setLoading(true);
      const data = await getCustomersDetailList();
      setCustomers(data);

      const config = await getConfigData();
      const cmap: Record<string, { name: string; hex: string }> = {};
      config.colors.forEach((c: any) => {
        cmap[c.code] = { name: c.name, hex: c.hex };
      });
      setColorMap(cmap);
      setErrorMsg("");
    } catch (e) {
      console.error(e);
      setErrorMsg("Error al cargar clientes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const sel = customers[selIdx];

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!name) return;
    setSubmitting(true);
    const res = await createCustomerAction(name, phone, notes);
    setSubmitting(false);
    if (res.success) {
      setShowAddModal(false);
      setName("");
      setPhone("");
      setNotes("");
      loadData();
    } else {
      setErrorMsg(res.error || "Error al agregar cliente");
    }
  }

  async function handleEditCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!sel || !editName) return;
    setSubmitting(true);
    const res = await updateCustomerAction(sel.id, editName, editPhone, editNotes);
    setSubmitting(false);
    if (res.success) {
      setShowEditModal(false);
      loadData();
    } else {
      setErrorMsg(res.error || "Error al actualizar cliente");
    }
  }

  function openEdit() {
    if (!sel) return;
    setEditName(sel.name);
    setEditPhone(sel.phone === "Sin registrar" ? "" : sel.phone);
    setEditNotes(sel.notes);
    setShowEditModal(true);
  }

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loader">Cargando CRM y clientes...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in grid-2-sidebar-wide">
      {/* Clients table */}
      <div className="table-container">
        <div className="table-header-row">
          <h3>Clientes</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>{plusIcon} Nuevo cliente</button>
        </div>
        
        {customers.length === 0 ? (
          <div className="empty-state-card" style={{ margin: 22 }}>
            <strong>Sin clientes registrados.</strong> Crea el primer cliente para empezar a construir historial y preferencias.
          </div>
        ) : (
          <div className="responsive-table-scroll">
            <div style={{
              display: "grid",
              gridTemplateColumns: "2fr 0.8fr 1fr 1fr 1fr",
              gap: 12,
              minWidth: 760,
              padding: "13px 22px",
              borderBottom: "1px solid var(--border-header)",
              font: "600 10px/1 var(--font-sans)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}>
              <span>Cliente</span>
              <span>Pedidos</span>
              <span>Total</span>
              <span>Talla Habitual</span>
              <span>Color fav.</span>
            </div>
            {customers.map((c, i) => {
              const isActive = i === selIdx;
              return (
                <div
                  key={c.id}
                  className="table-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 0.8fr 1fr 1fr 1fr",
                    gap: 12,
                    minWidth: 760,
                    cursor: "pointer",
                    background: isActive ? "var(--bg-hover-row)" : undefined,
                    borderLeft: isActive ? "3px solid var(--text-primary)" : "3px solid transparent",
                  }}
                  onClick={() => setSelIdx(i)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div className="avatar avatar-md" style={{ background: getAvatarColor(c.name) }}>
                      {getInitials(c.name)}
                    </div>
                    <div>
                      <div style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{c.name}</div>
                      <div className="font-mono" style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{c.phone}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: "var(--text-md)", fontWeight: 700, display: "flex", alignItems: "center" }}>{c.pedidos}</span>
                  <span style={{ fontSize: "var(--text-md)", fontWeight: 600, display: "flex", alignItems: "center" }}>{formatUSD(c.total)}</span>
                  <span style={{ display: "flex", alignItems: "center" }}>
                    <span className="font-mono" style={{ fontSize: "var(--text-base)", fontWeight: 600, background: "var(--bg-subtle)", borderRadius: 6, padding: "3px 8px" }}>
                      {c.talla}
                    </span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "var(--text-base)" }}>
                    <span className="color-swatch" style={{ background: colorMap[c.colorFav]?.hex || "#ccc" }} />
                    {colorMap[c.colorFav]?.name || c.colorFav}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Customer detail panel */}
      {sel && (
        <div className="card animate-slide-up" style={{ borderRadius: "var(--radius-5xl)", padding: 22, height: "max-content" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 18 }}>
            <div className="avatar avatar-lg" style={{ background: getAvatarColor(sel.name) }}>
              {getInitials(sel.name)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}>{sel.name}</div>
              <div className="font-mono" style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)" }}>{sel.phone}</div>
            </div>
            <button className="btn btn-secondary btn-icon" onClick={openEdit} title="Editar cliente" style={{ padding: "6px" }}>
              {editIcon}
            </button>
          </div>

          {/* Notes if any */}
          {sel.notes && (
            <div style={{ background: "var(--bg-subtle)", borderRadius: 8, padding: "10px 12px", fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: 16 }}>
              <strong>Nota:</strong> {sel.notes}
            </div>
          )}

          {/* KPIs */}
          <div className="grid-2" style={{ gap: 10, marginBottom: 18 }}>
            <div style={{ background: "var(--bg-hover-row)", borderRadius: 10, padding: 12 }}>
              <div className="section-label" style={{ fontSize: "var(--text-xs2)" }}>Total comprado</div>
              <div style={{ fontSize: "var(--text-2xl)", fontWeight: 800, marginTop: 3 }}>{formatUSD(sel.total)}</div>
            </div>
            <div style={{ background: "var(--bg-hover-row)", borderRadius: 10, padding: 12 }}>
              <div className="section-label" style={{ fontSize: "var(--text-xs2)" }}>Pedidos</div>
              <div style={{ fontSize: "var(--text-2xl)", fontWeight: 800, marginTop: 3 }}>{sel.pedidos}</div>
            </div>
          </div>

          {/* Preferences */}
          <div className="section-label" style={{ marginBottom: 10 }}>Preferencias</div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
            <span style={{ fontSize: "var(--text-md)", color: "var(--text-tertiary)" }}>Talla habitual</span>
            <span className="font-mono" style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{sel.talla}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
            <span style={{ fontSize: "var(--text-md)", color: "var(--text-tertiary)" }}>Color favorito</span>
            <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "var(--text-md)", fontWeight: 600 }}>
              <span className="color-swatch" style={{ background: colorMap[sel.colorFav]?.hex || "#ccc" }} />
              {colorMap[sel.colorFav]?.name || sel.colorFav}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", marginBottom: 16 }}>
            <span style={{ fontSize: "var(--text-md)", color: "var(--text-tertiary)" }}>Tallas compradas</span>
            <span className="font-mono" style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>
              {sel.tallas.length > 0 ? sel.tallas.join(", ") : "—"}
            </span>
          </div>

          {/* Purchase history */}
          <div className="section-label" style={{ marginBottom: 10 }}>Historial</div>
          {sel.hist.length === 0 ? (
            <div style={{ padding: "10px 0", fontSize: "var(--text-sm)", color: "var(--text-muted)", textAlign: "center" }}>
              Sin compras registradas.
            </div>
          ) : (
            sel.hist.map((h: any, i: number) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderTop: "1px solid var(--border-light)" }}>
                <div>
                  <div className="font-mono" style={{ fontSize: "var(--text-base2)", fontWeight: 500 }}>{h[0]}</div>
                  <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)" }}>{h[1]} · {h[2]}</div>
                </div>
                <span style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>{formatUSD(h[3] as number)}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add Client Modal */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-content animate-pop-in" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h4>Nuevo Cliente</h4>
              <button className="btn-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <form onSubmit={handleAddCustomer}>
              {errorMsg && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{errorMsg}</div>}
              
              <div className="form-group">
                <label>Nombre Completo</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Clínica Vista Salud o Andreína Pérez"
                  required
                />
              </div>

              <div className="form-group">
                <label>Teléfono</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej. +58 412 1234567"
                />
              </div>

              <div className="form-group">
                <label>Notas / Observaciones</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej. Tallas habituales M de dama, prefiere azul marino."
                  rows={3}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Guardando..." : "Guardar Cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {showEditModal && (
        <div className="modal-backdrop">
          <div className="modal-content animate-pop-in" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h4>Editar Cliente</h4>
              <button className="btn-close" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <form onSubmit={handleEditCustomer}>
              {errorMsg && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{errorMsg}</div>}
              
              <div className="form-group">
                <label>Nombre Completo</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Teléfono</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Notas / Observaciones</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Actualizando..." : "Actualizar Cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
