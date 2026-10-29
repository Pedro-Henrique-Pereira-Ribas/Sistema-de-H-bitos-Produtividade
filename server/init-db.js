/* Cria o banco e as tabelas no TiDB Cloud. Rode uma vez: npm run db:init */
'use strict';

const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');
const { baseConfig } = require('./db');

async function main() {
  const missing = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'].filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Variáveis de ambiente ausentes: ${missing.join(', ')}`);
  }

  const database = process.env.DB_NAME;
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error('DB_NAME deve conter apenas letras, números e sublinhado.');
  }

  const connection = await mysql.createConnection({
    ...baseConfig(),
    database: undefined,
    multipleStatements: false
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await connection.query(`USE \`${database}\``);

    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    const statements = sql
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await connection.query(statement);
    }

    console.log(`[Fluxo] Banco "${database}" pronto em ${process.env.DB_HOST}.`);
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('[Fluxo] Falha ao preparar o banco:', err.message);
  process.exit(1);
});
