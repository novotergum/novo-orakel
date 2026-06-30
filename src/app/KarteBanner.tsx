"use client";

import { useState } from "react";
import type { Card } from "../lib/store";

// Karten-Band für den eingeloggten Spieler. Zeigt gelbe/rote Karte mit
// Begründung und erlaubt Einspruch (außer die Karte ist bereits entschieden).
// Eine zurückgenommene Karte wird gar nicht erst gerendert (siehe page.tsx).
export default function KarteBanner({ card }: { card: Card }) {
  const [status, setStatus] = useState<Card["status"]>(card.status);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rot = card.level === "rot";
  const bg = rot
    ? "linear-gradient(90deg, #b71c1c 0%, #e53935 50%, #b71c1c 100%)"
    : "linear-gradient(90deg, #F2A900 0%, #FFD24D 50%, #F2A900 100%)";
  const fg = rot ? "#fff" : "#3a2c00";
  const emoji = rot ? "🟥" : "🟨";
  const titel = rot ? "Rote Karte" : "Gelbe Karte";

  async function submit() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/einspruch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Fehler beim Senden");
      setStatus("einspruch");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Senden");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ background: bg, color: fg, boxShadow: "0 2px 10px rgba(0,0,0,0.25)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "12px 20px" }}>
        <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: "0.03em" }}>
          {emoji} {titel}
          {rot && <span style={{ fontWeight: 600 }}> · aktuell aus der Wertung</span>}
        </div>
        <div style={{ fontSize: 13, marginTop: 4, opacity: 0.95 }}>
          <b>Grund:</b> {card.reason || "—"}
        </div>

        {status === "einspruch" ? (
          <div style={{ fontSize: 13, marginTop: 8, fontWeight: 700 }}>
            ✅ Dein Einspruch ist beim Schiedsrichter — Entscheidung folgt.
          </div>
        ) : status === "bestätigt" ? (
          <div style={{ fontSize: 13, marginTop: 8, fontWeight: 700 }}>
            ⚖️ Einspruch geprüft — Karte bestätigt.
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            {!open ? (
              <button
                onClick={() => setOpen(true)}
                style={{
                  background: fg,
                  color: rot ? "#b71c1c" : "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "7px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Einspruch einlegen
              </button>
            ) : (
              <div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Warum ist die Karte aus deiner Sicht nicht berechtigt?"
                  rows={3}
                  maxLength={1000}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    borderRadius: 8,
                    border: "none",
                    padding: "8px 10px",
                    fontSize: 13,
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
                {error && (
                  <div style={{ fontSize: 12, marginTop: 4, fontWeight: 700 }}>{error}</div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button
                    onClick={submit}
                    disabled={sending || text.trim().length < 3}
                    style={{
                      background: fg,
                      color: rot ? "#b71c1c" : "#fff",
                      border: "none",
                      borderRadius: 8,
                      padding: "7px 16px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: sending || text.trim().length < 3 ? "not-allowed" : "pointer",
                      opacity: sending || text.trim().length < 3 ? 0.6 : 1,
                    }}
                  >
                    {sending ? "Senden…" : "Einspruch absenden"}
                  </button>
                  <button
                    onClick={() => { setOpen(false); setError(null); }}
                    style={{
                      background: "transparent",
                      color: fg,
                      border: `1px solid ${fg}`,
                      borderRadius: 8,
                      padding: "7px 16px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
