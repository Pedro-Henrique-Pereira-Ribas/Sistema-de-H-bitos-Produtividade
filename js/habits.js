/* Hábitos: regras de streak, registros e renderização. */
(function () {
  'use strict';

  const PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#f59e0b', '#10b981', '#14b8a6', '#0ea5e9', '#64748b'];
  const EMOJIS = ['💧', '🏋️', '📚', '🧘', '🥗', '😴', '🚶', '✍️', '🎸', '💻', '🧹', '☀️', '🦷', '💊', '🎯', '🎨', '🌱', '🗣️', '💸', '🧠', '☕', '🚴', '🍎', '🧴'];
  const DAYS = [
    { js: 1, label: 'Seg', full: 'segunda-feira' },
    { js: 2, label: 'Ter', full: 'terça-feira' },
    { js: 3, label: 'Qua', full: 'quarta-feira' },
    { js: 4, label: 'Qui', full: 'quinta-feira' },
    { js: 5, label: 'Sex', full: 'sexta-feira' },
    { js: 6, label: 'Sáb', full: 'sábado' },
    { js: 0, label: 'Dom', full: 'domingo' }
  ];

  const ui = { showArchived: false };

  function isScheduled(habit, date) {
    return Array.isArray(habit.days) && habit.days.includes(date.getDay());
  }

  function isDone(habit, key) {
    return Boolean(habit.log && habit.log[key]);
  }

  function habitsForDate(key) {
    const date = Utils.parseKey(key);
    return State.data.habits.filter((h) => (
      !h.archived &&
      h.createdAt <= key &&
      isScheduled(h, date)
    ));
  }

  function completionForDate(key) {
    const habits = habitsForDate(key);
    const done = habits.filter((h) => isDone(h, key)).length;
    return {
      habits,
      done,
      total: habits.length,
      pct: habits.length ? Math.round((done / habits.length) * 100) : null
    };
  }

  function toggle(id, key) {
    const target = key || Utils.todayKey();
    if (target > Utils.todayKey()) return;
    const habit = State.habit(id);
    if (!habit || habit.createdAt > target) return;
    if (!isScheduled(habit, Utils.parseKey(target))) return;
    State.update(() => {
      if (habit.log[target]) delete habit.log[target];
      else habit.log[target] = true;
    });
  }

  function currentStreak(habit) {
    let cursor = Utils.parseKey(Utils.todayKey());
    let streak = 0;
    if (isScheduled(habit, cursor) && !isDone(habit, Utils.todayKey())) {
      cursor = Utils.addDays(cursor, -1);
    }
    for (let i = 0; i < 1600; i++) {
      const key = Utils.dateKey(cursor);
      if (habit.createdAt && key < habit.createdAt) break;
      if (isScheduled(habit, cursor)) {
        if (isDone(habit, key)) streak++;
        else break;
      }
      cursor = Utils.addDays(cursor, -1);
    }
    return streak;
  }

  function bestStreak(habit) {
    let cursor = Utils.parseKey(habit.createdAt || Utils.todayKey());
    const end = Utils.parseKey(Utils.todayKey());
    let best = 0;
    let run = 0;
    for (let i = 0; cursor <= end && i < 5000; i++) {
      if (isScheduled(habit, cursor)) {
        if (isDone(habit, Utils.dateKey(cursor))) {
          run++;
          if (run > best) best = run;
        } else {
          run = 0;
        }
      }
      cursor = Utils.addDays(cursor, 1);
    }
    return best;
  }

  function weekFor(habit) {
    const start = Utils.startOfWeek();
    const today = Utils.todayKey();
    return Array.from({ length: 7 }, (_, index) => {
      const date = Utils.addDays(start, index);
      const key = Utils.dateKey(date);
      return {
        date,
        key,
        label: Utils.WEEK_LETTERS[index],
        scheduled: isScheduled(habit, date),
        done: isDone(habit, key),
        future: key > today,
        today: key === today,
        before: key < habit.createdAt
      };
    });
  }

  function weekStats(habit) {
    const week = weekFor(habit);
    return {
      done: week.filter((d) => d.scheduled && d.done).length,
      total: week.filter((d) => d.scheduled).length
    };
  }

  function todayStats() {
    const key = Utils.todayKey();
    const habits = habitsForDate(key);
    const items = habits
      .map((habit) => ({
        habit,
        done: isDone(habit, key),
        streak: currentStreak(habit)
      }))
      .sort((a, b) => Number(a.done) - Number(b.done) || a.habit.name.localeCompare(b.habit.name, 'pt-BR'));
    const done = items.filter((item) => item.done).length;
    return {
      total: items.length,
      done,
      pct: items.length ? Math.round((done / items.length) * 100) : 0,
      items
    };
  }

  function adherence(habit, days = 30) {
    const keys = Utils.lastNDays(days);
    let total = 0;
    let done = 0;
    keys.forEach((key) => {
      if (key < habit.createdAt) return;
      const date = Utils.parseKey(key);
      if (!isScheduled(habit, date)) return;
      total++;
      if (isDone(habit, key)) done++;
    });
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  function rangeAdherence(days = 7) {
    const keys = Utils.lastNDays(days);
    let total = 0;
    let done = 0;
    keys.forEach((key) => {
      const stats = completionForDate(key);
      total += stats.total;
      done += stats.done;
    });
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  function monthCompletions() {
    const now = new Date();
    const prefix = `${now.getFullYear()}-${Utils.pad(now.getMonth() + 1)}`;
    let count = 0;
    State.data.habits.forEach((habit) => {
      if (habit.archived) return;
      Object.keys(habit.log || {}).forEach((key) => {
        if (key.startsWith(prefix)) count++;
      });
    });
    return count;
  }

  function buildPickers() {
    const emojis = document.getElementById('habit-emojis');
    const colors = document.getElementById('habit-colors');
    const days = document.getElementById('habit-days');
    if (!emojis || !colors || !days) return;

    emojis.innerHTML = EMOJIS.map((emoji) => `
      <label class="emoji-opt">
        <input type="radio" name="emoji" value="${emoji}" aria-label="Ícone ${emoji}">
        <span aria-hidden="true">${emoji}</span>
      </label>`).join('');

    colors.innerHTML = PALETTE.map((color) => `
      <label class="color-opt" style="--c:${color}">
        <input type="radio" name="color" value="${color}" aria-label="Cor ${color}">
        <span aria-hidden="true"></span>
      </label>`).join('');

    days.innerHTML = DAYS.map((day) => `
      <label class="day-opt">
        <input type="checkbox" name="days" value="${day.js}" aria-label="${day.full}">
        <span aria-hidden="true">${day.label}</span>
      </label>`).join('');
  }

  function setError(message) {
    const box = document.getElementById('habit-error');
    if (!box) return;
    box.textContent = message || '';
    box.hidden = !message;
  }

  function openForm(id) {
    const form = document.getElementById('habit-form');
    if (!form) return;
    const dialog = document.getElementById('habit-dialog');
    const title = document.getElementById('habit-dialog-title');
    const submit = form.querySelector('button[type="submit"]');
    const habit = id ? State.habit(id) : null;

    form.reset();
    setError('');
    form.elements.id.value = habit ? habit.id : '';
    form.elements.name.value = habit ? habit.name : '';
    title.textContent = habit ? 'Editar hábito' : 'Novo hábito';
    submit.textContent = habit ? 'Salvar alterações' : 'Salvar hábito';

    const emoji = habit ? habit.emoji : EMOJIS[0];
    const color = habit ? habit.color : PALETTE[0];
    const days = habit ? habit.days : [0, 1, 2, 3, 4, 5, 6];

    form.querySelectorAll('input[name="emoji"]').forEach((input) => {
      input.checked = input.value === emoji;
    });
    form.querySelectorAll('input[name="color"]').forEach((input) => {
      input.checked = input.value === color;
    });
    form.querySelectorAll('input[name="days"]').forEach((input) => {
      input.checked = days.includes(Number(input.value));
    });

    UI.openDialog(dialog);
    setTimeout(() => {
      form.elements.name.focus();
      if (habit) form.elements.name.select();
    }, 60);
  }

  function saveForm(form) {
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim().slice(0, 60);
    const emoji = String(data.get('emoji') || EMOJIS[0]);
    const color = String(data.get('color') || PALETTE[0]);
    const days = data.getAll('days').map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    const id = String(data.get('id') || '');

    if (!name) {
      setError('Dê um nome para o hábito.');
      form.elements.name.focus();
      return;
    }
    if (!days.length) {
      setError('Escolha pelo menos um dia da semana.');
      return;
    }

    if (id) {
      const habit = State.habit(id);
      if (!habit) return;
      State.update(() => {
        habit.name = name;
        habit.emoji = emoji;
        habit.color = color;
        habit.days = [...new Set(days)].sort((a, b) => a - b);
      });
      UI.toast('Hábito atualizado.');
    } else {
      State.update((state) => {
        state.habits.push({
          id: Utils.uid('hab'),
          name,
          emoji,
          color,
          days: [...new Set(days)].sort((a, b) => a - b),
          createdAt: Utils.todayKey(),
          archived: false,
          log: {}
        });
      });
      UI.toast('Hábito criado. Bora começar!');
    }

    UI.closeDialog(document.getElementById('habit-dialog'));
  }

  async function confirmDelete(id) {
    const habit = State.habit(id);
    if (!habit) return;
    const count = Object.keys(habit.log || {}).length;
    const completionText = count === 0
      ? 'seu histórico também será removido'
      : count === 1
        ? 'a 1 conclusão registrada também será removida'
        : `as ${count} conclusões registradas também serão removidas`;
    const ok = await UI.confirm({
      title: 'Excluir hábito?',
      message: `"${habit.name}" será removido e ${completionText}. Essa ação não pode ser desfeita.`,
      confirmLabel: 'Excluir hábito',
      danger: true
    });
    if (!ok) return;
    State.update((state) => {
      state.habits = state.habits.filter((h) => h.id !== id);
    });
    UI.toast('Hábito excluído.', 'info');
  }

  function toggleArchive(id) {
    const habit = State.habit(id);
    if (!habit) return;
    State.update(() => {
      habit.archived = !habit.archived;
    });
    UI.toast(habit.archived ? 'Hábito arquivado. O histórico foi mantido.' : 'Hábito reativado.');
  }

  function toggleArchivedList() {
    ui.showArchived = !ui.showArchived;
    render();
  }

  function renderCard(habit) {
    const streak = currentStreak(habit);
    const week = weekFor(habit);
    const weekInfo = weekStats(habit);
    const today = Utils.todayKey();
    const scheduledToday = !habit.archived && isScheduled(habit, new Date());
    const doneToday = isDone(habit, today);
    const disabledBase = habit.archived;

    const dots = week.map((day, index) => {
      const disabled = disabledBase || day.future || day.before || !day.scheduled;
      const label = `${DAYS[index].full}, ${Utils.formatMedium(day.key)} — ${day.scheduled ? (day.done ? 'concluído' : 'não concluído') : 'não agendado'}`;
      const classes = [
        'week-dot',
        day.done ? 'is-done' : '',
        day.today ? 'is-today' : ''
      ].filter(Boolean).join(' ');
      return `<button type="button" class="${classes}" data-action="toggle-habit-date" data-id="${habit.id}" data-date="${day.key}" data-focus-id="dot-${habit.id}-${day.key}" aria-pressed="${day.done}" aria-label="${Utils.esc(label)}" title="${Utils.esc(label)}" ${disabled ? 'disabled' : ''}>${day.label}</button>`;
    }).join('');

    const actionButtons = habit.archived
      ? `<button type="button" class="icon-btn sm" data-action="toggle-archive" data-id="${habit.id}" aria-label="Reativar ${Utils.esc(habit.name)}" title="Reativar">${UI.icon('rotate')}</button>
         <button type="button" class="icon-btn sm" data-action="delete-habit" data-id="${habit.id}" aria-label="Excluir ${Utils.esc(habit.name)}" title="Excluir">${UI.icon('trash')}</button>`
      : `<button type="button" class="icon-btn sm" data-action="edit-habit" data-id="${habit.id}" aria-label="Editar ${Utils.esc(habit.name)}" title="Editar">${UI.icon('edit')}</button>
         <button type="button" class="icon-btn sm" data-action="toggle-archive" data-id="${habit.id}" aria-label="Arquivar ${Utils.esc(habit.name)}" title="Arquivar">${UI.icon('archive')}</button>
         <button type="button" class="icon-btn sm" data-action="delete-habit" data-id="${habit.id}" aria-label="Excluir ${Utils.esc(habit.name)}" title="Excluir">${UI.icon('trash')}</button>`;

    return `
      <article class="habit-card ${habit.archived ? 'is-archived' : ''}" style="--habit:${habit.color}">
        <div class="habit-top">
          <span class="habit-emoji" aria-hidden="true">${Utils.esc(habit.emoji)}</span>
          <div class="habit-info">
            <h3 class="habit-name">${Utils.esc(habit.name)}</h3>
            <div class="habit-meta">
              ${streak > 0
                ? `<span class="streak-chip">${UI.icon('flame')}${streak} ${streak === 1 ? 'dia' : 'dias'}</span>`
                : '<span class="habit-muted">Sem sequência ativa</span>'}
              ${habit.archived ? '<span class="badge badge-muted">Arquivado</span>' : ''}
            </div>
          </div>
          <div class="habit-tools">${actionButtons}</div>
        </div>
        <div class="habit-week" role="group" aria-label="Registros da semana atual">
          ${dots}
        </div>
        <div class="habit-foot">
          <span class="habit-week-progress">${weekInfo.done}/${weekInfo.total} esta semana</span>
          ${habit.archived
            ? ''
            : scheduledToday
              ? `<button type="button" class="btn btn-sm ${doneToday ? 'btn-soft' : 'btn-primary'}" data-action="toggle-habit-today" data-id="${habit.id}" data-focus-id="today-${habit.id}" aria-pressed="${doneToday}">${doneToday ? `${UI.icon('check')} Concluído` : 'Concluir hoje'}</button>`
              : '<span class="habit-muted">Não agendado hoje</span>'}
        </div>
      </article>`;
  }

  function render() {
    const root = document.getElementById('view-habits');
    if (!root) return;

    const active = State.data.habits.filter((h) => !h.archived);
    const archived = State.data.habits.filter((h) => h.archived);
    const showingArchived = ui.showArchived && archived.length > 0;
    const monthly = monthCompletions();

    let content = '';

    if (active.length) {
      content += `<div class="habits-grid">${active.map(renderCard).join('')}</div>`;
    } else {
      content += `
        <div class="card">
          <div class="empty">
            <div class="empty-icon">${UI.icon('repeat')}</div>
            <p class="empty-title">Nenhum hábito ativo</p>
            <p class="empty-text">Crie um hábito pequeno o suficiente para começar hoje. A constância faz o resto.</p>
            <button type="button" class="btn btn-primary" data-action="new-habit">${UI.icon('plus')} Criar meu primeiro hábito</button>
          </div>
        </div>`;
    }

    if (showingArchived) {
      content += `<h2 class="subsection-title">Arquivados <span class="badge badge-muted">${archived.length}</span></h2>`;
      content += `<div class="habits-grid">${archived.map(renderCard).join('')}</div>`;
    }

    root.innerHTML = `
      <div class="view-head">
        <div>
          <h1 class="view-title">Meus hábitos</h1>
          <p class="view-sub">${active.length} ${active.length === 1 ? 'hábito ativo' : 'hábitos ativos'} · ${monthly} ${monthly === 1 ? 'conclusão' : 'conclusões'} neste mês</p>
        </div>
        <div class="view-actions">
          <button type="button" class="btn btn-primary" data-action="new-habit">${UI.icon('plus')} Novo hábito</button>
        </div>
      </div>

      ${archived.length ? `
        <div class="habits-toolbar">
          <button type="button" class="text-btn" data-action="toggle-archived-list">
            ${showingArchived ? 'Ocultar arquivados' : `Mostrar arquivados (${archived.length})`}
          </button>
        </div>` : ''}

      ${content}`;
  }

  function init() {
    buildPickers();
  }

  window.Habits = {
    EMOJIS,
    PALETTE,
    init,
    render,
    isScheduled,
    isDone,
    habitsForDate,
    completionForDate,
    toggle,
    currentStreak,
    bestStreak,
    weekFor,
    todayStats,
    adherence,
    rangeAdherence,
    openForm,
    saveForm,
    confirmDelete,
    toggleArchive,
    toggleArchivedList
  };
})();
