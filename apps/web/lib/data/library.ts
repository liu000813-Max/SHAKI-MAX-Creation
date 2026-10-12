/**
 * The unified REAL product library, layered by data provenance.
 *
 * Three real sources, nothing fabricated (PRD §15: "never invent product parameters"):
 *   brand     — 13 curated SHAKI SKUs (lib/data/products.ts). PM-categorised, rich fields;
 *               the scoring-eligible core today.  See lib/data/brand.ts.
 *   candidate — 1439 SKUs crawled from SHAKI.com (data/processed/products.json → slim
 *               library-candidates.json). Real fields, but sparse (see `completeness`).
 *   asset     — 55 supplier media packs (Heydildi export). SKU + images/videos/CAD only;
 *               every commercial/attribute field is intentionally absent, not guessed.
 *
 * A row "auto-upgrades" into the engine's scoring pool once its `completeness` clears
 * MATCHING_CONFIG.thresholds.hardFilterCompleteness — the gate is the only contract, so
 * filling a candidate's params by hand promotes it with no code change.
 */
import { brandLayer, computeCompleteness, eligibleProducts, categoryNames } from './brand';
import { heydildiCatalog } from './heydildi';
import candidatesRaw from './library-candidates.json';
import { MATCHING_CONFIG } from '../config/matching';
import type { LibraryAsset, LibraryCandidate, Product } from '../types';

export { brandLayer, computeCompleteness, eligibleProducts, categoryNames };

/** Candidate layer — crawled SKUs (slim projection, real fields only). */
export const candidateLayer: LibraryCandidate[] = candidatesRaw as unknown as LibraryCandidate[];

/** Asset layer — supplier media packs. Media-only completeness floor (params pending PM). */
export const ASSET_MEDIA_COMPLETENESS = 20;
export const assetLayer: LibraryAsset[] = heydildiCatalog.map((e) => ({
  sku: e.sku,
  layer: 'asset' as const,
  images: e.images,
  videos: e.videos,
  cad: e.cad,
  englishPage: e.englishPage,
  isBundle: e.sku.includes('&'),
  completeness: ASSET_MEDIA_COMPLETENESS,
}));

export interface LibraryStats {
  brand: number;
  candidate: number;
  asset: number;
  total: number;
  eligible: number;
  gate: number;
  candidateCompletenessMax: number;
}

export function libraryStats(): LibraryStats {
  const gate = MATCHING_CONFIG.thresholds.hardFilterCompleteness;
  const candMax = candidateLayer.reduce((m, c) => Math.max(m, c.completeness || 0), 0);
  return {
    brand: brandLayer.length,
    candidate: candidateLayer.length,
    asset: assetLayer.length,
    total: brandLayer.length + candidateLayer.length + assetLayer.length,
    eligible: eligibleProducts().length,
    gate,
    candidateCompletenessMax: candMax,
  };
}

export function findBrand(productId: string): Product | undefined {
  return brandLayer.find((p) => p.product_id === productId);
}

export function findAsset(sku: string): LibraryAsset | undefined {
  return assetLayer.find((a) => a.sku === sku);
}

/** Old name kept so existing imports keep working. */
export const productsAll = brandLayer;
