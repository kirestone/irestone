import { getStore } from './firebaseConfig.js';
import {
  initThemeToggle,
  LOGO_SVG,
  formatCents,
  escapeHtml,
  formatDate,
  formatDateTime,
  copyToClipboard,
  showToast,
  txTypeMeta,
  AVATAR_EMOJIS,
  AVATAR_COLORS,
} from './ui.js';
import { hashPin, verifyPin, isValidPinFormat } from './pinAuth.js';
import { dollarsToCents, nextAllowanceDate } from './financeEngine.js';
import { safeSession } from './safeStorage.js';

initThemeToggle();
document.querySelectorAll('.brand-logo').forEach((el) => (el.innerHTML = LOGO_SVG));

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

let store;
let mode;
let family;
let kidsCache = [];
let txCache = new Map(); // kidId -> transactions[]
let selectedAvatar = AVATAR_EMOJIS[0];
let selectedColor = AVATAR_COLORS[0];

const UNLOCK_KEY = 'piggyledger_parent_unlocked';

async function main() {
  ({ store, mode } = await getStore());

  if (mode === 'demo') {
    $('#demo-banner-slot').innerHTML = `<div class="demo-banner">
      👋 You're in <strong>demo mode</strong> — changes save only in this browser.
      <a href="docs/SETUP.md">Connect Firebase</a> for real cross-device sync with your kids' devices.
    </div>`;
  }

  family = await store.ensureFamily({ name: 'Our Family', pinEnabled: false, pinHash: null });

  if (family.pinEnabled && safeSession?.getItem(UNLOCK_KEY) !== family.pinHash) {
    showPinGate();
  } else {
    showApp();
  }

  renderFamilyForm();
  renderAvatarPickers();
  await refreshKidsList();

  if (store.subscribeToKids) {
    store.subscribeToKids(() => refreshKidsList());
  }

  wireStaticControls();
}

function showPinGate() {
  $('#pin-gate').style.display = 'flex';
  $('#app-root').style.display = 'none';
}
function showApp() {
  $('#pin-gate').style.display = 'none';
  $('#app-root').style.display = '';
}

function wireStaticControls() {
  $('#pin-submit').addEventListener('click', async () => {
    const pin = $('#pin-input').value;
    if (await verifyPin(pin, family.pinHash)) {
      safeSession?.setItem(UNLOCK_KEY, family.pinHash);
      $('#pin-error').style.display = 'none';
      showApp();
    } else {
      $('#pin-error').style.display = 'block';
    }
  });
  $('#pin-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#pin-submit').click();
  });

  $('#pin-enabled-toggle').addEventListener('change', (e) => {
    $('#pin-set-form').classList.toggle('open', e.target.checked);
  });

  $('#save-family-btn').addEventListener('click', saveFamilySettings);

  $('#add-kid-btn').addEventListener('click', () => {
    $('#add-kid-form').classList.add('open');
  });
  $('#cancel-kid-btn').addEventListener('click', () => {
    $('#add-kid-form').classList.remove('open');
  });
  $('#create-kid-btn').addEventListener('click', createKid);

  $('#kids-list').addEventListener('click', handleKidsListClick);
}

function renderFamilyForm() {
  $('#family-name-input').value = family.name ?? '';
  $('#pin-enabled-toggle').checked = !!family.pinEnabled;
  $('#pin-set-form').classList.toggle('open', !!family.pinEnabled);
  $('#new-pin-input').placeholder = family.pinHash ? 'Blank = keep current' : '1234';
}

async function saveFamilySettings() {
  const name = $('#family-name-input').value.trim() || 'Our Family';
  const pinEnabled = $('#pin-enabled-toggle').checked;
  const newPin = $('#new-pin-input').value.trim();
  const patch = { name, pinEnabled };

  if (pinEnabled) {
    if (newPin) {
      if (!isValidPinFormat(newPin)) {
        showToast('PIN must be 4-8 digits', { tone: 'error' });
        return;
      }
      patch.pinHash = await hashPin(newPin);
    } else if (!family.pinHash) {
      showToast('Please set a PIN before enabling it', { tone: 'error' });
      return;
    }
  }

  await store.updateFamilySettings(patch);
  family = { ...family, ...patch };
  $('#new-pin-input').value = '';
  renderFamilyForm();
  showToast('Family settings saved', { tone: 'success' });
}

function renderAvatarPickers() {
  const avatarWrap = $('#new-kid-avatar-picker');
  avatarWrap.innerHTML = AVATAR_EMOJIS.map(
    (e, i) => `<button type="button" data-emoji="${e}" aria-pressed="${i === 0}">${e}</button>`
  ).join('');
  avatarWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    selectedAvatar = btn.dataset.emoji;
    $$('button', avatarWrap).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  });

  const colorWrap = $('#new-kid-color-picker');
  colorWrap.innerHTML = AVATAR_COLORS.map(
    (c, i) => `<button type="button" data-color="${c}" aria-pressed="${i === 0}" style="background:${c};"></button>`
  ).join('');
  colorWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    selectedColor = btn.dataset.color;
    $$('button', colorWrap).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  });
}

async function createKid() {
  const name = $('#new-kid-name').value.trim();
  if (!name) {
    showToast('Please enter a name', { tone: 'error' });
    return;
  }
  await store.addKid({ name, emoji: selectedAvatar, color: selectedColor });
  $('#new-kid-name').value = '';
  $('#add-kid-form').classList.remove('open');
  showToast(`${name} was added`, { tone: 'success' });
  await refreshKidsList();
}

// ---- Kids list rendering (state-preserving re-render) -----------------------

function captureOpenState() {
  const open = { bodies: [], forms: [] };
  $$('.kid-body.open').forEach((el) => open.bodies.push(el.dataset.kidId));
  $$('.inline-form.open[data-kid-form]').forEach((el) => open.forms.push(el.dataset.kidForm));
  return open;
}

function applyOpenState(open) {
  open.bodies.forEach((id) => $(`.kid-body[data-kid-id="${id}"]`)?.classList.add('open'));
  open.forms.forEach((id) => $(`.inline-form[data-kid-form="${id}"]`)?.classList.add('open'));
}

async function refreshKidsList() {
  const openState = captureOpenState();
  kidsCache = await store.listKids();
  kidsCache.sort((a, b) => ((a.createdAt ?? 0) < (b.createdAt ?? 0) ? -1 : 1));

  const lists = await Promise.all(kidsCache.map((k) => store.listTransactions(k.id, { limit: 50 })));
  kidsCache.forEach((k, i) => txCache.set(k.id, lists[i]));

  const list = $('#kids-list');
  if (kidsCache.length === 0) {
    list.innerHTML = `<div class="card center muted">No kids yet. Click "+ Add a kid" above to get started.</div>`;
    return;
  }
  list.innerHTML = kidsCache.map(kidCardHtml).join('');
  applyOpenState(openState);
}

function kidUrl(kidId) {
  // Resolve relative to the current directory rather than string-replacing
  // "parent.html", so this still works if a host serves clean URLs
  // (e.g. rewrites /parent.html -> /parent) instead of literal filenames.
  const url = new URL('kid.html', location.href);
  url.search = `?kid=${kidId}`;
  return url.toString();
}

function kidCardHtml(kid) {
  const txs = txCache.get(kid.id) ?? [];
  const nextDate = kid.allowanceEnabled
    ? nextAllowanceDate(kid.lastAllowanceRunAt?.toDate ? kid.lastAllowanceRunAt.toDate() : kid.lastAllowanceRunAt ?? kid.createdAt?.toDate?.() ?? kid.createdAt ?? new Date(), kid.allowanceFrequency)
    : null;

  return `
  <div class="card kid-mgmt-card" data-testid="card-kid-${kid.id}">
    <div class="kid-mgmt-head">
      <div class="kid-mgmt-avatar" style="background:${kid.color}22; color:${kid.color};">${kid.emoji}</div>
      <div>
        <div class="kid-mgmt-name">${escapeHtml(kid.name)}</div>
        <div class="kid-mgmt-balance" data-testid="text-balance-${kid.id}">${formatCents(kid.balanceCents)}</div>
      </div>
      <div class="kid-actions">
        <button class="btn btn-accent btn-sm" data-action="toggle-form" data-target-form="add-${kid.id}">+ Add Money</button>
        <button class="btn btn-spend btn-sm" data-action="toggle-form" data-target-form="spend-${kid.id}">− Spend</button>
        <button class="btn btn-ghost btn-sm" data-action="toggle-body" data-kid-id="${kid.id}">⚙ Settings</button>
        <button class="btn btn-ghost btn-sm" data-action="delete-kid" data-kid-id="${kid.id}" aria-label="Delete ${escapeHtml(kid.name)}">🗑</button>
      </div>
    </div>

    <div class="inline-form" data-kid-form="add-${kid.id}">
      <div class="field-row">
        <div class="field"><label>Amount ($)</label><input type="number" step="0.01" min="0" data-role="add-amount" placeholder="5.00" /></div>
        <div class="field"><label>What's it for? (optional)</label><input type="text" data-role="add-note" placeholder="Birthday money from Grandma" /></div>
      </div>
      <button class="btn btn-accent" data-action="submit-add" data-kid-id="${kid.id}">Add money</button>
    </div>

    <div class="inline-form" data-kid-form="spend-${kid.id}">
      <div class="field-row">
        <div class="field"><label>Amount ($)</label><input type="number" step="0.01" min="0" data-role="spend-amount" placeholder="3.00" /></div>
        <div class="field"><label>What was it spent on? (required)</label><input type="text" data-role="spend-note" placeholder="Toy dinosaur" /></div>
      </div>
      <button class="btn btn-spend" data-action="submit-spend" data-kid-id="${kid.id}">Record spending</button>
    </div>

    <div class="kid-body" data-kid-id="${kid.id}">
      <div class="subgrid">
        <div class="field">
          <label>Annual interest rate (%)</label>
          <input type="number" step="0.1" min="0" max="50" data-role="interest-rate" value="${kid.interestRateAnnualPct ?? 0}" />
          <span class="field-hint">Compounds daily on the balance.</span>
        </div>
        <div class="field">
          <label>Allowance amount ($)</label>
          <input type="number" step="0.01" min="0" data-role="allowance-amount" value="${((kid.allowanceAmountCents ?? 0) / 100).toFixed(2)}" />
        </div>
        <div class="field">
          <label>Allowance frequency</label>
          <select data-role="allowance-frequency">
            <option value="weekly" ${kid.allowanceFrequency === 'weekly' ? 'selected' : ''}>Weekly</option>
            <option value="biweekly" ${kid.allowanceFrequency === 'biweekly' ? 'selected' : ''}>Every 2 weeks</option>
            <option value="monthly" ${kid.allowanceFrequency === 'monthly' ? 'selected' : ''}>Monthly</option>
          </select>
        </div>
      </div>
      <div class="toggle-row">
        <div>
          <strong>Automate allowance</strong>
          ${nextDate ? `<p class="field-hint">Next payment: ${formatDate(nextDate)} (applied automatically next time anyone opens the app)</p>` : `<p class="field-hint">Turn on to schedule recurring allowance.</p>`}
        </div>
        <label class="switch"><input type="checkbox" data-role="allowance-enabled" ${kid.allowanceEnabled ? 'checked' : ''} /><span class="track"><span class="thumb"></span></span></label>
      </div>
      <div class="row">
        <button class="btn btn-primary btn-sm" data-action="save-settings" data-kid-id="${kid.id}">Save settings</button>
        <button class="btn btn-ghost btn-sm" data-action="run-catchup" data-kid-id="${kid.id}">▶ Run allowance &amp; interest now</button>
      </div>

      <div class="kid-link-row">
        <span>Bookmark for ${escapeHtml(kid.name)}'s device:</span>
        <code>${kidUrl(kid.id)}</code>
        <button class="btn btn-ghost btn-sm" data-action="copy-link" data-kid-id="${kid.id}">Copy link</button>
      </div>

      <div>
        <div class="section-title"><h3 style="font-size: var(--text-base);">Recent activity</h3></div>
        <div class="tx-table-wrap">
          <table class="tx-table">
            <thead><tr><th>Date</th><th>Type</th><th>Note</th><th>Amount</th><th>Balance</th></tr></thead>
            <tbody>
              ${
                txs.length === 0
                  ? `<tr><td colspan="5" class="muted">No transactions yet.</td></tr>`
                  : txs.slice(0, 12).map((t) => {
                      const meta = txTypeMeta(t.type);
                      return `<tr>
                        <td>${formatDateTime(t.createdAt)}</td>
                        <td><span class="badge ${meta.badge}">${meta.icon} ${meta.label}</span></td>
                        <td>${escapeHtml(t.note || '—')}</td>
                        <td>${formatCents(t.amountCents, { sign: true })}</td>
                        <td>${formatCents(t.balanceAfterCents)}</td>
                      </tr>`;
                    }).join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>`;
}

async function handleKidsListClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { action, kidId, targetForm } = btn.dataset;

  if (action === 'toggle-body') {
    $(`.kid-body[data-kid-id="${kidId}"]`)?.classList.toggle('open');
  } else if (action === 'toggle-form') {
    const form = $(`.inline-form[data-kid-form="${targetForm}"]`);
    const isOpening = !form.classList.contains('open');
    $$('.inline-form[data-kid-form]').forEach((f) => f.classList.remove('open'));
    if (isOpening) form.classList.add('open');
  } else if (action === 'submit-add') {
    await submitAdd(kidId);
  } else if (action === 'submit-spend') {
    await submitSpend(kidId);
  } else if (action === 'save-settings') {
    await saveKidSettings(kidId);
  } else if (action === 'run-catchup') {
    const result = await store.runCatchUp(kidId, new Date());
    showToast(result.applied ? 'Allowance/interest applied' : 'Nothing due yet', { tone: result.applied ? 'success' : 'default' });
    await refreshKidsList();
  } else if (action === 'delete-kid') {
    const kid = kidsCache.find((k) => k.id === kidId);
    if (confirm(`Remove ${kid?.name ?? 'this kid'} and all their history? This can't be undone.`)) {
      await store.deleteKid(kidId);
      showToast('Kid removed');
      await refreshKidsList();
    }
  } else if (action === 'copy-link') {
    const code = $(`[data-kid-form="add-${kidId}"]`)?.closest('.kid-mgmt-card')?.querySelector('code');
    const ok = await copyToClipboard(code.textContent);
    showToast(ok ? 'Link copied' : 'Could not copy — long-press to copy manually');
  }
}

async function submitAdd(kidId) {
  const form = $(`[data-kid-form="add-${kidId}"]`);
  const amount = parseFloat($('[data-role="add-amount"]', form).value);
  const note = $('[data-role="add-note"]', form).value.trim();
  if (!amount || amount <= 0) {
    showToast('Enter an amount greater than $0', { tone: 'error' });
    return;
  }
  await store.recordTransaction(kidId, { type: 'deposit', amountCents: dollarsToCents(amount), note: note || 'Money added' });
  form.classList.remove('open');
  showToast('Money added', { tone: 'success' });
  await refreshKidsList();
}

async function submitSpend(kidId) {
  const form = $(`[data-kid-form="spend-${kidId}"]`);
  const amount = parseFloat($('[data-role="spend-amount"]', form).value);
  const note = $('[data-role="spend-note"]', form).value.trim();
  if (!amount || amount <= 0) {
    showToast('Enter an amount greater than $0', { tone: 'error' });
    return;
  }
  if (!note) {
    showToast('Please note what the money was spent on', { tone: 'error' });
    return;
  }
  const kid = kidsCache.find((k) => k.id === kidId);
  if ((kid?.balanceCents ?? 0) < dollarsToCents(amount)) {
    if (!confirm('This will make the balance negative. Continue anyway?')) return;
  }
  await store.recordTransaction(kidId, { type: 'withdrawal', amountCents: -dollarsToCents(amount), note });
  form.classList.remove('open');
  showToast('Spending recorded', { tone: 'success' });
  await refreshKidsList();
}

async function saveKidSettings(kidId) {
  const body = $(`.kid-body[data-kid-id="${kidId}"]`);
  const interestRateAnnualPct = parseFloat($('[data-role="interest-rate"]', body).value) || 0;
  const allowanceAmountCents = dollarsToCents(parseFloat($('[data-role="allowance-amount"]', body).value) || 0);
  const allowanceFrequency = $('[data-role="allowance-frequency"]', body).value;
  const allowanceEnabled = $('[data-role="allowance-enabled"]', body).checked;

  await store.updateKidSettings(kidId, {
    interestRateAnnualPct,
    allowanceAmountCents,
    allowanceFrequency,
    allowanceEnabled,
  });
  showToast('Settings saved', { tone: 'success' });
  await refreshKidsList();
}

main();
