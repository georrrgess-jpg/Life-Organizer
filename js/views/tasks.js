import { relativeDay, todayKey } from '../dates.js';
import { emptyState, taskRow } from '../components.js';
import { esc } from '../ui.js';
import { icon } from '../icons.js';

const byPriority = (a, b) => ({ high: 0, normal: 1, low: 2 }[a.priority] - { high: 0, normal: 1, low: 2 }[b.priority]);

export function taskGroups(state, today = todayKey()) {
  const open = state.tasks.filter((t) => !t.done);
  return {
    overdue: open.filter((t) => t.due && t.due < today).sort((a, b) => a.due.localeCompare(b.due)),
    today: open.filter((t) => t.due === today).sort(byPriority),
    upcoming: open.filter((t) => t.due && t.due > today).sort((a, b) => a.due.localeCompare(b.due) || byPriority(a, b)),
    someday: open.filter((t) => !t.due).sort(byPriority),
    done: state.tasks.filter((t) => t.done).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')),
  };
}

const list = (tasks, opts) => `<ul class="task-list">${tasks.map((t) => taskRow(t, opts)).join('')}</ul>`;

export function renderTasks(state, ui) {
  const today = todayKey();
  const g = taskGroups(state, today);
  const tab = ui.taskTab;
  const counts = { today: g.overdue.length + g.today.length, upcoming: g.upcoming.length + g.someday.length, done: g.done.length };
  const tabs = [['today', 'Today'], ['upcoming', 'Upcoming'], ['done', 'Done']];

  let body = '';
  if (tab === 'today') {
    body = counts.today
      ? `${g.overdue.length ? `<h3 class="subhead subhead-warn">Overdue</h3>${list(g.overdue, { today })}` : ''}
         ${g.today.length ? `<h3 class="subhead">Due today</h3>${list(g.today, { showDue: false, today })}` : ''}`
      : emptyState('tasks', 'Nothing due today', 'Add a task above, or check Upcoming for what’s next.');
  } else if (tab === 'upcoming') {
    const byDate = {};
    for (const t of g.upcoming) (byDate[t.due] ||= []).push(t);
    body = counts.upcoming
      ? `${Object.entries(byDate).map(([d, ts]) => `<h3 class="subhead">${esc(relativeDay(d, today))}</h3>${list(ts, { showDue: false, today })}`).join('')}
         ${g.someday.length ? `<h3 class="subhead">No due date</h3>${list(g.someday, { today })}` : ''}`
      : emptyState('calendar', 'Nothing upcoming', 'Tasks with a future due date, or no date at all, appear here.');
  } else {
    body = counts.done
      ? `${list(g.done, { today })}
         <div class="list-foot"><button type="button" class="btn btn-ghost-danger btn-sm" data-action="clear-completed">${icon('trash')}Clear completed</button></div>`
      : emptyState('check', 'No completed tasks yet', 'Tasks you check off are kept here so you can reopen them.');
  }

  return `
  <header class="page-head">
    <div><h1>Tasks</h1></div>
  </header>
  <div class="segmented tabs" role="tablist" aria-label="Task views">
    ${tabs.map(([k, label]) => `<button type="button" role="tab" class="seg-btn" data-action="task-tab" data-tab="${k}" data-focus="tab-${k}"
      aria-selected="${tab === k}" tabindex="${tab === k ? 0 : -1}">${label}${counts[k] ? `<span class="count">${counts[k]}</span>` : ''}</button>`).join('')}
  </div>
  <section class="card section" role="tabpanel" aria-label="${tabs.find((t) => t[0] === tab)[1]}">
    ${tab !== 'done' ? `<form class="quick-task" data-form="quick-task" data-due="${tab === 'today' ? today : ''}">
      <label class="sr-only" for="quick-tasks">Add a task</label>
      <input id="quick-tasks" name="title" type="text" maxlength="200" autocomplete="off" data-focus="quick-tasks"
        placeholder="${tab === 'today' ? 'Add a task for today' : 'Add a task with no due date'}">
      <button type="submit" class="btn-icon btn-accent" aria-label="Add task">${icon('plus')}</button>
    </form>` : ''}
    ${body}
  </section>`;
}
