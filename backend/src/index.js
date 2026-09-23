import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { ROOT, getConfig, loadEnvFiles, publicStatus } from './config.js';
import { getServices, runChat } from './chatService.js';
import { AppError, isUuid, sanitizeError, validateMemoryInput } from './security.js';

loadEnvFiles();

const active = new Map();

export function createApp() {
  const app = express();
  const cfg = getConfig();
  if (cfg.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      frameguard: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      originAgentCluster: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          mediaSrc: ["'self'", 'blob:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ['*'],
        },
      },
    })
  );
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, origin || '*');
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Device-Id'],
      maxAge: 600,
    })
  );
  app.use(express.json({ limit: '12mb' }));
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      if (!req.path.startsWith('/api/')) return;
      console.log(
        JSON.stringify({
          event: 'request',
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Date.now() - started,
        })
      );
    });
    next();
  });

  app.get('/api/v1/health', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(publicStatus());
  });

  const handleChat = async (req, res, next) => {
    const requestId = String(req.body?.requestId || '').slice(0, 80);
    const controller = new AbortController();
    if (requestId) active.set(requestId, controller);
    const finish = () => {
      if (requestId) active.delete(requestId);
    };
    // req 'close' also fires after the body is read, so only abort if the
    // response was not finished — that means the phone cancelled.
    res.on('close', () => {
      if (!res.writableFinished) controller.abort();
    });
    try {
      const stream = req.body?.stream !== false && !req.headers.accept?.includes('application/json');
      if (!stream) {
        const result = await runChat(req.body || {}, {
          ip: req.ip,
          signal: controller.signal,
        });
        finish();
        return res.json({ ok: true, ...result });
      }
      startSse(res);
      const result = await runChat(req.body || {}, {
        ip: req.ip,
        signal: controller.signal,
        onStatus(status) {
          writeSse(res, 'status', status);
        },
        onToken(text) {
          writeSse(res, 'token', { text });
        },
      });
      writeSse(res, 'done', {
        conversationId: result.conversationId,
        conversation_id: result.conversationId,
        stopped: result.stopped,
        sources: result.sources,
        webStatus: result.webStatus,
        knowledge: result.knowledge,
        detectedLanguage: result.detectedLanguage,
        memoryNote: result.memoryNote,
      });
      finish();
      res.end();
    } catch (error) {
      finish();
      if (res.headersSent) {
        writeSse(res, 'error', errorBody(error));
        res.end();
        return;
      }
      next(error);
    }
  };
  app.post('/api/v1/chat', handleChat);
  app.post('/api/chat', handleChat);
  app.post('/api/assistant/chat', handleChat);

  const cancelChat = (req, res) => {
    const requestId = String(req.body?.requestId || '');
    const controller = active.get(requestId);
    if (controller) controller.abort();
    res.json({ ok: true, cancelled: Boolean(controller) });
  };
  app.post('/api/v1/chat/cancel', cancelChat);
  app.post('/api/chat/cancel', cancelChat);
  app.post('/api/assistant/chat/cancel', cancelChat);

  app.get('/api/v1/conversations', (req, res) => {
    const deviceId = requireDevice(req.query.deviceId);
    res.json({ conversations: getServices().conversations.list(deviceId) });
  });

  app.get('/api/v1/conversations/:id', (req, res) => {
    const deviceId = requireDevice(req.query.deviceId);
    const snapshot = getServices().conversations.snapshot(req.params.id, deviceId);
    if (!snapshot) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That chat was not found.' } });
    res.json(snapshot);
  });

  app.delete('/api/v1/conversations/:id', (req, res) => {
    const deviceId = requireDevice(req.query.deviceId);
    getServices().conversations.remove(req.params.id, deviceId);
    res.json({ ok: true });
  });

  app.delete('/api/v1/conversations', (req, res) => {
    const deviceId = requireDevice(req.query.deviceId);
    getServices().conversations.clearDevice(deviceId);
    res.json({ ok: true });
  });

  app.get('/api/v1/memory', (req, res) => {
    const deviceId = requireDevice(req.query.deviceId);
    res.json({ memories: getServices().memories.list(deviceId) });
  });

  app.post('/api/v1/memory', (req, res, next) => {
    try {
      const input = validateMemoryInput(req.body || {});
      const item = getServices().memories.add(input.deviceId, input.content);
      res.status(201).json(item);
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/v1/memory/:id', (req, res, next) => {
    try {
      const input = validateMemoryInput(req.body || {});
      const item = getServices().memories.update(input.deviceId, req.params.id, input.content);
      res.json(item);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/v1/memory/:id', (req, res) => {
    const deviceId = requireDevice(req.query.deviceId);
    getServices().memories.remove(deviceId, req.params.id);
    res.json({ ok: true });
  });

  app.delete('/api/v1/memory', (req, res) => {
    const deviceId = requireDevice(req.query.deviceId);
    getServices().memories.clear(deviceId);
    res.json({ ok: true });
  });

  const webRoot = path.join(ROOT, 'web');
  app.use(
    express.static(webRoot, {
      index: 'index.html',
      maxAge: 0,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    })
  );
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(webRoot, 'index.html'), (error) => {
      if (error) next();
    });
  });

  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({
        error: { code: 'TOO_LARGE', message: 'That file is too large. Please send a file under 4 MB.' },
      });
    }
    const status = err instanceof AppError ? err.status : 500;
    const code = err instanceof AppError ? err.code : 'SERVER';
    const message =
      err instanceof AppError
        ? err.message
        : 'Something went wrong on Sana’s server. Please retry.';
    if (status >= 500) {
      console.log(
        JSON.stringify({
          event: 'server-error',
          code,
          status,
          message: sanitizeError(err?.message || ''),
          causeCode: sanitizeError(err?.cause?.code || ''),
        })
      );
    } else if (!(err instanceof AppError)) {
      console.log(JSON.stringify({ event: 'error', code, detail: sanitizeError(err?.message || '') }));
    }
    res.status(status).json({ error: { code, message: sanitizeError(message) } });
  });

  return app;
}

function requireDevice(value) {
  const deviceId = String(value || '');
  if (!isUuid(deviceId)) throw new AppError('BAD_REQUEST', 'A valid device id is required.', 400);
  return deviceId;
}

function errorBody(error) {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  return { code: 'SERVER', message: 'Something went wrong. Please retry.' };
}

function startSse(res) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

function writeSse(res, event, data) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  const cfg = getConfig();
  const app = createApp();
  app.listen(cfg.port, '0.0.0.0', () => {
    const status = publicStatus(cfg);
    console.log(
      JSON.stringify({
        event: 'start',
        port: cfg.port,
        aiConfigured: status.aiConfigured,
        provider: status.provider,
        model: status.model,
        vision: status.vision,
        webSearch: status.webSearch,
      })
    );
  });
}
