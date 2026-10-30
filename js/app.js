// Evenday: app shell, routing and user actions.
import * as store from './store.js';
import { todayKey, parseKey } from './dates.js';
import { icon } from './icons.js';
import { confirmDialog, reducedMotion, toast } from './ui.js';
import { openEventDetail, openEventForm, openQuickAdd, openShortcutForm, openTaskForm } from './forms.js';
import { renderToday } from './views/today.js';
import { renderCalendar, calendarKey } from './views/calendar.js';
import { renderTasks } from './views/tasks.js';
import { renderApps } from './views/apps.js';
import { confirmReset, openExport, openImport, renderSettings } from './views/settings.js';

const ROUTES = {
  today: { label: 'Today', icon: 'today', render: renderToday },
  calendar: { label: 'Calendar', icon: 'calendar', render: renderCalendar },
  tasks: { label: 'Tasks', icon: 'tasks', render: renderTasks },
  apps: { label: 'Apps', icon: 'grid', render: renderApps },
  preferences: { label: 'Settings', icon: 'settings', render: renderSettings, hidden: true },
};

const now = new Date();
const ui = {
  route: 'today',
  selected: todayKey(),
  calMonth: { year: now.getFullYear(), month: now.getMonth() },
  taskTab: 'today',
  appsEdit: false,
  day: todayKey(),
};

let main;

function shell() {
  const nav = Object.entries(ROUTES).map(([key, r]) => `<a href="#${key}" class="nav-item${r.hidden ? ' nav-secondary' : ''}" data-nav="${key}">${icon(r.icon)}<span>${r.label}</span></a>`).join('');
  document.getElementById('app').innerHTML = `
    <a class="skip-link" href="#main">Skip to content</a>
    <nav class="nav" aria-label="Main">
      <div class="brand"><span class="brand-mark" aria-hidden="true"></span>Evenday</div>
      ${nav}
    </nav>
    <main id="main" tabindex="-1"></main>
    <button type="button" class="fab" data-action="quick-add" aria-label="Add task or event">${icon('plus')}</button>
    <div id="storage-warning" class="banner" role="alert" hidden>${icon('alert')}<span>This browser isn’t saving data (private mode or storage is blocked). Changes will be lost when you close the page.</span></div>`;
  main = document.getElementById('main');
}

function applyTheme() {
  const t = store.getState().prefs.theme;
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111413' : '#f6f6f3');
}

function render() {
  const state = store.getState();
  const focusKey = document.activeElement?.dataset?.focus;
  const draft = main.querySelector('.quick-task input')?.value;
  main.innerHTML = `<div class="page page-${ui.route}">${ROUTES[ui.route].render(state, ui)}</div>`;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === ui.route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.querySelector('.fab').hidden = ui.route === 'preferences';
  document.getElementById('storage-warning').hidden = store.isStorageOk();
  applyTheme();
  if (draft && main.querySelector('.quick-task input')) main.querySelector('.quick-task input').value = draft;
  if (focusKey) main.querySelector(`[data-focus="${focusKey}"]`)?.focus({ preventScroll: true });
}

function route() {
  const key = location.hash.slice(1);
  const next = ROUTES[key] ? key : 'today';
  const changed = next !== ui.route;
  ui.route = next;
  if (changed) ui.appsEdit = false;
  render();
  if (changed) {
    window.scrollTo({ top: 0 });
    main.focus({ preventScroll: true });
    document.title = next === 'today' ? 'Evenday' : `${ROUTES[next].label} · Evenday`;
  }
}

// ---------- Actions ----------

function selectDay(key) {
  ui.selected = key;
  const d = parseKey(key);
  ui.calMonth = { year: d.getFullYear(), month: d.getMonth() };
}

function shiftMonth(delta) {
  const d = new Date(ui.calMonth.year, ui.calMonth.month + delta, 1);
  ui.calMonth = { year: d.getFullYear(), month: d.getMonth() };
  // Keep the selected day inside the visible month.
  const day = Math.min(parseKey(ui.selected).getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
  ui.selected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toggleTask(btn) {
  const id = btn.dataset.id;
  const task = store.getState().tasks.find((t) => t.id === id);
  if (!task) return;
  const done = !task.done;
  const snap = store.snapshot();
  const finish = () => {
    store.setTaskDone(id, done);
    toast(done ? `Completed “${task.title}”` : `Reopened “${task.title}”`, { actionLabel: 'Undo', onAction: () => store.restore(snap) });
  };
  if (done && !reducedMotion()) {
    btn.closest('.task-row')?.classList.add('completing');
    btn.setAttribute('aria-checked', 'true');
    setTimeout(finish, 420);
  } else finish();
}

function openShortcut(link, e) {
  const sc = store.getState().shortcuts.find((s) => s.id === link.dataset.id);
  if (!sc?.appUrl) return; // plain website: the link opens it in a new tab
  e.preventDefault();
  let left = false;
  const onHide = () => { if (document.hidden) left = true; };
  document.addEventListener('visibilitychange', onHide, { once: true });
  try { window.location.href = sc.appUrl; } catch { /* scheme blocked */ }
  setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide);
    if (left) return;
    toast(`Didn’t open ${sc.name}?`, { actionLabel: 'Open website', actionHref: sc.url, duration: 7000 });
  }, 1200);
}

const actions = {
  'quick-add': () => {
    if (ui.route === 'apps') return openShortcutForm(null);
    if (ui.route === 'calendar') return openQuickAdd('event', { date: ui.selected });
    return openQuickAdd('task', { due: ui.route === 'tasks' && ui.taskTab === 'upcoming' ? null : todayKey() });
  },
  'toggle-task': toggleTask,
  'edit-task': (el) => openTaskForm(store.getState().tasks.find((t) => t.id === el.dataset.id)),
  'view-event': (el) => openEventDetail(store.getState().events.find((ev) => ev.id === el.dataset.id)),
  'new-event': (el) => openEventForm(null, { date: el.dataset.date }),
  'select-day': (el) => { selectDay(el.dataset.date); render(); },
  'cal-prev': () => { shiftMonth(-1); render(); },
  'cal-next': () => { shiftMonth(1); render(); },
  'cal-today': () => { selectDay(todayKey()); render(); main.querySelector('.day.is-selected')?.focus(); },
  'task-tab': (el) => { ui.taskTab = el.dataset.tab; render(); },
  'clear-completed': async () => {
    const n = store.getState().tasks.filter((t) => t.done).length;
    if (!await confirmDialog({ title: 'Clear completed tasks?', message: `${n} completed task${n > 1 ? 's' : ''} will be deleted.`, confirmLabel: 'Clear', danger: true })) return;
    const snap = store.snapshot();
    store.clearCompleted();
    toast('Completed tasks cleared', { actionLabel: 'Undo', onAction: () => store.restore(snap) });
  },
  'apps-edit': () => { ui.appsEdit = !ui.appsEdit; render(); },
  'new-shortcut': () => openShortcutForm(null),
  'edit-shortcut': (el) => openShortcutForm(store.getState().shortcuts.find((s) => s.id === el.dataset.id)),
  'fav-shortcut': (el) => store.toggleFavorite(el.dataset.id),
  'move-shortcut': (el) => {
    store.moveShortcut(el.dataset.id, Number(el.dataset.dir));
    // At either end the arrow disables; move focus to its partner.
    const btn = main.querySelector(`[data-focus="${el.dataset.focus}"]`);
    if (btn?.disabled) main.querySelector(`[data-focus="fav-${el.dataset.id}"]`)?.focus();
  },
  'open-shortcut': openShortcut,
  'set-theme': (el) => store.setPref('theme', el.dataset.value),
  'set-week': (el) => store.setPref('weekStart', Number(el.dataset.value)),
  export: openExport,
  import: openImport,
  reset: confirmReset,
  'load-sample': () => { store.loadSampleData(); toast('Sample data loaded', { actionLabel: 'Remove', onAction: () => store.clearSampleData() }); },
  'clear-sample': () => { const snap = store.snapshot(); store.clearSampleData(); toast('Sample data removed', { actionLabel: 'Undo', onAction: () => store.restore(snap) }); },
};

function bindEvents() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.closest('dialog') || el.disabled) return;
    actions[el.dataset.action]?.(el, e);
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-form="quick-task"]');
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('input');
    const title = input.value.trim();
    if (!title) return input.focus();
    input.value = '';
    const t = store.saveTask({ title, due: form.dataset.due || null });
    toast(`Added “${t.title}”`, { actionLabel: 'Edit', onAction: () => openTaskForm(store.getState().tasks.find((x) => x.id === t.id)) });
    main.querySelector('.quick-task input')?.focus();
  });

  main.addEventListener('keydown', (e) => {
    if (e.target.closest('[data-keynav="calendar"]')) {
      const next = calendarKey(e, ui.selected);
      if (!next) return;
      e.preventDefault();
      selectDay(next);
      render();
      main.querySelector('.day.is-selected')?.focus();
    }
    if (e.target.getAttribute('role') === 'tab' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const tabs = [...main.querySelectorAll('[role="tab"]')];
      const i = tabs.indexOf(e.target) + (e.key === 'ArrowRight' ? 1 : -1);
      tabs[(i + tabs.length) % tabs.length]?.click();
      main.querySelector('[role="tab"][aria-selected="true"]')?.focus();
    }
  });

  // "n" opens quick add when not typing.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    actions['quick-add']();
  });

  window.addEventListener('hashchange', route);
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

  // Roll the dashboard over at midnight and when returning to the app.
  const checkDay = () => {
    if (ui.day !== todayKey()) { ui.day = todayKey(); render(); }
  };
  setInterval(checkDay, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
}

function start() {
  store.load();
  shell();
  bindEvents();
  store.subscribe(render);
  route();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.endsWith('claude.ai')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
