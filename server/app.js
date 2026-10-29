/* API HTTP do Fluxo: autenticação, estado sincronizado e arquivos estáticos. */
'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const ROOT = path.join(__dirname, '..');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_STATE_BYTES = 1024 * 1024;
const TOKEN_ISSUER = 'fluxo-api';
const TOKEN_AUDIENCE = 'fluxo-web';

const DUMMY_HASH = bcrypt.hashSync('fluxo-dummy-password', 10);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function normalizeEmail(value) {
  return text(value, 190).toLowerCase();
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function signToken(user, secret) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    secret,
    { expiresIn: '30d', issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE }
  );
}

function requireAuth(secret) {
  return (req, res, next) => {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Faça login para continuar.' });
    }

    try {
      const payload = jwt.verify(token, secret, {
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE
      });
      if (!payload || typeof payload.sub !== 'string') throw new Error('Token inválido');
      req.userId = payload.sub;
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
    }
  };
}

function rateLimiter({ windowMs, max, message, enabled }) {
  if (!enabled) return (req, res, next) => next();
  return rateLimit({
    windowMs,
    max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: message })
  });
}

function createApp({ store, jwtSecret, enableRateLimit = true } = {}) {
  if (!store) throw new Error('A API precisa de um store.');
  if (!jwtSecret) throw new Error('JWT_SECRET não configurado.');

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));

  const configuredOrigins = String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(cors({
    origin: configuredOrigins.length ? configuredOrigins : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400
  }));

  app.use(express.json({ limit: '1100kb' }));

  const globalLimiter = rateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: 'Muitas solicitações. Tente novamente em alguns minutos.',
    enabled: enableRateLimit
  });

  const authLimiter = rateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Muitas tentativas de acesso. Aguarde 15 minutos.',
    enabled: enableRateLimit
  });

  app.use('/api', globalLimiter);

  app.get('/api/health', async (req, res) => {
    try {
      await store.health();
      res.json({ ok: true, service: 'fluxo-api', time: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({ ok: false, error: 'Banco de dados indisponível.' });
    }
  });

  app.post('/api/auth/register', authLimiter, async (req, res, next) => {
    try {
      const body = isPlainObject(req.body) ? req.body : {};
      const name = text(body.name, 80);
      const email = normalizeEmail(body.email);
      const password = typeof body.password === 'string' ? body.password : '';

      if (name.length < 2) {
        return res.status(400).json({ error: 'Informe seu nome (mínimo de 2 caracteres).' });
      }
      if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'Informe um e-mail válido.' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
      }
      if (Buffer.byteLength(password, 'utf8') > 72) {
        return res.status(400).json({ error: 'A senha é longa demais.' });
      }

      const existing = await store.findUserByEmail(email);
      if (existing) {
        return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
      }

      const id = crypto.randomUUID();
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await store.createUser({ id, name, email, passwordHash });
      const token = signToken(user, jwtSecret);

      return res.status(201).json({ token, user: publicUser(user) });
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
      }
      return next(err);
    }
  });

  app.post('/api/auth/login', authLimiter, async (req, res, next) => {
    try {
      const body = isPlainObject(req.body) ? req.body : {};
      const email = normalizeEmail(body.email);
      const password = typeof body.password === 'string' ? body.password : '';

      if (!EMAIL_RE.test(email) || !password) {
        return res.status(400).json({ error: 'Informe e-mail e senha.' });
      }

      const user = await store.findUserByEmail(email);
      const valid = user
        ? await bcrypt.compare(password, user.password_hash)
        : await bcrypt.compare(password, DUMMY_HASH);

      if (!user || !valid) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }

      const token = signToken(user, jwtSecret);
      return res.json({ token, user: publicUser(user) });
    } catch (err) {
      return next(err);
    }
  });

  app.get('/api/me', requireAuth(jwtSecret), async (req, res, next) => {
    try {
      const user = await store.findUserById(req.userId);
      if (!user) {
        return res.status(401).json({ error: 'Conta não encontrada. Entre novamente.' });
      }
      return res.json({ user: publicUser(user) });
    } catch (err) {
      return next(err);
    }
  });

  app.get('/api/state', requireAuth(jwtSecret), async (req, res, next) => {
    try {
      const state = await store.getState(req.userId);
      return res.json(state);
    } catch (err) {
      return next(err);
    }
  });

  app.put('/api/state', requireAuth(jwtSecret), async (req, res, next) => {
    try {
      const body = isPlainObject(req.body) ? req.body : {};
      const baseRevision = Number(body.baseRevision);

      if (!isPlainObject(body.data)) {
        return res.status(400).json({ error: 'Estado inválido.' });
      }
      if (!Number.isInteger(baseRevision) || baseRevision < 0) {
        return res.status(400).json({ error: 'Revisão inválida.' });
      }

      const dataJson = JSON.stringify(body.data);
      if (Buffer.byteLength(dataJson, 'utf8') > MAX_STATE_BYTES) {
        return res.status(413).json({ error: 'Os dados excedem o limite de 1 MB.' });
      }

      const result = await store.saveState(req.userId, dataJson, baseRevision);
      if (result.conflict) {
        return res.status(409).json({
          error: 'Os dados foram alterados em outro dispositivo.',
          state: result.current
        });
      }

      return res.json({ revision: result.revision, updatedAt: result.updatedAt });
    } catch (err) {
      return next(err);
    }
  });

  app.delete('/api/state', requireAuth(jwtSecret), async (req, res, next) => {
    try {
      await store.deleteState(req.userId);
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  // O app é servido pela mesma origem da API, o que evita CORS no uso normal.
  app.use('/css', express.static(path.join(ROOT, 'css'), { maxAge: '1h' }));
  app.use('/js', express.static(path.join(ROOT, 'js'), { maxAge: '1h' }));
  app.use('/vendor', express.static(path.join(ROOT, 'vendor'), { maxAge: '7d' }));
  app.use('/assets', express.static(path.join(ROOT, 'assets'), { maxAge: '1d' }));

  app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
  app.get('/index.html', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Rota de API não encontrada.' });
  });

  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'JSON inválido.' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Requisição grande demais.' });
    }

    console.error('[Fluxo API]', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  });

  return app;
}

module.exports = { createApp, MAX_STATE_BYTES };
