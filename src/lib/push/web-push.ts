// Minimal Web Push (RFC 8030 + VAPID RFC 8292) sender, implemented with Web
// Crypto so it runs on the Cloudflare Worker runtime (the `web-push` npm package
// depends on Node crypto and does not run on workerd).
//
// v1 sends NO payload (a "tickle"): the push event carries no data and the
// service worker shows a fixed message. This avoids the aes128gcm payload
// encryption of RFC 8291 entirely, which keeps delivery robust. To include
// dynamic data (amount, customer) later, add RFC 8291 encryption here.
import { VAPID_PUBLIC_KEY, VAPID_SUBJECT } from "./config";

export type PushSubscriptionRecord = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

function b64urlToBytes(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(input: Uint8Array | ArrayBuffer): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Build a signing key from the raw VAPID keypair (public point + private scalar).
async function importVapidKey(privateKeyB64url: string): Promise<CryptoKey> {
  const pub = b64urlToBytes(VAPID_PUBLIC_KEY); // 65 bytes: 0x04 || X(32) || Y(32)
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: privateKeyB64url,
    ext: true,
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function buildVapidJwt(audience: string, privateKeyB64url: string): Promise<string> {
  const enc = new TextEncoder();
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(
    enc.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12h, max allowed is 24h
        sub: VAPID_SUBJECT,
      })
    )
  );
  const signingInput = `${header}.${payload}`;
  const key = await importVapidKey(privateKeyB64url);
  // Web Crypto ECDSA returns the IEEE P1363 raw r||s signature ES256/JWT expects.
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signingInput));
  return `${signingInput}.${bytesToB64url(signature)}`;
}

export type WebPushResult = { ok: boolean; status: number; gone: boolean };

/**
 * Send a no-payload push to one subscription. `gone` is true for 404/410, which
 * means the subscription is dead and the caller should delete it.
 */
export async function sendWebPush(
  subscription: PushSubscriptionRecord,
  privateKeyB64url: string,
  options?: { ttl?: number }
): Promise<WebPushResult> {
  const audience = new URL(subscription.endpoint).origin;
  const jwt = await buildVapidJwt(audience, privateKeyB64url);

  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      TTL: String(options?.ttl ?? 86400),
      Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
    },
  });

  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}
