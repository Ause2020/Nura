/**
 * lib/ai/anthropic.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Minimal server-side wrapper for the Anthropic Claude API.
 * NEVER import this file in client components — it reads env vars server-side.
 *
 * Cost note (Claude claude-haiku-4-5, ~2026 pricing):
 *   NC analysis call  ≈ 400 input tokens + 300 output tokens ≈ $0.0004 / call
 * To disable AI features entirely: remove ANTHROPIC_API_KEY from .env.local.
 * The UI checks isAiAvailable() before showing any AI button.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Anthropic from "@anthropic-ai/sdk";

/** Maximum characters accepted in any AI prompt input (cost guard) */
export const AI_INPUT_MAX_CHARS = 1200;

/** Timeout for Anthropic API calls in milliseconds */
const AI_TIMEOUT_MS = 15_000;

/** Returns true if the API key is configured — used to show/hide AI buttons */
export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export interface AiCallOptions {
  system: string;
  userMessage: string;
  maxTokens?: number;
  /** Override the default 1200-char cost guard (daily briefing needs more context). */
  maxInputChars?: number;
  timeoutMs?: number;
}

export interface AiCallUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
}

export interface AiCallResult {
  ok: true;
  text: string;
  usage: AiCallUsage;
}

export interface AiCallError {
  ok: false;
  error: string;
}

/**
 * Makes a single-turn Claude call. Always server-side.
 * Returns { ok: false } on any failure — callers must handle gracefully.
 */
export async function callClaude(
  opts: AiCallOptions
): Promise<AiCallResult | AiCallError> {
  if (!isAiConfigured()) {
    return { ok: false, error: "ANTHROPIC_API_KEY no configurada" };
  }

  const inputCap = opts.maxInputChars ?? AI_INPUT_MAX_CHARS;
  const timeoutMs = opts.timeoutMs ?? AI_TIMEOUT_MS;

  // Hard cap on input length to control cost
  const truncated =
    opts.userMessage.length > inputCap
      ? opts.userMessage.slice(0, inputCap) + "… [truncado]"
      : opts.userMessage;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const started = Date.now();

  try {
    const result = await Promise.race([
      client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: opts.maxTokens ?? 512,
        system: opts.system,
        messages: [{ role: "user", content: truncated }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI timeout")), timeoutMs)
      ),
    ]);

    const text =
      result.content[0]?.type === "text" ? result.content[0].text : "";
    return {
      ok: true,
      text,
      usage: {
        inputTokens: result.usage?.input_tokens ?? null,
        outputTokens: result.usage?.output_tokens ?? null,
        durationMs: Date.now() - started,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error desconocido en IA",
    };
  }
}

export interface AiVisionOptions {
  system: string;
  userMessage: string;
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  maxTokens?: number;
  timeoutMs?: number;
}

export async function callClaudeVision(
  opts: AiVisionOptions
): Promise<AiCallResult | AiCallError> {
  if (!isAiConfigured()) {
    return { ok: false, error: "ANTHROPIC_API_KEY no configurada" };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const started = Date.now();

  try {
    const result = await Promise.race([
      client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: opts.maxTokens ?? 1200,
        system: opts.system,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: opts.mediaType,
                  data: opts.imageBase64,
                },
              },
              { type: "text", text: opts.userMessage },
            ],
          },
        ],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI timeout")), timeoutMs)
      ),
    ]);

    const text =
      result.content[0]?.type === "text" ? result.content[0].text : "";
    return {
      ok: true,
      text,
      usage: {
        inputTokens: result.usage?.input_tokens ?? null,
        outputTokens: result.usage?.output_tokens ?? null,
        durationMs: Date.now() - started,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error desconocido en IA",
    };
  }
}

/**
 * Parses a JSON response from Claude safely.
 * Claude is instructed to return only JSON; this handles any surrounding text.
 */
export function parseAiJson<T>(text: string): T | null {
  // Extract JSON block if Claude added surrounding markdown
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
