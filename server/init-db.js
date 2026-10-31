/* Aplica o schema no Neon Postgres. Rode quando quiser: npm run db:init */
'use strict';

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Client } = require('pg');
const { directConnectionString, readSchema } = require('./db');

async function main() {
  const connectionString = directConnectionString();
  if (!connectionString) {
    throw new Error('DATABASE_URL não configurada.');
  }

  const client = new Client({
    connectionString,
    application_name: 'fluxo-schema'
  });

  await client.connect();
  try {
    await client.query(readSchema());
    const { rows } = await client.query('SELECT current_database() AS db');
    console.log(`[Fluxo] Schema aplicado no banco "${rows[0].db}".`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[Fluxo] Falha ao preparar o banco:', err.message);
  process.exit(1);
});
