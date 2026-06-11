# AI Chat Studio

A streaming AI chat app built with **Next.js App Router** and the **Vercel AI SDK**. Supports multiple providers (Google Gemini, OpenAI, Anthropic), bring-your-own-key, system prompt modes, and live sampling controls — all in a mobile-friendly UI.

Built as the Week 1 project of a 6-week AI/LLM Engineering study plan.

---

## Features

- **Streaming responses** — text appears token-by-token using Server-Sent Events
- **Multi-provider** — switch between Google Gemini, OpenAI, and Anthropic models from a single dropdown
- **Free-tier first** — Gemini 3.1 Flash-Lite and Gemini 2.5 Flash are clearly labelled as free; no billing required to get started
- **Bring your own key** — paste any provider API key in the settings panel; keys are stored in `localStorage` and sent over HTTPS only to your own API route
- **System prompt modes** — ELI5 (explain like I'm 5), Senior Dev (technical and direct), or Custom (write your own)
- **Sampling controls** — Temperature (0–2) and Top-P (0–1) sliders that update per-message
- **Custom model ID** — enter any valid model string if you need a model not in the list
- **Markdown rendering** — AI responses render headers, lists, code blocks, and inline code correctly
- **Error handling** — missing or invalid API keys surface a clear banner immediately; a 20-second timeout catches stuck requests
- **Mobile-friendly** — sidebar becomes a slide-in drawer on small screens; scrollbars hidden everywhere
- **Easy theming** — one `THEME` object at the top of `page.tsx` controls every color in the app

---

## Tech Stack

| Layer | Library |
|---|---|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript |
| AI SDK core | `ai` (Vercel AI SDK v5) |
| AI SDK UI | `@ai-sdk/react` |
| Providers | `@ai-sdk/google`, `@ai-sdk/openai`, `@ai-sdk/anthropic` |
| Styling | Tailwind CSS |
| Markdown | `react-markdown` + `remark-gfm` |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A free [Google AI Studio](https://aistudio.google.com/app/apikey) API key (enough to run the default model at no cost)

### Installation

```bash
# 1. Create a Next.js project if you don't have one
npx create-next-app@latest my-chat-app --typescript --tailwind --app
cd my-chat-app

# 2. Install dependencies
npm install ai @ai-sdk/react @ai-sdk/google @ai-sdk/openai @ai-sdk/anthropic
npm install react-markdown remark-gfm

# 3. Copy the two source files into your project
#    app/api/chat/route.ts  →  the streaming API route
#    app/page.tsx           →  the chat UI
```

### Environment Variables

Create `.env.local` in the project root. You only need the keys for the providers you actually use:

```env
# Google Gemini — get a free key at https://aistudio.google.com/app/apikey
GOOGLE_GENERATIVE_AI_API_KEY=your-key-here

# OpenAI — https://platform.openai.com/api-keys
OPENAI_API_KEY=your-key-here

# Anthropic — https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=your-key-here
```

> The app works fine with only `GOOGLE_GENERATIVE_AI_API_KEY` set. The other keys are only needed if you switch to OpenAI or Anthropic models.

### Run

```bash
npm run dev
# Open http://localhost:3000
```

---

## Model Reference

### Free Tier (no billing required)

| Model ID | Provider | Notes |
|---|---|---|
| `gemini-3.1-flash-lite` | Google | Default. Fastest and cheapest. |
| `gemini-2.5-flash` | Google | Balanced speed and quality. |

### Paid Models

| Model ID | Provider |
|---|---|
| `gemini-3.5-flash` | Google |
| `gemini-3.1-pro-preview` | Google |
| `gpt-4o-mini` | OpenAI |
| `gpt-4o` | OpenAI |
| `claude-haiku-4-5-20251001` | Anthropic |
| `claude-sonnet-4-6` | Anthropic |

You can also type any valid model ID into the **Custom model** field if you need something not in the list.

> **Note:** Gemini 3.5 Flash does not support `temperature` or `topP` — those parameters are silently ignored for that model. All other models in the list support both.

> **Note:** Anthropic caps `temperature` at 1.0. If your slider is above 1.0 and you switch to an Anthropic model, the route automatically clamps it before sending.

---

## Project Structure

```
app/
├── api/
│   └── chat/
│       └── route.ts     # Edge runtime route — validates keys, calls provider, streams response
├── page.tsx             # Chat UI — sidebar settings + message list + input bar
└── globals.css          # Tailwind base styles (default Next.js file, no changes needed)
```

### `route.ts` responsibilities

- Validates that an API key exists (user-supplied or `.env`) before calling the provider — returns a `401` immediately if not, preventing the UI from hanging
- Instantiates the correct provider via `createGoogleGenerativeAI`, `createOpenAI`, or `createAnthropic`
- Resolves the system prompt from the selected mode (`eli5`, `senior`, `custom`)
- Wraps `streamText` in a `try/catch` that maps common provider errors (invalid key, rate limit, model not found) to human-readable messages
- Returns a `UIMessageStreamResponse` that the `useChat` hook on the client can parse

### `page.tsx` responsibilities

- `useChat` with `DefaultChatTransport` manages all message state and streaming
- Settings (mode, model, API keys) are passed as `body` in `sendMessage` on every request — this avoids the stale-closure bug in `DefaultChatTransport`'s static `body` option
- A 20-second timeout effect detects stuck requests; it resets on every new token so it only fires on genuine connection failures
- The `error` from `useChat` is parsed for the JSON body that `route.ts` sends back, surfacing the exact message in the error banner

---

## Customising the Theme

Open `page.tsx` and edit the `THEME` object at the top of the file. Every color in the app is derived from it — nothing is hardcoded elsewhere.

```typescript
const THEME = {
  light: "#ecf39e",   // ← highlight color (backgrounds, badges)
  dark:  "#90a955",   // ← accent color (buttons, active states)

  bg:        "#ffffff",
  bgSidebar: "#f8fbed",
  // ... see file for full list
};
```

To switch to a different palette, change `light` and `dark` first, then adjust the surface colors (`bg`, `bgSidebar`, `bgInput`, `border`) to match.

---

## Error Handling

| Error | What happens |
|---|---|
| No API key set | Route returns `401` before calling the provider; banner appears immediately with a link to open the API Keys section |
| Invalid / expired key | Provider throws `401`/`403`; caught and surfaced as "Invalid or expired API key" |
| Rate limit hit | Provider throws `429`; surfaced as "Rate limit or quota exceeded. Wait a moment." |
| Model not found | Provider throws `404`; surfaced as "Model not found or unavailable" |
| Request stuck / no response | 20-second client-side timeout fires and shows "Request timed out" banner |
| Network failure | `useChat` error state catches it and surfaces the raw error message |

All errors show as an amber banner below the header. Dismiss it with `×` and send a new message to retry.

---

## Key Concepts Demonstrated

This project was built as a practical exercise in Week 1 of an AI/LLM engineering study plan. The concepts it demonstrates:

- **Streaming** — `streamText` + `toUIMessageStreamResponse` on the server; `useChat` + `DefaultChatTransport` on the client
- **System prompts** — the `system` parameter swapped at runtime based on UI selection
- **Temperature & Top-P** — passed per-request so sliders always reflect the current value
- **Context window** — `useChat` automatically maintains the full `messages[]` history and sends it with every request
- **Bring-your-own-key pattern** — provider factories (`createGoogleGenerativeAI` etc.) accept an `apiKey` at runtime, falling back to server env vars
- **Error handling** — fail-fast key validation, try/catch around the provider call, client-side timeout

---

## What's Next

Planned additions from the 6-week roadmap:

- [ ] **Week 2** — Prompt templates and structured output with Zod
- [ ] **Week 3** — Semantic search over chat history using Supabase pgvector
- [ ] **Week 4** — RAG pipeline — upload a PDF and chat with it
- [ ] **Week 5** — Agent with tool use (web search, calculator)
- [ ] **Week 6** — Eval suite, rate limiting, cost tracking dashboard

---

## License

MIT
