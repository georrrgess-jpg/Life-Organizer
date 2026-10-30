// Unit tests for Plan My Day and the Life Dashboard. Run: node tests/features.test.mjs
import assert from 'node:assert/strict';
import { buildPlan, conflicts, freeGaps, rankTasks } from '../js/planner.js';
import { activity, balance, bestStreak, goalPace, goalProgress, habitRate, streak, weekRange } from '../js/life.js';
import { toMinutes } from '../js/dates.js';

const D = '2026-10-30'; // Friday
const task = (o) => ({ id: o.id, title: o.id, done: false, due: D, priority: 'normal', estimate: 30, createdAt: '2026-10-01T00:00:00Z', ...o });
const prefs = { dayStart: '08:00', dayEnd: '18:00', energy: 'morning' };
const ev = (start, end, o = {}) => ({ id: start, date: D, allDay: false, start, end, title: 'e', ...o });
const overlaps = (a, b) => toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);

const cases = [
  ['free gaps skip busy time', () => assert.deepEqual(freeGaps([[600, 660], [630, 700]], 480, 800), [[480, 600], [700, 800]])],
  ['ranking: overdue > due today > high priority later', () => {
    const r = rankTasks([task({ id: 'later', due: '2026-10-31', priority: 'high' }), task({ id: 'today' }), task({ id: 'late', due: '2026-10-28' })], D);
    assert.deepEqual(r.map((t) => t.id), ['late', 'today', 'later']);
  }],
  ['ranking leaves out far-future, done and skipped tasks', () => {
    const r = rankTasks([task({ id: 'far', due: '2026-11-20' }), task({ id: 'done', done: true }), task({ id: 'skip' }), task({ id: 'nodate', due: null })], D, ['skip']);
    assert.deepEqual(r.map((t) => t.id), ['nodate']);
  }],
  ['blocks never overlap events or each other', () => {
    const tasks = Array.from({ length: 8 }, (_, i) => task({ id: `t${i}`, estimate: [30, 60, 15, 45][i % 4] }));
    const events = [ev('09:00', '10:00'), ev('12:00', '13:00'), ev('15:30', '16:00')];
    const p = buildPlan({ date: D, tasks, events, prefs });
    for (const b of p.blocks) for (const e of events) assert.ok(!overlaps(b, e), `${b.start} overlaps ${e.start}`);
    for (let i = 1; i < p.blocks.length; i++) assert.ok(toMinutes(p.blocks[i].start) >= toMinutes(p.blocks[i - 1].end));
    for (const b of p.blocks) assert.ok(toMinutes(b.start) >= 480 && toMinutes(b.end) <= 1080);
  }],
  ['deep work goes into the peak-energy window', () => {
    const p = buildPlan({ date: D, tasks: [task({ id: 'small', estimate: 15 }), task({ id: 'deep', priority: 'high', estimate: 90 })], events: [], prefs: { ...prefs, energy: 'afternoon' } });
    const deep = p.blocks.find((b) => b.taskId === 'deep');
    assert.ok(toMinutes(deep.start) >= 12 * 60, deep.start);
  }],
  ['planning today starts after now', () => {
    const p = buildPlan({ date: D, tasks: [task({ id: 'a' })], events: [], prefs, nowMin: 14 * 60 + 7 });
    assert.equal(p.blocks[0].start, '14:15');
  }],
  ['tasks that do not fit are reported', () => {
    const p = buildPlan({ date: D, tasks: [task({ id: 'big', estimate: 120 })], events: [ev('08:00', '17:00')], prefs });
    assert.deepEqual(p.unplaced, ['big']);
  }],
  ['locked blocks stay put', () => {
    const p = buildPlan({ date: D, tasks: [task({ id: 'a' }), task({ id: 'b' })], events: [], prefs, locked: [{ taskId: 'a', start: '08:00', end: '08:30' }] });
    assert.deepEqual(p.blocks[0], { taskId: 'a', start: '08:00', end: '08:30', locked: true });
    assert.ok(toMinutes(p.blocks[1].start) >= toMinutes('08:30'));
  }],
  ['all-day events do not block time; conflicts are detected', () => {
    const p = buildPlan({ date: D, tasks: [task({ id: 'a' })], events: [ev(null, null, { allDay: true })], prefs });
    assert.equal(p.blocks[0].start, '08:00');
    assert.equal(conflicts({ date: D, blocks: p.blocks }, [ev('08:15', '09:00')]).length, 1);
  }],
  ['habit streak ignores unscheduled days and an unchecked today', () => {
    const h = { days: [1, 3, 5], log: { '2026-10-28': true, '2026-10-26': true, '2026-10-23': true }, createdAt: '2026-10-01' };
    assert.equal(streak(h, D), 3); // Fri unchecked yet, Wed+Mon+prev Fri done
    assert.equal(streak({ ...h, log: { ...h.log, [D]: true } }, D), 4);
    assert.equal(bestStreak({ ...h, log: { ...h.log, [D]: true } }), 4);
  }],
  ['broken streak resets', () => assert.equal(streak({ days: [0, 1, 2, 3, 4, 5, 6], log: { '2026-10-28': true }, createdAt: '2026-10-01' }, D), 0)],
  ['habit completion rate', () => assert.equal(habitRate([{ days: [0, 1, 2, 3, 4, 5, 6], log: { '2026-10-29': true }, createdAt: '2026-10-01' }], '2026-10-29', D), 0.5)],
  ['goal progress for counts and linked tasks', () => {
    assert.equal(goalProgress({ kind: 'count', current: 3, target: 12 }, []).ratio, 0.25);
    const g = goalProgress({ id: 'g', kind: 'tasks' }, [task({ id: 'a', goalId: 'g', done: true }), task({ id: 'b', goalId: 'g' })]);
    assert.deepEqual([g.current, g.target, g.ratio], [1, 2, 0.5]);
  }],
  ['goal pace', () => {
    const g = { createdAt: '2026-10-01T00:00:00Z', due: '2026-10-31', completedAt: null };
    assert.equal(goalPace(g, 0.2, D), 'behind');
    assert.equal(goalPace(g, 0.95, D), 'on-track');
    assert.equal(goalPace(g, 1, D), 'done');
  }],
  ['activity grid covers whole weeks and counts check-ins', () => {
    const a = activity([task({ id: 'x', done: true, completedAt: new Date(2026, 9, 30, 12).toISOString() })], [{ log: { [D]: true } }], D, 12, 0);
    assert.equal(a.days.length, 84);
    assert.equal(a.days.find((d) => d.key === D).count, 2);
    assert.equal(a.days.at(-1).key, '2026-10-31');
  }],
  ['week range and balance', () => {
    assert.deepEqual(weekRange(D, 1), { from: '2026-10-26', to: '2026-11-01', prevFrom: '2026-10-19', prevTo: '2026-10-25' });
    const b = balance([], [ev('09:00', '10:30', { category: 'work' })], '2026-10-26', '2026-11-01');
    assert.equal(b.work.hours, 1.5);
  }],
];
let failed = 0;
for (const [name, fn] of cases) {
  try { fn(); console.log(`✓ feature: ${name}`); } catch (e) { failed++; console.log(`✗ feature: ${name} — ${e.message.split('\n')[0]}`); }
}
console.log(`\n${cases.length - failed}/${cases.length} feature checks passed\n`);
process.exit(failed ? 1 : 0);
