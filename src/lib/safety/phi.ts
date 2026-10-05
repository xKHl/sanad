import { makeSpan } from './text';
import type { PhiFinding, PhiType } from './types';

/**
 * Pattern-based identifier detection (SPEC §5.2). It reduces the risk of identifiers reaching
 * a model; it does not guarantee de-identification. English/Latin script only.
 */

const REPLACEMENT: Record<PhiType, string> = {
  email: '[EMAIL]',
  phone: '[PHONE]',
  national_id: '[ID]',
  mrn: '[MRN]',
  date: '[DATE]',
  name: '[NAME]',
  address: '[ADDRESS]',
};

const MONTHS =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

type Detector = {
  type: PhiType;
  re: RegExp;
  /** Capture group whose text is redacted; 0 = whole match. */
  group?: number;
};

const CAP = "[A-Z][a-z'’]+";

const DETECTORS: Detector[] = [
  { type: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // Saudi mobile: +966 / 00966 / 0, then 5, then 8 digits (spaces or dashes allowed)
  { type: 'phone', re: /(?<![\d.+])(?:\+966|00966|0)[\s-]?5\d(?:[\s-]?\d){7}(?!\d)/g },
  // Any +-prefixed international number with at least 9 digits
  { type: 'phone', re: /(?<![\d.])\+\d(?:[\s-]?\d){8,14}(?!\d)/g },
  // Saudi National ID / Iqama: 10 digits starting with 1 or 2
  { type: 'national_id', re: /(?<![\d./+-])[12]\d{9}(?![\d])/g },
  {
    type: 'mrn',
    re: /(?:\bMRN|\bmedical record(?:\s+(?:number|no\.?))?|\bfile\s+(?:no\.?|number)|\bpatient\s+ID|\bhospital\s+(?:number|no\.?))\s*[:#]?\s*(?=[A-Z0-9-]*\d)([A-Z0-9-]{4,})/gid,
    group: 1,
  },
  { type: 'date', re: /\b\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)\d{2}\b/g },
  { type: 'date', re: /\b(?:19|20)\d{2}-\d{1,2}-\d{1,2}\b/g },
  { type: 'date', re: new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTHS}\\.?,?\\s+(?:19|20)\\d{2}\\b`, 'gi') },
  { type: 'date', re: new RegExp(`\\b${MONTHS}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+(?:19|20)\\d{2}\\b`, 'gi') },
  {
    type: 'date',
    re: /\b(?:DOB|D\.O\.B\.?|date of birth)\s*[:\-]?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\.?,?\s+\d{2,4}|[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{2,4})/gid,
    group: 1,
  },
  {
    type: 'name',
    re: new RegExp(`\\b(?:[Nn]ame|NAME|[Pp]atient|PATIENT|[Pp]t|PT)\\s*[:\\-]\\s*(${CAP}(?:\\s+${CAP}){0,3})`, 'gd'),
    group: 1,
  },
  {
    type: 'name',
    re: new RegExp(`\\b(?:Mr|Mrs|Ms|Miss|Dr|Sheikh)\\.?\\s+(${CAP}(?:\\s+(?:Al-)?${CAP})?)`, 'gd'),
    group: 1,
  },
  { type: 'name', re: new RegExp(`\\b${CAP}\\s+(?:bin|bint|ibn|Bin|Bint|Ibn)\\s+${CAP}(?:\\s+(?:Al-)?${CAP})?`, 'g') },
  { type: 'name', re: new RegExp(`\\b${CAP}\\s+Al-${CAP}\\b(?!\\s+(?:District|Dist\\.?|Street|St\\.?|Road|Rd\\.?|Hospital|Clinic))`, 'g') },
  {
    type: 'address',
    re: /\b(?:[Aa]ddress|[Ll]ives at|[Ll]iving at|[Rr]esiding at|[Rr]esides at)\s*[:\-]?\s*((?:\d|[A-Z])[^,;\n.]{3,59})/gd,
    group: 1,
  },
  {
    type: 'address',
    re: new RegExp(`\\b\\d{1,5}\\s+(?:${CAP}\\s+){1,3}(?:Street|St\\.?|Road|Rd\\.?|Avenue|Ave\\.?)(?![A-Za-z])`, 'g'),
  },
  { type: 'address', re: new RegExp(`\\bAl-${CAP}\\s+(?:District|Dist\\.?)(?![A-Za-z])`, 'g') },
];

export function detectIdentifiers(text: string): PhiFinding[] {
  const found: PhiFinding[] = [];
  for (const d of DETECTORS) {
    d.re.lastIndex = 0;
    for (const m of text.matchAll(d.re)) {
      let start = m.index ?? 0;
      let end = start + m[0].length;
      if (d.group) {
        const idx = m.indices?.[d.group];
        if (!idx) continue;
        [start, end] = idx;
      }
      // Trim trailing spaces/punctuation from captured values.
      while (end > start && /[\s.,;:]/.test(text[end - 1] ?? '')) end--;
      if (end <= start) continue;
      found.push({ type: d.type, span: makeSpan(text, start, end), replacement: REPLACEMENT[d.type] });
    }
  }
  // Resolve overlaps: keep the longest span.
  found.sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end);
  const kept: PhiFinding[] = [];
  for (const f of found) {
    const last = kept[kept.length - 1];
    if (last && f.span.start < last.span.end) {
      if (f.span.end > last.span.end) {
        last.span = makeSpan(text, last.span.start, f.span.end);
      }
      continue;
    }
    kept.push({ ...f });
  }
  return kept;
}

export function redactIdentifiers(text: string): { text: string; findings: PhiFinding[] } {
  const findings = detectIdentifiers(text);
  if (findings.length === 0) return { text, findings };
  let out = '';
  let cursor = 0;
  for (const f of findings) {
    out += text.slice(cursor, f.span.start) + f.replacement;
    cursor = f.span.end;
  }
  out += text.slice(cursor);
  return { text: out, findings };
}

export function countByType(findings: PhiFinding[]): Array<{ type: PhiType; count: number }> {
  const counts = new Map<PhiType, number>();
  for (const f of findings) counts.set(f.type, (counts.get(f.type) ?? 0) + 1);
  return [...counts.entries()].map(([type, count]) => ({ type, count }));
}

export const PHI_LABELS: Record<PhiType, string> = {
  email: 'email address',
  phone: 'phone number',
  national_id: 'ID number',
  mrn: 'record number',
  date: 'full date',
  name: 'name',
  address: 'address',
};
