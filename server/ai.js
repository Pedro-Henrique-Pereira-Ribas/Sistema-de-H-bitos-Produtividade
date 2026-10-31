/* Neon AI Gateway: catálogo de modelos e sugestões de hábitos.
 * O gateway é OpenAI-compatível no dialeto /v1 (Chat Completions).
 */
'use strict';

const { cloudError } = require('./cloud-error');

function gateway() {
  const baseUrl = String(process.env.NEON_AI_GATEWAY_BASE_URL || '').replace(/\/+$/, '');
  const token = process.env.NEON_AI_GATEWAY_TOKEN || '';
  return baseUrl && token ? { baseUrl, token } : null;
}

function configured() {
  return Boolean(gateway());
}

function model() {
  return process.env.NEON_AI_MODEL || 'gpt-5-mini';
}

function requireGateway() {
  const config = gateway();
  if (!config) {
    throw cloudError(
      503,
      'AI Gateway indisponível: o plano Free do Neon não habilita o gateway. Faça upgrade para Launch/Scale e adicione créditos.',
      'AI_GATEWAY_NOT_CONFIGURED'
    );
  }
  return config;
}

async function upstream(path, options = {}) {
  const config = requireGateway();
  let response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      signal: AbortSignal.timeout(30000)
    });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw cloudError(504, 'O AI Gateway demorou para responder.', 'AI_GATEWAY_TIMEOUT');
    }
    throw cloudError(502, 'Não foi possível falar com o AI Gateway.', 'AI_GATEWAY_UNAVAILABLE');
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
    const detail = payload && (payload.error?.message || payload.error || payload.message);
    throw cloudError(
      502,
      `AI Gateway respondeu com status ${response.status}${detail ? `: ${String(detail).slice(0, 240)}` : '.'}`,
      'AI_GATEWAY_ERROR'
    );
  }

  return payload;
}

async function status() {
  if (!configured()) {
    return {
      configured: false,
      ok: false,
      reason: 'AI Gateway exige plano Neon pago (Launch/Scale) e créditos pré-pagos.'
    };
  }

  const payload = await upstream('/v1/models', { method: 'GET' });
  const models = Array.isArray(payload && payload.data) ? payload.data : [];
  return {
    configured: true,
    ok: true,
    model: model(),
    modelCount: models.length,
    enabledModelCount: models.filter((item) => item && item.enabled !== false).length
  };
}

async function suggest(goal) {
  const text = String(goal || '').trim();
  if (text.length < 3) {
    throw cloudError(400, 'Descreva um objetivo com pelo menos 3 caracteres.', 'INVALID_AI_GOAL');
  }
  if (text.length > 300) {
    throw cloudError(400, 'O objetivo deve ter no máximo 300 caracteres.', 'INVALID_AI_GOAL');
  }

  const payload = await upstream('/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: model(),
      messages: [
        {
          role: 'system',
          content:
            'Você ajuda a criar hábitos pequenos e realistas. Responda em português do Brasil, em uma única frase curta, começando com um verbo no infinitivo.'
        },
        {
          role: 'user',
          content: `Objetivo: ${text}. Sugira um hábito diário concreto, fácil de medir e que caiba na rotina.`
        }
      ],
      max_tokens: 160
    })
  });

  const content = payload &&
    payload.choices &&
    payload.choices[0] &&
    payload.choices[0].message &&
    payload.choices[0].message.content;

  if (!content) {
    throw cloudError(502, 'O AI Gateway não devolveu uma sugestão.', 'AI_GATEWAY_EMPTY_RESPONSE');
  }

  return { ok: true, model: model(), suggestion: String(content).trim() };
}

module.exports = {
  configured,
  status,
  suggest,
  model
};
