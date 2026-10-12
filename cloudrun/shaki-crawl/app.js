/**
 * SHAKI AI Product Match — official-website fact fetcher.
 *
 * Container-mode CloudRun. `app.js` only builds and exports the express app — `server.js` is the
 * single place that binds the platform port, which keeps the app testable without a socket.


 *
 * Scope (v1): fetch ONE official website and report what the page said. No social crawling, no
 * market research, no third-party enrichment — the caller asked for official-site-only, and every
 * claim the UI makes has to be traceable to a page this service actually opened.
 *
 * Stateless: no disk, no database. A per-instance token bucket smooths obvious abuse; it is not a
 * security boundary and is not relied on as one.
 */
const express = require('express');

const { safeFetch } = require('./lib/safefetch');
const { extractFacts } = require('./lib/extract');
const ai = require('./lib/ai');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '8kb' }));

const MAX_TEXT_CHARS = 6000;
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 10000);
const ALLOWED_ORIGINS = String(
  process.env.ALLOWED_ORIGINS ||
    'https://shaki-ai-product-match.app.workbuddy.host,http://localhost:3000,http://localhost:4173',
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Per-instance rate limit: 30 requests / minute / IP.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const bucket = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  bucket.push(now);
  hits.set(ip, bucket);
  if (hits.size > 2000) hits.clear(); // crude bound; instances are short-lived anyway
  return bucket.length > MAX_PER_WINDOW;
}

const ERROR_STATUS = {
  INVALID_URL: 400,
  BLOCKED_SCHEME: 400,
  BLOCKED_PORT: 400,
  BLOCKED_ADDRESS: 400,
  TOO_LARGE: 413,
  TOO_MANY_REDIRECTS: 400,
  UNSUPPORTED_CONTENT_TYPE: 415,
  UPSTREAM_TIMEOUT: 504,
  UPSTREAM_ERROR: 502,
  RATE_LIMITED: 429,
};

const MESSAGES = {
  INVALID_URL: 'The URL could not be parsed.',
  BLOCKED_SCHEME: 'Only http and https URLs are fetched.',
  BLOCKED_PORT: 'Only standard web ports are fetched.',
  BLOCKED_ADDRESS: 'That host resolves to a non-public address and was not fetched.',
  TOO_LARGE: 'The page was larger than 1 MiB and was not read in full.',
  TOO_MANY_REDIRECTS: 'The URL redirected more than 3 times.',
  UNSUPPORTED_CONTENT_TYPE: 'That URL did not return an HTML or text page.',
  UPSTREAM_TIMEOUT: 'The website did not respond in time.',
  UPSTREAM_ERROR: 'The website could not be reached.',
  RATE_LIMITED: 'Too many requests; please retry shortly.',
};

app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.set('access-control-allow-origin', origin);
    res.set('vary', 'Origin');
    res.set('access-control-allow-methods', 'GET,POST,OPTIONS');
    res.set('access-control-allow-headers', 'content-type');
    res.set('access-control-max-age', '600');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'shaki-crawl', scope: 'official-website-only', maxTextChars: MAX_TEXT_CHARS });
});

app.post('/crawl', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message: MESSAGES.RATE_LIMITED } });
  }

  const rawUrl = req.body && typeof req.body.url === 'string' ? req.body.url.trim() : '';
  if (!rawUrl) {
    return res.status(400).json({ ok: false, error: { code: 'INVALID_URL', message: MESSAGES.INVALID_URL } });
  }
  if (rawUrl.length > 300) {
    return res.status(400).json({ ok: false, error: { code: 'INVALID_URL', message: 'URL is too long.' } });
  }

  const startedAt = new Date().toISOString();
  let result;
  try {
    result = await safeFetch(rawUrl, { timeoutMs: FETCH_TIMEOUT_MS });
  } catch (err) {
    const code = (err && err.code) || 'UPSTREAM_ERROR';
    return res.status(ERROR_STATUS[code] || 502).json({
      ok: false,
      error: { code: code in MESSAGES ? code : 'UPSTREAM_ERROR', message: MESSAGES[code] || MESSAGES.UPSTREAM_ERROR },
      requestedUrl: rawUrl,
      fetchedAt: startedAt,
    });
  }

  const contentType = String(result.headers['content-type'] || '');
  if (result.status < 200 || result.status >= 300) {
    return res.status(200).json({
      ok: false,
      error: {
        code: 'UPSTREAM_ERROR',
        message: `The website returned HTTP ${result.status}.`,
      },
      requestedUrl: rawUrl,
      finalUrl: result.finalUrl,
      httpStatus: result.status,
      fetchedAt: startedAt,
    });
  }
  if (!/text\/(html|plain)|application\/(xhtml\+xml|xml)/i.test(contentType)) {
    return res.status(415).json({
      ok: false,
      error: { code: 'UNSUPPORTED_CONTENT_TYPE', message: MESSAGES.UNSUPPORTED_CONTENT_TYPE },
      requestedUrl: rawUrl,
      finalUrl: result.finalUrl,
      httpStatus: result.status,
      contentType,
      fetchedAt: startedAt,
    });
  }

  const facts = extractFacts(result.body, result.finalUrl, result.headers, MAX_TEXT_CHARS);

  return res.json({
    ok: true,
    requestedUrl: rawUrl,
    finalUrl: result.finalUrl,
    httpStatus: result.status,
    fetchedAt: startedAt,
    bytes: result.body.length,
    contentType,
    redirects: result.chain.length - 1,
    ...facts,
  });
});

// ── AI enrichment ───────────────────────────────────────────────────────────────────────────────
// Two endpoints only: a probe that says whether the model is callable at all, and the batch job.
// Both refuse oversized bodies — this is a public endpoint and each call costs money.

const MAX_ROWS = 8;

app.post('/ai/probe', async (_req, res) => {
  try {
    const t0 = Date.now();
    await ai.pickModel();
    const p = ai.provider();
    res.json({
      ok: true,
      provider: ai.modelProvider,
      model: ai.modelName,
      endpoint: p.kind === 'openai-compatible' ? p.baseUrl : 'cloudbase-tokenhub',
      ms: Date.now() - t0,
    });
  } catch (err) {
    res.status(503).json({
      ok: false,
      error: { code: 'AI_UNAVAILABLE', message: (err && err.message) || 'AI unavailable' },
      detail: (err && err.detail) || undefined,
      tried: ai.provider().kind === 'cloudbase' ? ai.CANDIDATE_MODELS : [ai.provider().baseUrl],
    });
  }
});

app.post('/ai/enrich', async (req, res) => {
  const rows = req.body && Array.isArray(req.body.rows) ? req.body.rows : null;
  if (!rows || rows.length === 0) {
    return res.status(400).json({ ok: false, error: { code: 'NO_ROWS', message: 'Send { rows: [...] }.' } });
  }
  if (rows.length > MAX_ROWS) {
    return res.status(413).json({ ok: false, error: { code: 'TOO_MANY_ROWS', message: `At most ${MAX_ROWS} rows per call.` } });
  }

  const startedAt = new Date().toISOString();
  try {
    const results = await ai.enrichRows(rows);
    const filled = results.filter((r) => r.ok && Object.keys(r.fields).length > 0).length;
    return res.json({
      ok: true,
      provider: ai.modelProvider,
      model: ai.modelName,
      fetchedAt: startedAt,
      summary: { rows: results.length, filled, failed: results.filter((r) => !r.ok).length },
      results,
    });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: { code: (err && err.code) || 'AI_ERROR', message: (err && err.message) || 'AI call failed' },
      fetchedAt: startedAt,
    });
  }
});

// Vision extraction from the detail-page images. Fewer rows per call than the text endpoint
// because each row carries several images and image tokens are expensive.
app.post('/ai/vision', async (req, res) => {
  const rows = req.body && Array.isArray(req.body.rows) ? req.body.rows : null;
  if (!rows || rows.length === 0) {
    return res.status(400).json({ ok: false, error: { code: 'NO_ROWS', message: 'Send { rows: [{ product_id, name_cn, images: [...] }] }.' } });
  }
  if (rows.length > 3) {
    return res.status(413).json({ ok: false, error: { code: 'TOO_MANY_ROWS', message: 'At most 3 rows per vision call.' } });
  }
  const startedAt = new Date().toISOString();
  try {
    const results = [];
    for (const r of rows) {
      // Sequential on purpose: parallel image calls are how a vision bill gets surprising.
      results.push(await ai.visionEnrichRow({ product_id: r.product_id, name_cn: r.name_cn, name_en: r.name_en }, r.images));
    }
    return res.json({
      ok: true,
      provider: ai.provider().kind,
      model: ai.provider().model,
      fetchedAt: startedAt,
      summary: { rows: results.length, filled: results.filter((r) => r.ok && Object.keys(r.fields || {}).length).length },
      results,
    });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: { code: (err && err.code) || 'VISION_ERROR', message: (err && err.message) || 'vision call failed' },
      fetchedAt: startedAt,
    });
  }
});

// Anything else: a plain 404. Never echo headers, env or the platform context.
app.use((_req, res) => res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } }));

module.exports = app;
