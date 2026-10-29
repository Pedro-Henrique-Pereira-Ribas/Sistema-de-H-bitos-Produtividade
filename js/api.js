/* Cliente HTTP da API do Fluxo. */
(function () {
  'use strict';

  const API_KEY = 'fluxo:api:v1';
  const AUTH_KEY = 'fluxo:auth:v1';

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function write(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (err) {
      /* sem persistência: a sessão vale só para esta aba */
    }
  }

  function normalizeBase(value) {
    let base = String(value || '').trim();
    if (!base) return '';
    if (!/^https?:\/\//i.test(base)) return '';
    base = base.replace(/\/+$/, '');
    if (!/\/api$/i.test(base)) base += '/api';
    return base;
  }

  function getBase() {
    const saved = normalizeBase(read(API_KEY));
    if (saved) return saved;
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      return `${location.origin}/api`;
    }
    return 'http://localhost:3000/api';
  }

  function setBase(value) {
    const normalized = normalizeBase(value);
    if (String(value || '').trim() && !normalized) {
      throw new Error('Informe uma URL http:// ou https:// válida.');
    }
    write(API_KEY, normalized || null);
    return getBase();
  }

  function getAuth() {
    const raw = read(AUTH_KEY);
    if (!raw) return null;
    try {
      const auth = JSON.parse(raw);
      if (!auth || typeof auth.token !== 'string' || !auth.user || typeof auth.user.id !== 'string') {
        return null;
      }
      return auth;
    } catch (err) {
      return null;
    }
  }

  function setAuth(auth) {
    write(AUTH_KEY, JSON.stringify(auth));
  }

  function clearAuth() {
    write(AUTH_KEY, null);
  }

  function friendlyNetworkError(err) {
    if (err && err.name === 'AbortError') {
      return new Error('O servidor demorou para responder. Tente novamente.');
    }
    return new Error('Não foi possível falar com o servidor. Verifique a internet e a URL da API.');
  }

  async function request(path, options = {}) {
    const { method = 'GET', body, auth = getAuth(), timeout = 15000, keepalive = false } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && auth.token) headers.Authorization = `Bearer ${auth.token}`;

    let response;
    try {
      response = await fetch(`${getBase()}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        keepalive
      });
    } catch (err) {
      throw friendlyNetworkError(err);
    } finally {
      clearTimeout(timer);
    }

    const raw = await response.text();
    let payload = null;
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch (err) {
        payload = null;
      }
    }

    if (!response.ok) {
      const error = new Error(
        (payload && payload.error) || `O servidor respondeu com erro ${response.status}.`
      );
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  function register(name, email, password) {
    return request('/auth/register', {
      method: 'POST',
      body: { name, email, password },
      auth: null
    });
  }

  function login(email, password) {
    return request('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: null
    });
  }

  function me() {
    return request('/me');
  }

  function getState() {
    return request('/state');
  }

  function putState(data, baseRevision, { keepalive = false } = {}) {
    return request('/state', {
      method: 'PUT',
      body: { data, baseRevision },
      keepalive,
      timeout: keepalive ? 5000 : 20000
    });
  }

  function deleteState() {
    return request('/state', { method: 'DELETE' });
  }

  function health() {
    return request('/health', { auth: null, timeout: 8000 });
  }

  window.FluxoAPI = {
    API_KEY,
    AUTH_KEY,
    normalizeBase,
    getBase,
    setBase,
    getAuth,
    setAuth,
    clearAuth,
    request,
    register,
    login,
    me,
    getState,
    putState,
    deleteState,
    health
  };
})();
