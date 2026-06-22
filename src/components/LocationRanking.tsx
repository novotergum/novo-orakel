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
  const hasRanking = locations.length >= 2; // unter 2 Standorten kein Ranking
  if (!hasRanking) return null;

  // Balken auf die echte Spannweite skalieren (nicht 0..max), sonst wirken bei
  // eng beieinanderliegenden Scores alle Balken fast voll. Der Schlechteste
  // bekommt einen kleinen Sockel (8 %), damit er sichtbar bleibt.
  const max = hasRanking ? locations[0].score : 0;
  const minScore = hasRanking ? locations[locations.length - 1].score : 0;
  const scoreRange = max - minScore;
  const barPct = (score: number) =>
    scoreRange > 0 ? 8 + ((score - minScore) / scoreRange) * 92 : 100;
  const norm = (s: string) => s.trim().toLowerCase();
  const mine = currentLocation ? norm(currentLocation) : null;
  const inviteMailto = buildInviteMailto(senderEmail);

  const top3 = locations.slice(0, 3);
  const restLocs = locations.slice(3);

  // Eine Zeile der Wertung. rank ist 1-basiert; lastInGroup unterdrueckt den
  // Trenner unter dem letzten Eintrag einer Gruppe.
  const renderRow = (loc: LocationStat, rank: number, lastInGroup: boolean) => {
    const pct = barPct(loc.score);
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "";
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
          borderBottom: lastInGroup ? "none" : "1px solid #f2f2f2",
        }}
      >
        <div style={{ width: 24, textAlign: "center", color: "#bbb", fontWeight: 700 }}>
          {medal || rank}
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
                background: rank === 1 ? ORANGE : BLUE,
                borderRadius: 4,
              }}
            />
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#2a2a2a" }}>
            {loc.score.toFixed(1)}
          </div>
          <div style={{ fontSize: 11, color: "#aaa" }}>
            Ø {loc.avg.toFixed(1)} &middot; {loc.players} Sp.
          </div>
        </div>
      </div>
    );
  };

  return (
    <section style={{ marginBottom: 36 }}>
      {hasRanking && (
        <>
          <h2
            style={{
              fontSize: 13,
              color: "#999",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 6,
              fontWeight: 600,
            }}
          >
            Standort-Wertung &middot; gewichtete Punkte je Tipper
          </h2>
          <p style={{ fontSize: 12, color: "#aaa", margin: "0 0 16px", lineHeight: 1.5 }}>
            Je weniger Tipper ein Zentrum hat, desto stärker zählt der
            Gesamtschnitt mit – so verzerrt ein einzelner Glückslauf die Spitze
            nicht. In Klammern der rohe Ø &amp; die Zahl der Tipper.
          </p>
          <div style={{ ...card, padding: "10px 12px" }}>
            {top3.map((loc, i) =>
              renderRow(loc, i + 1, i === top3.length - 1 && restLocs.length === 0),
            )}
            {restLocs.length > 0 && (
              <details style={{ marginTop: 2 }}>
                <summary
                  style={{
                    listStyle: "none",
                    cursor: "pointer",
                    textAlign: "center",
                    padding: "10px 12px",
                    fontSize: 12,
                    color: "#999",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    userSelect: "none",
                  }}
                >
                  Weitere Standorte anzeigen ▾
                </summary>
                <div style={{ borderTop: "1px solid #f0f0f0" }}>
                  {restLocs.map((loc, j) =>
                    renderRow(loc, j + 4, j === restLocs.length - 1),
                  )}
                </div>
              </details>
            )}
          </div>
        </>
      )}

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
