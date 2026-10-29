/* Sincronização opcional com a API: login, envio, download e conflitos. */
(function () {
  'use strict';

  const META_KEY = 'fluxo:sync:v1';
  const PUSH_DELAY = 1200;
  const POLL_INTERVAL = 60000;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function readMeta() {
    try {
      const raw = localStorage.getItem(META_KEY);
      const meta = raw ? JSON.parse(raw) : null;
      if (!meta || typeof meta.userId !== 'string') return null;
      return {
        userId: meta.userId,
        baseRevision: Math.max(0, Number(meta.baseRevision) || 0),
        dirty: Boolean(meta.dirty),
        lastSyncAt: Math.max(0, Number(meta.lastSyncAt) || 0)
      };
    } catch (err) {
      return null;
    }
  }

  function writeMeta(meta) {
    try {
      if (!meta) localStorage.removeItem(META_KEY);
      else localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch (err) {
      /* a sincronização continua em memória */
    }
  }

  function hasLocalData(data) {
    if (!data) return false;
    const habits = Array.isArray(data.habits) ? data.habits.length : 0;
    const tasks = Array.isArray(data.tasks) ? data.tasks.length : 0;
    const sessions = data.pomodoro && data.pomodoro.sessions
      ? Object.keys(data.pomodoro.sessions).length
      : 0;
    return habits > 0 || tasks > 0 || sessions > 0;
  }

  function counts(data) {
    const habits = data && Array.isArray(data.habits) ? data.habits.length : 0;
    const tasks = data && Array.isArray(data.tasks) ? data.tasks.length : 0;
    return `${habits} ${habits === 1 ? 'hábito' : 'hábitos'} e ${tasks} ${tasks === 1 ? 'tarefa' : 'tarefas'}`;
  }

  function formatLastSync(timestamp) {
    if (!timestamp) return 'Ainda não sincronizado';
    try {
      const date = new Date(timestamp);
      const day = date.toLocaleDateString('pt-BR');
      const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `Última sincronização: ${day} às ${time}`;
    } catch (err) {
      return 'Sincronizado';
    }
  }

  const Sync = {
    auth: null,
    meta: null,
    active: false,
    applying: false,
    pushing: false,
    busy: false,
    blocked: false,
    conflict: null,
    conflictNotified: false,
    status: 'idle',
    detail: '',
    pushTimer: null,
    pollTimer: null,

    init() {
      this.auth = FluxoAPI.getAuth();
      this.meta = readMeta();
      State.onSave = () => this.onLocalChange();
      this.bindEvents();
      this.refreshUI();

      if (!this.auth) return;

      this.ensureMeta();
      this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL);
      this.validateSession();
    },

    bindEvents() {
      window.addEventListener('online', () => {
        if (this.auth) {
          this.setStatus('pending', 'Conexão restabelecida. Sincronizando...');
          this.syncNow(true);
        }
      });

      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.auth) this.poll();
      });

      window.addEventListener('pagehide', () => {
        if (!this.active || !this.meta || !this.meta.dirty || this.blocked) return;
        const payload = JSON.parse(JSON.stringify(State.data));
        FluxoAPI.putState(payload, this.meta.baseRevision, { keepalive: true }).catch(() => {});
      });
    },

    ensureMeta() {
      if (!this.auth) return null;
      if (!this.meta || this.meta.userId !== this.auth.user.id) {
        this.meta = {
          userId: this.auth.user.id,
          baseRevision: 0,
          dirty: false,
          lastSyncAt: 0
        };
        writeMeta(this.meta);
      }
      return this.meta;
    },

    acceptAuth(result) {
      this.auth = result;
      FluxoAPI.setAuth(result);
      this.ensureMeta();
      this.active = true;
      this.blocked = false;
      this.conflict = null;
      this.conflictNotified = false;
    },

    async validateSession() {
      try {
        const { user } = await FluxoAPI.me();
        this.auth.user = user;
        FluxoAPI.setAuth(this.auth);
        this.active = true;
        await this.initialSync();
      } catch (err) {
        if (err.status === 401) {
          this.handleUnauthorized();
          return;
        }
        this.active = true;
        this.setStatus('offline', 'Sem conexão com a API. Os dados continuam salvos neste dispositivo.');
      }
      this.refreshUI();
    },

    async initialSync() {
      this.ensureMeta();
      this.setStatus('syncing', 'Buscando dados da conta...');
      const remote = await FluxoAPI.getState();

      if (!remote.data) {
        const ok = await this.pushState({ baseRevision: 0, notify: false });
        if (ok) UI.toast('Conta conectada. Dados deste dispositivo enviados para a nuvem.', 'success');
        return;
      }

      const revision = Number(remote.revision) || 0;
      if (this.meta.baseRevision && revision === this.meta.baseRevision) {
        if (this.meta.dirty) {
          const ok = await this.pushState({ baseRevision: revision, notify: false });
          if (ok) UI.toast('Alterações pendentes enviadas para a nuvem.', 'success');
        } else {
          this.applyRemoteMeta(remote, { notify: false });
        }
        return;
      }

      if (this.meta.baseRevision && revision > this.meta.baseRevision && !this.meta.dirty) {
        this.applyRemote(remote, { notify: true });
        return;
      }

      if (!this.meta.baseRevision && !hasLocalData(State.data)) {
        this.applyRemote(remote, { notify: true });
        return;
      }

      await this.resolveConflict(remote, { first: !this.meta.baseRevision });
    },

    async authenticate(mode) {
      if (this.busy) return;

      const nameEl = document.getElementById('account-name');
      const emailEl = document.getElementById('account-email');
      const passwordEl = document.getElementById('account-password');
      const name = nameEl ? nameEl.value.trim() : '';
      const email = emailEl ? emailEl.value.trim().toLowerCase() : '';
      const password = passwordEl ? passwordEl.value : '';

      if (mode === 'register' && name.length < 2) {
        UI.toast('Informe seu nome para criar a conta.', 'error');
        if (nameEl) nameEl.focus();
        return;
      }
      if (!EMAIL_RE.test(email)) {
        UI.toast('Informe um e-mail válido.', 'error');
        if (emailEl) emailEl.focus();
        return;
      }
      if (password.length < 8) {
        UI.toast('A senha precisa ter pelo menos 8 caracteres.', 'error');
        if (passwordEl) passwordEl.focus();
        return;
      }

      this.busy = true;
      this.setStatus('syncing', mode === 'register' ? 'Criando conta...' : 'Entrando...');
      this.refreshUI();

      try {
        const result = mode === 'register'
          ? await FluxoAPI.register(name, email, password)
          : await FluxoAPI.login(email, password);

        this.acceptAuth(result);
        if (passwordEl) passwordEl.value = '';
        UI.toast(mode === 'register' ? 'Conta criada com sucesso.' : 'Login realizado.', 'success');
        await this.initialSync();
      } catch (err) {
        if (err.status === 401) this.handleUnauthorized();
        else {
          UI.toast(err.message || 'Não foi possível entrar.', 'error', 6500);
          this.setStatus('error', 'Falha ao conectar. Confira a URL da API e tente novamente.');
        }
      } finally {
        this.busy = false;
        this.refreshUI();
      }
    },

    async logout() {
      if (!this.auth || this.busy) return;

      const confirmed = await UI.confirm({
        title: 'Sair da conta?',
        message: 'Seus dados continuam salvos neste dispositivo. A sincronização para de acontecer até você entrar novamente.',
        confirmLabel: 'Sair',
        cancelLabel: 'Continuar conectado'
      });
      if (!confirmed) return;

      this.active = false;
      this.auth = null;
      this.blocked = false;
      this.conflict = null;
      clearTimeout(this.pushTimer);
      FluxoAPI.clearAuth();
      this.setStatus('idle');
      this.refreshUI();
      UI.toast('Você saiu da conta. Os dados locais foram mantidos.', 'info');
    },

    handleUnauthorized(message) {
      this.active = false;
      this.auth = null;
      this.blocked = false;
      this.conflict = null;
      clearTimeout(this.pushTimer);
      FluxoAPI.clearAuth();
      this.setStatus('idle');
      this.refreshUI();
      UI.toast(message || 'Sessão expirada. Entre novamente para sincronizar.', 'error', 6000);
    },

    async removeRemote() {
      if (!this.auth) return false;

      this.busy = true;
      this.setStatus('syncing', 'Apagando dados da nuvem...');
      this.refreshUI();

      try {
        await FluxoAPI.deleteState();
        if (this.meta) {
          this.meta.baseRevision = 0;
          this.meta.dirty = false;
          this.meta.lastSyncAt = Date.now();
          writeMeta(this.meta);
        }
        this.blocked = false;
        this.conflict = null;
        this.setStatus('synced', 'Dados da nuvem apagados.');
        return true;
      } catch (err) {
        if (err.status === 401) {
          this.handleUnauthorized();
        } else {
          this.setStatus('offline', 'Não foi possível apagar os dados da nuvem.');
          UI.toast('Não foi possível apagar na nuvem. A cópia online será mantida.', 'error', 6500);
        }
        return false;
      } finally {
        this.busy = false;
        this.refreshUI();
      }
    },

    afterLocalReset() {
      clearTimeout(this.pushTimer);
      if (this.meta) {
        this.meta.baseRevision = 0;
        this.meta.dirty = false;
        writeMeta(this.meta);
      }
      this.blocked = false;
      this.conflict = null;
      this.conflictNotified = false;
      this.setStatus('idle');
      this.refreshUI();
    },

    onLocalChange() {
      if (this.applying) return;
      if (!this.meta || !this.meta.userId) return;

      this.meta.dirty = true;
      writeMeta(this.meta);

      if (!this.active || !this.auth) return;
      if (this.blocked) {
        this.setStatus('conflict', 'Há um conflito pendente. Use "Sincronizar agora".');
        return;
      }

      this.setStatus('pending', 'Alterações aguardando envio...');
      this.schedulePush();
    },

    schedulePush(delay = PUSH_DELAY) {
      clearTimeout(this.pushTimer);
      if (!this.active || !this.auth || this.blocked || this.applying) return;
      this.pushTimer = setTimeout(() => {
        if (this.blocked || !this.active || !this.auth || this.applying) return;
        if (this.meta && this.meta.dirty) this.pushState({ notify: false });
      }, delay);
    },

    async pushState({ baseRevision = null, notify = false, keepalive = false } = {}) {
      if (!this.active || !this.auth || !this.meta) return false;
      if (this.pushing) {
        this.schedulePush(400);
        return false;
      }

      const revision = baseRevision === null ? this.meta.baseRevision : baseRevision;
      const payload = JSON.parse(JSON.stringify(State.data));
      const sent = JSON.stringify(payload);

      this.pushing = true;
      this.setStatus('syncing', 'Enviando dados...');
      this.refreshUI();

      try {
        const result = await FluxoAPI.putState(payload, revision, { keepalive });
        this.meta.baseRevision = Number(result.revision) || this.meta.baseRevision;
        this.meta.lastSyncAt = Date.now();
        this.meta.dirty = JSON.stringify(State.data) !== sent;
        writeMeta(this.meta);

        this.blocked = false;
        this.conflict = null;
        this.conflictNotified = false;

        if (this.meta.dirty) {
          this.setStatus('pending', 'Novas alterações aguardando envio...');
          this.schedulePush(300);
        } else {
          this.setStatus('synced', formatLastSync(this.meta.lastSyncAt));
        }

        if (notify) UI.toast('Dados enviados para a nuvem.', 'success');
        return true;
      } catch (err) {
        if (err.status === 401) {
          this.handleUnauthorized();
        } else if (err.status === 409) {
          const current = err.payload && err.payload.state ? err.payload.state : null;
          if (!current) {
            this.meta.baseRevision = 0;
            writeMeta(this.meta);
            this.schedulePush(0);
          } else {
            this.conflict = current;
            this.blocked = true;
            this.setStatus('conflict', 'Os dados mudaram em outro dispositivo. Use "Sincronizar agora" para escolher.');
            if (!this.conflictNotified) {
              this.conflictNotified = true;
              UI.toast('Conflito de sincronização: os dados mudaram em outro dispositivo.', 'error', 6500);
            }
          }
        } else {
          this.meta.dirty = true;
          writeMeta(this.meta);
          this.setStatus('offline', 'Sem conexão com a API. Os dados continuam salvos localmente.');
          if (notify) UI.toast(err.message || 'Não foi possível sincronizar.', 'error', 6000);
        }
        return false;
      } finally {
        this.pushing = false;
        this.refreshUI();
      }
    },

    async syncNow(silent = false) {
      if (!this.auth) {
        if (!silent) UI.toast('Entre na sua conta para sincronizar.', 'info');
        return;
      }
      if (this.busy || this.pushing) return;

      // Flush de alterações ainda no debounce local antes de comparar versões.
      if (typeof State.hasPendingSave === 'function' && State.hasPendingSave()) {
        State.saveNow();
      }

      this.busy = true;
      this.blocked = false;
      this.setStatus('syncing', 'Sincronizando...');
      this.refreshUI();

      try {
        if (!this.active) {
          const { user } = await FluxoAPI.me();
          this.auth.user = user;
          FluxoAPI.setAuth(this.auth);
          this.active = true;
        }

        this.ensureMeta();
        const remote = await FluxoAPI.getState();

        if (!remote.data) {
          const ok = await this.pushState({ baseRevision: 0 });
          if (ok && !silent) UI.toast('Dados enviados para a nuvem.', 'success');
          return;
        }

        const revision = Number(remote.revision) || 0;
        if (revision === this.meta.baseRevision) {
          if (this.meta.dirty) {
            const ok = await this.pushState({ baseRevision: revision });
            if (ok && !silent) UI.toast('Alterações enviadas para a nuvem.', 'success');
          } else {
            this.applyRemoteMeta(remote, { notify: false });
            if (!silent) UI.toast('Tudo sincronizado.', 'success');
          }
          return;
        }

        if (revision > this.meta.baseRevision && !this.meta.dirty) {
          this.applyRemote(remote, { notify: !silent });
          return;
        }

        await this.resolveConflict(remote, { first: false });
      } catch (err) {
        if (err.status === 401) {
          this.handleUnauthorized();
        } else {
          this.setStatus('offline', 'Sem conexão com a API. Tente novamente.');
          if (!silent) UI.toast(err.message || 'Não foi possível sincronizar.', 'error', 6000);
        }
      } finally {
        this.busy = false;
        this.refreshUI();
      }
    },

    async resolveConflict(remote, { first = false } = {}) {
      this.blocked = true;
      this.setStatus('conflict', 'Escolha quais dados devem prevalecer.');

      const localCounts = counts(State.data);
      const cloudCounts = counts(remote.data);
      const message = first
        ? `Esta conta já tem ${cloudCounts} na nuvem. Este dispositivo tem ${localCounts}. Escolha quais dados devem prevalecer — os outros serão substituídos.`
        : `Os dados da nuvem foram alterados em outro dispositivo (${cloudCounts}) e este dispositivo também tem alterações (${localCounts}). Escolha quais dados devem prevalecer.`;

      const choice = await this.askConflict(message);
      if (choice === 'cloud') {
        this.applyRemote(remote, { notify: true });
      } else if (choice === 'local') {
        const ok = await this.pushState({ baseRevision: Number(remote.revision) || 0, notify: false });
        if (ok) UI.toast('Dados deste dispositivo enviados para a nuvem.', 'success');
      } else {
        this.blocked = true;
        this.setStatus('conflict', 'Conflito pendente. Use "Sincronizar agora" quando quiser resolver.');
      }
    },

    askConflict(message) {
      const dialog = document.getElementById('sync-conflict-dialog');
      const messageEl = document.getElementById('sync-conflict-message');

      if (!dialog || !messageEl) {
        return UI.confirm({
          title: 'Dados diferentes',
          message,
          confirmLabel: 'Usar dados da nuvem',
          cancelLabel: 'Manter este dispositivo'
        }).then((cloud) => (cloud ? 'cloud' : 'local'));
      }

      messageEl.textContent = message;
      if (dialog.open) dialog.close();

      return new Promise((resolve) => {
        let done = false;

        const finish = (choice) => {
          if (done) return;
          done = true;
          dialog.removeEventListener('click', onClick);
          dialog.removeEventListener('close', onClose);
          if (dialog.open) dialog.close();
          resolve(choice);
        };

        const onClick = (event) => {
          const button = event.target.closest('[data-sync-choice]');
          if (!button) return;
          finish(button.dataset.syncChoice);
        };

        const onClose = () => finish('cancel');

        dialog.addEventListener('click', onClick);
        dialog.addEventListener('close', onClose);
        UI.openDialog(dialog);

        const cloudButton = dialog.querySelector('[data-sync-choice="cloud"]');
        if (cloudButton) cloudButton.focus();
      });
    },

    applyRemote(remote, { notify = true } = {}) {
      this.applying = true;
      try {
        State.replace(remote.data);
      } finally {
        this.applying = false;
      }

      this.meta.baseRevision = Number(remote.revision) || 0;
      this.meta.dirty = false;
      this.meta.lastSyncAt = Date.now();
      writeMeta(this.meta);

      this.blocked = false;
      this.conflict = null;
      this.conflictNotified = false;
      this.setStatus('synced', formatLastSync(this.meta.lastSyncAt));
      document.dispatchEvent(new CustomEvent('fluxo:remote'));
      this.refreshUI();

      if (notify) UI.toast('Dados atualizados a partir da nuvem.', 'success');
    },

    applyRemoteMeta(remote, { notify = false } = {}) {
      this.meta.baseRevision = Number(remote.revision) || 0;
      this.meta.dirty = false;
      this.meta.lastSyncAt = Date.now();
      writeMeta(this.meta);
      this.blocked = false;
      this.conflict = null;
      this.setStatus('synced', formatLastSync(this.meta.lastSyncAt));
      this.refreshUI();
      if (notify) UI.toast('Tudo sincronizado.', 'success');
    },

    async poll() {
      if (!this.auth || !this.active || this.busy || this.pushing || this.blocked) return;
      if (!this.meta || document.hidden) return;
      if (typeof State.hasPendingSave === 'function' && State.hasPendingSave()) {
        State.saveNow();
        return;
      }
      if (this.meta.dirty) return;

      try {
        const remote = await FluxoAPI.getState();
        if (remote.data && Number(remote.revision) > this.meta.baseRevision) {
          this.applyRemote(remote, { notify: true });
        }
      } catch (err) {
        if (err.status === 401) this.handleUnauthorized();
        else this.setStatus('offline', 'Sem conexão com a API. Os dados continuam salvos localmente.');
      }
    },

    async saveApiBase(value) {
      const previous = FluxoAPI.getBase();
      let next;
      try {
        next = FluxoAPI.setBase(value);
      } catch (err) {
        UI.toast(err.message, 'error');
        return;
      }

      if (next !== previous && this.auth) {
        this.handleUnauthorized('Servidor alterado. Entre novamente para sincronizar.');
      } else {
        UI.toast('Servidor da API salvo.', 'success');
      }
      this.refreshUI();
    },

    setStatus(status, detail) {
      this.status = status;
      this.detail = detail || '';
      this.refreshUI();
    },

    refreshUI() {
      const loggedOut = document.getElementById('account-logged-out');
      const loggedIn = document.getElementById('account-logged-in');
      if (!loggedOut || !loggedIn) return;

      const hasAuth = Boolean(this.auth);
      loggedOut.hidden = hasAuth;
      loggedIn.hidden = !hasAuth;

      const apiInput = document.getElementById('settings-api-url');
      if (apiInput && document.activeElement !== apiInput) {
        try {
          apiInput.value = localStorage.getItem(FluxoAPI.API_KEY) || '';
        } catch (err) {
          apiInput.value = '';
        }
      }

      const baseInfo = document.getElementById('account-api-base');
      if (baseInfo) baseInfo.textContent = FluxoAPI.getBase();

      if (!hasAuth) return;

      const nameEl = document.getElementById('account-user-name');
      const emailEl = document.getElementById('account-user-email');
      if (nameEl) nameEl.textContent = this.auth.user.name || 'Conta';
      if (emailEl) emailEl.textContent = this.auth.user.email || '';

      const badge = document.getElementById('account-sync-badge');
      const statusEl = document.getElementById('account-sync-status');
      const labels = {
        synced: 'Sincronizado',
        pending: 'Pendente',
        syncing: 'Sincronizando',
        offline: 'Offline',
        conflict: 'Conflito',
        error: 'Erro',
        idle: 'Conectado'
      };

      if (badge) {
        badge.textContent = labels[this.status] || 'Conectado';
        badge.dataset.state = this.status;
      }
      if (statusEl) {
        const last = this.meta && this.meta.lastSyncAt ? formatLastSync(this.meta.lastSyncAt) : '';
        statusEl.textContent = this.detail || last || 'Conectado à sua conta.';
      }

      const syncBtn = document.getElementById('account-sync-button');
      const logoutBtn = document.getElementById('account-logout-button');
      const disabled = this.busy || this.pushing;
      if (syncBtn) {
        syncBtn.disabled = disabled;
        syncBtn.textContent = this.pushing ? 'Sincronizando...' : 'Sincronizar agora';
      }
      if (logoutBtn) logoutBtn.disabled = disabled;
    }
  };

  window.Sync = Sync;
  document.addEventListener('DOMContentLoaded', () => Sync.init());
})();
