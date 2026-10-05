import type { Span } from './types';

export function makeSpan(text: string, start: number, end: number): Span {
  return { start, end, text: text.slice(start, end) };
}

export type Segment = { start: number; end: number; text: string };

const ABBREVIATIONS = new Set(['dr', 'mr', 'mrs', 'ms', 'vs', 'eg', 'e.g', 'ie', 'i.e', 'approx', 'etc']);

/**
 * Split text into sentences on . ; ! ? and newlines.
 * A period only ends a sentence when followed by whitespace or the end of the text
 * and not preceded by a common abbreviation, so decimals ("38.9") stay intact.
 */
export function splitSentences(text: string): Segment[] {
  const out: Segment[] = [];
  let start = 0;
  const push = (end: number) => {
    // Trim leading whitespace so segment.start points at the first character.
    let s = start;
    while (s < end && /\s/.test(text[s] ?? '')) s++;
    if (end > s) out.push({ start: s, end, text: text.slice(s, end) });
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    let isEnd = false;
    if (ch === ';' || ch === '!' || ch === '?' || ch === '\n') isEnd = true;
    else if (ch === '.') {
      const next = text[i + 1];
      if (next === undefined || /\s/.test(next)) {
        const before = text.slice(Math.max(0, i - 8), i);
        const word = /([A-Za-z.]+)$/.exec(before)?.[1]?.toLowerCase() ?? '';
        isEnd = !ABBREVIATIONS.has(word);
      }
    }
    if (isEnd) {
      push(i);
      start = i + 1;
    }
  }
  push(text.length);
  return out;
}

/** Find the segment that contains position `pos`. */
export function segmentAt(segments: Segment[], pos: number): Segment | undefined {
  return segments.find((s) => pos >= s.start && pos < s.end) ?? segments.find((s) => pos === s.end);
}

/**
 * Compile a phrase pattern: spaces match any whitespace, and the match must not be
 * glued to surrounding letters or digits (so "febrile" does not match inside "afebrile").
 */
export function phrase(src: string, caseSensitive = false): RegExp {
  const body = src.replace(/ /g, '\\s+');
  return new RegExp(`(?<![A-Za-z0-9])(?:${body})(?![A-Za-z])`, caseSensitive ? 'g' : 'gi');
}

/** All non-overlapping matches of a global regex as spans. */
export function findAll(text: string, re: RegExp): Span[] {
  const spans: Span[] = [];
  re.lastIndex = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (m[0].length === 0) continue;
    spans.push(makeSpan(text, start, start + m[0].length));
  }
  return spans;
}

/** Drop spans that overlap an earlier, longer span. */
export function dedupeOverlapping<T extends { span: Span }>(items: T[]): T[] {
  const sorted = [...items].sort(
    (a, b) => a.span.start - b.span.start || b.span.end - b.span.start - (a.span.end - a.span.start),
  );
  const kept: T[] = [];
  for (const item of sorted) {
    const last = kept[kept.length - 1];
    if (last && item.span.start < last.span.end) {
      if (item.span.end - item.span.start > last.span.end - last.span.start) kept[kept.length - 1] = item;
      continue;
    }
    kept.push(item);
  }
  return kept;
}

/** Share of letters that are Arabic script. */
export function arabicRatio(text: string): number {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  const arabic = letters.filter((c) => /[؀-ۿݐ-ݿࢠ-ࣿ]/.test(c)).length;
  return arabic / letters.length;
}
