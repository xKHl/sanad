import { describe, expect, it } from 'vitest';
import { parseDemographics, parseVitals } from './vitals';

describe('age and sex', () => {
  it.each([
    ['58M, chest pain', 58, '58', 'male'],
    ['71F brought by daughter', 71, '71', 'female'],
    ['58 M with cough', 58, '58', 'male'],
    ['a 58-year-old man', 58, '58', 'male'],
    ['58 year old woman', 58, '58', 'female'],
    ['patient 58 yo, male', 58, '58', 'male'],
    ['58 y/o female', 58, '58', 'female'],
    ['aged 58, lady with fever', 58, '58', 'female'],
    ['58 yrs, gentleman', 58, '58', 'male'],
    ['4-year-old girl with fever', 4, '4', 'female'],
    ['3-month-old infant', 0.25, '3 months', 'unknown'],
    ['10-day-old baby boy', 0.027, '10 days', 'male'],
  ])('%s', (text, years, display, sex) => {
    const d = parseDemographics(text);
    expect(d.ageYears).toBeCloseTo(years, 2);
    expect(d.ageDisplay).toBe(display);
    expect(d.sex).toBe(sex);
  });

  it('converts weeks to fractional years', () => {
    const d = parseDemographics('7-week-old boy, fever');
    expect(d.ageYears).toBeCloseTo(0.134, 3);
    expect(d.ageDisplay).toBe('7 weeks');
  });

  it('does not read durations or pack-years as age', () => {
    expect(parseDemographics('low mood for 3 years, smoker 30 pack-years').ageYears).toBeNull();
  });

  it('does not read T2DM or G2P1 as age/sex', () => {
    const d = parseDemographics('T2DM, G2P1');
    expect(d.ageYears).toBeNull();
  });

  it('uses dominant pronouns only without explicit markers', () => {
    expect(parseDemographics('He says his pain started today').sex).toBe('male');
    expect(parseDemographics('She reports her pain and he agrees').sex).toBe('unknown');
  });
});

describe('pregnancy', () => {
  it.each([
    ['29F, positive home pregnancy test', 'pregnant'],
    ['31F, 34 weeks pregnant', 'pregnant'],
    ['G2P1 at 28 weeks gestation', 'pregnant'],
    ['30F, not pregnant', 'not_pregnant'],
    ['25F, negative pregnancy test', 'not_pregnant'],
    ['62F, postmenopausal', 'not_pregnant'],
    ['30F with cough', 'unknown'],
    ['40M with cough', 'not_pregnant'],
  ])('%s -> %s', (text, status) => {
    expect(parseDemographics(text).pregnancy).toBe(status);
  });

  it('reads gestation from weeks or LMP', () => {
    expect(parseDemographics('31F, 34 weeks pregnant').gestationWeeks).toBe(34);
    expect(parseDemographics('29F, LMP 7 weeks ago, positive pregnancy test').gestationWeeks).toBe(7);
  });
});

describe('vital signs', () => {
  it.each([
    ['BP 162/94', 'sbp', 162],
    ['BP 162/94', 'dbp', 94],
    ['blood pressure 120/80', 'sbp', 120],
    ['BP: 96/58', 'sbp', 96],
    ['148/92 mmHg', 'sbp', 148],
    ['HR 108', 'hr', 108],
    ['heart rate 72', 'hr', 72],
    ['pulse 96 irregular', 'hr', 96],
    ['110 bpm', 'hr', 110],
    ['RR 20', 'rr', 20],
    ['resp rate 28', 'rr', 28],
    ['respiratory rate 16', 'rr', 16],
    ['SpO2 95%', 'spo2', 95],
    ['sats 91% on air', 'spo2', 91],
    ['O2 sat 97', 'spo2', 97],
    ['oxygen saturation 93%', 'spo2', 93],
    ['T 38.9', 'tempC', 38.9],
    ['temp 37.2', 'tempC', 37.2],
    ['temperature 38.1 °C', 'tempC', 38.1],
    ['fever 39.6 °C', 'tempC', 39.6],
    ['febrile to 39', 'tempC', 39],
    ['101.5F at home', 'tempC', 38.6],
    ['temp 102', 'tempC', 38.9],
    ['glucose 7.2 mmol/L', 'glucoseMgdl', 130],
    ['capillary glucose 26 mmol/L', 'glucoseMgdl', 468],
    ['BG 180 mg/dL', 'glucoseMgdl', 180],
    ['RBS 300', 'glucoseMgdl', 300],
    ['CBG 3.1', 'glucoseMgdl', 56],
    ['ketones 4.1 mmol/L', 'ketonesMmol', 4.1],
    ['blood ketones 2.0', 'ketonesMmol', 2],
    ['urine ketones 3+', 'ketonesMmol', 3],
    ['GCS 13/15', 'gcs', 13],
    ['GCS E3V4M6', 'gcs', 13],
    ['GCS 15', 'gcs', 15],
    ['capillary refill 4 seconds', 'crtSeconds', 4],
    ['CRT 3s', 'crtSeconds', 3],
  ] as const)('%s -> %s=%d', (text, key, value) => {
    expect(parseVitals(text)[key]?.value).toBe(value);
  });

  it('keeps the span of each reading', () => {
    const text = '58M. BP 162/94, HR 108';
    const v = parseVitals(text);
    expect(v.hr?.span.text).toBe('HR 108');
    expect(text.slice(v.hr?.span.start, v.hr?.span.end)).toBe('HR 108');
  });

  it('uses the last occurrence and keeps all readings', () => {
    const v = parseVitals('HR 130 on arrival, repeat HR 104');
    expect(v.hr?.value).toBe(104);
    expect(v.allReadings.filter((r) => r.key === 'hr')).toHaveLength(2);
  });

  it('notes temperature conversion', () => {
    expect(parseVitals('101.5F').tempC?.convertedFrom).toBe('101.5 °F');
  });

  it('warns when the glucose unit is assumed', () => {
    const v = parseVitals('RBS 300');
    expect(v.warnings.join(' ')).toMatch(/unit assumed/);
  });

  it('ignores implausible values with a warning', () => {
    const v = parseVitals('HR 400, SpO2 140%');
    expect(v.hr).toBeUndefined();
    expect(v.spo2).toBeUndefined();
    expect(v.warnings).toHaveLength(2);
  });

  it.each([
    ['T2DM on metformin', 'tempC'],
    ['T12 fracture', 'tempC'],
    ['follow-up 12/05', 'sbp'],
    ['G2P1', 'hr'],
    ['for 3 days, 2 L of fluid', 'rr'],
  ] as const)('does not parse "%s" as %s', (text, key) => {
    expect(parseVitals(text)[key]).toBeUndefined();
  });

  it.each([
    ['SpO2 95% RA', 'air'],
    ['sats 94% on room air', 'air'],
    ['SpO2 93% on 2L', 'oxygen'],
    ['on oxygen via nasal cannula', 'oxygen'],
    ['SpO2 96% on 4 L/min', 'oxygen'],
    ['SpO2 96%', 'unknown'],
  ] as const)('oxygen status: %s -> %s', (text, status) => {
    expect(parseVitals(text).oxygen).toBe(status);
  });
});
