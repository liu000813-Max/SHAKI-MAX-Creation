/**
 * Build the full real catalogue from the English site (~1400 products).
 *
 * Long-running, so it is resumable: fetched pages and enrichment results are written to disk as they
 * arrive, and a rerun picks up where it stopped. Without that, a proxy timeout 20 minutes in would
 * throw away the whole crawl.
 *
 * Two sources are kept apart, and the distinction matters more than anything else here:
 *   site — verbatim from the product page (name, model, material, size, weight, function, charging)
 *   ai   — written by the model, kept only because the service's evidence gate verified a quoted span
 * Neither is allowed to invent a field; anything the page does not publish stays empty.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASE = 'https://www.shaki.com';
const ENDPOINT = 'https://shaki-crawl-324840-10-1439317540.sh.run.tcloudbase.com';
const STORE = 'scripts/.en-catalog-raw.json';
const WORKERS = 5;
const ENRICH_PARALLEL = 2;

const strip = (s) =>
  s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#43;/g, '+').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const LABELS = ['Material', 'Size', 'Weight', 'Function description', 'Charging mode'];

function spec(t, label) {
  const stops = [...LABELS, 'Product Details', 'Request a Quote', 'Model:'].map((l) => l.replace(/ /g, '\\s')).join('|');
  const m = t.match(new RegExp(`(?:^|\\s)${label.replace(/ /g, '\\s')}[:\\s]\\s*([\\s\\S]*?)(?=(?:${stops})[:\\s]|Skin resonance|Explore|Service Support|Contact)`, 'i'));
  return m ? m[1].trim() : '';
}

function parseEn(html, id) {
  const t = strip(html);
  const nameEn = (/<p class="prod_subtit">([^<]+)<\/p>/.exec(html) || [])[1] || '';
  const model = (t.match(/Model:\s*([A-Za-z0-9\-_/]+)/) || [])[1] || '';
  const v = {
    main_material: spec(t, 'Material'),
    size: spec(t, 'Size'),
    weight: spec(t, 'Weight'),
    function_en: spec(t, 'Function description'),
    charging: spec(t, 'Charging mode'),
  };
  const source_text = [nameEn, model, v.main_material, v.size, v.weight, v.function_en, v.charging].filter(Boolean).join(' | ');
  return { product_id: `SHAKI-EN-${id}`, site_id: id, url: `${BASE}/en/products/detail?id=${id}`, name_en: nameEn, model, ...v, source_text };
}

/** One GET with a real timeout and a retry; the default 10 s connect timeout is not enough here. */
async function get(url, attempt = 1) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(35000) });
    return await res.text();
  } catch {
    if (attempt >= 3) return '';
    await new Promise((r) => setTimeout(r, 1200 * attempt));
    return get(url, attempt + 1);
  }
}

const save = (rows, results) => writeFileSync(STORE, JSON.stringify({ at: new Date().toISOString(), rows, results }));

// ── listing: every product id the English site publishes ──────────────────────────────────────
let allIds = [];
{
  const first = await get(`${BASE}/en/products`);
  const pages = Math.max(1, ...[...first.matchAll(/page=(\d+)/g)].map((m) => Number(m[1])));
  const ids = new Set([...first.matchAll(/detail\?id=(\d+)/g)].map((m) => Number(m[1])));
  for (let p = 2; p <= pages; p += 1) {
    const html = await get(`${BASE}/en/products?page=${p}`);
    for (const m of html.matchAll(/detail\?id=(\d+)/g)) ids.add(Number(m[1]));
    if (p % 20 === 0) console.log(`  listing page ${p}/${pages} — ${ids.size} ids`);
  }
  allIds = [...ids];
  console.log(`listing: ${pages} pages, ${allIds.length} ids`);
}

// ── resume ──────────────────────────────────────────────────────────────────────────────────
let rows = [];
let results = [];
if (existsSync(STORE)) {
  try {
    const prev = JSON.parse(readFileSync(STORE, 'utf8'));
    const want = new Set(allIds);
    rows = (prev.rows || []).filter((r) => want.has(r.site_id));
    results = (prev.results || []).filter((r) => rows.some((x) => x.product_id === r.product_id));
    console.log(`resuming: ${rows.length} rows, ${results.length} enriched already on disk`);
  } catch {
    /* a corrupt partial file is not worth keeping */
  }
}
const have = new Set(rows.map((r) => r.site_id));
const todo = allIds.filter((id) => !have.has(id));
console.log(`to fetch: ${todo.length}`);

// ── detail pages ─────────────────────────────────────────────────────────────────────────────
let cursor = 0;
let sinceSave = 0;
const worker = async () => {
  while (cursor < todo.length) {
    const id = todo[cursor++];
    const html = await get(`${BASE}/en/products/detail?id=${id}`);
    if (!html) continue;
    const p = parseEn(html, id);
    if (!p.name_en && !p.model) continue;
    rows.push(p);
    sinceSave += 1;
    if (sinceSave >= 100) {
      sinceSave = 0;
      save(rows, results);
      process.stdout.write(`\r  fetched ${rows.length}/${allIds.length}`);
    }
  }
};
await Promise.all(Array.from({ length: WORKERS }, worker));
rows.sort((a, b) => a.site_id - b.site_id);
save(rows, results);
console.log(`\nfetched: ${rows.length}/${allIds.length} (${allIds.length - rows.length} unreachable)`);

// ── enrichment ────────────────────────────────────────────────────────────────────────────────
async function enrich(batch) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await fetch(`${ENDPOINT}/ai/enrich`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rows: batch }),
    });
    const raw = await res.text();
    let json = null;
    try { json = JSON.parse(raw); } catch { json = null; }
    if (json && json.ok) return json.results;
    if (attempt === 3) return [];
    await new Promise((r) => setTimeout(r, 2500 * attempt));
  }
  return [];
}

const toEnrich = rows.filter((r) => !results.some((x) => x.product_id === r.product_id));
console.log(`to enrich: ${toEnrich.length}`);
await fetch(`${ENDPOINT}/health`).catch(() => {});

const batches = [];
for (let i = 0; i < toEnrich.length; i += 8) batches.push(toEnrich.slice(i, i + 8));
for (let i = 0; i < batches.length; i += ENRICH_PARALLEL) {
  const group = batches.slice(i, i + ENRICH_PARALLEL);
  const settled = await Promise.all(
    group.map((b) =>
      enrich(b.map((r) => ({
        product_id: r.product_id,
        name_en: r.name_en,
        name_cn: null,
        inferred_category: null,
        secondary_category: null,
        target_gender: null,
        main_material: r.main_material,
        primary_function: r.function_en,
        tags: { all: [r.model, r.size, r.weight, r.charging].filter(Boolean) },
      }))),
    ),
  );
  for (const s of settled) results.push(...s);
  if (i % 16 === 0) {
    save(rows, results);
    process.stdout.write(`\r  enriched ${results.length}/${rows.length}`);
  }
}
save(rows, results);

const tally = {};
for (const r of results) for (const k of Object.keys(r.fields || {})) tally[k] = (tally[k] || 0) + 1;
console.log(`\nenriched: ${results.length}/${rows.length}`);
console.log('field tally:', Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));
console.log(`written: ${STORE}`);