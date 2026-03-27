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

  const delta = humanAvg - agentAvg;
  const leaderText =
    humans.length === 0 && agents.length === 0
      ? ""
      : Math.abs(delta) < 0.05
      ? "Aktuell nahezu Gleichstand"
      : delta > 0
      ? `Menschen f\u00FChren mit ${delta.toFixed(1)} Punkten im Schnitt`
      : `Maschinen f\u00FChren mit ${Math.abs(delta).toFixed(1)} Punkten im Schnitt`;

  const leaderSide: "human" | "agent" | "tie" =
    Math.abs(delta) < 0.05 ? "tie" : delta > 0 ? "human" : "agent";

  // Pott berechnen
  let totalPot = 0;
  try {
    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    const userKeys = await redis.smembers("users:all");
    if (userKeys.length) {
      const pipeline = redis.pipeline();
      for (const k of userKeys) pipeline.get(k);
      const results = await pipeline.exec();
      for (const r of results) {
        if (r && typeof r === "object" && "stake" in r) {
          totalPot += (r as { stake?: number }).stake ?? 0;
        }
      }
    }
  } catch {
    // graceful fallback
  }

  return { board, humanAvg, agentAvg, humanCount: humans.length, agentCount: agents.length, leaderText, leaderSide, totalPot };
}

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

  const { board, humanAvg, agentAvg, humanCount, agentCount, leaderText, leaderSide, totalPot } = await getData();
  const top3 = board.slice(0, 3);
  const rest = board.slice(3);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0d0d1f 0%, #0d0d1f 260px, #f5f5f7 260px)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px" }}>
        {/* ── 3. Header massiv staerken ── */}
        <header style={{ textAlign: "center", padding: "48px 0 56px", color: "#fff" }}>
          <img
            src="/ut-logo.png"
            alt="UT Logo"
            width={68}
            height={71}
            style={{ display: "block", margin: "0 auto 20px" }}
          />
          <h1 style={{ fontSize: 40, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>
            <span style={{ color: "#4293D0" }}>UT</span>{" "}
            <span style={{ color: "#ffffff" }}>Orakel</span>
          </h1>
          <p
            style={{
              fontSize: 16,
              color: "rgba(255,255,255,0.5)",
              margin: "8px 0 0",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            WM 2026 &ndash; Mensch gegen Maschine
          </p>
          {/* Pott */}
          {totalPot > 0 && (
            <div
              style={{
                display: "inline-block",
                marginTop: 20,
                padding: "8px 24px",
                background: "rgba(243,146,0,0.12)",
                borderRadius: 8,
                border: "1px solid rgba(243,146,0,0.25)",
              }}
            >
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Pott
              </span>
              <span style={{ fontSize: 24, fontWeight: 800, color: "#F39200", marginLeft: 12 }}>
                {totalPot}{"\u20AC"}
              </span>
            </div>
          )}

          {/* CTA Anchor */}
          <a
            href="#tipform"
            style={{
              display: "inline-block",
              marginTop: 24,
              padding: "12px 36px",
              background: "#F39200",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              borderRadius: 10,
              textDecoration: "none",
              letterSpacing: "0.02em",
              boxShadow: "0 4px 16px rgba(243,146,0,0.35)",
              transition: "transform 0.15s",
            }}
          >
            Jetzt tippen
          </a>
        </header>

        {/* ── 2. Mensch vs. Maschine — Gewinner hervorheben ── */}
        {(humanCount > 0 || agentCount > 0) && (
          <section style={{ marginBottom: 36 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                gap: 12,
                alignItems: "stretch",
              }}
            >
              {/* Mensch */}
              <div
                style={{
                  ...card,
                  textAlign: "center",
                  borderTop: `3px solid #E5172D`,
                  transform: leaderSide === "human" ? "scale(1.03)" : "none",
                  boxShadow: leaderSide === "human"
                    ? "0 4px 24px rgba(229,23,45,0.15)"
                    : "0 2px 12px rgba(0,0,0,0.04)",
                  opacity: leaderSide === "agent" ? 0.7 : 1,
                  transition: "all 0.3s",
                }}
              >
                {leaderSide === "human" && (
                  <div style={{ fontSize: 10, color: "#E5172D", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
                    {"\u25B2"} Vorne
                  </div>
                )}
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
                <div style={{ fontSize: 44, fontWeight: 800, color: "#E5172D", marginTop: 8, lineHeight: 1 }}>
                  {humanAvg.toFixed(1)}
                </div>
                <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>
                  {"\u00D8"} Punkte &middot; {humanCount} Spieler
                </div>
              </div>

              {/* VS */}
              <div style={{ display: "flex", alignItems: "center" }}>
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
              </div>

              {/* Maschine */}
              <div
                style={{
                  ...card,
                  textAlign: "center",
                  borderTop: `3px solid #4293D0`,
                  transform: leaderSide === "agent" ? "scale(1.03)" : "none",
                  boxShadow: leaderSide === "agent"
                    ? "0 4px 24px rgba(66,147,208,0.15)"
                    : "0 2px 12px rgba(0,0,0,0.04)",
                  opacity: leaderSide === "human" ? 0.7 : 1,
                  transition: "all 0.3s",
                }}
              >
                {leaderSide === "agent" && (
                  <div style={{ fontSize: 10, color: "#4293D0", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
                    {"\u25B2"} Vorne
                  </div>
                )}
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
                <div style={{ fontSize: 44, fontWeight: 800, color: "#4293D0", marginTop: 8, lineHeight: 1 }}>
                  {agentAvg.toFixed(1)}
                </div>
                <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>
                  {"\u00D8"} Punkte &middot; {agentCount} Agent{agentCount !== 1 ? "s" : ""}
                </div>
              </div>
            </div>

            {/* 4. Status-Text sichtbarer */}
            {leaderText && (
              <div
                style={{
                  textAlign: "center",
                  marginTop: 16,
                  padding: "10px 20px",
                  background: leaderSide === "human" ? "rgba(229,23,45,0.06)" : leaderSide === "agent" ? "rgba(66,147,208,0.06)" : "rgba(0,0,0,0.03)",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  color: leaderSide === "human" ? "#E5172D" : leaderSide === "agent" ? "#4293D0" : "#555",
                  letterSpacing: "0.01em",
                }}
              >
                {leaderText}
              </div>
            )}
          </section>
        )}

        {/* ── 1. Top 3 Podium — Platz 1 deutlich groesser ── */}
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
                const colors = ["#F39200", "#8a8a8a", "#A0522D"];
                const isFirst = i === 0;
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
                      borderTop: `${isFirst ? 4 : 3}px solid ${colors[i]}`,
                      boxShadow: isFirst
                        ? `0 4px 24px ${colors[i]}22, 0 2px 12px rgba(0,0,0,0.06)`
                        : "0 2px 12px rgba(0,0,0,0.04)",
                    }}
                  >
                    {/* Rang-Badge */}
                    <div
                      style={{
                        position: "absolute",
                        top: isFirst ? -22 : -18,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: isFirst ? 44 : 36,
                        height: isFirst ? 44 : 36,
                        borderRadius: "50%",
                        background: colors[i],
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: isFirst ? 20 : 16,
                        fontWeight: 800,
                        color: "#fff",
                        boxShadow: `0 3px 12px ${colors[i]}55`,
                      }}
                    >
                      {i + 1}
                    </div>

                    <div style={{ fontSize: isFirst ? 18 : 15, fontWeight: 700, color: "#2a2a2a", marginBottom: 4 }}>
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
                        fontSize: isFirst ? 56 : 40,
                        fontWeight: 800,
                        color: colors[i],
                        lineHeight: 1,
                        margin: isFirst ? "12px 0 6px" : "8px 0 4px",
                      }}
                    >
                      {entry.points}
                    </div>
                    <div style={{ fontSize: isFirst ? 12 : 11, color: "#999" }}>Punkte</div>
                    {isFirst && (
                      <div style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>
                        {entry.exact} exakt &middot; {entry.tips} Tipps
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Leaderboard (ab Platz 4) ── */}
        {rest.length > 0 && (
          <section style={{ marginBottom: 36 }}>
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
              marginBottom: 36,
            }}
          >
            Noch keine Tipps abgegeben. Sei der Erste!
          </div>
        )}

        {/* ── 5. Tippen-CTA staerker ── */}
        <section id="tipform" style={{ marginBottom: 36 }}>
          <TipForm />
        </section>

        {/* ── Regeln ── */}
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
