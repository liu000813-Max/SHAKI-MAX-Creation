/**
 * How far can the catalog actually get? Projection, not vibes.
 *
 * The gate is 75. Rows are currently capped at 31. This computes, with no API calls:
 *   - the completeness of every candidate row as it stands;
 *   - the completeness after AI fills the only three fields it can legitimately fill from a name
 *     (Chinese name, description, selling points) — the fields with no basis stay empty, which is
 *     the whole point of the evidence gate.
 *
 * The result is the gate value that would admit N rows. That number is a product decision, not an
 * engineering one — this script exists so the decision is made on measurements.
 */
import { readFileSync } from 'node:fs';
import { computeCompleteness } from '../apps/web/lib/data/brand';
import { MATCHING_CONFIG } from '../apps/web/lib/config/matching';

const rows = JSON.parse(readFileSync('apps/web/lib/data/library-candidates.json', 'utf8'));
const list = Array.isArray(rows) ? rows : rows.rows || rows.items || rows.candidates;
const gate = MATCHING_CONFIG.gate ?? 75;
const SKU_LIKE = /^[A-Z]{2,4}-[A-Z0-9-]+$/i;

const base = (r) => ({
  product_id: r.product_id,
  sku: r.sku,
  product_name_cn: r.name_cn || '',
  product_name_en: typeof r.name_en === 'string' && !SKU_LIKE.test(r.name_en) ? r.name_en : '',
  primary_category: r.inferred_category && r.inferred_category !== 'Unmapped' ? r.inferred_category : '',
  secondary_category: r.secondary_category || '',
  description_cn: '',
  key_selling_point_cn: '',
  primary_function: r.primary_function || '',
  target_gender: r.target_gender || '',
  target_age: '',
  target_segment: '',
  design_style: '',
  visual_style: '',
  main_material: r.main_material || '',
  price_level: '',
  target_market: [],
  product_status: '',
  oem_available: true,
  ai_scores: null,
});

// The best case AI can honestly reach: the three text fields it can ground in a product name.
// Everything else (price band, audience, styles, market) has no basis in a crawled row and must
// stay empty — inflating this would be the exact failure the evidence gate prevents.
const withAi = (r) => ({
  ...base(r),
  product_name_cn: base(r).product_name_cn || '（待AI补中文名）',
  description_cn: '（待AI补中文描述）',
  key_selling_point_cn: '（待AI补中文卖点）',
});

const dist = (fn) => {
  const out = [];
  for (const r of list) out.push(computeCompleteness(fn(r)));
  return out;
};

const hist = (arr) => {
  const buckets = {};
  for (const p of arr) {
    const b = Math.floor(p / 10) * 10;
    buckets[b] = (buckets[b] || 0) + 1;
  }
  return buckets;
};

const now = dist(base);
const after = dist(withAi);

const at = (arr, t) => arr.filter((p) => p >= t).length;

console.log(`rows: ${list.length} | gate: ${gate}\n`);
console.log('today            :', `max ${Math.max(...now)}%  avg ${(now.reduce((a, b) => a + b, 0) / now.length).toFixed(1)}%  ≥gate ${at(now, gate)}`);
console.log('after AI (3 fields):', `max ${Math.max(...after)}%  avg ${(after.reduce((a, b) => a + b, 0) / after.length).toFixed(1)}%  ≥gate ${at(after, gate)}`);

console.log('\ncompleteness distribution after AI (bucket: rows)');
const h = hist(after);
for (const b of Object.keys(h).sort((a, b) => Number(a) - Number(b))) console.log(`  ${b.padStart(3)}-${Number(b) + 9}%  ${'█'.repeat(Math.ceil(h[b] / 20)).padEnd(38)} ${h[b]}`);

console.log('\nwhat each gate value would admit:');
for (const t of [75, 60, 50, 45, 40, 35, 30]) {
  console.log(`  ≥${String(t).padStart(2)}%  ${String(at(after, t)).padStart(4)} rows  (today: ${at(now, t)})`);
}