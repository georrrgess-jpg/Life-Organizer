// On-device natural-language capture. Turns text such as
// "Dentist Friday 3pm, buy milk, essay due Monday !" into task and event drafts.
// Nothing leaves the device; it is plain pattern matching.
import { addDays, formatTime, fromMinutes, isValidKey, pad, toKey, toMinutes } from './dates.js';

const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const DAY = '(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)';
const MER = '(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)';
const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const monthIndex = (m) => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m.slice(0, 3).toLowerCase());
const dayIndex = (d) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(d.slice(0, 3).toLowerCase());

const CATEGORY_HINTS = [
  ['school', /\b(homework|assignment|essay|exam|quiz|class|lecture|study|studying|professor|semester|lab report|thesis|tutor)\b/i],
  ['work', /\b(meeting|client|report|stand-?up|deadline|presentation|invoice|boss|office|slides|interview|1:1)\b/i],
  ['social', /\b(birthday|party|dinner with|lunch with|drinks|coffee with|wedding|hang ?out|date night|bbq|brunch)\b/i],
  ['personal', /\b(gym|dentist|doctor|groceries|laundry|rent|bills?|pharmacy|haircut|workout|yoga|clean|vet)\b/i],
];

// Split on new lines, semicolons and commas (but not "Nov 5, 2026").
export function splitItems(text) {
  return text.split(/[\n;]+|,(?!\s*\d{4}\b)|\s+(?:and then|then|also)\s+/i).map((s) => s.trim()).filter(Boolean);
}

export function parseCapture(text, { now = new Date(), dayFirst = false } = {}) {
  return splitItems(text).map((chunk) => parseItem(chunk, { now, dayFirst })).filter(Boolean);
}

function toTime(h, m, mer, guess = true) {
  h = Number(h); m = m ? Number(m) : 0;
  if (h > 23 || m > 59) return null;
  if (mer) {
    const pm = /^p/i.test(mer);
    if (h === 0 || h > 12) return null;
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  } else if (guess && h >= 1 && h <= 7) {
    h += 12; // "at 3" almost always means the afternoon
  }
  return fromMinutes(h * 60 + m);
}

export function parseItem(chunk, { now = new Date(), dayFirst = false } = {}) {
  const today = toKey(now);
  let s = ` ${chunk.replace(/\s+/g, ' ')} `;
  const out = { kind: 'task', title: '', date: null, start: null, end: null, allDay: false, priority: 'normal', category: null, location: '', notes: '', source: chunk };
  let forced = null;
  let deadline = false;

  const take = (re, fn) => {
    const m = re.exec(s);
    if (!m) return false;
    if (fn(m) === false) return false;
    s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
    return true;
  };

  // Intent prefixes
  take(/^\s*(?:remind me to|remember to|i need to|i have to|need to|have to|don'?t forget to|to-?do:?|task:?)\s+/i, () => { forced = 'task'; });
  take(/^\s*(?:event:?|schedule|add event|book)\s+/i, (m) => { if (!/book/i.test(m[0])) forced = 'event'; else return false; });

  // Time range: "2-4pm", "from 10:30 to noon", "9am until 11"
  take(new RegExp(`\\b(from\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*${MER}?\\s*(?:-|–|—|to|until|till)\\s*(\\d{1,2}|noon)(?::(\\d{2}))?\\s*${MER}?(?=\\W|$)`, 'i'), (m) => {
    const [, from, h1, m1, mer1, h2raw, m2, mer2] = m;
    if (!(from || mer1 || mer2 || m1 || m2 || h2raw === 'noon')) return false;
    const end = h2raw.toLowerCase() === 'noon' ? '12:00' : toTime(h2raw, m2, mer2);
    let start = toTime(h1, m1, mer1 || (mer2 && !mer1 ? mer2 : undefined));
    if (start && end && !mer1 && mer2 && toMinutes(start) >= toMinutes(end)) start = toTime(h1, m1, 'am');
    if (!start || !end || toMinutes(end) <= toMinutes(start)) return false;
    out.start = start; out.end = end;
  });

  // Single time: "at 3pm", "15:30", "by 5 p.m.", "noon"
  if (!out.start) {
    const single = [
      new RegExp(`\\b(at|@|by|before|around|due)?\\s*(\\d{1,2}):(\\d{2})\\s*${MER}?(?=\\W|$)`, 'i'),
      new RegExp(`\\b(at|@|by|before|around|due)?\\s*(\\d{1,2})()\\s*${MER}(?=\\W|$)`, 'i'),
      /\b(at|@|around)\s+(\d{1,2})()()(?!\s*(?:st|nd|rd|th|\/|%|days?|weeks?|months?|hours?|hrs?|min|people|items?)\b)(?=\W|$)/i,
    ];
    for (const re of single) {
      if (take(re, (m) => {
        const t = toTime(m[2], m[3], m[4]);
        if (!t) return false;
        out.start = t;
        if (/^(by|before|due)$/i.test(m[1] || '')) deadline = true;
      })) break;
    }
    if (!out.start) take(/\b(?:at\s+)?(noon|midday|midnight)\b/i, (m) => { out.start = /night/i.test(m[1]) ? '00:00' : '12:00'; });
  }

  // Duration: "for 30 min", "for 2 hours", "for an hour"
  let duration = 60;
  take(/\bfor\s+(\d+(?:\.\d+)?|an?|half an?|one|two|three)\s*(h|hrs?|hours?|m|mins?|minutes?)\b/i, (m) => {
    const n = /half/i.test(m[1]) ? 0.5 : NUM[m[1].toLowerCase()] ?? Number(m[1]);
    duration = Math.round(/^h/i.test(m[2]) ? n * 60 : n);
    if (!duration) return false;
  });

  // Dates
  const setDate = (key) => { if (isValidKey(key)) { out.date = key; return true; } return false; };
  const ymd = (y, mo, d) => `${y}-${pad(mo + 1)}-${pad(d)}`;
  const futureYear = (mo, d, y) => {
    if (y) return Number(y.length === 2 ? '20' + y : y);
    const yr = now.getFullYear();
    return ymd(yr, mo, d) < today ? yr + 1 : yr;
  };
  const dateRules = [
    [/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => setDate(`${m[1]}-${m[2]}-${m[3]}`)],
    [new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}(?:,?\\s+(\\d{4}))?\\b`, 'i'),
      (m) => { const mo = monthIndex(m[2]); return setDate(ymd(futureYear(mo, +m[1], m[3]), mo, +m[1])); }],
    [new RegExp(`\\b(?:on\\s+)?${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'),
      (m) => { const mo = monthIndex(m[1]); return setDate(ymd(futureYear(mo, +m[2], m[3]), mo, +m[2])); }],
    [/\b(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/, (m) => {
      const [mo, d] = dayFirst ? [+m[2] - 1, +m[1]] : [+m[1] - 1, +m[2]];
      return setDate(ymd(futureYear(mo, d, m[3]), mo, d));
    }],
    [/\b(?:the\s+)?day after tomorrow\b/i, () => setDate(addDays(today, 2))],
    [/\b(?:today|tonight|this (?:morning|afternoon|evening))\b/i, () => setDate(today)],
    [/\b(?:tomorrow|tmrw|tmr|tomorow)(?:\s+(?:morning|afternoon|evening|night))?\b/i, () => setDate(addDays(today, 1))],
    [/\bin\s+(\d+|an?|one|two|three|four|five|six|seven|ten)\s+(days?|weeks?|months?)\b/i, (m) => {
      const n = NUM[m[1].toLowerCase()] ?? Number(m[1]);
      if (/^m/i.test(m[2])) { const d = new Date(now); d.setMonth(d.getMonth() + n); return setDate(toKey(d)); }
      return setDate(addDays(today, /^w/i.test(m[2]) ? n * 7 : n));
    }],
    [/\bend of (?:the )?week\b/i, () => setDate(addDays(today, (5 - now.getDay() + 7) % 7))],
    [/\bend of (?:the )?month\b/i, () => setDate(toKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)))],
    [/\bnext week\b/i, () => setDate(addDays(today, ((8 - now.getDay()) % 7) || 7))],
    [/\b(?:this |next )?weekend\b/i, () => setDate(addDays(today, ((6 - now.getDay() + 7) % 7) || 7))],
    [new RegExp(`\\b(?:on\\s+)?(this\\s+|next\\s+)?${DAY}\\b`, 'i'), (m) => {
      const diff = (dayIndex(m[2]) - now.getDay() + 7) % 7;
      return setDate(addDays(today, diff === 0 && !/this/i.test(m[1] || '') ? 7 : diff));
    }],
    [/\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/i, (m) => {
      const d = +m[1];
      let key = ymd(now.getFullYear(), now.getMonth(), d);
      if (key < today) { const n = new Date(now.getFullYear(), now.getMonth() + 1, 1); key = ymd(n.getFullYear(), n.getMonth(), d); }
      return setDate(key);
    }],
  ];
  for (const [re, fn] of dateRules) if (take(re, (m) => fn(m))) break;

  // Priority
  if (take(/\b(urgent(?:ly)?|asap|important|high[- ]priority|top priority)\b/i, () => {}) || take(/(^|\s)!{1,3}(?=\s|$)|!+\s*$/, () => {})) out.priority = 'high';
  else if (take(/\b(low[- ]priority|not urgent|no rush|whenever|someday)\b/i, () => {})) out.priority = 'low';
  take(/\bdue\b/i, () => { deadline = true; });

  // Category: "#work", "for school"
  take(/(^|\s)#(work|school|personal|social)\b/i, (m) => { out.category = m[2].toLowerCase(); });
  if (!out.category) take(/\b(?:for|at)\s+(work|school)\b/i, (m) => { out.category = m[1].toLowerCase(); });

  // All day
  if (take(/\ball[- ]day\b/i, () => {})) out.allDay = true;

  let title = s.replace(/\s+/g, ' ').trim();

  // Decide task or event
  let kind = forced;
  if (!kind) {
    if (out.allDay) kind = 'event';
    else if (out.start && !deadline) kind = 'event';
    else if (/^(?:[\w'’-]+['’]s\s+)?(birthday|anniversary)\b/i.test(title) && out.date) kind = 'event';
    else kind = 'task';
  }
  out.kind = kind;

  if (kind === 'event') {
    // "Lunch at Corner Café" → location (capitalized place names only)
    const loc = /\s(?:at|@|in)\s+((?:[\p{Lu}\p{N}][\p{L}\p{N}'’&.-]*)(?:\s+(?:[\p{Lu}\p{N}][\p{L}\p{N}'’&.-]*|of|the|and|&))*)\s*$/u.exec(` ${title}`);
    if (loc && !/^(the|a|an)$/i.test(loc[1])) {
      out.location = loc[1];
      title = ` ${title}`.slice(0, loc.index).trim();
    }
    if (!out.start) out.allDay = true;
    else if (!out.end) out.end = fromMinutes(Math.min(toMinutes(out.start) + duration, 23 * 60 + 59));
    if (out.end && toMinutes(out.end) <= toMinutes(out.start)) out.end = fromMinutes(Math.min(toMinutes(out.start) + 30, 23 * 60 + 59));
    if (out.allDay) { out.start = null; out.end = null; }
  } else if (out.start) {
    out.notes = `${deadline ? 'Due by' : 'At'} ${formatTime(out.start)}`;
    out.start = null; out.end = null;
  }

  // Tidy the title
  for (let i = 0; i < 3; i++) {
    title = title
      .replace(/^[\s,.:;–—-]+|[\s,.:;–—-]+$/g, '')
      .replace(/\s+\b(on|at|by|for|due|from|in|the|next|this|and|before|around)$/i, '')
      .replace(/^(on|at|by|and|then|to)\s+/i, '');
  }
  title = title.replace(/\s{2,}/g, ' ');
  if (!title) return null;
  out.title = title[0].toUpperCase() + title.slice(1);

  if (!out.category) out.category = (CATEGORY_HINTS.find(([, re]) => re.test(out.title)) || [null])[0];
  if (out.kind === 'task' && out.category === 'social') out.category = 'personal';
  return out;
}
