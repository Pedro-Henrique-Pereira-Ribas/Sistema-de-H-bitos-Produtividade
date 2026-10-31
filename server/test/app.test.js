/* Testes de integração da API com store e autenticação em memória. Rode: npm test */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../app');

function createFakeStore() {
  const states = new Map();

  return {
    states,
    async health() {
      return true;
    },
    async getState(userId) {
      const row = states.get(userId);
      if (!row) return { data: null, revision: 0, updatedAt: null };
      return { data: JSON.parse(row.data), revision: row.revision, updatedAt: row.updatedAt };
    },
    async saveState(userId, dataJson, baseRevision) {
      const row = states.get(userId);
      const now = Date.now();

      if (!row) {
        if (Number(baseRevision) !== 0) return { conflict: true, current: null };
        states.set(userId, { data: dataJson, revision: 1, updatedAt: now });
        return { conflict: false, revision: 1, updatedAt: now };
      }

      if (row.revision !== Number(baseRevision)) {
        return {
          conflict: true,
          current: {
            data: JSON.parse(row.data),
            revision: row.revision,
            updatedAt: row.updatedAt
          }
        };
      }

      row.data = dataJson;
      row.revision += 1;
      row.updatedAt = now;
      return { conflict: false, revision: row.revision, updatedAt: now };
    },
    async deleteState(userId) {
      return states.delete(userId);
    }
  };
}

function createFakeAuth() {
  const sessions = new Map();

  return {
    sessions,
    requireAuth(req, res, next) {
      const token = req.get('x-test-session');
      const user = sessions.get(token);
      if (!user) return res.status(401).json({ error: 'Faça login para continuar.' });
      req.user = user;
      req.userId = user.id;
      return next();
    },
    proxy(req, res) {
      return res.status(404).json({ error: 'Rota de autenticação de teste.' });
    }
  };
}

const store = createFakeStore();
const auth = createFakeAuth();
const app = createApp({ store, auth, enableRateLimit: false });

const USER = { id: '11111111-1111-4111-8111-111111111111', name: 'Ana Silva', email: 'ana@example.com' };
const SESSION = 'sessao-de-teste';

let server;
let base;

test.before(async () => {
  auth.sessions.set(SESSION, USER);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
});

async function api(path, { method = 'GET', body, session = SESSION } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session) headers['x-test-session'] = session;

  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      data = text;
    }
  }
  return { status: response.status, data };
}

test('health responde ok', async () => {
  const { status, data } = await api('/api/health');
  assert.equal(status, 200);
  assert.equal(data.ok, true);
});

test('/me exige autenticação', async () => {
  const { status } = await api('/api/me', { session: null });
  assert.equal(status, 401);
});

test('/me devolve o usuário autenticado', async () => {
  const { status, data } = await api('/api/me');
  assert.equal(status, 200);
  assert.equal(data.user.id, USER.id);
  assert.equal(data.user.name, USER.name);
  assert.equal(data.user.email, USER.email);
  assert.equal(data.user.password_hash, undefined);
});

test('estado inicial é vazio', async () => {
  const { status, data } = await api('/api/state');
  assert.equal(status, 200);
  assert.equal(data.data, null);
  assert.equal(data.revision, 0);
});

test('primeira gravação cria revisão 1', async () => {
  const payload = { version: 1, habits: [{ id: 'h1', name: 'Ler' }], tasks: [] };
  const { status, data } = await api('/api/state', {
    method: 'PUT',
    body: { data: payload, baseRevision: 0 }
  });
  assert.equal(status, 200);
  assert.equal(data.revision, 1);

  const current = await api('/api/state');
  assert.equal(current.data.revision, 1);
  assert.equal(current.data.data.habits[0].name, 'Ler');
});

test('gravação com revisão antiga gera conflito', async () => {
  const { status, data } = await api('/api/state', {
    method: 'PUT',
    body: { data: { version: 1, habits: [], tasks: [] }, baseRevision: 0 }
  });
  assert.equal(status, 409);
  assert.equal(data.state.revision, 1);
  assert.equal(data.state.data.habits[0].id, 'h1');
});

test('gravação com revisão correta avança para 2', async () => {
  const { status, data } = await api('/api/state', {
    method: 'PUT',
    body: { data: { version: 1, habits: [], tasks: [] }, baseRevision: 1 }
  });
  assert.equal(status, 200);
  assert.equal(data.revision, 2);
});

test('estado rejeita payload que não é objeto', async () => {
  const { status } = await api('/api/state', {
    method: 'PUT',
    body: { data: 'texto', baseRevision: 2 }
  });
  assert.equal(status, 400);
});

test('JSON inválido retorna 400', async () => {
  const { status } = await api('/api/state', {
    method: 'PUT',
    body: '{"data":'
  });
  assert.equal(status, 400);
});

test('limite de 1 MB é aplicado', async () => {
  const big = { version: 1, habits: [], tasks: [], padding: 'x'.repeat(1024 * 1024) };
  const { status } = await api('/api/state', {
    method: 'PUT',
    body: { data: big, baseRevision: 2 }
  });
  assert.equal(status, 413);
});

test('DELETE /state apaga os dados da conta', async () => {
  const { status, data } = await api('/api/state', { method: 'DELETE' });
  assert.equal(status, 200);
  assert.equal(data.ok, true);

  const current = await api('/api/state');
  assert.equal(current.data.data, null);
  assert.equal(current.data.revision, 0);
});

test('rota de API desconhecida retorna 404', async () => {
  const { status } = await api('/api/nao-existe');
  assert.equal(status, 404);
});

test('app estático responde index.html', async () => {
  const { status, data } = await api('/');
  assert.equal(status, 200);
  assert.match(String(data), /Fluxo/);
});
