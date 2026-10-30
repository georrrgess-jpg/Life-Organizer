// Unit tests for the on-device Quick add parser. Run: node tests/parse.test.mjs
import assert from 'node:assert/strict';
import { parseCapture } from '../js/parse.js';

const now = new Date(2026, 9, 30, 10, 0); // Friday, Oct 30 2026, 10:00
const one = (text, opts = {}) => parseCapture(text, { now, ...opts })[0];
const cases = [
  ['timed event', () => assert.deepEqual(
    (({ kind, title, date, start, end }) => ({ kind, title, date, start, end }))(one('Dentist tomorrow at 3pm')),
    { kind: 'event', title: 'Dentist', date: '2026-10-31', start: '15:00', end: '16:00' })],
  ['plain task stays undated', () => { const t = one('buy milk'); assert.equal(t.kind, 'task'); assert.equal(t.title, 'Buy milk'); assert.equal(t.date, null); }],
  ['several items split on commas and new lines', () => assert.equal(parseCapture('a, b\nc; d', { now }).length, 4)],
  ['year comma is not a split', () => assert.equal(parseCapture('Trip Nov 5, 2027', { now }).length, 1)],
  ['priority with !', () => assert.equal(one('Essay due Monday !').priority, 'high')],
  ['priority words', () => { assert.equal(one('urgent call bank').priority, 'high'); assert.equal(one('clean garage low priority').priority, 'low'); }],
  ['weekday is the next occurrence', () => { assert.equal(one('Gym Monday').date, '2026-11-02'); assert.equal(one('Gym Friday').date, '2026-11-06'); }],
  ['month names and numeric dates', () => { assert.equal(one('Party Nov 14').date, '2026-11-14'); assert.equal(one('Party 14 November').date, '2026-11-14'); assert.equal(one('Party 11/14').date, '2026-11-14'); }],
  ['day-first numeric dates outside the US', () => assert.equal(one('Party 14/11', { dayFirst: true }).date, '2026-11-14')],
  ['past month rolls to next year', () => assert.equal(one('Taxes March 1').date, '2027-03-01')],
  ['relative dates', () => { assert.equal(one('call in 3 days').date, '2026-11-02'); assert.equal(one('review next week').date, '2026-11-02'); assert.equal(one('rent on the 1st').date, '2026-11-01'); }],
  ['time range with shared meridiem', () => { const e = one('Meeting 11-1pm'); assert.equal(e.start, '11:00'); assert.equal(e.end, '13:00'); }],
  ['duration sets the end', () => assert.equal(one('Gym 6:30pm for 45 min').end, '19:15')],
  ['deadline stays a task with a note', () => { const t = one('Report by 5pm Friday'); assert.equal(t.kind, 'task'); assert.match(t.notes, /Due by 5:00/); }],
  ['plain numbers are not times', () => { const t = one('buy 5-6 apples'); assert.equal(t.kind, 'task'); assert.equal(t.title, 'Buy 5-6 apples'); }],
  ['location from capitalized place', () => assert.equal(one('Lunch with Maya at Corner Café tomorrow 12:30').location, 'Corner Café')],
  ['tags and inferred categories', () => { assert.equal(one('slides #work').category, 'work'); assert.equal(one('study for quiz').category, 'school'); }],
  ['birthday becomes an all-day event', () => { const e = one("Mom's birthday Nov 4"); assert.equal(e.kind, 'event'); assert.equal(e.allDay, true); }],
  ['spoken prefixes are removed', () => assert.equal(one('remind me to call mom tomorrow').title, 'Call mom')],
  ['dictated p.m. format', () => assert.equal(one('Dinner tomorrow at 7 p.m.').start, '19:00')],
  ['empty text gives nothing', () => assert.equal(parseCapture('  ,  ', { now }).length, 0)],
];

let failed = 0;
for (const [name, fn] of cases) {
  try { fn(); console.log(`✓ parser: ${name}`); } catch (e) { failed++; console.log(`✗ parser: ${name} — ${e.message.split('\n')[0]}`); }
}
console.log(`\n${cases.length - failed}/${cases.length} parser checks passed\n`);
process.exit(failed ? 1 : 0);
