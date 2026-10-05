import { describe, expect, it } from 'vitest';
import { DEV_CASES } from '@/data/cases/dev';
import { RULES_VERSION, runSafetyChecks } from './index';

describe('golden set: 16 development cases (SPEC Appendix A)', () => {
  it.each(DEV_CASES.map((c) => [c.id, c.title, c] as const))('%s %s', (_id, _title, c) => {
    const f = runSafetyChecks(c.scenario);
    expect(f.ruleFlags.map((r) => r.ruleId).sort()).toEqual([...c.expectedFlags].sort());
    expect({ status: f.news2.status, band: f.news2.band, total: f.news2.total }).toEqual(c.expectedNews2);
  });

  it('every rule flag carries evidence that points into the text', () => {
    for (const c of DEV_CASES) {
      for (const flag of runSafetyChecks(c.scenario).ruleFlags) {
        expect(flag.evidence.length, `${c.id} ${flag.ruleId}`).toBeGreaterThan(0);
        for (const e of flag.evidence) expect(c.scenario.slice(e.start, e.end)).toBe(e.text);
      }
    }
  });
});

describe('runSafetyChecks', () => {
  it('reports the rules version and count', () => {
    const f = runSafetyChecks('24F, sore throat.');
    expect(f.rulesVersion).toBe(RULES_VERSION);
    expect(f.rulesEvaluated).toBe(30);
  });

  it('runs in under 50 ms for 3,000 characters', () => {
    const text = DEV_CASES.map((c) => c.scenario).join(' ').slice(0, 3000);
    runSafetyChecks(text); // warm-up
    const t0 = performance.now();
    runSafetyChecks(text);
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it('warns that the rule layer reads English only when the text is mostly Arabic', () => {
    expect(runSafetyChecks('مريض عمره ٥٨ سنة يعاني من ألم في الصدر منذ ساعتين').languageWarning).toMatch(/English/);
    expect(runSafetyChecks('58M, chest pain').languageWarning).toBeNull();
  });

  it('is deterministic', () => {
    const c = DEV_CASES[2];
    if (!c) throw new Error('missing case');
    const a = runSafetyChecks(c.scenario);
    const b = runSafetyChecks(c.scenario);
    expect({ ...a, timingMs: 0 }).toEqual({ ...b, timingMs: 0 });
  });
});
