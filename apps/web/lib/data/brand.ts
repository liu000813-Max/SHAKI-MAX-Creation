/**
 * Brand layer — the curated SHAKI SKUs that are rich enough to score today.
 *
 * Kept in its own light module (imports only products.ts + config) so the matching
 * engine does not pull the 776 KB candidate JSON into the recommendations bundle.
 * The full unified library (lib/data/library.ts) re-exports everything here.
 */
import { products, categoryNames } from './products';
import { MATCHING_CONFIG } from '../config/matching';
import type { Product } from '../types';

export { categoryNames };

/** Key Product fields the completeness metric samples (PRD TABLE 2). */
const COMPLETENESS_FIELDS: (keyof Product)[] = [
  'product_name_cn',
  'product_name_en',
  'primary_category',
  'secondary_category',
  'description_cn',
  'key_selling_point_cn',
  'primary_function',
  'target_gender',
  'target_age',
  'target_segment',
  'design_style',
  'visual_style',
  'main_material',
  'price_level',
  'target_market',
  'tags',
  'ai_scores',
];

/** Percentage (0-100) of sampled fields that carry a real value. */
export function computeCompleteness(p: Partial<Product>): number {
  let filled = 0;
  for (const f of COMPLETENESS_FIELDS) {
    const v = (p as Record<string, unknown>)[f as string];
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    filled += 1;
  }
  return Math.round((filled / COMPLETENESS_FIELDS.length) * 100);
}

/** Brand layer — curated SHAKI SKUs, tagged with layer + measured completeness. */
export const brandLayer: Product[] = products.map((p) => ({
  ...p,
  layer: 'brand' as const,
  completeness: computeCompleteness(p),
}));

/** The engine's scoring pool: rows whose completeness clears the PRD gate. */
export function eligibleProducts(): Product[] {
  const gate = MATCHING_CONFIG.thresholds.hardFilterCompleteness;
  return brandLayer.filter((p) => (p.completeness ?? 0) >= gate && Boolean(p.primary_category));
}
