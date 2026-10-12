/**
 * One-shot equivalence harness for the "recallScore must read RECALL_BLOCK_WEIGHTS, not literals"
 * change. Dumps the full engine result for the fixture client so a before/after diff proves the
 * refactor moved a number from a function body into config without moving a single score.
 *
 * Run from the repo root:  jiti scripts/_recall_snapshot.ts <out.json>
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runEngine } from '../apps/web/lib/matching';

const FIX = JSON.parse(readFileSync(resolve('scripts/.mobile-fixture.json'), 'utf8'));
const engine = runEngine(FIX.client, 'zh');

const out = process.argv[2] || 'scripts/.recall-snapshot.json';
writeFileSync(
  resolve(out),
  JSON.stringify(
    {
      matchPipelineVersion: engine.matchPipelineVersion,
      limitedMatch: engine.limitedMatch,
      topFit: engine.topFit,
      stages: engine.stages,
      recommendations: engine.recommendations,
    },
    null,
    2
  )
);
console.log(`rows ${engine.recommendations.length} | topFit ${engine.topFit} | limitedMatch ${engine.limitedMatch}`);
console.log(`written ${resolve(out)}`);
