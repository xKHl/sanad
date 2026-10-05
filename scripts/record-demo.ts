/**
 * Record real model outputs for the sample cases (SPEC §8.3). Usage:
 *   npm run record:demo                 uses the model configured in .env.local
 *   npm run record:demo -- --delay 3000 wait between calls (free tiers)
 * Writes src/data/recordings.json. Re-run whenever PROMPT_VERSION changes.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { DEV_CASES } from '@/data/cases/dev';
import { resolveModel } from '@/lib/ai/model';
import { PROMPT_VERSION } from '@/lib/ai/prompt';
import { makeRecording, scenarioHash, type Recording } from '@/lib/ai/recordings';
import { analyzeCase } from '@/lib/pipeline/analyze-case';

for (const f of ['.env.local', '.env']) {
  try {
    if (existsSync(f)) process.loadEnvFile(f);
  } catch {
    /* optional */
  }
}

const argv = process.argv.slice(2);
const i = argv.indexOf('--delay');
const delay = i >= 0 ? Math.max(0, Number(argv[i + 1] ?? 0)) : 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const resolved = resolveModel();
  if (resolved.mode === 'demo') {
    console.error(
      `A live model is required${resolved.configError ? ` (${resolved.configError})` : ''}. Set a key in .env.local.`,
    );
    process.exit(1);
  }
  const out: Record<string, Recording> = {};
  let failed = 0;
  for (const c of DEV_CASES) {
    const r = await analyzeCase(c.scenario);
    if (r.ai) {
      out[scenarioHash(r.analyzedText)] = makeRecording(c.id, r.ai, resolved.label, PROMPT_VERSION);
      console.log(`${c.id}: recorded (${r.timings.totalMs} ms)`);
    } else {
      failed++;
      console.log(`${c.id}: failed (${r.aiError?.code}: ${r.aiError?.message})`);
    }
    if (delay) await sleep(delay);
  }
  writeFileSync('src/data/recordings.json', `${JSON.stringify(out, null, 2)}\n`);
  console.log(
    `\nRecorded ${Object.keys(out).length} of ${DEV_CASES.length} cases with ${resolved.label}.`,
  );
  if (failed) {
    console.log(
      'Re-run to retry the failed cases (rate limits on free tiers are the usual cause).',
    );
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
