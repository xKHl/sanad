import { describe, expect, it } from 'vitest';
import { countByType, detectIdentifiers, redactIdentifiers } from './phi';

describe('identifier guard: positives', () => {
  it.each([
    ['contact: ali.test@example.com for results', 'email', 'ali.test@example.com'],
    ['call 0551234567 if worse', 'phone', '0551234567'],
    ['mobile +966 55 123 4567', 'phone', '+966 55 123 4567'],
    ['phone 00966-50-123-4567', 'phone', '00966-50-123-4567'],
    ['UK number +44 7700 900123', 'phone', '+44 7700 900123'],
    ['ID 1023456789 on file', 'national_id', '1023456789'],
    ['iqama 2234567890', 'national_id', '2234567890'],
    ['MRN: 00451287', 'mrn', '00451287'],
    ['file no. AB-77812 reviewed', 'mrn', 'AB-77812'],
    ['DOB 12/03/1985, presents with cough', 'date', '12/03/1985'],
    ['seen on 1985-03-12', 'date', '1985-03-12'],
    ['born 12 March 1985', 'date', '12 March 1985'],
    ['born March 12, 1985', 'date', 'March 12, 1985'],
    ['Name: Ahmed Saleh, 58M', 'name', 'Ahmed Saleh'],
    ['Patient: Fatima Noor', 'name', 'Fatima Noor'],
    ['seen with Mr Khalid today', 'name', 'Khalid'],
    ['Mohammed bin Salem attended', 'name', 'Mohammed bin Salem'],
    ['referred by Dr Hassan', 'name', 'Hassan'],
    ['husband Saad Al-Harbi called', 'name', 'Saad Al-Harbi'],
    ['lives at 12 King Fahd Road', 'address', '12 King Fahd Road'],
    ['Address: 45 Olaya Street', 'address', '45 Olaya Street'],
    ['from Al-Rawdah District, Jeddah', 'address', 'Al-Rawdah District'],
  ])('%s -> %s', (text, type, value) => {
    const found = detectIdentifiers(text);
    expect(found.map((f) => [f.type, f.span.text])).toContainEqual([type, value]);
  });
});

describe('identifier guard: must not trigger', () => {
  it.each([
    '58M, central chest pain, BP 162/94, HR 108, SpO2 95% RA',
    '7-week-old boy, fever 38.4 °C',
    'pain for 2 hours, 3 days of cough',
    'symptoms started 3 days ago',
    'LMP 7 weeks ago, positive pregnancy test',
    'T2DM since 2019 on metformin 500',
    'Dr advised rest and fluids',
    'capillary glucose 26 mmol/L, ketones 4.1',
    'BP 186/112 on repeat, follow-up 12/05',
    'weight loss of about 6 kg over 2 months',
    'GCS 15, RR 24, T 38.9',
    'Patient: has had cough for 3 days',
    'Lives alone, independent',
    'lives at home with wife',
    'Smoker 30 pack-years',
  ])('%s', (text) => {
    expect(detectIdentifiers(text)).toEqual([]);
  });
});

describe('redaction', () => {
  it('replaces spans with typed tokens and keeps clinical text', () => {
    const { text, findings } = redactIdentifiers('Name: Ahmed Saleh, 58M, call 0551234567. BP 150/90.');
    expect(text).toBe('Name: [NAME], 58M, call [PHONE]. BP 150/90.');
    expect(countByType(findings)).toEqual([
      { type: 'name', count: 1 },
      { type: 'phone', count: 1 },
    ]);
  });

  it('returns the original text when nothing is found', () => {
    const input = '24F, sore throat 3 days, T 37.1';
    expect(redactIdentifiers(input)).toEqual({ text: input, findings: [] });
  });

  it('merges overlapping detections into one redaction', () => {
    const { text } = redactIdentifiers('DOB: 12/03/1985 noted');
    expect(text).toBe('DOB: [DATE] noted');
  });
});
