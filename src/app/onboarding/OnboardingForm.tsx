"use client";

import { useState } from "react";

export default function OnboardingForm({ email }: { email: string }) {
  const [userName, setUserName] = useState("");
  const [location, setLocation] = useState("");
  const [stake, setStake] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName, location, stake }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Speichern fehlgeschlagen");
        setSubmitting(false);
      } else {
        window.location.href = "/";
      }
    } catch {
      setError("Netzwerkfehler");
      setSubmitting(false);
    }
  }

  const card: React.CSSProperties = {
    background: "#ffffff",
    borderRadius: 16,
    padding: "32px",
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    maxWidth: 480,
    margin: "0 auto",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    border: "1px solid #d0d0d8",
    borderRadius: 10,
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 14,
  };

  const label: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: "#555",
    display: "block",
    marginBottom: 6,
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
      <header style={{ textAlign: "center", padding: "0 0 24px", color: "#fff" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>
          Fast fertig
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", margin: "8px 0 0" }}>
          Angemeldet als <strong style={{ color: "#fff" }}>{email}</strong>
        </p>
      </header>

      <div style={card}>
        <form onSubmit={submit}>
          <label style={label}>Dein Name (wird im Leaderboard angezeigt)</label>
          <input
            required
            autoFocus
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="Max Mustermann"
            style={input}
          />

          <label style={label}>Standort</label>
          <input
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="z. B. Hamburg"
            style={input}
          />

          <label style={label}>Einsatz (€)</label>
          <select
            value={stake}
            onChange={(e) => setStake(Number(e.target.value))}
            style={{ ...input, cursor: "pointer" }}
          >
            <option value={2}>2 €</option>
            <option value={3}>3 €</option>
            <option value={4}>4 €</option>
            <option value={5}>5 €</option>
          </select>

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
            disabled={submitting || !userName.trim() || !location.trim()}
            style={{
              width: "100%",
              padding: "12px",
              background: submitting ? "#94a3b8" : "#F39200",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: submitting ? "not-allowed" : "pointer",
              boxShadow: submitting ? "none" : "0 4px 16px rgba(243,146,0,0.35)",
              marginTop: 8,
            }}
          >
            {submitting ? "Speichere..." : "Loslegen"}
          </button>
        </form>
      </div>
    </div>
  );
}
