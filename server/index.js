/* Ponto de entrada da API do Fluxo. */
'use strict';

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createApp } = require('./app');
const store = require('./store');
const { ensureSchema, closePool } = require('./db');

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('[Fluxo API] Configure JWT_SECRET com pelo menos 32 caracteres.');
  process.exit(1);
}

const app = createApp({
  store,
  jwtSecret: JWT_SECRET,
  enableRateLimit: process.env.NODE_ENV !== 'test'
});

const server = app.listen(PORT, () => {
  console.log(`[Fluxo API] Rodando em http://localhost:${PORT}`);
});

ensureSchema()
  .then(() => console.log('[Fluxo API] Schema do banco verificado.'))
  .catch((err) => {
    console.error('[Fluxo API] Não foi possível preparar o banco:', err.message);
    console.error('[Fluxo API] Confira as variáveis DB_* e rode "npm run db:init".');
  });

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Fluxo API] Encerrando (${signal})...`);

  server.close(async () => {
    try {
      await closePool();
    } finally {
      process.exit(0);
    }
  });

  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { server };
