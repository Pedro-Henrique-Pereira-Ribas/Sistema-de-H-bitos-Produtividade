/* Orquestrador: rotas, tema, eventos globais, ajustes e dados de exemplo. */
(function () {
  'use strict';

  const VIEWS = ['dashboard', 'habits', 'tasks', 'focus', 'stats'];
  const VIEW_META = {
    dashboard: ['Visão geral', 'Seu dia em um só lugar'],
    habits: ['Hábitos', 'Construa rituais que duram'],
    tasks: ['Tarefas', 'Clareza para o que importa'],
    focus: ['Foco', 'Trabalhe em uma coisa de cada vez'],
    stats: ['Estatísticas', 'Seu progresso ao longo do tempo']
  };
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const App = {
    currentView: 'dashboard',
    today: Utils.todayKey(),
    lastStorageError: false
  };

  function resolvedTheme() {
    const preference = State.data.settings.theme;
    if (preference === 'system') return mediaQuery.matches ? 'dark' : 'light';
    return preference === 'dark' ? 'dark' : 'light';
  }

  function applyTheme() {
    const resolved = resolvedTheme();
    document.documentElement.dataset.theme = resolved;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0c0e15' : '#f4f5fb');
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.innerHTML = UI.icon(resolved === 'dark' ? 'sun' : 'moon');
      toggle.setAttribute('aria-label', resolved === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro');
      toggle.title = resolved === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro';
    }
  }

  function toggleTheme() {
    const preference = State.data.settings.theme;
    let next;
    if (preference === 'system') {
      next = resolvedTheme() === 'dark' ? 'light' : 'dark';
    } else {
      next = preference === 'dark' ? 'light' : 'dark';
    }
    State.update(() => {
      State.data.settings.theme = next;
    }, { silent: true });
    applyTheme();
    renderCurrentView();
  }

  function updateNav(view) {
    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach((button) => {
      if (button.dataset.nav === view) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    const meta = VIEW_META[view];
    const title = document.getElementById('topbar-title');
    const sub = document.getElementById('topbar-sub');
    if (title && meta) title.textContent = meta[0];
    if (sub && meta) sub.textContent = meta[1];
  }

  function updateNavBadges() {
    const count = Tasks.pendingCount();
    document.querySelectorAll('[data-badge="tasks"]').forEach((badge) => {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    });
  }

  function renderCurrentView() {
    const active = document.activeElement;
    const focusId = active && active.closest ? active.closest('[data-focus-id]')?.dataset.focusId : null;

    switch (App.currentView) {
      case 'habits':
        Habits.render();
        break;
      case 'tasks':
        Tasks.render();
        break;
      case 'focus':
        Pomodoro.render();
        break;
      case 'stats':
        Stats.render();
        break;
      default:
        Dashboard.render();
    }

    updateNavBadges();

    if (focusId) {
      const escaped = window.CSS && CSS.escape ? CSS.escape(focusId) : focusId.replace(/"/g, '\\"');
      const target = document.querySelector(`[data-focus-id="${escaped}"]`);
      if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
    }
  }

  function navigateTo(view, updateHash = true) {
    const safe = VIEWS.includes(view) ? view : 'dashboard';
    App.currentView = safe;
    document.querySelectorAll('.view').forEach((section) => {
      section.hidden = section.id !== `view-${safe}`;
    });
    updateNav(safe);
    renderCurrentView();
    if (updateHash) {
      if (location.hash !== `#${safe}`) location.hash = safe;
    } else {
      try {
        history.replaceState(null, '', `#${safe}`);
      } catch (err) {
        /* file:// em alguns navegadores antigos */
      }
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
    const main = document.getElementById('main');
    if (main) main.focus({ preventScroll: true });
  }

  function checkNewDay() {
    const today = Utils.todayKey();
    if (today === App.today) return false;
    App.today = today;
    State.ensureToday();
    State.pruneFocus();
    State.saveNow();
    renderCurrentView();
    UI.toast('Novo dia começou. Um passo de cada vez. 🌅', 'info', 5000);
    return true;
  }

  function openSettings() {
    const settings = State.data.settings;
    document.getElementById('settings-theme').value = settings.theme;
    document.getElementById('settings-focus').value = settings.pomodoro.focus;
    document.getElementById('settings-short').value = settings.pomodoro.short;
    document.getElementById('settings-long').value = settings.pomodoro.long;
    document.getElementById('settings-rounds').value = settings.pomodoro.rounds;
    UI.openDialog(document.getElementById('settings-dialog'));
  }

  function saveSettings(form) {
    const data = new FormData(form);
    const theme = ['system', 'light', 'dark'].includes(String(data.get('theme'))) ? String(data.get('theme')) : 'system';
    const focus = Utils.clamp(parseInt(data.get('focusMin'), 10) || 25, 1, 120);
    const short = Utils.clamp(parseInt(data.get('shortMin'), 10) || 5, 1, 60);
    const long = Utils.clamp(parseInt(data.get('longMin'), 10) || 15, 1, 120);
    const rounds = Utils.clamp(parseInt(data.get('rounds'), 10) || 4, 2, 12);

    State.data.settings.theme = theme;
    State.data.settings.pomodoro = { focus, short, long, rounds };
    State.save();
    applyTheme();
    if (window.Pomodoro) Pomodoro.settingsChanged();
    UI.closeDialog(document.getElementById('settings-dialog'));
    renderCurrentView();
    UI.toast('Ajustes salvos.');
  }

  function exportData() {
    State.saveNow();
    const payload = {
      app: 'fluxo',
      exportedAt: new Date().toISOString(),
      version: Storage.VERSION,
      settings: State.data.settings,
      habits: State.data.habits,
      tasks: State.data.tasks,
      focus: State.data.focus,
      pomodoro: State.data.pomodoro
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `fluxo-backup-${Utils.todayKey()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    UI.toast('Backup exportado.');
  }

  function buildDemo() {
    const dayKey = (offset) => Utils.dateKey(Utils.addDays(new Date(), offset));
    const definitions = [
      { name: 'Beber 2L de água', emoji: '💧', color: '#0ea5e9', days: [0, 1, 2, 3, 4, 5, 6], chance: 0.86, since: 75 },
      { name: 'Ler 20 páginas', emoji: '📚', color: '#8b5cf6', days: [0, 1, 2, 3, 4, 5, 6], chance: 0.72, since: 60 },
      { name: 'Exercitar-se', emoji: '🏋️', color: '#f97316', days: [1, 3, 5], chance: 0.7, since: 80 },
      { name: 'Meditar 10 min', emoji: '🧘', color: '#10b981', days: [0, 1, 2, 3, 4, 5, 6], chance: 0.6, since: 45 }
    ];

    const habits = definitions.map((definition) => {
      const habit = {
        id: Utils.uid('hab'),
        name: definition.name,
        emoji: definition.emoji,
        color: definition.color,
        days: definition.days,
        createdAt: dayKey(-definition.since),
        archived: false,
        log: {}
      };
      for (let offset = -definition.since; offset <= 0; offset++) {
        const date = Utils.addDays(new Date(), offset);
        if (definition.days.includes(date.getDay()) && Math.random() < definition.chance) {
          habit.log[Utils.dateKey(date)] = true;
        }
      }
      return habit;
    });

    const water = habits[0];
    const reading = habits[1];
    const exercise = habits[2];
    const meditation = habits[3];
    for (let offset = -6; offset <= 0; offset++) water.log[dayKey(offset)] = true;
    for (let offset = -2; offset <= 0; offset++) reading.log[dayKey(offset)] = true;
    exercise.log[dayKey(-2)] = true;
    exercise.log[dayKey(0)] = true;
    delete meditation.log[dayKey(0)];

    const now = Date.now();
    const task = (title, priority, dueOffset, done, completedOffset) => ({
      id: Utils.uid('task'),
      title,
      priority,
      dueDate: dueOffset == null ? '' : dayKey(dueOffset),
      done,
      createdAt: now - 3 * 24 * 60 * 60 * 1000,
      completedAt: done && completedOffset != null ? now - completedOffset * 24 * 60 * 60 * 1000 : null
    });

    const tasks = [
      task('Finalizar o relatório mensal', 'alta', 0, false),
      task('Estudar 30 min de JavaScript', 'media', 1, false),
      task('Revisar as metas da semana', 'alta', -1, true, 1.5),
      task('Organizar a mesa de trabalho', 'baixa', 3, false),
      task('Responder os e-mails importantes', 'media', 0, false),
      task('Caminhar 20 minutos', 'baixa', -2, true, 2.4)
    ];

    const focusIds = tasks.filter((item) => !item.done).slice(0, 3).map((item) => item.id);
    const sessions = {};
    [2, 0, 3, 1, 2, 4, 2].forEach((count, index) => {
      const key = dayKey(index - 6);
      if (count) sessions[key] = count;
    });

    return {
      version: Storage.VERSION,
      settings: JSON.parse(JSON.stringify(State.data.settings)),
      habits,
      tasks,
      focus: {
        date: Utils.todayKey(),
        taskIds: focusIds,
        activeTaskId: focusIds[0] || null
      },
      pomodoro: { sessions }
    };
  }

  async function loadDemo() {
    const hasData = State.data.habits.length > 0 || State.data.tasks.length > 0 || Object.keys(State.data.pomodoro.sessions).length > 0;
    if (hasData) {
      const ok = await UI.confirm({
        title: 'Substituir seus dados?',
        message: 'Os dados atuais serão trocados pelos dados de exemplo. Se quiser guardar seu histórico, exporte um backup antes.',
        confirmLabel: 'Carregar exemplo',
        danger: true
      });
      if (!ok) return;
    }
    UI.closeDialog(document.getElementById('settings-dialog'));
    State.replace(buildDemo());
    Pomodoro.restartAll();
    applyTheme();
    navigateTo('dashboard');
    UI.toast('Dados de exemplo carregados. Explore à vontade!', 'info', 4200);
  }

  async function importFile(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      if (!Storage.isValidImport(raw)) {
        UI.toast('Arquivo inválido: não encontrei hábitos ou tarefas no JSON.', 'error', 5000);
        return;
      }
      const ok = await UI.confirm({
        title: 'Importar backup?',
        message: 'Os dados atuais serão substituídos pelo conteúdo do arquivo importado.',
        confirmLabel: 'Importar e substituir',
        danger: true
      });
      if (!ok) return;
      State.replace(raw);
      Pomodoro.restartAll();
      applyTheme();
      UI.closeDialog(document.getElementById('settings-dialog'));
      navigateTo('dashboard');
      UI.toast('Backup importado com sucesso.');
    } catch (err) {
      console.warn('[Fluxo] Falha ao importar.', err);
      UI.toast('Não foi possível ler o arquivo. Verifique se é um JSON válido.', 'error', 5000);
    }
  }

  async function resetAll() {
    const ok = await UI.confirm({
      title: 'Apagar todos os dados?',
      message: 'Hábitos, tarefas, sequências e sessões serão removidos deste navegador. Essa ação não pode ser desfeita.',
      confirmLabel: 'Apagar tudo',
      danger: true
    });
    if (!ok) return;
    Storage.clear();
    State.reset();
    Pomodoro.restartAll();
    applyTheme();
    UI.closeDialog(document.getElementById('settings-dialog'));
    navigateTo('dashboard');
    UI.toast('Tudo apagado. Você está começando do zero.', 'info');
  }

  function startFocus() {
    navigateTo('focus');
    Pomodoro.startFocus();
  }

  const actions = {
    'nav': (el) => navigateTo(el.dataset.nav),
    'theme-toggle': toggleTheme,
    'open-settings': openSettings,
    'close-dialog': (el) => {
      const dialog = el.closest('dialog');
      if (dialog) dialog.close();
    },
    'new-habit': () => Habits.openForm(),
    'edit-habit': (el) => Habits.openForm(el.dataset.id),
    'delete-habit': (el) => Habits.confirmDelete(el.dataset.id),
    'toggle-archive': (el) => Habits.toggleArchive(el.dataset.id),
    'toggle-archived-list': () => Habits.toggleArchivedList(),
    'toggle-habit-today': (el) => Habits.toggle(el.dataset.id),
    'toggle-habit-date': (el) => Habits.toggle(el.dataset.id, el.dataset.date),
    'open-task-modal': () => Tasks.openForm(),
    'edit-task': (el) => Tasks.openForm(el.dataset.id),
    'delete-task': (el) => Tasks.confirmDelete(el.dataset.id),
    'toggle-focus-task': (el) => Tasks.toggleFocus(el.dataset.id),
    'task-filter': (el) => Tasks.setFilter(el.dataset.filter),
    'pomo-toggle': () => Pomodoro.toggle(),
    'pomo-reset': () => Pomodoro.reset(),
    'pomo-skip': () => Pomodoro.skip(),
    'pomo-mode': (el) => Pomodoro.setMode(el.dataset.mode),
    'open-day': (el) => Dashboard.openDay(el.dataset.date),
    'start-focus': startFocus,
    'export-data': exportData,
    'import-data': () => document.getElementById('import-file').click(),
    'load-demo': loadDemo,
    'reset-data': resetAll
  };

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const navEl = event.target.closest('[data-nav]');
      if (navEl) {
        event.preventDefault();
        navigateTo(navEl.dataset.nav);
        return;
      }
      const el = event.target.closest('[data-action]');
      if (!el || el.matches('input, select, textarea')) return;
      const handler = actions[el.dataset.action];
      if (handler) handler(el, event);
    });

    document.addEventListener('change', (event) => {
      const el = event.target;
      const action = el.dataset.action;
      if (action === 'toggle-habit') {
        Habits.toggle(el.dataset.id, el.dataset.date);
      } else if (action === 'toggle-task') {
        Tasks.toggle(el.dataset.id);
      } else if (action === 'toggle-day-habit') {
        Habits.toggle(el.dataset.id, el.dataset.date);
        Dashboard.refreshDay(el.dataset.date);
      } else if (action === 'set-active-focus') {
        Pomodoro.setActiveTask(el.value);
      }
    });

    document.addEventListener('submit', (event) => {
      const form = event.target;
      // Um campo chamado "id" sombreia form.id, então lemos o atributo diretamente.
      const formId = form.getAttribute('id');
      if (formId === 'habit-form') {
        event.preventDefault();
        Habits.saveForm(form);
      } else if (formId === 'task-form') {
        event.preventDefault();
        Tasks.saveForm(form);
      } else if (formId === 'quick-task-form') {
        event.preventDefault();
        Tasks.quickAdd(form);
      } else if (formId === 'settings-form') {
        event.preventDefault();
        saveSettings(form);
      }
    });

    document.getElementById('import-file').addEventListener('change', (event) => {
      importFile(event.target);
    });

    let calendarPinned = true;
    document.addEventListener('scroll', (event) => {
      const el = event.target;
      if (el && el.id === 'calendar-scroll') {
        calendarPinned = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      }
    }, true);
    window.addEventListener('resize', () => {
      const el = document.getElementById('calendar-scroll');
      if (el && calendarPinned) el.scrollLeft = el.scrollWidth;
    });

    window.addEventListener('hashchange', () => {
      const view = location.hash.replace(/^#\/?/, '');
      if (view !== App.currentView) navigateTo(view, false);
    });

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', () => {
        if (State.data.settings.theme === 'system') {
          applyTheme();
          renderCurrentView();
        }
      });
    }

    window.addEventListener('beforeunload', () => State.saveNow());

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkNewDay();
    });
  }

  function init() {
    State.init();
    UI.init();
    Habits.init();
    Tasks.init();
    Pomodoro.init();
    Stats.init();
    State.onSaveError = () => {
      if (App.lastStorageError) return;
      App.lastStorageError = true;
      UI.toast('Não foi possível salvar no navegador. Verifique o espaço livre ou o modo privado.', 'error', 6500);
      setTimeout(() => { App.lastStorageError = false; }, 10000);
    };

    applyTheme();
    bindEvents();
    State.subscribe(() => {
      renderCurrentView();
    });

    const initial = location.hash.replace(/^#\/?/, '');
    navigateTo(initial, false);

    setInterval(() => {
      checkNewDay();
    }, 30000);
  }

  window.App = App;
  init();
})();
