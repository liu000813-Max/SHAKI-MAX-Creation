/**
 * Guard for portable proposal links (lib/shareLink.ts + app/share/page.tsx).
 *
 * The invariant that matters is not "the payload round-trips" — it is **"what the recipient sees
 * equals what the sender shared"**. The old `/share?id=...` link read the proposal out of the
 * sender's localStorage, so it opened blank for everyone else. The fix ships the client profile and
 * the selected product ids in the URL fragment and re-runs the deterministic engine on the
 * receiving device. That only works if re-running on the transmitted profile reproduces the very
 * same recommendations, so that is what is asserted here, on a real client and its real curated set.
 *
 * Run from the repo root:  jiti scripts/share_check.ts
 */
import { analyzeClient, generateRecommendations } from '../apps/web/lib/matching';
import {
  buildShareUrl,
  decodeSharePayload,
  encodeSharePayload,
  payloadFromHash,
  MAX_SHARE_URL_CHARS,
  SHARE_PAYLOAD_VERSION,
  type SharedProposalPayload,
} from '../apps/web/lib/shareLink';
import type { ClientInput, ClientProfile } from '../apps/web/lib/types';

let failures = 0;
const fail = (msg: string) => {
  failures += 1;
  console.log(`FAIL  ${msg}`);
};
const ok = (msg: string) => console.log(`ok    ${msg}`);

const input: ClientInput = {
  categories: '情趣用品、润滑剂、按摩器',
  website: 'https://share-probe.example.com',
  socialLinks: ['https://instagram.com/share-probe'],
  market: 'United States',
  businessType: 'Distributor',
  goal: 'New Product',
};

const client: ClientProfile = analyzeClient(input, 'zh');
const original = generateRecommendations(client, 'zh');
const curated = original.filter((r) => r.curationSlot != null);
const ids = curated.map((r) => r.product_id);

console.log(`client ${client.id} | ${original.length} recommendations | ${curated.length} curated`);

if (curated.length === 0) fail('no curated recommendations to build a proposal from');

// ── 1. Round-trip: the payload survives encode/decode unchanged ──
const { opportunities, ...sharedProfile } = client;
const payload: SharedProposalPayload = {
  v: SHARE_PAYLOAD_VERSION,
  id: 'SHARE123',
  ti: '初夜 · 轻奢套装提案',
  ty: 'Product Collection',
  co: 'SHAKI',
  l: 'zh',
  cl: sharedProfile,
  ids,
  at: new Date('2026-09-30T00:00:00Z').toISOString(),
};

const encoded = encodeSharePayload(payload);
const decoded = decodeSharePayload(encoded);
if (!decoded) {
  fail('decodeSharePayload returned null for a payload it just encoded');
} else if (JSON.stringify(decoded) !== JSON.stringify(payload)) {
  fail('round-trip is not identity — the recipient would see a different proposal');
} else {
  ok('round-trip is byte-identical');
}

// ── 2. The recipient's rebuilt recommendations equal the sender's ──
// This is the assertion that makes the link trustworthy: nothing is transmitted except inputs.
if (decoded) {
  const rebuiltProfile = { ...decoded.cl, opportunities: [] } as ClientProfile;
  const rebuiltRecs = generateRecommendations(rebuiltProfile, decoded.l, []);
  const wanted = decoded.ids
    .map((id) => rebuiltRecs.find((r) => r.product_id === id))
    .filter(Boolean);
  const sent = decoded.ids.map((id) => original.find((r) => r.product_id === id)).filter(Boolean);

  if (wanted.length !== decoded.ids.length) {
    fail(`only ${wanted.length} of ${decoded.ids.length} selected products could be recomputed`);
  }
  if (JSON.stringify(wanted) !== JSON.stringify(sent)) {
    fail('rebuilt recommendations differ from what the sender shared — the link would show different scores');
    const a = JSON.stringify(sent).slice(0, 240);
    const b = JSON.stringify(wanted).slice(0, 240);
    console.log(`      sent:    ${a}`);
    console.log(`      rebuilt: ${b}`);
  } else {
    ok(`rebuilt ${wanted.length}/${decoded.ids.length} recommendations byte-identical to the sender's`);
  }
}

// ── 3. The link is short enough to survive being pasted into a chat ──
const url = buildShareUrl('https://shaki-ai-product-match.app.workbuddy.host', payload);
console.log(`share url ${url.length} chars (ceiling ${MAX_SHARE_URL_CHARS})`);
if (url.length > MAX_SHARE_URL_CHARS) fail(`share url is ${url.length} chars, over the ${MAX_SHARE_URL_CHARS} ceiling`);
else ok('share url fits the chat-paste ceiling');

// ── 4. Reading a fragment behaves, including when it is absent or hostile ──
if (payloadFromHash(`#p=${encoded}`) === null) fail('payloadFromHash could not read a fragment it was given');
else ok('payloadFromHash reads the fragment');

for (const [label, hash] of [
  ['no fragment', ''],
  ['unrelated fragment', '#section-2'],
  ['truncated payload', `#p=${encoded.slice(0, 40)}`],
  ['garbage', '#p=!!!not-base64!!!'],
] as [string, string][]) {
  if (payloadFromHash(hash) !== null) fail(`${label} should yield no payload, but decoded to something`);
}
ok('absent / truncated / garbage fragments yield no payload');

const wrongVersion = decodeSharePayload(encodeSharePayload({ ...payload, v: 99 }));
if (wrongVersion !== null) fail('a payload from an unknown version was accepted');
else ok('unknown payload versions are rejected');

// ── 5. Inferences are not transmitted ──
// `opportunities` is the engine's inference list. The shared page never renders it, so shipping it
// would put claims in the URL that nobody agreed to show — and it doubles the payload.
if (encoded.includes('opportunities')) fail('the payload carries `opportunities`, which the shared page never renders');
else ok('payload carries no inferences the shared page does not render');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nOK — a shared link reproduces exactly what the sender saw');
if (failures) process.exitCode = 1;
