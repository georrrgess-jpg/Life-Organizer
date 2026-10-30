// Life Dashboard: weekly overview, habits, goals, activity heat-map and balance.
import * as store from '../store.js';
import { CATEGORIES, TILE_COLORS } from '../store.js';
import { activity, balance, bestStreak, goalPace, goalProgress, habitRate, isScheduled, lastDays, streak, tasksDoneBetween, weekRange } from '../life.js';
import { formatDate, todayKey, weekdayLabels } from '../dates.js';
import { emptyState, pageHeader } from '../components.js';
import { closeSheet, confirmDialog, esc, openSheet, reducedMotion, sheetHeader, toast } from '../ui.js';
import { icon } from '../icons.js';

const pct = (r) => `${Math.round((r || 0) * 100)}%`;
function ring(ratio, label, value, tone = 'accent') {
  const c = 2 * Math.PI * 26;
  return `<div class="stat-ring">
    <div class="ring ring-${tone}" role="img" aria-label="${esc(label)}: ${esc(value)}">
      <svg viewBox="0 0 64 64"><circle class="ring-track" cx="32" cy="32" r="26"/><circle class="ring-fill" cx="32" cy="32" r="26" style="--c:${c};--off:${c * (1 - Math.min(1, ratio || 0))}"/></svg>
      <span class="ring-num">${esc(value)}</span></div>
    <span class="stat-label">${esc(label)}</span></div>`;
}

export function habitRow(h, today, { compact = false } = {}) {
  const scheduled = isScheduled(h, today);
  const done = Boolean(h.log[today]);
  const s = streak(h, today);
  return `<li class="habit tile-${h.color}${done ? ' is-done' : ''}" data-habit="${h.id}">
    <button type="button" class="habit-check" data-action="habit-toggle" data-id="${h.id}" data-focus="habit-${h.id}" role="checkbox" aria-checked="${done}" ${scheduled || done ? '' : 'disabled'}
      aria-label="${esc(h.title)}${scheduled ? '' : ' (rest day)'}">${icon('check')}</button>
    <button type="button" class="habit-body" ${compact ? 'data-action="nav-life"' : `data-action="habit-edit" data-id="${h.id}"`}>
      <span class="habit-title">${esc(h.title)}</span>
      <span class="habit-meta">${scheduled ? '' : 'Rest day · '}${s ? `<span class="streak">${icon('flame')}${s} ${h.days.length === 7 ? 'day' : 'time'}${s === 1 ? '' : 's'}</span>` : 'Start a streak today'}</span>
    </button>
    ${compact ? '' : `<span class="habit-week" aria-hidden="true">${lastDays(h, today).map((d) => `<span class="hd${d.done ? ' on' : ''}${d.scheduled ? '' : ' off'}"></span>`).join('')}</span>`}
  </li>`;
}

export function renderLife(state, ui) {
  const today = todayKey();
  const ws = state.prefs.weekStart;
  const wk = weekRange(today, ws);
  const doneThis = tasksDoneBetween(state.tasks, wk.from, today);
  const doneLast = tasksDoneBetween(state.tasks, wk.prevFrom, wk.prevTo);
  const habitWeek = habitRate(state.habits, wk.from, today);
  const activeGoals = state.goals.filter((g) => !g.completedAt);
  const goalAvg = activeGoals.length ? activeGoals.reduce((n, g) => n + goalProgress(g, state.tasks).ratio, 0) / activeGoals.length : null;
  const plan = state.plans[today];
  const planDone = plan ? plan.blocks.filter((b) => state.tasks.find((t) => t.id === b.taskId)?.done).length : 0;
  const diff = doneThis - doneLast;

  // Habits
  const habits = state.habits.map((h) => habitRow(h, today)).join('');
  // Goals
  const goalCard = (g) => {
    const p = goalProgress(g, state.tasks);
    const pace = goalPace(g, p.ratio, today);
    const paceLabel = { done: 'Done', 'on-track': 'On track', behind: 'Behind', overdue: 'Past due' }[pace];
    const amount = g.kind === 'tasks' ? (p.linked ? `${p.current} of ${p.target} tasks` : 'No tasks linked yet') : `${p.current} / ${p.target}${g.unit ? ` ${esc(g.unit)}` : ''}`;
    return `<li class="goal tile-${g.color}${g.completedAt ? ' is-complete' : ''}" data-goal="${g.id}">
      <button type="button" class="goal-main" data-action="goal-edit" data-id="${g.id}">
        <span class="goal-title">${esc(g.title)}</span>
        <span class="goal-meta">${amount}${g.due ? ` · ${g.completedAt ? 'Finished' : `by ${esc(formatDate(g.due, { month: 'short', day: 'numeric' }))}`}` : ''}${paceLabel ? ` <span class="pace pace-${pace}">${paceLabel}</span>` : ''}</span>
        <span class="goal-bar"><span style="width:${pct(p.ratio)}"></span></span>
      </button>
      ${g.completedAt ? '' : g.kind === 'count'
        ? `<span class="goal-steps"><button type="button" class="btn-icon btn-sm" data-action="goal-log" data-id="${g.id}" data-delta="-1" aria-label="Decrease ${esc(g.title)}" ${g.current ? '' : 'disabled'}>${icon('minus')}</button>
           <button type="button" class="btn-icon btn-sm goal-plus" data-action="goal-log" data-id="${g.id}" data-delta="1" data-focus="glog-${g.id}" aria-label="Add one to ${esc(g.title)}">${icon('plus')}</button></span>`
        : `<button type="button" class="btn-icon btn-sm" data-action="goal-add-task" data-id="${g.id}" aria-label="Add a task to ${esc(g.title)}">${icon('plus')}</button>`}
    </li>`;
  };
  const openGoals = state.goals.filter((g) => !g.completedAt);
  const doneGoals = state.goals.filter((g) => g.completedAt);

  // Heat-map
  const act = activity(state.tasks, state.habits, today, 12, ws);
  const level = (n) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / act.max) * 4)));
  const cells = act.days.map((d) => `<button type="button" class="heat l${d.future ? 'x' : level(d.count)}" data-action="heat-day" data-date="${d.key}" data-count="${d.count}"
    ${d.future ? 'disabled' : ''} aria-label="${esc(formatDate(d.key, { month: 'short', day: 'numeric' }))}: ${d.count} done"></button>`).join('');
  const sel = ui.heatDay && act.days.find((d) => d.key === ui.heatDay);

  // Balance
  const bal = balance(state.tasks, state.events, wk.from, wk.to);
  const cats = Object.entries(bal).sort((a, b) => (b[1].hours + b[1].tasks / 2) - (a[1].hours + a[1].tasks / 2));
  const totalH = cats.reduce((n, [, v]) => n + v.hours, 0);

  return `
  ${pageHeader({ title: 'Life', summary: `Week of ${esc(formatDate(wk.from, { month: 'short', day: 'numeric' }))}` })}
  <section class="card life-overview" aria-label="This week">
    ${ring(habitWeek ?? 0, 'Habits', habitWeek == null ? '–' : pct(habitWeek))}
    ${ring(goalAvg ?? 0, 'Goals', goalAvg == null ? '–' : pct(goalAvg), 'violet')}
    ${ring(plan && plan.blocks.length ? planDone / plan.blocks.length : 0, 'Today’s plan', plan ? `${planDone}/${plan.blocks.length}` : '–', 'blue')}
    <p class="life-week">${icon('tasks')}<span><strong>${doneThis}</strong> task${doneThis === 1 ? '' : 's'} done this week${doneLast || doneThis ? ` · <span class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : ''}${diff} vs last week</span>` : ''}</span></p>
  </section>

  <section class="card section" aria-labelledby="h-habits">
    <div class="section-head"><h2 id="h-habits">Habits</h2><button type="button" class="btn btn-secondary btn-sm" data-action="habit-new">${icon('plus')}Habit</button></div>
    ${state.habits.length ? `<ul class="habit-list">${habits}</ul>` : emptyState('flame', 'Build a habit', 'Small things you want to do regularly, like “Drink water” or “Read 20 minutes”. Check them off to grow a streak.', `<button type="button" class="btn btn-primary btn-sm" data-action="habit-new">${icon('plus')}Add your first habit</button>`)}
  </section>

  <section class="card section" aria-labelledby="h-goals">
    <div class="section-head"><h2 id="h-goals">Goals</h2><button type="button" class="btn btn-secondary btn-sm" data-action="goal-new">${icon('plus')}Goal</button></div>
    ${openGoals.length ? `<ul class="goal-list">${openGoals.map(goalCard).join('')}</ul>` : emptyState('target', doneGoals.length ? 'All goals reached' : 'Set a goal', 'Track a number (“Read 12 books”) or link tasks to a bigger outcome (“Launch my portfolio”).', `<button type="button" class="btn btn-primary btn-sm" data-action="goal-new">${icon('plus')}Add a goal</button>`)}
    ${doneGoals.length ? `<details class="done-goals"><summary>${doneGoals.length} completed</summary><ul class="goal-list">${doneGoals.map(goalCard).join('')}</ul></details>` : ''}
  </section>

  <section class="card section" aria-labelledby="h-activity">
    <div class="section-head"><h2 id="h-activity">Activity</h2><span class="muted small">Last 12 weeks</span></div>
    <div class="heat-wrap"><div class="heat-grid" style="--weeks:12">${cells}</div></div>
    <div class="heat-foot">
      <span class="muted small">${sel ? `${esc(formatDate(sel.key, { weekday: 'short', month: 'short', day: 'numeric' }))}: <strong>${sel.count}</strong> task${sel.count === 1 ? '' : 's'} and check-ins` : `${act.total} tasks and check-ins`}</span>
      <span class="heat-legend" aria-hidden="true">Less<span class="heat l0"></span><span class="heat l1"></span><span class="heat l2"></span><span class="heat l3"></span><span class="heat l4"></span>More</span>
    </div>
  </section>

  <section class="card section" aria-labelledby="h-balance">
    <div class="section-head"><h2 id="h-balance">Balance this week</h2></div>
    ${cats.length ? `
      ${totalH ? `<div class="bal-bar" role="img" aria-label="Scheduled time by category">${cats.filter(([, v]) => v.hours).map(([c, v]) => `<span class="cat-${c}" style="flex:${v.hours}" title="${esc(CATEGORIES[c] || 'Other')}"></span>`).join('')}</div>` : ''}
      <ul class="bal-list">${cats.map(([c, v]) => `<li><span class="dot cat-${c}"></span><span class="bal-name">${esc(CATEGORIES[c] || 'Uncategorized')}</span>
        <span class="bal-val">${v.hours ? `${Math.round(v.hours * 10) / 10}h scheduled` : ''}${v.hours && v.tasks ? ' · ' : ''}${v.tasks ? `${v.tasks} done` : ''}</span></li>`).join('')}</ul>`
      : emptyState('calendar', 'Nothing yet this week', 'Events and finished tasks with a category show where your time goes.')}
  </section>`;
}

// ---------- Editors ----------

const swatches = (current) => `<div class="swatches">${TILE_COLORS.map((c) => `<label class="swatch tile-${c}"><input type="radio" name="color" value="${c}" ${current === c ? 'checked' : ''} aria-label="${c}"></label>`).join('')}</div>`;

export function openHabitForm(habit) {
  const h = habit || { title: '', days: [0, 1, 2, 3, 4, 5, 6], color: 'teal' };
  const labels = weekdayLabels(0);
  const order = store.getState().prefs.weekStart === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  const dlg = openSheet(`<form class="form" novalidate>${sheetHeader(habit ? 'Edit habit' : 'New habit', { submit: habit ? 'Save' : 'Add' })}
    <div class="sheet-body">
      <div><div class="group-list"><div class="cell cell-field">
        <label class="sr-only" for="habit-title">Habit</label>
        <input id="habit-title" class="cell-input cell-title" name="title" maxlength="80" value="${esc(h.title)}" placeholder="e.g. Drink water" autocomplete="off" autofocus>
      </div></div><p class="field-error" id="habit-title-error" hidden>Give the habit a name.</p></div>
      <fieldset class="field"><legend class="group-label">Repeat on</legend>
        <div class="chips day-chips">${order.map((d) => `<label class="chip"><input type="checkbox" name="days" value="${d}" ${h.days.includes(d) ? 'checked' : ''} aria-label="${labels[d].long}"><span>${labels[d].short}</span></label>`).join('')}</div>
        <div class="chips"><button type="button" class="chip-btn" data-days="0,1,2,3,4,5,6">Every day</button><button type="button" class="chip-btn" data-days="1,2,3,4,5">Weekdays</button><button type="button" class="chip-btn" data-days="0,6">Weekends</button></div>
        <p class="field-error" id="habit-days-error" hidden>Pick at least one day.</p>
      </fieldset>
      <fieldset class="field"><legend class="group-label">Color</legend>${swatches(h.color)}</fieldset>
      ${habit ? `<p class="group-foot">Current streak ${streak(habit, todayKey())} · Best ${bestStreak(habit)} · ${Object.keys(habit.log).length} check-ins</p>
      <div class="group-list"><button type="button" class="cell cell-btn danger" data-delete><span class="cell-icon tone-red">${icon('trash')}</span><span class="cell-label">Delete habit</span></button></div>` : ''}
    </div></form>`, { label: habit ? 'Edit habit' : 'New habit' });
  const form = dlg.querySelector('form');
  form.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => {
    const set = b.dataset.days.split(',');
    form.querySelectorAll('input[name="days"]').forEach((c) => { c.checked = set.includes(c.value); });
  }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = form.title.value.trim();
    const days = [...form.querySelectorAll('input[name="days"]:checked')].map((c) => Number(c.value));
    form.querySelector('#habit-title-error').hidden = Boolean(title);
    form.querySelector('#habit-days-error').hidden = days.length > 0;
    if (!title) return form.title.focus();
    if (!days.length) return;
    store.saveHabit({ id: habit?.id, title, days, color: form.color.value });
    closeSheet(dlg);
    toast(habit ? 'Habit saved' : `Added habit “${title}”`);
  });
  dlg.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!await confirmDialog({ title: 'Delete habit?', message: `“${esc(habit.title)}” and its ${Object.keys(habit.log).length} check-ins will be removed.`, confirmLabel: 'Delete', danger: true })) return;
    const snap = store.snapshot();
    closeSheet(dlg);
    store.deleteHabit(habit.id);
    toast('Habit deleted', { actionLabel: 'Undo', onAction: () => store.restore(snap) });
  });
}

export function openGoalForm(goal) {
  const g = goal || { title: '', kind: 'count', target: 10, unit: '', due: null, color: 'violet' };
  const linked = goal ? store.getState().tasks.filter((t) => t.goalId === goal.id) : [];
  const dlg = openSheet(`<form class="form" novalidate>${sheetHeader(goal ? 'Edit goal' : 'New goal', { submit: goal ? 'Save' : 'Add' })}
    <div class="sheet-body">
      <div><div class="group-list"><div class="cell cell-field">
        <label class="sr-only" for="goal-title">Goal</label>
        <input id="goal-title" class="cell-input cell-title" name="title" maxlength="120" value="${esc(g.title)}" placeholder="e.g. Read 12 books" autocomplete="off" autofocus>
      </div></div><p class="field-error" id="goal-title-error" hidden>Give the goal a name.</p></div>
      <fieldset class="field"><legend class="group-label">Track progress by</legend>
        <div class="segmented" role="radiogroup">
          <label class="seg"><input type="radio" name="kind" value="count" ${g.kind === 'count' ? 'checked' : ''}><span>A number</span></label>
          <label class="seg"><input type="radio" name="kind" value="tasks" ${g.kind === 'tasks' ? 'checked' : ''}><span>Linked tasks</span></label>
        </div></fieldset>
      <div class="group-list goal-count" ${g.kind === 'count' ? '' : 'hidden'}>
        <label class="cell" for="goal-target"><span class="cell-icon tone-violet">${icon('target')}</span><span class="cell-label">Target</span><input id="goal-target" class="cell-value" name="target" type="number" inputmode="numeric" min="1" max="100000" value="${g.target}"></label>
        <label class="cell" for="goal-unit"><span class="cell-icon tone-gray">${icon('note')}</span><span class="cell-label">Unit</span><input id="goal-unit" class="cell-value" name="unit" maxlength="24" value="${esc(g.unit)}" placeholder="books"></label>
        ${goal ? `<label class="cell" for="goal-current"><span class="cell-icon tone-accent">${icon('check')}</span><span class="cell-label">Progress so far</span><input id="goal-current" class="cell-value" name="current" type="number" inputmode="numeric" min="0" value="${goal.current}"></label>` : ''}
      </div>
      <p class="group-foot goal-tasks-hint" ${g.kind === 'tasks' ? '' : 'hidden'}>Link tasks from any task’s editor, or with + on the goal. ${goal ? `${linked.length} linked, ${linked.filter((t) => t.done).length} done.` : ''}</p>
      <div class="group-list">
        <label class="cell" for="goal-due"><span class="cell-icon tone-red">${icon('calendar')}</span><span class="cell-label">Finish by <span class="optional">optional</span></span><input id="goal-due" class="cell-value" name="due" type="date" value="${g.due || ''}"></label>
      </div>
      <fieldset class="field"><legend class="group-label">Color</legend>${swatches(g.color)}</fieldset>
      ${goal ? `<div class="group-list">
        <button type="button" class="cell cell-btn" data-complete><span class="cell-icon tone-accent">${icon(goal.completedAt ? 'refresh' : 'check')}</span><span class="cell-label">${goal.completedAt ? 'Reopen goal' : 'Mark goal as reached'}</span></button>
        <button type="button" class="cell cell-btn danger" data-delete><span class="cell-icon tone-red">${icon('trash')}</span><span class="cell-label">Delete goal</span></button></div>` : ''}
    </div></form>`, { label: goal ? 'Edit goal' : 'New goal' });
  const form = dlg.querySelector('form');
  form.querySelectorAll('input[name="kind"]').forEach((r) => r.addEventListener('change', () => {
    form.querySelector('.goal-count').hidden = form.kind.value !== 'count';
    form.querySelector('.goal-tasks-hint').hidden = form.kind.value !== 'tasks';
  }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = form.title.value.trim();
    form.querySelector('#goal-title-error').hidden = Boolean(title);
    if (!title) return form.title.focus();
    const data = { id: goal?.id, title, kind: form.kind.value, target: form.target.value, unit: form.unit.value, due: form.due.value || null, color: form.color.value };
    if (form.current) data.current = form.current.value;
    const saved = store.saveGoal(data);
    closeSheet(dlg);
    if (saved.kind === 'count' && saved.current >= saved.target && !saved.completedAt) { store.setGoalComplete(saved.id, true); celebrate(saved.id); }
    toast(goal ? 'Goal saved' : `Added goal “${title}”`);
  });
  dlg.querySelector('[data-complete]')?.addEventListener('click', () => {
    closeSheet(dlg);
    store.setGoalComplete(goal.id, !goal.completedAt);
    if (!goal.completedAt) celebrate(goal.id);
  });
  dlg.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!await confirmDialog({ title: 'Delete goal?', message: `“${esc(goal.title)}” will be removed. Linked tasks stay, unlinked.`, confirmLabel: 'Delete', danger: true })) return;
    const snap = store.snapshot();
    closeSheet(dlg);
    store.deleteGoal(goal.id);
    toast('Goal deleted', { actionLabel: 'Undo', onAction: () => store.restore(snap) });
  });
}

// A small burst of color from a goal card when it's reached.
export function celebrate(goalId) {
  toast('Goal reached. Congratulations!');
  if (reducedMotion()) return;
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-goal="${goalId}"]`) || document.querySelector('.goal-list');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const burst = document.createElement('div');
    burst.className = 'burst';
    burst.style.left = `${r.left + r.width / 2}px`;
    burst.style.top = `${r.top + r.height / 2}px`;
    burst.innerHTML = Array.from({ length: 14 }, (_, i) => `<span style="--a:${(i / 14) * 360}deg;--d:${50 + (i % 3) * 18}px;--c:var(--t-${TILE_COLORS[i % 5]})"></span>`).join('');
    document.body.append(burst);
    setTimeout(() => burst.remove(), 900);
  });
}
