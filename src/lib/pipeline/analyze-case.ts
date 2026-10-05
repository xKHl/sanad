import { z } from 'zod';
import { runAiAnalysis, type AiError, type AiRun } from '@/lib/ai/analyze';
import { resolveModel, type ResolvedModel } from '@/lib/ai/model';
import { PROMPT_VERSION } from '@/lib/ai/prompt';
import { findRecording, type Recording } from '@/lib/ai/recordings';
import type { AiAnalysis } from '@/lib/ai/schema';
import { countByType, redactIdentifiers } from '@/lib/safety/phi';
import { runSafetyChecks } from '@/lib/safety';
import type { SafetyFindings } from '@/lib/safety/types';
import { groundAnalysis } from './grounding';
import { completeness, mergeMissingInfo, mergeRedFlags, postProcess, safetyStatus } from './merge';
import type { AnalysisResult } from './types';

export const SCENARIO_MIN = 20;
export const SCENARIO_MAX = 3000;

export const AnalyzeRequestSchema = z.object({
  scenario: z
    .string()
    .trim()
    .min(SCENARIO_MIN, `Scenario must be at least ${SCENARIO_MIN} characters.`)
    .max(SCENARIO_MAX, `Scenario must be at most ${SCENARIO_MAX} characters.`),
  forceDemo: z.boolean().optional(),
});

type Env = Record<string, string | undefined>;

export type AnalyzeDeps = {
  env?: Env;
  resolve?: (env: Env, options: { forceDemo?: boolean }) => ResolvedModel;
  runAi?: (text: string, findings: SafetyFindings, resolved: ResolvedModel) => Promise<AiRun>;
  findRecording?: (scenario: string) => Recording | null;
};

/** Orchestrate one analysis (SPEC §7.1). Never throws for AI failures. */
export async function analyzeCase(
  scenario: string,
  options: { forceDemo?: boolean } = {},
  deps: AnalyzeDeps = {},
): Promise<AnalysisResult> {
  const t0 = Date.now();
  const env = deps.env ?? process.env;
  const warnings: string[] = [];

  const { text: analyzedText, findings: phi } = redactIdentifiers(scenario.trim());
  const safety = runSafetyChecks(analyzedText);
  warnings.push(...safety.vitals.warnings);

  const resolved = (deps.resolve ?? resolveModel)(env, { forceDemo: options.forceDemo });
  let ai: AiAnalysis | null = null;
  let aiError: AiError | null = null;
  let aiMs: number | null = null;
  let attempts = 0;
  let modelLabel: string | null = resolved.mode === 'demo' ? null : resolved.label;

  if (resolved.mode === 'demo') {
    const recording = (deps.findRecording ?? findRecording)(analyzedText);
    if (recording) {
      ai = recording.ai;
      modelLabel = `${recording.model}, recorded ${recording.recordedAt.slice(0, 10)}`;
      if (recording.promptVersion !== PROMPT_VERSION) {
        warnings.push(
          `This recording was made with prompt v${recording.promptVersion}; the current prompt is v${PROMPT_VERSION}. Re-record demo outputs.`,
        );
      }
    } else if (resolved.configError) {
      aiError = { code: 'not_configured', message: resolved.configError };
    } else {
      aiError = {
        code: 'demo_unavailable',
        message:
          'No recorded AI output exists for this case. Recordings cover the sample cases only.',
      };
    }
  } else {
    const run = await (deps.runAi ?? runAiAnalysis)(analyzedText, safety, resolved);
    attempts = run.attempts;
    aiMs = run.latencyMs;
    if (run.ok) ai = run.analysis;
    else aiError = run.error;
  }

  if (ai) ai = postProcess(ai);
  const grounding = ai ? groundAnalysis(ai, analyzedText) : null;
  const unverified = grounding ? grounding.total - grounding.verified : 0;
  if (unverified > 0)
    warnings.push(
      `${unverified} AI quote(s) were not found verbatim in the scenario and are marked.`,
    );

  const { flags, warnings: mergeWarnings } = mergeRedFlags(analyzedText, safety.ruleFlags, ai);
  warnings.push(...mergeWarnings);

  return {
    requestId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    mode: resolved.mode,
    model: modelLabel,
    promptVersion: PROMPT_VERSION,
    rulesVersion: safety.rulesVersion,
    analyzedText,
    redactions: countByType(phi),
    safety,
    ai,
    aiError,
    aiAttempts: attempts,
    merged: {
      safetyStatus: safetyStatus(flags),
      redFlags: flags,
      missingInformation: mergeMissingInfo(safety.requiredInfo, ai),
    },
    grounding,
    completeness: ai ? completeness(ai) : null,
    timings: { safetyMs: safety.timingMs, aiMs, totalMs: Date.now() - t0 },
    warnings,
  };
}
