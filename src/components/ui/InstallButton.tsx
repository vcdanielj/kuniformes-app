"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getDeferredPrompt,
  isIOSSafari,
  isStandalone,
  subscribePwa,
  triggerInstall,
} from "@/lib/pwa";

type Mode = "loading" | "installed" | "prompt" | "ios" | "manual";

export function InstallButton() {
  const [mode, setMode] = useState<Mode>("loading");
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    const sync = () => {
      if (isStandalone()) return setMode("installed");
      if (getDeferredPrompt()) return setMode("prompt");
      if (isIOSSafari()) return setMode("ios");
      return setMode("manual");
    };
    sync();
    // The native prompt can arrive after mount → react to it.
    return subscribePwa(sync);
  }, []);

  const install = useCallback(async () => {
    const outcome = await triggerInstall();
    if (outcome === "accepted") setMode("installed");
  }, []);

  if (mode === "loading") return null;

  const description =
    mode === "installed"
      ? "Ya está instalada en este dispositivo."
      : mode === "prompt"
        ? "Instálala para abrirla como app, a pantalla completa y sin el navegador."
        : mode === "ios"
          ? "En iPhone/iPad se agrega desde Safari con el botón Compartir."
          : "Desde el menú de tu navegador elige «Instalar app» o «Añadir a pantalla de inicio».";

  return (
    <div
      className="card"
      style={{ borderRadius: "var(--radius-4xl)", padding: 16, marginBottom: 18, background: "var(--bg-subtle)" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div className="section-label" style={{ marginBottom: 4 }}>Instalar app</div>
          <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", lineHeight: 1.4 }}>
            {description}
          </div>
          {mode === "ios" && showIosSteps ? (
            <ol
              style={{
                margin: "8px 0 0",
                paddingLeft: 18,
                fontSize: "var(--text-sm2)",
                color: "var(--text-muted)",
                lineHeight: 1.5,
              }}
            >
              <li>Toca el botón <strong>Compartir</strong> (el cuadro con la flecha hacia arriba).</li>
              <li>Elige <strong>«Añadir a pantalla de inicio»</strong>.</li>
              <li>Confirma con <strong>Añadir</strong>.</li>
            </ol>
          ) : null}
        </div>
        <div style={{ flex: "none" }}>
          {mode === "installed" ? (
            <span className="badge badge-success" style={{ whiteSpace: "nowrap" }}>Instalada ✓</span>
          ) : mode === "prompt" ? (
            <button className="btn btn-primary btn-sm" onClick={install}>Instalar</button>
          ) : mode === "ios" ? (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowIosSteps((v) => !v)}>
              {showIosSteps ? "Ocultar" : "Cómo instalar"}
            </button>
          ) : (
            <button className="btn btn-secondary btn-sm" disabled>Desde el navegador</button>
          )}
        </div>
      </div>
    </div>
  );
}
