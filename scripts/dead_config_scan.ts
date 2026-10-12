/**
 * Dead-config scan — REPORT ONLY, deletes nothing.
 *
 *   jiti scripts/dead_config_scan.ts
 *
 * Why: `RECALL_BLOCK_WEIGHTS` sat exported in lib/config/matching.ts while `recallScore` carried
 * its own copy of the six numbers. The config looked authoritative and was dead — editing a weight
 * changed nothing on any screen. PRD §19 makes that file the single home for every weight and
 * threshold, so an entry that nothing reads is not harmless tidiness, it is a lie the next reader
 * will trust.
 *
 * Method: walk every leaf of `MATCHING_CONFIG` (plus the module's named exports) and count source
 * references to the leaf's key name outside the config file itself. A leaf with zero references is
 * reported. Common words (market, audience) will usually find a hit somewhere, so this scan
 * UNDER-reports rather than over-reports — a clean list is strong evidence, a hit is only a hint.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { MATCHING_CONFIG, RECALL_BLOCK_WEIGHTS, DIMENSION_ANCHORS, PRICE_LADDER } from '../apps/web/lib/config/matching';

const ROOT = resolve('apps/web');
const CONFIG_FILE = relative(ROOT, resolve('apps/web/lib/config/matching.ts')).replace(/\\/g, '/');
const SKIP = new Set(['node_modules', '.next', 'out', '.mobile-fixture.json']);

const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(tsx?|ts)$/.test(name)) files.push(p);
  }
};
walk(ROOT);

// Source of every file EXCEPT the config module itself (its own keys obviously appear there).
const corpus = files
  .filter((f) => relative(ROOT, f).replace(/\\/g, '/') !== CONFIG_FILE)
  .map((f) => ({ file: relative(ROOT, f).replace(/\\/g, '/'), text: readFileSync(f, 'utf8') }));

const countRefs = (needle: string) =>
  corpus.reduce((n, { file, text }) => n + (text.includes(needle) ? 1 : 0), 0);

const leafPaths: { path: string; key: string }[] = [];
const walkConfig = (obj: unknown, prefix: string) => {
  if (obj === null || typeof obj !== 'object') {
    const key = prefix.split('.').pop() as string;
    leafPaths.push({ path: prefix, key });
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) walkConfig(v, prefix ? `${prefix}.${k}` : k);
};
walkConfig(MATCHING_CONFIG, 'MATCHING_CONFIG');

// Named exports the engine reaches for directly (not through MATCHING_CONFIG).
const namedExports: [string, unknown][] = [
  ['RECALL_BLOCK_WEIGHTS', RECALL_BLOCK_WEIGHTS],
  ['DIMENSION_ANCHORS', DIMENSION_ANCHORS],
  ['PRICE_LADDER', PRICE_LADDER],
];

console.log(`config: ${CONFIG_FILE}`);
console.log(`scanned ${corpus.length} source files (config module excluded from the corpus)\n`);

const dead: string[] = [];
for (const { path, key } of leafPaths) {
  const n = countRefs(key);
  if (n === 0) dead.push(path);
}
for (const [name] of namedExports) {
  // Bare-name count, same rule as the leaf keys. The first version looked only for
  // `NAME.` / `NAME,` / `{ NAME`, which missed `import { A, B, NAME } from ...` — it reported
  // RECALL_BLOCK_WEIGHTS as dead on the very commit that wired it up.
  const n = countRefs(name);
  if (n === 0) dead.push(`${name} (module export)`);
}

const blocks = new Set(leafPaths.map((l) => l.path.split('.')[1]));
console.log(`MATCHING_CONFIG leaves: ${leafPaths.length} across ${blocks.size} top-level blocks`);

if (dead.length === 0) {
  console.log('\nno dead config entries — every leaf key is referenced by at least one source file');
} else {
  console.log(`\n${dead.length} UNREAD config entr${dead.length === 1 ? 'y' : 'ies'} (defined, referenced by nothing):`);
  for (const d of dead) console.log(`  - ${d}`);
  console.log('\n(report only — nothing was deleted. An entry is only removable once its owner confirms it is surplus.)');
}
