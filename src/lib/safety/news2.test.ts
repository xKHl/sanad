import { describe, expect, it } from 'vitest';
import { ConceptIndex, matchConcepts } from './concepts';
import { computeNews2, pulsePoints, rrPoints, sbpPoints, spo2Points, tempPoints } from './news2';
import { parseDemographics, parseVitals } from './vitals';

function news2(text: string) {
  return computeNews2(parseDemographics(text), parseVitals(text), new ConceptIndex(matchConcepts(text)));
}

describe('NEWS2 parameter bands (RCP 2017, scale 1)', () => {
  it.each([
    [8, 3], [9, 1], [11, 1], [12, 0], [20, 0], [21, 2], [24, 2], [25, 3],
  ])('respiration rate %d -> %d', (v, p) => expect(rrPoints(v)).toBe(p));

  it.each([
    [91, 3], [92, 2], [93, 2], [94, 1], [95, 1], [96, 0], [100, 0],
  ])('SpO2 %d -> %d', (v, p) => expect(spo2Points(v)).toBe(p));

  it.each([
    [90, 3], [91, 2], [100, 2], [101, 1], [110, 1], [111, 0], [219, 0], [220, 3],
  ])('systolic BP %d -> %d', (v, p) => expect(sbpPoints(v)).toBe(p));

  it.each([
    [40, 3], [41, 1], [50, 1], [51, 0], [90, 0], [91, 1], [110, 1], [111, 2], [130, 2], [131, 3],
  ])('pulse %d -> %d', (v, p) => expect(pulsePoints(v)).toBe(p));

  it.each([
    [35.0, 3], [35.1, 1], [36.0, 1], [36.1, 0], [38.0, 0], [38.1, 1], [39.0, 1], [39.1, 2], [38.04, 0], [38.06, 1],
  ])('temperature %d -> %d', (v, p) => expect(tempPoints(v)).toBe(p));
});

describe('NEWS2 aggregate', () => {
  it('C01: 2, low, complete', () => {
    const n = news2('58M, chest pain. BP 162/94, HR 108, RR 20, SpO2 95% RA, T 36.8.');
    expect([n.status, n.total, n.band]).toEqual(['complete', 2, 'low']);
  });

  it('C03: 11, high, complete (new confusion scores 3)', () => {
    const n = news2('82F, more confused. T 38.9, HR 118, BP 96/58, RR 24, SpO2 94% on room air.');
    expect([n.status, n.total, n.band]).toEqual(['complete', 11, 'high']);
    expect(n.parameters.find((p) => p.key === 'consciousness')?.points).toBe(3);
  });

  it('C16: 7, high, complete', () => {
    const n = news2('36F, breathless. HR 116, RR 24, SpO2 91% on room air, BP 118/76, T 37.4.');
    expect([n.status, n.total, n.band]).toEqual(['complete', 7, 'high']);
  });

  it('partial score is a lower bound with missing parameters listed', () => {
    const n = news2('19M. HR 124, RR 28, BP 108/70, T 37.2.');
    expect([n.status, n.total, n.band]).toEqual(['partial', 6, 'medium']);
    expect(n.missing).toEqual(['SpO2 (scale 1)']);
    expect(n.notes.join(' ')).toMatch(/lower bound/);
  });

  it('low-medium when one parameter scores 3 and total is 4 or less', () => {
    const n = news2('40M. RR 18, SpO2 97% RA, BP 125/80, HR 135, T 37.0.');
    expect([n.total, n.band, n.anySingle3]).toEqual([3, 'low-medium', true]);
  });

  it('medium at 5', () => {
    const n = news2('40M. RR 22, SpO2 95% RA, BP 125/80, HR 112, T 37.0.');
    expect([n.total, n.band]).toEqual([5, 'medium']);
  });

  it('oxygen adds 2 points', () => {
    const n = news2('40M. RR 18, SpO2 97% on 2L, BP 125/80, HR 80, T 37.0.');
    expect(n.total).toBe(2);
    expect(n.parameters.find((p) => p.key === 'oxygen')?.assumed).toBe(false);
  });

  it('marks assumed air and alert', () => {
    const n = news2('40M. RR 18, SpO2 97%, BP 125/80, HR 80, T 37.0.');
    const oxygen = n.parameters.find((p) => p.key === 'oxygen');
    const consciousness = n.parameters.find((p) => p.key === 'consciousness');
    expect(oxygen?.assumed).toBe(true);
    expect(consciousness?.assumed).toBe(true);
  });

  it('GCS below 15 scores 3', () => {
    const n = news2('70M. RR 18, SpO2 97% RA, BP 125/80, HR 80, T 37.0, GCS 14.');
    expect(n.total).toBe(3);
  });

  it('insufficient with fewer than 3 measured parameters', () => {
    const n = news2('62M. BP 186/112, HR 76.');
    expect([n.status, n.total, n.band]).toEqual(['insufficient', null, null]);
  });

  it('not applicable for children', () => {
    const n = news2('4-year-old girl. HR 160, RR 30, T 39.6, SpO2 96%.');
    expect(n.status).toBe('not_applicable');
    expect(n.reason).toMatch(/paediatric/);
  });

  it('not applicable in pregnancy', () => {
    const n = news2('29F, positive pregnancy test. HR 112, BP 104/66, RR 18, T 37.');
    expect(n.status).toBe('not_applicable');
    expect(n.reason).toMatch(/obstetric/);
  });

  it('notes unknown age, unknown pregnancy and COPD', () => {
    expect(news2('Woman with cough. HR 80, RR 18, T 37.').notes.join(' ')).toMatch(/Assumes not pregnant/);
    expect(news2('Cough. HR 80, RR 18, T 37.').notes.join(' ')).toMatch(/Age not stated/);
    expect(news2('70M with COPD. HR 80, RR 18, SpO2 89%.').notes.join(' ')).toMatch(/scale 2/);
  });
});
