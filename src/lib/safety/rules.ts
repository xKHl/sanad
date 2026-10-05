import type { ConceptIndex } from './concepts';
import { CONCEPT_LABELS, type ConceptId } from './lexicon';
import type { Demographics, News2Result, RuleFlag, Severity, Span, VitalKey, Vitals } from './types';

/**
 * Red-flag rule catalog (SPEC §5.6). Thresholds are prototype values informed by the cited
 * guidance; they are not clinically validated. Any change must update SPEC §5.6, the tests
 * and RULES_VERSION together.
 */

export type Criterion = { label: string; spans: Span[] };

export type RuleContext = {
  text: string;
  demo: Demographics;
  vitals: Vitals;
  concepts: ConceptIndex;
  news2: News2Result;
  fired: Set<string>;
};

export type RuleDef = {
  id: string;
  title: string;
  category: string;
  tier: 'core' | 'extended';
  recommendedAction: string;
  basis: string;
  /** Lower-case fragments used to drop AI red flags that duplicate this rule. */
  dedupeKeywords: string[];
  evaluate: (ctx: RuleContext) => { severity: Severity; criteria: Criterion[] } | null;
};

// ------------------------------------------------------------- helpers

const concept = (ctx: RuleContext, id: ConceptId): Criterion | null =>
  ctx.concepts.has(id) ? { label: CONCEPT_LABELS[id], spans: ctx.concepts.spans(id) } : null;

const anyConcepts = (ctx: RuleContext, ids: ConceptId[]): Criterion[] =>
  ids.map((id) => concept(ctx, id)).filter((c): c is Criterion => c !== null);

const val = (ctx: RuleContext, key: VitalKey): number | null => ctx.vitals[key]?.value ?? null;

const vital = (ctx: RuleContext, key: VitalKey, label: string): Criterion => {
  const r = ctx.vitals[key];
  return { label, spans: r ? [r.span] : [] };
};

const ageYears = (ctx: RuleContext) => ctx.demo.ageYears;
const isAdult = (ctx: RuleContext) => ageYears(ctx) === null || (ageYears(ctx) ?? 0) >= 16;
const isChild = (ctx: RuleContext) => ageYears(ctx) !== null && (ageYears(ctx) ?? 99) < 16;
const isPregnant = (ctx: RuleContext) => ctx.demo.pregnancy === 'pregnant';
const ageCriterion = (ctx: RuleContext, label: string): Criterion => ({
  label,
  spans: ctx.demo.ageSpan ? [ctx.demo.ageSpan] : [],
});

function fever(ctx: RuleContext): Criterion | null {
  const t = val(ctx, 'tempC');
  if (t !== null && t >= 38) return vital(ctx, 'tempC', `Temperature ${t} °C`);
  return concept(ctx, 'fever_word');
}

const NEURO: ConceptId[] = [
  'facial_droop',
  'unilateral_weakness',
  'unilateral_numbness',
  'speech_disturbance',
  'vision_loss_sudden',
  'ataxia',
];

function altered(ctx: RuleContext): Criterion[] {
  const out = anyConcepts(ctx, ['confusion', 'drowsy', 'unresponsive']);
  const gcs = val(ctx, 'gcs');
  if (gcs !== null && gcs < 15) out.push(vital(ctx, 'gcs', `GCS ${gcs}`));
  return out;
}

function news2Spans(ctx: RuleContext): Span[] {
  const keys: Array<[string, VitalKey]> = [
    ['rr', 'rr'],
    ['spo2', 'spo2'],
    ['sbp', 'sbp'],
    ['pulse', 'hr'],
    ['temp', 'tempC'],
  ];
  const spans: Span[] = [];
  for (const [p, k] of keys) {
    const param = ctx.news2.parameters.find((x) => x.key === p);
    const r = ctx.vitals[k];
    if (param && (param.points ?? 0) > 0 && r) spans.push(r.span);
  }
  return spans;
}

/**
 * "Sudden" describes the headache when both are in the same sentence and the word is not
 * attached to a different symptom ("sudden nausea", "sudden arm weakness").
 */
function suddenHeadacheSpans(ctx: RuleContext): Span | null {
  if (!ctx.concepts.has('headache')) return null;
  const others = ctx.concepts.matches.filter(
    (m) => !m.negated && !['headache', 'thunderclap', 'sudden_onset', 'exertional'].includes(m.concept),
  );
  for (const s of ctx.concepts.spans('sudden_onset')) {
    if (!ctx.concepts.sameSentenceSpans(ctx.text, s, ctx.concepts.spans('headache'))) continue;
    const attachedElsewhere = others.some((m) => m.span.start >= s.end && m.span.start - s.end <= 15);
    if (!attachedElsewhere) return s;
  }
  return null;
}

const fire = (severity: Severity, criteria: Array<Criterion | null>) => ({
  severity,
  criteria: criteria.filter((c): c is Criterion => c !== null),
});

// --------------------------------------------------------------- rules

export const RULES: RuleDef[] = [
  {
    id: 'RF-NEWS2-HIGH',
    title: 'NEWS2 high (7 or more)',
    category: 'vitals',
    tier: 'core',
    recommendedAction:
      'Emergency assessment by a clinician with acute-care competencies; arrange immediate transfer to emergency care per local protocol.',
    basis: 'NEWS2 (Royal College of Physicians, 2017)',
    dedupeKeywords: ['news2', 'early warning', 'deteriorat'],
    evaluate(ctx) {
      const n = ctx.news2;
      if ((n.status === 'complete' || n.status === 'partial') && (n.total ?? 0) >= 7) {
        return fire('critical', [{ label: `NEWS2 ${n.status === 'partial' ? '≥ ' : ''}${n.total}`, spans: news2Spans(ctx) }]);
      }
      return null;
    },
  },
  {
    id: 'RF-NEWS2-MEDIUM',
    title: 'NEWS2 medium, or a single parameter scoring 3',
    category: 'vitals',
    tier: 'core',
    recommendedAction: 'Urgent clinical review today; repeat a full set of observations and escalate if not improving.',
    basis: 'NEWS2 (Royal College of Physicians, 2017)',
    dedupeKeywords: ['news2', 'early warning'],
    evaluate(ctx) {
      const n = ctx.news2;
      if (ctx.fired.has('RF-NEWS2-HIGH')) return null;
      if (n.status !== 'complete' && n.status !== 'partial') return null;
      const total = n.total ?? 0;
      if (total >= 5 && total <= 6) {
        return fire('urgent', [{ label: `NEWS2 ${n.status === 'partial' ? '≥ ' : ''}${total}`, spans: news2Spans(ctx) }]);
      }
      if (n.anySingle3) {
        const p = n.parameters.find((x) => x.points === 3);
        return fire('urgent', [{ label: `${p?.label ?? 'A parameter'} scores 3`, spans: news2Spans(ctx) }]);
      }
      return null;
    },
  },
  {
    id: 'RF-HYPOXIA',
    title: 'Low oxygen saturation',
    category: 'respiratory',
    tier: 'core',
    recommendedAction:
      'Low oxygen saturation: urgent assessment; consider oxygen and emergency referral per local protocol.',
    basis: 'BTS oxygen guideline (target 94–98%, or 88–92% if at risk of hypercapnia)',
    dedupeKeywords: ['hypox', 'oxygen saturation', 'low sats', 'desaturat'],
    evaluate(ctx) {
      const s = val(ctx, 'spo2');
      if (s === null) return null;
      const copd = ctx.concepts.has('copd');
      if ((!copd && s < 92) || (copd && s < 88)) {
        return fire('critical', [vital(ctx, 'spo2', `SpO2 ${s}%`), copd ? concept(ctx, 'copd') : null]);
      }
      return null;
    },
  },
  {
    id: 'RF-HYPOTENSION',
    title: 'Hypotension',
    category: 'cardiovascular',
    tier: 'core',
    recommendedAction: 'Hypotension: assess for shock (sepsis, bleeding, anaphylaxis, cardiac cause); emergency referral.',
    basis: 'General emergency medicine teaching',
    dedupeKeywords: ['hypotens', 'shock'],
    evaluate(ctx) {
      const sbp = val(ctx, 'sbp');
      if (isAdult(ctx) && sbp !== null && sbp < 90) return fire('critical', [vital(ctx, 'sbp', `Systolic BP ${sbp}`)]);
      return null;
    },
  },
  {
    id: 'RF-ACS',
    title: 'Possible acute coronary syndrome',
    category: 'cardiovascular',
    tier: 'core',
    recommendedAction:
      'Obtain a 12-lead ECG within 10 minutes and arrange emergency assessment per local chest-pain protocol; do not discharge without excluding acute coronary syndrome.',
    basis: 'Informed by NICE CG95 (recent-onset chest pain of suspected cardiac origin)',
    dedupeKeywords: ['coronary', 'acs', 'myocardial', 'heart attack', 'cardiac chest pain', 'cardiac ischaemia', 'cardiac ischemia'],
    evaluate(ctx) {
      const cp = concept(ctx, 'chest_pain');
      if (!cp) return null;
      const features = anyConcepts(ctx, ['radiation_arm_jaw', 'diaphoresis', 'exertional', 'known_cad']);
      const age = ageYears(ctx);
      if (age !== null && age >= 40) {
        const assoc = anyConcepts(ctx, ['dyspnea', 'nausea_vomiting']);
        if (assoc.length > 0) features.push(ageCriterion(ctx, `Age ${ctx.demo.ageDisplay ?? age}`), ...assoc);
      }
      return features.length > 0 ? fire('critical', [cp, ...features]) : null;
    },
  },
  {
    id: 'RF-PE',
    title: 'Possible pulmonary embolism',
    category: 'respiratory',
    tier: 'core',
    recommendedAction:
      'Possible pulmonary embolism: same-day emergency assessment; apply a validated pre-test probability tool (e.g. Wells) per local pathway.',
    basis: 'Informed by NICE NG158 (venous thromboembolic diseases)',
    dedupeKeywords: ['pulmonary embol', 'thromboembol', ' pe ', 'dvt', 'deep vein'],
    evaluate(ctx) {
      const symptoms = anyConcepts(ctx, ['dyspnea', 'chest_pain_pleuritic', 'hemoptysis']);
      if (symptoms.length === 0) return null;
      const risks = anyConcepts(ctx, [
        'leg_swelling_unilateral',
        'recent_surgery_immobility',
        'prior_vte',
        'estrogen',
        'active_cancer',
      ]);
      if (isPregnant(ctx)) risks.push({ label: 'Pregnancy', spans: ctx.demo.pregnancySpan ? [ctx.demo.pregnancySpan] : [] });
      return risks.length > 0 ? fire('critical', [...symptoms, ...risks]) : null;
    },
  },
  {
    id: 'RF-HTN-EMERGENCY',
    title: 'Severe hypertension with possible target-organ symptoms',
    category: 'cardiovascular',
    tier: 'core',
    recommendedAction:
      'Severe hypertension with symptoms that may indicate acute target-organ damage: emergency assessment.',
    basis: 'Informed by ACC/AHA 2017 and ESC/ESH hypertension guidance',
    dedupeKeywords: ['hypertensive emergency', 'hypertensive crisis', 'severe hypertension'],
    evaluate(ctx) {
      if (isPregnant(ctx)) return null;
      const sbp = val(ctx, 'sbp');
      const dbp = val(ctx, 'dbp');
      if (!((sbp ?? 0) >= 180 || (dbp ?? 0) >= 120)) return null;
      const symptoms = [
        ...anyConcepts(ctx, ['chest_pain', 'dyspnea', 'visual_disturbance', 'headache']),
        ...anyConcepts(ctx, NEURO),
        ...altered(ctx),
      ];
      if (symptoms.length === 0) return null;
      return fire('critical', [vital(ctx, 'sbp', `BP ${sbp}/${dbp ?? '?'}`), ...symptoms]);
    },
  },
  {
    id: 'RF-HTN-SEVERE',
    title: 'Severe hypertension',
    category: 'cardiovascular',
    tier: 'core',
    recommendedAction:
      'Severe hypertension without reported symptoms: confirm with a repeat reading, assess for target-organ damage, same-day clinician review.',
    basis: 'Informed by NICE NG136 (hypertension in adults)',
    dedupeKeywords: ['severe hypertension', 'hypertensive urgency', 'uncontrolled hypertension'],
    evaluate(ctx) {
      if (isPregnant(ctx) || ctx.fired.has('RF-HTN-EMERGENCY')) return null;
      const sbp = val(ctx, 'sbp');
      const dbp = val(ctx, 'dbp');
      if ((sbp ?? 0) >= 180 || (dbp ?? 0) >= 120) return fire('urgent', [vital(ctx, 'sbp', `BP ${sbp}/${dbp ?? '?'}`)]);
      return null;
    },
  },
  {
    id: 'RF-STROKE',
    title: 'Possible stroke or TIA',
    category: 'neurological',
    tier: 'core',
    recommendedAction:
      'Possible stroke or TIA — time-critical: record time last known well, check capillary glucose to exclude hypoglycaemia, activate the emergency stroke pathway.',
    basis: 'BE-FAST screen; informed by NICE NG128 (stroke and TIA)',
    dedupeKeywords: ['stroke', 'tia', 'transient ischaemic', 'transient ischemic', 'cerebrovascular'],
    evaluate(ctx) {
      const deficits = anyConcepts(ctx, NEURO);
      return deficits.length > 0 ? fire('critical', deficits) : null;
    },
  },
  {
    id: 'RF-THUNDERCLAP',
    title: 'Thunderclap headache',
    category: 'neurological',
    tier: 'core',
    recommendedAction: 'Thunderclap headache: emergency assessment to exclude subarachnoid haemorrhage.',
    basis: 'Informed by NICE CG150 (headaches in over 12s)',
    dedupeKeywords: ['subarachnoid', 'thunderclap', 'sah'],
    evaluate(ctx) {
      const tc = concept(ctx, 'thunderclap');
      if (tc) return fire('critical', [tc]);
      const sudden = suddenHeadacheSpans(ctx);
      if (sudden) return fire('critical', [{ label: 'Sudden onset', spans: [sudden] }, concept(ctx, 'headache')]);
      return null;
    },
  },
  {
    id: 'RF-MENINGITIS',
    title: 'Possible meningitis or meningococcal disease',
    category: 'infection',
    tier: 'core',
    recommendedAction: 'Possible meningitis or meningococcal disease: emergency transfer per local protocol; do not delay.',
    basis: 'Informed by NICE NG240 (bacterial meningitis and meningococcal disease)',
    dedupeKeywords: ['meningit', 'meningococc', 'non-blanching', 'nonblanching', 'petechial'],
    evaluate(ctx) {
      const f = fever(ctx);
      const signs = anyConcepts(ctx, ['neck_stiffness', 'photophobia', 'nonblanching_rash', 'bulging_fontanelle']);
      const rash = concept(ctx, 'nonblanching_rash');
      if (f && signs.length > 0) return fire('critical', [f, ...signs]);
      if (rash) return fire(f ? 'critical' : 'urgent', [rash]);
      return null;
    },
  },
  {
    id: 'RF-SEPSIS',
    title: 'Possible sepsis',
    category: 'infection',
    tier: 'core',
    recommendedAction: 'Possible sepsis: emergency assessment and the local sepsis pathway.',
    basis: 'Informed by NICE NG51 (sepsis) and Sepsis-3 qSOFA',
    dedupeKeywords: ['sepsis', 'septic'],
    evaluate(ctx) {
      if (!isAdult(ctx)) return null;
      const infection = fever(ctx) ?? concept(ctx, 'infection_source');
      if (!infection) return null;
      const source = fever(ctx) ? concept(ctx, 'infection_source') : null;
      const severity: Criterion[] = [];
      const n = ctx.news2;
      if ((n.status === 'complete' || n.status === 'partial') && (n.total ?? 0) >= 5) {
        severity.push({ label: `NEWS2 ${n.status === 'partial' ? '≥ ' : ''}${n.total}`, spans: news2Spans(ctx) });
      }
      const rr = val(ctx, 'rr');
      const sbp = val(ctx, 'sbp');
      const alt = altered(ctx);
      const qsofa = (rr !== null && rr >= 22 ? 1 : 0) + (alt.length > 0 ? 1 : 0) + (sbp !== null && sbp <= 100 ? 1 : 0);
      if (qsofa >= 2) {
        const spans = [
          ...(rr !== null && rr >= 22 && ctx.vitals.rr ? [ctx.vitals.rr.span] : []),
          ...(sbp !== null && sbp <= 100 && ctx.vitals.sbp ? [ctx.vitals.sbp.span] : []),
          ...alt.flatMap((a) => a.spans),
        ];
        severity.push({ label: `qSOFA ${qsofa}`, spans });
      }
      return severity.length > 0 ? fire('critical', [infection, source, ...severity]) : null;
    },
  },
  {
    id: 'RF-DELIRIUM',
    title: 'Acute confusion in an older adult',
    category: 'neurological',
    tier: 'core',
    recommendedAction:
      'Acute confusion in an older adult: assess for delirium and its causes (infection, hypoxia, glucose, medications, urinary retention).',
    basis: 'General geriatric medicine teaching',
    dedupeKeywords: ['delirium', 'acute confusion'],
    evaluate(ctx) {
      const age = ageYears(ctx);
      const conf = concept(ctx, 'confusion');
      if (age !== null && age >= 65 && conf && anyConcepts(ctx, NEURO).length === 0) {
        return fire('urgent', [ageCriterion(ctx, `Age ${ctx.demo.ageDisplay ?? age}`), conf]);
      }
      return null;
    },
  },
  {
    id: 'RF-ANAPHYLAXIS',
    title: 'Possible anaphylaxis',
    category: 'allergy',
    tier: 'core',
    recommendedAction:
      'Possible anaphylaxis: emergency — treat per local anaphylaxis protocol (intramuscular adrenaline is first-line) and call emergency services.',
    basis: 'Informed by Resuscitation Council UK anaphylaxis guideline (2021)',
    dedupeKeywords: ['anaphyla', 'allergic reaction', 'angioedema', 'angio-oedema'],
    evaluate(ctx) {
      const airway = anyConcepts(ctx, ['airway_swelling', 'throat_tightness', 'stridor', 'wheeze', 'dyspnea']);
      const sbp = val(ctx, 'sbp');
      if (isAdult(ctx) && sbp !== null && sbp < 90) airway.push(vital(ctx, 'sbp', `Systolic BP ${sbp}`));
      if (airway.length === 0) return null;
      const trigger = anyConcepts(ctx, ['allergen_exposure', 'urticaria']);
      return trigger.length > 0 ? fire('critical', [...trigger, ...airway]) : null;
    },
  },
  {
    id: 'RF-PREGNANCY-PAIN-BLEEDING',
    title: 'Pregnancy with pain or bleeding',
    category: 'obstetric',
    tier: 'core',
    recommendedAction:
      'Pregnancy with pain or bleeding: urgent obstetric/gynaecology assessment; in early pregnancy treat as possible ectopic pregnancy until excluded.',
    basis: 'Informed by NICE NG126 (ectopic pregnancy and miscarriage)',
    dedupeKeywords: ['ectopic', 'miscarriage', 'pregnancy'],
    evaluate(ctx) {
      if (!isPregnant(ctx)) return null;
      const s = anyConcepts(ctx, ['vaginal_bleeding', 'abdominal_pain', 'shoulder_tip_pain']);
      if (s.length === 0) return null;
      return fire('critical', [{ label: 'Pregnant', spans: ctx.demo.pregnancySpan ? [ctx.demo.pregnancySpan] : [] }, ...s]);
    },
  },
  {
    id: 'RF-DKA',
    title: 'Possible diabetic ketoacidosis or hyperosmolar state',
    category: 'endocrine',
    tier: 'core',
    recommendedAction:
      'Possible diabetic ketoacidosis or hyperosmolar state: check blood ketones and venous blood gas; emergency assessment.',
    basis: 'Informed by JBDS-IP DKA guidance and the 2024 ADA/EASD hyperglycaemic crises consensus',
    dedupeKeywords: ['ketoacidosis', 'dka', 'hyperosmolar', 'hhs'],
    evaluate(ctx) {
      const k = val(ctx, 'ketonesMmol');
      const g = val(ctx, 'glucoseMgdl');
      const dm = concept(ctx, 'diabetes');
      const symptoms = [
        ...anyConcepts(ctx, ['nausea_vomiting', 'abdominal_pain', 'kussmaul', 'dyspnea']),
        ...altered(ctx),
      ];
      const kC = k !== null ? vital(ctx, 'ketonesMmol', `Ketones ${k} mmol/L`) : null;
      const gC = g !== null ? vital(ctx, 'glucoseMgdl', `Glucose ${ctx.vitals.glucoseMgdl?.convertedFrom ?? `${g} mg/dL`}`) : null;
      const ketoneArm = k !== null && k >= 1.5 && (dm !== null || (g !== null && g >= 250));
      const glucoseArm = g !== null && g >= 250 && symptoms.length > 0;
      if (!ketoneArm && !glucoseArm) return null;
      const severity: Severity = (k !== null && k >= 3) || symptoms.length > 0 ? 'critical' : 'urgent';
      return fire(severity, [gC, kC, dm, ...symptoms]);
    },
  },
  {
    id: 'RF-HYPOGLYCAEMIA',
    title: 'Hypoglycaemia',
    category: 'endocrine',
    tier: 'core',
    recommendedAction: 'Hypoglycaemia: treat per local protocol, recheck glucose, and identify the cause.',
    basis: 'Informed by ADA Standards of Care (hypoglycaemia levels)',
    dedupeKeywords: ['hypoglyc', 'low glucose', 'low blood sugar'],
    evaluate(ctx) {
      const g = val(ctx, 'glucoseMgdl');
      if (g === null || g >= 70) return null;
      const alt = altered(ctx);
      return fire(g < 54 || alt.length > 0 ? 'critical' : 'urgent', [
        vital(ctx, 'glucoseMgdl', `Glucose ${ctx.vitals.glucoseMgdl?.convertedFrom ?? `${g} mg/dL`}`),
        ...alt,
      ]);
    },
  },
  {
    id: 'RF-INFANT-FEVER',
    title: 'Fever in an infant under 3 months',
    category: 'paediatric',
    tier: 'core',
    recommendedAction:
      'Infant under 3 months with fever ≥ 38 °C: high risk of serious bacterial infection — same-day emergency paediatric assessment.',
    basis: 'Informed by NICE NG143 (fever in under 5s)',
    dedupeKeywords: ['infant', 'neonat', 'under 3 months'],
    evaluate(ctx) {
      const age = ageYears(ctx);
      const f = fever(ctx);
      if (age !== null && age < 0.25 && f) return fire('critical', [ageCriterion(ctx, `Age ${ctx.demo.ageDisplay}`), f]);
      return null;
    },
  },
  {
    id: 'RF-SUICIDE-RISK',
    title: 'Suicidal thoughts or plans',
    category: 'mental health',
    tier: 'core',
    recommendedAction:
      'Expressed suicidal thoughts or plans: do not leave the person alone if risk may be imminent; urgent risk assessment and the local mental-health crisis pathway.',
    basis: 'Informed by NICE NG225 (self-harm)',
    dedupeKeywords: ['suicid', 'self-harm', 'self harm'],
    evaluate(ctx) {
      const s = concept(ctx, 'suicidal');
      return s ? fire('critical', [s]) : null;
    },
  },
  {
    id: 'RF-CAUDA-EQUINA',
    title: 'Possible cauda equina syndrome',
    category: 'neurological',
    tier: 'core',
    recommendedAction: 'Possible cauda equina syndrome: emergency referral for same-day MRI per local pathway.',
    basis: 'Informed by the GIRFT national suspected cauda equina syndrome pathway (2023)',
    dedupeKeywords: ['cauda equina'],
    evaluate(ctx) {
      const saddle = concept(ctx, 'saddle_anesthesia');
      const sphincter = anyConcepts(ctx, ['urinary_retention', 'incontinence']);
      const back = concept(ctx, 'back_pain');
      const legs = concept(ctx, 'bilateral_leg_symptoms');
      if (saddle) return fire('critical', [back, saddle, ...sphincter, legs]);
      if (sphincter.length > 0 && (back || legs)) return fire('critical', [back, ...sphincter, legs]);
      return null;
    },
  },
  {
    id: 'RF-CANCER-FEATURES',
    title: 'Features that may suggest cancer',
    category: 'oncology',
    tier: 'core',
    recommendedAction: 'Features that may suggest cancer: consider the urgent suspected-cancer referral pathway per local guidance.',
    basis: 'Informed by NICE NG12 (suspected cancer)',
    dedupeKeywords: ['cancer', 'malignan', 'oncolog'],
    evaluate(ctx) {
      const found: Criterion[] = anyConcepts(ctx, ['dysphagia', 'postmenopausal_bleeding']);
      const age = ageYears(ctx);
      const haem = concept(ctx, 'hematuria');
      if (haem && age !== null && age >= 45) found.push(haem, ageCriterion(ctx, `Age ${ctx.demo.ageDisplay ?? age}`));
      const wl = concept(ctx, 'weight_loss');
      if (wl) {
        const assoc = anyConcepts(ctx, ['hemoptysis', 'hematuria', 'rectal_bleeding', 'night_sweats', 'lump']);
        if (assoc.length > 0) found.push(...assoc);
        if (found.length > 0 || assoc.length > 0) found.push(wl);
      }
      return found.length > 0 ? fire('urgent', found) : null;
    },
  },
  // ------------------------------------------------------- extended
  {
    id: 'RF-LOW-GCS',
    title: 'Reduced level of consciousness',
    category: 'neurological',
    tier: 'extended',
    recommendedAction: 'Reduced consciousness: emergency assessment (airway, breathing, circulation, glucose).',
    basis: 'General emergency medicine teaching',
    dedupeKeywords: ['consciousness', 'gcs', 'unresponsive', 'obtunded'],
    evaluate(ctx) {
      const gcs = val(ctx, 'gcs');
      const unresp = concept(ctx, 'unresponsive');
      if ((gcs !== null && gcs <= 13) || unresp) {
        return fire('critical', [gcs !== null && gcs <= 13 ? vital(ctx, 'gcs', `GCS ${gcs}`) : null, unresp]);
      }
      return null;
    },
  },
  {
    id: 'RF-GI-BLEED',
    title: 'Possible gastrointestinal bleeding',
    category: 'gastrointestinal',
    tier: 'extended',
    recommendedAction: 'Possible gastrointestinal bleeding: urgent assessment; emergency referral if haemodynamically compromised.',
    basis: 'Informed by NICE CG141 (acute upper gastrointestinal bleeding)',
    dedupeKeywords: ['gastrointestinal bleed', 'gi bleed', 'haematemesis', 'hematemesis', 'melaena', 'melena'],
    evaluate(ctx) {
      const hr = val(ctx, 'hr');
      const sbp = val(ctx, 'sbp');
      const instability: Criterion[] = [
        ...(hr !== null && hr >= 100 ? [vital(ctx, 'hr', `HR ${hr}`)] : []),
        ...(sbp !== null && sbp < 100 ? [vital(ctx, 'sbp', `Systolic BP ${sbp}`)] : []),
        ...anyConcepts(ctx, ['syncope', 'presyncope']),
      ];
      const upper = anyConcepts(ctx, ['hematemesis', 'melena']);
      const pr = concept(ctx, 'rectal_bleeding');
      if (upper.length > 0 || (pr && instability.length > 0)) {
        return fire(instability.length > 0 ? 'critical' : 'urgent', [...upper, pr, ...instability]);
      }
      return null;
    },
  },
  {
    id: 'RF-PERITONISM',
    title: 'Signs of peritonism',
    category: 'surgical',
    tier: 'extended',
    recommendedAction: 'Signs of peritonism: same-day surgical assessment.',
    basis: 'General surgical teaching',
    dedupeKeywords: ['periton', 'acute abdomen', 'surgical abdomen'],
    evaluate(ctx) {
      const p = concept(ctx, 'peritonism');
      return p ? fire('urgent', [p]) : null;
    },
  },
  {
    id: 'RF-TESTICULAR-TORSION',
    title: 'Possible testicular torsion',
    category: 'surgical',
    tier: 'extended',
    recommendedAction: 'Possible testicular torsion — time-critical: immediate urological/surgical referral.',
    basis: 'Standard urological teaching',
    dedupeKeywords: ['torsion', 'testicular'],
    evaluate(ctx) {
      const t = concept(ctx, 'testicular_pain');
      if (!t) return null;
      const age = ageYears(ctx);
      const sudden = concept(ctx, 'sudden_onset');
      if (sudden) return fire('critical', [sudden, t]);
      if (age !== null && age < 25) return fire('critical', [ageCriterion(ctx, `Age ${ctx.demo.ageDisplay ?? age}`), t]);
      return null;
    },
  },
  {
    id: 'RF-PREECLAMPSIA',
    title: 'Possible pre-eclampsia',
    category: 'obstetric',
    tier: 'extended',
    recommendedAction: 'Possible pre-eclampsia: same-day obstetric assessment (emergency if severe-range blood pressure).',
    basis: 'Informed by NICE NG133 (hypertension in pregnancy)',
    dedupeKeywords: ['eclampsia', 'pre-eclampsia', 'preeclampsia'],
    evaluate(ctx) {
      if (!isPregnant(ctx)) return null;
      const gw = ctx.demo.gestationWeeks;
      if (gw !== null && gw < 20) return null;
      const sbp = val(ctx, 'sbp') ?? 0;
      const dbp = val(ctx, 'dbp') ?? 0;
      if (!(sbp >= 140 || dbp >= 90)) return null;
      const severe = sbp >= 160 || dbp >= 110;
      const symptoms = anyConcepts(ctx, ['headache', 'visual_disturbance', 'abdominal_pain', 'edema']);
      if (symptoms.length === 0 && !severe) return null;
      return fire(severe ? 'critical' : 'urgent', [
        { label: 'Pregnant', spans: ctx.demo.pregnancySpan ? [ctx.demo.pregnancySpan] : [] },
        vital(ctx, 'sbp', `BP ${val(ctx, 'sbp')}/${val(ctx, 'dbp') ?? '?'}`),
        ...symptoms,
      ]);
    },
  },
  {
    id: 'RF-REDUCED-FETAL-MOVEMENTS',
    title: 'Reduced fetal movements',
    category: 'obstetric',
    tier: 'extended',
    recommendedAction: 'Reduced fetal movements: same-day maternity assessment.',
    basis: 'Standard obstetric teaching',
    dedupeKeywords: ['fetal movement', 'foetal movement'],
    evaluate(ctx) {
      const r = concept(ctx, 'reduced_fetal_movements');
      return isPregnant(ctx) && r ? fire('urgent', [r]) : null;
    },
  },
  {
    id: 'RF-SEVERE-HYPERGLYCAEMIA',
    title: 'Severe hyperglycaemia',
    category: 'endocrine',
    tier: 'extended',
    recommendedAction: 'Severe hyperglycaemia: check ketones, assess hydration, same-day review.',
    basis: 'General diabetes teaching',
    dedupeKeywords: ['hyperglyc'],
    evaluate(ctx) {
      if (ctx.fired.has('RF-DKA')) return null;
      const g = val(ctx, 'glucoseMgdl');
      if (g !== null && g >= 400) {
        return fire('urgent', [vital(ctx, 'glucoseMgdl', `Glucose ${ctx.vitals.glucoseMgdl?.convertedFrom ?? `${g} mg/dL`}`)]);
      }
      return null;
    },
  },
  {
    id: 'RF-PAEDS-RED-FEATURES',
    title: 'Paediatric red-flag features',
    category: 'paediatric',
    tier: 'extended',
    recommendedAction: 'Paediatric red-flag features: immediate emergency paediatric assessment.',
    basis: 'Informed by NICE NG143 traffic-light "red" features',
    dedupeKeywords: ['paediatric', 'pediatric', 'child'],
    evaluate(ctx) {
      if (!isChild(ctx)) return null;
      const features = anyConcepts(ctx, [
        'grunting',
        'chest_indrawing',
        'cyanosis',
        'floppy',
        'bulging_fontanelle',
        'mottled',
        'weak_cry',
      ]);
      const rr = val(ctx, 'rr');
      if (rr !== null && rr > 60) features.push(vital(ctx, 'rr', `RR ${rr}`));
      return features.length > 0 ? fire('critical', [ageCriterion(ctx, `Age ${ctx.demo.ageDisplay}`), ...features]) : null;
    },
  },
  {
    id: 'RF-SYNCOPE-HIGH-RISK',
    title: 'Syncope with high-risk features',
    category: 'cardiovascular',
    tier: 'extended',
    recommendedAction: 'Syncope with high-risk features: same-day assessment including a 12-lead ECG.',
    basis: 'Informed by NICE CG109 (transient loss of consciousness)',
    dedupeKeywords: ['syncope', 'collapse'],
    evaluate(ctx) {
      const s = concept(ctx, 'syncope');
      if (!s) return null;
      const risk = anyConcepts(ctx, ['exertional', 'chest_pain', 'palpitations', 'known_cad', 'dyspnea']);
      return risk.length > 0 ? fire('urgent', [s, ...risk]) : null;
    },
  },
];

export const RULE_IDS = RULES.map((r) => r.id);

export function evaluateRules(ctx: Omit<RuleContext, 'fired'>): RuleFlag[] {
  const fired = new Set<string>();
  const flags: Array<{ flag: RuleFlag; order: number }> = [];
  RULES.forEach((rule, order) => {
    const res = rule.evaluate({ ...ctx, fired });
    if (!res) return;
    fired.add(rule.id);
    const seen = new Set<string>();
    const evidence: Span[] = [];
    for (const c of res.criteria) {
      for (const s of c.spans) {
        const k = `${s.start}:${s.end}`;
        if (!seen.has(k)) {
          seen.add(k);
          evidence.push(s);
        }
      }
    }
    evidence.sort((a, b) => a.start - b.start);
    const labels = [...new Set(res.criteria.map((c) => c.label))];
    flags.push({
      flag: {
        ruleId: rule.id,
        title: rule.title,
        severity: res.severity,
        category: rule.category,
        reasoning: labels.join(' + '),
        evidence,
        recommendedAction: rule.recommendedAction,
        basis: rule.basis,
      },
      order,
    });
  });
  flags.sort((a, b) =>
    a.flag.severity === b.flag.severity ? a.order - b.order : a.flag.severity === 'critical' ? -1 : 1,
  );
  return flags.map((f) => f.flag);
}

export function ruleById(id: string): RuleDef | undefined {
  return RULES.find((r) => r.id === id);
}
