import 'server-only';
import { resolveModel } from '@/lib/ai/model';
import { PROMPT_VERSION } from '@/lib/ai/prompt';
import { recordingCount } from '@/lib/ai/recordings';
import { RULES_COUNT, RULES_VERSION } from '@/lib/safety';

export const dynamic = 'force-dynamic';

/** Public configuration summary. Never returns secrets. */
export function GET() {
  const resolved = resolveModel();
  return Response.json(
    {
      mode: resolved.mode,
      model: resolved.mode === 'demo' ? null : resolved.label,
      configError: resolved.configError,
      promptVersion: PROMPT_VERSION,
      rulesVersion: RULES_VERSION,
      rulesCount: RULES_COUNT,
      recordings: recordingCount(),
      lab: process.env.SANAD_LAB === 'true',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
