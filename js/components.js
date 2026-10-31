// Shared render helpers used by several views and forms.
import { CATEGORIES } from './store.js';
import { diffDays, formatTime, relativeDay, todayKey } from './dates.js';
import { esc } from './ui.js';
import { icon } from './icons.js';

export function emptyState(iconName, title, text, action = '') {
  return `<div class="empty">
    <span class="empty-icon">${icon(iconName)}</span>
    <p class="empty-title">${esc(title)}</p>
    ${text ? `<p class="empty-text">${text}</p>` : ''}
    ${action}
  </div>`;
}

export const catLabel = (c) => (c ? `<span class="cat cat-${c}"><span class="dot"></span>${CATEGORIES[c]}</span>` : '');

export function taskRow(t, { showDue = true, today = todayKey() } = {}) {
  const overdue = !t.done && t.due && t.due < today;
  const meta = [];
  if (showDue && t.due) {
    meta.push(overdue
      ? `<span class="due overdue">${diffDays(t.due, today) === 1 ? 'Yesterday' : 'Overdue · ' + esc(relativeDay(t.due, today))}</span>`
      : `<span class="due">${esc(relativeDay(t.due, today))}</span>`);
  }
  if (t.priority === 'high') meta.push(`<span class="prio prio-high">${icon('flag')}High</span>`);
  if (t.priority === 'low') meta.push('<span class="prio prio-low">Low</span>');
  if (t.category) meta.push(catLabel(t.category));
  if (t.notes) meta.push(`<span class="has-notes" title="Has notes">${icon('note')}</span>`);
  return `<li class="task-row${t.done ? ' is-done' : ''}" data-task="${t.id}" data-done-label="${t.done ? 'Reopen' : 'Done'}">
    <div class="row-inner">
    <button type="button" class="check" role="checkbox" aria-checked="${t.done}" data-action="toggle-task" data-id="${t.id}"
      data-focus="check-${t.id}" aria-label="${t.done ? 'Reopen' : 'Complete'}: ${esc(t.title)}">${icon('check')}</button>
    <button type="button" class="task-main" data-action="edit-task" data-id="${t.id}" data-focus="task-${t.id}">
      <span class="task-title">${esc(t.title)}</span>
      ${meta.length ? `<span class="task-meta">${meta.join('')}</span>` : ''}
    </button>
    </div>
  </li>`;
}

export function sortEvents(list) {
  return [...list].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1)
    : a.allDay !== b.allDay ? (a.allDay ? -1 : 1)
    : (a.start || '').localeCompare(b.start || '') || a.title.localeCompare(b.title)));
}

export function eventRow(e, { showDate = false, past = false } = {}) {
  const when = e.allDay
    ? '<span class="ev-start">All day</span>'
    : `<span class="ev-start">${esc(formatTime(e.start))}</span><span class="ev-end">${esc(formatTime(e.end))}</span>`;
  return `<li><button type="button" class="event-row${past ? ' is-past' : ''}" data-action="view-event" data-id="${e.id}" data-focus="event-${e.id}">
    <span class="ev-when">${showDate ? `<span class="ev-day">${esc(relativeDay(e.date))}</span>` : ''}${when}</span>
    <span class="ev-bar cat-${e.category || 'none'}"></span>
    <span class="ev-body">
      <span class="ev-title">${esc(e.title)}</span>
      ${e.location ? `<span class="ev-meta">${icon('pin')}${esc(e.location)}</span>` : ''}
    </span>
  </button></li>`;
}

export function tileIcon(s, cls = '') {
  const inner = s.icon.kind === 'glyph' ? icon(s.icon.value) : `<span class="tile-text">${esc(s.icon.value)}</span>`;
  return `<span class="tile-icon tile-${s.color} ${cls}" aria-hidden="true">${inner}</span>`;
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

// iOS-style header: a compact bar (buttons + a title that appears on scroll) above a large title.
export function pageHeader({ title, eyebrow = '', summary = '', actions = '', back = false }) {
  return `<div class="topbar">
    <div class="topbar-side">${back ? `<button type="button" class="nav-btn back-btn" data-action="go-back">${icon('back')}Back</button>` : ''}</div>
    <span class="topbar-title" aria-hidden="true">${esc(title)}</span>
    <div class="topbar-side topbar-actions">${actions}</div>
  </div>
  <header class="page-head">
    ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
    <h1>${esc(title)}</h1>
    ${summary ? `<p class="summary">${summary}</p>` : ''}
  </header>`;
}

export function captureBar(placeholder = 'Add a task or event…') {
  return `<div class="capture-bar">
    <button type="button" class="capture-open" data-action="quick-add">${icon('wand')}<span>${esc(placeholder)}</span></button>
    <button type="button" class="capture-mic" data-action="quick-voice" aria-label="Add by voice">${icon('mic')}</button>
  </div>`;
}
