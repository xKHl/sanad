import {
  APICallError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  RetryError,
  generateText,
  Output,
} from 'ai';
import type { SafetyFindings } from '@/lib/safety/types';
import type { ResolvedModel } from './model';
import { buildUserMessage, SYSTEM_PROMPT } from './prompt';
import { AiAnalysisSchema, type AiAnalysis } from './schema';

export type AiErrorCode =
  'timeout' | 'schema' | 'provider' | 'not_configured' | 'demo_unavailable' | 'rate_limited';

export type AiError = { code: AiErrorCode; message: string };

export type AiRun =
  | {
      ok: true;
      analysis: AiAnalysis;
      attempts: number;
      latencyMs: number;
      usage: { inputTokens: number | null; outputTokens: number | null };
    }
  | { ok: false; error: AiError; attempts: number; latencyMs: number };

export const AI_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_TOKENS = 6_000;

function describeValidationError(error: unknown): string {
  const cause = (error as { cause?: unknown }).cause;
  const msg =
    cause instanceof Error ? cause.message : error instanceof Error ? error.message : String(error);
  return msg.slice(0, 600);
}

/** Map any thrown error to a safe, typed AiError (no secrets, no stack traces). */
export function classifyError(error: unknown): AiError {
  const inner = RetryError.isInstance(error) ? (error.lastError ?? error) : error;
  const name = (inner as { name?: string })?.name ?? '';
  if (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    /timed? ?out|aborted/i.test(String((inner as Error)?.message))
  ) {
    return { code: 'timeout', message: 'The AI model did not respond in time.' };
  }
  if (APICallError.isInstance(inner)) {
    const status = inner.statusCode ?? 0;
    if (status === 429)
      return {
        code: 'rate_limited',
        message: 'The AI provider rate limit was reached. Try again in a minute.',
      };
    if (status === 401 || status === 403) {
      return {
        code: 'provider',
        message: 'The AI provider rejected the credentials. Check the API key.',
      };
    }
    return {
      code: 'provider',
      message: `The AI provider returned an error${status ? ` (HTTP ${status})` : ''}.`,
    };
  }
  if (NoObjectGeneratedError.isInstance(inner) || NoOutputGeneratedError.isInstance(inner)) {
    return { code: 'schema', message: 'The AI output did not match the required structure.' };
  }
  if (name === 'AI_LoadAPIKeyError' || /api key/i.test(String((inner as Error)?.message))) {
    return { code: 'not_configured', message: 'No API key is configured for the AI provider.' };
  }
  return { code: 'provider', message: 'The AI provider could not complete the request.' };
}

/**
 * Run the language model with a strict schema (SPEC §6). One retry on a schema failure,
 * with the validation error appended to the request.
 */
export async function runAiAnalysis(
  analyzedText: string,
  findings: SafetyFindings,
  resolved: ResolvedModel,
  opts: { timeoutMs?: number } = {},
): Promise<AiRun> {
  const t0 = Date.now();
  if (!resolved.model) {
    return {
      ok: false,
      attempts: 0,
      latencyMs: 0,
      error: {
        code: 'not_configured',
        message: resolved.configError ?? 'No AI model is configured.',
      },
    };
  }
  const userMessage = buildUserMessage(analyzedText, findings);
  let prompt = userMessage;
  let attempts = 0;
  let lastError: unknown = null;

  while (attempts < 2) {
    attempts++;
    try {
      const result = await generateText({
        model: resolved.model,
        instructions: SYSTEM_PROMPT,
        prompt,
        output: Output.object({ schema: AiAnalysisSchema }),
        ...(resolved.temperature !== undefined ? { temperature: resolved.temperature } : {}),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxRetries: 1,
        timeout: opts.timeoutMs ?? AI_TIMEOUT_MS,
        ...(resolved.providerOptions ? { providerOptions: resolved.providerOptions } : {}),
      });
      const analysis = result.output;
      return {
        ok: true,
        analysis,
        attempts,
        latencyMs: Date.now() - t0,
        usage: {
          inputTokens: result.usage?.inputTokens ?? null,
          outputTokens: result.usage?.outputTokens ?? null,
        },
      };
    } catch (error) {
      lastError = error;
      const isSchema =
        NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error);
      if (!isSchema || attempts >= 2) break;
      prompt = `${userMessage}

Your previous answer could not be used because it did not match the required JSON schema:
${describeValidationError(error)}
Return only one JSON object that matches the schema exactly.`;
    }
  }
  return { ok: false, attempts, latencyMs: Date.now() - t0, error: classifyError(lastError) };
}
