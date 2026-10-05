import type { ConceptIndex } from './concepts';
import type { Demographics, News2Band, News2Parameter, News2Result, Vitals } from './types';

/**
 * NEWS2, SpO2 scale 1 (Royal College of Physicians, 2017). SPEC §5.5.
 * Prototype implementation; not clinically validated.
 */

export const rrPoints = (v: number) => (v <= 8 ? 3 : v <= 11 ? 1 : v <= 20 ? 0 : v <= 24 ? 2 : 3);
export const spo2Points = (v: number) => (v <= 91 ? 3 : v <= 93 ? 2 : v <= 95 ? 1 : 0);
export const sbpPoints = (v: number) => (v <= 90 ? 3 : v <= 100 ? 2 : v <= 110 ? 1 : v <= 219 ? 0 : 3);
export const pulsePoints = (v: number) => (v <= 40 ? 3 : v <= 50 ? 1 : v <= 90 ? 0 : v <= 110 ? 1 : v <= 130 ? 2 : 3);
export const tempPoints = (raw: number) => {
  const v = Math.round(raw * 10) / 10;
  return v <= 35.0 ? 3 : v <= 36.0 ? 1 : v <= 38.0 ? 0 : v <= 39.0 ? 1 : 2;
};

export const NEWS2_RESPONSE: Record<News2Band, string> = {
  high: 'Emergency assessment by a clinical team with acute-care competencies.',
  medium: 'Urgent assessment by a clinician competent in assessing acutely ill patients.',
  'low-medium': 'Urgent clinical review of the parameter scoring 3.',
  low: 'Routine; reassess if the clinical picture changes.',
};

export function alteredConsciousness(concepts: ConceptIndex, vitals: Vitals): boolean {
  return (
    concepts.has('confusion') ||
    concepts.has('drowsy') ||
    concepts.has('unresponsive') ||
    (vitals.gcs !== undefined && vitals.gcs.value < 15)
  );
}

export function computeNews2(demo: Demographics, vitals: Vitals, concepts: ConceptIndex): News2Result {
  const base = { anySingle3: false, parameters: [] as News2Parameter[], missing: [] as string[], notes: [] as string[] };

  if (demo.ageYears !== null && demo.ageYears < 16) {
    return {
      ...base,
      status: 'not_applicable',
      reason: 'NEWS2 is validated for adults; use a paediatric early-warning score.',
      total: null,
      band: null,
      response: null,
    };
  }
  if (demo.pregnancy === 'pregnant') {
    return {
      ...base,
      status: 'not_applicable',
      reason: 'NEWS2 is not validated in pregnancy; use an obstetric early-warning score.',
      total: null,
      band: null,
      response: null,
    };
  }

  const notes: string[] = [];
  if (demo.ageYears === null) notes.push('Age not stated — NEWS2 assumes an adult.');
  if (demo.sex === 'female' && demo.pregnancy === 'unknown') notes.push('Assumes not pregnant.');
  if (concepts.has('copd')) {
    notes.push('SpO2 scale 2 may apply (target 88–92%); scale 1 used — interpret SpO2 points with caution.');
  }

  const params: News2Parameter[] = [];
  const missing: string[] = [];
  const measured = (
    key: News2Parameter['key'],
    label: string,
    reading: { value: number } | undefined,
    fmt: (v: number) => string,
    score: (v: number) => number,
  ) => {
    if (!reading) {
      params.push({ key, label, value: null, points: null, assumed: false });
      missing.push(label);
      return 0;
    }
    params.push({ key, label, value: fmt(reading.value), points: score(reading.value), assumed: false });
    return 1;
  };

  let count = 0;
  count += measured('rr', 'Respiration rate', vitals.rr, (v) => `${v}/min`, rrPoints);
  count += measured('spo2', 'SpO2 (scale 1)', vitals.spo2, (v) => `${v}%`, spo2Points);
  // Air or oxygen: assumed air when not stated.
  params.push({
    key: 'oxygen',
    label: 'Air or oxygen',
    value: vitals.oxygen === 'oxygen' ? 'Oxygen' : 'Air',
    points: vitals.oxygen === 'oxygen' ? 2 : 0,
    assumed: vitals.oxygen === 'unknown',
  });
  count += measured('sbp', 'Systolic BP', vitals.sbp, (v) => `${v} mmHg`, sbpPoints);
  count += measured('pulse', 'Pulse', vitals.hr, (v) => `${v}/min`, pulsePoints);
  const altered = alteredConsciousness(concepts, vitals);
  const gcsKnown = vitals.gcs !== undefined;
  params.push({
    key: 'consciousness',
    label: 'Consciousness',
    value: altered ? (vitals.gcs && vitals.gcs.value < 15 ? `GCS ${vitals.gcs.value}` : 'New confusion / reduced') : 'Alert',
    points: altered ? 3 : 0,
    assumed: !altered && !gcsKnown,
  });
  count += measured('temp', 'Temperature', vitals.tempC, (v) => `${v} °C`, tempPoints);

  const scored = params.filter((p) => p.points !== null);
  const total = scored.reduce((sum, p) => sum + (p.points ?? 0), 0);
  const anySingle3 = scored.some((p) => p.points === 3);
  if (params.some((p) => p.assumed && p.key === 'oxygen')) notes.push('Oxygen not stated — assumed room air.');
  if (params.some((p) => p.assumed && p.key === 'consciousness')) notes.push('Consciousness not stated — assumed alert.');

  if (count < 3) {
    return {
      status: 'insufficient',
      reason: `Only ${count} of 5 measured parameters available (need at least 3).`,
      total: null,
      band: null,
      response: null,
      anySingle3,
      parameters: params,
      missing,
      notes,
    };
  }
  const band: News2Band = total >= 7 ? 'high' : total >= 5 ? 'medium' : anySingle3 ? 'low-medium' : 'low';
  if (count < 5) notes.push('Partial score: missing parameters can only add points, so the total is a lower bound.');
  return {
    status: count === 5 ? 'complete' : 'partial',
    reason: null,
    total,
    band,
    response: NEWS2_RESPONSE[band],
    anySingle3,
    parameters: params,
    missing,
    notes,
  };
}
