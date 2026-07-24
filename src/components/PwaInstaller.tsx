"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getDeferredPrompt,
  isIOSSafari,
  isStandalone,
  subscribePwa,
  triggerInstall,
} from "@/lib/pwa";

const DISMISS_KEY = "pwa-install-dismissed";

export function PwaInstaller() {
  const [hasPrompt, setHasPrompt] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const show = !dismissed && (hasPrompt || iosHint);

  // Reserve bottom space on the page only while the banner is actually visible.
  useEffect(() => {
    document.body.classList.toggle("pwa-banner-visible", show);
    return () => document.body.classList.remove("pwa-banner-visible");
  }, [show]);

  useEffect(() => {
    // Register the service worker (required for installability + offline assets).
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // Already installed or previously dismissed → never show the banner.
    if (isStandalone() || localStorage.getItem(DISMISS_KEY) === "1") return;

    // Track install availability. iOS Safari never fires beforeinstallprompt,
    // so it falls back to the manual "Add to Home" hint.
    const sync = () => {
      setHasPrompt(getDeferredPrompt() !== null);
      setIosHint(isIOSSafari());
    };
    sync();
    return subscribePwa(sync);
  }, []);

  const handleInstall = useCallback(async () => {
    const outcome = await triggerInstall();
    if (outcome !== "unavailable") {
      setDismissed(true);
      if (outcome === "accepted") localStorage.setItem(DISMISS_KEY, "1");
    }
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }, []);

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Instalar K-Uniformes"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 38,
        display: "flex",
        justifyContent: "center",
        padding: "12px max(12px, env(safe-area-inset-left)) calc(12px + env(safe-area-inset-bottom))",
        pointerEvents: "none",
      }}
    >
      <div
        className="animate-pop-in"
        style={{
          pointerEvents: "auto",
          maxWidth: 540,
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "#15151A",
          color: "#fff",
          borderRadius: 16,
          padding: "12px 14px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.38)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192.png"
          width={42}
          height={42}
          alt=""
          style={{ borderRadius: 10, background: "#fff", flex: "none" }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Instala K-Uniformes</div>
          <div style={{ fontSize: 12, color: "#b9b9c2", lineHeight: 1.35 }}>
            {iosHint
              ? "Toca Compartir y luego «Añadir a pantalla de inicio»."
              : "Acceso rápido como app, sin abrir el navegador."}
          </div>
        </div>
        {!iosHint && (
          <button
            type="button"
            onClick={handleInstall}
            style={{
              flex: "none",
              background: "#fff",
              color: "#15151A",
              border: "none",
              borderRadius: 10,
              padding: "9px 16px",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Instalar
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar"
          style={{
            flex: "none",
            background: "transparent",
            color: "#9a9aa4",
            border: "none",
            fontSize: 22,
            lineHeight: 1,
            cursor: "pointer",
            padding: "0 4px",
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
