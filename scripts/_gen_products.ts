/**
 * Generate the real scoring catalogue from crawled EN product pages.
 *
 * Replaces a fabricated 13-row catalogue with products that exist on shaki.com, each traceable to a
 * live URL. Three provenance levels are kept distinct and recorded on every row:
 *
 *   site   — verbatim from the product page (name, model, material, size, weight, function)
 *   ai     — written by the model and kept only because the evidence gate verified a quoted span
 *   policy — company defaults the PM approved; never inferred from the page
 *
 * The fields the PM declined (target age, target segment, design style) stay empty rather than being
 * invented to clear the gate.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { computeCompleteness } from '../apps/web/lib/data/brand';
import type { PriceLevel } from '../apps/web/lib/types';

const INCLUDE_VISUAL = !process.argv.includes('--no-visual');
const GATE = 40; // company-approved: the old 75 was set for rows that had a SKU and nothing else
const SRC = process.argv[2] || 'scripts/.en-catalog-raw.json';
const OUT_TS = 'apps/web/lib/data/products.ts';
const OUT_STATS = 'apps/web/lib/data/library-stats.json';

const { rows, results } = JSON.parse(readFileSync(SRC, 'utf8'));
// Photos live on the listing cards, not the detail pages; the map is built by _map_en_images.mjs.
const imageMap: Record<string, string> = existsSync('scripts/.en-images.json')
  ? JSON.parse(readFileSync('scripts/.en-images.json', 'utf8')).images || {}
  : {};
const aiById = new Map(results.map((r) => [r.product_id, r]));

/**
 * Controlled product-form vocabulary.
 *
 * `secondary_category` used to be the site's English product name. A name is not a category: variants
 * of one form differ ("Anal Plug" / "Anal Plug-A"), so every same-form cap in the engine was bypassed
 * and a curated Top 5 came out as four copies of one product. Forms are matched longest-first so
 * "mini wand" wins over the bare "vibrator".
 *
 * Derived from the catalogue's own names by scripts/_form_vocab.mjs (76% coverage); an unmatched name
 * falls back to the primary category rather than inventing a form.
 */
const PRODUCT_FORMS = [
  'vibrator rabbit', 'suction tongue vibrator', 'strap on dildo', 'male masturbator', 'body massager',
  'vibrating egg', 'remote vibrator', 'wearable vibrator', 'bullet vibrator', 'finger vibrator',
  'wand vibrator', 'clitoral suction', 'mini wand', 'insertable dildo', 'ball gag', 'tongue clamp',
  'nipple clamps', 'nipple vibrator', 'massage candle', 'card game', 'nipple clips', 'cock cage',
  'penis sleeve', 'butt plug', 'anal plug', 'handcuffs', 'ankle cuffs', 'cock ring', 'masturbator',
  'vibrator', 'stroker', 'dildo', 'collar', 'blindfold', 'chains', 'restraints', 'strap-on',
  'condom', 'card game', 'paddle', 'whip', 'crop', 'pump', 'gag', 'rope', 'clamp', 'cuffs', 'wax',
  'massage wax', 'card', 'oil', 'spray', 'kit', 'set', 'sleeve', 'extractor', 'massager',
] as const;

/**
 * Price band by product form — a COMPANY-POLICY DEFAULT, not something the site publishes.
 *
 * The site shows "Request a Quote" on every product page, so no band can be read from the source.
 * A single band for the whole catalogue was worse than none: with every row at `Mid`, the upsell
 * bucket (same category, one rung higher) could never be filled, and the §16 contract reported an
 * empty bucket with no way to tell "nothing to trade up to" from "we priced everything the same".
 * The bands below are the conventional ladder for these forms and are meant to be corrected by the
 * PM; every row keeps printing its own band so a wrong default is visible rather than silent.
 */
const PRICE_BY_FORM: Record<string, string> = {
  'card': 'Entry', 'cards': 'Entry', 'card game': 'Entry',
  'condom': 'Entry', 'oil': 'Entry', 'spray': 'Entry',
  'nipple clips': 'Entry', 'nipple clamps': 'Entry', 'nipple vibrator': 'Entry',
  'ball gag': 'Entry', 'blindfold': 'Entry', 'clamp': 'Entry', 'tongue clamp': 'Entry',
  'vibrating egg': 'Entry', 'bullet vibrator': 'Entry', 'finger vibrator': 'Entry',
  'stroker': 'Entry', 'mini wand': 'Entry', 'paddle': 'Entry', 'crop': 'Entry',
  'vibrator': 'Mid', 'dildo': 'Mid', 'anal plug': 'Mid', 'butt plug': 'Mid',
  'insertable dildo': 'Mid', 'masturbator': 'Mid', 'pump': 'Mid', 'cock ring': 'Mid',
  'kit': 'Mid', 'set': 'Mid', 'massager': 'Mid', 'body massager': 'Mid',
  'cock cage': 'Mid-Premium', 'penis sleeve': 'Mid-Premium', 'sleeve': 'Mid-Premium',
  'collar': 'Mid-Premium', 'cuffs': 'Mid-Premium', 'handcuffs': 'Mid-Premium',
  'ankle cuffs': 'Mid-Premium', 'restraints': 'Mid-Premium', 'rope': 'Mid-Premium',
  'chains': 'Mid-Premium', 'strap-on': 'Mid-Premium', 'strap on dildo': 'Mid-Premium',
  'vibrator rabbit': 'Mid-Premium', 'wand vibrator': 'Mid-Premium', 'remote vibrator': 'Mid-Premium',
  'wearable vibrator': 'Mid-Premium', 'extractor': 'Mid-Premium',
  'clitoral suction': 'Premium', 'suction tongue vibrator': 'Premium',
  'whip': 'Premium', 'bdsm set': 'Premium', 'wax': 'Premium', 'massage wax': 'Premium',
};

/**
 * Falls back to the normalised product name, NOT to the category.
 *
 * Falling back to the category looked harmless and was poisonous: every unmatched row collapsed onto
 * "FEMALE" or "BDSM", so unrelated products shared one "form" and the per-form ceiling counted them
 * as repeats of each other — which is how a Top 5 ended up as two "AV wand" and two "pump" alternating.
 * A form that cannot be identified should still identify the row.
 */
const formOf = (nameEn: string, primaryCategory: string): string => {
  const n = ` ${String(nameEn || '')
    .replace(/&amp;/g, '&')
    .replace(/[^A-Za-z0-9\s\-\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()} `;
  const hit = PRODUCT_FORMS.filter((f) => n.includes(` ${f}`) || n.includes(` ${f}s `) || n.includes(`${f}s `)).sort((a, b) => b.length - a.length)[0];
  return hit || n.trim() || primaryCategory;
};

/** Gender follows the page's own wording, so the evidence for it is the English name. */
const genderOf = (nameEn) =>
  /masturbator|prostate|male|penis/i.test(nameEn) ? 'male'
  : /wearable|couple|lesbian|strap|set|bondage/i.test(nameEn) ? 'couples'
  : 'female';

const CATEGORY_CN = {
  FEMALE: '女用',
  MALE: '男用',
  COUPLES: '情侣互动',
  BDSM: 'BDSM束缚',
  WATER_BASED: '水基护理',
};

const built = rows.map((row) => {
  const f = (aiById.get(row.product_id) || {}).fields || {};
  const nameEn = row.name_en || row.model || row.product_id;
  // The English description is the page's own wording reassembled, not a translation or a claim.
  const descriptionEn = [
    nameEn,
    row.function_en,
    row.main_material ? `Material: ${row.main_material}` : '',
    row.size ? `Size: ${row.size}` : '',
    row.weight ? `Weight: ${row.weight}` : '',
    row.charging ? `Charging: ${row.charging}` : '',
  ].filter(Boolean).join('. ');

  return {
    product_id: row.product_id,
    sku: row.model || row.product_id,
    product_name_cn: f.product_name_cn || '',
    product_name_en: nameEn,
    short_name: nameEn.length > 24 ? `${nameEn.slice(0, 24)}…` : nameEn,
    series_name: nameEn.split(/[·.\-\s]/)[0] || nameEn,
    product_status: 'Active',
    launch_date: '2026-08',
    primary_category: f.primary_category || 'FEMALE',
    secondary_category: formOf(nameEn, f.primary_category || 'FEMALE'),
    description_cn: f.description_cn || '',
    description_en: descriptionEn,
    short_description_cn: (f.description_cn || '').slice(0, 28),
    short_description_en: row.function_en || nameEn,
    key_selling_point_cn: f.key_selling_point_cn || '',
    key_selling_point_en: [row.function_en, row.charging, row.main_material].filter(Boolean).join(' | '),
    secondary_functions: [row.charging, row.size].filter(Boolean),
    // Tags are the page's own words, not invented descriptors.
    tags: [nameEn, row.model, row.main_material, row.function_en].filter(Boolean),
    primary_function: row.function_en || '',
    target_gender: genderOf(nameEn),
    target_age: '',
    target_segment: '',
    design_style: '',
    visual_style: INCLUDE_VISUAL ? (f.visual_style || '') : '',
    main_material: row.main_material || '',
    price_level: (PRICE_BY_FORM[formOf(nameEn, f.primary_category || 'FEMALE')] || 'Mid') as PriceLevel,
    target_market: ['Global'],
    oem_available: true,
    odm_available: true,

    source_url: row.url,
    image_url: imageMap[String(row.site_id)] || '',

  };
});

const withCompleteness = built.map((p) => ({ ...p, completeness: computeCompleteness(p) }));
const eligible = withCompleteness.filter((p) => p.completeness >= GATE);
const dist = {};
for (const p of withCompleteness) {
  const b = Math.floor(p.completeness / 5) * 5;
  dist[b] = (dist[b] || 0) + 1;
}

console.log(`generated: ${withCompleteness.length} real products`);
console.log(`eligible at gate ${GATE}: ${eligible.length}`);
console.log('completeness buckets:', Object.entries(dist).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => `${k}%:${v}`).join('  '));
const cats = {};
for (const p of withCompleteness) cats[p.primary_category] = (cats[p.primary_category] || 0) + 1;
console.log('categories:', Object.entries(cats).map(([k, v]) => `${CATEGORY_CN[k] || k}:${v}`).join('  '));

if (process.argv.includes('--dry-run')) process.exit(0);

// ── emit products.ts ────────────────────────────────────────────────────────────────────────
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ')}'`;
const lines = [];
lines.push('import { Product, CategoryCode, MarketCode, ProductStatus, PriceLevel } from \'../types\';');
lines.push('');
lines.push('/**');
lines.push(' * Brand layer — the products SHAKI actually sells.');
lines.push(' *');
lines.push(' * GENERATED by scripts/_gen_products.ts from the English product pages on shaki.com, do not');
lines.push(' * edit by hand. Every row carries the URL it came from, and every Chinese description was kept');
lines.push(' * only because the evidence gate verified a span quoted from that page.');
lines.push(' *');
lines.push(' * The four positioning fields the PM declined (target age, target segment, design style) are');
lines.push(' * empty on purpose. Completeness is therefore capped, which is why the gate sits below 75.');
lines.push(' */');
lines.push('');
lines.push('/**');
lines.push(' * Bump on ANY change to the rows below.');
lines.push(' *');
lines.push(' * Recommendations and proposals are persisted to localStorage with product snapshots baked in, so');
lines.push(' * after a catalogue edit a returning browser would render old names next to new descriptions — which');
lines.push(' * reads as a product that does not exist. ClientProvider compares this value against the stored one');
lines.push(' * and recomputes everything derived when they differ.');
lines.push(' */');
lines.push('export const LIBRARY_VERSION = 3;');
lines.push('');
lines.push(`export const SOURCE_OF_TRUTH = 'https://www.shaki.com/en/products';`);
lines.push('');
lines.push('export const products: Product[] = [');
for (const p of withCompleteness) {
  lines.push('  {');
  lines.push(`    product_id: ${q(p.product_id)},`);
  lines.push(`    sku: ${q(p.sku)},`);
  lines.push(`    product_name_cn: ${q(p.product_name_cn)},`);
  lines.push(`    product_name_en: ${q(p.product_name_en)},`);
  lines.push(`    short_name: ${q(p.short_name)},`);
  lines.push(`    series_name: ${q(p.series_name)},`);
  lines.push(`    product_status: ${q(p.product_status)},`);
  lines.push(`    launch_date: ${q(p.launch_date)},`);
  lines.push(`    primary_category: ${q(p.primary_category)},`);
  lines.push(`    secondary_category: ${q(p.secondary_category)},`);
  lines.push(`    description_cn: ${q(p.description_cn)},`);
  lines.push(`    description_en: ${q(p.description_en)},`);
  lines.push(`    short_description_cn: ${q(p.short_description_cn)},`);
  lines.push(`    short_description_en: ${q(p.short_description_en)},`);
  lines.push(`    key_selling_point_cn: ${q(p.key_selling_point_cn)},`);
  lines.push(`    key_selling_point_en: ${q(p.key_selling_point_en)},`);
  lines.push(`    secondary_functions: [${p.secondary_functions.map(q).join(', ')}],`);
  lines.push(`    tags: [${p.tags.map(q).join(', ')}],`);
  lines.push(`    primary_function: ${q(p.primary_function)},`);
  lines.push(`    target_gender: ${q(p.target_gender)},`);
  lines.push(`    target_age: '',`);
  lines.push(`    target_segment: '',`);
  lines.push(`    design_style: '',`);
  lines.push(`    visual_style: ${q(p.visual_style)},`);
  lines.push(`    main_material: ${q(p.main_material)},`);
  lines.push(`    price_level: ${q(p.price_level)},`);
  lines.push(`    target_market: [${p.target_market.map(q).join(', ')}],`);
  lines.push(`    oem_available: ${p.oem_available},`);
  lines.push(`    odm_available: ${p.odm_available},`);
  lines.push(``);
  lines.push(`    source_url: ${q(p.source_url)},`);
  if (p.image_url) lines.push(`    image_url: ${q(p.image_url)},`);
  lines.push('  },');
}
lines.push('];');
lines.push('');
lines.push('export const categoryNames: Record<CategoryCode, { zh: string; en: string }> = {');
for (const [code, cn] of Object.entries(CATEGORY_CN)) {
  lines.push(`  ${code}: { zh: ${q(cn)}, en: ${q(code === 'WATER_BASED' ? 'Water-based care' : code === 'COUPLES' ? 'Couples' : code === 'BDSM' ? 'BDSM' : code === 'MALE' ? 'Male' : 'Female')} },`);
}
lines.push('};');
lines.push('');
lines.push('export const priceLevelNames: Record<PriceLevel, { zh: string; en: string }> = {');
lines.push("  Entry: { zh: '入门', en: 'Entry' },");
lines.push("  Mid: { zh: '中端', en: 'Mid' },");
lines.push("  'Mid-Premium': { zh: '中高端', en: 'Mid-Premium' },");
lines.push("  Premium: { zh: '高端', en: 'Premium' },");
lines.push("  Luxury: { zh: '奢华', en: 'Luxury' },");
lines.push('};');
lines.push('');
lines.push('export const productStatusNames: Record<ProductStatus, { zh: string; en: string }> = {');
lines.push("  Draft: { zh: '草稿', en: 'Draft' },");
lines.push("  Active: { zh: '在售', en: 'Active' },");
lines.push("  New: { zh: '新品', en: 'New' },");
lines.push("  'Best Seller': { zh: '爆款', en: 'Best Seller' },");
lines.push("  Strategic: { zh: '战略产品', en: 'Strategic' },");
lines.push("  Seasonal: { zh: '季节性', en: 'Seasonal' },");
lines.push("  Discontinued: { zh: '停产', en: 'Discontinued' },");
lines.push("  'Coming Soon': { zh: '即将上市', en: 'Coming Soon' },");
lines.push('};');
lines.push('');
writeFileSync(OUT_TS, lines.join('\n'));
console.log(`\nwrote ${OUT_TS} (${withCompleteness.length} products, ${lines.length} lines)`);

// ── refresh the layer stats the funnel reads ───────────────────────────────────────────────
const candidateCount = JSON.parse(readFileSync('apps/web/lib/data/library-stats.json', 'utf8'))
  .layers.find((l) => l.key === 'candidate').count;
const assetCount = JSON.parse(readFileSync('apps/web/lib/data/library-stats.json', 'utf8'))
  .layers.find((l) => l.key === 'asset').count;
// Merge, never replace: this file also carries the candidate-layer summary and the PM field spec,
// which this generator does not own. Overwriting the object wholesale dropped them, and
// `library-view.ts` read one of the missing keys straight into a `.slice()` — /catalog/ went blank.
const prevStats = existsSync(OUT_STATS) ? JSON.parse(readFileSync(OUT_STATS, 'utf8')) : {};
const carried = Object.fromEntries(
  Object.entries(prevStats).filter(
    ([k, v]) => !['_note', 'gate', 'total', 'eligibleTotal', 'layers', 'enrichmentQueue'].includes(k) && v !== undefined,
  ),
);

writeFileSync(
  OUT_STATS,
  JSON.stringify(
    {
      ...carried,
      // The candidate layer is parked, so there is nothing left to enrich — an empty queue, stated,
      // rather than a missing key.
      enrichmentQueue: [],
      _note: 'Generated by scripts/_gen_products.ts — do not edit by hand.',
      gate: GATE,
      total: withCompleteness.length + candidateCount + assetCount,
      eligibleTotal: eligible.length,
      layers: [
        {
          key: 'brand',
          zh: '自有货盘（shaki.com 在售）',
          en: 'Curated catalogue (live on shaki.com)',
          count: withCompleteness.length,
          eligible: eligible.length,
          noteZh: '从英文站产品页抓取的真实产品，逐行带产品页链接；中文描述由 AI 生成并通过证据闸校验。',
          noteEn: 'Real products crawled from the English product pages, each with its source URL; Chinese descriptions are evidence-gated.',
        },
        {
          key: 'candidate',
          zh: '旧版抓取货盘（已停用）',
          en: 'Legacy crawl (parked)',
          count: candidateCount,
          eligible: 0,
          noteZh: '早期抓取只拿到货号，已实测无法补齐到门槛，不参与推荐。',
          noteEn: 'SKU-only rows from an earlier crawl; measured as unable to reach the gate, so not scored.',
        },
        {
          key: 'asset',
          zh: '供应商媒体包',
          en: 'Supplier media packs',
          count: assetCount,
          eligible: 0,
          noteZh: '只有图片与 CAD，没有参数，不参与推荐。',
          noteEn: 'Media and CAD only, no parameters, not scored.',
        },
      ],
    },
    null,
    0,
  ),
);
console.log(`wrote ${OUT_STATS} — eligibleTotal ${eligible.length}, gate ${GATE}`);