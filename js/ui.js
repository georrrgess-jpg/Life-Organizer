// Small UI helpers: escaping, dialogs, confirmations and toasts.
import { icon } from './icons.js';

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Opens a modal sheet. `content` is HTML for the inside of the dialog.
// Returns the <dialog>; it removes itself once closed.
export function openSheet(content, { label, onClose, className = '' } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = `sheet ${className}`;
  if (label) dlg.setAttribute('aria-label', label);
  dlg.innerHTML = content;
  document.body.append(dlg);
  const opener = handoffOpener || document.activeElement;
  handoffOpener = null;
  dlg._opener = opener;

  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) closeSheet(dlg); // backdrop
    if (e.target.closest('[data-close]')) closeSheet(dlg);
  });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(dlg); });
  dlg.addEventListener('close', () => {
    dlg.remove();
    onClose?.();
    if (!dlg._handedOff && opener && document.contains(opener)) opener.focus();
  });
  dlg.showModal();
  const first = dlg.querySelector('[autofocus]');
  if (first) first.focus();
  return dlg;
}

// Replace one sheet with another; focus later returns to the original opener.
let handoffOpener = null;
export function handoffSheet(dlg) {
  handoffOpener = dlg._opener;
  dlg._handedOff = true;
  dlg.close();
}

export function closeSheet(dlg) {
  if (!dlg.open || dlg.classList.contains('closing')) return;
  if (reducedMotion()) return dlg.close();
  dlg.classList.add('closing');
  setTimeout(() => dlg.close(), 160);
}

export function sheetHeader(title, extra = '') {
  return `<header class="sheet-head">
    <h2 class="sheet-title">${esc(title)}</h2>
    ${extra}
    <button type="button" class="btn-icon" data-close aria-label="Close">${icon('x')}</button>
  </header>`;
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, extra = '' }) {
  return new Promise((resolve) => {
    let result = false;
    const dlg = openSheet(`
      <div class="confirm" role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-msg">
        <h2 id="confirm-title" class="sheet-title">${esc(title)}</h2>
        <p id="confirm-msg" class="muted">${message}</p>
        ${extra}
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" data-close autofocus>Cancel</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${esc(confirmLabel)}</button>
        </div>
      </div>`, { className: 'sheet-small', onClose: () => resolve(result) });
    dlg.querySelector('[data-confirm]').addEventListener('click', () => { result = true; closeSheet(dlg); });
  });
}

let toastTimer;
export function toast(message, { actionLabel, onAction, actionHref, duration = 4500 } = {}) {
  const region = document.getElementById('toasts');
  clearTimeout(toastTimer);
  region.innerHTML = `<div class="toast" role="status">
    <span>${esc(message)}</span>
    ${actionHref ? `<a class="toast-action" href="${esc(actionHref)}" target="_blank" rel="noopener noreferrer">${esc(actionLabel)}</a>`
      : actionLabel ? `<button type="button" class="toast-action">${esc(actionLabel)}</button>` : ''}
  </div>`;
  const el = region.firstElementChild;
  el.querySelector('.toast-action')?.addEventListener('click', () => { onAction?.(); hide(); });
  function hide() {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), reducedMotion() ? 0 : 200);
  }
  toastTimer = setTimeout(hide, duration);
}

// Copies text; falls back to selecting it so the user can copy manually.
export async function copyText(text, fallbackEl) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (fallbackEl) { fallbackEl.focus(); fallbackEl.select(); }
    return false;
  }
}
