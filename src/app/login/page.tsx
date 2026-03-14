"use client";

import { useState } from "react";

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--input-bg)",
  border: "1px solid var(--gold-low)",
  color: "var(--fg)",
};

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function handleSubmit() {
    if (!pin.trim()) return;
    setStatus("loading");

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      if (!res.ok) {
        setStatus("error");
        setPin("");
        return;
      }

      window.location.href = "/";
    } catch {
      setStatus("error");
      setPin("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") void handleSubmit();
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
            Enter your PIN to continue.
          </p>
        </div>

        <input
          type="password"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          className="w-full rounded-2xl px-4 py-3 text-base transition-colors focus:outline-none"
          style={INPUT_STYLE}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--gold-high)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--gold-low)"; }}
        />

        <button
          onClick={() => void handleSubmit()}
          disabled={!pin.trim() || status === "loading"}
          className="w-full py-3.5 rounded-2xl font-medium text-sm transition-all disabled:opacity-25 disabled:cursor-not-allowed"
          style={{ background: "#2A62C6", color: "#FFFCEB" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#3570d4"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#2A62C6"; }}
        >
          {status === "loading" ? "Checking..." : "Unlock"}
        </button>

        {status === "error" && (
          <p className="text-sm text-center" style={{ color: "#f87171" }}>Wrong PIN.</p>
        )}
      </div>
    </main>
  );
}
