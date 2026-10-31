/* Ponto de entrada da API do Fluxo. */
'use strict';

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createApp } = require('./app');
const { checkAuthConfig } = require('./auth');
const { checkConfig, ensureSchema, closePool } = require('./db');
const store = require('./store');

const PORT = Number(process.env.PORT || 3000);

let server = null;
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Fluxo API] Encerrando (${signal})...`);

  if (!server) {
    process.exit(0);
    return;
  }

  server.close(async () => {
    try {
      await closePool();
    } finally {
      process.exit(0);
    }
  });

  setTimeout(() => process.exit(1), 10000).unref();
}

async function start() {
  checkConfig();
  checkAuthConfig();

  const app = createApp({
    store,
    enableRateLimit: process.env.NODE_ENV !== 'test'
  });

  await ensureSchema();
  console.log('[Fluxo API] Schema do banco verificado.');

  server = app.listen(PORT, () => {
    console.log(`[Fluxo API] Rodando em http://localhost:${PORT}`);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  console.error('[Fluxo API] Não foi possível iniciar:', err.message);
  process.exit(1);
});

module.exports = { start };
