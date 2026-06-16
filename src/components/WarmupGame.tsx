"use client";

import { useState } from "react";

const card: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.06)",
  boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
  overflow: "hidden",
};

export default function WarmupGame() {
  const [play, setPlay] = useState(false);

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ ...card, padding: play ? 0 : "24px 28px" }}>
        {!play ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 20 }}>{"⚽"}</span>
              <h2
                style={{
                  fontSize: 13,
                  color: "#999",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: 0,
                  fontWeight: 600,
                }}
              >
                Warm-up
              </h2>
              <span
                style={{
                  fontSize: 9,
                  padding: "2px 7px",
                  background: "#F39200",
                  color: "#fff",
                  borderRadius: 4,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Spiel
              </span>
            </div>
            <p style={{ fontSize: 14, color: "#555", lineHeight: 1.6, margin: "0 0 18px" }}>
              Elfmeterschie&szlig;en: F&uuml;hr <b style={{ color: "#4293D0" }}>United Therapy</b>{" "}
              im Penalty-Duell gegen APELOS. Wischen zum Schie&szlig;en, Zone tippen zum Halten &ndash;
              geht auch am Handy.
            </p>
            <button
              onClick={() => setPlay(true)}
              style={{
                cursor: "pointer",
                border: "none",
                fontFamily: "inherit",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                fontSize: 14,
                color: "#fff",
                background: "linear-gradient(135deg,#F8A82B,#F39200)",
                padding: "12px 30px",
                borderRadius: 40,
                boxShadow: "0 8px 22px rgba(243,146,0,0.35)",
              }}
            >
              Anpfiff &rarr;
            </button>
          </>
        ) : (
          <>
            <iframe
              src="/elfmeter.html"
              title="Elfmeter Arena – United Therapy vs APELOS"
              style={{
                width: "100%",
                height: "min(78vh, 640px)",
                border: "none",
                display: "block",
                background: "#05060c",
              }}
              allow="fullscreen"
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 16px",
                background: "#f5f5f7",
                borderTop: "1px solid #eee",
              }}
            >
              <span style={{ fontSize: 11, color: "#888" }}>
                <b style={{ color: "#4293D0" }}>Wischen</b> zum Schie&szlig;en &middot;{" "}
                <b style={{ color: "#4293D0" }}>Zone tippen</b> zum Halten
              </span>
              <button
                onClick={() => setPlay(false)}
                style={{
                  cursor: "pointer",
                  border: "1px solid rgba(0,0,0,0.15)",
                  fontFamily: "inherit",
                  fontWeight: 600,
                  fontSize: 11,
                  color: "#666",
                  background: "transparent",
                  padding: "6px 14px",
                  borderRadius: 20,
                }}
              >
                Schlie&szlig;en
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
