/* Acesso ao banco. Todas as consultas usam parâmetros preparados. */
'use strict';

const { getPool } = require('./db');

async function health() {
  const [rows] = await getPool().query('SELECT 1 AS ok');
  return rows[0] && rows[0].ok === 1;
}

async function createUser({ id, name, email, passwordHash }) {
  const now = Date.now();
  await getPool().execute(
    'INSERT INTO users (id, name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, email, passwordHash, now, now]
  );
  return { id, name, email, createdAt: now };
}

async function findUserByEmail(email) {
  const [rows] = await getPool().execute(
    'SELECT id, name, email, password_hash, created_at FROM users WHERE email = ? LIMIT 1',
    [email]
  );
  return rows[0] || null;
}

async function findUserById(id) {
  const [rows] = await getPool().execute(
    'SELECT id, name, email, created_at FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

function parseStateRow(row) {
  let data;
  try {
    data = JSON.parse(row.data);
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
  const [rows] = await getPool().execute(
    'SELECT data, revision, updated_at FROM user_states WHERE user_id = ? LIMIT 1',
    [userId]
  );
  if (!rows.length) return { data: null, revision: 0, updatedAt: null };
  return parseStateRow(rows[0]);
}

async function readStateForUpdate(conn, userId) {
  const [rows] = await conn.execute(
    'SELECT data, revision, updated_at FROM user_states WHERE user_id = ? FOR UPDATE',
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
  const conn = await pool.getConnection();
  const now = Date.now();

  try {
    await conn.beginTransaction();
    const row = await readStateForUpdate(conn, userId);

    if (!row) {
      if (Number(baseRevision) !== 0) {
        await conn.rollback();
        return { conflict: true, current: null };
      }

      await conn.execute(
        'INSERT INTO user_states (user_id, data, revision, updated_at) VALUES (?, ?, 1, ?)',
        [userId, dataJson, now]
      );
      await conn.commit();
      return { conflict: false, revision: 1, updatedAt: now };
    }

    const current = parseStateRow(row);
    if (Number(baseRevision) !== current.revision) {
      await conn.rollback();
      return { conflict: true, current };
    }

    const nextRevision = current.revision + 1;
    await conn.execute(
      'UPDATE user_states SET data = ?, revision = ?, updated_at = ? WHERE user_id = ?',
      [dataJson, nextRevision, now, userId]
    );
    await conn.commit();
    return { conflict: false, revision: nextRevision, updatedAt: now };
  } catch (err) {
    try {
      await conn.rollback();
    } catch (rollbackErr) {
      /* a conexão será descartada pelo pool */
    }

    // Duas primeiras gravações simultâneas: uma delas vence a chave primária.
    if (err && err.code === 'ER_DUP_ENTRY') {
      const current = await getState(userId);
      return { conflict: true, current: current.data ? current : null };
    }

    throw err;
  } finally {
    conn.release();
  }
}

async function deleteState(userId) {
  const [result] = await getPool().execute('DELETE FROM user_states WHERE user_id = ?', [userId]);
  return result.affectedRows > 0;
}

async function deleteUser(userId) {
  await getPool().execute('DELETE FROM users WHERE id = ?', [userId]);
}

module.exports = {
  health,
  createUser,
  findUserByEmail,
  findUserById,
  getState,
  saveState,
  deleteState,
  deleteUser
};
