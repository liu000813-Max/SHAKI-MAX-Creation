/**
 * Builds the localStorage payload `scripts/mobile_check.mjs` seeds into the browser.
 *
 * Why this exists: the mobile probe's first version navigated to /recommendations and /compare with
 * a session but no data, so every "phone" screenshot was an *empty state*. An empty state cannot
 * reveal a cramped card grid, a wrapped score row, or a comparison table that needs panning — which
 * is exactly the class of defect the probe exists to catch. The pages a phone actually opens are the
 * ones with a client and its recommendations in them.
 *
 * The payload is produced by the app's own `analyzeClient()` / `generateRecommendations()` rather
 * than hand-written, so it cannot drift from the real record shapes. Run from the repo root:
 *
 *   node apps/web/node_modules/jiti/bin/jiti.js scripts/make_mobile_fixture.ts
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeClient, generateRecommendations } from '../apps/web/lib/matching';
import type { ClientInput } from '../apps/web/lib/types';

// Values copied from the options the /analyze form offers, so the fixture is a client a rep could
// actually have created rather than a synthetic edge case.
const input: ClientInput = {
  categories: '情趣用品、润滑剂、按摩器、震动棒',
  website: 'https://mobile-probe.example.com',
  socialLinks: ['https://instagram.com/mobile-probe'],
  market: 'United States',
  businessType: 'Distributor',
  goal: 'New Product',
};

const client = analyzeClient(input, 'zh');
const recs = generateRecommendations(client, 'zh');

const out = resolve('scripts/.mobile-fixture.json');
writeFileSync(
  out,
  JSON.stringify({ client, recommendations: { [client.id]: recs } }, null, 2),
  'utf8'
);

const curated = recs.filter((r) => r.curationSlot != null).length;
console.log(`client ${client.id} (${client.name}) | confidence ${client.confidence}`);
console.log(`recommendations ${recs.length} | curated ${curated}`);
console.log(`written ${out}`);
