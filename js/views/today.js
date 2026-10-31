import { addDays, formatDate, formatTime, greeting, todayKey, toMinutes } from '../dates.js';
import { captureBar, emptyState, eventRow, pageHeader, sortEvents, taskRow, tileIcon } from '../components.js';
import { hasSampleData, isFirstRun } from '../store.js';
import { esc } from '../ui.js';
import { buildPlan, formatDuration, rankTasks } from '../planner.js';
import { habitRow } from './life.js';
import { isScheduled } from '../life.js';
import { icon } from '../icons.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function renderToday(state) {
  const show = state.prefs.today;
  const today = todayKey();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todaysEvents = sortEvents(state.events.filter((e) => e.date === today));
  const soon = sortEvents(state.events.filter((e) => e.date > today && e.date <= addDays(today, 7))).slice(0, 4);
  const open = state.tasks.filter((t) => !t.done);
  const overdue = open.filter((t) => t.due && t.due < today).sort((a, b) => a.due.localeCompare(b.due));
  const dueToday = open.filter((t) => t.due === today).sort((a, b) => (b.priority === 'high') - (a.priority === 'high'));
  const doneToday = state.tasks.filter((t) => t.done && t.completedAt && new Date(t.completedAt).toDateString() === now.toDateString()).length;
  const favorites = state.shortcuts.filter((s) => s.favorite);

  const remaining = todaysEvents.filter((e) => e.allDay || toMinutes(e.end) > nowMin);
  const next = remaining.find((e) => !e.allDay);
  const parts = [];
  if (dueToday.length) parts.push(plural(dueToday.length, 'task') + ' due');
  if (overdue.length) parts.push(`${overdue.length} overdue`);
  if (remaining.length) parts.push(plural(remaining.length, 'event') + (remaining.length === todaysEvents.length ? '' : ' left'));
  const summary = parts.length ? `${parts.join(' · ')}` : 'Nothing due today. Enjoy the open space.';

  // "Now" marker sits before the first timed event that hasn't started yet.
  let nowPlaced = false;
  const schedule = todaysEvents.map((e) => {
    const past = !e.allDay && toMinutes(e.end) <= nowMin;
    let marker = '';
    if (!nowPlaced && !e.allDay && toMinutes(e.start) > nowMin && todaysEvents.some((x) => !x.allDay && toMinutes(x.start) <= nowMin)) {
      marker = '<li class="now-line" aria-hidden="true"><span>Now</span></li>';
      nowPlaced = true;
    }
    return marker + eventRow(e, { past });
  }).join('');

  const total = dueToday.length + doneToday;
  const showSample = !hasSampleData() && !state.tasks.length && !state.events.length;

  return `
  ${pageHeader({ title: greeting(now) + (state.prefs.name ? `, ${state.prefs.name}` : ''), actions: `<a class="btn-icon mobile-only" href="#apps" aria-label="App wall">${icon('grid')}</a><button type="button" class="nav-btn" data-action="open-today-custom">Edit</button>`, eyebrow: formatDate(today, { weekday: 'long', month: 'long', day: 'numeric' }), summary: esc(summary) })}
  ${show.capture ? captureBar() : ''}

  ${showSample ? `<div class="callout">
    <span class="callout-icon">${icon('sparkle')}</span>
    <div><p class="callout-title">${isFirstRun() ? 'Welcome to Evenday' : 'A quiet start'}</p>
    <p class="muted small">Type or say what you need to do above, or look around with sample data.</p></div>
    <button type="button" class="btn btn-secondary btn-sm" data-action="load-sample">Load sample data</button>
  </div>` : ''}

  ${backupNudge(state)}
  ${show.plan ? planCard(state, today, nowMin) : ''}

  ${show.upNext && next ? `<button type="button" class="up-next" data-action="view-event" data-id="${next.id}">
    <span class="up-next-label">${toMinutes(next.start) <= nowMin ? 'Happening now' : 'Up next'}</span>
    <span class="up-next-title">${esc(next.title)}</span>
    <span class="up-next-time">${icon('clock')}${esc(eventTime(next))}${next.location ? ` · ${esc(next.location)}` : ''}</span>
  </button>` : ''}

  <div class="today-grid">
    ${show.tasks ? `<section class="card section" aria-labelledby="h-tasks">
      <div class="section-head">
        <h2 id="h-tasks">Tasks</h2>
        ${total ? `<span class="progress" aria-label="${doneToday} of ${total} done"><span class="progress-track"><span style="width:${Math.round((doneToday / total) * 100)}%"></span></span>${doneToday}/${total}</span>` : ''}
        <a class="link" href="#tasks">All</a>
      </div>
      ${overdue.length ? `<div class="subhead-row"><h3 class="subhead subhead-warn">Overdue</h3>
        <button type="button" class="link-btn small" data-action="move-overdue">Move to today</button></div>
        <ul class="task-list">${overdue.slice(0, 3).map((t) => taskRow(t, { today })).join('')}</ul>${more(overdue.length - 3, 'overdue')}` : ''}
      ${dueToday.length ? `${overdue.length ? '<h3 class="subhead">Today</h3>' : ''}<ul class="task-list">${dueToday.slice(0, 6).map((t) => taskRow(t, { showDue: false, today })).join('')}</ul>${more(dueToday.length - 6, 'due today')}` : ''}
      ${!overdue.length && !dueToday.length
        ? quiet('tasks', doneToday ? 'All done for today. Nice work.' : 'Nothing due today.', '<a class="link" href="#tasks">See upcoming</a>')
        : ''}
      ${doneToday ? `<p class="done-note">${icon('check')}${plural(doneToday, 'task')} completed today</p>` : ''}
    </section>` : ''}

    ${show.habits && state.habits.some((h) => isScheduled(h, today) || h.log[today]) ? `<section class="card section" aria-labelledby="h-today-habits">
      <div class="section-head"><h2 id="h-today-habits">Habits</h2>
        <span class="progress">${state.habits.filter((h) => h.log[today]).length}/${state.habits.filter((h) => isScheduled(h, today) || h.log[today]).length}</span>
        <a class="link" href="#life">Life</a></div>
      <ul class="habit-list">${state.habits.filter((h) => isScheduled(h, today) || h.log[today]).map((h) => habitRow(h, today, { compact: true })).join('')}</ul>
    </section>` : ''}

    ${show.schedule ? `<section class="card section" aria-labelledby="h-schedule">
      <div class="section-head">
        <h2 id="h-schedule">Schedule</h2>
        <a class="link" href="#calendar">Calendar</a>
      </div>
      ${todaysEvents.length
        ? `<ul class="event-list">${schedule}</ul>`
        : quiet('calendar', 'No events today.', `<button type="button" class="link-btn small" data-action="new-event" data-date="${today}">Add event</button>`)}
      ${soon.length ? `<h3 class="subhead">Coming up</h3><ul class="event-list">${soon.map((e) => eventRow(e, { showDate: true })).join('')}</ul>` : ''}
    </section>` : ''}

    ${show.favorites ? `<section class="section favorites" aria-labelledby="h-fav">
      <div class="section-head">
        <h2 id="h-fav">Favorites</h2>
        <a class="link" href="#apps">App wall</a>
      </div>
      ${favorites.length
        ? `<ul class="fav-row">${favorites.map((s) => `<li><a class="fav" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" data-action="open-shortcut" data-id="${s.id}">${tileIcon(s)}<span class="fav-name">${esc(s.name)}</span></a></li>`).join('')}</ul>`
        : `<div class="card">${emptyState('star', 'No favorites yet', 'Star shortcuts on your App wall to keep them here.', '<a class="btn btn-secondary btn-sm" href="#apps">Open App wall</a>')}</div>`}
    </section>` : ''}
    ${!Object.values(show).some(Boolean) ? emptyState('today', 'Today is hidden', 'Every section is turned off.', '<button type="button" class="btn btn-secondary btn-sm" data-action="open-today-custom">Customize Today</button>') : ''}
  </div>`;
}

// One calm line instead of a big empty card.
const quiet = (ic, text, action = '') => `<p class="quiet">${icon(ic)}<span>${text}</span>${action}</p>`;
const more = (n, what) => (n > 0 ? `<a class="more-link" href="#tasks">+${n} more ${what}</a>` : '');

const eventTime = (e) => `${formatTime(e.start)} – ${formatTime(e.end)}`;

// A gentle reminder when there's real data and no recent backup.
function backupNudge(state) {
  const items = state.tasks.length + state.events.length + state.habits.length + state.goals.length;
  if (items < 10 || state.tasks.every((t) => t.demo)) return '';
  const now = new Date();
  const last = state.prefs.lastBackupAt ? new Date(state.prefs.lastBackupAt) : null;
  if (last && now - last < 14 * 864e5) return '';
  if (state.prefs.backupNudgeAfter && now < new Date(state.prefs.backupNudgeAfter)) return '';
  return `<div class="tip">${icon('download')}<span>${last ? 'It’s been a while since your last backup.' : 'Your data lives only on this device.'} Save a backup so nothing gets lost.</span>
    <button type="button" class="btn btn-secondary btn-sm" data-action="export">Back up</button>
    <button type="button" class="btn-icon btn-sm" data-action="backup-later" aria-label="Remind me next week">${icon('x')}</button></div>`;
}

// Today's plan at a glance, or an invitation to make one.
function planCard(state, today, nowMin) {
  const plan = state.plans[today];
  const byId = Object.fromEntries(state.tasks.map((t) => [t.id, t]));
  if (!plan) {
    const ready = rankTasks(state.tasks, today, []);
    if (!ready.length) return '';
    const p = buildPlan({ date: today, tasks: state.tasks, events: state.events, prefs: state.prefs, nowMin });
    return `<section class="plan-cta">
      <span class="plan-cta-icon">${icon('wand')}</span>
      <div><p class="plan-cta-title">Plan my day</p>
      <p class="plan-cta-text">${p.blocks.length ? `${p.blocks.length} of ${ready.length} task${ready.length === 1 ? '' : 's'} fit in ${formatDuration(p.plannedMinutes)} around your events` : 'No free time left today. Plan tomorrow instead?'}</p></div>
      <button type="button" class="btn btn-primary btn-sm" data-action="plan-generate" data-day="${p.blocks.length ? 'today' : 'tomorrow'}">${p.blocks.length ? 'Plan' : 'Plan tomorrow'}</button>
    </section>`;
  }
  const blocks = plan.blocks.filter((b) => byId[b.taskId]);
  const done = blocks.filter((b) => byId[b.taskId].done).length;
  const nextB = blocks.find((b) => !byId[b.taskId].done && toMinutes(b.end) > nowMin);
  return `<button type="button" class="plan-mini" data-action="open-plan">
    <span class="plan-mini-head"><span class="up-next-label">Today’s plan</span><span class="plan-mini-count">${done}/${blocks.length}</span></span>
    <span class="goal-bar"><span style="width:${blocks.length ? Math.round((done / blocks.length) * 100) : 0}%"></span></span>
    <span class="plan-mini-next">${nextB ? `${toMinutes(nextB.start) <= nowMin ? 'Now' : esc(formatTime(nextB.start))} · ${esc(byId[nextB.taskId].title)}` : done === blocks.length && blocks.length ? 'Everything planned is done' : 'Open your plan'}</span>
  </button>`;
}
