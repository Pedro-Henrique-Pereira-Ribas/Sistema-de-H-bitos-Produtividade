/* Estado central observável com persistência debounced. */
(function () {
  'use strict';

  const listeners = new Set();
  let saveTimer = null;

  const State = {
    data: null,
    storageOk: true,
    onSave: null,
    onSaveError: null,

    init() {
      this.data = Storage.load();
      this.ensureToday();
      this.pruneFocus();
      this.saveNow();
    },

    save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => this.saveNow(), 150);
    },

    hasPendingSave() {
      return saveTimer !== null;
    },

    saveNow() {
      clearTimeout(saveTimer);
      saveTimer = null;
      const ok = Storage.save(this.data);
      this.storageOk = ok;
      if (ok && typeof this.onSave === 'function') {
        try {
          this.onSave();
        } catch (err) {
          console.warn('[Fluxo] Falha no gancho de salvamento.', err);
        }
      }
      if (!ok && typeof this.onSaveError === 'function') this.onSaveError();
      return ok;
    },

    update(mutator, { silent = false } = {}) {
      mutator(this.data);
      this.save();
      if (!silent) this.emit();
    },

    emit() {
      listeners.forEach((fn) => {
        try {
          fn(this.data);
        } catch (err) {
          console.error('[Fluxo] Erro ao renderizar.', err);
        }
      });
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** Zera o Foco do Dia quando a data vira. */
    ensureToday() {
      const today = Utils.todayKey();
      if (!this.data.focus || this.data.focus.date !== today) {
        this.data.focus = { date: today, taskIds: [], activeTaskId: null };
        return true;
      }
      return false;
    },

    /** Remove do Foco do Dia tarefas concluídas ou inexistentes. */
    pruneFocus() {
      const focus = this.data.focus;
      if (!focus) return;
      const pending = new Set(this.data.tasks.filter((t) => !t.done).map((t) => t.id));
      const filtered = (focus.taskIds || []).filter((id) => pending.has(id));
      const changed = filtered.length !== (focus.taskIds || []).length;
      focus.taskIds = filtered;
      if (focus.activeTaskId && !pending.has(focus.activeTaskId)) {
        focus.activeTaskId = filtered[0] || null;
      } else if (!focus.activeTaskId && filtered.length) {
        focus.activeTaskId = filtered[0];
      }
      return changed;
    },

    replace(data) {
      this.data = Storage.normalize(data);
      this.ensureToday();
      this.pruneFocus();
      this.saveNow();
      this.emit();
    },

    reset() {
      this.data = Storage.defaults();
      this.saveNow();
      this.emit();
    },

    activeHabits() {
      return this.data.habits.filter((h) => !h.archived);
    },

    habit(id) {
      return this.data.habits.find((h) => h.id === id) || null;
    },

    task(id) {
      return this.data.tasks.find((t) => t.id === id) || null;
    }
  };

  window.State = State;
})();
