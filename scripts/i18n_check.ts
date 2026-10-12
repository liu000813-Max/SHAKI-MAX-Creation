/**
 * Bilingual equivalence guard — run with jiti:
 *   apps/web/node_modules/.bin/jiti scripts/i18n_check.ts
 *
 * Enforces PRD §18 "Chinese/English outputs remain semantically equivalent".
 *
 * The failure mode this catches is not a missing translation file — it is a hard-coded English
 * sentence smuggled into a field the Chinese UI renders verbatim. That shipped once already:
 * `client.opportunities` embedded "Missing Category: " inside the string, so the zh dashboard
 * showed English. The check below is deliberately blunt:
 *
 *   zh-facing string  -> MUST contain at least one CJK character
 *   en-facing string  -> MUST NOT contain any CJK character
 *
 * Anything failing either side is a string that was never actually localised.
 */
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { analyzeClient, runEngine } from '../apps/web/lib/matching';
import {
  localize,
  localizeOpportunity,
  marketLabel,
  opportunityLabel,
  evidenceLabel,
  businessTypeLabel,
  goalLabel,
  recTypeLabel,
  proposalTypeLabel,
  t,
} from '../apps/web/lib/i18n';
import { OpportunityKind, EvidenceType, BusinessType, Lang } from '../apps/web/lib/types';
import { MATCHING_CONFIG } from '../apps/web/lib/config/matching';

const CJK = /[\u4e00-\u9fff]/;

/** Every .tsx under the given app source roots, for the markup-level checks below. */
function listTsx(...roots: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.tsx')) out.push(full);
    }
  };
  roots.forEach(walk);
  return out;
}

const INPUT = {
  website: 'https://example-shop.com',
  socialLinks: ['https://instagram.com/example'],
  categories: 'women wellness vibrator suction couples lubricant',
  market: 'US',
  businessType: 'Distributor',
};

type Sample = { where: string; text: string };

function collect(lang: Lang): Sample[] {
  const client = analyzeClient(INPUT, lang);
  const engine = runEngine(client, lang);
  const out: Sample[] = [];

  out.push({ where: 'client.brandPositioning', text: localize(client.brandPositioning, lang) });
  out.push({ where: 'client.businessType (display)', text: businessTypeLabel(client.businessType, lang) });
  out.push({ where: 'client.market (display)', text: marketLabel(client.market, lang) });
  client.opportunities.forEach((op, i) => {
    out.push({ where: `client.opportunities[${i}]`, text: localizeOpportunity(op, lang) });
  });

  engine.recommendations.slice(0, 3).forEach((r) => {
    out.push({ where: `${r.product_id} reason.clientFact`, text: r.reason.clientFact });
    out.push({ where: `${r.product_id} reason.productFact`, text: r.reason.productFact });
    out.push({ where: `${r.product_id} reason.businessReason`, text: r.reason.businessReason });
    (r.evidence ?? []).forEach((e, i) => {
      out.push({ where: `${r.product_id} evidence[${i}] (${e.type})`, text: e.claim });
    });
  });

  return out;
}

let failures = 0;
const fail = (msg: string) => {
  console.error(`FAIL  ${msg}`);
  failures += 1;
};

// ── 1. Every zh-facing string must actually be Chinese; every en-facing string must not be ──
const zh = collect('zh');
const en = collect('en');

console.log(`collected ${zh.length} zh strings, ${en.length} en strings`);

for (const s of zh) {
  if (!CJK.test(s.text)) fail(`zh output is not Chinese -> ${s.where}: "${s.text}"`);
}
for (const s of en) {
  if (CJK.test(s.text)) fail(`en output contains CJK -> ${s.where}: "${s.text}"`);
}
console.log('zh strings containing CJK:', zh.filter((s) => CJK.test(s.text)).length, '/', zh.length);
console.log('en strings free of CJK:', en.filter((s) => !CJK.test(s.text)).length, '/', en.length);

// ── 2. The specific regression: the kind used to be an English prefix inside the sentence ──
const PREFIXES = ['Missing Category:', 'Price Gap:', 'Functional Gap:', 'Premium Opportunity:', 'New Category Opportunity:'];
const oldShape = collect('zh').filter((s) => PREFIXES.some((p) => s.text.includes(p)));
console.log('legacy English prefixes found in zh output:', oldShape.length);
if (oldShape.length) fail(`zh opportunity text still carries an English type prefix: ${oldShape[0].text}`);

// ── 3. Both languages must raise the same number of opportunities (same analysis, not fewer) ──
const zhClient = analyzeClient(INPUT, 'zh');
const enClient = analyzeClient(INPUT, 'en');
console.log('opportunity counts zh/en:', zhClient.opportunities.length, '/', enClient.opportunities.length);
if (zhClient.opportunities.length !== enClient.opportunities.length) {
  fail('zh and en analyses disagree on how many opportunities exist');
}
const zhKinds = zhClient.opportunities.map((o) => o.kind).join(',');
const enKinds = enClient.opportunities.map((o) => o.kind).join(',');
if (zhKinds !== enKinds) fail(`opportunity kinds differ: zh=${zhKinds} en=${enKinds}`);
console.log('kinds:', zhKinds || '(none)');

// Every opportunity is an inference and must say so (PRD §16).
const notInference = zhClient.opportunities.filter((o) => o.basis !== 'inference');
if (notInference.length) fail(`${notInference.length} opportunity item(s) are not marked as inferences`);
console.log('all opportunities marked as inference:', notInference.length === 0);

// ── 4. Closed enums must have a dictionary entry, otherwise the UI prints the raw key ──
const KINDS: OpportunityKind[] = ['missing_category', 'price_gap', 'functional_gap', 'premium', 'new_category'];
const EVIDENCE: EvidenceType[] = ['client_website', 'client_product_portfolio', 'client_social', 'market_research', 'product_master', 'sales_input'];
const MARKETS = ['Global', 'US', 'UK', 'EU', 'Australia', 'Japan', 'Korea', 'Southeast Asia', 'Middle East'];

for (const [label, values, resolve] of [
  ['opportunity kind', KINDS, opportunityLabel],
  ['evidence type', EVIDENCE, evidenceLabel],
  ['market', MARKETS, marketLabel],
] as [string, string[], (v: string, l: Lang) => string][]) {
  const missing = values.filter((v) => resolve(v, 'zh') === v && resolve(v, 'en') === v);
  console.log(`${label} labels resolved:`, values.length - missing.length, '/', values.length);
  if (missing.length) fail(`${label}(s) have no dictionary entry: ${missing.join(', ')}`);
}

// ── 4b. Enum pickers must render a translated label, not the stored English code ──
// `businessTypes` / `goals` in app/analyze/page.tsx feed these straight into <button>, so an
// unlabelled enum shows "Distributor" and "OEM/ODM" in the Chinese UI.
const BUSINESS_TYPES: BusinessType[] = [
  'Brand', 'Distributor', 'Retailer', 'Wholesaler', 'E-commerce',
  'Amazon Seller', 'Chain Store', 'Boutique', 'OEM/ODM Buyer',
];
const GOALS = ['New Product', 'Bestseller', 'Premium', 'High Margin', 'Product Line Expansion', 'OEM/ODM'];

let enumBad = 0;
for (const v of BUSINESS_TYPES) {
  const zh = businessTypeLabel(v, 'zh');
  const en = businessTypeLabel(v, 'en');
  if (!CJK.test(zh) || CJK.test(en)) {
    fail(`business type "${v}" not localised: zh="${zh}" en="${en}"`);
    enumBad += 1;
  }
}
for (const v of GOALS) {
  const zh = goalLabel(v, 'zh');
  const en = goalLabel(v, 'en');
  if (!CJK.test(zh) || CJK.test(en)) {
    fail(`goal "${v}" not localised: zh="${zh}" en="${en}"`);
    enumBad += 1;
  }
}
console.log('enum options localised:', BUSINESS_TYPES.length + GOALS.length - enumBad, '/', BUSINESS_TYPES.length + GOALS.length);

// The pre-migration sentinel must normalise in both directions, not leak the creation language.
const sentinelZh = businessTypeLabel('未指定', 'en');
const sentinelEn = businessTypeLabel('Unspecified', 'zh');
console.log('legacy businessType sentinels:', JSON.stringify(sentinelZh), '/', JSON.stringify(sentinelEn));
if (CJK.test(sentinelZh) || !CJK.test(sentinelEn)) fail('legacy businessType sentinel leaks the wrong language');

// ── 5. Keys the fallback banner depends on must exist (they were dead before) ──
const REQUIRED_KEYS = [
  'inferenceDisclosure',
  'limitedMatchBanner',
  'limitedMatchBannerHint',
  'matchCoverageNote',
  'potentialShort',
  'finalScore',
];
for (const k of REQUIRED_KEYS) {
  const ok = t(k, 'zh') !== k && t(k, 'en') !== k;
  if (!ok) fail(`dictionary key "${k}" is missing`);
}
console.log('fallback-banner keys present:', REQUIRED_KEYS.length - REQUIRED_KEYS.filter((k) => t(k, 'zh') === k).length, '/', REQUIRED_KEYS.length);

// ── 6. Legacy records: localize() must not blank a plain string written before the migration ──
const legacy = localize('Premium intimate wellness brand' as never, 'zh');
if (!legacy) fail('localize() blanked a legacy plain-string value instead of returning it');
console.log('legacy string passthrough:', JSON.stringify(legacy));

// ── 7. Stored English enums must render through a label mapper, never raw ──
// Two enums travel in the records and were printed verbatim: `Recommendation.type` on /compare and
// `Proposal.type` on /proposal + /share, so the Chinese UI showed "Best Match" and "Product
// Collection". The dictionary entries existed all along; the render sites just did not use them.
const REC_TYPES = ['Best Match', 'Growth Opportunity', 'Product Line Expansion', 'Strategic Product'];
const PROPOSAL_TYPES = ['Single Product', 'Product Collection', 'Product Line Proposal'];

for (const [label, values, resolve] of [
  ['recommendation type', REC_TYPES, recTypeLabel],
  ['proposal type', PROPOSAL_TYPES, proposalTypeLabel],
] as [string, string[], (v: string, l: Lang) => string][]) {
  const bad = values.filter((v) => {
    const zh = resolve(v, 'zh');
    const en = resolve(v, 'en');
    // An unresolved enum falls through to the raw English value, so zh would equal en.
    return zh === en || !CJK.test(zh) || CJK.test(en);
  });
  console.log(`${label} labels localised:`, values.length - bad.length, '/', values.length);
  if (bad.length) fail(`${label}(s) render untranslated: ${bad.join(', ')}`);
}

// ── 8. Hard-coded English in JSX text nodes ──
// The blunt net for the "someone typed a sentence straight into the markup" case, which is how
// `Loading…`, `More`, `Top Fit`, `Proposal not found` and `Product not found` shipped into the
// Chinese UI. Rule: a JSX text node containing letters must either contain CJK or be an allow-listed
// proper noun. Bilingual literals pass by construction.
//
// This walks the real TypeScript AST rather than regexing `>text<`: `useState<Proposal['type']>` and
// `(p) => p.x < GATE` both contain a `>` followed eventually by a `<`, and a character-level scanner
// reports the code between them as untranslated copy. `ts.isJsxText` cannot make that mistake.
const JSX_FILES = listTsx('apps/web/app', 'apps/web/components');

/** Proper nouns, brand names and industry acronyms that Chinese B2B UIs also render in Latin. */
const TEXT_TERMS = ['SHAKI AI Product Match', 'SHAKI AI', 'SHAKI', 'MOQ', 'SKU', 'CAD', 'EN'];

/**
 * A text node is allowed when stripping the terms above and every non-letter character leaves
 * nothing behind. That accepts "SKU ·" and "SHAKI AI" while rejecting "Client · " and "Bundle",
 * which is exactly the discrimination a plain whole-string allowlist cannot make.
 */
function isAllowedText(text: string): boolean {
  let rest = text;
  for (const term of TEXT_TERMS) rest = rest.split(term).join('');
  return !/[A-Za-z]/.test(rest);
}

const hardcoded: string[] = [];
const rawEnums: string[] = [];
const where = (file: string, sf: ts.SourceFile, node: ts.Node) =>
  `${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;

// Self-test: a guard that cannot fail is decoration. Re-verify the discrimination the allowlist
// rule exists to make, because widening TEXT_TERMS by one careless entry could silence section 8.
for (const [text, expected] of [
  ['SKU ·', true],
  ['SHAKI AI', true],
  ['Bundle', false],
  ['Client · ', false],
  ['optional', false],
] as [string, boolean][]) {
  if (isAllowedText(text) !== expected) {
    fail(`allowlist self-test broken: "${text}" should be ${expected ? 'allowed' : 'rejected'}`);
  }
}

for (const file of JSX_FILES) {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      // HTML entities are markup, not language. Without this, a comparison operator written as
      // `&lt;` is read as a text node containing "lt" and reported as hard-coded English — a false
      // positive that trains the reader to ignore the check. Strip entities, then look for a word.
      const text = node.text
        .replace(/&[a-zA-Z]+;/g, ' ')
        .replace(/&#\d+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text && /[A-Za-z]{2}/.test(text) && !CJK.test(text) && !isAllowedText(text)) {
        hardcoded.push(`${where(file, sf, node)} "${text}"`);
      }
    }
    // ── 9. Bare enum interpolation ──
    // `{x.type}` in markup bypasses section 7 entirely. Whatever the enum is, it must go through a
    // label function first.
    if (ts.isJsxExpression(node) && node.expression && ts.isPropertyAccessExpression(node.expression)) {
      if (node.expression.name.text === 'type') {
        rawEnums.push(`${where(file, sf, node)} ${node.expression.getText(sf)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
console.log(`jsx files scanned: ${JSX_FILES.length} | hard-coded English text nodes: ${hardcoded.length}`);
if (hardcoded.length) {
  hardcoded.forEach((h) => fail(`hard-coded English in JSX -> ${h}`));
}
console.log('bare .type interpolations in markup:', rawEnums.length);
if (rawEnums.length) rawEnums.forEach((r) => fail(`raw enum rendered without a label mapper -> ${r}`));

// ── 10. New UI copy: localised, and carrying no number that lives in config ──
// Two failure modes, both hit while adding the "no data on file" copy to the detail / compare /
// proposal pages:
//
//   * `limitedMatchBanner` read "未达到 75 分强匹配线 / Below the 75 strong-match line". `t()` is a
//     plain dictionary lookup with no interpolation, so that threshold was baked into the prose and
//     the banner would have kept claiming 75 after anyone moved `fitMinimumFallback`. The number is
//     now rendered from config beside the label, which makes the *string* the thing to police.
//   * `matchCoverageNote` claimed the analysis rested on "公开资料 / publicly available sources".
//     Every `evidenceSources` flag in this build is false, so the sentence described work that never
//     happens — and it sat directly underneath the results it was mis-describing.
const NEW_KEYS = [
  'requestQuote',
  'requestQuoteHint',
  'noScoreYet',
  'noScoreHint',
  'navMenu',
  'closeNav',
  'sharedProposalView',
  'sharedProposalPartial',
] as const;
let newKeyBad = 0;
for (const k of NEW_KEYS) {
  const zhText = t(k, 'zh');
  const enText = t(k, 'en');
  if (zhText === k || enText === k) {
    fail(`dictionary key "${k}" is missing`);
    newKeyBad += 1;
    continue;
  }
  if (!CJK.test(zhText)) {
    fail(`"${k}" zh has no Chinese: "${zhText}"`);
    newKeyBad += 1;
  }
  if (CJK.test(enText)) {
    fail(`"${k}" en contains Chinese: "${enText}"`);
    newKeyBad += 1;
  }
}
console.log(`no-data copy localised in both languages: ${NEW_KEYS.length - newKeyBad}/${NEW_KEYS.length}`);

// A threshold restated in prose disagrees with config the moment it moves. Matched as a standalone
// number so a year or a SKU cannot trip it, and checked in both languages because the original bug
// was present in both. The rule is not "don't mention the number" — it is "don't be the source of
// it": the component renders `fitMinimumFallback` from config right beside this label.
const fitLine = MATCHING_CONFIG.thresholds.fitMinimumFallback;
const POLICY_IN_COPY = ['limitedMatchBanner', 'limitedMatchBannerHint'] as const;
for (const k of POLICY_IN_COPY) {
  for (const lang of ['zh', 'en'] as Lang[]) {
    const text = t(k, lang);
    if (new RegExp(`(?<![\\d.])${fitLine}(?![\\d.%])`).test(text)) {
      fail(`"${k}" [${lang}] restates the fit threshold ${fitLine} in prose: "${text}"`);
    }
  }
}
console.log(`banner copy free of the config threshold ${fitLine} in both languages`);

// The scope disclosure sits under every result, so a claim in it is a claim about the whole run.
// Anchored on the *claim*, not on the word "public": the honest rewrite still says "public" in order
// to state that nothing public is read.
const BACKED_BY_PUBLIC = ['基于公开资料', 'based on publicly available sources', 'based on public sources'];
for (const k of ['matchCoverageNote', 'analysisScopeNote'] as const) {
  for (const lang of ['zh', 'en'] as Lang[]) {
    const text = t(k, lang);
    const hit = BACKED_BY_PUBLIC.find((n) => text.toLowerCase().includes(n.toLowerCase()));
    if (hit) fail(`"${k}" [${lang}] claims public-source backing this build never performs: "${hit}"`);
  }
}
console.log('scope disclosures make no public-source claim');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nOK — zh/en outputs are semantically equivalent');
if (failures) process.exitCode = 1;
