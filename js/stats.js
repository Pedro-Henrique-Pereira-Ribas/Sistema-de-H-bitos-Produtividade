/* Estatísticas: cards-resumo e gráficos com Chart.js. */
(function () {
  'use strict';

  let charts = [];

  function destroyCharts() {
    charts.forEach((chart) => {
      try {
        chart.destroy();
      } catch (err) {
        /* ignore */
      }
    });
    charts = [];
  }

  function colors() {
    const style = getComputedStyle(document.documentElement);
    const read = (name, fallback) => (style.getPropertyValue(name) || fallback).trim();
    return {
      accent: read('--accent', '#6366f1'),
      text: read('--text', '#191c28'),
      textSoft: read('--text-soft', '#4b5266'),
      muted: read('--muted', '#6d7486'),
      border: read('--border', '#e5e7f0'),
      surface: read('--surface', '#ffffff')
    };
  }

  function hexToRgba(hex, alpha) {
    const value = hex.replace('#', '');
    const full = value.length === 3 ? value.split('').map((ch) => ch + ch).join('') : value;
    const num = parseInt(full, 16);
    if (!Number.isFinite(num)) return `rgba(99, 102, 241, ${alpha})`;
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function tooltipBase(palette) {
    return {
      backgroundColor: palette.surface,
      titleColor: palette.text,
      bodyColor: palette.textSoft,
      borderColor: palette.border,
      borderWidth: 1,
      padding: 10,
      cornerRadius: 8,
      displayColors: false,
      titleFont: { weight: '700', size: 11.5 },
      bodyFont: { size: 11.5 },
      caretSize: 5
    };
  }

  function createChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    try {
      charts.push(new Chart(canvas, config));
    } catch (err) {
      console.warn('[Fluxo] Falha ao desenhar gráfico.', err);
      const box = canvas.parentElement;
      if (box) box.innerHTML = '<div class="chart-fallback">Não foi possível desenhar o gráfico neste navegador.</div>';
    }
  }

  function bestStreakSummary() {
    let best = 0;
    let name = '';
    State.activeHabits().forEach((habit) => {
      const value = Habits.bestStreak(habit);
      if (value > best) {
        best = value;
        name = habit.name;
      }
    });
    return { best, name };
  }

  function render() {
    const root = document.getElementById('view-stats');
    if (!root) return;

    destroyCharts();

    const palette = colors();
    const active = State.activeHabits();
    const adherence30 = Habits.rangeAdherence(30);
    const best = bestStreakSummary();
    const pending = State.data.tasks.filter((task) => !task.done).length;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const doneWeek = State.data.tasks.filter((task) => task.done && task.completedAt && task.completedAt >= cutoff).length;
    const focusKeys = Utils.lastNDays(7);
    const focusSessions = focusKeys.reduce((sum, key) => sum + (State.data.pomodoro.sessions[key] || 0), 0);
    const focusMinutes = focusSessions * State.data.settings.pomodoro.focus;
    const hasHabits = active.length > 0;

    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 450 },
      plugins: {
        legend: { display: false },
        tooltip: tooltipBase(palette)
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: palette.muted, font: { size: 10.5 }, maxRotation: 0 }
        },
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            color: palette.muted,
            font: { size: 10 },
            stepSize: 25,
            callback: (value) => `${value}%`
          },
          grid: { color: palette.border, drawTicks: false },
          border: { display: false }
        }
      }
    };

    root.innerHTML = `
      <div class="view-head">
        <div>
          <h1 class="view-title">Estatísticas</h1>
          <p class="view-sub">Uma leitura honesta do seu ritmo, sem cobranças.</p>
        </div>
      </div>

      <div class="stats-cards">
        <article class="stat-card">
          <span class="stat-icon tone-flame">${UI.icon('flame')}</span>
          <div class="stat-content">
            <span class="stat-value">${best.best} <small>${best.best === 1 ? 'dia' : 'dias'}</small></span>
            <span class="stat-label">maior sequência</span>
            <span class="stat-extra">${best.name ? Utils.esc(best.name) : 'Ainda sem registros'}</span>
          </div>
        </article>
        <article class="stat-card">
          <span class="stat-icon tone-accent">${UI.icon('target')}</span>
          <div class="stat-content">
            <span class="stat-value">${adherence30.pct}%</span>
            <span class="stat-label">aderência em 30 dias</span>
            <span class="stat-extra">${adherence30.done} de ${adherence30.total} registros</span>
          </div>
        </article>
        <article class="stat-card">
          <span class="stat-icon tone-blue">${UI.icon('check-square')}</span>
          <div class="stat-content">
            <span class="stat-value">${doneWeek}</span>
            <span class="stat-label">tarefas concluídas em 7 dias</span>
            <span class="stat-extra">${pending} ${pending === 1 ? 'pendente agora' : 'pendentes agora'}</span>
          </div>
        </article>
        <article class="stat-card">
          <span class="stat-icon tone-green">${UI.icon('timer')}</span>
          <div class="stat-content">
            <span class="stat-value">${focusSessions}</span>
            <span class="stat-label">sessões de foco em 7 dias</span>
            <span class="stat-extra">${Utils.formatMinutes(focusMinutes)} de foco</span>
          </div>
        </article>
      </div>

      ${hasHabits ? `
        <div class="charts-grid">
          <section class="card chart-card">
            <div class="card-head">
              <div>
                <h2 class="card-title">${UI.icon('chart')} Últimos 7 dias</h2>
                <p class="card-sub">Percentual de hábitos concluídos por dia.</p>
              </div>
            </div>
            <div class="chart-box"><canvas id="chart-week" aria-label="Gráfico de barras dos últimos 7 dias" role="img"></canvas></div>
          </section>

          <section class="card chart-card">
            <div class="card-head">
              <div>
                <h2 class="card-title">${UI.icon('chart')} Evolução em 30 dias</h2>
                <p class="card-sub">Cada ponto é a aderência diária.</p>
              </div>
            </div>
            <div class="chart-box"><canvas id="chart-month" aria-label="Gráfico de linha dos últimos 30 dias" role="img"></canvas></div>
          </section>

          <section class="card chart-card wide">
            <div class="card-head">
              <div>
                <h2 class="card-title">${UI.icon('repeat')} Aderência por hábito</h2>
                <p class="card-sub">Últimos 30 dias, considerando apenas os dias agendados.</p>
              </div>
            </div>
            <div class="chart-box tall"><canvas id="chart-habits" aria-label="Gráfico de barras de aderência por hábito" role="img"></canvas></div>
          </section>
        </div>` : `
        <div class="card">
          <div class="empty">
            <div class="empty-icon">${UI.icon('chart')}</div>
            <p class="empty-title">Ainda não há dados para mostrar</p>
            <p class="empty-text">Crie seu primeiro hábito e volte aqui depois de alguns dias para ver sua evolução.</p>
            <button type="button" class="btn btn-primary" data-action="new-habit">${UI.icon('plus')} Criar hábito</button>
          </div>
        </div>`}`;

    if (!hasHabits) return;

    if (typeof Chart === 'undefined') {
      document.querySelectorAll('.chart-box').forEach((box) => {
        box.innerHTML = '<div class="chart-fallback">O Chart.js não foi encontrado. Verifique a pasta <strong>vendor/</strong>.</div>';
      });
      return;
    }

    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 11;

    const last7 = Utils.lastNDays(7).map((key) => {
      const date = Utils.parseKey(key);
      const stats = Habits.completionForDate(key);
      return {
        key,
        stats,
        label: `${Utils.weekdayShort(date)} ${date.getDate()}`
      };
    });

    const weekValues = last7.map((item) => item.stats.pct);
    createChart('chart-week', {
      type: 'bar',
      data: {
        labels: last7.map((item) => item.label),
        datasets: [{
          data: weekValues,
          backgroundColor: last7.map((item) => (item.key === Utils.todayKey() ? palette.accent : hexToRgba(palette.accent, 0.55))),
          hoverBackgroundColor: palette.accent,
          borderRadius: 7,
          maxBarThickness: 40,
          borderSkipped: false
        }]
      },
      options: {
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          tooltip: {
            ...baseOptions.plugins.tooltip,
            callbacks: {
              label: (context) => {
                const item = last7[context.dataIndex];
                if (!item.stats.total) return 'Sem hábitos agendados';
                return `${item.stats.done} de ${item.stats.total} ${item.stats.total === 1 ? 'hábito' : 'hábitos'} (${item.stats.pct}%)`;
              }
            }
          }
        }
      }
    });

    const last30 = Utils.lastNDays(30).map((key) => {
      const stats = Habits.completionForDate(key);
      return { key, stats };
    });

    const monthCanvas = document.getElementById('chart-month');
    let gradient = hexToRgba(palette.accent, 0.18);
    if (monthCanvas) {
      const context = monthCanvas.getContext('2d');
      const fill = context.createLinearGradient(0, 0, 0, 280);
      fill.addColorStop(0, hexToRgba(palette.accent, 0.28));
      fill.addColorStop(1, hexToRgba(palette.accent, 0.01));
      gradient = fill;
    }

    createChart('chart-month', {
      type: 'line',
      data: {
        labels: last30.map((item) => Utils.formatShort(item.key)),
        datasets: [{
          data: last30.map((item) => item.stats.pct),
          borderColor: palette.accent,
          backgroundColor: gradient,
          fill: true,
          tension: 0.38,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: palette.accent,
          pointHoverBorderColor: palette.surface,
          pointHoverBorderWidth: 2,
          spanGaps: true
        }]
      },
      options: {
        ...baseOptions,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          ...baseOptions.plugins,
          tooltip: {
            ...baseOptions.plugins.tooltip,
            callbacks: {
              title: (items) => (items.length ? Utils.formatMedium(last30[items[0].dataIndex].key) : ''),
              label: (context) => {
                const item = last30[context.dataIndex];
                if (!item.stats.total) return 'Sem hábitos agendados';
                return `${item.stats.done} de ${item.stats.total} ${item.stats.total === 1 ? 'hábito' : 'hábitos'} (${item.stats.pct}%)`;
              }
            }
          }
        },
        scales: {
          ...baseOptions.scales,
          x: {
            ...baseOptions.scales.x,
            ticks: { ...baseOptions.scales.x.ticks, maxTicksLimit: 8, autoSkip: true }
          }
        }
      }
    });

    const habitData = active
      .map((habit) => ({ habit, stats: Habits.adherence(habit, 30) }))
      .filter((item) => item.stats.total > 0)
      .sort((a, b) => b.stats.pct - a.stats.pct)
      .slice(0, 12);

    const habitChart = document.getElementById('chart-habits');
    if (habitChart) {
      if (!habitData.length) {
        habitChart.parentElement.innerHTML = '<div class="chart-fallback">Ainda não há dias suficientes desde a criação dos hábitos.</div>';
      } else {
        createChart('chart-habits', {
          type: 'bar',
          data: {
            labels: habitData.map((item) => item.habit.name),
            datasets: [{
              data: habitData.map((item) => item.stats.pct),
              backgroundColor: habitData.map((item) => hexToRgba(item.habit.color, 0.78)),
              hoverBackgroundColor: habitData.map((item) => item.habit.color),
              borderRadius: 6,
              maxBarThickness: 26,
              borderSkipped: false
            }]
          },
          options: {
            ...baseOptions,
            indexAxis: 'y',
            plugins: {
              ...baseOptions.plugins,
              tooltip: {
                ...baseOptions.plugins.tooltip,
                callbacks: {
                  label: (context) => {
                    const item = habitData[context.dataIndex];
                    return `${item.stats.done} de ${item.stats.total} ${item.stats.total === 1 ? 'dia' : 'dias'} (${item.stats.pct}%)`;
                  }
                }
              }
            },
            scales: {
              x: {
                ...baseOptions.scales.y,
                beginAtZero: true,
                max: 100
              },
              y: {
                grid: { display: false },
                border: { display: false },
                ticks: {
                  color: palette.textSoft,
                  font: { size: 11 },
                  autoSkip: false,
                  callback: (value) => {
                    const item = habitData[Number(value)];
                    const label = item ? item.habit.name : String(value);
                    return label.length > 20 ? `${label.slice(0, 19)}…` : label;
                  }
                }
              }
            }
          }
        });
      }
    }
  }

  window.Stats = {
    init() {},
    render
  };
})();
