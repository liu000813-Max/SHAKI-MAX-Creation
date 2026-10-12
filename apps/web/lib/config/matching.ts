/**
 * PRD-mandated matching configuration.
 *
 * PRD §19 "版本与参数管理": all weights, thresholds, tag enums and prompt versions
 * MUST be configurable and NOT hard-coded in the frontend. This module is that single
 * source of truth — the engine (lib/matching.ts) reads every number from here.
 *
 * Source: docs/SHAKI_AI_Matching_Engine_Technical_PRD_V4.0.docx (Tables 3, 4, 5, 6, 7, 11).
 */

import { CRAWL_CONFIG } from './crawl';

export const MATCHING_CONFIG = {
  /** TABLE 11 */
  matchPipelineVersion: 'match-v1',
  promptVersion: 'prompt-v1',

  /** Layer 3 / TABLE 4 — six Client-Fit dimension weights (must sum to 1). */
  /**
   * Fit weights (PRD §19).
   *
   * Category is the largest single weight because that is what the PM asked the tool to be: pick
   * products that suit this buyer's categories and website. It was 0.2 — tied with audience, and
   * below the sum of everything else — which let a client's headline slot go to another category
   * (a male-accessory buyer was shown a vibrator as slot 01) whenever the other five dimensions
   * happened to line up. 0.3 puts category first without making it a veto; the hard part of the rule
   * lives in `curate`, where the headline slots must be inside the client's own categories.
   */
  fitWeights: {
    category: 0.3,
    audience: 0.18,
    brand: 0.13,
    price: 0.13,
    portfolio: 0.13,
    market: 0.13,
  },

  /**
   * How a buyer is classified into categories (see `scoreCategories` in matching.ts).
   *
   * `relativeFloor` is the share of the leading category's score a rival must reach to be kept, and
   * `maxCategories` caps how many can. Together they are what stops every site coming back as all
   * five categories — measured on a real US retailer that previously scored 5/5 on nothing but
   * `intimate`, `care` and a single mention of `couples`. Weights are per-source strength: what the
   * rep typed outranks a page heading, which outranks body copy.
   */
  categoryDetection: {
    typedWeight: 5,
    headingWeight: 4,
    summaryWeight: 3,
    /** The department list. Above the summary: on a shop, the nav IS the range. */
    navWeight: 4,
    bodyWeight: 1,
    /** Keep rivals scoring at least this fraction of the leader. */
    relativeFloor: 0.5,
    /** A buyer with three real lines is already unusual; five is the old non-answer. */
    maxCategories: 3,
    /** Below this the site said nothing we recognise and the rep is better served by typing it. */
    minScore: 4,
  },

  /** Layer 4 / TABLE 5 — Potential Score weights. */
  potentialWeights: {
    portfolioGap: 0.25,
    marketOpportunity: 0.25,
    differentiation: 0.2,
    priceExpansion: 0.15,
    strategicValue: 0.15,
  },

  /** Layer 5 / §9 — Final Recommendation Score weights (over the 20 high-match pool). */
  finalWeights: {
    fit: 0.4,
    productIntelligence: 0.2,
    marketOpportunity: 0.15,
    portfolioGap: 0.1,
    salesPerformance: 0.1,
    strategicValue: 0.05,
  },

  /** TABLE 11 — pipeline thresholds & counts. */
  thresholds: {
    /** TABLE 2 — below this Data Completeness a SKU is not recommendation-eligible. */
    /**
     * Data completeness gate for the scoring pool.
     *
     * Was 75, which was set when the catalogue was a SKU-only crawl that no row could ever clear.
     * The catalogue is now every product published on shaki.com/en/products (1398 rows): name, model,
     * material, size, weight and function come from the page, and the Chinese fields were kept only
     * because the evidence gate verified a quoted span. The PM declined the four positioning fields
     * (target age, target segment, design style, visual style) rather than have them invented, which
     * caps completeness at 71% — measured, not estimated.
     *
     * 40 is the floor of the measured distribution (1107 rows sit at 70%, 143 at 65%, and the
     * thinnest 50 rows at 40-44%), and the PM asked for the whole catalogue to be recommendable
     * rather than 1250 of 1398. Nothing else in the engine depends on this number, and a thinner row
     * is not disguised as a fuller one: every card, product page and funnel label prints the row's own
     * completeness, so a 44%-documented product can never be mistaken for a 70% one.
     */
    hardFilterCompleteness: 40,
    semanticRecallCount: 80,
    /**
     * How many rows of the same product form may enter semantic recall.
     *
     * The catalogue is real crawled product pages, so `secondary_category` is the site's own product
     * name and hundreds of rows share one form. Without a ceiling, recall spent all80 slots on two or
     * three forms and the curated Top 5 repeated a single product. 12 leaves room for ~7 forms in an
     * 80-row recall, which is what a rep can actually present; deferred rows still fill the rest, so
     * a catalogue that genuinely has one form is unaffected.
     */
    recallPerSubCategoryLimit: 12,
    /**
     * Same ceiling at the high-match cut, for the reason spelled out at the call site: a pure score
     * cut let the two largest forms of a category own the whole shortlist, and the curated Top 5
     * then had nothing to choose from. 4 keeps a form present without letting it own the list.
     */
    highMatchPerSubCategoryLimit: 4,
    highMatchCount: 20,
    finalRecommendationCount: 5,
    /** TABLE 6 — diversity caps inside the Top 5. */
    sameCategoryTop5Limit: 2,
    samePriceTop5Limit: 3,
    sameDesignTop5Limit: 3,
    /** TABLE 7 — minimum Fit for the fallback / role slots. */
    fitMinimumFallback: 75,
    /**
     * `confidenceOf`: a per-SKU top band needs a near-complete product row AND a high intelligence
     * score. Both are literals that used to sit inside the engine.
     */
    confidenceHighCompleteness: 85,
    confidenceHighIntelligence: 80,
    /**
     * DELIBERATE DEVIATION from PRD V4.0 (PM decision 2026-09-23), set to 0 to restore
     * strict PRD behaviour.
     *
     * Layer 4's `portfolioGap` and `marketOpportunity` anchors hand a full-marks gap bonus
     * to any SKU whose category the client does NOT already cover — so a client that only
     * sells BDSM gear can be topped by a cleanser. The scored ranking stays untouched; this
     * only constrains which rows may claim the two curated Best Match slots (01/02), which
     * are the two a sales rep leads with. 85 = the `categoryFit.secondaryRelated` anchor.
     */
    bestMatchMinCategoryFit: 85,
  },

  /** TABLE 2 — Product Status values allowed past the hard filter. */
  statusAllowed: ['Active', 'New', 'Best Seller', 'Strategic', 'Coming Soon'] as const,

  /**
   * Which PRD §13 evidence sources this build can actually consult.
   *
   * The app is a static export; it can only fetch through the companion service, so
   * `websiteResearch` is derived from whether that service's endpoint was baked in at build time
   * (`NEXT_PUBLIC_CRAWL_ENDPOINT`, see lib/config/crawl.ts). Deriving it rather than hardcoding
   * `true` is the point: the flag and the endpoint cannot drift apart, so a build without a
   * fetcher never claims research capability — and with one, still only cites pages it really
   * opened (see `websiteEvidence`).
   *
   * While a flag is false, evidence must NOT be attributed to that source and confidence must not
   * reach its top band. The evidence builder and the confidence ceiling both read from here.
   */
  evidenceSources: {
    websiteResearch: CRAWL_CONFIG.enabled,
    socialResearch: false,
    marketResearch: false,
  },

  /** §7 Category Fit subscore anchors. */
  categoryFit: { primaryHit: 100, secondaryRelated: 85, functionRelated: 70, scenarioOnly: 40, conflict: 0 },

  /**
   * Display bands for any 0-100 score (Fit, Potential, Final, or a six-dimension subscore).
   *
   * PRD §19 requires thresholds to be configurable rather than hard-coded in the frontend, and this
   * was the section violating it: `FitBadge` and `ScoreRing` each carried 90/80/70/60 while
   * `SixDimBars` carried 85/70 — three private copies, two of them disagreeing, so one score drew as
   * "strong" in one component and "medium" in another. The edges here are the `DIMENSION_ANCHORS`
   * levels (100/90/75/50/0) so the colours follow the scoring vocabulary instead of a second,
   * invented scale; 75 also matches `fitMinimumFallback` and the hard-filter gate, so "strong" means
   * "at or above the eligibility floor" across the whole app.
   *
   * Ordered high → low, `min` inclusive. Styling per key lives in `components/scoreBand.ts` —
   * this table is policy, that one is paint.
   */
  scoreBands: [
    { key: 'bandExcellent', min: 90 },
    { key: 'bandStrong', min: 75 },
    { key: 'bandFair', min: 50 },
    { key: 'bandWeak', min: 0 },
  ],

  /**
   * Layer 3 — the functional role a candidate carries.
   *
   * These were literals inside `runEngine`. Role and slot admission are separate questions, which
   * is why the potential floors below and in `slotAdmission` differ; keeping both in config makes
   * that a visible decision instead of two numbers that look like drift.
   */
  roleOf: {
    /** `potential` at or above this earns the Growth Opportunity role. */
    growthMinPotential: 85,
    /** `portfolioFit` at or above this earns Product Line Expansion. */
    lineExpansionMinPortfolioFit: 90,
    /** A product tagged with this earns the Strategic Product role. */
    strategicTag: 'Strategic Product',
    /** Used when none of the above match. */
    fallback: 'Product Line Expansion',
  },

  /**
   * Layer 7 — admission to a role's curated slot.
   *
   * Deliberately looser than `roleOf`: a slot is filled from whatever the pool actually offers, so
   * slot 03 accepts `growthMinPotential` down to 80, and the Line Expansion / Strategic slots take
   * the fallback Fit floor. Splitting these out is the whole point — before, the 85 and the 80 for
   * the *same* Growth Opportunity business rule lived in two files-apart code paths.
   */
  slotAdmission: {
    growthMinPotential: 80,
    growthMinFit: 80,
    lineExpansionMinPortfolioFit: 90,
    minFit: 75,
  },

  /**
   * Small policy thresholds the layer heuristics branch on. Each was a bare literal inside the
   * engine; PRD §19 wants them readable and changeable in one place.
   */
  heuristics: {
    /** `confidenceFrom`: how many client signals earn the richer band, then the middle band. */
    confidenceSignalsRich: 3,
    confidenceSignalsMedium: 2,
    /** `brandFit`: visual-style keyword hits that earn the top brand anchor. */
    brandKeywordHitsPerfect: 2,
    /** `portfolioFit`: an existing line below this % of the portfolio counts as a partial gap. */
    portfolioSharePartialGap: 30,
    /** Layer 7: how many of the curated slots are Best Match. */
    bestMatchSlotCount: 2,
  },

  /**
   * What a missing `ai_scores` component falls back to.
   *
   * `p.ai_scores?.x ?? N` was a bare literal at four call sites. Those numbers are not arbitrary —
   * they are the PRD §7 `75 = compatible` / `70 = function-related` anchors, used so an unscored SKU
   * neither wins nor is buried — so they belong here with the other policy values rather than
   * scattered through the arithmetic. `productIntelligence` has no 0-100 anchor of its own
   * (it is a weighted roll-up), so it reuses the neutral rung.
   */
  scoreDefaults: {
    neutral: 75,
    functionRelated: 70,
  },

  /**
   * PRD §16 `related_products` — how many SKUs each bucket may carry, and what counts as an upsell.
   *
   * The buckets are derived from catalogue fields only (see `relatedProductsFor`). A rep reads
   * these next to the recommendation, so a short list is more useful than a long one, and an empty
   * bucket is honest where no qualifying SKU exists — PRD §16's own example ships empty arrays.
   */
  relatedProducts: {
    maxPerBucket: 3,
  },
} as const;

export type MatchingConfig = typeof MATCHING_CONFIG;

/** PRD §7 six-dimension subscore scale (0-100) with anchor values for each dimension. */
export const DIMENSION_ANCHORS = {
  audience: { perfect: 100, genderScenario: 90, adjacent: 75, needsEducation: 50, conflict: 0 },
  brand: { perfect: 100, twoStrong: 90, compatible: 75, divergent: 50, conflict: 0 },
  price: { midCorridor: 100, nearEdge: 90, slightOffset: 75, crossTier: 50, illogical: 0 },
  portfolio: { fillsGap: 100, fillsAdjacent: 90, partialOverlap: 75, heavyOverlap: 50, duplicate: 0 },
  market: { priorityComplete: 100, matchedDataIncomplete: 90, enterable: 75, weakEvidence: 50, closed: 0 },
} as const;

/** Price ladder used by Price-Fit distance + diversity rerank (PRD §7, TABLE 6). */
export const PRICE_LADDER = ['Entry', 'Mid', 'Mid-Premium', 'Premium', 'Luxury'] as const;

/** TABLE 3 — semantic recall embedding-block weights (used by the rule/keyword recall proxy). */
export const RECALL_BLOCK_WEIGHTS = {
  categoryBusiness: 0.25,
  audience: 0.2,
  brandVisual: 0.2,
  productPortfolio: 0.15,
  market: 0.1,
  commercialIntent: 0.1,
} as const;
