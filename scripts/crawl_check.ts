/**
 * Does a real fetch actually change the analysis, and only when one happened?
 *
 * The honesty contract has two halves and both have to hold:
 *   - capability: `evidenceSources.websiteResearch` must be false when no endpoint was baked in;
 *   - occurrence: even with an endpoint, `client_website` evidence and the High confidence band must
 *     require a page that was really opened (`websiteEvidence`), not merely the possibility of one.
 *
 * Run twice — once with NEXT_PUBLIC_CRAWL_ENDPOINT unset, once set — and both halves get exercised.
 */
import { analyzeClient, generateRecommendations } from '../apps/web/lib/matching';
import { CRAWL_CONFIG } from '../apps/web/lib/config/crawl';
import { MATCHING_CONFIG } from '../apps/web/lib/config/matching';
import type { ClientInput, SiteFacts } from '../apps/web/lib/types';

let fails = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
  if (!ok) fails += 1;
};

const FACTS: SiteFacts = {
  requestedUrl: 'https://velour.example',
  finalUrl: 'https://velour.example/en',
  httpStatus: 200,
  fetchedAt: '2026-09-30T04:05:06.000Z',
  bytes: 42113,
  title: 'Velour Intimates — Premium Wellness',
  siteName: 'Velour Intimates',
  description: 'Luxury intimate wellness for women, shipped to the United States.',
  lang: 'en',
  metaKeywords: 'vibrator, massager, lubricant, premium, women',
  headings: ['Our Collections', 'Water-Based Care'],
  text: 'We craft body-safe silicone vibrators, massagers and water-based lubricants for modern couples. Premium pricing.',
  textChars: 132,
  truncated: false,
  socialLinks: ['https://www.instagram.com/velour'],
  charset: 'utf-8',
};

const INPUT: ClientInput = {
  categories: 'intimate wellness',
  website: 'https://velour.example',
  socialLinks: ['https://www.instagram.com/velour'],
  market: 'United States',
  businessType: 'Distributor',
  goal: 'New Product',
};

console.log(`MODE  endpoint baked in: ${CRAWL_CONFIG.enabled} (websiteResearch=${MATCHING_CONFIG.evidenceSources.websiteResearch})`);

// ── 1. The capability flag and the endpoint can never disagree ─────────────────────────────────
check(
  'websiteResearch matches whether an endpoint exists',
  MATCHING_CONFIG.evidenceSources.websiteResearch === CRAWL_CONFIG.enabled,
  `flag=${MATCHING_CONFIG.evidenceSources.websiteResearch} endpoint=${CRAWL_CONFIG.enabled}`,
);

// ── 2. No facts → no website claim, whatever the build can do ─────────────────────────────────
const bare = analyzeClient(INPUT, 'en', null);
check('no fetch → no websiteEvidence', !bare.websiteEvidence);
check('no fetch → confidence never High', bare.confidence !== 'High', `confidence=${bare.confidence}`);
const bareRecs = generateRecommendations(bare, 'en', []);
check(
  'no fetch → no client_website evidence in any recommendation',
  bareRecs.every((r) => (r.evidence ?? []).every((e) => e.type !== 'client_website')),
  `${bareRecs.length} recs scanned`,
);

// ── 3. Facts → the site is genuinely used, but only if the build can fetch ─────────────────────
const crawled = analyzeClient(INPUT, 'en', FACTS);

if (!CRAWL_CONFIG.enabled) {
  // Facts cannot even be produced here (fetchSiteFacts refuses without an endpoint), but the engine
  // must still not cite a website: the claim gate reads the capability flag as well as the evidence.
  check(
    'endpoint-less build still cannot cite the website',
    generateRecommendations(crawled, 'en', []).every((r) => (r.evidence ?? []).every((e) => e.type !== 'client_website')),
  );
} else {
  check('fetch → websiteEvidence records what was read', crawled.websiteEvidence?.url === FACTS.finalUrl, String(crawled.websiteEvidence?.url));
  check('fetch → websiteEvidence records the HTTP status', crawled.websiteEvidence?.httpStatus === 200);
  check('fetch → the site name wins over the domain guess', crawled.name === 'Velour Intimates', crawled.name);
  check('fetch → confidence can reach High', crawled.confidence === 'High', `confidence=${crawled.confidence}`);

  const siteCategories = new Set(crawled.mainCategories);
  check(
    'fetch → site words move the detected categories',
    siteCategories.has('WATER_BASED') && siteCategories.has('FEMALE'),
    [...siteCategories].join(','),
  );
  check('fetch → site words move the price band', crawled.pricePosition === 'Premium' || crawled.pricePosition === 'Luxury', crawled.pricePosition);

  const crawledRecs = generateRecommendations(crawled, 'en', []);
  const withWebsite = crawledRecs.filter((r) => (r.evidence ?? []).some((e) => e.type === 'client_website'));
  check('fetch → recommendations cite the client website', withWebsite.length > 0, `${withWebsite.length}/${crawledRecs.length}`);
  check(
    'fetch → the citation quotes the fetch, not a guess',
    withWebsite.every((r) =>
      (r.evidence ?? [])
        .filter((e) => e.type === 'client_website')
        .every((e) => e.claim.includes('HTTP 200') && e.claim.includes('velour.example')),
    ),
  );
  check(
    'fetch → the analysis really changed (id differs from the no-fetch run)',
    crawled.id !== bare.id,
    `${bare.id} vs ${crawled.id}`,
  );
}

// ── 4. Determinism: the same page always yields the same profile ───────────────────────────────
const again = analyzeClient(INPUT, 'en', FACTS);
check('same facts → byte-identical profile', JSON.stringify(again) === JSON.stringify(crawled));
const againRecs = generateRecommendations(again, 'en', []);
check(
  'same facts → byte-identical recommendations',
  JSON.stringify(againRecs) === JSON.stringify(generateRecommendations(crawled, 'en', [])),
);

console.log(fails === 0 ? '\nOK — crawling is wired to the engine and gated on real fetches' : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
