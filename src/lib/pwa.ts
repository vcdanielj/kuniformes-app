/**
 * Shared PWA install state.
 *
 * `beforeinstallprompt` fires once, early, and only on Android / desktop
 * Chromium — never on iOS Safari. Because it can fire before a given component
 * (e.g. the Configuración install button) mounts, we capture it once at module
 * load and expose it through a tiny pub/sub store so any component can read the
 * latest state regardless of mount timing.
 */

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const cb of listeners) cb();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Stop Chrome's mini-infobar so we can surface install on our own UI.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

/** Subscribe to install-state changes. Returns an unsubscribe function. */
export function subscribePwa(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Fire the native install prompt (Android / desktop Chromium only). */
export async function triggerInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredPrompt) return "unavailable";
  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  notify();
  return choice.outcome;
}

/** True when the app is already running as an installed PWA. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const navStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia("(display-mode: standalone)").matches || navStandalone === true;
}

/** True on iPhone/iPad Safari, where install is manual (Share → Add to Home). */
export function isIOSSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  const isIOS = /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ reports as Mac; detect touch to disambiguate.
    (/macintosh/i.test(ua) && "ontouchend" in document);
  return isIOS && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
}
