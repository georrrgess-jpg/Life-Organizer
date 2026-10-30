import { hostOf, pageHeader, tileIcon } from '../components.js';
import { esc } from '../ui.js';
import { icon } from '../icons.js';

export function renderApps(state, ui) {
  const edit = ui.appsEdit;
  const list = state.shortcuts;
  const tiles = list.map((s, i) => edit
    ? `<li class="tile is-editing">
        <button type="button" class="tile-body" data-action="edit-shortcut" data-id="${s.id}" data-focus="edit-${s.id}" aria-label="Edit ${esc(s.name)}">
          ${tileIcon(s)}<span class="tile-name">${esc(s.name)}</span>
        </button>
        <div class="tile-tools">
          <button type="button" class="btn-icon btn-sm" data-action="move-shortcut" data-id="${s.id}" data-dir="-1" data-focus="up-${s.id}" aria-label="Move ${esc(s.name)} earlier" ${i === 0 ? 'disabled' : ''}>${icon('arrowLeft')}</button>
          <button type="button" class="btn-icon btn-sm${s.favorite ? ' is-fav' : ''}" data-action="fav-shortcut" data-id="${s.id}" data-focus="fav-${s.id}" aria-pressed="${s.favorite}" aria-label="Show ${esc(s.name)} on Today">${icon('star')}</button>
          <button type="button" class="btn-icon btn-sm" data-action="move-shortcut" data-id="${s.id}" data-dir="1" data-focus="down-${s.id}" aria-label="Move ${esc(s.name)} later" ${i === list.length - 1 ? 'disabled' : ''}>${icon('arrowRight')}</button>
        </div>
      </li>`
    : `<li class="tile">
        <a class="tile-body" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" data-action="open-shortcut" data-id="${s.id}" data-focus="open-${s.id}">
          ${tileIcon(s)}
          <span class="tile-name">${esc(s.name)}</span>
          <span class="tile-host">${s.example ? 'Example' : esc(hostOf(s.url))}</span>
          ${s.favorite ? `<span class="tile-fav" title="On Today">${icon('star')}</span>` : ''}
        </a>
      </li>`).join('');

  return `
  ${pageHeader({
    title: 'Apps',
    summary: edit ? 'Tap a shortcut to edit it. Use the arrows to reorder and the star to show it on Today.' : 'Your go-to sites and apps, one tap away.',
    actions: list.length ? `<button type="button" class="nav-btn${edit ? ' nav-strong' : ''}" data-action="apps-edit" data-focus="apps-edit" aria-pressed="${edit}">${edit ? 'Done' : 'Edit'}</button>` : '',
  })}
  <ul class="tile-grid">
    ${tiles}
    <li class="tile"><button type="button" class="tile-body tile-add" data-action="new-shortcut">
      <span class="tile-icon">${icon('plus')}</span><span class="tile-name">Add</span>
    </button></li>
  </ul>
  ${list.some((s) => s.example) ? `<p class="note">${icon('info')}<span>Shortcuts marked “Example” are starters. Edit or remove them to make the wall yours.</span></p>` : ''}
  <p class="note">${icon('info')}<span>Shortcuts open websites in a new tab. Browsers can’t see which apps are installed, so if you add an app link, Evenday tries the app first and offers the website if it doesn’t open.</span></p>`;
}
