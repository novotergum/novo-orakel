"use client";

import { useEffect, useRef, useState } from "react";
import { deMatchLabel } from "../lib/germanize";

interface FeedEvent {
  id: string;
  type:
    | "registered"
    | "tip_placed"
    | "tip_changed"
    | "agent_tipped"
    | "took_lead"
    | "entered_podium";
  userName: string;
  ts: string;
  matchLabel?: string;
  minutesToKickoff?: number;
  count?: number;
}

const POLL_MS = 20_000;
const LAST_MINUTE = 15; // minutes-to-kickoff threshold for the "last minute" badge

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std`;
  return `vor ${Math.floor(h / 24)} Tg`;
}

function render(ev: FeedEvent): {
  icon: string;
  text: string;
  hot: boolean;
  machine: boolean;
} {
  const name = ev.userName || "Jemand";
  // UT Orakel (Maschine) – gesondertes Sammel-Event, hervorgehoben.
  if (ev.type === "agent_tipped") {
    const n = ev.count ?? 0;
    return {
      icon: "🤖",
      text: `${name} hat ${n} ${n === 1 ? "Spiel" : "Spiele"} getippt – Mensch gegen Maschine!`,
      hot: false,
      machine: true,
    };
  }
  if (ev.type === "registered") {
    return { icon: "🆕", text: `${name} ist dabei!`, hot: false, machine: false };
  }
  // Rang-Events nach Spieltag-Aufloesung (gebuendelt). Fuehrungswechsel ist das
  // Highlight -> als "hot" hervorgehoben.
  if (ev.type === "took_lead") {
    return {
      icon: "👑",
      text: `${name} übernimmt die Führung!`,
      hot: true,
      machine: false,
    };
  }
  if (ev.type === "entered_podium") {
    const n = ev.count ?? 1;
    return {
      icon: "🏆",
      text: `${name} ${n > 1 ? "klettern" : "klettert"} aufs Podium!`,
      hot: false,
      machine: false,
    };
  }
  const hot =
    ev.type === "tip_changed" &&
    typeof ev.minutesToKickoff === "number" &&
    ev.minutesToKickoff <= LAST_MINUTE;
  const where = ev.matchLabel ? ` für ${deMatchLabel(ev.matchLabel)}` : "";
  if (ev.type === "tip_changed") {
    return {
      icon: hot ? "🔥" : "✏️",
      text: hot
        ? `${name} ändert last minute den Tipp${where}! (${ev.minutesToKickoff} Min vor Anpfiff)`
        : `${name} hat den Tipp${where} geändert`,
      hot,
      machine: false,
    };
  }
  return { icon: "✍️", text: `${name} hat${where} getippt`, hot: false, machine: false };
}

export default function LiveTicker() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      // Skip polling while the tab is hidden — saves background requests.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      try {
        const pr = await fetch("/api/presence", { cache: "no-store" });
        if (pr.ok) {
          const pd = await pr.json();
          if (alive && typeof pd.count === "number") setOnlineCount(pd.count);
        }
      } catch {
        // ignore
      }
      try {
        const res = await fetch("/api/feed", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (alive && Array.isArray(data.events)) setEvents(data.events.slice(0, 8));
      } catch {
        // ignore network hiccups
      }
    }

    load();
    timer.current = setInterval(load, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      alive = false;
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (events.length === 0) return null;

  return (
    <section style={{ marginBottom: 36 }} aria-label="Live-Ticker">
      <div
        style={{
          background: "#ffffff",
          border: "1px solid rgba(0,0,0,0.06)",
          borderRadius: 16,
          padding: "18px 22px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#999",
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#42d07a",
              boxShadow: "0 0 0 0 rgba(66,208,122,0.6)",
              animation: "ticker-pulse 1.8s infinite",
            }}
          />
          Live-Ticker
          {onlineCount > 0 && (
            <span
              style={{
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                color: "#2e9e5b",
                textTransform: "none",
                letterSpacing: 0,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#42d07a",
                }}
              />
              {onlineCount} online
            </span>
          )}
        </div>

        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 7 }}>
          {events.map((ev) => {
            const r = render(ev);
            return (
              <li
                key={ev.id}
                className="ticker-item"
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 9,
                  fontSize: 13.5,
                  lineHeight: 1.4,
                  color: r.machine ? "#2f6fb0" : r.hot ? "#c2410c" : "#33333a",
                  fontWeight: r.hot || r.machine ? 600 : 400,
                  background: r.machine ? "rgba(66,147,208,0.09)" : "transparent",
                  borderRadius: 8,
                  padding: "3px 8px",
                  margin: "0 -8px",
                }}
              >
                <span style={{ fontSize: 14, flexShrink: 0 }}>{r.icon}</span>
                <span style={{ flex: 1 }}>{r.text}</span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#a0a0a8",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  {relTime(ev.ts)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <style>{`
        @keyframes ticker-pulse {
          0% { box-shadow: 0 0 0 0 rgba(66,208,122,0.5); }
          70% { box-shadow: 0 0 0 6px rgba(66,208,122,0); }
          100% { box-shadow: 0 0 0 0 rgba(66,208,122,0); }
        }
        /* Fires on mount only — React reuses DOM nodes for unchanged keys,
           so existing rows stay still and only freshly inserted events animate. */
        @keyframes ticker-enter {
          0%   { opacity: 0; transform: translateY(-8px); background: rgba(243,146,0,0.16); }
          60%  { opacity: 1; transform: translateY(0); }
          100% { background: transparent; }
        }
        .ticker-item { animation: ticker-enter 0.5s ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .ticker-item { animation: none; }
        }
      `}</style>
    </section>
  );
}
