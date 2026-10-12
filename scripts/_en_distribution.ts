/**
 * Completeness distribution for the real EN catalogue — the number that decides the gate question.
 *
 * Variants are cumulative so the PM can see exactly what each policy choice buys:
 *   A  site + evidence-gated AI only
 *   B  A + visual style where the page actually states it
 *   C  B + price band and target market as company policy
 *
 * The four positioning fields the PM declined (target age, target segment, design style) stay empty
 * in every variant, so nothing is quietly resurrected.
 */
import { readFileSync } from 'node:fs';
import { computeCompleteness } from '../apps/web/lib/data/brand';
import { MATCHING_CONFIG } from '../apps/web/lib/config/matching';

const { rows, results } = JSON.parse(readFileSync('scripts/.en-catalog-raw.json', 'utf8'));
const aiById = new Map(results.map((r) => [r.product_id, r]));
const gate = MATCHING_CONFIG.gate ?? 75;

/** Gender follows the page's own wording, so the evidence is the English name itself. */
const genderOf = (nameEn) =>
  /masturbator|prostate|male/i.test(nameEn) ? 'male'
  : /wearable|couple|lesbian|strap|set/i.test(nameEn) ? 'couples'
  : 'female';

const build = (row, variant) => {
  const f = (aiById.get(row.product_id) || {}).fields || {};
  const base = {
    product_id: row.product_id,
    sku: row.model,
    product_name_cn: f.product_name_cn || '',
    product_name_en: row.name_en || '',
    primary_category: f.primary_category || '',
    secondary_category: row.name_en || '',
    description_cn: f.description_cn || '',
    key_selling_point_cn: f.key_selling_point_cn || '',
    primary_function: row.function_en || '',
    target_gender: genderOf(row.name_en || ''),
    target_age: '',
    target_segment: '',
    design_style: '',
    visual_style: '',
    main_material: row.main_material || '',
    price_level: '',
    target_market: [],
    product_status: 'Active',
    oem_available: true,
    ai_scores: null,
  };
  if (variant === 'A') return base;
  if (variant === 'B') return { ...base, visual_style: f.visual_style || '' };
  return { ...base, visual_style: f.visual_style || '', price_level: 'Mid', target_market: ['Global'] };
};

const pctOf = (variant) => rows.map((r) => computeCompleteness(build(r, variant)));

const A = pctOf('A');
const B = pctOf('B');
const C = pctOf('C');

const show = (label, arr) =>
  console.log(`${label.padEnd(34)} avg ${String(Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)).padStart(2)}%  max ${String(Math.max(...arr)).padStart(2)}%  ≥${gate}: ${String(arr.filter((p) => p >= gate).length).padStart(3)}/${arr.length}`);

console.log(`rows: ${rows.length} | current gate: ${gate}\n`);
show('A site + AI', A);
show('B A + visual style (evidenced)', B);
show('C B + price/market (policy)', C);

console.log('\ndistribution for C:');
const buckets = {};
for (const p of C) {
  const b = Math.floor(p / 5) * 5;
  buckets[b] = (buckets[b] || 0) + 1;
}
for (const b of Object.keys(buckets).sort((x, y) => Number(x) - Number(y))) {
  console.log(`  ${String(b).padStart(2)}-${Number(b) + 4}%  ${'█'.repeat(Math.ceil(buckets[b] / 3)).padEnd(42)} ${buckets[b]}`);
}

console.log('\nwhat each gate value would admit (variant C):');
for (const t of [75, 60, 55, 50, 45, 40]) {
  console.log(`  ≥${String(t).padStart(2)}%  ${String(C.filter((p) => p >= t).length).padStart(3)} rows`);
}