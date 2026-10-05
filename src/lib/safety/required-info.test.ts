import { describe, expect, it } from 'vitest';
import { runSafetyChecks } from './index';

const ids = (text: string) => runSafetyChecks(text).requiredInfo.map((i) => i.id);
const item = (text: string, id: string) =>
  runSafetyChecks(text).requiredInfo.find((i) => i.id === id);

describe('required information baseline (SPEC §5.7)', () => {
  it('asks for age and sex when missing', () => {
    expect(item('Cough for 3 days, NKDA, no regular meds.', 'RI-AGE-SEX')?.item).toBe(
      'Age and sex',
    );
    expect(item('Woman with cough, NKDA, no regular meds.', 'RI-AGE-SEX')?.item).toBe('Age');
    expect(ids('24F, cough, NKDA, no regular meds.')).not.toContain('RI-AGE-SEX');
  });

  it('asks for allergies unless documented', () => {
    expect(ids('24F, cough.')).toContain('RI-ALLERGIES');
    expect(ids('24F, cough, NKDA.')).not.toContain('RI-ALLERGIES');
    expect(ids('24F, cough, allergic to penicillin.')).not.toContain('RI-ALLERGIES');
    expect(ids('24F, cough, no known allergies.')).not.toContain('RI-ALLERGIES');
  });

  it('asks for medications unless documented', () => {
    expect(ids('24F, cough.')).toContain('RI-MEDICATIONS');
    expect(ids('24F, cough, no regular meds.')).not.toContain('RI-MEDICATIONS');
    expect(ids('58M, T2DM on metformin.')).not.toContain('RI-MEDICATIONS');
    expect(ids('38M, takes ibuprofen as needed.')).not.toContain('RI-MEDICATIONS');
  });

  it('lists exactly which observations are missing when they matter', () => {
    expect(item('58M, chest pain. HR 100, BP 140/90.', 'RI-VITALS')?.item).toBe(
      'Full set of observations (missing: respiratory rate, SpO2, temperature)',
    );
    expect(ids('24F, sore throat, NKDA, no meds.')).not.toContain('RI-VITALS');
    expect(ids('58M, chest pain. HR 100, BP 140/90, RR 18, SpO2 97%, T 37.')).not.toContain(
      'RI-VITALS',
    );
  });

  it('asks about pregnancy for women 12–50 with relevant features', () => {
    expect(ids('29F, lower abdominal pain.')).toContain('RI-PREGNANCY');
    expect(ids('29F, positive pregnancy test, lower abdominal pain.')).not.toContain(
      'RI-PREGNANCY',
    );
    expect(ids('60F, lower abdominal pain.')).not.toContain('RI-PREGNANCY');
    expect(ids('29M, lower abdominal pain.')).not.toContain('RI-PREGNANCY');
    expect(ids('29F, sore throat.')).not.toContain('RI-PREGNANCY');
  });

  it('asks for glucose with neurological signs, altered consciousness or unwell diabetes', () => {
    expect(ids('71F, right facial droop.')).toContain('RI-GLUCOSE');
    expect(ids('80M, confused.')).toContain('RI-GLUCOSE');
    expect(ids('20M type 1 diabetes, vomiting.')).toContain('RI-GLUCOSE');
    expect(ids('71F, right facial droop, glucose 7.2 mmol/L.')).not.toContain('RI-GLUCOSE');
    expect(ids('30M, cough.')).not.toContain('RI-GLUCOSE');
  });

  it('every item explains why it matters', () => {
    for (const i of runSafetyChecks('Woman, confused, abdominal pain.').requiredInfo) {
      expect(i.whyItMatters.length).toBeGreaterThan(10);
    }
  });
});
