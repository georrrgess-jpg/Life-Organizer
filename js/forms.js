// Editors for tasks, events and shortcuts, shown as modal sheets.
import * as store from './store.js';
import { CATEGORIES, PRIORITIES, TASK_CATEGORIES, TILE_COLORS, eventTimeError } from './store.js';
import { addDays, formatDate, formatTime, fromMinutes, isValidKey, suggestedStart, todayKey, toMinutes } from './dates.js';
import { closeSheet, confirmDialog, esc, handoffSheet, openSheet, sheetHeader, toast } from './ui.js';
import { GLYPHS, icon } from './icons.js';
import { catLabel, hostOf, tileIcon } from './components.js';

const radios = (name, options, current) => `<div class="segmented" role="radiogroup">
  ${options.map(([value, label]) => `<label class="seg"><input type="radio" name="${name}" value="${value}" ${value === current ? 'checked' : ''}><span>${label}</span></label>`).join('')}
</div>`;

const catChips = (name, keys, current) => `<div class="chips" role="radiogroup">
  <label class="chip"><input type="radio" name="${name}" value="" ${!current ? 'checked' : ''}><span>None</span></label>
  ${keys.map((k) => `<label class="chip"><input type="radio" name="${name}" value="${k}" ${current === k ? 'checked' : ''}><span><span class="dot cat-${k}"></span>${CATEGORIES[k]}</span></label>`).join('')}
</div>`;

const switcher = (kind) => `<div class="segmented kind-switch" role="radiogroup" aria-label="Type">
  <label class="seg"><input type="radio" name="kind" value="task" ${kind === 'task' ? 'checked' : ''}><span>Task</span></label>
  <label class="seg"><input type="radio" name="kind" value="event" ${kind === 'event' ? 'checked' : ''}><span>Event</span></label>
</div>`;

const deleteBtn = (show) => (show ? `<button type="button" class="btn btn-ghost-danger" data-delete>${icon('trash')}Delete</button>` : '<span></span>');

// Quick add from the "+" button: one sheet that switches between Task and Event.
export function openQuickAdd(kind = 'task', defaults = {}) {
  return kind === 'event' ? openEventForm(null, defaults, true) : openTaskForm(null, defaults, true);
}

// ---------- Task ----------

export function openTaskForm(task, defaults = {}, switchable = false) {
  const t = task || { title: '', notes: '', due: defaults.due ?? todayKey(), priority: 'normal', category: null };
  const today = todayKey();
  const dlg = openSheet(`<form class="form" novalidate>
    ${sheetHeader(task ? 'Edit task' : 'New task', switchable ? switcher('task') : '')}
    <div class="sheet-body">
      <div class="field">
        <label for="task-title">Task</label>
        <input id="task-title" name="title" type="text" maxlength="200" value="${esc(t.title)}" placeholder="What needs doing?" autocomplete="off" autofocus required>
        <p class="field-error" id="task-title-error" hidden>Give the task a name.</p>
      </div>
      <div class="field">
        <label for="task-due">Due date <span class="optional">optional</span></label>
        <div class="date-row">
          <input id="task-due" name="due" type="date" value="${t.due || ''}">
          <button type="button" class="chip-btn" data-due="${today}">Today</button>
          <button type="button" class="chip-btn" data-due="${addDays(today, 1)}">Tomorrow</button>
          <button type="button" class="chip-btn" data-due="">No date</button>
        </div>
      </div>
      <fieldset class="field"><legend>Priority</legend>${radios('priority', Object.entries(PRIORITIES), t.priority)}</fieldset>
      <fieldset class="field"><legend>Category</legend>${catChips('category', TASK_CATEGORIES, t.category)}</fieldset>
      <div class="field">
        <label for="task-notes">Notes <span class="optional">optional</span></label>
        <textarea id="task-notes" name="notes" rows="3" maxlength="2000">${esc(t.notes)}</textarea>
      </div>
    </div>
    <footer class="sheet-foot">
      ${deleteBtn(!!task)}
      <div class="foot-actions">
        <button type="button" class="btn btn-secondary" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">${task ? 'Save' : 'Add task'}</button>
      </div>
    </footer>
  </form>`, { label: task ? 'Edit task' : 'New task' });

  const form = dlg.querySelector('form');
  bindSwitcher(dlg, form, (kind) => kind === 'event' && openEventForm(null, { date: form.due.value || todayKey(), title: form.title.value }, true));
  form.querySelectorAll('[data-due]').forEach((b) => b.addEventListener('click', () => { form.due.value = b.dataset.due; }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = form.title.value.trim();
    showError(form, 'task-title', !title);
    if (!title) return form.title.focus();
    const saved = store.saveTask({
      id: task?.id, title,
      due: isValidKey(form.due.value) ? form.due.value : null,
      priority: form.priority.value, category: form.category.value || null,
      notes: form.notes.value, done: task?.done ?? false, completedAt: task?.completedAt,
    });
    closeSheet(dlg);
    toast(task ? 'Task saved' : `Added “${saved.title}”`);
  });
  dlg.querySelector('[data-delete]')?.addEventListener('click', async () => {
    const snap = store.snapshot();
    closeSheet(dlg);
    store.deleteTask(task.id);
    toast('Task deleted', { actionLabel: 'Undo', onAction: () => store.restore(snap) });
  });
  return dlg;
}

// ---------- Event ----------

export function openEventForm(ev, defaults = {}, switchable = false) {
  const start = suggestedStart();
  const e = ev || {
    title: defaults.title || '', date: defaults.date || todayKey(), allDay: false,
    start, end: fromMinutes(toMinutes(start) + 60), location: '', notes: '', category: 'personal',
  };
  const dlg = openSheet(`<form class="form" novalidate>
    ${sheetHeader(ev ? 'Edit event' : 'New event', switchable ? switcher('event') : '')}
    <div class="sheet-body">
      <div class="field">
        <label for="ev-title">Event</label>
        <input id="ev-title" name="title" type="text" maxlength="200" value="${esc(e.title)}" placeholder="What’s happening?" autocomplete="off" autofocus required>
        <p class="field-error" id="ev-title-error" hidden>Give the event a name.</p>
      </div>
      <div class="field-grid">
        <div class="field">
          <label for="ev-date">Date</label>
          <input id="ev-date" name="date" type="date" value="${e.date}" required>
          <p class="field-error" id="ev-date-error" hidden>Choose a date.</p>
        </div>
        <label class="switch-row" for="ev-allday">
          <span>All day</span>
          <input id="ev-allday" name="allDay" type="checkbox" class="switch" ${e.allDay ? 'checked' : ''}>
        </label>
      </div>
      <div class="field-grid times" ${e.allDay ? 'hidden' : ''}>
        <div class="field"><label for="ev-start">Starts</label><input id="ev-start" name="start" type="time" value="${e.start || start}"></div>
        <div class="field"><label for="ev-end">Ends</label><input id="ev-end" name="end" type="time" value="${e.end || fromMinutes(toMinutes(start) + 60)}"></div>
      </div>
      <p class="field-error" id="ev-time-error" role="alert" hidden></p>
      <fieldset class="field"><legend>Category</legend>${catChips('category', Object.keys(CATEGORIES), e.category)}</fieldset>
      <div class="field">
        <label for="ev-location">Location <span class="optional">optional</span></label>
        <input id="ev-location" name="location" type="text" maxlength="200" value="${esc(e.location)}" autocomplete="off">
      </div>
      <div class="field">
        <label for="ev-notes">Notes <span class="optional">optional</span></label>
        <textarea id="ev-notes" name="notes" rows="3" maxlength="2000">${esc(e.notes)}</textarea>
      </div>
    </div>
    <footer class="sheet-foot">
      ${deleteBtn(!!ev)}
      <div class="foot-actions">
        <button type="button" class="btn btn-secondary" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">${ev ? 'Save' : 'Add event'}</button>
      </div>
    </footer>
  </form>`, { label: ev ? 'Edit event' : 'New event' });

  const form = dlg.querySelector('form');
  const times = form.querySelector('.times');
  bindSwitcher(dlg, form, (kind) => kind === 'task' && openTaskForm(null, { due: form.date.value || todayKey() }, true));
  form.allDay.addEventListener('change', () => { times.hidden = form.allDay.checked; showTimeError(form, null); });

  // Moving the start keeps the event's length, so the end never lands before it.
  let duration = Math.max(15, toMinutes(form.end.value || '00:00') - toMinutes(form.start.value || '00:00'));
  form.start.addEventListener('change', () => {
    if (!form.start.value) return;
    const end = Math.min(toMinutes(form.start.value) + duration, 23 * 60 + 59);
    form.end.value = fromMinutes(end);
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
      <h3 class="detail-title"><span class="dot cat-${ev.category || 'none'}"></span>${esc(ev.title)}</h3>
      <ul class="detail-list">
        <li>${icon('calendar')}<span>${esc(formatDate(ev.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</span></li>
        <li>${icon('clock')}<span>${esc(when)}</span></li>
        ${ev.location ? `<li>${icon('pin')}<span>${esc(ev.location)}</span></li>` : ''}
        ${ev.category ? `<li>${icon('flag')}<span>${catLabel(ev.category)}</span></li>` : ''}
        ${ev.notes ? `<li>${icon('note')}<span class="pre">${esc(ev.notes)}</span></li>` : ''}
      </ul>
    </div>
    <footer class="sheet-foot">
      ${deleteBtn(true)}
      <div class="foot-actions"><button type="button" class="btn btn-primary" data-edit autofocus>${icon('pencil')}Edit</button></div>
    </footer>`, { label: ev.title });
  dlg.querySelector('[data-edit]').addEventListener('click', () => {
    handoffSheet(dlg);
    openEventForm(ev);
  });
  dlg.querySelector('[data-delete]').addEventListener('click', () => confirmDeleteEvent(ev, dlg));
}

// ---------- Shortcut ----------

export function openShortcutForm(sc) {
  const s = sc || { name: '', url: '', appUrl: '', icon: { kind: 'glyph', value: 'globe' }, color: 'teal', favorite: false };
  const textIcon = s.icon.kind === 'text' ? s.icon.value : '';
  const dlg = openSheet(`<form class="form" novalidate>
    ${sheetHeader(sc ? 'Edit shortcut' : 'New shortcut')}
    <div class="sheet-body">
      <div class="tile-preview" aria-hidden="true"></div>
      <div class="field">
        <label for="sc-name">Name</label>
        <input id="sc-name" name="name" type="text" maxlength="40" value="${esc(s.name)}" placeholder="e.g. Class portal" autocomplete="off" autofocus required>
        <p class="field-error" id="sc-name-error" hidden>Give the shortcut a name.</p>
      </div>
      <div class="field">
        <label for="sc-url">Website</label>
        <input id="sc-url" name="url" type="url" inputmode="url" value="${esc(s.url)}" placeholder="example.com" autocomplete="off" autocapitalize="off" spellcheck="false" required>
        <p class="field-error" id="sc-url-error" hidden>Enter a website address, like example.com.</p>
      </div>
      <details class="field advanced" ${s.appUrl ? 'open' : ''}>
        <summary>App link <span class="optional">optional</span></summary>
        <input id="sc-app" name="appUrl" type="text" value="${esc(s.appUrl)}" placeholder="e.g. spotify:" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="sc-app-help">
        <p class="hint" id="sc-app-help">Some apps can be opened with a link like <code>spotify:</code>. Browsers can’t check whether the app is installed, so Evenday tries the app and offers the website if nothing opens.</p>
        <p class="field-error" id="sc-app-error" hidden>App links look like <code>name:</code> and can’t be web or script links.</p>
      </details>
      <fieldset class="field"><legend>Icon</legend>
        <div class="glyph-grid">
          ${GLYPHS.map((g) => `<label class="glyph"><input type="radio" name="icon" value="${g}" ${s.icon.kind === 'glyph' && s.icon.value === g ? 'checked' : ''} aria-label="${g}">${icon(g)}</label>`).join('')}
          <label class="glyph glyph-text"><input type="radio" name="icon" value=":text" ${s.icon.kind === 'text' ? 'checked' : ''} aria-label="Letter or emoji"><span>Aa</span></label>
        </div>
        <div class="text-icon-row" ${s.icon.kind === 'text' ? '' : 'hidden'}>
          <label for="sc-text">Letter or emoji</label>
          <input id="sc-text" name="iconText" type="text" maxlength="8" value="${esc(textIcon)}" placeholder="A">
        </div>
      </fieldset>
      <fieldset class="field"><legend>Color</legend>
        <div class="swatches">${TILE_COLORS.map((c) => `<label class="swatch tile-${c}"><input type="radio" name="color" value="${c}" ${s.color === c ? 'checked' : ''} aria-label="${c}"></label>`).join('')}</div>
      </fieldset>
      <label class="switch-row" for="sc-fav">
        <span><strong>Show on Today</strong><br><span class="muted small">Favorites appear on your Today screen.</span></span>
        <input id="sc-fav" name="favorite" type="checkbox" class="switch" ${s.favorite ? 'checked' : ''}>
      </label>
    </div>
    <footer class="sheet-foot">
      ${deleteBtn(!!sc)}
      <div class="foot-actions">
        <button type="button" class="btn btn-secondary" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">${sc ? 'Save' : 'Add shortcut'}</button>
      </div>
    </footer>
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
    if (firstBad) return form.querySelector('#' + firstBad).focus();
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

function bindSwitcher(dlg, form, open) {
  form.querySelectorAll('input[name="kind"]').forEach((r) => r.addEventListener('change', () => {
    handoffSheet(dlg);
    open(r.value);
  }));
}

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
