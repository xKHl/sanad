import { z } from 'zod';

/**
 * Model-facing output schema (SPEC §6.2). Provider compatibility rules: every field required,
 * `.nullable()` instead of optional, no unions, no min/max/regex constraints (limits are enforced
 * after parsing), shallow nesting, and a description on every field.
 */

export const FactSchema = z.object({
  text: z.string().describe('Concise clinical statement (max 20 words) using only information in the scenario'),
  evidence: z
    .string()
    .describe('Exact quote copied character-for-character from the scenario that supports the statement'),
});

const factList = (what: string) => z.array(FactSchema).describe(`${what}; empty list if not stated`);

export const CaseSummarySchema = z.object({
  oneLiner: z.string().describe('One sentence: age, sex, main complaint, duration, key context. Stated facts only.'),
  age: z.string().nullable().describe('Age as written in the scenario (e.g. "58", "7 weeks"), or null'),
  sex: z.enum(['female', 'male', 'not_stated']).describe('Sex as stated in the scenario'),
  pregnancyStatus: z
    .enum(['pregnant', 'not_pregnant', 'not_stated', 'not_applicable'])
    .describe('Pregnancy status as stated; not_applicable for males and young children'),
  chiefComplaint: FactSchema.nullable().describe('Main presenting complaint with evidence, or null'),
  historyOfPresentIllness: factList('History of the presenting illness'),
  pastMedicalHistory: factList('Past medical history'),
  medications: factList('Current medications'),
  allergies: factList('Allergies or allergy status'),
  socialHistory: factList('Social history (smoking, living situation, occupation)'),
  familyHistory: factList('Family history'),
  vitalsAndExamination: factList('Vital signs and examination findings'),
  investigations: factList('Tests already done and their results'),
});

export const MissingInfoItemSchema = z.object({
  question: z.string().describe('What to ask, examine or check'),
  whyItMatters: z.string().describe('One line linking the item to this case'),
  priority: z.enum(['high', 'medium', 'low']).describe('How much the answer would change the assessment'),
  category: z
    .enum([
      'history',
      'vital_signs',
      'examination',
      'medications_allergies',
      'risk_factors',
      'social',
      'investigations',
      'other',
    ])
    .describe('Type of missing information'),
  askPatientArabic: z
    .string()
    .nullable()
    .describe('Short, simple Modern Standard Arabic phrasing to ask the patient; null if not a question for the patient'),
});

export const NextStepSchema = z.object({
  action: z.string().describe('Suggested step, phrased as decision support'),
  rationale: z.string().describe('Why, for this case; may name conditions to evaluate for or exclude'),
  category: z
    .enum(['assessment', 'investigation', 'management', 'escalation', 'safety_netting', 'documentation'])
    .describe('Type of step'),
  urgency: z.enum(['immediate', 'today', 'routine']).describe('immediate = before the patient leaves the room'),
  addressesRedFlag: z
    .string()
    .nullable()
    .describe('Rule id (e.g. "RF-ACS") if this step responds to a rule red flag, else null'),
});

export const AiRedFlagSchema = z.object({
  title: z.string().describe('Short name of the warning sign'),
  severity: z.enum(['critical', 'urgent']).describe('critical = act now; urgent = same day'),
  evidence: z.array(z.string()).describe('Exact quotes from the scenario'),
  recommendedAction: z.string().describe('Suggested response, phrased as decision support'),
});

export const AiAnalysisSchema = z.object({
  inputQuality: z
    .object({
      isClinicalScenario: z.boolean().describe('False if the text is not a clinical case or is too short'),
      note: z.string().nullable().describe('Brief explanation when the input is not usable, else null'),
    })
    .describe('Whether the input is a usable clinical scenario'),
  caseSummary: CaseSummarySchema.describe('Structured case summary'),
  missingInformation: z
    .array(MissingInfoItemSchema)
    .describe('At most 8 items, most important first; not already stated, not already in rule findings'),
  nextSteps: z.array(NextStepSchema).describe('At most 10 steps for clinician review, ordered by urgency'),
  additionalRedFlags: z
    .array(AiRedFlagSchema)
    .describe('At most 4 warning signs present in the scenario and not already covered by rule findings'),
});

export type Fact = z.infer<typeof FactSchema>;
export type CaseSummary = z.infer<typeof CaseSummarySchema>;
export type MissingInfoItem = z.infer<typeof MissingInfoItemSchema>;
export type NextStep = z.infer<typeof NextStepSchema>;
export type AiRedFlag = z.infer<typeof AiRedFlagSchema>;
export type AiAnalysis = z.infer<typeof AiAnalysisSchema>;

export const SUMMARY_LIST_SECTIONS = [
  'historyOfPresentIllness',
  'pastMedicalHistory',
  'medications',
  'allergies',
  'socialHistory',
  'familyHistory',
  'vitalsAndExamination',
  'investigations',
] as const satisfies ReadonlyArray<keyof CaseSummary>;

export type SummaryListSection = (typeof SUMMARY_LIST_SECTIONS)[number];

export const SECTION_LABELS: Record<SummaryListSection | 'chiefComplaint', string> = {
  chiefComplaint: 'Chief complaint',
  historyOfPresentIllness: 'History of presenting illness',
  pastMedicalHistory: 'Past medical history',
  medications: 'Medications',
  allergies: 'Allergies',
  socialHistory: 'Social history',
  familyHistory: 'Family history',
  vitalsAndExamination: 'Vital signs and examination',
  investigations: 'Investigations',
};
