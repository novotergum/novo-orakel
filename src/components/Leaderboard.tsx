"use client";

import { useEffect, useState } from "react";

interface Entry {
  userId: string;
  userName: string;
  source: "human" | "agent";
  points: number;
  tips: number;
  exact: number;
  diffCorrect: number;
  tendencyCorrect: number;
  rank: number; // Competition-Rang: Punktgleiche teilen sich denselben Rang
}

const card: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 16,
  padding: "24px 28px",
  border: "1px solid rgba(0,0,0,0.06)",
  boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
};

function OnlineTag({ label }: { label?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, verticalAlign: "middle" }}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "#42d07a",
          boxShadow: "0 0 0 0 rgba(66,208,122,0.6)",
          animation: "presence-pulse 1.8s infinite",
          flexShrink: 0,
        }}
      />
      {label && (
        <span
          style={{
            fontSize: 10,
            color: "#2e9e5b",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Online
        </span>
      )}
    </span>
  );
}

export default function Leaderboard({
  top3,
  rest,
  currentUserId,
}: {
  top3: Entry[];
  rest: Entry[];
  currentUserId: string;
}) {
  const [online, setOnline] = useState<Set<string>>(new Set());

  // Heartbeat (alle 30 s) + Online-Liste pollen (alle 25 s). Pausiert, wenn der
  // Tab im Hintergrund ist; aktualisiert sofort beim Zurueckkehren.
  useEffect(() => {
    let alive = true;
    const hidden = () =>
      typeof document !== "undefined" && document.visibilityState === "hidden";

    async function beat() {
      if (hidden()) return;
      try {
        await fetch("/api/presence", { method: "POST", cache: "no-store" });
      } catch {
        /* ignore */
      }
    }
    async function load() {
      if (hidden()) return;
      try {
        const r = await fetch("/api/presence", { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (alive && Array.isArray(d.online)) setOnline(new Set(d.online));
      } catch {
        /* ignore */
      }
    }

    beat();
    load();
    const b = setInterval(beat, 30_000);
    const l = setInterval(load, 25_000);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        beat();
        load();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(b);
      clearInterval(l);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <>
      {/* ── Top 3 Podium ── */}
      {top3.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <h2
            style={{
              fontSize: 13,
              color: "#999",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 20,
              fontWeight: 600,
            }}
          >
            Podium
          </h2>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", alignItems: "flex-end" }}>
            {top3.map((entry, i) => {
              // Medaillenfarbe nach Rang, nicht nach Position: geteilter Platz 1
              // -> beide Gold, geteilter Platz 2 -> beide Silber usw.
              const medalByRank: Record<number, string> = {
                1: "#F39200",
                2: "#8a8a8a",
                3: "#A0522D",
              };
              const color = medalByRank[entry.rank] ?? "#A0522D";
              const isFirst = i === 0;
              const isOnline = entry.source === "human" && online.has(entry.userId);
              const isMe = entry.userId === currentUserId;
              return (
                <div
                  key={entry.userId}
                  style={{
                    ...card,
                    flex: isFirst ? 1.3 : 1,
                    textAlign: "center",
                    position: "relative",
                    paddingTop: isFirst ? 44 : 36,
                    paddingBottom: isFirst ? 28 : 24,
                    borderTop: `${isFirst ? 4 : 3}px solid ${color}`,
                    outline: isMe ? "2px solid #4293D0" : undefined,
                    outlineOffset: isMe ? "1px" : undefined,
                    boxShadow: isFirst
                      ? `0 4px 24px ${color}22, 0 2px 12px rgba(0,0,0,0.06)`
                      : "0 2px 12px rgba(0,0,0,0.04)",
                  }}
                >
                  {isMe && (
                    <span
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        fontSize: 9,
                        padding: "2px 6px",
                        background: "#4293D0",
                        color: "#fff",
                        borderRadius: 4,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Du
                    </span>
                  )}
                  <div
                    style={{
                      position: "absolute",
                      top: isFirst ? -22 : -18,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: isFirst ? 44 : 36,
                      height: isFirst ? 44 : 36,
                      borderRadius: "50%",
                      background: color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: isFirst ? 20 : 16,
                      fontWeight: 800,
                      color: "#fff",
                      boxShadow: `0 3px 12px ${color}55`,
                    }}
                  >
                    {entry.rank}
                  </div>

                  <div style={{ fontSize: isFirst ? 18 : 15, fontWeight: 700, color: "#2a2a2a", marginBottom: 4 }}>
                    {entry.userName}
                  </div>
                  {isOnline && (
                    <div style={{ marginBottom: 4 }}>
                      <OnlineTag label />
                    </div>
                  )}
                  {entry.source === "agent" && (
                    <span
                      style={{
                        fontSize: 9,
                        padding: "2px 6px",
                        background: "#4293D0",
                        color: "#fff",
                        borderRadius: 4,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        fontWeight: 700,
                      }}
                    >
                      Agent
                    </span>
                  )}
                  <div
                    style={{
                      fontSize: isFirst ? 56 : 40,
                      fontWeight: 800,
                      color: color,
                      lineHeight: 1,
                      margin: isFirst ? "12px 0 6px" : "8px 0 4px",
                    }}
                  >
                    {entry.points}
                  </div>
                  <div style={{ fontSize: isFirst ? 12 : 11, color: "#999" }}>Punkte</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Leaderboard (ab Platz 4) ── */}
      {rest.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <details style={{ ...card, padding: 0, overflow: "hidden" }}>
            <summary
              style={{
                listStyle: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 24px",
                fontSize: 13,
                color: "#999",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 600,
                userSelect: "none",
              }}
            >
              <span>Leaderboard ab Platz {rest[0].rank}</span>
              <span style={{ fontSize: 12, color: "#bbb" }}>anzeigen ▾</span>
            </summary>
            <div style={{ overflowX: "auto", borderTop: "1px solid #f0f0f0" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 14,
                  minWidth: 480,
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid #eee",
                      color: "#999",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    <th style={{ padding: "14px 16px", width: 40, textAlign: "center" }}>#</th>
                    <th style={{ padding: "14px 16px", textAlign: "left" }}>Spieler</th>
                    <th style={{ padding: "14px 16px", textAlign: "right" }}>Punkte</th>
                    <th style={{ padding: "14px 16px", textAlign: "right" }} title="Abgegebene Tipps insgesamt">Getippt</th>
                    <th style={{ padding: "14px 16px", textAlign: "right" }} title="Exaktes Ergebnis = 4 Punkte">Exakt &times;4</th>
                    <th style={{ padding: "14px 16px", textAlign: "right" }} title="Richtige Tordifferenz = 3 Punkte">Diff &times;3</th>
                    <th style={{ padding: "14px 16px", textAlign: "right" }} title="Richtige Tendenz = 2 Punkte">Tendenz &times;2</th>
                  </tr>
                </thead>
                <tbody>
                  {rest.map((entry, i) => {
                    const isOnline = entry.source === "human" && online.has(entry.userId);
                    const isMe = entry.userId === currentUserId;
                    return (
                      <tr
                        key={entry.userId}
                        style={{
                          borderBottom: i < rest.length - 1 ? "1px solid #f0f0f0" : "none",
                          background: isMe ? "#eaf4fb" : undefined,
                        }}
                      >
                        <td style={{ padding: "14px 16px", textAlign: "center", color: isMe ? "#4293D0" : "#bbb", fontWeight: isMe ? 800 : 600 }}>
                          {entry.rank}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <span style={{ color: "#2a2a2a", fontWeight: isMe ? 800 : 600 }}>
                            {entry.userName}
                          </span>
                          {isMe && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 9,
                                padding: "2px 6px",
                                background: "#4293D0",
                                color: "#fff",
                                borderRadius: 4,
                                verticalAlign: "middle",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                              }}
                            >
                              Du
                            </span>
                          )}
                          {isOnline && (
                            <span style={{ marginLeft: 8 }}>
                              <OnlineTag label />
                            </span>
                          )}
                          {entry.source === "agent" && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 9,
                                padding: "2px 6px",
                                background: "#4293D0",
                                color: "#fff",
                                borderRadius: 4,
                                verticalAlign: "middle",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                              }}
                            >
                              Agent
                            </span>
                          )}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            textAlign: "right",
                            fontWeight: 800,
                            fontSize: 17,
                            color: "#2a2a2a",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {entry.points}
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "right", color: "#999" }}>
                          {entry.tips}
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "right", color: "#2e7d32" }}>
                          {entry.exact}
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "right", color: "#65597F" }}>
                          {entry.diffCorrect}
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "right", color: "#F39200" }}>
                          {entry.tendencyCorrect}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}

      <style>{`
        @keyframes presence-pulse {
          0% { box-shadow: 0 0 0 0 rgba(66,208,122,0.5); }
          70% { box-shadow: 0 0 0 5px rgba(66,208,122,0); }
          100% { box-shadow: 0 0 0 0 rgba(66,208,122,0); }
        }
      `}</style>
    </>
  );
}
