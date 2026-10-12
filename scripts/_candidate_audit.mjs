/** How much of the candidate layer is actually analysable? Counts before spending money on it. */
import { readFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync('apps/web/lib/data/library-candidates.json', 'utf8'));
const rows = Array.isArray(raw) ? raw : raw.rows || raw.items || raw.candidates;

// A name that is just a SKU tells the model nothing; enrichment cannot invent a product from a code.
const SKU_LIKE = /^[A-Z]{2,4}-[A-Z0-9-]+$/i;
const hasRealName = (r) => {
  for (const n of [r.name_cn, r.name_en]) {
    if (typeof n === 'string' && n.trim().length >= 4 && !SKU_LIKE.test(n.trim())) return true;
  }
  return false;
};

const buckets = {
  total: rows.length,
  skuOnly: 0,
  unmappedNoCategory: 0,
  hasDescriptionish: 0,
  hasFunction: 0,
  hasGender: 0,
  hasSecondary: 0,
  analysable: 0,
};

const tagValues = (r) => {
  const out = [];
  const t = r.tags || {};
  const push = (v) => {
    if (Array.isArray(v)) {
      for (const x of v) {
        if (typeof x === 'string') out.push(x);
        else if (x && typeof x === 'object' && typeof x.tag_value === 'string') out.push(x.tag_value);
      }
    } else if (typeof v === 'string' && v.trim().startsWith('[')) {
      // Several tag groups are stored as a JSON string, not an array.
      try {
        for (const x of JSON.parse(v)) if (typeof x === 'string') out.push(x);
      } catch {
        /* leave unparsed values out rather than shipping "[object Object]" into a prompt */
      }
    } else if (typeof v === 'string' && v.trim()) out.push(v);
  };
  push(t.all);
  push(t.category);
  push(t.function);
  push(t.audience);
  push(t.scenario);
  return out;
};

for (const r of rows) {
  const name = hasRealName(r);
  const tags = tagValues(r);
  if (!name) buckets.skuOnly += 1;
  if ((r.inferred_category || '').toLowerCase() === 'unmapped' || !r.inferred_category) buckets.unmappedNoCategory += 1;
  if (r.primary_function || r.description_cn || r.description_en) buckets.hasDescriptionish += 1;
  if (r.primary_function) buckets.hasFunction += 1;
  if (r.target_gender) buckets.hasGender += 1;
  if (r.secondary_category) buckets.hasSecondary += 1;
  if (name && (tags.length || r.primary_function || r.secondary_category || r.target_gender || r.main_material)) buckets.analysable += 1;
}

console.log(JSON.stringify(buckets, null, 2));
const pct = (n) => `${((n / buckets.total) * 100).toFixed(1)}%`;
console.log(`\nsku-only names        : ${buckets.skuOnly} (${pct(buckets.skuOnly)})`);
console.log(`analysable rows       : ${buckets.analysable} (${pct(buckets.analysable)})`);
console.log(`unmapped category     : ${buckets.unmappedNoCategory} (${pct(buckets.unmappedNoCategory)})`);

const sample = rows.filter(hasRealName).slice(0, 3);
for (const r of sample) {
  console.log('\nsample:', JSON.stringify({ id: r.product_id, name_en: r.name_en, name_cn: r.name_cn, cat: r.inferred_category, sec: r.secondary_category, fn: r.primary_function, tags: tagValues(r).slice(0, 6) }).slice(0, 400));
}