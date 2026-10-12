/**
 * Batch AI enrichment over the crawled candidate rows, run offline against the deployed service.
 *
 * Why a script and not a button: a 200-row run costs money and takes minutes, so it has to be
 * re-runnable, resumable and inspectable before any of it reaches the catalog. The script writes
 * every result — including which fields were dropped and why — to a JSON file next to the data.
 *
 * It does NOT write into the app. Adoption is a separate, human step: the point of the evidence
 * gate is that a PM can see what the model claimed before it becomes a catalog attribute.
 *
 * Usage:
 *   node scripts/ai_enrich_batch.mjs --limit 200 --out scripts/.ai-enriched.json
 *   node scripts/ai_enrich_batch.mjs --limit 200 --resume scripts/.ai-enriched.json
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const ENDPOINT = argOf('endpoint', 'https://shaki-crawl-324840-10-1439317540.sh.run.tcloudbase.com');
const LIMIT = Number(argOf('limit', 200));
const OUT = argOf('out', 'scripts/.ai-enriched.json');
const BATCH = 8; // the service's own per-call ceiling
const CANDIDATES = 'apps/web/lib/data/library-candidates.json';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const raw = JSON.parse(readFileSync(CANDIDATES, 'utf8'));
  const rows = Array.isArray(raw) ? raw : raw.rows || raw.items || raw.candidates || [];
  if (!rows.length) throw new Error(`no candidate rows found in ${CANDIDATES}`);

// A name that is just a SKU tells the model nothing, and enrichment cannot invent a product from a
// code. Rows like that are reported, not spent on.
const SKU_LIKE = /^[A-Z]{2,4}-[A-Z0-9-]+$/i;
const hasRealName = (r) =>
  [r.name_cn, r.name_en].some((n) => typeof n === 'string' && n.trim().length >= 3 && !SKU_LIKE.test(n.trim()));

const named = rows.filter(hasRealName);
const skuOnly = rows.length - named.length;
const ordered = args.includes('--named-only')
  ? named
  : [
      ...named, // richest rows first: a name plus tags/function is where a model can actually help
      ...rows.filter((r) => !hasRealName(r)),
    ];

const usable = ordered.filter((r) =>
  [r.name_en, r.name_cn, r.secondary_category, r.primary_function, r.main_material, r.target_gender]
    .filter(Boolean)
    .join(' ')
    .trim().length >= 8
);
const batchRows = usable.slice(0, LIMIT);
console.log(`candidates: ${rows.length} | with a real name: ${named.length} | sku-only (unenrichable): ${skuOnly}`);
console.log(`taking: ${batchRows.length}`);

  let done = {};
  if (args.includes('--resume') && existsSync(OUT)) {
    try {
      done = JSON.parse(readFileSync(OUT, 'utf8')).results || {};
      console.log(`resuming: ${Object.keys(done).length} already done`);
    } catch {
      done = {};
    }
  }

  const results = { ...done };
  let calls = 0;
  let failures = 0;

  for (let i = 0; i < batchRows.length; i += BATCH) {
    const slice = batchRows.slice(i, i + BATCH).filter((r) => !results[r.product_id]);
    if (!slice.length) continue;
    const payload = {
      rows: slice.map((r) => ({
        product_id: r.product_id,
        name_en: r.name_en,
        name_cn: r.name_cn,
        inferred_category: r.inferred_category,
        secondary_category: r.secondary_category,
        target_gender: r.target_gender,
        main_material: r.main_material,
        primary_function: r.primary_function,
        tags: r.tags || {},
      })),
    };

    let json;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        calls += 1;
        const res = await fetch(`${ENDPOINT}/ai/enrich`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        json = await res.json();
        if (!json.ok) throw new Error(`${json.error && json.error.code}`);
        break;
      } catch (err) {
        if (attempt === 3) {
          failures += slice.length;
          for (const r of slice) results[r.product_id] = { product_id: r.product_id, ok: false, error: String(err.message || err) };
          console.log(`  batch @${i} failed after 3 attempts: ${err.message || err}`);
          break;
        }
        // Rate limits and cold starts are transient; back off and retry rather than losing rows.
        await sleep(1500 * attempt);
      }
    }
    if (json && json.ok) for (const r of json.results) results[r.product_id] = r;

    if ((i / BATCH) % 5 === 0) {
      writeFileSync(OUT, JSON.stringify({ endpoint: ENDPOINT, at: new Date().toISOString(), results }, null, 0));
      process.stdout.write(`  ${Math.min(i + BATCH, batchRows.length)}/${batchRows.length}\r`);
    }
  }

  writeFileSync(OUT, JSON.stringify({ endpoint: ENDPOINT, at: new Date().toISOString(), results }, null, 0));

  // ── summary: what actually survived the evidence gate ──────────────────────────────────────
  const all = Object.values(results);
  const ok = all.filter((r) => r.ok);
  const filled = ok.filter((r) => Object.keys(r.fields || {}).length > 0);
  const fieldTally = {};
  const dropTally = {};
  for (const r of filled) {
    for (const k of Object.keys(r.fields)) fieldTally[k] = (fieldTally[k] || 0) + 1;
    for (const [k, why] of Object.entries(r.omitted || {})) {
      const reason = String(why).split(':')[0];
      dropTally[k] = dropTally[k] || {};
      dropTally[k][reason] = (dropTally[k][reason] || 0) + 1;
    }
  }
  console.log(`\ncalls: ${calls} | ok: ${ok.length} | with fields: ${filled.length} | failed: ${all.filter((r) => !r.ok).length} | hard failures: ${failures}`);
  console.log('\nfields kept (of ' + filled.length + ' rows):');
  for (const [k, v] of Object.entries(fieldTally).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(24)} ${v}`);
  console.log('\nfields dropped:');
  for (const [k, reasons] of Object.entries(dropTally).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0))) {
    console.log(`  ${k.padEnd(24)} ${Object.entries(reasons).map(([r, n]) => `${r}×${n}`).join(' ')}`);
  }
  console.log(`\nwritten: ${OUT}`);
}

main().catch((e) => {
  console.error('BATCH ERROR', e);
  process.exit(1);
});