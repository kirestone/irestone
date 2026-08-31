/**
 * Module test: familyStore.js against a REAL local Firestore emulator.
 * This is a genuine integration test of the data layer in isolation —
 * no UI, no browser — before it's ever wired into parent.html/kid.html.
 *
 * Requires the Firestore emulator running locally:
 *   npm run emulator   (in one terminal, leave it running)
 *   npm run test:store (in another terminal)
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore,
  connectFirestoreEmulator,
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
} from 'firebase/firestore';
import { createFamilyStore } from '../assets/js/familyStore.js';

const TEST_FAMILY_ID = `test-family-${Date.now()}-abcdefgh`; // >= 20 chars

let app;
let db;
let store;

before(() => {
  app = initializeApp({ projectId: 'demo-piggyledger' }, `test-app-${Date.now()}`);
  db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  store = createFamilyStore({
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
    familyId: TEST_FAMILY_ID,
  });
});

after(async () => {
  if (app) await deleteApp(app);
});

test('rejects a familyId shorter than 20 characters', () => {
  assert.throws(() => createFamilyStore({ familyId: 'too-short' }));
});

test('ensureFamily creates the family doc once, then returns it idempotently', async () => {
  const first = await store.ensureFamily({ name: 'The Testers', pinEnabled: false, pinHash: null });
  assert.equal(first.name, 'The Testers');
  const second = await store.ensureFamily({ name: 'Should Not Overwrite' });
  assert.equal(second.name, 'The Testers');
});

let kidId;

test('addKid + getKid round-trip', async () => {
  kidId = await store.addKid({ name: 'Riley', emoji: '🦊', color: '#FF8A5C' });
  const kid = await store.getKid(kidId);
  assert.equal(kid.name, 'Riley');
  assert.equal(kid.balanceCents, 0);
});

test('listKids returns the created kid', async () => {
  const kids = await store.listKids();
  assert.ok(kids.some((k) => k.id === kidId));
});

test('recordTransaction: deposit increases balance', async () => {
  const result = await store.recordTransaction(kidId, { type: 'deposit', amountCents: 1000, note: 'Birthday money' });
  assert.equal(result.balanceAfterCents, 1000);
  const kid = await store.getKid(kidId);
  assert.equal(kid.balanceCents, 1000);
});

test('recordTransaction: withdrawal with a note decreases balance', async () => {
  const result = await store.recordTransaction(kidId, {
    type: 'withdrawal',
    amountCents: -300,
    note: 'Bought a toy dinosaur',
  });
  assert.equal(result.balanceAfterCents, 700);
});

test('listTransactions returns newest first and preserves notes', async () => {
  const txs = await store.listTransactions(kidId);
  assert.equal(txs.length, 2);
  assert.equal(txs[0].type, 'withdrawal');
  assert.equal(txs[0].note, 'Bought a toy dinosaur');
  assert.equal(txs[1].type, 'deposit');
});

test('updateKidSettings can enable allowance + interest', async () => {
  await store.updateKidSettings(kidId, {
    allowanceEnabled: true,
    allowanceAmountCents: 500,
    allowanceFrequency: 'weekly',
    interestRateAnnualPct: 5,
    lastAllowanceRunAt: Timestamp.fromDate(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)),
    lastInterestRunAt: Timestamp.fromDate(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)),
  });
  const kid = await store.getKid(kidId);
  assert.equal(kid.allowanceEnabled, true);
  assert.equal(kid.interestRateAnnualPct, 5);
});

test('runCatchUp posts allowance + interest transactions and updates balance', async () => {
  const before_ = await store.getKid(kidId);
  const result = await store.runCatchUp(kidId, new Date());
  assert.equal(result.applied, true);
  const after_ = await store.getKid(kidId);
  assert.ok(after_.balanceCents > before_.balanceCents);

  const txs = await store.listTransactions(kidId);
  assert.ok(txs.some((t) => t.type === 'allowance'));
  assert.ok(txs.some((t) => t.type === 'interest'));
});

test('runCatchUp is a safe no-op when nothing new is due', async () => {
  const before_ = await store.getKid(kidId);
  const result = await store.runCatchUp(kidId, new Date(Date.now() + 5000)); // 5 seconds later
  const after_ = await store.getKid(kidId);
  assert.equal(result.applied, false);
  assert.equal(after_.balanceCents, before_.balanceCents);
});

test('deleteKid removes the kid document', async () => {
  const tempId = await store.addKid({ name: 'Temp' });
  await store.deleteKid(tempId);
  const kid = await store.getKid(tempId);
  assert.equal(kid, null);
});

test('subscribeToKid fires with live updates', async () => {
  let received = null;
  const unsubscribe = store.subscribeToKid(kidId, (kid) => {
    received = kid;
  });
  // wait for the initial snapshot
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.ok(received, 'expected initial snapshot');
  const balanceBefore = received.balanceCents;

  await store.recordTransaction(kidId, { type: 'deposit', amountCents: 200, note: 'Live update test' });
  await new Promise((resolve) => setTimeout(resolve, 300));

  assert.equal(received.balanceCents, balanceBefore + 200);
  unsubscribe();
});
