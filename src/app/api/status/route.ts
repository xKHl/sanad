import 'server-only';
import { generateText } from 'ai';
import { errorDetail } from '@/lib/ai/analyze';
import { resolveModel } from '@/lib/ai/model';
import { PROMPT_VERSION } from '@/lib/ai/prompt';
import { recordingCount } from '@/lib/ai/recordings';
import { RULES_COUNT, RULES_VERSION } from '@/lib/safety';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Public configuration summary. Never returns secrets. */
let lastProbe = 0;

/** Optional connectivity probe (`?probe=1`): one tiny call per model in the chain, at most once per 20 s. */
async function probe() {
  const resolved = resolveModel();
  if (!resolved.model)
    return { ok: false, detail: resolved.configError ?? 'No live model configured.' };
  if (Date.now() - lastProbe < 20_000)
    return { ok: false, detail: 'Probe rate-limited; retry in 20 s.' };
  lastProbe = Date.now();
  const results: Array<{ model: string; ok: boolean; ms: number; detail?: string }> = [];
  for (const candidate of [resolved, ...(resolved.fallbacks ?? [])]) {
    if (!candidate.model) continue;
    const t0 = Date.now();
    try {
      await generateText({
        model: candidate.model,
        prompt: 'Reply with the single word OK.',
        maxOutputTokens: 200,
        timeout: 8_000,
        maxRetries: 0,
        ...(candidate.providerOptions ? { providerOptions: candidate.providerOptions } : {}),
      });
      results.push({ model: candidate.label, ok: true, ms: Date.now() - t0 });
    } catch (error) {
      results.push({
        model: candidate.label,
        ok: false,
        ms: Date.now() - t0,
        detail: errorDetail(error).slice(0, 160),
      });
    }
  }
  return { ok: results.some((r) => r.ok), results };
}

/** Gemini model ids this key can call (`?models=1`). Names only; the key is never returned. */
async function googleModels() {
  const key = (process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '').trim();
  if (!key) return null;
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
      headers: { 'x-goog-api-key': key },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const body = (await res.json()) as {
      models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
    };
    return (body.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => n.includes('gemini'));
  } catch {
    return { error: 'unreachable' };
  }
}

export async function GET(request: Request) {
  const resolved = resolveModel();
  const params = new URL(request.url).searchParams;
  const wantProbe = params.get('probe') === '1';
  const wantModels = params.get('models') === '1';
  return Response.json(
    {
      ...(wantProbe ? { probe: await probe() } : {}),
      ...(wantModels ? { googleModels: await googleModels() } : {}),
      mode: resolved.mode,
      model: resolved.mode === 'demo' ? null : resolved.label,
      fallbacks: (resolved.fallbacks ?? []).map((f) => f.label),
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
