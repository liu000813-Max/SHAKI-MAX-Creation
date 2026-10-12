/** Replicate the guard's sweep and ask, for each violation, whether the catalogue could even satisfy the cap. */
import { analyzeClient, runEngine } from '../apps/web/lib/matching';
import { MATCHING_CONFIG } from '../apps/web/lib/config/matching';
import { eligibleProducts } from '../apps/web/lib/data/brand';

const CAP = MATCHING_CONFIG.thresholds.sameCategoryTop5Limit;
const CATEGORY_INPUTS = ['women vibrator', 'men stroker', 'bdsm bondage restraint', 'couples interactive', 'lubricant cleanser', ''];
const MARKETS = ['US', 'EU', 'JP'];
const STYLES = ['minimal modern', 'luxury premium', 'cute playful'];
const PRICES = ['Entry', 'Mid', 'Premium'];

let runs = 0;
const bad: string[] = [];

for (const categories of CATEGORY_INPUTS) {
  for (const market of MARKETS) {
    for (const style of STYLES) {
      const profile = analyzeClient(
        { website: 'https://sweep.example.com', socialLinks: [], categories: `${categories} ${style}`, market, businessType: 'Retailer' } as never,
        'en',
      );
      profile.pricePosition = PRICES[(runs + 2) % PRICES.length] as never;
      runs += 1;
      const res = runEngine(profile, 'en');
      const curated = res.recommendations.filter((r) => r.curationSlot != null);
      const tally = new Map<string, number>();
      for (const r of curated) {
        const f = r.product.secondary_category || r.product.primary_category;
        tally.set(f, (tally.get(f) || 0) + 1);
      }
      const over = Array.from(tally.entries()).filter(([, n]) => n > CAP);
      if (!over.length) continue;
      // What could this client's own categories have supplied?
      const cats = profile.mainCategories;
      const pool = eligibleProducts().filter((p) => cats.includes(p.primary_category));
      const poolForms = new Set(pool.map((p) => p.secondary_category || p.primary_category));
      bad.push(
        `${cats.join('/') || '(none)'} / ${market} / ${style.split(' ')[0]} / ${profile.pricePosition}` +
          `  over: ${over.map(([k, n]) => `${k}x${n}`).join(', ')}` +
          ` | pool rows ${pool.length}, distinct forms ${poolForms.size}`,
      );
    }
  }
}

console.log(`runs: ${runs} | violations: ${bad.length}`);
for (const b of bad) console.log(`  ${b}`);