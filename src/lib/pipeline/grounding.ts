import type { AiAnalysis } from '@/lib/ai/schema';
import { SUMMARY_LIST_SECTIONS } from '@/lib/ai/schema';
import type { Span } from '@/lib/safety/types';

/**
 * Grounding check (SPEC §7.4): every quote the model returns must appear in the analysed text.
 * Matching is case-insensitive and tolerant of whitespace, curly quotes and dash variants.
 */

const TRIM = /^[\s"'“”‘’`.,;:!?()[\]{}-]+|[\s"'“”‘’`.,;:!?()[\]{}-]+$/g;

export function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(TRIM, '');
}

/**
 * Normalise while keeping a map from each normalised character back to its source index,
 * so a match can be turned into a span of the original text.
 */
function normalizeWithMap(s: string): { text: string; map: number[] } {
  let out = '';
  const map: number[] = [];
  let lastWasSpace = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] ?? '';
    let n = ch.normalize('NFKC').toLowerCase();
    if (/[“”„‟″]/.test(n)) n = '"';
    else if (/[‘’‚‛′]/.test(n)) n = "'";
    else if (/[‐‑‒–—―−]/.test(n)) n = '-';
    if (/\s/.test(n)) {
      if (lastWasSpace) continue;
      n = ' ';
      lastWasSpace = true;
    } else lastWasSpace = false;
    for (const c of n) {
      out += c;
      map.push(i);
    }
  }
  return { text: out, map };
}

export function verifyQuote(text: string, quote: string): boolean {
  const q = normalize(quote);
  return q.length >= 3 && normalize(text).includes(q);
}

export function findSpan(text: string, quote: string): Span | null {
  const q = normalize(quote);
  if (q.length < 3) return null;
  const { text: norm, map } = normalizeWithMap(text);
  const idx = norm.indexOf(q);
  if (idx < 0) return null;
  const start = map[idx];
  const endIdx = map[idx + q.length - 1];
  if (start === undefined || endIdx === undefined) return null;
  const end = endIdx + 1;
  return { start, end, text: text.slice(start, end) };
}

export type GroundingItem = { path: string; quote: string; verified: boolean; span: Span | null };

export type GroundingReport = { total: number; verified: number; items: GroundingItem[] };

/** Check every evidence quote in the case summary and AI red flags. */
export function groundAnalysis(ai: AiAnalysis, text: string): GroundingReport {
  const items: GroundingItem[] = [];
  const check = (path: string, quote: string) => {
    const span = findSpan(text, quote);
    items.push({ path, quote, verified: span !== null, span });
  };
  const s = ai.caseSummary;
  if (s.chiefComplaint) check('caseSummary.chiefComplaint', s.chiefComplaint.evidence);
  for (const section of SUMMARY_LIST_SECTIONS) {
    s[section].forEach((fact, i) => check(`caseSummary.${section}[${i}]`, fact.evidence));
  }
  ai.additionalRedFlags.forEach((flag, i) =>
    flag.evidence.forEach((q, j) => check(`additionalRedFlags[${i}].evidence[${j}]`, q)),
  );
  return { total: items.length, verified: items.filter((i) => i.verified).length, items };
}
