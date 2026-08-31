/**
 * pinAuth.js
 * ------------------------------------------------------------
 * Lightweight PIN gate for the parent dashboard. This is a
 * convenience lock (keeps curious kids from tapping into the
 * parent view on a shared tablet) — it is NOT a security boundary
 * against a determined third party, since the underlying Firestore
 * data has no server-side auth check in the no-login model. See
 * docs/SETUP.md -> "Understanding the security model" for details.
 *
 * Uses the Web Crypto API (SHA-256), available in every modern
 * browser and in Node, so this module tests the same way everywhere.
 * ------------------------------------------------------------
 */

const cryptoObj = typeof globalThis !== 'undefined' && globalThis.crypto ? globalThis.crypto : null;

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashPin(pin) {
  if (!cryptoObj?.subtle) throw new Error('Web Crypto API is not available in this environment');
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error('PIN must be 4-8 digits');
  }
  const data = new TextEncoder().encode(`piggyledger:${pin}`);
  const digest = await cryptoObj.subtle.digest('SHA-256', data);
  return toHex(digest);
}

export async function verifyPin(pin, storedHash) {
  if (!storedHash) return false;
  try {
    const candidate = await hashPin(pin);
    return candidate === storedHash;
  } catch (_err) {
    return false;
  }
}

export function isValidPinFormat(pin) {
  return /^\d{4,8}$/.test(pin);
}
