/* Neon Realtime: emite capabilities seladas para o estado do usuário.
 * O segredo nunca sai do servidor; o navegador recebe apenas a query selada.
 */
'use strict';

const { cloudError } = require('./cloud-error');

let serverPromise = null;

function databaseName() {
  if (!process.env.DATABASE_URL) {
    throw cloudError(503, 'DATABASE_URL não configurada.', 'REALTIME_NOT_CONFIGURED');
  }
  try {
    const url = new URL(process.env.DATABASE_URL);
    return decodeURIComponent(url.pathname.replace(/^\/+/, '')) || 'neondb';
  } catch (err) {
    return 'neondb';
  }
}

function configured() {
  return Boolean(process.env.NEON_REALTIME_SECRET && process.env.NEON_REALTIME_URL);
}

function publicConfig() {
  return {
    configured: configured(),
    url: process.env.NEON_REALTIME_URL || null
  };
}

async function getServer() {
  if (!configured()) {
    throw cloudError(
      503,
      'Neon Realtime não configurado. Rode `neon deploy` para habilitar o Realtime.',
      'REALTIME_NOT_CONFIGURED'
    );
  }

  if (!serverPromise) {
    serverPromise = import('@neon/realtime/server').then(({ createRealtime }) =>
      createRealtime({
        secret: process.env.NEON_REALTIME_SECRET,
        db: databaseName()
      })
    );
  }

  return serverPromise;
}

async function sealState(userId) {
  const realtime = await getServer();
  const { rawSql } = await import('@neon/realtime/server');
  const query = rawSql(
    `SELECT user_id, data, revision, updated_at
       FROM user_states
      WHERE user_id = $1`,
    [userId]
  );

  return realtime.seal({ query });
}

module.exports = { configured, publicConfig, sealState };
