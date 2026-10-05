export type Span = { start: number; end: number; text: string };

export type Sex = 'female' | 'male' | 'unknown';
export type Pregnancy = 'pregnant' | 'not_pregnant' | 'unknown';

export type Demographics = {
  /** Age in years; infants are fractional (7 weeks -> 0.134). */
  ageYears: number | null;
  /** Age as written, e.g. "58" or "7 weeks". */
  ageDisplay: string | null;
  ageSpan?: Span;
  sex: Sex;
  sexSpan?: Span;
  pregnancy: Pregnancy;
  gestationWeeks: number | null;
  pregnancySpan?: Span;
};

export type VitalKey =
  | 'hr'
  | 'sbp'
  | 'dbp'
  | 'rr'
  | 'spo2'
  | 'tempC'
  | 'glucoseMgdl'
  | 'ketonesMmol'
  | 'gcs'
  | 'crtSeconds';

export type VitalReading = {
  value: number;
  raw: string;
  unit: string;
  span: Span;
  convertedFrom?: string;
};

export type OxygenStatus = 'air' | 'oxygen' | 'unknown';

export type Vitals = Partial<Record<VitalKey, VitalReading>> & {
  oxygen: OxygenStatus;
  oxygenSpan?: Span;
  /** Every plausible reading found, in text order (the last one of each key is used). */
  allReadings: Array<{ key: VitalKey; reading: VitalReading }>;
  /** Ignored implausible values, assumed units and other parser notes. */
  warnings: string[];
};

export type Experiencer = 'patient' | 'family';

export type ConceptMatch<C extends string = string> = {
  concept: C;
  span: Span;
  negated: boolean;
  experiencer: Experiencer;
};

export type News2Band = 'low' | 'low-medium' | 'medium' | 'high';

export type News2Parameter = {
  key: 'rr' | 'spo2' | 'oxygen' | 'sbp' | 'pulse' | 'consciousness' | 'temp';
  label: string;
  value: string | null;
  points: number | null;
  assumed: boolean;
};

export type News2Result = {
  status: 'complete' | 'partial' | 'insufficient' | 'not_applicable';
  /** Why the score is insufficient or not applicable. */
  reason: string | null;
  /** Sum of available points; a lower bound when status is partial. */
  total: number | null;
  band: News2Band | null;
  /** Clinical response wording for the band. */
  response: string | null;
  anySingle3: boolean;
  parameters: News2Parameter[];
  missing: string[];
  notes: string[];
};

export type Severity = 'critical' | 'urgent';

export type RuleFlag = {
  ruleId: string;
  title: string;
  severity: Severity;
  category: string;
  /** Generated from the criteria that matched, e.g. "Chest pain + radiation to arm". */
  reasoning: string;
  evidence: Span[];
  recommendedAction: string;
  basis: string;
};

export type Priority = 'high' | 'medium' | 'low';

export type RequiredInfoItem = {
  id: string;
  item: string;
  whyItMatters: string;
  priority: Priority;
  category: string;
};

export type PhiType = 'email' | 'phone' | 'national_id' | 'mrn' | 'date' | 'name' | 'address';

export type PhiFinding = { type: PhiType; span: Span; replacement: string };

export type SafetyFindings = {
  rulesVersion: string;
  demographics: Demographics;
  vitals: Vitals;
  concepts: ConceptMatch[];
  news2: News2Result;
  /** Sorted: critical first, then catalog order. */
  ruleFlags: RuleFlag[];
  requiredInfo: RequiredInfoItem[];
  languageWarning: string | null;
  rulesEvaluated: number;
  timingMs: number;
};
