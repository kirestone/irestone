import { getStore } from './firebaseConfig.js';
import { initThemeToggle, LOGO_SVG, formatCents, escapeHtml, AVATAR_EMOJIS } from './ui.js';

initThemeToggle();
document.querySelectorAll('.brand-logo').forEach((el) => (el.innerHTML = LOGO_SVG));

const grid = document.getElementById('kid-grid');
const heading = document.getElementById('family-heading');
const bannerSlot = document.getElementById('demo-banner-slot');

function renderEmptyState() {
  grid.innerHTML = `
    <div class="card empty-state" style="grid-column: 1 / -1;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/></svg>
      <h3>No kids yet</h3>
      <p class="muted">Head to the Parent Dashboard to add your first kid and set up their allowance.</p>
      <br/>
      <a class="btn btn-primary" href="parent.html">Open Parent Dashboard</a>
    </div>`;
}

function kidCard(kid) {
  const emoji = kid.emoji || AVATAR_EMOJIS[0];
  const color = kid.color || '#4B4FD1';
  return `
    <a class="card kid-card" href="kid.html?kid=${encodeURIComponent(kid.id)}" data-testid="link-kid-${kid.id}">
      <div class="kid-avatar" style="background:${color}22; color:${color};">${emoji}</div>
      <div class="kid-name">${escapeHtml(kid.name)}</div>
      <div class="kid-balance" data-testid="text-balance-${kid.id}">${formatCents(kid.balanceCents ?? 0)}</div>
      <span class="badge badge-muted">View my account →</span>
    </a>`;
}

async function main() {
  const { store, mode } = await getStore();

  if (mode === 'demo') {
    bannerSlot.innerHTML = `<div class="demo-banner">
      👋 You're viewing <strong>demo mode</strong> — sample data saved only in this browser.
      <a href="docs/SETUP.md">Connect your own Firebase project</a> for real cross-device sync.
    </div>`;
  }

  const family = await store.ensureFamily({ name: 'Our Family', pinEnabled: false, pinHash: null });
  heading.textContent = `Welcome to ${family.name}'s PiggyLedger!`;

  async function refresh() {
    const kids = await store.listKids();
    if (kids.length === 0) {
      renderEmptyState();
      return;
    }
    // Opportunistically catch up allowance/interest for every kid whenever
    // the family home loads — this is how "scheduling" works with no server.
    await Promise.all(kids.map((k) => store.runCatchUp(k.id).catch(() => {})));
    const refreshed = await store.listKids();
    grid.innerHTML = refreshed
      .sort((a, b) => (a.createdAt ?? 0) < (b.createdAt ?? 0) ? -1 : 1)
      .map(kidCard)
      .join('');
  }

  if (store.subscribeToKids) {
    store.subscribeToKids(() => refresh());
  } else {
    refresh();
  }
}

main();
