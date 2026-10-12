/**
 * Where the official-website fetcher lives.
 *
 * The endpoint is baked in at build time (`NEXT_PUBLIC_CRAWL_ENDPOINT`). When it is absent the
 * build has no fetcher, and `CRAWL_CONFIG.enabled` is false — which is also what
 * `MATCHING_CONFIG.evidenceSources.websiteResearch` reads. So the capability flag and the endpoint
 * can never disagree: a build either has a fetcher and admits it, or has none and says so.
 *
 * There is deliberately no default URL. A hardcoded fallback would silently claim research
 * capability on a build that cannot reach the service.
 */
const endpoint = (process.env.NEXT_PUBLIC_CRAWL_ENDPOINT || '').trim();

export const CRAWL_CONFIG = {
  enabled: endpoint.length > 0,
  endpoint,
  /** Client-side ceiling. Must stay above the service's own upstream timeout (14 s), or the client
   *  would hang up first and turn a slow-but-successful fetch into a reported failure. */
  timeoutMs: 16_000,
  /** The service scales to zero, so the first request after idle can outlast the gateway and come
   *  back as a 5xx or an HTML error page. That is a fact about our own service, not about the
   *  client's website, so it gets a retry instead of being shown to the rep as a failed crawl. */
  attempts: 3,
  retryDelayMs: 2500,
  /** Same URL within this window reuses the stored facts instead of fetching again. */
  cacheTtlMs: 30 * 60 * 1000,
  /** Mirrors the service cap; used only for display sanity checks. */
  maxTextChars: 6000,
} as const;
