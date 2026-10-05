import 'server-only';
import { z } from 'zod';
import { DEV_CASES } from '@/data/cases/dev';
import { CaseSchema } from '@/data/cases/schema';
import { PROMPT_VERSION } from '@/lib/ai/prompt';
import { makeRecording, scenarioHash } from '@/lib/ai/recordings';
import { analyzeCase } from '@/lib/pipeline/analyze-case';
import { logAnalysis } from '@/lib/server/log';

/**
 * Lab endpoint: runs one case through the live pipeline so the evaluation and the demo
 * recordings can be produced from a browser. Disabled unless SANAD_LAB=true and a
 * SANAD_LAB_KEY is configured; the key must be sent with every request.
 */
export const maxDuration = 60;

const BodySchema = z.object({
  key: z.string(),
  caseId: z.string().optional(),
  holdoutCase: CaseSchema.optional(),
});

export async function POST(request: Request) {
  const expectedKey = process.env.SANAD_LAB_KEY ?? '';
  if (process.env.SANAD_LAB !== 'true' || expectedKey.length < 8) {
    return Response.json(
      { error: 'disabled', message: 'The lab is disabled on this deployment.' },
      { status: 404 },
    );
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: 'invalid_input', message: 'Invalid request.' }, { status: 400 });
  if (parsed.data.key !== expectedKey) {
    return Response.json({ error: 'forbidden', message: 'Wrong lab key.' }, { status: 403 });
  }
  const c = parsed.data.holdoutCase ?? DEV_CASES.find((x) => x.id === parsed.data.caseId);
  if (!c) return Response.json({ error: 'not_found', message: 'Unknown case.' }, { status: 404 });

  const result = await analyzeCase(c.scenario);
  logAnalysis(result, '/api/lab');
  const label = result.model ?? 'unknown model';
  return Response.json(
    {
      result,
      hash: scenarioHash(result.analyzedText),
      recording: result.ai ? makeRecording(c.id, result.ai, label, PROMPT_VERSION) : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
