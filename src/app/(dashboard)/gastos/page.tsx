"use client";

import { useState, useEffect } from "react";
import { getConfigData, getExpensesData, createExpenseAction, updateExpenseAction, deleteExpenseAction, addCategory } from "@/lib/db/actions";
import { formatBs, formatRate, formatUSD } from "@/lib/utils";
import { SETTINGS_KEYS, SYSTEM_DEFAULTS } from "@/lib/app-config";
import { useUser } from "../UserContext";
import { SearchCreateSelect, type SearchCreateOption } from "@/components/ui/SearchCreateSelect";

type FxSource = "paralelo" | "bcv" | "manual";

function isBolivarCurrency(currency: string): boolean {
  const normalized = currency.trim().toUpperCase();
  return normalized === "BS" || normalized === "VES";
}

const plusIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export default function GastosPage() {
  const user = useUser();
  const [loading, setLoading] = useState(true);
  const [expensesList, setExpensesList] = useState<any[]>([]);
  const [categoriesBreakdown, setCategoriesBreakdown] = useState<any[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);
  const [configDb, setConfigDb] = useState<any | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  async function handleDeleteExpense(id: number) {
    if (!window.confirm("¿Eliminar este gasto? Esta acción no se puede deshacer.")) return;
    setDeletingId(id);
    setErrorMsg("");
    const res = await deleteExpenseAction(id);
    setDeletingId(null);
    if (res.success) {
      await loadData();
    } else {
      setErrorMsg(res.error || "No se pudo eliminar el gasto.");
    }
  }

  function handleOpenEdit(row: any) {
    const rowCurrency = (row.moneda || "USD").trim().toUpperCase();
    const rowUsesBolivares = isBolivarCurrency(rowCurrency);
    setEditingId(row.id);
    setErrorMsg("");
    setNote(row.nota || "");
    setDate(row.fecha || new Date().toISOString().slice(0, 10));
    const matchingCategory = expenseCategories.find((c) => c.name === row.cat);
    if (matchingCategory) {
      setCategoryId(String(matchingCategory.id));
    }
    setCurrency(rowUsesBolivares ? "BS" : "USD");
    setAmountOriginal(
      String(rowUsesBolivares ? (row.montoOriginal ?? row.monto ?? "") : (row.monto ?? ""))
    );
    const inferredSource: FxSource = row.tasaSource === "bcv" ? "bcv" : "manual";
    setRateSource(rowUsesBolivares ? inferredSource : "paralelo");
    setRateValue(
      rowUsesBolivares && row.tasa
        ? String(row.tasa)
        : String(SYSTEM_DEFAULTS.rates.paralelo)
    );
    setShowModal(true);
  }

  function resetExpenseForm() {
    setEditingId(null);
    setNote("");
    setAmountOriginal("");
    setCurrency("USD");
    setRateSource("paralelo");
    setRateValue(
      configDb?.settings?.[SETTINGS_KEYS.parallelRate] || String(SYSTEM_DEFAULTS.rates.paralelo)
    );
  }

  function handleCloseModal() {
    setShowModal(false);
    resetExpenseForm();
  }

  // Form State
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [amountOriginal, setAmountOriginal] = useState("");
  const [rateSource, setRateSource] = useState<FxSource>("paralelo");
  const [rateValue, setRateValue] = useState(String(SYSTEM_DEFAULTS.rates.paralelo));

  async function loadData() {
    try {
      setLoading(true);
      const [data, config] = await Promise.all([getExpensesData(), getConfigData()]);
      setExpensesList(data.expensesList);
      setCategoriesBreakdown(data.categoriesBreakdown);
      setTotalExpenses(data.totalExpenses);
      setExpenseCategories(data.expenseCategories);
      setConfigDb(config);

      if (data.expenseCategories.length > 0) {
        setCategoryId(String(data.expenseCategories[0].id));
      }
      setRateValue(
        config.settings[SETTINGS_KEYS.parallelRate] || String(SYSTEM_DEFAULTS.rates.paralelo)
      );
      setErrorMsg("");
    } catch (e) {
      console.error(e);
      setErrorMsg("Error al cargar gastos.");
    } finally {
      setLoading(false);
    }
  }

  const canManage = user?.role === "admin" || user?.role === "usuario";

  useEffect(() => {
    if (canManage) {
      loadData();
      return;
    }

    setLoading(false);
  }, [canManage]);

  if (user && !canManage) {
    return (
      <div className="access-state-card animate-pop-in" style={{ marginTop: 40 }}>
        <div className="access-state-icon" aria-hidden="true">!</div>
        <h2 className="state-title">Acceso no autorizado</h2>
        <p className="state-copy">
          No tienes acceso al m&oacute;dulo de gastos.
        </p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!note || !categoryId || !amountOriginal) return;
    const amount = parseFloat(amountOriginal);
    if (isNaN(amount) || amount <= 0) return;

    const usesBolivares = isBolivarCurrency(currency);
    const parsedRate = Number.parseFloat(rateValue);
    if (usesBolivares && (!Number.isFinite(parsedRate) || parsedRate <= 0)) {
      setErrorMsg("Debe indicar una tasa valida para registrar el gasto en bolívares.");
      return;
    }

    const payload = {
      date,
      note,
      categoryId: Number(categoryId),
      amountUsd: usesBolivares ? amount / parsedRate : amount,
      currency,
      amountOriginal: amount,
      rateUsed: usesBolivares ? parsedRate : 1,
      rateSource: usesBolivares ? rateSource : ("manual" as FxSource),
    };

    setSubmitting(true);
    const res = editingId != null
      ? await updateExpenseAction({ id: editingId, ...payload })
      : await createExpenseAction(payload);
    setSubmitting(false);

    if (res.success) {
      setShowModal(false);
      resetExpenseForm();
      loadData();
    } else {
      setErrorMsg(res.error || (editingId != null ? "Error al actualizar gasto" : "Error al registrar gasto"));
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "300px" }}>
        <div className="loader">Cargando módulo de gastos...</div>
      </div>
    );
  }

  const tasaParalelo = Number.parseFloat(
    configDb?.settings?.[SETTINGS_KEYS.parallelRate] || String(SYSTEM_DEFAULTS.rates.paralelo)
  );
  const tasaBcv = Number.parseFloat(
    configDb?.settings?.[SETTINGS_KEYS.bcvRate] || String(SYSTEM_DEFAULTS.rates.bcv)
  );
  const usesBolivares = isBolivarCurrency(currency);
  const amountOriginalNumber = Number.parseFloat(amountOriginal);
  const expenseCategoryOptions: SearchCreateOption[] = expenseCategories.map((category) => ({
    value: String(category.id),
    label: category.name,
    meta: "Categoría de gasto",
  }));
  const amountUsdPreview = Number.isFinite(amountOriginalNumber) && amountOriginalNumber > 0
    ? usesBolivares
      ? Number.parseFloat(rateValue) > 0
        ? amountOriginalNumber / Number.parseFloat(rateValue)
        : 0
      : amountOriginalNumber
    : 0;

  function handleRateSourceChange(nextSource: FxSource) {
    setRateSource(nextSource);
    if (nextSource === "paralelo") setRateValue(String(tasaParalelo));
    if (nextSource === "bcv") setRateValue(String(tasaBcv));
  }

  async function handleCreateExpenseCategory(query: string) {
    const name = query.trim();
    if (!name) return;
    setSubmitting(true);
    const res = await addCategory(name, "expense");
    setSubmitting(false);
    if (!res.success) {
      throw new Error(res.error || "No se pudo crear la categoría.");
    }
    await loadData();
  }

  return (
    <div className="animate-fade-in">
      <div className="grid-2-sidebar">
        {/* Expenses table */}
        <div className="table-container">
          <div className="table-header-row">
            <h3>Gastos del mes</h3>
            <button className="btn btn-primary btn-sm" onClick={() => { resetExpenseForm(); setErrorMsg(""); setShowModal(true); }}>{plusIcon} Registrar gasto</button>
          </div>
          <div className="responsive-table-scroll">
          <div style={{
            display: "grid", gridTemplateColumns: "0.8fr 2.4fr 1fr 1fr 84px",
            gap: 14, minWidth: 760, padding: "13px 22px", borderBottom: "1px solid var(--border-header)",
            font: "600 10.5px/1 var(--font-sans)", letterSpacing: "0.1em",
            textTransform: "uppercase", color: "var(--text-muted)",
          }}>
            <span>Fecha</span><span>Descripción</span><span>Categoría</span><span style={{ textAlign: "right" }}>Monto</span><span />
          </div>
          
          {expensesList.length === 0 ? (
            <div className="empty-state-card" style={{ margin: 22 }}>
              <strong>Sin egresos registrados.</strong> Cuando registres gastos operativos aparecerán aquí con su categoría y monto.
            </div>
          ) : (
            expensesList.map((e) => (
              <div key={e.id} className="table-row" style={{
                display: "grid", gridTemplateColumns: "0.8fr 2.4fr 1fr 1fr 84px", gap: 14, minWidth: 760,
                alignItems: "center",
              }}>
                <span style={{ fontSize: "var(--text-base2)", color: "var(--text-tertiary)" }}>{e.fecha}</span>
                <span style={{ fontSize: "var(--text-md)", fontWeight: 500 }}>{e.nota}</span>
                <span className="badge badge-neutral">{e.cat}</span>
                <span style={{ textAlign: "right" }}>
                  <span style={{ fontSize: "var(--text-md2)", fontWeight: 700, display: "block" }}>{formatUSD(e.monto)}</span>
                  {isBolivarCurrency(e.moneda || "USD") && e.montoOriginal ? (
                    <span style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)" }}>
                      {formatBs(e.montoOriginal)} @ {formatRate(e.tasa || 0)}
                    </span>
                  ) : null}
                </span>
                <span style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                  {canManage ? (
                    <>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Editar gasto"
                        aria-label="Editar gasto"
                        onClick={() => handleOpenEdit(e)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        title="Eliminar gasto"
                        aria-label="Eliminar gasto"
                        disabled={deletingId === e.id}
                        onClick={() => handleDeleteExpense(e.id)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    </>
                  ) : null}
                </span>
              </div>
            ))
          )}
          </div>
        </div>

        {/* Categories breakdown */}
        <div className="card" style={{ borderRadius: "var(--radius-5xl)", padding: 20, height: "max-content" }}>
          <div className="section-label" style={{ marginBottom: 14 }}>Desglose por categoría</div>
          {categoriesBreakdown.length === 0 ? (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", padding: "10px 0" }}>
              Sin egresos registrados.
            </div>
          ) : (
            categoriesBreakdown.map((c, i) => (
              <div key={i} style={{ marginBottom: 15 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: "var(--text-md)", color: "var(--text-secondary)", fontWeight: 500 }}>{c.name}</span>
                  <span style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>{formatUSD(c.total)}</span>
                </div>
                <div style={{ height: 8, background: "var(--bg-subtle)", borderRadius: 5, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${c.pct}%`, background: "var(--bg-card-dark)", borderRadius: 5 }} />
                </div>
              </div>
            ))
          )}
          <div className="divider" style={{ margin: "14px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>Total</span>
            <span style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>{formatUSD(totalExpenses)}</span>
          </div>
        </div>
      </div>

      {/* Registrar Gasto Modal */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-content animate-pop-in" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h4>{editingId != null ? "Editar Gasto" : "Registrar Gasto"}</h4>
              <button className="btn-close" onClick={handleCloseModal}>×</button>
            </div>
            <form onSubmit={handleSubmit}>

              
              <div className="form-group">
                <label>Descripción / Detalle</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ej. Pago pauta de Instagram"
                  required
                />
              </div>

              <div className="grid-2" style={{ gap: 12 }}>
                <div className="form-group">
                  <SearchCreateSelect
                    label="Categoría"
                    value={categoryId}
                    options={expenseCategoryOptions}
                    onChange={setCategoryId}
                    onCreate={handleCreateExpenseCategory}
                    placeholder="Buscar o crear categoría"
                    createLabel={(query) => `+ Crear categoría "${query}"`}
                    emptyMessage="No hay categorías con ese criterio."
                  />
                </div>
                <div className="form-group">
                  <label>Fecha</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Moneda original</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  required
                >
                  <option value="USD">USD</option>
                  <option value="BS">Bolívares (Bs)</option>
                </select>
              </div>

              <div className="form-group">
                <label>{usesBolivares ? "Monto pagado (Bs)" : "Monto pagado (USD)"}</label>
                <input
                  type="number"
                  step="0.01"
                  value={amountOriginal}
                  onChange={(e) => setAmountOriginal(e.target.value)}
                  placeholder={usesBolivares ? "Ej. 150000" : "Ej. 150"}
                  required
                />
              </div>

              {usesBolivares ? (
                <>
                  <div className="grid-2" style={{ gap: 12 }}>
                    <div className="form-group">
                      <label>Tasa aplicada</label>
                      <select
                        value={rateSource}
                        onChange={(e) => handleRateSourceChange(e.target.value as FxSource)}
                        required
                      >
                        <option value="paralelo">Paralelo</option>
                        <option value="bcv">BCV</option>
                        <option value="manual">Manual</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Valor de tasa</label>
                      <input
                        type="number"
                        step="0.01"
                        value={rateValue}
                        onChange={(e) => setRateValue(e.target.value)}
                        disabled={rateSource !== "manual"}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: -4, marginBottom: 10, fontSize: "var(--text-sm2)", color: "var(--text-muted)" }}>
                    Consolidación contable: {amountUsdPreview > 0 ? formatUSD(amountUsdPreview) : "$0,00"} usando tasa {formatRate(Number.parseFloat(rateValue) || 0)} ({rateSource}).
                  </div>
                </>
              ) : (
                <div style={{ marginTop: -4, marginBottom: 10, fontSize: "var(--text-sm2)", color: "var(--text-muted)" }}>
                  Consolidación contable: {amountUsdPreview > 0 ? formatUSD(amountUsdPreview) : "$0,00"}.
                </div>
              )}

              <div className="modal-footer-sticky">
                {errorMsg && <div className="alert alert-danger" style={{ marginBottom: 0 }}>{errorMsg}</div>}
                <div className="sales-form-actions">
                  <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting
                      ? (editingId != null ? "Guardando..." : "Registrando...")
                      : (editingId != null ? "Guardar cambios" : "Registrar")}
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
