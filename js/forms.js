// Editors for tasks, events and shortcuts, shown as iOS-style grouped sheets.
import * as store from './store.js';
import { CATEGORIES, ESTIMATES, PRIORITIES, TASK_CATEGORIES, TILE_COLORS, eventTimeError } from './store.js';
import { addDays, formatDate, formatTime, fromMinutes, isValidKey, suggestedStart, todayKey, toMinutes } from './dates.js';
import { closeSheet, confirmDialog, esc, handoffSheet, openSheet, sheetHeader, toast } from './ui.js';
import { GLYPHS, icon } from './icons.js';
import { catLabel, hostOf, tileIcon } from './components.js';

const defined = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined));

const segmented = (name, options, current, label) => `<div class="segmented" role="radiogroup" aria-label="${label}">
  ${options.map(([value, text]) => `<label class="seg"><input type="radio" name="${name}" value="${value}" ${value === current ? 'checked' : ''}><span>${text}</span></label>`).join('')}
</div>`;

const catChips = (name, keys, current) => `<div class="chips" role="radiogroup" aria-label="Category">
  <label class="chip"><input type="radio" name="${name}" value="" ${!current ? 'checked' : ''}><span>None</span></label>
  ${keys.map((k) => `<label class="chip"><input type="radio" name="${name}" value="${k}" ${current === k ? 'checked' : ''}><span><span class="dot cat-${k}"></span>${CATEGORIES[k]}</span></label>`).join('')}
</div>`;

const cellIcon = (name, tone) => `<span class="cell-icon tone-${tone}">${icon(name)}</span>`;
const actionCell = (attr, name, label, danger = false) =>
  `<button type="button" class="cell cell-btn${danger ? ' danger' : ''}" ${attr}>${cellIcon(name, danger ? 'red' : 'accent')}<span class="cell-label">${label}</span></button>`;

// ---------- Task ----------

export function openTaskForm(task, defaults = {}) {
  const today = todayKey();
  const t = task || { title: '', notes: '', due: today, priority: 'normal', category: null, estimate: null, goalId: null, ...defined(defaults) };
  const goals = store.getState().goals.filter((g) => !g.completedAt || g.id === t.goalId);
  const est = t.estimate || { high: 60, normal: 30, low: 15 }[t.priority];
  const dur = (m) => (m >= 60 ? `${m / 60}h`.replace('.5h', '½h') : `${m}m`);
  const dlg = openSheet(`<form class="form" novalidate>
    ${sheetHeader(task ? 'Edit task' : 'New task', { submit: task ? 'Save' : 'Add' })}
    <div class="sheet-body">
      <div>
        <div class="group-list">
          <div class="cell cell-field">
            <label class="sr-only" for="task-title">Task</label>
            <input id="task-title" class="cell-input cell-title" name="title" type="text" maxlength="200" value="${esc(t.title)}" placeholder="What needs doing?" autocomplete="off" enterkeyhint="done" autofocus required>
          </div>
          <div class="cell cell-field">
            <label class="sr-only" for="task-notes">Notes</label>
            <textarea id="task-notes" class="cell-input" name="notes" rows="2" maxlength="2000" placeholder="Notes">${esc(t.notes)}</textarea>
          </div>
        </div>
        <p class="field-error" id="task-title-error" hidden>Give the task a name.</p>
      </div>
      <div class="group-list">
        <label class="cell" for="task-due">${cellIcon('calendar', 'red')}<span class="cell-label">Due date</span>
          <input id="task-due" class="cell-value" name="due" type="date" value="${t.due || ''}"></label>
        <div class="cell cell-chips">
          <button type="button" class="chip-btn" data-due="${today}">Today</button>
          <button type="button" class="chip-btn" data-due="${addDays(today, 1)}">Tomorrow</button>
          <button type="button" class="chip-btn" data-due="${addDays(today, ((8 - new Date().getDay()) % 7) || 7)}">Next week</button>
          <button type="button" class="chip-btn" data-due="">No date</button>
        </div>
      </div>
      <fieldset class="field"><legend class="group-label">Priority</legend>${segmented('priority', Object.entries(PRIORITIES), t.priority, 'Priority')}</fieldset>
      <fieldset class="field"><legend class="group-label">Category</legend>${catChips('category', TASK_CATEGORIES, t.category)}</fieldset>
      <fieldset class="field"><legend class="group-label">How long? <span class="optional">used by Plan My Day</span></legend>
        <div class="segmented est-seg" role="radiogroup" aria-label="Estimated time">${ESTIMATES.map((m) => `<label class="seg"><input type="radio" name="estimate" value="${m}" ${m === est ? 'checked' : ''}><span>${dur(m)}</span></label>`).join('')}</div></fieldset>
      ${goals.length ? `<div class="group-list"><label class="cell" for="task-goal"><span class="cell-icon tone-violet">${icon('target')}</span><span class="cell-label">Goal</span>
        <select id="task-goal" class="cell-value" name="goalId"><option value="">None</option>${goals.map((g) => `<option value="${g.id}" ${t.goalId === g.id ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}</select></label></div>` : ''}
      ${task ? `<div class="group-list">
        ${actionCell('data-complete', task.done ? 'refresh' : 'check', task.done ? 'Reopen task' : 'Mark as done')}
        ${actionCell('data-delete', 'trash', 'Delete task', true)}
      </div>` : ''}
    </div>
  </form>`, { label: task ? 'Edit task' : 'New task' });

  const form = dlg.querySelector('form');
  form.querySelectorAll('[data-due]').forEach((b) => b.addEventListener('click', () => { form.due.value = b.dataset.due; }));
  const values = () => ({
    id: task?.id, title: form.title.value.trim(),
    due: isValidKey(form.due.value) ? form.due.value : null,
    priority: form.priority.value, category: form.category.value || null, notes: form.notes.value,
    estimate: Number(form.estimate.value), goalId: form.goalId ? form.goalId.value || null : t.goalId,
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = values();
    showError(form, 'task-title', !v.title);
    if (!v.title) return form.title.focus();
    const saved = store.saveTask({ ...v, done: task?.done ?? false, completedAt: task?.completedAt });
    closeSheet(dlg);
    toast(task ? 'Task saved' : `Added “${saved.title}”`);
  });
  dlg.querySelector('[data-complete]')?.addEventListener('click', () => {
    const v = values();
    const snap = store.snapshot();
    if (v.title) store.saveTask({ ...v, done: task.done, completedAt: task.completedAt });
    store.setTaskDone(task.id, !task.done);
    closeSheet(dlg);
    toast(task.done ? 'Task reopened' : 'Task completed', { actionLabel: 'Undo', onAction: () => store.restore(snap) });
  });
  dlg.querySelector('[data-delete]')?.addEventListener('click', () => {
    const snap = store.snapshot();
    closeSheet(dlg);
    store.deleteTask(task.id);
    toast('Task deleted', { actionLabel: 'Undo', onAction: () => store.restore(snap) });
  });
  return dlg;
}

// ---------- Event ----------

export function openEventForm(ev, defaults = {}) {
  const start = suggestedStart();
  const base = { title: '', date: todayKey(), allDay: false, start, end: fromMinutes(toMinutes(start) + 60), location: '', notes: '', category: 'personal' };
  const e = ev || { ...base, ...defined(defaults) };
  const s0 = e.start || start;
  const e0 = e.end || fromMinutes(Math.min(toMinutes(s0) + 60, 23 * 60 + 59));
  const dlg = openSheet(`<form class="form" novalidate>
    ${sheetHeader(ev ? 'Edit event' : 'New event', { submit: ev ? 'Save' : 'Add' })}
    <div class="sheet-body">
      <div>
        <div class="group-list">
          <div class="cell cell-field">
            <label class="sr-only" for="ev-title">Event</label>
            <input id="ev-title" class="cell-input cell-title" name="title" type="text" maxlength="200" value="${esc(e.title)}" placeholder="What’s happening?" autocomplete="off" enterkeyhint="done" autofocus required>
          </div>
          <div class="cell cell-field">
            ${icon('pin', 'cell-lead')}
            <label class="sr-only" for="ev-location">Location</label>
            <input id="ev-location" class="cell-input" name="location" type="text" maxlength="200" value="${esc(e.location)}" placeholder="Location" autocomplete="off">
          </div>
        </div>
        <p class="field-error" id="ev-title-error" hidden>Give the event a name.</p>
      </div>
      <div>
        <div class="group-list">
          <label class="cell" for="ev-allday">${cellIcon('sun', 'amber')}<span class="cell-label">All day</span>
            <input id="ev-allday" name="allDay" type="checkbox" class="switch" ${e.allDay ? 'checked' : ''}></label>
          <label class="cell" for="ev-date">${cellIcon('calendar', 'red')}<span class="cell-label">Date</span>
            <input id="ev-date" class="cell-value" name="date" type="date" value="${e.date}" required></label>
          <label class="cell times" for="ev-start" ${e.allDay ? 'hidden' : ''}>${cellIcon('clock', 'blue')}<span class="cell-label">Starts</span>
            <input id="ev-start" class="cell-value" name="start" type="time" value="${s0}"></label>
          <label class="cell times" for="ev-end" ${e.allDay ? 'hidden' : ''}>${cellIcon('clock', 'gray')}<span class="cell-label">Ends</span>
            <input id="ev-end" class="cell-value" name="end" type="time" value="${e0}"></label>
        </div>
        <p class="field-error" id="ev-date-error" hidden>Choose a date.</p>
        <p class="field-error" id="ev-time-error" role="alert" hidden></p>
      </div>
      <fieldset class="field"><legend class="group-label">Category</legend>${catChips('category', Object.keys(CATEGORIES), e.category)}</fieldset>
      <div class="group-list">
        <div class="cell cell-field">
          <label class="sr-only" for="ev-notes">Notes</label>
          <textarea id="ev-notes" class="cell-input" name="notes" rows="2" maxlength="2000" placeholder="Notes">${esc(e.notes)}</textarea>
        </div>
      </div>
      ${ev ? `<div class="group-list">${actionCell('data-delete', 'trash', 'Delete event', true)}</div>` : ''}
    </div>
  </form>`, { label: ev ? 'Edit event' : 'New event' });

  const form = dlg.querySelector('form');
  form.allDay.addEventListener('change', () => {
    form.querySelectorAll('.times').forEach((c) => { c.hidden = form.allDay.checked; });
    showTimeError(form, null);
  });

  // Moving the start keeps the event's length, so the end never lands before it.
  let duration = Math.max(15, toMinutes(form.end.value || '00:00') - toMinutes(form.start.value || '00:00'));
  form.start.addEventListener('change', () => {
    if (!form.start.value) return;
    form.end.value = fromMinutes(Math.min(toMinutes(form.start.value) + duration, 23 * 60 + 59));
    showTimeError(form, null);
  });
  form.end.addEventListener('change', () => {
    if (form.start.value && form.end.value) duration = Math.max(15, toMinutes(form.end.value) - toMinutes(form.start.value));
    showTimeError(form, null);
  });

  form.addEventListener('submit', (evt) => {
    evt.preventDefault();
    const data = {
      id: ev?.id, title: form.title.value.trim(), date: form.date.value, allDay: form.allDay.checked,
      start: form.start.value, end: form.end.value, location: form.location.value, notes: form.notes.value,
      category: form.category.value || null,
    };
    const titleBad = !data.title;
    const dateBad = !isValidKey(data.date);
    const timeErr = eventTimeError(data);
    showError(form, 'ev-title', titleBad);
    showError(form, 'ev-date', dateBad);
    showTimeError(form, timeErr);
    if (titleBad) return form.title.focus();
    if (dateBad) return form.date.focus();
    if (timeErr) return form.end.focus();
    const saved = store.saveEvent(data);
    closeSheet(dlg);
    toast(ev ? 'Event saved' : `Added “${saved.title}” on ${formatDate(saved.date, { month: 'short', day: 'numeric' })}`);
  });
  dlg.querySelector('[data-delete]')?.addEventListener('click', () => confirmDeleteEvent(ev, dlg));
  return dlg;
}

async function confirmDeleteEvent(ev, dlg) {
  const ok = await confirmDialog({ title: 'Delete event?', message: `“${esc(ev.title)}” will be removed from your calendar.`, confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  const snap = store.snapshot();
  if (dlg) closeSheet(dlg);
  store.deleteEvent(ev.id);
  toast('Event deleted', { actionLabel: 'Undo', onAction: () => store.restore(snap) });
}

export function openEventDetail(ev) {
  const when = ev.allDay ? 'All day' : `${formatTime(ev.start)} – ${formatTime(ev.end)}`;
  const dlg = openSheet(`
    ${sheetHeader('Event')}
    <div class="sheet-body detail">
      <div class="detail-head">
        <span class="detail-bar cat-${ev.category || 'none'}"></span>
        <div><h3 class="detail-title">${esc(ev.title)}</h3>
        <p class="muted">${esc(formatDate(ev.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</p>
        <p class="muted">${esc(when)}</p></div>
      </div>
      ${ev.location || ev.category || ev.notes ? `<div class="group-list">
        ${ev.location ? `<div class="cell">${cellIcon('pin', 'red')}<span class="cell-label">${esc(ev.location)}</span></div>` : ''}
        ${ev.category ? `<div class="cell">${cellIcon('flag', 'gray')}<span class="cell-label">${catLabel(ev.category)}</span></div>` : ''}
        ${ev.notes ? `<div class="cell cell-top">${cellIcon('note', 'gray')}<span class="cell-label pre">${esc(ev.notes)}</span></div>` : ''}
      </div>` : ''}
      <div class="group-list">
        ${actionCell('data-edit', 'pencil', 'Edit event')}
        ${actionCell('data-duplicate', 'copyPlus', 'Duplicate')}
        ${actionCell('data-delete', 'trash', 'Delete event', true)}
      </div>
    </div>`, { label: ev.title });
  dlg.querySelector('[data-edit]').addEventListener('click', () => { handoffSheet(dlg); openEventForm(ev); });
  dlg.querySelector('[data-duplicate]').addEventListener('click', () => {
    handoffSheet(dlg);
    const { id, createdAt, demo, ...copy } = ev;
    openEventForm(null, copy);
  });
  dlg.querySelector('[data-delete]').addEventListener('click', () => confirmDeleteEvent(ev, dlg));
}

// ---------- Shortcut ----------

export function openShortcutForm(sc) {
  const s = sc || { name: '', url: '', appUrl: '', icon: { kind: 'glyph', value: 'globe' }, color: 'teal', favorite: false };
  const textIcon = s.icon.kind === 'text' ? s.icon.value : '';
  const dlg = openSheet(`<form class="form" novalidate>
    ${sheetHeader(sc ? 'Edit shortcut' : 'New shortcut', { submit: sc ? 'Save' : 'Add' })}
    <div class="sheet-body">
      <div class="tile-preview" aria-hidden="true"></div>
      <div>
        <div class="group-list">
          <div class="cell cell-field">
            <label class="sr-only" for="sc-name">Name</label>
            <input id="sc-name" class="cell-input cell-title" name="name" type="text" maxlength="40" value="${esc(s.name)}" placeholder="Name, like Class portal" autocomplete="off" autofocus required>
          </div>
          <div class="cell cell-field">
            ${icon('globe', 'cell-lead')}
            <label class="sr-only" for="sc-url">Website</label>
            <input id="sc-url" class="cell-input" name="url" type="url" inputmode="url" value="${esc(s.url)}" placeholder="Website, like example.com" autocomplete="off" autocapitalize="off" spellcheck="false" required>
          </div>
        </div>
        <p class="field-error" id="sc-name-error" hidden>Give the shortcut a name.</p>
        <p class="field-error" id="sc-url-error" hidden>Enter a website address, like example.com.</p>
      </div>
      <details class="field advanced" ${s.appUrl ? 'open' : ''}>
        <summary>App link <span class="optional">optional</span></summary>
        <div class="group-list"><div class="cell cell-field">
          <label class="sr-only" for="sc-app">App link</label>
          <input id="sc-app" class="cell-input" name="appUrl" type="text" value="${esc(s.appUrl)}" placeholder="e.g. spotify:" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="sc-app-help">
        </div></div>
        <p class="hint" id="sc-app-help">Some apps open with a link like <code>spotify:</code>. Browsers can’t check whether an app is installed, so Evenday tries the app and offers the website if nothing opens.</p>
        <p class="field-error" id="sc-app-error" hidden>App links look like <code>name:</code> and can’t be web or script links.</p>
      </details>
      <fieldset class="field"><legend class="group-label">Icon</legend>
        <div class="glyph-grid">
          ${GLYPHS.map((g) => `<label class="glyph"><input type="radio" name="icon" value="${g}" ${s.icon.kind === 'glyph' && s.icon.value === g ? 'checked' : ''} aria-label="${g}">${icon(g)}</label>`).join('')}
          <label class="glyph glyph-text"><input type="radio" name="icon" value=":text" ${s.icon.kind === 'text' ? 'checked' : ''} aria-label="Letter or emoji"><span>Aa</span></label>
        </div>
        <div class="text-icon-row" ${s.icon.kind === 'text' ? '' : 'hidden'}>
          <div class="group-list"><div class="cell cell-field">
            <label class="sr-only" for="sc-text">Letter or emoji</label>
            <input id="sc-text" class="cell-input" name="iconText" type="text" maxlength="8" value="${esc(textIcon)}" placeholder="Letter or emoji">
          </div></div>
        </div>
      </fieldset>
      <fieldset class="field"><legend class="group-label">Color</legend>
        <div class="swatches">${TILE_COLORS.map((c) => `<label class="swatch tile-${c}"><input type="radio" name="color" value="${c}" ${s.color === c ? 'checked' : ''} aria-label="${c}"></label>`).join('')}</div>
      </fieldset>
      <div class="group-list">
        <label class="cell" for="sc-fav">${cellIcon('star', 'amber')}<span class="cell-label">Show on Today</span>
          <input id="sc-fav" name="favorite" type="checkbox" class="switch" ${s.favorite ? 'checked' : ''}></label>
      </div>
      ${sc ? `<div class="group-list">${actionCell('data-delete', 'trash', 'Remove shortcut', true)}</div>` : ''}
    </div>
  </form>`, { label: sc ? 'Edit shortcut' : 'New shortcut' });

  const form = dlg.querySelector('form');
  const textRow = form.querySelector('.text-icon-row');
  const read = () => {
    const isText = form.icon.value === ':text';
    const name = form.name.value.trim();
    return {
      id: sc?.id, name, url: form.url.value, appUrl: form.appUrl.value, color: form.color.value,
      favorite: form.favorite.checked,
      icon: isText ? { kind: 'text', value: form.iconText.value.trim() || ([...name][0] || 'A').toUpperCase() } : { kind: 'glyph', value: form.icon.value },
    };
  };
  const preview = () => {
    const d = read();
    textRow.hidden = form.icon.value !== ':text';
    const url = store.normalizeUrl(d.url);
    form.querySelector('.tile-preview').innerHTML = `${tileIcon(d)}<span class="tile-name">${esc(d.name || 'Shortcut')}</span><span class="tile-host">${url ? esc(hostOf(url)) : '&nbsp;'}</span>`;
  };
  form.addEventListener('input', preview);
  form.addEventListener('change', preview);
  preview();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = read();
    const errs = { 'sc-name': !d.name, 'sc-url': !store.normalizeUrl(d.url), 'sc-app': store.normalizeAppUrl(d.appUrl) === null };
    Object.entries(errs).forEach(([id, bad]) => showError(form, id, bad));
    const firstBad = Object.keys(errs).find((k) => errs[k]);
    if (firstBad) {
      if (firstBad === 'sc-app') form.querySelector('.advanced').open = true;
      return form.querySelector('#' + firstBad).focus();
    }
    store.saveShortcut(d);
    closeSheet(dlg);
    toast(sc ? 'Shortcut saved' : `Added “${d.name}”`);
  });
  dlg.querySelector('[data-delete]')?.addEventListener('click', () => {
    const snap = store.snapshot();
    closeSheet(dlg);
    store.deleteShortcut(sc.id);
    toast('Shortcut removed', { actionLabel: 'Undo', onAction: () => store.restore(snap) });
  });
}

// ---------- helpers ----------

function showError(form, id, show) {
  const input = form.querySelector('#' + id);
  const err = form.querySelector(`#${id}-error`);
  if (!input || !err) return;
  err.hidden = !show;
  input.setAttribute('aria-invalid', show ? 'true' : 'false');
  if (show) input.setAttribute('aria-describedby', `${id}-error`);
  else if (input.getAttribute('aria-describedby') === `${id}-error`) input.removeAttribute('aria-describedby');
}

function showTimeError(form, msg) {
  const err = form.querySelector('#ev-time-error');
  err.hidden = !msg;
  err.textContent = msg || '';
  form.end.setAttribute('aria-invalid', msg ? 'true' : 'false');
}
