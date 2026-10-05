import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const k of [
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'GROQ_API_KEY',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'AI_GATEWAY_API_KEY',
  ])
    vi.stubEnv(k, '');
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('./route');
}
const req = (body: unknown) =>
  new Request('http://localhost/api/lab', { method: 'POST', body: JSON.stringify(body) });

afterEach(() => vi.unstubAllEnvs());

describe('POST /api/lab', () => {
  it('is disabled by default', async () => {
    const { POST } = await load({ SANAD_LAB: '', SANAD_LAB_KEY: '' });
    expect((await POST(req({ key: 'x', caseId: 'C01' }))).status).toBe(404);
  });

  it('is disabled without a strong enough key', async () => {
    const { POST } = await load({ SANAD_LAB: 'true', SANAD_LAB_KEY: 'short' });
    expect((await POST(req({ key: 'short', caseId: 'C01' }))).status).toBe(404);
  });

  it('rejects a wrong key', async () => {
    const { POST } = await load({ SANAD_LAB: 'true', SANAD_LAB_KEY: 'correct-horse' });
    expect((await POST(req({ key: 'wrong-key', caseId: 'C01' }))).status).toBe(403);
  });

  it('runs a known case with the right key', async () => {
    const { POST } = await load({ SANAD_LAB: 'true', SANAD_LAB_KEY: 'correct-horse' });
    const res = await POST(req({ key: 'correct-horse', caseId: 'C01' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.safety.ruleFlags[0].ruleId).toBe('RF-ACS');
    expect(body.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.recording).toBeNull();
  });
});
