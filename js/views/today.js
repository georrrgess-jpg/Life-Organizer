import { addDays, formatDate, greeting, todayKey, toMinutes } from '../dates.js';
import { emptyState, eventRow, sortEvents, taskRow, tileIcon } from '../components.js';
import { hasSampleData, isFirstRun } from '../store.js';
import { esc } from '../ui.js';
import { icon } from '../icons.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function renderToday(state) {
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

  const remaining = todaysEvents.filter((e) => e.allDay || toMinutes(e.end) > nowMin).length;
  const parts = [];
  if (dueToday.length) parts.push(plural(dueToday.length, 'task') + ' due');
  if (overdue.length) parts.push(`${overdue.length} overdue`);
  if (remaining) parts.push(plural(remaining, 'event') + (remaining === todaysEvents.length ? '' : ' left'));
  const summary = parts.length ? `${parts.join(', ')} today.` : 'Nothing due today. Enjoy the open space.';

  const showSample = !hasSampleData() && !state.tasks.length && !state.events.length;

  return `
  <header class="page-head">
    <div>
      <p class="eyebrow">${esc(formatDate(today, { weekday: 'long', month: 'long', day: 'numeric' }))}</p>
      <h1>${greeting(now)}</h1>
      <p class="summary">${esc(summary)}</p>
    </div>
    <a class="btn-icon mobile-only" href="#preferences" aria-label="Settings">${icon('settings')}</a>
  </header>

  ${showSample ? `<div class="callout">
    <span class="callout-icon">${icon('sparkle')}</span>
    <div><p class="callout-title">${isFirstRun() ? 'Welcome to Evenday' : 'A quiet start'}</p>
    <p class="muted small">Add your first task or event with the + button, or look around with sample data.</p></div>
    <button type="button" class="btn btn-secondary btn-sm" data-action="load-sample">Load sample data</button>
  </div>` : ''}

  <div class="today-grid">
    <section class="card section" aria-labelledby="h-schedule">
      <div class="section-head">
        <h2 id="h-schedule">Schedule</h2>
        <a class="link" href="#calendar">Calendar</a>
      </div>
      ${todaysEvents.length
        ? `<ul class="event-list">${todaysEvents.map((e) => eventRow(e, { past: !e.allDay && toMinutes(e.end) <= nowMin })).join('')}</ul>`
        : emptyState('calendar', 'No events today', '', `<button type="button" class="btn btn-secondary btn-sm" data-action="new-event" data-date="${today}">${icon('plus')}Add event</button>`)}
      ${soon.length ? `<h3 class="subhead">Coming up</h3><ul class="event-list">${soon.map((e) => eventRow(e, { showDate: true })).join('')}</ul>` : ''}
    </section>

    <section class="card section" aria-labelledby="h-tasks">
      <div class="section-head">
        <h2 id="h-tasks">Tasks</h2>
        <a class="link" href="#tasks">All tasks</a>
      </div>
      <form class="quick-task" data-form="quick-task" data-due="${today}">
        <label class="sr-only" for="quick-today">Add a task for today</label>
        <input id="quick-today" name="title" type="text" maxlength="200" placeholder="Add a task for today" autocomplete="off" data-focus="quick-today">
        <button type="submit" class="btn-icon btn-accent" aria-label="Add task">${icon('plus')}</button>
      </form>
      ${overdue.length ? `<h3 class="subhead subhead-warn">Overdue</h3><ul class="task-list">${overdue.map((t) => taskRow(t, { today })).join('')}</ul>` : ''}
      ${dueToday.length ? `${overdue.length ? '<h3 class="subhead">Today</h3>' : ''}<ul class="task-list">${dueToday.map((t) => taskRow(t, { showDue: false, today })).join('')}</ul>` : ''}
      ${!overdue.length && !dueToday.length
        ? emptyState('tasks', doneToday ? 'All done for today' : 'Nothing due today', doneToday ? 'Nice work. Everything due today is finished.' : 'Tasks due today and anything overdue will show up here.')
        : ''}
      ${doneToday ? `<p class="done-note">${icon('check')}${plural(doneToday, 'task')} completed today</p>` : ''}
    </section>

    <section class="section favorites" aria-labelledby="h-fav">
      <div class="section-head">
        <h2 id="h-fav">Favorites</h2>
        <a class="link" href="#apps">App wall</a>
      </div>
      ${favorites.length
        ? `<ul class="fav-row">${favorites.map((s) => `<li><a class="fav" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" data-action="open-shortcut" data-id="${s.id}">${tileIcon(s)}<span class="fav-name">${esc(s.name)}</span></a></li>`).join('')}</ul>`
        : `<div class="card">${emptyState('star', 'No favorites yet', 'Mark shortcuts as favorites on your App wall to keep them here.', '<a class="btn btn-secondary btn-sm" href="#apps">Open App wall</a>')}</div>`}
    </section>
  </div>`;
}
