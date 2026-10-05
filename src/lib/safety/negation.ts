import { phrase, splitSentences, type Segment } from './text';
import type { Experiencer } from './types';

/**
 * NegEx-lite negation and experiencer detection (SPEC §5.4), after Chapman et al. (2001).
 * Scope runs forward from a pre-negation cue to the end of the clause. A comma ends the scope
 * unless the cue introduces a list closed by "or", "nor" or "and" ("no A, B, C or D").
 */

const PRE_CUES = [
  'no history of',
  'no hx of',
  'no evidence of',
  'no signs? of',
  'no complaints? of',
  'negative for',
  'free of',
  'absence of',
  'denies',
  'denied',
  'denying',
  'without',
  'nil',
  'never',
  'none',
  'no',
  'not',
  '-ve',
].map((c) => phrase(c));

const PSEUDO = [
  'no change',
  'no improvement',
  'not only',
  'not certain',
  'not sure',
  'cannot be ruled out',
  "can't be ruled out",
  'not ruled out',
  'no further',
  'gram negative',
].map((c) => phrase(c));

const TERMINATOR =
  /(?<![A-Za-z])(?:but|however|although|though|except|apart from|aside from|yet|whereas|still|presents? with|complains? of|c\/o|reports?)(?![A-Za-z])/i;

const POSITIVE_VERB = /(?<![A-Za-z])(?:has|have|had|reports?|presents?|complains?|now|developed|noted)(?![A-Za-z])/i;

const VITAL_LEAD = /(?<![A-Za-z])(?:HR|BP|RR|SpO2|SaO2|sats?|temp|GCS|pulse|T)\s*[:=]?\s*\d|\d{2,3}\s*\/\s*\d{2,3}/i;

const CONJ = /(?<![A-Za-z])(?:or|nor|and)(?![A-Za-z])/i;

const POST_CUE =
  /^\s*(?:[:\-–]\s*)?(?:(?:is|was|were|are)\s+)?(?:absent|not present|negative|ruled out|denied|nil|none)(?![A-Za-z])/i;

type Scope = { start: number; end: number };

function firstIndex(re: RegExp, s: string): number {
  const m = re.exec(s);
  return m ? m.index : -1;
}

function scopeEnd(text: string, cueEnd: number, sentenceEnd: number): number {
  const rest = text.slice(cueEnd, sentenceEnd);
  let limit = rest.length;
  for (const re of [TERMINATOR, POSITIVE_VERB, VITAL_LEAD]) {
    const i = firstIndex(re, rest);
    if (i >= 0 && i < limit) limit = i;
  }
  const region = rest.slice(0, limit);
  // Comma-separated segments with their end offsets within region.
  const segs: Array<{ text: string; end: number }> = [];
  let from = 0;
  for (let i = 0; i <= region.length; i++) {
    if (i === region.length || region[i] === ',') {
      segs.push({ text: region.slice(from, i), end: i });
      from = i + 1;
    }
  }
  const first = segs[0];
  if (!first) return cueEnd;
  if (segs.length === 1 || CONJ.test(first.text)) return cueEnd + first.end;
  for (let i = 1; i < segs.length; i++) {
    const seg = segs[i];
    if (!seg) break;
    const words = seg.text.trim().split(/\s+/).filter(Boolean).length;
    if (words === 0 || words > 8) break;
    if (CONJ.test(seg.text)) return cueEnd + seg.end;
  }
  return cueEnd + first.end;
}

export type NegationContext = {
  sentences: Segment[];
  scopes: Scope[];
};

export function buildNegationContext(text: string): NegationContext {
  const sentences = splitSentences(text);
  const pseudo: Scope[] = [];
  for (const re of PSEUDO) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) pseudo.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  const scopes: Scope[] = [];
  for (const re of PRE_CUES) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (pseudo.some((p) => start >= p.start && start < p.end)) continue;
      const sentence = sentences.find((s) => start >= s.start && start < s.end);
      if (!sentence) continue;
      scopes.push({ start: end, end: scopeEnd(text, end, sentence.end) });
    }
  }
  return { sentences, scopes };
}

export function isNegated(text: string, ctx: NegationContext, start: number, end: number): boolean {
  if (ctx.scopes.some((s) => s.start <= start && start < s.end)) return true;
  // Post-negation cue in the same clause: "Sweating: absent".
  return POST_CUE.test(text.slice(end, end + 40));
}

const FAMILY_HEADER = /family\s+(?:history|hx)(?:\s+of)?|(?<![A-Za-z])FHx?(?![A-Za-z])\s*:?/gi;
const FAMILY_SCOPE_BREAK =
  /(?<![A-Za-z])(?:patient|pt|he|she|they|but|however|presents?|reports?|complains?|now|today|currently|since|this morning)(?![A-Za-z])/i;
const RELATIVE =
  /(?<!(?:by|per|from|to|according to)\s+)(?<![A-Za-z])(?:mother|father|mum|mom|dad|brother|sister|son|daughter|sibling|parent|grandmother|grandfather|grandparent|uncle|aunt|cousin)(?:'s)?\s+(?:\S+\s+){0,2}?(?:had|has|died|diagnosed|with)(?![A-Za-z])/i;

export function experiencerOf(text: string, ctx: NegationContext, start: number, end: number): Experiencer {
  const sentence = ctx.sentences.find((s) => start >= s.start && start < s.end);
  if (!sentence) return 'patient';
  // A family-history header earlier in the sentence covers the list that follows it
  // ("FHx: diabetes, IHD") until the text turns back to the patient.
  FAMILY_HEADER.lastIndex = 0;
  let headerEnd = -1;
  for (const m of text.slice(sentence.start, start).matchAll(FAMILY_HEADER)) {
    headerEnd = sentence.start + (m.index ?? 0) + m[0].length;
  }
  if (headerEnd >= 0 && !FAMILY_SCOPE_BREAK.test(text.slice(headerEnd, start))) return 'family';
  // Header that overlaps the concept match itself ("family history of MI").
  const lead = text.slice(Math.max(sentence.start, start - 12), start);
  if (/family\s+$|FHx?\s*:?\s*$/i.test(lead)) return 'family';
  // A relative followed by had/has/died/diagnosed/with in the same clause.
  const before = text.slice(sentence.start, start);
  const lastComma = Math.max(before.lastIndexOf(','), before.toLowerCase().lastIndexOf(' but '));
  const clauseStart = lastComma >= 0 ? sentence.start + lastComma + 1 : sentence.start;
  if (RELATIVE.test(text.slice(clauseStart, end))) return 'family';
  return 'patient';
}
