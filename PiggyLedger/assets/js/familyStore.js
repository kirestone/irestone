/**
 * familyStore.js
 * ------------------------------------------------------------
 * All Firestore data access for PiggyLedger, written as a single
 * dependency-injected factory. It never imports the Firebase SDK
 * itself — the caller hands in the exact Firestore functions to use.
 *
 * Why: the production site loads the Firebase SDK straight from
 * Google's CDN (no build step, so it works from a plain GitHub Pages
 * checkout). Test code instead loads the SDK from the npm package and
 * points it at the local Firestore emulator. Because this module only
 * ever touches the functions it's handed, the exact same business
 * logic — the part worth testing — runs identically in both places.
 *
 * See assets/js/firebaseConfig.js for the browser wiring, and
 * tests/familyStore.test.mjs for the emulator-backed test wiring.
 * ------------------------------------------------------------
 */
import { computeAllowanceCatchUp, computeInterestCatchUp } from './financeEngine.js';

/**
 * @param {object} deps - Firestore SDK functions/instance, injected.
 * @param {import('firebase/firestore').Firestore} deps.db
 * @param {Function} deps.collection
 * @param {Function} deps.doc
 * @param {Function} deps.getDoc
 * @param {Function} deps.getDocs
 * @param {Function} deps.setDoc
 * @param {Function} deps.updateDoc
 * @param {Function} deps.deleteDoc
 * @param {Function} deps.addDoc
 * @param {Function} deps.query
 * @param {Function} deps.orderBy
 * @param {Function} deps.onSnapshot
 * @param {Function} deps.runTransaction
 * @param {Function} deps.serverTimestamp
 * @param {Function} deps.Timestamp - class with .now() / .fromDate()
 * @param {string} deps.familyId
 */
export function createFamilyStore(deps) {
  const {
    db,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    addDoc,
    query,
    orderBy,
    onSnapshot,
    runTransaction,
    serverTimestamp,
    Timestamp,
    familyId,
  } = deps;

  if (!familyId || familyId.length < 20) {
    throw new Error(
      'familyId must be a randomly generated string of at least 20 characters. ' +
        'See docs/SETUP.md step 3 to generate one.'
    );
  }

  const familyRef = () => doc(db, 'families', familyId);
  const kidsCol = () => collection(db, 'families', familyId, 'kids');
  const kidRef = (kidId) => doc(db, 'families', familyId, 'kids', kidId);
  const txCol = (kidId) => collection(db, 'families', familyId, 'kids', kidId, 'transactions');

  const toDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    return new Date(value);
  };

  // ---- Family (household) ---------------------------------------------

  async function ensureFamily(defaults = { name: 'Our Family', pinEnabled: false, pinHash: null }) {
    const snap = await getDoc(familyRef());
    if (snap.exists()) return { id: snap.id, ...snap.data() };
    const payload = { ...defaults, createdAt: serverTimestamp() };
    await setDoc(familyRef(), payload);
    const fresh = await getDoc(familyRef());
    return { id: fresh.id, ...fresh.data() };
  }

  async function getFamily() {
    const snap = await getDoc(familyRef());
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  async function updateFamilySettings(patch) {
    await updateDoc(familyRef(), patch);
  }

  // ---- Kids -------------------------------------------------------------

  function kidDefaults(overrides = {}) {
    return {
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
      createdAt: serverTimestamp(),
      ...overrides,
    };
  }

  async function addKid(overrides = {}) {
    const ref = await addDoc(kidsCol(), kidDefaults(overrides));
    return ref.id;
  }

  async function getKid(kidId) {
    const snap = await getDoc(kidRef(kidId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  async function listKids() {
    const snap = await getDocs(kidsCol());
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async function updateKidSettings(kidId, patch) {
    await updateDoc(kidRef(kidId), patch);
  }

  async function deleteKid(kidId) {
    await deleteDoc(kidRef(kidId));
  }

  function subscribeToKids(onChange) {
    return onSnapshot(kidsCol(), (snap) => {
      onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }

  function subscribeToKid(kidId, onChange) {
    return onSnapshot(kidRef(kidId), (snap) => {
      onChange(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
  }

  // ---- Transactions -------------------------------------------------------

  /**
   * Records a manual transaction (parent deposit, spend/withdrawal, or
   * one-off adjustment) and atomically updates the kid's balance.
   * @param {string} kidId
   * @param {{ type: string, amountCents: number, note?: string }} entry
   *   amountCents should be positive for money added, negative for money spent/removed.
   */
  async function recordTransaction(kidId, entry) {
    return runTransaction(db, async (tx) => {
      const kidSnap = await tx.get(kidRef(kidId));
      if (!kidSnap.exists()) throw new Error('Kid not found');
      const kid = kidSnap.data();
      const newBalance = (kid.balanceCents ?? 0) + entry.amountCents;
      const txRef = doc(txCol(kidId));
      tx.set(txRef, {
        type: entry.type,
        amountCents: entry.amountCents,
        note: entry.note ?? '',
        balanceAfterCents: newBalance,
        createdAt: entry.createdAt ?? serverTimestamp(),
        createdBy: entry.createdBy ?? 'parent',
      });
      tx.update(kidRef(kidId), { balanceCents: newBalance });
      return { id: txRef.id, balanceAfterCents: newBalance };
    });
  }

  async function listTransactions(kidId, { limit: max } = {}) {
    const snap = await getDocs(query(txCol(kidId), orderBy('createdAt', 'desc')));
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return typeof max === 'number' ? rows.slice(0, max) : rows;
  }

  function subscribeToTransactions(kidId, onChange, { limit: max } = {}) {
    return onSnapshot(query(txCol(kidId), orderBy('createdAt', 'desc')), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onChange(typeof max === 'number' ? rows.slice(0, max) : rows);
    });
  }

  // ---- Automated catch-up (allowance + interest) ---------------------------

  /**
   * Call whenever a parent or kid page loads for a given kid. Lazily posts
   * any allowance payments and interest accrual that are due, bringing the
   * kid's ledger up to date with "now" — this is how scheduling works on a
   * site with no server-side cron. Safe to call often; it's a no-op if
   * nothing is due yet.
   */
  async function runCatchUp(kidId, now = new Date()) {
    const kid = await getKid(kidId);
    if (!kid) return { applied: false };

    const normalizedKid = {
      ...kid,
      lastAllowanceRunAt: toDate(kid.lastAllowanceRunAt),
      lastInterestRunAt: toDate(kid.lastInterestRunAt),
      createdAt: toDate(kid.createdAt) ?? now,
    };

    const allowance = computeAllowanceCatchUp(normalizedKid, now);
    let appliedAny = false;

    for (const payment of allowance.transactions) {
      await recordTransaction(kidId, {
        type: 'allowance',
        amountCents: payment.amountCents,
        note: payment.note,
        createdAt: Timestamp.fromDate(payment.date),
        createdBy: 'system',
      });
      appliedAny = true;
    }
    if (allowance.transactions.length > 0) {
      await updateKidSettings(kidId, { lastAllowanceRunAt: Timestamp.fromDate(allowance.newLastRunAt) });
    }

    // Re-fetch balance in case allowance was just applied, so interest
    // calculations below use the up-to-date figure.
    const refreshedKid = allowance.transactions.length > 0 ? await getKid(kidId) : kid;
    const interestInput = {
      ...refreshedKid,
      lastInterestRunAt: normalizedKid.lastInterestRunAt,
      createdAt: normalizedKid.createdAt,
    };
    const interest = computeInterestCatchUp(interestInput, now);
    if (interest.transaction) {
      await recordTransaction(kidId, {
        type: 'interest',
        amountCents: interest.transaction.amountCents,
        note: interest.transaction.note,
        createdAt: Timestamp.fromDate(interest.transaction.date),
        createdBy: 'system',
      });
      appliedAny = true;
    }
    if (interest.transaction || allowance.transactions.length > 0) {
      await updateKidSettings(kidId, { lastInterestRunAt: Timestamp.fromDate(interest.newLastRunAt) });
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
