import { describe, expect, it } from 'vitest';
import { DEV_CASES } from '@/data/cases/dev';
import { runSafetyChecks } from '@/lib/safety';
import {
  extractManual,
  MANUAL_END,
  MANUAL_START,
  renderReport,
  runFromFindings,
  summarize,
} from './report';

const runs = DEV_CASES.map((c) => runFromFindings('dev', c, runSafetyChecks(c.scenario)));
const meta = {
  date: '2026-10-05 08:00 UTC',
  mode: 'rules only',
  model: null,
  promptVersion: '1.0.0',
  rulesVersion: '1.0.0',
  runs: 1,
};

describe('evaluation report', () => {
  it('summarises the development set', () => {
    const s = summarize(runs);
    expect(s.sensitivity).toBe('21/21 (100%)');
    expect(s.falsePositives).toEqual([]);
    expect(s.benignSpecificity).toBe('2/2 (100%)');
    expect(s.news2Agreement).toBe('16/16 (100%)');
    expect(s.ai).toBeNull();
  });

  it('reports misses and false positives', () => {
    const tampered = runs.map((r) => (r.id === 'C01' ? { ...r, firedFlags: ['RF-PE'] } : r));
    const s = summarize(tampered);
    expect(s.missed).toEqual([{ id: 'C01', rule: 'RF-ACS' }]);
    expect(s.falsePositives).toEqual([{ id: 'C01', rule: 'RF-PE' }]);
  });

  it('renders markdown, marks held-out as pending and keeps the manual section', () => {
    const existing = `old\n${MANUAL_START}\nMy notes\n${MANUAL_END}\nold`;
    const md = renderReport(meta, runs, existing);
    expect(md).toContain('| Rule sensitivity (expected flags found) | 21/21 (100%) | pending |');
    expect(md).toContain('My notes');
    expect(md).toContain(
      '| dev | C01 Exertional chest pain | RF-ACS | RF-ACS | 2 low (complete) | 2 low (complete) | not run |',
    );
    expect(extractManual(null)).toContain(MANUAL_START);
  });
});
