import { ConceptIndex, matchConcepts } from './concepts';
import { computeNews2 } from './news2';
import { requiredInfo } from './required-info';
import { RULES, evaluateRules } from './rules';
import { arabicRatio } from './text';
import type { SafetyFindings } from './types';
import { parseDemographics, parseVitals } from './vitals';

/** Bump the minor version on any change to clinical logic (SPEC §5.9). */
export const RULES_VERSION = '1.0.0';

export const RULES_COUNT = RULES.length;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Run every deterministic safety check. Pure, synchronous and isomorphic: the same function
 * runs live in the browser while the clinician types and on the server for every request.
 */
export function runSafetyChecks(text: string): SafetyFindings {
  const t0 = now();
  const demographics = parseDemographics(text);
  const vitals = parseVitals(text);
  const concepts = matchConcepts(text);
  const index = new ConceptIndex(concepts);
  const news2 = computeNews2(demographics, vitals, index);
  const ruleFlags = evaluateRules({ text, demo: demographics, vitals, concepts: index, news2 });
  const required = requiredInfo(text, demographics, vitals, index, ruleFlags);
  const languageWarning =
    arabicRatio(text) > 0.2
      ? 'Rule-based checks currently support English text only; Arabic content is analysed by the AI layer.'
      : null;
  return {
    rulesVersion: RULES_VERSION,
    demographics,
    vitals,
    concepts,
    news2,
    ruleFlags,
    requiredInfo: required,
    languageWarning,
    rulesEvaluated: RULES.length,
    timingMs: Math.round((now() - t0) * 100) / 100,
  };
}

export type { SafetyFindings } from './types';
export * from './types';
export { detectIdentifiers, redactIdentifiers, countByType, PHI_LABELS } from './phi';
export { RULES, ruleById } from './rules';
export { VITAL_LABELS } from './vitals';
export { CONCEPT_LABELS } from './lexicon';
