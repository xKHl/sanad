'use client';

import { ArrowUpRight, CircleCheck, LoaderCircle, ShieldAlert } from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DEV_CASES } from '@/data/cases/dev';
import type { AnalysisResult } from '@/lib/pipeline/types';
import { runSafetyChecks } from '@/lib/safety';
import { detectIdentifiers, redactIdentifiers } from '@/lib/safety/phi';
import type { SafetyFindings, Span } from '@/lib/safety/types';
import type { Mark } from './annotated-text';
import { CasePanel } from './case-panel';
import { News2Chart } from './news2-chart';
import {
  AiNotice,
  CaseSummaryView,
  MissingInfoView,
  NextStepsView,
  RedFlagList,
  ResultActions,
  SafetyBanner,
  TransparencyView,
} from './results';
import { cx, SectionHeading, Skeleton, TipProvider } from './ui';

export type ServerStatus = {
  mode: 'cloud' | 'local' | 'demo';
  model: string | null;
  configError: string | null;
  rulesCount: number;
  recordings: number;
};

const FEATURED = ['C01', 'C02', 'C03', 'C16', 'C13', 'C05'];

export function Workspace({ status }: { status: ServerStatus }) {
  const [scenario, setScenario] = useState('');
  const [view, setView] = useState<'edit' | 'review'>('edit');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<Span[]>([]);
  const [useRecorded, setUseRecorded] = useState(status.mode === 'demo');
  const [announcement, setAnnouncement] = useState('');
  const resultsHeading = useRef<HTMLHeadingElement>(null);

  const deferred = useDeferredValue(scenario);
  const preview: SafetyFindings | null = useMemo(
    () => (deferred.trim().length >= 20 ? runSafetyChecks(deferred) : null),
    [deferred],
  );
  const phi = useMemo(() => detectIdentifiers(deferred), [deferred]);

  // Clinical findings shown while the request is in flight: the live preview of the same text.
  const [pendingFindings, setPendingFindings] = useState<SafetyFindings | null>(null);

  useEffect(() => {
    if (!loading) return;
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    return () => window.clearInterval(id);
  }, [loading]);

  useEffect(() => {
    if (active.length === 0) return;
    const id = window.setTimeout(() => setActive([]), 4000);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setActive([]);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [active]);

  const analyse = useCallback(async () => {
    const text = scenario.trim();
    if (text.length < 20 || loading) return;
    setLoading(true);
    setElapsed(0);
    setRequestError(null);
    setResult(null);
    setChecked(new Set());
    setActive([]);
    setPendingFindings(runSafetyChecks(redactIdentifiers(text).text));
    setView('review');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scenario: text, forceDemo: useRecorded }),
      });
      const body = (await res.json().catch(() => null)) as
        (AnalysisResult & { message?: string }) | null;
      if (!res.ok || !body) {
        setRequestError(body?.message ?? `The request failed (HTTP ${res.status}).`);
        setAnnouncement('Analysis failed.');
        return;
      }
      setResult(body);
      const crit = body.merged.redFlags.filter((f) => f.severity === 'critical').length;
      setAnnouncement(
        `Analysis complete: ${crit} critical and ${body.merged.redFlags.length - crit} urgent red flags.`,
      );
      window.setTimeout(() => resultsHeading.current?.focus(), 50);
    } catch {
      setRequestError('Could not reach the server. Check the connection and try again.');
      setAnnouncement('Analysis failed.');
    } finally {
      setLoading(false);
    }
  }, [scenario, loading, useRecorded]);

  const loadSample = (id: string) => {
    const c = DEV_CASES.find((x) => x.id === id);
    if (!c) return;
    setScenario(c.scenario);
    setView('edit');
    setResult(null);
    setRequestError(null);
  };

  const shownFindings = result?.safety ?? pendingFindings;
  const analyzedText =
    result?.analyzedText ??
    (loading && pendingFindings ? redactIdentifiers(scenario.trim()).text : null);
  const marks: Mark[] = useMemo(
    () =>
      (shownFindings?.ruleFlags ?? []).flatMap((f) =>
        f.evidence.map((span) => ({ span, severity: f.severity })),
      ),
    [shownFindings],
  );
  const flagIds = useMemo(() => new Set(result?.merged.redFlags.map((f) => f.id) ?? []), [result]);

  const toggle = (i: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <TipProvider>
      <div className="flex min-h-dvh flex-col">
        <header className="border-rule border-b">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3.5 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="bg-band flex size-10 shrink-0 items-center justify-center rounded-xl">
                <SanadMark className="size-6 text-white" />
              </span>
              <div className="leading-none">
                <p className="flex items-baseline gap-2">
                  <span className="font-display text-ink text-[27px] leading-none tracking-tight">
                    Sanad
                  </span>
                  <span lang="ar" className="font-arabic text-pen text-[19px] font-semibold">
                    سند
                  </span>
                </p>
                <p className="text-pen mt-1 text-[11.5px] font-semibold tracking-[0.14em] uppercase">
                  Clinical decision support
                </p>
              </div>
            </div>
            <StatusPill status={status} result={result} />
          </div>
        </header>
        <div className="bg-band text-band-ink print:hidden">
          <p className="mx-auto flex max-w-[1440px] items-start gap-2.5 px-4 py-2.5 text-[13.5px] sm:px-6">
            <ShieldAlert aria-hidden className="text-pen-light mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-semibold text-white">Safety signal:</span> prototype for
              decision support, not a diagnostic device. Fictional cases only; every output needs
              clinician review.
            </span>
          </p>
        </div>

        <main className="mx-auto grid w-full max-w-[1440px] flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12 lg:gap-8">
          <div className="no-print lg:col-span-5">
            <div className="lg:sticky lg:top-6 lg:-mx-3 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:px-3 lg:pb-12">
              <CasePanel
                scenario={scenario}
                onScenarioChange={setScenario}
                view={view}
                onEdit={() => setView('edit')}
                preview={preview}
                phi={phi}
                onRedact={() => setScenario(redactIdentifiers(scenario).text)}
                onAnalyse={analyse}
                onClear={() => {
                  setScenario('');
                  setResult(null);
                  setRequestError(null);
                }}
                loading={loading}
                useRecorded={useRecorded || status.mode === 'demo'}
                onUseRecordedChange={setUseRecorded}
                recordedLocked={status.mode === 'demo'}
                onLoadSample={loadSample}
                analyzedText={analyzedText}
                marks={marks}
                active={active}
                reviewFindings={shownFindings}
              />
            </div>
          </div>

          <div className="print-full min-w-0 lg:col-span-7">
            <h2 ref={resultsHeading} tabIndex={-1} className="sr-only">
              Results
            </h2>
            <p aria-live="polite" className="sr-only">
              {announcement}
            </p>

            {!shownFindings && !requestError ? (
              <EmptyState onLoad={(id) => loadSample(id)} rulesCount={status.rulesCount} />
            ) : null}

            {requestError ? (
              <div className="border-critical-line bg-critical-wash text-critical rounded-lg border px-4 py-3">
                <p className="font-semibold">The case was not analysed.</p>
                <p>{requestError}</p>
              </div>
            ) : null}

            {shownFindings ? (
              <div className="space-y-8">
                {result ? <ResultOverview r={result} checked={checked.size} /> : null}
                <section aria-labelledby="flags-heading" className="space-y-3">
                  <SectionHeading
                    id="flags-heading"
                    aside={
                      result
                        ? `${shownFindings.rulesEvaluated} rules checked in ${shownFindings.timingMs} ms`
                        : 'Rule checks'
                    }
                  >
                    Red flags
                  </SectionHeading>
                  {result ? (
                    <>
                      <SafetyBanner
                        status={result.merged.safetyStatus}
                        flags={result.merged.redFlags}
                      />
                      <RedFlagList flags={result.merged.redFlags} onEvidence={setActive} />
                    </>
                  ) : (
                    <RedFlagList
                      flags={shownFindings.ruleFlags.map((f) => ({
                        source: 'rule',
                        id: f.ruleId,
                        title: f.title,
                        severity: f.severity,
                        reasoning: f.reasoning,
                        recommendedAction: f.recommendedAction,
                        basis: f.basis,
                        evidence: f.evidence.map((span) => ({
                          quote: span.text,
                          span,
                          verified: true,
                        })),
                      }))}
                      onEvidence={setActive}
                    />
                  )}
                </section>

                <section
                  id="news2"
                  aria-labelledby="news2-heading"
                  className="border-rule bg-sheet rounded-2xl border px-4 py-5 sm:px-6"
                >
                  <SectionHeading id="news2-heading" aside="National Early Warning Score 2, adults">
                    NEWS2
                  </SectionHeading>
                  <News2Chart news2={shownFindings.news2} />
                </section>

                {loading ? <AiLoading elapsed={elapsed} /> : null}

                {result ? (
                  <>
                    <AiNotice r={result} />
                    {result.ai && result.ai.inputQuality.isClinicalScenario ? (
                      <section
                        aria-labelledby="summary-heading"
                        className="border-rule bg-sheet rounded-2xl border px-4 py-5 sm:px-6"
                      >
                        <SectionHeading
                          id="summary-heading"
                          aside="AI organised; every fact links to its quote"
                        >
                          Case summary
                        </SectionHeading>
                        <CaseSummaryView
                          ai={result.ai}
                          grounding={result.grounding}
                          completeness={result.completeness}
                          onEvidence={setActive}
                        />
                      </section>
                    ) : null}

                    {result.ai &&
                    !result.ai.inputQuality.isClinicalScenario &&
                    result.merged.redFlags.length === 0 ? null : (
                      <section
                        aria-labelledby="missing-heading"
                        className="border-rule bg-sheet rounded-2xl border px-4 py-5 sm:px-6"
                      >
                        <SectionHeading id="missing-heading" aside="What to ask, examine or check">
                          Missing information
                        </SectionHeading>
                        <MissingInfoView items={result.merged.missingInformation} />
                      </section>
                    )}

                    {result.ai && result.ai.inputQuality.isClinicalScenario ? (
                      <section
                        aria-labelledby="steps-heading"
                        className="border-rule bg-sheet rounded-2xl border px-4 py-5 sm:px-6"
                      >
                        <SectionHeading
                          id="steps-heading"
                          aside={`${checked.size} of ${result.ai.nextSteps.length} reviewed`}
                        >
                          Next steps for clinician review
                        </SectionHeading>
                        <NextStepsView
                          steps={result.ai.nextSteps}
                          checked={checked}
                          onToggle={toggle}
                          flagIds={flagIds}
                        />
                      </section>
                    ) : null}

                    <ResultActions r={result} checked={checked} />
                    <TransparencyView r={result} />
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </main>

        <footer className="border-rule bg-paper-2/60 border-t">
          <p className="text-ink-3 mx-auto max-w-[1440px] px-4 py-4 text-[13px] sm:px-6">
            Sanad is a prototype built for a technical selection challenge. Rule thresholds are
            informed by published guidance (NICE, RCP, BTS, Resuscitation Council UK, ADA, JBDS) and
            are not clinically validated.
          </p>
        </footer>
      </div>
    </TipProvider>
  );
}

function AiLoading({ elapsed }: { elapsed: number }) {
  return (
    <section aria-busy="true" aria-label="AI analysis in progress" className="space-y-3">
      <p className="text-ink-2 flex items-center gap-2">
        <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        The rule checks are done. The AI is organising the case summary, missing information and
        next steps
        {elapsed > 1 ? ` (${elapsed} s)` : ''}.
      </p>
      <Skeleton className="h-5 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-16 w-full" />
    </section>
  );
}

function EmptyState({ onLoad, rulesCount }: { onLoad: (id: string) => void; rulesCount: number }) {
  const featured = DEV_CASES.filter((c) => FEATURED.includes(c.id));
  const promises = [
    `${rulesCount} safety rules run first`,
    'Quotes checked word for word',
    'Identifiers removed',
  ];
  const steps = [
    {
      title: 'Check',
      text: 'Safety rules and NEWS2 run instantly, even while you type. The AI cannot remove them.',
    },
    {
      title: 'Organise',
      text: 'The AI writes a structured summary, the questions still worth asking and next steps.',
    },
    {
      title: 'Trace',
      text: 'Every AI statement must quote your words exactly. Click a quote to see it in the case.',
    },
  ];
  return (
    <section aria-labelledby="empty-heading" className="pt-2 sm:pt-6">
      <h2
        id="empty-heading"
        className="font-display text-ink text-[44px] leading-[0.98] tracking-[-0.02em] sm:text-[60px]"
      >
        Read the case.
        <span className="text-pen block">Trace every claim.</span>
      </h2>
      <p className="text-ink-2 mt-5 max-w-[56ch] text-[17px] leading-relaxed">
        Write a short, fictional case. Sanad returns red-flag warnings, a NEWS2 score, a case
        summary, the information still missing and a checklist of next steps.
      </p>
      <ul className="text-ink-2 mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[14.5px]">
        {promises.map((p) => (
          <li key={p} className="flex items-center gap-2">
            <CircleCheck aria-hidden className="text-pen size-4" />
            {p}
          </li>
        ))}
      </ul>

      <ol className="mt-9 grid gap-3 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className="border-rule bg-sheet/80 rounded-2xl border px-5 py-4">
            <span aria-hidden className="font-display text-pen text-[17px]">
              0{i + 1}
            </span>
            <p className="font-display text-ink mt-2 text-[26px] leading-none">{step.title}</p>
            <p className="text-ink-2 mt-2 text-[14px] leading-snug">{step.text}</p>
          </li>
        ))}
      </ol>

      <h3 className="text-ink mt-9 text-[15px] font-semibold">Try a sample case</h3>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {featured.map((c) => {
          const level = c.tags.includes('critical')
            ? 'critical'
            : c.tags.includes('urgent')
              ? 'urgent'
              : 'routine';
          return (
            <li key={c.id} className="h-full">
              <button
                type="button"
                onClick={() => onLoad(c.id)}
                className="border-rule bg-sheet hover:border-pen group flex h-full w-full items-center gap-3 rounded-xl border px-4 py-3 text-left"
              >
                <span
                  aria-hidden
                  className={cx(
                    'size-2.5 shrink-0 rounded-full',
                    level === 'critical'
                      ? 'bg-critical'
                      : level === 'urgent'
                        ? 'bg-urgent'
                        : 'bg-ok',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-ink group-hover:text-pen block font-semibold">
                    {c.title}
                  </span>
                  <span className="text-ink-3 block text-[13px]">
                    {c.tags.find((t) => /\d|infant/.test(t))},{' '}
                    {level === 'routine' ? 'no expected red flags' : `expected ${level} flags`}
                  </span>
                </span>
                <ArrowUpRight
                  aria-hidden
                  className="text-ink-3 group-hover:text-pen size-4 shrink-0"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The mark: three linked sources ending in a claim, the "chain" that sanad refers to. */
function SanadMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <path
        d="M7 8 L16 16 L25 24"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="2"
        fill="none"
      />
      <circle cx="7" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="25" cy="24" r="4" className="fill-pen-light" />
    </svg>
  );
}

function StatusPill({ status, result }: { status: ServerStatus; result: AnalysisResult | null }) {
  const live = status.mode !== 'demo';
  const model = result?.aiSource === 'live' && result.model ? result.model : status.model;
  return (
    <p className="border-rule bg-sheet text-ink-2 flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] print:hidden">
      <span
        aria-hidden
        className={cx('size-2 shrink-0 rounded-full', live ? 'bg-ok' : 'bg-idle')}
      />
      {live ? (
        <span>
          {status.mode === 'local' ? 'Local model' : 'Live AI'}:{' '}
          <span className="text-ink font-semibold">{model}</span>
        </span>
      ) : (
        <span>Recorded AI outputs. Rule checks run live.</span>
      )}
    </p>
  );
}

function ResultOverview({ r, checked }: { r: AnalysisResult; checked: number }) {
  const n = r.safety.news2;
  const critical = r.merged.redFlags.filter((f) => f.severity === 'critical').length;
  const urgent = r.merged.redFlags.length - critical;
  const bandClass =
    n.band === 'high'
      ? 'bg-news-3'
      : n.band === 'medium'
        ? 'bg-news-2'
        : n.band === 'low-medium'
          ? 'bg-news-1'
          : 'bg-ok-wash';
  const news2Value =
    n.total !== null && (n.status === 'complete' || n.status === 'partial')
      ? `${n.status === 'partial' ? '≥ ' : ''}${n.total}`
      : n.status === 'not_applicable'
        ? 'n/a'
        : 'too few obs';
  const steps = r.ai?.nextSteps.length ?? 0;
  const items: Array<{ href: string; value: ReactNode; label: string }> = [
    {
      href: '#flags-heading',
      value:
        r.merged.redFlags.length === 0 ? (
          'None'
        ) : (
          <span className="flex items-center gap-1.5">
            {critical ? <span className="text-critical">{critical} critical</span> : null}
            {urgent ? <span className="text-urgent">{urgent} urgent</span> : null}
          </span>
        ),
      label: 'Red flags',
    },
    {
      href: '#news2',
      value: (
        <span className="flex items-center gap-2">
          {n.band ? <span aria-hidden className={cx('size-3 rounded-sm', bandClass)} /> : null}
          {news2Value}
          {n.band ? <span className="text-ink-2 font-normal">{n.band}</span> : null}
        </span>
      ),
      label: 'NEWS2',
    },
    {
      href: '#missing-heading',
      value: String(r.merged.missingInformation.length),
      label: 'Missing items',
    },
    ...(r.ai
      ? [
          {
            href: '#steps-heading',
            value: `${checked} of ${steps}`,
            label: 'Steps reviewed',
          },
        ]
      : []),
    ...(r.grounding
      ? [
          {
            href: '#summary-heading',
            value: `${r.grounding.verified} of ${r.grounding.total}`,
            label: 'Quotes verified',
          },
        ]
      : []),
  ];
  return (
    <nav
      aria-label="Result overview"
      className="border-rule bg-rule grid grid-cols-2 gap-px overflow-hidden rounded-2xl border sm:flex"
    >
      {items.map((item) => (
        <a key={item.label} href={item.href} className="bg-sheet hover:bg-paper flex-1 px-4 py-2.5 [&:last-child:nth-child(odd)]:col-span-2">
          <span className="text-ink block text-[15.5px] font-bold whitespace-nowrap">
            {item.value}
          </span>
          <span className="text-ink-3 block text-[12.5px]">{item.label}</span>
        </a>
      ))}
    </nav>
  );
}
