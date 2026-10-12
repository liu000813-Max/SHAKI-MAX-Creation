/**
 * Map every English product id to its listing image.
 *
 * The detail pages carry no <img> at all; the photo sits on the listing card, under
 * /storage/images/... (a different path from the Chinese site's /uploads/albums/..., and unlike it
 * these are still being served). So the mapping has to be harvested from the 117 listing pages,
 * pairing each product link with the image inside the same card.
 *
 * Written to scripts/.en-images.json so the catalogue generator can embed a real photo per row.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = 'https://www.shaki.com';

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

const first = await get(`${BASE}/en/products`);
const pages = Math.max(1, ...[...first.matchAll(/page=(\d+)/g)].map((m) => Number(m[1])));
console.log(`listing pages: ${pages}`);

/** Each card is an anchor to the detail page with the photo inside it. */
const pairs = (html) => {
  const out = [];
  const re = /<a[^>]+href="\/en\/products\/detail\?id=(\d+)"[\s\S]{0,600}?<img[^>]+src="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const src = m[2].startsWith('http') ? m[2] : BASE + m[2];
    out.push({ id: Number(m[1]), image: src });
  }
  return out;
};

const map = new Map();
for (const p of pairs(first)) map.set(p.id, p.image);
for (let i = 2; i <= pages; i += 1) {
  const html = await get(`${BASE}/en/products?page=${i}`);
  for (const p of pairs(html)) map.set(p.id, p.image);
  if (i % 20 === 0) console.log(`  page ${i}/${pages} — ${map.size} mapped`);
}

const { rows } = JSON.parse(readFileSync('scripts/.en-catalog-raw.json', 'utf8'));
const covered = rows.filter((r) => map.has(r.site_id)).length;
writeFileSync('scripts/.en-images.json', JSON.stringify({ at: new Date().toISOString(), images: Object.fromEntries(map) }, null, 0));

console.log(`\nmapped ids: ${map.size}`);
console.log(`catalogue rows with an image: ${covered}/${rows.length} (${((covered / rows.length) * 100).toFixed(1)}%)`);
console.log('written: scripts/.en-images.json');
for (const [id, url] of [...map.entries()].slice(0, 5)) console.log(`  ${id} ${url}`);