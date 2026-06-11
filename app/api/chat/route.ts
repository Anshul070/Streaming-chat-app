// ─── Dependencies ─────────────────────────────────────────────────────────────
// Run: npm install @ai-sdk/google @ai-sdk/openai @ai-sdk/anthropic
//
// Required .env.local keys (only needed for server-side fallback;
// users can supply their own keys from the UI instead):
//   GOOGLE_GENERATIVE_AI_API_KEY=...
//   OPENAI_API_KEY=...
//   ANTHROPIC_API_KEY=...

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, UIMessage } from "ai";

export const runtime = "edge";

// ─── Types ────────────────────────────────────────────────────────────────────

type Provider = "google" | "openai" | "anthropic";
type PromptMode = "eli5" | "senior" | "custom";

interface RequestBody {
  messages: UIMessage[];
  mode: PromptMode;
  temperature: number;      // 0.0–2.0 (clamped to 1.0 for Anthropic)
  topP: number;             // 0.0–1.0
  systemPrompt?: string;    // only used when mode === "custom"
  modelId: string;          // e.g. "gemini-3.1-flash-lite"
  provider: Provider;       // determines which SDK adapter to use
  apiKeys?: {
    google?: string;
    openai?: string;
    anthropic?: string;
  };
}

// ─── Predefined system prompts ────────────────────────────────────────────────

const SYSTEM_PROMPTS = {
  // Beginner-friendly: avoids jargon, uses analogies
  eli5: `You are a patient, friendly teacher explaining things to a curious
5-year-old. Use simple words, short sentences, and relatable analogies.
Never use jargon. Make it visual and fun.`,

  // Expert mode: skip basics, use precise terminology
  senior: `You are a staff engineer. Be direct, technical, and precise.
Use correct CS/programming terminology. Assume deep knowledge of
data structures, algorithms, and modern web development. Skip basics.
Use code examples when they clarify faster than prose.`,
} as const;

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const {
    messages,
    mode,
    temperature,
    topP,
    systemPrompt,
    modelId,
    provider,
    apiKeys,
  } = (await req.json()) as RequestBody;

  // ── Resolve system prompt ──────────────────────────────────────────────────
  // "custom" mode uses the user-supplied systemPrompt from the UI.
  // "eli5" / "senior" use the predefined prompts above.
  const resolvedSystem =
    mode === "custom" && systemPrompt?.trim()
      ? systemPrompt
      : SYSTEM_PROMPTS[mode as keyof typeof SYSTEM_PROMPTS] ??
        SYSTEM_PROMPTS.senior;

  // ── Build provider instance (BYOK pattern) ────────────────────────────────
  // Each factory accepts an optional apiKey. The user's key (from localStorage
  // via request body) takes precedence; the server env var is the fallback.
  // This way the app works for others without exposing your own key.
  let model;

  if (provider === "google") {
    const ai = createGoogleGenerativeAI({
      apiKey: apiKeys?.google || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
    model = ai(modelId);
  } else if (provider === "openai") {
    const ai = createOpenAI({
      apiKey: apiKeys?.openai || process.env.OPENAI_API_KEY,
    });
    model = ai(modelId);
  } else if (provider === "anthropic") {
    const ai = createAnthropic({
      apiKey: apiKeys?.anthropic || process.env.ANTHROPIC_API_KEY,
    });
    model = ai(modelId);
  } else {
    return new Response(
      JSON.stringify({ error: `Unknown provider: "${provider}"` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Temperature clamping ───────────────────────────────────────────────────
  // Anthropic's API caps temperature at 1.0. Google & OpenAI accept up to 2.0.
  // Silently clamping avoids a 422 error from Anthropic when the slider is > 1.
  const clampedTemp = provider === "anthropic" ? Math.min(temperature, 1.0) : temperature;

  // ── Note on topP for newer Gemini models ──────────────────────────────────
  // Gemini 3.5 Flash does NOT support topP / temperature — it will be ignored.
  // Gemini 3.1 Flash-Lite DOES support both. The SDK passes them through;
  // unsupported params are silently dropped by the provider, not an error.
  const result = streamText({
    model,
    system: resolvedSystem,
    messages: await convertToModelMessages(messages),
    temperature: clampedTemp,
    topP,
  });

  return result.toUIMessageStreamResponse();
}