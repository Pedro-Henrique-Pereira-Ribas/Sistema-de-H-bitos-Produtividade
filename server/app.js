/* API HTTP do Fluxo: autenticação Neon, estado sincronizado e arquivos estáticos. */
'use strict';

const path = require('node:path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { createNeonAuth } = require('./auth');
const ai = require('./ai');
const cloudFunctions = require('./cloud-functions');
const realtime = require('./realtime');
const storage = require('./storage');

const ROOT = path.join(__dirname, '..');
const MAX_STATE_BYTES = 1024 * 1024;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name || '',
    email: user.email || ''
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

function createApp({ store, auth, enableRateLimit = true } = {}) {
  if (!store) throw new Error('A API precisa de um store.');
  const authService = auth || createNeonAuth();

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
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400
  }));

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

  // O proxy do Neon Auth precisa receber o corpo cru antes do express.json().
  app.use(
    '/api/auth',
    authLimiter,
    express.raw({ type: '*/*', limit: '1mb' }),
    authService.proxy
  );

  app.use(express.json({ limit: '1100kb' }));

  app.get('/api/health', async (req, res) => {
    try {
      await store.health();
      res.json({ ok: true, service: 'fluxo-api', time: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({ ok: false, error: 'Banco de dados indisponível.' });
    }
  });

  // Configuração pública: apenas URL do Realtime e disponibilidade dos serviços.
  app.get('/api/config', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      realtime: realtime.publicConfig(),
      features: {
        storage: storage.configured(),
        functions: cloudFunctions.configured(),
        ai: ai.configured()
      }
    });
  });

  app.get('/api/me', authService.requireAuth, async (req, res) => {
    return res.json({ user: publicUser(req.user) });
  });

  // Agrega o estado dos serviços de nuvem para a tela de ajustes e para os testes.
  app.get('/api/cloud/status', authService.requireAuth, async (req, res, next) => {
    try {
      const [postgres, storageResult, functionResult] = await Promise.allSettled([
        store.health(),
        storage.health(req.userId),
        cloudFunctions.health()
      ]);

      let aiStatus;
      if (ai.configured()) {
        try {
          aiStatus = await ai.status();
        } catch (err) {
          aiStatus = { configured: true, ok: false, error: err.message };
        }
      } else {
        aiStatus = {
          configured: false,
          ok: false,
          reason: 'AI Gateway exige plano Neon pago (Launch/Scale) e créditos pré-pagos.'
        };
      }

      return res.json({
        postgres: postgres.status === 'fulfilled' && postgres.value === true,
        auth: true,
        storage: storageResult.status === 'fulfilled'
          ? storageResult.value
          : { ok: false, error: storageResult.reason.message },
        functions: functionResult.status === 'fulfilled'
          ? functionResult.value
          : { ok: false, error: functionResult.reason.message },
        realtime: realtime.publicConfig(),
        ai: aiStatus
      });
    } catch (err) {
      return next(err);
    }
  });

  // Emite uma capability selada; o segredo do Realtime fica no servidor.
  app.post('/api/state/live', authService.requireAuth, async (req, res, next) => {
    try {
      const sealed = await realtime.sealState(req.userId);
      res.setHeader('Cache-Control', 'no-store');
      return res.json(sealed);
    } catch (err) {
      return next(err);
    }
  });

  app.get('/api/cloud/storage/health', authService.requireAuth, async (req, res, next) => {
    try {
      return res.json(await storage.health(req.userId));
    } catch (err) {
      return next(err);
    }
  });

  app.post('/api/cloud/backup', authService.requireAuth, async (req, res, next) => {
    try {
      const state = await store.getState(req.userId);
      if (!state.data) {
        return res.status(400).json({ error: 'Ainda não há dados na nuvem para gerar um backup.' });
      }
      return res.json(await storage.putBackup(req.userId, state));
    } catch (err) {
      return next(err);
    }
  });

  app.get('/api/cloud/backups', authService.requireAuth, async (req, res, next) => {
    try {
      return res.json({ backups: await storage.listBackups(req.userId) });
    } catch (err) {
      return next(err);
    }
  });

  app.get('/api/cloud/backups/url', authService.requireAuth, async (req, res, next) => {
    try {
      const key = String(req.query.key || '');
      if (!key) return res.status(400).json({ error: 'Informe o backup.' });
      return res.json({ url: await storage.backupUrl(req.userId, key) });
    } catch (err) {
      return next(err);
    }
  });

  app.delete('/api/cloud/backups', authService.requireAuth, async (req, res, next) => {
    try {
      const key = String(req.query.key || '');
      if (!key) return res.status(400).json({ error: 'Informe o backup.' });
      return res.json(await storage.deleteBackup(req.userId, key));
    } catch (err) {
      return next(err);
    }
  });

  app.get('/api/cloud/function/health', authService.requireAuth, async (req, res, next) => {
    try {
      return res.json(await cloudFunctions.health());
    } catch (err) {
      return next(err);
    }
  });

  app.get('/api/cloud/ai/status', authService.requireAuth, async (req, res, next) => {
    try {
      return res.json(await ai.status());
    } catch (err) {
      return next(err);
    }
  });

  app.post('/api/cloud/ai/suggest', authService.requireAuth, async (req, res, next) => {
    try {
      const body = isPlainObject(req.body) ? req.body : {};
      return res.json(await ai.suggest(body.goal));
    } catch (err) {
      return next(err);
    }
  });

  app.get('/api/state', authService.requireAuth, async (req, res, next) => {
    try {
      const state = await store.getState(req.userId);
      return res.json(state);
    } catch (err) {
      return next(err);
    }
  });

  app.put('/api/state', authService.requireAuth, async (req, res, next) => {
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

  app.delete('/api/state', authService.requireAuth, async (req, res, next) => {
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
    if (err && err.expose && Number.isInteger(err.status)) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code || 'CLOUD_SERVICE_ERROR'
      });
    }

    console.error('[Fluxo API]', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  });

  return app;
}

module.exports = { createApp, MAX_STATE_BYTES };
