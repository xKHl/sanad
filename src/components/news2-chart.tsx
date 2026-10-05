'use client';

import type { News2Parameter, News2Result } from '@/lib/safety/types';
import { cx } from './ui';

/**
 * NEWS2 observation strip, laid out like the RCP chart: each parameter is a row of score
 * bands (3 2 1 0 1 2 3) and the patient's value sits in its band.
 */

type Band = { slot: number; score: number; label: string; test: (v: number) => boolean };

// Slots 0..6 = score columns 3,2,1,0,1,2,3 (low side to high side).
const BANDS: Record<'rr' | 'spo2' | 'sbp' | 'pulse' | 'temp', Band[]> = {
  rr: [
    { slot: 0, score: 3, label: '≤8', test: (v) => v <= 8 },
    { slot: 2, score: 1, label: '9–11', test: (v) => v >= 9 && v <= 11 },
    { slot: 3, score: 0, label: '12–20', test: (v) => v >= 12 && v <= 20 },
    { slot: 5, score: 2, label: '21–24', test: (v) => v >= 21 && v <= 24 },
    { slot: 6, score: 3, label: '≥25', test: (v) => v >= 25 },
  ],
  spo2: [
    { slot: 0, score: 3, label: '≤91', test: (v) => v <= 91 },
    { slot: 1, score: 2, label: '92–93', test: (v) => v >= 92 && v <= 93 },
    { slot: 2, score: 1, label: '94–95', test: (v) => v >= 94 && v <= 95 },
    { slot: 3, score: 0, label: '≥96', test: (v) => v >= 96 },
  ],
  sbp: [
    { slot: 0, score: 3, label: '≤90', test: (v) => v <= 90 },
    { slot: 1, score: 2, label: '91–100', test: (v) => v >= 91 && v <= 100 },
    { slot: 2, score: 1, label: '101–110', test: (v) => v >= 101 && v <= 110 },
    { slot: 3, score: 0, label: '111–219', test: (v) => v >= 111 && v <= 219 },
    { slot: 6, score: 3, label: '≥220', test: (v) => v >= 220 },
  ],
  pulse: [
    { slot: 0, score: 3, label: '≤40', test: (v) => v <= 40 },
    { slot: 2, score: 1, label: '41–50', test: (v) => v >= 41 && v <= 50 },
    { slot: 3, score: 0, label: '51–90', test: (v) => v >= 51 && v <= 90 },
    { slot: 4, score: 1, label: '91–110', test: (v) => v >= 91 && v <= 110 },
    { slot: 5, score: 2, label: '111–130', test: (v) => v >= 111 && v <= 130 },
    { slot: 6, score: 3, label: '≥131', test: (v) => v >= 131 },
  ],
  temp: [
    { slot: 0, score: 3, label: '≤35.0', test: (v) => v <= 35.0 },
    { slot: 2, score: 1, label: '35.1–36.0', test: (v) => v > 35.0 && v <= 36.0 },
    { slot: 3, score: 0, label: '36.1–38.0', test: (v) => v > 36.0 && v <= 38.0 },
    { slot: 4, score: 1, label: '38.1–39.0', test: (v) => v > 38.0 && v <= 39.0 },
    { slot: 5, score: 2, label: '≥39.1', test: (v) => v > 39.0 },
  ],
};

const CATEGORICAL: Record<'oxygen' | 'consciousness', Band[]> = {
  oxygen: [
    { slot: 3, score: 0, label: 'Air', test: () => false },
    { slot: 5, score: 2, label: 'Oxygen', test: () => false },
  ],
  consciousness: [
    { slot: 3, score: 0, label: 'Alert', test: () => false },
    { slot: 6, score: 3, label: 'CVPU', test: () => false },
  ],
};

const COLUMN_SCORES = [3, 2, 1, 0, 1, 2, 3];

const FILL: Record<number, string> = {
  3: 'bg-news-3',
  2: 'bg-news-2',
  1: 'bg-news-1',
  0: 'bg-news-0',
};
const TINT: Record<number, string> = {
  3: 'bg-news-3/25',
  2: 'bg-news-2/25',
  1: 'bg-news-1/35',
  0: 'bg-sheet',
};

function numeric(value: string | null): number | null {
  if (!value) return null;
  const m = /-?\d+(?:\.\d+)?/.exec(value);
  return m ? Number(m[0]) : null;
}

function activeSlot(p: News2Parameter): number | null {
  if (p.points === null) return null;
  if (p.key === 'oxygen') return p.points === 2 ? 5 : 3;
  if (p.key === 'consciousness') return p.points === 3 ? 6 : 3;
  const bands = BANDS[p.key];
  const v = numeric(p.value);
  if (v === null) return null;
  return bands.find((b) => b.test(v))?.slot ?? null;
}

function bandsFor(p: News2Parameter): Band[] {
  return p.key === 'oxygen' || p.key === 'consciousness' ? CATEGORICAL[p.key] : BANDS[p.key];
}

function Row({ p }: { p: News2Parameter }) {
  const slot = activeSlot(p);
  const bands = bandsFor(p);
  const shortLabel = p.label.replace(' (scale 1)', '');
  return (
    <div role="row" className="contents">
      <div
        role="rowheader"
        className="text-ink flex items-center pr-2 text-[13.5px] leading-tight font-semibold"
      >
        {shortLabel}
      </div>
      {p.points === null ? (
        <div
          role="cell"
          className="border-rule-strong text-ink-3 col-span-7 flex items-center rounded border border-dashed px-2 text-[13px]"
        >
          Not recorded
        </div>
      ) : (
        COLUMN_SCORES.map((_, i) => {
          const band = bands.find((b) => b.slot === i);
          const active = slot === i;
          if (!band) return <div key={i} role="cell" aria-hidden className="rounded" />;
          return (
            <div
              key={i}
              role="cell"
              aria-label={
                active
                  ? `${shortLabel} ${p.value}, scores ${band.score}${p.assumed ? ', assumed' : ''}`
                  : undefined
              }
              className={cx(
                'relative flex min-h-10 flex-col items-center justify-center rounded px-0.5 text-center leading-tight',
                active
                  ? cx(FILL[band.score], 'outline-ink outline-2')
                  : cx(TINT[band.score], 'border-rule/70 border'),
              )}
            >
              {active ? (
                <>
                  <span className="text-ink text-[12px] font-bold sm:text-[13.5px]">
                    {p.key === 'oxygen' || p.key === 'consciousness'
                      ? band.label
                      : (numeric(p.value) ?? p.value)}
                  </span>
                  {p.assumed ? <span className="text-ink-2 text-[10.5px]">assumed</span> : null}
                </>
              ) : (
                <span className="text-ink-3 hidden text-[11px] sm:block">{band.label}</span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export function News2Chart({ news2 }: { news2: News2Result }) {
  if (news2.status === 'not_applicable') {
    return <p className="text-ink-2">{news2.reason}</p>;
  }
  const scored = news2.status === 'complete' || news2.status === 'partial';
  return (
    <div>
      <div
        role="table"
        aria-label="NEWS2 observation chart"
        className="grid grid-cols-[minmax(84px,1.3fr)_repeat(7,minmax(0,1fr))] gap-1"
      >
        <div role="row" className="contents">
          <div role="columnheader" className="text-ink-3 text-[12px]">
            Score
          </div>
          {COLUMN_SCORES.map((s, i) => (
            <div
              key={i}
              role="columnheader"
              className="text-ink-3 text-center text-[12px] font-semibold"
            >
              {s}
            </div>
          ))}
        </div>
        {news2.parameters.map((p) => (
          <Row key={p.key} p={p} />
        ))}
      </div>
      <div className="border-rule mt-3 border-t pt-3">
        {scored ? (
          <p>
            <span className="text-[17px] font-bold">
              Score {news2.status === 'partial' ? 'at least ' : ''}
              {news2.total},{' '}
              {news2.band === 'low-medium' ? 'low-medium (one parameter scores 3)' : news2.band}.
            </span>{' '}
            <span className="text-ink-2">{news2.response}</span>
          </p>
        ) : (
          <p className="text-ink-2">{news2.reason} No total is shown.</p>
        )}
        {news2.notes.length > 0 ? (
          <ul className="text-ink-3 mt-1.5 space-y-0.5 text-[13.5px]">
            {news2.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
