import { CaseSchema, type SyntheticCase } from './schema';

/**
 * Development cases (SPEC Appendix A). All fictional. Used as UI samples and as the golden
 * test set; because the rules were built with these cases, results on them are not a measure
 * of generalisation (see holdout.ts).
 */
const RAW: SyntheticCase[] = [
  {
    id: 'C01',
    title: 'Exertional chest pain',
    tags: ['cardiac', '58M', 'critical'],
    scenario:
      '58M, central chest pressure for 2 hours radiating to left arm, started while climbing stairs, sweaty and nauseated. Smoker 30 pack-years, T2DM on metformin. BP 162/94, HR 108, RR 20, SpO2 95% RA, T 36.8.',
    expectedFlags: ['RF-ACS'],
    expectedNews2: { status: 'complete', band: 'low', total: 2 },
  },
  {
    id: 'C02',
    title: 'Sudden arm weakness and slurred speech',
    tags: ['neuro', '71F', 'critical'],
    scenario:
      '71F brought by daughter, sudden right arm weakness and slurred speech noticed 40 minutes ago, right facial droop. Hx AF, not on anticoagulation, HTN. BP 188/102, HR 96 irregular, SpO2 97%, glucose 7.2 mmol/L.',
    expectedFlags: ['RF-STROKE', 'RF-HTN-EMERGENCY'],
    expectedNews2: { status: 'partial', band: 'low', total: 1 },
  },
  {
    id: 'C03',
    title: 'Confused older woman with urinary symptoms',
    tags: ['infection', '82F', 'critical'],
    scenario:
      '82F from home, 2 days of dysuria and frequency, today more confused per son and not eating. Hx CKD3, HTN on amlodipine. T 38.9, HR 118, BP 96/58, RR 24, SpO2 94% on room air.',
    expectedFlags: ['RF-SEPSIS', 'RF-NEWS2-HIGH', 'RF-DELIRIUM'],
    expectedNews2: { status: 'complete', band: 'high', total: 11 },
  },
  {
    id: 'C04',
    title: 'Febrile 7-week-old',
    tags: ['paediatric', 'infant', 'critical'],
    scenario:
      '7-week-old boy, fever 38.4 °C since this morning, feeding less than usual, fewer wet nappies. Born at term, no PMH. HR 172, RR 48.',
    expectedFlags: ['RF-INFANT-FEVER'],
    expectedNews2: { status: 'not_applicable', band: null, total: null },
  },
  {
    id: 'C05',
    title: 'Sore throat and runny nose',
    tags: ['benign', '24F'],
    scenario:
      '24F, 3 days of sore throat, runny nose and mild dry cough. No fever, no shortness of breath, eating and drinking normally. No PMH, no regular meds, NKDA. T 37.1, HR 78, SpO2 99%.',
    expectedFlags: [],
    expectedNews2: { status: 'partial', band: 'low', total: 0 },
  },
  {
    id: 'C06',
    title: 'Worst headache of life',
    tags: ['neuro', '45M', 'critical'],
    scenario:
      '45M, sudden-onset severe occipital headache while lifting weights 3 hours ago, "worst headache of my life", vomited twice, mild neck stiffness. No head trauma. BP 158/92, HR 88, T 36.9, GCS 15.',
    expectedFlags: ['RF-THUNDERCLAP'],
    expectedNews2: { status: 'partial', band: 'low', total: 0 },
  },
  {
    id: 'C07',
    title: 'Early pregnancy with pain and bleeding',
    tags: ['obstetric', '29F', 'critical'],
    scenario:
      '29F, LMP 7 weeks ago, positive home pregnancy test, lower abdominal pain on the left since last night and light vaginal bleeding, felt faint once this morning. HR 112, BP 104/66.',
    expectedFlags: ['RF-PREGNANCY-PAIN-BLEEDING'],
    expectedNews2: { status: 'not_applicable', band: null, total: null },
  },
  {
    id: 'C08',
    title: 'Mechanical low back pain',
    tags: ['benign', '38M'],
    scenario:
      '38M, lower back pain for 4 days after moving furniture, worse on bending, no leg weakness or numbness, no bladder or bowel changes, no fever. Takes ibuprofen as needed. NKDA.',
    expectedFlags: [],
    expectedNews2: { status: 'insufficient', band: null, total: null },
  },
  {
    id: 'C09',
    title: 'Back pain with saddle numbness',
    tags: ['neuro', '41F', 'critical'],
    scenario:
      '41F, 1 week of low back pain, since yesterday numbness around the buttocks and inner thighs and difficulty passing urine, new tingling in both legs. No trauma.',
    expectedFlags: ['RF-CAUDA-EQUINA'],
    expectedNews2: { status: 'insufficient', band: null, total: null },
  },
  {
    id: 'C10',
    title: 'Vomiting young adult with type 1 diabetes',
    tags: ['endocrine', '19M', 'critical'],
    scenario:
      '19M with type 1 diabetes, 1 day of vomiting and abdominal pain, very thirsty, breathing fast. Missed insulin doses this week. Capillary glucose 26 mmol/L, ketones 4.1 mmol/L. HR 124, RR 28, BP 108/70, T 37.2.',
    expectedFlags: ['RF-DKA', 'RF-NEWS2-MEDIUM'],
    expectedNews2: { status: 'partial', band: 'medium', total: 6 },
  },
  {
    id: 'C11',
    title: 'Lip swelling after a restaurant meal',
    tags: ['allergy', '33F', 'critical'],
    scenario:
      '33F, 20 minutes after eating at a restaurant (possible peanut), lip and tongue swelling, generalised hives, throat feels tight, wheezing. Known peanut allergy, has an adrenaline auto-injector but did not use it. HR 120, BP 92/60, SpO2 93%.',
    expectedFlags: ['RF-ANAPHYLAXIS', 'RF-NEWS2-MEDIUM'],
    expectedNews2: { status: 'partial', band: 'medium', total: 6 },
  },
  {
    id: 'C12',
    title: 'Low mood with thoughts of ending life',
    tags: ['mental health', '27M', 'critical'],
    scenario:
      '27M follow-up for low mood for 3 months, poor sleep, stopped going to work. Today says he has been thinking about ending his life and has looked up ways to do it. Lives alone. No PMH.',
    expectedFlags: ['RF-SUICIDE-RISK'],
    expectedNews2: { status: 'insufficient', band: null, total: null },
  },
  {
    id: 'C13',
    title: 'Very high BP at routine follow-up',
    tags: ['cardiovascular', '62M', 'urgent'],
    scenario:
      '62M routine follow-up, no complaints, ran out of his amlodipine 2 weeks ago. BP 186/112 on repeat, HR 76. No headache, chest pain, breathlessness or visual changes.',
    expectedFlags: ['RF-HTN-SEVERE'],
    expectedNews2: { status: 'insufficient', band: null, total: null },
  },
  {
    id: 'C14',
    title: 'Difficulty swallowing and weight loss',
    tags: ['oncology', '67M', 'urgent'],
    scenario:
      '67M, 2 months of progressive difficulty swallowing solids, unintentional weight loss of about 6 kg, ex-smoker. No vomiting blood.',
    expectedFlags: ['RF-CANCER-FEATURES'],
    expectedNews2: { status: 'insufficient', band: null, total: null },
  },
  {
    id: 'C15',
    title: 'Febrile child with non-fading spots',
    tags: ['paediatric', '4F', 'critical'],
    scenario:
      '4-year-old girl, fever 39.6 °C since this afternoon, now drowsy and irritable, new purple spots on her legs that do not fade when pressed with a glass. HR 160, capillary refill 4 seconds.',
    expectedFlags: ['RF-MENINGITIS'],
    expectedNews2: { status: 'not_applicable', band: null, total: null },
  },
  {
    id: 'C16',
    title: 'Breathless after knee surgery',
    tags: ['respiratory', '36F', 'critical'],
    scenario:
      '36F, 10 days after knee surgery, sudden shortness of breath this morning and sharp chest pain worse on deep breathing, right calf swollen. Takes the combined pill. HR 116, RR 24, SpO2 91% on room air, BP 118/76, T 37.4.',
    expectedFlags: ['RF-PE', 'RF-HYPOXIA', 'RF-NEWS2-HIGH'],
    expectedNews2: { status: 'complete', band: 'high', total: 7 },
  },
];

export const DEV_CASES: SyntheticCase[] = RAW.map((c) => CaseSchema.parse(c));
