// App state, validation and persistence. All data lives in localStorage on this device.
import { addDays, isValidKey, isValidTime, todayKey, toMinutes } from './dates.js';
import { GLYPHS } from './icons.js';

const KEY = 'evenday:data:v1';
const BACKUP_KEY = 'evenday:backup:v1';
export const SCHEMA_VERSION = 1;

export const CATEGORIES = {
  personal: 'Personal',
  work: 'Work',
  school: 'School',
  social: 'Social',
};
export const TASK_CATEGORIES = ['personal', 'work', 'school'];
export const PRIORITIES = { low: 'Low', normal: 'Normal', high: 'High' };
export const TILE_COLORS = ['teal', 'blue', 'violet', 'rose', 'amber', 'slate'];

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const nowIso = () => new Date().toISOString();

// ---------- Validation: each returns a clean record or null ----------

export function cleanTask(t) {
  if (!t || typeof t !== 'object') return null;
  const title = str(t.title, 200);
  if (!title) return null;
  return {
    id: str(t.id, 64) || uid(),
    title,
    notes: str(t.notes, 2000),
    due: isValidKey(t.due) ? t.due : null,
    priority: t.priority in PRIORITIES ? t.priority : 'normal',
    category: TASK_CATEGORIES.includes(t.category) ? t.category : null,
    done: t.done === true,
    completedAt: t.done === true && typeof t.completedAt === 'string' ? t.completedAt : t.done === true ? nowIso() : null,
    createdAt: typeof t.createdAt === 'string' ? t.createdAt : nowIso(),
    demo: t.demo === true,
  };
}

export function eventTimeError(e) {
  if (e.allDay) return null;
  if (!isValidTime(e.start) || !isValidTime(e.end)) return 'Enter a start and end time.';
  if (toMinutes(e.end) <= toMinutes(e.start)) return 'End time must be after the start time.';
  return null;
}

export function cleanEvent(e) {
  if (!e || typeof e !== 'object') return null;
  const title = str(e.title, 200);
  if (!title || !isValidKey(e.date)) return null;
  const allDay = e.allDay === true;
  const ev = {
    id: str(e.id, 64) || uid(),
    title,
    date: e.date,
    allDay,
    start: allDay ? null : e.start,
    end: allDay ? null : e.end,
    location: str(e.location, 200),
    notes: str(e.notes, 2000),
    category: e.category in CATEGORIES ? e.category : null,
    createdAt: typeof e.createdAt === 'string' ? e.createdAt : nowIso(),
    demo: e.demo === true,
  };
  return eventTimeError(ev) ? null : ev;
}

// Websites are the dependable destination; only http(s) is accepted.
export function normalizeUrl(input) {
  let v = str(input, 2000);
  if (!v) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v;
  try {
    const u = new URL(v);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !u.hostname.includes('.')) return null;
    return u.href;
  } catch {
    return null;
  }
}

// Optional app links such as "spotify:" — never script-capable schemes.
export function normalizeAppUrl(input) {
  const v = str(input, 500);
  if (!v) return '';
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(v);
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  if (['javascript', 'data', 'vbscript', 'file', 'blob', 'about', 'http', 'https'].includes(scheme)) return null;
  return v;
}

export function cleanShortcut(s) {
  if (!s || typeof s !== 'object') return null;
  const name = str(s.name, 40);
  const url = normalizeUrl(s.url);
  if (!name || !url) return null;
  const appUrl = normalizeAppUrl(s.appUrl) || '';
  const icon = s.icon && typeof s.icon === 'object' ? s.icon : {};
  return {
    id: str(s.id, 64) || uid(),
    name,
    url,
    appUrl,
    icon: icon.kind === 'glyph' && GLYPHS.includes(icon.value)
      ? { kind: 'glyph', value: icon.value }
      : { kind: 'text', value: [...str(icon.value, 8)].slice(0, 2).join('') || [...name][0].toUpperCase() },
    color: TILE_COLORS.includes(s.color) ? s.color : 'teal',
    favorite: s.favorite === true,
    example: s.example === true,
  };
}

const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const TODAY_SECTIONS = ['capture', 'upNext', 'tasks', 'schedule', 'favorites'];
export const THEME_DEFAULTS = { preset: 'evenday', accent: 'teal', trueBlack: false, font: 'system', textSize: 'm', radius: 'soft', density: 'comfy', motion: 'full' };

function cleanPrefs(p) {
  p = p && typeof p === 'object' ? p : {};
  const today = p.today && typeof p.today === 'object' ? p.today : {};
  return {
    theme: oneOf(p.theme, ['system', 'light', 'dark'], 'system'),
    weekStart: p.weekStart === 1 ? 1 : 0,
    preset: oneOf(p.preset, ['evenday', 'paper', 'ocean', 'forest', 'lavender', 'blush', 'sunset', 'midnight', 'slate'], 'evenday'),
    accent: oneOf(p.accent, ['teal', 'mint', 'green', 'sky', 'blue', 'indigo', 'violet', 'pink', 'red', 'orange', 'amber', 'graphite'], 'teal'),
    trueBlack: p.trueBlack === true,
    font: oneOf(p.font, ['system', 'rounded', 'serif', 'mono'], 'system'),
    textSize: oneOf(p.textSize, ['s', 'm', 'l', 'xl'], 'm'),
    radius: oneOf(p.radius, ['square', 'soft', 'round'], 'soft'),
    density: oneOf(p.density, ['comfy', 'compact'], 'comfy'),
    motion: oneOf(p.motion, ['full', 'reduce'], 'full'),
    name: str(p.name, 30),
    today: Object.fromEntries(TODAY_SECTIONS.map((k) => [k, today[k] !== false])),
    onboarded: p.onboarded === true,
    swipeTipSeen: p.swipeTipSeen === true,
  };
}

// ---------- Defaults and sample data ----------

function exampleShortcuts() {
  return [
    { name: 'Gmail', url: 'https://mail.google.com', icon: { kind: 'glyph', value: 'mail' }, color: 'rose', favorite: true },
    { name: 'Google Maps', url: 'https://www.google.com/maps', icon: { kind: 'glyph', value: 'map' }, color: 'teal', favorite: true },
    { name: 'Spotify', url: 'https://open.spotify.com', appUrl: 'spotify:', icon: { kind: 'glyph', value: 'music' }, color: 'violet', favorite: true },
    { name: 'YouTube', url: 'https://www.youtube.com', icon: { kind: 'glyph', value: 'play' }, color: 'amber' },
    { name: 'Wikipedia', url: 'https://www.wikipedia.org', icon: { kind: 'text', value: 'W' }, color: 'slate' },
    { name: 'Weather', url: 'https://weather.com', icon: { kind: 'glyph', value: 'cloud' }, color: 'blue' },
  ].map((s) => cleanShortcut({ ...s, example: true }));
}

function defaults() {
  return { tasks: [], events: [], shortcuts: exampleShortcuts(), prefs: cleanPrefs() };
}

export function sampleData(today = todayKey()) {
  const d = (n) => addDays(today, n);
  const tasks = [
    { title: 'Return library books', due: d(-1), category: 'school' },
    { title: 'Pay electricity bill', due: d(0), priority: 'high', category: 'personal' },
    { title: 'Finish slides for Monday review', due: d(0), priority: 'high', category: 'work' },
    { title: 'Reply to Sam about Saturday', due: d(0), category: 'personal' },
    { title: 'Submit expense report', due: d(2), category: 'work' },
    { title: 'Book dentist appointment', due: d(3), priority: 'low', category: 'personal' },
    { title: 'Study for chemistry quiz', due: d(4), category: 'school', notes: 'Chapters 6 and 7' },
    { title: 'Plan weekend hike' },
    { title: 'Water the plants', due: d(-1), done: true, completedAt: new Date(Date.now() - 864e5).toISOString() },
  ];
  const events = [
    { title: 'Book club', date: d(-2), start: '19:00', end: '20:30', category: 'social' },
    { title: 'Team stand-up', date: d(0), start: '09:30', end: '09:45', category: 'work' },
    { title: 'Lunch with Maya', date: d(0), start: '12:30', end: '13:30', category: 'social', location: 'Corner Café' },
    { title: 'Gym', date: d(0), start: '18:00', end: '19:00', category: 'personal' },
    { title: 'Dentist check-up', date: d(1), start: '08:15', end: '09:00', category: 'personal', location: 'Riverside Dental' },
    { title: "Mom's birthday", date: d(2), allDay: true, category: 'social', notes: 'Call in the morning' },
    { title: 'Project deadline', date: d(5), allDay: true, category: 'work' },
    { title: 'Study group', date: d(6), start: '16:00', end: '17:30', category: 'school', location: 'Library, room 2' },
  ];
  return {
    tasks: tasks.map((t) => cleanTask({ ...t, demo: true })),
    events: events.map((e) => cleanEvent({ ...e, demo: true })),
  };
}

// ---------- Store ----------

let state = defaults();
let storageOk = true;
let firstRun = false;
const listeners = new Set();

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

function fromRaw(raw) {
  const data = JSON.parse(raw);
  return {
    tasks: (data.tasks || []).map(cleanTask).filter(Boolean),
    events: (data.events || []).map(cleanEvent).filter(Boolean),
    shortcuts: (data.shortcuts || []).map(cleanShortcut).filter(Boolean),
    prefs: cleanPrefs(data.prefs),
  };
}

export function load() {
  const raw = read(KEY);
  if (raw) {
    try { state = fromRaw(raw); } catch { state = defaults(); }
  } else {
    firstRun = true;
    state = defaults();
  }
  storageOk = write(KEY, JSON.stringify({ version: SCHEMA_VERSION, ...state }));
  return state;
}

function commit() {
  storageOk = write(KEY, JSON.stringify({ version: SCHEMA_VERSION, ...state }));
  listeners.forEach((fn) => fn(state));
}

export const getState = () => state;
export const isStorageOk = () => storageOk;
export const isFirstRun = () => firstRun;
export const subscribe = (fn) => listeners.add(fn);
export const snapshot = () => structuredClone(state);
export function restore(snap) { state = structuredClone(snap); commit(); }

// Another tab changed the data: pick it up.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try { state = fromRaw(e.newValue); listeners.forEach((fn) => fn(state)); } catch { /* ignore */ }
});

// Tasks
export function saveTask(data) {
  const existing = state.tasks.find((t) => t.id === data.id);
  const task = cleanTask({ ...existing, ...data, demo: existing ? existing.demo : false });
  if (!task) return null;
  state.tasks = existing ? state.tasks.map((t) => (t.id === task.id ? task : t)) : [...state.tasks, task];
  commit();
  return task;
}
export function setTaskDone(id, done) {
  state.tasks = state.tasks.map((t) => (t.id === id ? { ...t, done, completedAt: done ? nowIso() : null } : t));
  commit();
}
export function deleteTask(id) { state.tasks = state.tasks.filter((t) => t.id !== id); commit(); }
export function clearCompleted() { state.tasks = state.tasks.filter((t) => !t.done); commit(); }

// Events
export function saveEvent(data) {
  const existing = state.events.find((e) => e.id === data.id);
  const ev = cleanEvent({ ...existing, ...data, demo: existing ? existing.demo : false });
  if (!ev) return null;
  state.events = existing ? state.events.map((e) => (e.id === ev.id ? ev : e)) : [...state.events, ev];
  commit();
  return ev;
}
export function deleteEvent(id) { state.events = state.events.filter((e) => e.id !== id); commit(); }

// Shortcuts
export function saveShortcut(data) {
  const existing = state.shortcuts.find((s) => s.id === data.id);
  const sc = cleanShortcut({ ...existing, ...data, example: false });
  if (!sc) return null;
  state.shortcuts = existing ? state.shortcuts.map((s) => (s.id === sc.id ? sc : s)) : [...state.shortcuts, sc];
  commit();
  return sc;
}
export function toggleFavorite(id) {
  state.shortcuts = state.shortcuts.map((s) => (s.id === id ? { ...s, favorite: !s.favorite } : s));
  commit();
}
export function moveShortcut(id, delta) {
  const list = [...state.shortcuts];
  const i = list.findIndex((s) => s.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return false;
  [list[i], list[j]] = [list[j], list[i]];
  state.shortcuts = list;
  commit();
  return true;
}
export function deleteShortcut(id) { state.shortcuts = state.shortcuts.filter((s) => s.id !== id); commit(); }

// Preferences
export function setPref(key, value) { state.prefs = cleanPrefs({ ...state.prefs, [key]: value }); commit(); }
export function setPrefs(patch) { state.prefs = cleanPrefs({ ...state.prefs, ...patch }); commit(); }

// Sample data
export const hasSampleData = () => state.tasks.some((t) => t.demo) || state.events.some((e) => e.demo);
export function loadSampleData() {
  clearSampleData(false);
  const s = sampleData();
  state.tasks = [...state.tasks, ...s.tasks];
  state.events = [...state.events, ...s.events];
  commit();
}
export function clearSampleData(save = true) {
  state.tasks = state.tasks.filter((t) => !t.demo);
  state.events = state.events.filter((e) => !e.demo);
  if (save) commit();
}

export function resetAll() {
  state = defaults();
  commit();
}

// ---------- Export / import ----------

export function exportJson() {
  return JSON.stringify({ app: 'evenday', version: SCHEMA_VERSION, exportedAt: nowIso(), data: state }, null, 2);
}

// Parses and validates without touching current data. Throws a readable Error.
export function parseImport(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('This file isn’t valid JSON. Choose a file exported from Evenday.'); }
  const data = parsed && parsed.app === 'evenday' ? parsed.data : null;
  if (!data || typeof data !== 'object') throw new Error('This file wasn’t exported from Evenday.');
  if (parsed.version > SCHEMA_VERSION) throw new Error('This file comes from a newer version of Evenday.');
  for (const k of ['tasks', 'events', 'shortcuts']) {
    if (data[k] !== undefined && !Array.isArray(data[k])) throw new Error(`The “${k}” section is damaged.`);
  }
  const pick = (k, fn) => (data[k] || []).map(fn).filter(Boolean);
  const result = {
    tasks: pick('tasks', cleanTask),
    events: pick('events', cleanEvent),
    shortcuts: pick('shortcuts', cleanShortcut),
    prefs: cleanPrefs(data.prefs),
  };
  const total = ['tasks', 'events', 'shortcuts'].reduce((n, k) => n + (data[k] || []).length, 0);
  result.skipped = total - result.tasks.length - result.events.length - result.shortcuts.length;
  return result;
}

export function applyImport(result) {
  write(BACKUP_KEY, JSON.stringify(state));
  const { skipped, ...data } = result;
  state = structuredClone(data);
  commit();
}
