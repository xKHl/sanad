import { MockLanguageModelV4 } from 'ai/test';
import type { AiAnalysis } from '@/lib/ai/schema';

/** Hand-written AI output for case C01 (SPEC Appendix B). Test fixture only — never shown as model output. */
export const C01_AI: AiAnalysis = {
  inputQuality: { isClinicalScenario: true, note: null },
  caseSummary: {
    oneLiner:
      '58-year-old man with 2 hours of exertional central chest pressure radiating to the left arm, with sweating and nausea.',
    age: '58',
    sex: 'male',
    pregnancyStatus: 'not_applicable',
    chiefComplaint: { text: 'Central chest pressure for 2 hours', evidence: 'central chest pressure for 2 hours' },
    historyOfPresentIllness: [
      { text: 'Radiates to the left arm', evidence: 'radiating to left arm' },
      { text: 'Began while climbing stairs', evidence: 'started while climbing stairs' },
      { text: 'Associated sweating and nausea', evidence: 'sweaty and nauseated' },
    ],
    pastMedicalHistory: [{ text: 'Type 2 diabetes', evidence: 'T2DM on metformin' }],
    medications: [{ text: 'Metformin', evidence: 'T2DM on metformin' }],
    allergies: [],
    socialHistory: [{ text: 'Smoker, 30 pack-years', evidence: 'Smoker 30 pack-years' }],
    familyHistory: [],
    vitalsAndExamination: [
      { text: 'BP 162/94, HR 108, RR 20', evidence: 'BP 162/94, HR 108, RR 20' },
      { text: 'SpO2 95% on room air, temperature 36.8 °C', evidence: 'SpO2 95% RA, T 36.8' },
    ],
    investigations: [],
  },
  missingInformation: [
    {
      question: 'Is the pain still present now, and how severe is it?',
      whyItMatters: 'Ongoing pain increases the urgency of excluding acute coronary syndrome.',
      priority: 'high',
      category: 'history',
      askPatientArabic: 'هل ما زال الألم موجودًا الآن؟ وما مدى شدته؟',
    },
    {
      question: 'Any known drug allergies?',
      whyItMatters: 'Needed before antiplatelet therapy.',
      priority: 'high',
      category: 'medications_allergies',
      askPatientArabic: 'هل عندك حساسية من أي دواء؟',
    },
    {
      question: 'Any tearing pain through to the back, or a BP difference between arms?',
      whyItMatters: 'Aortic dissection must be considered before antiplatelet therapy.',
      priority: 'high',
      category: 'examination',
      askPatientArabic: 'هل تشعر بألم حاد يمتد إلى الظهر؟',
    },
  ],
  nextSteps: [
    {
      action: 'Document symptom onset time and any prior episodes',
      rationale: 'Onset time guides acute management decisions.',
      category: 'documentation',
      urgency: 'today',
      addressesRedFlag: null,
    },
    {
      action: 'Obtain a 12-lead ECG now',
      rationale: 'Exertional chest pressure with radiation and sweating: evaluate for acute coronary syndrome.',
      category: 'investigation',
      urgency: 'immediate',
      addressesRedFlag: 'RF-ACS',
    },
    {
      action: 'Arrange emergency transfer per local chest-pain protocol',
      rationale: 'High-risk features; outpatient management is not appropriate until ACS is excluded.',
      category: 'escalation',
      urgency: 'immediate',
      addressesRedFlag: 'RF-ACS',
    },
  ],
  additionalRedFlags: [],
};

export const C01_TEXT =
  '58M, central chest pressure for 2 hours radiating to left arm, started while climbing stairs, sweaty and nauseated. Smoker 30 pack-years, T2DM on metformin. BP 162/94, HR 108, RR 20, SpO2 95% RA, T 36.8.';

const usage = {
  inputTokens: { total: 900, noCache: 900, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 700, text: 700, reasoning: undefined },
};

/** A mock model that returns the given texts in order (the last one repeats). */
export function mockModel(texts: string[]) {
  const prompts: unknown[] = [];
  let i = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      prompts.push(options.prompt);
      const text = texts[Math.min(i, texts.length - 1)] ?? '';
      i++;
      return {
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
  return { model, prompts, calls: () => i };
}
