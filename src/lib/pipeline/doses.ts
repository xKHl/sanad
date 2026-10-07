import type { AiAnalysis } from '@/lib/ai/schema';

/**
 * Dose guard (SPEC §7.2). The prompt forbids medication doses, routes of a dose and dosing
 * frequencies, but a model can still write one ("aspirin 300 mg"). This deterministic pass
 * removes them from every AI suggestion before display. The case summary is not touched: it
 * reports the clinician's own words, verified against the text.
 */

const NUM = String.raw`\d+(?:[.,]\d+)?(?:\s*(?:-|–|to)\s*\d+(?:[.,]\d+)?)?`;
const UNIT = String.raw`(?:mg|mcg|µg|ug|micrograms?|milligrams?|grams?|g|ml|mL|millilit(?:re|er)s?|units?|IU|L\s*\/\s*min|litres?\s*\/\s*min|liters?\s*\/\s*min)(?:\s*\/\s*(?:kg|day|hr|h|min|dose))*`;
const DOSE = new RegExp(String.raw`\s*\(?(?:\b(?:at|of)\s+)?\b${NUM}\s*${UNIT}(?![A-Za-z])\)?`, 'g');
const FREQUENCY = /\s*\b(?:BD|BID|TDS|TID|QDS|QID|PRN|STAT|q\d+h|every \d+ (?:hours|hrs|minutes|mins))\b/g;

export function stripDoses(text: string): { text: string; removed: boolean } {
  let out = text.replace(DOSE, '').replace(FREQUENCY, '');
  if (out === text) return { text, removed: false };
  out = out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .trim();
  if (!/protocol/i.test(out)) out = `${out.replace(/[.;,]$/, '')} per local protocol`;
  return { text: out, removed: true };
}

/** Remove doses from AI suggestions; returns how many fields were changed. */
export function removeDoses(ai: AiAnalysis): { ai: AiAnalysis; removed: number } {
  let removed = 0;
  const clean = (s: string) => {
    const r = stripDoses(s);
    if (r.removed) removed++;
    return r.text;
  };
  const next: AiAnalysis = {
    ...ai,
    nextSteps: ai.nextSteps.map((n) => ({
      ...n,
      action: clean(n.action),
      rationale: clean(n.rationale),
    })),
    missingInformation: ai.missingInformation.map((m) => ({
      ...m,
      question: clean(m.question),
      whyItMatters: clean(m.whyItMatters),
    })),
    additionalRedFlags: ai.additionalRedFlags.map((f) => ({
      ...f,
      recommendedAction: clean(f.recommendedAction),
    })),
  };
  return { ai: next, removed };
}
