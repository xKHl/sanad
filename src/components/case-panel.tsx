'use client';

import {
  Eraser,
  LoaderCircle,
  OctagonAlert,
  PencilLine,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import { DEV_CASES } from '@/data/cases/dev';
import { PHI_LABELS } from '@/lib/safety/phi';
import type { PhiFinding, PhiType, SafetyFindings, VitalReading } from '@/lib/safety/types';
import { AnnotatedText, type Mark } from './annotated-text';
import type { Span } from '@/lib/safety/types';
import { cx, Tip } from './ui';

export const SCENARIO_MAX = 3000;

type Chip = { label: string; source?: string; note?: string };

function vitalChip(
  label: string,
  r: VitalReading | undefined,
  fmt: (r: VitalReading) => string,
): Chip | null {
  if (!r) return null;
  return {
    label: `${label} ${fmt(r)}`,
    source: r.raw.trim(),
    note: r.convertedFrom ? `Converted from ${r.convertedFrom}` : undefined,
  };
}

export function detectedChips(f: SafetyFindings): Chip[] {
  const d = f.demographics;
  const v = f.vitals;
  const chips: Array<Chip | null> = [
    d.ageDisplay
      ? {
          label: `Age ${/\D/.test(d.ageDisplay) ? d.ageDisplay : `${d.ageDisplay} y`}`,
          source: d.ageSpan?.text,
        }
      : null,
    d.sex !== 'unknown'
      ? { label: d.sex === 'male' ? 'Male' : 'Female', source: d.sexSpan?.text }
      : null,
    d.pregnancy === 'pregnant'
      ? {
          label: d.gestationWeeks ? `Pregnant, ${d.gestationWeeks} weeks` : 'Pregnant',
          source: d.pregnancySpan?.text,
        }
      : null,
    v.sbp ? { label: `BP ${v.sbp.value}/${v.dbp?.value ?? '?'}`, source: v.sbp.raw.trim() } : null,
    vitalChip('HR', v.hr, (r) => `${r.value}`),
    vitalChip('RR', v.rr, (r) => `${r.value}`),
    vitalChip('SpO2', v.spo2, (r) => `${r.value}%`),
    v.oxygen !== 'unknown'
      ? { label: v.oxygen === 'air' ? 'Room air' : 'On oxygen', source: v.oxygenSpan?.text }
      : null,
    vitalChip('Temp', v.tempC, (r) => `${r.value} °C`),
    vitalChip('Glucose', v.glucoseMgdl, (r) =>
      r.convertedFrom ? r.convertedFrom : `${r.value} mg/dL`,
    ),
    vitalChip('Ketones', v.ketonesMmol, (r) => `${r.value} mmol/L`),
    vitalChip('GCS', v.gcs, (r) => `${r.value}`),
    vitalChip('CRT', v.crtSeconds, (r) => `${r.value} s`),
  ];
  return chips.filter((c): c is Chip => c !== null);
}

function phiSummary(findings: PhiFinding[]): string {
  const counts = new Map<PhiType, number>();
  for (const f of findings) counts.set(f.type, (counts.get(f.type) ?? 0) + 1);
  return [...counts.entries()]
    .map(
      ([t, n]) => `${n} ${PHI_LABELS[t]}${n > 1 ? (PHI_LABELS[t].endsWith('s') ? 'es' : 's') : ''}`,
    )
    .join(', ');
}

function CountLabel({ severity, n }: { severity: 'critical' | 'urgent'; n: number }) {
  const Icon = severity === 'critical' ? OctagonAlert : TriangleAlert;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 font-semibold',
        severity === 'critical' ? 'text-critical' : 'text-urgent',
      )}
    >
      <Icon aria-hidden className="size-4" strokeWidth={2.25} />
      {n} {severity}
    </span>
  );
}

function Chips({ findings }: { findings: SafetyFindings }) {
  const chips = detectedChips(findings);
  if (chips.length === 0) return null;
  return (
    <div>
      <p className="text-ink-3 mb-1.5 text-[13.5px]">Read from the text</p>
      <ul className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <li key={c.label}>
            <Tip
              content={
                <>
                  Parsed from “{c.source}”{c.note ? `. ${c.note}` : ''}
                </>
              }
            >
              <span
                tabIndex={0}
                className="border-rule bg-sheet text-ink inline-block rounded-md border px-2 py-0.5 text-[13.5px]"
              >
                {c.label}
              </span>
            </Tip>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CasePanel(props: {
  scenario: string;
  onScenarioChange: (s: string) => void;
  view: 'edit' | 'review';
  onEdit: () => void;
  preview: SafetyFindings | null;
  phi: PhiFinding[];
  onRedact: () => void;
  onAnalyse: () => void;
  onClear: () => void;
  loading: boolean;
  useRecorded: boolean;
  onUseRecordedChange: (v: boolean) => void;
  recordedLocked: boolean;
  onLoadSample: (id: string) => void;
  analyzedText: string | null;
  marks: Mark[];
  active: Span[];
  reviewFindings: SafetyFindings | null;
}) {
  const { preview, scenario } = props;
  const length = scenario.trim().length;
  const tooShort = length < 20;
  const critical = preview?.ruleFlags.filter((f) => f.severity === 'critical').length ?? 0;
  const urgent = (preview?.ruleFlags.length ?? 0) - critical;

  return (
    <section aria-labelledby="case-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="case-heading" className="text-[18px] font-bold">
          Case
        </h2>
        {props.view === 'edit' ? (
          <label className="text-ink-2 flex items-center gap-2 text-[14px]">
            <span className="sr-only sm:not-sr-only">Sample</span>
            <select
              className="border-rule-strong bg-sheet text-ink max-w-[16rem] rounded-md border px-2 py-1.5 text-[14px]"
              value=""
              onChange={(e) => e.target.value && props.onLoadSample(e.target.value)}
            >
              <option value="">Load a sample case</option>
              {DEV_CASES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.tags.find((t) => /\d/.test(t)) ?? c.tags[0]})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <button
            type="button"
            onClick={props.onEdit}
            className="no-print border-rule-strong bg-sheet text-ink hover:border-pen hover:text-pen inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[14px] font-semibold"
          >
            <PencilLine aria-hidden className="size-4" />
            Edit case
          </button>
        )}
      </div>

      {props.view === 'edit' ? (
        <>
          <div>
            <label htmlFor="scenario" className="sr-only">
              De-identified case description
            </label>
            <textarea
              id="scenario"
              value={scenario}
              maxLength={SCENARIO_MAX}
              onChange={(e) => props.onScenarioChange(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !tooShort && !props.loading) {
                  e.preventDefault();
                  props.onAnalyse();
                }
              }}
              rows={9}
              placeholder="e.g. 58M, central chest pressure for 2 hours radiating to left arm, sweaty. T2DM on metformin. BP 162/94, HR 108, RR 20, SpO2 95% RA, T 36.8."
              className="border-rule-strong bg-sheet text-ink placeholder:text-ink-3 focus:border-pen focus-visible:outline-pen block min-h-48 w-full resize-y rounded-lg border px-3.5 py-3 text-[16px] leading-relaxed focus:outline-none focus-visible:outline-2"
            />
            <div className="text-ink-3 mt-1.5 flex justify-between text-[13px]">
              <span>Fictional, de-identified cases only. English shorthand works.</span>
              <span aria-live="polite">
                {length} / {SCENARIO_MAX}
              </span>
            </div>
          </div>

          {props.phi.length > 0 ? (
            <div className="border-urgent-line bg-urgent-wash text-urgent flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[14px]">
              <span className="flex items-center gap-2">
                <ShieldAlert aria-hidden className="size-4 shrink-0" />
                Possible identifiers: {phiSummary(props.phi)}.
              </span>
              <button
                type="button"
                onClick={props.onRedact}
                className="border-urgent rounded-md border px-2.5 py-1 text-[13.5px] font-semibold hover:bg-white"
              >
                Remove identifiers
              </button>
            </div>
          ) : null}

          {preview?.languageWarning ? (
            <p className="text-urgent text-[14px]">{preview.languageWarning}</p>
          ) : null}

          {preview && !tooShort ? (
            <div className="space-y-2.5">
              <Chips findings={preview} />
              <p
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px]"
                aria-live="polite"
              >
                {critical + urgent === 0 ? (
                  <span className="text-ink-2">No rule-based warning signs so far.</span>
                ) : (
                  <>
                    <span className="text-ink-2">Rule checks so far:</span>
                    {critical > 0 ? <CountLabel severity="critical" n={critical} /> : null}
                    {urgent > 0 ? <CountLabel severity="urgent" n={urgent} /> : null}
                  </>
                )}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={props.onAnalyse}
              disabled={tooShort || props.loading}
              className="bg-pen hover:bg-pen-strong inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[15.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {props.loading ? (
                <LoaderCircle
                  aria-hidden
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
              ) : null}
              {props.loading ? 'Analysing…' : 'Analyse case'}
            </button>
            <span className="text-ink-3 hidden text-[13px] sm:inline">Ctrl + Enter</span>
            <button
              type="button"
              onClick={props.onClear}
              disabled={scenario.length === 0 || props.loading}
              className="text-ink-2 hover:text-ink inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-[14.5px] font-semibold disabled:opacity-40"
            >
              <Eraser aria-hidden className="size-4" />
              Clear
            </button>
          </div>
          <label
            className={cx(
              'text-ink-2 flex items-start gap-2 text-[14px]',
              props.recordedLocked && 'opacity-80',
            )}
          >
            <input
              type="checkbox"
              className="accent-pen mt-1 size-4"
              checked={props.useRecorded}
              disabled={props.recordedLocked}
              onChange={(e) => props.onUseRecordedChange(e.target.checked)}
            />
            <span>
              Use recorded AI outputs instead of a live model
              <span className="text-ink-3 block text-[13px]">
                {props.recordedLocked
                  ? 'No live model is configured on this server. Rule checks always run live.'
                  : 'Available for the sample cases. Rule checks always run live.'}
              </span>
            </span>
          </label>
        </>
      ) : (
        <div className="space-y-4">
          <div className="border-rule bg-sheet rounded-lg border px-4 py-3.5">
            {props.analyzedText ? (
              <AnnotatedText text={props.analyzedText} marks={props.marks} active={props.active} />
            ) : null}
            <p className="border-rule text-ink-3 mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-2.5 text-[13px]">
              <span>
                <span className="evidence-critical">underlined</span> text triggered a rule
              </span>
              <span>
                <span className="evidence-active">highlighted</span> text is the selected quote
              </span>
            </p>
          </div>
          {props.reviewFindings ? <Chips findings={props.reviewFindings} /> : null}
        </div>
      )}
    </section>
  );
}
