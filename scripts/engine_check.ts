/**
 * Engine smoke harness — run with jiti, no bundler needed:
 *   apps/web/node_modules/.bin/jiti scripts/engine_check.ts
 *
 * Verifies PRD §18 reproducibility (same client => identical output), the hard-filter
 * completeness gate, and the Top-5 curation slots.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { brandLayer, eligibleProducts, computeCompleteness } from '../apps/web/lib/data/brand';
import { libraryStats, candidateLayer, assetLayer } from '../apps/web/lib/data/library';
import { runEngine, analyzeClient } from '../apps/web/lib/matching';
import { buildAnalysisOutput } from '../apps/web/lib/output';
import { MATCHING_CONFIG, RECALL_BLOCK_WEIGHTS } from '../apps/web/lib/config/matching';
import { t } from '../apps/web/lib/i18n';
import { hasAiScores, hasCommercialData } from '../apps/web/lib/dataPresence';
import { STAGE_LABELS } from '../apps/web/lib/data/library-view';
import {
  ENRICH_FIELDS,
  completenessOf,
  emptyFields,
  toProduct,
  type EnrichmentFields,
} from '../apps/web/lib/data/enrichment';
import type { ClientInput, EvidenceType, Product } from '../apps/web/lib/types';

const clientInput: ClientInput = {
  website: 'https://www.example-intimate.com',
  socialLinks: ['instagram.com/example'],
  categories: 'women vibrator suction massager, couples interactive, lubricant cleanser',
  market: 'US',
  businessType: 'Distributor / Retailer',
};

const profile = analyzeClient(clientInput, 'en');

console.log('=== library ===');
console.log('stats:', JSON.stringify(libraryStats()));
console.log('brandLayer:', brandLayer.length, 'eligible:', eligibleProducts().length);
console.log(
  'brand completeness:',
  brandLayer.map((p) => `${p.product_id}:${p.completeness}`).join(' ')
);

const gate = MATCHING_CONFIG.thresholds.hardFilterCompleteness;
console.log('--- below gate (<' + gate + ') ---');
for (const p of brandLayer) {
  if ((p.completeness ?? 0) < gate) {
    const missing = Object.entries(p)
      .filter(([, v]) => v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0))
      .map(([k]) => k);
    console.log(`  ${p.product_id} ${p.completeness}%  empty-fields=${missing.join(',')}`);
  }
}
console.log('candidate layer:', candidateLayer.length, 'asset layer:', assetLayer.length);

console.log('\n=== engine run #1 ===');
const r1 = runEngine(profile, 'en');
console.log('client:', profile.name, profile.id, 'market', profile.market, 'cats', profile.mainCategories.join('/'));
console.log('libraryEligible:', r1.libraryEligible);
console.log('stages:', JSON.stringify(r1.stages));
for (const r of r1.recommendations) {
  console.log(
    `  slot=${r.curationSlot ?? '-'} ${r.product_id} fit=${r.fitScore} pot=${r.potentialScore} final=${r.finalScore} conf=${r.confidence} role=${r.type}`
  );
}

console.log('\n=== engine run #2 (reproducibility) ===');
const r2 = runEngine(profile, 'en');
const a = JSON.stringify(r1.recommendations.map((r) => [r.product_id, r.fitScore, r.finalScore, r.curationSlot]));
const b = JSON.stringify(r2.recommendations.map((r) => [r.product_id, r.fitScore, r.finalScore, r.curationSlot]));
console.log('identical:', a === b);

console.log('\n=== second client (different profile) ===');
const profile2 = analyzeClient(
  { website: 'https://kink-store.de', socialLinks: [], categories: 'bdsm bondage restraint collar roleplay', market: 'EU' },
  'en'
);
const r3 = runEngine(profile2, 'en');
console.log('cats:', profile2.mainCategories.join('/'), 'price:', profile2.pricePosition);
for (const r of r3.recommendations.slice(0, 8)) {
  console.log(
    `  slot=${r.curationSlot ?? '-'} ${r.product_id} [${r.product.secondary_category}] catFit=${r.dimensionScores.categoryFit} fit=${r.fitScore} final=${r.finalScore}`
  );
}
const top5 = r3.recommendations.filter((r) => r.curationSlot).sort((a, b) => (a.curationSlot ?? 0) - (b.curationSlot ?? 0));
console.log(
  'curated:',
  top5
    .map((r) => `${r.curationSlot}:${r.product_id}(catFit=${r.dimensionScores.categoryFit}${r.curationFallback ? ',FALLBACK' : ''})`)
    .join(' ')
);
console.log('computeCompleteness sanity:', computeCompleteness({ product_name_cn: 'x' }));

// ── PRD §17 fallback banner ────────────────────────────────────────────────────────────────
// The engine returns the closest candidates either way, so the banner is the only thing telling a
// rep "nothing here is a strong match".
//
// What can be asserted from outside the engine is the INVARIANT: the flag is true exactly when the
// best Fit in the scored pool falls under the threshold. Whether it ever fires in practice depends
// on how strong the catalog is, so that is measured and reported rather than asserted — asserting
// "a hostile client must trip it" would be asserting an outcome the catalog decides, not the code.
console.log('\n=== PRD §17 limited-match flag ===');
const FIT_FLOOR = MATCHING_CONFIG.thresholds.fitMinimumFallback;

const sweepProfiles = [
  { label: 'well-matched', p: profile },
  { label: 'bdsm-only', p: profile2 },
  {
    label: 'off-price/luxury',
    p: { ...profile, pricePosition: 'Luxury' },
  },
  {
    label: 'off-style/off-age',
    p: { ...profile, visualStyle: ['Cute'], targetAudience: '18-30' },
  },
  {
    label: 'unsupported market',
    p: { ...profile, market: 'Japan' },
  },
  {
    label: 'all-off',
    p: { ...profile, market: 'Japan', visualStyle: ['Cute'], targetAudience: '18-30', pricePosition: 'Luxury' },
  },
];

let minTopFit = Infinity;
let bannerFires = 0;
for (const { label, p } of sweepProfiles) {
  const res = runEngine(p, 'en');
  if (res.limitedMatch !== res.topFit < FIT_FLOOR) {
    console.error(`FAIL: ${label} flag=${res.limitedMatch} but topFit=${res.topFit} vs floor ${FIT_FLOOR}`);
    process.exitCode = 1;
  }
  if (res.limitedMatch) {
    bannerFires += 1;
    const confs = new Set(res.recommendations.map((r) => r.confidence));
    if (confs.has('High')) {
      console.error(`FAIL: ${label} is a limited match but reports High confidence`);
      process.exitCode = 1;
    }
    if (!res.recommendations.length) {
      console.error(`FAIL: ${label} tripped the banner but returned no fallback candidates (PRD §17 wants top 5)`);
      process.exitCode = 1;
    }
  }
  minTopFit = Math.min(minTopFit, res.topFit);
  console.log(
    `  ${label.padEnd(20)} topFit=${String(res.topFit).padStart(3)} limitedMatch=${res.limitedMatch} recs=${res.recommendations.length}`
  );
}
console.log(`flag == (topFit < ${FIT_FLOOR}) for all ${sweepProfiles.length} profiles: true`);
console.log(`banner fired ${bannerFires}/${sweepProfiles.length}; lowest topFit observed = ${minTopFit}`);
if (bannerFires === 0) {
  console.log(
    'note: the banner is currently unreachable — every profile still finds a >=75 Fit SKU, so the\n' +
      '      13-SKU catalog is strong enough for the cases swept. It is a safety net, not dead code:\n' +
      '      the flag is computed over the live pool, so it starts firing if the pool narrows.'
  );
}

// ── PRD §18 acceptance sweep ───────────────────────────────────────────────────────────────
// Each bullet of §18 that can be checked from the outside gets an assertion here, run over a grid
// of synthetic clients rather than a single happy path — the point is to find the input that
// breaks the rule, not to confirm the one that satisfies it.
console.log('\n=== PRD §18 acceptance sweep ===');

const CATEGORY_INPUTS = [
  'women vibrator suction massager',
  'bdsm bondage restraint collar kink',
  'couples interactive remote wearable gift',
  'lubricant cleanser hygiene care mousse',
  'men prostate masturbator performance',
];
const MARKETS = ['US', 'UK', 'EU', 'Japan', 'Southeast Asia', 'Global'];
const STYLES = [
  'minimal modern premium',
  'cute playful colorful',
  'medical wellness clinical discreet',
  'luxury exclusive high-end designer',
];
const PRICES = ['Entry', 'Mid', 'Mid-Premium', 'Premium', 'Luxury'];

type Violation = { rule: string; detail: string };
const violations: Violation[] = [];
let runs = 0;

for (const categories of CATEGORY_INPUTS) {
  for (const market of MARKETS) {
    for (const style of STYLES) {
      const profile = analyzeClient(
        {
          website: 'https://sweep.example.com',
          socialLinks: [],
          categories: `${categories} ${style}`,
          market,
          businessType: 'Retailer',
        },
        'en'
      );
      profile.pricePosition = PRICES[(runs + 2) % PRICES.length];
      runs += 1;

      const res = runEngine(profile, 'en');
      const label = `${categories.split(' ')[0]}/${market}/${style.split(' ')[0]}/${profile.pricePosition}`;

      // §18 — "Every Fit Score can be recomputed from stored six-dimension subscores."
      const w = MATCHING_CONFIG.fitWeights;
      for (const r of res.recommendations) {
        const s = r.dimensionScores;
        const recomputed = Math.round(
          s.categoryFit * w.category +
            s.audienceFit * w.audience +
            s.brandFit * w.brand +
            s.priceFit * w.price +
            s.portfolioFit * w.portfolio +
            s.marketFit * w.market
        );
        if (recomputed !== r.fitScore) {
          violations.push({
            rule: 'fit-not-recomputable',
            detail: `${label} ${r.product_id} stored=${r.fitScore} recomputed=${recomputed}`,
          });
        }

        // §18 — "80 recalled candidates are traceable to retrieval scores."
        if (typeof r.recallScore !== 'number' || r.recallScore <= 0) {
          violations.push({ rule: 'recall-score-missing', detail: `${label} ${r.product_id} recallScore=${r.recallScore}` });
        } else if (r.recallScore < res.recallCutoff) {
          violations.push({
            rule: 'recall-score-below-cutoff',
            detail: `${label} ${r.product_id} score=${r.recallScore} < cutoff=${res.recallCutoff}`,
          });
        }

        // §18 — "Potential Score never overwrites Fit Score."
        // Not testable as `fit !== potential` (two independent scores can coincide, and 31 of the
        // 120 profiles did exactly that). The rule means the two are separate quantities with
        // separate inputs, so the checkable form is: Fit reproduces from the six dimensions, and
        // Potential reproduces from its own five inputs. Each is attributed to its own formula.
        const pw = MATCHING_CONFIG.potentialWeights;
        const gap = profile.mainCategories.includes(r.product.primary_category) ? 50 : 100;
        const mktOpp = profile.market !== 'Global' && r.product.target_market.includes(profile.market as never) ? 90 : 70;
        const diff = r.product.ai_scores?.functional_differentiation ?? 70;
        const priceExp = r.product.price_level === 'Premium' || r.product.price_level === 'Luxury' ? 85 : 70;
        const strategic = r.product.tags.includes('Strategic Product') ? 95 : 75;
        const potRecomputed = Math.round(
          gap * pw.portfolioGap +
            mktOpp * pw.marketOpportunity +
            diff * pw.differentiation +
            priceExp * pw.priceExpansion +
            strategic * pw.strategicValue
        );
        if (potRecomputed !== r.potentialScore) {
          violations.push({
            rule: 'potential-not-recomputable',
            detail: `${label} ${r.product_id} stored=${r.potentialScore} recomputed=${potRecomputed}`,
          });
        }

        // §18 — "Every recommendation reason references at least one client fact and one product fact."
        if (!r.reason.clientFact || !r.reason.productFact) {
          violations.push({ rule: 'reason-missing-fact', detail: `${label} ${r.product_id}` });
        }
      }

      // §18 — "Final Top 5 contains no more than 2 of the same secondary category
      //        unless explicitly justified."
      // The diversity rerank caps the *reranked order*, but curate() assigns slots by category-fit
      // gate, so the curated five are not guaranteed to be that order's first five. This checks the
      // actual curated set, not the intermediate.
      const curated = res.recommendations.filter((r) => r.curationSlot != null);
      const perCategory = new Map<string, number>();
      for (const r of curated) {
        const key = r.product.secondary_category || r.product.primary_category;
        perCategory.set(key, (perCategory.get(key) || 0) + 1);
      }
      for (const [key, n] of perCategory) {
        if (n > MATCHING_CONFIG.thresholds.sameCategoryTop5Limit) {
          violations.push({
            rule: 'top5-category-cap',
            detail: `${label} "${key}" appears ${n}x in curated [${curated
              .map((r) => `${r.curationSlot}:${r.product_id}`)
              .join(' ')}]`,
          });
        }
      }
      if (curated.length > MATCHING_CONFIG.thresholds.finalRecommendationCount) {
        violations.push({ rule: 'top5-too-many', detail: `${label} curated=${curated.length}` });
      }
    }
  }
}

console.log(`profiles swept: ${runs}`);
console.log('violations:', violations.length);
const byRule = new Map<string, Violation[]>();
for (const v of violations) byRule.set(v.rule, [...(byRule.get(v.rule) || []), v]);
for (const [rule, list] of byRule) {
  console.error(`  FAIL ${rule} x${list.length}`);
  for (const v of list.slice(0, 5)) console.error(`       ${v.detail}`);
}
if (violations.length) process.exitCode = 1;
else console.log('all §18 bullets hold across the sweep');

// ── Honesty guards: the analysis must not claim research it never did ──────────────────────
// The app is a static export with no network calls, so nothing is fetched from a client website or
// social account. Three things follow, and each is asserted rather than trusted:
//   1. no evidence may be attributed to a source the build cannot reach
//   2. confidence must not be a function of the URL's *format* (it used to be startsWith('http'))
//   3. the top confidence band needs a reachable research source
console.log('\n=== honesty guards (no fabricated research) ===');
const UNREACHABLE: EvidenceType[] = ['client_website', 'client_product_portfolio', 'client_social', 'market_research'];
const reachable = {
  client_website: MATCHING_CONFIG.evidenceSources.websiteResearch,
  client_social: MATCHING_CONFIG.evidenceSources.socialResearch,
  market_research: MATCHING_CONFIG.evidenceSources.marketResearch,
  client_product_portfolio: false, // never fetched; the portfolio is what the rep declared
};
console.log('reachable sources:', JSON.stringify(MATCHING_CONFIG.evidenceSources));

let honestyFails = 0;
const honestFail = (msg: string) => {
  console.error(`FAIL  ${msg}`);
  honestyFails += 1;
};

const probe = analyzeClient(
  { website: 'https://probe.example.com', socialLinks: ['https://instagram.com/probe'], categories: 'women vibrator suction', market: 'US', businessType: 'Retailer' },
  'en'
);
const probeRes = runEngine(probe, 'en');
const seenTypes = new Set<string>();
for (const r of probeRes.recommendations) {
  for (const e of r.evidence ?? []) {
    seenTypes.add(e.type);
    const flag = reachable[e.type as keyof typeof reachable];
    if (UNREACHABLE.includes(e.type) && !flag) {
      honestFail(`evidence cites unreachable source "${e.type}": ${e.claim}`);
    }
  }
  // PRD §13 wants at least two evidence types per recommendation, and §18 wants a client fact and
  // a product fact — a trail made only of Product Master rows would fail both.
  const types = new Set((r.evidence ?? []).map((e) => e.type));
  if (types.size < 2) honestFail(`${r.product_id} has only ${types.size} evidence type(s)`);
  if (!types.has('product_master')) honestFail(`${r.product_id} has no verified product_master evidence`);
  if (!types.has('sales_input')) honestFail(`${r.product_id} has no client-side sales_input evidence`);
}
console.log('evidence types emitted:', [...seenTypes].sort().join(', '));

// 2. Confidence must ignore how the URL is spelled.
const urlVariants = ['https://x.com', 'http://x.com/', 'https://a-very-long-subdomain.example.co.uk/p?q=1'];
const confOf = (url: string) =>
  analyzeClient({ website: url, socialLinks: [], categories: 'women vibrator', market: 'US', businessType: 'Retailer' }, 'en').confidence;
const confs = urlVariants.map(confOf);
console.log(`confidence across URL spellings: ${confs.join(' / ')}`);
if (new Set(confs).size !== 1) honestFail(`confidence depends on URL format: ${confs.join(' / ')}`);

// 3. Monotonic in evidence: adding signals must never lower the band.
const ladder = [
  { website: '', socialLinks: [], categories: '', market: '', businessType: '' },
  { website: 'https://x.com', socialLinks: [], categories: '', market: '', businessType: '' },
  { website: 'https://x.com', socialLinks: [], categories: 'women vibrator', market: '', businessType: '' },
  { website: 'https://x.com', socialLinks: ['https://ig.com/x'], categories: 'women vibrator', market: 'US', businessType: 'Retailer' },
];
const ORDER = { Low: 0, Medium: 1, High: 2 } as const;
const bands = ladder.map((l) => analyzeClient(l as never, 'en').confidence);
console.log('confidence ladder:', bands.join(' -> '));
for (let i = 1; i < bands.length; i += 1) {
  if (ORDER[bands[i]] < ORDER[bands[i - 1]]) honestFail(`confidence dropped when evidence was added: ${bands.join(' -> ')}`);
}

// 4. The top band requires a reachable research source.
const canResearch =
  MATCHING_CONFIG.evidenceSources.websiteResearch || MATCHING_CONFIG.evidenceSources.socialResearch || MATCHING_CONFIG.evidenceSources.marketResearch;
const best = bands[bands.length - 1];
console.log(`richest input reaches "${best}"; research available: ${canResearch}`);
if (!canResearch && best === 'High') honestFail('a client reached High confidence with no reachable research source');

// The scope disclosure must be shown wherever the pipeline is presented, or the cap above is
// invisible to the rep. Checked as a dictionary-presence assertion here; the UI reads these keys.
for (const k of ['analysisScopeNote', 'analysisStepsTitle', 'ev_sales_input']) {
  if (t(k, 'zh') === k || t(k, 'en') === k) honestFail(`disclosure key "${k}" missing from the dictionary`);
}

console.log(honestyFails ? `\n${honestyFails} honesty FAILURE(S)` : '\nhonesty guards hold');
if (honestyFails) process.exitCode = 1;

// ── Source scan: the UI must not re-acquire claims it cannot back ───────────────────────────
// Runtime assertions above can only see the strings the engine produces. The false claims that were
// fixed lived in UI copy (progress steps, a page title, a parallel set of dictionary keys), so those
// are scanned at the source instead. Each literal below asserted work with no network access behind
// it — reintroducing one is a regression even if every score still computes correctly.
console.log('\n=== source scan: no unbacked research claims ===');
const FORBIDDEN = [
  '正在分析客户网站',
  'Analyzing client website',
  '正在分析社交媒体',
  'Analyzing social presence',
  '正在识别品牌定位',
  'Identifying brand positioning',
  '正在研究市场定位',
  'Researching market positioning',
  '正在研究您的客户',
  'Researching Your Client',
];
const SCAN_DIRS = ['app', 'components', 'lib'];
const scanned: string[] = [];
const walk = (dir: string) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(entry.name)) scanned.push(full);
  }
};
for (const d of SCAN_DIRS) walk(`apps/web/${d}`);

let claimHits = 0;
for (const file of scanned) {
  const text = readFileSync(file, 'utf8');
  for (const needle of FORBIDDEN) {
    if (text.includes(needle)) {
      console.error(`FAIL  ${file} still claims "${needle}" — nothing in this build can back it`);
      claimHits += 1;
    }
  }
}
console.log(`files scanned: ${scanned.length} | forbidden claim hits: ${claimHits}`);
if (claimHits) process.exitCode = 1;
else console.log('no unbacked research claims in the source');

// ── PRD §19: "all weights, thresholds, tag enums and prompt versions must be configurable and not
// hard-coded in the frontend" ──
// The violation this catches: three components each carried a private copy of the score→band edges
// (`FitBadge` and `ScoreRing` used 90/80/70/60, `SixDimBars` used 85/70), so one score drew as
// "strong" in one place and "medium" in another. Every score comparison against a literal must go
// through `scoreBand()`, whose thresholds live in `config/matching.ts` `scoreBands`.
console.log('\n=== PRD §19: score thresholds must come from config ===');
/**
 * Values that must be read from `config/matching.ts` when compared against a policy-shaped name.
 *
 * The small counts (2, 3) are included on purpose: `signals >= 3` and `bestCount >= 2` were both
 * real literals this section caught. They are only matched when the left-hand identifier looks like
 * policy (`signals`, `hits`, `count`, `score`, …), so mechanical comparisons such as `i > 0` or
 * `d === 1` do not trip it. `===`/`!==` are excluded for the same reason.
 */
const POLICY_VALUES = '2|3|30|50|60|70|75|80|85|90|95';
const POLICY_NAME =
  'score|fit|potential|pct|percent|signals|hits|share|count|threshold|gate|completeness|best';
const SCORE_THRESHOLD = new RegExp(
  `\\b\\w*(?:${POLICY_NAME})\\w*\\s*(?:>=|<=|>|<)\\s*(?:${POLICY_VALUES})\\b`,
  'gi'
);

let thresholdHits = 0;
for (const file of scanned) {
  const text = readFileSync(file, 'utf8');
  text.split('\n').forEach((line, lineNo) => {
    for (const m of line.matchAll(SCORE_THRESHOLD)) {
      console.error(
        `FAIL  ${file}:${lineNo + 1} compares against the literal "${m[0].trim()}" — ` +
          'read it from config/matching.ts (scoreBand) instead of hard-coding it'
      );
      thresholdHits += 1;
    }
  });
}
console.log(`score-threshold literals in the frontend: ${thresholdHits}`);
if (thresholdHits) process.exitCode = 1;
else console.log('every score threshold is config-driven');

// The bands the UI reads must exist and be ordered high → low with a floor at 0, otherwise
// `scoreBand()` can return undefined for a low score. Assert the shape, not just the presence.
const bandTable = MATCHING_CONFIG.scoreBands;
const shapeFails: string[] = [];
const badShape = bandTable.find((b, i) => (i > 0 && b.min >= bandTable[i - 1].min) || b.min < 0);
console.log(
  'scoreBands:',
  bandTable.map((b) => `${b.key}>=${b.min}`).join(' ')
);
if (badShape) shapeFails.push(`scoreBands is not strictly descending: ${JSON.stringify(bandTable)}`);
if (bandTable[bandTable.length - 1].min !== 0) shapeFails.push('scoreBands must end at min 0 or low scores resolve to no band');
// Every band needs a dictionary entry, or the badge prints a raw key.
for (const b of bandTable) {
  if (t(b.key, 'zh') === b.key || t(b.key, 'en') === b.key) {
    shapeFails.push(`scoreBands key "${b.key}" has no dictionary entry`);
  }
}
shapeFails.forEach((f) => console.error(`FAIL  ${f}`));
console.log(`scoreBands shape problems: ${shapeFails.length}`);
if (shapeFails.length) process.exitCode = 1;

// ── PRD §16 — the JSON output contract ──
// §16 names the fields the pipeline hands downstream, in snake_case. Nothing was emitting it:
// `analysis_version` had no outlet, `product_intelligence_score` was computed for the Final formula
// and thrown away, and `related_products` did not exist at all. Asserting the shape field by field
// is the only way this stays true — a rename or a dropped field is invisible to tsc because the
// contract is a different vocabulary from the internal types.
console.log('\n=== PRD §16: analysis output contract ===');

/** PRD §16's field names, verbatim. */
const PRD_REC_KEYS = [
  'product_id',
  'sku',
  'recommendation_type',
  'fit_score',
  'potential_score',
  'product_intelligence_score',
  'final_score',
  'confidence',
  'six_dimension',
  'why_recommend',
  'evidence',
  'related_products',
];
const PRD_SIX_KEYS = ['category_fit', 'audience_fit', 'brand_fit', 'price_fit', 'portfolio_fit', 'market_fit'];
const PRD_WHY_KEYS = ['client_fact', 'product_fact', 'business_reason'];
const PRD_RELATED_KEYS = ['cross_sell', 'upsell', 'alternative'];
/** PRD §13 evidence vocabulary, plus `sales_input` (rep-declared, this build's only client source). */
const PRD_EVIDENCE_TYPES = [
  'client_website',
  'client_product_portfolio',
  'client_social',
  'market_research',
  'product_master',
  'sales_input',
];

/** Exact key-set comparison: extra keys are as much a contract break as missing ones. */
const hasExactKeys = (obj: object, expected: string[]) => {
  const got = Object.keys(obj).sort();
  const want = [...expected].sort();
  return got.length === want.length && got.every((k, i) => k === want[i]);
};

const contractFails: string[] = [];
const [outputZh, outputEn] = [('zh' as const), ('en' as const)].map((l) =>
  buildAnalysisOutput(profile, runEngine(profile, l), l)
);

// The version the document declares must be the one the engine ran under — single source in config.
if (outputZh.analysis_version !== MATCHING_CONFIG.matchPipelineVersion) {
  contractFails.push(
    `analysis_version "${outputZh.analysis_version}" != config.matchPipelineVersion "${MATCHING_CONFIG.matchPipelineVersion}"`
  );
}
if (!hasExactKeys(outputZh, ['client_id', 'analysis_version', 'summary', 'recommendations'])) {
  contractFails.push(`top-level keys are not PRD §16's: ${Object.keys(outputZh).join(', ')}`);
}
if (!hasExactKeys(outputZh.summary, ['positioning', 'market', 'confidence'])) {
  contractFails.push(`summary keys are not PRD §16's: ${Object.keys(outputZh.summary).join(', ')}`);
}
if (!Array.isArray(outputZh.summary.market) || outputZh.summary.market.length === 0) {
  contractFails.push('summary.market must be a non-empty array (PRD §16 types it as one)');
}
if (!outputZh.client_id) contractFails.push('client_id is empty');

const allSkus = new Set(eligibleProducts().map((p) => p.sku));
const scoredById = new Map(eligibleProducts().map((p) => [p.product_id, p]));

for (const [idx, rec] of outputZh.recommendations.entries()) {
  const where = `recommendations[${idx}]`;
  if (!hasExactKeys(rec, PRD_REC_KEYS)) {
    contractFails.push(`${where} keys are not PRD §16's: ${Object.keys(rec).join(', ')}`);
    continue;
  }
  // camelCase leaking into the contract is the failure this catches: `fitScore` type-checks fine
  // in TS but no §16 consumer would find it.
  const camel = Object.keys(rec).filter((k) => /[A-Z]/.test(k));
  if (camel.length) contractFails.push(`${where} leaks camelCase keys: ${camel.join(', ')}`);

  if (!hasExactKeys(rec.six_dimension, PRD_SIX_KEYS)) {
    contractFails.push(`${where}.six_dimension keys wrong: ${Object.keys(rec.six_dimension).join(', ')}`);
  }
  if (!hasExactKeys(rec.why_recommend, PRD_WHY_KEYS)) {
    contractFails.push(`${where}.why_recommend keys wrong: ${Object.keys(rec.why_recommend).join(', ')}`);
  }
  if (!hasExactKeys(rec.related_products, PRD_RELATED_KEYS)) {
    contractFails.push(`${where}.related_products keys wrong: ${Object.keys(rec.related_products).join(', ')}`);
  }

  for (const k of ['fit_score', 'potential_score', 'final_score'] as const) {
    if (typeof rec[k] !== 'number' || !Number.isFinite(rec[k])) {
      contractFails.push(`${where}.${k} is not a finite number: ${JSON.stringify(rec[k])}`);
    }
  }
  // PRD §16, amended: `product_intelligence_score` is a number when the product has actually been
  // evaluated and null when it never has. The Final formula substitutes a neutral 75 internally so
  // its weighted sum has a number, and shipping that placeholder is how a score nothing produced
  // would end up on every recommendation. The companion check below asserts null matches "no score".
  if (rec.product_intelligence_score !== null && !Number.isFinite(rec.product_intelligence_score)) {
    contractFails.push(
      `${where}.product_intelligence_score must be a finite number or null, got ${JSON.stringify(rec.product_intelligence_score)}`,
    );
  }
  if (!['High', 'Medium', 'Low'].includes(rec.confidence)) {
    contractFails.push(`${where}.confidence is not a PRD §12 band: ${rec.confidence}`);
  }

  // `product_intelligence_score` must be the score the row actually carries, and nothing else. The
  // Final formula substitutes a neutral 75 internally so its weighted sum has a number to work with;
  // exporting that placeholder would put a score on every recommendation that nothing ever produced.
  // So: equal when there is a score, null when there is not.
  const product = scoredById.get(rec.product_id);
  if (product) {
    const real = typeof product.ai_scores?.total === 'number' ? product.ai_scores.total : null;
    if (rec.product_intelligence_score !== real) {
      contractFails.push(
        `${where}.product_intelligence_score ${rec.product_intelligence_score} != ai_scores.total ${real}`
      );
    }
  }

  if (!rec.evidence.length) contractFails.push(`${where}.evidence is empty (PRD §13 wants ≥1 source)`);
  for (const e of rec.evidence) {
    if (!PRD_EVIDENCE_TYPES.includes(e.type)) {
      contractFails.push(`${where}.evidence type "${e.type}" is not in PRD §13`);
    }
    if (!e.claim || typeof e.claim !== 'string') {
      contractFails.push(`${where}.evidence has an empty claim`);
    }
    // §13 honesty: while a research source is switched off, no evidence may claim to come from it.
    if (e.type === 'client_website' && !MATCHING_CONFIG.evidenceSources.websiteResearch) {
      contractFails.push(`${where}.evidence claims client_website while websiteResearch is false`);
    }
    if (e.type === 'client_social' && !MATCHING_CONFIG.evidenceSources.socialResearch) {
      contractFails.push(`${where}.evidence claims client_social while socialResearch is false`);
    }
    if (e.type === 'market_research' && !MATCHING_CONFIG.evidenceSources.marketResearch) {
      contractFails.push(`${where}.evidence claims market_research while marketResearch is false`);
    }
  }

  // related_products may only name SKUs that exist — this is where "never invent" is enforced,
  // because a related-product list is exactly the kind of field that invites plausible filler.
  for (const bucket of PRD_RELATED_KEYS as readonly ('cross_sell' | 'upsell' | 'alternative')[]) {
    const list = rec.related_products[bucket];
    if (!Array.isArray(list)) {
      contractFails.push(`${where}.related_products.${bucket} is not an array`);
      continue;
    }
    if (list.length > MATCHING_CONFIG.relatedProducts.maxPerBucket) {
      contractFails.push(
        `${where}.related_products.${bucket} has ${list.length} > cap ${MATCHING_CONFIG.relatedProducts.maxPerBucket}`
      );
    }
    for (const sku of list) {
      if (typeof sku !== 'string' || !allSkus.has(sku)) {
        contractFails.push(`${where}.related_products.${bucket} names a SKU not in the catalogue: ${sku}`);
      }
      if (sku === rec.sku) contractFails.push(`${where}.related_products.${bucket} lists the SKU itself`);
    }
  }
  // why_recommend must carry prose, not blanks — PRD §1 requires a reason per recommendation.
  for (const k of PRD_WHY_KEYS as readonly ('client_fact' | 'product_fact' | 'business_reason')[]) {
    if (!rec.why_recommend[k]?.trim()) contractFails.push(`${where}.why_recommend.${k} is blank`);
  }
}

// The contract is produced per language; the structure must not depend on which one was asked for,
// and the prose must actually differ, or `lang` is being ignored somewhere (§18).
if (JSON.stringify(Object.keys(outputEn)) !== JSON.stringify(Object.keys(outputZh))) {
  contractFails.push('the output shape changes with language');
}
const zhSide = outputZh.recommendations[0]?.why_recommend.client_fact;
const enSide = outputEn.recommendations[0]?.why_recommend.client_fact;
if (zhSide && enSide && zhSide === enSide) {
  contractFails.push('why_recommend.client_fact is identical in zh and en — lang is not reaching the output');
}

// PRD §1 / TABLE 1: the pipeline ends at 5 recommendations, so the contract carries the curated set.
if (outputZh.recommendations.length === 0) {
  contractFails.push('no curated recommendations were emitted at all');
}
if (outputZh.recommendations.length > MATCHING_CONFIG.thresholds.finalRecommendationCount) {
  contractFails.push(
    `emitted ${outputZh.recommendations.length} recommendations, more than the PRD cap ${MATCHING_CONFIG.thresholds.finalRecommendationCount}`
  );
}

// A bucket that can never fill is worse than a missing field: the schema passes while the sales rep
// gets an empty list forever. This is the assertion that caught `alternative`, whose original
// definition (same secondary category AND same price rung) no row in the 13-SKU library could
// satisfy — the library has 13 distinct `secondary|price` pairs.
//
// Measured over EVERY scored row, not just the curated five. The distinction matters: a curated
// Top 5 can legitimately contain no product that has anything to trade up to (this client's five
// include three sitting at the top rung of their primary category), but if no row in the whole pool
// can fill a bucket then the definition is dead, and that is a defect rather than a coincidence.
const bucketHealth = runEngine(profile, 'en').recommendations;
for (const bucket of PRD_RELATED_KEYS as readonly ('cross_sell' | 'upsell' | 'alternative')[]) {
  const filled = bucketHealth.filter((r) => (r.relatedProducts?.[bucket]?.length ?? 0) > 0).length;
  const inContract = outputZh.recommendations.filter((r) => r.related_products[bucket].length > 0).length;
  console.log(
    `related_products.${bucket}: fills ${filled}/${bucketHealth.length} scored rows, ${inContract}/${outputZh.recommendations.length} curated`
  );
  if (filled === 0) {
    contractFails.push(
      `related_products.${bucket} is empty for every scored row — the bucket definition cannot be satisfied by the current catalogue`
    );
  }
}

// ── Guard: the headline slots stay inside the buyer's own categories ───────────────────────────
// This is the PM's core requirement — recommendations follow the buyer's categories and website.
// It is easy to lose by accident: an earlier version gated the two headline slots on a categoryFit
// score, which a product from another category can still reach, and a male-accessory buyer was
// shown a vibrator as slot 01. The membership rule now lives in `curate`, and this asserts it.
//
// Profiles whose categories are entirely absent from the catalogue are exempt and must instead be
// flagged `noProductsInClientCategories` — absence is a fact to report, not a ranking to fudge.
console.log('\n=== guard: headline slots follow the buyer categories ===');
{
  const catCases: { label: string; input: Parameters<typeof analyzeClient>[0] }[] = [
    { label: 'male accessories', input: { categories: 'male masturbator stroker cock ring', market: 'US', businessType: 'Retailer' } },
    { label: 'bdsm bondage', input: { categories: 'bdsm bondage restraint collar', market: 'EU', businessType: 'Retailer' } },
    { label: 'female toys', input: { categories: 'women vibrator massager', market: 'US', businessType: 'Brand' } },
  ];
  for (const c of catCases) {
    const cp = analyzeClient({ ...c.input, website: '', socialLinks: [] } as never, 'en');
    const res = runEngine(cp, 'en');
    const own = eligibleProducts().filter((p) => cp.mainCategories.includes(p.primary_category)).length;
    if (own === 0) {
      // Nothing in stock for this buyer: the flag must be set so the screen can say so.
      if (!res.noProductsInClientCategories) {
        discardFail(`${c.label}: no products in the buyer's categories but the flag is not set`);
      }
      continue;
    }
    if (res.noProductsInClientCategories) {
      discardFail(`${c.label}: ${own} products exist in the buyer's categories but the no-stock flag is set`);
    }
    for (const r of res.recommendations.filter((x) => x.curationSlot === 1)) {
      if (!cp.mainCategories.includes(r.product.primary_category)) {
        discardFail(`${c.label}: slot 01 is ${r.product.primary_category} for a ${cp.mainCategories.join('/')} buyer`);
      }
    }
    const curated = res.recommendations.filter((x) => x.curationSlot != null);
    const onCat = curated.filter((x) => cp.mainCategories.includes(x.product.primary_category)).length;
    console.log(`  ${c.label}: ${onCat}/${curated.length} curated in-category, ${own} products available`);
    if (onCat < Math.ceil(curated.length / 2)) {
      discardFail(`${c.label}: only ${onCat}/${curated.length} curated products are in the buyer's categories`);
    }
  }
}

// ── Guard: a hand-filled row enters the pool whatever its completeness ─────────────────────────
// The PM fills a candidate row in by hand and it must reach the pool. The completeness gate exists to
// keep near-empty crawled rows from swamping the recommendations, but applied to hand-filled rows it
// silently discarded the work: the page said "saved" and the row never appeared even in the candidate
// list. Only a missing category still blocks one, since without a category it cannot be matched to a
// buyer's categories at all.
console.log('\n=== guard: hand-filled rows bypass the completeness gate ===');
{
  const probeClient = analyzeClient(
    { website: '', socialLinks: [], categories: 'female vibrator', market: 'US', businessType: 'Retailer' } as never,
    'en',
  );
  const base = brandLayer.find((x) => x.primary_category === 'FEMALE');
  if (!base) {
    discardFail('no FEMALE row to build the hand-filled probe from');
  } else {
    const thin: Product = {
      ...base,
      product_id: 'PROBE-THIN',
      sku: 'PROBE-THIN',
      // Below the gate on purpose: this is the case the PM asked about.
      completeness: MATCHING_CONFIG.thresholds.hardFilterCompleteness - 5,
      description_cn: '',
      key_selling_point_cn: '',
      design_style: '',
      visual_style: '',
      target_age: '',
      target_segment: '',
      price_level: 'Mid',
      target_market: ['Global'],
    };
    const noCategory: Product = { ...thin, product_id: 'PROBE-NOCAT', sku: 'PROBE-NOCAT', primary_category: '' };

    const withThin = runEngine(probeClient, 'en', [thin]);
    const thinIn = withThin.recommendations.some((r) => r.product.product_id === 'PROBE-THIN');
    console.log(`  thin row (${thin.completeness}% < gate) in pool: ${thinIn}`);
    if (!thinIn) discardFail('a hand-filled row below the completeness gate was dropped from the pool');

    const withoutCat = runEngine(probeClient, 'en', [noCategory]);
    const catIn = withoutCat.recommendations.some((r) => r.product.product_id === 'PROBE-NOCAT');
    if (catIn) discardFail('a hand-filled row with no primary category was allowed into the pool');
    console.log(`  category-less row in pool: ${catIn} (must be false)`);
  }
}

contractFails.forEach((f) => console.error(`FAIL  ${f}`));
console.log(
  `analysis_version: ${outputZh.analysis_version} | recommendations: ${outputZh.recommendations.length} | contract problems: ${contractFails.length}`
);
if (contractFails.length) process.exitCode = 1;
else console.log('the analysis output satisfies PRD §16 field by field');

// ── Computed then discarded: the screen must read what the engine already produced ─────────────
// One disease, three separate defects — and the PRD §19 scan above cannot see any of them, because
// its regex only matches *comparisons* against policy-shaped names, never the wiring that consumes
// or fails to consume a value:
//
//   1. PRD TABLE 10 — "when a recommendation has no commercial data, hide price/MOQ and show a
//      quote CTA". No predicate existed for this. Three components printed price / MOQ / lead time
//      unconditionally, so a row with no terms rendered as "MOQ —" — an empty cell that reads like
//      a missing value rather than a question the rep should be asking.
//   2. Rows promoted through `enrichment.toProduct` are built with `ai_scores: {}` and
//      `commercial: {}` hard-coded. `ScoreRing` fed `undefined` fell through to the LOWEST band, so
//      an unscored row drew six red rings: "not scored yet" was rendered as "scores badly". That is
//      a fabricated negative claim, which is worse than a blank — and it stayed invisible because
//      the detail page is normally reached with one of the 13 curated brand SKUs, every one of
//      which is fully scored.
//   3. PRD §17's `limitedMatch` flag was computed on every single run and read by no component.
//
// The runtime half below asserts the predicates ARE their definitions. The source half asserts the
// wiring, because a predicate nothing calls still passes every runtime check in this file.
// ── Guard: every key library-view reads must exist in library-stats.json ──────────────────────
// That file is generated, and a generator that rewrote it wholesale once took these keys with it.
// Nothing in the type system catches it (the JSON is imported through a cast), and the symptom was a
// blank /catalog/ in production rather than a failed build.
console.log('\n=== guard: library-view keys exist in the stats file ===');
{
  const statsRaw = JSON.parse(readFileSync('apps/web/lib/data/library-stats.json', 'utf8'));
  const required = ['layers', 'enrichmentQueue', 'pmRequiredFields'];
  const missingKeys = required.filter((k) => statsRaw[k] === undefined || statsRaw[k] === null);
  console.log(missingKeys.length ? `missing: ${missingKeys.join(', ')}` : `all present: ${required.join(', ')}`);
  if (missingKeys.length) discardFail(`library-stats.json is missing ${missingKeys.join(', ')} - /catalog/ would render nothing`);
  // The UI iterates two of them, so a non-array value is just a delayed crash.
  for (const k of required.filter((x) => x !== 'layers')) {
    if (statsRaw[k] !== undefined && !Array.isArray(statsRaw[k])) discardFail(`library-stats.json ${k} must be an array`);
  }
}

console.log('\n=== computed then discarded: the UI must read what the engine computed ===');
const discarded: string[] = [];
const discardFail = (msg: string) => {
  console.error(`FAIL  ${msg}`);
  discarded.push(msg);
};

/** The rule, stated here a second time on purpose: a guard that reads its definition out of the
 *  code under test can only ever agree with it. These two lines are the independent copy. */
const defCommercial = (p: Product) => typeof p.wholesale_price === 'number' && !!p.moq?.trim();
const defScored = (p: Product) => typeof p.ai_scores?.total === 'number';

// (a) Does TABLE 10's false-branch still exist? Promotion is the path that reaches it: a crawled row
// is enriched until it clears the completeness gate, and the promoted product arrives with no terms
// at all. Fill EVERY enrichable field so the measurement is about the template's ceiling, not about
// how much a particular candidate happened to have.
const filled: EnrichmentFields = (() => {
  const f = emptyFields();
  for (const spec of ENRICH_FIELDS) {
    const first = spec.options?.[0] ?? '';
    const value =
      spec.kind === 'enum' ? first : spec.kind === 'multi' ? (first ? [first] : []) : spec.kind === 'bool' ? true : 'FILLED';
    (f as Record<string, unknown>)[spec.key] = value;
  }
  return f;
})();
const promotion = candidateLayer
  .map((c) => ({ p: toProduct(c, filled), pct: completenessOf(c, filled) }))
  .sort((a, b) => b.pct - a.pct || a.p.product_id.localeCompare(b.p.product_id));
const gateLine = MATCHING_CONFIG.thresholds.hardFilterCompleteness;
const promotable = promotion.filter((r) => r.pct >= gateLine);
console.log(
  `promotion path: ${candidateLayer.length} crawled rows -> ${promotable.length} clear the >=${gateLine} gate with every field filled`
);
if (promotable.length === 0) {
  discardFail('no crawled row can clear the completeness gate even with every enrichment field filled — the promotion path is dead and TABLE 10 is unreachable');
}

const noTerms = promotable.filter((r) => !hasCommercialData(r.p));
const noScore = promotable.filter((r) => !hasAiScores(r.p));
console.log(`of those, ${noTerms.length} arrive with no commercial terms and ${noScore.length} with no ai_scores`);

// The "no data yet" copy must stay reachable, otherwise nobody will ever notice it breaking. This
// is a coupling invariant in both directions: the enrichment template cannot supply terms, therefore
// promoted rows cannot have them. If someone adds `moq` to ENRICH_FIELDS this fires — not because
// that change is wrong, but because the quote-CTA branch then needs re-verifying by hand.
const COMMERCIAL_KEYS = ['moq', 'wholesale_price', 'lead_time', 'sample_price'];
const templateHasTerms = ENRICH_FIELDS.some((f) => COMMERCIAL_KEYS.includes(f.key as string));
if (templateHasTerms && noTerms.length > 0) {
  discardFail(`ENRICH_FIELDS now carries a commercial field (${COMMERCIAL_KEYS.join('/')}) yet promoted rows still have no terms — toProduct is dropping them`);
}
if (!templateHasTerms && promotable.length > 0 && noTerms.length === 0) {
  discardFail('promoted rows carry commercial terms though nothing in the enrichment template can supply them — the terms were invented');
}
// Promotion deliberately never stores engine scores: scores are computed per client at request time,
// so a stored one would be a claim about the wrong client. A promoted row therefore MUST arrive
// unscored, and the detail page must say so rather than drawing rings.
const scoredOnPromotion = promotable.filter((r) => hasAiScores(r.p));
if (scoredOnPromotion.length > 0) {
  discardFail(`${scoredOnPromotion.length} promoted row(s) carry a stored ai_scores.total — scores are per-client and must not be persisted onto the catalogue`);
}

// (b) The predicate must agree with the rule on rows that can tell the two apart. Checking the
// The catalogue alone is not enough, and neither is the first row: every real product row now
// comes from a shaki.com product page, which publishes no price, no MOQ and no AI evaluation — so
// deriving the template from brandLayer[0] would make every case below vacuously false and let a
// broken predicate pass. The template states its own terms explicitly, and "Price present, MOQ
// blank" — a shape no catalogue row has — is what discriminates a predicate that quietly stopped
// requiring the MOQ.
const template: Product = {
  ...brandLayer[0],
  wholesale_price: 20,
  moq: '50 pcs',
  ai_scores: {
    product_quality: 80, design_value: 80, functional_differentiation: 80,
    commercial_potential: 80, market_adaptability: 80, brand_value: 80, total: 80,
  },
};
const mk = (over: Partial<Product>): Product => ({ ...template, ...over });
const DISCRIMINATING: { label: string; row: Product; terms: boolean; scored: boolean }[] = [
  { label: 'price + MOQ', row: mk({ wholesale_price: 12, moq: '100 pcs' }), terms: true, scored: true },
  { label: 'price, MOQ blank', row: mk({ wholesale_price: 12, moq: '   ' }), terms: false, scored: true },
  { label: 'MOQ, price absent', row: mk({ wholesale_price: undefined, moq: '100 pcs' }), terms: false, scored: true },
  { label: 'neither', row: mk({ wholesale_price: undefined, moq: '' }), terms: false, scored: true },
  // Presence, not truthiness. A real score of 0 is a score; reading it as "unscored" would file the
  // single worst row in the catalogue under the same label as rows that were never rated at all.
  { label: 'ai_scores.total = 0', row: mk({ ai_scores: { total: 0 } as Product['ai_scores'] }), terms: true, scored: true },
  { label: 'ai_scores = {}', row: mk({ ai_scores: {} as Product['ai_scores'] }), terms: true, scored: false },
];
for (const c of DISCRIMINATING) {
  const gotTerms = hasCommercialData(c.row);
  const gotScored = hasAiScores(c.row);
  if (gotTerms !== c.terms || gotScored !== c.scored) {
    discardFail(
      `hasCommercialData/hasAiScores returned (${gotTerms}, ${gotScored}) for "${c.label}" but the rule says (${c.terms}, ${c.scored})`
    );
  }
}
// Non-failing companion report: the predicates must also agree with their own definition on every
// real row, so that if a divergence ever appears it shows up here as well as in the fixture table.
const realRows = [...brandLayer, ...promotable.map((r) => r.p)];
const drift = realRows.filter((p) => hasCommercialData(p) !== defCommercial(p) || hasAiScores(p) !== defScored(p));
console.log(
  `predicate vs definition over ${realRows.length} real rows (13 curated + ${promotable.length} promotable) + ${DISCRIMINATING.length} constructed: ${drift.length} disagreement(s)`
);
if (drift.length) {
  discardFail(`hasCommercialData/hasAiScores disagree with their own definition on ${drift.slice(0, 5).map((p) => p.product_id).join(', ')}`);
}

// (c) Wiring. Presence of the identifier, not of a comment: the scan above already proved this
// codebase will happily keep a sentence that describes work it does not do.
// (c) Wiring. The needles are the CALL forms, not the bare names, and this matters: `hasCommercialData`
// alone is also satisfied by the import line, so a file that imports the predicate and then never
// calls it would pass. `limitedMatch` alone is worse — `recommendations/page.tsx` contains it inside
// the dictionary keys `limitedMatchBanner` / `limitedMatchBannerHint`, so deleting the banner
// outright would still match. A guard that a deleted feature can satisfy is not a guard.
const WIRING: { file: string; needles: string[]; why: string }[] = [
  {
    file: 'apps/web/app/product/[id]/ProductDetailClient.tsx',
    needles: ['hasCommercialData(', 'hasAiScores('],
    why: 'prints MOQ / lead time / wholesale price and draws six score rings',
  },
  { file: 'apps/web/app/compare/page.tsx', needles: ['hasCommercialData('], why: 'prints the side-by-side terms grid' },
  {
    file: 'apps/web/components/ProposalDocument.tsx',
    needles: ['hasCommercialData('],
    why: 'prints the terms table in the client-facing proposal',
  },
  {
    file: 'apps/web/app/recommendations/page.tsx',
    needles: ['engine.limitedMatch', 'fitMinimumFallback'],
    why: 'PRD §17 limited-match banner, threshold read from config',
  },
];
for (const w of WIRING) {
  const text = readFileSync(w.file, 'utf8');
  for (const needle of w.needles) {
    if (!text.includes(needle)) {
      discardFail(`${w.file} (${w.why}) never references "${needle}" — the value is computed and then discarded`);
    }
  }
}
console.log(`wiring: ${WIRING.length} files checked for ${WIRING.reduce((n, w) => n + w.needles.length, 0)} references`);

// (c2) Recall weights live in config, not in the function body. `recallScore` used to carry its own
// copy of the six TABLE 3 numbers, which made `RECALL_BLOCK_WEIGHTS` a dead export: editing a
// weight in the single home PRD §19 designates changed nothing on any screen. Three ways for this
// to regress, all guarded here — the config stops summing to 1; the engine stops reading it (a bare
// name is not enough, the import line alone satisfies that, so the needle is the member-access
// form); or someone re-hardcodes a decimal weight inside the function.
{
  const sum = Object.values(RECALL_BLOCK_WEIGHTS).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-9) discardFail(`RECALL_BLOCK_WEIGHTS sums to ${sum}, not 1 — recall scores silently change scale`);
  const engineSrc = readFileSync('apps/web/lib/matching.ts', 'utf8');
  if (!engineSrc.includes('RECALL_BLOCK_WEIGHTS.')) {
    discardFail('lib/matching.ts never reads RECALL_BLOCK_WEIGHTS.<key> — the config entry is dead again');
  }
  const fnStart = engineSrc.indexOf('function recallScore');
  const fnEnd = engineSrc.indexOf('\nfunction ', fnStart + 1);
  const body = engineSrc.slice(fnStart, fnEnd > fnStart ? fnEnd : undefined);
  const literal = body.match(/0\.\d+/);
  if (literal) discardFail(`recallScore hardcodes the weight literal ${literal[0]} — weights belong in RECALL_BLOCK_WEIGHTS`);
  const weightKeys = Object.keys(RECALL_BLOCK_WEIGHTS).join(', ');
  console.log(`recall weights from config: [${weightKeys}] sum 1, read via member access, no literals in the function body`);
}

// (d) The pipeline funnel. Eight counters printed in a list read exactly like a funnel; only the
// arithmetic distinguishes them.
console.log('\n--- pipeline stages ---');
const funnel = runEngine(profile, 'en').stages;
console.log(funnel.map((s) => `${s.stage} ${s.input}\u2192${s.output}`).join(' | '));
for (let i = 0; i < funnel.length; i += 1) {
  const s = funnel[i];
  // A stage may hold the pool or shrink it, never grow it.
  if (s.output > s.input) {
    discardFail(`stage ${s.stage} grew the pool (${s.input} -> ${s.output}); no pipeline stage may add rows`);
  }
  // Each stage consumes what the previous one produced. Without this the list is eight unrelated
  // counters that happen to be printed next to each other.
  if (i > 0 && s.input !== funnel[i - 1].output) {
    discardFail(`stage ${s.stage} starts from ${s.input} but ${funnel[i - 1].stage} ended at ${funnel[i - 1].output} — the rows are not a chain`);
  }
}
// Contiguous 1..n. The list used to run 1, 2, 3, 5, 6, 7: the truncation between scoring and final
// score had no row, so "4" did not exist and the numbering advertised a gap to anyone reading it.
const numbering = funnel.map((s) => Number(s.stage.split('_')[0]));
if (numbering.some((n, i) => n !== i + 1)) {
  discardFail(`stage ids are not a gapless 1..${funnel.length} sequence: ${funnel.map((s) => s.stage).join(', ')}`);
}
// Every id needs a label or the funnel prints a raw identifier to the rep; a label with no id is a
// stage that was renamed and left its entry behind.
const stageIds = new Set(funnel.map((s) => s.stage));
for (const s of funnel) {
  const label = STAGE_LABELS[s.stage];
  if (!label?.zh || !label?.en) {
    discardFail(`stage "${s.stage}" has no STAGE_LABELS entry — the funnel would print the raw id`);
    continue;
  }
  if (!/[\u4e00-\u9fff]/.test(label.zh)) discardFail(`STAGE_LABELS["${s.stage}"].zh contains no Chinese`);
  if (/[\u4e00-\u9fff]/.test(label.en)) discardFail(`STAGE_LABELS["${s.stage}"].en contains Chinese`);
}
for (const key of Object.keys(STAGE_LABELS)) {
  if (!stageIds.has(key)) discardFail(`STAGE_LABELS defines "${key}" but the engine emits no such stage — a stale label hides a renamed stage`);
}

// A stage whose note contradicts its own numbers is worse than no note: the note is the half a
// reader trusts. Checked for the two stages that make a shape claim.
const noDrop = funnel.find((s) => s.stage === '4_opportunity_scoring');
if (noDrop && noDrop.input !== noDrop.output) {
  discardFail(`4_opportunity_scoring claims to add scores without dropping rows but went ${noDrop.input} -> ${noDrop.output}`);
}
const cap = MATCHING_CONFIG.thresholds.highMatchCount;
const truncation = funnel.find((s) => s.stage === '5_high_match_truncation');
if (truncation) {
  const cut = truncation.output < truncation.input;
  if (cut && truncation.output !== cap) {
    discardFail(`5_high_match_truncation cut to ${truncation.output}, which is neither the whole pool (${truncation.input}) nor the configured cap (${cap})`);
  }
  if (truncation.note?.startsWith('top ') !== cut) {
    discardFail(`5_high_match_truncation note "${truncation.note}" disagrees with its own numbers ${truncation.input} -> ${truncation.output}`);
  }
}

// The banner is a safety net: it exists to fire when nothing cleared the fallback line. With the
// current 13-SKU library the lowest top Fit is 82, so it never fires — that is the data being good,
// not the code being right, and the assertion below records which of the two is the case rather
// than asserting an outcome the data decides.
const fallback = runEngine(profile, 'en');
console.log(
  `§17 banner: limitedMatch=${fallback.limitedMatch} (topFit ${fallback.topFit} vs fallback line ${MATCHING_CONFIG.thresholds.fitMinimumFallback})`
);
if (fallback.limitedMatch !== fallback.topFit < MATCHING_CONFIG.thresholds.fitMinimumFallback) {
  discardFail('limitedMatch disagrees with topFit and the configured fallback line');
}

// What the funnel's last row promises versus what the export actually carries.
const curated = fallback.recommendations.filter((r) => r.curationSlot).length;
const lastStage = funnel[funnel.length - 1];
console.log(
  `funnel end: stage says ${lastStage.output} curated | engine returns ${fallback.recommendations.length} | export carries ${outputZh.recommendations.length}`
);
if (lastStage.output !== curated) {
  discardFail(`the final stage reports ${lastStage.output} curated rows but ${curated} carry a curation slot`);
}
if (curated !== outputZh.recommendations.length) {
  discardFail(`${curated} recommendations carry a curation slot but the §16 export carries ${outputZh.recommendations.length} — the funnel's last row does not describe what ships`);
}

// Library-version stamp: persisted recommendations/proposals carry product snapshots, so an edited
// library must invalidate them or a returning browser keeps rendering yesterday's product names.
// This is the guard for the "fake product" class of bug — the data can be perfect and the screen
// still wrong, because the screen was hydrated from storage rather than from the library.
{
  const dataSrc = readFileSync('apps/web/lib/data/products.ts', 'utf8');
  const providerSrc = readFileSync('apps/web/components/ClientProvider.tsx', 'utf8');
  if (!/LIBRARY_VERSION\s*=\s*\d+/.test(dataSrc)) {
    discardFail('lib/data/products.ts does not declare a numeric LIBRARY_VERSION');
  }
  if (!providerSrc.includes('shaki_library_version')) {
    discardFail('ClientProvider never reads the stored library version — stale product names will survive a library edit');
  }
  if (!/libraryChanged/.test(providerSrc) || !/generateRecommendations\(c, lang/.test(providerSrc)) {
    discardFail('ClientProvider does not recompute recommendations when the library version changes');
  }
}

discarded.forEach((f) => console.error(`FAIL  ${f}`));
console.log(discarded.length ? `\n${discarded.length} defect(s) in values that were computed and discarded` : '\nevery computed value reaches a screen');
if (discarded.length) process.exitCode = 1;

