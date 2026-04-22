import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { buildMemoryStorage, setupCache } from 'axios-cache-interceptor';
import axiosRetry from 'axios-retry';
import express, { NextFunction, Request, Response } from 'express';
// eslint-disable-next-line import/no-named-as-default
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import { ConfigureController, ExtractController, ManifestController, StreamController } from './controller';
import { BlockedError, logErrorAndReturnNiceString } from './error';
import { createExtractors, ExtractorRegistry } from './extractor';
import { createSources, Source } from './source';
import { FourKHDHub } from './source/FourKHDHub';
import { HDHub4u } from './source/HDHub4u';
import { Showbox } from './source/Showbox';
import { clearCache, contextFromRequestAndResponse, envGet, envIsProd, Fetcher, StreamResolver } from './utils';
import { LOGO_BLUE } from './logo';
import * as fs from 'node:fs';
import * as path from 'node:path';

if (envIsProd()) {
  console.log = console.warn = console.error = console.info = console.debug = () => { /* disable in favor of logger */ };
}

const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.cli(),
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp, id }) => `${timestamp} ${level} ${id}: ${message}`)),
    }),
  ],
});

process.on('uncaughtException', (error: Error) => {
  logger.error(`Uncaught exception caught: ${error}, cause: ${error.cause}, stack: ${error.stack}`);
  process.exit(1);
});

process.on('unhandledRejection', (error: Error) => {
  logger.error(`Unhandled rejection: ${error}, cause: ${error.cause}, stack: ${error.stack}`);
});

const cachedAxios = setupCache(axios, {
  interpretHeader: true,
  storage: buildMemoryStorage(false, 3 * 60 * 60 * 1000, 4096, 12 * 60 * 60 * 1000),
  ttl: 15 * 60 * 1000, // 15m
});
axiosRetry(cachedAxios, { retries: 3, retryDelay: () => 333 });

const fetcher = new Fetcher(cachedAxios, logger);

const sources = createSources(fetcher);
const extractors = createExtractors(fetcher);

const addon = express();
addon.set('trust proxy', true);

if (envIsProd()) {
  addon.use(rateLimit({ windowMs: 60 * 1000, limit: 30 }));
}

if (envGet('CACHE_FILES_DELETE_ON_START')) {
  (async function () {
    await clearCache(logger);
  })();
}

addon.use((req: Request, res: Response, next: NextFunction) => {
  process.env['HOST'] = req.host;
  process.env['PROTOCOL'] = req.protocol;

  res.setHeader('X-Request-ID', randomUUID());

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (envIsProd()) {
    res.setHeader('Cache-Control', 'public, max-age=10, immutable');
  }

  next();
});

const extractorRegistry = new ExtractorRegistry(logger, extractors);

// Serve the WatchNow logo as a real PNG (accessible by Stremio and browsers)
addon.get('/logo.png', (_req: Request, res: Response) => {
  const base64Data = LOGO_BLUE.replace('data:image/png;base64,', '');
  const imgBuffer = Buffer.from(base64Data, 'base64');
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(imgBuffer);
});

addon.use(express.static('src'));

// ── Install click counter ──────────────────────────────────────────────────
const STATS_FILE = path.join(process.cwd(), 'install-stats.json');

function readStats(): { installs: number; lastInstall: string | null } {
  try {
    return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  } catch {
    return { installs: 0, lastInstall: null };
  }
}

function writeStats(data: { installs: number; lastInstall: string | null }) {
  try { fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2), 'utf8'); } catch { /* ignore */ }
}

addon.post('/track-install', (_req: Request, res: Response) => {
  const stats = readStats();
  stats.installs += 1;
  stats.lastInstall = new Date().toISOString();
  writeStats(stats);
  res.json({ ok: true });
});

// Private stats — only accessible with ?key=YOUR_ADMIN_KEY
addon.get('/admin/stats', (req: Request, res: Response) => {
  const adminKey = envGet('ADMIN_KEY') || 'watchnow-secret-2024';
  if (req.query['key'] !== adminKey) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const stats = readStats();
  return res.json({
    totalInstalls: stats.installs,
    lastInstall: stats.lastInstall,
    note: 'Count increments each time someone clicks Add to Stremio',
  });
});
// ─────────────────────────────────────────────────────────────────────────────

addon.use('/', (new ExtractController(logger, fetcher, extractorRegistry)).router);
addon.use('/', (new ConfigureController(sources, extractors)).router);
addon.use('/', (new ManifestController(sources, extractors)).router);

const streamResolver = new StreamResolver(logger, extractorRegistry);
addon.use('/', (new StreamController(logger, sources, streamResolver)).router);

addon.post('/test-febbox-cookie', express.json(), async (req: Request, res: Response) => {
  let cookie = req.body.cookie?.trim();
  if (!cookie) return res.status(400).json({ success: false, message: 'No cookie provided' });
  if (!cookie.startsWith('ui=')) {
    cookie = 'ui=' + cookie;
  }
  
  try {
    const r = await fetch('https://febapi.nuvioapp.space/api/media/movie/533535/oss=USA7?cookie=' + encodeURIComponent(cookie), {
      headers: { 'User-Agent': 'DevStreamzAddon/1.0' }
    });
    const data = await r.json() as any;
    if (data && data.success) {
      return res.json({ success: true, message: `Success! Cookie is valid and connected.` });
    } else {
      return res.json({ success: false, message: 'Invalid cookie or expired' });
    }
  } catch (e) {
    console.error("Cookie validation error:", e);
    return res.json({ success: false, message: 'Error validating cookie: ' + (e as Error).message });
  }
});

// error handler needs to stay at the end of the stack
addon.use((err: Error, _req: Request, _res: Response, next: NextFunction) => {
  logger.error(`Error: ${err}, cause: ${err.cause}, stack: ${err.stack}`);

  return next(err);
});

addon.get('/', (_req: Request, res: Response) => {
  res.redirect('/configure');
});

addon.get('/startup', async (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

addon.get('/ready', async (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

let lastLiveProbeRequestsTimestamp = 0;
addon.get('/live', async (req: Request, res: Response) => {
  const ctx = contextFromRequestAndResponse(req, res);

  const sources: Source[] = [
    new FourKHDHub(fetcher),
    new HDHub4u(fetcher),
    new Showbox(fetcher),
  ];
  const hrefs = [
    ...sources.map(source => source.baseUrl),
    'https://cloudnestra.com',
  ];

  const results = new Map<string, string>();

  let blockedCount = 0;
  let errorCount = 0;

  const fetchFactories = hrefs.map(href => async () => {
    const url = new URL(href);

    try {
      await fetcher.head(ctx, url);
      results.set(url.host, 'ok');
    } catch (error) {
      if (error instanceof BlockedError) {
        results.set(url.host, 'blocked');
        blockedCount++;
      } else {
        results.set(url.host, 'error');
        errorCount++;
      }

      logErrorAndReturnNiceString(ctx, logger, href, error);
    }
  });

  if (Date.now() - lastLiveProbeRequestsTimestamp > 60000 || 'force' in req.query) { // every minute
    await Promise.all(fetchFactories.map(fn => fn()));
    lastLiveProbeRequestsTimestamp = Date.now();
  }

  const details = Object.fromEntries(results);

  if (blockedCount > 0) {
    // TODO: fail health check and try to get a clean IP if infra is ready
    logger.warn('IP might be not clean and leading to blocking.', ctx);
    res.json({ status: 'ok', details });
  } else if (errorCount === sources.length) {
    res.status(503).json({ status: 'error', details });
  } else {
    res.json({ status: 'ok', ipStatus: 'ok', details });
  }
});

addon.get('/stats', async (_req: Request, res: Response) => {
  res.json({
    extractorRegistry: extractorRegistry.stats(),
    fetcher: fetcher.stats(),
    sources: Source.stats(),
  });
});

const port = parseInt(envGet('PORT') || '51546');
addon.listen(port, () => {
  logger.info(`Add-on Repository URL: http://127.0.0.1:${port}/manifest.json`);
});
