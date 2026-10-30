// Personalization sheets: Themes & appearance, Customize Today, and the first-run welcome.
import * as store from '../store.js';
import { THEME_DEFAULTS } from '../store.js';
import { ACCENTS, FONTS, PRESETS, TEXT_SIZES, isDark } from '../themes.js';
import { closeSheet, esc, openSheet, sheetHeader, toast } from '../ui.js';
import { icon } from '../icons.js';

const choice = (pref, value, current, inner, cls = 'opt', label = '') =>
  `<button type="button" class="${cls}" data-pref="${pref}" data-value="${value}" aria-pressed="${String(current) === String(value)}"${label ? ` aria-label="${esc(label)}" title="${esc(label)}"` : ''}>${inner}</button>`;

const presetCard = (key, p, current, dark) => {
  const [bg, surface, , border] = dark ? p.dark : p.light;
  const accent = ACCENTS[p.accent][dark ? 1 : 0];
  return choice('preset', key, current, `<span class="preset-swatch" style="background:${bg};border-color:${border}">
      <span class="ps-card" style="background:${surface}"><span class="ps-dot" style="background:${accent}"></span><span class="ps-line" style="background:${border}"></span></span>
      <span class="ps-pill" style="background:${accent}"></span></span><span class="preset-name">${p.label}</span>`, 'preset');
};

function themeBody(prefs) {
  const dark = isDark(prefs);
  const seg = (pref, options) => `<div class="segmented">${options.map(([v, l]) => choice(pref, v, prefs[pref], l, 'seg-btn')).join('')}</div>`;
  return `
    <div class="theme-preview" aria-hidden="true">
      <div class="tp-head"><span class="tp-eyebrow">Preview</span><span class="tp-title">Good morning${prefs.name ? `, ${esc(prefs.name)}` : ''}</span></div>
      <div class="tp-card">
        <span class="tp-row"><span class="tp-check done">${icon('check')}</span><span class="tp-text done">Water the plants</span></span>
        <span class="tp-row"><span class="tp-check"></span><span class="tp-text">Finish essay draft</span><span class="tp-flag">${icon('flag')}High</span></span>
        <span class="tp-row"><span class="tp-bar"></span><span class="tp-text">Lunch with Maya · 12:30</span></span>
      </div>
      <span class="tp-btn">${icon('plus')}Add</span>
    </div>

    <section><h3 class="group-label">Theme</h3>
      <div class="preset-grid">${Object.entries(PRESETS).map(([k, p]) => presetCard(k, p, prefs.preset, dark)).join('')}</div></section>

    <section><h3 class="group-label">Accent color</h3>
      <div class="accent-grid">${Object.entries(ACCENTS).map(([k, [l, d]]) => choice('accent', k, prefs.accent, '', 'accent-dot', `${k[0].toUpperCase()}${k.slice(1)}`).replace('class="accent-dot"', `class="accent-dot" style="--dot:${dark ? d : l}"`)).join('')}</div></section>

    <section><h3 class="group-label">Mode</h3>
      <div class="group-list">
        <div class="cell cell-stack">${seg('theme', [['system', `${icon('monitor')}Auto`], ['light', `${icon('sun')}Light`], ['dark', `${icon('moon')}Dark`]])}</div>
        <label class="cell" for="pref-black"><span class="cell-icon tone-gray">${icon('moon')}</span><span class="cell-label">True black in dark mode<br><span class="muted small">Deepest blacks, great on OLED iPhones</span></span>
          <input id="pref-black" type="checkbox" class="switch" data-pref-toggle="trueBlack" ${prefs.trueBlack ? 'checked' : ''}></label>
      </div></section>

    <section><h3 class="group-label">Text size</h3>
      <div class="group-list"><div class="cell cell-stack">${seg('textSize', Object.entries(TEXT_SIZES).map(([k, [l]]) => [k, l]))}</div></div></section>

    <section><h3 class="group-label">Font</h3>
      <div class="font-grid">${Object.entries(FONTS).map(([k, f]) => choice('font', k, prefs.font, `<span class="font-aa" style="font-family:${esc(f.stack)}">Aa</span><span>${f.label}</span>`, 'opt font-opt')).join('')}</div></section>

    <section><h3 class="group-label">Corners</h3>
      <div class="font-grid three">${[['square', 'Sharp'], ['soft', 'Soft'], ['round', 'Round']].map(([k, l]) => choice('radius', k, prefs.radius, `<span class="corner-demo corner-${k}"></span><span>${l}</span>`, 'opt font-opt')).join('')}</div></section>

    <section><h3 class="group-label">Layout</h3>
      <div class="group-list">
        <div class="cell cell-stack"><span class="cell-label">Spacing</span>${seg('density', [['comfy', 'Comfortable'], ['compact', 'Compact']])}</div>
        <div class="cell cell-stack"><span class="cell-label">Animations</span>${seg('motion', [['full', 'On'], ['reduce', 'Reduced']])}</div>
      </div></section>

    <button type="button" class="link-btn" data-reset-look>${icon('refresh')}Restore the default look</button>`;
}

export function openThemeSheet() {
  const dlg = openSheet(`${sheetHeader('Themes & appearance')}<div class="sheet-body theme-body"></div>`, { label: 'Themes & appearance', className: 'sheet-tall' });
  const body = dlg.querySelector('.theme-body');
  const render = () => {
    const top = body.scrollTop;
    body.innerHTML = themeBody(store.getState().prefs);
    body.scrollTop = top;
  };
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pref]');
    if (b) {
      const { pref, value } = b.dataset;
      if (pref === 'preset') store.setPrefs({ preset: value, accent: PRESETS[value].accent });
      else store.setPref(pref, value);
      render();
      body.querySelector(`[data-pref="${pref}"][data-value="${value}"]`)?.focus();
    }
    if (e.target.closest('[data-reset-look]')) {
      const snap = store.snapshot();
      store.setPrefs(THEME_DEFAULTS);
      render();
      toast('Default look restored', { actionLabel: 'Undo', onAction: () => store.restore(snap) });
    }
  });
  body.addEventListener('change', (e) => {
    const t = e.target.closest('[data-pref-toggle]');
    if (t) { store.setPref(t.dataset.prefToggle, t.checked); render(); body.querySelector(`[data-pref-toggle="${t.dataset.prefToggle}"]`)?.focus(); }
  });
  render();
}

const SECTIONS = [
  ['capture', 'wand', 'accent', 'Quick add bar', 'Type or speak at the top of Today'],
  ['upNext', 'clock', 'blue', 'Up next', 'Your next event, front and center'],
  ['tasks', 'tasks', 'accent', 'Tasks', 'Due today and overdue'],
  ['schedule', 'calendar', 'red', 'Schedule', 'Today’s events and what’s coming'],
  ['favorites', 'star', 'amber', 'Favorites', 'Your starred shortcuts'],
];

export function openTodaySheet() {
  const prefs = store.getState().prefs;
  const dlg = openSheet(`<form class="form" novalidate>${sheetHeader('Customize Today', { submit: 'Done' })}
    <div class="sheet-body">
      <section><h3 class="group-label">Greeting</h3>
        <div class="group-list"><div class="cell cell-field">
          <label class="sr-only" for="pref-name">Your name</label>
          <input id="pref-name" class="cell-input" name="name" type="text" maxlength="30" value="${esc(prefs.name)}" placeholder="Your name (optional)" autocomplete="given-name">
        </div></div>
        <p class="group-foot">Shown as “Good morning, ${esc(prefs.name || 'Sam')}”.</p></section>
      <section><h3 class="group-label">Show on Today</h3>
        <div class="group-list">${SECTIONS.map(([k, ic, tone, label, hint]) => `<label class="cell" for="sec-${k}">
          <span class="cell-icon tone-${tone}">${icon(ic)}</span><span class="cell-label">${label}<br><span class="muted small">${hint}</span></span>
          <input id="sec-${k}" type="checkbox" class="switch" name="${k}" ${prefs.today[k] ? 'checked' : ''}></label>`).join('')}</div></section>
    </div></form>`, { label: 'Customize Today' });
  const form = dlg.querySelector('form');
  const save = () => store.setPrefs({ name: form.name.value, today: Object.fromEntries(SECTIONS.map(([k]) => [k, form[k].checked])) });
  form.addEventListener('change', save);
  form.addEventListener('submit', (e) => { e.preventDefault(); save(); closeSheet(dlg); });
}

export function openWelcome() {
  const dlg = openSheet(`<form class="form welcome" novalidate>
    <div class="sheet-body">
      <div class="welcome-hero"><span class="welcome-mark">${icon('sparkle')}</span>
        <h2>Welcome to Evenday</h2>
        <p class="muted">Your day, your tasks and your go-to apps in one calm place. Two quick choices and you’re set.</p></div>
      <section><h3 class="group-label">What should we call you?</h3>
        <div class="group-list"><div class="cell cell-field">
          <label class="sr-only" for="welcome-name">Your name</label>
          <input id="welcome-name" class="cell-input" name="name" type="text" maxlength="30" placeholder="Your name (optional)" autocomplete="given-name">
        </div></div></section>
      <section><h3 class="group-label">Pick a look</h3>
        <div class="preset-grid welcome-presets"></div>
        <p class="group-foot">Change it anytime in Settings → Themes & appearance.</p></section>
      <div class="welcome-tips">
        <p>${icon('plus')}<span>Tap <strong>+</strong> and type or say things like “Dentist Friday 3pm”.</span></p>
        <p>${icon('tasks')}<span>Swipe a task right to finish it, left to delete.</span></p>
      </div>
      <button type="submit" class="btn btn-primary btn-block">Get started</button>
      <button type="button" class="link-btn" data-skip>Skip for now</button>
    </div></form>`, { label: 'Welcome', onClose: () => store.setPref('onboarded', true) });
  const grid = dlg.querySelector('.welcome-presets');
  const paint = () => { const p = store.getState().prefs; grid.innerHTML = Object.entries(PRESETS).map(([k, x]) => presetCard(k, x, p.preset, isDark(p))).join(''); };
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pref="preset"]');
    if (!b) return;
    store.setPrefs({ preset: b.dataset.value, accent: PRESETS[b.dataset.value].accent });
    paint();
    grid.querySelector(`[data-value="${b.dataset.value}"]`)?.focus();
  });
  paint();
  const form = dlg.querySelector('form');
  form.addEventListener('submit', (e) => { e.preventDefault(); store.setPrefs({ name: form.name.value, onboarded: true }); closeSheet(dlg); });
  dlg.querySelector('[data-skip]').addEventListener('click', () => closeSheet(dlg));
}
