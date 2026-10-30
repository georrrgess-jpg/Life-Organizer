// Dates are stored as local "YYYY-MM-DD" keys and times as "HH:MM".
// Nothing is converted to UTC, so an event never drifts to another day.

export const pad = (n) => String(n).padStart(2, '0');

export function toKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayKey = () => toKey(new Date());

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function isValidKey(key) {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && toKey(parseKey(key)) === key;
}

export const isValidTime = (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export function toMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export const fromMinutes = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

// Whole days from a to b; rounding absorbs daylight-saving hour shifts.
export const diffDays = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);

const formatters = new Map();
function fmt(opts) {
  const id = JSON.stringify(opts);
  if (!formatters.has(id)) formatters.set(id, new Intl.DateTimeFormat(undefined, opts));
  return formatters.get(id);
}

export const formatDate = (key, opts) => fmt(opts).format(parseKey(key));

export function formatTime(t) {
  const [h, m] = t.split(':').map(Number);
  return fmt({ hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, h, m));
}

export function relativeDay(key, today = todayKey()) {
  const n = diffDays(today, key);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return formatDate(key, { weekday: 'long' });
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return formatDate(key, { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

// 6 rows x 7 columns of date keys covering the given month.
export function monthGrid(year, month, weekStart = 0) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() - weekStart + 7) % 7;
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => toKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
}

export function weekdayLabels(weekStart = 0) {
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2023, 0, 1 + ((i + weekStart) % 7));
    return { short: fmt({ weekday: 'narrow' }).format(d), long: fmt({ weekday: 'long' }).format(d) };
  });
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// Next full hour, between 8:00 and 22:00 so a one-hour event stays within the day.
export function suggestedStart(date = new Date()) {
  return fromMinutes(Math.min(Math.max((date.getHours() + 1) * 60, 8 * 60), 22 * 60));
}
