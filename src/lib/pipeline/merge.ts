import type { AiAnalysis, NextStep } from '@/lib/ai/schema';
import { SUMMARY_LIST_SECTIONS } from '@/lib/ai/schema';
import { ruleById } from '@/lib/safety/rules';
import type { RequiredInfoItem, RuleFlag } from '@/lib/safety/types';
import { findSpan, normalize } from './grounding';
import type { MergedMissingItem, MergedRedFlag, SafetyStatus } from './types';

/**
 * Merge rule findings with AI output (SPEC §7.5). Rule red flags are always kept and always
 * come first; the model can add flags only with verified evidence and cannot remove or
 * downgrade a rule flag.
 */

export const LIMITS = { missingInformation: 8, nextSteps: 10, additionalRedFlags: 4, stringLength: 300 } as const;

const clip = (s: string) => (s.length > LIMITS.stringLength ? `${s.slice(0, LIMITS.stringLength - 1)}…` : s);

const URGENCY_ORDER: Record<NextStep['urgency'], number> = { immediate: 0, today: 1, routine: 2 };

/** Enforce list limits and string lengths after parsing (SPEC §7.7). */
export function postProcess(ai: AiAnalysis): AiAnalysis {
  const s = ai.caseSummary;
  const fact = (f: { text: string; evidence: string }) => ({ text: clip(f.text), evidence: clip(f.evidence) });
  const summary = {
    ...s,
    oneLiner: clip(s.oneLiner),
    chiefComplaint: s.chiefComplaint ? fact(s.chiefComplaint) : null,
  };
  for (const section of SUMMARY_LIST_SECTIONS) summary[section] = s[section].slice(0, 12).map(fact);
  const nextSteps = ai.nextSteps
    .slice(0, LIMITS.nextSteps)
    .map((n, i) => ({ step: { ...n, action: clip(n.action), rationale: clip(n.rationale) }, i }))
    .sort((a, b) => URGENCY_ORDER[a.step.urgency] - URGENCY_ORDER[b.step.urgency] || a.i - b.i)
    .map((x) => x.step);
  return {
    inputQuality: { ...ai.inputQuality, note: ai.inputQuality.note ? clip(ai.inputQuality.note) : null },
    caseSummary: summary,
    missingInformation: ai.missingInformation.slice(0, LIMITS.missingInformation).map((m) => ({
      ...m,
      question: clip(m.question),
      whyItMatters: clip(m.whyItMatters),
      askPatientArabic: m.askPatientArabic ? clip(m.askPatientArabic) : null,
    })),
    nextSteps,
    additionalRedFlags: ai.additionalRedFlags.slice(0, LIMITS.additionalRedFlags).map((f) => ({
      ...f,
      title: clip(f.title),
      recommendedAction: clip(f.recommendedAction),
      evidence: f.evidence.slice(0, 6).map(clip),
    })),
  };
}

export function mergeRedFlags(
  text: string,
  ruleFlags: RuleFlag[],
  ai: AiAnalysis | null,
): { flags: MergedRedFlag[]; warnings: string[] } {
  const warnings: string[] = [];
  const flags: MergedRedFlag[] = ruleFlags.map((r) => ({
    source: 'rule',
    id: r.ruleId,
    title: r.title,
    severity: r.severity,
    reasoning: r.reasoning,
    recommendedAction: r.recommendedAction,
    basis: r.basis,
    evidence: r.evidence.map((span) => ({ quote: span.text, span, verified: true })),
  }));
  const dedupe = ruleFlags.flatMap((r) => ruleById(r.ruleId)?.dedupeKeywords ?? []);
  let n = 0;
  for (const f of ai?.additionalRedFlags ?? []) {
    const evidence = f.evidence.map((quote) => {
      const span = findSpan(text, quote);
      return { quote, span, verified: span !== null };
    });
    if (!evidence.some((e) => e.verified)) {
      warnings.push(`AI red flag "${f.title}" dropped: no evidence quote was found in the scenario.`);
      continue;
    }
    const title = ` ${normalize(f.title)} `;
    if (dedupe.some((k) => title.includes(k))) {
      warnings.push(`AI red flag "${f.title}" dropped: already covered by a rule.`);
      continue;
    }
    n++;
    flags.push({
      source: 'ai',
      id: `AI-${n}`,
      title: f.title,
      severity: f.severity,
      reasoning: null,
      recommendedAction: f.recommendedAction,
      basis: null,
      evidence,
    });
  }
  const rank = (f: MergedRedFlag) => (f.severity === 'critical' ? 0 : 2) + (f.source === 'rule' ? 0 : 1);
  flags.sort((a, b) => rank(a) - rank(b));
  return { flags, warnings };
}

export function safetyStatus(flags: MergedRedFlag[]): SafetyStatus {
  if (flags.some((f) => f.severity === 'critical')) return 'critical';
  if (flags.length > 0) return 'urgent';
  return 'none';
}

const FAMILIES: Array<{ rule: string; words: RegExp }> = [
  { rule: 'RI-ALLERGIES', words: /allerg/ },
  { rule: 'RI-MEDICATIONS', words: /medication|\bmeds\b|\bdrugs?\b/ },
  { rule: 'RI-PREGNANCY', words: /pregnan|\blmp\b|menstrual|period/ },
  {
    rule: 'RI-VITALS',
    words: /vital|observations|blood pressure|heart rate|pulse|saturation|spo2|temperature|respiratory rate/,
  },
  { rule: 'RI-GLUCOSE', words: /glucose|blood sugar/ },
  { rule: 'RI-AGE-SEX', words: /\bage\b|\bsex\b|gender/ },
];

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export function mergeMissingInfo(required: RequiredInfoItem[], ai: AiAnalysis | null): MergedMissingItem[] {
  const ruleIds = new Set(required.map((r) => r.id));
  const items: MergedMissingItem[] = required.map((r) => ({
    source: 'rule',
    id: r.id,
    question: r.item,
    whyItMatters: r.whyItMatters,
    priority: r.priority,
    category: r.category,
    askPatientArabic: null,
  }));
  (ai?.missingInformation ?? []).forEach((m, i) => {
    const q = normalize(m.question);
    const duplicate = FAMILIES.some((f) => ruleIds.has(f.rule) && f.words.test(q));
    if (duplicate) return;
    items.push({
      source: 'ai',
      id: `AI-MI-${i + 1}`,
      question: m.question,
      whyItMatters: m.whyItMatters,
      priority: m.priority,
      category: m.category,
      askPatientArabic: m.askPatientArabic,
    });
  });
  return items
    .map((item, i) => ({ item, i }))
    .sort(
      (a, b) =>
        PRIORITY_ORDER[a.item.priority] - PRIORITY_ORDER[b.item.priority] ||
        (a.item.source === b.item.source ? a.i - b.i : a.item.source === 'rule' ? -1 : 1),
    )
    .map((x) => x.item);
}

/** How many case-summary sections have content (chief complaint + 8 lists + one-liner). */
export function completeness(ai: AiAnalysis): { stated: number; total: number } {
  const s = ai.caseSummary;
  let stated = s.chiefComplaint ? 1 : 0;
  for (const section of SUMMARY_LIST_SECTIONS) if (s[section].length > 0) stated++;
  return { stated, total: SUMMARY_LIST_SECTIONS.length + 1 };
}
