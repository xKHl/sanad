import { CaseSchema, type SyntheticCase } from './schema';

/**
 * Held-out cases (SPEC §13.3). Written after the rules were frozen, by a different author, and
 * never used to tune the rules. Misses are reported in docs/EVALUATION.md, not fixed silently.
 * Written on 2026-10-06 by an independent model instance that had no access to the code, the
 * lexicon, the tests or the development cases; its only reference was the published criteria
 * (SPEC §5.5 to §5.7). Expected labels are that author's reading of the criteria.
 */
const RAW: SyntheticCase[] = [
  { id: 'H01', title: 'Exertional chest pain with collapse', tags: ['positive', '58M'], scenario: '58M c/o central CP radiating to jaw and L arm, started while climbing stairs ~1h ago, diaphoretic, briefly passed out at home, now alert GCS 15. PMHx T2DM, HTN, smoker. NKDA. Meds metformin, amlodipine. o/e BP 152/88, HR 102, RR 20, SpO2 96% RA, T 36.9.', expectedFlags: ['RF-ACS', 'RF-SYNCOPE-HIGH-RISK'], expectedNews2: { status: 'complete', band: 'low', total: 1 } },
  { id: 'H02', title: 'Elderly urosepsis with new confusion', tags: ['positive', '72F'], scenario: '72F brought by daughter, burning micturition + fever x2d, today new confusion, not her baseline. PMHx DM. NKDA. o/e T 39.2, HR 118, BP 96/58, RR 24, sats 94% RA.', expectedFlags: ['RF-NEWS2-HIGH', 'RF-SEPSIS', 'RF-DELIRIUM'], expectedNews2: { status: 'complete', band: 'high', total: 12 } },
  { id: 'H03', title: 'Pleuritic pain, calf swelling, on OCP', tags: ['positive', '34F'], scenario: '34F SOB + R-sided pleuritic CP x2d, L calf swollen and tender. On OCP. No PMHx. UPT neg. o/e sats 90% on air, P 112, RR 24, BP 118/76, T 37.4.', expectedFlags: ['RF-NEWS2-HIGH', 'RF-HYPOXIA', 'RF-PE'], expectedNews2: { status: 'complete', band: 'high', total: 7 } },
  { id: 'H04', title: 'Acute hemiparesis with very high BP', tags: ['positive', '66M'], scenario: '66M sudden onset R arm weakness and slurred speech ~1h ago, wife noticed R facial droop. PMHx HTN, poor compliance. o/e alert, BP 196/104, HR 88, RR 18, SpO2 97%, T 36.9.', expectedFlags: ['RF-STROKE', 'RF-HTN-EMERGENCY'], expectedNews2: { status: 'complete', band: 'low', total: 0 } },
  { id: 'H05', title: 'Sudden worst-ever headache, partial vitals', tags: ['positive', '41F'], scenario: '41F c/o sudden severe occipital headache that came on during workout, worst headache of her life, peaked within a minute. Vomited x1. No fever. o/e BP 164/96, P 84, T 37.0.', expectedFlags: ['RF-THUNDERCLAP'], expectedNews2: { status: 'partial', band: 'low', total: 0 } },
  { id: 'H06', title: 'Febrile headache with neck stiffness', tags: ['positive', '22M'], scenario: '22M fever, severe headache, neck stiffness and photophobia since yesterday. No rash. o/e alert, T 39.4, P 116, BP 112/70, RR 22, sats 97% RA.', expectedFlags: ['RF-MENINGITIS', 'RF-SEPSIS', 'RF-NEWS2-MEDIUM'], expectedNews2: { status: 'complete', band: 'medium', total: 6 } },
  { id: 'H07', title: 'T1DM missed insulin, vomiting, ketones', tags: ['positive', '19M'], scenario: '19M known T1DM, missed insulin x2d, vomiting + abdo pain since last night, deep sighing breathing. RBS 420 mg/dL, blood ketones 4.2 mmol/L. o/e abdomen soft, no guarding. P 120, RR 28, BP 108/70, SpO2 98%, T 37.2.', expectedFlags: ['RF-DKA', 'RF-NEWS2-MEDIUM'], expectedNews2: { status: 'complete', band: 'medium', total: 6 } },
  { id: 'H08', title: 'Melaena on NSAIDs with shock', tags: ['positive', '63M'], scenario: '63M black tarry stools x2d, dizzy when standing, on aspirin + ibuprofen for knee pain. o/e pale, BP 86/50, HR 124, RR 22, sats 95% RA, T 36.4.', expectedFlags: ['RF-NEWS2-HIGH', 'RF-HYPOTENSION', 'RF-GI-BLEED'], expectedNews2: { status: 'complete', band: 'high', total: 8 } },
  { id: 'H09', title: 'Shellfish reaction with throat tightness', tags: ['positive', '30F'], scenario: '30F known shellfish allergy, ate shrimp ~20 min ago, now generalised hives, lips swelling, throat feels tight, wheezy. o/e RR 26, sats 93% RA, P 118, BP 98/60, T 36.8.', expectedFlags: ['RF-NEWS2-HIGH', 'RF-ANAPHYLAXIS'], expectedNews2: { status: 'complete', band: 'high', total: 9 } },
  { id: 'H10', title: 'Adolescent acute scrotal pain', tags: ['positive', '17M'], scenario: '17M woke up with sudden severe L testicular pain x3h, nausea, vomited twice. No trauma. o/e L testis high-riding and very tender. P 96, BP 128/74, RR 18, SpO2 99%, T 37.1.', expectedFlags: ['RF-TESTICULAR-TORSION'], expectedNews2: { status: 'complete', band: 'low', total: 1 } },
  { id: 'H11', title: 'Back pain with saddle numbness and retention', tags: ['positive', '45M'], scenario: '45M LBP x1wk after lifting, now numb around perineum/saddle area and has not passed urine since morning, tingling both legs. o/e BP 138/84, HR 82, RR 16, SpO2 98%, T 36.7.', expectedFlags: ['RF-CAUDA-EQUINA'], expectedNews2: { status: 'complete', band: 'low', total: 0 } },
  { id: 'H12', title: 'Asymptomatic high BP, family cardiac hx', tags: ['tricky-negative', '55M'], scenario: '55M routine HTN f/u. Asymptomatic: no chest pain, no SOB, no headache, no visual sx. Father had MI at 50, brother had a stroke. Meds amlodipine, ran out x2wk. o/e BP 184/100, P 78, RR 16, SpO2 98%, T 36.6.', expectedFlags: ['RF-HTN-SEVERE'], expectedNews2: { status: 'complete', band: 'low', total: 0 } },
  { id: 'H13', title: 'Low mood, denies suicidal ideation', tags: ['tricky-negative', '24F'], scenario: '24F c/o low mood and poor sleep x2mo since job loss. Denies SI, no thoughts of self-harm, no plans. Feels supported by family. NKDA, no meds. BP 116/72, HR 80.', expectedFlags: [], expectedNews2: { status: 'insufficient', band: null, total: null } },
  { id: 'H14', title: 'Remote TIA, no current deficit', tags: ['tricky-negative', '70M'], scenario: '70M f/u, hx TIA 3 yrs ago, fully recovered. Currently no facial droop, no limb weakness or numbness, speech normal, no confusion. On aspirin + atorvastatin. o/e BP 138/80, P 72, RR 16, sats 96%, T 36.7.', expectedFlags: [], expectedNews2: { status: 'complete', band: 'low', total: 0 } },
  { id: 'H15', title: 'Gradual headache, sudden nausea only', tags: ['tricky-negative', '35M'], scenario: '35M headache x2d, gradual onset, bifrontal, worse with screen work. Had sudden nausea this am, settled. No fever, no neck stiffness, no photophobia, no rash. o/e T 37.1, P 82, BP 124/78, RR 14, SpO2 99%.', expectedFlags: [], expectedNews2: { status: 'complete', band: 'low', total: 0 } },
  { id: 'H16', title: 'Routine diabetes follow-up', tags: ['benign', '45F'], scenario: '45F DM f/u, no complaints. HbA1c 6.9%, FBS 126 mg/dL. On metformin. NKDA. o/e BP 126/78, HR 74, RR 14, SpO2 98% RA, T 36.6.', expectedFlags: [], expectedNews2: { status: 'complete', band: 'low', total: 0 } },
  { id: 'H17', title: 'Minor URTI', tags: ['benign', '29M'], scenario: '29M sore throat, runny nose, mild dry cough x3d, eating and drinking ok. NKDA, no meds. o/e T 37.6, P 88, BP 118/72, RR 16, sats 98%. Throat mildly red, chest clear.', expectedFlags: [], expectedNews2: { status: 'complete', band: 'low', total: 0 } },
  { id: 'H18', title: 'Thyroid medication refill', tags: ['benign', '38F'], scenario: '38F here for levothyroxine refill, feels well, no new sx. TSH at last visit normal. NKDA. o/e BP 112/70, P 68, RR 14, SpO2 99%, T 36.5.', expectedFlags: [], expectedNews2: { status: 'complete', band: 'low', total: 0 } },
  { id: 'H19', title: 'Third-trimester headache and high BP', tags: ['edge-pregnancy', '32F'], scenario: '32F G2P1, 34 wks pregnant, c/o frontal headache and blurry vision since this am, swollen feet and hands. FM normal, no PV bleeding, no abdo pain. o/e BP 162/112, P 92, RR 18, SpO2 98%, T 36.8. Urine dip protein 2+.', expectedFlags: ['RF-PREECLAMPSIA'], expectedNews2: { status: 'not_applicable', band: null, total: null } },
  { id: 'H20', title: 'Febrile young infant, grunting', tags: ['edge-child', '8wk M'], scenario: '8-wk-old baby boy, fever 38.5 at home x1d, poor feeding, grunting, mum says more sleepy than usual. o/e T 38.6, HR 178, RR 64, sats 95%, fontanelle flat, cap refill 3s.', expectedFlags: ['RF-INFANT-FEVER', 'RF-PAEDS-RED-FEATURES'], expectedNews2: { status: 'not_applicable', band: null, total: null } },
];

/**
 * Held-out set 2 (H21-H40), written by a second independent model instance after rules v1.2.0
 * were frozen, with the same restriction (criteria only). This is the clean generalisation test
 * for v1.2.0; set 1 informed the v1.2.0 parser fix and is reported separately.
 */
const RAW2: SyntheticCase[] = [
  {
    id: 'H21',
    title: 'Hypoglycaemia on sulfonylurea',
    tags: ['positive', '58M'],
    scenario: '58M T2DM on gliclazide, c/o sweaty + shaky x1h, skipped lunch today. Alert & oriented, talking normally. CBG 3.1 mmol/L. HR 98, BP 132/80, RR 16, SpO2 98% RA, T 36.7. NKDA.',
    expectedFlags: ['RF-HYPOGLYCAEMIA'],
    expectedNews2: { status: 'complete', band: 'low', total: 1 },
  },
  {
    id: 'H22',
    title: 'Low mood with suicidal thoughts',
    tags: ['positive', '27F'],
    scenario: 'A 27-year-old woman attending for follow-up of low mood. She reports poor sleep and poor appetite, and says that over the past two weeks she has been having thoughts of ending her life and has thought about taking all of her tablets at once. She has not harmed herself so far. She takes sertraline. No known drug allergies. Pulse 82, BP 118/74, temp 36.8, RR 14, sats 99% on air.',
    expectedFlags: ['RF-SUICIDE-RISK'],
    expectedNews2: { status: 'complete', band: 'low', total: 0 },
  },
  {
    id: 'H23',
    title: 'Post-menopausal bleeding with very high BP',
    tags: ['positive', '68F'],
    scenario: '68 yo female, periods stopped ~15 yrs ago, now 3 wks of post-menopausal bleeding (light spotting). Incidental BP 184/96, rpt 182/98 after 10 min rest. Pt asymptomatic: no headache, no chest pain, no SOB, vision fine, no weakness. Not on any regular meds. NKDA. HR 78 RR 16 SpO2 97% RA T 36.6.',
    expectedFlags: ['RF-CANCER-FEATURES', 'RF-HTN-SEVERE'],
    expectedNews2: { status: 'complete', band: 'low', total: 0 },
  },
  {
    id: 'H24',
    title: 'Post-ictal with reduced GCS',
    tags: ['positive', '52M'],
    scenario: '52M brought from waiting area by wife after a witnessed fit approx 40 min ago. Known epilepsy, missed doses of levetiracetam this week. Now acutely confused, GCS 12 (E3 V4 M5), moving all 4 limbs equally. Obs: RR 10, SpO2 95% RA, BP 150/90, HR 64, T 36.5. CBG 6.2 mmol/L. Allergies not known.',
    expectedFlags: ['RF-LOW-GCS', 'RF-NEWS2-MEDIUM'],
    expectedNews2: { status: 'complete', band: 'medium', total: 5 },
  },
  {
    id: 'H25',
    title: 'RIF pain with guarding and rebound',
    tags: ['positive', '35F'],
    scenario: '35F, RIF pain x24h, started around umbilicus then moved. Anorexic, vomited x2. Not pregnant (urine hCG neg). o/e: guarding and rebound tenderness in RIF. T 38.4C, HR 108, BP 118/72, RR 20, SpO2 98%. No meds, NKDA.',
    expectedFlags: ['RF-PERITONISM'],
    expectedNews2: { status: 'complete', band: 'low', total: 2 },
  },
  {
    id: 'H26',
    title: 'Early pregnancy pain and spotting',
    tags: ['edge-pregnancy-positive', '29F'],
    scenario: '29F G2P1, ~8 weeks pregnant by LMP, no scan yet. C/o PV spotting since this morning + L iliac fossa pain, also pain at tip of L shoulder. Vitals - HR 112, BP 98/60, RR 22, SpO2 97%, T 36.9. Folic acid only. NKDA.',
    expectedFlags: ['RF-PREGNANCY-PAIN-BLEEDING'],
    expectedNews2: { status: 'not_applicable', band: null, total: null },
  },
  {
    id: 'H27',
    title: 'Third trimester reduced fetal movements',
    tags: ['edge-pregnancy-positive', '31F'],
    scenario: 'A 31-year-old woman at 34 weeks\' gestation in her first pregnancy says the baby has been moving much less than usual since yesterday evening. She has no abdominal pain, no bleeding and no leakage of fluid. No headache or visual symptoms. BP 124/78, pulse 86, temperature 36.6 C, RR 16, SpO2 99%. Allergic to penicillin. Taking pregnancy vitamins.',
    expectedFlags: ['RF-REDUCED-FETAL-MOVEMENTS'],
    expectedNews2: { status: 'not_applicable', band: null, total: null },
  },
  {
    id: 'H28',
    title: 'Very high glucose, ketones normal',
    tags: ['positive', '66M'],
    scenario: '66M T2DM, ran out of metformin 3 wks ago. Polyuria/polydipsia x1wk. RBS 452 mg/dL, blood ketones 0.4 mmol/L. Denies vomiting, abdo pain or SOB. Alert, chatty. HR 92, BP 142/86, T 36.9, RR 18. Sats not done.',
    expectedFlags: ['RF-SEVERE-HYPERGLYCAEMIA'],
    expectedNews2: { status: 'partial', band: 'low', total: 1 },
  },
  {
    id: 'H29',
    title: 'Febrile pyelonephritis with tachycardia',
    tags: ['positive', '44F'],
    scenario: '44 y/o lady with 2 days of dysuria and right loin pain, now fever and rigors since last night. Temp 39.4C. Pulse 124 and regular. BP 94/60. Resp 24. O2 sat 96% on air. Alert and oriented. Not pregnant. Allergic to sulfa drugs. No regular medications.',
    expectedFlags: ['RF-SEPSIS', 'RF-NEWS2-HIGH'],
    expectedNews2: { status: 'complete', band: 'high', total: 8 },
  },
  {
    id: 'H30',
    title: 'Exertional chest tightness radiating to arm',
    tags: ['positive', '55M'],
    scenario: '55M c/o central chest tightness that came on climbing stairs to the clinic, going down L arm, ~20 min, feels clammy. PMHx DM, HTN on metformin + amlodipine. NKDA. HR104 BP 158/94 RR 22 O2 sat 95% T 36.8.',
    expectedFlags: ['RF-ACS'],
    expectedNews2: { status: 'complete', band: 'low', total: 4 },
  },
  {
    id: 'H31',
    title: 'Pleuritic pain after surgery, on oxygen',
    tags: ['positive', '36F'],
    scenario: '36F, 8 days post R knee arthroscopy, on the combined pill. Sudden SOB this morning with sharp R-sided chest pain worse on deep breath; R calf swollen and tender. Not pregnant. Triage put her on 4 L oxygen via nasal cannula: SpO2 93%, RR 24, pulse 116, BP 112/70, Temp 37.4. NKDA.',
    expectedFlags: ['RF-PE', 'RF-NEWS2-HIGH'],
    expectedNews2: { status: 'complete', band: 'high', total: 8 },
  },
  {
    id: 'H32',
    title: 'Family history of MI, no chest pain',
    tags: ['tricky-negative', '42M'],
    scenario: '42M here for a cholesterol check because his father had a heart attack at 50 and his mother had breast cancer. He denies any chest pain, shortness of breath or palpitations and exercises 3x/week without symptoms. No meds, NKDA. HR 72, BP 128/82, RR 14, SpO2 98%, T 36.5.',
    expectedFlags: [],
    expectedNews2: { status: 'complete', band: 'low', total: 0 },
  },
  {
    id: 'H33',
    title: 'Knee pain with old DVT and resolved TIA',
    tags: ['tricky-negative', '61M'],
    scenario: 'Pt 61M, R knee pain after gardening x2d, worse kneeling. PMHx: DVT L leg some years ago, treated, anticoagulation stopped long ago. TIA a few years back with full recovery, no current weakness, numbness, facial droop or speech problems. No SOB, no chest pain, no calf swelling. On atorvastatin. NKDA. HR 70, BP 136/84, T 36.6.',
    expectedFlags: [],
    expectedNews2: { status: 'partial', band: 'low', total: 0 },
  },
  {
    id: 'H34',
    title: 'Simple cystitis with figurative language',
    tags: ['tricky-negative', '30F'],
    scenario: '30F c/o burning on urination and frequency x2d. Says "the burning is killing me" and she is desperate to get rid of it before work. Worried about cancer because her aunt was diagnosed recently, and her mother had a stroke last year. No fever, no loin pain, no blood in urine. LMP 1 wk ago, not pregnant. NKDA. T 36.9, HR 84, BP 112/70, RR 16, SpO2 99%.',
    expectedFlags: [],
    expectedNews2: { status: 'complete', band: 'low', total: 0 },
  },
  {
    id: 'H35',
    title: 'Diabetes review with negated red flags',
    tags: ['tricky-negative', '58M'],
    scenario: 'DM review, 58M. On metformin + sitagliptin. No hypos. FBS 7.2 mmol/L, HbA1c 8.1%. ROS: no chest pain on exertion, no SOB, no wt loss, no blood in stool, no difficulty swallowing. Tingling/numbness both feet, symmetrical, glove-and-stocking, gradual over 1 yr. BP 134/80, HR 76, SpO2 97%. NKDA.',
    expectedFlags: [],
    expectedNews2: { status: 'partial', band: 'low', total: 0 },
  },
  {
    id: 'H36',
    title: 'Common cold',
    tags: ['benign', '24M'],
    scenario: '24M sore throat, runny nose and mild dry cough x3d. No fever. Eating and drinking well. No meds, NKDA. T 37.2 HR 80 BP 122/76 RR 14 SpO2 98% RA.',
    expectedFlags: [],
    expectedNews2: { status: 'complete', band: 'low', total: 0 },
  },
  {
    id: 'H37',
    title: 'Mechanical low back pain',
    tags: ['benign', '39F'],
    scenario: 'This 39-year-old woman lifted a heavy box two days ago and has had lower back pain since, no radiation down the legs. Bladder and bowel normal, no saddle numbness. Takes paracetamol as needed, no known allergies. BP 118/76, pulse 74, temperature 36.6.',
    expectedFlags: [],
    expectedNews2: { status: 'partial', band: 'low', total: 0 },
  },
  {
    id: 'H38',
    title: 'Chronic elbow eczema',
    tags: ['benign', '46M'],
    scenario: 'Itchy dry patches on both elbows for months, worse in winter, improves with moisturiser. 46M, otherwise well, no new meds, NKDA. Obs: T 36.4, P 68, BP 124/78, RR 12, SpO2 99%.',
    expectedFlags: [],
    expectedNews2: { status: 'complete', band: 'low', total: 0 },
  },
  {
    id: 'H39',
    title: 'Febrile child with cough',
    tags: ['edge-child', '6y-male'],
    scenario: '6 yo boy, cough + fever x2d, mum gave paracetamol. Playful, drinking ok. No grunting, no indrawing, no rash, no neck stiffness. Temp 38.9, RR 28, HR 130, SpO2 96%. NKDA.',
    expectedFlags: [],
    expectedNews2: { status: 'not_applicable', band: null, total: null },
  },
  {
    id: 'H40',
    title: 'Low sats with only two observations',
    tags: ['edge-insufficient-vitals', '72F'],
    scenario: '72F, worsening cough x2 days. No known lung disease. Nurse got sats 90% on air and pulse 96 before the machine failed, rest of obs pending. Taking amlodipine. NKDA.',
    expectedFlags: ['RF-NEWS2-MEDIUM', 'RF-HYPOXIA'],
    expectedNews2: { status: 'insufficient', band: null, total: null },
  },
];

export const HOLDOUT_CASES: SyntheticCase[] = [...RAW, ...RAW2].map((c) => CaseSchema.parse(c));
