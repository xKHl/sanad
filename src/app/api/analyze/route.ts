import 'server-only';
import { AnalyzeRequestSchema, analyzeCase } from '@/lib/pipeline/analyze-case';
import { logAnalysis } from '@/lib/server/log';
import { clientKey, createRateLimiter } from '@/lib/server/rate-limit';

export const maxDuration = 60;

const MAX_BODY_BYTES = 20_000;
const limiter = createRateLimiter(
  process.env.NODE_ENV === 'development' ? 0 : Number(process.env.RATE_LIMIT_PER_MINUTE ?? 8),
);

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const limit = limiter.check(clientKey(request.headers));
  if (!limit.ok) {
    return Response.json(
      {
        error: 'rate_limited',
        message: `Too many requests. Try again in ${limit.retryAfterSeconds} seconds.`,
        requestId,
      },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json(
      { error: 'too_large', message: 'Request body is too large.', requestId },
      { status: 413 },
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json(
      { error: 'invalid_json', message: 'Body must be JSON.', requestId },
      { status: 400 },
    );
  }
  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((i) => i.code === 'too_big');
    return Response.json(
      {
        error: tooLong ? 'too_long' : 'invalid_input',
        message: parsed.error.issues[0]?.message ?? 'Invalid input.',
        requestId,
      },
      { status: tooLong ? 413 : 400 },
    );
  }

  try {
    const result = await analyzeCase(parsed.data.scenario, { forceDemo: parsed.data.forceDemo });
    logAnalysis(result, '/api/analyze');
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'analysis_error',
        requestId,
        name: (error as Error)?.name ?? 'Error',
      }),
    );
    return Response.json(
      { error: 'internal', message: 'Unexpected error.', requestId },
      { status: 500 },
    );
  }
}
