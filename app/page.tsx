"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ─────────────────────────────────────────────────────────────────────────────
// THEME — edit only this object to restyle the entire app.
// ─────────────────────────────────────────────────────────────────────────────
const THEME = {
  light: "#ecf39e",
  dark:  "#90a955",

  bg:        "#ffffff",
  bgSidebar: "#f8fbed",
  bgHover:   "#eff8c6",
  bgInput:   "#f4f9e0",

  border:       "#ddef9e",
  borderStrong: "#90a955",

  text:      "#1c2b08",
  textSub:   "#4c6318",
  textMuted: "#88a038",

  btnBg:   "#90a955",
  btnText: "#f4f9e0",

  userBg:   "#90a955",
  userText: "#f4f9e0",

  aiBg:     "#f4f9e0",
  aiBorder: "#ddef9e",
  aiText:   "#1c2b08",

  codeBg:         "#253412",
  codeText:       "#ecf39e",
  codeInlineBg:   "#e8f5b0",
  codeInlineText: "#345010",

  freeBg: "#e8f5b0",  freeTxt: "#4c6318",
  paidBg: "#f0f4e4",  paidTxt: "#88a038",

  // Error banner — intentionally warm/amber so it stands out from the green palette
  errBg:     "#fffbeb",
  errBorder: "#fcd34d",
  errText:   "#78350f",
  errIcon:   "#d97706",
};
// ─────────────────────────────────────────────────────────────────────────────

type Mode     = "eli5" | "senior" | "custom";
type Provider = "google" | "openai" | "anthropic";
interface ModelOption { id: string; name: string; provider: Provider; free: boolean; desc: string; }
interface ApiKeys     { google: string; openai: string; anthropic: string; }

const MODELS: ModelOption[] = [
  { id: "gemini-3.1-flash-lite",     name: "Gemini 3.1 Flash-Lite", provider: "google",    free: true,  desc: "Fastest & cheapest" },
  { id: "gemini-2.5-flash",          name: "Gemini 2.5 Flash",      provider: "google",    free: true,  desc: "Balanced speed + quality" },
  { id: "gemini-3.5-flash",          name: "Gemini 3.5 Flash",      provider: "google",    free: false, desc: "Best reasoning in Flash line" },
  { id: "gemini-3.1-pro-preview",    name: "Gemini 3.1 Pro",        provider: "google",    free: false, desc: "Flagship Google model" },
  { id: "gpt-4o-mini",               name: "GPT-4o Mini",           provider: "openai",    free: false, desc: "Fast and affordable" },
  { id: "gpt-4o",                    name: "GPT-4o",                provider: "openai",    free: false, desc: "Most capable OpenAI" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku",          provider: "anthropic", free: false, desc: "Fastest Anthropic" },
  { id: "claude-sonnet-4-6",         name: "Claude Sonnet 4.6",     provider: "anthropic", free: false, desc: "Balanced Anthropic" },
];

const PROVIDERS: Provider[]                            = ["google", "openai", "anthropic"];
const PROVIDER_LABEL: Record<Provider, string>         = { google: "Google", openai: "OpenAI", anthropic: "Anthropic" };
const MODE_LABEL:     Record<Mode, string>             = { eli5: "ELI5", senior: "Senior Dev", custom: "Custom" };
const STREAM_TIMEOUT_MS                                = 20_000; // show error if no response in 20s

function readLS<T>(key: string, fb: T): T {
  if (typeof window === "undefined") return fb;
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch { return fb; }
}

export default function ChatPage() {
  const [input,          setInput]          = useState("");
  const [mode,           setMode]           = useState<Mode>("senior");
  const [systemPrompt,   setSystemPrompt]   = useState("");
  const [temperature,    setTemperature]    = useState(0.7);
  const [topP,           setTopP]           = useState(0.9);
  const [selectedId,     setSelectedId]     = useState(() => readLS("aic_model", "gemini-3.1-flash-lite"));
  const [customModelId,  setCustomModelId]  = useState("");
  const [customProvider, setCustomProvider] = useState<Provider>("google");
  const [apiKeys,        setApiKeys]        = useState<ApiKeys>(() => readLS("aic_keys", { google: "", openai: "", anthropic: "" }));
  const [showKeys,       setShowKeys]       = useState(false);
  const [dropdownOpen,   setDropdownOpen]   = useState(false);
  const [sidebarOpen,    setSidebarOpen]    = useState(false);

  // ── Error / stuck state ──────────────────────────────────────────────────
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null);
  const [timedOut,    setTimedOut]    = useState(false);
  const timeoutRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);

  const isCustom      = selectedId === "__custom__";
  const activeModel   = MODELS.find(m => m.id === selectedId) ?? MODELS[0];
  const effectiveId   = isCustom ? customModelId  : selectedId;
  const effectiveProv = isCustom ? customProvider : activeModel.provider;

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  // ── Persist settings ─────────────────────────────────────────────────────
  useEffect(() => { localStorage.setItem("aic_model", JSON.stringify(selectedId)); }, [selectedId]);
  useEffect(() => { localStorage.setItem("aic_keys",  JSON.stringify(apiKeys));    }, [apiKeys]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" });     }, [messages]);

  // ── Stuck / timeout detector ──────────────────────────────────────────────
  // Starts a 20-second timer when a request is in flight.
  // If the status doesn't return to idle within that window, we mark it as timed out.
  // The timer resets on every new message (each streamed token resets it),
  // so it only fires if the connection is genuinely stuck, not just slow.
  useEffect(() => {
    const isBusy = status === "submitted" || status === "streaming";

    if (isBusy) {
      // Clear any existing timer before setting a new one
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setTimedOut(true);
        setErrorMsg("Request timed out — the model may be overloaded, or your API key may be invalid. Check the API Keys section in settings.");
      }, STREAM_TIMEOUT_MS);
    } else {
      // Request finished (success or error): cancel the countdown
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      queueMicrotask(() => setTimedOut(false));
    }

    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [status, messages]); // reset on each new message so streaming progress resets the clock

  // ── Surface SDK-level errors ──────────────────────────────────────────────
  // The useChat hook sets `error` for network failures and non-2xx responses.
  // We parse the JSON body that route.ts sends back in its errorResponse() calls.
  useEffect(() => {
    if (!error) return;
    const raw = error.message ?? String(error);
    // Try to parse the JSON error body route.ts returns
    try {
      const parsed = JSON.parse(raw);
      queueMicrotask(() => setErrorMsg(parsed.error ?? raw));
    } catch {
      queueMicrotask(() => setErrorMsg(raw));
    }
  }, [error]);

  const dismissError = () => {
    setErrorMsg(null);
    setTimedOut(false);
  };

  // ── Close dropdown on outside click ──────────────────────────────────────
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  // ── Lock body scroll when mobile sidebar open ─────────────────────────────
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  // ── Send handler ──────────────────────────────────────────────────────────
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    // Allow sending even after an error so the user can retry without refreshing
    if (status === "submitted" || status === "streaming") return;

    dismissError(); // clear any previous error before the new request

    sendMessage({ text: input }, {
      body: {
        mode, temperature, topP, systemPrompt,
        modelId: effectiveId, provider: effectiveProv,
        apiKeys: {
          google:    apiKeys.google    || undefined,
          openai:    apiKeys.openai    || undefined,
          anthropic: apiKeys.anthropic || undefined,
        },
      },
    });
    setInput("");
  };

  // ── Style helpers ─────────────────────────────────────────────────────────
  const S = {
    label:     { color: THEME.textMuted, fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.08em" },
    modeBtn:   (on: boolean): React.CSSProperties => on
      ? { backgroundColor: THEME.dark,    color: THEME.btnText, border: `1px solid ${THEME.dark}` }
      : { backgroundColor: "transparent", color: THEME.textSub,  border: "1px solid transparent" },
    input:     { backgroundColor: THEME.bgInput, border: `1px solid ${THEME.border}`, color: THEME.text } as React.CSSProperties,
    modelRow:  (on: boolean): React.CSSProperties => ({ backgroundColor: on ? THEME.bgHover : "transparent", color: THEME.text }),
    badge:     (free: boolean): React.CSSProperties => ({ backgroundColor: free ? THEME.freeBg : THEME.paidBg, color: free ? THEME.freeTxt : THEME.paidTxt }),
    btn:       { backgroundColor: THEME.btnBg,  color: THEME.btnText  } as React.CSSProperties,
    userBubble:{ backgroundColor: THEME.userBg, color: THEME.userText, borderRadius: "18px 18px 4px 18px" } as React.CSSProperties,
    aiBubble:  { backgroundColor: THEME.aiBg,   color: THEME.aiText,  border: `1px solid ${THEME.aiBorder}`, borderRadius: "18px 18px 18px 4px" } as React.CSSProperties,
  };

  const isBusy = status === "submitted" || status === "streaming";

  return (
    <>
      {/* Hide all scrollbars globally */}
      <style>{`
        *::-webkit-scrollbar { display: none; }
        * { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>

      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: THEME.bg, color: THEME.text }}>

        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 md:hidden"
            style={{ backgroundColor: "rgba(0,0,0,0.2)" }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ══ SIDEBAR ════════════════════════════════════════════════════════ */}
        <aside
          className={`
            fixed md:static inset-y-0 left-0 z-50 md:z-auto
            w-72 md:w-64 flex-shrink-0 flex flex-col overflow-hidden border-r
            transition-transform duration-200 ease-in-out md:translate-x-0
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}
          style={{ backgroundColor: THEME.bgSidebar, borderColor: THEME.border }}
        >
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
               style={{ borderColor: THEME.border }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: THEME.text }}>AI Chat</p>
              <p className="text-xs mt-0.5"         style={{ color: THEME.textMuted }}>LLM Engineering</p>
            </div>
            <button onClick={() => setSidebarOpen(false)}
                    className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg"
                    style={{ color: THEME.textMuted }} aria-label="Close settings">
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Sidebar scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

            {/* Mode */}
            <div>
              <p className="mb-2" style={S.label}>Style</p>
              <div className="flex flex-col gap-1">
                {(["eli5", "senior", "custom"] as Mode[]).map(m => (
                  <button key={m} onClick={() => { setMode(m); setSidebarOpen(false); }}
                          className="text-left px-3 py-2 rounded-lg text-sm transition-colors"
                          style={S.modeBtn(mode === m)}>
                    {MODE_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>

            {/* System prompt */}
            <div>
              <p className="mb-2" style={S.label}>System prompt</p>
              <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
                        disabled={mode !== "custom"}
                        placeholder={mode === "custom" ? "Write your prompt…" : "Enable Custom mode to edit"}
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                        style={{ ...S.input, opacity: mode !== "custom" ? 0.4 : 1, cursor: mode !== "custom" ? "not-allowed" : "text" }} />
            </div>

            {/* Model selector */}
            <div ref={dropdownRef}>
              <p className="mb-2" style={S.label}>Model</p>
              <button onClick={() => setDropdownOpen(v => !v)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm"
                      style={{ backgroundColor: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text }}>
                <span className="truncate">{isCustom ? "Custom model" : activeModel.name}</span>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {!isCustom && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={S.badge(activeModel.free)}>{activeModel.free ? "free" : "paid"}</span>}
                  <svg className="w-3 h-3" viewBox="0 0 10 10" fill="none"
                       style={{ transform: dropdownOpen ? "rotate(180deg)" : "none", color: THEME.textMuted, transition: "transform 0.15s" }}>
                    <path d="M1.5 3.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </button>

              {dropdownOpen && (
                <div className="mt-1 rounded-lg shadow-md overflow-hidden max-h-56 overflow-y-auto"
                     style={{ backgroundColor: THEME.bg, border: `1px solid ${THEME.border}` }}>
                  {PROVIDERS.map(prov => (
                    <div key={prov}>
                      <p className="px-3 py-1.5 border-b"
                         style={{ backgroundColor: THEME.bgSidebar, color: THEME.textMuted, borderColor: THEME.border, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        {PROVIDER_LABEL[prov]}
                      </p>
                      {MODELS.filter(m => m.provider === prov).map(m => (
                        <button key={m.id}
                                onClick={() => { setSelectedId(m.id); setDropdownOpen(false); }}
                                className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm border-b"
                                style={{ ...S.modelRow(selectedId === m.id), borderColor: THEME.border + "55" }}>
                          <div>
                            <span style={{ fontWeight: selectedId === m.id ? 500 : 400 }}>{m.name}</span>
                            <p className="text-[11px] mt-0.5" style={{ color: THEME.textMuted }}>{m.desc}</p>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded ml-2 flex-shrink-0 font-medium" style={S.badge(m.free)}>
                            {m.free ? "free" : "paid"}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                  <button onClick={() => { setSelectedId("__custom__"); setDropdownOpen(false); }}
                          className="w-full px-3 py-2.5 text-left text-sm"
                          style={S.modelRow(isCustom)}>
                    <span style={{ color: THEME.textSub }}>Custom model ID…</span>
                  </button>
                </div>
              )}

              {isCustom && (
                <div className="mt-2 space-y-2">
                  <input value={customModelId} onChange={e => setCustomModelId(e.target.value)}
                         placeholder="e.g. gpt-4o-mini"
                         className="w-full px-3 py-2 rounded-lg text-xs font-mono outline-none"
                         style={S.input} />
                  <div className="flex gap-1">
                    {PROVIDERS.map(prov => (
                      <button key={prov} onClick={() => setCustomProvider(prov)}
                              className="flex-1 py-2 rounded-lg text-[11px]"
                              style={customProvider === prov
                                ? { backgroundColor: THEME.dark,    color: THEME.btnText,   border: `1px solid ${THEME.dark}` }
                                : { backgroundColor: "transparent", color: THEME.textMuted, border: `1px solid ${THEME.border}` }}>
                        {PROVIDER_LABEL[prov]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* API Keys */}
            <div>
              <button onClick={() => setShowKeys(v => !v)} className="w-full flex items-center justify-between py-1">
                <p style={S.label}>API Keys</p>
                <svg className="w-3 h-3" viewBox="0 0 10 10" fill="none"
                     style={{ transform: showKeys ? "rotate(180deg)" : "none", color: THEME.textMuted, transition: "transform 0.15s" }}>
                  <path d="M1.5 3.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {showKeys && (
                <div className="mt-2 space-y-2">
                  <p className="text-[11px] leading-relaxed rounded-lg px-3 py-2"
                     style={{ color: THEME.textMuted, backgroundColor: THEME.bgInput, border: `1px solid ${THEME.border}` }}>
                    localStorage only. Falls back to server <code style={{ color: THEME.textSub }}>.env</code> if empty.
                  </p>
                  {PROVIDERS.map(prov => (
                    <div key={prov} className="flex items-center gap-2">
                      <span className="text-[11px] w-14 flex-shrink-0" style={{ color: THEME.textSub }}>{PROVIDER_LABEL[prov]}</span>
                      <input type="password" value={apiKeys[prov]}
                             onChange={e => setApiKeys(prev => ({ ...prev, [prov]: e.target.value }))}
                             placeholder="sk-..."
                             className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-mono outline-none"
                             style={S.input} />
                      {apiKeys[prov] && <span className="text-[11px]" style={{ color: THEME.dark }}>✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sampling */}
            <div>
              <p className="mb-3" style={S.label}>Sampling</p>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1.5" style={{ color: THEME.textSub }}>
                    <span>Temperature</span><span className="font-mono">{temperature.toFixed(1)}</span>
                  </div>
                  <input type="range" min={0} max={20} step={1}
                         value={Math.round(temperature * 10)}
                         onChange={e => setTemperature(Number(e.target.value) / 10)}
                         className="w-full" style={{ accentColor: THEME.dark }} />
                  <p className="text-[10px] mt-1" style={{ color: THEME.textMuted }}>Higher = more creative</p>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1.5" style={{ color: THEME.textSub }}>
                    <span>Top-P</span><span className="font-mono">{topP.toFixed(2)}</span>
                  </div>
                  <input type="range" min={0} max={100} step={5}
                         value={Math.round(topP * 100)}
                         onChange={e => setTopP(Number(e.target.value) / 100)}
                         className="w-full" style={{ accentColor: THEME.dark }} />
                  <p className="text-[10px] mt-1" style={{ color: THEME.textMuted }}>Nucleus sampling breadth</p>
                </div>
              </div>
            </div>

            <div className="h-6" />
          </div>
        </aside>

        {/* ══ CHAT ═══════════════════════════════════════════════════════════ */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ backgroundColor: THEME.bg }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
               style={{ backgroundColor: THEME.bg, borderColor: THEME.border }}>
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setSidebarOpen(true)}
                      className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0"
                      style={{ color: THEME.textSub }} aria-label="Open settings">
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none">
                  <path d="M2.5 5h15M2.5 10h15M2.5 15h15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              <span className="text-sm font-medium truncate" style={{ color: THEME.text }}>
                {isCustom ? (customModelId || "Custom") : activeModel.name}
              </span>
              {!isCustom && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 hidden sm:inline"
                      style={S.badge(activeModel.free)}>
                  {activeModel.free ? "free" : "paid"}
                </span>
              )}
            </div>
            {/* Status indicator */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: errorMsg ? THEME.errIcon : isBusy ? THEME.light : THEME.dark }} />
              <span className="text-xs" style={{ color: errorMsg ? THEME.errIcon : THEME.textMuted }}>
                {errorMsg ? "Error" : isBusy ? "Streaming…" : "Ready"}
              </span>
            </div>
          </div>

          {/* ── Error banner ──────────────────────────────────────────────────
              Shows whenever errorMsg is set — either from a server 4xx/5xx,
              a timeout, or a network failure. Dismissible via the × button. */}
          {errorMsg && (
            <div
              className="flex items-start gap-3 px-4 py-3 border-b flex-shrink-0"
              style={{ backgroundColor: THEME.errBg, borderColor: THEME.errBorder }}
            >
              {/* Warning icon */}
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none"
                   style={{ color: THEME.errIcon }}>
                <path d="M8 1.5L1 14.5h14L8 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M8 6v4M8 11.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>

              {/* Message */}
              <p className="flex-1 text-xs leading-relaxed" style={{ color: THEME.errText }}>
                {errorMsg}
                {/* Hint to open settings if it looks like a key issue */}
                {(errorMsg.toLowerCase().includes("api key") || errorMsg.toLowerCase().includes("401")) && (
                  <button
                    onClick={() => { setSidebarOpen(true); setShowKeys(true); dismissError(); }}
                    className="ml-2 underline font-medium"
                    style={{ color: THEME.errIcon }}
                  >
                    Open settings →
                  </button>
                )}
              </p>

              {/* Dismiss */}
              <button onClick={dismissError}
                      className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded"
                      style={{ color: THEME.errText }}
                      aria-label="Dismiss error">
                <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-3">
            {messages.length === 0 && !errorMsg && (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm" style={{ color: THEME.textMuted }}>Send a message to start.</p>
              </div>
            )}
            {messages.map(message => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[88%] sm:max-w-[80%] px-4 py-2.5 text-sm leading-relaxed"
                     style={message.role === "user" ? S.userBubble : S.aiBubble}>
                  {message.parts.map((part, i) =>
                    part.type === "text" ? (
                      <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={{
                        h1: ({ children }) => <h1 style={{ fontSize: 16, fontWeight: 600, margin: "12px 0 6px" }}>{children}</h1>,
                        h2: ({ children }) => <h2 style={{ fontSize: 14, fontWeight: 600, margin: "10px 0 4px" }}>{children}</h2>,
                        h3: ({ children }) => <h3 style={{ fontSize: 13, fontWeight: 500, margin: "8px 0 4px" }}>{children}</h3>,
                        p:  ({ children }) => <p  style={{ marginBottom: 8, lineHeight: 1.6 }}>{children}</p>,
                        ul: ({ children }) => <ul style={{ listStyle: "disc", paddingLeft: 16, marginBottom: 8 }}>{children}</ul>,
                        ol: ({ children }) => <ol style={{ listStyle: "decimal", paddingLeft: 16, marginBottom: 8 }}>{children}</ol>,
                        li: ({ children }) => <li style={{ lineHeight: 1.6 }}>{children}</li>,
                        strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
                        hr: () => <hr style={{ border: "none", borderTop: `1px solid ${THEME.border}`, margin: "8px 0" }} />,
                        pre: ({ children }) => (
                          <pre style={{ backgroundColor: THEME.codeBg, color: THEME.codeText, padding: "10px 12px", borderRadius: 8, overflowX: "auto", fontSize: 11, margin: "8px 0", fontFamily: "monospace" }}>
                            {children}
                          </pre>
                        ),
                        code: ({ children, className }) =>
                          className
                            ? <code className={className} style={{ fontFamily: "monospace" }}>{children}</code>
                            : <code style={{ backgroundColor: THEME.codeInlineBg, color: THEME.codeInlineText, padding: "1px 5px", borderRadius: 4, fontSize: 11, fontFamily: "monospace" }}>{children}</code>,
                      }}>
                        {part.text}
                      </ReactMarkdown>
                    ) : null
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <form onSubmit={handleSend}
                className="px-3 sm:px-5 py-3 border-t flex gap-2 flex-shrink-0"
                style={{ backgroundColor: THEME.bg, borderColor: THEME.border }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={isBusy}
              placeholder={isBusy ? "Waiting for response…" : "Send a message…"}
              className="flex-1 px-4 py-2.5 rounded-full text-sm outline-none"
              style={{ ...S.input, opacity: isBusy ? 0.5 : 1 }}
            />
            <button
              type="submit"
              disabled={isBusy || !input.trim()}
              className="px-5 py-2.5 rounded-full text-sm font-medium flex-shrink-0"
              style={{ ...S.btn, opacity: isBusy || !input.trim() ? 0.4 : 1 }}
            >
              Send
            </button>
          </form>

        </main>
      </div>
    </>
  );
}