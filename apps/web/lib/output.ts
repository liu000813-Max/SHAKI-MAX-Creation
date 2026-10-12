/**
 * PRD §16 — the analysis output contract.
 *
 * §16 specifies the JSON the pipeline hands downstream, field by field and in snake_case. The app's
 * internals are camelCase TypeScript, which is fine in-process, but nothing was emitting the
 * contract at all: `analysis_version` had no outlet, `product_intelligence_score` was computed for
 * the Final formula and discarded, and `related_products` did not exist in the codebase. So the
 * published number could not be taken apart, and a downstream consumer had nothing to bind to.
 *
 * This module is the only place that knows the PRD's field names. Keeping the mapping in one file
 * means a schema change is one edit, and `scripts/engine_check.ts` §16 can assert the shape against
 * the PRD rather than against whatever the engine happens to produce.
 *
 * Strings are emitted in the requested language. PRD §1 wants both languages available and §18
 * wants them semantically equivalent; `buildAnalysisOutput` takes a `lang` so the same structural
 * contract can be produced twice and compared. Enum-valued fields (`recommendation_type`,
 * `evidence[].type`, `confidence`) stay as the PRD's own codes — the UI localises those through
 * `lib/i18n.ts`, and translating them here would break the contract.
 */
import { MATCHING_CONFIG } from './config/matching';
import type { EngineResult } from './matching';
import { localize } from './i18n';
import type { ClientProfile, Confidence, EvidenceType, Lang, Recommendation, RelatedProducts } from './types';

/** One recommendation in PRD §16's shape. */
export interface AnalysisOutputRecommendation {
  product_id: string;
  sku: string;
  recommendation_type: Recommendation['type'];
  fit_score: number;
  potential_score: number;
  /**
   * Null when the product has never been evaluated.
   *
   * The Final formula substitutes a neutral 75 internally so its arithmetic has a number; that
   * placeholder is a computation detail and exporting it would state a score nothing produced.
   */
  product_intelligence_score: number | null;
  final_score: number;
  confidence: Confidence;
  six_dimension: {
    category_fit: number;
    audience_fit: number;
    brand_fit: number;
    price_fit: number;
    portfolio_fit: number;
    market_fit: number;
  };
  why_recommend: {
    client_fact: string;
    product_fact: string;
    business_reason: string;
  };
  evidence: { type: EvidenceType; claim: string }[];
  related_products: RelatedProducts;
}

/** PRD §16 — the whole analysis document. */
export interface AnalysisOutput {
  client_id: string;
  analysis_version: string;
  summary: {
    positioning: string;
    market: string[];
    confidence: Confidence;
  };
  recommendations: AnalysisOutputRecommendation[];
}

/**
 * Market codes as a list. The form gives one free-text market field, but PRD §16 types it as an
 * array and a client can plausibly be listed as "US, EU", so separators are split rather than
 * emitting one glued string that no consumer can read.
 */
function marketCodes(market: string): string[] {
  return market
    .split(/[,/|]+/)
    .map((m) => m.trim())
    .filter(Boolean);
}

/**
 * Project an engine result into PRD §16's contract.
 *
 * ONLY THE CURATED ROWS. PRD §1 says the pipeline "finally outputs 5 recommendations" and TABLE 1's
 * step 6 ends at 5, so the contract carries the curated Top 5 — not the wider scored pool. The
 * engine deliberately returns every scored row (`curationSlot == null` marks the ones that missed
 * curation) because the recommendations page offers a "more candidates" list; that is an app
 * affordance, not part of the output contract. Emitting all 13 here made the document disagree with
 * the pipeline table it claims to describe.
 *
 * `analysis_version` comes from config (`MATCHING_CONFIG.matchPipelineVersion`) because §19 requires
 * the pipeline version to be configurable rather than embedded here — the value the output declares
 * and the value the engine ran under must be the same single source.
 *
 * Missing numeric fields collapse to 0 rather than being dropped: a consumer that reads
 * `final_score` should never have to handle `undefined`.
 */
export function buildAnalysisOutput(
  client: ClientProfile,
  result: EngineResult,
  lang: Lang
): AnalysisOutput {
  const curated = result.recommendations.filter((r) => r.curationSlot != null);
  return {
    client_id: client.id,
    analysis_version: MATCHING_CONFIG.matchPipelineVersion,
    summary: {
      positioning: localize(client.brandPositioning, lang),
      market: marketCodes(client.market),
      confidence: client.confidence,
    },
    recommendations: curated.map((r) => ({
      product_id: r.product_id,
      sku: r.product.sku,
      recommendation_type: r.type,
      fit_score: r.fitScore,
      potential_score: r.potentialScore,
      product_intelligence_score: r.productIntelligence ?? null,
      final_score: r.finalScore ?? 0,
      confidence: r.confidence ?? client.confidence,
      six_dimension: {
        category_fit: r.dimensionScores.categoryFit,
        audience_fit: r.dimensionScores.audienceFit,
        brand_fit: r.dimensionScores.brandFit,
        price_fit: r.dimensionScores.priceFit,
        portfolio_fit: r.dimensionScores.portfolioFit,
        market_fit: r.dimensionScores.marketFit,
      },
      why_recommend: {
        client_fact: r.reason.clientFact,
        product_fact: r.reason.productFact,
        business_reason: r.reason.businessReason,
      },
      evidence: r.evidence ?? [],
      related_products: r.relatedProducts ?? { cross_sell: [], upsell: [], alternative: [] },
    })),
  };
}

/** Pretty JSON for the copy-to-clipboard action on the recommendations page. */
export function analysisOutputJson(output: AnalysisOutput): string {
  return JSON.stringify(output, null, 2);
}
