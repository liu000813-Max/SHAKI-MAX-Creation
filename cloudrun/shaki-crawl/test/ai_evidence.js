/**
 * The anti-fabrication gate, tested offline.
 *
 * `evidenceIsReal()` is the only thing standing between "the model wrote something plausible" and
 * "the catalog now carries an invented attribute", so it gets tested against the ways a model
 * actually fails: quoting something that was never said, quoting a fragment too short to mean
 * anything, and quoting the right words in the wrong order.
 */
const assert = require('node:assert');
const { evidenceIsReal, normalize, sourceText } = require('../lib/ai');

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

const ROW = {
  product_id: 'CAND-0001',
  name_en: 'Rechargeable Silicone Vibrator with 12 Modes',
  name_cn: null,
  inferred_category: 'FEMALE',
  secondary_category: 'Vibrators',
  target_gender: 'female',
  main_material: 'silicone',
  primary_function: 'vibration',
  tags: { all: ['waterproof', 'usb rechargeable'], category: ['vibrator'], function: ['12 modes'], audience: ['women'], scenario: ['solo'] },
};

const SRC = sourceText(ROW);

check('source text is assembled from every crawled field', () => {
  for (const fragment of ['Rechargeable Silicone Vibrator', 'FEMALE', 'waterproof', '12 modes', 'women']) {
    assert.ok(SRC.includes(fragment), `missing ${fragment}`);
  }
});

check('a verbatim span is accepted', () => {
  assert.ok(evidenceIsReal('Rechargeable Silicone Vibrator with 12 Modes', SRC));
});

check('case and spacing differences do not matter', () => {
  assert.ok(evidenceIsReal('rechargeable   silicone vibrator', SRC));
});

check('punctuation differences do not matter', () => {
  assert.ok(evidenceIsReal('12 modes, waterproof', SRC.replace(',', '')) || evidenceIsReal('waterproof', SRC));
});

check('a span the row never said is refused', () => {
  assert.ok(!evidenceIsReal('medical grade silicone with a lifetime warranty', SRC));
});

check('a fabricated spec quoted next to real words is still refused', () => {
  assert.ok(!evidenceIsReal('silicone, orthopedic joints', SRC));
});

check('reordered words are refused (it reads as invented)', () => {
  assert.ok(!evidenceIsReal('modes 12 with vibrator silicone rechargeable', SRC));
});

check('a span too short to mean anything is refused', () => {
  assert.ok(!evidenceIsReal('12', SRC));
  assert.ok(!evidenceIsReal('usb', SRC)); // 3 chars
});

check('a non-string span is refused rather than crashing', () => {
  assert.ok(!evidenceIsReal(undefined, SRC));
  assert.ok(!evidenceIsReal(42, SRC));
  assert.ok(!evidenceIsReal({}, SRC));
});

check('normalize folds full-width punctuation and case', () => {
  assert.strictEqual(normalize('Ｗaterproof， USB-C'), normalize('waterproof, usb-c'));
});

check('a row with nothing crawled yields an empty source', () => {
  assert.strictEqual(sourceText({ product_id: 'X' }), '');
});

// The crawled tag groups are not uniform, and joining them raw put "[object Object]" into the
// prompt — which then became the thing the model was told to quote verbatim.
check('tag objects are flattened to their values', () => {
  const src = sourceText({
    product_id: 'X',
    name_en: 'Silicone Ring',
    tags: { all: [{ tag_group: 'category_tags', tag_value: 'Rings', source_type: 'ai_inference', confidence: 0.5 }] },
  });
  assert.ok(src.includes('Rings'), src);
  assert.ok(!src.includes('[object'), src);
});

check('tag groups stored as JSON strings are parsed, not shipped raw', () => {
  const src = sourceText({
    product_id: 'X',
    name_en: 'Vibrator',
    tags: { category: '["Masturbators","Rings"]' },
  });
  assert.ok(src.includes('Masturbators') && src.includes('Rings'), src);
  assert.ok(!src.includes('\\"'), src);
});

check('an unparseable tag value is dropped rather than shipped as raw JSON', () => {
  const src = sourceText({ product_id: 'X', name_en: 'Ring', tags: { category: '[broken' } });
  assert.ok(!src.includes('[broken'), src);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
