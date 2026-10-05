import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadRoute(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const k of ['GOOGLE_GENERATIVE_AI_API_KEY', 'GROQ_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'AI_GATEWAY_API_KEY', 'SANAD_MODE', 'LLM_PROVIDER', 'LLM_MODEL']) {
    vi.stubEnv(k, '');
  }
  vi.stubEnv('RATE_LIMIT_PER_MINUTE', '3');
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('./route');
}

const post = (body: unknown, raw?: string) =>
  new Request('http://localhost/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` },
    body: raw ?? JSON.stringify(body),
  });

afterEach(() => vi.unstubAllEnvs());

describe('POST /api/analyze', () => {
  it('runs the rule layer in demo mode without any key', async () => {
    const { POST } = await loadRoute();
    const res = await POST(post({ scenario: '58M, central chest pain radiating to left arm, sweaty. BP 150/90.' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('demo');
    expect(body.merged.redFlags[0].id).toBe('RF-ACS');
    expect(body.aiError.code).toBe('demo_unavailable');
  });

  it('rejects invalid JSON, short and long input', async () => {
    const { POST } = await loadRoute();
    expect((await POST(post(null, '{nope'))).status).toBe(400);
    expect((await POST(post({ scenario: 'too short' }))).status).toBe(400);
    expect((await POST(post({ scenario: 'x'.repeat(3001) }))).status).toBe(413);
    expect((await POST(post({ text: 'wrong field name but long enough' }))).status).toBe(400);
  });

  it('rate-limits per client', async () => {
    const { POST } = await loadRoute();
    const req = () =>
      new Request('http://localhost/api/analyze', {
        method: 'POST',
        headers: { 'x-forwarded-for': '192.168.1.9' },
        body: JSON.stringify({ scenario: '24F, sore throat for 3 days, no fever, NKDA.' }),
      });
    for (let i = 0; i < 3; i++) expect((await POST(req())).status).toBe(200);
    const limited = await POST(req());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('never logs case text', async () => {
    const { POST } = await loadRoute();
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    await POST(post({ scenario: '58M, UNIQUE-MARKER chest pain radiating to left arm.' }));
    const logged = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('"event":"analysis"');
    expect(logged).not.toContain('UNIQUE-MARKER');
    spy.mockRestore();
  });
});

describe('GET /api/status', () => {
  it('reports configuration without secrets', async () => {
    vi.resetModules();
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'super-secret-key');
    const { GET } = await import('../status/route');
    const body = await GET().json();
    expect(body).toMatchObject({ mode: 'cloud', model: 'gemini-3.8-flash (Google)', rulesCount: 30 });
    expect(JSON.stringify(body)).not.toContain('super-secret-key');
  });
});
