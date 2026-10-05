'use client';

import { useState } from 'react';
import { z } from 'zod';
import { DEV_CASES } from '@/data/cases/dev';
import { HOLDOUT_CASES } from '@/data/cases/holdout';
import { CaseSchema, type SyntheticCase } from '@/data/cases/schema';
import { renderReport, runFromResult, type CaseRun, type EvalSet } from '@/lib/eval/report';
import type { AnalysisResult } from '@/lib/pipeline/types';

type Row = {
  set: EvalSet;
  c: SyntheticCase;
  status: 'waiting' | 'running' | 'ok' | 'failed';
  note: string;
};

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Browser runner for the evaluation and demo recordings (no terminal needed). */
export function LabRunner(props: {
  model: string | null;
  mode: string;
  promptVersion: string;
  rulesVersion: string;
}) {
  const [key, setKey] = useState('');
  const [holdoutJson, setHoldoutJson] = useState('');
  const [delayMs, setDelayMs] = useState(4000);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    setReport(null);
    setRecordings(null);
    let holdout = HOLDOUT_CASES;
    if (holdoutJson.trim()) {
      const parsed = z.array(CaseSchema).safeParse(
        (() => {
          try {
            return JSON.parse(holdoutJson);
          } catch {
            return null;
          }
        })(),
      );
      if (!parsed.success) {
        setError(
          'The held-out cases are not valid JSON in the expected format (id, title, tags, scenario, expectedFlags, expectedNews2).',
        );
        return;
      }
      holdout = parsed.data;
    }
    const list: Row[] = [
      ...DEV_CASES.map((c) => ({ set: 'dev' as const, c, status: 'waiting' as const, note: '' })),
      ...holdout.map((c) => ({ set: 'holdout' as const, c, status: 'waiting' as const, note: '' })),
    ];
    setRows(list);
    setRunning(true);
    const runs: CaseRun[] = [];
    const recs: Record<string, unknown> = {};
    let modelLabel: string | null = props.model;
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      if (!row) continue;
      setRows((r) => r.map((x, j) => (j === i ? { ...x, status: 'running' } : x)));
      try {
        const res = await fetch('/api/lab', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            row.set === 'dev' ? { key, caseId: row.c.id } : { key, holdoutCase: row.c },
          ),
        });
        const body = (await res.json()) as {
          result?: AnalysisResult;
          hash?: string;
          recording?: unknown;
          message?: string;
        };
        if (!res.ok || !body.result) throw new Error(body.message ?? `HTTP ${res.status}`);
        runs.push(runFromResult(row.set, row.c, body.result));
        modelLabel = body.result.model ?? modelLabel;
        if (row.set === 'dev' && body.recording && body.hash) recs[body.hash] = body.recording;
        const ok = body.result.ai !== null;
        setRows((r) =>
          r.map((x, j) =>
            j === i
              ? {
                  ...x,
                  status: ok ? 'ok' : 'failed',
                  note: ok
                    ? `${body.result?.timings.totalMs} ms`
                    : (body.result?.aiError?.code ?? ''),
                }
              : x,
          ),
        );
        if (res.status === 403) break;
      } catch (e) {
        setRows((r) =>
          r.map((x, j) => (j === i ? { ...x, status: 'failed', note: (e as Error).message } : x)),
        );
        if ((e as Error).message.includes('key')) break;
      }
      if (i < list.length - 1 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
    setRunning(false);
    if (runs.length > 0) {
      setReport(
        renderReport(
          {
            date: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
            mode: props.mode,
            model: modelLabel,
            promptVersion: props.promptVersion,
            rulesVersion: props.rulesVersion,
            runs: 1,
          },
          runs,
          null,
        ),
      );
    }
    if (Object.keys(recs).length > 0) setRecordings(`${JSON.stringify(recs, null, 2)}\n`);
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-[24px] font-bold">Sanad lab</h1>
      <p className="text-ink-2 mt-2 max-w-[70ch]">
        Runs every sample case through the live model, then lets you download the evaluation report
        (docs/EVALUATION.md) and the demo recordings (src/data/recordings.json). Model:{' '}
        <span className="text-ink font-semibold">{props.model ?? 'none configured'}</span>.
      </p>
      {props.mode === 'demo' ? (
        <p className="border-urgent-line bg-urgent-wash text-urgent mt-3 rounded-lg border px-3 py-2">
          No live model is configured. Add a free key (for example GOOGLE_GENERATIVE_AI_API_KEY) in
          the deployment settings first.
        </p>
      ) : null}
      <div className="mt-6 grid gap-4">
        <label className="grid gap-1">
          <span className="font-semibold">Lab key</span>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="border-rule-strong bg-sheet rounded-md border px-3 py-2"
            autoComplete="off"
          />
        </label>
        <label className="grid gap-1">
          <span className="font-semibold">Held-out cases (optional JSON array)</span>
          <textarea
            value={holdoutJson}
            onChange={(e) => setHoldoutJson(e.target.value)}
            rows={5}
            placeholder='[{"id":"H01","title":"…","tags":["…"],"scenario":"…","expectedFlags":["RF-…"],"expectedNews2":null}]'
            className="border-rule-strong bg-sheet rounded-md border px-3 py-2 font-mono text-[13px]"
          />
        </label>
        <label className="grid max-w-xs gap-1">
          <span className="font-semibold">Pause between cases (ms)</span>
          <input
            type="number"
            min={0}
            step={500}
            value={delayMs}
            onChange={(e) => setDelayMs(Number(e.target.value))}
            className="border-rule-strong bg-sheet rounded-md border px-3 py-2"
          />
          <span className="text-ink-3 text-[13px]">
            Free tiers allow only a few requests per minute.
          </span>
        </label>
        <div>
          <button
            type="button"
            disabled={running || key.length < 8 || props.mode === 'demo'}
            onClick={start}
            className="bg-pen hover:bg-pen-strong rounded-lg px-4 py-2.5 font-bold text-white disabled:opacity-45"
          >
            {running ? 'Running…' : 'Run all cases'}
          </button>
        </div>
        {error ? <p className="text-critical">{error}</p> : null}
      </div>

      {rows.length > 0 ? (
        <table className="mt-6 w-full text-left text-[14px]">
          <thead>
            <tr className="border-rule text-ink-3 border-b">
              <th className="py-1.5">Set</th>
              <th>Case</th>
              <th>Status</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.set}-${r.c.id}`} className="border-rule border-b">
                <td className="py-1.5">{r.set}</td>
                <td>
                  {r.c.id} {r.c.title}
                </td>
                <td
                  className={
                    r.status === 'failed'
                      ? 'text-critical'
                      : r.status === 'ok'
                        ? 'text-ok'
                        : 'text-ink-2'
                  }
                >
                  {r.status}
                </td>
                <td className="text-ink-3">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {report || recordings ? (
        <div className="mt-6 flex flex-wrap gap-3">
          {report ? (
            <button
              type="button"
              onClick={() => download('EVALUATION.md', report, 'text/markdown')}
              className="border-rule-strong bg-sheet hover:border-pen hover:text-pen rounded-md border px-3 py-2 font-semibold"
            >
              Download EVALUATION.md
            </button>
          ) : null}
          {recordings ? (
            <button
              type="button"
              onClick={() => download('recordings.json', recordings, 'application/json')}
              className="border-rule-strong bg-sheet hover:border-pen hover:text-pen rounded-md border px-3 py-2 font-semibold"
            >
              Download recordings.json
            </button>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
