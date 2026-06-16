import type { LocationStat } from "@/lib/stats";
import { buildInviteMailto } from "@/lib/invite";

const ORANGE = "#F39200";
const BLUE = "#4293D0";

const card: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.06)",
  boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
};

// Standort-Wertung fuers Dashboard: welches Zentrum tippt im Schnitt am besten.
// Reines Anzeige-Modul — Aggregation passiert serverseitig (aggregateLocations).
export default function LocationRanking({
  locations,
  currentLocation,
  senderEmail,
}: {
  locations: LocationStat[];
  currentLocation?: string;
  senderEmail?: string;
}) {
  if (locations.length < 2) return null; // unter 2 Standorten kein Ranking

  const max = locations[0].avg || 1;
  const norm = (s: string) => s.trim().toLowerCase();
  const mine = currentLocation ? norm(currentLocation) : null;
  const inviteMailto = buildInviteMailto(senderEmail);

  return (
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
        Standort-Wertung &middot; Ø Punkte je Tipper
      </h2>
      <div style={{ ...card, padding: "10px 12px" }}>
        {locations.map((loc, i) => {
          const pct = Math.max(4, (loc.avg / max) * 100);
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
          const isMine = mine !== null && norm(loc.location) === mine;
          return (
            <div
              key={loc.location}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background: isMine ? "#eaf4fb" : undefined,
                borderBottom:
                  i < locations.length - 1 ? "1px solid #f2f2f2" : "none",
              }}
            >
              <div style={{ width: 24, textAlign: "center", color: "#bbb", fontWeight: 700 }}>
                {medal || i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: isMine ? 800 : 600,
                    color: "#2a2a2a",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {loc.location}
                  {isMine && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 9,
                        padding: "2px 6px",
                        background: BLUE,
                        color: "#fff",
                        borderRadius: 4,
                        verticalAlign: "middle",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Dein Standort
                    </span>
                  )}
                </div>
                <div
                  style={{
                    height: 6,
                    background: "#eee",
                    borderRadius: 4,
                    marginTop: 5,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: i === 0 ? ORANGE : BLUE,
                      borderRadius: 4,
                    }}
                  />
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#2a2a2a" }}>
                  {loc.avg.toFixed(1)}
                </div>
                <div style={{ fontSize: 11, color: "#aaa" }}>{loc.players} Sp.</div>
              </div>
            </div>
          );
        })}
      </div>
      {/* ── CTA: Kollegen einladen ── */}
      <a
        href={inviteMailto}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          marginTop: 14,
          padding: "16px 20px",
          borderRadius: 14,
          background: `linear-gradient(135deg, ${ORANGE} 0%, #e07d00 100%)`,
          color: "#fff",
          textDecoration: "none",
          fontWeight: 800,
          fontSize: 15,
          boxShadow: `0 4px 16px ${ORANGE}40`,
          textAlign: "center",
          lineHeight: 1.3,
        }}
      >
        <span style={{ fontSize: 20 }}>✉️</span>
        <span>
          Standort nicht dabei? Jetzt Kollegen zum Tippspiel einladen
        </span>
      </a>
    </section>
  );
}
