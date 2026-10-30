// End-to-end checks for the core workflows. Run: npm test
// Uses Playwright with Chromium (install with `npm i -D playwright && npx playwright install chromium` if needed).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = 5199;
const BASE = `http://localhost:${PORT}/`;

const server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));

const browser = await chromium.launch();
const results = [];
const errors = [];
async function step(name, fn) {
  try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, e.message.split('\n')[0]]); }
}

// New York timezone so the DST change on 2026-11-01 is exercised.
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York' });
// Stand-in speech engine so the voice flow can run headless.
await ctx.addInitScript(() => {
  const Fake = class {
    start() {
      setTimeout(() => {
        this.onresult?.({ results: [{ 0: { transcript: 'Lunch with Sam tomorrow at noon' }, isFinal: true, length: 1 }] });
        this.onend?.();
      }, 50);
    }
    stop() { this.onend?.(); }
  };
  for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) Object.defineProperty(window, name, { configurable: true, writable: true, value: Fake });
});
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('evenday:data:v1')));
const go = async (route) => { await page.goto(BASE + '#' + route); await page.waitForSelector('.page'); };
const [today, tomorrow] = await page.evaluate(() => [0, 1].map((n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }));
async function swipe(selector, dx) {
  await page.evaluate(([sel, dist]) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const o = { pointerType: 'touch', pointerId: 7, bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    for (let i = 1; i <= 6; i++) el.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: o.clientX + (dist * i) / 6 }));
    el.dispatchEvent(new PointerEvent('pointerup', { ...o, clientX: o.clientX + dist }));
  }, [selector, dx]);
}
const openNewEvent = async () => { await page.click('.nav-add'); await page.click('dialog [data-manual="event"]'); };

await go('today');

await step('First run shows a welcome; name and look apply, and it never returns', async () => {
  await page.waitForSelector('dialog[open] .welcome');
  await page.fill('#welcome-name', 'Sam');
  await page.click('dialog [data-pref="preset"][data-value="ocean"]');
  await page.click('dialog .welcome button[type="submit"]');
  await page.waitForSelector('dialog', { state: 'detached' });
  assert.match(await page.textContent('.page-head h1'), /, Sam$/);
  const p = (await state()).prefs;
  assert.equal(p.preset, 'ocean');
  assert.equal(p.accent, 'blue');
  await page.reload();
  await page.waitForSelector('.page');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('dialog[open]').count(), 0);
});

await step('First run shows example shortcuts and empty states', async () => {
  assert.equal((await page.locator('.fav').count()), 3);
  await page.getByText('Nothing due today').first().waitFor();
});

await step('Quick add from Today updates the dashboard', async () => {
  await page.click('.capture-open');
  await page.fill('#capture-text', 'Buy groceries');
  await page.click('dialog .nav-primary');
  await page.locator('.task-row', { hasText: 'Buy groceries' }).waitFor();
  assert.match(await page.textContent('.summary'), /1 task due/);
});

await step('Edit task (title, priority, category)', async () => {
  await page.click('.task-main:has-text("Buy groceries")');
  await page.fill('#task-title', 'Buy groceries and milk');
  await page.click('label.seg:has(input[name="priority"][value="high"])');
  await page.click('label.chip:has(input[name="category"][value="personal"])');
  await page.click('dialog button[type="submit"]');
  await page.locator('.task-row', { hasText: 'Buy groceries and milk' }).locator('.prio-high').waitFor();
  const t = (await state()).tasks[0];
  assert.equal(t.priority, 'high');
  assert.equal(t.category, 'personal');
});

await step('Complete task, then reopen it from Done', async () => {
  await page.click('.task-row:has-text("Buy groceries and milk") .check');
  await page.waitForTimeout(600);
  assert.equal((await state()).tasks[0].done, true);
  await page.getByText('1 task completed today').waitFor();
  await go('tasks');
  await page.click('[data-tab="done"]');
  await page.click('.task-row:has-text("Buy groceries and milk") .check');
  await page.click('[data-tab="today"]');
  await page.locator('.task-row', { hasText: 'Buy groceries and milk' }).waitFor();
  assert.equal((await state()).tasks[0].done, false);
});

await step('Event form rejects an end time before the start time', async () => {
  await go('calendar');
  await openNewEvent();
  await page.fill('#ev-title', 'Bad times');
  await page.fill('#ev-start', '10:00');
  await page.fill('#ev-end', '09:00');
  await page.click('dialog button[type="submit"]');
  assert.match(await page.textContent('#ev-time-error'), /after the start/);
  assert.equal((await state()).events.length, 0);
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog', { state: 'detached' });
});

await step('Create timed and all-day events on the correct dates (incl. DST day)', async () => {
  await openNewEvent();
  await page.fill('#ev-title', 'Piano lesson');
  await page.fill('#ev-date', '2026-11-15');
  await page.fill('#ev-start', '16:00');
  await page.fill('#ev-end', '17:00');
  await page.fill('#ev-location', 'Music school');
  await page.click('dialog button[type="submit"]');
  await openNewEvent();
  await page.fill('#ev-title', 'Daylight saving ends');
  await page.fill('#ev-date', '2026-11-01');
  await page.check('#ev-allday');
  await page.click('dialog button[type="submit"]');
  await page.waitForSelector('dialog', { state: 'detached' });
  const evs = (await state()).events;
  assert.deepEqual(evs.map((e) => e.date).sort(), ['2026-11-01', '2026-11-15']);
  await page.click('[data-action="select-day"][data-date="2026-11-01"]');
  await page.locator('.agenda .event-row', { hasText: 'Daylight saving ends' }).waitFor();
  assert.match(await page.textContent('.agenda h2'), /November 1/);
  await page.click('[data-action="select-day"][data-date="2026-11-02"]');
  assert.equal(await page.locator('.agenda .event-row').count(), 0);
  await page.click('[data-action="select-day"][data-date="2026-11-15"]');
  await page.locator('.agenda .event-row', { hasText: 'Piano lesson' }).waitFor();
  assert.equal(await page.locator('[data-date="2026-11-15"] .dot').count(), 1);
});

await step('View, edit and delete an event', async () => {
  await page.click('.agenda .event-row:has-text("Piano lesson")');
  await page.locator('dialog').getByText('Music school').waitFor();
  await page.click('dialog [data-edit]');
  await page.fill('#ev-title', 'Piano recital');
  await page.click('dialog button[type="submit"]');
  await page.locator('.agenda .event-row', { hasText: 'Piano recital' }).waitFor();
  await page.click('.agenda .event-row:has-text("Piano recital")');
  await page.click('dialog [data-delete]');
  await page.click('dialog [data-confirm]');
  await page.waitForSelector('dialog', { state: 'detached' });
  assert.equal(await page.locator('.agenda .event-row').count(), 0);
  assert.equal((await state()).events.length, 1);
});

await step('Month navigation and Today button', async () => {
  await page.click('[data-action="cal-next"]');
  assert.match(await page.textContent('.cal-nav h2'), /December 2026/);
  await page.click('[data-action="cal-today"]');
  assert.equal(await page.getAttribute('.day.is-selected', 'data-date'), today);
});

await step('Today dashboard shows a new event for today', async () => {
  await openNewEvent();
  await page.fill('#ev-title', 'Call with Alex');
  await page.check('#ev-allday');
  await page.click('dialog button[type="submit"]');
  await go('today');
  await page.locator('.event-row', { hasText: 'Call with Alex' }).waitFor();
});

await step('Add shortcut (rejects unsafe link), reorder, favorite, open', async () => {
  await go('apps');
  await page.click('[data-action="new-shortcut"]');
  await page.fill('#sc-name', 'Class portal');
  await page.fill('#sc-url', 'javascript:alert(1)');
  await page.click('dialog button[type="submit"]');
  assert.equal(await page.isVisible('#sc-url-error'), true);
  await page.fill('#sc-url', 'example.com/portal');
  await page.click('dialog button[type="submit"]');
  await page.waitForSelector('dialog', { state: 'detached' });
  let names = (await state()).shortcuts.map((s) => s.name);
  assert.equal(names.at(-1), 'Class portal');
  await page.click('[data-action="apps-edit"]');
  const id = (await state()).shortcuts.at(-1).id;
  await page.click(`[data-action="move-shortcut"][data-id="${id}"][data-dir="-1"]`);
  names = (await state()).shortcuts.map((s) => s.name);
  assert.equal(names.at(-2), 'Class portal');
  await page.click(`[data-action="fav-shortcut"][data-id="${id}"]`);
  await page.click('[data-action="apps-edit"]');
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.click('.tile-body:has-text("Class portal")')]);
  assert.match(popup.url(), /example\.com\/portal/);
  await popup.close();
  await go('today');
  await page.locator('.fav', { hasText: 'Class portal' }).waitFor();
});

await step('Generate: typed text becomes tasks and events, with type switch and remove', async () => {
  await go('today');
  await page.click('.nav-add');
  await page.fill('#capture-text', 'Dentist tomorrow at 3pm, pick up dry cleaning !, water plants');
  await page.locator('dialog .draft').nth(2).waitFor();
  await page.click('[data-kind="pick up dry cleaning !"]');
  await page.click('[data-remove="water plants"]');
  assert.equal((await page.textContent('dialog .nav-primary')).trim(), 'Add 2');
  await page.click('dialog .nav-primary');
  await page.waitForSelector('dialog', { state: 'detached' });
  const s = await state();
  const dentist = s.events.find((e) => e.title === 'Dentist');
  assert.equal(dentist.date, tomorrow);
  assert.equal(dentist.start, '15:00');
  const dc = s.events.find((e) => e.title === 'Pick up dry cleaning');
  assert.ok(dc && dc.allDay && dc.date === today, 'switched item became an all-day event today');
  assert.ok(!s.tasks.some((t) => /water/i.test(t.title)), 'removed draft was not added');
});

await step('Voice: dictation fills Quick add (simulated speech engine)', async () => {
  await page.click('.capture-mic');
  await page.locator('dialog .draft', { hasText: 'Lunch with Sam' }).waitFor();
  await page.click('dialog .nav-primary');
  await page.waitForSelector('dialog', { state: 'detached' });
  const ev = (await state()).events.find((e) => e.title === 'Lunch with Sam');
  assert.equal(ev.date, tomorrow);
  assert.equal(ev.start, '12:00');
});

await step('Inline task field understands dates and priority', async () => {
  await go('tasks');
  await page.fill('#quick-tasks', 'Call grandma tomorrow !');
  await page.press('#quick-tasks', 'Enter');
  await page.waitForTimeout(100);
  const t = (await state()).tasks.find((x) => x.title === 'Call grandma');
  assert.equal(t.due, tomorrow);
  assert.equal(t.priority, 'high');
});

await step('Swipe right completes and swipe left deletes a task (touch), both undoable', async () => {
  const id = (await state()).tasks.find((x) => x.title === 'Buy groceries and milk').id;
  await swipe(`.task-row[data-task="${id}"] .task-main`, 120);
  await page.waitForTimeout(700);
  assert.equal((await state()).tasks.find((x) => x.id === id).done, true);
  await page.click('.toast-action');
  assert.equal((await state()).tasks.find((x) => x.id === id).done, false);
  await swipe(`.task-row[data-task="${id}"] .task-main`, -120);
  await page.waitForTimeout(100);
  assert.equal((await state()).tasks.some((x) => x.id === id), false);
  await page.click('.toast-action');
  assert.equal((await state()).tasks.some((x) => x.id === id), true);
});

await step('Settings opens from the top bar and Back returns to the same tab', async () => {
  await go('tasks');
  await page.click('.topbar a[href="#preferences"]');
  await page.waitForSelector('.page-preferences');
  await page.click('[data-action="go-back"]');
  await page.waitForSelector('.page-tasks');
});

await step('Data persists after reload', async () => {
  await go('today');
  await page.reload();
  await page.waitForSelector('.page');
  await page.locator('.task-row', { hasText: 'Buy groceries and milk' }).waitFor();
  await page.locator('.fav', { hasText: 'Class portal' }).waitFor();
});

let backup;
await step('Export produces a valid backup', async () => {
  await go('preferences');
  await page.click('[data-action="export"]');
  backup = await page.inputValue('#export-text');
  const parsed = JSON.parse(backup);
  assert.equal(parsed.app, 'evenday');
  assert.equal(parsed.data.tasks.length, 2);
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog', { state: 'detached' });
});

await step('Invalid imports are rejected without changing data', async () => {
  const before = JSON.stringify(await state());
  await page.click('[data-action="import"]');
  for (const bad of ['not json', '{"hello": 1}', '{"app":"evenday","version":1,"data":{"tasks":"oops"}}']) {
    await page.fill('#import-text', bad);
    await page.click('dialog .nav-primary');
    assert.equal(await page.isVisible('#import-error'), true, bad);
  }
  assert.equal(JSON.stringify(await state()), before);
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog', { state: 'detached' });
});

await step('Valid import replaces data after confirmation, Undo restores', async () => {
  const mod = JSON.parse(backup);
  mod.data.tasks.push({ title: 'Imported task', due: today }, { title: '' });
  await page.click('[data-action="import"]');
  await page.fill('#import-text', JSON.stringify(mod));
  await page.click('dialog .nav-primary');
  assert.match(await page.textContent('#confirm-msg'), /3 tasks.*1 incomplete item/s);
  await page.click('dialog [data-confirm]');
  await page.waitForSelector('dialog', { state: 'detached' });
  assert.equal((await state()).tasks.length, 3);
  await page.click('.toast-action');
  assert.equal((await state()).tasks.length, 2);
});

await step('Dark theme applies and persists', async () => {
  await page.click('[data-action="set-theme"][data-value="dark"]');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
  await page.reload();
  await page.waitForSelector('.page');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
  await page.click('[data-action="set-theme"][data-value="system"]');
});

await step('Themes: preset, accent, true black, font, size, corners, density apply live and persist', async () => {
  await go('preferences');
  await page.click('[data-action="open-themes"]');
  await page.waitForSelector('dialog[open] .theme-preview');
  for (const [pref, value] of [['preset', 'forest'], ['accent', 'pink'], ['theme', 'dark'], ['font', 'serif'], ['textSize', 'l'], ['radius', 'round'], ['density', 'compact'], ['motion', 'reduce']]) {
    await page.click(`dialog [data-pref="${pref}"][data-value="${value}"]`);
    assert.equal(await page.getAttribute(`dialog [data-pref="${pref}"][data-value="${value}"]`, 'aria-pressed'), 'true', pref);
  }
  await page.click('dialog label[for="pref-black"]');
  const css = await page.evaluate(() => { const s = document.documentElement.style; return { bg: s.getPropertyValue('--bg'), accent: s.getPropertyValue('--accent'), font: s.getPropertyValue('--font'), zoom: s.getPropertyValue('--zoom'), radius: document.documentElement.dataset.radius, density: document.documentElement.dataset.density }; });
  assert.deepEqual(css, { bg: '#000000', accent: '#e889a8', font: css.font, zoom: '1.1', radius: 'round', density: 'compact' });
  assert.match(css.font, /serif/);
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForSelector('.page');
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent')), '#e889a8');
  await page.click('[data-action="open-themes"]');
  await page.click('dialog [data-reset-look]');
  assert.equal((await state()).prefs.preset, 'evenday');
  await page.keyboard.press('Escape');
  await page.click('[data-action="set-theme"][data-value="system"]');
});

await step('Customize Today hides sections and sets the greeting name', async () => {
  await go('today');
  await page.click('[data-action="open-today-custom"]');
  await page.fill('#pref-name', 'Alex');
  await page.click('label[for="sec-favorites"]');
  await page.click('dialog .nav-primary');
  await page.waitForSelector('dialog', { state: 'detached' });
  assert.match(await page.textContent('.page-head h1'), /, Alex$/);
  assert.equal(await page.locator('#h-fav').count(), 0);
  await page.click('[data-action="open-today-custom"]');
  await page.click('label[for="sec-favorites"]');
  await page.click('dialog .nav-primary');
  await page.waitForSelector('dialog', { state: 'detached' });
  await page.locator('#h-fav').waitFor();
});

await step('Keyboard: "n" opens quick add, Escape closes it', async () => {
  await go('tasks');
  await page.locator('body').press('n');
  await page.waitForSelector('dialog[open] #capture-text');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'capture-text');
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog', { state: 'detached' });
});

await step('No horizontal overflow at phone and desktop widths', async () => {
  await page.evaluate(() => document.querySelector('[data-action="load-sample"]')) || null;
  await go('preferences');
  await page.click('[data-action="load-sample"]');
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const r of ['today', 'calendar', 'tasks', 'apps', 'preferences']) {
      await go(r);
      const over = await page.evaluate(() => Math.max(document.documentElement.scrollWidth - window.innerWidth, document.querySelector('main').scrollWidth - document.querySelector('main').clientWidth));
      assert.ok(over <= 0, `${r} at ${width}px overflows by ${over}px`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
});

await step('Move overdue tasks to today', async () => {
  await go('today');
  await page.click('[data-action="move-overdue"]');
  const s = await state();
  assert.equal(s.tasks.filter((t) => !t.done && t.due && t.due < today).length, 0);
  assert.equal(await page.locator('.subhead-warn').count(), 0);
});

await step('Remove sample data keeps own items', async () => {
  await go('preferences');
  await page.click('[data-action="clear-sample"]');
  const s = await state();
  assert.ok(s.tasks.every((t) => !t.demo) && s.events.every((e) => !e.demo));
  assert.equal(s.tasks.length, 2);
});

await step('Reset requires confirmation and erases data', async () => {
  await page.click('[data-action="reset"]');
  await page.click('dialog [data-close]:has-text("Cancel")');
  await page.waitForSelector('dialog', { state: 'detached' });
  assert.equal((await state()).tasks.length, 2);
  await page.click('[data-action="reset"]');
  await page.click('dialog [data-confirm]');
  await page.waitForSelector('dialog', { state: 'detached' });
  const s = await state();
  assert.equal(s.tasks.length + s.events.length, 0);
});

await step('Page itself never scrolls; only the content area does', async () => {
  await page.setViewportSize({ width: 390, height: 600 });
  await go('preferences');
  const r = await page.evaluate(() => {
    const m = document.querySelector('main');
    m.scrollTop = 400;
    const nav = document.querySelector('.nav').getBoundingClientRect();
    return { docScroll: document.scrollingElement.scrollHeight - innerHeight, mainScrolled: m.scrollTop > 0, navBottom: Math.round(nav.bottom) };
  });
  assert.ok(r.docScroll <= 0, `document scrolls by ${r.docScroll}px`);
  assert.ok(r.mainScrolled, 'content area scrolls');
  assert.equal(r.navBottom, 600);
  await page.setViewportSize({ width: 390, height: 844 });
});

await step('No runtime errors were logged', async () => {
  assert.deepEqual(errors, []);
});

await browser.close();
server.kill();
for (const [status, name, msg] of results) console.log(`${status === 'PASS' ? '✓' : '✗'} ${name}${msg ? ` — ${msg}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
