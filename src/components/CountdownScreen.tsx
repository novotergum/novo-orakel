"use client";

import { useState, useEffect } from "react";

const WM_START = new Date("2026-06-11T00:00:00+02:00");

function calcTimeLeft() {
  const now = new Date().getTime();
  const diff = WM_START.getTime() - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

const stars = [
  { x: 5, y: 8, size: 2, orange: false, delay: 0 },
  { x: 15, y: 22, size: 3, orange: true, delay: 0.8 },
  { x: 28, y: 5, size: 2, orange: false, delay: 1.5 },
  { x: 38, y: 35, size: 2, orange: false, delay: 0.3 },
  { x: 50, y: 12, size: 3, orange: false, delay: 2.1 },
  { x: 62, y: 28, size: 2, orange: true, delay: 1.0 },
  { x: 72, y: 7, size: 2, orange: false, delay: 0.5 },
  { x: 85, y: 18, size: 3, orange: false, delay: 1.8 },
  { x: 92, y: 32, size: 2, orange: false, delay: 0.2 },
  { x: 10, y: 45, size: 2, orange: false, delay: 2.5 },
  { x: 22, y: 58, size: 2, orange: true, delay: 0.7 },
  { x: 42, y: 52, size: 3, orange: false, delay: 1.3 },
  { x: 55, y: 65, size: 2, orange: false, delay: 2.0 },
  { x: 68, y: 48, size: 2, orange: false, delay: 0.4 },
  { x: 78, y: 60, size: 3, orange: true, delay: 1.6 },
  { x: 88, y: 72, size: 2, orange: false, delay: 0.9 },
  { x: 8, y: 78, size: 2, orange: false, delay: 2.3 },
  { x: 33, y: 82, size: 2, orange: false, delay: 1.1 },
  { x: 48, y: 88, size: 3, orange: false, delay: 0.6 },
  { x: 65, y: 85, size: 2, orange: true, delay: 1.9 },
  { x: 82, y: 90, size: 2, orange: false, delay: 0.1 },
  { x: 95, y: 55, size: 2, orange: false, delay: 2.7 },
  { x: 3, y: 62, size: 3, orange: false, delay: 1.4 },
  { x: 18, y: 92, size: 2, orange: false, delay: 0.8 },
  { x: 75, y: 38, size: 2, orange: false, delay: 2.2 },
];

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: "20px 24px",
};

export default function CountdownScreen() {
  const [time, setTime] = useState(calcTimeLeft);

  useEffect(() => {
    const id = setInterval(() => setTime(calcTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: "radial-gradient(ellipse at 50% 30%, #1a1a3e 0%, #0d0d1f 100%)",
        color: "#fff",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflow: "hidden",
        position: "relative",
        padding: "0 20px",
      }}
    >
      {/* Sterne */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {stars.map((s, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: s.size,
              height: s.size,
              borderRadius: "50%",
              background: s.orange ? "#F39200" : "#ffffff",
              opacity: 0.4,
              left: `${s.x}%`,
              top: `${s.y}%`,
              animation: `twinkle ${2.5 + (i % 2)}s ease-in-out infinite`,
              animationDelay: `${s.delay}s`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.3); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-14px); }
        }
      `}</style>

      {/* ═══════════════ HERO ZONE ═══════════════ */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 520,
        }}
      >
        {/* Krabbe */}
        <div
          style={{
            position: "relative",
            width: 200,
            height: 190,
            marginBottom: 24,
            animation: "float 4s ease-in-out infinite",
          }}
        >
          <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", zIndex: 3 }}>
            <div
              style={{
                width: 0, height: 0,
                borderLeft: "34px solid transparent",
                borderRight: "34px solid transparent",
                borderBottom: "62px solid #1a3a8a",
                margin: "0 auto",
                position: "relative",
              }}
            >
              <div style={{ position: "absolute", top: 22, left: -9, fontSize: 10, color: "#FFD700" }}>&#9733;</div>
              <div style={{ position: "absolute", top: 36, left: 8, fontSize: 7, color: "#FFD700" }}>&#9733;</div>
              <div style={{ position: "absolute", top: 14, left: 4, fontSize: 6, color: "#C0C0C0" }}>&#9733;</div>
            </div>
            <div style={{ width: 96, height: 12, background: "linear-gradient(to bottom, #C0C0C0, #8a8a8a)", borderRadius: "50%", margin: "-3px auto 0" }} />
          </div>
          <div style={{ position: "absolute", top: 58, left: "50%", transform: "translateX(-50%)", zIndex: 2 }}>
            <img src="/krabbe.png" alt="UT Orakel Krabbe" width={120} height={120} style={{ display: "block", filter: "drop-shadow(0 0 12px rgba(243,146,0,0.15))" }} />
          </div>
        </div>

        {/* Titel */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
          <img src="/ut-logo.png" alt="UT Logo" width={48} height={50} style={{ display: "block", opacity: 0.85, filter: "drop-shadow(0 0 6px rgba(243,146,0,0.2))" }} />
          <div>
            <p style={{ fontSize: 15, color: "#F39200", margin: "0 0 2px", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700 }}>
              WM 2026 Tippspiel
            </p>
            <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, letterSpacing: "0.02em", lineHeight: 1.1 }}>
              <span style={{ color: "#4293D0" }}>UT</span> Orakel
            </h1>
          </div>
        </div>

        {/* Countdown */}
        <div style={{ display: "flex", gap: "clamp(10px, 3vw, 18px)", marginBottom: 16, flexWrap: "wrap", justifyContent: "center" }}>
          {[
            { val: time.days, label: "Tage" },
            { val: time.hours, label: "Std" },
            { val: time.minutes, label: "Min" },
            { val: time.seconds, label: "Sek" },
          ].map((item) => (
            <div key={item.label} style={{ textAlign: "center" }}>
              <div style={{ width: "clamp(64px, 20vw, 88px)", height: "clamp(72px, 22vw, 96px)", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.06)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(8px)" }}>
                <span style={{ fontSize: "clamp(34px, 10vw, 48px)", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "#F39200" }}>
                  {pad(item.val)}
                </span>
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600 }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>

        {/* Konzept-Einzeiler */}
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", textAlign: "center", maxWidth: 380, lineHeight: 1.5, margin: "0 0 24px", fontWeight: 500 }}>
          Tipp. Triff. Schlag die KI.
          <br />
          <span style={{ color: "#F39200", fontSize: 13 }}>48 Teams &middot; 104 Spiele &middot; 1 Champion</span>
        </p>

      </div>

      {/* ═══════════════ BELOW THE FOLD ═══════════════ */}
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 520, paddingBottom: 60 }}>

        {/* Spielregeln — kompakt */}
        <div style={{ ...card, marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 10px", color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            So funktioniert&apos;s
          </h3>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.8 }}>
            {[
              "Tendenz richtig = 2P &middot; Differenz = 3P &middot; Exakt = 4P",
              "K.O.-Bonus: bis 3x Punkte im Finale",
              "Das UT Orakel (KI) spielt mit &ndash; kannst du es schlagen?",
            ].map((rule, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ color: "#F39200", fontSize: 8, flexShrink: 0 }}>{"\u25CF"}</span>
                <span dangerouslySetInnerHTML={{ __html: rule }} />
              </div>
            ))}
          </div>
        </div>

        {/* Termine — einzeilig */}
        <div style={{ ...card, marginBottom: 12, padding: "16px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.4)", flexWrap: "wrap", gap: "8px 16px" }}>
            <span><span style={{ color: "#F39200", fontWeight: 700 }}>4. Jun</span> Registrierung</span>
            <span><span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>11. Jun</span> Anpfiff</span>
            <span><span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>19. Jul</span> Finale</span>
          </div>
        </div>

        {/* Preise — minimal */}
        <div style={{ ...card, marginBottom: 12, textAlign: "center", padding: "16px 24px" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 24, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
            <span><span style={{ fontSize: 18 }}>{"\uD83C\uDFC6"}</span> <span style={{ color: "#F39200", fontWeight: 700 }}>1.</span></span>
            <span><span style={{ fontSize: 18 }}>{"\uD83E\uDD48"}</span> <span style={{ fontWeight: 600 }}>2.</span></span>
            <span><span style={{ fontSize: 18 }}>{"\uD83E\uDD49"}</span> <span style={{ fontWeight: 600 }}>3.</span></span>
          </div>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", margin: "8px 0 0" }}>
            Preise werden mit Registrierungsstart bekanntgegeben
          </p>
        </div>

        {/* Footer */}
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center", marginTop: 20, letterSpacing: "0.04em" }}>
          United Therapy GmbH
        </p>
      </div>
    </div>
  );
}
