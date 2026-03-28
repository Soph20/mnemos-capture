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

export default function LoginPage() {
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handlePinLogin() {
    if (!pin.trim() || !username.trim()) return;
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, github_username: username }),
      });

      if (!res.ok) {
        setStatus("error");
        setErrorMsg("Wrong PIN or username.");
        setPin("");
        return;
      }

      window.location.href = "/";
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong.");
      setPin("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") void handlePinLogin();
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-xs space-y-4">

        {/* Logo + wordmark */}
        <div className="flex flex-col items-center mb-10">
          <img src="/logo.png" alt="Mnemos" className="w-40 h-40 object-contain mb-4"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <h1 className="text-lg font-semibold tracking-tight" style={{ color: "var(--fg)" }}>Mnemos</h1>
          <p className="text-sm mt-1" style={{ color: "var(--fg-muted)", opacity: 0.6 }}>
            Knowledge capture for agentic workflows.
          </p>
        </div>

        {/* GitHub OAuth — primary */}
        <a
          href="/api/auth/github"
          className="w-full py-3.5 rounded-2xl font-medium text-sm transition-all flex items-center justify-center gap-2"
          style={{ background: "#2A62C6", color: "#FFFCEB", textDecoration: "none" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "#3570d4"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "#2A62C6"; }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          Sign in with GitHub
        </a>

        {/* Divider */}
        <div className="flex items-center gap-3 py-2">
          <div className="flex-1 h-px" style={{ background: "var(--gold-faint)" }} />
          <span className="text-xs" style={{ color: "var(--fg-muted)", opacity: 0.4 }}>or</span>
          <div className="flex-1 h-px" style={{ background: "var(--gold-faint)" }} />
        </div>

        {/* PIN login — returning users */}
        {!showPin ? (
          <button
            onClick={() => setShowPin(true)}
            className="w-full py-3 rounded-2xl font-medium text-sm transition-all"
            style={{ background: "transparent", border: "1px solid var(--gold-mid)", color: "var(--fg-muted)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--gold-high)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--gold-mid)"; }}
          >
            Quick unlock with PIN
          </button>
        ) : (
          <div className="space-y-2.5 rounded-2xl p-4" style={CARD_STYLE}>
            <input
              type="text"
              placeholder="GitHub username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm transition-colors focus:outline-none"
              style={INPUT_STYLE}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--gold-high)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--gold-low)"; }}
            />
            <input
              type="password"
              placeholder="PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              className="w-full rounded-xl px-3 py-2.5 text-sm transition-colors focus:outline-none"
              style={INPUT_STYLE}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--gold-high)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--gold-low)"; }}
            />
            <button
              onClick={() => void handlePinLogin()}
              disabled={!pin.trim() || !username.trim() || status === "loading"}
              className="w-full py-2.5 rounded-xl font-medium text-sm transition-all disabled:opacity-25"
              style={{ background: "#2A62C6", color: "#FFFCEB" }}
            >
              {status === "loading" ? "Checking..." : "Unlock"}
            </button>
            {status === "error" && (
              <p className="text-xs text-center" style={{ color: "#f87171" }}>{errorMsg}</p>
            )}
          </div>
        )}

        <p className="text-[11px] text-center pt-4" style={{ color: "var(--fg-muted)", opacity: 0.3 }}>
          First time? Sign in with GitHub to get started.
        </p>
      </div>
    </main>
  );
}
