/* Testes de integração da API com um store em memória. Rode: npm test */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../app');

function createFakeStore() {
  const users = new Map();
  const states = new Map();

  return {
    users,
    states,
    async health() {
      return true;
    },
    async createUser({ id, name, email, passwordHash }) {
      const user = { id, name, email, password_hash: passwordHash, created_at: Date.now() };
      users.set(id, user);
      return { id, name, email, createdAt: user.created_at };
    },
    async findUserByEmail(email) {
      return [...users.values()].find((user) => user.email === email) || null;
    },
    async findUserById(id) {
      return users.get(id) || null;
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

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';
const store = createFakeStore();
const app = createApp({ store, jwtSecret: SECRET, enableRateLimit: false });

let server;
let base;

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
});

async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

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

let token;
let userId;

test('health responde ok', async () => {
  const { status, data } = await api('/api/health');
  assert.equal(status, 200);
  assert.equal(data.ok, true);
});

test('cadastro rejeita senha curta', async () => {
  const { status, data } = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Ana', email: 'ana@example.com', password: '123' }
  });
  assert.equal(status, 400);
  assert.match(data.error, /8 caracteres/);
});

test('cadastro cria usuário e devolve token', async () => {
  const { status, data } = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Ana Silva', email: 'ana@example.com', password: 'senha-segura' }
  });
  assert.equal(status, 201);
  assert.ok(data.token);
  assert.equal(data.user.name, 'Ana Silva');
  assert.equal(data.user.email, 'ana@example.com');
  assert.equal(data.user.password_hash, undefined);
  token = data.token;
  userId = data.user.id;
});

test('cadastro duplicado é rejeitado', async () => {
  const { status } = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Ana', email: 'ana@example.com', password: 'outra-senha' }
  });
  assert.equal(status, 409);
});

test('login rejeita senha errada', async () => {
  const { status } = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'ana@example.com', password: 'senha-errada' }
  });
  assert.equal(status, 401);
});

test('login devolve token válido', async () => {
  const { status, data } = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'ANA@example.com', password: 'senha-segura' }
  });
  assert.equal(status, 200);
  assert.ok(data.token);
});

test('/me exige autenticação', async () => {
  const { status } = await api('/api/me');
  assert.equal(status, 401);
});

test('/me devolve o usuário autenticado', async () => {
  const { status, data } = await api('/api/me', { token });
  assert.equal(status, 200);
  assert.equal(data.user.id, userId);
});

test('estado inicial é vazio', async () => {
  const { status, data } = await api('/api/state', { token });
  assert.equal(status, 200);
  assert.equal(data.data, null);
  assert.equal(data.revision, 0);
});

test('primeira gravação cria revisão 1', async () => {
  const payload = { version: 1, habits: [{ id: 'h1', name: 'Ler' }], tasks: [] };
  const { status, data } = await api('/api/state', {
    method: 'PUT',
    token,
    body: { data: payload, baseRevision: 0 }
  });
  assert.equal(status, 200);
  assert.equal(data.revision, 1);

  const current = await api('/api/state', { token });
  assert.equal(current.data.revision, 1);
  assert.equal(current.data.data.habits[0].name, 'Ler');
});

test('gravação com revisão antiga gera conflito', async () => {
  const { status, data } = await api('/api/state', {
    method: 'PUT',
    token,
    body: { data: { version: 1, habits: [], tasks: [] }, baseRevision: 0 }
  });
  assert.equal(status, 409);
  assert.equal(data.state.revision, 1);
  assert.equal(data.state.data.habits[0].id, 'h1');
});

test('gravação com revisão correta avança para 2', async () => {
  const { status, data } = await api('/api/state', {
    method: 'PUT',
    token,
    body: { data: { version: 1, habits: [], tasks: [] }, baseRevision: 1 }
  });
  assert.equal(status, 200);
  assert.equal(data.revision, 2);
});

test('estado rejeita payload que não é objeto', async () => {
  const { status } = await api('/api/state', {
    method: 'PUT',
    token,
    body: { data: 'texto', baseRevision: 2 }
  });
  assert.equal(status, 400);
});

test('JSON inválido retorna 400', async () => {
  const { status } = await api('/api/state', {
    method: 'PUT',
    token,
    body: '{"data":'
  });
  assert.equal(status, 400);
});

test('limite de 1 MB é aplicado', async () => {
  const big = { version: 1, habits: [], tasks: [], padding: 'x'.repeat(1024 * 1024) };
  const { status } = await api('/api/state', {
    method: 'PUT',
    token,
    body: { data: big, baseRevision: 2 }
  });
  assert.equal(status, 413);
});

test('DELETE /state apaga os dados da conta', async () => {
  const { status, data } = await api('/api/state', { method: 'DELETE', token });
  assert.equal(status, 200);
  assert.equal(data.ok, true);

  const current = await api('/api/state', { token });
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
