/* Utilitários globais — datas locais, formatação e helpers. */
(function () {
  'use strict';

  const WEEKDAYS_MON = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
  const WEEK_LETTERS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
  const WEEKDAYS_FULL = [
    'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
    'quinta-feira', 'sexta-feira', 'sábado'
  ];
  const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MONTHS_LONG = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
  ];

  const pad = (n) => String(n).padStart(2, '0');

  function dateKey(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseKey(key) {
    if (typeof key !== 'string') return new Date(NaN);
    const parts = key.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return new Date(NaN);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function todayKey() {
    return dateKey(new Date());
  }

  function addDays(date, days) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + days);
    return d;
  }

  function startOfWeek(date = new Date()) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const offset = (d.getDay() + 6) % 7; // segunda = 0
    d.setDate(d.getDate() - offset);
    return d;
  }

  function weekdayMonday(date) {
    return (date.getDay() + 6) % 7;
  }

  function weekdayShort(date) {
    return WEEKDAYS_SHORT[date.getDay()];
  }

  function capitalize(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  }

  function formatLong(date = new Date()) {
    return capitalize(`${WEEKDAYS_FULL[date.getDay()]}, ${date.getDate()} de ${MONTHS_LONG[date.getMonth()]}`);
  }

  function formatMedium(dateOrKey) {
    const d = typeof dateOrKey === 'string' ? parseKey(dateOrKey) : dateOrKey;
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  }

  function formatShort(dateOrKey) {
    const d = typeof dateOrKey === 'string' ? parseKey(dateOrKey) : dateOrKey;
    if (Number.isNaN(d.getTime())) return '';
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  }

  function isToday(key) {
    return key === todayKey();
  }

  function isFuture(key) {
    return key > todayKey();
  }

  function daysInRange(startKey, endKey) {
    const out = [];
    let cursor = parseKey(startKey);
    const end = parseKey(endKey);
    for (let i = 0; cursor <= end && i < 4000; i++) {
      out.push(dateKey(cursor));
      cursor = addDays(cursor, 1);
    }
    return out;
  }

  function lastNDays(n, endKey = todayKey()) {
    const end = parseKey(endKey);
    return Array.from({ length: n }, (_, i) => dateKey(addDays(end, i - n + 1)));
  }

  function greeting(date = new Date()) {
    const h = date.getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function uid(prefix = 'id') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function debounce(fn, wait) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function plural(n, singular, pluralForm) {
    return `${n} ${n === 1 ? singular : pluralForm}`;
  }

  function formatMinutes(total) {
    const mins = Math.max(0, Math.round(total));
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const rest = mins % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }

  window.Utils = {
    WEEKDAYS_MON, WEEK_LETTERS, WEEKDAYS_FULL, WEEKDAYS_SHORT, MONTHS_SHORT, MONTHS_LONG,
    pad, dateKey, parseKey, todayKey, addDays, startOfWeek, weekdayMonday, weekdayShort,
    capitalize, formatLong, formatMedium, formatShort, isToday, isFuture, daysInRange,
    lastNDays, greeting, esc, uid, debounce, clamp, plural, formatMinutes
  };
})();
