/* Conexão com TiDB Cloud (compatível com MySQL) e criação do schema. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

let pool = null;

function sslConfig() {
  if (String(process.env.DB_SSL || 'true').toLowerCase() === 'false') return undefined;

  const ssl = {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false'
  };

  const ca = process.env.DB_SSL_CA;
  if (ca) ssl.ca = ca.replace(/\\n/g, '\n');

  return ssl;
}

function baseConfig() {
  const config = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 4000),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE || 5),
    queueLimit: 0,
    enableKeepAlive: true,
    timezone: 'Z'
  };

  const ssl = sslConfig();
  if (ssl) config.ssl = ssl;

  return config;
}

function checkConfig() {
  const missing = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'].filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Variáveis de ambiente ausentes: ${missing.join(', ')}`);
  }
}

function getPool() {
  if (pool) return pool;
  checkConfig();
  pool = mysql.createPool({
    ...baseConfig(),
    database: process.env.DB_NAME
  });
  return pool;
}

async function ensureSchema() {
  const db = getPool();
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const statements = sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.query(statement);
  }
}

async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

module.exports = { baseConfig, checkConfig, ensureSchema, getPool, closePool, sslConfig };
