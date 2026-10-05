'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { Severity, Span } from '@/lib/safety/types';

export type Mark = { span: Span; severity: Severity };

type Piece = { start: number; end: number; severity: Severity | null; active: boolean };

function pieces(length: number, marks: Mark[], active: Span[]): Piece[] {
  const cuts = new Set<number>([0, length]);
  for (const m of marks) cuts.add(m.span.start).add(m.span.end);
  for (const a of active) cuts.add(a.start).add(a.end);
  const points = [...cuts].filter((p) => p >= 0 && p <= length).sort((a, b) => a - b);
  const out: Piece[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i] ?? 0;
    const end = points[i + 1] ?? 0;
    if (end <= start) continue;
    const covering = marks.filter((m) => m.span.start <= start && m.span.end >= end);
    const severity = covering.some((m) => m.severity === 'critical')
      ? 'critical'
      : covering.length > 0
        ? 'urgent'
        : null;
    const isActive = active.some((a) => a.start <= start && a.end >= end);
    out.push({ start, end, severity, active: isActive });
  }
  return out;
}

/** The analysed (redacted) case text with rule evidence underlined and the selected quote highlighted. */
export function AnnotatedText({
  text,
  marks,
  active,
}: {
  text: string;
  marks: Mark[];
  active: Span[];
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const parts = useMemo(() => pieces(text.length, marks, active), [text, marks, active]);

  useEffect(() => {
    if (active.length === 0 || !ref.current) return;
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    const first = ref.current.querySelector('[data-active="true"]');
    first?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active]);

  return (
    <p ref={ref} className="text-ink text-[16px] leading-[1.75] whitespace-pre-wrap">
      {parts.map((p) => {
        const content = text.slice(p.start, p.end);
        if (!p.severity && !p.active) return <span key={p.start}>{content}</span>;
        return (
          <mark
            key={p.start}
            data-active={p.active ? 'true' : undefined}
            className={[
              p.severity === 'critical'
                ? 'evidence-critical'
                : p.severity === 'urgent'
                  ? 'evidence-urgent'
                  : '',
              p.active ? 'evidence-active' : '',
            ].join(' ')}
          >
            {content}
          </mark>
        );
      })}
    </p>
  );
}
