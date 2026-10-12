/**
 * Build the real scoring catalogue from the English site.
 *
 * Three sources, kept separate on purpose:
 *   site    — copied verbatim from the product page (name, model, material, size, weight, function)
 *   ai      — written by the model, kept only when the evidence gate verified a quoted span
 *   policy  — company knowledge, supplied by the PM, never inferred
 *
 * The PM decided the four positioning fields (target age, target segment, design style, visual
 * style) are not worth inventing, so they stay empty and the completeness ceiling is what it is.
 * That ceiling is reported honestly rather than papered over.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = 'https://www.shaki.com';
const ENDPOINT = 'https://shaki-crawl-324840-10-1439317540.sh.run.tcloudbase.com';
const TARGET = Number(process.argv[2] || 120);

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


/** One GET with a real timeout and a retry. The default 10 s connect timeout is not enough when
 *  several workers hit the same host, and a single dropped page must not abort the crawl. */
async function get(url, attempt = 1) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    return await res.text();
  } catch (err) {
    if (attempt >= 3) return '';
    await new Promise((r) => setTimeout(r, 1200 * attempt));
    return get(url, attempt + 1);
  }
}

// ── 1. listing pages ────────────────────────────────────────────────────────────────────────
async function listingIds() {
  const first = await get(`${BASE}/en/products`);
  const pages = Math.max(1, ...[...first.matchAll(/page=(\d+)/g)].map((m) => Number(m[1])));
  console.log(`listing pages: ${pages}`);
  const ids = new Set([...first.matchAll(/detail\?id=(\d+)/g)].map((m) => Number(m[1])));
  for (let p = 2; p <= pages; p += 1) {
    const html = await get(`${BASE}/en/products?page=${p}`);
    for (const m of html.matchAll(/detail\?id=(\d+)/g)) ids.add(Number(m[1]));
    if (ids.size >= TARGET * 1.3) break;
  }
  return [...ids].slice(0, Math.round(TARGET * 1.35));
}

// ── 2. detail pages, in parallel ────────────────────────────────────────────────────────────
async function fetchDetails(ids) {
  const out = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try {
        const html = await get(`${BASE}/en/products/detail?id=${id}`);
        if (!html) continue;
        const p = parseEn(html, id);
        if (p.name_en || p.model) out.push(p);
      } catch {
        /* one unreachable page must not stop the batch */
      }
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  return out.sort((a, b) => a.site_id - b.site_id);
}

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
    if (json && json.ok) return json;
    if (attempt === 3) return null;
    await new Promise((r) => setTimeout(r, 2500 * attempt));
  }
  return null;
}

const ids = await listingIds();
console.log(`ids: ${ids.length} — fetching details…`);
const rows = (await fetchDetails(ids)).slice(0, TARGET);
console.log(`parsed: ${rows.length}`);

await fetch(`${ENDPOINT}/health`).catch(() => {});
const results = [];
for (let i = 0; i < rows.length; i += 8) {
  const j = await enrich(rows.slice(i, i + 8).map((r) => ({
    product_id: r.product_id,
    name_en: r.name_en,
    name_cn: null,
    inferred_category: null,
    secondary_category: null,
    target_gender: null,
    main_material: r.main_material,
    primary_function: r.function_en,
    tags: { all: [r.model, r.size, r.weight, r.charging].filter(Boolean) },
  })));
  if (j) results.push(...j.results);
  process.stdout.write(`\r  enriched ${Math.min(i + 8, rows.length)}/${rows.length}`);
}
console.log('');

writeFileSync('scripts/.en-catalog-raw.json', JSON.stringify({ at: new Date().toISOString(), rows, results }, null, 0));

const kept = results.filter((r) => r.ok && Object.keys(r.fields || {}).length).length;
const tally = {};
for (const r of results) for (const k of Object.keys(r.fields || {})) tally[k] = (tally[k] || 0) + 1;
console.log(`\nrows with AI fields: ${kept}/${results.length}`);
console.log('field tally:', Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));
console.log(`written: scripts/.en-catalog-raw.json`);