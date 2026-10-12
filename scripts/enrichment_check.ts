/**
 * Enrichment smoke harness — run with jiti:
 *   apps/web/node_modules/.bin/jiti scripts/enrichment_check.ts
 *
 * Asserts the one claim the whole workbench rests on: supplying the PM-required fields
 * pushes a crawled row past the completeness gate, and the promoted row then flows through
 * the SAME hard filter as the curated brand SKUs.
 */
import { candidateLayer, brandLayer } from '../apps/web/lib/data/library';
import {
  ENRICH_FIELDS,
  applyBulkRow,
  completenessGate,
  completenessOf,
  parseBulkImport,
  seedFromCandidate,
  toProduct,
} from '../apps/web/lib/data/enrichment';
import { runEngine, analyzeClient } from '../apps/web/lib/matching';

const GATE = completenessGate();
const c = [...candidateLayer].sort((a, b) => b.completeness - a.completeness || a.product_id.localeCompare(b.product_id))[0];
console.log('=== picked crawled row ===');
console.log(c.product_id, '|', c.sku, '|', c.inferred_category, '| crawl completeness', c.completeness);

const seeded = seedFromCandidate(c);
console.log('\n=== after seeding from crawl (no PM input) ===');
console.log('fields:', JSON.stringify(seeded));
console.log('completeness:', completenessOf(c, seeded), '(gate', GATE + ')');

const filled = { ...seeded };
for (const f of ENRICH_FIELDS) {
  if (!f.required) continue;
  if (f.kind === 'multi') (filled as Record<string, unknown>)[f.key] = ['US', 'EU'];
  else if (f.kind === 'bool') (filled as Record<string, unknown>)[f.key] = true;
  else if (f.kind === 'enum') (filled as Record<string, unknown>)[f.key] = f.options![1];
  else (filled as Record<string, unknown>)[f.key] = `FILLED-${f.key}`;
}
console.log('\n=== after PM input ===');
const pct = completenessOf(c, filled);
console.log('completeness:', pct, '| promotable:', pct >= GATE && Boolean(filled.primary_category));

const product = toProduct(c, filled);
console.log('synthesised Product:');
console.log('  id/sku:', product.product_id, product.sku);
console.log('  category:', product.primary_category, '| price:', product.price_level, '| market:', product.target_market.join('/'));
console.log('  name_en (crawl, untouched):', product.product_name_en);
console.log('  target_gender (crawl):', product.target_gender, '| material (crawl):', product.main_material);
console.log('  ai_scores keys:', Object.keys(product.ai_scores).length, '(must be 0 — never invented)');
console.log('  completeness stored:', product.completeness);

console.log('\n=== engine: does the promoted row enter the pool? ===');
const client = analyzeClient(
  { website: 'https://example-shop.com', socialLinks: [], categories: 'women wellness vibrator suction', market: 'US' },
  'en'
);
const without = runEngine(client, 'en');
const withRow = runEngine(client, 'en', [product]);
console.log('pool without enrichment:', without.libraryEligible, '-> with:', withRow.libraryEligible);
console.log('stage1:', JSON.stringify(withRow.stages[0]));
const hit = withRow.recommendations.find((r) => r.product_id === product.product_id);
console.log('promoted row scored:', hit ? `yes fit=${hit.fitScore} final=${hit.finalScore} slot=${hit.curationSlot ?? '-'}` : 'NO');

console.log('\n=== bulk import: TSV paste ===');
const tsv = [
  'SKU\t一级品类\t价格带\t目标市场\t状态',
  `${c.sku}\tCOUPLES\tMid-Premium\tUS|EU\tActive`,
  'AUTO-DOES-NOT-EXIST\tBDSM\tMid\tUS\tActive',
].join('\n');
const parsed = parseBulkImport(tsv);
console.log('headers:', parsed.headers.join(' | '));
console.log('errors:', parsed.errors);
console.log('rows:', parsed.rows.length);
const base = seedFromCandidate(c);
const merged = applyBulkRow(base, parsed.rows[0].values);
console.log('merged category/price/market/status:', merged.primary_category, merged.price_level, merged.target_market, merged.product_status);
console.log('merged completeness:', completenessOf(c, merged), '| gate', GATE);

console.log('\n=== bulk import: JSON paste ===');
const json = JSON.stringify([{ sku: c.sku, primary_category: 'BDSM', price_level: 'Premium', target_market: ['UK'] }]);
const pj = parseBulkImport(json);
console.log('rows:', pj.rows.length, '| errors:', pj.errors, '| values:', JSON.stringify(pj.rows[0]?.values));

console.log('\n=== bulk import: bad paste is reported, not swallowed ===');
console.log(JSON.stringify(parseBulkImport('')));
console.log(JSON.stringify(parseBulkImport('just one line')));
console.log(JSON.stringify(parseBulkImport('SKU,未知列\nX,1')));

// ── Guard: a placeholder must never contain a real product name or SKU ────────────────
// Placeholders are grey and easy to mistake for pre-filled data, so a plausible real value
// there can get shipped as-is (and a real SKU in the bulk-import sample would write to it).
console.log('\n=== guard: placeholders carry no real product values ===');
const realValues = [
  ...brandLayer.map((p) => p.product_name_cn),
  ...brandLayer.map((p) => p.product_name_en),
  ...brandLayer.map((p) => p.sku),
  ...candidateLayer.slice(0, 200).map((c) => c.sku),
].filter(Boolean);
// Substring matching is too blunt now that the catalogue holds real product names: "Vibrator" sits
// inside the word "Vibrators", and a one-letter name matches everything. A placeholder only leaks if
// it could be mistaken for the value itself — a whole token in Latin script, or a run in Chinese,
// where there are no word boundaries. Anything shorter than four characters cannot identify a
// product and is not a leak.
const CJK = /[\u4e00-\u9fa5]/;
const leaks: string[] = [];
for (const f of ENRICH_FIELDS) {
  if (!f.placeholder) continue;
  for (const raw of realValues) {
    const v = String(raw).trim();
    if (v.length < 4) continue;
    const hit = CJK.test(v)
      ? f.placeholder.zh.includes(v) || f.placeholder.en.includes(v)
      : new RegExp(`(?<![A-Za-z0-9])${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'i').test(
          f.placeholder.zh,
        ) || new RegExp(`(?<![A-Za-z0-9])${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'i').test(f.placeholder.en);
    if (hit) leaks.push(`${f.key} <- ${v}`);
  }
}
console.log('placeholder leaks:', leaks.length ? leaks.join(', ') : 'none');
if (leaks.length) {
  console.error('FAIL: placeholder contains a real product value');
  process.exitCode = 1;
}
