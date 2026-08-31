/**
 * Module test: pinAuth.js
 * Run in isolation with: node --test tests/pinAuth.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPin, verifyPin, isValidPinFormat } from '../assets/js/pinAuth.js';

test('isValidPinFormat accepts 4-8 digit numeric PINs only', () => {
  assert.equal(isValidPinFormat('1234'), true);
  assert.equal(isValidPinFormat('12345678'), true);
  assert.equal(isValidPinFormat('123'), false);
  assert.equal(isValidPinFormat('123456789'), false);
  assert.equal(isValidPinFormat('abcd'), false);
});

test('hashPin produces a deterministic hex digest', async () => {
  const h1 = await hashPin('4242');
  const h2 = await hashPin('4242');
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test('hashPin rejects malformed PINs', async () => {
  await assert.rejects(() => hashPin('12'));
  await assert.rejects(() => hashPin('abcdef'));
});

test('verifyPin correctly matches / rejects', async () => {
  const hash = await hashPin('1357');
  assert.equal(await verifyPin('1357', hash), true);
  assert.equal(await verifyPin('9999', hash), false);
});

test('verifyPin returns false (not throw) when storedHash is missing', async () => {
  assert.equal(await verifyPin('1234', null), false);
  assert.equal(await verifyPin('1234', undefined), false);
});
