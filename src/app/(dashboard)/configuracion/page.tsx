"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useUser } from "../UserContext";
import {
  addCarrier,
  addCategory,
  addColor,
  addPaymentMethod,
  addSize,
  changeUserPasswordAction,
  createUserAction,
  deleteCarrierAction,
  deleteCategoryAction,
  deleteColorAction,
  deletePaymentMethodAction,
  deleteSizeAction,
  deleteUserAction,
  getConfigData,
  getExchangeRatesOverviewAction,
  getUsersListAction,
  saveManualExchangeRatesAction,
  syncExchangeRatesAction,
  updateCarrierAction,
  updateCategoryAction,
  updateColorAction,
  updatePaymentMethodAction,
  updateSetting,
  updateSizeAction,
  updateUserAction,
  updateUserActiveAction,
  updateUserRoleAction,
} from "@/lib/db/actions";
import { SETTINGS_KEYS, SYSTEM_DEFAULTS } from "@/lib/app-config";
import { formatRate } from "@/lib/utils";

type ConfigTab = "colores" | "tallas" | "categorias" | "metodos" | "transportistas" | "tasa" | "usuarios";
type ConfigModalType = ConfigTab | "password";
type ConfigData = Awaited<ReturnType<typeof getConfigData>>;
type ColorOption = { id: number; code: string; name: string; hex: string };
type SizeOption = { id: number; name: string };
type CategoryOption = { id: number; name: string; type: "product" | "expense" };
type PaymentMethodOption = { id: number; name: string; currency: string; active: boolean };
type CarrierOption = { id: number; name: string; tag: string };
type UserOption = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "vendedor";
  active: boolean;
  createdAt: string;
};
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

type ActionResult = { success: boolean; error?: string };

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

function MiniRateChart({ values, color }: { values: Array<number | null>; color: string }) {
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
      <polyline fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

function EntityCard({
  title,
  subtitle,
  badge,
  extra,
  onEdit,
  onDelete,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  extra?: ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border-light)",
        borderRadius: "var(--radius-3xl)",
        padding: 16,
        background: "var(--bg-subtle)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>{title}</div>
          {subtitle ? (
            <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", marginTop: 4 }}>
              {subtitle}
            </div>
          ) : null}
          {extra ? <div style={{ marginTop: 10 }}>{extra}</div> : null}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {badge}
          {onEdit ? <button className="btn btn-secondary btn-sm" onClick={onEdit}>Editar</button> : null}
          {onDelete ? <button className="btn btn-secondary btn-sm" onClick={onDelete}>Eliminar</button> : null}
        </div>
      </div>
    </div>
  );
}

export default function ConfiguracionPage() {
  const user = useUser();
  const [tab, setTab] = useState<ConfigTab>("colores");
  const [loading, setLoading] = useState(true);
  const [dbData, setDbData] = useState<ConfigPageData | null>(null);
  const [usersList, setUsersList] = useState<UserOption[]>([]);

  const [modalType, setModalType] = useState<ConfigModalType | null>(null);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<number | string | null>(null);

  const [colorCode, setColorCode] = useState("");
  const [colorName, setColorName] = useState("");
  const [colorHex, setColorHex] = useState("#000000");
  const [sizeName, setSizeName] = useState("");
  const [catName, setCatName] = useState("");
  const [catType, setCatType] = useState<"product" | "expense">("product");
  const [payName, setPayName] = useState("");
  const [payCurrency, setPayCurrency] = useState("USD");
  const [payActive, setPayActive] = useState(true);
  const [carrierName, setCarrierName] = useState("");
  const [carrierTag, setCarrierTag] = useState("Principal");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState<"admin" | "vendedor">("vendedor");

  const [rateParalelo, setRateParalelo] = useState("");
  const [rateBcv, setRateBcv] = useState("");
  const [rateEuroParalelo, setRateEuroParalelo] = useState("");
  const [rateEuroBcv, setRateEuroBcv] = useState("");
  const [stockThreshold, setStockThreshold] = useState("5");

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      setRateParalelo(data.settings[SETTINGS_KEYS.parallelRate] || String(SYSTEM_DEFAULTS.rates.paralelo));
      setRateBcv(data.settings[SETTINGS_KEYS.bcvRate] || String(SYSTEM_DEFAULTS.rates.bcv));
      setRateEuroParalelo(data.settings[SETTINGS_KEYS.euroParallelRate] || String(SYSTEM_DEFAULTS.rates.euroParalelo));
      setRateEuroBcv(data.settings[SETTINGS_KEYS.euroBcvRate] || String(SYSTEM_DEFAULTS.rates.euroBcv));
      setStockThreshold(data.settings[SETTINGS_KEYS.lowStockThreshold] || String(SYSTEM_DEFAULTS.lowStockThreshold));
      setErrorMsg("");
      setSuccessMsg("");
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

  function resetModalState() {
    setModalType(null);
    setModalMode("create");
    setEditingId(null);
    setErrorMsg("");
    setColorCode("");
    setColorName("");
    setColorHex("#000000");
    setSizeName("");
    setCatName("");
    setCatType("product");
    setPayName("");
    setPayCurrency("USD");
    setPayActive(true);
    setCarrierName("");
    setCarrierTag("Principal");
    setUserName("");
    setUserEmail("");
    setUserPassword("");
    setUserRole("vendedor");
  }

  function closeModal() {
    resetModalState();
  }

  function openCreateModal(type: ConfigTab) {
    resetModalState();
    setModalType(type);
    setModalMode("create");
  }

  function openEditColor(item: ColorOption) {
    resetModalState();
    setModalType("colores");
    setModalMode("edit");
    setEditingId(item.id);
    setColorCode(item.code);
    setColorName(item.name);
    setColorHex(item.hex);
  }

  function openEditSize(item: SizeOption) {
    resetModalState();
    setModalType("tallas");
    setModalMode("edit");
    setEditingId(item.id);
    setSizeName(item.name);
  }

  function openEditCategory(item: CategoryOption) {
    resetModalState();
    setModalType("categorias");
    setModalMode("edit");
    setEditingId(item.id);
    setCatName(item.name);
    setCatType(item.type);
  }

  function openEditPaymentMethod(item: PaymentMethodOption) {
    resetModalState();
    setModalType("metodos");
    setModalMode("edit");
    setEditingId(item.id);
    setPayName(item.name);
    setPayCurrency(item.currency);
    setPayActive(item.active);
  }

  function openEditCarrier(item: CarrierOption) {
    resetModalState();
    setModalType("transportistas");
    setModalMode("edit");
    setEditingId(item.id);
    setCarrierName(item.name);
    setCarrierTag(item.tag);
  }

  function openCreateUser() {
    resetModalState();
    setModalType("usuarios");
    setModalMode("create");
  }

  function openEditUser(item: UserOption) {
    resetModalState();
    setModalType("usuarios");
    setModalMode("edit");
    setEditingId(item.id);
    setUserName(item.name);
    setUserEmail(item.email);
    setUserRole(item.role);
  }

  function openPasswordModal(item: UserOption) {
    resetModalState();
    setModalType("password");
    setEditingId(item.id);
    setUserName(item.name);
  }

  async function runAction(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setSubmitting(true);
    setErrorMsg("");
    try {
      const res = await action();
      if (!res.success) {
        throw new Error(res.error || "La operación no se pudo completar.");
      }
      if (onSuccess) {
        onSuccess();
      }
      await loadData();
    } catch (e: any) {
      console.error(e);
      const message = e?.message || "Ocurrió un error.";
      setErrorMsg(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmAndRun(message: string, action: () => Promise<ActionResult>) {
    if (!confirm(message)) return;
    await runAction(action);
  }

  async function handleColorSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await runAction(
      () =>
        modalMode === "edit" && typeof editingId === "number"
          ? updateColorAction(editingId, colorCode, colorName, colorHex)
          : addColor(colorCode, colorName, colorHex),
      closeModal
    );
  }

  async function handleSizeSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await runAction(
      () =>
        modalMode === "edit" && typeof editingId === "number"
          ? updateSizeAction(editingId, sizeName)
          : addSize(sizeName),
      closeModal
    );
  }

  async function handleCategorySubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await runAction(
      () =>
        modalMode === "edit" && typeof editingId === "number"
          ? updateCategoryAction(editingId, catName, catType)
          : addCategory(catName, catType),
      closeModal
    );
  }

  async function handlePaymentMethodSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await runAction(
      () =>
        modalMode === "edit" && typeof editingId === "number"
          ? updatePaymentMethodAction(editingId, {
              name: payName,
              currency: payCurrency,
              active: payActive,
            })
          : addPaymentMethod(payName, payCurrency),
      closeModal
    );
  }

  async function handleCarrierSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await runAction(
      () =>
        modalMode === "edit" && typeof editingId === "number"
          ? updateCarrierAction(editingId, carrierName, carrierTag)
          : addCarrier(carrierName, carrierTag),
      closeModal
    );
  }

  async function handleUserSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await runAction(
      async () => {
        if (modalMode === "edit" && typeof editingId === "string") {
          const profileResult = await updateUserAction({
            id: editingId,
            name: userName,
            email: userEmail,
          });
          if (!profileResult.success) return profileResult;
          return updateUserRoleAction(editingId, userRole);
        }
        return createUserAction({
          name: userName,
          email: userEmail,
          password: userPassword,
          role: userRole,
        });
      },
      closeModal
    );
  }

  async function handlePasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (typeof editingId !== "string") return;
    await runAction(() => changeUserPasswordAction(editingId, userPassword), closeModal);
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
      setSuccessMsg("Tasas manuales y parámetros actualizados correctamente.");
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message || "Error al guardar configuraciones.");
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
      setSuccessMsg("Tasas actualizadas desde DolarAPI y cacheadas en D1.");
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message || "Error al sincronizar tasas.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleUserActive(targetUserId: string, nextActive: boolean) {
    await runAction(() => updateUserActiveAction(targetUserId, nextActive));
  }

  async function handleChangeUserRole(targetUserId: string, nextRole: "admin" | "vendedor") {
    await runAction(() => updateUserRoleAction(targetUserId, nextRole));
  }

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

  return (
    <div className="animate-fade-in">
      <div className="settings-layout">
        <div className="card" style={{ borderRadius: "var(--radius-5xl)", padding: "14px 10px", height: "max-content" }}>
          <nav className="settings-nav">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`settings-nav-btn ${tab === t.key ? "active" : ""}`}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="card" style={{ borderRadius: "var(--radius-5xl)", padding: 24 }}>
          {successMsg ? (
            <div className="alert-banner alert-banner-success" style={{ marginBottom: 16 }}>
              <p>{successMsg}</p>
            </div>
          ) : null}
          {errorMsg ? (
            <div className="alert-banner alert-banner-danger" style={{ marginBottom: 16 }}>
              <p>{errorMsg}</p>
            </div>
          ) : null}

          {tab === "colores" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <h3 className="section-title">Paleta de colores</h3>
                <button className="btn btn-primary btn-sm" onClick={() => openCreateModal("colores")}>{plusIcon} Nuevo color</button>
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {dbData?.colors.map((c) => (
                  <EntityCard
                    key={c.id}
                    title={`${c.name} · ${c.code}`}
                    subtitle={c.hex}
                    extra={<div className="color-swatch-lg" style={{ background: c.hex, border: "1px solid rgba(0,0,0,.1)" }} />}
                    onEdit={() => openEditColor(c)}
                    onDelete={() => confirmAndRun("¿Eliminar este color?", () => deleteColorAction(c.id))}
                  />
                ))}
              </div>
            </>
          )}

          {tab === "tallas" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <h3 className="section-title">Tallas registradas</h3>
                <button className="btn btn-primary btn-sm" onClick={() => openCreateModal("tallas")}>{plusIcon} Nueva talla</button>
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {dbData?.sizes.map((s) => (
                  <EntityCard
                    key={s.id}
                    title={s.name}
                    onEdit={() => openEditSize(s)}
                    onDelete={() => confirmAndRun("¿Eliminar esta talla?", () => deleteSizeAction(s.id))}
                  />
                ))}
              </div>
            </>
          )}

          {tab === "categorias" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <h3 className="section-title">Categorías</h3>
                <button className="btn btn-primary btn-sm" onClick={() => openCreateModal("categorias")}>{plusIcon} Nueva categoría</button>
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {dbData?.categories.map((c) => (
                  <EntityCard
                    key={c.id}
                    title={c.name}
                    subtitle={c.type === "product" ? "Producto" : "Gasto"}
                    badge={<span className={`badge ${c.type === "product" ? "badge-info" : "badge-neutral"}`}>{c.type === "product" ? "Producto" : "Gasto"}</span>}
                    onEdit={() => openEditCategory(c)}
                    onDelete={() => confirmAndRun("¿Eliminar esta categoría?", () => deleteCategoryAction(c.id))}
                  />
                ))}
              </div>
            </>
          )}

          {tab === "metodos" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <h3 className="section-title">Métodos de pago</h3>
                <button className="btn btn-primary btn-sm" onClick={() => openCreateModal("metodos")}>{plusIcon} Nuevo método</button>
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {dbData?.paymentMethods.map((pm) => (
                  <EntityCard
                    key={pm.id}
                    title={pm.name}
                    subtitle={`Moneda: ${pm.currency}`}
                    badge={<span className={`badge ${pm.active ? "badge-success" : "badge-neutral"}`}>{pm.active ? "Activo" : "Inactivo"}</span>}
                    onEdit={() => openEditPaymentMethod(pm)}
                    onDelete={() => confirmAndRun("¿Eliminar este método de pago?", () => deletePaymentMethodAction(pm.id))}
                  />
                ))}
              </div>
            </>
          )}

          {tab === "transportistas" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <h3 className="section-title">Transportistas</h3>
                <button className="btn btn-primary btn-sm" onClick={() => openCreateModal("transportistas")}>{plusIcon} Nuevo transportista</button>
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {dbData?.carriers.map((c) => (
                  <EntityCard
                    key={c.id}
                    title={c.name}
                    badge={<span className={`badge ${c.tag === "Principal" ? "badge-info" : "badge-neutral"}`}>{c.tag}</span>}
                    onEdit={() => openEditCarrier(c)}
                    onDelete={() => confirmAndRun("¿Eliminar este transportista?", () => deleteCarrierAction(c.id))}
                  />
                ))}
              </div>
            </>
          )}

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
                  <button className="btn btn-secondary btn-sm" disabled={submitting} onClick={handleSyncFromApi}>Sincronizar DolarAPI</button>
                  <button className="btn btn-primary btn-sm" disabled={submitting} onClick={handleSaveRatesAndUmbrales}>Guardar tasas manuales</button>
                </div>
              </div>

              <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
                {[
                  { title: "Dolar Paralelo", rate: dbData?.fxOverview?.current.USD.paralelo?.rate, suffix: "Bs/USD", meta: dbData?.fxOverview?.current.USD.paralelo?.externalUpdatedAt || dbData?.fxOverview?.current.USD.paralelo?.date || "Sin fecha" },
                  { title: "Dolar BCV", rate: dbData?.fxOverview?.current.USD.bcv?.rate, suffix: "Bs/USD", meta: dbData?.fxOverview?.current.USD.bcv?.externalUpdatedAt || dbData?.fxOverview?.current.USD.bcv?.date || "Sin fecha" },
                  { title: "Euro Paralelo", rate: dbData?.fxOverview?.current.EUR.paralelo?.rate, suffix: "Bs/EUR", meta: dbData?.fxOverview?.current.EUR.paralelo?.externalUpdatedAt || dbData?.fxOverview?.current.EUR.paralelo?.date || "Sin fecha" },
                  { title: "Euro BCV", rate: dbData?.fxOverview?.current.EUR.bcv?.rate, suffix: "Bs/EUR", meta: dbData?.fxOverview?.current.EUR.bcv?.externalUpdatedAt || dbData?.fxOverview?.current.EUR.bcv?.date || "Sin fecha" },
                ].map((card) => (
                  <div key={card.title} style={{ background: "var(--bg-subtle)", borderRadius: "var(--radius-4xl)", padding: 18 }}>
                    <div className="section-label" style={{ marginBottom: 6 }}>{card.title}</div>
                    <div style={{ fontSize: "var(--text-3xl)", fontWeight: 800 }}>
                      {formatRate(card.rate || 0)} <span style={{ fontSize: "var(--text-md)", color: "var(--text-muted)", fontWeight: 500 }}>{card.suffix}</span>
                    </div>
                    <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", marginTop: 4 }}>Actualizado: {card.meta}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: "var(--bg-subtle)", borderRadius: "var(--radius-4xl)", padding: 16, marginBottom: 24 }}>
                <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-secondary)", marginBottom: 4 }}>Estado de sincronización</div>
                <div style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>{dbData?.fxOverview?.meta.lastSyncStatus || "Sin sincronización registrada"}</div>
                <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", marginTop: 4 }}>Último intento: {dbData?.fxOverview?.meta.lastSyncAt || "Nunca"}</div>
              </div>

              <div className="grid-2" style={{ gap: 16, marginBottom: 24 }}>
                <div className="card" style={{ borderRadius: "var(--radius-4xl)", padding: 18 }}>
                  <div className="section-label" style={{ marginBottom: 8 }}>Gráfica histórica</div>
                  <MiniRateChart color="#15151A" values={(dbData?.fxOverview?.history || []).map((row) => row.usdParalelo)} />
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
                  <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)" }}>Cacheado en D1</div>
                </div>
                <div className="responsive-table-scroll">
                  <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1fr 1fr 1fr 1fr", gap: 12, minWidth: 760, padding: "10px 0", borderBottom: "1px solid var(--border-header)", font: "600 10.5px/1 var(--font-sans)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                    <span>Fecha</span>
                    <span>USD Paralelo</span>
                    <span>USD BCV</span>
                    <span>EUR Paralelo</span>
                    <span>EUR BCV</span>
                  </div>
                  {(dbData?.fxOverview?.history || []).slice().reverse().map((row) => (
                    <div key={row.date} style={{ display: "grid", gridTemplateColumns: "0.8fr 1fr 1fr 1fr 1fr", gap: 12, minWidth: 760, padding: "12px 0", borderBottom: "1px solid var(--border-light)" }}>
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
                <button className="btn btn-primary btn-sm" onClick={openCreateUser}>{plusIcon} Nuevo usuario</button>
              </div>

              {usersList.length === 0 ? (
                <div className="empty-state-card"><strong>Sin usuarios registrados.</strong> Crea accesos para dueña, vendedores y personal operativo.</div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {usersList.map((listedUser) => (
                    <div key={listedUser.id} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-3xl)", padding: 16, background: "var(--bg-subtle)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>{listedUser.name}</div>
                          <div className="font-mono" style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", marginTop: 4 }}>{listedUser.email}</div>
                          <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", marginTop: 4 }}>Creado: {listedUser.createdAt}</div>
                        </div>
                        <div style={{ display: "grid", gap: 10, minWidth: 320, flex: "1 1 320px" }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <select className="input" value={listedUser.role} disabled={submitting} onChange={(e) => handleChangeUserRole(listedUser.id, e.target.value as "admin" | "vendedor")} style={{ maxWidth: 160 }}>
                              <option value="admin">Admin</option>
                              <option value="vendedor">Vendedor</option>
                            </select>
                            <span className={`badge ${listedUser.active ? "badge-success" : "badge-neutral"}`}>{listedUser.active ? "Activo" : "Inactivo"}</span>
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button className="btn btn-secondary btn-sm" disabled={submitting} onClick={() => openEditUser(listedUser)}>Editar</button>
                            <button className="btn btn-secondary btn-sm" disabled={submitting} onClick={() => openPasswordModal(listedUser)}>Cambiar clave</button>
                            <button className={`btn btn-sm ${listedUser.active ? "btn-secondary" : "btn-primary"}`} disabled={submitting} onClick={() => handleToggleUserActive(listedUser.id, !listedUser.active)}>
                              {listedUser.active ? "Desactivar" : "Activar"}
                            </button>
                            <button className="btn btn-secondary btn-sm" disabled={submitting} onClick={() => confirmAndRun(`¿Eliminar a ${listedUser.name}?`, () => deleteUserAction(listedUser.id))}>Eliminar</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {modalType && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2>
                {modalType === "password"
                  ? `Cambiar clave de ${userName}`
                  : `${modalMode === "edit" ? "Editar" : "Agregar"} ${modalType === "usuarios" ? "usuario" : "parámetro"}`}
              </h2>
              <button className="modal-close" onClick={closeModal} aria-label="Cerrar modal">×</button>
            </div>

            {errorMsg ? (
              <div className="alert-banner alert-banner-danger" style={{ marginBottom: 16 }}>
                <p>{errorMsg}</p>
              </div>
            ) : null}

            {modalType === "colores" && (
              <form onSubmit={handleColorSubmit}>
                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Código Z</label>
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
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>{modalMode === "edit" ? "Guardar cambios" : "Guardar color"}</button>
                </div>
              </form>
            )}

            {modalType === "tallas" && (
              <form onSubmit={handleSizeSubmit}>
                <div style={{ marginBottom: 20 }}>
                  <label className="input-label">Nombre de la talla</label>
                  <input className="input" type="text" placeholder="M" value={sizeName} onChange={(e) => setSizeName(e.target.value)} required />
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>{modalMode === "edit" ? "Guardar cambios" : "Guardar talla"}</button>
                </div>
              </form>
            )}

            {modalType === "categorias" && (
              <form onSubmit={handleCategorySubmit}>
                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Nombre de la categoría</label>
                  <input className="input" type="text" placeholder="Cuello V" value={catName} onChange={(e) => setCatName(e.target.value)} required />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label className="input-label">Tipo de categoría</label>
                  <select className="input" value={catType} onChange={(e) => setCatType(e.target.value as "product" | "expense")}>
                    <option value="product">Productos</option>
                    <option value="expense">Gastos</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>{modalMode === "edit" ? "Guardar cambios" : "Guardar categoría"}</button>
                </div>
              </form>
            )}

            {modalType === "metodos" && (
              <form onSubmit={handlePaymentMethodSubmit}>
                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Nombre del método</label>
                  <input className="input" type="text" placeholder="Zelle" value={payName} onChange={(e) => setPayName(e.target.value)} required />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Divisa / Moneda</label>
                  <input className="input" type="text" placeholder="USD" value={payCurrency} onChange={(e) => setPayCurrency(e.target.value)} required />
                </div>
                {modalMode === "edit" ? (
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "var(--text-sm2)", color: "var(--text-secondary)" }}>
                      <input type="checkbox" checked={payActive} onChange={(e) => setPayActive(e.target.checked)} />
                      Método activo
                    </label>
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>{modalMode === "edit" ? "Guardar cambios" : "Guardar método"}</button>
                </div>
              </form>
            )}

            {modalType === "transportistas" && (
              <form onSubmit={handleCarrierSubmit}>
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
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>{modalMode === "edit" ? "Guardar cambios" : "Guardar transportista"}</button>
                </div>
              </form>
            )}

            {modalType === "usuarios" && (
              <form onSubmit={handleUserSubmit}>
                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Nombre completo</label>
                  <input className="input" type="text" placeholder="Yoselin K." value={userName} onChange={(e) => setUserName(e.target.value)} required />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Correo</label>
                  <input className="input" type="email" placeholder="yoselin@kuniformes.com" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} required />
                </div>
                {modalMode === "create" ? (
                  <div style={{ marginBottom: 14 }}>
                    <label className="input-label">Contraseña inicial</label>
                    <input className="input" type="password" placeholder="Mínimo 6 caracteres" value={userPassword} onChange={(e) => setUserPassword(e.target.value)} required />
                  </div>
                ) : null}
                <div style={{ marginBottom: 20 }}>
                  <label className="input-label">Rol</label>
                  <select className="input" value={userRole} onChange={(e) => setUserRole(e.target.value as "admin" | "vendedor")}>
                    <option value="admin">Administrador</option>
                    <option value="vendedor">Vendedor</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>{modalMode === "edit" ? "Guardar cambios" : "Crear usuario"}</button>
                </div>
              </form>
            )}

            {modalType === "password" && (
              <form onSubmit={handlePasswordSubmit}>
                <div style={{ marginBottom: 14 }}>
                  <label className="input-label">Nueva contraseña</label>
                  <input className="input" type="password" placeholder="Mínimo 6 caracteres" value={userPassword} onChange={(e) => setUserPassword(e.target.value)} required />
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>Actualizar clave</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
