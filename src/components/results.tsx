'use client';

import {
  Check,
  ClipboardCopy,
  Download,
  Info,
  Languages,
  OctagonAlert,
  Printer,
  Quote,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  SECTION_LABELS,
  SUMMARY_LIST_SECTIONS,
  type AiAnalysis,
  type Fact,
  type NextStep,
} from '@/lib/ai/schema';
import { formatNote } from '@/lib/export/note';
import type { GroundingReport } from '@/lib/pipeline/grounding';
import type {
  AnalysisResult,
  EvidenceRef,
  MergedMissingItem,
  MergedRedFlag,
  SafetyStatus,
} from '@/lib/pipeline/types';
import type { Span } from '@/lib/safety/types';
import { cx, Notice, SectionHeading, SeverityLabel, SourceTag, Tip } from './ui';

type OnEvidence = (spans: Span[]) => void;

const clipQuote = (q: string, n = 52) => (q.length > n ? `${q.slice(0, n - 1)}…` : q);

// ------------------------------------------------------------ banner

export function SafetyBanner({ status, flags }: { status: SafetyStatus; flags: MergedRedFlag[] }) {
  const critical = flags.filter((f) => f.severity === 'critical').length;
  const urgent = flags.length - critical;
  if (status === 'critical') {
    return (
      <div className="bg-critical flex items-start gap-3 rounded-lg px-4 py-3 text-white">
        <OctagonAlert aria-hidden className="mt-0.5 size-5 shrink-0" strokeWidth={2.25} />
        <p>
          <span className="font-bold">
            {critical} critical warning sign{critical > 1 ? 's' : ''}
            {urgent ? ` and ${urgent} urgent` : ''}.
          </span>{' '}
          Consider immediate escalation per local protocol.
        </p>
      </div>
    );
  }
  if (status === 'urgent') {
    return (
      <div className="border-urgent-line bg-urgent-wash text-urgent flex items-start gap-3 rounded-lg border px-4 py-3">
        <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" strokeWidth={2.25} />
        <p>
          <span className="font-bold">
            {urgent} urgent warning sign{urgent > 1 ? 's' : ''}.
          </span>{' '}
          A same-day clinical review is suggested.
        </p>
      </div>
    );
  }
  return (
    <div className="border-ok/30 bg-ok-wash text-ok flex items-start gap-3 rounded-lg border px-4 py-3">
      <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
      <p>
        <span className="font-bold">No red flags from rule checks or AI.</span> Absence of flags
        does not exclude serious illness.
      </p>
    </div>
  );
}

// ------------------------------------------------------------ evidence

function EvidenceChip({ e, onEvidence }: { e: EvidenceRef; onEvidence: OnEvidence }) {
  const label = `“${clipQuote(e.quote)}”`;
  if (!e.verified) {
    return (
      <Tip content="This quote was not found word for word in the case. Check it before relying on it.">
        <span
          tabIndex={0}
          className="border-urgent text-urgent inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-[13px]"
        >
          <TriangleAlert aria-hidden className="size-3.5" />
          {label}
        </span>
      </Tip>
    );
  }
  return (
    <button
      type="button"
      onClick={() => e.span && onEvidence([e.span])}
      className="border-rule bg-sheet text-ink-2 hover:border-pen hover:text-pen inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-left text-[13px]"
      aria-label={`Show in case: ${e.quote}`}
    >
      <Quote aria-hidden className="size-3.5 shrink-0" />
      {label}
    </button>
  );
}

// ------------------------------------------------------------ red flags

export function RedFlagList({
  flags,
  onEvidence,
}: {
  flags: MergedRedFlag[];
  onEvidence: OnEvidence;
}) {
  if (flags.length === 0) return <p className="text-ink-2">No red flags were found.</p>;
  return (
    <ul className="space-y-3">
      {flags.map((f) => {
        const critical = f.severity === 'critical';
        return (
          <li
            key={f.id}
            id={`flag-${f.id}`}
            className={cx(
              'bg-sheet scroll-mt-24 rounded-lg border-l-4 px-4 py-3',
              f.source === 'rule'
                ? 'border-rule border-y border-r'
                : 'border-pen/60 border-y border-r border-dashed',
              critical ? 'border-l-critical' : 'border-l-urgent',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-x-2.5">
                <SeverityLabel severity={f.severity} className="text-[14px]" />
                <h3 className="text-ink text-[16px] font-bold">{f.title}</h3>
              </div>
              <SourceTag source={f.source} id={f.source === 'rule' ? f.id : undefined} />
            </div>
            <p className="text-ink mt-1.5">{f.recommendedAction}</p>
            {f.reasoning ? (
              <p className="text-ink-2 mt-1 text-[14px]">
                <span className="text-ink-3">Matched:</span> {f.reasoning}
              </p>
            ) : (
              <p className="text-ink-3 mt-1 text-[14px]">
                Suggested by the AI from the quotes below. Verify before acting.
              </p>
            )}
            {f.evidence.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {f.evidence.map((e, i) => (
                  <EvidenceChip key={i} e={e} onEvidence={onEvidence} />
                ))}
              </div>
            ) : null}
            {f.basis ? (
              <p className="text-ink-3 mt-2 text-[13px]">
                {f.basis}. Prototype threshold, not clinically validated.
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------ summary

function FactLine({
  fact,
  path,
  grounding,
  onEvidence,
}: {
  fact: Fact;
  path: string;
  grounding: GroundingReport | null;
  onEvidence: OnEvidence;
}) {
  const g = grounding?.items.find((i) => i.path === path);
  const verified = g?.verified ?? false;
  return (
    <li className="flex items-start gap-1.5">
      <span className="min-w-0">{fact.text}</span>
      {verified && g?.span ? (
        <Tip content={<>Source: “{fact.evidence}”</>}>
          <button
            type="button"
            onClick={() => g.span && onEvidence([g.span])}
            aria-label={`Show source in case: ${fact.evidence}`}
            className="text-ink-3 hover:bg-pen-wash hover:text-pen mt-0.5 shrink-0 rounded p-0.5"
          >
            <Quote aria-hidden className="size-3.5" />
          </button>
        </Tip>
      ) : (
        <Tip content={<>Quote not found word for word in the case: “{fact.evidence}”</>}>
          <span
            tabIndex={0}
            className="text-urgent mt-0.5 inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold"
          >
            <TriangleAlert aria-hidden className="size-3.5" />
            Check
          </span>
        </Tip>
      )}
    </li>
  );
}

export function CaseSummaryView({
  ai,
  grounding,
  completeness,
  onEvidence,
}: {
  ai: AiAnalysis;
  grounding: GroundingReport | null;
  completeness: { stated: number; total: number } | null;
  onEvidence: OnEvidence;
}) {
  const s = ai.caseSummary;
  const rows: Array<{ key: string; label: string; facts: Array<{ fact: Fact; path: string }> }> = [
    {
      key: 'chiefComplaint',
      label: SECTION_LABELS.chiefComplaint,
      facts: s.chiefComplaint
        ? [{ fact: s.chiefComplaint, path: 'caseSummary.chiefComplaint' }]
        : [],
    },
    ...SUMMARY_LIST_SECTIONS.map((section) => ({
      key: section,
      label: SECTION_LABELS[section],
      facts: s[section].map((fact, i) => ({ fact, path: `caseSummary.${section}[${i}]` })),
    })),
  ];
  return (
    <div>
      <p className="text-ink text-[16.5px] leading-relaxed font-semibold">{s.oneLiner}</p>
      {completeness ? (
        <div className="text-ink-3 mt-2.5 flex items-center gap-3 text-[13.5px]">
          <span className="flex gap-0.5" aria-hidden>
            {Array.from({ length: completeness.total }, (_, i) => (
              <span
                key={i}
                className={cx(
                  'h-1.5 w-4 rounded-full',
                  i < completeness.stated ? 'bg-pen' : 'bg-rule',
                )}
              />
            ))}
          </span>
          <span>
            {completeness.stated} of {completeness.total} sections documented
          </span>
        </div>
      ) : null}
      <dl className="divide-rule border-rule mt-4 divide-y border-y">
        {rows.map((row) => (
          <div key={row.key} className="grid gap-1 py-2.5 sm:grid-cols-[13rem_1fr] sm:gap-4">
            <dt
              className={cx(
                'text-[14px] font-semibold',
                row.facts.length ? 'text-ink-2' : 'text-ink-3',
              )}
            >
              {row.label}
            </dt>
            <dd>
              {row.facts.length === 0 ? (
                <span className="text-ink-3 text-[14.5px]">Not stated</span>
              ) : (
                <ul className="space-y-1">
                  {row.facts.map(({ fact, path }) => (
                    <FactLine
                      key={path}
                      fact={fact}
                      path={path}
                      grounding={grounding}
                      onEvidence={onEvidence}
                    />
                  ))}
                </ul>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ------------------------------------------------------------ missing information

const PRIORITY_LABEL = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
} as const;

export function MissingInfoView({ items }: { items: MergedMissingItem[] }) {
  const [arabic, setArabic] = useState(false);
  const hasArabic = items.some((i) => i.askPatientArabic);
  if (items.length === 0)
    return <p className="text-ink-2">Nothing important appears to be missing.</p>;
  return (
    <div>
      {hasArabic ? (
        <label className="no-print text-ink-2 mb-3 inline-flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            className="accent-pen size-4"
            checked={arabic}
            onChange={(e) => setArabic(e.target.checked)}
          />
          <Languages aria-hidden className="size-4" />
          Show Arabic wording for patient questions
        </label>
      ) : null}
      {(['high', 'medium', 'low'] as const).map((p) => {
        const group = items.filter((i) => i.priority === p);
        if (group.length === 0) return null;
        return (
          <div key={p} className="mb-4 last:mb-0">
            <h3 className="text-ink-3 mb-1.5 text-[14px] font-semibold">{PRIORITY_LABEL[p]}</h3>
            <ul className="space-y-2.5">
              {group.map((m) => (
                <li key={m.id} className="border-rule border-l-2 pl-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-ink font-semibold">{m.question}</p>
                    {m.source === 'rule' ? (
                      <span className="text-ink-3 text-[12.5px]">Rule baseline</span>
                    ) : (
                      <span className="border-pen text-pen rounded-full border border-dashed px-1.5 text-[12px] font-semibold">
                        AI
                      </span>
                    )}
                  </div>
                  <p className="text-ink-2 text-[14.5px]">{m.whyItMatters}</p>
                  {arabic && m.askPatientArabic ? (
                    <p dir="rtl" lang="ar" className="font-arabic text-ink mt-1 text-[16px]">
                      {m.askPatientArabic}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------ next steps

const URGENCY_LABEL = { immediate: 'Immediate', today: 'Today', routine: 'Routine' } as const;
const CATEGORY_LABEL: Record<NextStep['category'], string> = {
  assessment: 'Assessment',
  investigation: 'Investigation',
  management: 'Management',
  escalation: 'Escalation',
  safety_netting: 'Safety-netting',
  documentation: 'Documentation',
};

export function NextStepsView({
  steps,
  checked,
  onToggle,
  flagIds,
}: {
  steps: NextStep[];
  checked: ReadonlySet<number>;
  onToggle: (i: number) => void;
  flagIds: ReadonlySet<string>;
}) {
  if (steps.length === 0) return <p className="text-ink-2">No next steps were suggested.</p>;
  return (
    <div>
      {(['immediate', 'today', 'routine'] as const).map((u) => {
        const group = steps.map((s, i) => ({ s, i })).filter(({ s }) => s.urgency === u);
        if (group.length === 0) return null;
        return (
          <div key={u} className="mb-4 last:mb-0">
            <h3
              className={cx(
                'mb-1.5 text-[14px] font-semibold',
                u === 'immediate' ? 'text-critical' : 'text-ink-3',
              )}
            >
              {URGENCY_LABEL[u]}
            </h3>
            <ul className="space-y-2">
              {group.map(({ s, i }) => (
                <li key={i}>
                  <label className="hover:bg-pen-wash/40 flex cursor-pointer items-start gap-3 rounded-md px-1 py-1">
                    <input
                      type="checkbox"
                      className="accent-pen mt-1 size-4 shrink-0"
                      checked={checked.has(i)}
                      onChange={() => onToggle(i)}
                    />
                    <span className="min-w-0">
                      <span
                        className={cx(
                          'font-semibold',
                          checked.has(i) ? 'text-ink-3 decoration-ink-3 line-through' : 'text-ink',
                        )}
                      >
                        {s.action}
                      </span>
                      <span className="text-ink-2 block text-[14.5px]">{s.rationale}</span>
                      <span className="mt-1 flex flex-wrap gap-1.5 text-[12.5px]">
                        <span className="border-rule text-ink-3 rounded border px-1.5">
                          {CATEGORY_LABEL[s.category]}
                        </span>
                        {s.addressesRedFlag && flagIds.has(s.addressesRedFlag) ? (
                          <a
                            href={`#flag-${s.addressesRedFlag}`}
                            className="border-rule text-ink-2 hover:border-pen hover:text-pen rounded border px-1.5 underline-offset-2 hover:underline"
                          >
                            Responds to {s.addressesRedFlag}
                          </a>
                        ) : null}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------ transparency

export function TransparencyView({ r }: { r: AnalysisResult }) {
  const unverified = r.grounding?.items.filter((i) => !i.verified) ?? [];
  const fired = r.safety.ruleFlags;
  const rows: Array<[string, ReactNode]> = [
    [
      'Mode',
      r.mode === 'cloud'
        ? 'Live cloud model'
        : r.mode === 'local'
          ? 'Local model'
          : 'Recorded outputs (demo)',
    ],
    ['Model', r.model ?? 'None (rule checks only)'],
    ['Versions', `Prompt v${r.promptVersion}, rules v${r.rulesVersion}`],
    [
      'Timing',
      `Rule checks ${r.timings.safetyMs} ms${r.timings.aiMs !== null ? `, AI ${(r.timings.aiMs / 1000).toFixed(1)} s` : ''}, total ${(r.timings.totalMs / 1000).toFixed(1)} s${r.aiAttempts > 1 ? `, ${r.aiAttempts} AI attempts` : ''}`,
    ],
    [
      'Rules',
      `${r.safety.rulesEvaluated} evaluated, ${fired.length} fired${fired.length ? `: ${fired.map((f) => f.ruleId).join(', ')}` : ''}`,
    ],
    [
      'Quote checks',
      r.grounding
        ? `${r.grounding.verified} of ${r.grounding.total} AI quotes found word for word in the case`
        : 'No AI output',
    ],
    [
      'Identifiers removed',
      r.redactions.length
        ? r.redactions.map((x) => `${x.count} ${x.type.replace('_', ' ')}`).join(', ')
        : 'None found',
    ],
    ['Request', r.requestId],
  ];
  return (
    <details className="group border-rule bg-sheet rounded-lg border">
      <summary className="text-ink cursor-pointer list-none px-4 py-3 font-semibold marker:hidden">
        <span className="inline-flex items-center gap-2">
          <Info aria-hidden className="text-ink-3 size-4" />
          How this result was produced
        </span>
      </summary>
      <div className="border-rule border-t px-4 py-3">
        <dl className="grid gap-x-4 gap-y-1.5 text-[14px] sm:grid-cols-[10rem_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-3">{k}</dt>
              <dd className="text-ink break-words">{v}</dd>
            </div>
          ))}
        </dl>
        {fired.length > 0 ? (
          <div className="mt-3">
            <p className="text-ink-3 text-[14px]">Guidance behind each rule</p>
            <ul className="text-ink-2 mt-1 space-y-0.5 text-[13.5px]">
              {fired.map((f) => (
                <li key={f.ruleId}>
                  {f.ruleId}: {f.basis}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {unverified.length > 0 ? (
          <div className="mt-3">
            <p className="text-urgent text-[14px]">Quotes not found in the case</p>
            <ul className="text-ink-2 mt-1 space-y-0.5 text-[13.5px]">
              {unverified.map((u) => (
                <li key={u.path}>
                  “{u.quote}” ({u.path})
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {r.warnings.length > 0 ? (
          <div className="mt-3">
            <p className="text-ink-3 text-[14px]">Notes</p>
            <ul className="text-ink-2 mt-1 list-disc space-y-0.5 pl-5 text-[13.5px]">
              {r.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="text-ink-3 mt-3 text-[13px]">
          Rule checks are deterministic and run before the AI. The AI cannot remove or downgrade a
          rule flag; its own flags are kept only when their quotes are found in the case.
        </p>
      </div>
    </details>
  );
}

// ------------------------------------------------------------ actions

export function ResultActions({ r, checked }: { r: AnalysisResult; checked: ReadonlySet<number> }) {
  const [status, setStatus] = useState<string | null>(null);
  const flash = (msg: string) => {
    setStatus(msg);
    window.setTimeout(() => setStatus(null), 2500);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatNote(r, checked));
      flash('Note copied');
    } catch {
      flash('Copy failed. Select and copy the text manually.');
    }
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sanad-${r.requestId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash('JSON downloaded');
  };
  const button =
    'inline-flex items-center gap-1.5 rounded-md border border-rule-strong bg-sheet px-3 py-1.5 text-[14px] font-semibold text-ink hover:border-pen hover:text-pen';
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <button type="button" className={button} onClick={copy}>
        <ClipboardCopy aria-hidden className="size-4" />
        Copy note
      </button>
      <button type="button" className={button} onClick={download}>
        <Download aria-hidden className="size-4" />
        Download JSON
      </button>
      <button type="button" className={button} onClick={() => window.print()}>
        <Printer aria-hidden className="size-4" />
        Print
      </button>
      <span role="status" className="text-ok inline-flex items-center gap-1 text-[14px]">
        {status ? (
          <>
            <Check aria-hidden className="size-4" />
            {status}
          </>
        ) : null}
      </span>
    </div>
  );
}

export function AiNotice({ r }: { r: AnalysisResult }) {
  if (r.aiError) {
    return (
      <Notice tone="urgent" icon={<TriangleAlert aria-hidden className="size-4" />}>
        <p>
          <span className="font-semibold">AI section unavailable.</span> {r.aiError.message} The
          rule-based safety checks above are complete.
          {r.aiError.detail ? (
            <span className="mt-1 block text-[12.5px] opacity-80">
              Technical detail: {r.aiError.detail}
            </span>
          ) : null}
        </p>
      </Notice>
    );
  }
  if (r.ai && !r.ai.inputQuality.isClinicalScenario) {
    return (
      <Notice tone="info" icon={<Info aria-hidden className="size-4" />}>
        <p>
          <span className="font-semibold">This does not look like a clinical case.</span>{' '}
          {r.ai.inputQuality.note ?? 'Describe the patient, the complaint and any observations.'}
        </p>
      </Notice>
    );
  }
  return null;
}

export { SectionHeading };
