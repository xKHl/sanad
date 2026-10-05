import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { LabRunner } from '@/components/lab-runner';
import { resolveModel } from '@/lib/ai/model';
import { PROMPT_VERSION } from '@/lib/ai/prompt';
import { RULES_VERSION } from '@/lib/safety';

export const metadata: Metadata = { title: 'Sanad lab', robots: { index: false } };

export default async function LabPage() {
  await connection();
  if (process.env.SANAD_LAB !== 'true') notFound();
  const resolved = resolveModel();
  return (
    <LabRunner
      model={resolved.mode === 'demo' ? null : resolved.label}
      mode={resolved.mode}
      promptVersion={PROMPT_VERSION}
      rulesVersion={RULES_VERSION}
    />
  );
}
