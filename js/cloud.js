/* Serviços de nuvem do Neon: status, backups e sugestões com IA. */
(function () {
  'use strict';

  function byId(id) {
    return document.getElementById(id);
  }

  function setStatus(message, state) {
    const el = byId('cloud-status');
    if (!el) return;
    el.textContent = message;
    if (state) el.dataset.state = state;
  }

  function setAiOutput(message, state) {
    const el = byId('cloud-ai-output');
    if (!el) return;
    el.textContent = message;
    if (state) el.dataset.state = state;
  }

  function serviceLine(label, value) {
    return `${label}: ${value}`;
  }

  function summary(status) {
    const lines = [
      serviceLine('Postgres', status.postgres ? 'OK' : 'falhou'),
      serviceLine('Auth', status.auth ? 'OK' : 'falhou'),
      serviceLine('Storage', status.storage && status.storage.ok ? 'OK' : 'falhou'),
      serviceLine('Functions', status.functions && status.functions.ok ? 'OK' : 'falhou'),
      serviceLine('Realtime', status.realtime && status.realtime.configured ? 'OK' : 'falhou'),
      serviceLine(
        'AI Gateway',
        status.ai && status.ai.ok
          ? `OK (${status.ai.model})`
          : 'indisponível no plano Free'
      )
    ];
    return lines.join(' · ');
  }

  const Cloud = {
    checkedFor: null,

    async check({ silent = false } = {}) {
      if (!FluxoAPI.getAuth()) {
        setStatus('Entre na conta para verificar os serviços.');
        return null;
      }

      setStatus('Verificando serviços Neon...');
      try {
        const status = await FluxoAPI.cloudStatus();
        setStatus(summary(status));
        if (!silent) {
          const ok = status.postgres && status.auth &&
            status.storage && status.storage.ok &&
            status.functions && status.functions.ok &&
            status.realtime && status.realtime.configured;
          UI.toast(ok ? 'Serviços Neon verificados.' : 'Alguns serviços precisam de atenção.', ok ? 'success' : 'error');
        }
        return status;
      } catch (err) {
        setStatus(`Falha ao verificar: ${err.message}`);
        if (!silent) UI.toast(err.message, 'error', 6000);
        return null;
      }
    },

    async backup() {
      if (!FluxoAPI.getAuth()) {
        UI.toast('Entre na conta para salvar um backup na nuvem.', 'error');
        return null;
      }

      setStatus('Salvando backup no Object Storage...');
      try {
        const result = await FluxoAPI.createBackup();
        const kb = Math.max(1, Math.round((Number(result.bytes) || 0) / 1024));
        setStatus(`Backup salvo em ${result.bucket} (${kb} KB).`);
        UI.toast('Backup salvo no Neon Object Storage.', 'success');
        return result;
      } catch (err) {
        setStatus(`Falha no backup: ${err.message}`);
        UI.toast(err.message, 'error', 6000);
        return null;
      }
    },

    async downloadLatest() {
      if (!FluxoAPI.getAuth()) {
        UI.toast('Entre na conta para baixar um backup.', 'error');
        return null;
      }

      setStatus('Buscando backups...');
      try {
        const result = await FluxoAPI.listBackups();
        const backups = (result && result.backups) || [];
        if (!backups.length) {
          setStatus('Nenhum backup na nuvem ainda.');
          UI.toast('Salve um backup primeiro.', 'info');
          return null;
        }
        const signed = await FluxoAPI.backupUrl(backups[0].key);
        setStatus(`Abrindo backup ${backups[0].key}.`);
        window.open(signed.url, '_blank', 'noopener');
        return signed;
      } catch (err) {
        setStatus(`Falha ao baixar: ${err.message}`);
        UI.toast(err.message, 'error', 6000);
        return null;
      }
    },

    async aiSuggest() {
      if (!FluxoAPI.getAuth()) {
        UI.toast('Entre na conta para usar o AI Gateway.', 'error');
        return null;
      }

      const input = byId('cloud-ai-goal');
      const goal = input ? input.value.trim() : '';
      if (!goal) {
        UI.toast('Descreva um objetivo para a IA.', 'info');
        if (input) input.focus();
        return null;
      }

      setAiOutput('Consultando o AI Gateway...');
      try {
        const result = await FluxoAPI.aiSuggest(goal);
        setAiOutput(result.suggestion || 'Sem sugestão.');
        return result;
      } catch (err) {
        setAiOutput(err.message);
        UI.toast(err.message, 'error', 7000);
        return null;
      }
    },

    onAuth() {
      const auth = FluxoAPI.getAuth();
      if (!auth) return;
      if (this.checkedFor === auth.user.id) return;
      this.checkedFor = auth.user.id;
      this.check({ silent: true });
    },

    onLogout() {
      this.checkedFor = null;
      setStatus('Entre na conta para verificar os serviços.');
      setAiOutput('');
    }
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'cloud-check') {
      event.preventDefault();
      Cloud.check();
    } else if (action === 'cloud-backup') {
      event.preventDefault();
      Cloud.backup();
    } else if (action === 'cloud-backup-download') {
      event.preventDefault();
      Cloud.downloadLatest();
    } else if (action === 'cloud-ai-suggest') {
      event.preventDefault();
      Cloud.aiSuggest();
    }
  });

  document.addEventListener('fluxo:auth', () => Cloud.onAuth());
  document.addEventListener('fluxo:logout', () => Cloud.onLogout());

  window.FluxoCloud = Cloud;
})();
