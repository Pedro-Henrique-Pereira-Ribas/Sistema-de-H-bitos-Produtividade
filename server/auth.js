/* Integração com o Neon Auth (Managed Better Auth).
 *
 * O navegador fala com /api/auth no mesmo domínio do app. Este módulo faz o
 * proxy para NEON_AUTH_BASE_URL e reescreve o cookie de sessão para que ele
 * funcione também em http://localhost durante o desenvolvimento.
 */
'use strict';

const SESSION_COOKIE = 'neon-auth.session_token';
const UPSTREAM_SESSION_COOKIE = '__Secure-neon-auth.session_token';
const FORWARD_HEADERS = [
  'accept',
  'accept-language',
  'content-type',
  'cookie',
  'origin',
  'referer',
  'user-agent'
];
const SKIP_RESPONSE_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'set-cookie',
  'transfer-encoding'
]);

function checkAuthConfig() {
  if (!process.env.NEON_AUTH_BASE_URL) {
    throw new Error('NEON_AUTH_BASE_URL não configurada.');
  }
}

function trimBase(value) {
  return String(value || '').replace(/\/+$/, '');
}

function isSecureRequest(req) {
  if (req.secure) return true;
  const proto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}

function selfOrigin(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function allowedOrigins(req) {
  const configured = String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return [selfOrigin(req), ...configured];
}

function isAllowedOrigin(req, origin) {
  if (!origin) return true;
  const normalized = origin.replace(/\/+$/, '').toLowerCase();
  return allowedOrigins(req).some((allowed) => allowed.toLowerCase() === normalized);
}

function rewriteCookieForUpstream(cookieHeader) {
  if (!cookieHeader) return '';
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith(`${SESSION_COOKIE}=`)) {
        return `${UPSTREAM_SESSION_COOKIE}=${part.slice(SESSION_COOKIE.length + 1)}`;
      }
      return part;
    })
    .join('; ');
}

function rewriteSetCookie(cookie, req) {
  const segments = cookie.split(';');
  const pair = segments.shift() || '';
  const separator = pair.indexOf('=');
  if (separator === -1) return cookie;

  let name = pair.slice(0, separator).trim();
  const value = pair.slice(separator + 1);
  if (name === UPSTREAM_SESSION_COOKIE) name = SESSION_COOKIE;

  const attributes = [];
  let maxAge = null;

  for (const segment of segments) {
    const [rawKey, ...rest] = segment.trim().split('=');
    const key = rawKey.toLowerCase();
    const attributeValue = rest.join('=');

    if (key === 'max-age') maxAge = attributeValue;
    else if (key === 'expires') attributes.push(`Expires=${attributeValue}`);
    else if (key === 'httponly') attributes.push('HttpOnly');
    // Domain, Secure, SameSite e Partitioned são definidos pelo proxy.
  }

  attributes.push('Path=/');
  if (maxAge !== null) attributes.push(`Max-Age=${maxAge}`);
  attributes.push('SameSite=Lax');
  if (isSecureRequest(req)) attributes.push('Secure');

  return `${name}=${value}; ${attributes.join('; ')}`;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

function createNeonAuth({ baseUrl = process.env.NEON_AUTH_BASE_URL } = {}) {
  if (!baseUrl) throw new Error('NEON_AUTH_BASE_URL não configurada.');
  const base = trimBase(baseUrl);

  async function getSession(cookieHeader, origin) {
    if (!cookieHeader) return null;

    const headers = { cookie: rewriteCookieForUpstream(cookieHeader) };
    if (origin) headers.origin = origin;

    const response = await fetch(`${base}/get-session`, {
      headers,
      signal: AbortSignal.timeout(10000)
    });

    if (response.status === 401) return null;
    if (!response.ok) {
      throw new Error(`Neon Auth respondeu com status ${response.status}.`);
    }

    const payload = await readJson(response);
    return payload && payload.user ? payload.user : null;
  }

  async function requireAuth(req, res, next) {
    try {
      const user = await getSession(req.get('cookie'), req.get('origin') || selfOrigin(req));
      if (!user) {
        return res.status(401).json({ error: 'Faça login para continuar.' });
      }
      req.user = user;
      req.userId = user.id;
      return next();
    } catch (err) {
      console.error('[Fluxo Auth]', err && err.message ? err.message : err);
      return res.status(503).json({ error: 'Serviço de autenticação indisponível.' });
    }
  }

  async function proxy(req, res, next) {
    try {
      const origin = req.get('origin') || selfOrigin(req);
      if (!isAllowedOrigin(req, req.get('origin'))) {
        return res.status(403).json({ error: 'Origem não autorizada.' });
      }

      const headers = {};
      for (const name of FORWARD_HEADERS) {
        const value = req.get(name);
        if (value) headers[name] = name === 'cookie' ? rewriteCookieForUpstream(value) : value;
      }
      if (!headers.origin) headers.origin = origin;

      const init = {
        method: req.method,
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(20000)
      };

      if (req.method !== 'GET' && req.method !== 'HEAD' && Buffer.isBuffer(req.body) && req.body.length) {
        init.body = req.body;
      }

      const upstream = await fetch(`${base}${req.url}`, init);

      res.status(upstream.status);
      upstream.headers.forEach((value, name) => {
        if (!SKIP_RESPONSE_HEADERS.has(name.toLowerCase())) res.setHeader(name, value);
      });

      const setCookies = typeof upstream.headers.getSetCookie === 'function'
        ? upstream.headers.getSetCookie()
        : [];
      if (setCookies.length) {
        res.setHeader('Set-Cookie', setCookies.map((cookie) => rewriteSetCookie(cookie, req)));
      }

      const body = Buffer.from(await upstream.arrayBuffer());
      return res.end(body);
    } catch (err) {
      if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        return res.status(504).json({ error: 'O serviço de autenticação demorou para responder.' });
      }
      console.error('[Fluxo Auth Proxy]', err && err.message ? err.message : err);
      return res.status(502).json({ error: 'Não foi possível falar com o serviço de autenticação.' });
    }
  }

  return { baseUrl: base, getSession, requireAuth, proxy };
}

module.exports = {
  SESSION_COOKIE,
  checkAuthConfig,
  createNeonAuth,
  rewriteCookieForUpstream,
  rewriteSetCookie
};
