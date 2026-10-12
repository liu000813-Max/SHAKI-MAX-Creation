/**
 * Prints a share URL built from the fixture client, for scripts/shared_link_smoke.mjs to open.
 *
 * Run from the repo root:  jiti scripts/_share_url.ts [origin]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateRecommendations } from '../apps/web/lib/matching';
import { buildShareUrl, SHARE_PAYLOAD_VERSION, type SharedProposalPayload } from '../apps/web/lib/shareLink';

const origin = process.argv[2] || 'http://127.0.0.1:4175';
const FIX = JSON.parse(readFileSync(resolve('scripts/.mobile-fixture.json'), 'utf8'));
const client = FIX.client;
const recs = generateRecommendations(client, 'zh');
const ids = recs.filter((r) => r.curationSlot != null).map((r) => r.product_id);

const { opportunities, ...cl } = client;
const payload: SharedProposalPayload = {
  v: SHARE_PAYLOAD_VERSION,
  id: 'SMOKE0001',
  ti: 'Smoke · 精选方案',
  ty: 'Product Collection',
  co: 'SHAKI',
  l: 'zh',
  cl,
  ids,
  at: new Date().toISOString(),
};

const url = buildShareUrl(origin, payload);
// The smoke reads stdout, so the URL must be the last line and nothing else may pollute it.
process.stderr.write(`url ${url.length} chars, ${ids.length} products\n`);
process.stdout.write(url);
