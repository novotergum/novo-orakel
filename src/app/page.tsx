import { readPredictions } from "../lib/store";
import TipForm from "../components/TipForm";
import CountdownScreen from "../components/CountdownScreen";

export const dynamic = "force-dynamic";

const WM_START = new Date("2026-06-11T00:00:00+02:00");
const SHOW_MAIN_AT = new Date(WM_START.getTime() - 7 * 24 * 60 * 60 * 1000);

interface LeaderboardEntry {
  userId: string;
  userName: string;
  source: "human" | "agent";
  points: number;
  tips: number;
  exact: number;
  diffCorrect: number;
  tendencyCorrect: number;
}

async function getData() {
  const records = await readPredictions();

  // Einzelranking
  const playerMap = new Map<string, LeaderboardEntry>();
  for (const r of records) {
    const pts = r.points ?? 0;
    const existing = playerMap.get(r.userId);
    if (existing) {
      existing.points += pts;
      existing.tips += 1;
      if (pts === 4) existing.exact += 1;
      else if (pts === 3) existing.diffCorrect += 1;
      else if (pts === 2) existing.tendencyCorrect += 1;
    } else {
      playerMap.set(r.userId, {
        userId: r.userId,
        userName: r.userName,
        source: r.source,
        points: pts,
        tips: 1,
        exact: pts === 4 ? 1 : 0,
        diffCorrect: pts === 3 ? 1 : 0,
        tendencyCorrect: pts === 2 ? 1 : 0,
      });
    }
  }
  const board = [...playerMap.values()].sort((a, b) => b.points - a.points);

  // Mensch vs. Maschine
  const humans = board.filter((e) => e.source === "human");
  const agents = board.filter((e) => e.source === "agent");
  const humanPts = humans.reduce((s, e) => s + e.points, 0);
  const agentPts = agents.reduce((s, e) => s + e.points, 0);
  const humanAvg = humans.length ? humanPts / humans.length : 0;
  const agentAvg = agents.length ? agentPts / agents.length : 0;

  return { board, humanAvg, agentAvg, humanCount: humans.length, agentCount: agents.length };
}

const medal = (i: number) => {
  if (i === 0) return "\u{1F947}";
  if (i === 1) return "\u{1F948}";
  if (i === 2) return "\u{1F949}";
  return `${i + 1}`;
};

const sCard: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 12,
  padding: "20px 24px",
  border: "1px solid #e0ddd9",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};

export default async function Home() {
  // Countdown-Screen bis 1 Woche vor WM-Start zeigen
  if (new Date() < SHOW_MAIN_AT) {
    return <CountdownScreen />;
  }

  const { board, humanAvg, agentAvg, humanCount, agentCount } = await getData();

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
      {/* Header */}
      <header style={{ textAlign: "center", marginBottom: 32 }}>
        <div
          style={{
            display: "inline-block",
            background: "#fff",
            borderRadius: 16,
            padding: "12px 28px",
            marginBottom: 12,
            border: "1px solid #F3920033",
            boxShadow: "0 2px 8px rgba(243,146,0,0.10)",
          }}
        >
          <span style={{ fontSize: 32 }}>{"\u26BD"}</span>
        </div>
        <h1 style={{ fontSize: 28, margin: "8px 0 0", color: "#3A3A3A" }}>
          UT Orakel
        </h1>
        <p style={{ fontSize: 14, color: "#7A7A7A", marginTop: 4 }}>
          WM 2026 Tippspiel &ndash; Mensch gegen Maschine
        </p>
      </header>

      {/* Mensch vs. Maschine */}
      {(humanCount > 0 || agentCount > 0) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap: 16,
            marginBottom: 32,
            alignItems: "center",
          }}
        >
          <div style={{ ...sCard, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#7A7A7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Mensch
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#E5172D", marginTop: 4 }}>
              {humanAvg.toFixed(1)}
            </div>
            <div style={{ fontSize: 12, color: "#7A7A7A" }}>
              {"\u00D8"} Punkte &middot; {humanCount} Spieler
            </div>
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: "#575756",
              textAlign: "center",
            }}
          >
            VS
          </div>
          <div style={{ ...sCard, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#7A7A7A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Maschine
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#4293D0", marginTop: 4 }}>
              {agentAvg.toFixed(1)}
            </div>
            <div style={{ fontSize: 12, color: "#7A7A7A" }}>
              {"\u00D8"} Punkte &middot; {agentCount} Agent{agentCount !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <section>
        <h2
          style={{
            fontSize: 16,
            color: "#575756",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 12,
          }}
        >
          Leaderboard
        </h2>
        {board.length === 0 ? (
          <p style={{ textAlign: "center", color: "#7A7A7A", padding: 20 }}>
            Noch keine Tipps abgegeben. Sei der Erste!
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
                minWidth: 520,
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "2px solid #e0ddd9",
                    textAlign: "left",
                    color: "#7A7A7A",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  <th style={{ padding: "8px 10px", width: 36 }}>#</th>
                  <th style={{ padding: "8px 10px" }}>Spieler</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Tipps</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }} title="4P">
                    Exakt
                  </th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }} title="3P">
                    Diff
                  </th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }} title="2P">
                    Tendenz
                  </th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Punkte</th>
                </tr>
              </thead>
              <tbody>
                {board.map((entry, i) => (
                  <tr
                    key={entry.userId}
                    style={{
                      borderBottom: "1px solid #e0ddd9",
                      background: i % 2 === 0 ? "transparent" : "#f0eeeb",
                    }}
                  >
                    <td
                      style={{
                        padding: "12px 10px",
                        fontSize: i < 3 ? 20 : 14,
                        textAlign: "center",
                      }}
                    >
                      {medal(i)}
                    </td>
                    <td style={{ padding: "12px 10px" }}>
                      <span style={{ color: "#3A3A3A", fontWeight: 600 }}>
                        {entry.userName}
                      </span>
                      {entry.source === "agent" && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 10,
                            padding: "2px 6px",
                            background: "#4293D0",
                            color: "#fff",
                            borderRadius: 4,
                            verticalAlign: "middle",
                          }}
                        >
                          AGENT
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "12px 10px", textAlign: "right", color: "#7A7A7A" }}>
                      {entry.tips}
                    </td>
                    <td style={{ padding: "12px 10px", textAlign: "right", color: "#2e7d32" }}>
                      {entry.exact}
                    </td>
                    <td style={{ padding: "12px 10px", textAlign: "right", color: "#65597F" }}>
                      {entry.diffCorrect}
                    </td>
                    <td style={{ padding: "12px 10px", textAlign: "right", color: "#F39200" }}>
                      {entry.tendencyCorrect}
                    </td>
                    <td
                      style={{
                        padding: "12px 10px",
                        textAlign: "right",
                        fontWeight: 700,
                        fontSize: 18,
                        color: "#3A3A3A",
                      }}
                    >
                      {entry.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          color: "#7A7A7A",
          lineHeight: 1.8,
        }}
      >
        4P exakt &middot; 3P Tordifferenz &middot; 2P Tendenz &middot; 0P daneben
        <br />
        K.O.-Bonus: Achtelfinale 1.5x &middot; Viertelfinale 2x &middot;
        Halbfinale 2.5x &middot; Finale 3x
        <br />
        Powered by <span style={{ color: "#F39200", fontWeight: 600 }}>UT Orakel</span> &middot; Prediction Engine v1
      </footer>
    </div>
  );
}
