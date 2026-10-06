import 'server-only';
import { generateText } from 'ai';
import { errorDetail } from '@/lib/ai/analyze';
import { resolveModel } from '@/lib/ai/model';
import { PROMPT_VERSION } from '@/lib/ai/prompt';
import { recordingCount } from '@/lib/ai/recordings';
import { RULES_COUNT, RULES_VERSION } from '@/lib/safety';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/** Public configuration summary. Never returns secrets. */
let lastProbe = 0;

/** Optional connectivity probe (`?probe=1`): one tiny model call, at most once per 20 s. */
async function probe() {
  const resolved = resolveModel();
  if (!resolved.model)
    return { ok: false, detail: resolved.configError ?? 'No live model configured.' };
  if (Date.now() - lastProbe < 20_000)
    return { ok: false, detail: 'Probe rate-limited; retry in 20 s.' };
  lastProbe = Date.now();
  const t0 = Date.now();
  try {
    const r = await generateText({
      model: resolved.model,
      prompt: 'Reply with the single word OK.',
      maxOutputTokens: 200,
      timeout: 25_000,
      maxRetries: 0,
      ...(resolved.providerOptions ? { providerOptions: resolved.providerOptions } : {}),
    });
    return { ok: true, ms: Date.now() - t0, reply: r.text.slice(0, 20) };
  } catch (error) {
    return { ok: false, ms: Date.now() - t0, detail: errorDetail(error) };
  }
}

export async function GET(request: Request) {
  const resolved = resolveModel();
  const wantProbe = new URL(request.url).searchParams.get('probe') === '1';
  return Response.json(
    {
      ...(wantProbe ? { probe: await probe() } : {}),
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
