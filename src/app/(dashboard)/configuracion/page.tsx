"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useUser } from "../UserContext";
import {
  getConfigData,
  getExchangeRatesOverviewAction,
  getUsersListAction,
  createUserAction,
  updateUserRoleAction,
  updateUserActiveAction,
  addColor,
  addSize,
  addCategory,
  addPaymentMethod,
  addCarrier,
  updateSetting,
  saveManualExchangeRatesAction,
  syncExchangeRatesAction,
} from "@/lib/db/actions";
import { SETTINGS_KEYS, SYSTEM_DEFAULTS } from "@/lib/app-config";
import { formatRate } from "@/lib/utils";

/* ─── Tab types ─── */
type ConfigTab = "colores" | "tallas" | "categorias" | "metodos" | "transportistas" | "tasa" | "usuarios";
type ConfigData = Awaited<ReturnType<typeof getConfigData>>;
type ColorOption = { code: string; name: string; hex: string };
type SizeOption = { name: string };
type CategoryOption = { name: string; type: "product" | "expense" };
type PaymentMethodOption = { name: string; currency: string; active: boolean };
type CarrierOption = { name: string; tag: string };
type UserOption = { id: string; name: string; email: string; role: "admin" | "vendedor"; active: boolean; createdAt: string };
type FxOverview = Awaited<ReturnType<typeof getExchangeRatesOverviewAction>>;
type ConfigPageData = Omit<
  ConfigData,
  "colors" | "sizes" | "categories" | "paymentMethods" | "carriers"
> & {
  colors: ColorOption[];
  sizes: SizeOption[];
  categories: CategoryOption[];
  paymentMethods: PaymentMethodOption[];
  carriers: CarrierOption[];
  fxOverview?: FxOverview;
};

const tabs: { key: ConfigTab; label: string }[] = [
  { key: "colores", label: "Colores" },
  { key: "tallas", label: "Tallas" },
  { key: "categorias", label: "Categorías" },
  { key: "metodos", label: "Métodos de pago" },
  { key: "transportistas", label: "Transportistas" },
  { key: "tasa", label: "Tasa & umbrales" },
  { key: "usuarios", label: "Usuarios" },
];

const plusIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

function MiniRateChart({
  values,
  color,
}: {
  values: Array<number | null>;
  color: string;
}) {
  const clean = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (clean.length < 2) {
    return (
      <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", padding: "14px 0" }}>
        Historial insuficiente para graficar.
      </div>
    );
  }

  const max = Math.max(...clean);
  const min = Math.min(...clean);
  const spread = max - min || 1;
  const points = values
    .map((value, idx) => {
      const x = (idx / Math.max(values.length - 1, 1)) * 100;
      const normalized = typeof value === "number" ? (value - min) / spread : 0.5;
      const y = 100 - normalized * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: 88 }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export default function ConfiguracionPage() {
  const user = useUser();
  const [tab, setTab] = useState<ConfigTab>("colores");
  const [loading, setLoading] = useState(true);

  // Loaded database state
  const [dbData, setDbData] = useState<ConfigPageData | null>(null);
  const [usersList, setUsersList] = useState<UserOption[]>([]);

  // Form states
  const [showModal, setShowModal] = useState<ConfigTab | null>(null);
  
  // Color Form
  const [colorCode, setColorCode] = useState("");
  const [colorName, setColorName] = useState("");
  const [colorHex, setColorHex] = useState("#000000");

  // Size Form
  const [sizeName, setSizeName] = useState("");

  // Category Form
  const [catName, setCatName] = useState("");
  const [catType, setCatType] = useState<"product" | "expense">("product");

  // Payment Method Form
  const [payName, setPayName] = useState("");
  const [payCurrency, setPayCurrency] = useState("USD");

  // Carrier Form
  const [carrierName, setCarrierName] = useState("");
  const [carrierTag, setCarrierTag] = useState("Principal");

  // User Form
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState<"admin" | "vendedor">("vendedor");

  // Exchange rate & settings edit states
  const [rateParalelo, setRateParalelo] = useState("");
  const [rateBcv, setRateBcv] = useState("");
  const [rateEuroParalelo, setRateEuroParalelo] = useState("");
  const [rateEuroBcv, setRateEuroBcv] = useState("");
  const [stockThreshold, setStockThreshold] = useState("5");

  // Status message
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Load database data
  async function loadData() {
    try {
      setLoading(true);
      const data = await getConfigData();
      setDbData(data as ConfigPageData);
      if (user?.role === "admin") {
        const loadedUsers = await getUsersListAction();
        setUsersList(loadedUsers as UserOption[]);
      } else {
        setUsersList([]);
      }
      
      // Seed config states from settings
      setRateParalelo(
        data.settings[SETTINGS_KEYS.parallelRate] || String(SYSTEM_DEFAULTS.rates.paralelo)
      );
      setRateBcv(
        data.settings[SETTINGS_KEYS.bcvRate] || String(SYSTEM_DEFAULTS.rates.bcv)
      );
      setRateEuroParalelo(
        data.settings[SETTINGS_KEYS.euroParallelRate] || String(SYSTEM_DEFAULTS.rates.euroParalelo)
      );
      setRateEuroBcv(
        data.settings[SETTINGS_KEYS.euroBcvRate] || String(SYSTEM_DEFAULTS.rates.euroBcv)
      );
      setStockThreshold(
        data.settings[SETTINGS_KEYS.lowStockThreshold] ||
          String(SYSTEM_DEFAULTS.lowStockThreshold)
      );
      
      setErrorMsg("");
    } catch (e) {
      console.error(e);
      setErrorMsg("Error al cargar configuraciones de base de datos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [user?.role]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "300px" }}>
        <div className="loader">Cargando parámetros del sistema...</div>
      </div>
    );
  }

  if (user && user.role !== "admin") {
    return (
      <div className="access-state-card animate-pop-in" style={{ marginTop: 40 }}>
        <div className="access-state-icon" aria-hidden="true">!</div>
        <h2 className="state-title">Acceso no autorizado</h2>
        <p className="state-copy">
          Lo sentimos, solo los administradores tienen permiso para gestionar los parámetros del sistema.
        </p>
      </div>
    );
  }

  // Handle Form Submissions
  async function handleAddColor(e: FormEvent) {
    e.preventDefault();
    if (!colorCode || !colorName || !colorHex) return;
    setSubmitting(true);
    const res = await addColor(colorCode, colorName, colorHex);
    setSubmitting(false);
    if (res.success) {
      setShowModal(null);
      setColorCode("");
      setColorName("");
      setColorHex("#000000");
      loadData();
    } else {
      setErrorMsg(res.error || "");
    }
  }

  async function handleAddSize(e: FormEvent) {
    e.preventDefault();
    if (!sizeName) return;
    setSubmitting(true);
    const res = await addSize(sizeName);
    setSubmitting(false);
    if (res.success) {
      setShowModal(null);
      setSizeName("");
      loadData();
    } else {
      setErrorMsg(res.error || "");
    }
  }

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    if (!catName) return;
    setSubmitting(true);
    const res = await addCategory(catName, catType);
    setSubmitting(false);
    if (res.success) {
      setShowModal(null);
      setCatName("");
      loadData();
    } else {
      setErrorMsg(res.error || "");
    }
  }

  async function handleAddPaymentMethod(e: FormEvent) {
    e.preventDefault();
    if (!payName || !payCurrency) return;
    setSubmitting(true);
    const res = await addPaymentMethod(payName, payCurrency);
    setSubmitting(false);
    if (res.success) {
      setShowModal(null);
      setPayName("");
      loadData();
    } else {
      setErrorMsg(res.error || "");
    }
  }

  async function handleAddCarrier(e: FormEvent) {
    e.preventDefault();
    if (!carrierName || !carrierTag) return;
    setSubmitting(true);
    const res = await addCarrier(carrierName, carrierTag);
    setSubmitting(false);
    if (res.success) {
      setShowModal(null);
      setCarrierName("");
      loadData();
    } else {
      setErrorMsg(res.error || "");
    }
  }

  async function handleSaveRatesAndUmbrales() {
    setSubmitting(true);
    try {
      const res = await saveManualExchangeRatesAction({
        usdParalelo: parseFloat(rateParalelo),
        usdBcv: parseFloat(rateBcv),
        eurParalelo: parseFloat(rateEuroParalelo),
        eurBcv: parseFloat(rateEuroBcv),
      });
      if (!res.success) {
        throw new Error(res.error || "No se pudieron guardar las tasas manuales.");
      }

      await updateSetting(SETTINGS_KEYS.lowStockThreshold, stockThreshold);
      await updateSetting(SETTINGS_KEYS.defaultRateSource, "paralelo");
      
      await loadData();
      alert("Tasas manuales y parámetros actualizados correctamente.");
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Error al guardar configuraciones.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSyncFromApi() {
    setSubmitting(true);
    try {
      const res = await syncExchangeRatesAction(true);
      if (!res.success) {
        throw new Error(res.error || "No se pudieron sincronizar las tasas.");
      }
      await loadData();
      alert("Tasas actualizadas desde DolarAPI y cacheadas en D1.");
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Error al sincronizar tasas.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddUser(e: FormEvent) {
    e.preventDefault();
    if (!userName || !userEmail || !userPassword) return;
    setSubmitting(true);
    const res = await createUserAction({
      name: userName,
      email: userEmail,
      password: userPassword,
      role: userRole,
    });
    setSubmitting(false);
    if (res.success) {
      setShowModal(null);
      setUserName("");
      setUserEmail("");
      setUserPassword("");
      setUserRole("vendedor");
      loadData();
    } else {
      setErrorMsg(res.error || "");
    }
  }

  async function handleToggleUserActive(targetUserId: string, nextActive: boolean) {
    setSubmitting(true);
    const res = await updateUserActiveAction(targetUserId, nextActive);
    setSubmitting(false);
    if (res.success) {
      loadData();
    } else {
      setErrorMsg(res.error || "");
    }
  }

  async function handleChangeUserRole(targetUserId: string, nextRole: "admin" | "vendedor") {
    setSubmitting(true);
    const res = await updateUserRoleAction(targetUserId, nextRole);
    setSubmitting(false);
    if (res.success) {
      loadData();
    } else {
      setErrorMsg(res.error || "");
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="settings-layout">
        {/* Tab sidebar */}
        <div className="card" style={{ borderRadius: "var(--radius-5xl)", padding: "14px 10px", height: "max-content" }}>
          <nav className="settings-nav">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`settings-nav-btn ${tab === t.key ? "active" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <div className="card" style={{ borderRadius: "var(--radius-5xl)", padding: 24 }}>
          {/* ─── Colores ─── */}
          {tab === "colores" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <h3 className="section-title">Paleta de colores</h3>
                <button className="btn btn-primary btn-sm" onClick={() => { setErrorMsg(""); setShowModal("colores"); }}>
                  {plusIcon} Nuevo color
                </button>
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "60px 1fr 1fr 1fr",
                gap: 14,
                padding: "10px 0",
                borderBottom: "1px solid var(--border-header)",
                font: "600 10.5px/1 var(--font-sans)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
              }}>
                <span>Color</span>
                <span>Código Z</span>
                <span>Nombre</span>
                <span>Hex</span>
              </div>
              {dbData?.colors.map((c) => (
                <div key={c.code} style={{
                  display: "grid",
                  gridTemplateColumns: "60px 1fr 1fr 1fr",
                  gap: 14,
                  padding: "12px 0",
                  borderBottom: "1px solid var(--border-light)",
                  alignItems: "center",
                }}>
                  <div className="color-swatch-lg" style={{ background: c.hex, border: "1px solid rgba(0,0,0,.1)" }} />
                  <span className="font-mono" style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{c.code}</span>
                  <span style={{ fontSize: "var(--text-md)", fontWeight: 500 }}>{c.name}</span>
                  <span className="font-mono" style={{ fontSize: "var(--text-base)", color: "var(--text-muted)" }}>{c.hex}</span>
                </div>
              ))}
            </>
          )}

          {/* ─── Tallas ─── */}
          {tab === "tallas" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <h3 className="section-title">Tallas registradas</h3>
                <button className="btn btn-primary btn-sm" onClick={() => { setErrorMsg(""); setShowModal("tallas"); }}>
                  {plusIcon} Nueva talla
                </button>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {dbData?.sizes.map((s) => (
                  <div
                    key={s.name}
                    style={{
                      background: "var(--bg-subtle)",
                      borderRadius: "var(--radius-base)",
                      padding: "12px 20px",
                      fontSize: "var(--text-lg)",
                      fontWeight: 700,
                      minWidth: 60,
                      textAlign: "center",
                    }}
                  >
                    {s.name}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ─── Categorías ─── */}
          {tab === "categorias" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <h3 className="section-title">Categorías</h3>
                <button className="btn btn-primary btn-sm" onClick={() => { setErrorMsg(""); setShowModal("categorias"); }}>
                  {plusIcon} Nueva categoría
                </button>
              </div>
              <div className="section-label" style={{ marginBottom: 10 }}>Productos</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 22 }}>
                {dbData?.categories.filter(c => c.type === "product").map((c) => (
                  <div key={c.name} className="chip">{c.name}</div>
                ))}
              </div>
              <div className="section-label" style={{ marginBottom: 10 }}>Gastos</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {dbData?.categories.filter(c => c.type === "expense").map((c) => (
                  <div key={c.name} className="chip">{c.name}</div>
                ))}
              </div>
            </>
          )}

          {/* ─── Métodos de pago ─── */}
          {tab === "metodos" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <h3 className="section-title">Métodos de pago</h3>
                <button className="btn btn-primary btn-sm" onClick={() => { setErrorMsg(""); setShowModal("metodos"); }}>
                  {plusIcon} Nuevo método
                </button>
              </div>
              {dbData?.paymentMethods.map((pm) => (
                <div key={pm.name} style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 0",
                  borderBottom: "1px solid var(--border-light)",
                }}>
                  <div>
                    <div style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{pm.name}</div>
                    <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)" }}>Moneda: {pm.currency}</div>
                  </div>
                  <span className={`badge ${pm.active ? "badge-success" : "badge-neutral"}`}>
                    {pm.active ? "Activo" : "Inactivo"}
                  </span>
                </div>
              ))}
            </>
          )}

          {/* ─── Transportistas ─── */}
          {tab === "transportistas" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <h3 className="section-title">Transportistas</h3>
                <button className="btn btn-primary btn-sm" onClick={() => { setErrorMsg(""); setShowModal("transportistas"); }}>
                  {plusIcon} Nuevo transportista
                </button>
              </div>
              {dbData?.carriers.map((c) => (
                <div key={c.name} style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 0",
                  borderBottom: "1px solid var(--border-light)",
                }}>
                  <span style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{c.name}</span>
                  <span className={`badge ${c.tag === "Principal" ? "badge-info" : "badge-neutral"}`}>{c.tag}</span>
                </div>
              ))}
            </>
          )}

          {/* ─── Tasa & umbrales ─── */}
          {tab === "tasa" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
                <div>
                  <h3 className="section-title" style={{ marginBottom: 6 }}>Tasas de cambio & cotizaciones</h3>
                  <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)" }}>
                    Fuente principal: DolarAPI Venezuela. La operación usa Paralelo por defecto y permite tasa manual por transacción.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="btn btn-secondary btn-sm" disabled={submitting} onClick={handleSyncFromApi}>
                    Sincronizar DolarAPI
                  </button>
                  <button className="btn btn-primary btn-sm" disabled={submitting} onClick={handleSaveRatesAndUmbrales}>
                    Guardar tasas manuales
                  </button>
                </div>
              </div>

              <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                {[
                  {
                    title: "Dolar Paralelo",
                    rate: dbData?.fxOverview?.current.USD.paralelo?.rate,
                    suffix: "Bs/USD",
                    meta: dbData?.fxOverview?.current.USD.paralelo?.externalUpdatedAt || dbData?.fxOverview?.current.USD.paralelo?.date || "Sin fecha",
                  },
                  {
                    title: "Dolar BCV",
                    rate: dbData?.fxOverview?.current.USD.bcv?.rate,
                    suffix: "Bs/USD",
                    meta: dbData?.fxOverview?.current.USD.bcv?.externalUpdatedAt || dbData?.fxOverview?.current.USD.bcv?.date || "Sin fecha",
                  },
                  {
                    title: "Euro Paralelo",
                    rate: dbData?.fxOverview?.current.EUR.paralelo?.rate,
                    suffix: "Bs/EUR",
                    meta: dbData?.fxOverview?.current.EUR.paralelo?.externalUpdatedAt || dbData?.fxOverview?.current.EUR.paralelo?.date || "Sin fecha",
                  },
                  {
                    title: "Euro BCV",
                    rate: dbData?.fxOverview?.current.EUR.bcv?.rate,
                    suffix: "Bs/EUR",
                    meta: dbData?.fxOverview?.current.EUR.bcv?.externalUpdatedAt || dbData?.fxOverview?.current.EUR.bcv?.date || "Sin fecha",
                  },
                ].map((card) => (
                  <div key={card.title} style={{ background: "var(--bg-subtle)", borderRadius: "var(--radius-4xl)", padding: 18 }}>
                    <div className="section-label" style={{ marginBottom: 6 }}>{card.title}</div>
                    <div style={{ fontSize: "var(--text-3xl)", fontWeight: 800 }}>
                      {formatRate(card.rate || 0)} <span style={{ fontSize: "var(--text-md)", color: "var(--text-muted)", fontWeight: 500 }}>{card.suffix}</span>
                    </div>
                    <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", marginTop: 4 }}>
                      Actualizado: {card.meta}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ background: "var(--bg-subtle)", borderRadius: "var(--radius-4xl)", padding: 16, marginBottom: 24 }}>
                <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-secondary)", marginBottom: 4 }}>
                  Estado de sincronización
                </div>
                <div style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>
                  {dbData?.fxOverview?.meta.lastSyncStatus || "Sin sincronización registrada"}
                </div>
                <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", marginTop: 4 }}>
                  Último intento: {dbData?.fxOverview?.meta.lastSyncAt || "Nunca"}
                </div>
              </div>

              <div className="grid-2" style={{ gap: 16, marginBottom: 24 }}>
                <div className="card" style={{ borderRadius: "var(--radius-4xl)", padding: 18 }}>
                  <div className="section-label" style={{ marginBottom: 8 }}>Gráfica histórica</div>
                  <MiniRateChart
                    color="#15151A"
                    values={(dbData?.fxOverview?.history || []).map((row) => row.usdParalelo)}
                  />
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: "var(--text-sm2)", color: "var(--text-muted)" }}>
                    <span>USD Paralelo</span>
                    <span>USD BCV</span>
                    <span>EUR Paralelo</span>
                    <span>EUR BCV</span>
                  </div>
                </div>

                <div className="card" style={{ borderRadius: "var(--radius-4xl)", padding: 18 }}>
                  <div className="section-label" style={{ marginBottom: 12 }}>Edición manual y fallback</div>
                  <div style={{ display: "grid", gap: 12 }}>
                    <div className="grid-2" style={{ gap: 12 }}>
                      <div>
                        <label className="input-label" style={{ display: "block", marginBottom: 6 }}>Dolar Paralelo</label>
                        <input className="input" type="number" step="0.01" value={rateParalelo} onChange={(e) => setRateParalelo(e.target.value)} />
                      </div>
                      <div>
                        <label className="input-label" style={{ display: "block", marginBottom: 6 }}>Dolar BCV</label>
                        <input className="input" type="number" step="0.01" value={rateBcv} onChange={(e) => setRateBcv(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid-2" style={{ gap: 12 }}>
                      <div>
                        <label className="input-label" style={{ display: "block", marginBottom: 6 }}>Euro Paralelo</label>
                        <input className="input" type="number" step="0.01" value={rateEuroParalelo} onChange={(e) => setRateEuroParalelo(e.target.value)} />
                      </div>
                      <div>
                        <label className="input-label" style={{ display: "block", marginBottom: 6 }}>Euro BCV</label>
                        <input className="input" type="number" step="0.01" value={rateEuroBcv} onChange={(e) => setRateEuroBcv(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="input-label" style={{ display: "block", marginBottom: 6 }}>Umbral de stock bajo (unidades)</label>
                      <input className="input" type="number" value={stockThreshold} onChange={(e) => setStockThreshold(e.target.value)} style={{ width: 120 }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="card" style={{ borderRadius: "var(--radius-4xl)", padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div className="section-label">Histórico de cotizaciones</div>
                  <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)" }}>
                    Cacheado en D1
                  </div>
                </div>
                <div className="responsive-table-scroll">
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "0.8fr 1fr 1fr 1fr 1fr",
                    gap: 12,
                    minWidth: 760,
                    padding: "10px 0",
                    borderBottom: "1px solid var(--border-header)",
                    font: "600 10.5px/1 var(--font-sans)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                  }}>
                    <span>Fecha</span>
                    <span>USD Paralelo</span>
                    <span>USD BCV</span>
                    <span>EUR Paralelo</span>
                    <span>EUR BCV</span>
                  </div>
                  {(dbData?.fxOverview?.history || []).slice().reverse().map((row) => (
                    <div
                      key={row.date}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "0.8fr 1fr 1fr 1fr 1fr",
                        gap: 12,
                        minWidth: 760,
                        padding: "12px 0",
                        borderBottom: "1px solid var(--border-light)",
                      }}
                    >
                      <span className="font-mono" style={{ fontSize: "var(--text-sm2)", color: "var(--text-secondary)" }}>{row.date}</span>
                      <span>{row.usdParalelo ? formatRate(row.usdParalelo) : "N/D"}</span>
                      <span>{row.usdBcv ? formatRate(row.usdBcv) : "N/D"}</span>
                      <span>{row.eurParalelo ? formatRate(row.eurParalelo) : "N/D"}</span>
                      <span>{row.eurBcv ? formatRate(row.eurBcv) : "N/D"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === "usuarios" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <h3 className="section-title">Usuarios y roles</h3>
                <button className="btn btn-primary btn-sm" onClick={() => { setErrorMsg(""); setShowModal("usuarios"); }}>
                  {plusIcon} Nuevo usuario
                </button>
              </div>

              {usersList.length === 0 ? (
                <div className="empty-state-card">
                  <strong>Sin usuarios registrados.</strong> Crea accesos para dueña, vendedores y personal operativo.
                </div>
              ) : (
                usersList.map((listedUser) => (
                  <div key={listedUser.id} style={{
                    display: "grid",
                    gridTemplateColumns: "1.5fr 0.8fr 0.8fr 0.8fr",
                    gap: 14,
                    alignItems: "center",
                    padding: "14px 0",
                    borderBottom: "1px solid var(--border-light)",
                  }}>
                    <div>
                      <div style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>{listedUser.name}</div>
                      <div className="font-mono" style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)" }}>
                        {listedUser.email}
                      </div>
                    </div>
                    <select
                      className="input"
                      value={listedUser.role}
                      disabled={submitting}
                      onChange={(e) => handleChangeUserRole(listedUser.id, e.target.value as "admin" | "vendedor")}
                    >
                      <option value="admin">Admin</option>
                      <option value="vendedor">Vendedor</option>
                    </select>
                    <span className={`badge ${listedUser.active ? "badge-success" : "badge-neutral"}`}>
                      {listedUser.active ? "Activo" : "Inactivo"}
                    </span>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        className={`btn btn-sm ${listedUser.active ? "btn-secondary" : "btn-primary"}`}
                        disabled={submitting}
                        onClick={() => handleToggleUserActive(listedUser.id, !listedUser.active)}
                      >
                        {listedUser.active ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>

      {/* --- ADD MODALS --- */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2>Agregar Nuevo Parámetro</h2>
              <button className="modal-close" onClick={() => setShowModal(null)} aria-label="Cerrar modal">×</button>
            </div>
            
            {errorMsg && (
              <div className="alert-banner alert-banner-danger" style={{ marginBottom: 16 }}>
                <p>{errorMsg}</p>
              </div>
            )}

            {/* Colores Form */}
            {showModal === "colores" && (
              <form onSubmit={handleAddColor}>
                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Código Z (ej: Z34)</label>
                  <input className="input" type="text" placeholder="Z34" value={colorCode} onChange={(e) => setColorCode(e.target.value)} required />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Nombre del color</label>
                  <input className="input" type="text" placeholder="Gris Plomo" value={colorName} onChange={(e) => setColorName(e.target.value)} required />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label className="input-label">Color hexadecimal</label>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} style={{ width: 44, height: 40, padding: 0, border: "none", cursor: "pointer" }} />
                    <input className="input" type="text" placeholder="#6b7280" value={colorHex} onChange={(e) => setColorHex(e.target.value)} required />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(null)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>Guardar Color</button>
                </div>
              </form>
            )}

            {/* Tallas Form */}
            {showModal === "tallas" && (
              <form onSubmit={handleAddSize}>
                <div style={{ marginBottom: 20 }}>
                  <label className="input-label">Nombre de la talla</label>
                  <input className="input" type="text" placeholder="M" value={sizeName} onChange={(e) => setSizeName(e.target.value)} required />
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(null)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>Guardar Talla</button>
                </div>
              </form>
            )}

            {/* Categorías Form */}
            {showModal === "categorias" && (
              <form onSubmit={handleAddCategory}>
                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Nombre de la categoría</label>
                  <input className="input" type="text" placeholder="Cuello V" value={catName} onChange={(e) => setCatName(e.target.value)} required />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label className="input-label">Tipo de categoría</label>
                  <select
                    className="input"
                    value={catType}
                    onChange={(e) => setCatType(e.target.value as "product" | "expense")}
                  >
                    <option value="product">Productos</option>
                    <option value="expense">Gastos (egresos)</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(null)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>Guardar Categoría</button>
                </div>
              </form>
            )}

            {/* Métodos Pago Form */}
            {showModal === "metodos" && (
              <form onSubmit={handleAddPaymentMethod}>
                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Nombre del método</label>
                  <input className="input" type="text" placeholder="Zelle" value={payName} onChange={(e) => setPayName(e.target.value)} required />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label className="input-label">Divisa / Moneda</label>
                  <input className="input" type="text" placeholder="USD" value={payCurrency} onChange={(e) => setPayCurrency(e.target.value)} required />
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(null)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>Guardar Método</button>
                </div>
              </form>
            )}

            {/* Transportistas Form */}
            {showModal === "transportistas" && (
              <form onSubmit={handleAddCarrier}>
                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Nombre del transportista</label>
                  <input className="input" type="text" placeholder="MRW" value={carrierName} onChange={(e) => setCarrierName(e.target.value)} required />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label className="input-label">Tipo / Etiqueta</label>
                  <select className="input" value={carrierTag} onChange={(e) => setCarrierTag(e.target.value)}>
                    <option value="Principal">Principal</option>
                    <option value="Secundario">Secundario</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(null)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>Guardar Transportista</button>
                </div>
              </form>
            )}

            {showModal === "usuarios" && (
              <form onSubmit={handleAddUser}>
                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Nombre completo</label>
                  <input className="input" type="text" placeholder="Yoselin K." value={userName} onChange={(e) => setUserName(e.target.value)} required />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Correo</label>
                  <input className="input" type="email" placeholder="yoselin@kuniformes.com" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} required />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Contraseña inicial</label>
                  <input className="input" type="password" placeholder="Mínimo 6 caracteres" value={userPassword} onChange={(e) => setUserPassword(e.target.value)} required />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label className="input-label">Rol</label>
                  <select className="input" value={userRole} onChange={(e) => setUserRole(e.target.value as "admin" | "vendedor")}>
                    <option value="admin">Administrador</option>
                    <option value="vendedor">Vendedor</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(null)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>Crear Usuario</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
