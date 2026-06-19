/**
 * K-Uniformes — Password Hashing using Web Crypto API (PBKDF2)
 * Secure, light, and 100% compatible with Cloudflare Workers & Node.js.
 */

function getWebCrypto() {
  if (typeof globalThis.crypto === "undefined") {
    throw new Error("Web Crypto API no disponible en este entorno.");
  }

  return globalThis.crypto;
}

const ITERATIONS = 100000;
const HASH_ALGO = "SHA-256";

export async function hashPassword(password: string): Promise<string> {
  const webCrypto = getWebCrypto();
  const salt = webCrypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const passwordKey = await webCrypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await webCrypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: ITERATIONS,
      hash: HASH_ALGO,
    },
    passwordKey,
    256 // 32 bytes hash
  );

  // Convert array buffers to hex strings
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const hashHex = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const webCrypto = getWebCrypto();
    const parts = stored.split(":");
    if (parts.length !== 2) return false;
    const [saltHex, hashHex] = parts;

    const salt = new Uint8Array(
      saltHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    const encoder = new TextEncoder();
    const passwordKey = await webCrypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const derivedBits = await webCrypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: ITERATIONS,
        hash: HASH_ALGO,
      },
      passwordKey,
      256
    );

    const verifyHex = Array.from(new Uint8Array(derivedBits))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return verifyHex === hashHex;
  } catch (e) {
    console.error("Password verification error:", e);
    return false;
  }
}
