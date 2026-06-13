"use client";

import { useEffect, useState } from "react";

// Holt beim Laden die ausstehende, positive Rang-Bewegung des Spielers und
// zeigt EINEN motivierenden Spruch. Schliessen quittiert serverseitig, sodass
// der Spruch nicht beim naechsten Besuch erneut erscheint.
type Tier = "leader" | "podium" | "up";

// Farbstufen: Gold nur fuer die Spitze, Bronze fuers Podium, Gruen sonst.
const TIERS: Record<Tier, { bg: string; border: string; text: string; shadow: string }> = {
  leader: {
    bg: "linear-gradient(90deg, #FFF3D6 0%, #FFE9B0 100%)",
    border: "#F3C04B",
    text: "#5a4500",
    shadow: "0 4px 18px rgba(243,176,6,0.25)",
  },
  podium: {
    bg: "linear-gradient(90deg, #F6E7D8 0%, #EAD2BC 100%)",
    border: "#C8915E",
    text: "#6b4423",
    shadow: "0 4px 18px rgba(160,82,45,0.18)",
  },
  up: {
    bg: "linear-gradient(90deg, #E4F6E6 0%, #CDEBD3 100%)",
    border: "#7CC98A",
    text: "#1f5d2c",
    shadow: "0 4px 18px rgba(46,125,50,0.18)",
  },
};

export default function RankUpBanner() {
  const [message, setMessage] = useState<string | null>(null);
  const [tier, setTier] = useState<Tier>("up");
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/rank-move", { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (alive && d?.message) {
          setMessage(d.message);
          if (d.tier) setTier(d.tier as Tier);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function dismiss() {
    setClosing(true);
    // Feuer-und-vergiss: serverseitig quittieren.
    fetch("/api/rank-move", { method: "POST" }).catch(() => {});
    setTimeout(() => setMessage(null), 220);
  }

  if (!message) return null;

  const c = TIERS[tier];

  return (
    <div
      style={{
        marginBottom: 24,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 18px",
        borderRadius: 14,
        background: c.bg,
        border: `1px solid ${c.border}`,
        boxShadow: c.shadow,
        opacity: closing ? 0 : 1,
        transform: closing ? "translateY(-6px)" : "none",
        transition: "opacity 0.2s, transform 0.2s",
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 700, color: c.text, flex: 1, lineHeight: 1.35 }}>
        {message}
      </span>
      <button
        onClick={dismiss}
        aria-label="Schließen"
        style={{
          flexShrink: 0,
          background: "rgba(0,0,0,0.06)",
          border: "none",
          borderRadius: 8,
          width: 28,
          height: 28,
          cursor: "pointer",
          color: c.text,
          fontSize: 16,
          lineHeight: 1,
          fontWeight: 700,
        }}
      >
        ×
      </button>
    </div>
  );
}
