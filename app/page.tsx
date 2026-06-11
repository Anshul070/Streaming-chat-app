"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ─────────────────────────────────────────────────────────────────────────────
// THEME — edit only this object to restyle the entire app.
// Every color in the component is derived from here, nothing is hardcoded below.
// ─────────────────────────────────────────────────────────────────────────────
const THEME = {
  // Two primary brand colors
  light: "#ecf39e",   // lime yellow-green — highlights, active backgrounds
  dark:  "#90a955",   // olive green       — buttons, active borders, accents

  // Surfaces
  bg:        "#ffffff",  // main app / chat background
  bgSidebar: "#f8fbed",  // sidebar panel background
  bgHover:   "#eff8c6",  // hover background on list items
  bgInput:   "#f4f9e0",  // input / textarea fill

  // Borders
  border:      "#ddef9e",  // default border color
  borderStrong:"#90a955",  // focused / active border color

  // Text
  text:      "#1c2b08",  // primary text
  textSub:   "#4c6318",  // secondary / label text
  textMuted: "#88a038",  // muted / placeholder text

  // Primary button
  btnBg:   "#90a955",
  btnText: "#f4f9e0",

  // User message bubble
  userBg:   "#90a955",
  userText: "#f4f9e0",

  // AI message bubble
  aiBg:     "#f4f9e0",
  aiBorder: "#ddef9e",
  aiText:   "#1c2b08",

  // Code blocks
  codeBg:         "#253412",
  codeText:       "#ecf39e",
  codeInlineBg:   "#e8f5b0",
  codeInlineText: "#345010",

  // Badges
  freeBg:   "#e8f5b0",  freeTxt:  "#4c6318",
  paidBg:   "#f0f4e4",  paidTxt:  "#88a038",
};
// ─────────────────────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────
type Mode     = "eli5" | "senior" | "custom";
type Provider = "google" | "openai" | "anthropic";
interface ModelOption { id: string; name: string; provider: Provider; free: boolean; desc: string; }
interface ApiKeys     { google: string; openai: string; anthropic: string; }

// ─── Data ─────────────────────────────────────────────────────────────────────
const MODELS: ModelOption[] = [
  { id: "gemini-3.1-flash-lite",      name: "Gemini 3.1 Flash-Lite", provider: "google",    free: true,  desc: "Fastest & cheapest" },
  { id: "gemini-2.5-flash",           name: "Gemini 2.5 Flash",      provider: "google",    free: true,  desc: "Balanced speed + quality" },
  { id: "gemini-3.5-flash",           name: "Gemini 3.5 Flash",      provider: "google",    free: false, desc: "Best reasoning in Flash line" },
  { id: "gemini-3.1-pro-preview",     name: "Gemini 3.1 Pro",        provider: "google",    free: false, desc: "Flagship Google model" },
  { id: "gpt-4o-mini",                name: "GPT-4o Mini",           provider: "openai",    free: false, desc: "Fast and affordable" },
  { id: "gpt-4o",                     name: "GPT-4o",                provider: "openai",    free: false, desc: "Most capable OpenAI" },
  { id: "claude-haiku-4-5-20251001",  name: "Claude Haiku",          provider: "anthropic", free: false, desc: "Fastest Anthropic" },
  { id: "claude-sonnet-4-6",          name: "Claude Sonnet 4.6",     provider: "anthropic", free: false, desc: "Balanced Anthropic" },
];

const PROVIDERS: Provider[] = ["google", "openai", "anthropic"];
const PROVIDER_LABEL: Record<Provider, string> = { google: "Google", openai: "OpenAI", anthropic: "Anthropic" };
const MODE_LABEL:     Record<Mode, string>     = { eli5: "ELI5", senior: "Senior Dev", custom: "Custom" };

function readLS<T>(key: string, fb: T): T {
  if (typeof window === "undefined") return fb;
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch { return fb; }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [input,           setInput]           = useState("");
  const [mode,            setMode]            = useState<Mode>("senior");
  const [systemPrompt,    setSystemPrompt]    = useState("");
  const [temperature,     setTemperature]     = useState(0.7);
  const [topP,            setTopP]            = useState(0.9);
  const [selectedId,      setSelectedId]      = useState(() => readLS("aic_model", "gemini-3.1-flash-lite"));
  const [customModelId,   setCustomModelId]   = useState("");
  const [customProvider,  setCustomProvider]  = useState<Provider>("google");
  const [apiKeys,         setApiKeys]         = useState<ApiKeys>(() => readLS("aic_keys", { google: "", openai: "", anthropic: "" }));
  const [showKeys,        setShowKeys]        = useState(false);
  const [dropdownOpen,    setDropdownOpen]    = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);

  const isCustom      = selectedId === "__custom__";
  const activeModel   = MODELS.find(m => m.id === selectedId) ?? MODELS[0];
  const effectiveId   = isCustom ? customModelId  : selectedId;
  const effectiveProv = isCustom ? customProvider : activeModel.provider;

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  useEffect(() => { localStorage.setItem("aic_model", JSON.stringify(selectedId)); }, [selectedId]);
  useEffect(() => { localStorage.setItem("aic_keys",  JSON.stringify(apiKeys));    }, [apiKeys]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" });     }, [messages]);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status !== "ready") return;
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

  // ── Shared style helpers (keeps JSX clean) ─────────────────────────────────
  const S = {
    sidebar:      { backgroundColor: THEME.bgSidebar, borderRightColor: THEME.border } as React.CSSProperties,
    sectionLabel: { color: THEME.textMuted, fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.08em" },
    modeBtn: (active: boolean): React.CSSProperties => active
      ? { backgroundColor: THEME.dark,   color: THEME.btnText, border: `1px solid ${THEME.dark}` }
      : { backgroundColor: "transparent", color: THEME.textSub,  border: "1px solid transparent" },
    input: { backgroundColor: THEME.bgInput, border: `1px solid ${THEME.border}`, color: THEME.text },
    dropdownTrigger: { backgroundColor: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.text },
    dropdownPanel:   { backgroundColor: THEME.bg, border: `1px solid ${THEME.border}` },
    groupHeader:     { backgroundColor: THEME.bgSidebar, color: THEME.textMuted },
    modelRow: (active: boolean): React.CSSProperties => ({
      backgroundColor: active ? THEME.bgHover : "transparent",
      color: THEME.text,
    }),
    badge: (free: boolean): React.CSSProperties => ({
      backgroundColor: free ? THEME.freeBg : THEME.paidBg,
      color:           free ? THEME.freeTxt : THEME.paidTxt,
    }),
    btn: { backgroundColor: THEME.btnBg, color: THEME.btnText } as React.CSSProperties,
    userBubble: { backgroundColor: THEME.userBg,  color: THEME.userText } as React.CSSProperties,
    aiBubble:   { backgroundColor: THEME.aiBg,    color: THEME.aiText, border: `1px solid ${THEME.aiBorder}` } as React.CSSProperties,
    chatHeader: { backgroundColor: THEME.bg, borderBottomColor: THEME.border } as React.CSSProperties,
    inputBar:   { backgroundColor: THEME.bg, borderTopColor:    THEME.border } as React.CSSProperties,
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: THEME.bg, color: THEME.text, fontFamily: "sans-serif" }}>

      {/* ══ SIDEBAR ═══════════════════════════════════════════════════════════ */}
      <aside className="w-64 flex-shrink-0 flex flex-col overflow-y-auto border-r" style={S.sidebar}>

        {/* Brand */}
        <div className="px-5 py-4 border-b" style={{ borderColor: THEME.border }}>
          <p className="text-sm font-semibold" style={{ color: THEME.text }}>AI Chat</p>
          <p className="text-xs mt-0.5"        style={{ color: THEME.textMuted }}>LLM Engineering</p>
        </div>

        <div className="flex-1 px-5 py-5 space-y-6 overflow-y-auto">

          {/* Mode */}
          <div>
            <p className="mb-2" style={S.sectionLabel}>Style</p>
            <div className="flex flex-col gap-1">
              {(["eli5", "senior", "custom"] as Mode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="text-left px-3 py-1.5 rounded-lg text-sm transition-colors"
                  style={S.modeBtn(mode === m)}
                  onMouseEnter={e => { if (mode !== m) (e.currentTarget as HTMLElement).style.backgroundColor = THEME.bgHover; }}
                  onMouseLeave={e => { if (mode !== m) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          </div>

          {/* System prompt */}
          <div>
            <p className="mb-2" style={S.sectionLabel}>System prompt</p>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              disabled={mode !== "custom"}
              placeholder={mode === "custom" ? "Write your prompt…" : "Enable Custom mode to edit"}
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none transition-opacity"
              style={{
                ...S.input,
                opacity: mode !== "custom" ? 0.4 : 1,
                cursor:  mode !== "custom" ? "not-allowed" : "text",
              }}
            />
          </div>

          {/* Model selector */}
          <div ref={dropdownRef}>
            <p className="mb-2" style={S.sectionLabel}>Model</p>

            {/* Trigger button */}
            <button
              onClick={() => setDropdownOpen(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm"
              style={S.dropdownTrigger}
            >
              <span className="truncate">{isCustom ? "Custom model" : activeModel.name}</span>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                {!isCustom && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={S.badge(activeModel.free)}>
                    {activeModel.free ? "free" : "paid"}
                  </span>
                )}
                <svg
                  className="w-3 h-3 transition-transform"
                  style={{ transform: dropdownOpen ? "rotate(180deg)" : "none", color: THEME.textMuted }}
                  viewBox="0 0 10 10" fill="none"
                >
                  <path d="M1.5 3.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>

            {/* Dropdown panel */}
            {dropdownOpen && (
              <div className="mt-1 rounded-lg shadow-md overflow-hidden max-h-64 overflow-y-auto" style={S.dropdownPanel}>
                {PROVIDERS.map(prov => (
                  <div key={prov}>
                    {/* Provider group header */}
                    <p
                      className="px-3 py-1.5 border-b"
                      style={{ ...S.groupHeader, borderColor: THEME.border, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}
                    >
                      {PROVIDER_LABEL[prov]}
                    </p>
                    {MODELS.filter(m => m.provider === prov).map(m => (
                      <button
                        key={m.id}
                        onClick={() => { setSelectedId(m.id); setDropdownOpen(false); }}
                        className="w-full flex items-center justify-between px-3 py-2 text-left text-sm border-b transition-colors"
                        style={{ ...S.modelRow(selectedId === m.id), borderColor: THEME.border + "44" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = THEME.bgHover; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = selectedId === m.id ? THEME.bgHover : "transparent"; }}
                      >
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
                {/* Custom model entry */}
                <button
                  onClick={() => { setSelectedId("__custom__"); setDropdownOpen(false); }}
                  className="w-full px-3 py-2 text-left text-sm"
                  style={{ ...S.modelRow(isCustom) }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = THEME.bgHover; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = isCustom ? THEME.bgHover : "transparent"; }}
                >
                  <span style={{ color: THEME.textSub }}>Custom model ID…</span>
                </button>
              </div>
            )}

            {/* Custom model inputs */}
            {isCustom && (
              <div className="mt-2 space-y-2">
                <input
                  value={customModelId}
                  onChange={e => setCustomModelId(e.target.value)}
                  placeholder="e.g. gpt-4o-mini"
                  className="w-full px-3 py-2 rounded-lg text-[12px] font-mono outline-none"
                  style={S.input}
                />
                <div className="flex gap-1">
                  {PROVIDERS.map(prov => (
                    <button
                      key={prov}
                      onClick={() => setCustomProvider(prov)}
                      className="flex-1 py-1.5 rounded-lg text-[11px] transition-colors"
                      style={customProvider === prov
                        ? { backgroundColor: THEME.dark,         color: THEME.btnText,  border: `1px solid ${THEME.dark}` }
                        : { backgroundColor: "transparent",       color: THEME.textMuted, border: `1px solid ${THEME.border}` }
                      }
                    >
                      {PROVIDER_LABEL[prov]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* API Keys */}
          <div>
            <button
              onClick={() => setShowKeys(v => !v)}
              className="w-full flex items-center justify-between"
            >
              <p style={S.sectionLabel}>API Keys</p>
              <svg
                className="w-3 h-3 transition-transform"
                style={{ transform: showKeys ? "rotate(180deg)" : "none", color: THEME.textMuted }}
                viewBox="0 0 10 10" fill="none"
              >
                <path d="M1.5 3.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showKeys && (
              <div className="mt-2 space-y-2">
                <p className="text-[11px] leading-relaxed rounded-lg px-3 py-2" style={{ color: THEME.textMuted, backgroundColor: THEME.bgInput, border: `1px solid ${THEME.border}` }}>
                  Stored in localStorage. Falls back to server <code style={{ color: THEME.textSub }}>.env</code> if empty.
                </p>
                {PROVIDERS.map(prov => (
                  <div key={prov} className="flex items-center gap-2">
                    <span className="text-[11px] w-14 flex-shrink-0" style={{ color: THEME.textSub }}>{PROVIDER_LABEL[prov]}</span>
                    <input
                      type="password"
                      value={apiKeys[prov]}
                      onChange={e => setApiKeys(prev => ({ ...prev, [prov]: e.target.value }))}
                      placeholder="sk-..."
                      className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-mono outline-none"
                      style={S.input}
                    />
                    {apiKeys[prov] && <span className="text-[11px]" style={{ color: THEME.dark }}>✓</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sampling */}
          <div>
            <p className="mb-3" style={S.sectionLabel}>Sampling</p>
            <div className="space-y-4">

              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: THEME.textSub }}>
                  <span>Temperature</span>
                  <span className="font-mono">{temperature.toFixed(1)}</span>
                </div>
                <input
                  type="range" min={0} max={20} step={1}
                  value={Math.round(temperature * 10)}
                  onChange={e => setTemperature(Number(e.target.value) / 10)}
                  className="w-full"
                  style={{ accentColor: THEME.dark }}
                />
                <p className="text-[10px] mt-1" style={{ color: THEME.textMuted }}>Higher = more creative</p>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: THEME.textSub }}>
                  <span>Top-P</span>
                  <span className="font-mono">{topP.toFixed(2)}</span>
                </div>
                <input
                  type="range" min={0} max={100} step={5}
                  value={Math.round(topP * 100)}
                  onChange={e => setTopP(Number(e.target.value) / 100)}
                  className="w-full"
                  style={{ accentColor: THEME.dark }}
                />
                <p className="text-[10px] mt-1" style={{ color: THEME.textMuted }}>Nucleus sampling breadth</p>
              </div>

            </div>
          </div>

        </div>
      </aside>

      {/* ══ CHAT ══════════════════════════════════════════════════════════════ */}
      <main className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: THEME.bg }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b" style={S.chatHeader}>
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: THEME.text }}>
              {isCustom ? (customModelId || "Custom") : activeModel.name}
            </span>
            {!isCustom && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={S.badge(activeModel.free)}>
                {activeModel.free ? "free" : "paid"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: status === "ready" ? THEME.dark : THEME.light }}
            />
            <span className="text-xs" style={{ color: THEME.textMuted }}>
              {status === "ready" ? "Ready" : "Streaming…"}
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm" style={{ color: THEME.textMuted }}>Send a message to start.</p>
            </div>
          )}
          {messages.map(message => (
            <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                style={message.role === "user"
                  ? { ...S.userBubble, borderRadius: "18px 18px 4px 18px" }
                  : { ...S.aiBubble,   borderRadius: "18px 18px 18px 4px" }
                }
              >
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
                          ? <code style={{ fontFamily: "monospace" }} className={className}>{children}</code>
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
        <form onSubmit={handleSend} className="px-5 py-4 border-t flex gap-2" style={S.inputBar}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={status !== "ready"}
            placeholder="Send a message…"
            className="flex-1 px-4 py-2.5 rounded-full text-sm outline-none transition-opacity"
            style={{ ...S.input, opacity: status !== "ready" ? 0.5 : 1 }}
          />
          <button
            type="submit"
            disabled={status !== "ready" || !input.trim()}
            className="px-5 py-2.5 rounded-full text-sm font-medium transition-opacity"
            style={{ ...S.btn, opacity: status !== "ready" || !input.trim() ? 0.4 : 1 }}
          >
            Send
          </button>
        </form>

      </main>
    </div>
  );
}