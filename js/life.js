// Life Dashboard calculations: habit streaks, goal progress, activity and balance. Pure functions.
import { addDays, diffDays, parseKey, toKey, toMinutes } from './dates.js';

export const isScheduled = (habit, key) => habit.days.includes(parseKey(key).getDay());

// Consecutive scheduled days completed, counting back from today.
// Today only breaks the streak once it's over, so an unchecked today doesn't reset it.
export function streak(habit, today) {
  let n = 0;
  let key = today;
  if (isScheduled(habit, key) && !habit.log[key]) key = addDays(key, -1);
  for (let i = 0; i < 400; i++, key = addDays(key, -1)) {
    if (!isScheduled(habit, key)) continue;
    if (habit.log[key]) n++;
    else break;
  }
  return n;
}

export function bestStreak(habit) {
  const keys = Object.keys(habit.log).sort();
  if (!keys.length) return 0;
  let best = 0;
  let run = 0;
  for (let key = keys[0], last = keys[keys.length - 1]; key <= last; key = addDays(key, 1)) {
    if (!isScheduled(habit, key)) continue;
    run = habit.log[key] ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

// Last 7 days for the habit row: { key, scheduled, done }
export const lastDays = (habit, today, n = 7) => Array.from({ length: n }, (_, i) => {
  const key = addDays(today, i - n + 1);
  return { key, scheduled: isScheduled(habit, key), done: Boolean(habit.log[key]) };
});

// Share of scheduled habit days completed in [from, to].
export function habitRate(habits, from, to) {
  let due = 0;
  let done = 0;
  for (const h of habits) {
    const created = h.createdAt.slice(0, 10);
    for (let k = from; k <= to; k = addDays(k, 1)) {
      if (k < created && !h.log[k]) continue;
      if (!isScheduled(h, k)) continue;
      due++;
      if (h.log[k]) done++;
    }
  }
  return due ? done / due : null;
}

export function goalProgress(goal, tasks) {
  if (goal.kind === 'tasks') {
    const linked = tasks.filter((t) => t.goalId === goal.id);
    const done = linked.filter((t) => t.done).length;
    return { current: done, target: linked.length, ratio: linked.length ? done / linked.length : 0, linked: linked.length };
  }
  return { current: goal.current, target: goal.target, ratio: Math.min(1, goal.current / goal.target) };
}

// Compares progress with the share of time elapsed between creation and due date.
export function goalPace(goal, ratio, today) {
  if (goal.completedAt || ratio >= 1) return 'done';
  if (!goal.due) return null;
  const start = goal.createdAt.slice(0, 10);
  const total = Math.max(1, diffDays(start, goal.due));
  const elapsed = Math.min(total, Math.max(0, diffDays(start, today)));
  if (today > goal.due) return 'overdue';
  return ratio + 0.1 >= elapsed / total ? 'on-track' : 'behind';
}

// Completed tasks + habit check-ins per day for the last `weeks` weeks, aligned to week rows.
export function activity(tasks, habits, today, weeks = 12, weekStart = 0) {
  const counts = {};
  for (const t of tasks) if (t.done && t.completedAt) {
    const k = toKey(new Date(t.completedAt));
    counts[k] = (counts[k] || 0) + 1;
  }
  for (const h of habits) for (const k of Object.keys(h.log)) counts[k] = (counts[k] || 0) + 1;
  const end = parseKey(today);
  const lastCol = addDays(today, (6 - ((end.getDay() - weekStart + 7) % 7)));
  const first = addDays(lastCol, -(weeks * 7) + 1);
  const days = [];
  for (let k = first; k <= lastCol; k = addDays(k, 1)) days.push({ key: k, count: counts[k] || 0, future: k > today });
  const max = Math.max(1, ...days.map((d) => d.count));
  return { days, max, total: days.reduce((n, d) => n + d.count, 0) };
}

// This week's split: scheduled event hours and completed tasks per category.
export function balance(tasks, events, from, to) {
  const out = {};
  const add = (c, key, v) => { const k = c || 'none'; out[k] ||= { hours: 0, tasks: 0 }; out[k][key] += v; };
  for (const e of events) {
    if (e.date < from || e.date > to || e.allDay) continue;
    add(e.category, 'hours', (toMinutes(e.end) - toMinutes(e.start)) / 60);
  }
  for (const t of tasks) {
    if (!t.done || !t.completedAt) continue;
    const k = toKey(new Date(t.completedAt));
    if (k >= from && k <= to) add(t.category, 'tasks', 1);
  }
  return out;
}

export function weekRange(today, weekStart = 0) {
  const offset = (parseKey(today).getDay() - weekStart + 7) % 7;
  const from = addDays(today, -offset);
  return { from, to: addDays(from, 6), prevFrom: addDays(from, -7), prevTo: addDays(from, -1) };
}

export function tasksDoneBetween(tasks, from, to) {
  return tasks.filter((t) => t.done && t.completedAt && (() => { const k = toKey(new Date(t.completedAt)); return k >= from && k <= to; })()).length;
}
