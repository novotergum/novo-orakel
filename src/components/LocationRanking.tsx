import type { LocationStat } from "@/lib/stats";

const ORANGE = "#F39200";
const BLUE = "#4293D0";

// 67 Standorte + Zentrale. Fixe Bezugsgroesse fuer die Teilnahmequote.
const TOTAL_LOCATIONS = 68;

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
  representedLocations,
  currentLocation,
}: {
  locations: LocationStat[];
  representedLocations: number;
  currentLocation?: string;
}) {
  if (locations.length < 2) return null; // unter 2 Standorten kein Ranking

  const max = locations[0].avg || 1;
  const norm = (s: string) => s.trim().toLowerCase();
  const mine = currentLocation ? norm(currentLocation) : null;
  // Quote: wie viele der 68 Standorte tippen mit. Geclampt, falls Freitext-
  // Standorte (z. B. "Homeoffice") die vertretene Zahl ueber 68 treiben.
  const represented = Math.min(representedLocations, TOTAL_LOCATIONS);
  const missing = Math.max(0, TOTAL_LOCATIONS - represented);

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
        <span style={{ color: "#bbb", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>
          {"  "}— {represented}/{TOTAL_LOCATIONS} Standorte dabei ({missing} noch ohne Tipp)
        </span>
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
      <div style={{ fontSize: 12, color: "#aaa", marginTop: 8, textAlign: "center" }}>
        Standort aus Personio (Selbstangabe als Fallback) &middot; nur Standorte mit
        mindestens 2 Tippern.
      </div>
    </section>
  );
}
