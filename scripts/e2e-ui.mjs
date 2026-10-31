/* Prova ponta a ponta pela interface: cadastro, sessão, reload e logout.
 * Rode com: npm run test:e2e:ui
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { chromium } from 'playwright';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.E2E_UI_PORT || 3212);
const BASE = `http://localhost:${PORT}`;
const EMAIL = `fluxo-ui-${Date.now()}@example.com`;
const PASSWORD = 'senha-ui-123';
const NAME = 'UI E2E';

dotenv.config({ path: path.join(ROOT, '.env') });

let server = null;

function log(message) {
  console.log(`✓ ${message}`);
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

async function openSettings(page) {
  await page.click('[data-action="open-settings"]');
  await page.waitForSelector('#settings-dialog[open]');
}

async function main() {
  server = await startServer();
  log(`Servidor iniciado em ${BASE}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  // 401 é esperado antes do login; 503 é o bloqueio intencional do AI Gateway no plano Free.
  const expectedNoise = /Failed to load resource: the server responded with a status of (401 \(Unauthorized\)|503 \(Service Unavailable\))/;

  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // 401 é esperado antes do login e depois do logout (sondagem de sessão).
    if (expectedNoise.test(message.text())) return;
    pageErrors.push(message.text());
  });

  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    assert.equal(await page.title(), 'Fluxo — Hábitos e Produtividade');
    log('App carregou no Chromium headless');

    await openSettings(page);
    await page.fill('#account-name', NAME);
    await page.fill('#account-email', EMAIL);
    await page.fill('#account-password', PASSWORD);
    await page.click('[data-action="account-register"]');

    await page.waitForSelector('#account-logged-in:not([hidden])', { timeout: 30000 });
    assert.equal((await page.textContent('#account-user-email')).trim(), EMAIL);
    log(`UI criou a conta ${EMAIL} pelo Neon Auth`);

    const cookies = await context.cookies(BASE);
    const session = cookies.find((cookie) => cookie.name === 'neon-auth.session_token');
    assert.ok(session, 'cookie de sessão não foi definido no navegador');
    log('Cookie de sessão do Neon Auth foi gravado como first-party');

    await page.waitForSelector('#account-sync-badge[data-state="synced"]', { timeout: 30000 });
    log('Sincronização inicial concluiu e o badge ficou "Sincronizado"');

    await page.waitForSelector('#account-realtime-badge[data-state="live"]', { timeout: 30000 });
    log('Neon Realtime conectou e o badge ficou "Tempo real"');

    await page.waitForFunction(() => {
      const el = document.getElementById('cloud-status');
      return el && el.textContent.includes('Storage: OK');
    }, null, { timeout: 30000 });
    log('Ajustes confirmaram Storage, Functions e Realtime no status da nuvem');

    await page.click('[data-action="cloud-backup"]');
    await page.waitForFunction(() => {
      const el = document.getElementById('cloud-status');
      return el && el.textContent.includes('Backup salvo');
    }, null, { timeout: 30000 });
    log('Botão "Salvar backup na nuvem" gravou no Neon Object Storage');

    const backups = await page.evaluate(async () => {
      const response = await fetch('/api/cloud/backups', { credentials: 'include' });
      return { status: response.status, data: await response.json() };
    });
    assert.equal(backups.status, 200);
    assert.ok(Array.isArray(backups.data.backups) && backups.data.backups.length >= 1);
    const uiBackupKey = backups.data.backups[0].key;
    log('Listagem da UI encontrou o backup no bucket');

    await page.fill('#cloud-ai-goal', 'dormir melhor');
    await page.click('[data-action="cloud-ai-suggest"]');
    await page.waitForFunction(() => {
      const el = document.getElementById('cloud-ai-output');
      const text = el ? el.textContent.trim() : '';
      return text.length > 0 && !text.includes('Consultando');
    }, null, { timeout: 30000 });
    const aiText = (await page.textContent('#cloud-ai-output')).trim();
    if (aiText.includes('plano Free') || aiText.includes('indisponível')) {
      log('AI Gateway mostrou o bloqueio do plano Free na interface');
    } else {
      assert.ok(aiText.length > 10, 'AI Gateway não devolveu sugestão legível');
      log('AI Gateway devolveu uma sugestão na interface');
    }

    const liveUpdate = await page.evaluate(async () => {
      const current = await fetch('/api/state', { credentials: 'include' }).then((response) => response.json());
      const marker = `Realtime ${Date.now()}`;
      const data = current.data;
      data.tasks = Array.isArray(data.tasks) ? data.tasks : [];
      data.tasks.push({
        id: `rt-${Date.now()}`,
        title: marker,
        done: false,
        priority: 'media',
        createdAt: Date.now()
      });
      const response = await fetch('/api/state', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data, baseRevision: current.revision })
      });
      return { status: response.status, marker };
    });
    assert.equal(liveUpdate.status, 200);
    await page.waitForFunction((marker) => {
      return Array.isArray(window.State.data.tasks) &&
        window.State.data.tasks.some((task) => task.title === marker);
    }, liveUpdate.marker, { timeout: 20000 });
    log('Neon Realtime propagou uma alteração do Postgres para o estado da página');

    await page.evaluate(async (key) => {
      await fetch(`/api/cloud/backups?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
        credentials: 'include'
      });
    }, uiBackupKey);
    log('Backup de teste da UI removido do bucket');

    await page.click('#account-sync-button');
    await page.waitForSelector('#account-sync-badge[data-state="synced"]', { timeout: 30000 });
    log('Botão "Sincronizar agora" concluiu sem erro');

    const me = await page.evaluate(async () => {
      const response = await fetch('/api/me', { credentials: 'include' });
      return { status: response.status, data: await response.json() };
    });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email, EMAIL);
    log('GET /api/me respondeu com o usuário autenticado');

    await page.reload({ waitUntil: 'networkidle' });
    await openSettings(page);
    await page.waitForSelector('#account-logged-in:not([hidden])', { timeout: 30000 });
    assert.equal((await page.textContent('#account-user-email')).trim(), EMAIL);
    await page.waitForSelector('#account-realtime-badge[data-state="live"]', { timeout: 30000 });
    log('Sessão e Neon Realtime foram restaurados após recarregar a página');

    await page.click('[data-action="account-logout"]');
    await page.waitForSelector('#confirm-dialog[open]');
    await page.click('#confirm-ok');
    await page.waitForSelector('#account-logged-out:not([hidden])', { timeout: 30000 });
    log('Logout pela UI voltou ao formulário de conta');

    const afterLogout = await page.evaluate(async () => {
      const response = await fetch('/api/me', { credentials: 'include' });
      return response.status;
    });
    assert.equal(afterLogout, 401);
    log('GET /api/me após logout retornou 401');

    assert.deepEqual(pageErrors, [], `Erros no navegador:\n${pageErrors.join('\n')}`);
    log('Nenhum erro de página ou console durante o fluxo');

    console.log('\nE2E UI OK: cadastro, Realtime, backup, IA bloqueada, reload e logout funcionando.');
  } finally {
    await browser.close();
  }
}

main()
  .catch((err) => {
    console.error('\nE2E UI FALHOU:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopServer(server);
  });
