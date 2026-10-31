/* Acesso ao Neon Postgres. Todas as consultas usam parâmetros preparados. */
'use strict';

const { getPool } = require('./db');

async function health() {
  const { rows } = await getPool().query('SELECT 1 AS ok');
  return rows[0] && Number(rows[0].ok) === 1;
}

function parseStateRow(row) {
  let data;
  try {
    data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  } catch (err) {
    throw new Error('O estado salvo no banco está corrompido.');
  }

  return {
    data,
    revision: Number(row.revision),
    updatedAt: Number(row.updated_at)
  };
}

async function getState(userId) {
  const { rows } = await getPool().query(
    'SELECT data, revision, updated_at FROM user_states WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  if (!rows.length) return { data: null, revision: 0, updatedAt: null };
  return parseStateRow(rows[0]);
}

async function readStateForUpdate(conn, userId) {
  const { rows } = await conn.query(
    'SELECT data, revision, updated_at FROM user_states WHERE user_id = $1 FOR UPDATE',
    [userId]
  );
  return rows[0] || null;
}

/**
 * Salva o estado com concorrência otimista.
 * Retorna { conflict:false, revision, updatedAt } ou { conflict:true, current }.
 */
async function saveState(userId, dataJson, baseRevision) {
  const pool = getPool();
  const conn = await pool.connect();
  const now = Date.now();

  try {
    await conn.query('BEGIN');
    const row = await readStateForUpdate(conn, userId);

    if (!row) {
      if (Number(baseRevision) !== 0) {
        await conn.query('ROLLBACK');
        return { conflict: true, current: null };
      }

      await conn.query(
        'INSERT INTO user_states (user_id, data, revision, updated_at) VALUES ($1, $2, 1, $3)',
        [userId, dataJson, now]
      );
      await conn.query('COMMIT');
      return { conflict: false, revision: 1, updatedAt: now };
    }

    const current = parseStateRow(row);
    if (Number(baseRevision) !== current.revision) {
      await conn.query('ROLLBACK');
      return { conflict: true, current };
    }

    const nextRevision = current.revision + 1;
    await conn.query(
      'UPDATE user_states SET data = $2, revision = $3, updated_at = $4 WHERE user_id = $1',
      [userId, dataJson, nextRevision, now]
    );
    await conn.query('COMMIT');
    return { conflict: false, revision: nextRevision, updatedAt: now };
  } catch (err) {
    try {
      await conn.query('ROLLBACK');
    } catch (rollbackErr) {
      /* a conexão será descartada pelo pool */
    }

    // Duas primeiras gravações simultâneas: uma delas vence a chave primária.
    if (err && err.code === '23505') {
      const current = await getState(userId);
      return { conflict: true, current: current.data ? current : null };
    }

    throw err;
  } finally {
    conn.release();
  }
}

async function deleteState(userId) {
  const result = await getPool().query('DELETE FROM user_states WHERE user_id = $1', [userId]);
  return result.rowCount > 0;
}

module.exports = {
  health,
  getState,
  saveState,
  deleteState
};
