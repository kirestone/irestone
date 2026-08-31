/**
 * localStore.js
 * ------------------------------------------------------------
 * Demo-mode data layer with the exact same method names/shapes as
 * familyStore.js, backed by safeStorage instead of Firestore.
 *
 * This is used automatically whenever assets/js/firebaseConfig.js
 * hasn't been filled in with a real Firebase project yet, so you (and
 * anyone previewing this app) can click around with realistic sample
 * data before setting anything up. Because it implements the same
 * interface as the Firestore-backed store, parent.js/kid.js/home.js
 * never need to know which one they're talking to.
 *
 * Limitations vs. the real store (documented for clarity, not hidden):
 *  - Data lives only in this browser (no cross-device sync)
 *  - subscribeTo* functions notify same-tab listeners only
 * ------------------------------------------------------------
 */
import { computeAllowanceCatchUp, computeInterestCatchUp } from './financeEngine.js';
import { safeLocal } from './safeStorage.js';

const STORAGE_KEY = 'piggyledger_demo_data_v1';
const listeners = new Map(); // key -> Set<fn>

function emptyState() {
  return {
    family: { name: 'Our Family', pinEnabled: false, pinHash: null, createdAt: new Date().toISOString() },
    kids: {},
    transactions: {},
    nextKidSeq: 1,
    nextTxSeq: 1,
  };
}

function load() {
  const raw = safeLocal?.getItem(STORAGE_KEY);
  if (!raw) return emptyState();
  try {
    return JSON.parse(raw);
  } catch (_err) {
    return emptyState();
  }
}

function save(state) {
  safeLocal?.setItem(STORAGE_KEY, JSON.stringify(state));
  notify('kids', Object.values(state.kids));
  for (const kidId of Object.keys(state.kids)) {
    notify(`kid:${kidId}`, state.kids[kidId] ?? null);
    notify(`tx:${kidId}`, (state.transactions[kidId] ?? []).slice().sort(txSortDesc));
  }
}

function txSortDesc(a, b) {
  return b.createdAtMs - a.createdAtMs || b.seq - a.seq;
}

function notify(key, payload) {
  for (const fn of listeners.get(key) ?? []) fn(payload);
}

function subscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key)?.delete(fn);
}

function reviveDates(kid) {
  return {
    ...kid,
    createdAt: kid.createdAt ? new Date(kid.createdAt) : null,
    lastAllowanceRunAt: kid.lastAllowanceRunAt ? new Date(kid.lastAllowanceRunAt) : null,
    lastInterestRunAt: kid.lastInterestRunAt ? new Date(kid.lastInterestRunAt) : null,
  };
}

export function createLocalStore() {
  async function ensureFamily(defaults) {
    const state = load();
    if (!state.family || Object.keys(state.kids).length === 0 && !safeLocal?.getItem(STORAGE_KEY)) {
      state.family = { ...emptyState().family, ...defaults };
      save(state);
    }
    return state.family;
  }

  async function getFamily() {
    return load().family;
  }

  async function updateFamilySettings(patch) {
    const state = load();
    state.family = { ...state.family, ...patch };
    save(state);
  }

  async function addKid(overrides = {}) {
    const state = load();
    const kidId = `kid_${state.nextKidSeq++}`;
    state.kids[kidId] = {
      id: kidId,
      name: 'New Kid',
      emoji: '🧒',
      color: '#5B5FEF',
      balanceCents: 0,
      interestRateAnnualPct: 0,
      allowanceEnabled: false,
      allowanceAmountCents: 0,
      allowanceFrequency: 'weekly',
      lastAllowanceRunAt: null,
      lastInterestRunAt: null,
      createdAt: new Date().toISOString(),
      ...overrides,
    };
    state.transactions[kidId] = [];
    save(state);
    return kidId;
  }

  async function getKid(kidId) {
    const state = load();
    return state.kids[kidId] ? { ...state.kids[kidId] } : null;
  }

  async function listKids() {
    return Object.values(load().kids);
  }

  async function updateKidSettings(kidId, patch) {
    const state = load();
    if (!state.kids[kidId]) return;
    const normalizedPatch = { ...patch };
    for (const dateField of ['lastAllowanceRunAt', 'lastInterestRunAt']) {
      if (normalizedPatch[dateField] instanceof Date) {
        normalizedPatch[dateField] = normalizedPatch[dateField].toISOString();
      }
    }
    state.kids[kidId] = { ...state.kids[kidId], ...normalizedPatch };
    save(state);
  }

  async function deleteKid(kidId) {
    const state = load();
    delete state.kids[kidId];
    delete state.transactions[kidId];
    save(state);
  }

  function subscribeToKids(onChange) {
    onChange(Object.values(load().kids));
    return subscribe('kids', onChange);
  }

  function subscribeToKid(kidId, onChange) {
    onChange(load().kids[kidId] ?? null);
    return subscribe(`kid:${kidId}`, onChange);
  }

  async function recordTransaction(kidId, entry) {
    const state = load();
    const kid = state.kids[kidId];
    if (!kid) throw new Error('Kid not found');
    const newBalance = (kid.balanceCents ?? 0) + entry.amountCents;
    const seq = state.nextTxSeq++;
    const txId = `tx_${seq}`;
    const createdAt = entry.createdAt instanceof Date ? entry.createdAt : new Date();
    const tx = {
      id: txId,
      type: entry.type,
      amountCents: entry.amountCents,
      note: entry.note ?? '',
      balanceAfterCents: newBalance,
      createdAt: createdAt.toISOString(),
      createdAtMs: createdAt.getTime(),
      seq,
      createdBy: entry.createdBy ?? 'parent',
    };
    state.transactions[kidId] = [...(state.transactions[kidId] ?? []), tx];
    state.kids[kidId] = { ...kid, balanceCents: newBalance };
    save(state);
    return { id: txId, balanceAfterCents: newBalance };
  }

  async function listTransactions(kidId, { limit: max } = {}) {
    const rows = (load().transactions[kidId] ?? []).slice().sort(txSortDesc);
    return typeof max === 'number' ? rows.slice(0, max) : rows;
  }

  function subscribeToTransactions(kidId, onChange, { limit: max } = {}) {
    const initial = (load().transactions[kidId] ?? []).slice().sort(txSortDesc);
    onChange(typeof max === 'number' ? initial.slice(0, max) : initial);
    return subscribe(`tx:${kidId}`, (rows) => onChange(typeof max === 'number' ? rows.slice(0, max) : rows));
  }

  async function runCatchUp(kidId, now = new Date()) {
    const kid = await getKid(kidId);
    if (!kid) return { applied: false };
    const normalizedKid = reviveDates(kid);

    const allowance = computeAllowanceCatchUp(normalizedKid, now);
    let appliedAny = false;
    for (const payment of allowance.transactions) {
      await recordTransaction(kidId, {
        type: 'allowance',
        amountCents: payment.amountCents,
        note: payment.note,
        createdAt: payment.date,
        createdBy: 'system',
      });
      appliedAny = true;
    }
    if (allowance.transactions.length > 0) {
      await updateKidSettings(kidId, { lastAllowanceRunAt: allowance.newLastRunAt });
    }

    const refreshed = allowance.transactions.length > 0 ? await getKid(kidId) : kid;
    const interest = computeInterestCatchUp(
      { ...reviveDates(refreshed), lastInterestRunAt: normalizedKid.lastInterestRunAt, createdAt: normalizedKid.createdAt },
      now
    );
    if (interest.transaction) {
      await recordTransaction(kidId, {
        type: 'interest',
        amountCents: interest.transaction.amountCents,
        note: interest.transaction.note,
        createdAt: interest.transaction.date,
        createdBy: 'system',
      });
      appliedAny = true;
    }
    if (interest.transaction || allowance.transactions.length > 0) {
      await updateKidSettings(kidId, { lastInterestRunAt: interest.newLastRunAt });
    }
    return { applied: appliedAny };
  }

  return {
    ensureFamily,
    getFamily,
    updateFamilySettings,
    addKid,
    getKid,
    listKids,
    updateKidSettings,
    deleteKid,
    subscribeToKids,
    subscribeToKid,
    recordTransaction,
    listTransactions,
    subscribeToTransactions,
    runCatchUp,
  };
}
