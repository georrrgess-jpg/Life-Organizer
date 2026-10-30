// Plan My Day: fits open tasks into the free time between events.
// Pure functions, no DOM; all times are minutes since midnight on the plan's date.
import { addDays, fromMinutes, toMinutes } from './dates.js';

export const ENERGY_WINDOWS = { morning: [8 * 60, 12 * 60], afternoon: [12 * 60, 17 * 60], evening: [17 * 60, 22 * 60] };
const BUFFER = 5; // breathing room around events

// Which open tasks belong in a plan for `date`, most important first.
export function rankTasks(tasks, date, skipped = []) {
  const soon = addDays(date, 2);
  return tasks
    .filter((t) => !t.done && !skipped.includes(t.id) && (!t.due || t.due <= soon))
    .map((t) => {
      let score = 0;
      if (t.due && t.due < date) score += 45;
      else if (t.due === date) score += 36;
      else if (t.due) score += 10;
      score += { high: 25, normal: 0, low: -10 }[t.priority] || 0;
      if (t.goalId) score += 8;
      return { task: t, score };
    })
    .sort((a, b) => b.score - a.score || (a.task.due || '9').localeCompare(b.task.due || '9') || a.task.createdAt.localeCompare(b.task.createdAt))
    .map((x) => x.task);
}

// Free gaps inside [from, to] once busy intervals are removed.
export function freeGaps(busy, from, to) {
  const sorted = busy.map(([s, e]) => [Math.max(from, s), Math.min(to, e)]).filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let cur = from;
  for (const [s, e] of sorted) {
    if (s > cur) gaps.push([cur, s]);
    cur = Math.max(cur, e);
  }
  if (to > cur) gaps.push([cur, to]);
  return gaps;
}

const roundUp = (m, step = 15) => Math.ceil(m / step) * step;

/**
 * Builds a plan.
 * @param {object} o
 * @param {string} o.date            plan date (YYYY-MM-DD)
 * @param {Array}  o.tasks           all tasks
 * @param {Array}  o.events          all events
 * @param {object} o.prefs           { dayStart, dayEnd, energy }
 * @param {number|null} o.nowMin     minutes now if planning today, else null
 * @param {Array}  o.locked          blocks to keep exactly where they are
 * @param {Array}  o.skipped         task ids left out on purpose
 */
export function buildPlan({ date, tasks, events, prefs, nowMin = null, locked = [], skipped = [] }) {
  const dayStart = toMinutes(prefs.dayStart);
  const dayEnd = toMinutes(prefs.dayEnd);
  const from = Math.max(dayStart, nowMin == null ? dayStart : roundUp(nowMin + 5));
  const peak = ENERGY_WINDOWS[prefs.energy] || ENERGY_WINDOWS.morning;
  const lockedOpen = locked.filter((b) => tasks.some((t) => t.id === b.taskId && !t.done));
  const busy = [
    ...events.filter((e) => e.date === date && !e.allDay).map((e) => [toMinutes(e.start) - BUFFER, toMinutes(e.end) + BUFFER]),
    ...lockedOpen.map((b) => [toMinutes(b.start), toMinutes(b.end) + BUFFER]),
  ];
  const lockedIds = new Set(lockedOpen.map((b) => b.taskId));
  const blocks = lockedOpen.map((b) => ({ ...b, locked: true }));
  const unplaced = [];

  for (const task of rankTasks(tasks, date, skipped).filter((t) => !lockedIds.has(t.id))) {
    const len = task.estimate || 30;
    const gaps = freeGaps(busy, from, dayEnd).filter(([s, e]) => e - s >= len);
    if (!gaps.length) { if (task.due && task.due <= date) unplaced.push(task.id); continue; }
    const deep = task.priority === 'high' || len >= 60;
    let start = null;
    if (deep) {
      // Prefer the earliest slot that starts inside the peak-energy window.
      for (const [s, e] of gaps) {
        const st = Math.max(s, peak[0]);
        if (st < peak[1] && st + len <= e) { start = st; break; }
      }
    }
    if (start == null) start = gaps[0][0];
    const end = start + len;
    blocks.push({ taskId: task.id, start: fromMinutes(start), end: fromMinutes(end), locked: false });
    busy.push([start, end + (len >= 60 ? 10 : BUFFER)]);
  }

  blocks.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const planned = blocks.reduce((n, b) => n + toMinutes(b.end) - toMinutes(b.start), 0);
  const eventMinutes = events.filter((e) => e.date === date && !e.allDay)
    .reduce((n, e) => n + Math.max(0, Math.min(dayEnd, toMinutes(e.end)) - Math.max(from, toMinutes(e.start))), 0);
  return { blocks, unplaced, plannedMinutes: planned, freeMinutes: Math.max(0, dayEnd - from - eventMinutes - planned) };
}

// Blocks that now clash with an event (the calendar changed after planning).
export function conflicts(plan, events) {
  const evs = events.filter((e) => e.date === plan.date && !e.allDay);
  return plan.blocks.filter((b) => evs.some((e) => toMinutes(b.start) < toMinutes(e.end) && toMinutes(e.start) < toMinutes(b.end)));
}

export const formatDuration = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);
