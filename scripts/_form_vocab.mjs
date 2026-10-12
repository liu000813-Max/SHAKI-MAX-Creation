/**
 * What product forms does the catalogue actually contain?
 *
 * `secondary_category` was set to the site's English product name, which is not a category: variants
 * of one form differ ("Anal Plug" / "Anal Plug-A"), so every same-form cap in the engine was
 * bypassed and the Top 5 came out as four copies of one product. This counts the real vocabulary so
 * the sub-category can be a controlled form instead of a name.
 */
import { readFileSync } from 'node:fs';

const { rows } = JSON.parse(readFileSync('scripts/.en-catalog-raw.json', 'utf8'));
const names = rows.map((r) => (r.name_en || '').trim()).filter(Boolean);

const norm = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/[^A-Za-z0-9\s\-\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// Candidate forms are the words a buyer would name the product type by. Ordered longest-first so
// "mini wand" wins over "wand" when both appear.
const FORMS = [
  'stroker', 'masturbator', 'vibrator rabbit', 'rabbit vibrator', 'bullet vibrator', 'mini wand',
  'finger vibrator', 'wand vibrator', 'suction tongue vibrator', 'clitoral suction', 'insertable dildo',
  'anal plug', 'butt plug', 'vibrating egg', 'remote vibrator', 'wearable vibrator', 'body massager',
  'cock ring', 'penis sleeve', 'male masturbator', 'pump', 'cock cage', 'nipple clamps', 'nipple clips',
  'nipple vibrator', 'clamp', 'cuffs', 'handcuffs', 'ankle cuffs', 'collar', 'bdsm set', 'bondage set',
  'whip', 'crop', 'paddle', 'slap', 'tongue clamp', 'ball gag', 'gag', 'blindfold', 'rope', 'chains',
  'restraints', 'strap-on', 'strap on dildo', 'dildo', 'vibrator', 'sex doll', 'condom', 'lube',
  'massage candle', 'wax', 'oil', 'spray', 'cards', 'card game', 'kit', 'set', 'sleeve', 'extractor',
];

const hit = (name) => {
  const n = ` ${norm(name)} `;
  const found = FORMS.filter((f) => n.includes(` ${f}`) || n.includes(` ${f}s `) || n.includes(`${f}s `));
  return found.sort((a, b) => b.length - a.length)[0] || '';
};

const buckets = new Map();
const unmatched = [];
for (const name of names) {
  const form = hit(name);
  if (!form) {
    unmatched.push(name);
    continue;
  }
  buckets.set(form, (buckets.get(form) || 0) + 1);
}

console.log(`names: ${names.length} | matched to a known form: ${names.length - unmatched.length} (${(((names.length - unmatched.length) / names.length) * 100).toFixed(1)}%)`);
console.log('\nforms by size:');
for (const [k, v] of Array.from(buckets.entries()).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log(`\ntop unmatched names (${unmatched.length}):`);
for (const n of unmatched.slice(0, 15)) console.log(`  ${n}`);