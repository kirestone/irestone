/**
 * Module test: financeEngine.js
 * Run in isolation with: node tests/financeEngine.test.mjs
 * No Firebase, no browser, no network — pure logic only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dollarsToCents,
  centsToDollars,
  formatCents,
  daysBetween,
  addDays,
  addMonthsClamped,
  nextAllowanceDate,
  computeAllowanceCatchUp,
  computeInterestCatchUp,
  projectSavings,
} from '../assets/js/financeEngine.js';

test('dollarsToCents / centsToDollars round-trip', () => {
  assert.equal(dollarsToCents(12.5), 1250);
  assert.equal(dollarsToCents(0.1), 10);
  assert.equal(centsToDollars(1250), 12.5);
});

test('formatCents formats correctly', () => {
  assert.equal(formatCents(1234), '$12.34');
  assert.equal(formatCents(-500), '-$5.00');
  assert.equal(formatCents(500, { sign: true }), '+$5.00');
});

test('daysBetween counts whole days regardless of time-of-day', () => {
  const a = new Date(2026, 0, 1, 23, 0);
  const b = new Date(2026, 0, 8, 1, 0);
  assert.equal(daysBetween(a, b), 7);
});

test('addDays / addMonthsClamped handle month-end edges', () => {
  const jan31 = new Date(2026, 0, 31);
  const feb = addMonthsClamped(jan31, 1);
  assert.equal(feb.getMonth(), 1);
  assert.equal(feb.getDate(), 28); // Feb 2026 has 28 days, clamped down from 31
});

test('nextAllowanceDate weekly/biweekly/monthly', () => {
  const start = new Date(2026, 0, 1); // Jan 1 2026
  assert.equal(daysBetween(start, nextAllowanceDate(start, 'weekly')), 7);
  assert.equal(daysBetween(start, nextAllowanceDate(start, 'biweekly')), 14);
  const monthly = nextAllowanceDate(start, 'monthly');
  assert.equal(monthly.getMonth(), 1);
  assert.equal(monthly.getDate(), 1);
});

test('computeAllowanceCatchUp: no payout when disabled', () => {
  const kid = { allowanceEnabled: false, allowanceAmountCents: 500, allowanceFrequency: 'weekly', createdAt: new Date(2026, 0, 1) };
  const result = computeAllowanceCatchUp(kid, new Date(2026, 1, 1));
  assert.equal(result.transactions.length, 0);
});

test('computeAllowanceCatchUp: single weekly period elapsed', () => {
  const created = new Date(2026, 0, 1);
  const kid = {
    allowanceEnabled: true,
    allowanceAmountCents: 500,
    allowanceFrequency: 'weekly',
    lastAllowanceRunAt: created,
    createdAt: created,
  };
  const now = new Date(2026, 0, 8, 12); // 7 days + a few hours later
  const result = computeAllowanceCatchUp(kid, now);
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].amountCents, 500);
});

test('computeAllowanceCatchUp: multiple missed weeks all catch up individually', () => {
  const created = new Date(2026, 0, 1);
  const kid = {
    allowanceEnabled: true,
    allowanceAmountCents: 500,
    allowanceFrequency: 'weekly',
    lastAllowanceRunAt: created,
    createdAt: created,
  };
  const now = new Date(2026, 0, 1 + 7 * 4); // 4 weeks later
  const result = computeAllowanceCatchUp(kid, now);
  assert.equal(result.transactions.length, 4);
  assert.equal(result.transactions.every((t) => t.amountCents === 500), true);
});

test('computeAllowanceCatchUp: caps individual payouts and bundles overflow', () => {
  const created = new Date(2020, 0, 1);
  const kid = {
    allowanceEnabled: true,
    allowanceAmountCents: 500,
    allowanceFrequency: 'weekly',
    lastAllowanceRunAt: created,
    createdAt: created,
  };
  const now = new Date(2020, 0, 1 + 7 * 40); // 40 weeks, cap is 26
  const result = computeAllowanceCatchUp(kid, now, 26);
  const bundled = result.transactions.find((t) => t.note.includes('bundled'));
  assert.ok(bundled, 'expected a bundled catch-up transaction');
  assert.equal(result.transactions.length, 27); // 26 individual + 1 bundle
  assert.equal(bundled.amountCents, 500 * 14); // 40 - 26 = 14 overflow periods
});

test('computeInterestCatchUp: no interest with zero rate', () => {
  const created = new Date(2026, 0, 1);
  const kid = { balanceCents: 10000, interestRateAnnualPct: 0, lastInterestRunAt: created, createdAt: created };
  const result = computeInterestCatchUp(kid, new Date(2026, 6, 1));
  assert.equal(result.transaction, null);
});

test('computeInterestCatchUp: accrues daily-compounded interest over elapsed days', () => {
  const created = new Date(2026, 0, 1);
  const kid = { balanceCents: 10000, interestRateAnnualPct: 5, lastInterestRunAt: created, createdAt: created };
  const now = new Date(2027, 0, 1); // ~365 days later
  const result = computeInterestCatchUp(kid, now);
  assert.ok(result.transaction, 'expected interest to accrue');
  // 5% compounded daily on $100 for ~1 year ≈ $5.13
  assert.ok(result.transaction.amountCents >= 480 && result.transaction.amountCents <= 550);
});

test('projectSavings: interest-only growth matches compound formula', () => {
  const result = projectSavings({ balanceCents: 10000, annualRatePct: 5, days: 365 });
  assert.ok(result.futureBalanceCents > 10000);
  assert.ok(result.futureBalanceCents <= 10513); // upper bound sanity check
  assert.equal(result.contributionsCents, 0);
});

test('projectSavings: includes recurring allowance contributions', () => {
  const result = projectSavings({
    balanceCents: 0,
    annualRatePct: 5,
    days: 365,
    includeAllowance: true,
    allowanceAmountCents: 500,
    allowanceFrequency: 'weekly',
  });
  // ~52 weeks of $5 = $260 contributed, plus a little interest
  assert.ok(result.contributionsCents >= 25000 && result.contributionsCents <= 27000);
  assert.ok(result.futureBalanceCents > result.contributionsCents);
});

test('projectSavings: zero balance and zero rate stays at zero', () => {
  const result = projectSavings({ balanceCents: 0, annualRatePct: 0, days: 30 });
  assert.equal(result.futureBalanceCents, 0);
});
