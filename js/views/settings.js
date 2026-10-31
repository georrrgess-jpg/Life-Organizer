import * as store from '../store.js';
import { closeSheet, confirmDialog, copyText, esc, openSheet, sheetHeader, toast } from '../ui.js';
import { pageHeader } from '../components.js';
import { PRESETS } from '../themes.js';
import { icon } from '../icons.js';

const seg = (action, current, options, label) => `<div class="segmented" role="radiogroup" aria-label="${label}">
  ${options.map(([v, text, ic]) => `<button type="button" role="radio" class="seg-btn" data-action="${action}" data-value="${v}" data-focus="${action}-${v}" aria-checked="${String(current) === String(v)}">${ic ? icon(ic) : ''}${text}</button>`).join('')}
</div>`;

const counts = (d) => `${d.tasks.length} tasks, ${d.events.length} events, ${(d.goals || []).length} goals, ${(d.habits || []).length} habits and ${d.shortcuts.length} shortcuts`;
const row = (action, ic, tone, label, detail = '', danger = false) => `<button type="button" class="cell cell-btn${danger ? ' danger' : ''}" data-action="${action}" data-focus="row-${action}">
  <span class="cell-icon tone-${tone}">${icon(ic)}</span><span class="cell-label">${label}</span>
  ${detail ? `<span class="cell-detail">${detail}</span>` : ''}${danger ? '' : icon('chevronRight', 'chev')}
</button>`;

const sinceText = (iso) => {
  const days = Math.floor((Date.now() - new Date(iso)) / 864e5);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};
const backupLabel = (b) => `${{ erase: 'Before erase', import: 'Before import', restore: 'Before restore' }[b.reason] || 'Saved'}${b.savedAt ? `, ${sinceText(b.savedAt)}` : ''}`;

export function renderSettings(state) {
  const sample = store.hasSampleData();
  const backup = store.readBackup();
  return `
  ${pageHeader({ title: 'Settings', back: true })}
  <div class="settings">
    <section aria-labelledby="h-look">
      <h2 class="group-label" id="h-look">Make it yours</h2>
      <div class="group-list">
        ${row('open-themes', 'sparkle', 'violet', 'Themes & appearance', esc(PRESETS[state.prefs.preset].label))}
        ${row('open-today-custom', 'today', 'amber', 'Customize Today')}
        <div class="cell cell-stack"><span class="cell-label">Mode</span>
          ${seg('set-theme', state.prefs.theme, [['system', 'Auto', 'monitor'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']], 'Theme')}</div>
        <div class="cell cell-stack"><span class="cell-label">Week starts on</span>
          ${seg('set-week', state.prefs.weekStart, [[0, 'Sunday'], [1, 'Monday']], 'Week starts on')}</div>
      </div>
    </section>

    <section aria-labelledby="h-add">
      <h2 class="group-label" id="h-add">Quick add</h2>
      <div class="group-list">
        ${row('capture-help', 'wand', 'accent', 'What can I type or say?')}
      </div>
    </section>

    <section aria-labelledby="h-data">
      <h2 class="group-label" id="h-data">Your data</h2>
      <div class="group-list">
        ${row('export', 'download', 'blue', 'Export backup', state.prefs.lastBackupAt ? `Last ${esc(sinceText(state.prefs.lastBackupAt))}` : 'Never')}
        ${row('import', 'upload', 'blue', 'Import backup')}
        ${backup ? row('restore-backup', 'refresh', 'gray', 'Restore previous data', esc(backupLabel(backup))) : ''}
        ${sample ? row('clear-sample', 'x', 'gray', 'Remove sample data') : row('load-sample', 'sparkle', 'violet', 'Load sample data')}
      </div>
      <p class="group-foot">${esc(counts(state))} are saved in this browser on this device. There’s no account and nothing is sent anywhere. Export a backup before clearing browser data or switching devices.</p>
    </section>

    <section aria-labelledby="h-reset">
      <h2 class="group-label" id="h-reset">Reset</h2>
      <div class="group-list">${row('reset', 'trash', 'red', 'Erase all data', '', true)}</div>
    </section>
    <p class="about">Evenday 0.2 · Prototype</p>
  </div>`;
}

export function openExport() {
  const json = store.exportJson();
  const name = `evenday-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const dlg = openSheet(`${sheetHeader('Export backup')}
    <div class="sheet-body">
      <p class="muted">Your backup includes ${esc(counts(store.getState()))}. Save the file somewhere safe, or copy the text.</p>
      <div class="setting-actions">
        <button type="button" class="btn btn-primary" data-download autofocus>${icon('download')}Download file</button>
        <button type="button" class="btn btn-secondary" data-copy>${icon('copy')}Copy text</button>
      </div>
      <label class="sr-only" for="export-text">Backup data</label>
      <textarea id="export-text" class="code" rows="6" readonly>${esc(json)}</textarea>
      <p class="hint">If the download doesn’t start (some embedded previews block downloads), use Copy text and paste it into a note or file.</p>
    </div>`, { label: 'Export backup' });
  dlg.querySelector('[data-download]').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash(dlg.querySelector('[data-download]'), 'Download started');
    store.markBackedUp();
  });
  dlg.querySelector('[data-copy]').addEventListener('click', async () => {
    const ok = await copyText(json, dlg.querySelector('textarea'));
    flash(dlg.querySelector('[data-copy]'), ok ? 'Copied' : 'Text selected. Press Ctrl+C or ⌘C.');
    if (ok) store.markBackedUp();
  });
}

// Inline feedback on a button (toasts sit behind open dialogs).
function flash(btn, text) {
  const html = btn.innerHTML;
  btn.innerHTML = `${icon('check')}${esc(text)}`;
  setTimeout(() => { btn.innerHTML = html; }, 2200);
}

export function openImport() {
  const dlg = openSheet(`<form class="form" novalidate>${sheetHeader('Import backup', { submit: 'Review' })}
    <div class="sheet-body">
      <p class="muted">Choose an Evenday backup file, or paste its text. Nothing changes until you confirm.</p>
      <div class="field">
        <label class="group-label" for="import-file">Backup file</label>
        <input id="import-file" type="file" accept="application/json,.json">
      </div>
      <div class="field">
        <label class="group-label" for="import-text">Or paste backup text</label>
        <textarea id="import-text" class="code" rows="5" placeholder='{"app": "evenday", …}'></textarea>
      </div>
      <p class="field-error" id="import-error" role="alert" hidden></p>
    </div></form>`, { label: 'Import backup' });
  const err = dlg.querySelector('#import-error');
  const text = dlg.querySelector('#import-text');
  dlg.querySelector('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5e6) { err.hidden = false; err.textContent = 'This file is too large to be an Evenday backup.'; return; }
    text.value = await file.text();
    err.hidden = true;
  });
  dlg.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let result;
    try {
      if (!text.value.trim()) throw new Error('Choose a backup file or paste its text first.');
      result = store.parseImport(text.value);
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message;
      return;
    }
    err.hidden = true;
    const ok = await confirmDialog({
      title: 'Replace your data?',
      message: `This backup has ${esc(counts(result))}. It will replace the ${esc(counts(store.getState()))} on this device.`
        + (result.skipped ? ` ${result.skipped} incomplete item${result.skipped > 1 ? 's' : ''} will be skipped.` : ''),
      confirmLabel: 'Replace data',
      danger: true,
    });
    if (!ok) return;
    const snap = store.snapshot();
    store.applyImport(result);
    closeSheet(dlg);
    toast('Backup imported', { actionLabel: 'Undo', onAction: () => store.restore(snap), duration: 8000 });
  });
}

export async function confirmReset() {
  const ok = await confirmDialog({
    title: 'Erase all data?',
    message: `This removes ${esc(counts(store.getState()))} from this device and restores the example shortcuts. A copy is kept so you can undo, or restore it later from Settings.`,
    confirmLabel: 'Erase everything',
    danger: true,
  });
  if (!ok) return;
  store.resetAll();
  toast('All data erased', { actionLabel: 'Undo', onAction: () => store.restoreBackup(), duration: 8000 });
}

export async function restorePrevious() {
  const b = store.readBackup();
  if (!b) return;
  const ok = await confirmDialog({
    title: 'Restore previous data?',
    message: `${esc(backupLabel(b))}: ${esc(counts(b.data))}. Your current data (${esc(counts(store.getState()))}) is kept as the new backup, so you can switch back.`,
    confirmLabel: 'Restore',
  });
  if (!ok) return;
  store.restoreBackup();
  toast('Previous data restored');
}

// Shows the unreadable copy so it can be saved and recovered.
export function openRecovery() {
  const copies = store.unreadableCopies();
  const raw = copies.length ? copies[copies.length - 1].raw : '';
  const dlg = openSheet(`${sheetHeader('Recover data')}
    <div class="sheet-body">
      <p class="muted">Evenday couldn’t read the data saved in this browser, so it started fresh instead of guessing. Nothing was thrown away: the original is below. Save it, and if it’s a valid backup you can import it from Settings.</p>
      <div class="setting-actions">
        <button type="button" class="btn btn-primary" data-copy>${icon('copy')}Copy</button>
        <button type="button" class="btn btn-secondary" data-download>${icon('download')}Download</button>
      </div>
      <label class="sr-only" for="recover-text">Unreadable data</label>
      <textarea id="recover-text" class="code" rows="6" readonly>${esc(raw)}</textarea>
    </div>`, { label: 'Recover data' });
  dlg.querySelector('[data-copy]').addEventListener('click', async () => flash(dlg.querySelector('[data-copy]'), (await copyText(raw, dlg.querySelector('textarea'))) ? 'Copied' : 'Text selected'));
  dlg.querySelector('[data-download]').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([raw], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'evenday-unreadable-data.txt' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
