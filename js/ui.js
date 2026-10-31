// Small UI helpers: escaping, dialogs, confirmations and toasts.

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const reducedMotion = () => document.documentElement.dataset.motion === 'reduce' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Opens a modal sheet. `content` is HTML for the inside of the dialog.
// Returns the <dialog>; it removes itself once closed.
export function openSheet(content, { label, onClose, className = '' } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = `sheet ${className}`;
  if (label) dlg.setAttribute('aria-label', label);
  dlg.innerHTML = `<div class="grabber" aria-hidden="true"></div>${content}`;
  document.body.append(dlg);
  enableDragToClose(dlg);
  const opener = handoffOpener || document.activeElement;
  handoffOpener = null;
  dlg._opener = opener;

  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) closeSheet(dlg); // backdrop
    if (e.target.closest('[data-close]')) closeSheet(dlg);
  });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(dlg); });
  dlg.addEventListener('close', () => {
    // Hand any visible toast back to the page (or the sheet underneath) before this one goes.
    const region = dlg.querySelector('#toasts');
    if (region) {
      ([...document.querySelectorAll('dialog[open]')].filter((d) => d !== dlg).pop() || document.body).append(region);
      if (region.children.length) showRegion(region);
    }
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

function showRegion(region) {
  if (!region.showPopover) return;
  try { if (region.matches(':popover-open')) region.hidePopover(); region.showPopover(); } catch { /* fixed positioning still works */ }
}

export function closeSheet(dlg) {
  if (!dlg.open || dlg.classList.contains('closing')) return;
  if (reducedMotion()) return dlg.close();
  dlg.classList.add('closing');
  setTimeout(() => dlg.close(), 160);
}

// iOS-style sheet header: Cancel on the left, the main action on the right.
// With `submit`, the right button submits the surrounding form; otherwise it reads "Done".
export function sheetHeader(title, { submit, extra = '' } = {}) {
  return `<header class="sheet-head">
    <button type="button" class="nav-btn" data-close>${submit ? 'Cancel' : 'Close'}</button>
    <h2 class="sheet-title">${esc(title)}</h2>
    ${submit ? `<button type="submit" class="nav-btn nav-primary">${esc(submit)}</button>` : '<span class="nav-btn" aria-hidden="true"></span>'}
  </header>${extra ? `<div class="sheet-sub">${extra}</div>` : ''}`;
}

// Drag the grabber or header down to dismiss a sheet on phones.
function enableDragToClose(dlg) {
  let startY = null;
  let dy = 0;
  dlg.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.grabber, .sheet-head') || e.target.closest('button, input, a, label')) return;
    if (matchMedia('(min-width: 640px)').matches) return;
    startY = e.clientY;
    dy = 0;
    dlg.setPointerCapture(e.pointerId);
    dlg.classList.add('dragging');
  });
  dlg.addEventListener('pointermove', (e) => {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
    dlg.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (startY === null) return;
    startY = null;
    dlg.classList.remove('dragging');
    if (dy > 110) {
      dlg.style.transform = 'translateY(100%)';
      setTimeout(() => dlg.close(), reducedMotion() ? 0 : 180);
    } else {
      dlg.style.transform = '';
    }
  };
  dlg.addEventListener('pointerup', end);
  dlg.addEventListener('pointercancel', end);
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
let toastIsFresh = false;
let hideCurrentToast = null;

// Any later data change makes an older Undo unsafe (it would roll that change back too), so drop it.
export function onDataChange() {
  if (!toastIsFresh && hideCurrentToast && document.querySelector('#toasts .toast-action')) hideCurrentToast();
}
export function toast(message, { actionLabel, onAction, actionHref, duration = 4500 } = {}) {
  const region = document.getElementById('toasts');
  clearTimeout(toastTimer);
  // Everything outside an open modal sheet is inert, so the toast lives inside the top sheet
  // while one is open, and joins the top layer as a popover so it draws above everything.
  const host = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
  if (region.parentElement !== host) host.append(region);
  showRegion(region);
  region.innerHTML = `<div class="toast" role="status">
    <span>${esc(message)}</span>
    ${actionHref ? `<a class="toast-action" href="${esc(actionHref)}" target="_blank" rel="noopener noreferrer">${esc(actionLabel)}</a>`
      : actionLabel ? `<button type="button" class="toast-action">${esc(actionLabel)}</button>` : ''}
  </div>`;
  const el = region.firstElementChild;
  el.querySelector('.toast-action')?.addEventListener('click', () => { onAction?.(); hide(); });
  function hide() {
    if (hideCurrentToast === hide) hideCurrentToast = null;
    el.classList.add('leaving');
    setTimeout(() => {
      el.remove();
      if (!region.children.length && region.hidePopover) { try { region.hidePopover(); } catch { /* not open */ } }
    }, reducedMotion() ? 0 : 200);
  }
  hideCurrentToast = hide;
  toastIsFresh = true;
  setTimeout(() => { toastIsFresh = false; }, 0);
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
