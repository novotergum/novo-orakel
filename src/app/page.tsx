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

  // A. Besserer Sortierer
  const board = [...playerMap.values()].sort((a, b) =>
    b.points - a.points ||
    b.exact - a.exact ||
    b.diffCorrect - a.diffCorrect ||
    b.tendencyCorrect - a.tendencyCorrect ||
    a.userName.localeCompare(b.userName)
  );

  const humans = board.filter((e) => e.source === "human");
  const agents = board.filter((e) => e.source === "agent");
  const humanPts = humans.reduce((s, e) => s + e.points, 0);
  const agentPts = agents.reduce((s, e) => s + e.points, 0);
  const humanAvg = humans.length ? humanPts / humans.length : 0;
  const agentAvg = agents.length ? agentPts / agents.length : 0;

  // C. Gewinnerstatus
  const delta = humanAvg - agentAvg;
  const leaderText =
    humans.length === 0 && agents.length === 0
      ? ""
      : Math.abs(delta) < 0.05
      ? "Aktuell nahezu Gleichstand"
      : delta > 0
      ? `Menschen f\u00FChren mit ${delta.toFixed(1)} Punkten im Schnitt`
      : `Maschinen f\u00FChren mit ${Math.abs(delta).toFixed(1)} Punkten im Schnitt`;

  return { board, humanAvg, agentAvg, humanCount: humans.length, agentCount: agents.length, leaderText };
}

const medal = (i: number) => {
  if (i === 0) return "\u{1F947}";
  if (i === 1) return "\u{1F948}";
  if (i === 2) return "\u{1F949}";
  return `${i + 1}`;
};

const card: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 16,
  padding: "24px 28px",
  border: "1px solid rgba(0,0,0,0.06)",
  boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
};

export default async function Home({ searchParams }: { searchParams: { view?: string } }) {
  if (new Date() < SHOW_MAIN_AT && searchParams.view !== "main") {
    return <CountdownScreen />;
  }

  const { board, humanAvg, agentAvg, humanCount, agentCount, leaderText } = await getData();
  const top3 = board.slice(0, 3);
  const rest = board.slice(3);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0d0d1f 0%, #141428 120px, #f5f5f7 120px)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px" }}>
        {/* ── Hero/Header ── */}
        <header style={{ textAlign: "center", padding: "40px 0 48px", color: "#fff" }}>
          <img
            src="/ut-logo.png"
            alt="UT Logo"
            width={56}
            height={58}
            style={{ display: "block", margin: "0 auto 16px", opacity: 0.9 }}
          />
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, letterSpacing: "0.01em" }}>
            <span style={{ color: "#4293D0" }}>UT</span>{" "}
            <span style={{ color: "#ffffff" }}>Orakel</span>
          </h1>
          <p
            style={{
              fontSize: 15,
              color: "rgba(255,255,255,0.55)",
              margin: "6px 0 0",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            WM 2026 &ndash; Mensch gegen Maschine
          </p>
        </header>

        {/* ── Mensch vs. Maschine Highlight ── */}
        {(humanCount > 0 || agentCount > 0) && (
          <section style={{ marginBottom: 32 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                gap: 12,
                alignItems: "center",
              }}
            >
              {/* Mensch */}
              <div
                style={{
                  ...card,
                  textAlign: "center",
                  borderTop: "3px solid #E5172D",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "#E5172D",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 700,
                  }}
                >
                  Mensch
                </div>
                <div style={{ fontSize: 40, fontWeight: 800, color: "#E5172D", marginTop: 8, lineHeight: 1 }}>
                  {humanAvg.toFixed(1)}
                </div>
                <div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>
                  {"\u00D8"} Punkte &middot; {humanCount} Spieler
                </div>
              </div>

              {/* VS */}
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: "#1a1a3e",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 800,
                  color: "#fff",
                  letterSpacing: "0.05em",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                }}
              >
                VS
              </div>

              {/* Maschine */}
              <div
                style={{
                  ...card,
                  textAlign: "center",
                  borderTop: "3px solid #4293D0",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "#4293D0",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 700,
                  }}
                >
                  Maschine
                </div>
                <div style={{ fontSize: 40, fontWeight: 800, color: "#4293D0", marginTop: 8, lineHeight: 1 }}>
                  {agentAvg.toFixed(1)}
                </div>
                <div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>
                  {"\u00D8"} Punkte &middot; {agentCount} Agent{agentCount !== 1 ? "s" : ""}
                </div>
              </div>
            </div>

            {/* Statuszeile */}
            {leaderText && (
              <div
                style={{
                  textAlign: "center",
                  marginTop: 12,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#555",
                  letterSpacing: "0.02em",
                }}
              >
                {leaderText}
              </div>
            )}
          </section>
        )}

        {/* ── Top 3 Podium ── */}
        {top3.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontSize: 13,
                color: "#999",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 16,
                fontWeight: 600,
              }}
            >
              Podium
            </h2>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              {top3.map((entry, i) => {
                const colors = ["#F39200", "#8a8a8a", "#A0522D"];
                const sizes = [52, 40, 36];
                return (
                  <div
                    key={entry.userId}
                    style={{
                      ...card,
                      flex: 1,
                      textAlign: "center",
                      position: "relative",
                      paddingTop: 36,
                      borderTop: `3px solid ${colors[i]}`,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: -18,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: colors[i],
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 16,
                        fontWeight: 800,
                        color: "#fff",
                        boxShadow: `0 2px 8px ${colors[i]}44`,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#2a2a2a", marginBottom: 4 }}>
                      {entry.userName}
                    </div>
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
                        fontSize: sizes[i],
                        fontWeight: 800,
                        color: colors[i],
                        lineHeight: 1,
                        margin: "8px 0 4px",
                      }}
                    >
                      {entry.points}
                    </div>
                    <div style={{ fontSize: 11, color: "#999" }}>Punkte</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Leaderboard (ab Platz 4) ── */}
        {rest.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontSize: 13,
                color: "#999",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 16,
                fontWeight: 600,
              }}
            >
              Leaderboard
            </h2>
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
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
                      <th style={{ padding: "14px 16px", textAlign: "right" }}>Tipps</th>
                      <th style={{ padding: "14px 16px", textAlign: "right" }} title="4P">Exakt</th>
                      <th style={{ padding: "14px 16px", textAlign: "right" }} title="3P">Diff</th>
                      <th style={{ padding: "14px 16px", textAlign: "right" }} title="2P">Tendenz</th>
                      <th style={{ padding: "14px 16px", textAlign: "right" }}>Punkte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rest.map((entry, i) => (
                      <tr
                        key={entry.userId}
                        style={{
                          borderBottom: i < rest.length - 1 ? "1px solid #f0f0f0" : "none",
                        }}
                      >
                        <td style={{ padding: "14px 16px", textAlign: "center", color: "#bbb", fontWeight: 600 }}>
                          {i + 4}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <span style={{ color: "#2a2a2a", fontWeight: 600 }}>
                            {entry.userName}
                          </span>
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
                        <td
                          style={{
                            padding: "14px 16px",
                            textAlign: "right",
                            fontWeight: 700,
                            fontSize: 17,
                            color: "#2a2a2a",
                          }}
                        >
                          {entry.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ── Empty state ── */}
        {board.length === 0 && (
          <div
            style={{
              ...card,
              textAlign: "center",
              padding: 40,
              color: "#999",
              marginBottom: 32,
            }}
          >
            Noch keine Tipps abgegeben. Sei der Erste!
          </div>
        )}

        {/* ── Tip Form ── */}
        <section style={{ marginBottom: 32 }}>
          <TipForm />
        </section>

        {/* ── Regeln (B. Footer entschlackt) ── */}
        <footer
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "#999",
            lineHeight: 1.9,
            paddingBottom: 40,
          }}
        >
          4P exakt &middot; 3P Tordifferenz &middot; 2P Tendenz &middot; 0P daneben
          <br />
          K.O.-Bonus: Achtelfinale 1.5x &middot; Viertelfinale 2x &middot;
          Halbfinale 2.5x &middot; Finale 3x
        </footer>
      </div>
    </div>
  );
}
