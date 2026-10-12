export type Lang = 'zh' | 'en';

/**
 * PRD §12 / TABLE 8 confidence bands.
 *
 * NOTE ON REACHABILITY: `High` is currently unreachable by construction, not by accident. The build
 * makes no network calls, so `MATCHING_CONFIG.evidenceSources` is all-false; `confidenceFrom` reads
 * those flags and caps the client band at Medium. Do not "fix" a missing High by widening this type
 * or bypassing the flags — see lib/config/matching.ts.
 */
export type Confidence = 'High' | 'Medium' | 'Low';

/**
 * The unified real Product Library is layered (see lib/data/library.ts):
 *  - brand     : 13 curated SHAKI SKUs, PM-categorised, scoring-eligible.
 *  - candidate : crawled SHAKI.com SKUs (sparse fields, not yet eligible).
 *  - asset     : supplier media packs (Heydildi SKUs, media only, no params).
 * A product "auto-upgrades" into scoring once its completeness clears the PRD gate.
 */
export type ProductLayer = 'brand' | 'candidate' | 'asset';

export type CategoryCode = 'FEMALE' | 'MALE' | 'COUPLES' | 'BDSM' | 'WATER_BASED';

export type ProductStatus =
  | 'Draft'
  | 'Active'
  | 'New'
  | 'Best Seller'
  | 'Strategic'
  | 'Seasonal'
  | 'Discontinued'
  | 'Coming Soon';

export type PriceLevel = 'Entry' | 'Mid' | 'Mid-Premium' | 'Premium' | 'Luxury';

export type MarketCode =
  | 'US'
  | 'UK'
  | 'EU'
  | 'Australia'
  | 'Japan'
  | 'Korea'
  | 'Southeast Asia'
  | 'Middle East'
  | 'Global';

export type BusinessType =
  | 'Brand'
  | 'Distributor'
  | 'Retailer'
  | 'Wholesaler'
  | 'E-commerce'
  | 'Amazon Seller'
  | 'Chain Store'
  | 'Boutique'
  | 'OEM/ODM Buyer';

export interface LocalizedText {
  zh: string;
  en: string;
}

export interface Product {
  product_id: string;
  sku: string;
  product_name_cn: string;
  product_name_en: string;
  short_name: string;
  series_name: string;
  product_status: ProductStatus;
  launch_date?: string;
  primary_category: CategoryCode;
  secondary_category: string;
  tertiary_category?: string;
  description_cn: string;
  description_en: string;
  short_description_cn: string;
  short_description_en: string;
  key_selling_point_cn: string;
  key_selling_point_en: string;
  primary_function: string;
  secondary_functions: string[];
  target_gender: string;
  target_age: string;
  target_segment: string;
  design_style: string;
  visual_style: string;
  main_material: string;
  product_length?: string;
  product_width?: string;
  product_height?: string;
  net_weight?: string;
  mode_count?: string;
  control_type?: string;
  battery_type?: string;
  battery_capacity?: string;
  charging_type?: string;
  waterproof_rating?: string;
  noise_level?: string;
  packaging_type?: string;
  price_level: PriceLevel;
  wholesale_price?: number;
  suggested_retail_price?: number;
  moq?: string;
  sample_price?: number;
  lead_time?: string;
  target_market: MarketCode[];
  oem_available: boolean;
  odm_available: boolean;
  custom_moq?: string;
  custom_lead_time?: string;
  tags: string[];
  /** Unified real-library metadata (see lib/data/library.ts). */
  layer?: ProductLayer;
  /**
   * The product page this row was crawled from.
   *
   * Every catalogue row now points at a live shaki.com URL, so a sales rep can open it and see the
   * product instead of taking the catalogue's word for it.
   */
  source_url?: string;
  /**
   * Photo from the product listing card, hosted on shaki.com.
   *
   * A sales rep picking from a Top 5 needs to recognise the product; a name and a SKU do not tell
   * them whether it is the right one. Absent only when the site publishes no photo, and the UI must
   * degrade rather than render a broken frame.
   */
  image_url?: string;
  /** Data completeness 0-100 (PRD hard-filter gate: >=75 to be scoring-eligible). */
  completeness?: number;
  /**
   * Optional, and absent on every crawled product.
   *
   * The old curated rows carried hand-written numbers here (92/90/94/88/86/95/91). Nothing produced
   * those figures, so they were decoration that looked like analysis. A product that has not been
   * evaluated must be able to say so: `hasAiScores` gates the score ring, and an absent value is
   * reported as "not scored" rather than rendered as a zero or a worst band.
   */
  ai_scores?: {
    product_quality: number;
    design_value: number;
    functional_differentiation: number;
    commercial_potential: number;
    market_adaptability: number;
    brand_value: number;
    total: number;
  };
  /** Same reasoning: margin, stock and capacity are company figures, never inferred. */
  commercial?: {
    margin_level?: string;
    stock_status?: string;
    production_capacity?: string;
  };
}

// Real supplier/OEM product library sourced from the Heydildi media export.
// Each entry maps one SKU folder to its extracted media (local, gitignored).
// The committed manifest lives at apps/web/lib/data/heydildi-catalog.json.
export interface HeydildiSku {
  sku: string;
  images: string[];
  videos: string[];
  cad: string[];
  englishPage: boolean;
}

export interface ClientInput {
  categories: string;
  website: string;
  socialLinks: string[];
  market?: string;
  businessType?: string;
  goal?: string;
}

/**
 * Opportunity kinds the Opportunity Agent can raise (PRD §14). Kept as a closed enum so the
 * UI renders a localised chip label instead of parsing an English prefix out of the sentence —
 * the old shape embedded "Missing Category: " in the string itself, which meant a Chinese UI
 * showed English (PRD §18).
 */
export type OpportunityKind =
  | 'missing_category'
  | 'price_gap'
  | 'functional_gap'
  | 'premium'
  | 'new_category';

/**
 * One opportunity raised for a client. PRD §15/§16 require observed facts to be kept apart from
 * inferences, so `basis` is explicit: everything here is derived from the sales rep's own input,
 * NOT from verified client research. The UI must label it as such.
 */
export interface OpportunityItem {
  kind: OpportunityKind;
  basis: 'inference';
  text: LocalizedText;
}

/**
 * What the fetcher actually read from one official website. Fields are raw page facts — title,
 * meta, headings, visible text — and nothing more: the server is told not to interpret, so the
 * keyword dictionaries stay in one place (the engine) and cannot drift from it.
 */
export interface SiteFacts {
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number;
  fetchedAt: string;
  bytes: number;
  title: string;
  siteName: string;
  description: string;
  lang: string;
  metaKeywords: string;
  headings: string[];
  /**
   * Navigation menu labels — the retailer's own department list.
   *
   * The strongest category signal on a shop page, and the one a heading-based extractor misses: a
   * real retailer's headings turned out to be footer boilerplate while its nav spelled out "Dildos",
   * "Cuffs and Restraints", "Harnesses and Strap-ons".
   */
  navItems?: string[];
  text: string;
  textChars: number;
  truncated: boolean;
  socialLinks: string[];
  charset: string;
}

/**
 * The compact, transmittable proof that a page was really opened. This — not the capability flag —
 * is what gates `client_website` evidence, so a build with a fetcher configured still cannot cite a
 * page it did not fetch. Small enough to travel inside a share link, which keeps a recipient's
 * rebuilt recommendations byte-identical to the sender's.
 */
export interface SiteEvidence {
  url: string;
  httpStatus: number;
  fetchedAt: string;
  textChars: number;
  title: string;
}

/**
 * What the fetch actually returned, kept small enough to persist.
 *
 * The PM asked to see the client's website so the analysis can be trusted. A real screenshot needs a
 * renderer this service cannot run, so the profile carries the fetched evidence itself: the real
 * title, the department list read from the nav, the headings and a short excerpt. Only these — the
 * full page text stays out of storage and out of shared links.
 */
export interface SiteSnapshot {
  finalUrl: string;
  httpStatus: number;
  fetchedAt: string;
  title: string;
  navItems: string[];
  headings: string[];
  excerpt: string;
}

export interface ClientProfile {
  id: string;
  name: string;
  website: string;
  siteSnapshot?: SiteSnapshot | null;
  market: string;
  businessType: string;
  mainCategories: string[];
  /** PRD §18 — same meaning in both languages, never an English-only literal. */
  brandPositioning: LocalizedText;
  visualStyle: string[];
  targetAudience: string;
  pricePosition: string;
  portfolio: { category: string; share: number }[];
  /** Inferences, not facts — see OpportunityItem.basis. */
  opportunities: OpportunityItem[];
  confidence: 'High' | 'Medium' | 'Low';
  /** Present only when the official website was genuinely fetched. See SiteEvidence. */
  websiteEvidence?: SiteEvidence | null;
}

export interface DimensionScores {
  categoryFit: number;
  audienceFit: number;
  brandFit: number;
  priceFit: number;
  portfolioFit: number;
  marketFit: number;
}

/**
 * PRD §16 `related_products`. Buckets hold SKUs, because SKU is the identifier a sales rep and a
 * client both use; `product_id` is internal.
 *
 * Every entry is derived deterministically from real catalogue fields by
 * `relatedProductsFor()` — there is no research source behind it, so it must never be labelled as
 * client research. The buckets are mutually exclusive, so a SKU never appears under two labels:
 *   cross_sell  — SKUs in a primary category the client does NOT already cover
 *   upsell      — same category, a higher rung on PRICE_LADDER
 *   alternative — same secondary category (a like-for-like substitute)
 * A bucket with no qualifying SKU is an empty array, which is what PRD §16's example shows.
 */
export interface RelatedProducts {
  cross_sell: string[];
  upsell: string[];
  alternative: string[];
}

export interface Recommendation {
  product_id: string;
  product: Product;
  fitScore: number;
  potentialScore: number;
  dimensionScores: DimensionScores;
  reason: {
    clientFact: string;
    productFact: string;
    businessReason: string;
    /**
     * One caveat that is true of every shortlisted row, stated once above the list.
     *
     * It used to be appended to each sentence, which printed the same warning five times — noise that
     * trains the reader to stop reading. Optional: absent when there is nothing to say.
     */
    sharedCaveat?: string;
  };
  type: 'Best Match' | 'Growth Opportunity' | 'Product Line Expansion' | 'Strategic Product';
  /** PRD Layer 5 — Final Recommendation Score (0-100). */
  finalScore?: number;
  /**
   * The `ProductIntelligence` term of PRD §9's Final formula (`ai_scores.total`).
   *
   * `finalScore` computed this and threw it away, so the published number could not be taken apart
   * — the same defect `recallScore` had. PRD §16 requires it per recommendation, and a rep who
   * wants to know why a SKU outranked another needs it.
   */
  productIntelligence?: number;
  /** PRD §16 `related_products`. See RelatedProducts for how each bucket is derived. */
  relatedProducts?: RelatedProducts;
  /** PRD curation slot 01-05 (null when the product did not make the curated Top 5). */
  curationSlot?: number | null;
  /**
   * True when a Best Match slot (01/02) had to drop the `bestMatchMinCategoryFit` floor
   * because too few category-relevant SKUs existed — the UI flags this so a rep is not misled.
   */
  curationFallback?: boolean;
  confidence?: 'High' | 'Medium' | 'Low';
  /** PRD Layer 13 — at least one client fact + one product fact per rec. */
  evidence?: { type: EvidenceType; claim: string }[];
  /**
   * PRD Layer 2 retrieval score that recalled this candidate (0-100).
   *
   * PRD §18 requires the recalled candidates to be traceable to their retrieval scores. The engine
   * computed this to rank and truncate the recall set, then discarded it — so a recommendation
   * could not be traced back further than Layer 3. Carried here so it survives to the UI.
   */
  recallScore?: number;
}

/**
 * Evidence source types, in PRD §13 priority order (Client Website → Client Product Portfolio →
 * Social → Market Research → Internal Product Master).
 *
 * Only `sales_input` and `product_master` are reachable in this build: it has no network access, so
 * the first four would attribute an inference to a source nobody opened. See
 * MATCHING_CONFIG.evidenceSources, which gates the unavailable ones off.
 */
export type EvidenceType =
  | 'client_website'
  | 'client_product_portfolio'
  | 'client_social'
  | 'market_research'
  | 'product_master'
  /** What the sales rep declared in the analyze form. Rep-declared, not independently verified. */
  | 'sales_input';

/** Candidate layer row — crawled SHAKI.com SKU. Real fields only; nothing invented. */
export interface LibraryCandidate {
  product_id: string;
  sku: string;
  name_en?: string | null;
  name_cn?: string | null;
  layer: 'candidate';
  inferred_category?: string | null;
  secondary_category?: string | null;
  target_gender?: string | null;
  main_material?: string | null;
  primary_function?: string | null;
  hero_image_url?: string | null;
  intel_score?: number | null;
  completeness: number;
  eligible: boolean;
  media_count: number;
  tags: { all: string[]; category: string[]; function: string[]; audience: string[]; scenario: string[] };
}

/** Asset layer row — supplier media pack (Heydildi export). Media only, no fabricated params. */
export interface LibraryAsset {
  sku: string;
  layer: 'asset';
  images: string[];
  videos: string[];
  cad: string[];
  englishPage: boolean;
  isBundle: boolean;
  /** Media-only rows carry a structural completeness floor; params must be filled by PM. */
  completeness: number;
}

export interface PipelineStageStats {
  stage: string;
  input: number;
  output: number;
  note?: string;
}

/** One row of the library layer breakdown (generated: scripts/build_library.py). */
export interface LibraryLayerStat {
  key: ProductLayer;
  zh: string;
  en: string;
  count: number;
  eligible: number;
  noteZh: string;
  noteEn: string;
}

/** A crawled SKU ranked by how close it is to clearing the scoring gate. */
export interface EnrichmentQueueItem {
  product_id: string;
  sku: string;
  name_en: string;
  name_cn?: string | null;
  category: string;
  completeness: number;
  hero_image_url?: string | null;
  evidence_count: number;
  missing_crawl_fields: string[];
}

/** Bundle-safe projection of the unified library (apps/web/lib/data/library-stats.json). */
export interface LibraryStatsFile {
  gate: number;
  total: number;
  eligibleTotal: number;
  layers: LibraryLayerStat[];
  candidateCompletenessMax: number;
  candidateByCategory: Record<string, number>;
  pmRequiredFields: string[];
  enrichmentQueue: EnrichmentQueueItem[];
}

/**
 * The attributes a crawled candidate row structurally cannot supply, filled in by a PM.
 * See apps/web/lib/data/enrichment.ts — the runtime contract (field specs, enums, promotion).
 */
export interface EnrichmentFields {
  primary_category: CategoryCode | '';
  secondary_category: string;
  product_name_cn: string;
  description_cn: string;
  key_selling_point_cn: string;
  target_age: string;
  target_segment: string;
  design_style: string;
  visual_style: string;
  price_level: PriceLevel | '';
  target_market: MarketCode[];
  product_status: ProductStatus | '';
  oem_available: boolean;
}

/** A PM-enriched candidate row. `product` is pre-synthesised so the engine needs no candidate layer. */
export interface EnrichmentEntry {
  product_id: string;
  fields: EnrichmentFields;
  product: Product;
  updatedAt: string;
}

export interface Proposal {
  id: string;
  clientId: string;
  clientName: string;
  companyName?: string;
  language: Lang;
  products: Recommendation[];
  type: 'Single Product' | 'Product Collection' | 'Product Line Proposal';
  status: 'Draft' | 'Sent' | 'Viewed' | 'Interested' | 'Sample Requested' | 'Negotiating' | 'Won' | 'Lost';
  createdAt: string;
  updatedAt: string;
  shareUrl?: string;
  title?: string;
  copy?: string;
}
