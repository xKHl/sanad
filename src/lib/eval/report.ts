import type { SyntheticCase } from '@/data/cases/schema';
import type { AnalysisResult } from '@/lib/pipeline/types';
import type { SafetyFindings } from '@/lib/safety/types';

/**
 * Evaluation metrics and report rendering (SPEC §13.2). Shared by `npm run eval` and the
 * browser lab page, so both produce the same EVALUATION.md.
 */

export type EvalSet = 'dev' | 'holdout';

export type CaseRun = {
  set: EvalSet;
  id: string;
  title: string;
  expectedFlags: string[];
  expectedNews2: SyntheticCase['expectedNews2'];
  firedFlags: string[];
  news2: { status: string; band: string | null; total: number | null };
  ai: null | {
    ok: boolean;
    attempts: number;
    schemaRetries: number;
    errorCode: string | null;
    groundingVerified: number;
    groundingTotal: number;
    ruleFlagsAddressed: number;
    ruleFlags: number;
    completeOutputs: boolean;
    aiFlagTitles: string[];
    aiMs: number | null;
    totalMs: number;
  };
};

export function runFromFindings(set: EvalSet, c: SyntheticCase, f: SafetyFindings): CaseRun {
  return {
    set,
    id: c.id,
    title: c.title,
    expectedFlags: c.expectedFlags,
    expectedNews2: c.expectedNews2,
    firedFlags: f.ruleFlags.map((r) => r.ruleId),
    news2: { status: f.news2.status, band: f.news2.band, total: f.news2.total },
    ai: null,
  };
}

export function runFromResult(set: EvalSet, c: SyntheticCase, r: AnalysisResult): CaseRun {
  const base = runFromFindings(set, c, r.safety);
  const ai = r.ai;
  const addressed = new Set((ai?.nextSteps ?? []).map((s) => s.addressesRedFlag).filter(Boolean));
  return {
    ...base,
    ai: {
      ok: ai !== null,
      attempts: r.aiAttempts,
      schemaRetries: r.aiSchemaRetries,
      errorCode: r.aiError?.code ?? null,
      groundingVerified: r.grounding?.verified ?? 0,
      groundingTotal: r.grounding?.total ?? 0,
      ruleFlagsAddressed: r.safety.ruleFlags.filter((f) => addressed.has(f.ruleId)).length,
      ruleFlags: r.safety.ruleFlags.length,
      completeOutputs:
        ai !== null &&
        ai.caseSummary.oneLiner.trim().length > 0 &&
        r.merged.missingInformation.length > 0 &&
        ai.nextSteps.length > 0,
      aiFlagTitles: r.merged.redFlags.filter((f) => f.source === 'ai').map((f) => f.title),
      aiMs: r.timings.aiMs,
      totalMs: r.timings.totalMs,
    },
  };
}

const ratio = (a: number, b: number) =>
  b === 0 ? 'n/a' : `${a}/${b} (${Math.round((a / b) * 1000) / 10}%)`;

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}

export type SetSummary = {
  cases: number;
  sensitivity: string;
  missed: Array<{ id: string; rule: string }>;
  falsePositives: Array<{ id: string; rule: string }>;
  benignSpecificity: string;
  news2Agreement: string;
  ai: null | {
    attempted: number;
    schemaFirst: string;
    schemaFinal: string;
    grounding: string;
    coherence: string;
    completeOutputs: string;
    aiAddedFlags: number;
    latencyP50: string;
    latencyP95: string;
  };
};

export function summarize(runs: CaseRun[]): SetSummary {
  let tp = 0;
  let expected = 0;
  const missed: SetSummary['missed'] = [];
  const falsePositives: SetSummary['falsePositives'] = [];
  let benign = 0;
  let benignClean = 0;
  let news2Ok = 0;
  for (const r of runs) {
    const fired = new Set(r.firedFlags);
    const exp = new Set(r.expectedFlags);
    expected += exp.size;
    for (const e of exp) {
      if (fired.has(e)) tp++;
      else missed.push({ id: r.id, rule: e });
    }
    for (const f of fired) if (!exp.has(f)) falsePositives.push({ id: r.id, rule: f });
    if (exp.size === 0) {
      benign++;
      if (fired.size === 0) benignClean++;
    }
    const n = r.expectedNews2;
    if (n && n.status === r.news2.status && n.band === r.news2.band && n.total === r.news2.total)
      news2Ok++;
  }
  const withAi = runs.filter((r) => r.ai !== null);
  let ai: SetSummary['ai'] = null;
  if (withAi.length > 0) {
    const a = withAi.map((r) => r.ai as NonNullable<CaseRun['ai']>);
    const gv = a.reduce((s, x) => s + x.groundingVerified, 0);
    const gt = a.reduce((s, x) => s + x.groundingTotal, 0);
    const okRuns = a.filter((x) => x.ok);
    const addressed = okRuns.reduce((s, x) => s + x.ruleFlagsAddressed, 0);
    const flags = okRuns.reduce((s, x) => s + x.ruleFlags, 0);
    const lat = a.map((x) => x.aiMs).filter((x): x is number => x !== null);
    const p50 = percentile(lat, 50);
    const p95 = percentile(lat, 95);
    ai = {
      attempted: a.length,
      schemaFirst: ratio(a.filter((x) => x.ok && x.schemaRetries === 0).length, a.length),
      schemaFinal: ratio(okRuns.length, a.length),
      grounding: ratio(gv, gt),
      coherence: ratio(addressed, flags),
      completeOutputs: ratio(a.filter((x) => x.completeOutputs).length, a.length),
      aiAddedFlags: a.reduce((s, x) => s + x.aiFlagTitles.length, 0),
      latencyP50: p50 === null ? 'n/a' : `${(p50 / 1000).toFixed(1)} s`,
      latencyP95: p95 === null ? 'n/a' : `${(p95 / 1000).toFixed(1)} s`,
    };
  }
  return {
    cases: runs.length,
    sensitivity: ratio(tp, expected),
    missed,
    falsePositives,
    benignSpecificity: ratio(benignClean, benign),
    news2Agreement: ratio(news2Ok, runs.filter((r) => r.expectedNews2 !== null).length),
    ai,
  };
}

export type ReportMeta = {
  date: string;
  mode: string;
  model: string | null;
  promptVersion: string;
  rulesVersion: string;
  runs: number;
};

export const MANUAL_START = '<!-- manual:start -->';
export const MANUAL_END = '<!-- manual:end -->';

const DEFAULT_MANUAL = `${MANUAL_START}
_Error analysis: for every missed flag, false positive or unverified quote, note what happened, why, and what would fix it. This section is kept when the report is regenerated._
${MANUAL_END}`;

export function extractManual(existing: string | null): string {
  if (!existing) return DEFAULT_MANUAL;
  const s = existing.indexOf(MANUAL_START);
  const e = existing.indexOf(MANUAL_END);
  if (s < 0 || e < s) return DEFAULT_MANUAL;
  return existing.slice(s, e + MANUAL_END.length);
}

const n2 = (x: { status: string; band: string | null; total: number | null } | null) =>
  x
    ? x.status === 'complete' || x.status === 'partial'
      ? `${x.total} ${x.band} (${x.status})`
      : x.status
    : 'n/a';

export function renderReport(meta: ReportMeta, runs: CaseRun[], existing: string | null): string {
  const dev = summarize(runs.filter((r) => r.set === 'dev'));
  const hold = runs.some((r) => r.set === 'holdout')
    ? summarize(runs.filter((r) => r.set === 'holdout'))
    : null;
  const col = (f: (s: SetSummary) => string | number) =>
    `${f(dev)} | ${hold ? f(hold) : 'pending'}`;
  const aiCol = (f: (s: NonNullable<SetSummary['ai']>) => string | number) =>
    `${dev.ai ? f(dev.ai) : 'not run'} | ${hold ? (hold.ai ? f(hold.ai) : 'not run') : 'pending'}`;
  const L: string[] = [];
  L.push('# Evaluation report', '');
  L.push(
    'Generated by `npm run eval` or the `/lab` page. Everything outside the error-analysis section is regenerated.',
    '',
  );
  L.push('| Run | Value |', '|---|---|');
  L.push(`| Date | ${meta.date} |`);
  L.push(`| Mode | ${meta.mode} |`);
  L.push(`| Model | ${meta.model ?? 'none (rule layer only)'} |`);
  L.push(`| Prompt version | ${meta.promptVersion} |`);
  L.push(`| Rules version | ${meta.rulesVersion} |`);
  L.push(`| Cases | development ${dev.cases}, held-out ${hold?.cases ?? 0} |`);
  L.push(`| Runs per case | ${meta.runs} |`, '');

  L.push('## Summary', '');
  L.push(
    'The development set was used to build the rules, so its rule metrics are expected to be high and are not a measure of generalisation. The held-out sets were written by independent authors against frozen rules; their first, clean results and any fixes made afterwards are listed in the error-analysis section below, so the held-out column here reflects the current rules after those fixes.',
    '',
  );
  L.push('| Metric | Development | Held-out |', '|---|---|---|');
  L.push(`| Rule sensitivity (expected flags found) | ${col((s) => s.sensitivity)} |`);
  L.push(`| Rule false positives | ${col((s) => s.falsePositives.length)} |`);
  L.push(`| Benign cases with no flags | ${col((s) => s.benignSpecificity)} |`);
  L.push(`| NEWS2 agreement | ${col((s) => s.news2Agreement)} |`);
  L.push(`| Schema valid on first attempt | ${aiCol((a) => a.schemaFirst)} |`);
  L.push(`| Schema valid after one retry | ${aiCol((a) => a.schemaFinal)} |`);
  L.push(`| AI quotes found word for word | ${aiCol((a) => a.grounding)} |`);
  L.push(`| Rule flags addressed by a next step | ${aiCol((a) => a.coherence)} |`);
  L.push(`| Cases with all outputs present | ${aiCol((a) => a.completeOutputs)} |`);
  L.push(`| AI-added red flags | ${aiCol((a) => a.aiAddedFlags)} |`);
  L.push(`| AI latency p50 / p95 | ${aiCol((a) => `${a.latencyP50} / ${a.latencyP95}`)} |`, '');

  const misses = [
    ...dev.missed.map((m) => ({ ...m, set: 'dev' })),
    ...(hold?.missed ?? []).map((m) => ({ ...m, set: 'holdout' })),
  ];
  const fps = [
    ...dev.falsePositives.map((m) => ({ ...m, set: 'dev' })),
    ...(hold?.falsePositives ?? []).map((m) => ({ ...m, set: 'holdout' })),
  ];
  L.push('## Rule misses and false positives', '');
  if (misses.length === 0 && fps.length === 0) L.push('None.', '');
  else {
    for (const m of misses) L.push(`- Missed ${m.rule} in ${m.set} case ${m.id}`);
    for (const f of fps) L.push(`- Unexpected ${f.rule} in ${f.set} case ${f.id}`);
    L.push('');
  }

  L.push('## Per-case results', '');
  L.push(
    '| Set | Case | Expected flags | Fired flags | NEWS2 expected | NEWS2 result | AI | Quotes verified | AI time |',
  );
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of runs) {
    const ai = r.ai;
    L.push(
      `| ${r.set} | ${r.id} ${r.title} | ${r.expectedFlags.join(', ') || 'none'} | ${r.firedFlags.join(', ') || 'none'} | ${n2(r.expectedNews2)} | ${n2(r.news2)} | ${
        ai
          ? ai.ok
            ? `ok${ai.schemaRetries > 0 ? ` (${ai.schemaRetries} schema retry)` : ''}`
            : (ai.errorCode ?? 'failed')
          : 'not run'
      } | ${ai ? `${ai.groundingVerified}/${ai.groundingTotal}` : 'n/a'} | ${ai?.aiMs != null ? `${(ai.aiMs / 1000).toFixed(1)} s` : 'n/a'} |`,
    );
  }
  L.push('');

  const added = runs.filter((r) => (r.ai?.aiFlagTitles.length ?? 0) > 0);
  L.push('## AI-added red flags (for manual review)', '');
  if (added.length === 0) L.push('None.', '');
  else {
    for (const r of added) L.push(`- ${r.set} ${r.id}: ${r.ai?.aiFlagTitles.join('; ')}`);
    L.push('');
  }

  L.push('## Error analysis', '', extractManual(existing), '');
  return L.join('\n');
}
