/**
 * safeStorage.js
 * ------------------------------------------------------------
 * A tiny sessionStorage/localStorage wrapper that never throws.
 * Some embedded/sandboxed browser contexts (and some kiosk-mode
 * tablet browsers) block Web Storage entirely — this falls back
 * to an in-memory Map so the app keeps working, just without
 * persistence across page reloads in that one edge case.
 * ------------------------------------------------------------
 */

function makeSafeStorage(kind) {
  const memoryFallback = new Map();
  let backing = null;
  try {
    const candidate = kind === 'session' ? window.sessionStorage : window.localStorage;
    const testKey = '__piggyledger_test__';
    candidate.setItem(testKey, '1');
    candidate.removeItem(testKey);
    backing = candidate;
  } catch (_err) {
    backing = null;
  }

  return {
    isPersistent: backing !== null,
    getItem(key) {
      if (backing) return backing.getItem(key);
      return memoryFallback.has(key) ? memoryFallback.get(key) : null;
    },
    setItem(key, value) {
      if (backing) {
        backing.setItem(key, value);
        return;
      }
      memoryFallback.set(key, value);
    },
    removeItem(key) {
      if (backing) {
        backing.removeItem(key);
        return;
      }
      memoryFallback.delete(key);
    },
  };
}

export const safeSession = typeof window !== 'undefined' ? makeSafeStorage('session') : null;
export const safeLocal = typeof window !== 'undefined' ? makeSafeStorage('local') : null;
export { makeSafeStorage };
