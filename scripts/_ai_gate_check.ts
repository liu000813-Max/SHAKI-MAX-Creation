/**
 * Does AI enrichment actually get a crawled row over the scoring gate?
 *
 * Answers the only question that matters: after the model fills what it can, is the row eligible?
 * A row that stays under 75% is not a smaller win — it is a row the engine will still refuse, and
 * the honest move is to say so rather than lower the gate.
 */
import { readFileSync } from 'node:fs';
import { computeCompleteness } from '../apps/web/lib/data/brand';
import { MATCHING_CONFIG } from '../apps/web/lib/config/matching';

const enriched = JSON.parse(readFileSync(process.argv[2] || 'scripts/.ai-enriched-probe2.json', 'utf8'));
const rows = JSON.parse(readFileSync('apps/web/lib/data/library-candidates.json', 'utf8'));
const list = Array.isArray(rows) ? rows : rows.rows || rows.items || rows.candidates;
const byId = new Map(list.map((r) => [r.product_id, r]));

const results = Object.values(enriched.results || {}).filter((r) => r.ok && Object.keys(r.fields || {}).length);
console.log(`enriched rows: ${results.length} | gate: ${MATCHING_CONFIG.gate ?? MATCHING_CONFIG.dataCompletenessGate ?? 75}\n`);

const dist = [];
for (const r of results) {
  const src = byId.get(r.product_id) || {};
  const f = r.fields || {};
  // What a promoted row would actually carry: the crawled values verbatim plus what the model
  // could ground. Nothing is invented here beyond what the service returned.
  const merged = {
    product_id: src.product_id,
    sku: src.sku,
    product_name_cn: f.product_name_cn || src.name_cn || '',
    product_name_en: src.name_en && !/^[A-Z]{2,4}-[A-Z0-9-]+$/i.test(src.name_en) ? src.name_en : '',
    primary_category: f.primary_category || (src.inferred_category !== 'Unmapped' ? src.inferred_category : ''),
    secondary_category: src.secondary_category || '',
    description_cn: f.description_cn || '',
    key_selling_point_cn: f.key_selling_point_cn || '',
    primary_function: src.primary_function || '',
    target_gender: src.target_gender || '',
    target_age: f.target_age || '',
    target_segment: f.target_segment || '',
    design_style: f.design_style || '',
    visual_style: f.visual_style || '',
    main_material: src.main_material || '',
    price_level: f.price_level || '',
    target_market: f.target_market && f.target_market.length ? f.target_market : [],
    product_status: f.product_status || '',
    oem_available: true,
    ai_scores: null,
  };
  const pct = computeCompleteness(merged);
  dist.push({ id: r.product_id, name: merged.product_name_cn, pct });
}

dist.sort((a, b) => b.pct - a.pct);
for (const d of dist) console.log(`  ${String(d.pct).padStart(3)}%  ${d.name || d.id}`);
const best = dist[0]?.pct ?? 0;
const eligible = dist.filter((d) => d.pct >= 75).length;
console.log(`\nbest: ${best}% | rows at or over 75: ${eligible}/${dist.length}`);
console.log(best >= 75 ? '\nthese rows can enter the scoring pool' : '\nstill short of the gate — the missing data is not in the source, so no amount of AI will invent it');