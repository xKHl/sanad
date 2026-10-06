import { describe, expect, it } from 'vitest';
import type { AiRun } from '@/lib/ai/analyze';
import type { ResolvedModel } from '@/lib/ai/model';
import { PROMPT_VERSION } from '@/lib/ai/prompt';
import type { AiAnalysis } from '@/lib/ai/schema';
import { C01_AI, C01_TEXT } from '@/test/fixtures';
import { analyzeCase, type AnalyzeDeps } from './analyze-case';
import { findSpan, normalize, verifyQuote } from './grounding';
import { postProcess } from './merge';

const cloud: ResolvedModel = {
  mode: 'cloud',
  provider: 'google',
  modelId: 'mock',
  label: 'mock (Mock)',
  model: null,
  temperature: 0,
  providerOptions: undefined,
  configError: null,
};
const demo: ResolvedModel = {
  ...cloud,
  mode: 'demo',
  provider: null,
  modelId: null,
  label: 'Demo',
};

function withAi(ai: AiAnalysis, seen?: string[]): AnalyzeDeps {
  return {
    resolve: () => cloud,
    runAi: async (text): Promise<AiRun> => {
      seen?.push(text);
      return {
        ok: true,
        analysis: ai,
        attempts: 1,
        latencyMs: 5,
        modelLabel: 'mock (Mock)',
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    },
  };
}

describe('grounding', () => {
  it('normalises case, whitespace, quotes and dashes', () => {
    expect(normalize('  “Worst   HEADACHE” — ever. ')).toBe('worst headache" - ever');
  });

  it.each([
    ['central chest pressure for 2 hours', true],
    ['Central  Chest Pressure', true],
    ['sweaty and nauseated.', true],
    ['crushing chest pain', false],
    ['58', false],
  ])('verifyQuote(%s) = %s', (q, ok) => expect(verifyQuote(C01_TEXT, q)).toBe(ok));

  it('maps a match back to the original text', () => {
    const text = 'Pain   radiating to\nleft arm.';
    const span = findSpan(text, 'radiating to left arm');
    expect(span).not.toBeNull();
    expect(text.slice(span?.start, span?.end)).toBe('radiating to\nleft arm');
  });
});

describe('analyzeCase', () => {
  it('returns all four outputs with rule flags first', async () => {
    const r = await analyzeCase(C01_TEXT, {}, withAi(C01_AI));
    expect(r.mode).toBe('cloud');
    expect(r.ai?.caseSummary.oneLiner).toMatch(/58-year-old/);
    expect(r.merged.redFlags[0]).toMatchObject({
      source: 'rule',
      id: 'RF-ACS',
      severity: 'critical',
    });
    expect(r.merged.safetyStatus).toBe('critical');
    expect(r.merged.missingInformation.length).toBeGreaterThan(0);
    expect(r.ai?.nextSteps.length).toBeGreaterThan(0);
    expect(r.grounding).toMatchObject({ total: 9, verified: 9 });
    expect(r.completeness).toEqual({ stated: 6, total: 9 });
    expect(r.promptVersion).toBe(PROMPT_VERSION);
  });

  it('sorts next steps by urgency after parsing', async () => {
    const r = await analyzeCase(C01_TEXT, {}, withAi(C01_AI));
    expect(r.ai?.nextSteps.map((s) => s.urgency)).toEqual(['immediate', 'immediate', 'today']);
  });

  it('drops AI missing-information items that duplicate a rule item', async () => {
    const r = await analyzeCase(C01_TEXT, {}, withAi(C01_AI));
    const ids = r.merged.missingInformation.map((m) => m.id);
    expect(ids).toContain('RI-ALLERGIES');
    expect(r.merged.missingInformation.filter((m) => /allerg/i.test(m.question))).toHaveLength(1);
    expect(r.merged.missingInformation[0]?.priority).toBe('high');
  });

  it('keeps AI red flags only with verified evidence and not duplicating a rule', async () => {
    const ai: AiAnalysis = {
      ...C01_AI,
      additionalRedFlags: [
        {
          title: 'Invented risk',
          severity: 'critical',
          evidence: ['crushing pain in the back'],
          recommendedAction: 'x',
        },
        {
          title: 'Possible acute coronary syndrome',
          severity: 'critical',
          evidence: ['sweaty'],
          recommendedAction: 'x',
        },
        {
          title: 'Tachycardia',
          severity: 'urgent',
          evidence: ['HR 108'],
          recommendedAction: 'Repeat observations.',
        },
      ],
    };
    const r = await analyzeCase(C01_TEXT, {}, withAi(ai));
    const aiFlags = r.merged.redFlags.filter((f) => f.source === 'ai');
    expect(aiFlags).toHaveLength(1);
    expect(aiFlags[0]).toMatchObject({ id: 'AI-1', title: 'Tachycardia' });
    expect(r.warnings.join(' ')).toMatch(/no evidence quote/);
    expect(r.warnings.join(' ')).toMatch(/already covered by a rule/);
    expect(r.merged.redFlags.map((f) => f.source)).toEqual(['rule', 'ai']);
  });

  it('cannot remove or downgrade rule flags', async () => {
    const ai: AiAnalysis = { ...C01_AI, additionalRedFlags: [] };
    const r = await analyzeCase(C01_TEXT, {}, withAi(ai));
    expect(r.merged.redFlags.find((f) => f.id === 'RF-ACS')?.severity).toBe('critical');
  });

  it('marks unverified summary quotes', async () => {
    const ai: AiAnalysis = {
      ...C01_AI,
      caseSummary: {
        ...C01_AI.caseSummary,
        pastMedicalHistory: [{ text: 'Hypertension', evidence: 'known hypertension' }],
      },
    };
    const r = await analyzeCase(C01_TEXT, {}, withAi(ai));
    const item = r.grounding?.items.find((i) => i.path === 'caseSummary.pastMedicalHistory[0]');
    expect(item).toMatchObject({ verified: false, span: null });
    expect(r.warnings.join(' ')).toMatch(/not found verbatim/);
  });

  it('keeps full safety findings when the AI fails', async () => {
    const r = await analyzeCase(
      C01_TEXT,
      {},
      {
        resolve: () => cloud,
        runAi: async () => ({
          ok: false,
          error: { code: 'timeout', message: 'slow' },
          attempts: 1,
          latencyMs: 45000,
        }),
        findRecording: () => null,
      },
    );
    expect(r.ai).toBeNull();
    expect(r.aiError?.code).toBe('timeout');
    expect(r.merged.redFlags.map((f) => f.id)).toEqual(['RF-ACS']);
    expect(r.safety.news2.total).toBe(2);
    expect(r.merged.missingInformation.every((m) => m.source === 'rule')).toBe(true);
  });

  it('falls back to a recording of the same case when every live model fails', async () => {
    const failing = async (): Promise<AiRun> => ({
      ok: false,
      error: { code: 'provider', message: 'The AI model is busy right now.' },
      attempts: 3,
      latencyMs: 9000,
    });
    const recording = {
      ai: C01_AI,
      model: 'gemini-3.8-flash (Google)',
      promptVersion: PROMPT_VERSION,
      recordedAt: '2026-10-06T10:00:00Z',
    };
    const r = await analyzeCase(
      C01_TEXT,
      {},
      { resolve: () => cloud, runAi: failing, findRecording: () => recording },
    );
    expect(r.aiError).toBeNull();
    expect(r.aiSource).toBe('recording');
    expect(r.model).toBe('gemini-3.8-flash (Google), recorded 2026-10-06');
    expect(r.warnings.join(' ')).toMatch(/live AI model was unavailable/);

    const stale = await analyzeCase(
      C01_TEXT,
      {},
      {
        resolve: () => cloud,
        runAi: failing,
        findRecording: () => ({ ...recording, promptVersion: '0.0.1' }),
      },
    );
    expect(stale.ai).toBeNull();
    expect(stale.aiError?.code).toBe('provider');
  });

  it('redacts identifiers before the AI sees the text', async () => {
    const seen: string[] = [];
    const r = await analyzeCase(
      `Name: Ahmed Saleh. ${C01_TEXT} Call 0551234567.`,
      {},
      withAi(C01_AI, seen),
    );
    expect(seen[0]).toContain('[NAME]');
    expect(seen[0]).toContain('[PHONE]');
    expect(seen[0]).not.toContain('0551234567');
    expect(r.analyzedText).not.toContain('Ahmed');
    expect(r.redactions).toEqual([
      { type: 'name', count: 1 },
      { type: 'phone', count: 1 },
    ]);
  });

  it('serves recordings in demo mode with the recording date', async () => {
    const r = await analyzeCase(
      C01_TEXT,
      { forceDemo: true },
      {
        resolve: () => demo,
        findRecording: () => ({
          ai: C01_AI,
          model: 'gemini-3.8-flash (Google)',
          promptVersion: PROMPT_VERSION,
          recordedAt: '2026-10-06T10:00:00Z',
        }),
      },
    );
    expect(r.mode).toBe('demo');
    expect(r.model).toBe('gemini-3.8-flash (Google), recorded 2026-10-06');
    expect(r.ai).not.toBeNull();
    expect(r.warnings.join(' ')).not.toMatch(/Re-record/);
  });

  it('warns when a recording was made with another prompt version', async () => {
    const r = await analyzeCase(
      C01_TEXT,
      {},
      {
        resolve: () => demo,
        findRecording: () => ({
          ai: C01_AI,
          model: 'm',
          promptVersion: '0.9.0',
          recordedAt: '2026-10-06T10:00:00Z',
        }),
      },
    );
    expect(r.warnings.join(' ')).toMatch(/Re-record demo outputs/);
  });

  it('explains when demo mode has no recording for a custom case', async () => {
    const r = await analyzeCase(C01_TEXT, {}, { resolve: () => demo, findRecording: () => null });
    expect(r.aiError).toEqual({
      code: 'demo_unavailable',
      message:
        'No recorded AI output exists for this case. Recordings cover the sample cases only.',
    });
    expect(r.merged.redFlags).toHaveLength(1);
  });

  it('reports a configuration problem in demo mode', async () => {
    const r = await analyzeCase(
      C01_TEXT,
      {},
      {
        resolve: () => ({ ...demo, configError: 'GROQ_API_KEY is not set.' }),
        findRecording: () => null,
      },
    );
    expect(r.aiError).toEqual({ code: 'not_configured', message: 'GROQ_API_KEY is not set.' });
  });
});

describe('postProcess limits (SPEC §7.7)', () => {
  it('truncates lists and long strings', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({
      action: `Step ${i} ${'x'.repeat(400)}`,
      rationale: 'r',
      category: 'assessment' as const,
      urgency: (i % 2 ? 'routine' : 'immediate') as 'routine' | 'immediate',
      addressesRedFlag: null,
    }));
    const out = postProcess({
      ...C01_AI,
      nextSteps: many,
      missingInformation: Array.from({ length: 11 }, () => C01_AI.missingInformation[0]!),
    });
    expect(out.nextSteps).toHaveLength(10);
    expect(out.nextSteps[0]?.urgency).toBe('immediate');
    expect(out.nextSteps.at(-1)?.urgency).toBe('routine');
    expect(out.nextSteps[0]?.action.length).toBeLessThanOrEqual(300);
    expect(out.missingInformation).toHaveLength(8);
  });
});
