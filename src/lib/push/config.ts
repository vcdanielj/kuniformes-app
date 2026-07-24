// VAPID public key — safe to expose to clients (used by PushManager.subscribe
// and as the `k=` value in the Authorization header). The matching PRIVATE key
// lives only as a Cloudflare Worker secret (env.VAPID_PRIVATE_KEY).
export const VAPID_PUBLIC_KEY =
  "BFjCYLFVmgyQqi14D6vKNsXVirkveHDWcgP672zxpILgHrE-pDWiIqbxLGff6a45yfpKXfBMURnp48Hs9BQdDJ4";

// Must be a mailto: or https: URL per the VAPID spec (RFC 8292) — push services
// use it to contact the sender about delivery problems.
export const VAPID_SUBJECT = "mailto:sinapxi@sinapxi.com";
