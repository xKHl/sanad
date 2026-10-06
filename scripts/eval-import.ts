/**
 * Build docs/EVALUATION.md and src/data/recordings.json from results collected by calling the
 * deployed /api/analyze from a browser (used when this machine cannot reach the model provider).
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/eval-import.ts <runs.json>
 * The rule layer is re-run locally; AI metrics come from the deployed responses.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { DEV_CASES } from '@/data/cases/dev';
import { HOLDOUT_CASES } from '@/data/cases/holdout';
import { PROMPT_VERSION } from '@/lib/ai/prompt';
import { RecordingSchema, scenarioHash, type Recording } from '@/lib/ai/recordings';
import { renderReport, runFromFindings, summarize, type CaseRun } from '@/lib/eval/report';
import { RULES_VERSION, runSafetyChecks } from '@/lib/safety';
import { redactIdentifiers } from '@/lib/safety/phi';

type Compact = {
  ok: boolean;
  attempts: number;
  errorCode: string | null;
  gv: number;
  gt: number;
  rfa: number;
  rf: number;
  complete: boolean;
  aiFlags: string[];
  aiMs: number | null;
  totalMs: number;
  model: string | null;
  nMiss: number;
  nSteps: number;
  rules: string;
  prompt: string;
};
type Input = {
  date: string;
  runs: Record<string, Compact>;
  recordings?: Record<
    string,
    { ai: unknown; model: string; analyzedText: string; prompt: string; at: string }
  >;
};

// Fallback chain deployed for this run (attempts = models tried + schema retries).
const CHAIN = (
  process.env.CHAIN ??
  'gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-lite-latest'
).split(',');
function schemaRetries(r: Compact): number {
  const position = CHAIN.findIndex((m) => r.model?.startsWith(`${m} `)) + 1;
  return position > 0 ? Math.max(0, r.attempts - position) : 0;
}

const input = JSON.parse(readFileSync(process.argv[2] ?? '', 'utf8')) as Input;
const results: CaseRun[] = [];
const models = new Map<string, number>();
for (const [set, cases] of [
  ['dev', DEV_CASES],
  ['holdout', HOLDOUT_CASES],
] as const) {
  for (const c of cases) {
    const base = runFromFindings(set, c, runSafetyChecks(redactIdentifiers(c.scenario).text));
    const r = input.runs[c.id];
    if (!r) {
      results.push(base);
      continue;
    }
    if (r.rules !== RULES_VERSION || r.prompt !== PROMPT_VERSION)
      throw new Error(`${c.id}: deployed rules ${r.rules} / prompt ${r.prompt} differ from local`);
    if (r.model) models.set(r.model, (models.get(r.model) ?? 0) + 1);
    results.push({
      ...base,
      ai: {
        ok: r.ok,
        attempts: r.attempts,
        schemaRetries: schemaRetries(r),
        errorCode: r.errorCode,
        groundingVerified: r.gv,
        groundingTotal: r.gt,
        ruleFlagsAddressed: r.rfa,
        ruleFlags: r.rf,
        completeOutputs: r.complete,
        aiFlagTitles: r.aiFlags,
        aiMs: r.aiMs,
        totalMs: r.totalMs,
      },
    });
  }
}
const modelText = [...models]
  .sort((a, b) => b[1] - a[1])
  .map(([m, n]) => `${m} ×${n}`)
  .join(', ');
const path = 'docs/EVALUATION.md';
writeFileSync(
  path,
  renderReport(
    {
      date: input.date,
      mode: 'cloud (deployed app)',
      model: modelText || null,
      promptVersion: PROMPT_VERSION,
      rulesVersion: RULES_VERSION,
      runs: 1,
    },
    results,
    existsSync(path) ? readFileSync(path, 'utf8') : null,
  ),
);
for (const set of ['dev', 'holdout'] as const) {
  const s = summarize(results.filter((r) => r.set === set));
  console.log(set, JSON.stringify(s).slice(0, 600));
}
const counts = Object.values(input.runs);
console.log(
  'missing items mean',
  counts.reduce((a, r) => a + r.nMiss, 0) / counts.length,
  'steps mean',
  counts.reduce((a, r) => a + r.nSteps, 0) / counts.length,
);

if (input.recordings) {
  const out: Record<string, Recording> = {};
  for (const [id, rec] of Object.entries(input.recordings)) {
    out[scenarioHash(rec.analyzedText)] = RecordingSchema.parse({
      caseId: id,
      ai: rec.ai,
      model: rec.model,
      promptVersion: rec.prompt,
      recordedAt: rec.at,
    });
  }
  writeFileSync('src/data/recordings.json', `${JSON.stringify(out, null, 2)}\n`);
  console.log(`recordings: ${Object.keys(out).length}`);
}
