/**
 * Evaluation (SPEC §13.2). Usage:
 *   npm run eval -- --rules-only          rule layer only, no model calls
 *   npm run eval                          full pipeline with the configured model
 *   npm run eval -- --set holdout --runs 3 --delay 3000
 * Writes docs/EVALUATION.md and keeps its manual error-analysis section.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { DEV_CASES } from '@/data/cases/dev';
import { HOLDOUT_CASES } from '@/data/cases/holdout';
import type { SyntheticCase } from '@/data/cases/schema';
import { resolveModel } from '@/lib/ai/model';
import { PROMPT_VERSION } from '@/lib/ai/prompt';
import {
  renderReport,
  runFromFindings,
  runFromResult,
  summarize,
  type CaseRun,
  type EvalSet,
} from '@/lib/eval/report';
import { analyzeCase } from '@/lib/pipeline/analyze-case';
import { RULES_VERSION, runSafetyChecks } from '@/lib/safety';
import { redactIdentifiers } from '@/lib/safety/phi';

for (const f of ['.env.local', '.env']) {
  try {
    if (existsSync(f)) process.loadEnvFile(f);
  } catch {
    /* optional */
  }
}

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const value = (name: string, fallback: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? (argv[i + 1] as string) : fallback;
};

const set = value('set', 'all') as EvalSet | 'all';
const rulesOnly = flag('rules-only');
const runs = Math.max(1, Number(value('runs', '1')));
const delay = Math.max(0, Number(value('delay', '0')));
const mode = value('mode', '');
if (mode) process.env.SANAD_MODE = mode;

const cases: Array<{ set: EvalSet; c: SyntheticCase }> = [
  ...(set === 'holdout' ? [] : DEV_CASES.map((c) => ({ set: 'dev' as const, c }))),
  ...(set === 'dev' ? [] : HOLDOUT_CASES.map((c) => ({ set: 'holdout' as const, c }))),
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const resolved = resolveModel();
  if (!rulesOnly && resolved.mode === 'demo' && mode !== 'demo') {
    console.error(
      `No live model configured${resolved.configError ? ` (${resolved.configError})` : ''}. Use --rules-only, --mode demo, or set a key in .env.local.`,
    );
    process.exit(1);
  }
  const results: CaseRun[] = [];
  let modelLabel: string | null = rulesOnly
    ? null
    : resolved.mode === 'demo'
      ? 'recorded outputs'
      : resolved.label;
  for (let run = 0; run < runs; run++) {
    for (const { set: s, c } of cases) {
      if (rulesOnly) {
        results.push(runFromFindings(s, c, runSafetyChecks(redactIdentifiers(c.scenario).text)));
        continue;
      }
      const r = await analyzeCase(c.scenario);
      modelLabel = r.model ?? modelLabel;
      results.push(runFromResult(s, c, r));
      const ai = results.at(-1)?.ai;
      console.log(
        `${s} ${c.id}: ${ai?.ok ? 'ok' : `AI ${ai?.errorCode}`} (${r.timings.totalMs} ms)`,
      );
      if (delay) await sleep(delay);
    }
  }
  const path = 'docs/EVALUATION.md';
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
  const report = renderReport(
    {
      date: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
      mode: rulesOnly ? 'rules only' : resolved.mode,
      model: modelLabel,
      promptVersion: PROMPT_VERSION,
      rulesVersion: RULES_VERSION,
      runs,
    },
    results,
    existing,
  );
  writeFileSync(path, report);
  const dev = summarize(results.filter((r) => r.set === 'dev'));
  console.log(
    `\nDevelopment: sensitivity ${dev.sensitivity}, false positives ${dev.falsePositives.length}, NEWS2 ${dev.news2Agreement}`,
  );
  if (results.some((r) => r.set === 'holdout')) {
    const h = summarize(results.filter((r) => r.set === 'holdout'));
    console.log(
      `Held-out: sensitivity ${h.sensitivity}, false positives ${h.falsePositives.length}, NEWS2 ${h.news2Agreement}`,
    );
  } else console.log('Held-out: no cases yet (src/data/cases/holdout.ts is empty).');
  console.log(`Wrote ${path}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
