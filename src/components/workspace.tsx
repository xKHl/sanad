'use client';

import { LoaderCircle } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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

const FEATURED = ['C01', 'C09', 'C16'];

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
        <header className="border-rule bg-sheet border-b">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
            <div className="flex items-baseline gap-3">
              <p className="text-ink text-[22px] leading-none font-bold tracking-tight">
                Sanad{' '}
                <span lang="ar" className="font-arabic text-pen text-[20px] font-semibold">
                  سند
                </span>
              </p>
              <p className="text-ink-2 hidden text-[14.5px] sm:block">
                Clinical decision support for outpatient clinics
              </p>
            </div>
            <p className="text-ink-2 text-[13.5px]">
              {status.mode === 'demo' ? (
                <>Recorded AI outputs. Rule checks run live.</>
              ) : (
                <>
                  {status.mode === 'local' ? 'Local model' : 'Live model'}:{' '}
                  <span className="text-ink font-semibold">
                    {result?.aiSource === 'live' && result.model ? result.model : status.model}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="border-rule bg-paper border-t">
            <p className="text-ink-2 mx-auto max-w-[1440px] px-4 py-1.5 text-[13.5px] sm:px-6">
              Prototype for decision support, not a diagnostic device. Use fictional cases only.
              Every output needs clinician review.
            </p>
          </div>
        </header>

        <main className="mx-auto grid w-full max-w-[1440px] flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12 lg:gap-8">
          <div className="no-print lg:col-span-5">
            <div className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:pr-1">
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
                  aria-labelledby="news2-heading"
                  className="border-rule bg-sheet rounded-lg border px-4 py-4"
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
                      <section aria-labelledby="summary-heading">
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
                      <section aria-labelledby="missing-heading">
                        <SectionHeading id="missing-heading" aside="What to ask, examine or check">
                          Missing information
                        </SectionHeading>
                        <MissingInfoView items={result.merged.missingInformation} />
                      </section>
                    )}

                    {result.ai && result.ai.inputQuality.isClinicalScenario ? (
                      <section aria-labelledby="steps-heading">
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

        <footer className="border-rule border-t">
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
  return (
    <section
      aria-labelledby="empty-heading"
      className="border-rule bg-sheet rounded-lg border px-5 py-6"
    >
      <h2 id="empty-heading" className="text-ink text-[20px] font-bold">
        Write or paste a short case, then analyse it.
      </h2>
      <p className="text-ink-2 mt-2 max-w-[62ch]">
        Sanad returns red-flag warnings, a NEWS2 score, a structured case summary, the important
        information still missing and a checklist of next steps. {rulesCount} deterministic safety
        rules run first and cannot be overridden by the AI, and every AI statement links back to the
        words in your case.
      </p>
      <p className="text-ink-2 mt-5 text-[14px] font-semibold">Try a sample case</p>
      <ul className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {featured.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onLoad(c.id)}
              className={cx(
                'border-rule-strong hover:border-pen hover:text-pen w-full rounded-lg border px-3.5 py-2 text-left text-[14.5px] sm:w-auto',
              )}
            >
              <span className="font-semibold">{c.title}</span>
              <span className="text-ink-3"> ({c.tags.find((t) => /\d/.test(t))})</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
