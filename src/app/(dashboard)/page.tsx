"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getDashboardData, getConfigData } from "@/lib/db/actions";
import { formatUSD } from "@/lib/utils";
import styles from "./page.module.css";
import { useUser } from "./UserContext";
import { SETTINGS_KEYS, SYSTEM_DEFAULTS } from "@/lib/app-config";

function f$(n: number) {
  return formatUSD(n);
}

function fBs(n: number, rate: number) {
  const v = n * rate;
  return (
    "Bs " +
    v.toLocaleString("es-VE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

const arrowUp = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <path d="M7 17L17 7M9 7h8v8" />
  </svg>
);

const arrowDown = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <path d="M7 7l10 10M9 17h8V9" />
  </svg>
);

const alertIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C2392E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

export default function PanelPage() {
  const user = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [dbData, setDbData] = useState<any>(null);
  const [rates, setRates] = useState<{ paralelo: number; bcv: number }>({
    paralelo: SYSTEM_DEFAULTS.rates.paralelo,
    bcv: SYSTEM_DEFAULTS.rates.bcv,
  });

  async function loadData() {
    try {
      setLoading(true);
      const [data, config] = await Promise.all([
        getDashboardData(),
        getConfigData(),
      ]);
      setDbData(data);
      const pRate = parseFloat(
        config.settings[SETTINGS_KEYS.parallelRate] || String(SYSTEM_DEFAULTS.rates.paralelo)
      );
      const bRate = parseFloat(
        config.settings[SETTINGS_KEYS.bcvRate] || String(SYSTEM_DEFAULTS.rates.bcv)
      );
      setRates({ paralelo: pRate, bcv: bRate });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // The "usuario" role (operational worker) has no access to the dashboard/metrics.
  useEffect(() => {
    if (user?.role === "usuario") {
      router.replace("/ventas");
    }
  }, [user, router]);

  useEffect(() => {
    if (user?.role === "usuario") return;
    loadData();
  }, [user?.role]);

  if (user?.role === "usuario") {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "300px" }}>
        <div className="loader">Redirigiendo…</div>
      </div>
    );
  }

  if (loading || !dbData) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "300px" }}>
        <div className="loader">Cargando panel de control...</div>
      </div>
    );
  }

  const diferencial = Math.round(((rates.paralelo - rates.bcv) / rates.bcv) * 100);

  return (
    <div className="animate-fade-in">
      {/* Alert banner */}
      {(dbData.skusCero > 0 || dbData.despPend > 0 || dbData.devolPend > 0) && (
        <div className="alert-banner alert-banner-danger" style={{ marginBottom: "20px" }}>
          {alertIcon}
          <p>
            <strong>{dbData.skusCero} SKUs en cero</strong> · {dbData.despPend} despacho pendiente · {dbData.devolPend} devolución por procesar
          </p>
          <button className={styles.alertLink} onClick={() => window.location.href = "/inventario"}>Revisar →</button>
        </div>
      )}

      {/* KPI row */}
      <div className="grid-4 mb-16">
        {/* Ventas del mes */}
        <div className="card card-dark" style={{ borderRadius: "var(--radius-5xl)", padding: "20px" }}>
          <div className="kpi-label">Ventas del mes</div>
          <div className="kpi-value">
            {f$(dbData.ventasMes)}
          </div>
          <div className="kpi-sub">{fBs(dbData.ventasMes, rates.paralelo)}</div>
          <div className="kpi-trend up">
            {arrowUp}
            {dbData.totalVentasCount} transacciones
          </div>
        </div>

        {/* Ganancia neta (Admin) o Cotizaciones abiertas (Vendedor) */}
        {user?.role === "admin" ? (
          <div className="card" style={{ borderRadius: "var(--radius-5xl)", padding: "20px" }}>
            <div className="kpi-label">Ganancia neta</div>
            <div className="kpi-value">
              {f$(dbData.gananciaNeta)}
            </div>
            <div className="kpi-sub" style={{ color: "var(--text-tertiary)" }}>
              Margen {dbData.marginPct.toFixed(1)}% del período
            </div>
            <div className="kpi-trend" style={{ color: "var(--text-tertiary)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--success)" }} />
              Ventas − costo productos − gastos
            </div>
          </div>
        ) : (
          <div className="card" style={{ borderRadius: "var(--radius-5xl)", padding: "20px" }}>
            <div className="kpi-label">Cotizaciones abiertas</div>
            <div className="kpi-value">
              {dbData.quotesAbiertas}
            </div>
            <div className="kpi-sub" style={{ color: "var(--text-tertiary)" }}>
              Cotizaciones pendientes de conversión
            </div>
            <div className="kpi-trend neutral">
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--info)" }} />
              Por procesar
            </div>
          </div>
        )}

        {/* Deuda consignación */}
        <div className="card" style={{ borderRadius: "var(--radius-5xl)", padding: "20px" }}>
          <div className="kpi-label">Deuda consignación</div>
          <div className="kpi-value">{f$(dbData.deudaCons)}</div>
          <div className="kpi-sub" style={{ color: "var(--text-tertiary)" }}>
            Saldo pendiente consignatarias
          </div>
          <div className="kpi-trend neutral">
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--success)" }} />
            Liquidado: {f$(dbData.consignLiquidado || 0)}
          </div>
        </div>

        {/* Gastos del mes */}
        <div className="card" style={{ borderRadius: "var(--radius-5xl)", padding: "20px" }}>
          <div className="kpi-label">Gastos del mes</div>
          <div className="kpi-value">
            {f$(dbData.gastosMes)}
          </div>
          <div className="kpi-sub" style={{ color: "var(--text-tertiary)" }}>
            Egresos registrados del período
          </div>
          <div className="kpi-trend down">
            {arrowDown}
            Costos operativos
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid-chart mb-16">
        {/* Facturación vs Gastos */}
        <div className="card" style={{ borderRadius: "var(--radius-5xl)", padding: "22px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <div className="section-title">Facturación vs Gastos</div>
              <div style={{ fontSize: "var(--text-base)", color: "var(--text-muted)", marginTop: 2 }}>Mes actual · por semana</div>
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-base)", color: "var(--text-tertiary)" }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--bg-card-dark)" }} />
                Facturación
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-base)", color: "var(--text-tertiary)" }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: "#D8D6CF" }} />
                Gastos
              </div>
            </div>
          </div>
          {/* SVG bar chart */}
          <svg viewBox="0 0 540 180" style={{ width: "100%", height: "auto", display: "block" }}>
            {[1, 0.5, 0].map((g, i) => {
              const y = 18 + 130 * (1 - g);
              return <line key={i} x1={18} x2={522} y1={y} y2={y} stroke="#F0EEE8" strokeWidth={1} />;
            })}
            {dbData.weeks.map((d: any, i: number) => {
              const cx = 18 + i * 126 + 63;
              const maxVal = Math.max(...dbData.weeks.map((w: any) => Math.max(w.facturacion, w.gastos)), 1);
              const fh = (d.facturacion / maxVal) * 130;
              const gh = (d.gastos / maxVal) * 130;
              return (
                <g key={i}>
                  <rect x={cx - 26} y={152 - fh} width={24} height={fh} rx={5} fill="#15151A" />
                  <rect x={cx + 2} y={152 - gh} width={24} height={gh} rx={5} fill="#D8D6CF" />
                  <text x={cx} y={171} textAnchor="middle" fontSize={11} fill="#9A9A93" fontFamily="Hanken Grotesk">
                    {d.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Métodos de pago */}
        <div className="card" style={{ borderRadius: "var(--radius-5xl)", padding: "22px" }}>
          <div className="section-title">Métodos de pago</div>
          <div style={{ fontSize: "var(--text-base)", color: "var(--text-muted)", marginTop: 2, marginBottom: 18 }}>
            Distribución del período
          </div>
          {dbData.payMethods.map((p: any, i: number) => (
            <div key={i} style={{ marginBottom: 15 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: "var(--text-md)", color: "var(--text-secondary)", fontWeight: 500 }}>{p.name}</span>
                <span style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>{p.pct}%</span>
              </div>
              <div style={{ height: 8, background: "var(--bg-subtle)", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${p.pct}%`, background: p.color, borderRadius: 5 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid-4 mb-16">
        {[
          { label: "Inventario a costo", value: f$(dbData.invVal), sub: `${dbData.invUnits ?? 0} und en stock · a precio venta ${f$(dbData.invRetail ?? 0)}` },
          { label: "Cotizaciones abiertas", value: String(dbData.cotAbiertas), sub: "por convertir en venta" },
          { label: "Despachos pendientes", value: String(dbData.despPend), sub: "por enviar" },
          { label: "Devoluciones del mes", value: String(dbData.devolTotal), sub: `${dbData.devolPend} pendiente de procesar` },
        ].map((k, i) => (
          <div key={i} className="card card-compact">
            <div className="section-label" style={{ fontSize: "var(--text-xs2)" }}>{k.label}</div>
            <div className="kpi-value-compact" style={{ marginTop: 6, overflowWrap: "anywhere" }}>
              {k.value}
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: 2, overflowWrap: "anywhere" }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Stock bajo + Top productos */}
      <div className="grid-2 mb-16">
        {/* Stock bajo */}
        <div className="card" style={{ borderRadius: "var(--radius-5xl)", padding: "22px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div className="section-title">Stock crítico / bajo</div>
            <button style={{ fontSize: "var(--text-base)", color: "var(--text-tertiary)", fontWeight: 600 }} onClick={() => window.location.href = "/inventario"}>Ver inventario →</button>
          </div>
          {dbData.lowSkus.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
              No hay SKUs con stock bajo. ¡Buen trabajo!
            </div>
          ) : (
            dbData.lowSkus.map((s: any, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: "1px solid var(--border-light)" }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "#f0f0ec", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "#9A9A93" }}>
                    {s.codigo.split("-")[0]}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-base2)", fontWeight: 500 }}>{s.codigo}</div>
                  <div style={{ fontSize: "var(--text-base)", color: "var(--text-muted)" }}>{s.modelo} · {s.color}</div>
                </div>
                <span className={`badge ${s.stock === 0 ? "badge-danger" : "badge-warning"}`}>
                  {s.stock} und
                </span>
              </div>
            ))
          )}
        </div>

        {/* Top productos */}
        <div className="card" style={{ borderRadius: "var(--radius-5xl)", padding: "22px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div className="section-title">Top productos</div>
            <span style={{ fontSize: "var(--text-base)", color: "var(--text-muted)" }}>Por unidades vendidas</span>
          </div>
          {dbData.topProducts.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
              Ningún producto vendido en este período.
            </div>
          ) : (
            dbData.topProducts.map((t: any, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 13, padding: "11px 0", borderTop: "1px solid var(--border-light)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-md)", color: "#B7B7AF", width: 18 }}>{t.rank}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>{t.nombre}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm2)", color: "var(--text-muted)" }}>{t.codigo}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "var(--text-md)", fontWeight: 700 }}>{t.unidades} und</div>
                  <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)" }}>{f$(t.monto)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Activity + Tasa panel */}
      <div className="grid-chart">
        {/* Actividad reciente */}
        <div className="card" style={{ borderRadius: "var(--radius-5xl)", padding: "22px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div className="section-title">Actividad reciente</div>
            <span style={{ fontSize: "var(--text-base)", color: "var(--text-muted)" }}>Últimos movimientos</span>
          </div>
          {dbData.activity.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
              No se ha registrado actividad reciente.
            </div>
          ) : (
            dbData.activity.map((a: any, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--border-light)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", flex: "none", background: a.dot }} />
                <span style={{ flex: 1, fontSize: "var(--text-md)", color: "var(--text-secondary)" }}>{a.txt}</span>
                <span style={{ fontSize: "var(--text-base2)", fontWeight: 700 }}>{a.monto}</span>
                <span style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", width: 62, textAlign: "right" }}>{a.fecha}</span>
              </div>
            ))
          )}
        </div>

        {/* Tasa & conversión */}
        <div className="card card-dark" style={{ borderRadius: "var(--radius-5xl)", padding: "22px", display: "flex", flexDirection: "column" }}>
          <div className="section-title">Tasa &amp; conversión</div>
          <div style={{ fontSize: "var(--text-base)", color: "var(--text-sidebar-inactive)", marginTop: 2, marginBottom: 16 }}>
            Hoy · Bs por USD
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" }}>
              {rates.paralelo.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
            </span>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--success-light)", background: "rgba(70,194,142,.14)", borderRadius: 6, padding: "3px 8px" }}>
              Paralelo
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, color: "var(--text-sidebar-inactive)" }}>
              {rates.bcv.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
            </span>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-sidebar-muted)" }}>BCV oficial</span>
          </div>
          <svg width="100%" height="20" viewBox="0 0 300 20" preserveAspectRatio="none" style={{ marginTop: 16 }}>
            <path d="M0 10 H110 L120 3 L132 17 L140 7 L146 10 H300" fill="none" stroke="#46C28E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ marginTop: "auto", paddingTop: 14, fontSize: "var(--text-base)", color: "var(--text-sidebar-inactive)" }}>
            Diferencial paralelo vs BCV: <span style={{ color: "#fff", fontWeight: 700 }}>{diferencial}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
