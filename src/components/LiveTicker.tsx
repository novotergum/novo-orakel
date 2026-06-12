"use client";

import { useEffect, useRef, useState } from "react";

interface FeedEvent {
  id: string;
  type: "registered" | "tip_placed" | "tip_changed";
  userName: string;
  ts: string;
  matchLabel?: string;
  minutesToKickoff?: number;
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

function render(ev: FeedEvent): { icon: string; text: string; hot: boolean } {
  const name = ev.userName || "Jemand";
  if (ev.type === "registered") {
    return { icon: "🆕", text: `${name} ist dabei!`, hot: false };
  }
  const hot =
    ev.type === "tip_changed" &&
    typeof ev.minutesToKickoff === "number" &&
    ev.minutesToKickoff <= LAST_MINUTE;
  const where = ev.matchLabel ? ` für ${ev.matchLabel}` : "";
  if (ev.type === "tip_changed") {
    return {
      icon: hot ? "🔥" : "✏️",
      text: hot
        ? `${name} ändert last minute den Tipp${where}! (${ev.minutesToKickoff} Min vor Anpfiff)`
        : `${name} hat den Tipp${where} geändert`,
      hot,
    };
  }
  return { icon: "✍️", text: `${name} hat${where} getippt`, hot: false };
}

export default function LiveTicker() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      // Skip polling while the tab is hidden — saves background requests.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
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
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#8a8a92",
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
        </div>

        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 7 }}>
          {events.map((ev) => {
            const r = render(ev);
            return (
              <li
                key={ev.id}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 9,
                  fontSize: 13.5,
                  lineHeight: 1.4,
                  color: r.hot ? "#c2410c" : "#33333a",
                  fontWeight: r.hot ? 600 : 400,
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
      `}</style>
    </section>
  );
}
