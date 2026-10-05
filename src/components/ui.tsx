'use client';

import * as Tooltip from '@radix-ui/react-tooltip';
import { OctagonAlert, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Severity } from '@/lib/safety/types';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function SeverityLabel({ severity, className }: { severity: Severity; className?: string }) {
  const critical = severity === 'critical';
  const Icon = critical ? OctagonAlert : TriangleAlert;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 font-semibold',
        critical ? 'text-critical' : 'text-urgent',
        className,
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />
      {critical ? 'Critical' : 'Urgent'}
    </span>
  );
}

/** Solid outline = deterministic rule; dashed outline = AI suggestion that needs verification. */
export function SourceTag({ source, id }: { source: 'rule' | 'ai'; id?: string }) {
  return source === 'rule' ? (
    <span className="border-ink-2 text-ink-2 inline-flex items-center rounded-full border px-2 py-px text-[12.5px] font-semibold whitespace-nowrap">
      Rule{id ? ` ${id}` : ''}
    </span>
  ) : (
    <span className="border-pen text-pen inline-flex items-center rounded-full border border-dashed px-2 py-px text-[12.5px] font-semibold whitespace-nowrap">
      AI suggestion
    </span>
  );
}

export function Tip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <Tooltip.Root delayDuration={250}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          className="bg-ink z-50 max-w-xs rounded-md px-2.5 py-1.5 text-[13px] leading-snug text-white shadow-lg"
        >
          {content}
          <Tooltip.Arrow className="fill-ink" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export const TipProvider = Tooltip.Provider;

export function SectionHeading({
  id,
  children,
  aside,
}: {
  id?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="text-ink text-[18px] leading-tight font-bold">
        {children}
      </h2>
      {aside ? <div className="text-ink-3 text-[13.5px]">{aside}</div> : null}
    </div>
  );
}

export function Notice({
  tone,
  icon,
  children,
}: {
  tone: 'critical' | 'urgent' | 'ok' | 'info';
  icon?: ReactNode;
  children: ReactNode;
}) {
  const styles = {
    critical: 'border-critical-line bg-critical-wash text-critical',
    urgent: 'border-urgent-line bg-urgent-wash text-urgent',
    ok: 'border-ok/30 bg-ok-wash text-ok',
    info: 'border-rule bg-sheet text-ink-2',
  }[tone];
  return (
    <div className={cx('flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5', styles)}>
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx('bg-rule/60 animate-pulse rounded motion-reduce:animate-none', className)}
    />
  );
}
