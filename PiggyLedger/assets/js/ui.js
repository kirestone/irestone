/**
 * ui.js — small shared UI helpers used by home.js, parent.js, and kid.js.
 * Not business logic (that lives in financeEngine.js) — just DOM glue.
 */
import { formatCents } from './financeEngine.js';

export { formatCents };

export const AVATAR_EMOJIS = ['🦊', '🐸', '🐼', '🦄', '🐯', '🐨', '🐙', '🦁', '🐧', '🐢', '🦋', '🐬'];
export const AVATAR_COLORS = ['#4B4FD1', '#EF8360', '#2F9E6E', '#C4486A', '#D19900', '#7A39BB', '#006494'];

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function formatDate(value) {
  const d = value instanceof Date ? value : value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(value) {
  const d = value instanceof Date ? value : value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export const LOGO_SVG = `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <rect x="5" y="12.5" width="22" height="15" rx="7" stroke="currentColor" stroke-width="2"/>
  <line x1="12" y1="12.5" x2="20" y2="12.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="16" cy="6.5" r="4.5" fill="currentColor"/>
</svg>`;

export function initThemeToggle() {
  const toggle = document.querySelector('[data-theme-toggle]');
  const root = document.documentElement;
  let mode = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', mode);
  renderIcon();
  toggle?.addEventListener('click', () => {
    mode = mode === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', mode);
    renderIcon();
  });
  function renderIcon() {
    if (!toggle) return;
    toggle.setAttribute('aria-label', `Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`);
    toggle.innerHTML =
      mode === 'dark'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }
}

let toastTimer = null;
export function showToast(message, { tone = 'default' } = {}) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.dataset.tone = tone;
  el.classList.add('toast--visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('toast--visible'), 2600);
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_err) {
    return false;
  }
}

export function txTypeMeta(type) {
  switch (type) {
    case 'allowance':
      return { label: 'Allowance', badge: 'badge-accent', icon: '💰' };
    case 'interest':
      return { label: 'Interest', badge: 'badge-growth', icon: '📈' };
    case 'withdrawal':
      return { label: 'Spent', badge: 'badge-spend', icon: '🛍️' };
    case 'deposit':
      return { label: 'Added', badge: 'badge-accent', icon: '➕' };
    default:
      return { label: 'Adjustment', badge: 'badge-muted', icon: '✏️' };
  }
}
