import { describe, expect, it } from 'vitest';
import { RULES } from './rules';
import { runSafetyChecks } from './index';

const fired = (text: string) => runSafetyChecks(text).ruleFlags.map((f) => f.ruleId);
const flag = (text: string, id: string) => runSafetyChecks(text).ruleFlags.find((f) => f.ruleId === id);

/**
 * Per rule: at least one positive, one negated and one near-miss case (SPEC §5.9).
 * `negated` cases contain the key feature but negated; `nearMiss` cases are just outside the rule.
 */
const CASES: Record<string, { positive: string[]; negated: string[]; nearMiss: string[] }> = {
  'RF-NEWS2-HIGH': {
    positive: ['70M. RR 26, SpO2 90% RA, BP 100/60, HR 120, T 38.5.'],
    negated: ['70M, no breathlessness. RR 18, SpO2 97% RA, BP 130/80, HR 80, T 37.0.'],
    nearMiss: ['70M. RR 22, SpO2 95% RA, BP 125/80, HR 112, T 37.5.'],
  },
  'RF-NEWS2-MEDIUM': {
    positive: ['40M. RR 22, SpO2 95% RA, BP 125/80, HR 112, T 37.0.', '40M. RR 18, SpO2 97% RA, BP 125/80, HR 135, T 37.0.'],
    negated: ['40M, no fever. RR 18, SpO2 97% RA, BP 125/80, HR 80, T 37.0.'],
    nearMiss: ['40M. RR 22, SpO2 96% RA, BP 125/80, HR 105, T 37.0.'],
  },
  'RF-HYPOXIA': {
    positive: ['60M, cough. SpO2 89% on room air.', '70M with COPD, SpO2 86%.'],
    negated: ['60M, no hypoxia, SpO2 96%.'],
    nearMiss: ['60M, cough. SpO2 92%.', '70M with COPD, SpO2 89%.'],
  },
  'RF-HYPOTENSION': {
    positive: ['50F, dizzy, BP 84/50.'],
    negated: ['50F, not dizzy, BP 120/80.'],
    nearMiss: ['50F, dizzy, BP 90/60.'],
  },
  'RF-ACS': {
    positive: [
      '58M, central chest pain radiating to left arm.',
      '50F, chest tightness with sweating.',
      '45M, chest pressure on exertion.',
      '62M, chest pain and short of breath.',
      '35M, chest pain, history of MI.',
    ],
    negated: ['58M, denies chest pain, sweaty after running.', '58M, chest pain, no radiation, no sweating, not exertional.'],
    nearMiss: ['30M, chest pain and short of breath.', '58M, sweaty and nauseated, no chest pain.'],
  },
  'RF-PE': {
    positive: [
      '36F, short of breath, right calf swollen.',
      '40M, pleuritic chest pain, 5 days after hip surgery.',
      '30F on the combined pill, sudden breathlessness.',
      '45F, coughing up blood, previous DVT.',
    ],
    negated: ['36F, no breathlessness, right calf swollen.'],
    nearMiss: ['36F, short of breath, no leg swelling, no recent surgery.'],
  },
  'RF-HTN-EMERGENCY': {
    positive: ['60M, BP 190/110, headache.', '55F, BP 175/125, chest pain.', '70M, BP 200/100, confused.'],
    negated: ['60M, BP 190/110, no headache, chest pain or visual changes.'],
    nearMiss: ['60M, BP 175/110, headache.'],
  },
  'RF-HTN-SEVERE': {
    positive: ['62M, routine check, BP 186/112.'],
    negated: ['62M, BP 186/112, headache.'],
    nearMiss: ['62M, routine check, BP 178/118.'],
  },
  'RF-STROKE': {
    positive: [
      '71F, right facial droop.',
      '65M, sudden left arm weakness.',
      '50M, slurred speech since 1 hour.',
      '60F, sudden loss of vision in one eye.',
      '55M, left-sided numbness.',
    ],
    negated: ['71F, no facial droop, no arm weakness, no speech difficulty.'],
    nearMiss: ['71F, generalised weakness and tiredness.'],
  },
  'RF-THUNDERCLAP': {
    positive: ['45M, worst headache of my life.', '40F, sudden severe headache.', '38M, headache came on suddenly while lifting.'],
    negated: ['45M, headache, not sudden, no thunderclap features.'],
    nearMiss: ['45M, headache for 3 days, sudden nausea later.'],
  },
  'RF-MENINGITIS': {
    positive: ['20M, fever 39 °C, neck stiffness.', '18F, febrile with photophobia.', '6M, non-blanching rash.'],
    negated: ['20M, fever 39 °C, no neck stiffness or photophobia, no rash.'],
    nearMiss: ['20M, no fever, neck stiffness after gym.'],
  },
  'RF-SEPSIS': {
    positive: [
      '82F, dysuria. T 38.9, HR 118, BP 96/58, RR 24, SpO2 94% RA, confused.',
      '70M, productive cough, RR 24, BP 98/60.',
    ],
    negated: ['70M, no fever, no cough. RR 24, BP 98/60.'],
    nearMiss: ['40M, fever 38.5. RR 18, BP 125/80, HR 95, SpO2 98% RA.'],
  },
  'RF-DELIRIUM': {
    positive: ['80M, acutely confused since yesterday.'],
    negated: ['80M, not confused, eating well.'],
    nearMiss: ['50M, confused after a fall.', '80M, confused with right facial droop.'],
  },
  'RF-ANAPHYLAXIS': {
    positive: ['33F after eating peanuts, lip swelling.', '25M, hives and wheezing.', '40F, bee sting, throat feels tight.'],
    negated: ['33F after eating peanuts, no lip swelling, no wheeze, no breathlessness.'],
    nearMiss: ['33F, hives after eating, otherwise well.'],
  },
  'RF-PREGNANCY-PAIN-BLEEDING': {
    positive: ['29F, positive pregnancy test, vaginal bleeding.', '30F, 8 weeks pregnant, lower abdominal pain.'],
    negated: ['29F, positive pregnancy test, no bleeding, no abdominal pain.'],
    nearMiss: ['29F, negative pregnancy test, lower abdominal pain.'],
  },
  'RF-DKA': {
    positive: ['19M type 1 diabetes, ketones 3.5 mmol/L.', '25F, glucose 20 mmol/L, vomiting.', '30M, BG 300 mg/dL, abdominal pain.'],
    negated: ['19M type 1 diabetes, glucose 20 mmol/L, no vomiting, no abdominal pain.'],
    nearMiss: ['19M, ketones 1.0, glucose 12 mmol/L.'],
  },
  'RF-HYPOGLYCAEMIA': {
    positive: ['60M on insulin, glucose 3.2 mmol/L.', '70F, BG 50 mg/dL.'],
    negated: ['60M on insulin, glucose 5.5 mmol/L, no hypoglycaemia.'],
    nearMiss: ['60M on insulin, glucose 3.9 mmol/L.'],
  },
  'RF-INFANT-FEVER': {
    positive: ['7-week-old boy, fever 38.4 °C.', '2-month-old girl, temperature 38.1 °C.'],
    negated: ['7-week-old boy, no fever, feeding well.'],
    nearMiss: ['4-month-old boy, fever 38.4 °C.', '7-week-old boy, T 37.8.'],
  },
  'RF-SUICIDE-RISK': {
    positive: ['27M says he has been thinking about ending his life.', '30F with suicidal ideation.', '22M wants to die.'],
    negated: ['27M low mood, denies suicidal ideation.'],
    nearMiss: ['27M low mood and poor sleep.'],
  },
  'RF-CAUDA-EQUINA': {
    positive: [
      '41F, back pain and saddle numbness.',
      '50M, low back pain, difficulty passing urine.',
      '45F, numbness around the buttocks.',
    ],
    negated: ['38M, back pain, no saddle numbness, no bladder or bowel incontinence, no difficulty passing urine.'],
    nearMiss: ['38M, back pain after lifting, tingling in one leg.'],
  },
  'RF-CANCER-FEATURES': {
    positive: [
      '67M, difficulty swallowing solids.',
      '58F, postmenopausal bleeding.',
      '60M, blood in urine.',
      '55M, unintentional weight loss and night sweats.',
    ],
    negated: ['67M, no difficulty swallowing, no weight loss.'],
    nearMiss: ['30F, blood in urine with dysuria.', '55M, unintentional weight loss.'],
  },
  'RF-LOW-GCS': {
    positive: ['70M found at home, GCS 12.', '60F unresponsive on arrival.'],
    negated: ['70M, alert, not unresponsive, GCS 15.'],
    nearMiss: ['70M, GCS 14.'],
  },
  'RF-GI-BLEED': {
    positive: ['55M vomiting blood.', '60F, black tarry stools.', '70M, rectal bleeding, HR 115.'],
    negated: ['55M, no vomiting blood, no black stools.'],
    nearMiss: ['30F, small rectal bleeding with constipation, HR 80, BP 120/80.'],
  },
  'RF-PERITONISM': {
    positive: ['30M, abdominal pain with guarding and rebound tenderness.'],
    negated: ['30M, abdominal pain, no guarding, no rebound tenderness.'],
    nearMiss: ['30M, abdominal pain, soft abdomen.'],
  },
  'RF-TESTICULAR-TORSION': {
    positive: ['15M, sudden testicular pain.', '19M, testicular pain since morning.'],
    negated: ['15M, no testicular pain, groin rash.'],
    nearMiss: ['60M, testicular pain for weeks.'],
  },
  'RF-PREECLAMPSIA': {
    positive: ['31F, 34 weeks pregnant, BP 150/95, headache.', '28F, 30 weeks pregnant, BP 165/112.'],
    negated: ['31F, 34 weeks pregnant, BP 150/95, no headache, no visual disturbance, no swelling of the face.'],
    nearMiss: ['31F, 12 weeks pregnant, BP 150/95, headache.', '31F, 34 weeks pregnant, BP 135/85, headache.'],
  },
  'RF-REDUCED-FETAL-MOVEMENTS': {
    positive: ['30F, 32 weeks pregnant, reduced fetal movements since yesterday.'],
    negated: ['30F, 32 weeks pregnant, denies reduced fetal movements.'],
    nearMiss: ['30F, 32 weeks pregnant, mild back ache.'],
  },
  'RF-SEVERE-HYPERGLYCAEMIA': {
    positive: ['50M, glucose 25 mmol/L, otherwise well.'],
    negated: ['50M, glucose 8 mmol/L, no hyperglycaemia.'],
    nearMiss: ['50M, glucose 20 mmol/L, otherwise well.'],
  },
  'RF-PAEDS-RED-FEATURES': {
    positive: ['2-year-old boy, grunting and chest indrawing.', '1-year-old girl, mottled skin.', '3-year-old girl, RR 65.'],
    negated: ['2-year-old boy, no grunting, no cyanosis.'],
    nearMiss: ['20M, grunting with exertion.', '3-year-old girl, RR 40.'],
  },
  'RF-SYNCOPE-HIGH-RISK': {
    positive: ['45M, fainted while running.', '60F, syncope with palpitations.'],
    negated: ['45M, no syncope, palpitations after coffee.'],
    nearMiss: ['25F, fainted after standing in the heat.'],
  },
};

describe('rule catalog', () => {
  it('has 30 rules with unique ids and complete metadata', () => {
    expect(RULES).toHaveLength(30);
    expect(new Set(RULES.map((r) => r.id)).size).toBe(30);
    for (const r of RULES) {
      expect(r.title.length).toBeGreaterThan(3);
      expect(r.recommendedAction.length).toBeGreaterThan(10);
      expect(r.basis.length).toBeGreaterThan(5);
      expect(r.dedupeKeywords.length).toBeGreaterThan(0);
    }
  });

  it('has test cases for every rule', () => {
    expect(Object.keys(CASES).sort()).toEqual(RULES.map((r) => r.id).sort());
  });
});

describe.each(Object.entries(CASES))('%s', (id, { positive, negated, nearMiss }) => {
  it.each(positive)('fires: %s', (text) => expect(fired(text)).toContain(id));
  it.each(negated)('negated: %s', (text) => expect(fired(text)).not.toContain(id));
  it.each(nearMiss)('near miss: %s', (text) => expect(fired(text)).not.toContain(id));
});

describe('rule output', () => {
  it('builds reasoning from the matched criteria and evidence spans from the text', () => {
    const text = '58M, central chest pressure radiating to left arm, sweaty.';
    const f = flag(text, 'RF-ACS');
    expect(f?.reasoning).toBe('Chest pain + Radiation to arm/jaw/neck + Sweating');
    for (const e of f?.evidence ?? []) expect(text.slice(e.start, e.end)).toBe(e.text);
    expect(f?.evidence.map((e) => e.text)).toEqual(['central chest pressure', 'radiating to left arm', 'sweaty']);
  });

  it('sorts critical flags before urgent ones', () => {
    const flags = runSafetyChecks('62M, BP 186/112, difficulty swallowing, slurred speech.').ruleFlags;
    const severities = flags.map((f) => f.severity);
    expect(severities).toEqual([...severities].sort((a, b) => (a === b ? 0 : a === 'critical' ? -1 : 1)));
  });

  it('meningitis is urgent for a rash without fever and critical with fever', () => {
    expect(flag('30F, petechial rash on legs.', 'RF-MENINGITIS')?.severity).toBe('urgent');
    expect(flag('30F, petechial rash on legs, T 38.5.', 'RF-MENINGITIS')?.severity).toBe('critical');
  });

  it('DKA is urgent with moderate ketones and no symptoms', () => {
    expect(flag('25M type 1 diabetes, ketones 2.0 mmol/L, feels well.', 'RF-DKA')?.severity).toBe('urgent');
  });

  it('family history does not trigger rules', () => {
    expect(fired('40M, family history of MI, chest pain after meals, no sweating, no radiation.')).not.toContain('RF-ACS');
  });

  it('severe hypertension rules are skipped in pregnancy', () => {
    const ids = fired('31F, 34 weeks pregnant, BP 185/120, headache.');
    expect(ids).not.toContain('RF-HTN-EMERGENCY');
    expect(ids).toContain('RF-PREECLAMPSIA');
  });
});
