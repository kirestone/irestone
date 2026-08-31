import { getStore } from './firebaseConfig.js';
import { initThemeToggle, LOGO_SVG, formatCents, escapeHtml, formatDate, txTypeMeta } from './ui.js';
import { projectSavings, PROJECTION_PRESETS } from './financeEngine.js';

initThemeToggle();
document.querySelectorAll('.brand-logo').forEach((el) => (el.innerHTML = LOGO_SVG));

const content = document.getElementById('kid-content');
const params = new URLSearchParams(location.search);
const kidId = params.get('kid');
const simState = { days: 365, includeAllowance: false };

function notFound() {
  content.innerHTML = `
    <div class="card center" style="padding: var(--space-16) var(--space-6);">
      <h2>Hmm, we can't find that account 🤔</h2>
      <p class="muted">Ask a parent to open the Parent Dashboard and copy your link again.</p>
      <br/>
      <a class="btn btn-primary" href="index.html">Go to family home</a>
    </div>`;
}

async function main() {
  if (!kidId) return notFound();

  const { store, mode } = await getStore();
  if (mode === 'demo') {
    document.getElementById('demo-banner-slot').innerHTML = `<div class="demo-banner">
      👋 Demo mode — this data is only saved on this device.
    </div>`;
  }

  async function render() {
    const kid = await store.getKid(kidId);
    if (!kid) return notFound();

    // Opportunistically catch up allowance/interest whenever a kid opens their page.
    await store.runCatchUp(kidId).catch(() => {});
    const fresh = await store.getKid(kidId);
    const txs = await store.listTransactions(kidId, { limit: 25 });

    content.innerHTML = `
      <div class="hero-kid">
        <div class="hero-avatar" style="background:${fresh.color}22; color:${fresh.color};">${fresh.emoji}</div>
        <div class="hero-name">${escapeHtml(fresh.name)}'s account</div>
        <div class="hero-balance" data-testid="text-my-balance">${formatCents(fresh.balanceCents)}</div>
        <div class="stat-row">
          <span class="badge badge-growth">📈 ${fresh.interestRateAnnualPct ?? 0}% interest a year</span>
          ${fresh.allowanceEnabled ? `<span class="badge badge-accent">💰 ${formatCents(fresh.allowanceAmountCents)} / ${freqLabel(fresh.allowanceFrequency)}</span>` : ''}
        </div>
      </div>

      <section class="card" style="margin-bottom: var(--space-6);">
        <h2 style="margin-bottom: var(--space-4);">Recent activity</h2>
        <div id="activity-list">
          ${
            txs.length === 0
              ? '<p class="muted">Nothing here yet — check back after your next allowance!</p>'
              : txs.map(activityRow).join('')
          }
        </div>
      </section>

      <section class="card">
        <h2>💭 What if I saved my money?</h2>
        <p class="muted">Pick a time in the future to see how much you could have.</p>
        <div class="preset-row" id="preset-row">
          ${PROJECTION_PRESETS.map((p) => `<button class="preset-btn" type="button" data-days="${p.days}" aria-pressed="${p.days === simState.days}">${p.label}</button>`).join('')}
        </div>
        <label class="row" style="gap: var(--space-2); font-weight: 600; cursor: pointer;">
          <input type="checkbox" id="include-allowance-toggle" ${fresh.allowanceEnabled ? '' : 'disabled'} ${simState.includeAllowance ? 'checked' : ''} />
          Include my future allowance too
        </label>
        ${!fresh.allowanceEnabled ? '<p class="field-hint">Ask a parent to turn on automatic allowance to try this.</p>' : ''}
        <div class="sim-result" id="sim-result"></div>
      </section>
    `;

    wireSimulator(fresh);
  }

  function wireSimulator(kid) {
    const presetRow = document.getElementById('preset-row');
    const includeToggle = document.getElementById('include-allowance-toggle');

    function runSim() {
      const result = projectSavings({
        balanceCents: kid.balanceCents,
        annualRatePct: kid.interestRateAnnualPct ?? 0,
        days: simState.days,
        includeAllowance: includeToggle.checked,
        allowanceAmountCents: kid.allowanceAmountCents,
        allowanceFrequency: kid.allowanceFrequency,
      });
      document.getElementById('sim-result').innerHTML = `
        <p class="muted">Starting from ${formatCents(kid.balanceCents)}, in ${labelForDays(simState.days)} you could have:</p>
        <div class="big" data-testid="text-projection">${formatCents(result.futureBalanceCents)}</div>
        <div class="sim-breakdown">
          <div><div class="label">Interest earned</div><div class="value">${formatCents(result.interestEarnedCents)}</div></div>
          ${result.contributionsCents > 0 ? `<div><div class="label">Allowance added</div><div class="value">${formatCents(result.contributionsCents)}</div></div>` : ''}
        </div>`;
    }

    presetRow.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-days]');
      if (!btn) return;
      simState.days = Number(btn.dataset.days);
      Array.from(presetRow.querySelectorAll('button')).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      runSim();
    });
    includeToggle.addEventListener('change', () => {
      simState.includeAllowance = includeToggle.checked;
      runSim();
    });
    runSim();
  }

  render();
  if (store.subscribeToKid) {
    store.subscribeToKid(kidId, () => render());
  }
}

function freqLabel(freq) {
  return { weekly: 'week', biweekly: '2 weeks', monthly: 'month' }[freq] ?? freq;
}
function labelForDays(days) {
  const preset = PROJECTION_PRESETS.find((p) => p.days === days);
  return preset ? preset.label : `${days} days`;
}

function activityRow(t) {
  const meta = txTypeMeta(t.type);
  return `
    <div class="activity-item">
      <div class="activity-icon">${meta.icon}</div>
      <div>
        <div class="activity-note">${escapeHtml(t.note || meta.label)}</div>
        <div class="activity-date">${formatDate(t.createdAt)}</div>
      </div>
      <div class="activity-amount" style="color: ${t.amountCents >= 0 ? 'var(--color-growth)' : 'var(--color-spend)'};">${formatCents(t.amountCents, { sign: true })}</div>
    </div>`;
}

main();
