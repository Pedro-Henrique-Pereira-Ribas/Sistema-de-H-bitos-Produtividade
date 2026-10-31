/* Prova ponta a ponta: Neon Auth + Neon Postgres + API do Fluxo.
 * Rode com: npm run test:e2e
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const { Client } = pg;
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.E2E_PORT || 3210);
const BASE = `http://localhost:${PORT}`;
const EMAIL = `fluxo-e2e-${Date.now()}@example.com`;
const PASSWORD = 'senha-e2e-123';
const NAME = 'Fluxo E2E';

dotenv.config({ path: path.join(ROOT, '.env') });

let cookie = '';
let server = null;

function log(message) {
  console.log(`✓ ${message}`);
}

function updateCookie(response) {
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [];

  for (const value of setCookies) {
    const [pair, ...attributes] = value.split(';');
    if (!pair.startsWith('neon-auth.session_token=')) continue;

    const expired = attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute));
    cookie = expired ? '' : pair;
  }
}

async function api(route, { method = 'GET', body, useCookie = true } = {}) {
  const headers = { origin: BASE };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (useCookie && cookie) headers.cookie = cookie;

  const response = await fetch(`${BASE}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  updateCookie(response);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      data = text;
    }
  }
  return { status: response.status, data, headers: response.headers };
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    let errors = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`O servidor não iniciou em 30s.\n${output}\n${errors}`));
    }, 30000);

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('Rodando em')) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.stderr.on('data', (chunk) => {
      errors += chunk.toString();
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`O servidor encerrou com código ${code}.\n${output}\n${errors}`));
    });
  });
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      resolve();
    }, 8000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

async function databaseCheck(userId) {
  const raw = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  let connectionString = raw;
  try {
    const url = new URL(raw);
    // Evita o aviso de SSL do pg e mantém a verificação completa do certificado.
    if (url.hostname.endsWith('.neon.tech') && url.searchParams.get('sslmode') === 'require') {
      url.searchParams.set('sslmode', 'verify-full');
    }
    connectionString = url.toString();
  } catch (err) {
    connectionString = raw;
  }

  const client = new Client({
    connectionString,
    application_name: 'fluxo-e2e'
  });
  await client.connect();
  try {
    const { rows } = await client.query(
      'SELECT data, revision FROM user_states WHERE user_id = $1',
      [userId]
    );
    return rows[0] || null;
  } finally {
    await client.end();
  }
}

async function main() {
  assert.ok(existsSync(path.join(ROOT, 'vendor', 'neon-auth.js')), 'vendor/neon-auth.js não foi gerado. Rode npm run build.');

  server = await startServer();
  log(`Servidor iniciado em ${BASE}`);

  let response = await api('/api/health');
  assert.equal(response.status, 200, 'health deveria responder 200');
  assert.equal(response.data.ok, true);
  log('GET /api/health conectou ao Neon Postgres');

  response = await api('/api/me', { useCookie: false });
  assert.equal(response.status, 401, '/api/me deveria exigir sessão');
  log('GET /api/me sem sessão retornou 401');

  response = await api('/api/auth/sign-up/email', {
    method: 'POST',
    useCookie: false,
    body: { name: NAME, email: EMAIL, password: PASSWORD }
  });
  assert.ok([200, 201].includes(response.status), `sign-up falhou: ${response.status} ${JSON.stringify(response.data)}`);
  assert.ok(response.data && response.data.user && response.data.user.id, 'sign-up não devolveu usuário');
  assert.ok(cookie, 'sign-up não definiu o cookie de sessão');
  const userId = response.data.user.id;
  log(`Neon Auth criou a conta ${EMAIL} (${userId})`);

  response = await api('/api/me');
  assert.equal(response.status, 200, 'sessão não foi aceita em /api/me');
  assert.equal(response.data.user.id, userId);
  assert.equal(response.data.user.email, EMAIL);
  log('Sessão do Neon Auth validada em GET /api/me');

  response = await api('/api/state');
  assert.equal(response.status, 200);
  assert.equal(response.data.data, null);
  assert.equal(response.data.revision, 0);
  log('GET /api/state iniciou vazio no Neon Postgres');

  const payload = {
    version: 1,
    habits: [{ id: 'h1', name: 'Ler 20 páginas' }],
    tasks: [{ id: 't1', title: 'Testar Neon', done: false }],
    focus: {},
    pomodoro: { sessions: {} }
  };

  response = await api('/api/state', {
    method: 'PUT',
    body: { data: payload, baseRevision: 0 }
  });
  assert.equal(response.status, 200, `PUT /api/state falhou: ${JSON.stringify(response.data)}`);
  assert.equal(response.data.revision, 1);
  log('PUT /api/state gravou a revisão 1');

  response = await api('/api/state');
  assert.equal(response.status, 200);
  assert.equal(response.data.revision, 1);
  assert.equal(response.data.data.habits[0].name, 'Ler 20 páginas');
  log('GET /api/state devolveu os dados gravados');

  const row = await databaseCheck(userId);
  assert.ok(row, 'linha não encontrada em user_states');
  assert.equal(Number(row.revision), 1);
  assert.equal(row.data.habits[0].name, 'Ler 20 páginas');
  log('Consulta direta ao Neon Postgres confirmou a linha em user_states');

  response = await api('/api/config');
  assert.equal(response.status, 200);
  assert.equal(response.data.realtime.configured, true);
  assert.ok(String(response.data.realtime.url).startsWith('wss://'));
  log('GET /api/config expôs a URL wss do Neon Realtime sem o segredo');

  response = await api('/api/cloud/status');
  assert.equal(response.status, 200, `status da nuvem falhou: ${JSON.stringify(response.data)}`);
  assert.equal(response.data.postgres, true);
  assert.equal(response.data.auth, true);
  assert.ok(response.data.storage && response.data.storage.ok, 'Object Storage não respondeu');
  assert.ok(response.data.functions && response.data.functions.ok, 'Neon Function não respondeu');
  assert.ok(response.data.realtime && response.data.realtime.configured, 'Realtime não configurado');
  log('GET /api/cloud/status confirmou Postgres, Auth, Storage, Functions e Realtime');

  response = await api('/api/cloud/function/health');
  assert.equal(response.status, 200, `Function falhou: ${JSON.stringify(response.data)}`);
  assert.equal(response.data.ok, true);
  assert.equal(response.data.service, 'fluxo-function');
  assert.ok(Number(response.data.stateCount) >= 1);
  log('Neon Function consultou o Postgres e contou user_states');

  response = await api('/api/cloud/storage/health');
  assert.equal(response.status, 200, `Storage falhou: ${JSON.stringify(response.data)}`);
  assert.equal(response.data.ok, true);
  assert.equal(response.data.bucket, process.env.FLUXO_BACKUP_BUCKET || 'fluxo-backups');
  log('Neon Object Storage completou put/get/delete de verificação');

  response = await api('/api/cloud/backup', { method: 'POST' });
  assert.equal(response.status, 200, `Backup falhou: ${JSON.stringify(response.data)}`);
  assert.equal(response.data.ok, true);
  assert.ok(response.data.key.startsWith(`users/${userId}/backups/`));
  assert.ok(Number(response.data.bytes) > 0);
  const backupKey = response.data.key;
  log(`Backup do estado salvo no bucket ${response.data.bucket}`);

  response = await api('/api/cloud/backups');
  assert.equal(response.status, 200);
  assert.ok(response.data.backups.some((item) => item.key === backupKey));
  log('Listagem do Object Storage encontrou o backup recém-criado');

  response = await api(`/api/cloud/backups/url?key=${encodeURIComponent(backupKey)}`);
  assert.equal(response.status, 200);
  assert.ok(String(response.data.url).startsWith('http'));
  log('URL pré-assinada do backup foi emitida');

  response = await api(`/api/cloud/backups?key=${encodeURIComponent(backupKey)}`, { method: 'DELETE' });
  assert.equal(response.status, 200);
  assert.equal(response.data.ok, true);
  log('Backup de teste removido do Object Storage');

  response = await api('/api/state/live', { method: 'POST' });
  assert.equal(response.status, 200, `Realtime falhou: ${JSON.stringify(response.data)}`);
  assert.ok(response.data.capability, 'Realtime não devolveu capability');
  assert.ok(Number(response.data.expiresAt) > Date.now(), 'capability já expirada');
  log('Neon Realtime emitiu uma query selada para o estado do usuário');

  response = await api('/api/cloud/ai/status');
  assert.equal(response.status, 200);
  if (response.data.configured) {
    assert.equal(response.data.ok, true);
    log(`AI Gateway listou ${response.data.modelCount} modelos`);
  } else {
    assert.equal(response.data.ok, false);
    log('AI Gateway indisponível: plano Free não habilita o serviço (bloqueio esperado)');
  }

  response = await api('/api/cloud/ai/suggest', {
    method: 'POST',
    body: { goal: 'dormir melhor' }
  });
  if (response.data && response.data.ok) {
    assert.equal(response.status, 200);
    assert.ok(response.data.suggestion);
    log('AI Gateway devolveu uma sugestão de hábito');
  } else {
    assert.equal(response.status, 503, 'AI Gateway sem configuração deveria responder 503');
    assert.equal(response.data.code, 'AI_GATEWAY_NOT_CONFIGURED');
    log('POST /api/cloud/ai/suggest respondeu 503 com o bloqueio do plano Free');
  }

  await stopServer(server);
  server = await startServer();
  log('Servidor reiniciado para provar persistência');

  response = await api('/api/me');
  assert.equal(response.status, 200, 'sessão não sobreviveu ao reinício');
  log('Sessão do Neon Auth sobreviveu ao reinício do servidor');

  response = await api('/api/state');
  assert.equal(response.status, 200);
  assert.equal(response.data.revision, 1);
  assert.equal(response.data.data.habits[0].name, 'Ler 20 páginas');
  log('Estado persistiu no Neon Postgres após o reinício');

  response = await api('/api/state', {
    method: 'PUT',
    body: { data: { ...payload, tasks: [] }, baseRevision: 1 }
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.revision, 2);
  log('PUT /api/state avançou para a revisão 2');

  response = await api('/api/state', {
    method: 'PUT',
    body: { data: payload, baseRevision: 1 }
  });
  assert.equal(response.status, 409);
  assert.equal(response.data.state.revision, 2);
  log('Conflito de revisão retornou 409 com a versão atual');

  response = await api('/api/state', { method: 'DELETE' });
  assert.equal(response.status, 200);
  assert.equal(response.data.ok, true);

  response = await api('/api/state');
  assert.equal(response.data.data, null);
  assert.equal(response.data.revision, 0);
  assert.equal(await databaseCheck(userId), null);
  log('DELETE /api/state removeu o estado do Neon Postgres');

  response = await api('/api/auth/sign-in/email', {
    method: 'POST',
    useCookie: false,
    body: { email: EMAIL, password: PASSWORD }
  });
  assert.equal(response.status, 200, `sign-in falhou: ${response.status} ${JSON.stringify(response.data)}`);
  assert.ok(cookie, 'sign-in não definiu o cookie de sessão');
  log('Neon Auth aceitou sign-in com e-mail e senha');

  response = await api('/api/me');
  assert.equal(response.status, 200);
  assert.equal(response.data.user.id, userId);
  log('Nova sessão do Neon Auth validada em GET /api/me');

  response = await api('/api/auth/sign-out', {
    method: 'POST',
    body: {}
  });
  assert.ok([200, 204].includes(response.status), `sign-out falhou: ${response.status}`);
  cookie = '';
  log('Neon Auth encerrou a sessão com sign-out');

  response = await api('/api/me', { useCookie: false });
  assert.equal(response.status, 401);
  log('GET /api/me após sign-out retornou 401');

  response = await api('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.data.ok, true);
  log('GET /api/health final continuou saudável');

  console.log('\nE2E OK: Neon Auth, Postgres, Object Storage, Functions e Realtime de ponta a ponta.');
}

main()
  .catch(async (err) => {
    console.error('\nE2E FALHOU:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopServer(server);
  });
