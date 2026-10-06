import { describe, expect, it } from 'vitest';
import { analyzeCase } from '@/lib/pipeline/analyze-case';
import type { ResolvedModel } from '@/lib/ai/model';
import { C01_AI, C01_TEXT } from '@/test/fixtures';
import { formatNote } from './note';

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

describe('formatNote', () => {
  it('contains every section and the review state', async () => {
    const r = await analyzeCase(
      C01_TEXT,
      {},
      {
        resolve: () => cloud,
        runAi: async () => ({
          ok: true,
          analysis: C01_AI,
          attempts: 1,
          latencyMs: 1,
          modelLabel: 'mock (Mock)',
          usage: { inputTokens: 1, outputTokens: 1 },
        }),
      },
    );
    const note = formatNote(r, new Set([0]));
    expect(note).toContain('[CRITICAL] Possible acute coronary syndrome (rule RF-ACS)');
    expect(note).toContain('NEWS2: 2 (low), complete');
    expect(note).toContain('CASE SUMMARY');
    expect(note).toContain('- Allergies: Not stated');
    expect(note).toContain('NEXT STEPS (1/3 reviewed)');
    expect(note).toContain('[x] Immediate: Obtain a 12-lead ECG now');
    expect(note).toContain('[ ] Today: Document symptom onset time');
    expect(note.trim().endsWith('Synthetic data only. Not a diagnostic device.')).toBe(true);
  });

  it('works without AI output', async () => {
    const r = await analyzeCase(
      '62M routine follow-up. BP 186/112, HR 76.',
      {},
      {
        resolve: () => cloud,
        runAi: async () => ({
          ok: false,
          error: { code: 'timeout', message: 'slow' },
          attempts: 1,
          latencyMs: 1,
        }),
        findRecording: () => null,
      },
    );
    const note = formatNote(r);
    expect(note).toContain('[URGENT] Severe hypertension (rule RF-HTN-SEVERE)');
    expect(note).toContain('NEWS2: not calculated');
    expect(note).not.toContain('CASE SUMMARY');
  });
});
