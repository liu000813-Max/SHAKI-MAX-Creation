/**
 * Authoritative catalogue from shaki.com: id + product name for every product page.
 *
 * The 1439 crawled candidate rows carry only SKUs, which is why they read as "virtual products".
 * The site's own listing carries the real name next to each id, so this file is the ground truth
 * for what is allowed to appear in a recommendation.
 *
 * Names live in the hero image's alt attribute, paired with the product link in the same anchor:
 *   <a class="product-image" href="/products/detail?id=1417"><img ... alt="拾光·初">
 */
import { writeFileSync } from 'node:fs';

const BASE = 'https://www.shaki.com';
const out = [];

// First page tells us how many pages exist; the pager renders one link per page.
const first = await (await fetch(`${BASE}/products`)).text();
const pages = Math.max(1, ...[...first.matchAll(/page=(\d+)/g)].map((m) => Number(m[1])));
console.log(`pages: ${pages}`);

const pairs = (html) => {
  const found = [];
  // Walk the anchors, then take the alt of the image inside each one.
  const re = /href="\/products\/detail\?id=(\d+)"[\s\S]{0,400}?alt="([^"]*)"/g;
  let m;
  while ((m = re.exec(html)) !== null) found.push({ id: Number(m[1]), name_cn: m[2].trim() });
  return found;
};

out.push(...pairs(first));
for (let p = 2; p <= pages; p += 1) {
  const html = await (await fetch(`${BASE}/products?page=${p}`)).text();
  out.push(...pairs(html));
  console.log(`  page ${p}/${pages}`);
}

const unique = [...new Map(out.map((r) => [r.id, r])).values()].sort((a, b) => a.id - b.id);
writeFileSync('scripts/.catalog.json', JSON.stringify({ source: `${BASE}/products`, at: new Date().toISOString(), products: unique }, null, 0));
console.log(`\nproducts: ${unique.length}`);
for (const p of unique) console.log(`  ${p.id}\t${p.name_cn}`);