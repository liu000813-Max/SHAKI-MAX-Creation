/**
 * Browser-side client for the official-website fetcher.
 *
 * Three rules this file exists to enforce:
 *
 *   1. **No capability, no claim.** If `CRAWL_CONFIG.enabled` is false this returns null without
 *      touching the network, and the caller falls back to rep-entered input.
 *   2. **Failure is data, not an exception.** A timeout, a 502 or a refused address all come back
 *      as `{ facts: null, error }` so the UI can say what happened instead of silently proceeding
 *      as if the site had been read.
 *   3. **Answers are cached per URL** so re-analysing the same client is reproducible and does not
 *      hammer the site that was just polite enough to answer.
 */
import { CRAWL_CONFIG } from './config/crawl';
import type { SiteFacts } from './types';

export interface CrawlOutcome {
  facts: SiteFacts | null;
  /** Machine code from the service (or 'DISABLED' / 'NO_URL' / 'NETWORK' produced here). */
  errorCode?: string;
  errorMessage?: string;
}

const CACHE_PREFIX = 'shaki.siteFacts.v1.';

const cacheKey = (url: string) => `${CACHE_PREFIX}${url.trim().toLowerCase()}`;

function readCache(url: string): SiteFacts | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(cacheKey(url));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; facts: SiteFacts };
    if (!parsed || typeof parsed.at !== 'number' || !parsed.facts) return null;
    if (Date.now() - parsed.at > CRAWL_CONFIG.cacheTtlMs) return null;
    return parsed.facts;
  } catch {
    return null;
  }
}

function writeCache(url: string, facts: SiteFacts): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(cacheKey(url), JSON.stringify({ at: Date.now(), facts }));
  } catch {
    /* a full or blocked storage is not worth failing an analysis over */
  }
}

/** `https://a.com/x/` → `https://a.com/x` so trivial variants share a cache entry. */
const canonicalUrl = (raw: string) => raw.trim().replace(/\/+$/, '');

/**
 * Fetch one official website. Never throws.
 *
 * Returns `facts: null` with an `errorCode` whenever the page could not be read — the caller is
 * expected to fall back to rep-entered input and to *say* that it did.
 */
/**
 * One attempt against the fetcher.
 *
 * `res.json()` is not enough on its own: a cold start (the service scales to zero, so the first
 * request after idle can outlast the gateway) answers with an HTML error page, and a proxy
 * failure never reaches us at all. Both are transient conditions about our own service, not facts
 * about the client's website, so they must not be reported as "抓取失败".
 */
async function attempt(url: string, timeoutMs: number): Promise<{ json: any; transient: boolean; aborted: boolean }> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(CRAWL_CONFIG.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller ? controller.signal : undefined,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    // 5xx and non-JSON bodies mean the gateway or a cold start, not the target site.
    return { json, transient: !json || res.status >= 500, aborted: false };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { json: null, transient: true, aborted };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchSiteFacts(rawUrl: string): Promise<CrawlOutcome> {
  const url = canonicalUrl(rawUrl || '');
  if (!url) return { facts: null, errorCode: 'NO_URL' };
  if (!CRAWL_CONFIG.enabled) return { facts: null, errorCode: 'DISABLED' };

  const cached = readCache(url);
  if (cached) return { facts: cached };

  let last: { json: any; transient: boolean; aborted: boolean } | null = null;
  for (let i = 0; i < CRAWL_CONFIG.attempts; i += 1) {
    if (i > 0) await new Promise((r) => setTimeout(r, CRAWL_CONFIG.retryDelayMs * i));
    last = await attempt(url, CRAWL_CONFIG.timeoutMs);
    if (!last.transient) break;
  }

  const res = last!;
  if (res.aborted) return { facts: null, errorCode: 'UPSTREAM_TIMEOUT' };
  if (!res.json || res.json.ok !== true || typeof res.json.text !== 'string') {
    return {
      facts: null,
      errorCode: (res.json && res.json.error && res.json.error.code) || (res.transient ? 'SERVICE_BUSY' : 'UPSTREAM_ERROR'),
      errorMessage: (res.json && res.json.error && res.json.error.message) || undefined,
    };
  }
  const facts = res.json as SiteFacts;
  writeCache(url, facts);
  return { facts };
}

/** The page text the engine is allowed to read. Bounded, so a volatile page cannot blow up the id. */
export function siteTextOf(facts: SiteFacts | null): string {
  if (!facts) return '';
  return [
    facts.title,
    facts.siteName,
    facts.description,
    facts.metaKeywords,
    facts.headings.join(' '),
    (facts.navItems || []).join(' '),
    facts.text,
  ]
    .filter(Boolean)
    .join(' ');
}
