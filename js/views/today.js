import { addDays, formatDate, formatTime, greeting, todayKey, toMinutes } from '../dates.js';
import { captureBar, emptyState, eventRow, pageHeader, sortEvents, taskRow, tileIcon } from '../components.js';
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
  ${pageHeader({ title: greeting(now), eyebrow: formatDate(today, { weekday: 'long', month: 'long', day: 'numeric' }), summary: esc(summary) })}
  ${captureBar()}

  ${showSample ? `<div class="callout">
    <span class="callout-icon">${icon('sparkle')}</span>
    <div><p class="callout-title">${isFirstRun() ? 'Welcome to Evenday' : 'A quiet start'}</p>
    <p class="muted small">Type or say what you need to do above, or look around with sample data.</p></div>
    <button type="button" class="btn btn-secondary btn-sm" data-action="load-sample">Load sample data</button>
  </div>` : ''}

  ${next ? `<button type="button" class="up-next" data-action="view-event" data-id="${next.id}">
    <span class="up-next-label">${toMinutes(next.start) <= nowMin ? 'Happening now' : 'Up next'}</span>
    <span class="up-next-title">${esc(next.title)}</span>
    <span class="up-next-time">${icon('clock')}${esc(eventTime(next))}${next.location ? ` · ${esc(next.location)}` : ''}</span>
  </button>` : ''}

  <div class="today-grid">
    <section class="card section" aria-labelledby="h-tasks">
      <div class="section-head">
        <h2 id="h-tasks">Tasks</h2>
        ${total ? `<span class="progress" aria-label="${doneToday} of ${total} done"><span class="progress-track"><span style="width:${Math.round((doneToday / total) * 100)}%"></span></span>${doneToday}/${total}</span>` : ''}
        <a class="link" href="#tasks">All</a>
      </div>
      ${overdue.length ? `<div class="subhead-row"><h3 class="subhead subhead-warn">Overdue</h3>
        <button type="button" class="link-btn small" data-action="move-overdue">Move to today</button></div>
        <ul class="task-list">${overdue.map((t) => taskRow(t, { today })).join('')}</ul>` : ''}
      ${dueToday.length ? `${overdue.length ? '<h3 class="subhead">Today</h3>' : ''}<ul class="task-list">${dueToday.map((t) => taskRow(t, { showDue: false, today })).join('')}</ul>` : ''}
      ${!overdue.length && !dueToday.length
        ? emptyState('tasks', doneToday ? 'All done for today' : 'Nothing due today', doneToday ? 'Nice work. Everything due today is finished.' : 'Tasks due today and anything overdue show up here.')
        : ''}
      ${doneToday ? `<p class="done-note">${icon('check')}${plural(doneToday, 'task')} completed today</p>` : ''}
    </section>

    <section class="card section" aria-labelledby="h-schedule">
      <div class="section-head">
        <h2 id="h-schedule">Schedule</h2>
        <a class="link" href="#calendar">Calendar</a>
      </div>
      ${todaysEvents.length
        ? `<ul class="event-list">${schedule}</ul>`
        : emptyState('calendar', 'No events today', '', `<button type="button" class="btn btn-secondary btn-sm" data-action="new-event" data-date="${today}">${icon('plus')}Add event</button>`)}
      ${soon.length ? `<h3 class="subhead">Coming up</h3><ul class="event-list">${soon.map((e) => eventRow(e, { showDate: true })).join('')}</ul>` : ''}
    </section>

    <section class="section favorites" aria-labelledby="h-fav">
      <div class="section-head">
        <h2 id="h-fav">Favorites</h2>
        <a class="link" href="#apps">App wall</a>
      </div>
      ${favorites.length
        ? `<ul class="fav-row">${favorites.map((s) => `<li><a class="fav" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" data-action="open-shortcut" data-id="${s.id}">${tileIcon(s)}<span class="fav-name">${esc(s.name)}</span></a></li>`).join('')}</ul>`
        : `<div class="card">${emptyState('star', 'No favorites yet', 'Star shortcuts on your App wall to keep them here.', '<a class="btn btn-secondary btn-sm" href="#apps">Open App wall</a>')}</div>`}
    </section>
  </div>`;
}

const eventTime = (e) => `${formatTime(e.start)} – ${formatTime(e.end)}`;
