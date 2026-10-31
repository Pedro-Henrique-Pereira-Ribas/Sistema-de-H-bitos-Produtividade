/* Neon Functions: chamada server-to-server para o status do Fluxo. */
'use strict';

const { cloudError } = require('./cloud-error');

function baseUrl() {
  return String(process.env.NEON_FUNCTION_FLUXOSTATUS_BASE_URL || '').replace(/\/+$/, '');
}

function configured() {
  return Boolean(baseUrl() && process.env.FLUXO_FUNCTION_KEY);
}

async function health() {
  if (!configured()) {
    throw cloudError(
      503,
      'Neon Functions não configurado. Rode `neon deploy` para publicar a função fluxostatus.',
      'FUNCTION_NOT_CONFIGURED'
    );
  }

  let response;
  try {
    response = await fetch(`${baseUrl()}/health`, {
      headers: { 'x-fluxo-function-key': process.env.FLUXO_FUNCTION_KEY },
      signal: AbortSignal.timeout(20000)
    });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw cloudError(504, 'A Neon Function demorou para responder.', 'FUNCTION_TIMEOUT');
    }
    throw cloudError(502, 'Não foi possível falar com a Neon Function.', 'FUNCTION_UNAVAILABLE');
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (err) {
      payload = null;
    }
  }

  if (!response.ok) {
    throw cloudError(
      502,
      `A Neon Function respondeu com status ${response.status}.`,
      'FUNCTION_ERROR'
    );
  }
  if (!payload || payload.ok !== true) {
    throw cloudError(502, 'A Neon Function devolveu uma resposta inválida.', 'FUNCTION_INVALID_RESPONSE');
  }

  return payload;
}

module.exports = { configured, health, baseUrl };
