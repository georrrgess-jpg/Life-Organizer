// Plan My Day: a time-blocked plan for today (or tomorrow) built from tasks and the calendar.
import * as store from '../store.js';
import { ESTIMATES } from '../store.js';
import { buildPlan, conflicts, formatDuration, rankTasks } from '../planner.js';
import { addDays, formatDate, formatTime, fromMinutes, todayKey, toMinutes } from '../dates.js';
import { catLabel, emptyState, pageHeader, sortEvents } from '../components.js';
import { closeSheet, esc, openSheet, sheetHeader, toast } from '../ui.js';
import { openTaskForm } from '../forms.js';
import { icon } from '../icons.js';

const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
export const planDate = (ui) => (ui.planDay === 'tomorrow' ? addDays(todayKey(), 1) : todayKey());

// Creates (or re-flows) the plan for `date`, keeping locked blocks and finished work.
export function generatePlan(date, { extraLocked = [] } = {}) {
  const { tasks, events, prefs, plans } = store.getState();
  const old = plans[date];
  const isToday = date === todayKey();
  const nowMin = isToday ? nowMinutes() : null;
  const locked = [...(old?.blocks.filter((b) => b.locked && !extraLocked.some((x) => x.taskId === b.taskId)) || []), ...extraLocked];
  const result = buildPlan({ date, tasks, events, prefs, nowMin, locked, skipped: old?.skipped || [] });
  // Keep blocks already finished earlier today so the timeline tells the whole story.
  const doneIds = new Set(tasks.filter((t) => t.done).map((t) => t.id));
  const kept = (old?.blocks || []).filter((b) => doneIds.has(b.taskId) && nowMin != null && toMinutes(b.end) <= nowMin);
  const blocks = [...kept, ...result.blocks].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  store.savePlan({ date, blocks, skipped: old?.skipped || [] });
  return { ...result, blocks };
}

function ring(ratio, label) {
  const c = 2 * Math.PI * 26;
  return `<div class="ring" role="img" aria-label="${esc(label)}">
    <svg viewBox="0 0 64 64"><circle class="ring-track" cx="32" cy="32" r="26"/><circle class="ring-fill" cx="32" cy="32" r="26" style="--c:${c};--off:${c * (1 - ratio)}"/></svg>
    <span class="ring-num">${Math.round(ratio * 100)}<small>%</small></span></div>`;
}

export function renderPlan(state, ui) {
  const today = todayKey();
  const date = planDate(ui);
  const isToday = date === today;
  const plan = state.plans[date];
  const taskById = Object.fromEntries(state.tasks.map((t) => [t.id, t]));
  const dayEvents = sortEvents(state.events.filter((e) => e.date === date));
  const timed = dayEvents.filter((e) => !e.allDay);
  const nowMin = nowMinutes();
  const switcher = `<div class="segmented plan-day" role="tablist" aria-label="Plan for">
    ${[['today', 'Today'], ['tomorrow', 'Tomorrow']].map(([k, l]) => `<button type="button" role="tab" class="seg-btn" data-action="plan-day" data-day="${k}" aria-selected="${(ui.planDay || 'today') === k}">${l}</button>`).join('')}</div>`;
  const prefsRow = `<div class="plan-prefs">
    <div class="segmented" role="radiogroup" aria-label="When you have the most energy">
      ${[['morning', 'sun', 'Morning'], ['afternoon', 'today', 'Afternoon'], ['evening', 'moon', 'Evening']].map(([k, ic, l]) => `<button type="button" role="radio" class="seg-btn" data-action="plan-energy" data-value="${k}" aria-checked="${state.prefs.energy === k}">${icon(ic)}${l}</button>`).join('')}
    </div>
    <button type="button" class="link-btn small" data-action="plan-hours">${icon('clock')}${esc(formatTime(state.prefs.dayStart))} – ${esc(formatTime(state.prefs.dayEnd))}</button>
  </div>`;
  const header = pageHeader({
    title: isToday ? 'Today’s plan' : 'Tomorrow’s plan',
    eyebrow: formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' }),
    actions: plan ? `<button type="button" class="nav-btn" data-action="plan-clear">Clear</button>` : '',
  });

  if (!plan) {
    const ready = rankTasks(state.tasks, date, []);
    const preview = buildPlan({ date, tasks: state.tasks, events: state.events, prefs: state.prefs, nowMin: isToday ? nowMin : null });
    return `${header}${switcher}
      <section class="card plan-hero">
        <span class="plan-hero-icon">${icon('wand')}</span>
        <h2>Plan your ${isToday ? 'day' : 'tomorrow'} in one tap</h2>
        <p class="muted">Evenday fits your tasks into the free time around your events, putting important work in your best hours.</p>
        <div class="plan-stats">
          <span><strong>${ready.length}</strong> task${ready.length === 1 ? '' : 's'} to fit</span>
          <span><strong>${timed.length}</strong> event${timed.length === 1 ? '' : 's'}</span>
          <span><strong>${formatDuration(preview.plannedMinutes + preview.freeMinutes)}</strong> open</span>
        </div>
        <p class="group-label plan-energy-label">I have the most energy in the</p>
        ${prefsRow}
        <button type="button" class="btn btn-primary btn-block" data-action="plan-generate" ${ready.length ? '' : 'disabled'}>${icon('wand')}Plan my ${isToday ? 'day' : 'tomorrow'}</button>
        ${ready.length ? '' : `<p class="hint">No open tasks are due ${isToday ? 'today' : 'tomorrow'} or soon. Add some with + first.</p>`}
      </section>`;
  }

  const blocks = plan.blocks.filter((b) => taskById[b.taskId]);
  const done = blocks.filter((b) => taskById[b.taskId].done).length;
  const planned = blocks.reduce((n, b) => n + toMinutes(b.end) - toMinutes(b.start), 0);
  const clash = conflicts({ ...plan, blocks }, state.events);
  const unplaced = rankTasks(state.tasks, date, plan.skipped).filter((t) => (!t.due || t.due <= date) && !blocks.some((b) => b.taskId === t.id) && t.due);
  const unfinishedPast = isToday ? blocks.filter((b) => !taskById[b.taskId].done && toMinutes(b.end) <= nowMin) : [];

  // Merge events and blocks into one timeline with free-time gaps and a Now marker.
  const items = [
    ...timed.map((e) => ({ type: 'event', start: toMinutes(e.start), end: toMinutes(e.end), e })),
    ...blocks.map((b) => ({ type: 'task', start: toMinutes(b.start), end: toMinutes(b.end), b, t: taskById[b.taskId] })),
  ].sort((a, b) => a.start - b.start || (a.type === 'event' ? -1 : 1));
  let html = '';
  let cursor = null;
  let nowPlaced = !isToday;
  items.forEach((it, i) => {
    if (!nowPlaced && it.start > nowMin) {
      html += `<li class="tl-now" aria-label="Now"><span>Now · ${esc(formatTime(fromMinutes(nowMin)))}</span></li>`;
      nowPlaced = true;
    }
    if (cursor != null && it.start - cursor >= 30) html += `<li class="tl-gap">${icon('sparkle')}Free · ${formatDuration(it.start - cursor)}</li>`;
    cursor = Math.max(cursor ?? 0, it.end);
    const time = `<span class="tl-time"><b>${esc(formatTime(fromMinutes(it.start)))}</b><small>${formatDuration(it.end - it.start)}</small></span>`;
    if (it.type === 'event') {
      html += `<li class="tl-item" style="--i:${i}">${time}<span class="tl-dot cat-${it.e.category || 'none'}"></span>
        <button type="button" class="tl-card tl-event cat-${it.e.category || 'none'}" data-action="view-event" data-id="${it.e.id}">
          <span class="tl-title">${esc(it.e.title)}</span>
          <span class="tl-meta">${icon('calendar')}${esc(formatTime(it.e.start))} – ${esc(formatTime(it.e.end))}${it.e.location ? ` · ${esc(it.e.location)}` : ''}</span>
        </button></li>`;
    } else {
      const t = it.t;
      const isClash = clash.includes(it.b);
      html += `<li class="tl-item${t.done ? ' is-done' : ''}" style="--i:${i}">${time}<span class="tl-dot tl-dot-task"></span>
        <div class="tl-card tl-task${isClash ? ' is-clash' : ''}">
          <button type="button" class="check" role="checkbox" aria-checked="${t.done}" data-action="plan-toggle" data-id="${t.id}" data-focus="pcheck-${t.id}" aria-label="${t.done ? 'Reopen' : 'Complete'}: ${esc(t.title)}">${icon('check')}</button>
          <button type="button" class="tl-body" data-action="plan-block" data-id="${t.id}" data-focus="pblock-${t.id}">
            <span class="tl-title">${esc(t.title)}</span>
            <span class="tl-meta">${it.b.locked ? `${icon('pin')}Locked · ` : ''}${esc(formatTime(it.b.start))} – ${esc(formatTime(it.b.end))}${t.priority === 'high' ? ` · <span class="prio-high">High</span>` : ''}${t.category ? ` · ${catLabel(t.category)}` : ''}${isClash ? ' · <span class="clash">Clashes with an event</span>' : ''}</span>
          </button>
        </div></li>`;
    }
  });
  if (!nowPlaced) html += `<li class="tl-now" aria-label="Now"><span>Now · ${esc(formatTime(fromMinutes(nowMin)))}</span></li>`;

  return `${header}${switcher}
    <section class="card plan-summary">
      ${ring(blocks.length ? done / blocks.length : 0, `${done} of ${blocks.length} planned tasks done`)}
      <div class="plan-summary-text">
        <p class="plan-summary-title">${done === blocks.length && blocks.length ? 'Plan complete. Well done.' : `${done} of ${blocks.length} done`}</p>
        <p class="muted small">${formatDuration(planned)} of focused work${unplaced.length ? ` · ${unplaced.length} didn’t fit` : ''}</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" data-action="plan-generate">${icon('refresh')}Re-plan</button>
    </section>
    ${clash.length ? `<div class="tip tip-warn">${icon('alert')}<span>Your calendar changed and ${clash.length} block${clash.length > 1 ? 's' : ''} now clash${clash.length > 1 ? '' : 'es'} with an event.</span><button type="button" class="btn btn-secondary btn-sm" data-action="plan-generate">Fix</button></div>` : ''}
    ${dayEvents.some((e) => e.allDay) ? `<div class="allday-row">${dayEvents.filter((e) => e.allDay).map((e) => `<button type="button" class="allday-chip cat-${e.category || 'none'}" data-action="view-event" data-id="${e.id}"><span class="dot"></span>${esc(e.title)}</button>`).join('')}</div>` : ''}
    ${items.length ? `<ol class="timeline">${html}</ol>` : `<div class="card">${emptyState('tasks', 'Nothing left to plan', 'Everything is done or set aside. Re-plan after adding more tasks.')}</div>`}
    ${unfinishedPast.length ? `<section class="card wrapup">
      <span class="wrapup-icon">${icon('moon')}</span>
      <div><p class="plan-summary-title">Wrap up</p><p class="muted small">${unfinishedPast.length} planned task${unfinishedPast.length > 1 ? 's' : ''} slipped. That happens.</p></div>
      <button type="button" class="btn btn-primary btn-sm" data-action="plan-carry" data-ids="${unfinishedPast.map((b) => b.taskId).join(',')}">Move to tomorrow</button>
    </section>` : ''}
    ${unplaced.length ? `<section class="card section">
      <div class="section-head"><h2>Didn’t fit</h2><button type="button" class="link-btn small" data-action="plan-carry" data-ids="${unplaced.map((t) => t.id).join(',')}">Move all to tomorrow</button></div>
      <ul class="unplaced">${unplaced.map((t) => `<li><span>${esc(t.title)}</span><span class="muted small">${formatDuration(t.estimate)}</span></li>`).join('')}</ul>
    </section>` : ''}
    ${prefsRow}`;
}

// Moves tasks to the day after the plan date and drops them from this plan.
export function carryOver(ids, date) {
  const snap = store.snapshot();
  const next = addDays(date, 1);
  const tasks = store.getState().tasks;
  ids.forEach((id) => { const t = tasks.find((x) => x.id === id); if (t) store.saveTask({ ...t, due: next }); });
  const plan = store.getState().plans[date];
  if (plan) store.savePlan({ ...plan, blocks: plan.blocks.filter((b) => !ids.includes(b.taskId)), skipped: [...new Set([...plan.skipped, ...ids])] });
  toast(`Moved ${ids.length} task${ids.length > 1 ? 's' : ''} to ${date === todayKey() ? 'tomorrow' : formatDate(next, { weekday: 'long' })}`, { actionLabel: 'Undo', onAction: () => store.restore(snap) });
}

export function openBlockSheet(taskId, date) {
  const { tasks, plans } = store.getState();
  const t = tasks.find((x) => x.id === taskId);
  const plan = plans[date];
  const b = plan?.blocks.find((x) => x.taskId === taskId);
  if (!t || !b) return;
  const dlg = openSheet(`${sheetHeader('Plan block')}
    <div class="sheet-body">
      <div class="detail-head"><span class="detail-bar" style="background:var(--accent)"></span>
        <div><h3 class="detail-title">${esc(t.title)}</h3><p class="muted">${esc(formatTime(b.start))} – ${esc(formatTime(b.end))}</p></div></div>
      <section><h3 class="group-label">How long will it take?</h3>
        <div class="chips">${ESTIMATES.map((m) => `<button type="button" class="chip-btn${t.estimate === m ? ' is-on' : ''}" data-estimate="${m}" aria-pressed="${t.estimate === m}">${formatDuration(m)}</button>`).join('')}</div>
        <p class="group-foot">The plan re-flows around the new length.</p></section>
      <div class="group-list">
        <label class="cell" for="block-lock"><span class="cell-icon tone-blue">${icon('pin')}</span><span class="cell-label">Lock this time<br><span class="muted small">Re-planning won’t move it</span></span>
          <input id="block-lock" type="checkbox" class="switch" ${b.locked ? 'checked' : ''}></label>
      </div>
      <div class="group-list">
        <button type="button" class="cell cell-btn" data-do="complete"><span class="cell-icon tone-accent">${icon(t.done ? 'refresh' : 'check')}</span><span class="cell-label">${t.done ? 'Reopen task' : 'Mark as done'}</span></button>
        <button type="button" class="cell cell-btn" data-do="tomorrow"><span class="cell-icon tone-amber">${icon('arrowRight')}</span><span class="cell-label">Move to tomorrow</span></button>
        <button type="button" class="cell cell-btn" data-do="skip"><span class="cell-icon tone-gray">${icon('x')}</span><span class="cell-label">Not today (remove from plan)</span></button>
        <button type="button" class="cell cell-btn" data-do="edit"><span class="cell-icon tone-gray">${icon('pencil')}</span><span class="cell-label">Edit task</span></button>
      </div>
    </div>`, { label: 'Plan block' });
  dlg.querySelectorAll('[data-estimate]').forEach((el) => el.addEventListener('click', () => {
    const m = Number(el.dataset.estimate);
    store.saveTask({ ...t, estimate: m });
    generatePlan(date, { extraLocked: [{ taskId, start: b.start, end: fromMinutes(Math.min(toMinutes(b.start) + m, 23 * 60 + 59)), locked: b.locked }] });
    // Unlock again unless the user had locked it; it only stays put for this re-flow.
    if (!b.locked) { const p = store.getState().plans[date]; store.savePlan({ ...p, blocks: p.blocks.map((x) => (x.taskId === taskId ? { ...x, locked: false } : x)) }); }
    closeSheet(dlg);
    toast(`Set to ${formatDuration(m)} and re-planned`);
  }));
  dlg.querySelector('#block-lock').addEventListener('change', (e) => {
    const p = store.getState().plans[date];
    store.savePlan({ ...p, blocks: p.blocks.map((x) => (x.taskId === taskId ? { ...x, locked: e.target.checked } : x)) });
  });
  dlg.querySelector('[data-do="complete"]').addEventListener('click', () => { closeSheet(dlg); store.setTaskDone(taskId, !t.done); });
  dlg.querySelector('[data-do="tomorrow"]').addEventListener('click', () => { closeSheet(dlg); carryOver([taskId], date); });
  dlg.querySelector('[data-do="skip"]').addEventListener('click', () => {
    const snap = store.snapshot();
    const p = store.getState().plans[date];
    store.savePlan({ ...p, blocks: p.blocks.filter((x) => x.taskId !== taskId), skipped: [...p.skipped, taskId] });
    closeSheet(dlg);
    toast('Removed from today’s plan', { actionLabel: 'Undo', onAction: () => store.restore(snap) });
  });
  dlg.querySelector('[data-do="edit"]').addEventListener('click', () => { closeSheet(dlg); setTimeout(() => openTaskForm(store.getState().tasks.find((x) => x.id === taskId)), 200); });
}

export function openPlanHours() {
  const p = store.getState().prefs;
  const dlg = openSheet(`<form class="form" novalidate>${sheetHeader('Planning hours', { submit: 'Save' })}
    <div class="sheet-body">
      <p class="muted">Evenday only plans tasks inside these hours.</p>
      <div class="group-list">
        <label class="cell" for="ph-start"><span class="cell-icon tone-amber">${icon('sun')}</span><span class="cell-label">Day starts</span><input id="ph-start" class="cell-value" type="time" name="start" value="${p.dayStart}"></label>
        <label class="cell" for="ph-end"><span class="cell-icon tone-violet">${icon('moon')}</span><span class="cell-label">Day ends</span><input id="ph-end" class="cell-value" type="time" name="end" value="${p.dayEnd}"></label>
      </div>
      <p class="field-error" id="ph-error" role="alert" hidden>The day needs to be at least an hour long.</p>
    </div></form>`, { label: 'Planning hours' });
  const form = dlg.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = form.start.value && form.end.value && toMinutes(form.end.value) - toMinutes(form.start.value) >= 60;
    dlg.querySelector('#ph-error').hidden = ok;
    if (!ok) return;
    store.setPrefs({ dayStart: form.start.value, dayEnd: form.end.value });
    closeSheet(dlg);
    toast('Planning hours saved');
  });
}
