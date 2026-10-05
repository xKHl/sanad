import { makeSpan } from './text';
import type { Demographics, Span, VitalKey, VitalReading, Vitals } from './types';

/** Demographics and vital-sign parser (SPEC §5.3). Pure and deterministic. */

const PLAUSIBLE: Record<VitalKey, [number, number]> = {
  hr: [20, 250],
  sbp: [50, 300],
  dbp: [20, 200],
  rr: [4, 80],
  spo2: [50, 100],
  tempC: [30, 45],
  glucoseMgdl: [10, 2000],
  ketonesMmol: [0, 15],
  gcs: [3, 15],
  crtSeconds: [0, 20],
};

const LABEL_SEP = String.raw`\s*(?:of|:|=|was|is|at)?\s*`;

type Hit = { key: VitalKey; reading: VitalReading };

function groupSpan(text: string, m: RegExpMatchArray, g: number): Span {
  const idx = m.indices?.[g];
  if (!idx) {
    const s = m.index ?? 0;
    return makeSpan(text, s, s + m[0].length);
  }
  return makeSpan(text, idx[0], idx[1]);
}

function wholeSpan(text: string, m: RegExpMatchArray): Span {
  const s = m.index ?? 0;
  return makeSpan(text, s, s + m[0].length);
}

// ---------------------------------------------------------------- vitals

export function parseVitals(text: string): Vitals {
  const hits: Hit[] = [];
  const warnings: string[] = [];

  const add = (
    key: VitalKey,
    value: number,
    raw: string,
    unit: string,
    span: Span,
    convertedFrom?: string,
  ) => {
    const [lo, hi] = PLAUSIBLE[key];
    if (!Number.isFinite(value) || value < lo || value > hi) {
      warnings.push(`Ignored implausible ${key} value "${raw}"`);
      return;
    }
    hits.push({
      key,
      reading: { value, raw, unit, span, ...(convertedFrom ? { convertedFrom } : {}) },
    });
  };

  // Blood pressure: needs a BP label or the mmHg unit, so dates like 12/05 never parse.
  const bpRes = [
    new RegExp(
      String.raw`\b(?:BP|B\/P|blood pressure)${LABEL_SEP}(\d{2,3})\s*\/\s*(\d{2,3})`,
      'gid',
    ),
    /(?<![\d/])(\d{2,3})\s*\/\s*(\d{2,3})\s*mm\s?hg/dgi,
  ];
  const bpSeen = new Set<number>();
  for (const re of bpRes) {
    for (const m of text.matchAll(re)) {
      const sbp = Number(m[1]);
      const dbp = Number(m[2]);
      const span = wholeSpan(text, m);
      if (bpSeen.has(groupSpan(text, m, 1).start)) continue;
      bpSeen.add(groupSpan(text, m, 1).start);
      if (!(sbp > dbp)) {
        warnings.push(`Ignored implausible blood pressure "${m[0]}"`);
        continue;
      }
      add('sbp', sbp, m[0], 'mmHg', span);
      add('dbp', dbp, m[0], 'mmHg', span);
    }
  }

  // Heart rate (P and PR are ambiguous and not used).
  const hrSeen = new Set<number>();
  for (const re of [
    new RegExp(String.raw`\b(?:HR|heart rate|pulse(?: rate)?)${LABEL_SEP}(\d{2,3})`, 'gid'),
    /\b(\d{2,3})\s*(?:bpm|beats\s*(?:per|\/)\s*min(?:ute)?)\b/dgi,
  ]) {
    for (const m of text.matchAll(re)) {
      const g = groupSpan(text, m, 1);
      if (hrSeen.has(g.start)) continue;
      hrSeen.add(g.start);
      add('hr', Number(m[1]), m[0], '/min', wholeSpan(text, m));
    }
  }

  // Respiratory rate
  for (const m of text.matchAll(
    new RegExp(
      String.raw`\b(?:RR|resp(?:iratory)?\.?\s*rate|respirations?|resps)${LABEL_SEP}(\d{1,2})(?!\d)`,
      'gid',
    ),
  )) {
    add('rr', Number(m[1]), m[0], '/min', wholeSpan(text, m));
  }

  // SpO2
  for (const m of text.matchAll(
    new RegExp(
      String.raw`\b(?:SpO2|SaO2|Sp02|O2\s*sats?|oxygen\s+saturations?|saturations?|sats?)${LABEL_SEP}(\d{2,3})\s*%?`,
      'gid',
    ),
  )) {
    add('spo2', Number(m[1]), m[0], '%', wholeSpan(text, m));
  }

  // Oxygen status (last mention wins)
  const oxygenHits: Array<{ status: 'air' | 'oxygen'; span: Span }> = [];
  for (const m of text.matchAll(/(?<![A-Za-z])RA(?![A-Za-z])/g))
    oxygenHits.push({ status: 'air', span: wholeSpan(text, m) });
  for (const m of text.matchAll(/\b(?:on\s+)?room\s+air\b|\bon\s+air\b/gi))
    oxygenHits.push({ status: 'air', span: wholeSpan(text, m) });
  for (const m of text.matchAll(
    /\bon\s+(?:supplemental\s+)?(?:oxygen|O2)\b|\bon\s+\d+(?:\.\d+)?\s*(?:L|litres?|liters?)(?:\/min)?\b|\b\d+(?:\.\d+)?\s*L\/min\b|\bnasal\s+cannula\b|(?<![A-Za-z])NC(?![A-Za-z])|\bface\s*mask\b|\bnon-?rebreather\b|(?<![A-Za-z])NRB(?![A-Za-z])/g,
  ))
    oxygenHits.push({ status: 'oxygen', span: wholeSpan(text, m) });
  oxygenHits.sort((a, b) => a.span.start - b.span.start);
  const lastOxygen = oxygenHits[oxygenHits.length - 1];

  // Temperature
  const tempSeen = new Set<number>();
  const tempRes: RegExp[] = [
    // Bare "T" must be uppercase and separated from the number (never T2DM or T12).
    /(?<![A-Za-z])T(?:\s*[:=]\s*|\s+)(\d{2,3}(?:\.\d+)?)\s*(°\s*[CF]|deg(?:rees)?\s*[CF]|[CF](?![A-Za-z]))?/dg,
    /\b(?:temp(?:erature)?|fever(?:\s+of)?|febrile(?:\s+to)?|pyrexi(?:a|al)(?:\s+(?:of|to))?)\s*(?:of|:|=|was|is|at|to)?\s*(\d{2,3}(?:\.\d+)?)\s*(°\s*[CF]|deg(?:rees)?\s*[CF]|[CF](?![A-Za-z]))?/dgi,
    /(?<![\d.])(\d{2,3}(?:\.\d+)?)\s*(°\s*[CF]|deg(?:rees)?\s*[CF])/dgi,
    /(?<![\d.])(\d{2,3}\.\d+)\s*([CF])(?![A-Za-z])/dg,
  ];
  for (const re of tempRes) {
    for (const m of text.matchAll(re)) {
      const g = groupSpan(text, m, 1);
      if (tempSeen.has(g.start)) continue;
      tempSeen.add(g.start);
      const raw = Number(m[1]);
      const unitRaw = (m[2] ?? '').toUpperCase();
      const isF = unitRaw.endsWith('F') || (!unitRaw && raw >= 86 && raw <= 113);
      if (isF) {
        const c = Math.round((((raw - 32) * 5) / 9) * 10) / 10;
        add('tempC', c, m[0], '°C', wholeSpan(text, m), `${raw} °F`);
      } else {
        add('tempC', Math.round(raw * 10) / 10, m[0], '°C', wholeSpan(text, m));
      }
    }
  }

  // Glucose (stored as mg/dL)
  for (const m of text.matchAll(
    new RegExp(
      String.raw`\b(?:capillary\s+(?:blood\s+)?glucose|blood\s+glucose|blood\s+sugar|glucose|BG|BSL|CBG|RBS|FBS|sugar)(?:\s+level)?${LABEL_SEP}(\d{1,4}(?:\.\d+)?)\s*(mmol\s*\/?\s*l|mg\s*\/?\s*dl)?`,
      'gid',
    ),
  )) {
    const v = Number(m[1]);
    const unit = (m[2] ?? '').toLowerCase().replace(/\s/g, '');
    let mmol: boolean;
    if (unit.startsWith('mmol')) mmol = true;
    else if (unit.startsWith('mg')) mmol = false;
    else {
      mmol = v <= 35;
      warnings.push(`Glucose unit assumed (${mmol ? 'mmol/L' : 'mg/dL'}) for "${m[0].trim()}"`);
    }
    if (mmol)
      add('glucoseMgdl', Math.round(v * 18), m[0], 'mg/dL', wholeSpan(text, m), `${v} mmol/L`);
    else add('glucoseMgdl', v, m[0], 'mg/dL', wholeSpan(text, m));
  }

  // Ketones
  for (const m of text.matchAll(
    new RegExp(
      String.raw`\b(?:blood\s+|capillary\s+|serum\s+)?ketones?${LABEL_SEP}(\d{1,2}(?:\.\d+)?)(?!\s*\+)\s*(?:mmol\s*\/?\s*l)?`,
      'gid',
    ),
  )) {
    add('ketonesMmol', Number(m[1]), m[0], 'mmol/L', wholeSpan(text, m));
  }
  for (const m of text.matchAll(
    /\b(?:urine\s+|blood\s+)?ketones?\s*(?:of|:|=|was|is)?\s*(\d\s*\+|\+{2,3}|large|positive|moderate)/gi,
  )) {
    add('ketonesMmol', 3.0, m[0], 'mmol/L', wholeSpan(text, m), m[1]);
  }

  // GCS
  for (const m of text.matchAll(/\bGCS\s*(?:of|:|=|was|is)?\s*E\s*(\d)\s*V\s*(\d)\s*M\s*(\d)/gi)) {
    add('gcs', Number(m[1]) + Number(m[2]) + Number(m[3]), m[0], '/15', wholeSpan(text, m));
  }
  for (const m of text.matchAll(/\bGCS\s*(?:of|:|=|was|is)?\s*(\d{1,2})(?!\d)(?:\s*\/\s*15)?/gi)) {
    add('gcs', Number(m[1]), m[0], '/15', wholeSpan(text, m));
  }

  // Capillary refill (display only)
  for (const m of text.matchAll(
    /\b(?:CRT|cap(?:illary)?\.?\s*refill(?:\s+time)?)\s*(?:of|:|=|was|is)?\s*[<>]?\s*(\d{1,2}(?:\.\d)?)\s*(?:s|secs?|seconds)\b/gi,
  )) {
    add('crtSeconds', Number(m[1]), m[0], 's', wholeSpan(text, m));
  }

  hits.sort((a, b) => a.reading.span.start - b.reading.span.start);
  const vitals: Vitals = {
    oxygen: lastOxygen?.status ?? 'unknown',
    ...(lastOxygen ? { oxygenSpan: lastOxygen.span } : {}),
    allReadings: hits,
    warnings,
  };
  for (const h of hits) vitals[h.key] = h.reading; // last occurrence wins
  return vitals;
}

// ---------------------------------------------------------- demographics

const WEEKS_PER_YEAR = 52.18;

export function parseDemographics(text: string): Demographics {
  const demo: Demographics = {
    ageYears: null,
    ageDisplay: null,
    sex: 'unknown',
    pregnancy: 'unknown',
    gestationWeeks: null,
  };

  // ---- age (first mention wins)
  type AgeHit = { years: number; display: string; span: Span; start: number };
  const ages: AgeHit[] = [];
  const unitYears = (n: number, unit: string): [number, string] => {
    const u = unit.toLowerCase();
    if (u.startsWith('m')) return [n / 12, `${n} month${n === 1 ? '' : 's'}`];
    if (u.startsWith('w')) return [n / WEEKS_PER_YEAR, `${n} week${n === 1 ? '' : 's'}`];
    if (u.startsWith('d')) return [n / 365.25, `${n} day${n === 1 ? '' : 's'}`];
    return [n, `${n}`];
  };
  for (const m of text.matchAll(
    /\b(\d{1,3})[\s-]*(years?|yrs?|months?|mos?|weeks?|wks?|days?)[\s-]*old\b/gi,
  )) {
    const [years, display] = unitYears(Number(m[1]), m[2] ?? 'y');
    ages.push({ years, display, span: wholeSpan(text, m), start: m.index ?? 0 });
  }
  for (const m of text.matchAll(/\b(\d{1,3})\s*(?:yo|y\/o|y\.o\.?)(?![A-Za-z])/gi)) {
    ages.push({
      years: Number(m[1]),
      display: m[1] ?? '',
      span: wholeSpan(text, m),
      start: m.index ?? 0,
    });
  }
  for (const m of text.matchAll(/\baged?\s+(\d{1,3})\b/gi)) {
    ages.push({
      years: Number(m[1]),
      display: m[1] ?? '',
      span: wholeSpan(text, m),
      start: m.index ?? 0,
    });
  }
  for (const m of text.matchAll(/^\s*(\d{1,3})\s*(?:yrs?|years?)\b/gi)) {
    ages.push({
      years: Number(m[1]),
      display: m[1] ?? '',
      span: wholeSpan(text, m),
      start: m.index ?? 0,
    });
  }
  // 58M / 71F / 58 M (case-sensitive marker)
  const sexMarkers: Array<{ sex: 'male' | 'female'; span: Span }> = [];
  for (const m of text.matchAll(/(?<![A-Za-z0-9.])(\d{1,3})\s?([MF])(?![A-Za-z0-9])/g)) {
    const n = Number(m[1]);
    if (n > 120) continue;
    ages.push({ years: n, display: m[1] ?? '', span: wholeSpan(text, m), start: m.index ?? 0 });
    sexMarkers.push({ sex: m[2] === 'M' ? 'male' : 'female', span: wholeSpan(text, m) });
  }
  ages.sort((a, b) => a.start - b.start);
  const age = ages.find((a) => a.years >= 0 && a.years <= 120);
  if (age) {
    demo.ageYears = Math.round(age.years * 1000) / 1000;
    demo.ageDisplay = age.display;
    demo.ageSpan = age.span;
  }

  // ---- sex
  const firstMarker = sexMarkers[0];
  if (firstMarker) {
    demo.sex = firstMarker.sex;
    demo.sexSpan = firstMarker.span;
  } else {
    const word = /\b(man|male|gentleman|boy|woman|female|lady|girl)\b/i.exec(text);
    if (word) {
      const w = (word[1] ?? '').toLowerCase();
      demo.sex = ['man', 'male', 'gentleman', 'boy'].includes(w) ? 'male' : 'female';
      demo.sexSpan = makeSpan(text, word.index, word.index + word[0].length);
    } else {
      const he = (text.match(/\b(he|his|him)\b/gi) ?? []).length;
      const she = (text.match(/\b(she|her|hers)\b/gi) ?? []).length;
      if (he >= 2 && she === 0) demo.sex = 'male';
      else if (she >= 2 && he === 0) demo.sex = 'female';
    }
  }

  // ---- pregnancy (only meaningful when not male)
  if (demo.sex !== 'male') {
    const notPregnant =
      /\bnot\s+pregnant\b|\bnegative\s+(?:urine\s+|serum\s+|home\s+)?(?:pregnancy\s+test|b?-?hcg)\b|\b(?:pregnancy\s+test|b?-?hcg)\s+(?:is\s+|was\s+)?negative\b|\bpost-?menopausal\b/i.exec(
        text,
      );
    const gestation =
      /\b(\d{1,2})\s*(?:weeks?|wks?)\s*(?:pregnant|gestation|of\s+gestation|of\s+pregnancy)\b|\bGA\s*(?:of\s*)?(\d{1,2})\s*(?:weeks?|wks?|\/40)?|\b(\d{1,2})\s*\/40\b/i.exec(
        text,
      );
    const pregnant =
      /(?<!\bnot\s+)\bpregnant\b|\bpositive\s+(?:urine\s+|serum\s+|home\s+)?(?:pregnancy\s+test|b?-?hcg)\b|\b(?:pregnancy\s+test|b?-?hcg)\s+(?:is\s+|was\s+)?positive\b|\bgravid\b|\bG\d+\s*P\d+\b|\bgestation\b/i.exec(
        text,
      );
    // A positive statement wins over a negative one (safer default).
    if (gestation || pregnant) {
      const hit = (gestation ?? pregnant) as RegExpExecArray;
      demo.pregnancy = 'pregnant';
      demo.pregnancySpan = makeSpan(text, hit.index, hit.index + hit[0].length);
      const weeks = gestation ? Number(gestation[1] ?? gestation[2] ?? gestation[3]) : NaN;
      if (Number.isFinite(weeks) && weeks > 0 && weeks <= 44) demo.gestationWeeks = weeks;
      else {
        const lmp = /\bLMP\s*(?:was\s*)?(\d{1,2})\s*(?:weeks?|wks?)\s*ago\b/i.exec(text);
        if (lmp) demo.gestationWeeks = Number(lmp[1]);
      }
    } else if (notPregnant) {
      demo.pregnancy = 'not_pregnant';
      demo.pregnancySpan = makeSpan(
        text,
        notPregnant.index,
        notPregnant.index + notPregnant[0].length,
      );
    }
  }
  if (demo.sex === 'male') demo.pregnancy = 'not_pregnant';
  return demo;
}

export const VITAL_LABELS: Record<VitalKey, string> = {
  hr: 'Heart rate',
  sbp: 'Systolic BP',
  dbp: 'Diastolic BP',
  rr: 'Respiratory rate',
  spo2: 'SpO2',
  tempC: 'Temperature',
  glucoseMgdl: 'Glucose',
  ketonesMmol: 'Ketones',
  gcs: 'GCS',
  crtSeconds: 'Capillary refill',
};
