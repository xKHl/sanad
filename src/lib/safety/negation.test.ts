import { describe, expect, it } from 'vitest';
import { matchConcepts } from './concepts';
import type { ConceptId } from './lexicon';

type Expect = { concept: ConceptId; negated?: boolean; family?: boolean };

function statusOf(text: string, concept: ConceptId) {
  const ms = matchConcepts(text).filter((m) => m.concept === concept);
  return ms;
}

function check(text: string, expectations: Expect[]) {
  for (const e of expectations) {
    const ms = statusOf(text, e.concept);
    expect(ms.length, `${e.concept} should be matched in "${text}"`).toBeGreaterThan(0);
    if (e.negated !== undefined) {
      expect(
        ms.every((m) => m.negated === e.negated),
        `${e.concept} negated=${e.negated} in "${text}"`,
      ).toBe(true);
    }
    if (e.family !== undefined) {
      expect(
        ms.every((m) => (m.experiencer === 'family') === e.family),
        `${e.concept} family=${e.family} in "${text}"`,
      ).toBe(true);
    }
  }
}

describe('negation: SPEC §5.4 must-pass examples', () => {
  it.each<[string, Expect[]]>([
    ['denies chest pain', [{ concept: 'chest_pain', negated: true }]],
    [
      'No headache, chest pain, breathlessness or visual changes.',
      [
        { concept: 'headache', negated: true },
        { concept: 'chest_pain', negated: true },
        { concept: 'dyspnea', negated: true },
        { concept: 'visual_disturbance', negated: true },
      ],
    ],
    [
      'no fever, HR 110, chest pain since 2h',
      [
        { concept: 'fever_word', negated: true },
        { concept: 'chest_pain', negated: false },
      ],
    ],
    [
      'No SOB, sweaty',
      [
        { concept: 'dyspnea', negated: true },
        { concept: 'diaphoresis', negated: false },
      ],
    ],
    [
      'chest pain but no sweating',
      [
        { concept: 'chest_pain', negated: false },
        { concept: 'diaphoresis', negated: true },
      ],
    ],
    ['Sweating: absent', [{ concept: 'diaphoresis', negated: true }]],
    ['family history of MI', [{ concept: 'known_cad', family: true }]],
    ['father had a heart attack at 60', [{ concept: 'known_cad', family: true }]],
    ['no change in chest pain', [{ concept: 'chest_pain', negated: false }]],
    ['No vomiting blood.', [{ concept: 'hematemesis', negated: true }]],
    ['without fever or rash', [{ concept: 'fever_word', negated: true }]],
    ['denies suicidal ideation', [{ concept: 'suicidal', negated: true }]],
    ['has been thinking about ending his life', [{ concept: 'suicidal', negated: false }]],
    ['nil vomiting', [{ concept: 'nausea_vomiting', negated: true }]],
    ['no history of DVT', [{ concept: 'prior_vte', negated: true }]],
    ['more confused per son', [{ concept: 'confusion', negated: false, family: false }]],
    [
      'no leg weakness or numbness, no bladder or bowel incontinence',
      [{ concept: 'incontinence', negated: true }],
    ],
  ])('%s', (text, expectations) => check(text, expectations));
});

describe('negation: additional cases', () => {
  it.each<[string, Expect[]]>([
    ['Denies SOB or palpitations.', [{ concept: 'dyspnea', negated: true }, { concept: 'palpitations', negated: true }]],
    ['no neck stiffness or photophobia', [{ concept: 'neck_stiffness', negated: true }, { concept: 'photophobia', negated: true }]],
    ['negative for fever', [{ concept: 'fever_word', negated: true }]],
    ['free of chest pain since yesterday', [{ concept: 'chest_pain', negated: true }]],
    ['no evidence of peritonism', [{ concept: 'peritonism', negated: true }]],
    ['never had a seizure; chest pain today', [{ concept: 'chest_pain', negated: false }]],
    ['no fever. Now has chest pain.', [{ concept: 'fever_word', negated: true }, { concept: 'chest_pain', negated: false }]],
    ['no wheeze however breathless on exertion', [{ concept: 'wheeze', negated: true }, { concept: 'dyspnea', negated: false }]],
    ['no rash, reports headache', [{ concept: 'headache', negated: false }]],
    ['denies chest pain, complains of nausea', [{ concept: 'chest_pain', negated: true }, { concept: 'nausea_vomiting', negated: false }]],
    ['no fever and has a cough', [{ concept: 'fever_word', negated: true }]],
    ['afebrile, HR 80', []],
    ['Vomiting: none', [{ concept: 'nausea_vomiting', negated: true }]],
    ['neck stiffness absent', [{ concept: 'neck_stiffness', negated: true }]],
    ['cannot be ruled out: chest pain', [{ concept: 'chest_pain', negated: false }]],
    ['not only headache but also confusion', [{ concept: 'headache', negated: false }, { concept: 'confusion', negated: false }]],
    ['no improvement in breathlessness', [{ concept: 'dyspnea', negated: false }]],
    ['mother has diabetes', [{ concept: 'diabetes', family: true }]],
    ['FHx: diabetes, IHD', [{ concept: 'diabetes', family: true }, { concept: 'known_cad', family: true }]],
    ['brought by daughter with slurred speech', [{ concept: 'speech_disturbance', family: false }]],
    ['daughter reports he is confused', [{ concept: 'confusion', family: false, negated: false }]],
    ['sister diagnosed with breast cancer, patient has a lump', [{ concept: 'lump', family: false }]],
    ['without wheeze, stridor or hives', [
      { concept: 'wheeze', negated: true },
      { concept: 'stridor', negated: true },
      { concept: 'urticaria', negated: true },
    ]],
    ['no vomiting, abdominal pain since morning', [{ concept: 'nausea_vomiting', negated: true }, { concept: 'abdominal_pain', negated: false }]],
    ['purple spots that do not fade', [{ concept: 'nonblanching_rash', negated: false }]],
    ['not on anticoagulation, slurred speech', [{ concept: 'speech_disturbance', negated: false }]],
  ])('%s', (text, expectations) => check(text, expectations));

  it('does not match "febrile" inside "afebrile"', () => {
    expect(statusOf('afebrile, HR 80', 'fever_word')).toEqual([]);
  });

  it('keeps spans aligned with the source text', () => {
    const text = '45M, sudden-onset severe headache';
    for (const m of matchConcepts(text)) expect(text.slice(m.span.start, m.span.end)).toBe(m.span.text);
  });
});
