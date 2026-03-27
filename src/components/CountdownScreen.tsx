"use client";

import { useState, useEffect, FormEvent } from "react";

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
  const [email, setEmail] = useState("");
  const [nlStatus, setNlStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [nlMsg, setNlMsg] = useState("");

  useEffect(() => {
    const id = setInterval(() => setTime(calcTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  async function subscribeNewsletter(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setNlStatus("loading");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setNlStatus("ok");
        setNlMsg("Du bist dabei! Wir melden uns.");
        setEmail("");
      } else {
        setNlStatus("error");
        setNlMsg(data.error ?? "Fehler");
      }
    } catch {
      setNlStatus("error");
      setNlMsg("Netzwerkfehler");
    }
  }

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
        @keyframes orbGlow {
          0%, 100% { box-shadow: 0 0 10px rgba(120,180,255,0.3), inset 0 0 10px rgba(200,220,255,0.2); }
          50% { box-shadow: 0 0 18px rgba(120,180,255,0.5), inset 0 0 14px rgba(200,220,255,0.3); }
        }
        @keyframes pulseRing {
          0% { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(2.2); opacity: 0; }
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
            width: 260,
            height: 330,
            marginBottom: 48,
            animation: "float 4s ease-in-out infinite",
          }}
        >
          <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", zIndex: 3 }}>
            <div
              style={{
                width: 0, height: 0,
                borderLeft: "46px solid transparent",
                borderRight: "46px solid transparent",
                borderBottom: "82px solid #1a3a8a",
                margin: "0 auto",
                position: "relative",
              }}
            >
              <div style={{ position: "absolute", top: 30, left: -12, fontSize: 12, color: "#FFD700" }}>&#9733;</div>
              <div style={{ position: "absolute", top: 48, left: 10, fontSize: 9, color: "#FFD700" }}>&#9733;</div>
              <div style={{ position: "absolute", top: 18, left: 6, fontSize: 7, color: "#C0C0C0" }}>&#9733;</div>
            </div>
            <div style={{ width: 128, height: 16, background: "linear-gradient(to bottom, #C0C0C0, #8a8a8a)", borderRadius: "50%", margin: "-4px auto 0" }} />
          </div>
          <div style={{ position: "absolute", top: 82, left: "50%", transform: "translateX(-50%)", zIndex: 2 }}>
            <img src="/krabbe.png" alt="UT Orakel Krabbe" width={164} height={164} style={{ display: "block", filter: "drop-shadow(0 0 12px rgba(243,146,0,0.15))" }} />
          </div>
          <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", zIndex: 4 }}>
            <div style={{ position: "absolute", width: 66, height: 66, borderRadius: "50%", border: "1px solid rgba(120,180,255,0.25)", top: "50%", left: "50%", transform: "translate(-50%, -50%)", animation: "pulseRing 3s ease-out infinite" }} />
            <div style={{ width: 66, height: 66, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, rgba(200,220,255,0.9), rgba(80,130,220,0.6) 40%, rgba(30,50,120,0.8) 100%)", animation: "orbGlow 3s ease-in-out infinite", position: "relative" }}>
              <div style={{ position: "absolute", width: 18, height: 12, borderRadius: "50%", background: "rgba(255,255,255,0.5)", top: 14, left: 16, transform: "rotate(-30deg)" }} />
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: 24, opacity: 0.6 }}>{"\u26BD"}</div>
            </div>
          </div>
        </div>

        {/* Titel */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
          <img src="/ut-logo.png" alt="UT Logo" width={56} height={58} style={{ display: "block", opacity: 0.85, filter: "drop-shadow(0 0 6px rgba(243,146,0,0.2))" }} />
          <div>
            <h1 style={{ fontSize: 36, fontWeight: 800, margin: 0, letterSpacing: "0.02em", lineHeight: 1.1 }}>
              <span style={{ color: "#4293D0" }}>UT</span> Orakel
            </h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", margin: "4px 0 0", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              WM 2026 Tippspiel
            </p>
          </div>
        </div>

        {/* Countdown */}
        <div style={{ display: "flex", gap: "clamp(8px, 3vw, 16px)", marginBottom: 28, flexWrap: "wrap", justifyContent: "center" }}>
          {[
            { val: time.days, label: "Tage" },
            { val: time.hours, label: "Std" },
            { val: time.minutes, label: "Min" },
            { val: time.seconds, label: "Sek" },
          ].map((item) => (
            <div key={item.label} style={{ textAlign: "center" }}>
              <div style={{ width: "clamp(60px, 18vw, 80px)", height: "clamp(68px, 20vw, 88px)", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.05)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(8px)" }}>
                <span style={{ fontSize: "clamp(28px, 8vw, 40px)", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "#F39200" }}>
                  {pad(item.val)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>

        {/* Konzept-Einzeiler */}
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", textAlign: "center", maxWidth: 400, lineHeight: 1.6, margin: "0 0 32px" }}>
          Tippt Ergebnisse, sammelt Punkte, schlagt die KI.
          <br />
          <span style={{ color: "#F39200" }}>48 Teams &middot; 104 Spiele &middot; 1 Champion</span>
        </p>

        {/* ── Newsletter (primaerer CTA) ── */}
        <div
          style={{
            width: "100%",
            background: "rgba(243,146,0,0.08)",
            border: "1px solid rgba(243,146,0,0.2)",
            borderRadius: 16,
            padding: "24px",
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px", color: "#fff" }}>
            Dabei sein
          </h3>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "0 0 16px" }}>
            E-Mail eintragen &ndash; wir melden uns zum Registrierungsstart am 4. Juni.
          </p>
          {nlStatus === "ok" ? (
            <div style={{ padding: "12px 20px", background: "rgba(46,125,50,0.15)", borderRadius: 10, color: "#66bb6a", fontSize: 14, fontWeight: 600 }}>
              {nlMsg}
            </div>
          ) : (
            <form onSubmit={subscribeNewsletter} style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <input
                type="email"
                required
                placeholder="deine@email.de"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setNlStatus("idle"); }}
                style={{ flex: "1 1 200px", minWidth: 0, padding: "12px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontSize: 14, outline: "none" }}
              />
              <button
                type="submit"
                disabled={nlStatus === "loading"}
                style={{ padding: "12px 28px", background: "#F39200", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: nlStatus === "loading" ? 0.6 : 1, whiteSpace: "nowrap" }}
              >
                {nlStatus === "loading" ? "..." : "Anmelden"}
              </button>
            </form>
          )}
          {nlStatus === "error" && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#ef5350" }}>{nlMsg}</div>
          )}
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", margin: "10px 0 0" }}>
            Nur f&uuml;r United Therapy Mitarbeiter:innen
          </p>
        </div>
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
