import type { AnalysisResult } from '@/lib/pipeline/types';

/** One JSON line per request with metadata only. Case text is never logged (SPEC §11). */
export function logAnalysis(r: AnalysisResult, route: string): void {
  const line = {
    event: 'analysis',
    route,
    requestId: r.requestId,
    mode: r.mode,
    model: r.model,
    safetyMs: r.timings.safetyMs,
    aiMs: r.timings.aiMs,
    totalMs: r.timings.totalMs,
    ruleFlagIds: r.safety.ruleFlags.map((f) => f.ruleId),
    aiFlagCount: r.merged.redFlags.filter((f) => f.source === 'ai').length,
    groundingVerified: r.grounding?.verified ?? null,
    groundingTotal: r.grounding?.total ?? null,
    aiErrorCode: r.aiError?.code ?? null,
    redactions: r.redactions.reduce((n, x) => n + x.count, 0),
  };
  console.info(JSON.stringify(line));
}
