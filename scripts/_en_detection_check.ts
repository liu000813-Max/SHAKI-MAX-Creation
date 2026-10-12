/**
 * The real question: does an English buyer site actually get understood?
 *
 * Fetches live overseas sites through the deployed service, then pushes the returned facts through
 * the real analyser. The "detected as 男用" scare came from feeding it SHAKI's own Chinese site —
 * foreign buyers are the actual input, so this is the input that matters.
 */
import { writeFileSync } from 'node:fs';
import { analyzeClient } from '../apps/web/lib/matching';

const ENDPOINT = 'https://shaki-crawl-324840-10-1439317540.sh.run.tcloudbase.com';

const SITES = [
  { url: 'https://www.lelo.com', label: 'LELO 瑞典高端品牌' },
  { url: 'https://www.durex.com', label: 'Durex 全球品牌（可能超时）' },
  { url: 'https://example.com', label: 'example.com（对照：空内容）' },
];

const fetchFacts = async (url) => {
  const res = await fetch(`${ENDPOINT}/crawl`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    return { ok: false, error: { code: `GATEWAY_${res.status}`, message: raw.slice(0, 80) } };
  }
};

const saved = {};

async function main() {
for (const site of SITES) {
  console.log(`\n=== ${site.label}`);
  const j = await fetchFacts(site.url);
  if (!j.ok) {
    console.log(`  fetch failed: ${j.error.code} — ${j.error.message}`);
    continue;
  }
  saved[site.url] = j;
  console.log(`  title: ${j.title}`);
  console.log(`  http ${j.httpStatus} · ${j.textChars} chars`);

  const profile = analyzeClient(
    {
      categories: '',
      website: site.url,
      socialLinks: [],
      market: '',
      businessType: '',
      goal: '',
    },
    'en',
    j,
  );

  console.log(`  -> name: ${profile.name}`);
  console.log(`  -> categories: ${profile.mainCategories.join(', ')}`);
  console.log(`  -> style: ${profile.visualStyle.join(', ') || '(none)'}`);
  console.log(`  -> price: ${profile.pricePosition} | market: ${profile.market || '(none)'} | audience: ${profile.targetAudience || '(none)'}`);
  console.log(`  -> confidence: ${profile.confidence} | evidence: ${profile.websiteEvidence ? `HTTP ${profile.websiteEvidence.httpStatus}, ${profile.websiteEvidence.textChars} chars` : 'none'}`);
}

writeFileSync('scripts/.en-site-facts.json', JSON.stringify(saved, null, 0));
console.log('\nsaved facts: scripts/.en-site-facts.json');
}

main();