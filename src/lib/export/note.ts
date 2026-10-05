import { SECTION_LABELS, SUMMARY_LIST_SECTIONS } from '@/lib/ai/schema';
import type { AnalysisResult } from '@/lib/pipeline/types';

const SEVERITY = { critical: 'CRITICAL', urgent: 'URGENT' } as const;
const PRIORITY = { high: 'High', medium: 'Medium', low: 'Low' } as const;
const URGENCY = { immediate: 'Immediate', today: 'Today', routine: 'Routine' } as const;

function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Plain-text note for pasting into a record (SPEC §9.7). `reviewed` holds ticked next-step indexes. */
export function formatNote(r: AnalysisResult, reviewed: ReadonlySet<number> = new Set()): string {
  const lines: string[] = [];
  lines.push('SANAD decision-support summary (prototype; requires clinician review)');
  lines.push(`Generated: ${stamp(r.createdAt)}`);
  lines.push(`Model: ${r.model ?? 'none (rule checks only)'} | Prompt v${r.promptVersion} | Rules v${r.rulesVersion}`);
  lines.push('');

  lines.push('RED FLAGS');
  if (r.merged.redFlags.length === 0) lines.push('None detected by rule checks or AI. Absence of flags does not exclude serious illness.');
  for (const f of r.merged.redFlags) {
    const source = f.source === 'rule' ? `rule ${f.id}` : 'AI suggestion, verify';
    lines.push(`[${SEVERITY[f.severity]}] ${f.title} (${source}): ${f.recommendedAction}`);
  }
  lines.push('');

  const n = r.safety.news2;
  if (n.status === 'complete' || n.status === 'partial') {
    lines.push(`NEWS2: ${n.status === 'partial' ? 'at least ' : ''}${n.total} (${n.band}), ${n.status}`);
  } else {
    lines.push(`NEWS2: ${n.status === 'insufficient' ? 'not calculated' : 'not applicable'}. ${n.reason ?? ''}`.trim());
  }
  lines.push('');

  const ai = r.ai;
  if (ai && ai.inputQuality.isClinicalScenario) {
    const s = ai.caseSummary;
    lines.push('CASE SUMMARY');
    lines.push(s.oneLiner);
    if (s.chiefComplaint) lines.push(`- ${SECTION_LABELS.chiefComplaint}: ${s.chiefComplaint.text}`);
    for (const section of SUMMARY_LIST_SECTIONS) {
      const facts = s[section];
      lines.push(`- ${SECTION_LABELS[section]}: ${facts.length ? facts.map((f) => f.text).join('; ') : 'Not stated'}`);
    }
    lines.push('');
  }

  lines.push('MISSING INFORMATION');
  if (r.merged.missingInformation.length === 0) lines.push('None listed.');
  for (const m of r.merged.missingInformation) lines.push(`- [${PRIORITY[m.priority]}] ${m.question}: ${m.whyItMatters}`);
  lines.push('');

  if (ai && ai.nextSteps.length > 0) {
    lines.push(`NEXT STEPS (${reviewed.size}/${ai.nextSteps.length} reviewed)`);
    ai.nextSteps.forEach((step, i) => {
      lines.push(`[${reviewed.has(i) ? 'x' : ' '}] ${URGENCY[step.urgency]}: ${step.action}`);
    });
    lines.push('');
  }

  lines.push('Synthetic data only. Not a diagnostic device.');
  return lines.join('\n');
}
