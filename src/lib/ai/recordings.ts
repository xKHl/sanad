import { createHash } from 'node:crypto';
import { z } from 'zod';
import recordingsJson from '@/data/recordings.json';
import { normalize } from '@/lib/pipeline/grounding';
import { AiAnalysisSchema, type AiAnalysis } from './schema';

/**
 * Demo mode (SPEC §8.3): real model outputs recorded for the sample cases, keyed by a hash of
 * the normalised scenario. Rule checks always run live; only the AI layer is replayed.
 */

export const RecordingSchema = z.object({
  caseId: z.string().optional(),
  ai: AiAnalysisSchema,
  model: z.string(),
  promptVersion: z.string(),
  recordedAt: z.string(),
});

export type Recording = z.infer<typeof RecordingSchema>;

export const RecordingsFileSchema = z.record(z.string(), RecordingSchema);

export function scenarioHash(scenario: string): string {
  return createHash('sha256').update(normalize(scenario)).digest('hex');
}

let cache: Record<string, Recording> | null = null;

function load(): Record<string, Recording> {
  if (cache) return cache;
  const parsed = RecordingsFileSchema.safeParse(recordingsJson);
  cache = parsed.success ? parsed.data : {};
  return cache;
}

export function findRecording(scenario: string): Recording | null {
  return load()[scenarioHash(scenario)] ?? null;
}

export function recordingCount(): number {
  return Object.keys(load()).length;
}

export function makeRecording(
  caseId: string | undefined,
  ai: AiAnalysis,
  model: string,
  promptVersion: string,
): Recording {
  return {
    ...(caseId ? { caseId } : {}),
    ai,
    model,
    promptVersion,
    recordedAt: new Date().toISOString(),
  };
}

/** Test hook: replace the loaded recordings. */
export function setRecordingsForTest(records: Record<string, Recording> | null) {
  cache = records;
}
