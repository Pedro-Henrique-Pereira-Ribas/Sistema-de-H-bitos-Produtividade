/* Tarefas: prioridades, prazos, filtros e Foco do Dia. */
(function () {
  'use strict';

  const PRIORITIES = {
    alta: { label: 'Alta', weight: 0, className: 'badge-priority-alta' },
    media: { label: 'Média', weight: 1, className: 'badge-priority-media' },
    baixa: { label: 'Baixa', weight: 2, className: 'badge-priority-baixa' }
  };

  const ui = { filter: 'all', quickTitle: '', quickPriority: 'media' };

  function pendingCount() {
    return State.data.tasks.filter((task) => !task.done).length;
  }

  function sortTasks(tasks) {
    return [...tasks].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.done) return (b.completedAt || 0) - (a.completedAt || 0);
      const priorityDiff = PRIORITIES[a.priority].weight - PRIORITIES[b.priority].weight;
      if (priorityDiff) return priorityDiff;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return b.createdAt - a.createdAt;
    });
  }

  function dueInfo(task) {
    if (!task.dueDate) return null;
    const today = Utils.todayKey();
    if (!task.done && task.dueDate < today) {
      return { className: 'badge-due is-overdue', label: 'Atrasada · ' + Utils.formatMedium(task.dueDate) };
    }
    if (task.dueDate === today) {
      return { className: 'badge-due is-today', label: 'Hoje' };
    }
    if (task.dueDate === Utils.dateKey(Utils.addDays(new Date(), 1))) {
      return { className: 'badge-due', label: 'Amanhã' };
    }
    return { className: 'badge-due', label: Utils.formatMedium(task.dueDate) };
  }

  function toggle(id) {
    const task = State.task(id);
    if (!task) return;
    State.update((state) => {
      task.done = !task.done;
      task.completedAt = task.done ? Date.now() : null;
      if (task.done) {
        state.focus.taskIds = state.focus.taskIds.filter((taskId) => taskId !== task.id);
        if (state.focus.activeTaskId === task.id) {
          state.focus.activeTaskId = state.focus.taskIds[0] || null;
        }
      }
    });
    if (task.done) UI.toast('Tarefa concluída. Mandou bem!');
  }

  function addTask(title, priority = 'media', dueDate = '') {
    const clean = String(title || '').trim().slice(0, 120);
    if (!clean) return false;
    State.update((state) => {
      state.tasks.push({
        id: Utils.uid('task'),
        title: clean,
        priority: PRIORITIES[priority] ? priority : 'media',
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : '',
        done: false,
        createdAt: Date.now(),
        completedAt: null
      });
    });
    return true;
  }

  function quickAdd(form) {
    const title = form.elements.title.value;
    const priority = form.elements.priority.value;
    if (!title.trim()) {
      form.elements.title.focus();
      return;
    }
    const previousTitle = ui.quickTitle;
    ui.quickTitle = '';
    ui.quickPriority = priority;
    if (ui.filter === 'done') ui.filter = 'all';
    if (!addTask(title, priority)) {
      ui.quickTitle = previousTitle;
      return;
    }
    UI.toast('Tarefa adicionada.');
    setTimeout(() => {
      const input = document.getElementById('quick-task-input');
      if (input) input.focus();
    }, 0);
  }

  function setError(message) {
    const box = document.getElementById('task-error');
    if (!box) return;
    box.textContent = message || '';
    box.hidden = !message;
  }

  function openForm(id) {
    const form = document.getElementById('task-form');
    const dialog = document.getElementById('task-dialog');
    if (!form) return;
    const task = id ? State.task(id) : null;
    const title = document.getElementById('task-dialog-title');
    const submit = form.querySelector('button[type="submit"]');

    form.reset();
    setError('');
    form.elements.id.value = task ? task.id : '';
    form.elements.title.value = task ? task.title : '';
    form.elements.priority.value = task ? task.priority : 'media';
    form.elements.dueDate.value = task && task.dueDate ? task.dueDate : '';
    title.textContent = task ? 'Editar tarefa' : 'Nova tarefa';
    submit.textContent = task ? 'Salvar alterações' : 'Salvar tarefa';

    UI.openDialog(dialog);
    setTimeout(() => {
      form.elements.title.focus();
      if (task) form.elements.title.select();
    }, 60);
  }

  function saveForm(form) {
    const data = new FormData(form);
    const title = String(data.get('title') || '').trim().slice(0, 120);
    const priority = String(data.get('priority') || 'media');
    const dueDate = String(data.get('dueDate') || '');
    const id = String(data.get('id') || '');

    if (!title) {
      setError('Descreva a tarefa antes de salvar.');
      form.elements.title.focus();
      return;
    }

    if (id) {
      const task = State.task(id);
      if (!task) return;
      State.update(() => {
        task.title = title;
        task.priority = PRIORITIES[priority] ? priority : 'media';
        task.dueDate = /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : '';
      });
      UI.toast('Tarefa atualizada.');
    } else {
      addTask(title, priority, dueDate);
      UI.toast('Tarefa criada.');
    }

    UI.closeDialog(document.getElementById('task-dialog'));
  }

  async function confirmDelete(id) {
    const task = State.task(id);
    if (!task) return;
    const ok = await UI.confirm({
      title: 'Excluir tarefa?',
      message: `"${task.title}" será removida da sua lista.`,
      confirmLabel: 'Excluir tarefa',
      danger: true
    });
    if (!ok) return;
    State.update((state) => {
      state.tasks = state.tasks.filter((item) => item.id !== id);
      state.focus.taskIds = state.focus.taskIds.filter((taskId) => taskId !== id);
      if (state.focus.activeTaskId === id) state.focus.activeTaskId = state.focus.taskIds[0] || null;
    });
    UI.toast('Tarefa excluída.', 'info');
  }

  function toggleFocus(id) {
    const task = State.task(id);
    if (!task || task.done) return;
    const focus = State.data.focus;
    const exists = focus.taskIds.includes(id);
    if (!exists && focus.taskIds.length >= 3) {
      UI.toast('O Foco do Dia aceita no máximo 3 tarefas.', 'error');
      return;
    }
    State.update(() => {
      if (exists) {
        focus.taskIds = focus.taskIds.filter((taskId) => taskId !== id);
        if (focus.activeTaskId === id) focus.activeTaskId = focus.taskIds[0] || null;
      } else {
        focus.taskIds.push(id);
        if (!focus.activeTaskId) focus.activeTaskId = id;
      }
    });
    UI.toast(exists ? 'Tarefa removida do Foco do Dia.' : 'Tarefa adicionada ao Foco do Dia.');
  }

  function setActiveFocus(id) {
    const task = State.task(id);
    if (!task || task.done || !State.data.focus.taskIds.includes(id)) return;
    if (State.data.focus.activeTaskId === id) return;
    State.update(() => {
      State.data.focus.activeTaskId = id;
    });
  }

  function renderTask(task) {
    const priority = PRIORITIES[task.priority];
    const due = dueInfo(task);
    const inFocus = State.data.focus.taskIds.includes(task.id);
    const completed = task.done && task.completedAt
      ? `<span class="badge badge-muted">Concluída em ${Utils.formatMedium(new Date(task.completedAt))}</span>`
      : '';

    return `
      <li class="task-item ${task.done ? 'is-done' : ''}">
        <input type="checkbox" class="check-input" data-action="toggle-task" data-id="${task.id}" data-focus-id="task-${task.id}" aria-label="${task.done ? 'Reabrir' : 'Concluir'} tarefa: ${Utils.esc(task.title)}" ${task.done ? 'checked' : ''}>
        <div class="task-main">
          <span class="task-title">${Utils.esc(task.title)}</span>
          <div class="task-meta">
            <span class="badge ${priority.className}">${priority.label}</span>
            ${due ? `<span class="badge ${due.className}">${Utils.esc(due.label)}</span>` : ''}
            ${completed}
          </div>
        </div>
        <div class="task-tools">
          <button type="button" class="icon-btn sm task-focus ${inFocus ? 'is-active' : ''}" data-action="toggle-focus-task" data-id="${task.id}" data-focus-id="focus-${task.id}" aria-pressed="${inFocus}" aria-label="${inFocus ? 'Remover do' : 'Adicionar ao'} Foco do Dia" title="${inFocus ? 'Remover do Foco do Dia' : 'Adicionar ao Foco do Dia'}" ${task.done ? 'disabled' : ''}>${UI.icon('star')}</button>
          <button type="button" class="icon-btn sm" data-action="edit-task" data-id="${task.id}" aria-label="Editar tarefa: ${Utils.esc(task.title)}" title="Editar">${UI.icon('edit')}</button>
          <button type="button" class="icon-btn sm" data-action="delete-task" data-id="${task.id}" aria-label="Excluir tarefa: ${Utils.esc(task.title)}" title="Excluir">${UI.icon('trash')}</button>
        </div>
      </li>`;
  }

  function render() {
    const root = document.getElementById('view-tasks');
    if (!root) return;

    const tasks = State.data.tasks;
    const pending = tasks.filter((task) => !task.done);
    const done = tasks.filter((task) => task.done);
    const filtered = ui.filter === 'pending' ? pending : ui.filter === 'done' ? done : tasks;
    const sorted = sortTasks(filtered);
    const focusCount = State.data.focus.taskIds.length;
    const overdue = pending.filter((task) => task.dueDate && task.dueDate < Utils.todayKey()).length;

    let list = '';
    if (sorted.length) {
      list = `<ul class="task-list">${sorted.map(renderTask).join('')}</ul>`;
    } else {
      const messages = {
        all: ['Nenhuma tarefa por aqui', 'Adicione algo pequeno e comece pelo mais importante.', 'Criar tarefa'],
        pending: ['Tudo em dia!', 'Você não tem tarefas pendentes. Aproveite para respirar ou criar a próxima.', 'Criar tarefa'],
        done: ['Nada concluído ainda', 'Quando você marcar uma tarefa, ela aparece aqui.', 'Ver pendentes']
      };
      const [title, text, cta] = messages[ui.filter];
      list = `
        <div class="card">
          <div class="empty">
            <div class="empty-icon">${UI.icon('check-square')}</div>
            <p class="empty-title">${title}</p>
            <p class="empty-text">${text}</p>
            <button type="button" class="btn ${ui.filter === 'done' ? 'btn-ghost' : 'btn-primary'}" data-action="${ui.filter === 'done' ? 'task-filter' : 'open-task-modal'}" ${ui.filter === 'done' ? 'data-filter="pending"' : ''}>${UI.icon(ui.filter === 'done' ? 'clock' : 'plus')} ${cta}</button>
          </div>
        </div>`;
    }

    root.innerHTML = `
      <div class="view-head">
        <div>
          <h1 class="view-title">Tarefas</h1>
          <p class="view-sub">${pending.length} ${pending.length === 1 ? 'pendente' : 'pendentes'}${overdue ? ` · ${overdue} ${overdue === 1 ? 'atrasada' : 'atrasadas'}` : ''} · ${focusCount}/3 no Foco do Dia</p>
        </div>
        <div class="view-actions">
          <button type="button" class="btn btn-primary" data-action="open-task-modal">${UI.icon('plus')} Nova tarefa</button>
        </div>
      </div>

      <div class="tasks-layout">
        <form class="quick-task" id="quick-task-form" novalidate>
          <label class="sr-only" for="quick-task-input">Título da tarefa rápida</label>
          <input class="input" id="quick-task-input" name="title" maxlength="120" placeholder="Adicionar tarefa rápida..." autocomplete="off" value="${Utils.esc(ui.quickTitle)}">
          <label class="sr-only" for="quick-task-priority">Prioridade</label>
          <select class="select" id="quick-task-priority" name="priority">
            ${Object.entries(PRIORITIES).map(([value, item]) => `<option value="${value}" ${ui.quickPriority === value ? 'selected' : ''}>${item.label}</option>`).join('')}
          </select>
          <button type="submit" class="btn btn-primary">${UI.icon('plus')}<span>Adicionar</span></button>
        </form>

        <div class="filters-row">
          <div class="segmented" role="group" aria-label="Filtrar tarefas">
            <button type="button" class="${ui.filter === 'all' ? 'is-active' : ''}" data-action="task-filter" data-filter="all" aria-pressed="${ui.filter === 'all'}">Todas <span class="count">${tasks.length}</span></button>
            <button type="button" class="${ui.filter === 'pending' ? 'is-active' : ''}" data-action="task-filter" data-filter="pending" aria-pressed="${ui.filter === 'pending'}">Pendentes <span class="count">${pending.length}</span></button>
            <button type="button" class="${ui.filter === 'done' ? 'is-active' : ''}" data-action="task-filter" data-filter="done" aria-pressed="${ui.filter === 'done'}">Concluídas <span class="count">${done.length}</span></button>
          </div>
          <span class="filters-summary">${sorted.length} ${sorted.length === 1 ? 'item exibido' : 'itens exibidos'}</span>
        </div>

        ${list}
      </div>`;
  }

  function setFilter(filter) {
    if (!['all', 'pending', 'done'].includes(filter)) return;
    ui.filter = filter;
    render();
    const button = document.querySelector(`[data-action="task-filter"][data-filter="${filter}"]`);
    if (button) button.focus({ preventScroll: true });
  }

  function init() {
    document.addEventListener('input', (event) => {
      if (event.target.id === 'quick-task-input') ui.quickTitle = event.target.value;
    });
    document.addEventListener('change', (event) => {
      if (event.target.id === 'quick-task-priority') ui.quickPriority = event.target.value;
    });
  }

  window.Tasks = {
    PRIORITIES,
    init,
    render,
    pendingCount,
    sortTasks,
    toggle,
    addTask,
    quickAdd,
    openForm,
    saveForm,
    confirmDelete,
    toggleFocus,
    setActiveFocus,
    setFilter
  };
})();
