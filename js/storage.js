/* Persistência em LocalStorage com normalização e versionamento. */
(function () {
  'use strict';

  const KEY = 'fluxo:v1';
  const TIMER_KEY = 'fluxo:timer:v1';
  const VERSION = 1;
  const PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#f59e0b', '#10b981', '#14b8a6', '#0ea5e9', '#64748b'];
  const PRIORITIES = ['alta', 'media', 'baixa'];
  const THEMES = ['light', 'dark', 'system'];
  const MODES = ['focus', 'short', 'long'];

  const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const isDateKey = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const isColor = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  const num = (v, fallback, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Utils.clamp(Math.round(n), min, max) : fallback;
  };
  const str = (v, fallback = '', max = 120) => {
    if (typeof v !== 'string') return fallback;
    return v.trim().slice(0, max);
  };
  const safeId = (v, prefix) => {
    const clean = str(v, '', 80).replace(/[^A-Za-z0-9_-]/g, '');
    return clean || Utils.uid(prefix);
  };
  const safeEmoji = (v) => {
    const clean = str(v, '', 8).replace(/[<>&"']/g, '');
    return clean || '✅';
  };

  function defaults() {
    return {
      version: VERSION,
      settings: {
        theme: 'system',
        pomodoro: { focus: 25, short: 5, long: 15, rounds: 4 }
      },
      habits: [],
      tasks: [],
      focus: { date: Utils.todayKey(), taskIds: [], activeTaskId: null },
      pomodoro: { sessions: {} }
    };
  }

  function normalizeSettings(raw) {
    const settings = isObj(raw) ? raw : {};
    const pomo = isObj(settings.pomodoro) ? settings.pomodoro : {};
    return {
      theme: THEMES.includes(settings.theme) ? settings.theme : 'system',
      pomodoro: {
        focus: num(pomo.focus, 25, 1, 120),
        short: num(pomo.short, 5, 1, 60),
        long: num(pomo.long, 15, 1, 120),
        rounds: num(pomo.rounds, 4, 2, 12)
      }
    };
  }

  function normalizeHabit(raw, index, seenIds = new Set()) {
    const h = isObj(raw) ? raw : {};
    const days = Array.isArray(h.days)
      ? [...new Set(h.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
      : [0, 1, 2, 3, 4, 5, 6];
    const log = {};
    if (isObj(h.log)) {
      Object.keys(h.log).forEach((key) => {
        if (isDateKey(key) && h.log[key]) log[key] = true;
      });
    }
    let id = safeId(h.id, 'habit');
    if (seenIds.has(id)) id = Utils.uid('habit');
    seenIds.add(id);
    return {
      id,
      name: str(h.name, 'Hábito', 60),
      emoji: safeEmoji(h.emoji),
      color: isColor(h.color) ? h.color : PALETTE[index % PALETTE.length],
      days: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
      createdAt: isDateKey(h.createdAt) ? h.createdAt : Utils.todayKey(),
      archived: Boolean(h.archived),
      log
    };
  }

  function normalizeTask(raw, seenIds = new Set()) {
    const t = isObj(raw) ? raw : {};
    let id = safeId(t.id, 'task');
    if (seenIds.has(id)) id = Utils.uid('task');
    seenIds.add(id);
    return {
      id,
      title: str(t.title, 'Tarefa', 120),
      priority: PRIORITIES.includes(t.priority) ? t.priority : 'media',
      dueDate: isDateKey(t.dueDate) ? t.dueDate : '',
      done: Boolean(t.done),
      createdAt: Number.isFinite(t.createdAt) ? t.createdAt : Date.now(),
      completedAt: Number.isFinite(t.completedAt) ? t.completedAt : null
    };
  }

  function normalizeFocus(raw, tasks) {
    const f = isObj(raw) ? raw : {};
    const validIds = new Set(tasks.filter((t) => !t.done).map((t) => t.id));
    let taskIds = Array.isArray(f.taskIds) ? [...new Set(f.taskIds.filter((id) => validIds.has(id)))].slice(0, 3) : [];
    let activeTaskId = typeof f.activeTaskId === 'string' && validIds.has(f.activeTaskId) ? f.activeTaskId : null;
    if (!activeTaskId && taskIds.length) activeTaskId = taskIds[0];
    return {
      date: isDateKey(f.date) ? f.date : Utils.todayKey(),
      taskIds,
      activeTaskId
    };
  }

  function normalizeSessions(raw) {
    const out = {};
    if (!isObj(raw)) return out;
    Object.keys(raw).forEach((key) => {
      if (isDateKey(key)) {
        const value = Math.max(0, Math.round(Number(raw[key]) || 0));
        if (value > 0) out[key] = value;
      }
    });
    return out;
  }

  function normalize(raw) {
    const base = defaults();
    if (!isObj(raw)) return base;
    const habitIds = new Set();
    const taskIds = new Set();
    const habits = Array.isArray(raw.habits) ? raw.habits.slice(0, 300).map((habit, index) => normalizeHabit(habit, index, habitIds)) : [];
    const tasks = Array.isArray(raw.tasks) ? raw.tasks.slice(0, 2000).map((task) => normalizeTask(task, taskIds)) : [];
    return {
      version: VERSION,
      settings: normalizeSettings(raw.settings),
      habits,
      tasks,
      focus: normalizeFocus(raw.focus, tasks),
      pomodoro: { sessions: normalizeSessions(isObj(raw.pomodoro) ? raw.pomodoro.sessions : null) }
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const parsed = JSON.parse(raw);
      return normalize(parsed);
    } catch (err) {
      console.warn('[Fluxo] Não foi possível ler os dados salvos.', err);
      return defaults();
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.warn('[Fluxo] Falha ao salvar localmente.', err);
      return false;
    }
  }

  function loadTimer() {
    try {
      const raw = localStorage.getItem(TIMER_KEY);
      if (!raw) return null;
      const rt = JSON.parse(raw);
      if (!isObj(rt)) return null;
      return {
        mode: MODES.includes(rt.mode) ? rt.mode : 'focus',
        running: Boolean(rt.running),
        endsAt: Number.isFinite(rt.endsAt) ? rt.endsAt : 0,
        remaining: Math.max(0, Number(rt.remaining) || 0),
        cycle: Math.max(0, Math.round(Number(rt.cycle) || 0))
      };
    } catch (err) {
      return null;
    }
  }

  function saveTimer(runtime) {
    try {
      localStorage.setItem(TIMER_KEY, JSON.stringify(runtime));
    } catch (err) {
      /* silencioso: o timer continua funcionando em memória */
    }
  }

  function isValidImport(raw) {
    return isObj(raw) && (Array.isArray(raw.habits) || Array.isArray(raw.tasks));
  }

  function clear() {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(TIMER_KEY);
    } catch (err) {
      /* ignore */
    }
  }

  window.Storage = {
    KEY, TIMER_KEY, VERSION, PALETTE, defaults, normalize,
    load, save, loadTimer, saveTimer, isValidImport, clear
  };
})();
