/* Cliente HTTP da API do Fluxo e integração com o Neon Auth. */
(function () {
  'use strict';

  const API_KEY = 'fluxo:api:v1';
  const AUTH_KEY = 'fluxo:auth:v1';

  let authClient = null;
  let authClientBase = '';

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
    authClient = null;
    authClientBase = '';
    return getBase();
  }

  function getAuth() {
    const raw = read(AUTH_KEY);
    if (!raw) return null;
    try {
      const auth = JSON.parse(raw);
      if (!auth || !auth.user || typeof auth.user.id !== 'string') return null;
      return { user: auth.user };
    } catch (err) {
      return null;
    }
  }

  function setAuth(auth) {
    if (!auth || !auth.user) {
      write(AUTH_KEY, null);
      return;
    }
    write(AUTH_KEY, JSON.stringify({ user: auth.user }));
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

  function authError(error, fallback) {
    const message = error && (error.message || error.statusText)
      ? String(error.message || error.statusText)
      : fallback;
    const err = new Error(message);
    err.status = Number(error && (error.status || error.statusCode)) || 0;
    err.code = error && error.code;
    return err;
  }

  async function unwrapAuth(resultPromise, fallback) {
    let result;
    try {
      result = await resultPromise;
    } catch (err) {
      throw authError(err, fallback);
    }

    if (result && result.error) throw authError(result.error, fallback);
    const data = result && result.data;
    if (!data || !data.user) throw new Error(fallback);
    return { user: data.user };
  }

  function getAuthClient() {
    const base = `${getBase()}/auth`;
    const factory = window.NeonAuth && window.NeonAuth.createAuthClient;
    if (typeof factory !== 'function') {
      throw new Error('Cliente de autenticação da Neon não carregado.');
    }
    if (!authClient || authClientBase !== base) {
      authClient = factory(base);
      authClientBase = base;
    }
    return authClient;
  }

  async function request(path, options = {}) {
    const { method = 'GET', body, timeout = 15000, keepalive = false } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    try {
      response = await fetch(`${getBase()}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        keepalive,
        credentials: 'include'
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
      error.code = payload && payload.code;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  function register(name, email, password) {
    return unwrapAuth(
      getAuthClient().signUp.email({ name, email, password }),
      'Não foi possível criar a conta.'
    );
  }

  function login(email, password) {
    return unwrapAuth(
      getAuthClient().signIn.email({ email, password }),
      'Não foi possível entrar.'
    );
  }

  async function logout() {
    try {
      await getAuthClient().signOut();
    } catch (err) {
      /* a sessão local é limpa mesmo se o servidor estiver offline */
    }
    clearAuth();
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
    return request('/health', { timeout: 8000 });
  }

  function getConfig() {
    return request('/config', { timeout: 8000 });
  }

  function getLiveState() {
    return request('/state/live', { method: 'POST', timeout: 12000 });
  }

  function cloudStatus() {
    return request('/cloud/status', { timeout: 30000 });
  }

  function storageHealth() {
    return request('/cloud/storage/health', { timeout: 20000 });
  }

  function createBackup() {
    return request('/cloud/backup', { method: 'POST', timeout: 30000 });
  }

  function listBackups() {
    return request('/cloud/backups', { timeout: 15000 });
  }

  function backupUrl(key) {
    return request(`/cloud/backups/url?key=${encodeURIComponent(key)}`, { timeout: 15000 });
  }

  function deleteBackup(key) {
    return request(`/cloud/backups?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
  }

  function functionHealth() {
    return request('/cloud/function/health', { timeout: 20000 });
  }

  function aiStatus() {
    return request('/cloud/ai/status', { timeout: 30000 });
  }

  function aiSuggest(goal) {
    return request('/cloud/ai/suggest', {
      method: 'POST',
      body: { goal },
      timeout: 45000
    });
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
    getAuthClient,
    request,
    register,
    login,
    logout,
    me,
    getState,
    putState,
    deleteState,
    health,
    getConfig,
    getLiveState,
    cloudStatus,
    storageHealth,
    createBackup,
    listBackups,
    backupUrl,
    deleteBackup,
    functionHealth,
    aiStatus,
    aiSuggest
  };
})();
