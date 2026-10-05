import type { ConceptIndex } from './concepts';
import { alteredConsciousness } from './news2';
import type { Demographics, RequiredInfoItem, RuleFlag, Vitals } from './types';

/** Deterministic baseline for the missing-information section (SPEC §5.7). */

const ALLERGY_STATEMENT = /\ballerg(?:y|ies|ic)\b|(?<![A-Za-z])(?:NKDA|NKA)(?![A-Za-z])|\bno known (?:drug )?allergies\b/i;

const DRUGS = [
  'metformin', 'insulin', 'amlodipine', 'lisinopril', 'ramipril', 'perindopril', 'losartan', 'valsartan', 'bisoprolol',
  'atenolol', 'metoprolol', 'propranolol', 'atorvastatin', 'simvastatin', 'rosuvastatin', 'aspirin', 'clopidogrel',
  'warfarin', 'apixaban', 'rivaroxaban', 'dabigatran', 'edoxaban', 'heparin', 'enoxaparin', 'ibuprofen', 'naproxen',
  'diclofenac', 'paracetamol', 'acetaminophen', 'codeine', 'tramadol', 'morphine', 'omeprazole', 'pantoprazole',
  'esomeprazole', 'lansoprazole', 'levothyroxine', 'prednisolone', 'prednisone', 'hydrocortisone', 'salbutamol',
  'albuterol', 'inhaler', 'furosemide', 'spironolactone', 'hydrochlorothiazide', 'indapamide', 'sertraline',
  'fluoxetine', 'citalopram', 'escitalopram', 'amitriptyline', 'gliclazide', 'sitagliptin', 'empagliflozin',
  'dapagliflozin', 'semaglutide', 'liraglutide', 'amoxicillin', 'co-amoxiclav', 'ciprofloxacin', 'doxycycline',
  'nitrofurantoin', 'trimethoprim', 'contraceptive', 'the pill', 'antibiotics?', 'chemotherapy', 'adrenaline',
  'epinephrine', 'auto-injector', 'anticoagulation', 'anticoagulant',
];
const MEDICATION_STATEMENT = new RegExp(
  String.raw`\b(?:meds|medications?|medicines?|drug history|DHx|takes|taking|no regular (?:meds|medications?|medicines?)|nil regular)\b|\b(?:${DRUGS.join('|')})\b`,
  'i',
);

export function requiredInfo(
  text: string,
  demo: Demographics,
  vitals: Vitals,
  concepts: ConceptIndex,
  flags: RuleFlag[],
): RequiredInfoItem[] {
  const items: RequiredInfoItem[] = [];
  const anyFlag = flags.length > 0;
  const fever = (vitals.tempC?.value ?? 0) >= 38 || concepts.has('fever_word');

  const missingDemo = [demo.ageYears === null ? 'age' : null, demo.sex === 'unknown' ? 'sex' : null].filter(Boolean);
  if (missingDemo.length > 0) {
    items.push({
      id: 'RI-AGE-SEX',
      item: missingDemo.length === 2 ? 'Age and sex' : missingDemo[0] === 'age' ? 'Age' : 'Sex',
      whyItMatters: 'Age and sex change risk thresholds, scores and the likely causes to consider.',
      priority: 'high',
      category: 'history',
    });
  }

  if (!ALLERGY_STATEMENT.test(text)) {
    items.push({
      id: 'RI-ALLERGIES',
      item: 'Allergy status',
      whyItMatters: 'Needed before any medication is suggested or given.',
      priority: 'medium',
      category: 'medications_allergies',
    });
  }

  if (!MEDICATION_STATEMENT.test(text)) {
    items.push({
      id: 'RI-MEDICATIONS',
      item: 'Current medications',
      whyItMatters: 'Medications can cause symptoms, change interpretation and interact with treatment.',
      priority: 'medium',
      category: 'medications_allergies',
    });
  }

  const vitalTrigger =
    anyFlag ||
    fever ||
    concepts.has('chest_pain') ||
    concepts.has('dyspnea') ||
    concepts.has('syncope') ||
    concepts.has('confusion') ||
    concepts.has('abdominal_pain');
  if (vitalTrigger) {
    const missing = [
      vitals.hr ? null : 'heart rate',
      vitals.sbp ? null : 'blood pressure',
      vitals.rr ? null : 'respiratory rate',
      vitals.spo2 ? null : 'SpO2',
      vitals.tempC ? null : 'temperature',
    ].filter((x): x is string => x !== null);
    if (missing.length > 0) {
      items.push({
        id: 'RI-VITALS',
        item: `Full set of observations — missing: ${missing.join(', ')}`,
        whyItMatters: 'Complete observations are needed to judge severity and calculate an early-warning score.',
        priority: 'high',
        category: 'vital_signs',
      });
    }
  }

  const age = demo.ageYears;
  if (
    demo.sex === 'female' &&
    age !== null &&
    age >= 12 &&
    age <= 50 &&
    demo.pregnancy === 'unknown' &&
    (concepts.has('abdominal_pain') || concepts.has('vaginal_bleeding') || concepts.has('syncope') || anyFlag)
  ) {
    items.push({
      id: 'RI-PREGNANCY',
      item: 'Pregnancy status / last menstrual period',
      whyItMatters: 'Changes the causes to consider, imaging and prescribing decisions.',
      priority: 'high',
      category: 'history',
    });
  }

  const neuro =
    concepts.has('facial_droop') ||
    concepts.has('unilateral_weakness') ||
    concepts.has('unilateral_numbness') ||
    concepts.has('speech_disturbance') ||
    concepts.has('vision_loss_sudden') ||
    concepts.has('ataxia');
  const diabeticUnwell =
    concepts.has('diabetes') &&
    (concepts.has('nausea_vomiting') || concepts.has('abdominal_pain') || concepts.has('drowsy'));
  if (!vitals.glucoseMgdl && (neuro || alteredConsciousness(concepts, vitals) || diabeticUnwell)) {
    items.push({
      id: 'RI-GLUCOSE',
      item: 'Capillary blood glucose',
      whyItMatters: 'Hypo- or hyperglycaemia can mimic or worsen neurological and acute presentations.',
      priority: 'high',
      category: 'investigations',
    });
  }

  return items;
}
