import * as store from '../store.js';
import { closeSheet, confirmDialog, copyText, esc, openSheet, sheetHeader, toast } from '../ui.js';
import { icon } from '../icons.js';

const seg = (action, current, options) => `<div class="segmented" role="radiogroup">
  ${options.map(([v, label, ic]) => `<button type="button" role="radio" class="seg-btn" data-action="${action}" data-value="${v}" data-focus="${action}-${v}" aria-checked="${String(current) === String(v)}">${ic ? icon(ic) : ''}${label}</button>`).join('')}
</div>`;

const counts = (d) => `${d.tasks.length} tasks, ${d.events.length} events and ${d.shortcuts.length} shortcuts`;

export function renderSettings(state) {
  const sample = store.hasSampleData();
  return `
  <header class="page-head"><div><h1>Settings</h1></div></header>
  <div class="settings">
    <section class="card group" aria-labelledby="h-look">
      <h2 id="h-look">Appearance</h2>
      <div class="setting"><span class="setting-label">Theme</span>
        ${seg('set-theme', state.prefs.theme, [['system', 'System', 'monitor'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']])}</div>
      <div class="setting"><span class="setting-label">Week starts on</span>
        ${seg('set-week', state.prefs.weekStart, [[0, 'Sunday'], [1, 'Monday']])}</div>
    </section>

    <section class="card group" aria-labelledby="h-data">
      <h2 id="h-data">Your data</h2>
      <p class="muted small">Everything is saved in this browser on this device. There’s no account and nothing is sent anywhere. Export a backup before clearing your browser data or switching devices.</p>
      <div class="setting-actions">
        <button type="button" class="btn btn-secondary" data-action="export">${icon('download')}Export backup</button>
        <button type="button" class="btn btn-secondary" data-action="import">${icon('upload')}Import backup</button>
      </div>
    </section>

    <section class="card group" aria-labelledby="h-sample">
      <h2 id="h-sample">Sample data</h2>
      <p class="muted small">${sample ? 'Sample tasks and events are loaded. Removing them leaves your own items untouched.' : 'Fill Evenday with example tasks and events to see how it works. You can remove them in one tap.'}</p>
      <div class="setting-actions">
        ${sample
          ? `<button type="button" class="btn btn-secondary" data-action="clear-sample" data-focus="sample-btn">${icon('x')}Remove sample data</button>`
          : `<button type="button" class="btn btn-secondary" data-action="load-sample" data-focus="sample-btn">${icon('sparkle')}Load sample data</button>`}
      </div>
    </section>

    <section class="card group" aria-labelledby="h-reset">
      <h2 id="h-reset">Reset</h2>
      <p class="muted small">Erase all tasks, events and shortcuts on this device and start over.</p>
      <div class="setting-actions"><button type="button" class="btn btn-ghost-danger" data-action="reset">${icon('trash')}Erase all data</button></div>
    </section>
    <p class="about">Evenday 0.1 · Prototype · Your data stays on this device.</p>
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
  });
  dlg.querySelector('[data-copy]').addEventListener('click', async () => {
    const ok = await copyText(json, dlg.querySelector('textarea'));
    flash(dlg.querySelector('[data-copy]'), ok ? 'Copied' : 'Text selected. Press Ctrl+C or ⌘C.');
  });
}

// Inline feedback on a button (toasts sit behind open dialogs).
function flash(btn, text) {
  const html = btn.innerHTML;
  btn.innerHTML = `${icon('check')}${esc(text)}`;
  setTimeout(() => { btn.innerHTML = html; }, 2200);
}

export function openImport() {
  const dlg = openSheet(`${sheetHeader('Import backup')}
    <div class="sheet-body">
      <p class="muted">Choose an Evenday backup file, or paste its text. Nothing changes until you confirm.</p>
      <div class="field">
        <label for="import-file">Backup file</label>
        <input id="import-file" type="file" accept="application/json,.json">
      </div>
      <div class="field">
        <label for="import-text">Or paste backup text</label>
        <textarea id="import-text" class="code" rows="5" placeholder='{"app": "evenday", …}'></textarea>
      </div>
      <p class="field-error" id="import-error" role="alert" hidden></p>
    </div>
    <footer class="sheet-foot"><span></span><div class="foot-actions">
      <button type="button" class="btn btn-secondary" data-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-check>Review import</button>
    </div></footer>`, { label: 'Import backup' });
  const err = dlg.querySelector('#import-error');
  const text = dlg.querySelector('#import-text');
  dlg.querySelector('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5e6) { err.hidden = false; err.textContent = 'This file is too large to be an Evenday backup.'; return; }
    text.value = await file.text();
    err.hidden = true;
  });
  dlg.querySelector('[data-check]').addEventListener('click', async () => {
    let result;
    try {
      if (!text.value.trim()) throw new Error('Choose a backup file or paste its text first.');
      result = store.parseImport(text.value);
    } catch (e) {
      err.hidden = false;
      err.textContent = e.message;
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
    message: `This permanently removes ${esc(counts(store.getState()))} from this device. Example shortcuts will be restored. Export a backup first if you might want them later.`,
    confirmLabel: 'Erase everything',
    danger: true,
  });
  if (!ok) return;
  store.resetAll();
  toast('All data erased');
}
