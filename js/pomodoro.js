/* Pomodoro persistente, com ciclos, som e vínculo ao Foco do Dia. */
(function () {
  'use strict';

  const MODE_LABEL = { focus: 'Foco', short: 'Pausa curta', long: 'Pausa longa' };
  const CIRCUMFERENCE = 2 * Math.PI * 96;

  let runtime = { mode: 'focus', running: false, endsAt: 0, remaining: 25 * 60 * 1000, cycle: 0 };
  let tickHandle = null;
  let lastSecond = null;
  let audioCtx = null;
  let els = null;

  function settings() {
    return State.data.settings.pomodoro;
  }

  function durationFor(mode) {
    const p = settings();
    const minutes = mode === 'short' ? p.short : mode === 'long' ? p.long : p.focus;
    return minutes * 60 * 1000;
  }

  function remainingNow() {
    if (runtime.running) return Math.max(0, runtime.endsAt - Date.now());
    return Math.max(0, runtime.remaining);
  }

  function sessionsToday() {
    return State.data.pomodoro.sessions[Utils.todayKey()] || 0;
  }

  function activeTask() {
    const focus = State.data.focus;
    if (!focus || !focus.activeTaskId) return null;
    const task = State.task(focus.activeTaskId);
    return task && !task.done ? task : null;
  }

  function persist() {
    Storage.saveTimer({
      mode: runtime.mode,
      running: runtime.running,
      endsAt: runtime.endsAt,
      remaining: runtime.remaining,
      cycle: runtime.cycle
    });
  }

  function ensureAudio() {
    if (audioCtx) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    } catch (err) {
      audioCtx = null;
    }
  }

  function beep() {
    if (!audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const start = audioCtx.currentTime;
      [880, 1174.66].forEach((freq, index) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const at = start + index * 0.19;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, at);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.16, at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.17);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(at);
        osc.stop(at + 0.2);
      });
    } catch (err) {
      /* áudio é opcional */
    }
  }

  function startTick() {
    stopTick();
    tickHandle = setInterval(tick, 250);
    tick();
  }

  function stopTick() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
    lastSecond = null;
  }

  function tick() {
    if (!runtime.running) return;
    const remaining = runtime.endsAt - Date.now();
    if (remaining <= 0) {
      runtime.remaining = 0;
      finish(false);
      return;
    }
    const second = Math.ceil(remaining / 1000);
    if (second !== lastSecond) {
      lastSecond = second;
      updateDisplay();
    }
  }

  function start() {
    if (runtime.running) return;
    ensureAudio();
    const total = durationFor(runtime.mode);
    if (runtime.remaining <= 0 || runtime.remaining > total) runtime.remaining = total;
    runtime.running = true;
    runtime.endsAt = Date.now() + runtime.remaining;
    persist();
    startTick();
    updateDisplay();
  }

  function pause() {
    if (!runtime.running) return;
    runtime.remaining = Math.max(0, runtime.endsAt - Date.now());
    runtime.running = false;
    runtime.endsAt = 0;
    persist();
    stopTick();
    updateDisplay();
    if (document.title.includes('— Fluxo')) {
      document.title = 'Fluxo — Hábitos e Produtividade';
    }
  }

  function toggle() {
    if (runtime.running) pause();
    else start();
  }

  function reset() {
    runtime.running = false;
    runtime.endsAt = 0;
    runtime.remaining = durationFor(runtime.mode);
    persist();
    stopTick();
    updateDisplay();
  }

  function setMode(mode) {
    if (!MODE_LABEL[mode]) return;
    runtime.running = false;
    runtime.endsAt = 0;
    runtime.mode = mode;
    if (mode === 'focus' && runtime.cycle >= settings().rounds) runtime.cycle = 0;
    runtime.remaining = durationFor(mode);
    persist();
    stopTick();
    updateDisplay();
    renderMeta();
  }

  function skip() {
    const previous = runtime.mode;
    runtime.running = false;
    runtime.endsAt = 0;
    if (previous === 'long') runtime.cycle = 0;
    runtime.mode = previous === 'focus' ? 'short' : 'focus';
    runtime.remaining = durationFor(runtime.mode);
    persist();
    stopTick();
    updateDisplay();
    renderMeta();
    UI.toast('Ciclo pulado.', 'info');
  }

  function startFocus() {
    if (runtime.running && runtime.mode === 'focus') return;
    if (runtime.mode !== 'focus') {
      runtime.running = false;
      runtime.endsAt = 0;
      setMode('focus');
    }
    start();
  }

  function isRunning() {
    return runtime.running;
  }

  function settingsChanged() {
    const total = durationFor(runtime.mode);
    if (!runtime.running) runtime.remaining = total;
    persist();
    updateDisplay();
    renderMeta();
  }

  function restartAll() {
    stopTick();
    runtime = {
      mode: 'focus',
      running: false,
      endsAt: 0,
      remaining: durationFor('focus'),
      cycle: 0
    };
    persist();
    updateDisplay();
    renderMeta();
  }

  function finish(restored) {
    const previous = runtime.mode;
    runtime.running = false;
    runtime.endsAt = 0;
    stopTick();

    let next = 'focus';
    let message = 'Pausa concluída. Pronto para focar?';

    if (previous === 'focus') {
      runtime.cycle += 1;
      const rounds = settings().rounds;
      next = runtime.cycle >= rounds ? 'long' : 'short';
      message = next === 'long'
        ? 'Ciclo completo! Hora de uma pausa longa. 🎉'
        : 'Sessão de foco concluída! Faça uma pausa. 🎉';
    } else if (previous === 'long') {
      runtime.cycle = 0;
    }

    runtime.mode = next;
    runtime.remaining = durationFor(next);
    const autoStart = previous === 'focus' && !restored;
    if (autoStart) {
      runtime.running = true;
      runtime.endsAt = Date.now() + runtime.remaining;
    }

    if (previous === 'focus') {
      const key = Utils.todayKey();
      State.update((state) => {
        state.pomodoro.sessions[key] = (state.pomodoro.sessions[key] || 0) + 1;
      });
    }

    persist();
    if (autoStart) startTick();
    updateDisplay();
    renderMeta();

    if (!restored) beep();
    const prefix = restored ? 'Você ficou fora e a sessão terminou. ' : '';
    UI.toast(prefix + message, 'success', 5000);
  }

  function sync() {
    if (!runtime.running) {
      updateDisplay();
      return;
    }
    if (Date.now() >= runtime.endsAt) {
      runtime.remaining = 0;
      finish(true);
    } else {
      updateDisplay();
    }
  }

  function setActiveTask(id) {
    Tasks.setActiveFocus(id);
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function renderMeta() {
    if (!els) return;
    const sessions = sessionsToday();
    const minutes = sessions * settings().focus;
    const rounds = settings().rounds;
    if (els.sessions) {
      els.sessions.innerHTML = `Hoje: <strong>${sessions} ${sessions === 1 ? 'sessão' : 'sessões'}</strong>`;
    }
    if (els.minutes) {
      els.minutes.textContent = `${Utils.formatMinutes(minutes)} de foco`;
    }
    if (els.dots) {
      const count = Math.min(runtime.cycle, rounds);
      els.dots.innerHTML = Array.from({ length: rounds }, (_, index) => (
        `<span class="pomo-dot ${index < count ? 'is-done' : ''}"></span>`
      )).join('');
      els.dots.setAttribute('aria-label', `${count} de ${rounds} rodadas concluídas neste ciclo`);
    }
    if (els.cycle) els.cycle.textContent = `${Math.min(runtime.cycle + 1, rounds)}/${rounds}`;
  }

  function updateDisplay() {
    if (!els || !document.body.contains(els.time)) return;

    const remaining = remainingNow();
    const total = durationFor(runtime.mode);
    const progress = total ? Utils.clamp(remaining / total, 0, 1) : 0;
    const timeText = formatTime(remaining);

    if (els.time.textContent !== timeText) {
      els.time.textContent = timeText;
      els.time.setAttribute('aria-label', `Tempo restante: ${timeText.replace(':', ' minutos e ')} segundos`);
    }
    if (els.ring) {
      els.ring.setAttribute('stroke-dasharray', String(CIRCUMFERENCE));
      els.ring.setAttribute('stroke-dashoffset', String(CIRCUMFERENCE * (1 - progress)));
    }
    if (els.modeLabel) els.modeLabel.textContent = MODE_LABEL[runtime.mode];
    if (els.task) {
      const task = activeTask();
      els.task.textContent = task ? task.title : 'Sem tarefa vinculada';
      els.task.title = task ? task.title : '';
    }
    if (els.card) els.card.classList.toggle('is-break', runtime.mode !== 'focus');
    if (els.modes) {
      els.modes.querySelectorAll('[data-mode]').forEach((button) => {
        const active = button.dataset.mode === runtime.mode;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    }
    if (els.toggle) {
      const wasFocused = document.activeElement === els.toggle;
      els.toggle.innerHTML = `${UI.icon(runtime.running ? 'pause' : 'play')}<span>${runtime.running ? 'Pausar' : remaining < total ? 'Retomar' : 'Iniciar'}</span>`;
      if (wasFocused) els.toggle.focus({ preventScroll: true });
      els.toggle.setAttribute('aria-label', runtime.running ? 'Pausar o timer' : 'Iniciar o timer');
    }

    document.title = runtime.running
      ? `${timeText} · ${MODE_LABEL[runtime.mode]} — Fluxo`
      : 'Fluxo — Hábitos e Produtividade';
  }

  function renderTasksSide() {
    const focus = State.data.focus;
    const tasks = (focus.taskIds || [])
      .map((id) => State.task(id))
      .filter((task) => task && !task.done);

    if (!tasks.length) {
      return `
        <div class="empty compact">
          <div class="empty-icon">${UI.icon('target')}</div>
          <p class="empty-title">Nenhuma tarefa em foco</p>
          <p class="empty-text">Escolha até 3 tarefas na lista para dar clareza ao seu dia.</p>
          <button type="button" class="btn btn-ghost btn-sm" data-nav="tasks">Escolher tarefas</button>
        </div>`;
    }

    return `
      <div class="focus-select">
        ${tasks.map((task) => {
          const active = focus.activeTaskId === task.id;
          const priority = Tasks.PRIORITIES[task.priority];
          return `
            <label class="focus-select-item ${active ? 'is-active' : ''}">
              <input type="radio" class="focus-radio" name="pomo-task" value="${task.id}" data-action="set-active-focus" ${active ? 'checked' : ''}>
              <span class="focus-select-title">${Utils.esc(task.title)}</span>
              <span class="badge ${priority.className}">${priority.label}</span>
            </label>`;
        }).join('')}
      </div>`;
  }

  function render() {
    const root = document.getElementById('view-focus');
    if (!root) return;

    const task = activeTask();
    const sessions = sessionsToday();
    const minutes = sessions * settings().focus;
    const rounds = settings().rounds;
    const cycle = Math.min(runtime.cycle, rounds);
    els = null;

    root.innerHTML = `
      <div class="view-head">
        <div>
          <h1 class="view-title">Foco</h1>
          <p class="view-sub">Uma coisa de cada vez. O Pomodoro cuida do ritmo.</p>
        </div>
      </div>

      <div class="focus-grid">
        <section class="card pomo-card ${runtime.mode !== 'focus' ? 'is-break' : ''}" id="pomo-card" aria-label="Timer Pomodoro">
          <div class="pomo-modes" role="group" aria-label="Modo do Pomodoro" id="pomo-modes">
            ${Object.entries(MODE_LABEL).map(([mode, label]) => `
              <button type="button" class="pomo-mode ${runtime.mode === mode ? 'is-active' : ''}" data-action="pomo-mode" data-mode="${mode}" aria-pressed="${runtime.mode === mode}">${label}</button>`).join('')}
          </div>

          <div class="pomo-dial">
            <svg class="pomo-svg" viewBox="0 0 220 220" aria-hidden="true" focusable="false">
              <defs>
                <linearGradient id="pomoGradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#a5b4fc"></stop>
                  <stop offset="100%" stop-color="#6366f1"></stop>
                </linearGradient>
              </defs>
              <circle class="pomo-track" cx="110" cy="110" r="96"></circle>
              <circle class="pomo-progress" id="pomo-ring" cx="110" cy="110" r="96" stroke-dasharray="${CIRCUMFERENCE}" stroke-dashoffset="0"></circle>
            </svg>
            <div class="pomo-center">
              <span class="pomo-time" id="pomo-time" role="timer" aria-live="off">${formatTime(remainingNow())}</span>
              <span class="pomo-mode-label" id="pomo-mode-label">${MODE_LABEL[runtime.mode]}</span>
              <span class="pomo-task" id="pomo-task">${task ? Utils.esc(task.title) : 'Sem tarefa vinculada'}</span>
            </div>
          </div>

          <div class="pomo-controls">
            <button type="button" class="icon-btn" data-action="pomo-reset" aria-label="Reiniciar timer" title="Reiniciar">${UI.icon('rotate')}</button>
            <button type="button" class="btn btn-primary" id="pomo-toggle" data-action="pomo-toggle">
              ${UI.icon(runtime.running ? 'pause' : 'play')}<span>${runtime.running ? 'Pausar' : 'Iniciar'}</span>
            </button>
            <button type="button" class="icon-btn" data-action="pomo-skip" aria-label="Pular para o próximo ciclo" title="Pular ciclo">${UI.icon('skip')}</button>
          </div>

          <div class="pomo-meta">
            <span id="pomo-sessions">Hoje: <strong>${sessions} ${sessions === 1 ? 'sessão' : 'sessões'}</strong></span>
            <span class="pomo-dots" id="pomo-dots" aria-label="${cycle} de ${rounds} rodadas concluídas neste ciclo"></span>
            <span id="pomo-minutes">${Utils.formatMinutes(minutes)} de foco</span>
            <span>Rodada <strong id="pomo-cycle">${cycle}/${rounds}</strong></span>
          </div>
        </section>

        <aside class="focus-side">
          <section class="card">
            <div class="card-head">
              <div>
                <h2 class="card-title">${UI.icon('target')} Foco do Dia</h2>
                <p class="card-sub">Até 3 tarefas para manter o rumo.</p>
              </div>
              <button type="button" class="card-link" data-nav="tasks">Gerenciar ${UI.icon('chevron-right')}</button>
            </div>
            ${renderTasksSide()}
          </section>

          <section class="card focus-note-card">
            <div class="card-head">
              <div>
                <h2 class="card-title">${UI.icon('coffee')} Ritmo saudável</h2>
                <p class="card-sub">O descanso também faz parte do trabalho.</p>
              </div>
            </div>
            <div class="tip-list">
              <div class="tip-item"><span class="tip-number">1</span><span>Coloque o celular longe e escolha <strong>uma</strong> tarefa do Foco do Dia.</span></div>
              <div class="tip-item"><span class="tip-number">2</span><span>Trabalhe até o alarme tocar. Se surgir outra ideia, anote para depois.</span></div>
              <div class="tip-item"><span class="tip-number">3</span><span>Na pausa, levante, beba água e descanse os olhos por alguns minutos.</span></div>
            </div>
          </section>
        </aside>
      </div>`;

    els = {
      card: document.getElementById('pomo-card'),
      modes: document.getElementById('pomo-modes'),
      time: document.getElementById('pomo-time'),
      modeLabel: document.getElementById('pomo-mode-label'),
      ring: document.getElementById('pomo-ring'),
      task: document.getElementById('pomo-task'),
      toggle: document.getElementById('pomo-toggle'),
      sessions: document.getElementById('pomo-sessions'),
      minutes: document.getElementById('pomo-minutes'),
      dots: document.getElementById('pomo-dots'),
      cycle: document.getElementById('pomo-cycle')
    };

    renderMeta();
    updateDisplay();
  }

  function init() {
    const saved = Storage.loadTimer();
    if (saved) {
      runtime = saved;
      const total = durationFor(runtime.mode);
      if (!runtime.remaining || runtime.remaining > total) runtime.remaining = total;
      if (runtime.running) {
        const remaining = runtime.endsAt - Date.now();
        if (remaining <= 0) {
          runtime.running = false;
          runtime.remaining = 0;
          runtime.endsAt = 0;
          setTimeout(() => finish(true), 120);
        } else {
          runtime.remaining = remaining;
          startTick();
        }
      }
    } else {
      runtime.remaining = durationFor(runtime.mode);
      persist();
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) sync();
    });
    window.addEventListener('focus', sync);
    window.addEventListener('pagehide', persist);
  }

  window.Pomodoro = {
    init,
    render,
    start,
    pause,
    toggle,
    reset,
    setMode,
    skip,
    sync,
    setActiveTask,
    updateDisplay,
    startFocus,
    isRunning,
    settingsChanged,
    restartAll
  };
})();
