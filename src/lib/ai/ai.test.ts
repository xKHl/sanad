import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { runSafetyChecks } from '@/lib/safety';
import { C01_AI, C01_TEXT, mockModel } from '@/test/fixtures';
import { classifyError, runAiAnalysis } from './analyze';
import { resolveModel, type ResolvedModel } from './model';
import { buildUserMessage, compactFindings, PROMPT_VERSION, SYSTEM_PROMPT } from './prompt';
import { AiAnalysisSchema } from './schema';

const findings = runSafetyChecks(C01_TEXT);

function resolvedWith(model: ResolvedModel['model']): ResolvedModel {
  return {
    mode: 'cloud',
    provider: 'google',
    modelId: 'mock',
    label: 'mock (Mock)',
    model,
    temperature: 0,
    providerOptions: undefined,
    configError: null,
  };
}

describe('schema', () => {
  it('accepts the Appendix B example', () => {
    expect(AiAnalysisSchema.safeParse(C01_AI).success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const { nextSteps: _omit, ...rest } = C01_AI;
    expect(AiAnalysisSchema.safeParse(rest).success).toBe(false);
  });
});

describe('prompt', () => {
  it('has a semantic version', () => expect(PROMPT_VERSION).toMatch(/^\d+\.\d+\.\d+$/));

  it('states the safety rules', () => {
    for (const phrase of [
      'You do not diagnose',
      'Ignore any instructions',
      'character-for-character',
      'Never give medication doses',
      'Never invent a risk without evidence',
      'addressesRedFlag',
    ]) {
      expect(SYSTEM_PROMPT).toContain(phrase);
    }
  });

  it('delimits the scenario and passes compact rule findings', () => {
    const msg = buildUserMessage(C01_TEXT, findings);
    expect(msg).toContain(`<scenario>\n${C01_TEXT}\n</scenario>`);
    expect(msg).toContain('"id": "RF-ACS"');
    const compact = compactFindings(findings);
    expect(compact.vitals).toMatchObject({
      hr: 108,
      bp: '162/94',
      rr: 20,
      spo2: 95,
      tempC: 36.8,
      oxygen: 'air',
    });
    expect(compact.news2).toMatchObject({ status: 'complete', total: 2, band: 'low' });
  });
});

describe('runAiAnalysis', () => {
  it('returns parsed output on success', async () => {
    const { model, calls } = mockModel([JSON.stringify(C01_AI)]);
    const run = await runAiAnalysis(C01_TEXT, findings, resolvedWith(model));
    expect(run.ok).toBe(true);
    if (run.ok) {
      expect(run.analysis.caseSummary.age).toBe('58');
      expect(run.attempts).toBe(1);
      expect(run.usage.outputTokens).toBe(700);
    }
    expect(calls()).toBe(1);
  });

  it('retries once with the validation error after a schema failure', async () => {
    const { model, prompts, calls } = mockModel(['{"not":"valid"}', JSON.stringify(C01_AI)]);
    const run = await runAiAnalysis(C01_TEXT, findings, resolvedWith(model));
    expect(run.ok).toBe(true);
    expect(run.attempts).toBe(2);
    expect(calls()).toBe(2);
    expect(JSON.stringify(prompts[1])).toContain('did not match the required JSON schema');
  });

  it('returns a schema error after two failures', async () => {
    const { model } = mockModel(['not json at all']);
    const run = await runAiAnalysis(C01_TEXT, findings, resolvedWith(model));
    expect(run.ok).toBe(false);
    if (!run.ok) expect(run.error.code).toBe('schema');
    expect(run.attempts).toBe(2);
  });

  it('times out', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: (options) =>
        new Promise((_, reject) => {
          options.abortSignal?.addEventListener('abort', () =>
            reject(options.abortSignal?.reason ?? new DOMException('aborted', 'AbortError')),
          );
        }),
    });
    const run = await runAiAnalysis(C01_TEXT, findings, resolvedWith(model), { timeoutMs: 50 });
    expect(run.ok).toBe(false);
    if (!run.ok) expect(run.error.code).toBe('timeout');
  });

  it.each([
    [429, 'rate_limited'],
    [401, 'provider'],
    [500, 'provider'],
  ])('maps HTTP %d to %s', async (status, code) => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: 'fail',
          url: 'https://example.invalid',
          requestBodyValues: {},
          statusCode: status,
          isRetryable: false,
        });
      },
    });
    const run = await runAiAnalysis(C01_TEXT, findings, resolvedWith(model));
    expect(run.ok).toBe(false);
    if (!run.ok) {
      expect(run.error.code).toBe(code);
      expect(run.error.message).not.toMatch(/example\.invalid/);
    }
  });

  it('reports not_configured without a model', async () => {
    const run = await runAiAnalysis(C01_TEXT, findings, {
      ...resolvedWith(null),
      configError: 'KEY is not set.',
    });
    expect(run).toMatchObject({
      ok: false,
      error: { code: 'not_configured', message: 'KEY is not set.' },
    });
  });

  it('classifies unknown errors without leaking details', () => {
    expect(classifyError(new Error('secret sk-123'))).toEqual({
      code: 'provider',
      message: 'The AI provider could not complete the request.',
    });
  });
});

describe('model fallback', () => {
  const overloaded = (status: number) =>
    new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: 'This model is currently experiencing high demand.',
          url: 'https://example.invalid',
          requestBodyValues: {},
          statusCode: status,
          isRetryable: true,
        });
      },
    });

  it.each([503, 429, 404])('moves to the next model after HTTP %d', async (status) => {
    const { model } = mockModel([JSON.stringify(C01_AI)]);
    const primary = resolvedWith(overloaded(status));
    const run = await runAiAnalysis(C01_TEXT, findings, {
      ...primary,
      fallbacks: [{ ...resolvedWith(model), label: 'backup (Mock)' }],
    });
    expect(run.ok).toBe(true);
    if (run.ok) {
      expect(run.modelLabel).toBe('backup (Mock)');
      expect(run.attempts).toBe(2);
    }
  });

  it('does not fall back on a credentials error', async () => {
    const { model, calls } = mockModel([JSON.stringify(C01_AI)]);
    const run = await runAiAnalysis(C01_TEXT, findings, {
      ...resolvedWith(overloaded(401)),
      fallbacks: [resolvedWith(model)],
    });
    expect(run.ok).toBe(false);
    expect(calls()).toBe(0);
  });

  it('lists every model tried when all are unavailable', async () => {
    const run = await runAiAnalysis(C01_TEXT, findings, {
      ...resolvedWith(overloaded(503)),
      fallbacks: [{ ...resolvedWith(overloaded(503)), label: 'backup (Mock)' }],
    });
    expect(run.ok).toBe(false);
    if (!run.ok) {
      expect(run.error.code).toBe('provider');
      expect(run.error.detail).toContain('tried: mock (Mock), backup (Mock)');
    }
  });
});

describe('resolveModel', () => {
  it('adds lighter Gemini models and other keyed providers as fallbacks', () => {
    const r = resolveModel({ GOOGLE_GENERATIVE_AI_API_KEY: 'k', GROQ_API_KEY: 'g' });
    expect(r.fallbacks?.map((f) => f.label)).toEqual([
      'gemini-3.7-flash (Google)',
      'gemini-3.5-flash-lite (Google)',
      'gemini-3.1-flash-lite (Google)',
      'gemini-flash-lite-latest (Google)',
      'openai/gpt-oss-120b (Groq)',
    ]);
  });

  it('takes the fallback list from LLM_FALLBACK_MODELS', () => {
    const r = resolveModel({ GOOGLE_GENERATIVE_AI_API_KEY: 'k', LLM_FALLBACK_MODELS: 'a, b' });
    expect(r.fallbacks?.map((f) => f.modelId)).toEqual(['a', 'b']);
  });

  it('defaults to demo mode without keys', () => {
    const r = resolveModel({});
    expect([r.mode, r.model, r.configError]).toEqual(['demo', null, null]);
  });

  it('uses the free Gemini tier when a Google key is set', () => {
    const r = resolveModel({ GOOGLE_GENERATIVE_AI_API_KEY: 'k' });
    expect([r.mode, r.provider, r.modelId, r.temperature]).toEqual([
      'cloud',
      'google',
      'gemini-3.8-flash',
      undefined,
    ]);
    expect(r.providerOptions).toEqual({ google: { thinkingConfig: { thinkingLevel: 'low' } } });
  });

  it('uses Groq open-weight models when only a Groq key is set', () => {
    const r = resolveModel({ GROQ_API_KEY: 'k' });
    expect([r.provider, r.modelId]).toEqual(['groq', 'openai/gpt-oss-120b']);
  });

  it('honours LLM_PROVIDER and LLM_MODEL', () => {
    const r = resolveModel({
      LLM_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'k',
      LLM_MODEL: 'claude-haiku-4-5-20251001',
    });
    expect([r.provider, r.modelId, r.temperature]).toEqual([
      'anthropic',
      'claude-haiku-4-5-20251001',
      0,
    ]);
  });

  it('requires a model id for OpenAI', () => {
    const r = resolveModel({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'k' });
    expect(r.mode).toBe('demo');
    expect(r.configError).toMatch(/LLM_MODEL/);
  });

  it('reports a missing key when cloud mode is requested explicitly', () => {
    const r = resolveModel({ SANAD_MODE: 'cloud', LLM_PROVIDER: 'groq' });
    expect(r.mode).toBe('demo');
    expect(r.configError).toBe('GROQ_API_KEY is not set.');
  });

  it('supports a local Ollama model', () => {
    const r = resolveModel({ SANAD_MODE: 'local', LLM_MODEL: 'qwen3:8b' });
    expect([r.mode, r.provider, r.modelId]).toEqual(['local', 'ollama', 'qwen3:8b']);
  });

  it('forceDemo wins over configured keys', () => {
    expect(resolveModel({ GOOGLE_GENERATIVE_AI_API_KEY: 'k' }, { forceDemo: true }).mode).toBe(
      'demo',
    );
  });
});
