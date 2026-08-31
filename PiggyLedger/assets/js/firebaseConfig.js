/**
 * firebaseConfig.js
 * ------------------------------------------------------------
 * EDIT THIS FILE as step 4 of docs/SETUP.md.
 *
 * Fill in your own Firebase project's web config below and set a
 * unique, random FAMILY_ID (20+ characters). Until you do, the app
 * automatically runs in DEMO MODE — fully functional, but data stays
 * in this one browser only (see assets/js/localStore.js).
 *
 * Nothing in this file is a secret. Firebase web API keys are safe to
 * publish — real protection comes from firestore.rules (see docs).
 * ------------------------------------------------------------
 */

export const FIREBASE_CONFIG = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.appspot.com',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
};

// Generate one with the "Generate a Family ID" button in docs/SETUP.md,
// or run: crypto.randomUUID() in any browser console.
export const FAMILY_ID = 'REPLACE_ME_WITH_A_LONG_RANDOM_ID';

export function isConfigured() {
  return (
    FIREBASE_CONFIG.apiKey !== 'REPLACE_ME' &&
    FIREBASE_CONFIG.projectId !== 'REPLACE_ME' &&
    FAMILY_ID !== 'REPLACE_ME_WITH_A_LONG_RANDOM_ID' &&
    FAMILY_ID.length >= 20
  );
}

/**
 * Returns a ready-to-use data store with the shared familyStore API,
 * backed by real Firestore if configured, or by the local demo store
 * otherwise. This is the ONLY place page scripts should get their
 * store from — they never need to know which backend is active.
 */
export async function getStore() {
  if (!isConfigured()) {
    const { createLocalStore } = await import('./localStore.js');
    return { store: createLocalStore(), mode: 'demo' };
  }

  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
  const {
    getFirestore,
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
  } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
  const { createFamilyStore } = await import('./familyStore.js');

  const app = initializeApp(FIREBASE_CONFIG);
  const db = getFirestore(app);

  const store = createFamilyStore({
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
    familyId: FAMILY_ID,
  });

  return { store, mode: 'live' };
}
