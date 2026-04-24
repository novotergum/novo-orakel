"use client";

import { useEffect, useState } from "react";

export default function LoginScreen({ allowedDomains }: { allowedDomains: string[] }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  // Surface auth_error query param (from verify redirects)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const err = p.get("auth_error");
    if (!err) return;
    if (err === "expired" || err === "invalid_or_expired") setError("Der Login-Link ist abgelaufen. Bitte fordere einen neuen an.");
    else if (err === "already_used") setError("Dieser Login-Link wurde bereits verwendet. Bitte fordere einen neuen an.");
    else if (err === "missing_token") setError("Login-Link unvollständig.");
    else setError("Anmelde-Fehler. Bitte versuch es nochmal.");
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Senden fehlgeschlagen");
      } else {
        setSent(true);
      }
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setSending(false);
    }
  }

  const card: React.CSSProperties = {
    background: "#ffffff",
    borderRadius: 16,
    padding: "32px 32px",
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    maxWidth: 440,
    margin: "0 auto",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0d0d1f 0%, #0d0d1f 60%, #1a1a3e 100%)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <header style={{ textAlign: "center", padding: "0 0 32px", color: "#fff" }}>
        <img src="/ut-logo.png" alt="UT Logo" width={68} height={71} style={{ display: "block", margin: "0 auto 16px" }} />
        <h1 style={{ fontSize: 36, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>
          <span style={{ color: "#4293D0" }}>UT</span>{" "}
          <span style={{ color: "#ffffff" }}>Orakel</span>
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "rgba(255,255,255,0.55)",
            margin: "8px 0 0",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          WM 2026 · Mensch gegen Maschine
        </p>
      </header>

      <div style={card}>
        {!sent ? (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: "#2a2a2a" }}>Anmelden</h2>
            <p style={{ fontSize: 14, color: "#666", margin: "0 0 20px", lineHeight: 1.55 }}>
              Gib deine Firmen-Mail ein. Wir schicken dir einen Login-Link.
            </p>
            <form onSubmit={send}>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vorname.nachname@firma.de"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  border: "1px solid #d0d0d8",
                  borderRadius: 10,
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                  marginBottom: 12,
                }}
              />
              {error && (
                <div
                  style={{
                    color: "#c0392b",
                    fontSize: 13,
                    padding: "8px 12px",
                    background: "rgba(192,57,43,0.08)",
                    borderRadius: 8,
                    marginBottom: 12,
                  }}
                >
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={sending || !email}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: sending ? "#94a3b8" : "#F39200",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                  cursor: sending ? "not-allowed" : "pointer",
                  boxShadow: sending ? "none" : "0 4px 16px rgba(243,146,0,0.35)",
                }}
              >
                {sending ? "Sende..." : "Login-Link schicken"}
              </button>
            </form>
            {allowedDomains.length > 0 && (
              <p style={{ fontSize: 12, color: "#999", marginTop: 16, lineHeight: 1.5 }}>
                Nur Mails auf folgenden Domains: {allowedDomains.map((d) => `@${d}`).join(", ")}
              </p>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✉️</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 12px", color: "#2a2a2a" }}>Prüf deinen Posteingang</h2>
            <p style={{ fontSize: 14, color: "#666", margin: 0, lineHeight: 1.55 }}>
              Wir haben dir einen Login-Link an <strong style={{ color: "#2a2a2a" }}>{email}</strong> geschickt.
              Der Link ist 15 Minuten gültig.
            </p>
            <button
              onClick={() => {
                setSent(false);
                setEmail("");
              }}
              style={{
                marginTop: 20,
                padding: "8px 16px",
                background: "transparent",
                color: "#4293D0",
                border: "1px solid #4293D0",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Andere Email verwenden
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
