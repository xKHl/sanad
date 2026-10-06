import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createGateway, type LanguageModel } from 'ai';

/**
 * Model resolution (SPEC §8.2). The client can never choose a provider or model; only
 * server environment variables do. Keys never leave the server.
 */

export type Mode = 'cloud' | 'local' | 'demo';
export type ProviderId = 'google' | 'groq' | 'anthropic' | 'openai' | 'gateway' | 'ollama';

export type ProviderOptions = Record<
  string,
  Record<string, string | number | boolean | Record<string, string | number | boolean>>
>;

export type ResolvedModel = {
  mode: Mode;
  provider: ProviderId | null;
  modelId: string | null;
  /** Human label, e.g. "gemini-3.8-flash (Google)". */
  label: string;
  model: LanguageModel | null;
  /** Undefined = provider default (recommended for reasoning models such as Gemini 3 and gpt-oss). */
  temperature: number | undefined;
  providerOptions: ProviderOptions | undefined;
  /** Why the configured mode cannot run, if it cannot. */
  configError: string | null;
  /**
   * Models tried in order when the primary one is overloaded, rate limited or unavailable
   * (HTTP 404, 429, 5xx). Same safety pipeline; only the model changes.
   */
  fallbacks?: ResolvedModel[];
};

type Env = Record<string, string | undefined>;

const DEFAULT_MODELS: Record<ProviderId, string | null> = {
  google: 'gemini-3.8-flash',
  groq: 'openai/gpt-oss-120b',
  anthropic: 'claude-sonnet-5-5',
  openai: null,
  gateway: 'google/gemini-3.8-flash',
  ollama: 'gpt-oss:20b',
};

/** Lighter models of the same provider, tried when the default one is overloaded. */
const DEFAULT_FALLBACKS: Partial<Record<ProviderId, string[]>> = {
  google: ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-flash-latest'],
};

const KEY_VARS: Record<Exclude<ProviderId, 'ollama'>, string> = {
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  groq: 'GROQ_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gateway: 'AI_GATEWAY_API_KEY',
};

const LABELS: Record<ProviderId, string> = {
  google: 'Google',
  groq: 'Groq',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gateway: 'AI Gateway',
  ollama: 'Ollama, local',
};

const isProvider = (p: string): p is Exclude<ProviderId, 'ollama'> => p in KEY_VARS;

function cloudProvider(env: Env): Exclude<ProviderId, 'ollama'> {
  const p = (env.LLM_PROVIDER ?? '').trim().toLowerCase();
  if (isProvider(p)) return p;
  // No explicit provider: pick the first one with a key, preferring the free tiers.
  const order: Array<Exclude<ProviderId, 'ollama'>> = [
    'google',
    'groq',
    'anthropic',
    'openai',
    'gateway',
  ];
  return order.find((id) => (env[KEY_VARS[id]] ?? '').trim() !== '') ?? 'google';
}

/** True when the gateway can authenticate without a key (deployments on Vercel use OIDC). */
const hasOidc = (env: Env) => (env.VERCEL_OIDC_TOKEN ?? '').trim() !== '';

export function resolveModel(
  env: Env = process.env,
  options: { forceDemo?: boolean } = {},
): ResolvedModel {
  const demo = (configError: string | null = null): ResolvedModel => ({
    mode: 'demo',
    provider: null,
    modelId: null,
    label: 'Recorded outputs',
    model: null,
    temperature: undefined,
    providerOptions: undefined,
    configError,
  });
  if (options.forceDemo) return demo();

  const requested = (env.SANAD_MODE ?? '').trim().toLowerCase();
  const modelOverride = (env.LLM_MODEL ?? '').trim() || null;

  if (requested === 'demo') return demo();

  if (requested === 'local') {
    const modelId = modelOverride ?? DEFAULT_MODELS.ollama ?? 'gpt-oss:20b';
    const ollama = createOpenAICompatible({
      name: 'ollama',
      baseURL: (env.OLLAMA_BASE_URL ?? '').trim() || 'http://localhost:11434/v1',
      supportsStructuredOutputs: true,
    });
    return {
      mode: 'local',
      provider: 'ollama',
      modelId,
      label: `${modelId} (${LABELS.ollama})`,
      model: ollama(modelId),
      temperature: 0,
      providerOptions: undefined,
      configError: null,
    };
  }

  const provider = cloudProvider(env);
  const key = (env[KEY_VARS[provider]] ?? '').trim();
  const usable = key !== '' || (provider === 'gateway' && hasOidc(env));
  if (!usable) {
    // Default mode without any key is demo; an explicit cloud request reports what is missing.
    return requested === 'cloud' ? demo(`${KEY_VARS[provider]} is not set.`) : demo();
  }
  const modelId = modelOverride ?? DEFAULT_MODELS[provider];
  if (!modelId) return demo(`Set LLM_MODEL for provider "${provider}".`);

  const primary = buildCloud(provider, key, modelId);
  const fallbacks: ResolvedModel[] = [];
  const seen = new Set([`${provider}:${modelId}`]);
  const add = (p: Exclude<ProviderId, 'ollama'>, id: string) => {
    const k = (env[KEY_VARS[p]] ?? '').trim();
    if (!k || seen.has(`${p}:${id}`)) return;
    seen.add(`${p}:${id}`);
    fallbacks.push(buildCloud(p, k, id));
  };
  const listed = (env.LLM_FALLBACK_MODELS ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  for (const id of listed.length > 0 ? listed : (DEFAULT_FALLBACKS[provider] ?? []))
    add(provider, id);
  // Another free provider with a key is the last resort (e.g. Groq behind Gemini).
  for (const p of ['google', 'groq'] as const) {
    const id = DEFAULT_MODELS[p];
    if (p !== provider && id) add(p, id);
  }
  return { ...primary, fallbacks };
}

function buildCloud(
  provider: Exclude<ProviderId, 'ollama'>,
  key: string,
  modelId: string,
): ResolvedModel {
  let model: LanguageModel;
  let temperature: number | undefined = 0;
  let providerOptions: ProviderOptions | undefined;
  switch (provider) {
    case 'google':
      model = createGoogle({ apiKey: key })(modelId);
      if (/gemini-[3-9]/.test(modelId)) {
        // Gemini 3+ is tuned for its default temperature; keep thinking light for latency.
        temperature = undefined;
        providerOptions = { google: { thinkingConfig: { thinkingLevel: 'low' } } };
      }
      break;
    case 'groq':
      model = createGroq({ apiKey: key })(modelId);
      if (modelId.includes('gpt-oss')) {
        temperature = undefined;
        providerOptions = {
          groq: { reasoningEffort: 'low', structuredOutputs: true, strictJsonSchema: false },
        };
      } else {
        providerOptions = { groq: { structuredOutputs: true, strictJsonSchema: false } };
      }
      break;
    case 'anthropic':
      model = createAnthropic({ apiKey: key })(modelId);
      break;
    case 'openai':
      model = createOpenAI({ apiKey: key })(modelId);
      break;
    case 'gateway':
      model = (key ? createGateway({ apiKey: key }) : createGateway())(modelId);
      break;
  }
  return {
    mode: 'cloud',
    provider,
    modelId,
    label: `${modelId} (${LABELS[provider]})`,
    model,
    temperature,
    providerOptions,
    configError: null,
  };
}
