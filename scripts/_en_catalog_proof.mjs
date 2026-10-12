/**
 * EN catalogue proof: can a real English product page clear the completeness gate?
 *
 * The English site carries what the Chinese one does not — English name, model number, and specs
 * with real values (material, size, weight, function, charging). Those are exactly the attributes
 * the gate samples. Price band and market are left empty on purpose: those are company knowledge,
 * not something a model may infer from a product page.
 */
import { writeFileSync } from 'node:fs';

const BASE = 'https://www.shaki.com';
const ENDPOINT = 'https://shaki-crawl-324840-10-1439317540.sh.run.tcloudbase.com';
const LIMIT = Number(process.argv[2] || 10);

const strip = (s) =>
  s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#43;/g, '+')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const LABELS = ['Material', 'Size', 'Weight', 'Function description', 'Charging mode'];

/** Spec values run until the next label or the page furniture; without the second terminator a
 *  three-spec product runs its material value into the brand slogan, which then becomes "evidence". */
function spec(t, label) {
  const stops = [...LABELS, 'Product Details', 'Request a Quote', 'Model:'].map((l) => l.replace(/ /g, '\\s')).join('|');
  const re = new RegExp(
    `(?:^|\\s)${label.replace(/ /g, '\\s')}[:\\s]\\s*([\\s\\S]*?)(?=(?:${stops})[:\\s]|Skin resonance|Explore|Service Support|Contact)`,
    'i',
  );
  const m = t.match(re);
  return m ? m[1].trim() : '';
}

function parseEn(html, id) {
  const t = strip(html);
  const nameEn = (/<p class="prod_subtit">([^<]+)<\/p>/.exec(html) || [])[1] || '';
  const model = (t.match(/Model:\s*([A-Za-z0-9\-_/]+)/) || [])[1] || '';
  const values = {
    main_material: spec(t, 'Material'),
    size: spec(t, 'Size'),
    weight: spec(t, 'Weight'),
    function_en: spec(t, 'Function description'),
    charging: spec(t, 'Charging mode'),
  };
  const source_text = [nameEn.trim(), model, values.main_material, values.size, values.weight, values.function_en, values.charging]
    .filter(Boolean)
    .join(' | ');
  return { product_id: `SHAKI-EN-${id}`, site_id: id, url: `${BASE}/en/products/detail?id=${id}`, name_en: nameEn.trim(), model, ...values, source_text };
}

async function listingIds() {
  const first = await (await fetch(`${BASE}/en/products`)).text();
  const ids = new Set([...first.matchAll(/detail\?id=(\d+)/g)].map((m) => Number(m[1])));
  return [...ids].slice(0, LIMIT);
}

/** The fetcher scales to zero, so the first call after idle can return a gateway error page. */
async function enrich(batch) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await fetch(`${ENDPOINT}/ai/enrich`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rows: batch }),
    });
    const raw = await res.text();
    let json = null;
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
    if (json && json.ok) return json;
    if (attempt === 3) return { ok: false, results: [], error: json && json.error ? json.error : { code: `HTTP_${res.status}` } };
    await new Promise((r) => setTimeout(r, 2500 * attempt));
  }
  return { ok: false, results: [] };
}

const ids = await listingIds();
const rows = [];
for (const id of ids) {
  try {
    const html = await (await fetch(`${BASE}/en/products/detail?id=${id}`)).text();
    const p = parseEn(html, id);
    if (!p.source_text) continue;
    rows.push(p);
    console.log(`#${id} ${p.name_en || '(no name)'} [${p.model}]`);
    console.log(`    material=${p.main_material || '-'} | size=${(p.size || '-').slice(0, 40)} | weight=${p.weight || '-'}`);
    console.log(`    fn=${(p.function_en || '-').slice(0, 80)}`);
  } catch (e) {
    console.log(`#${id} failed: ${e.message}`);
  }
}
writeFileSync('scripts/.en-products-sample.json', JSON.stringify(rows, null, 0));
console.log(`\nfetched ${rows.length} with data`);

await fetch(`${ENDPOINT}/health`).catch(() => {});
const results = [];
for (let i = 0; i < rows.length; i += 8) {
  const batch = rows.slice(i, i + 8).map((r) => ({
    product_id: r.product_id,
    name_en: r.name_en,
    name_cn: null,
    inferred_category: null,
    secondary_category: null,
    target_gender: null,
    main_material: r.main_material,
    primary_function: r.function_en,
    tags: { all: [r.model, r.size, r.weight, r.charging].filter(Boolean) },
  }));
  const j = await enrich(batch);
  if (!j.ok) {
    console.log(`enrich failed: ${j.error && j.error.code}`);
    continue;
  }
  results.push(...j.results);
}
writeFileSync('scripts/.en-products-enriched.json', JSON.stringify(results, null, 0));
console.log(`enriched: ${results.length}\n`);

const byId = new Map(rows.map((r) => [r.product_id, r]));
for (const r of results) {
  const src = byId.get(r.product_id);
  const kept = Object.keys(r.fields || {});
  console.log(`${src ? src.name_en : r.product_id} — kept ${kept.length}: ${kept.join(', ')}`);
  for (const [k, v] of Object.entries(r.fields || {})) console.log(`    ${k}: ${String(v).slice(0, 90)}`);
  const dropped = Object.entries(r.omitted || {}).filter(([, w]) => String(w).startsWith('no_evidence'));
  if (dropped.length) console.log(`    refused (no evidence): ${dropped.map(([k]) => k).join(', ')}`);
  console.log('');
}