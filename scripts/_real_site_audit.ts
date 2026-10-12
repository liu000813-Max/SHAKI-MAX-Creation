/**
 * Real customer sites, end to end: fetch → analyse → recommend, and show WHY.
 *
 * Keyword dictionaries are where silent errors live: a category detected from the wrong word looks
 * exactly like one detected correctly until a rep sends a vibrator to a BDSM buyer. So this prints
 * the evidence that produced each category, not just the verdict.
 */
import { writeFileSync } from 'node:fs';
import { analyzeClient, runEngine } from '../apps/web/lib/matching';
import { categoryNames } from '../apps/web/lib/data/products';
import type { SiteFacts } from '../apps/web/lib/types';

const ENDPOINT = 'https://shaki-crawl-324840-10-1439317540.sh.run.tcloudbase.com';
const SITES = ['https://calexotics.com/', 'https://www.nobutoys.com/'];

async function fetchFacts(url: string): Promise<SiteFacts | null> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await fetch(`${ENDPOINT}/crawl`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const raw = await res.text();
    let json: any = null;
    try { json = JSON.parse(raw); } catch { json = null; }
    if (json && json.ok) return json as SiteFacts;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 2500 * attempt));
  }
  return null;
}

const out: Record<string, unknown> = {};

async function main() {
for (const url of SITES) {
  console.log(`\n${'='.repeat(72)}\n${url}`);
  const facts = await fetchFacts(url);
  if (!facts) {
    console.log('  fetch failed (all attempts)');
    continue;
  }
  console.log(`  title: ${facts.title}`);
  console.log(`  http ${facts.httpStatus} · ${facts.textChars} chars`);

  const client = analyzeClient(
    { website: url, socialLinks: facts.socialLinks ?? [], categories: '', market: '', businessType: '' },
    'en',
    facts,
  );

  console.log(`\n  detected categories: ${client.mainCategories.map((c) => categoryNames[c]?.en ?? c).join(' / ') || '(none)'}`);
  console.log(`  market: ${client.market} | price: ${client.pricePosition} | style: ${client.visualStyle.join('/') || '-'}`);
  console.log(`  audience: ${client.targetAudience || '-'} | confidence: ${client.confidence}`);
  console.log(`  evidence: ${JSON.stringify(client.websiteEvidence)}`);
  console.log(`  positioning: ${JSON.stringify(client.brandPositioning)}`);

  // Which words actually drove the category decision?
  const hay = `${facts.title} ${facts.siteName} ${facts.description} ${facts.metaKeywords} ${(facts.headings ?? []).join(' ')} ${facts.text}`.toLowerCase();
  const probes: Record<string, string[]> = {
    FEMALE: ['vibrator', 'vibrators', 'dildo', 'clitoral', 'vaginal', 'women', 'female'],
    MALE: ['masturbator', 'stroker', 'cock', 'penis', 'male', 'men'],
    COUPLES: ['couples', 'wedding', 'anniversary', 'long distance', 'remote', 'partner'],
    BDSM: ['bdsm', 'bondage', 'restraint', 'collar', 'cuffs', 'whip', 'fetish', 'dominatrix', 'submission', 'rope'],
    WATER_BASED: ['lube', 'lubricant', 'oil', 'massage', 'wax', 'cleaner', 'hygiene', 'care', 'spray'],
  };
  const hitLines: string[] = [];
  for (const [code, words] of Object.entries(probes)) {
    const hits = words.filter((w) => hay.includes(w));
    if (hits.length) hitLines.push(`    ${code}: ${hits.join(', ')}`);
  }
  console.log(`  keyword hits on fetched text:\n${hitLines.join('\n') || '    (none)'}`);

  const run = runEngine(client, 'en');
  const curated = run.recommendations.filter((r) => r.curationSlot != null).sort((a, b) => (a.curationSlot ?? 0) - (b.curationSlot ?? 0));
  console.log(`\n  Top ${curated.length} (topFit ${run.topFit}, limited ${run.limitedMatch}, noStock ${run.noProductsInClientCategories}):`);
  for (const r of curated) {
    const onCat = client.mainCategories.includes(r.product.primary_category);
    console.log(`   ${r.curationSlot} ${onCat ? ' ' : '!'} ${r.product.short_name.slice(0, 32).padEnd(32)} ${r.product.primary_category.padEnd(11)} form=${(r.product.secondary_category || '').slice(0, 18).padEnd(18)} fit=${r.fitScore} catFit=${r.dimensionScores.categoryFit}`);
  }
  const onCatN = curated.filter((r) => client.mainCategories.includes(r.product.primary_category)).length;
  console.log(`  in-category: ${onCatN}/${curated.length}`);

  out[url] = {
    title: facts.title,
    textChars: facts.textChars,
    categories: client.mainCategories,
    market: client.market,
    price: client.pricePosition,
    style: client.visualStyle,
    audience: client.targetAudience,
    confidence: client.confidence,
    evidence: client.websiteEvidence,
    topFit: run.topFit,
    limitedMatch: run.limitedMatch,
    noStock: run.noProductsInClientCategories,
    inCategory: `${onCatN}/${curated.length}`,
    curated: curated.map((r) => ({
      slot: r.curationSlot,
      name: r.product.short_name,
      category: r.product.primary_category,
      form: r.product.secondary_category,
      fit: r.fitScore,
      catFit: r.dimensionScores.categoryFit,
    })),
  };
}

writeFileSync('scripts/.real-sites.json', JSON.stringify({ at: new Date().toISOString(), sites: out }, null, 0));
console.log('\nwritten: scripts/.real-sites.json');
}

main();