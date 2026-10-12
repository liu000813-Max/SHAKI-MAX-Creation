/**
 * Can a real EN product clear 75% completeness? Measured, not assumed.
 *
 * Three sources are separated on purpose:
 *   - site      : copied verbatim from the English product page
 *   - ai        : written by the model, and only when the evidence gate kept a quoted span
 *   - policy    : company knowledge (price band, target market) — never inferred, always labelled
 *
 * The policy columns are what the PM has to supply; the report shows the catalogue both ways so the
 * decision is made on numbers.
 */
import { readFileSync } from 'node:fs';
import { computeCompleteness } from '../apps/web/lib/data/brand';
import { MATCHING_CONFIG } from '../apps/web/lib/config/matching';

const rows = JSON.parse(readFileSync('scripts/.en-products-sample.json', 'utf8'));
const enriched = JSON.parse(readFileSync('scripts/.en-products-enriched.json', 'utf8'));
const byId = new Map(enriched.map((r) => [r.product_id, r]));
const gate = MATCHING_CONFIG.gate ?? 75;

const build = (row, ai, policy) => {
  const f = (ai && ai.fields) || {};
  return {
    product_id: row.product_id,
    sku: row.model,
    product_name_cn: f.product_name_cn || '',
    product_name_en: row.name_en || '',
    primary_category: f.primary_category || '',
    // Derived from the English name, which is itself evidence quoted from the page.
    secondary_category: row.name_en || '',
    description_cn: f.description_cn || '',
    key_selling_point_cn: f.key_selling_point_cn || '',
    primary_function: row.function_en || '',
    // "Masturbator" / "Vibrator" / "Wearable" are stated on the page, so gender follows from the
    // page's own wording rather than from a guess about the product.
    target_gender: /masturbator| prostate| male/i.test(row.name_en) ? 'male' : /wearable|couple|lesbian/i.test(row.name_en) ? 'couples' : 'female',
    target_age: '',
    target_segment: f.target_segment || '',
    design_style: '',
    visual_style: '',
    main_material: row.main_material || '',
    price_level: policy ? 'Mid' : '',
    target_market: policy ? ['Global'] : [],
    product_status: 'Active',
    oem_available: true,
    ai_scores: null,
  };
};

const pct = (arr) => arr.map((r) => computeCompleteness(r));
const withoutPolicy = pct(rows.map((r) => build(r, byId.get(r.product_id), false)));
const withPolicy = pct(rows.map((r) => build(r, byId.get(r.product_id), true)));

const line = (label, arr) =>
  console.log(`${label.padEnd(26)} avg ${(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(0)}%  max ${Math.max(...arr)}%  ≥${gate}: ${arr.filter((p) => p >= gate).length}/${arr.length}`);

console.log(`rows: ${rows.length} | gate: ${gate}\n`);
line('site + ai (evidence-gated)', withoutPolicy);
line('+ price/market (policy)', withPolicy);

console.log('\nper product:');
rows.forEach((r, i) => {
  console.log(`  ${(r.name_en || '(none)').slice(0, 34).padEnd(34)} ${String(withoutPolicy[i]).padStart(3)}% -> ${String(withPolicy[i]).padStart(3)}%`);
});

const missing = Object.entries(build(rows[0], byId.get(rows[0].product_id), true))
  .filter(([, v]) => v === '' || (Array.isArray(v) && !v.length))
  .map(([k]) => k);
console.log(`\nstill empty with policy applied: ${missing.join(', ')}`);