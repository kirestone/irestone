/**
 * financeEngine.js
 * ------------------------------------------------------------
 * Pure, framework-free financial logic for PiggyLedger.
 * No Firebase, no DOM, no browser APIs — every function here
 * is a plain deterministic function of its inputs, which is
 * what makes this module trivial to unit test in isolation
 * (see tests/financeEngine.test.mjs).
 *
 * Money is always represented in integer CENTS to avoid
 * floating point drift. UI layers convert to/from dollars.
 * ------------------------------------------------------------
 */

// ---- Basic money helpers -------------------------------------------------

export function dollarsToCents(dollars) {
  return Math.round(Number(dollars) * 100);
}

export function centsToDollars(cents) {
  return cents / 100;
}

export function formatCents(cents, { sign = false } = {}) {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = (abs / 100).toFixed(2);
  const prefix = negative ? '-' : sign ? '+' : '';
  return `${prefix}$${dollars}`;
}

// ---- Date helpers ----------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(start, end) {
  const a = new Date(start).setHours(0, 0, 0, 0);
  const b = new Date(end).setHours(0, 0, 0, 0);
  return Math.round((b - a) / DAY_MS);
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonthsClamped(date, months) {
  const d = new Date(date);
  const targetDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, lastDayOfTargetMonth));
  return d;
}

const FREQUENCY_LABELS = {
  weekly: 'week',
  biweekly: '2 weeks',
  monthly: 'month',
};

export function nextAllowanceDate(fromDate, frequency) {
  switch (frequency) {
    case 'weekly':
      return addDays(fromDate, 7);
    case 'biweekly':
      return addDays(fromDate, 14);
    case 'monthly':
      return addMonthsClamped(fromDate, 1);
    default:
      throw new Error(`Unknown allowance frequency: ${frequency}`);
  }
}

// ---- Allowance automation --------------------------------------------------

/**
 * Computes any allowance payments that are "due" between the kid's
 * lastAllowanceRunAt (or account creation date, if never run) and `now`.
 * Because this is a static site with no server-side cron, allowance is
 * applied lazily/opportunistically: whenever the parent or kid page loads,
 * we catch up on any periods that have elapsed since the last visit.
 *
 * Returns one transaction per elapsed period (dated to when it would have
 * naturally occurred) up to a safety cap, after which remaining periods are
 * bundled into a single catch-up transaction so a long-dormant account
 * doesn't generate hundreds of rows.
 *
 * @param {object} kid - { allowanceEnabled, allowanceAmountCents, allowanceFrequency, lastAllowanceRunAt, createdAt }
 * @param {Date} now
 * @param {number} maxIndividualPayouts
 * @returns {{ transactions: Array<{date: Date, amountCents: number, note: string}>, newLastRunAt: Date }}
 */
export function computeAllowanceCatchUp(kid, now = new Date(), maxIndividualPayouts = 26) {
  if (!kid.allowanceEnabled || !kid.allowanceAmountCents || kid.allowanceAmountCents <= 0) {
    return { transactions: [], newLastRunAt: kid.lastAllowanceRunAt ?? kid.createdAt ?? now };
  }

  const anchor = kid.lastAllowanceRunAt ? new Date(kid.lastAllowanceRunAt) : new Date(kid.createdAt ?? now);
  const transactions = [];
  let cursor = anchor;
  let count = 0;
  let overflow = 0;

  let next = nextAllowanceDate(cursor, kid.allowanceFrequency);
  while (next <= now) {
    count += 1;
    if (count <= maxIndividualPayouts) {
      transactions.push({
        date: next,
        amountCents: kid.allowanceAmountCents,
        note: `Allowance (${FREQUENCY_LABELS[kid.allowanceFrequency] ?? kid.allowanceFrequency})`,
      });
    } else {
      overflow += 1;
    }
    cursor = next;
    next = nextAllowanceDate(cursor, kid.allowanceFrequency);
  }

  if (overflow > 0) {
    transactions.push({
      date: cursor,
      amountCents: kid.allowanceAmountCents * overflow,
      note: `Allowance catch-up (${overflow} earlier payments bundled)`,
    });
  }

  return { transactions, newLastRunAt: count > 0 ? cursor : anchor };
}

// ---- Interest automation ---------------------------------------------------

/**
 * Daily-compounding interest, applied lazily since lastInterestRunAt.
 * A single summary transaction is produced representing all interest
 * earned over the elapsed days (rather than one row per day), so the
 * ledger stays readable even after long gaps between visits.
 *
 * @param {object} kid - { balanceCents, interestRateAnnualPct, lastInterestRunAt, createdAt }
 * @param {Date} now
 * @returns {{ transaction: {date: Date, amountCents: number, note: string} | null, newLastRunAt: Date }}
 */
export function computeInterestCatchUp(kid, now = new Date()) {
  const anchor = kid.lastInterestRunAt ? new Date(kid.lastInterestRunAt) : new Date(kid.createdAt ?? now);
  const days = daysBetween(anchor, now);

  if (!kid.interestRateAnnualPct || kid.interestRateAnnualPct <= 0 || days <= 0 || kid.balanceCents <= 0) {
    return { transaction: null, newLastRunAt: days > 0 ? now : anchor };
  }

  const dailyRate = kid.interestRateAnnualPct / 100 / 365;
  const newBalance = kid.balanceCents * Math.pow(1 + dailyRate, days);
  const interestEarned = Math.round(newBalance - kid.balanceCents);

  if (interestEarned <= 0) {
    return { transaction: null, newLastRunAt: now };
  }

  return {
    transaction: {
      date: now,
      amountCents: interestEarned,
      note: `Interest earned (${days} day${days === 1 ? '' : 's'} @ ${kid.interestRateAnnualPct}% APY)`,
    },
    newLastRunAt: now,
  };
}

// ---- Savings projection / "what if" simulator -------------------------------

/**
 * Projects a future balance for the savings simulator kids use to explore
 * "if I saved my money for the next month/year, how much would I have?"
 *
 * @param {object} params
 * @param {number} params.balanceCents - starting balance
 * @param {number} params.annualRatePct - interest rate, e.g. 5 for 5%
 * @param {number} params.days - projection horizon in days
 * @param {boolean} [params.includeAllowance] - also simulate recurring allowance deposits
 * @param {number} [params.allowanceAmountCents]
 * @param {string} [params.allowanceFrequency] - 'weekly' | 'biweekly' | 'monthly'
 * @returns {{ futureBalanceCents: number, interestEarnedCents: number, contributionsCents: number }}
 */
export function projectSavings({
  balanceCents,
  annualRatePct,
  days,
  includeAllowance = false,
  allowanceAmountCents = 0,
  allowanceFrequency = 'weekly',
}) {
  const dailyRate = (annualRatePct || 0) / 100 / 365;

  if (!includeAllowance || !allowanceAmountCents) {
    const futureBalanceCents = Math.round(balanceCents * Math.pow(1 + dailyRate, days));
    return {
      futureBalanceCents,
      interestEarnedCents: futureBalanceCents - balanceCents,
      contributionsCents: 0,
    };
  }

  // Simulate day-by-day when allowance deposits are included, since deposits
  // land on discrete days and compounding needs to apply to the growing balance.
  // Capped horizon keeps this cheap even for a 10-year projection (~3650 iterations).
  let balance = balanceCents;
  let contributions = 0;
  const start = new Date(2000, 0, 1); // arbitrary anchor date; only deltas matter
  let nextAllowanceAt = nextAllowanceDate(start, allowanceFrequency);
  let dayIndex = 0;
  const anchorTime = start.getTime();

  while (dayIndex < days) {
    balance *= 1 + dailyRate;
    dayIndex += 1;
    const currentDate = new Date(anchorTime + dayIndex * DAY_MS);
    if (currentDate >= nextAllowanceAt) {
      balance += allowanceAmountCents;
      contributions += allowanceAmountCents;
      nextAllowanceAt = nextAllowanceDate(nextAllowanceAt, allowanceFrequency);
    }
  }

  const futureBalanceCents = Math.round(balance);
  return {
    futureBalanceCents,
    interestEarnedCents: futureBalanceCents - balanceCents - contributions,
    contributionsCents: contributions,
  };
}

export const PROJECTION_PRESETS = [
  { label: '1 month', days: 30 },
  { label: '3 months', days: 91 },
  { label: '6 months', days: 182 },
  { label: '1 year', days: 365 },
  { label: '5 years', days: 1825 },
];
