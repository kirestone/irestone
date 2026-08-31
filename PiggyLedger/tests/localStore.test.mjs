/**
 * Module test: localStore.js (the demo-mode data layer)
 * Run in isolation with: node --test tests/localStore.test.mjs
 *
 * Shims a minimal `window.localStorage` so this browser-oriented module
 * can be exercised directly under Node, without a real browser.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

function makeMockStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

globalThis.window = { localStorage: makeMockStorage(), sessionStorage: makeMockStorage() };

let store;
let createLocalStore;

before(async () => {
  ({ createLocalStore } = await import('../assets/js/localStore.js'));
  store = createLocalStore();
});

test('ensureFamily creates defaults once', async () => {
  const family = await store.ensureFamily({ name: 'Demo Family' });
  assert.equal(family.name, 'Demo Family');
});

let kidId;

test('addKid + getKid round-trip', async () => {
  kidId = await store.addKid({ name: 'Sam', emoji: '🐸' });
  const kid = await store.getKid(kidId);
  assert.equal(kid.name, 'Sam');
  assert.equal(kid.balanceCents, 0);
});

test('recordTransaction updates balance and note is preserved', async () => {
  await store.recordTransaction(kidId, { type: 'deposit', amountCents: 800, note: 'Grandma gift' });
  const result = await store.recordTransaction(kidId, { type: 'withdrawal', amountCents: -200, note: 'Candy' });
  assert.equal(result.balanceAfterCents, 600);
  const txs = await store.listTransactions(kidId);
  assert.equal(txs.length, 2);
  assert.equal(txs[0].note, 'Candy');
});

test('runCatchUp applies allowance + interest lazily', async () => {
  await store.updateKidSettings(kidId, {
    allowanceEnabled: true,
    allowanceAmountCents: 500,
    allowanceFrequency: 'weekly',
    interestRateAnnualPct: 5,
    lastAllowanceRunAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    lastInterestRunAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
  });
  const before_ = await store.getKid(kidId);
  const result = await store.runCatchUp(kidId, new Date());
  const after_ = await store.getKid(kidId);
  assert.equal(result.applied, true);
  assert.ok(after_.balanceCents > before_.balanceCents);
});

test('subscribeToKid notifies on change, same tab', async () => {
  let seen = null;
  const unsub = store.subscribeToKid(kidId, (kid) => {
    seen = kid;
  });
  await store.recordTransaction(kidId, { type: 'deposit', amountCents: 100, note: 'Test' });
  assert.ok(seen);
  assert.equal(seen.id, kidId);
  unsub();
});

test('deleteKid removes kid and transactions', async () => {
  const tempId = await store.addKid({ name: 'Temp' });
  await store.deleteKid(tempId);
  const kid = await store.getKid(tempId);
  assert.equal(kid, null);
});
