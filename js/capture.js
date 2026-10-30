// Quick add: type or dictate anything, preview the tasks and events Evenday understood, then add them.
import * as store from './store.js';
import { parseCapture } from './parse.js';
import { listen, voiceSupported } from './voice.js';
import { formatTime, relativeDay, todayKey } from './dates.js';
import { esc, handoffSheet, openSheet, closeSheet, sheetHeader, toast } from './ui.js';
import { catLabel } from './components.js';
import { icon } from './icons.js';
import { openEventForm, openShortcutForm, openTaskForm } from './forms.js';
import { openGoalForm, openHabitForm } from './views/life.js';

const EXAMPLES = ['Call mom tomorrow', 'Team meeting Mon 10–11am #work', 'Essay due Friday !', 'Lunch with Sam at Joe’s Café Sat 12:30'];
const dayFirst = () => !/^en(-US)?$/i.test(navigator.language || 'en-US');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// `due` is the default date for drafts without one (null = no due date).
export function openCapture({ due = todayKey(), listenNow = false } = {}) {
  const dlg = openSheet(`<form class="form capture" novalidate>
    ${sheetHeader('Quick add', { submit: 'Add' })}
    <div class="sheet-body">
      <div class="capture-box">
        <label class="sr-only" for="capture-text">Describe your tasks or events</label>
        <textarea id="capture-text" rows="3" autofocus enterkeyhint="done" autocomplete="off"
          placeholder="Type or say what’s on your mind, like “Dentist Friday 3pm, buy milk”"></textarea>
        ${voiceSupported() ? `<button type="button" class="mic" data-mic aria-pressed="false" aria-label="Dictate">${icon('mic')}</button>` : ''}
      </div>
      <p class="capture-status" role="status" aria-live="polite"></p>
      <div class="capture-examples">
        <p class="group-label">Try</p>
        <div class="chips">${EXAMPLES.map((x) => `<button type="button" class="chip-btn" data-example="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      </div>
      <div class="capture-preview" hidden>
        <p class="group-label" id="drafts-label">Will add</p>
        <ul class="draft-list" aria-labelledby="drafts-label"></ul>
      </div>
      <div>
        <p class="group-label">Or start from a blank form</p>
        <div class="group-list">
          <button type="button" class="cell cell-btn" data-manual="task"><span class="cell-icon tone-accent">${icon('tasks')}</span><span class="cell-label">New task</span>${icon('chevronRight', 'chev')}</button>
          <button type="button" class="cell cell-btn" data-manual="event"><span class="cell-icon tone-blue">${icon('calendar')}</span><span class="cell-label">New event</span>${icon('chevronRight', 'chev')}</button>
          <button type="button" class="cell cell-btn" data-manual="habit"><span class="cell-icon tone-amber">${icon('flame')}</span><span class="cell-label">New habit</span>${icon('chevronRight', 'chev')}</button>
          <button type="button" class="cell cell-btn" data-manual="goal"><span class="cell-icon tone-red">${icon('target')}</span><span class="cell-label">New goal</span>${icon('chevronRight', 'chev')}</button>
          <button type="button" class="cell cell-btn" data-manual="shortcut"><span class="cell-icon tone-violet">${icon('grid')}</span><span class="cell-label">New shortcut</span>${icon('chevronRight', 'chev')}</button>
        </div>
      </div>
      <button type="button" class="link-btn" data-help>${icon('info')}What can I type?</button>
    </div>
  </form>`, { label: 'Quick add', className: 'sheet-tall' });

  const form = dlg.querySelector('form');
  const input = form.querySelector('#capture-text');
  const status = form.querySelector('.capture-status');
  const addBtn = form.querySelector('.nav-primary');
  const mic = form.querySelector('[data-mic]');
  const overrides = new Map(); // source text -> { kind, removed }
  let drafts = [];
  let stop = null;

  const fallbackDate = () => due || todayKey();
  const finalDraft = (d) => {
    const o = overrides.get(d.source) || {};
    const kind = o.kind || d.kind;
    if (kind === d.kind) return { ...d, kind };
    return kind === 'event'
      ? { ...d, kind, allDay: true, start: null, end: null }
      : { ...d, kind, start: null, end: null, allDay: false, location: '' };
  };
  const active = () => drafts.filter((d) => !(overrides.get(d.source) || {}).removed).map(finalDraft);

  function render() {
    drafts = parseCapture(input.value, { dayFirst: dayFirst() });
    const list = active();
    form.querySelector('.capture-examples').hidden = Boolean(input.value.trim());
    form.querySelector('.capture-preview').hidden = !drafts.length;
    addBtn.disabled = !list.length;
    addBtn.textContent = list.length > 1 ? `Add ${list.length}` : 'Add';
    form.querySelector('.draft-list').innerHTML = drafts.map((raw) => {
      const removed = (overrides.get(raw.source) || {}).removed;
      const d = finalDraft(raw);
      const isEvent = d.kind === 'event';
      const date = isEvent ? d.date || fallbackDate() : d.date ?? due;
      const meta = [
        date ? esc(relativeDay(date)) : 'No date',
        isEvent ? (d.allDay ? 'All day' : `${esc(formatTime(d.start))} – ${esc(formatTime(d.end))}`) : '',
        d.notes ? esc(d.notes) : '',
        d.priority === 'high' ? `<span class="prio-high">${icon('flag')}High</span>` : d.priority === 'low' ? 'Low priority' : '',
        !isEvent && d.estimate ? `${icon('clock')}${d.estimate} min` : '',
        d.category ? catLabel(d.category) : '',
        d.location ? `${icon('pin')}${esc(d.location)}` : '',
      ].filter(Boolean);
      return `<li class="draft${removed ? ' is-removed' : ''}">
        <span class="draft-icon ${isEvent ? 'tone-blue' : 'tone-accent'}">${icon(isEvent ? 'calendar' : 'tasks')}</span>
        <span class="draft-body">
          <span class="draft-title">${esc(d.title)}</span>
          <span class="draft-meta">${meta.map((m) => `<span>${m}</span>`).join('')}</span>
        </span>
        ${removed
          ? `<button type="button" class="chip-btn" data-restore="${esc(raw.source)}">Undo</button>`
          : `<button type="button" class="kind-btn" data-kind="${esc(raw.source)}" aria-label="${isEvent ? 'Event' : 'Task'}. Change to ${isEvent ? 'task' : 'event'}">${isEvent ? 'Event' : 'Task'}${icon('swap')}</button>
             <button type="button" class="btn-icon btn-sm" data-remove="${esc(raw.source)}" aria-label="Don’t add ${esc(d.title)}">${icon('x')}</button>`}
      </li>`;
    }).join('');
  }

  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const key = t.dataset.kind || t.dataset.remove || t.dataset.restore;
    if (t.dataset.example) {
      input.value = input.value.trim() ? `${input.value.trim()}, ${t.dataset.example}` : t.dataset.example;
      render();
      input.focus();
    } else if (t.dataset.kind) {
      const d = drafts.find((x) => x.source === key);
      const cur = finalDraft(d).kind;
      overrides.set(key, { ...overrides.get(key), kind: cur === 'event' ? 'task' : 'event' });
      render();
      form.querySelector(`[data-kind="${CSS.escape(key)}"]`)?.focus();
    } else if (t.dataset.remove || t.dataset.restore) {
      overrides.set(key, { ...overrides.get(key), removed: Boolean(t.dataset.remove) });
      render();
      form.querySelector(`[data-restore="${CSS.escape(key)}"], [data-remove="${CSS.escape(key)}"]`)?.focus();
    } else if (t.dataset.manual) {
      const kind = t.dataset.manual;
      const one = active().filter((d) => d.kind === kind);
      const d = one.length === 1 ? one[0] : null;
      handoffSheet(dlg);
      if (kind === 'task') openTaskForm(null, d ? { title: d.title, due: d.date ?? due, priority: d.priority, category: d.category, notes: d.notes } : { due });
      else if (kind === 'event') openEventForm(null, d ? { ...d, date: d.date || fallbackDate() } : { date: fallbackDate() });
      else if (kind === 'habit') openHabitForm(null);
      else if (kind === 'goal') openGoalForm(null);
      else openShortcutForm(null);
    } else if (t.dataset.help) {
      openCaptureHelp();
    } else if (t.dataset.mic) {
      toggleVoice();
    }
  });

  function toggleVoice() {
    if (stop) { stop(); return; }
    const base = input.value.trim();
    mic.setAttribute('aria-pressed', 'true');
    mic.setAttribute('aria-label', 'Stop dictation');
    status.className = 'capture-status listening';
    status.textContent = 'Listening… say things like “Gym tomorrow at 6pm”.';
    stop = listen({
      onText: (text) => { input.value = base ? `${base}, ${text}` : text; render(); },
      onError: (msg) => { status.className = 'capture-status error'; status.textContent = msg; },
      onEnd: () => {
        stop = null;
        mic.setAttribute('aria-pressed', 'false');
        mic.setAttribute('aria-label', 'Dictate');
        if (status.classList.contains('listening')) { status.className = 'capture-status'; status.textContent = ''; }
      },
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const list = active();
    if (!list.length) {
      status.className = 'capture-status error';
      status.textContent = 'Type or say something to add first.';
      return input.focus();
    }
    stop?.();
    const snap = store.snapshot();
    let tasks = 0;
    let events = 0;
    for (const d of list) {
      if (d.kind === 'event') {
        if (store.saveEvent({ title: d.title, date: d.date || fallbackDate(), allDay: d.allDay, start: d.start, end: d.end, location: d.location, notes: d.notes, category: d.category })) events++;
      } else if (store.saveTask({ title: d.title, due: d.date ?? due, priority: d.priority, category: d.category, notes: d.notes, estimate: d.estimate })) tasks++;
    }
    closeSheet(dlg);
    const parts = [tasks && plural(tasks, 'task'), events && plural(events, 'event')].filter(Boolean);
    toast(list.length === 1 ? `Added “${list[0].title}”` : `Added ${parts.join(' and ')}`, { actionLabel: 'Undo', onAction: () => store.restore(snap) });
  });

  dlg.addEventListener('close', () => stop?.());
  render();
  if (listenNow && mic) toggleVoice();
  return dlg;
}

export function openCaptureHelp() {
  const row = (title, examples) => `<li><span class="help-title">${title}</span><span class="help-ex">${examples}</span></li>`;
  openSheet(`${sheetHeader('What can I type?')}
    <div class="sheet-body">
      <p class="muted">Write the way you’d jot a note. Evenday picks out the details on your device and shows you what it found before anything is added.</p>
      <ul class="help-list">
        ${row('Several at once', 'Separate items with commas or new lines.')}
        ${row('Dates', 'today, tomorrow, Friday, next week, Nov 5, 11/5, the 15th, in 3 days')}
        ${row('Times make events', '3pm, 9:30, noon, 2–4pm, for 45 min')}
        ${row('Deadlines stay tasks', '“Report by 5pm Friday” adds a task with a note.')}
        ${row('Priority', '! or “urgent” for high, “low priority” for low')}
        ${row('Categories', '#work, #school, #personal, #social, or “for work”')}
        ${row('Places', '“at Corner Café” on an event becomes its location')}
        ${row('All-day events', '“Mom’s birthday Nov 4” or add “all day”')}
      </ul>
      <p class="hint">Voice uses your browser’s speech recognition: Apple’s dictation in Safari on iPhone, Google’s in Chrome. You can always use the mic on your keyboard instead.</p>
    </div>`, { label: 'What can I type?' });
}
