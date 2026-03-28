"use client";

import { useState } from "react";

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--input-bg)",
  border: "1px solid var(--gold-low)",
  color: "var(--fg)",
};

const CARD_STYLE: React.CSSProperties = {
  background: "var(--card-bg)",
  border: "1px solid var(--gold-faint)",
};

export default function OnboardPage() {
  const [repoName, setRepoName] = useState("mnemos-knowledge");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<{ repo: string; repoUrl: string; apiKey: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit() {
    if (!repoName.trim() || !anthropicKey.trim() || !pin.trim()) return;
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoName: repoName.trim(), anthropicKey: anthropicKey.trim(), pin }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { repo: string; repoUrl: string; apiKey: string };
      setResult(data);
      setStatus("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  if (status === "done" && result) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center mb-2">
            <div className="text-4xl mb-4">✓</div>
            <h1 className="text-lg font-semibold tracking-tight" style={{ color: "var(--fg)" }}>
              You're all set
            </h1>
          </div>

          <div className="rounded-2xl p-4 space-y-3" style={CARD_STYLE}>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest mb-1" style={{ color: "var(--gold)" }}>Knowledge repo</p>
              <a href={result.repoUrl} target="_blank" rel="noopener noreferrer"
                className="text-sm underline" style={{ color: "var(--fg)" }}>
                {result.repo}
              </a>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest mb-1" style={{ color: "var(--gold)" }}>Your API key</p>
              <code className="text-xs block p-2 rounded-lg break-all" style={{ background: "var(--input-bg)", color: "var(--fg-muted)" }}>
                {result.apiKey}
              </code>
              <p className="text-[10px] mt-1" style={{ color: "var(--fg-muted)", opacity: 0.4 }}>
                Save this — it won't be shown again.
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest mb-1" style={{ color: "var(--gold)" }}>Connect to Claude Code</p>
              <code className="text-xs block p-2 rounded-lg break-all" style={{ background: "var(--input-bg)", color: "var(--fg-muted)" }}>
                claude mcp add mnemos -- npx mnemos-capture serve-mcp --key {result.apiKey}
              </code>
            </div>
          </div>

          <a
            href="/"
            className="w-full py-3.5 rounded-2xl font-medium text-sm transition-all flex items-center justify-center"
            style={{ background: "#2A62C6", color: "#FFFCEB", textDecoration: "none" }}
          >
            Start capturing
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4">

        <div className="flex flex-col items-center mb-6">
          <img src="/logo.png" alt="Mnemos" className="w-24 h-24 object-contain mb-4"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <h1 className="text-lg font-semibold tracking-tight" style={{ color: "var(--fg)" }}>
            Set up your knowledge hub
          </h1>
          <p className="text-sm mt-1 text-center" style={{ color: "var(--fg-muted)", opacity: 0.6 }}>
            Three things and you're capturing.
          </p>
        </div>

        {/* Step 1: Anthropic key */}
        <div className="rounded-2xl p-4 space-y-2" style={CARD_STYLE}>
          <label className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "var(--gold)" }}>
            Anthropic API key
          </label>
          <input
            type="password"
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
            placeholder="sk-ant-..."
            className="w-full rounded-xl px-3 py-2.5 text-sm transition-colors focus:outline-none font-mono"
            style={INPUT_STYLE}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--gold-high)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--gold-low)"; }}
          />
          <p className="text-[11px]" style={{ color: "var(--fg-muted)", opacity: 0.4 }}>
            Powers Claude extraction. <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)", textDecoration: "underline" }}>Get yours here</a> — free tier available.
          </p>
        </div>

        {/* Step 2: Repo name */}
        <div className="rounded-2xl p-4 space-y-2" style={CARD_STYLE}>
          <label className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "var(--gold)" }}>
            Knowledge repo name
          </label>
          <input
            type="text"
            value={repoName}
            onChange={(e) => setRepoName(e.target.value)}
            placeholder="mnemos-knowledge"
            className="w-full rounded-xl px-3 py-2.5 text-sm transition-colors focus:outline-none"
            style={INPUT_STYLE}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--gold-high)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--gold-low)"; }}
          />
          <p className="text-[11px]" style={{ color: "var(--fg-muted)", opacity: 0.4 }}>
            We'll create this repo on your GitHub. Your captures live here.
          </p>
        </div>

        {/* Step 3: PIN */}
        <div className="rounded-2xl p-4 space-y-2" style={CARD_STYLE}>
          <label className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "var(--gold)" }}>
            Set a PIN
          </label>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Quick unlock PIN"
            className="w-full rounded-xl px-3 py-2.5 text-sm transition-colors focus:outline-none"
            style={INPUT_STYLE}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--gold-high)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--gold-low)"; }}
          />
          <p className="text-[11px]" style={{ color: "var(--fg-muted)", opacity: 0.4 }}>
            For quick access from your phone — no GitHub login needed.
          </p>
        </div>

        <button
          onClick={() => void handleSubmit()}
          disabled={!repoName.trim() || !anthropicKey.trim() || !pin.trim() || status === "loading"}
          className="w-full py-3.5 rounded-2xl font-medium text-sm transition-all disabled:opacity-25 disabled:cursor-not-allowed"
          style={{ background: "#2A62C6", color: "#FFFCEB" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#3570d4"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#2A62C6"; }}
        >
          {status === "loading" ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block w-3.5 h-3.5 border-2 rounded-full animate-spin"
                style={{ borderColor: "var(--spinner-track)", borderTopColor: "var(--fg)" }} />
              Setting up...
            </span>
          ) : (
            "Create knowledge hub"
          )}
        </button>

        {status === "error" && (
          <p className="text-sm text-center" style={{ color: "#f87171" }}>{errorMsg}</p>
        )}
      </div>
    </main>
  );
}
