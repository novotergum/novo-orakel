"use client";

import { useState, useEffect } from "react";

const WM_START = new Date("2026-06-11T00:00:00+02:00"); // WM 2026 Kick-off

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
        justifyContent: "center",
        background: "radial-gradient(ellipse at 50% 30%, #1a1a3e 0%, #0d0d1f 100%)",
        color: "#fff",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflow: "hidden",
        position: "relative",
        padding: "40px 20px",
      }}
    >
      {/* Sterne-Hintergrund */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {Array.from({ length: 60 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: i % 3 === 0 ? 3 : 2,
              height: i % 3 === 0 ? 3 : 2,
              borderRadius: "50%",
              background: i % 5 === 0 ? "#F39200" : "#ffffff",
              opacity: 0.3 + (i % 5) * 0.15,
              left: `${(i * 17.3) % 100}%`,
              top: `${(i * 13.7) % 100}%`,
              animation: `twinkle ${2 + (i % 3)}s ease-in-out infinite`,
              animationDelay: `${(i * 0.3) % 3}s`,
            }}
          />
        ))}
      </div>

      {/* CSS-Animationen */}
      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.5); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(120,180,255,0.4), 0 0 40px rgba(120,180,255,0.2); }
          50% { box-shadow: 0 0 30px rgba(120,180,255,0.7), 0 0 60px rgba(120,180,255,0.3), 0 0 80px rgba(243,146,0,0.15); }
        }
        @keyframes orbGlow {
          0%, 100% { box-shadow: 0 0 15px rgba(120,180,255,0.5), 0 0 30px rgba(120,180,255,0.3), inset 0 0 15px rgba(200,220,255,0.3); }
          50% { box-shadow: 0 0 25px rgba(120,180,255,0.8), 0 0 50px rgba(120,180,255,0.4), 0 0 70px rgba(243,146,0,0.2), inset 0 0 20px rgba(200,220,255,0.5); }
        }
        @keyframes pulseRing {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>

      {/* Krabbe als Zauberer */}
      <div
        style={{
          position: "relative",
          width: 220,
          height: 280,
          marginBottom: 32,
          animation: "float 4s ease-in-out infinite",
        }}
      >
        {/* Zauberhut */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 3,
          }}
        >
          {/* Hutspitze */}
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: "40px solid transparent",
              borderRight: "40px solid transparent",
              borderBottom: "70px solid #1a3a8a",
              margin: "0 auto",
              position: "relative",
            }}
          >
            {/* Sterne auf dem Hut */}
            <div style={{ position: "absolute", top: 25, left: -10, fontSize: 10, color: "#FFD700" }}>
              &#9733;
            </div>
            <div style={{ position: "absolute", top: 40, left: 8, fontSize: 8, color: "#FFD700" }}>
              &#9733;
            </div>
            <div style={{ position: "absolute", top: 15, left: 5, fontSize: 6, color: "#C0C0C0" }}>
              &#9733;
            </div>
          </div>
          {/* Hutrand */}
          <div
            style={{
              width: 110,
              height: 14,
              background: "linear-gradient(to bottom, #C0C0C0, #8a8a8a)",
              borderRadius: "50%",
              margin: "-4px auto 0",
            }}
          />
        </div>

        {/* Krabbe-Bild */}
        <div style={{ position: "absolute", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 2 }}>
          <img
            src="https://openclaws.io/images/picture.png"
            alt="UT Orakel Krabbe"
            width={140}
            height={140}
            style={{
              filter: "drop-shadow(0 0 20px rgba(243,146,0,0.3))",
            }}
          />
        </div>

        {/* Zauberkugel */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 4,
          }}
        >
          {/* Puls-Ring */}
          <div
            style={{
              position: "absolute",
              width: 56,
              height: 56,
              borderRadius: "50%",
              border: "2px solid rgba(120,180,255,0.4)",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              animation: "pulseRing 2.5s ease-out infinite",
            }}
          />
          {/* Kugel */}
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "radial-gradient(circle at 35% 35%, rgba(200,220,255,0.9), rgba(80,130,220,0.6) 40%, rgba(30,50,120,0.8) 100%)",
              animation: "orbGlow 3s ease-in-out infinite",
              position: "relative",
            }}
          >
            {/* Glanz */}
            <div
              style={{
                position: "absolute",
                width: 16,
                height: 10,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.6)",
                top: 12,
                left: 14,
                transform: "rotate(-30deg)",
              }}
            />
            {/* Fußball-Emoji in der Kugel */}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                fontSize: 20,
                opacity: 0.7,
              }}
            >
              {"\u26BD"}
            </div>
          </div>
        </div>
      </div>

      {/* Titel mit Logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          position: "relative",
          zIndex: 1,
          marginBottom: 40,
        }}
      >
        <img
          src="/ut-logo.png"
          alt="UT Logo"
          width={56}
          height={58}
          style={{
            display: "block",
            opacity: 0.85,
            filter: "drop-shadow(0 0 8px rgba(243,146,0,0.3))",
          }}
        />
        <div>
          <h1
            style={{
              fontSize: 36,
              fontWeight: 800,
              margin: 0,
              letterSpacing: "0.02em",
              lineHeight: 1.1,
            }}
          >
            <span style={{ color: "#4293D0" }}>UT</span> Orakel
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.5)",
              margin: "4px 0 0",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            WM 2026 Tippspiel
          </p>
        </div>
      </div>

      {/* Countdown */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 40,
          position: "relative",
          zIndex: 1,
        }}
      >
        {[
          { val: time.days, label: "Tage" },
          { val: time.hours, label: "Std" },
          { val: time.minutes, label: "Min" },
          { val: time.seconds, label: "Sek" },
        ].map((item) => (
          <div key={item.label} style={{ textAlign: "center" }}>
            <div
              style={{
                width: 72,
                height: 80,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.06)",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.1)",
                backdropFilter: "blur(8px)",
                animation: "glow 4s ease-in-out infinite",
              }}
            >
              <span
                style={{
                  fontSize: 36,
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                  color: "#F39200",
                }}
              >
                {pad(item.val)}
              </span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.5)",
                marginTop: 8,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              {item.label}
            </div>
          </div>
        ))}
      </div>

      {/* Untertitel */}
      <p
        style={{
          fontSize: 14,
          color: "rgba(255,255,255,0.4)",
          textAlign: "center",
          maxWidth: 320,
          lineHeight: 1.6,
          position: "relative",
          zIndex: 1,
        }}
      >
        Das Orakel bereitet sich vor&hellip;
        <br />
        Mensch gegen Maschine &ndash; bald geht&apos;s los!
      </p>

      {/* Footer */}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          fontSize: 11,
          color: "rgba(255,255,255,0.25)",
          letterSpacing: "0.05em",
        }}
      >
        Powered by{" "}
        <span style={{ color: "#F39200" }}>UT Orakel</span> &middot; Prediction
        Engine v1
      </div>
    </div>
  );
}
