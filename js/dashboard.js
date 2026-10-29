/* Dashboard: visão do dia, calendário, ritmo semanal e Foco do Dia. */
(function () {
  'use strict';

  const HERO_CIRCUMFERENCE = 2 * Math.PI * 50;
  let openDayKey = null;

  function streakSummary() {
    let best = 0;
    let name = '';
    State.activeHabits().forEach((habit) => {
      const streak = Habits.currentStreak(habit);
      if (streak > best) {
        best = streak;
        name = habit.name;
      }
    });
    return { best, name };
  }

  function focusTasks() {
    return (State.data.focus.taskIds || [])
      .map((id) => State.task(id))
      .filter(Boolean);
  }

  function calendarHTML() {
    const today = Utils.todayKey();
    const start = Utils.addDays(Utils.startOfWeek(), -52 * 7);
    const weeks = 53;
    let activeDays = 0;

    const monthMarks = [];
    let previousMonth = -1;
    for (let week = 0; week < weeks; week++) {
      const monday = Utils.addDays(start, week * 7);
      if (monday.getMonth() !== previousMonth) {
        monthMarks.push({ start: week, label: Utils.MONTHS_SHORT[monday.getMonth()] });
        previousMonth = monday.getMonth();
      }
    }
    const months = monthMarks.map((mark, index) => {
      const end = index + 1 < monthMarks.length ? monthMarks[index + 1].start : weeks;
      return { ...mark, span: end - mark.start };
    }).filter((mark, index) => mark.span >= 2 || index === 0);

    let cells = '';
    for (let week = 0; week < weeks; week++) {
      for (let day = 0; day < 7; day++) {
        const date = Utils.addDays(start, week * 7 + day);
        const key = Utils.dateKey(date);
        const isFuture = key > today;
        const stats = isFuture ? null : Habits.completionForDate(key);
        const isEmpty = !isFuture && (!stats || stats.total === 0);
        const isToday = key === today;
        if (!isFuture && stats && stats.done > 0) activeDays++;

        let level = 0;
        if (!isFuture && stats && stats.total > 0) {
          level = stats.done > 0 ? Math.max(1, Math.ceil((stats.done / stats.total) * 4)) : 0;
        }

        const classes = [
          'cal-day',
          !isFuture && !isEmpty ? `level-${level}` : '',
          isFuture ? 'is-future' : '',
          isEmpty ? 'is-empty' : '',
          isToday ? 'is-today' : ''
        ].filter(Boolean).join(' ');

        const label = isFuture
          ? 'Data futura'
          : isEmpty
            ? `${Utils.formatMedium(key)} — nenhum hábito agendado`
            : `${Utils.formatMedium(key)} — ${stats.done} de ${stats.total} ${stats.total === 1 ? 'hábito' : 'hábitos'}`;

        const style = `grid-column:${week + 1};grid-row:${day + 1}`;

        if (!isFuture && !isEmpty) {
          cells += `<button type="button" class="${classes}" style="${style}" data-action="open-day" data-date="${key}" data-tip="${Utils.esc(label)}" aria-label="${Utils.esc(label)}"></button>`;
        } else {
          cells += `<span class="${classes}" style="${style}" data-tip="${Utils.esc(label)}" aria-hidden="true"></span>`;
        }
      }
    }

    const monthsHTML = months
      .map((mark) => `<span class="cal-month" style="grid-column:${mark.start + 1} / span ${mark.span}">${mark.label}</span>`)
      .join('');

    return {
      activeDays,
      html: `
        <div class="calendar-wrap" id="calendar-scroll">
          <div class="calendar">
            <div class="cal-months" aria-hidden="true">${monthsHTML}</div>
            <div class="cal-main">
              <div class="cal-weekday-labels" aria-hidden="true">
                <span class="cal-weekday">Seg</span><span></span>
                <span class="cal-weekday">Qua</span><span></span>
                <span class="cal-weekday">Sex</span><span></span><span></span>
              </div>
              <div class="cal-grid" role="group" aria-label="Calendário de contribuições dos últimos 12 meses">${cells}</div>
            </div>
          </div>
        </div>`
    };
  }

  function weekBarsHTML() {
    const days = Utils.lastNDays(7).map((key) => {
      const stats = Habits.completionForDate(key);
      return {
        key,
        date: Utils.parseKey(key),
        pct: stats.pct,
        empty: !stats.total,
        today: key === Utils.todayKey()
      };
    });

    return `
      <div class="week-bars" aria-hidden="true">
        ${days.map((day) => `
          <div class="week-col ${day.today ? 'is-today' : ''} ${day.empty ? 'is-empty' : ''}" title="${Utils.formatMedium(day.key)}: ${day.empty ? 'sem hábitos' : `${day.pct}% concluído`}">
            <div class="week-bar-track"><div class="week-bar" style="height:${Math.max(day.pct || 0, 3)}%"></div></div>
            <span class="week-lbl">${Utils.weekdayShort(day.date).slice(0, 3)}</span>
            <span class="week-pct">${day.empty ? '·' : `${day.pct}%`}</span>
          </div>`).join('')}
      </div>`;
  }

  function renderToday(items) {
    if (!items.length) {
      return `
        <div class="empty compact">
          <div class="empty-icon">${UI.icon('repeat')}</div>
          <p class="empty-title">Nenhum hábito para hoje</p>
          <p class="empty-text">Crie um hábito ou ajuste os dias de um hábito existente.</p>
          <button type="button" class="btn btn-ghost btn-sm" data-action="new-habit">${UI.icon('plus')} Novo hábito</button>
        </div>`;
    }

    return `
      <div class="today-list">
        ${items.map(({ habit, done, streak }) => `
          <label class="today-item ${done ? 'is-done' : ''}" style="--habit:${habit.color}">
            <input type="checkbox" class="check-input" data-action="toggle-habit" data-id="${habit.id}" data-date="${Utils.todayKey()}" data-focus-id="dash-habit-${habit.id}" ${done ? 'checked' : ''} aria-label="${done ? 'Desmarcar' : 'Concluir'} hábito: ${Utils.esc(habit.name)}">
            <span class="today-emoji" aria-hidden="true">${Utils.esc(habit.emoji)}</span>
            <span class="today-main">
              <span class="today-name">${Utils.esc(habit.name)}</span>
              <span class="today-meta">
                ${streak > 0
                  ? `<span class="streak-chip">${UI.icon('flame')}${streak} ${streak === 1 ? 'dia' : 'dias'}</span>`
                  : 'Sem sequência ativa'}
              </span>
            </span>
          </label>`).join('')}
      </div>`;
  }

  function renderFocus(focusList, active) {
    if (!focusList.length) {
      return `
        <div class="empty compact">
          <div class="empty-icon">${UI.icon('target')}</div>
          <p class="empty-title">Nada em foco ainda</p>
          <p class="empty-text">Escolha até 3 tarefas para dar clareza ao dia.</p>
          <button type="button" class="btn btn-ghost btn-sm" data-nav="tasks">Escolher tarefas</button>
        </div>`;
    }

    return `
      <div class="focus-list">
        ${focusList.map((task) => {
          const priority = Tasks.PRIORITIES[task.priority];
          return `
            <div class="focus-item ${task.done ? 'is-done' : ''}">
              <input type="checkbox" class="check-input" data-action="toggle-task" data-id="${task.id}" data-focus-id="dash-task-${task.id}" ${task.done ? 'checked' : ''} aria-label="${task.done ? 'Reabrir' : 'Concluir'} tarefa: ${Utils.esc(task.title)}">
              <span class="focus-title">${Utils.esc(task.title)}</span>
              <span class="badge ${priority.className}">${priority.label}</span>
            </div>`;
        }).join('')}
      </div>
      <div class="focus-cta">
        <span class="focus-cta-text">${active ? `Foco atual: ${Utils.esc(active.title)}` : 'Escolha uma tarefa para começar.'}</span>
        <button type="button" class="btn btn-primary btn-sm" data-action="start-focus">
          ${UI.icon('play')} Iniciar foco
        </button>
      </div>`;
  }

  function render() {
    const root = document.getElementById('view-dashboard');
    if (!root) return;

    const previousScroller = document.getElementById('calendar-scroll');
    const previousScroll = previousScroller ? previousScroller.scrollLeft : null;

    const today = Habits.todayStats();
    const week = Habits.rangeAdherence(7);
    const streak = streakSummary();
    const pending = State.data.tasks.filter((task) => !task.done);
    const overdue = pending.filter((task) => task.dueDate && task.dueDate < Utils.todayKey()).length;
    const sessions = State.data.pomodoro.sessions[Utils.todayKey()] || 0;
    const focusMinutes = sessions * State.data.settings.pomodoro.focus;
    const focusList = focusTasks();
    const active = State.task(State.data.focus.activeTaskId);
    const calendar = calendarHTML();

    const heroText = today.total === 0
      ? 'Nenhum hábito agendado para hoje. Aproveite para criar um ritual novo.'
      : today.done === today.total
        ? 'Todos os hábitos de hoje estão concluídos. Excelente trabalho! 🎉'
        : today.done === 0
          ? 'O dia está começando. Marque seu primeiro hábito e ganhe embalo.'
          : `Você já concluiu <strong>${today.done} de ${today.total}</strong> hábitos hoje. Continue nesse ritmo.`;

    root.innerHTML = `
      <section class="hero" aria-labelledby="hero-greeting">
        <div class="hero-copy">
          <span class="hero-date">${UI.icon('calendar')} ${Utils.formatLong()}</span>
          <h1 class="hero-greeting" id="hero-greeting">${Utils.greeting()}! 👋</h1>
          <p class="hero-text">${heroText}</p>
          <div class="hero-actions">
            <button type="button" class="btn btn-primary" data-action="new-habit">${UI.icon('plus')} Novo hábito</button>
            <button type="button" class="btn btn-ghost" data-action="open-task-modal">${UI.icon('check-square')} Nova tarefa</button>
          </div>
        </div>
        <div class="hero-side">
          <div class="hero-ring" role="img" aria-label="${today.done} de ${today.total} ${today.total === 1 ? 'hábito concluído' : 'hábitos concluídos'} hoje">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <defs>
                <linearGradient id="heroRingGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#a5b4fc"></stop>
                  <stop offset="100%" stop-color="#818cf8"></stop>
                </linearGradient>
              </defs>
              <circle class="ring-track" cx="60" cy="60" r="50"></circle>
              <circle class="ring-fill" cx="60" cy="60" r="50" stroke-dasharray="${HERO_CIRCUMFERENCE}" stroke-dashoffset="${HERO_CIRCUMFERENCE * (1 - today.pct / 100)}"></circle>
            </svg>
            <div class="hero-ring-text">
              <strong>${today.total ? `${today.pct}%` : '—'}</strong>
              <span>${today.total ? `${today.done} de ${today.total} hoje` : 'sem hábitos hoje'}</span>
            </div>
          </div>
        </div>
      </section>

      <div class="stats-grid">
        <article class="stat-card">
          <span class="stat-icon tone-flame">${UI.icon('flame')}</span>
          <div class="stat-content">
            <span class="stat-value">${streak.best} <small>${streak.best === 1 ? 'dia' : 'dias'}</small></span>
            <span class="stat-label">sequência atual</span>
            <span class="stat-extra">${streak.name ? Utils.esc(streak.name) : 'Comece sua primeira sequência'}</span>
          </div>
        </article>
        <article class="stat-card">
          <span class="stat-icon tone-blue">${UI.icon('check-square')}</span>
          <div class="stat-content">
            <span class="stat-value">${pending.length}</span>
            <span class="stat-label">tarefas pendentes</span>
            <span class="stat-extra">${overdue ? `${overdue} ${overdue === 1 ? 'atrasada' : 'atrasadas'}` : 'Nenhuma atrasada'}</span>
          </div>
        </article>
        <article class="stat-card">
          <span class="stat-icon tone-green">${UI.icon('timer')}</span>
          <div class="stat-content">
            <span class="stat-value">${sessions}</span>
            <span class="stat-label">${sessions === 1 ? 'sessão de foco hoje' : 'sessões de foco hoje'}</span>
            <span class="stat-extra">${Utils.formatMinutes(focusMinutes)} de foco</span>
          </div>
        </article>
        <article class="stat-card">
          <span class="stat-icon tone-accent">${UI.icon('chart')}</span>
          <div class="stat-content">
            <span class="stat-value">${week.pct}%</span>
            <span class="stat-label">aderência em 7 dias</span>
            <div class="progress"><span style="width:${week.pct}%"></span></div>
          </div>
        </article>
      </div>

      <div class="dash-cols">
        <div class="dash-col">
          <section class="card" aria-labelledby="today-title">
            <div class="card-head">
              <div>
                <h2 class="card-title" id="today-title">${UI.icon('repeat')} Hábitos de hoje</h2>
                <p class="card-sub">${today.total ? `${today.done} de ${today.total} concluídos` : 'Seus rituais aparecem aqui'}</p>
              </div>
              <button type="button" class="card-link" data-nav="habits">Ver hábitos ${UI.icon('chevron-right')}</button>
            </div>
            ${renderToday(today.items)}
          </section>

          <section class="card calendar-card" aria-labelledby="calendar-title">
            <div class="card-head">
              <div>
                <h2 class="card-title" id="calendar-title">${UI.icon('calendar')} Calendário de contribuições</h2>
                <p class="card-sub">Cada quadradinho é um dia de constância.</p>
              </div>
            </div>
            ${calendar.html}
            <div class="cal-footer">
              <span class="cal-summary"><strong>${calendar.activeDays}</strong> ${calendar.activeDays === 1 ? 'dia com registros' : 'dias com registros'} nos últimos 12 meses</span>
              <div class="cal-legend" aria-hidden="true">
                <span>Menos</span>
                <span class="legend-dot"></span>
                <span class="legend-dot level-1"></span>
                <span class="legend-dot level-2"></span>
                <span class="legend-dot level-3"></span>
                <span class="legend-dot level-4"></span>
                <span>Mais</span>
              </div>
            </div>
          </section>
        </div>

        <div class="dash-col">
          <section class="card" aria-labelledby="focus-title">
            <div class="card-head">
              <div>
                <h2 class="card-title" id="focus-title">${UI.icon('target')} Foco do Dia</h2>
                <p class="card-sub">${focusList.length} de 3 tarefas escolhidas</p>
              </div>
              <button type="button" class="card-link" data-nav="focus">Abrir foco ${UI.icon('chevron-right')}</button>
            </div>
            ${renderFocus(focusList, active)}
          </section>

          <section class="card" aria-labelledby="week-title">
            <div class="card-head">
              <div>
                <h2 class="card-title" id="week-title">${UI.icon('chart')} Seu ritmo</h2>
                <p class="card-sub">Conclusão dos últimos 7 dias.</p>
              </div>
              <button type="button" class="card-link" data-nav="stats">Estatísticas ${UI.icon('chevron-right')}</button>
            </div>
            ${weekBarsHTML()}
          </section>
        </div>
      </div>`;

    const scroller = document.getElementById('calendar-scroll');
    if (scroller) {
      scroller.scrollLeft = previousScroll != null ? previousScroll : scroller.scrollWidth;
    }
  }

  function dayContent(key) {
    const stats = Habits.completionForDate(key);
    if (!stats.total) {
      return `
        <div class="empty compact">
          <div class="empty-icon">${UI.icon('calendar')}</div>
          <p class="empty-title">Nenhum hábito agendado</p>
          <p class="empty-text">Não havia hábitos ativos previstos para este dia.</p>
        </div>`;
    }

    return `
      <p class="day-summary">${stats.done} de ${stats.total} ${stats.total === 1 ? 'hábito concluído' : 'hábitos concluídos'} neste dia. Ajustes retroativos são permitidos.</p>
      <div class="today-list">
        ${stats.habits.map((habit) => {
          const done = Habits.isDone(habit, key);
          return `
            <label class="today-item ${done ? 'is-done' : ''}" style="--habit:${habit.color}">
              <input type="checkbox" class="check-input" data-action="toggle-day-habit" data-id="${habit.id}" data-date="${key}" data-focus-id="day-${habit.id}" ${done ? 'checked' : ''} aria-label="${done ? 'Desmarcar' : 'Concluir'} ${Utils.esc(habit.name)} em ${Utils.formatMedium(key)}">
              <span class="today-emoji" aria-hidden="true">${Utils.esc(habit.emoji)}</span>
              <span class="today-main">
                <span class="today-name">${Utils.esc(habit.name)}</span>
                <span class="today-meta">${done ? 'Concluído' : 'Não concluído'}</span>
              </span>
            </label>`;
        }).join('')}
      </div>`;
  }

  function openDay(key) {
    if (!key || key > Utils.todayKey()) return;
    openDayKey = key;
    const date = Utils.parseKey(key);
    document.getElementById('day-dialog-title').textContent = Utils.formatLong(date);
    document.getElementById('day-content').innerHTML = dayContent(key);
    UI.openDialog(document.getElementById('day-dialog'));
  }

  function refreshDay(key) {
    if (!openDayKey || (key && key !== openDayKey)) return;
    const content = document.getElementById('day-content');
    if (content && document.getElementById('day-dialog').open) {
      content.innerHTML = dayContent(openDayKey);
    }
  }

  window.Dashboard = {
    render,
    openDay,
    refreshDay
  };
})();
