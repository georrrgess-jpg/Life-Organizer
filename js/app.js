// Evenday: app shell, routing and user actions.
import * as store from './store.js';
import { todayKey, parseKey } from './dates.js';
import { icon } from './icons.js';
import { confirmDialog, reducedMotion, toast } from './ui.js';
import { openEventDetail, openEventForm, openShortcutForm, openTaskForm } from './forms.js';
import { openCapture, openCaptureHelp } from './capture.js';
import { parseItem } from './parse.js';
import { applyAppearance } from './themes.js';
import { openThemeSheet, openTodaySheet, openWelcome } from './views/appearance.js';
import { renderToday } from './views/today.js';
import { renderCalendar, calendarKey } from './views/calendar.js';
import { renderTasks } from './views/tasks.js';
import { renderApps } from './views/apps.js';
import { confirmReset, openExport, openImport, renderSettings } from './views/settings.js';
import { carryOver, generatePlan, openBlockSheet, openPlanHours, planDate, renderPlan } from './views/plan.js';
import { celebrate, openGoalForm, openHabitForm, renderLife } from './views/life.js';

const ROUTES = {
  today: { label: 'Today', icon: 'today', render: renderToday },
  calendar: { label: 'Calendar', icon: 'calendar', render: renderCalendar },
  plan: { label: 'Plan', icon: 'wand', render: renderPlan, desktopOnly: true },
  tasks: { label: 'Tasks', icon: 'tasks', render: renderTasks },
  life: { label: 'Life', icon: 'life', render: renderLife },
  apps: { label: 'Apps', icon: 'grid', render: renderApps, desktopOnly: true },
  preferences: { label: 'Settings', icon: 'settings', render: renderSettings, hidden: true },
};

const now = new Date();
const ui = {
  route: 'today',
  selected: todayKey(),
  calMonth: { year: now.getFullYear(), month: now.getMonth() },
  taskTab: 'today',
  appsEdit: false,
  planDay: 'today',
  heatDay: null,
  fresh: true,
  day: todayKey(),
};

let main;

function shell() {
  const item = (key) => `<a href="#${key}" class="nav-item${ROUTES[key].hidden ? ' nav-secondary' : ''}${ROUTES[key].desktopOnly ? ' nav-desktop' : ''}" data-nav="${key}">${icon(ROUTES[key].icon)}<span>${ROUTES[key].label}</span></a>`;
  document.getElementById('app').innerHTML = `
    <a class="skip-link" href="#main">Skip to content</a>
    <nav class="nav" aria-label="Main">
      <div class="brand"><span class="brand-mark" aria-hidden="true"></span>Evenday</div>
      ${item('today')}${item('plan')}${item('calendar')}
      <button type="button" class="nav-add" data-action="quick-add" aria-label="Quick add a task or event" title="Quick add (N)">${icon('plus')}<span>Quick add</span></button>
      ${item('tasks')}${item('life')}${item('apps')}${item('preferences')}
    </nav>
    <main id="main" tabindex="-1"></main>
    <div id="storage-warning" class="banner" role="alert" hidden>${icon('alert')}<span>This browser isn’t saving data (private mode or storage is blocked). Changes will be lost when you close the page.</span></div>`;
  main = document.getElementById('main');
}

function applyTheme() {
  applyAppearance(store.getState().prefs);
}

function render() {
  const state = store.getState();
  const focusKey = document.activeElement?.dataset?.focus;
  const draft = main.querySelector('.quick-task input')?.value;
  // Entrance animations only play when a screen first opens, not on every update.
  const fresh = ui.fresh;
  ui.fresh = false;
  main.innerHTML = `<div class="page page-${ui.route}${fresh ? ' fresh' : ''}">${ROUTES[ui.route].render(state, ui)}</div>`;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === ui.route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.getElementById('storage-warning').hidden = store.isStorageOk();
  applyTheme();
  if (draft && main.querySelector('.quick-task input')) main.querySelector('.quick-task input').value = draft;
  if (focusKey) main.querySelector(`[data-focus="${focusKey}"]`)?.focus({ preventScroll: true });
}

function route() {
  const key = location.hash.slice(1);
  const next = ROUTES[key] ? key : 'today';
  const changed = next !== ui.route;
  if (changed) { ui.prevRoute = ui.route; ui.fresh = true; ui.heatDay = null; }
  ui.route = next;
  if (changed) ui.appsEdit = false;
  render();
  if (changed) {
    main.scrollTo({ top: 0 });
    document.body.classList.remove('scrolled');
    main.focus({ preventScroll: true });
    document.title = next === 'today' ? 'Evenday' : `${ROUTES[next].label} · Evenday`;
  }
}

// ---------- Actions ----------

// Default due date for new items, based on where the user is.
function contextDue() {
  if (ui.route === 'calendar') return ui.selected;
  if (ui.route === 'tasks' && ui.taskTab === 'upcoming') return null;
  return todayKey();
}

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
    btn.closest('.task-row, .tl-item')?.classList.add('completing');
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
  'quick-add': () => openCapture({ due: contextDue() }),
  'quick-voice': () => openCapture({ due: contextDue(), listenNow: true }),
  'capture-help': openCaptureHelp,
  // Plan My Day
  'plan-day': (el) => { ui.planDay = el.dataset.day; ui.fresh = true; render(); },
  'plan-energy': (el) => store.setPref('energy', el.dataset.value),
  'plan-hours': openPlanHours,
  'plan-generate': () => {
    const date = planDate(ui);
    const r = generatePlan(date);
    ui.fresh = true;
    if (ui.route !== 'plan') location.hash = 'plan'; else render();
    const n = r.blocks.length;
    toast(n ? `Planned ${n} task${n > 1 ? 's' : ''}${r.unplaced.length ? `, ${r.unplaced.length} didn’t fit` : ''}` : 'Nothing to plan right now');
  },
  'plan-clear': async () => {
    if (!await confirmDialog({ title: 'Clear this plan?', message: 'Your tasks stay as they are. Only the time blocks are removed.', confirmLabel: 'Clear plan' })) return;
    const snap = store.snapshot();
    store.clearPlan(planDate(ui));
    toast('Plan cleared', { actionLabel: 'Undo', onAction: () => store.restore(snap) });
  },
  'plan-toggle': toggleTask,
  'plan-block': (el) => openBlockSheet(el.dataset.id, planDate(ui)),
  'plan-carry': (el) => carryOver(el.dataset.ids.split(',').filter(Boolean), planDate(ui)),
  'open-plan': () => { ui.planDay = 'today'; location.hash = 'plan'; },
  // Life
  'nav-life': () => { location.hash = 'life'; },
  'habit-toggle': (el) => {
    const id = el.dataset.id;
    const h = store.getState().habits.find((x) => x.id === id);
    if (!h) return;
    const wasDone = Boolean(h.log[todayKey()]);
    store.toggleHabit(id, todayKey());
    if (!wasDone) main.querySelectorAll(`[data-habit="${id}"]`).forEach((r) => r.classList.add('just-done'));
  },
  'habit-new': () => openHabitForm(null),
  'habit-edit': (el) => openHabitForm(store.getState().habits.find((h) => h.id === el.dataset.id)),
  'goal-new': () => openGoalForm(null),
  'goal-edit': (el) => openGoalForm(store.getState().goals.find((g) => g.id === el.dataset.id)),
  'goal-log': (el) => {
    const id = el.dataset.id;
    store.logGoal(id, Number(el.dataset.delta));
    const g = store.getState().goals.find((x) => x.id === id);
    if (g?.completedAt && Number(el.dataset.delta) > 0) celebrate(id);
  },
  'goal-add-task': (el) => openTaskForm(null, { goalId: el.dataset.id, due: null }),
  'heat-day': (el) => { ui.heatDay = ui.heatDay === el.dataset.date ? null : el.dataset.date; render(); },
  'open-themes': openThemeSheet,
  'open-today-custom': openTodaySheet,
  'dismiss-swipe-tip': () => store.setPref('swipeTipSeen', true),
  'go-back': () => { location.hash = ui.prevRoute && ui.prevRoute !== 'preferences' ? ui.prevRoute : 'today'; },
  'move-overdue': () => {
    const today = todayKey();
    const late = store.getState().tasks.filter((t) => !t.done && t.due && t.due < today);
    const snap = store.snapshot();
    late.forEach((t) => store.saveTask({ ...t, due: today }));
    toast(`Moved ${late.length} task${late.length > 1 ? 's' : ''} to today`, { actionLabel: 'Undo', onAction: () => store.restore(snap) });
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
    // Understands dates, times, priority and tags, like Quick add.
    const d = parseItem(title, { dayFirst: !/^en(-US)?$/i.test(navigator.language || 'en-US') }) || { kind: 'task', title };
    if (d.kind === 'event') {
      const ev = store.saveEvent({ ...d, date: d.date || form.dataset.due || todayKey() });
      toast(`Added event “${ev.title}”`, { actionLabel: 'Edit', onAction: () => openEventForm(store.getState().events.find((x) => x.id === ev.id)) });
    } else {
      const t = store.saveTask({ title: d.title, due: d.date ?? (form.dataset.due || null), priority: d.priority, category: d.category, notes: d.notes, estimate: d.estimate });
      toast(`Added “${t.title}”`, { actionLabel: 'Edit', onAction: () => openTaskForm(store.getState().tasks.find((x) => x.id === t.id)) });
    }
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
    if ((e.key !== 'n' && e.key !== 'N') || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    actions['quick-add']();
  });

  window.addEventListener('hashchange', route);
  const onScroll = () => document.body.classList.toggle('scrolled', main.scrollTop > 28);
  main.addEventListener('scroll', onScroll, { passive: true });
  bindSwipes();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

  // Roll the dashboard over at midnight and when returning to the app.
  const checkDay = () => {
    if (ui.day !== todayKey()) { ui.day = todayKey(); render(); }
  };
  setInterval(checkDay, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
}

// Touch gestures: swipe a task right to complete it or left to delete it;
// swipe the month grid to change months.
let swipeEndedAt = 0;
function bindSwipes() {
  let g = null;
  main.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const row = e.target.closest('.task-row');
    const grid = e.target.closest('[data-swipe="month"]');
    if (!row && !grid) return;
    g = { x: e.clientX, y: e.clientY, row, grid, dx: 0, axis: null };
  });
  main.addEventListener('pointermove', (e) => {
    if (!g) return;
    g.dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.axis && Math.max(Math.abs(g.dx), Math.abs(dy)) > 10) g.axis = Math.abs(g.dx) > Math.abs(dy) ? 'x' : 'y';
    if (g.axis !== 'x' || !g.row) return;
    const dx = Math.max(-140, Math.min(140, g.dx));
    g.row.classList.add('swiping');
    g.row.dataset.swipe = dx > 0 ? 'complete' : 'delete';
    g.row.classList.toggle('armed', Math.abs(dx) > 80);
    g.row.style.setProperty('--dx', `${dx}px`);
  });
  const end = () => {
    if (!g) return;
    const { row, grid, dx, axis } = g;
    g = null;
    if (axis !== 'x') return;
    swipeEndedAt = Date.now();
    if (grid && Math.abs(dx) > 50) { shiftMonth(dx < 0 ? 1 : -1); render(); return; }
    if (!row) return;
    row.classList.remove('swiping', 'armed');
    row.style.removeProperty('--dx');
    if (Math.abs(dx) <= 80) return;
    const id = row.dataset.task;
    if (dx > 0) toggleTask(row.querySelector('.check'));
    else {
      const snap = store.snapshot();
      store.deleteTask(id);
      toast('Task deleted', { actionLabel: 'Undo', onAction: () => store.restore(snap) });
    }
  };
  main.addEventListener('pointerup', end);
  main.addEventListener('pointercancel', end);
  // A swipe shouldn't also count as a tap.
  main.addEventListener('click', (e) => { if (Date.now() - swipeEndedAt < 350) { e.stopPropagation(); e.preventDefault(); } }, true);
}

function start() {
  store.load();
  shell();
  bindEvents();
  store.subscribe(render);
  route();
  if (store.isFirstRun() && !store.getState().prefs.onboarded) openWelcome();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.endsWith('claude.ai')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
