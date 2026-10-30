import { addDays, formatDate, formatTime, monthGrid, parseKey, todayKey, weekdayLabels } from '../dates.js';
import { emptyState, eventRow, pageHeader, sortEvents, taskRow } from '../components.js';
import { esc } from '../ui.js';
import { icon } from '../icons.js';

export function renderCalendar(state, ui) {
  const today = todayKey();
  const { year, month } = ui.calMonth;
  const days = monthGrid(year, month, state.prefs.weekStart);
  const byDay = {};
  for (const e of state.events) (byDay[e.date] ||= []).push(e);
  const sel = ui.selected;
  const selEvents = sortEvents(byDay[sel] || []);
  const selTasks = state.tasks.filter((t) => t.due === sel && !t.done);
  const monthName = formatDate(`${year}-${String(month + 1).padStart(2, '0')}-01`, { month: 'long', year: 'numeric' });

  const cells = days.map((key) => {
    const d = parseKey(key);
    const evs = sortEvents(byDay[key] || []);
    const out = d.getMonth() !== month;
    const label = `${formatDate(key, { weekday: 'long', month: 'long', day: 'numeric' })}${evs.length ? `, ${evs.length} event${evs.length > 1 ? 's' : ''}` : ''}`;
    return `<button type="button" class="day${out ? ' out' : ''}${key === today ? ' is-today' : ''}${key === sel ? ' is-selected' : ''}"
      data-action="select-day" data-date="${key}" data-focus="day-${key}" aria-pressed="${key === sel}" ${key === today ? 'aria-current="date"' : ''}
      aria-label="${esc(label)}" tabindex="${key === sel ? 0 : -1}">
      <span class="num">${d.getDate()}</span>
      <span class="dots">${evs.slice(0, 3).map((e) => `<span class="dot cat-${e.category || 'none'}"></span>`).join('')}</span>
    </button>`;
  }).join('');

  return `
  ${pageHeader({ title: 'Calendar', actions: `<button type="button" class="nav-btn" data-action="open-plan">Plan</button><button type="button" class="nav-btn nav-primary" data-action="cal-today" ${sel === today ? 'disabled' : ''}>Today</button>` })}
  <div class="cal-layout">
    <section class="card cal" aria-label="Month">
      <div class="cal-nav">
        <button type="button" class="btn-icon" data-action="cal-prev" data-focus="cal-prev" aria-label="Previous month">${icon('chevronLeft')}</button>
        <h2 aria-live="polite">${esc(monthName)}</h2>
        <button type="button" class="btn-icon" data-action="cal-next" data-focus="cal-next" aria-label="Next month">${icon('chevronRight')}</button>
      </div>
      <div class="weekdays" aria-hidden="true">${weekdayLabels(state.prefs.weekStart).map((w) => `<span title="${w.long}">${w.short}</span>`).join('')}</div>
      <div class="days" data-keynav="calendar" data-swipe="month" aria-label="Days. Use arrow keys to move between days, or swipe to change month.">${cells}</div>
    </section>
    <section class="card section agenda" aria-labelledby="h-agenda">
      <div class="section-head">
        <h2 id="h-agenda">${esc(formatDate(sel, { weekday: 'long', month: 'long', day: 'numeric' }))}</h2>
        <button type="button" class="btn btn-secondary btn-sm" data-action="new-event" data-date="${sel}">${icon('plus')}Event</button>
      </div>
      ${selEvents.length
        ? `<ul class="event-list">${selEvents.map((e) => eventRow(e)).join('')}</ul>`
        : emptyState('calendar', sel === today ? 'Nothing scheduled today' : 'Nothing scheduled', 'Add an event for this day with the button above.')}
      ${plannedFor(state, sel)}
      ${selTasks.length ? `<h3 class="subhead">Tasks due</h3><ul class="task-list">${selTasks.map((t) => taskRow(t, { showDue: false })).join('')}</ul>` : ''}
    </section>
  </div>`;
}

// Plan My Day blocks for the selected day, so the calendar shows the whole picture.
function plannedFor(state, date) {
  const plan = state.plans[date];
  const byId = Object.fromEntries(state.tasks.map((t) => [t.id, t]));
  const blocks = plan ? plan.blocks.filter((b) => byId[b.taskId]) : [];
  if (!blocks.length) return '';
  return `<div class="subhead-row"><h3 class="subhead">Planned focus</h3>${date === todayKey() || date === addDays(todayKey(), 1) ? `<button type="button" class="link-btn small" data-action="open-plan-day" data-date="${date}">Open plan</button>` : ''}</div>
    <ul class="planned-list">${blocks.map((b) => `<li class="${byId[b.taskId].done ? 'is-done' : ''}"><span class="planned-time">${esc(formatTime(b.start))}</span><span class="planned-title">${esc(byId[b.taskId].title)}</span></li>`).join('')}</ul>`;
}

// Arrow-key movement between days; returns the new selected key or null.
export function calendarKey(e, current) {
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
  return step ? addDays(current, step) : null;
}
