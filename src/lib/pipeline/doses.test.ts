import { describe, expect, it } from 'vitest';
import { C01_AI } from '@/test/fixtures';
import { removeDoses, stripDoses } from './doses';

describe('dose guard', () => {
  it.each([
    [
      'Administer chewable aspirin 300 mg per protocol, unless contraindicated',
      'Administer chewable aspirin per protocol, unless contraindicated',
    ],
    ['Give paracetamol 1 g', 'Give paracetamol per local protocol'],
    ['Start oxygen at 15 L/min via non-rebreather', 'Start oxygen via non-rebreather per local protocol'],
    ['Consider IV fluids 500 ml bolus.', 'Consider IV fluids bolus per local protocol'],
    ['Adrenaline 0.5 mg IM (1:1000) now', 'Adrenaline IM (1:1000) now per local protocol'],
    ['Insulin 0.1 units/kg/hr per DKA protocol', 'Insulin per DKA protocol'],
    ['Amoxicillin TDS for 5 days', 'Amoxicillin for 5 days per local protocol'],
  ])('%s', (input, expected) => {
    expect(stripDoses(input)).toEqual({ text: expected, removed: true });
  });

  it.each([
    'Check capillary glucose; treat if below 4 mmol/L per protocol',
    'Repeat BP in 15 minutes',
    'Obtain a 12-lead ECG within 10 minutes',
    'Establish IV access and continuous monitoring',
    'SpO2 target 94-98% per local protocol',
  ])('leaves non-dose text alone: %s', (input) => {
    expect(stripDoses(input)).toEqual({ text: input, removed: false });
  });

  it('cleans suggestions but never the summary', () => {
    const ai = {
      ...C01_AI,
      nextSteps: [{ ...C01_AI.nextSteps[0]!, action: 'Give aspirin 300 mg' }],
    };
    const { ai: out, removed } = removeDoses(ai);
    expect(removed).toBe(1);
    expect(out.nextSteps[0]!.action).toBe('Give aspirin per local protocol');
    expect(out.caseSummary).toEqual(ai.caseSummary);
  });
});
