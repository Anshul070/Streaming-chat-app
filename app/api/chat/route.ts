// ─── Dependencies ─────────────────────────────────────────────────────────────
// npm install @ai-sdk/google @ai-sdk/openai @ai-sdk/anthropic

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI }             from "@ai-sdk/openai";
import { createAnthropic }          from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, UIMessage } from "ai";

export const runtime = "edge";

// ─── Types ────────────────────────────────────────────────────────────────────

type Provider   = "google" | "openai" | "anthropic";
type PromptMode = "eli5" | "senior" | "custom";

interface RequestBody {
  messages:     UIMessage[];
  mode:         PromptMode;
  temperature:  number;
  topP:         number;
  systemPrompt?: string;
  modelId:      string;
  provider:     Provider;
  apiKeys?: {
    google?:    string;
    openai?:    string;
    anthropic?: string;
  };
}

// ─── System prompts ───────────────────────────────────────────────────────────

const SYSTEM_PROMPTS = {
  eli5:   `You are a patient, friendly teacher explaining things to a curious 5-year-old. Simple words, short sentences, relatable analogies. No jargon.`,
  senior: `You are a staff engineer. Direct, technical, precise. Use correct CS terminology. Assume deep knowledge. Skip basics.`,
} as const;

// ─── Key resolver ─────────────────────────────────────────────────────────────
// Returns the first available key: user-supplied → server env → undefined.
// If undefined is returned the handler sends a 401 before ever calling the provider.

function resolveKey(provider: Provider, userKey?: string): string | undefined {
  const envKey: Record<Provider, string | undefined> = {
    google:    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    openai:    process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
  };
  return userKey?.trim() || envKey[provider];
}

// ─── Error response helper ────────────────────────────────────────────────────

function errorResponse(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  let body: RequestBody;

  // ── Parse body ───────────────────────────────────────────────────────────
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON in request body.", 400);
  }

  const { messages, mode, temperature, topP, systemPrompt, modelId, provider, apiKeys } = body;

  // ── Validate required fields ─────────────────────────────────────────────
  if (!modelId?.trim())  return errorResponse("No model ID provided.", 400);
  if (!provider?.trim()) return errorResponse("No provider specified.", 400);

  // ── Resolve API key — fail fast if missing ───────────────────────────────
  // This prevents the request hanging; the client gets a clean 401 immediately.
  const apiKey = resolveKey(provider, apiKeys?.[provider as Provider]);

  if (!apiKey) {
    const label = { google: "Google", openai: "OpenAI", anthropic: "Anthropic" }[provider] ?? provider;
    return errorResponse(
      `No API key for ${label}. Open the settings panel → API Keys and paste your ${label} key, or add it to .env.local.`,
      401
    );
  }

  // ── Build provider model instance ────────────────────────────────────────
  let model;
  try {
    if (provider === "google") {
      model = createGoogleGenerativeAI({ apiKey })(modelId);
    } else if (provider === "openai") {
      model = createOpenAI({ apiKey })(modelId);
    } else if (provider === "anthropic") {
      model = createAnthropic({ apiKey })(modelId);
    } else {
      return errorResponse(`Unknown provider: "${provider}".`, 400);
    }
  } catch (err) {
    return errorResponse(`Failed to initialise ${provider} provider: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Resolve system prompt ─────────────────────────────────────────────────
  const system =
    mode === "custom" && systemPrompt?.trim()
      ? systemPrompt
      : SYSTEM_PROMPTS[mode as keyof typeof SYSTEM_PROMPTS] ?? SYSTEM_PROMPTS.senior;

  // ── Anthropic caps temperature at 1.0 ────────────────────────────────────
  const clampedTemp = provider === "anthropic" ? Math.min(temperature, 1.0) : temperature;

  // ── Stream ───────────────────────────────────────────────────────────────
  // Errors here are provider-level (invalid key, model not found, quota exceeded, etc.)
  try {
    const result = streamText({
      model,
      system,
      messages: await convertToModelMessages(messages),
      temperature: clampedTemp,
      topP,
    });
    return result.toUIMessageStreamResponse();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Surface common provider errors with clearer copy
    if (msg.includes("API key") || msg.includes("401") || msg.includes("403")) {
      return errorResponse(`Invalid or expired API key for ${provider}. Check it in the settings panel.`, 401);
    }
    if (msg.includes("quota") || msg.includes("429") || msg.includes("rate")) {
      return errorResponse(`Rate limit or quota exceeded for ${provider}. Wait a moment and try again.`, 429);
    }
    if (msg.includes("model") || msg.includes("404")) {
      return errorResponse(`Model "${modelId}" not found or unavailable on ${provider}.`, 404);
    }

    return errorResponse(`${provider} error: ${msg}`);
  }
}