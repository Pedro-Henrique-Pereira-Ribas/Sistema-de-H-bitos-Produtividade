/* Assinatura Realtime do estado do usuário, com renovação da query selada. */
(function () {
  'use strict';

  function badge() {
    return document.getElementById('account-realtime-badge');
  }

  const Realtime = {
    client: null,
    subscription: null,
    controller: null,
    currentUserId: null,
    starting: false,
    status: 'off',

    setBadge(state, text) {
      this.status = state;
      const el = badge();
      if (!el) return;
      el.dataset.state = state;
      el.textContent = text;
    },

    cleanup() {
      if (this.controller) {
        try {
          this.controller.stop();
        } catch (err) {
          /* ignora falha ao parar o renovador */
        }
        this.controller = null;
      }
      if (this.subscription) {
        try {
          this.subscription.unsubscribe();
        } catch (err) {
          /* ignora falha ao cancelar a assinatura */
        }
        this.subscription = null;
      }
      if (this.client) {
        try {
          this.client.close();
        } catch (err) {
          /* ignora falha ao fechar o WebSocket */
        }
        this.client = null;
      }
    },

    stop() {
      this.cleanup();
      this.currentUserId = null;
      this.starting = false;
      this.setBadge('off', 'Tempo real off');
    },

    async start() {
      const auth = FluxoAPI.getAuth();
      if (!auth) {
        this.stop();
        return;
      }

      if (this.starting || (this.currentUserId === auth.user.id && this.subscription)) {
        return;
      }

      this.cleanup();
      this.currentUserId = auth.user.id;
      this.starting = true;
      this.setBadge('connecting', 'Tempo real...');

      try {
        const config = await FluxoAPI.getConfig();
        if (!config || !config.realtime || !config.realtime.configured || !config.realtime.url) {
          this.setBadge('off', 'Tempo real off');
          return;
        }

        const sdk = window.NeonRealtime;
        if (!sdk || typeof sdk.createRealtimeClient !== 'function') {
          throw new Error('SDK do Neon Realtime não carregado.');
        }

        const sealed = await FluxoAPI.getLiveState();
        if (this.currentUserId !== auth.user.id) return;

        const client = sdk.createRealtimeClient({
          url: config.realtime.url,
          logLevel: 'warn'
        });
        const subscription = client.subscribe(sealed);

        this.client = client;
        this.subscription = subscription;

        subscription.onChange((snapshot) => this.onSnapshot(snapshot));
        subscription.onStateChange((state) => this.onState(state));

        if (typeof sdk.QueryRefreshController === 'function') {
          this.controller = new sdk.QueryRefreshController({
            query: sealed,
            refreshQuery: () => FluxoAPI.getLiveState(),
            renewSubscription: (query) => subscription.renew(query),
            onRefreshExhausted: (err) => {
              console.warn('[Fluxo Realtime] Renovação esgotada:', err && err.message ? err.message : err);
              this.setBadge('error', 'Tempo real expirou');
            },
            subscription
          });
          this.controller.start();
        }
      } catch (err) {
        console.warn('[Fluxo Realtime] Falha ao conectar:', err && err.message ? err.message : err);
        this.cleanup();
        this.setBadge('error', 'Tempo real falhou');
      } finally {
        this.starting = false;
      }
    },

    onSnapshot(snapshot) {
      if (!snapshot || !Array.isArray(snapshot.data) || !snapshot.data.length) return;

      const row = snapshot.data.find((item) => item && item.user_id === this.currentUserId) ||
        snapshot.data[0];
      if (!row || !row.data) return;

      let data = row.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (err) {
          return;
        }
      }

      const meta = Sync.meta;
      if (!meta || meta.userId !== this.currentUserId) return;
      if (meta.dirty || Sync.pushing || Sync.busy || Sync.applying) return;

      const revision = Number(row.revision) || 0;
      if (revision <= meta.baseRevision) return;

      Sync.applyRemote({
        data,
        revision,
        updatedAt: Number(row.updated_at) || Date.now()
      }, { notify: false });
    },

    onState(state) {
      if (!state) return;
      if (state.status === 'live') {
        this.setBadge('live', 'Tempo real');
      } else if (state.status === 'connecting') {
        this.setBadge('connecting', 'Tempo real...');
      } else if (state.status === 'stale') {
        this.setBadge('pending', 'Tempo real renovando');
      } else if (state.status === 'error') {
        console.warn('[Fluxo Realtime] Assinatura em erro:', state.error);
        this.setBadge('error', 'Tempo real off');
      } else if (state.status === 'closed') {
        this.setBadge('off', 'Tempo real off');
      }
    }
  };

  document.addEventListener('fluxo:auth', () => Realtime.start());
  document.addEventListener('fluxo:logout', () => Realtime.stop());
  document.addEventListener('DOMContentLoaded', () => {
    if (FluxoAPI.getAuth()) Realtime.start();
  });

  window.FluxoRealtime = Realtime;
})();
