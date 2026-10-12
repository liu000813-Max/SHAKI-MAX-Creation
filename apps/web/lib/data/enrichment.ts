/**
 * Enrichment layer — turn crawled candidate rows into scoring-eligible products.
 *
 * The engine's only contract is the Data Completeness gate (see MATCHING_CONFIG). A crawled
 * SHAKI.com row carries ~8 real attributes and maxes out around 31%, so it can never score.
 * This module is the other side of that contract: a PM supplies the 13 attributes the crawl
 * structurally cannot produce, and the row is promoted into the scoring pool — no code change.
 *
 * Nothing is fabricated. `toProduct()` copies crawled values verbatim and leaves every
 * unmapped field empty, so `computeCompleteness()` measures the *same* thing for a promoted
 * candidate as it does for a curated brand SKU.
 */
import { computeCompleteness } from './brand';
import { MATCHING_CONFIG } from '../config/matching';
import type {
  CategoryCode,
  EnrichmentEntry,
  EnrichmentFields,
  LibraryCandidate,
  LocalizedText,
  MarketCode,
  PriceLevel,
  Product,
  ProductStatus,
} from '../types';

// Re-exported so consumers can import the types from one place alongside the runtime contract.
export type { EnrichmentEntry, EnrichmentFields };

// ────────────────────────────────────────────────────────────── field contract

export type EnrichFieldKey = keyof EnrichmentFields;

export type EnrichFieldKind = 'enum' | 'multi' | 'text' | 'bool';

export interface EnrichFieldSpec {
  key: EnrichFieldKey;
  kind: EnrichFieldKind;
  /** Required fields are the minimum set the form insists on before saving. */
  required: boolean;
  options?: readonly string[];
  /**
   * Format hint only. MUST NOT contain a real product's name, SKU or any other actual value —
   * a plausible-looking placeholder is easy to mistake for pre-filled data and ship as-is.
   */
  placeholder?: LocalizedText;
  /** Header aliases accepted by the bulk import (lowercased, trimmed). */
  aliases?: string[];
}

export const ENRICH_ENUMS = {
  primary_category: ['FEMALE', 'MALE', 'COUPLES', 'BDSM', 'WATER_BASED'],
  price_level: ['Entry', 'Mid', 'Mid-Premium', 'Premium', 'Luxury'],
  product_status: ['Active', 'New', 'Best Seller', 'Strategic', 'Coming Soon'],
  target_market: ['US', 'UK', 'EU', 'Australia', 'Japan', 'Korea', 'Southeast Asia', 'Middle East', 'Global'],
} as const;

export const ENRICH_FIELDS: EnrichFieldSpec[] = [
  { key: 'primary_category', kind: 'enum', required: true, options: ENRICH_ENUMS.primary_category, aliases: ['品类', '一级品类', 'category'] },
  {
    key: 'secondary_category',
    kind: 'text',
    required: false,
    placeholder: { zh: '如：震动类 / Vibrators', en: 'e.g. Vibrators' },
    aliases: ['二级品类', 'subcategory'],
  },
  {
    key: 'product_name_cn',
    kind: 'text',
    required: false,
    placeholder: { zh: '如：系列名 · 产品形态', en: 'e.g. Series · form factor' },
    aliases: ['中文品名', '品名'],
  },
  {
    key: 'description_cn',
    kind: 'text',
    required: true,
    placeholder: { zh: '一句话产品描述', en: 'One-sentence product description' },
    aliases: ['描述', '产品描述', 'description'],
  },
  {
    key: 'key_selling_point_cn',
    kind: 'text',
    required: true,
    placeholder: { zh: '卖点一｜卖点二｜卖点三', en: 'Point 1 | Point 2 | Point 3' },
    aliases: ['卖点', '核心卖点', 'selling point'],
  },
  {
    key: 'target_age',
    kind: 'text',
    required: true,
    placeholder: { zh: '格式：起始-结束，如 25-40', en: 'Format: min-max, e.g. 25-40' },
    aliases: ['年龄段', '年龄', 'age'],
  },
  {
    key: 'target_segment',
    kind: 'text',
    required: true,
    placeholder: { zh: '如：Premium / Mid-Premium', en: 'e.g. Premium / Mid-Premium' },
    aliases: ['人群', '客户群', 'segment'],
  },
  {
    key: 'design_style',
    kind: 'text',
    required: true,
    placeholder: { zh: '如：Minimal / Premium / Modern', en: 'e.g. Minimal / Premium / Modern' },
    aliases: ['设计风格', 'style'],
  },
  {
    key: 'visual_style',
    kind: 'text',
    required: true,
    placeholder: { zh: '如：Clean / Feminine / Sleek', en: 'e.g. Clean / Feminine / Sleek' },
    aliases: ['视觉风格', 'visual'],
  },
  { key: 'price_level', kind: 'enum', required: true, options: ENRICH_ENUMS.price_level, aliases: ['价格带', '价格定位', 'price'] },
  { key: 'target_market', kind: 'multi', required: true, options: ENRICH_ENUMS.target_market, aliases: ['目标市场', '市场', 'market'] },
  { key: 'product_status', kind: 'enum', required: true, options: ENRICH_ENUMS.product_status, aliases: ['状态', 'status'] },
  { key: 'oem_available', kind: 'bool', required: true, aliases: ['oem', 'odm', '可oem'] },
];

export function emptyFields(): EnrichmentFields {
  return {
    primary_category: '',
    secondary_category: '',
    product_name_cn: '',
    description_cn: '',
    key_selling_point_cn: '',
    target_age: '',
    target_segment: '',
    design_style: '',
    visual_style: '',
    price_level: '',
    target_market: [],
    product_status: '',
    oem_available: false,
  };
}

/** Headers the crawled layer can already supply — pre-filled so the PM does not retype them. */
export function seedFromCandidate(c: LibraryCandidate): EnrichmentFields {
  return {
    ...emptyFields(),
    primary_category: (INFERRED_TO_CATEGORY[c.inferred_category ?? ''] ?? '') as CategoryCode | '',
    secondary_category: c.secondary_category ?? '',
    product_name_cn: c.name_cn ?? '',
  };
}

export const INFERRED_TO_CATEGORY: Record<string, CategoryCode | undefined> = {
  Female: 'FEMALE',
  Male: 'MALE',
  Couples: 'COUPLES',
  BDSM: 'BDSM',
};

// ────────────────────────────────────────────────────────────── candidate -> Product

/**
 * Synthesise a Product from a crawled row + PM input. Crawled values are copied verbatim;
 * anything the PM has not supplied stays empty — including `ai_scores`, which is left as an
 * empty object so the completeness metric does NOT count it (an invented score would inflate
 * the row past the gate, which is exactly the dishonesty the contract exists to prevent).
 */
export function toProduct(c: LibraryCandidate, fields: EnrichmentFields): Product {
  const category = fields.primary_category || INFERRED_TO_CATEGORY[c.inferred_category ?? ''] || '';
  const product: Product = {
    product_id: c.product_id,
    sku: c.sku,
    product_name_cn: fields.product_name_cn || c.name_cn || '',
    product_name_en: c.name_en || c.sku,
    short_name: c.name_en || c.sku,
    series_name: '',
    product_status: (fields.product_status || '') as ProductStatus,
    primary_category: category as CategoryCode,
    secondary_category: fields.secondary_category || c.secondary_category || '',
    description_cn: fields.description_cn,
    description_en: '',
    short_description_cn: '',
    short_description_en: '',
    key_selling_point_cn: fields.key_selling_point_cn,
    key_selling_point_en: '',
    primary_function: c.primary_function || '',
    secondary_functions: [],
    target_gender: c.target_gender || '',
    target_age: fields.target_age,
    target_segment: fields.target_segment,
    design_style: fields.design_style,
    visual_style: fields.visual_style,
    main_material: c.main_material || '',
    price_level: (fields.price_level || '') as PriceLevel,
    target_market: fields.target_market as MarketCode[],
    oem_available: fields.oem_available,
    odm_available: fields.oem_available,
    // Real crawled tags only — never synthesised, or the metric would reward us for typing.
    tags: [...(c.tags?.all ?? [])].slice(0, 6),
    layer: 'candidate',
    ai_scores: {} as Product['ai_scores'],
    commercial: {} as Product['commercial'],
  };
  product.completeness = computeCompleteness(product);
  return product;
}

/** Completeness of a candidate row under the SAME metric the brand layer uses. */
export function completenessOf(c: LibraryCandidate, fields: EnrichmentFields): number {
  return toProduct(c, fields).completeness ?? 0;
}

export function completenessGate(): number {
  return MATCHING_CONFIG.thresholds.hardFilterCompleteness;
}

/** A candidate is promotable when it clears the gate AND has a usable primary category. */
export function isPromotable(c: LibraryCandidate, fields: EnrichmentFields): boolean {
  const category = fields.primary_category || INFERRED_TO_CATEGORY[c.inferred_category ?? ''] || '';
  return Boolean(category) && completenessOf(c, fields) >= completenessGate();
}

// ────────────────────────────────────────────────────────────── persisted entries

export type EnrichmentRecord = Record<string, EnrichmentEntry>;

// ────────────────────────────────────────────────────────────── bulk import

export interface BulkRow {
  key: string;
  values: Partial<Record<EnrichFieldKey, string>>;
}

export interface BulkParseResult {
  rows: BulkRow[];
  errors: string[];
  headers: string[];
}

function splitDelimited(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === sep) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function detectSeparator(line: string): string {
  return line.includes('\t') ? '\t' : ',';
}

function resolveHeader(header: string): EnrichFieldKey | 'key' | null {
  const h = header.trim().toLowerCase();
  if (['sku', 'product_id', 'id', '商品id', '货号'].includes(h)) return 'key';
  for (const f of ENRICH_FIELDS) {
    if (f.key.toLowerCase() === h) return f.key;
    if (f.aliases?.some((a) => a.toLowerCase() === h)) return f.key;
  }
  return null;
}

/**
 * Parse a pasted spreadsheet block (Excel copy → TSV, or CSV) or a JSON array of objects.
 * Unknown columns are reported, never silently dropped.
 */
export function parseBulkImport(text: string): BulkParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], errors: ['EMPTY'], headers: [] };

  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed) as Record<string, unknown>[];
      if (!Array.isArray(arr)) return { rows: [], errors: ['JSON_NOT_ARRAY'], headers: [] };
      const rows: BulkRow[] = [];
      for (const obj of arr) {
        const values: Partial<Record<EnrichFieldKey, string>> = {};
        let key = '';
        for (const [k, v] of Object.entries(obj)) {
          const resolved = resolveHeader(k);
          if (resolved === 'key') key = String(v ?? '');
          else if (resolved) values[resolved] = Array.isArray(v) ? v.join(' | ') : String(v ?? '');
        }
        if (key) rows.push({ key, values });
      }
      return { rows, errors: rows.length ? [] : ['NO_ROWS'], headers: Object.keys(arr[0] ?? {}) };
    } catch {
      return { rows: [], errors: ['JSON_PARSE_FAILED'], headers: [] };
    }
  }

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], errors: ['NEED_HEADER_AND_ROW'], headers: [] };
  const sep = detectSeparator(lines[0]);
  const headers = splitDelimited(lines[0], sep);
  const mapped = headers.map(resolveHeader);
  const unknown = headers.filter((_, i) => mapped[i] === null);
  const keyIdx = mapped.indexOf('key');
  const errors: string[] = [];
  if (keyIdx < 0) errors.push('MISSING_SKU_COLUMN');
  if (unknown.length) errors.push(`UNKNOWN_COLUMNS:${unknown.join('|')}`);

  const rows: BulkRow[] = [];
  for (let r = 1; r < lines.length; r += 1) {
    const cells = splitDelimited(lines[r], sep);
    const key = keyIdx >= 0 ? (cells[keyIdx] || '').trim() : '';
    if (!key) continue;
    const values: Partial<Record<EnrichFieldKey, string>> = {};
    mapped.forEach((m, i) => {
      if (m && m !== 'key') values[m] = (cells[i] || '').trim();
    });
    rows.push({ key, values });
  }
  return { rows, errors, headers };
}

/** Coerce a raw imported string into the typed field value. */
export function coerceField(key: EnrichFieldKey, raw: string): string | string[] | boolean {
  const spec = ENRICH_FIELDS.find((f) => f.key === key);
  if (!spec) return raw;
  if (spec.kind === 'multi') {
    return raw
      .split(/[|,;/、]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (spec.kind === 'bool') {
    return ['1', 'true', 'yes', 'y', '是', '可'].includes(raw.trim().toLowerCase());
  }
  return raw;
}

/** Apply one imported row onto a field set (used by the bulk import preview + commit). */
export function applyBulkRow(base: EnrichmentFields, values: Partial<Record<EnrichFieldKey, string>>): EnrichmentFields {
  const next: EnrichmentFields = { ...base };
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) continue;
    const key = k as EnrichFieldKey;
    const coerced = coerceField(key, v);
    (next as unknown as Record<string, unknown>)[key] = coerced;
  }
  return next;
}
