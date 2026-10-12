/**
 * Extraction tests. No network: the parser is fed a fixture so the happy path is verified even in
 * a sandbox whose DNS is intercepted (every hostname resolving to a reserved range there).
 */
const assert = require('node:assert');
const { extractFacts } = require('../lib/extract');

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`PASS  ${name}`);
  } catch (e) {
    fail += 1;
    console.log(`FAIL  ${name} — ${e.message}`);
  }
}

const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Velour&nbsp;Intimates &mdash; Premium Wellness</title>
  <meta name="description" content="Velour designs premium intimate wellness products for women.">
  <meta property="og:site_name" content="Velour Intimates">
  <meta property="og:description" content="Luxury lingerie and personal care, shipped worldwide.">
  <meta name="keywords" content="intimate, wellness, women, premium">
  <link rel="canonical" href="https://velour.example/">
  <script>var tracking = "<h2>not a heading</h2>";</script>
  <style>body { color: red }</style>
</head>
<body>
  <h1>  Intimate   Wellness,  Redefined </h1>
  <h2>Our Collections</h2>
  <p>We craft body-safe silicone vibrators and water-based lubricants for modern couples.</p>
  <!-- <h2>commented out</h2> -->
  <a href="https://www.instagram.com/velour">Instagram</a>
  <a href="https://www.instagram.com/velour">Instagram again</a>
  <a href="https://tiktok.com/@velour">TikTok</a>
  <a href="/about">About</a>
</body>
</html>`;

const facts = extractFacts(Buffer.from(HTML), 'https://velour.example/', { 'content-type': 'text/html; charset=utf-8' }, 6000);

check('title is decoded and whitespace-collapsed', () => {
  assert.strictEqual(facts.title, 'Velour Intimates — Premium Wellness');
});

check('og:site_name wins for siteName', () => {
  assert.strictEqual(facts.siteName, 'Velour Intimates');
});

check('og:description is preferred over meta description', () => {
  assert.strictEqual(facts.description, 'Luxury lingerie and personal care, shipped worldwide.');
});

check('meta keywords survive', () => {
  assert.strictEqual(facts.metaKeywords, 'intimate, wellness, women, premium');
});

check('lang comes from <html lang>', () => {
  assert.strictEqual(facts.lang, 'en');
});

check('headings are collected, script/style/comment content is not', () => {
  assert.deepStrictEqual(facts.headings, ['Intimate Wellness, Redefined', 'Our Collections']);
});

check('visible text drops script and style content', () => {
  assert.ok(facts.text.includes('body-safe silicone vibrators'), facts.text);
  assert.ok(!facts.text.includes('tracking'), facts.text);
  assert.ok(!facts.text.includes('color: red'), facts.text);
  assert.ok(!facts.text.includes('commented out'), facts.text);
});

check('social links are absolute and de-duplicated', () => {
  assert.deepStrictEqual(facts.socialLinks, [
    'https://www.instagram.com/velour',
    'https://tiktok.com/@velour',
  ]);
});

check('relative links are not mistaken for social', () => {
  assert.ok(!facts.socialLinks.some((l) => l.includes('/about')));
});

check('charset is reported from the header', () => {
  assert.strictEqual(facts.charset, 'utf-8');
});

check('textChars is bounded by the cap', () => {
  assert.ok(facts.textChars <= 6000);
  assert.strictEqual(facts.textChars, facts.text.length);
});

check('a small page is not marked truncated', () => {
  assert.strictEqual(facts.truncated, false);
});

const capped = extractFacts(Buffer.from(HTML), 'https://velour.example/', {}, 20);
check('the cap actually truncates', () => {
  assert.strictEqual(capped.text.length, 20);
  assert.strictEqual(capped.truncated, true);
});

check('nav labels are harvested, deduped and length-capped', () => {
  const html = `<html><body><nav><a href="/a">Dildos</a><a href="/b">Dildos</a><a href="/c">Cuffs and Restraints</a><a href="/d">x</a><a href="/e">${'n'.repeat(60)}</a></nav><p>${'word '.repeat(400)}</p></body></html>`;
  const facts = extractFacts(html, 'https://shop.example/', {}, 2000);
  assert.ok(facts.navItems.includes('Dildos'));
  assert.ok(facts.navItems.includes('Cuffs and Restraints'));
  assert.strictEqual(facts.navItems.filter((n) => n === 'Dildos').length, 1);
  assert.ok(!facts.navItems.includes('x'), 'one-character labels are noise');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);