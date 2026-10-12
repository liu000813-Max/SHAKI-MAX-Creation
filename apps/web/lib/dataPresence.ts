import { Product } from './types';

/**
 * "Does this row actually have this data?" — the single home for presence predicates.
 *
 * These answer a **display** question, and they are deliberately separate from the engine's scoring
 * defaults. The engine may substitute a neutral placeholder so its arithmetic has a number to work
 * with (`productIntelligence` falls back to `CFG.scoreDefaults.neutral`); the UI must never present
 * that placeholder as a real value. That is why this is a presence test rather than a truthiness
 * check on the scored number.
 *
 * No thresholds live here, so this is not config. Anything policy-shaped belongs in
 * `lib/config/matching.ts` (PRD §19). Keeping the predicates in one module is also what stops three
 * components from each inventing their own idea of "no data" — the drift that produced three
 * different ways of printing a missing MOQ.
 *
 * Both predicates are pure and order-independent, so they cannot affect engine determinism.
 */

/**
 * True when a row carries the commercial fields the UI is allowed to quote.
 *
 * Requires **both** a wholesale price and a MOQ. The point of showing these is to quote terms, and a
 * price with no minimum order (or the reverse) is not a quotable offer — printing half of one
 * invites the reader to assume the other half exists.
 *
 * Rows built from a crawled candidate never set these: the enrichment spec
 * (`lib/data/enrichment.ts` ENRICH_FIELDS) covers the completeness-gate fields, not commercial
 * terms, so this is false for every enriched row. That is exactly the path PRD TABLE 10 describes —
 * an enriched row can clear the 75 gate, enter the Top 5, and have its page opened with no terms on
 * file. Measured: 1355 of 1439 crawled rows clear the gate with every enrichable field filled, and
 * all 1355 arrive with no terms.
 * A type predicate rather than a plain boolean on purpose: the runtime check (`typeof number` and a
 * non-empty trimmed string) genuinely guarantees the narrowed types, so callers can quote the terms
 * without an `as string` cast pretending to know something the compiler does not.
 */
export function hasCommercialData(
  p: Product
): p is Product & { wholesale_price: number; moq: string } {
  return typeof p.wholesale_price === 'number' && !!p.moq?.trim();
}

/**
 * True when a row has been scored.
 *
 * Brand rows carry all seven `ai_scores`; crawled rows are constructed with `ai_scores: {}`
 * (`lib/data/enrichment.ts`). Without this test a missing score renders as a red "weak" ring with
 * no number in the middle, because `scoreBand(undefined)` falls through every comparison and lands
 * on the lowest band — absence presented as a *bad* score, which is a worse lie than showing
 * nothing at all.
 */
export function hasAiScores(p: Product): boolean {
  return typeof p.ai_scores?.total === 'number';
}
