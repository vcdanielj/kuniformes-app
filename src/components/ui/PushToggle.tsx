"use client";

import { useCallback, useEffect, useState } from "react";
import { savePushSubscription, removePushSubscription } from "@/lib/db/actions";
import { VAPID_PUBLIC_KEY } from "@/lib/push/config";

type PushState = "loading" | "unsupported" | "default" | "enabled" | "denied" | "busy";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function isSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function PushToggle() {
  const [state, setState] = useState<PushState>("loading");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!isSupported()) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "enabled" : "default");
    } catch {
      setState("default");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    setError("");
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "default");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("La suscripción del navegador es inválida.");
      }
      const res = await savePushSubscription({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      if (!res.success) throw new Error(res.error || "No se pudo guardar la suscripción.");
      setState("enabled");
    } catch (e: any) {
      setError(e?.message || "No se pudieron activar las notificaciones.");
      await refresh();
    }
  }, [refresh]);

  const disable = useCallback(async () => {
    setError("");
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("default");
    } catch (e: any) {
      setError(e?.message || "No se pudieron desactivar las notificaciones.");
      await refresh();
    }
  }, [refresh]);

  return (
    <div className="card" style={{ borderRadius: "var(--radius-4xl)", padding: 16, marginBottom: 18, background: "var(--bg-subtle)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div className="section-label" style={{ marginBottom: 4 }}>Notificaciones push</div>
          <div style={{ fontSize: "var(--text-sm2)", color: "var(--text-muted)", lineHeight: 1.4 }}>
            Recibe un aviso en este dispositivo cada vez que se registre una nueva venta.
            {state === "unsupported" && " Este navegador no soporta notificaciones push."}
            {state === "denied" && " Permiso bloqueado: actívalo en los ajustes del navegador/sitio."}
          </div>
          {error ? (
            <div style={{ fontSize: "var(--text-sm2)", color: "var(--danger)", marginTop: 6 }}>{error}</div>
          ) : null}
        </div>
        <div style={{ flex: "none" }}>
          {state === "loading" || state === "busy" ? (
            <button className="btn btn-secondary btn-sm" disabled>
              {state === "busy" ? "Procesando…" : "…"}
            </button>
          ) : state === "enabled" ? (
            <button className="btn btn-secondary btn-sm" onClick={disable}>
              Desactivar
            </button>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              onClick={enable}
              disabled={state === "unsupported" || state === "denied"}
            >
              Activar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
