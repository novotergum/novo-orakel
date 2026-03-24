import { readPredictions } from "../lib/store";
import TipForm from "../components/TipForm";

export const dynamic = "force-dynamic";

interface LeaderboardEntry {
  userId: string;
  userName: string;
  source: "human" | "agent";
  points: number;
  tips: number;
  exact: number;
  tendency: number;
}

async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const records = await readPredictions();

  const map = new Map<string, LeaderboardEntry>();
  for (const r of records) {
    const existing = map.get(r.userId);
    const pts = r.points ?? 0;
    if (existing) {
      existing.points += pts;
      existing.tips += 1;
      if (pts === 3) existing.exact += 1;
      else if (pts === 1) existing.tendency += 1;
    } else {
      map.set(r.userId, {
        userId: r.userId,
        userName: r.userName,
        source: r.source,
        points: pts,
        tips: 1,
        exact: pts === 3 ? 1 : 0,
        tendency: pts === 1 ? 1 : 0,
      });
    }
  }

  return [...map.values()].sort((a, b) => b.points - a.points);
}

const medal = (i: number) => {
  if (i === 0) return "\u{1F947}";
  if (i === 1) return "\u{1F948}";
  if (i === 2) return "\u{1F949}";
  return `${i + 1}`;
};

export default async function Home() {
  const board = await getLeaderboard();

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 20px" }}>
      {/* Header */}
      <header style={{ textAlign: "center", marginBottom: 32 }}>
        <div
          style={{
            display: "inline-block",
            background: "#1a1a2e",
            borderRadius: 16,
            padding: "12px 28px",
            marginBottom: 12,
            border: "1px solid #2563eb33",
          }}
        >
          <span style={{ fontSize: 32 }}>{"\u26BD"}</span>
        </div>
        <h1 style={{ fontSize: 28, margin: "8px 0 0", color: "#fff" }}>
          NOVO-Orakel
        </h1>
        <p style={{ fontSize: 14, color: "#888", marginTop: 4 }}>
          WM 2026 Tippspiel &ndash; Mensch gegen Maschine
        </p>
      </header>

      {/* Leaderboard */}
      <section>
        <h2
          style={{
            fontSize: 16,
            color: "#999",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 12,
          }}
        >
          Leaderboard
        </h2>
        {board.length === 0 ? (
          <p style={{ textAlign: "center", color: "#666", padding: 20 }}>
            Noch keine Tipps abgegeben. Sei der Erste!
          </p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 15,
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "2px solid #333",
                  textAlign: "left",
                  color: "#999",
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                <th style={{ padding: "8px 12px", width: 40 }}>#</th>
                <th style={{ padding: "8px 12px" }}>Spieler</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>
                  Tipps
                </th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>
                  Exakt
                </th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>
                  Tendenz
                </th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>
                  Punkte
                </th>
              </tr>
            </thead>
            <tbody>
              {board.map((entry, i) => (
                <tr
                  key={entry.userId}
                  style={{
                    borderBottom: "1px solid #222",
                    background: i % 2 === 0 ? "transparent" : "#111",
                  }}
                >
                  <td
                    style={{
                      padding: "12px",
                      fontSize: i < 3 ? 20 : 14,
                      textAlign: "center",
                    }}
                  >
                    {medal(i)}
                  </td>
                  <td style={{ padding: "12px" }}>
                    <span style={{ color: "#fff", fontWeight: 600 }}>
                      {entry.userName}
                    </span>
                    {entry.source === "agent" && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 10,
                          padding: "2px 6px",
                          background: "#2563eb",
                          color: "#fff",
                          borderRadius: 4,
                          verticalAlign: "middle",
                        }}
                      >
                        AGENT
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: "12px",
                      textAlign: "right",
                      color: "#888",
                    }}
                  >
                    {entry.tips}
                  </td>
                  <td
                    style={{
                      padding: "12px",
                      textAlign: "right",
                      color: "#4ade80",
                    }}
                  >
                    {entry.exact}
                  </td>
                  <td
                    style={{
                      padding: "12px",
                      textAlign: "right",
                      color: "#fbbf24",
                    }}
                  >
                    {entry.tendency}
                  </td>
                  <td
                    style={{
                      padding: "12px",
                      textAlign: "right",
                      fontWeight: 700,
                      fontSize: 18,
                      color: "#fff",
                    }}
                  >
                    {entry.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Tip Form */}
      <TipForm />

      {/* Footer */}
      <footer
        style={{
          marginTop: 48,
          textAlign: "center",
          fontSize: 12,
          color: "#555",
        }}
      >
        Scoring: 3P exakt &middot; 1P Tendenz &middot; 0P daneben
        <br />
        Powered by NOVO-Orakel &middot; Prediction Engine v1
      </footer>
    </div>
  );
}
