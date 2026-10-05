import { COMPILED, type ConceptId } from './lexicon';
import { buildNegationContext, experiencerOf, isNegated } from './negation';
import { makeSpan } from './text';
import type { ConceptMatch, Span } from './types';

/** Find every concept mention with its negation and experiencer status. */
export function matchConcepts(text: string): ConceptMatch<ConceptId>[] {
  const ctx = buildNegationContext(text);
  const byConcept = new Map<ConceptId, Span[]>();
  for (const { concept, re } of COMPILED) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      if (!m[0]) continue;
      const start = m.index ?? 0;
      const list = byConcept.get(concept) ?? [];
      list.push(makeSpan(text, start, start + m[0].length));
      byConcept.set(concept, list);
    }
  }
  const out: ConceptMatch<ConceptId>[] = [];
  for (const [concept, spans] of byConcept) {
    // Within a concept, keep the longest of overlapping spans.
    spans.sort((a, b) => a.start - b.start || b.end - a.end);
    const kept: Span[] = [];
    for (const s of spans) {
      const last = kept[kept.length - 1];
      if (last && s.start < last.end) {
        if (s.end > last.end) kept[kept.length - 1] = makeSpan(text, last.start, s.end);
        continue;
      }
      kept.push(s);
    }
    for (const span of kept) {
      out.push({
        concept,
        span,
        negated: isNegated(text, ctx, span.start, span.end),
        experiencer: experiencerOf(text, ctx, span.start, span.end),
      });
    }
  }
  return out.sort((a, b) => a.span.start - b.span.start);
}

/** Query helper over concept matches. */
export class ConceptIndex {
  private readonly positive = new Map<ConceptId, Span[]>();

  constructor(readonly matches: ConceptMatch<ConceptId>[]) {
    for (const m of matches) {
      if (m.negated || m.experiencer !== 'patient') continue;
      const list = this.positive.get(m.concept) ?? [];
      list.push(m.span);
      this.positive.set(m.concept, list);
    }
  }

  /** True when the concept is mentioned, not negated, about the patient. */
  has(concept: ConceptId): boolean {
    return (this.positive.get(concept)?.length ?? 0) > 0;
  }

  spans(concept: ConceptId): Span[] {
    return this.positive.get(concept) ?? [];
  }

  /** True when `span` shares a sentence with any of `others`. */
  sameSentenceSpans(text: string, span: Span, others: Span[]): boolean {
    const sentenceOf = (pos: number) => (text.slice(0, pos).match(/[.;!?\n](?=\s|$)/g) ?? []).length;
    const target = sentenceOf(span.start);
    return others.some((o) => sentenceOf(o.start) === target);
  }
}
