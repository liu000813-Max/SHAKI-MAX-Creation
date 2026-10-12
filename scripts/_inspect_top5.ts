/** What does the curated Top 5 actually look like when the category cap is violated? */
import { analyzeClient, generateRecommendations } from '../apps/web/lib/matching';
import { MATCHING_CONFIG } from '../apps/web/lib/config/matching';

console.log('sameCategoryTop5Limit =', MATCHING_CONFIG.thresholds.sameCategoryTop5Limit);
console.log('samePriceTop5Limit   =', MATCHING_CONFIG.thresholds.samePriceTop5Limit);

const profiles = [
  { label: 'female boutique, US', input: { categories: 'FEMALE', website: '', socialLinks: [], market: 'US', businessType: 'retailer', goal: 'new products' } },
  { label: 'male brand, EU', input: { categories: 'MALE', website: '', socialLinks: [], market: 'EU', businessType: 'brand', goal: 'new products' } },
  { label: 'bdsm shop, UK', input: { categories: 'BDSM', website: '', socialLinks: [], market: 'UK', businessType: 'retailer', goal: 'new products' } },
];

for (const p of profiles) {
  const client = analyzeClient(p.input, 'en', null);
  const res: any = generateRecommendations(client, "en"); const list = Array.isArray(res) ? res : res.recommendations;
  const curated = list.filter((r) => r.curationSlot != null).sort((a, b) => (a.curationSlot ?? 0) - (b.curationSlot ?? 0));
  console.log(`\n=== ${p.label}`);
  for (const r of curated) {
    console.log(`  ${String(r.curationSlot).padStart(2)} fit=${String(r.fitScore).padStart(3)} ${r.product.short_name} | sec=${r.product.secondary_category} | cat=${r.product.primary_category}`);
  }
  const tally = {};
  for (const r of curated) {
    const k = r.product.secondary_category || r.product.primary_category;
    tally[k] = (tally[k] || 0) + 1;
  }
  const over = Object.entries(tally).filter(([, n]) => n > MATCHING_CONFIG.thresholds.sameCategoryTop5Limit);
  console.log(`  repeats: ${JSON.stringify(tally)}${over.length ? `  <-- OVER CAP: ${over.map(([k, n]) => `${k}x${n}`).join(', ')}` : ''}`);
}
// 附：召回池里到底有多少种形态
import { runEngine } from '../apps/web/lib/matching';
const bdsm = analyzeClient({ categories: 'BDSM', website: '', socialLinks: [], market: 'UK', businessType: 'retailer', goal: 'new products' } as any, 'en', null);
const run = runEngine(bdsm, 'en');
const forms = new Map<string, number>();
for (const r of run.recommendations) {
  const f = r.product.secondary_category || r.product.primary_category;
  forms.set(f, (forms.get(f) || 0) + 1);
}
console.log('\n=== BDSM 召回 20 行里的形态分布');
console.log(Array.from(forms.entries()).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join('  '));
