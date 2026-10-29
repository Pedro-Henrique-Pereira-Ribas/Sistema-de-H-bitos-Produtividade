/* Componentes de interface reutilizáveis: ícones, toasts, diálogos e tooltip. */
(function () {
  'use strict';

  const ICONS = {
    success: 'check-circle',
    error: 'alert',
    info: 'info'
  };

  const UI = {
    toastContainer: null,
    tooltip: null,
    confirmResolver: null,

    init() {
      this.toastContainer = document.getElementById('toasts');
      this.tooltip = document.getElementById('tooltip');

      const toastEl = this.toastContainer;
      toastEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-dismiss]');
        if (btn) {
          const toast = btn.closest('.toast');
          if (toast) this.dismissToast(toast);
        }
      });

      document.querySelectorAll('dialog.modal').forEach((dialog) => {
        dialog.addEventListener('click', (e) => {
          if (e.target === dialog) dialog.close();
        });
      });

      this.initTooltip();
    },

    icon(name, className = '') {
      return `<svg class="icon ${className}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
    },

    toast(message, type = 'success', duration = 3800) {
      if (!this.toastContainer) return;
      const el = document.createElement('div');
      el.className = `toast toast-${type}`;
      el.setAttribute('role', 'status');
      el.innerHTML = `
        ${this.icon(ICONS[type] || 'info', 'toast-icon')}
        <span class="toast-text">${Utils.esc(message)}</span>
        <button type="button" class="toast-close" data-dismiss aria-label="Fechar aviso">${this.icon('x')}</button>`;
      this.toastContainer.appendChild(el);
      requestAnimationFrame(() => el.classList.add('is-visible'));
      setTimeout(() => this.dismissToast(el), duration);
      return el;
    },

    dismissToast(el) {
      if (!el || el.classList.contains('is-leaving')) return;
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 220);
    },

    openDialog(dialog) {
      const el = typeof dialog === 'string' ? document.getElementById(dialog) : dialog;
      if (!el) return;
      if (!el.open) el.showModal();
      el.classList.add('is-open');
    },

    closeDialog(dialog) {
      const el = typeof dialog === 'string' ? document.getElementById(dialog) : dialog;
      if (el && el.open) el.close();
    },

    confirm({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false }) {
      const dialog = document.getElementById('confirm-dialog');
      const titleEl = document.getElementById('confirm-title');
      const messageEl = document.getElementById('confirm-message');
      const okBtn = document.getElementById('confirm-ok');
      const cancelBtn = document.getElementById('confirm-cancel');

      titleEl.textContent = title;
      messageEl.textContent = message;
      okBtn.textContent = confirmLabel;
      okBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
      cancelBtn.textContent = cancelLabel;

      if (!dialog.open) dialog.showModal();

      return new Promise((resolve) => {
        const finish = (value) => {
          okBtn.removeEventListener('click', onOk);
          cancelBtn.removeEventListener('click', onCancel);
          dialog.removeEventListener('close', onClose);
          if (dialog.open) dialog.close();
          resolve(value);
        };
        const onOk = () => finish(true);
        const onCancel = () => finish(false);
        const onClose = () => finish(false);

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        dialog.addEventListener('close', onClose, { once: true });
      });
    },

    initTooltip() {
      const tip = this.tooltip;
      if (!tip) return;

      const show = (target) => {
        const label = target.getAttribute('data-tip');
        if (!label) return;
        tip.textContent = label;
        tip.hidden = false;
        const rect = target.getBoundingClientRect();
        const tipRect = tip.getBoundingClientRect();
        let left = rect.left + rect.width / 2 - tipRect.width / 2;
        left = Utils.clamp(left, 8, window.innerWidth - tipRect.width - 8);
        let top = rect.top - tipRect.height - 10;
        if (top < 8) top = rect.bottom + 10;
        tip.style.left = `${Math.round(left)}px`;
        tip.style.top = `${Math.round(top)}px`;
        tip.classList.add('is-visible');
      };

      const hide = () => {
        tip.classList.remove('is-visible');
      };

      document.addEventListener('mouseover', (e) => {
        const target = e.target.closest('[data-tip]');
        if (target) show(target);
      });
      document.addEventListener('mouseout', (e) => {
        if (e.target.closest('[data-tip]')) hide();
      });
      document.addEventListener('focusin', (e) => {
        const target = e.target.closest('[data-tip]');
        if (target) show(target);
      });
      document.addEventListener('focusout', (e) => {
        if (e.target.closest('[data-tip]')) hide();
      });
      window.addEventListener('scroll', hide, { passive: true });
    }
  };

  window.UI = UI;
})();
