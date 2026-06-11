# AI Chat Studio

A minimal, mobile-friendly AI chat interface built with **Next.js** and the **Vercel AI SDK v5**. Supports multiple providers (Google Gemini, OpenAI, Anthropic), bring-your-own-key, model switching, and real-time streaming — all from a single, fully themeable component.

> Built as part of a 6-week AI/LLM Engineering learning roadmap.

---

## Screenshot

<img width="1919" height="965" alt="image" src="https://github.com/user-attachments/assets/79010891-aebe-4fa3-981f-bfe8ac36c4bf" />


---

## Features

- **Multi-provider** — Google Gemini, OpenAI, and Anthropic in one interface
- **Bring your own key** — paste API keys in the UI; stored in `localStorage`, never in a database
- **Free-tier friendly** — `gemini-3.1-flash-lite` and `gemini-2.5-flash` work with a free Google AI Studio key, no billing required
- **Model selector** — grouped dropdown with all models labelled free / paid; supports custom model IDs
- **Response styles** — ELI5, Senior Dev, or write your own system prompt
- **Sampling controls** — temperature (0–2) and Top-P sliders
- **Streaming UI** — tokens render word-by-word as they arrive
- **Markdown rendering** — headings, lists, bold, inline code, fenced code blocks
- **Error handling** — 20-second stuck detector, key validation before streaming, provider-specific messages
- **Mobile-friendly** — slide-in drawer sidebar, hidden scrollbars, touch-sized inputs
- **Themeable** — one `THEME` object at the top of `page.tsx` controls every colour in the app

---

## Tech Stack

| Layer | Library |
|---|---|
| Framework | [Next.js 15](https://nextjs.org) — App Router |
| AI SDK | [Vercel AI SDK v5](https://sdk.vercel.ai) — `ai`, `@ai-sdk/react` |
| Providers | `@ai-sdk/google`, `@ai-sdk/openai`, `@ai-sdk/anthropic` |
| Markdown | `react-markdown`, `remark-gfm` |
| Styling | Tailwind CSS v3 + inline theme object |
| Runtime | Edge (Vercel Edge Functions) |

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/your-username/ai-chat-studio.git
cd ai-chat-studio
npm install
```

### 2. Install AI provider packages

```bash
npm install ai @ai-sdk/react @ai-sdk/google @ai-sdk/openai @ai-sdk/anthropic
```

### 3. Install markdown renderer

```bash
npm install react-markdown remark-gfm
```

### 4. Set up environment variables

Create a `.env.local` file in the project root:

```env
# Server-side fallback keys.
# Used when the user hasn't pasted a key in the UI.
# The app works without these if users supply their own keys.

GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
```

> **Free Google key:** Go to [aistudio.google.com](https://aistudio.google.com) → *Get API Key*. No billing required for free-tier Gemini models.

### 5. Place the files

```
your-project/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts   ← server route
│   └── page.tsx           ← full UI
└── .env.local
```

### 6. Run

```bash
npm run dev
# Open http://localhost:3000
```

---

## Project Structure

```
app/
├── api/
│   └── chat/
│       └── route.ts   # Edge route — validates keys, builds provider, streams response
└── page.tsx           # Sidebar settings + chat panel, all in one file
```

Intentionally two files to keep everything easy to read and modify.

---

## Supported Models

### Google Gemini

| Model | ID | Tier |
|---|---|---|
| Gemini 3.1 Flash-Lite | `gemini-3.1-flash-lite` | **Free** |
| Gemini 2.5 Flash | `gemini-2.5-flash` | **Free** |
| Gemini 3.5 Flash | `gemini-3.5-flash` | Paid |
| Gemini 3.1 Pro | `gemini-3.1-pro-preview` | Paid |

### OpenAI

| Model | ID | Tier |
|---|---|---|
| GPT-4o Mini | `gpt-4o-mini` | Paid |
| GPT-4o | `gpt-4o` | Paid |

### Anthropic

| Model | ID | Tier |
|---|---|---|
| Claude Haiku | `claude-haiku-4-5-20251001` | Paid |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | Paid |

Use the **Custom model ID** option to type any model string not in the list.

> **Note on temperature:** Anthropic caps temperature at 1.0. The route handler clamps the value automatically — you won't hit a 422 error from their API even if the slider is above 1.

---

## API Keys

Two ways to supply keys:

**Option 1 — UI (good for sharing the app):**
Open the sidebar → *API Keys*, paste your key. It's saved to `localStorage` and sent with each request over HTTPS. Nothing is stored server-side.

**Option 2 — `.env.local` (good for personal use):**
Set the environment variables. The route falls back to these if no UI key is present for that provider.

If neither is set, the server returns a `401` immediately — before any streaming starts — with a message that links directly to the settings panel.

---

## Error Handling

| Scenario | What happens |
|---|---|
| No API key | `401` before streaming starts; banner with *Open settings →* shortcut |
| Invalid / expired key | Provider throws; server catches and returns targeted `401` message |
| Rate limited | Server catches `429`; banner says to wait and retry |
| Model not found | Server catches `404`; model ID shown in the message |
| Stuck streaming | 20-second client timeout fires; banner explains the issue |
| Network failure | `useChat` error field surfaced in the banner |

All errors show in an amber banner below the header. Dismissing it lets the user send a new message immediately — no page refresh needed.

---

## Theming

All colours live in one `THEME` constant at the top of `page.tsx`. To restyle everything, only edit that object.

```typescript
// Current theme
const THEME = {
  light: "#ecf39e",  // lime yellow-green — backgrounds, highlights
  dark:  "#90a955",  // olive green       — buttons, active states
  // ...
};
```

Some alternatives to try:

```typescript
// Ocean blue
light: "#dbeafe",  dark: "#3b82f6"

// Warm rose
light: "#fce7f3",  dark: "#ec4899"

// Pure monochrome
light: "#f5f5f5",  dark: "#0a0a0a"
```

---

## Customising

**Add a model:**

```typescript
// In page.tsx — MODELS array
{ id: "your-model-id", name: "Display Name", provider: "openai", free: false, desc: "Short description" }
```

**Add a response style:**

```typescript
// In route.ts — SYSTEM_PROMPTS object
const SYSTEM_PROMPTS = {
  eli5:   "...",
  senior: "...",
  pirate: "You are a pirate. Respond only in pirate speak.", // ← add here
};
```

Then add the matching label in `MODE_LABEL` in `page.tsx` and the mode type union.

**Change the timeout duration:**

```typescript
// In page.tsx
const STREAM_TIMEOUT_MS = 20_000; // change to any value in milliseconds
```
