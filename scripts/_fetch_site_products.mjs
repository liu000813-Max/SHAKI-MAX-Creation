/**
 * Fetch the real catalogue: every product on shaki.com with its own page facts.
 *
 * This replaces a fabricated 13-row "curated" catalogue. Each row here is traceable to a live
 * product page — id, name, SKU number, the site's own description sentence and its images — so a
 * sales rep can open the link and see the product. Nothing in this file is invented; fields the
 * site does not publish stay empty.
 */
import { writeFileSync } from 'node:fs';

const BASE = 'https://www.shaki.com';
const catalog = JSON.parse(
  await (await import('node:fs/promises')).readFile('scripts/.catalog.json', 'utf8'),
).products;

const stripTags = (s) =>
  s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const alive = async (url) => {
  try {
    const r = await fetch(url, { method: 'GET' });
    return r.status === 200;
  } catch {
    return false;
  }
};

const rows = [];
for (const p of catalog) {
  const url = `${BASE}/products/detail?id=${p.id}`;
  let html = '';
  try {
    const r = await fetch(url);
    html = await r.text();
  } catch {
    rows.push({ ...p, url, error: 'FETCH_FAILED' });
    console.log(`${p.id} ${p.name_cn} — fetch failed`);
    continue;
  }

  // The site's own SKU ("编号") and description sentence ("详情介绍").
  const sku = /编号[:：]\s*([A-Za-z0-9\u4e00-\u9fa5\-_/]+)/.exec(html)?.[1]?.trim() || '';
  const detailBlock = /详情介绍([\s\S]{0,4000}?)(?:探索|品牌故事|服务支持|联系我们|$)/.exec(html)?.[1] || '';
  const detailText = stripTags(detailBlock).slice(0, 400);

  const imgs = [...new Set([...html.matchAll(/\/uploads\/albums\/[^"'\s)]+\.(?:jpg|jpeg|png|webp)/gi)].map((m) => BASE + m[0]))];

  rows.push({
    product_id: `SHAKI-${String(p.id).padStart(4, '0')}`,
    site_id: p.id,
    url,
    name_cn: p.name_cn,
    sku: sku || '',
    detail_cn: detailText,
    images: imgs,
  });
  console.log(`${p.id} ${p.name_cn}${sku ? ` [${sku}]` : ' [无编号]'}${detailText ? ` — ${detailText.slice(0, 40)}…` : ' [无详情]'} (${imgs.length} img)`);
}

writeFileSync('scripts/.site-products.json', JSON.stringify({ at: new Date().toISOString(), rows }, null, 0));
console.log(`\nwrote scripts/.site-products.json (${rows.length} rows)`);
console.log('with SKU:', rows.filter((r) => r.sku).length, '| with description:', rows.filter((r) => r.detail_cn).length);