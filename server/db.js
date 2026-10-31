/* Conexão com o Neon Postgres (Lakebase) e aplicação do schema. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client, Pool } = require('pg');

let pool = null;

function checkConfig() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não configurada.');
  }
}

function normalizeConnectionString(value) {
  if (!value) return value;
  try {
    const url = new URL(value);
    if (url.hostname.endsWith('.neon.tech') && url.searchParams.get('sslmode') === 'require') {
      url.searchParams.set('sslmode', 'verify-full');
    }
    return url.toString();
  } catch (err) {
    return value;
  }
}

function directConnectionString() {
  return normalizeConnectionString(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
}

function poolConfig() {
  return {
    connectionString: normalizeConnectionString(process.env.DATABASE_URL),
    max: Number(process.env.DB_POOL_SIZE || 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    application_name: 'fluxo-api'
  };
}

function getPool() {
  if (pool) return pool;
  checkConfig();
  pool = new Pool(poolConfig());
  pool.on('error', (err) => {
    console.error('[Fluxo DB] Erro em conexão ociosa do pool:', err.message);
  });
  return pool;
}

function readSchema() {
  return fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
}

/**
 * Aplica o schema usando a conexão direta (sem PgBouncer), como recomendado
 * para migrações no Neon. O DDL é idempotente.
 */
async function ensureSchema() {
  checkConfig();
  const client = new Client({
    connectionString: directConnectionString(),
    application_name: 'fluxo-schema'
  });

  await client.connect();
  try {
    await client.query(readSchema());
  } finally {
    await client.end();
  }
}

async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

module.exports = {
  checkConfig,
  directConnectionString,
  ensureSchema,
  getPool,
  poolConfig,
  readSchema,
  closePool
};
