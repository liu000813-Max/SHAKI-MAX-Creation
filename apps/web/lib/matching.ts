/**
 * SHAKI AI Matching Engine — deterministic, PRD-compliant implementation.
 *
 * Implements the Layer 1-7 pipeline from
 * docs/SHAKI_AI_Matching_Engine_Technical_PRD_V4.0.docx (tables 1-7, 11):
 *   1 Hard Filter → 2 Semantic Recall → 3 Six-Dimension Fit → 4 Potential
 *   → 5 Final Score → 6 Diversity Rerank → 7 Top-5 Curation
 *
 * Every number (weights, thresholds, caps) comes from lib/config/matching.ts.
 * NO randomness: the same client + library always yields byte-identical output, and
 * every Fit score is recomputable from its stored six-dimension subscores (PRD §18).
 *
 * The scoring pool is the unified real library's eligible layer (lib/data/brand.ts),
 * i.e. rows whose completeness clears the config gate. Today that is the 13 curated
 * SKUs; crawled/supplier rows join automatically once their params are filled.
 */
import { eligibleProducts } from './data/brand';
import { categoryNames, priceLevelNames } from './data/products';
import { libraryStatsData } from './data/library-view';
import { MATCHING_CONFIG, DIMENSION_ANCHORS, PRICE_LADDER, RECALL_BLOCK_WEIGHTS } from './config/matching';
import { CRAWL_CONFIG } from './config/crawl';
import { siteTextOf } from './siteFacts';
import { localize, marketLabel } from './i18n';
import { localizeBilingual } from './utils';
import {
  CategoryCode,
  ClientInput,
  ClientProfile,
  DimensionScores,
  SiteEvidence,
  SiteFacts,
  EvidenceType,
  Lang,
  LocalizedText,
  OpportunityItem,
  PriceLevel,
  Product,
  Recommendation,
  RelatedProducts,
} from './types';

const CFG = MATCHING_CONFIG;

/**
 * Category vocabulary, restricted to words that name the category.
 *
 * The earlier lists carried words every adult retailer writes — `intimate`, `wellness`, `beauty`,
 * `care`, `gift`, and `couples` listed under BOTH MALE and COUPLES. With one hit enough to claim a
 * category, every site tested came back as all five, which is not a classification: it hands the
 * downstream rule nothing to prioritise. Generic category words now live in `categoryGeneric`,
 * which is used for display context and never for detection.
 */
const categoryKeywords: Record<string, string[]> = {
  FEMALE: ['women', 'female', 'woman', 'vibrator', 'vibrators', 'dildo', 'massager', 'clitoral', 'vaginal', 'orb'],
  MALE: ['men', 'male', 'man', 'prostate', 'masturbator', 'stroker', 'cock ring', 'penis', 'male toys'],
  COUPLES: ['couples', 'couple', 'relationship', 'partners', 'long distance', 'remote control', 'wearable vibrator', 'wedding gift', 'anniversary gift'],
  BDSM: ['bdsm', 'bondage', 'restraint', 'restraints', 'roleplay', 'fetish', 'kink', 'collar', 'cuffs', 'blindfold', 'whip', 'dominatrix', 'submission', 'rope'],
  WATER_BASED: ['lubricant', 'lube', 'cleanser', 'cleansing', 'mousse', 'hygiene', 'water-based', 'massage oil', 'massage wax', 'body oil'],
};

/**
 * Words that describe an adult retailer in general. Deliberately NOT detection signals: they appear
 * on every site in this trade, so scoring them would classify everyone the same.
 */
const categoryGeneric = ['intimate', 'intimacy', 'wellness', 'beauty', 'care', 'sensual', 'pleasure', 'adult', 'lifestyle'];

const styleKeywords: Record<string, string[]> = {
  Minimal: ['minimal', 'simple', 'clean', 'modern', 'premium', 'elegant'],
  Premium: ['premium', 'luxury', 'high-end', 'elegant', 'sophisticated'],
  Luxury: ['luxury', 'high-end', 'exclusive', 'designer'],
  Cute: ['cute', 'playful', 'fun', 'colorful', 'young'],
  Medical: ['medical', 'wellness', 'health', 'clinical', 'discreet'],
  Wellness: ['wellness', 'health', 'lifestyle', 'self-care', 'feminine'],
  Modern: ['modern', 'contemporary', 'sleek', 'stylish'],
};

const audienceKeywords: Record<string, string[]> = {
  '18-30': ['young', 'gen z', 'millennial', 'trendy', 'budget', 'entry'],
  '25-40': ['premium', 'professional', 'women', 'wellness', 'lifestyle'],
  '25-45': ['mature', 'premium', 'couples', 'gift', 'lifestyle'],
  '28-50': ['male', 'wellness', 'health', 'mature'],
  '22-50': ['mass market', 'broad', 'daily', 'couples'],
};

const priceKeywords: Record<string, string[]> = {
  Entry: ['budget', 'entry', 'affordable', 'mass market', 'low price', 'value'],
  Mid: ['mid', 'mainstream', 'moderate', 'mid-range'],
  'Mid-Premium': ['mid-premium', 'premium mainstream', 'elevated'],
  Premium: ['premium', 'high-end', 'luxury'],
  Luxury: ['luxury', 'exclusive', 'high-ticket'],
};

const marketMapping: Record<string, string> = {
  'united states': 'US',
  us: 'US',
  usa: 'US',
  'united kingdom': 'UK',
  uk: 'UK',
  britain: 'UK',
  england: 'UK',
  europe: 'EU',
  eu: 'EU',
  australia: 'Australia',
  japan: 'Japan',
  korea: 'Korea',
  'southeast asia': 'Southeast Asia',
  'middle east': 'Middle East',
};

function detectKeywords(text: string, keywordMap: Record<string, string[]>): string[] {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const [key, words] of Object.entries(keywordMap)) {
    if (words.some((w) => lower.includes(w))) matched.push(key);
  }
  return matched;
}

/**
 * Category detection with a strength score, because "matched at least once" cannot prioritise.
 *
 * Position carries the weight: a word in the page title or a nav heading is what the business sells,
 * a word buried in body copy or a footer is usually boilerplate. Distinct words count, not repeats of
 * one word, so a footer that repeats "couples" forty times cannot outrank a catalogue.
 */
function scoreCategories(
  sources: { text: string; weight: number }[],
  keywordMap: Record<string, string[]>,
): { key: string; score: number; words: string[] }[] {
  const rows: { key: string; score: number; words: string[] }[] = [];
  for (const [key, words] of Object.entries(keywordMap)) {
    let score = 0;
    const hit: string[] = [];
    for (const w of words) {
      let best = 0;
      for (const src of sources) {
        if (src.text.toLowerCase().includes(w) && src.weight > best) best = src.weight;
      }
      if (best > 0) {
        score += best;
        hit.push(w);
      }
    }
    if (score > 0) rows.push({ key, score, words: hit });
  }
  return rows.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

/**
 * Keep the categories that are actually the buyer's business.
 *
 * A floor relative to the leader, plus a hard cap: the point is to tell a BDSM shop apart from a
 * vibrator brand, and "all five, tied" does neither. The leading category is always kept even if it
 * is the only one, and a profile the rep typed by hand still passes through unchanged.
 */
function pickCategories(
  scored: { key: string; score: number }[],
  opts: { floor: number; cap: number; minScore: number },
): string[] {
  const top = scored[0]?.score ?? 0;
  if (top < opts.minScore) return [];
  return scored
    .filter((s, i) => i === 0 || s.score >= Math.max(opts.minScore, top * opts.floor))
    .slice(0, opts.cap)
    .map((s) => s.key);
}

function detectMarket(text: string): string {
  const lower = text.toLowerCase();
  for (const [key, code] of Object.entries(marketMapping)) {
    if (lower.includes(key)) return code;
  }
  return 'Global';
}

/** Deterministic id from the input (no randomness). */
function stableId(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).toUpperCase().padStart(8, '0').slice(0, 8);
}

// ────────────────────────────────────────────────────────────── Layer 0/1 — client + hard filter

/**
 * PRD §17 ties confidence to whether the client's own material could actually be consulted:
 * "Website inaccessible → use provided categories + social + manually entered info; lower
 * confidence."
 *
 * The previous rule was `website.startsWith('http') ? 'High' : 'Medium'` — a test of the URL's
 * *format*, not of any research having happened, over a field the form marks required. That made
 * essentially every client "High" no matter how thin the brief was.
 *
 * Confidence is now scored from the evidence actually supplied, and its ceiling comes from which
 * sources this build can reach (CFG.evidenceSources).
 *
 * Two separate conditions have to hold for the top band, and they are not the same thing:
 *   - `canResearch` — the build *has* a fetcher (the endpoint is baked in);
 *   - `hasSiteFacts` — this particular analysis actually read the client's page.
 * PRD §17 lowers confidence when the website was inaccessible, so a build that could have fetched
 * but did not (timeout, refusal, no URL given) still stops at Medium.
 */
function confidenceFrom(input: ClientInput, hasSiteFacts: boolean): 'High' | 'Medium' | 'Low' {
  const signals = [
    Boolean(input.categories && input.categories.trim()),
    Boolean(input.website && input.website.trim()),
    (input.socialLinks ?? []).some((s) => s.trim().length > 0),
    Boolean(input.market && input.market.trim()),
    Boolean(input.businessType && input.businessType.trim()),
  ].filter(Boolean).length;

  const canResearch =
    CFG.evidenceSources.websiteResearch || CFG.evidenceSources.socialResearch || CFG.evidenceSources.marketResearch;
  const rich: 'High' | 'Medium' = canResearch && hasSiteFacts ? 'High' : 'Medium';

  if (signals >= CFG.heuristics.confidenceSignalsRich) return rich;
  if (signals >= CFG.heuristics.confidenceSignalsMedium) return 'Medium';
  return 'Low';
}

/**
 * @param facts  Page facts returned by the fetcher, or null when the site was not read. Passing
 *               null is the honest default: the profile then rests on rep-entered input alone.
 */
export function analyzeClient(input: ClientInput, lang: Lang, facts: SiteFacts | null = null): ClientProfile {
  // The fetched page is appended to the text the keyword detectors read, so the site genuinely
  // moves categories, styles, price band and market instead of being decorative.
  const combined = [
    input.categories,
    input.website,
    input.socialLinks.join(' '),
    input.market || '',
    input.businessType || '',
    siteTextOf(facts),
  ].join(' ');
  const lower = combined.toLowerCase();

  // Category detection reads the site in layers rather than as one string, so a word in the title
  // counts for more than the same word in the footer. `input.categories` is what the rep typed and
  // always carries full weight; the generic words are appended for context but never scored.
  const typed = [input.categories, input.website, input.businessType].filter(Boolean).join(' ');
  const scoredCategories = scoreCategories(
    [
      { text: typed, weight: CFG.categoryDetection.typedWeight },
      { text: facts ? `${facts.title} ${(facts.headings ?? []).join(' ')}` : '', weight: CFG.categoryDetection.headingWeight },
      { text: facts ? `${facts.siteName} ${facts.metaKeywords} ${facts.description}` : '', weight: CFG.categoryDetection.summaryWeight },
      // The department list is what the business actually sells, so it outranks the prose.
      { text: facts ? (facts.navItems || []).join(' \u00b7 ') : '', weight: CFG.categoryDetection.navWeight },
      { text: facts ? facts.text : '', weight: CFG.categoryDetection.bodyWeight },
    ],
    categoryKeywords,
  );
  const detectedCategories = pickCategories(scoredCategories, {
    floor: CFG.categoryDetection.relativeFloor,
    cap: CFG.categoryDetection.maxCategories,
    minScore: CFG.categoryDetection.minScore,
  });
  const detectedStyles = detectKeywords(combined, styleKeywords);
  const detectedAudiences = detectKeywords(combined, audienceKeywords);
  const detectedPrices = detectKeywords(combined, priceKeywords);
  const market = input.market || detectMarket(combined);

  // Nothing scored: the rep typed nothing and the site said nothing we recognise. The fallback stays a
  // single category rather than the old three, because a three-category fallback silently marks half
  // the catalogue as on-category for a client we know nothing about.
  const categories = detectedCategories.length ? detectedCategories : ['FEMALE'];

  const brandPositioning: LocalizedText =
    detectedStyles.includes('Luxury') || detectedStyles.includes('Premium')
      ? { zh: '高端亲密健康品牌', en: 'Premium intimate wellness brand' }
      : detectedStyles.includes('Wellness') || detectedStyles.includes('Medical')
      ? { zh: '健康养护型亲密护理品牌', en: 'Health & wellness intimate care brand' }
      : { zh: '现代亲密生活方式品牌', en: 'Modern intimate lifestyle brand' };

  const visualStyle = detectedStyles.length ? detectedStyles.slice(0, 3) : ['Minimal', 'Modern', 'Feminine'];
  const targetAudience = detectedAudiences.length ? detectedAudiences[0] : '25-40';
  const pricePosition = detectedPrices.length ? detectedPrices[0] : 'Mid';

  const portfolio = categories.map((cat, i) => ({ category: cat, share: Math.max(15, 40 - i * 8) }));

  // Opportunity Agent (PRD §14). Every entry is an inference from the rep's input, never a
  // verified fact, so `basis` says so and the kind travels as its own field — the old shape
  // embedded the English type in the sentence, which leaked English into the Chinese UI (§18).
  const opportunities: OpportunityItem[] = [];
  if (!categories.includes('WATER_BASED'))
    opportunities.push({
      kind: 'missing_category',
      basis: 'inference',
      text: {
        zh: '缺少水基护理类产品，无法与器具类硬件形成连带购买组合',
        en: 'No water-based care products, so there is nothing to pair with the hardware lineup',
      },
    });
  if (!detectedPrices.includes('Premium') && !detectedPrices.includes('Luxury'))
    opportunities.push({
      kind: 'price_gap',
      basis: 'inference',
      text: {
        zh: '缺少高端价格带产品，存在从「中高端」向「高端」上探的空间',
        en: 'No premium tier yet; there is room to trade up from mid-premium to premium',
      },
    });
  if (!categories.includes('COUPLES'))
    opportunities.push({
      kind: 'functional_gap',
      basis: 'inference',
      text: {
        zh: '情侣/互动类产品覆盖不足，缺少双人场景的连带销售抓手',
        en: 'Couples and interactive products are underrepresented, leaving no attach-sale hook for two-person scenarios',
      },
    });
  opportunities.push({
    kind: 'premium',
    basis: 'inference',
    text: {
      zh: '可引入多功能旗舰款，用更高的客单价打开毛利空间',
      en: 'Introduce a multifunctional flagship SKU to lift average order value and margin',
    },
  });
  opportunities.push({
    kind: 'new_category',
    basis: 'inference',
    text: {
      zh: '可拓展 App 智能互联器械这一新品类，用于沉淀复购与会员黏性',
      en: 'Open the app-controlled smart device category to build repeat purchase and membership loyalty',
    },
  });

  const confidence: 'High' | 'Medium' | 'Low' = confidenceFrom(input, Boolean(facts));

  // A page that was really opened is a better name than a domain-derived guess.
  const siteName = facts ? (facts.siteName || facts.title || '').trim().slice(0, 60) : '';
  const name =
    siteName ||
    (input.website
      ? input.website.replace(/^https?:\/\//, '').split('/')[0].split('.').slice(-2).join('.')
      : lang === 'zh'
      ? '新客户'
      : 'New Client');

  // Trimmed copy of the fetch, so the profile can show what was read months later without storing
  // the whole page in localStorage or in a shared link.
  const siteSnapshot = facts
    ? {
        finalUrl: facts.finalUrl,
        httpStatus: facts.httpStatus,
        fetchedAt: facts.fetchedAt,
        title: facts.title || '',
        navItems: (facts.navItems || []).filter((n) => n.length >= 3).slice(0, 20),
        headings: (facts.headings || []).filter(Boolean).slice(0, 6),
        excerpt: String(facts.text || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      }
    : null;

  const websiteEvidence: SiteEvidence | null = facts
    ? {
        url: facts.finalUrl,
        httpStatus: facts.httpStatus,
        fetchedAt: facts.fetchedAt,
        textChars: facts.textChars,
        title: (facts.siteName || facts.title || '').slice(0, 80),
      }
    : null;

  return {
    id: stableId(combined),
    name,
    website: input.website,
    websiteEvidence,
    siteSnapshot,
    market,
    businessType: input.businessType || (lang === 'zh' ? '未指定' : 'Unspecified'),
    mainCategories: categories,
    brandPositioning,
    visualStyle,
    targetAudience,
    pricePosition,
    portfolio,
    opportunities,
    confidence,
  };
}

/** Hard filter (Layer 1 / TABLE 2): status allowed + completeness gate + cat present. */
/**
 * @param exemptFromCompleteness product ids the PM filled in by hand on the enrichment workbench.
 *
 * A hand-completed row enters the pool whatever its completeness score. The gate exists to stop
 * machine-crawled rows that are almost empty from swamping the recommendations; a person who typed
 * the fields in has already made that judgement, and the gate was silently discarding their work —
 * the row never reached even the candidate list, so the page said "saved" and nothing happened.
 *
 * Status and category are still required: a discontinued row has no business being recommended, and a
 * row with no category cannot be matched to a buyer's categories at all.
 */
function hardFilter(
  pool: Product[],
  opts: { exemptFromCompleteness?: Set<string> } = {},
): { passed: Product[]; excluded: string[] } {
  const allowed = new Set<string>(CFG.statusAllowed as readonly string[]);
  const passed: Product[] = [];
  const excluded: string[] = [];
  for (const p of pool) {
    const reasons: string[] = [];
    if (!allowed.has(p.product_status)) reasons.push(`status:${p.product_status}`);
    if (
      !opts.exemptFromCompleteness?.has(p.product_id) &&
      (p.completeness ?? 0) < CFG.thresholds.hardFilterCompleteness
    ) {
      reasons.push(`completeness:${p.completeness ?? 0}`);
    }
    if (!p.primary_category) reasons.push('no-primary-category');
    if (reasons.length) excluded.push(`${p.product_id} [${reasons.join(',')}]`);
    else passed.push(p);
  }
  return { passed, excluded };
}

// ────────────────────────────────────────────────────────────── Layer 2 — recall

const genderOfCategory: Record<string, string> = {
  FEMALE: 'female',
  MALE: 'male',
  COUPLES: 'couples',
  BDSM: 'bdsm',
};

function recallScore(p: Product, client: ClientProfile): number {
  // The six weights come from `RECALL_BLOCK_WEIGHTS` (PRD §19 / TABLE 3). This function used to
  // carry its own copy of them, which made the config entry dead: editing a weight there changed
  // nothing on any screen. Renamed the locals to the config key names so the pairing is legible,
  // and read the config through member access — the wiring guard looks for that form, and an
  // aliased `const W =` would let the entry go dead again without tripping it.
  const categoryBusiness = client.mainCategories.includes(p.primary_category) ? 100 : 40;
  const audience = client.mainCategories.some((c) => genderOfCategory[c] && (p.target_gender || '').toLowerCase().includes(genderOfCategory[c])) ? 100 : 60;
  const brandVisual = client.visualStyle.some((s) => `${p.design_style} ${p.visual_style} ${p.tags.join(' ')}`.toLowerCase().includes(s.toLowerCase())) ? 100 : 65;
  const productPortfolio = client.mainCategories.includes(p.primary_category) ? 50 : 100;
  const market = p.target_market.includes(client.market as never) ? 95 : client.market === 'Global' ? 80 : 55;
  const commercialIntent = p.oem_available || p.odm_available ? 95 : 65;
  return Math.round(
    categoryBusiness * RECALL_BLOCK_WEIGHTS.categoryBusiness +
      audience * RECALL_BLOCK_WEIGHTS.audience +
      brandVisual * RECALL_BLOCK_WEIGHTS.brandVisual +
      productPortfolio * RECALL_BLOCK_WEIGHTS.productPortfolio +
      market * RECALL_BLOCK_WEIGHTS.market +
      commercialIntent * RECALL_BLOCK_WEIGHTS.commercialIntent
  );
}

// ────────────────────────────────────────────────────────────── Layer 3 — six-dimension fit

function clientGenders(client: ClientProfile): string[] {
  return client.mainCategories.map((c) => genderOfCategory[c]).filter(Boolean);
}

function categoryFit(p: Product, client: ClientProfile): number {
  if (client.mainCategories.includes(p.primary_category)) return CFG.categoryFit.primaryHit;
  const related = client.mainCategories.some((c) =>
    (categoryKeywords[c] || []).some((kw) => `${p.secondary_category} ${p.primary_function} ${p.tags.join(' ')}`.toLowerCase().includes(kw))
  );
  if (related) return CFG.categoryFit.secondaryRelated;
  return CFG.categoryFit.scenarioOnly;
}

function audienceFit(p: Product, client: ClientProfile): number {
  const genders = clientGenders(client);
  const g = (p.target_gender || '').toLowerCase();
  const genderMatch = genders.some((x) => g.includes(x));
  const ageMatch = p.target_age === client.targetAudience;
  if (genderMatch && ageMatch) return DIMENSION_ANCHORS.audience.perfect;
  if (genderMatch) return DIMENSION_ANCHORS.audience.genderScenario;
  if (p.target_segment && p.target_segment.toLowerCase().includes(client.pricePosition.toLowerCase())) return DIMENSION_ANCHORS.audience.adjacent;
  return DIMENSION_ANCHORS.audience.needsEducation;
}

function brandFit(p: Product, client: ClientProfile): number {
  const hay = `${p.design_style} ${p.visual_style} ${p.tags.join(' ')}`.toLowerCase();
  const hits = client.visualStyle.filter((s) => hay.includes(s.toLowerCase())).length;
  if (hits >= CFG.heuristics.brandKeywordHitsPerfect) return DIMENSION_ANCHORS.brand.perfect;
  if (hits === 1) return DIMENSION_ANCHORS.brand.twoStrong;
  if (p.price_level === 'Premium' || p.price_level === 'Luxury') return DIMENSION_ANCHORS.brand.compatible;
  return DIMENSION_ANCHORS.brand.divergent;
}

function priceFit(p: Product, client: ClientProfile): number {
  const pi = PRICE_LADDER.indexOf(p.price_level as never);
  const ci = PRICE_LADDER.indexOf(client.pricePosition as never);
  if (pi < 0 || ci < 0) return DIMENSION_ANCHORS.price.crossTier;
  const d = Math.abs(pi - ci);
  if (d === 0) return DIMENSION_ANCHORS.price.midCorridor;
  if (d === 1) return DIMENSION_ANCHORS.price.slightOffset;
  if (d === 2) return DIMENSION_ANCHORS.price.crossTier;
  return DIMENSION_ANCHORS.price.illogical;
}

function portfolioFit(p: Product, client: ClientProfile): number {
  const samePrimary = client.mainCategories.includes(p.primary_category);
  if (!samePrimary) return DIMENSION_ANCHORS.portfolio.fillsGap;
  const related = client.portfolio.some(
    (x) => x.category === p.primary_category && x.share < CFG.heuristics.portfolioSharePartialGap
  );
  if (related) return DIMENSION_ANCHORS.portfolio.fillsAdjacent;
  return DIMENSION_ANCHORS.portfolio.heavyOverlap;
}

function marketFit(p: Product, client: ClientProfile): number {
  if (client.market !== 'Global' && p.target_market.includes(client.market as never)) return DIMENSION_ANCHORS.market.matchedDataIncomplete;
  if (client.market === 'Global' || p.target_market.includes('Global')) return DIMENSION_ANCHORS.market.enterable;
  return DIMENSION_ANCHORS.market.weakEvidence;
}

function dimensionScores(p: Product, client: ClientProfile): DimensionScores {
  return {
    categoryFit: categoryFit(p, client),
    audienceFit: audienceFit(p, client),
    brandFit: brandFit(p, client),
    priceFit: priceFit(p, client),
    portfolioFit: portfolioFit(p, client),
    marketFit: marketFit(p, client),
  };
}

/** Layer 3 — Fit = 0.20·Cat + 0.20·Aud + 0.15·Brand + 0.15·Price + 0.15·Port + 0.15·Mkt */
function weightedFitScore(s: DimensionScores): number {
  const w = CFG.fitWeights;
  return Math.round(
    s.categoryFit * w.category +
      s.audienceFit * w.audience +
      s.brandFit * w.brand +
      s.priceFit * w.price +
      s.portfolioFit * w.portfolio +
      s.marketFit * w.market
  );
}

// ────────────────────────────────────────────────────────────── Layer 4 — potential

function marketOpportunity(p: Product, client: ClientProfile): number {
  return client.market !== 'Global' && p.target_market.includes(client.market as never) ? 90 : 70;
}

function portfolioGap(p: Product, client: ClientProfile): number {
  return client.mainCategories.includes(p.primary_category) ? 50 : 100;
}

function strategicValue(p: Product): number {
  return p.tags.includes('Strategic Product') ? 95 : 75;
}

/**
 * PRD §9's `ProductIntelligence` term of the Final score. Extracted so the value that goes into the
 * arithmetic is the same one PRD §16 publishes — previously it was computed inline and discarded,
 * leaving the published `final_score` un-decomposable.
 */
/**
 * Neutral stand-in used INSIDE the Final formula so the weighted sum has a number to work with.
 *
 * It must never leave this function. The catalogue is now crawled product pages, and none of them
 * carries an AI evaluation, so exporting this placeholder would put "产品智能分 75" on every
 * recommendation for a score nothing ever produced.
 */
function productIntelligence(p: Product): number {
  return p.ai_scores?.total ?? CFG.scoreDefaults.neutral;
}

/** What the row actually scored. Absent means absent — the export carries null, not a stand-in. */
function scoredIntelligence(p: Product): number | undefined {
  return typeof p.ai_scores?.total === 'number' ? p.ai_scores.total : undefined;
}

/** Layer 4 — Potential = 0.25·Gap + 0.25·MktOpp + 0.20·Diff + 0.15·PriceExp + 0.15·Strategic */
function potentialScore(p: Product, client: ClientProfile): number {
  const w = CFG.potentialWeights;
  const diff = p.ai_scores?.functional_differentiation ?? CFG.scoreDefaults.functionRelated;
  const priceExp = p.price_level === 'Premium' || p.price_level === 'Luxury' ? 85 : CFG.scoreDefaults.functionRelated;
  return Math.round(
    portfolioGap(p, client) * w.portfolioGap +
      marketOpportunity(p, client) * w.marketOpportunity +
      diff * w.differentiation +
      priceExp * w.priceExpansion +
      strategicValue(p) * w.strategicValue
  );
}

// ────────────────────────────────────────────────────────────── Layer 5 — final score

/**
 * Layer 5 / §9. New products have no sales history: PRD says do NOT penalise — use a
 * cold-start proxy (Design + Differentiation + MarketAbility + Brand) for SalesPerformance.
 */
function finalScore(p: Product, fit: number, client: ClientProfile): number {
  const w = CFG.finalWeights;
  const d = CFG.scoreDefaults.neutral;
  const coldStart = Math.round(
    ((p.ai_scores?.design_value ?? d) + (p.ai_scores?.functional_differentiation ?? d) + (p.ai_scores?.market_adaptability ?? d) + (p.ai_scores?.brand_value ?? d)) / 4
  );
  return Math.round(
    fit * w.fit +
      productIntelligence(p) * w.productIntelligence +
      marketOpportunity(p, client) * w.marketOpportunity +
      portfolioGap(p, client) * w.portfolioGap +
      coldStart * w.salesPerformance +
      strategicValue(p) * w.strategicValue
  );
}

/**
 * Per-recommendation confidence: the client-level band, tightened by how complete this SKU's own
 * data is. A top band needs a high-quality product row *and* a client whose analysis was actually
 * grounded — the latter is what `confidenceFrom` caps while no research source is reachable, so the
 * 'High' arm below is currently unreachable by design (see CFG.evidenceSources), not by accident.
 */
function confidenceOf(p: Product, client: ClientProfile): 'High' | 'Medium' | 'Low' {
  if (client.confidence === 'Low') return 'Low';
  if (
    client.confidence === 'High' &&
    (p.completeness ?? 0) >= CFG.thresholds.confidenceHighCompleteness &&
    (p.ai_scores?.total ?? 0) >= CFG.thresholds.confidenceHighIntelligence
  ) {
    return 'High';
  }
  return 'Medium';
}

// ────────────────────────────────────────────────────────────── Layer 6 — diversity rerank

function designCluster(p: Product): string {
  return `${p.design_style}|${p.visual_style}`;
}

function diversityRerank(sorted: Recommendation[]): Recommendation[] {
  const caps = CFG.thresholds;
  const catCount = new Map<string, number>();
  const priceCount = new Map<string, number>();
  const designCount = new Map<string, number>();
  const picked: Recommendation[] = [];
  const deferred: Recommendation[] = [];
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1);
  const limit = caps.finalRecommendationCount;

  for (const r of sorted) {
    if (picked.length >= limit) {
      deferred.push(r);
      continue;
    }
    const c = r.product.secondary_category || r.product.primary_category;
    const pl = r.product.price_level;
    const dc = designCluster(r.product);
    if ((catCount.get(c) || 0) >= caps.sameCategoryTop5Limit || (priceCount.get(pl) || 0) >= caps.samePriceTop5Limit || (designCount.get(dc) || 0) >= caps.sameDesignTop5Limit) {
      deferred.push(r);
      continue;
    }
    picked.push(r);
    bump(catCount, c);
    bump(priceCount, pl);
    bump(designCount, dc);
  }
  return [...picked, ...deferred];
}

// ────────────────────────────────────────────────────────────── Layer 7 — curation slots

type Role = Recommendation['type'];
// Thresholds from `config/matching.ts` (PRD §19). Slot admission is intentionally a weaker test
// than the Layer 3 role floors — see `slotAdmission` for why they are separate tables.
const SLOT_ROLES: { slot: number; role: Role; test: (r: Recommendation) => boolean }[] = [
  {
    slot: 3,
    role: 'Growth Opportunity',
    test: (r) =>
      r.potentialScore >= CFG.slotAdmission.growthMinPotential &&
      r.fitScore >= CFG.slotAdmission.growthMinFit,
  },
  {
    slot: 4,
    role: 'Product Line Expansion',
    test: (r) =>
      r.fitScore >= CFG.slotAdmission.minFit &&
      r.dimensionScores.portfolioFit >= CFG.slotAdmission.lineExpansionMinPortfolioFit,
  },
  {
    slot: 5,
    role: 'Strategic Product',
    test: (r) => r.fitScore >= CFG.slotAdmission.minFit && r.product.tags.includes(CFG.roleOf.strategicTag),
  },
];

function curate(ranked: Recommendation[], client: ClientProfile): Recommendation[] {
  const minFit = CFG.thresholds.fitMinimumFallback;
  const minCatFit = CFG.thresholds.bestMatchMinCategoryFit;
  const assigned = new Map<string, number>();
  const usable = ranked.filter((r) => r.fitScore >= minFit);
  // Fit scores tie constantly once the catalogue is large — four rows at 79 is routine. Without a
  // stated tie-break the curated set is whichever of the tied rows happened to come first, so the
  // better-documented product wins, and the id keeps it deterministic (the engine's one hard rule).
  const byTieBreak = (a: Recommendation, b: Recommendation) =>
    b.fitScore - a.fitScore ||
    (b.product.completeness ?? 0) - (a.product.completeness ?? 0) ||
    a.product_id.localeCompare(b.product_id);

  // The slot-filling pool is the whole shortlist, with the rows that clear the Fit floor first.
  //
  // It used to be `usable` alone, which looked stricter and was worse: for a Premium-seeking BDSM
  // buyer only four rows cleared 75, so the curated set came back as four slots of the same product
  // and the fifth was simply missing. Ordering by Fit keeps the strong matches in front, and the
  // per-form ceiling below then has enough left to pick five different things.
  const seenPool = new Set<string>();
  const pool = [...usable, ...ranked]
    .filter((r) => (seenPool.has(r.product_id) ? false : (seenPool.add(r.product_id), true)))
    .sort(byTieBreak);

  // Slots 01 + 02 — Best Match. These are the two a rep leads with, so they must at least be
  // category-relevant: see `bestMatchMinCategoryFit` for why this is a deliberate deviation.
  const catOf = (r: Recommendation) => r.product.secondary_category || r.product.primary_category;

  // "Suitable for this buyer" starts with the buyer's own categories. The Fit floor alone was too
  // weak a test for the two slots a rep leads with: a categoryFit of 85 is reachable by a product
  // outside every category the client trades in, and that is how a male-accessory buyer was shown a
  // vibrator as slot 01. Inside the client's categories is now a membership test, not a score, and the
  // score floor is kept as a second gate behind it.
  const inClientCategories = (r: Recommendation) => client.mainCategories.includes(r.product.primary_category);
  const hasOwnCategory = pool.some(inClientCategories);
  const headlinePool = pool.filter((r) => inClientCategories(r) && r.dimensionScores.categoryFit >= minCatFit);
  // With no products in the client's categories at all (a water-care buyer, say — the catalogue has
  // none), the old behaviour filled the slots with adjacent products at categoryFit 40. That reads as
  // a recommendation; it is an absence. The relaxation below still fills the five, but every slot is
  // flagged as a fallback and the limited-match banner fires, so the screen can say so.
  const gated = headlinePool.length ? headlinePool : pool.filter((r) => r.dimensionScores.categoryFit >= minCatFit);
  const offCategory = !hasOwnCategory;

  let bestCount = 0;
  let firstCategory = '';
  const relaxedIds = new Set<string>();
  /** Greedy fill of slots 01/02 from `source`; `distinct` bans repeating slot 01's sub-category. */
  const fillBest = (source: Recommendation[], distinct: boolean, relaxed: boolean) => {
    for (const r of source) {
      if (bestCount >= CFG.heuristics.bestMatchSlotCount) return;
      if (assigned.has(r.product_id)) continue;
      if (distinct && bestCount === 1 && catOf(r) === firstCategory) continue;
      assigned.set(r.product_id, ++bestCount);
      if (relaxed) relaxedIds.add(r.product_id);
      if (bestCount === 1) firstCategory = catOf(r);
    }
  };

  // Four relaxation tiers so the two headline slots are never left empty.
  fillBest(gated, true, false); // ideal: category-relevant, two different sub-categories
  fillBest(gated, false, false); // still category-relevant, any sub-category
  fillBest(pool, true, true); // drop the category floor, keep the sub-category dedupe
  fillBest(pool, false, true); // last resort — better a mismatched Best Match than no Best Match

  // Slots 03-05 by role, falling back to the highest-ranked unassigned candidate.
  //
  // The rerank caps repeats per sub-category, but that cap is applied to the 20-row shortlist and
  // slots 01/02 consume the diverse part of it. Without a second pass here, slots 03-05 simply took
  // the next unassigned row, which is how a Top 5 came out as four copies of the same product form —
  // technically diverse reranking, useless to a rep. So each remaining slot prefers a sub-category
  // the curated set has not used yet, then a role match, and only then anything left; a catalogue
  // that genuinely has one product form still gets five slots.
  // The same ceiling, enforced here rather than merely preferred. Slots 01/02 already refuse to
  // repeat slot 01's form, but "prefer an unused form" is a preference: with a price-led shortlist
  // (four Premium rows of the same form, say) every remaining slot was a repeat, and a Top 5 of four
  // identical products reached the customer. The form count is tracked as slots are assigned, so the
  // ceiling holds by construction and only relaxes when the catalogue genuinely cannot fill five
  // slots with distinct forms — in which case five slots still beat four.
  const formSlots = new Map<string, number>();
  const takeForm = (r: Recommendation) => formSlots.set(catOf(r), (formSlots.get(catOf(r)) || 0) + 1);
  const counted = Array.from(assigned.keys()).map((id) => ranked.find((r) => r.product_id === id)).filter(Boolean) as Recommendation[];
  for (const r of counted) takeForm(r);

  for (const { slot, role, test } of SLOT_ROLES) {
    const free = pool.filter((r) => !assigned.has(r.product_id));
    const underCap = (r: Recommendation) => (formSlots.get(catOf(r)) || 0) < CFG.thresholds.sameCategoryTop5Limit;
    // In the buyer's own categories first, then the per-form ceiling, then the role, then anything.
    // Cross-category picks are legitimate (a BDSM buyer may well want a cock ring) but they are the
    // last resort, not the default — a shortlist where the off-category row simply outranks the
    // on-category one is how slot 03 became a vibrator for a male-accessory buyer.
    const hit =
      free.find((r) => inClientCategories(r) && test(r) && underCap(r)) ||
      free.find((r) => inClientCategories(r) && underCap(r)) ||
      free.find((r) => underCap(r)) ||
      free.find((r) => test(r)) ||
      free[0];
    if (hit) {
      assigned.set(hit.product_id, slot);
      takeForm(hit);
    }
  }
  return ranked.map((r) => {
    const slot = assigned.get(r.product_id) ?? null;
    const role = slot === 1 || slot === 2 ? 'Best Match' : slot ? SLOT_ROLES.find((s) => s.slot === slot)!.role : r.type;
    // Every curated slot counts as a fallback when nothing in the catalogue matches the buyer's own
    // categories. The banner already says limited match; this is what lets the card say the same thing
    // next to the product instead of only at the top of the page.
    const fallback = relaxedIds.has(r.product_id) || (offCategory && slot !== null);
    return { ...r, curationSlot: slot, type: role, curationFallback: fallback || undefined };
  });
}

// ────────────────────────────────────────────────────────────── evidence + reasons

const DIMENSION_LABELS: Record<keyof DimensionScores, LocalizedText> = {
  categoryFit: { zh: '品类适配', en: 'Category Fit' },
  audienceFit: { zh: '用户适配', en: 'Audience Fit' },
  brandFit: { zh: '品牌风格适配', en: 'Brand Fit' },
  priceFit: { zh: '价格带适配', en: 'Price Fit' },
  portfolioFit: { zh: '产品线适配', en: 'Portfolio Fit' },
  marketFit: { zh: '市场潜力', en: 'Market Fit' },
};

const categoryLabel = (code: string, lang: Lang) => categoryNames[code as CategoryCode]?.[lang] || code;
const priceLabel = (level: string, lang: Lang) => priceLevelNames[level as PriceLevel]?.[lang] || level;

function generateReason(p: Product, client: ClientProfile, s: DimensionScores, lang: Lang) {
  const joiner = lang === 'zh' ? '、' : ', ';
  const cats = client.mainCategories.map((c) => categoryLabel(c, lang)).join(joiner);
  const market = marketLabel(client.market, lang);
  const price = priceLabel(client.pricePosition, lang);

  const clientFact =
    lang === 'zh'
      ? `客户主营${cats}，目标市场为${market}，价格定位${price}。`
      : `The client focuses on ${cats} with target market ${market} and a ${price} price position.`;

  const productFact =
    lang === 'zh'
      ? `${p.product_name_cn}属于${categoryLabel(p.primary_category, lang)}品类，主打${p.key_selling_point_cn}。`
      : `${p.product_name_en} belongs to the ${categoryLabel(p.primary_category, lang)} category, featuring ${p.key_selling_point_en}.`;

  const positioning = localize(client.brandPositioning, lang);
  const primaryCat = categoryLabel(client.mainCategories[0], lang);
  const productName = lang === 'zh' ? p.product_name_cn : p.product_name_en;

  /*
   * What makes five different products read like five different products.
   *
   * The previous sentence reported the strongest and weakest dimension scores. Every row scored
   * 100 on category and 50 on brand, so all five products received the same sentence with the
   * numbers swapped in — a template with the word "AI" on it. A rep learns nothing from "strongest
   * dimension: category fit (100), weakest: brand fit (50)" five times in a row.
   *
   * So the sentence is built from what actually matched and from what the product itself is:
   * its form, its first selling point, the price band and the market. It is also allowed to say
   * the weak part plainly — a brand-alignment caveat is something a rep needs, not something to
   * smooth over with "具备良好的商业拓展空间".
   */
  // No form in the sentence: the sub-category is an English product-form token ("av wand"), and a
  // Chinese proposal that reads "AV震动棒（av wand）" is worse than no form at all. When two SKUs of
  // the same form are both shortlisted their selling points are often identical too, so the material
  // is added only when the hook would otherwise repeat — differentiation is the point.
  // Language-aware: the English brief was printing Chinese selling points because this line preferred
  // key_selling_point_cn unconditionally. The i18n guard caught it; the fix is to ask for the field
  // that belongs to the document's language.
  const hookSource = lang === 'zh' ? p.key_selling_point_cn || p.key_selling_point_en : p.key_selling_point_en || p.key_selling_point_cn;
  const hook = (hookSource || '').split(/[｜|,]/)[0].trim();
  // Material is stated whenever the page gave one and the hook does not already name it. An earlier
  // version tried to detect "this selling point was already used by another shortlisted row" through a
  // map built inside this function, which is empty on every call and therefore never fired; two SKUs
  // of the same form kept printing the same sentence. Material is per-product, so it separates them
  // without needing to know anything about the other four.
  // Skip the material when the hook already states it, including when it states it in the other
  // language: the catalogue carries 硅胶+ABS as the Chinese selling point and Silicone+ABS as the
  // material, and printing both reads as a stutter.
  const hookStatesMaterial =
    hook.includes('+') || (p.main_material ? hook.toLowerCase().includes(p.main_material.toLowerCase()) : false);
  const material = p.main_material && !hookStatesMaterial ? p.main_material : '';

  // Thresholds come from the score bands (PRD §19). A literal here would be a policy number living
  // outside config, which the wiring guard is there to prevent — and it would drift the moment anyone
  // retunes the bands.
  const band = (key: string) => CFG.scoreBands.find((b) => b.key === key)?.min ?? 0;
  const strong = band('bandExcellent');
  // Kept for readability at the call sites below; both bands come from the same table.
  void band('bandWeak');

  const matchClauses: string[] = [];
  if (s.categoryFit >= strong) {
    matchClauses.push(
      lang === 'zh' ? `落在客户主营的${primaryCat}品类内` : `sits inside the client's core ${primaryCat} category`,
    );
  }
  if (s.priceFit >= strong) {
    matchClauses.push(
      lang === 'zh' ? `价格带对齐其${price}定位` : `price band matches their ${price} positioning`,
    );
  } else if (s.priceFit <= band('bandWeak') + 10) {
    matchClauses.push(
      lang === 'zh' ? `价格高于其${price}定位，需确认预算区间` : `priced above their ${price} positioning — confirm the budget range`,
    );
  }
  if (s.marketFit >= strong && client.market !== 'Global') {
    matchClauses.push(lang === 'zh' ? `可在${market}市场销售` : `sellable in ${market}`);
  }

  const zhLead = [productName, hook ? `主打${hook}` : '', material ? `${hook ? '，' : ''}${material}` : '']
    .filter(Boolean)
    .join('');
  const enLead = [productName, hook ? `built around ${hook}` : '', material ? `${hook ? ', ' : ''}${material}` : '']
    .filter(Boolean)
    .join(' ');

  // The brand-style caveat is deliberately NOT repeated on every line. Every crawled product scores
  // 50 on brand fit because the catalogue carries no design_style or visual_style — one honest
  // statement of that belongs above the list, not five identical warnings inside it.
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const businessReason = lang === 'zh'
    ? [zhLead, matchClauses.join('，')].filter(Boolean).join('；') + '。'
    : [enLead, ...matchClauses.map(cap)].filter(Boolean).join('. ') + '.';

  // Surfaced once for the whole list by the proposal panel; see `sharedCaveat`.
  const sharedCaveat =
    s.brandFit < strong
      ? lang === 'zh'
        ? '以下产品的视觉风格均需与客户品牌再确认（货盘未采集该字段）。'
        : 'Visual style needs confirming against the client brand for all of these — the catalogue does not carry that field.'
      : '';

  return { clientFact, productFact, businessReason, sharedCaveat };
}

/**
 * Evidence trail (PRD §13). Each entry must name the source the claim actually came from.
 *
 * PRD §13 orders the sources Client Website → Portfolio → Social → Market Research → Product Master.
 * The gate on each is *this analysis actually consulted it*, not "a capability exists somewhere":
 * `client_website` needs `client.websiteEvidence`, which is only produced when the fetcher returned
 * a real page (see analyzeClient). A build with a fetcher configured but a site that timed out
 * still cites `sales_input`, because that is where the words actually came from. Only the Product
 * Master row — a genuinely verified commercial source — keeps its own name unconditionally.
 */
function buildEvidence(p: Product, client: ClientProfile, lang: Lang): { type: EvidenceType; claim: string }[] {
  const positioning = localize(client.brandPositioning, lang);
  const market = marketLabel(client.market, lang);
  const cats = client.mainCategories.join(lang === 'zh' ? '、' : ', ');
  const localeName = localize({ zh: p.product_name_cn, en: p.product_name_en }, lang) || p.product_name_en;
  // The master stores sub-category as "吸吮类 / Suction Devices" — take this language's half.
  const subCat = localizeBilingual(p.secondary_category, lang) || p.secondary_category;

  const ev: { type: EvidenceType; claim: string }[] = [];

  // Requires a page that was really opened: `websiteEvidence` is set only from a successful fetch,
  // so this entry can never appear for a client whose site was refused, timed out, or never given.
  if (CFG.evidenceSources.websiteResearch && client.websiteEvidence) {
    const w = client.websiteEvidence;
    const when = w.fetchedAt ? w.fetchedAt.slice(0, 10) : '';
    ev.push({
      type: 'client_website',
      claim:
        lang === 'zh'
          ? `已抓取 ${client.name} 官网（${w.url}，HTTP ${w.httpStatus}，正文 ${w.textChars} 字${when ? `，${when}` : ''}）：定位为「${positioning}」，目标市场 ${market}。`
          : `Fetched ${client.name}'s website (${w.url}, HTTP ${w.httpStatus}, ${w.textChars} chars${when ? `, ${when}` : ''}): it positions itself as a ${positioning} in ${market}.`,
    });
  }
  if (CFG.evidenceSources.marketResearch) {
    ev.push({
      type: 'market_research',
      claim:
        lang === 'zh'
          ? `市场调研显示 ${market} 的需求与价格带分布支撑本推荐。`
          : `Market research on ${market} supports this recommendation's demand and price corridor.`,
    });
  }

  // Reachable today: what the rep declared, and the verified Product Master row.
  ev.push({
    type: 'sales_input',
    claim:
      lang === 'zh'
        ? `销售录入：客户主营${cats}，目标市场 ${market}，自述定位为「${positioning}」。以上为客户自述，未经独立核实。`
        : `Sales rep entered: client covers ${cats}, target market ${market}, self-described as a ${positioning}. Rep-declared, not independently verified.`,
  });
  if (client.mainCategories.some((c) => c !== p.primary_category)) {
    ev.push({
      type: 'sales_input',
      claim:
        lang === 'zh'
          ? `该 SKU 的品类超出客户自述核心${cats}结构，属于补位型选品。`
          : `This SKU sits outside the client's declared ${cats} lineup, so it reads as a complementary addition.`,
    });
  }
  ev.push({
    type: 'product_master',
    claim:
      lang === 'zh'
        ? `产品主库：${p.sku} ${localeName}，${categoryLabel(p.primary_category, lang)}/${subCat}，${priceLabel(p.price_level, lang)}价格带，OEM=${p.oem_available ? '支持' : '不支持'}，ODM=${p.odm_available ? '支持' : '不支持'}，数据完整度 ${p.completeness ?? 0}%。`
        : `SKU ${p.sku} (${localeName}): ${categoryLabel(p.primary_category, lang)}/${subCat}, ${priceLabel(p.price_level, lang)} price level, OEM=${p.oem_available ? 'Yes' : 'No'}, ODM=${p.odm_available ? 'Yes' : 'No'}, data completeness ${p.completeness ?? 0}%.`,
  });
  return ev;
}

/**
 * PRD §16 `related_products`. Deterministic, derived only from catalogue fields in `universe`.
 *
 * Nothing here consults the client's website, social accounts or the market — this build has no
 * network access at all (see CFG.evidenceSources). So these are product-to-product relations
 * computed from the real export, and the UI must present them as such, never as client research.
 *
 * The three buckets answer three different sales questions, and they are **mutually exclusive**:
 * a SKU listed as a like-for-like substitute must not reappear under "trade up", or the rep reads
 * two labels for one suggestion and cannot tell which motion to run.
 *   alternative — "swap it for something like it": same secondary category.
 *   upsell      — "trade up": same primary category, strictly higher on PRICE_LADDER, nearest rung
 *                 first, excluding anything already offered as an alternative.
 *   cross_sell  — "you do not carry this category at all": reuses `portfolioGap`'s own test, so the
 *                 cross-sell list and the gap that drove the score cannot drift apart.
 *
 * An earlier version required `alternative` to match secondary category AND price rung. The 13-SKU
 * curated library has 13 distinct `secondary|price` pairs, so that bucket was empty for every
 * recommendation — schema-valid and permanently dead. The guard now asserts each bucket fills at
 * least once, which is what caught it.
 *
 * Sorted by SKU so the output is stable; a bucket that still finds nothing stays an empty array
 * (PRD §16's example ships empty arrays), which is the honest answer.
 */
function relatedProductsFor(p: Product, client: ClientProfile, universe: Product[]): RelatedProducts {
  const cap = CFG.relatedProducts.maxPerBucket;
  const rung = (x: Product) => (PRICE_LADDER as readonly string[]).indexOf(x.price_level);
  const bySku = (a: Product, b: Product) => a.sku.localeCompare(b.sku);
  const others = universe.filter((o) => o.product_id !== p.product_id);

  const alternative = others
    .filter((o) => o.secondary_category === p.secondary_category)
    .sort(bySku)
    .slice(0, cap);

  // Plain arrays, not Sets: the pool is a dozen rows, and spreading a Set needs
  // `downlevelIteration` under this tsconfig.
  const offered = alternative.map((o) => o.product_id);
  const upsell = others
    .filter((o) => o.primary_category === p.primary_category && rung(o) > rung(p) && !offered.includes(o.product_id))
    .sort((a, b) => rung(a) - rung(b) || bySku(a, b))
    .slice(0, cap);

  const offeredAll = [...offered, ...upsell.map((o) => o.product_id)];
  const crossSell = others
    .filter((o) => !client.mainCategories.includes(o.primary_category) && !offeredAll.includes(o.product_id))
    .sort(bySku)
    .slice(0, cap);

  return {
    cross_sell: crossSell.map((o) => o.sku),
    upsell: upsell.map((o) => o.sku),
    alternative: alternative.map((o) => o.sku),
  };
}

// ────────────────────────────────────────────────────────────── public API

export interface EngineResult {
  recommendations: Recommendation[];
  stages: { stage: string; input: number; output: number; note?: string }[];
  /** Rows that actually cleared the gate and were scored. */
  libraryEligible: number;
  /** Full three-layer library size the pipeline starts from (brand + candidate + asset). */
  libraryTotal: number;
  /** Gate-passing pool composition, for the UI's layer badges. */
  layerBreakdown: { key: string; count: number; eligible: number }[];
  /**
   * PRD §17: true when no scored candidate reached `fitMinimumFallback` (Fit 75). The engine still
   * returns the closest candidates, but the UI MUST show the "limited match" banner so a rep does
   * not present a weak match as a strong one.
   */
  limitedMatch: boolean;
  /** Highest Fit among the scored pool — what the banner quotes. 0 when nothing was scored. */
  topFit: number;
  /**
   * True when the catalogue holds nothing in ANY category this buyer trades in.
   *
   * A different fact from `limitedMatch`: that one is about scores, this one is about stock. A
   * water-care buyer gets `limitedMatch` (nothing clears Fit 75) *and* this, and the useful thing to
   * tell the rep is the second one — there is no lubricant line to sell, which is a conversation with
   * the buyer rather than a ranking problem.
   */
  noProductsInClientCategories: boolean;
  /**
   * Retrieval score of the last candidate admitted by Layer 2. Everything at or above it was
   * recalled; everything below was cut. Makes the recall stage's boundary auditable (PRD §18).
   */
  recallCutoff: number;
}

/**
 * Full Layer 1-7 pipeline. Deterministic: no randomness anywhere.
 *
 * `extraPool` carries candidate rows a PM enriched into the real library (see
 * lib/data/enrichment.ts). They enter through the very same hard filter, so the completeness
 * gate — not a special case — decides whether they score. Pass them in pre-synthesised so this
 * module never has to import the 776 KB candidate layer.
 */
export function runEngine(client: ClientProfile, lang: Lang, extraPool: Product[] = []): EngineResult {
  const pool = [...eligibleProducts(), ...extraPool];
  // Hand-filled rows skip the completeness gate — see hardFilter for why that is the PM's call.
  const handFilled = new Set(extraPool.map((p) => p.product_id));
  const { passed, excluded } = hardFilter(pool, { exemptFromCompleteness: handFilled });

  // Layer 2 — semantic recall (deterministic rule/keyword proxy for the embedding block).
  // Scores are kept, not just used for sorting: PRD §18 requires every recalled candidate to be
  // traceable to the retrieval score that recalled it, so the value travels with the candidate.
  const recallRanked = passed
    .map((p) => ({ p, r: recallScore(p, client) }))
    .sort((a, b) => b.r - a.r || a.p.product_id.localeCompare(b.p.product_id));
  const recallScores = new Map(recallRanked.map(({ p, r }) => [p.product_id, r]));

  // Recall must span product forms, not just take the highest scores. The catalogue is 1398 rows
  // whose sub-category is the site's own product name, and hundreds of them are the same form
  // ("Stroker", "Bullet / Mini wand"), so a pure score cut returned 80 rows of two or three forms
  // and left curation nothing to choose from — the Top 5 came out as four copies of one product.
  // A per-form ceiling with deferred leftovers fixes it at the layer that has the choice to make.
  const recallPerSubCategory = CFG.thresholds.recallPerSubCategoryLimit;
  const formCount = new Map<string, number>();
  const recallPrimary: typeof recallRanked = [];
  const recallDeferred: typeof recallRanked = [];
  for (const entry of recallRanked) {
    const form = entry.p.secondary_category || entry.p.primary_category;
    if ((formCount.get(form) || 0) >= recallPerSubCategory) {
      recallDeferred.push(entry);
      continue;
    }
    formCount.set(form, (formCount.get(form) || 0) + 1);
    recallPrimary.push(entry);
  }
  const recalled = [...recallPrimary, ...recallDeferred].slice(0, CFG.thresholds.semanticRecallCount).map((x) => x.p);
  const recallCutoff = recalled.length ? recallScores.get(recalled[recalled.length - 1].product_id) ?? 0 : 0;

  // Layer 3 — six-dimension fit; keep the top `highMatchCount` by Fit.
  const scored: Recommendation[] = recalled.map((p) => {
    const dims = dimensionScores(p, client);
    const fit = weightedFitScore(dims);
    const pot = potentialScore(p, client);
    const fin = finalScore(p, fit, client);
    // Functional role only — 'Best Match' is a curation slot (Layer 7), never pre-assigned,
    // otherwise every high-Fit candidate would masquerade as one of the curated Top 5.
    // Floors come from `CFG.roleOf` (PRD §19); `slotAdmission` governs the curated slots instead.
    let type: Recommendation['type'];
    if (pot >= CFG.roleOf.growthMinPotential) type = 'Growth Opportunity';
    else if (dims.portfolioFit >= CFG.roleOf.lineExpansionMinPortfolioFit) type = 'Product Line Expansion';
    else if (p.tags.includes(CFG.roleOf.strategicTag)) type = 'Strategic Product';
    else type = CFG.roleOf.fallback;
    return {
      product_id: p.product_id,
      product: p,
      fitScore: fit,
      potentialScore: pot,
      dimensionScores: dims,
      reason: generateReason(p, client, dims, lang),
      type,
      finalScore: fin,
      productIntelligence: scoredIntelligence(p),
      relatedProducts: relatedProductsFor(p, client, passed),
      curationSlot: null,
      confidence: confidenceOf(p, client),
      evidence: buildEvidence(p, client, lang),
      recallScore: recallScores.get(p.product_id) ?? 0,
    };
  });

  // Layer 5 — truncation by Fit, with the same per-form ceiling the recall layer applied.
  //
  // Recall now spans product forms, but a plain score cut undid it: within one category the two
  // biggest forms owned nearly every point, so the Top 20 arrived as two forms and the curated
  // five could not be filled without repeating one. The ceiling is what turns "these are the best
  // fits" into "these are five different things a rep can actually present"; deferred rows still
  // fill the remaining slots, so a category that genuinely has one form is unaffected.
  const byFit = [...scored].sort((a, b) => b.fitScore - a.fitScore || a.product_id.localeCompare(b.product_id));
  const truncCap = CFG.thresholds.highMatchPerSubCategoryLimit;
  const truncCount = new Map<string, number>();
  const truncPrimary: Recommendation[] = [];
  const truncDeferred: Recommendation[] = [];
  for (const r of byFit) {
    const form = r.product.secondary_category || r.product.primary_category;
    if ((truncCount.get(form) || 0) >= truncCap) {
      truncDeferred.push(r);
      continue;
    }
    truncCount.set(form, (truncCount.get(form) || 0) + 1);
    truncPrimary.push(r);
  }
  const highMatch = [...truncPrimary, ...truncDeferred].slice(0, CFG.thresholds.highMatchCount);

  // PRD §17 fallback trigger. Measured over everything that was scored, not just the truncated
  // Top-N, so a strong candidate that diversity rules deferred still counts as "we found one".
  const topFit = scored.reduce((max, r) => Math.max(max, r.fitScore), 0);
  const limitedMatch = topFit < CFG.thresholds.fitMinimumFallback;
  // Measured over everything that cleared the gate, not over the shortlist: a form the shortlist
  // happened not to contain is a ranking outcome, an empty category is not.
  const noProductsInClientCategories = !pool.some((p) => client.mainCategories.includes(p.primary_category));

  const ranked = [...highMatch].sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0) || a.product_id.localeCompare(b.product_id));
  const diversified = diversityRerank(ranked);
  const recommendations = curate(diversified, client);

  return {
    recommendations,
    libraryEligible: pool.length,
    libraryTotal: libraryStatsData.total,
    layerBreakdown: libraryStatsData.layers.map((l) => ({ key: l.key, count: l.count, eligible: l.eligible })),
    limitedMatch,
    noProductsInClientCategories,
    topFit,
    recallCutoff,
    stages: [
      {
        stage: '1_hard_filter',
        input: libraryStatsData.total,
        output: passed.length,
        note: `completeness gate ≥${CFG.thresholds.hardFilterCompleteness}${excluded.length ? ` · ${excluded.length} excluded` : ''}`,
      },
      {
        stage: '2_semantic_recall',
        input: passed.length,
        output: recalled.length,
        // Only claim a cutoff when one was applied — if the pool is smaller than the recall count
        // every candidate survives, and quoting a boundary there implies a filter that never ran.
        note:
          recalled.length < passed.length
            ? `retrieval score ≥ ${recallCutoff}`
            : `all ${passed.length} recalled (pool < ${CFG.thresholds.semanticRecallCount})`,
      },
      // Scoring used to be a single row ending at `highMatch.length`, which folded two different
      // things together: scoring every recalled row, and then truncating to the Top-N. Separating
      // them is what makes the funnel readable — and the truncation step had no row at all, so the
      // list ran 1, 2, 3, 5, 6, 7 with a hole where 4 should be.
      //
      // Ids are frozen for `1_hard_filter` and `2_semantic_recall`: `app/recommendations/page.tsx`
      // looks both up by id to drive its pipeline strip. Renumbering those silently zeroes the strip.
      {
        stage: '3_feature_scoring',
        input: recalled.length,
        output: scored.length,
        note: 'six-dimension fit for every recalled row',
      },
      {
        stage: '4_opportunity_scoring',
        input: scored.length,
        output: scored.length,
        // Honest about the shape: this pass computes the potential score and has no effect on how
        // many rows survive, so input and output are the same number rather than an invented drop.
        note: 'potential + business opportunity (adds scores, drops no rows)',
      },
      {
        stage: '5_high_match_truncation',
        input: scored.length,
        output: highMatch.length,
        note:
          scored.length > highMatch.length
            ? `top ${CFG.thresholds.highMatchCount} by fit score`
            : `no truncation (scored ${scored.length} ≤ cap ${CFG.thresholds.highMatchCount})`,
      },
      { stage: '6_final_score', input: highMatch.length, output: ranked.length, note: 'cold-start proxy when no sales history' },
      { stage: '7_diversity_rerank', input: ranked.length, output: diversified.length },
      { stage: '8_curation', input: diversified.length, output: recommendations.filter((r) => r.curationSlot).length },
    ],
  };
}

/** Back-compat wrapper: the recommendations array only. */
export function generateRecommendations(client: ClientProfile, lang: Lang, extraPool: Product[] = []): Recommendation[] {
  return runEngine(client, lang, extraPool).recommendations;
}
