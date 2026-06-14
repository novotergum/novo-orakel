import Link from "next/link";
import { redirect } from "next/navigation";
import { computeStats, type RecordFact, type PlayerStat } from "@/lib/stats";
import { STAGE_LABELS } from "@/lib/scoring";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const RED = "#E5172D";
const BLUE = "#4293D0";
const ORANGE = "#F39200";

const card: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 16,
  padding: "24px 28px",
  border: "1px solid rgba(0,0,0,0.06)",
  boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
};

function stageLabel(stage: string | null | undefined): string {
  if (!stage) return "";
  return STAGE_LABELS[stage] ?? "";
}

/* ── kleine Bausteine ─────────────────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 13,
        color: "#999",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        margin: "0 0 16px",
        fontWeight: 600,
      }}
    >
      {children}
    </h2>
  );
}

function HeroCard({
  label,
  name,
  big,
  sub,
  accent,
  emoji,
}: {
  label: string;
  name: string;
  big: string;
  sub?: string;
  accent: string;
  emoji?: string;
}) {
  return (
    <div style={{ ...card, textAlign: "center", borderTop: `3px solid ${accent}` }}>
      <div
        style={{
          fontSize: 11,
          color: accent,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 700,
        }}
      >
        {emoji ? `${emoji} ` : ""}
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#2a2a2a", marginTop: 10 }}>
        {name}
      </div>
      <div style={{ fontSize: 44, fontWeight: 800, color: accent, marginTop: 6, lineHeight: 1 }}>
        {big}
      </div>
      {sub && <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>{sub}</div>}
    </div>
  );
}

function FactCard({
  label,
  emoji,
  accent,
  fact,
  note,
}: {
  label: string;
  emoji: string;
  accent: string;
  fact: RecordFact | null;
  note?: string;
}) {
  return (
    <div style={{ ...card, borderLeft: `4px solid ${accent}` }}>
      <div
        style={{
          fontSize: 11,
          color: accent,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        {emoji} {label}
      </div>
      {fact ? (
        <>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#2a2a2a" }}>
            {fact.userName}
            {fact.source === "agent" && (
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
                Agent
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: "#555", marginTop: 6, lineHeight: 1.5 }}>
            {fact.matchLabel}
            {stageLabel(fact.stage) ? ` · ${stageLabel(fact.stage)}` : ""}
            <br />
            Tipp <strong>{fact.scoreTip}</strong> · Endstand{" "}
            <strong>{fact.actual}</strong>
          </div>
          {note && (
            <div style={{ fontSize: 13, color: accent, marginTop: 8, fontWeight: 700 }}>
              {note}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 13, color: "#bbb" }}>Keine Daten</div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  emoji,
  accent,
  player,
  value,
}: {
  label: string;
  emoji: string;
  accent: string;
  player: PlayerStat | null;
  value: string;
}) {
  return (
    <div style={{ ...card, padding: "18px 20px" }}>
      <div
        style={{
          fontSize: 10,
          color: accent,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        {emoji} {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#2a2a2a" }}>
        {player ? player.userName : "—"}
        {player?.source === "agent" && (
          <span
            style={{
              marginLeft: 6,
              fontSize: 8,
              padding: "1px 5px",
              background: BLUE,
              color: "#fff",
              borderRadius: 4,
              verticalAlign: "middle",
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            KI
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, color: "#999", marginTop: 4 }}>{value}</div>
    </div>
  );
}

/* ── Seite ────────────────────────────────────────────────────────── */

export default async function StatistikPage({
  searchParams,
}: {
  searchParams: { preview?: string };
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const preview = searchParams?.preview === "1";
  const s = await computeStats();

  const shell = (children: React.ReactNode) => (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0d0d1f 0%, #0d0d1f 220px, #f5f5f7 220px)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 20px" }}>
        <header style={{ textAlign: "center", padding: "44px 0 36px", color: "#fff" }}>
          <div
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.5)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            WM 2026 · Der große Rückblick
          </div>
          <h1 style={{ fontSize: 38, fontWeight: 800, margin: "10px 0 0", letterSpacing: "-0.01em" }}>
            <span style={{ color: BLUE }}>Mensch</span>{" "}
            <span style={{ color: "rgba(255,255,255,0.7)" }}>vs.</span>{" "}
            <span style={{ color: RED }}>Maschine</span>
          </h1>
        </header>
        {children}
        <footer style={{ textAlign: "center", paddingBottom: 48, marginTop: 12 }}>
          <Link href="/" style={{ color: "#999", fontSize: 13, textDecoration: "none" }}>
            ← zurück zum Tippspiel
          </Link>
        </footer>
      </div>
    </div>
  );

  // Gate: vor dem Finale nur per ?preview=1 sichtbar
  if (!s.tournamentEnded && !preview) {
    return shell(
      <div style={{ ...card, textAlign: "center", padding: "48px 28px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🏆</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#2a2a2a" }}>
          Der große Rückblick erscheint nach dem Finale
        </div>
        <div style={{ fontSize: 14, color: "#888", marginTop: 10, lineHeight: 1.6 }}>
          Sobald das WM-Finale ausgewertet ist, findest du hier die komplette
          Auswertung: Mensch gegen Maschine, alle Champions und die kuriosesten
          Ausreißer des Turniers.
        </div>
      </div>,
    );
  }

  const orakel = s.orakel;

  return shell(
    <>
      {preview && !s.tournamentEnded && (
        <div
          style={{
            ...card,
            padding: "12px 18px",
            marginBottom: 20,
            background: "#fff8e6",
            border: "1px solid #F3920055",
            fontSize: 13,
            color: "#8a5a00",
            textAlign: "center",
          }}
        >
          👁️ Vorschau-Modus · Zwischenstand ({s.finishedMatches} Spiele
          ausgewertet). Öffentlich wird die Seite erst nach dem Finale.
        </div>
      )}

      {/* ── Mensch vs. Maschine (fair) ── */}
      <section style={{ marginBottom: 40 }}>
        <SectionTitle>Mensch vs. Maschine — der faire Vergleich</SectionTitle>

        {orakel ? (
          <>
            <div style={{ ...card, textAlign: "center", borderTop: `3px solid ${BLUE}` }}>
              <div style={{ fontSize: 14, color: "#555" }}>
                Das <strong style={{ color: BLUE }}>{orakel.userName}</strong> holte
              </div>
              <div style={{ fontSize: 52, fontWeight: 800, color: BLUE, lineHeight: 1.1 }}>
                {orakel.points}
                <span style={{ fontSize: 20, color: "#999", fontWeight: 600 }}> Punkte</span>
              </div>
              <div style={{ fontSize: 15, color: "#2a2a2a", marginTop: 6, fontWeight: 600 }}>
                besser als{" "}
                <span style={{ color: BLUE, fontWeight: 800 }}>
                  {orakel.percentile.toFixed(0)} %
                </span>{" "}
                aller Menschen
              </div>

              {/* Perzentil-Balken */}
              <div
                style={{
                  position: "relative",
                  height: 10,
                  background: "#eee",
                  borderRadius: 6,
                  margin: "16px 8px 8px",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${Math.max(2, Math.min(100, orakel.percentile))}%`,
                    background: BLUE,
                    borderRadius: 6,
                  }}
                />
              </div>
              <div style={{ fontSize: 12, color: "#999" }}>
                Gesamtplatz {orakel.rank} von {orakel.totalPlayers} · schlägt{" "}
                {orakel.beatsHumans} von {s.humanCount} Menschen
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
                marginTop: 12,
              }}
            >
              <div style={{ ...card, textAlign: "center", padding: "18px 12px" }}>
                <div style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Ø Mensch
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: RED, marginTop: 6 }}>
                  {s.humanAvg.toFixed(1)}
                </div>
              </div>
              <div style={{ ...card, textAlign: "center", padding: "18px 12px" }}>
                <div style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Median Mensch
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: RED, marginTop: 6 }}>
                  {s.humanMedian.toFixed(0)}
                </div>
              </div>
              <div style={{ ...card, textAlign: "center", padding: "18px 12px" }}>
                <div style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Orakel
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: BLUE, marginTop: 6 }}>
                  {orakel.points}
                </div>
              </div>
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "#888",
                marginTop: 14,
                textAlign: "center",
                lineHeight: 1.6,
              }}
            >
              Fairer Maßstab ist der <strong>typische</strong> Mensch (Ø / Median),
              nicht der beste aus {s.humanCount} — denn mit so vielen Tippern hat
              fast immer jemand einen Lauf. Das Orakel ist nur ein Tipper.
            </div>
          </>
        ) : (
          <div style={{ ...card, color: "#bbb", textAlign: "center" }}>
            Kein Maschinen-Tipper gefunden.
          </div>
        )}
      </section>

      {/* ── Champion & Helden ── */}
      <section style={{ marginBottom: 40 }}>
        <SectionTitle>Champion & Helden</SectionTitle>

        {s.champion && (
          <HeroCard
            label="Gesamtsieger"
            emoji="👑"
            accent={ORANGE}
            name={
              s.champion.userName + (s.champion.source === "agent" ? " (KI!)" : "")
            }
            big={`${s.champion.points}`}
            sub={`Punkte · ${s.champion.exact} exakte Tipps · ${s.champion.tips} Tipps gesamt`}
          />
        )}

        {s.bestHuman && s.champion && s.bestHuman.userId !== s.champion.userId && (
          <div style={{ marginTop: 12 }}>
            <HeroCard
              label="Bester Mensch"
              emoji="🥇"
              accent={RED}
              name={s.bestHuman.userName}
              big={`${s.bestHuman.points}`}
              sub={`Punkte · ${s.bestHuman.exact} exakte Tipps`}
            />
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
            marginTop: 12,
          }}
        >
          <MiniStat
            label="Treffsicherster"
            emoji="🎯"
            accent="#2e7d32"
            player={s.sharpest}
            value={
              s.sharpest
                ? `${((s.sharpest.exact / s.sharpest.tips) * 100).toFixed(0)} % exakt (${s.sharpest.exact}/${s.sharpest.tips})`
                : "—"
            }
          />
          <MiniStat
            label="Fleißigster"
            emoji="🔥"
            accent={ORANGE}
            player={s.busiest}
            value={s.busiest ? `${s.busiest.tips} Tipps · ${s.busiest.points} Pkt` : "—"}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <FactCard
            label="Höchste Einzelpunktzahl"
            emoji="💥"
            accent="#65597F"
            fact={s.highestSingle}
            note={
              s.highestSingle
                ? `${s.highestSingle.total} Punkte in einem Spiel${
                    s.highestSingle.bonus > 0 ? " (inkl. Upset-Bonus)" : ""
                  }`
                : undefined
            }
          />
        </div>
      </section>

      {/* ── Ausreißer & Kuriositäten ── */}
      <section style={{ marginBottom: 40 }}>
        <SectionTitle>Ausreißer & Kuriositäten</SectionTitle>

        <div style={{ display: "grid", gap: 12 }}>
          <FactCard
            label="Größter Außenseiter-Treffer"
            emoji="🦄"
            accent={ORANGE}
            fact={s.biggestUpset}
            note={
              s.biggestUpset
                ? `Upset-Bonus! Nur ${(
                    (s.biggestUpset.pickProbability ?? 0) * 100
                  ).toFixed(0)} % Wahrscheinlichkeit getippt`
                : undefined
            }
          />
          <FactCard
            label="Krasseste Fehlprognose"
            emoji="🙈"
            accent={RED}
            fact={s.worstMiss}
            note={
              s.worstMiss
                ? `${s.worstMiss.diffError} Tore neben der Tordifferenz`
                : undefined
            }
          />

          {s.mostTippedScore && (
            <div style={{ ...card, borderLeft: "4px solid #4293D0" }}>
              <div
                style={{
                  fontSize: 11,
                  color: BLUE,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 700,
                  marginBottom: 10,
                }}
              >
                📊 Lieblings-Ergebnis aller Tipper
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#2a2a2a" }}>
                {s.mostTippedScore.score}
              </div>
              <div style={{ fontSize: 13, color: "#555", marginTop: 6 }}>
                {s.mostTippedScore.count}× getippt · davon{" "}
                <strong>{s.mostTippedScore.correctCount}×</strong> exakt richtig
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Standort-Wertung ── */}
      {s.locations.length > 0 && (
        <section style={{ marginBottom: 40 }}>
          <SectionTitle>Standort-Wertung (Ø Punkte je Tipper)</SectionTitle>
          <div style={{ ...card, padding: "10px 12px" }}>
            {s.locations.map((loc, i) => {
              const max = s.locations[0].avg || 1;
              const pct = Math.max(4, (loc.avg / max) * 100);
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
              return (
                <div
                  key={loc.location}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderBottom:
                      i < s.locations.length - 1 ? "1px solid #f2f2f2" : "none",
                  }}
                >
                  <div style={{ width: 24, textAlign: "center", color: "#bbb", fontWeight: 700 }}>
                    {medal || i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#2a2a2a",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {loc.location}
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
            Standort aus Personio (Selbstangabe als Fallback) · nur Standorte mit
            mindestens 2 Tippern.
          </div>
        </section>
      )}

      {/* ── 🔮 Das Orakel — Anspruchnahme ── */}
      {s.oracleUsage && (() => {
        const ou = s.oracleUsage;
        const GREEN = "#2e9e5b";
        const beats = ou.vsOracle.filter((v) => v.diff > 0).slice(0, 5);
        const shouldve = [...ou.vsOracle].filter((v) => v.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 5);
        const juenger = ou.loyalty.slice(0, 5);
        const rebellen = [...ou.loyalty].reverse().slice(0, 5);
        const sog = ou.sog.slice(0, 6);
        const miniList = (
          label: string,
          entries: { name: string; val: string }[],
          color: string,
          empty?: string,
        ) => (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, marginBottom: 4 }}>
              {label}
            </div>
            {entries.length === 0 ? (
              <div style={{ fontSize: 13, color: "#bbb" }}>{empty ?? "—"}</div>
            ) : (
              entries.map((e, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
                  <span style={{ color: "#2a2a2a" }}>{e.name}</span>
                  <span style={{ fontWeight: 700, color }}>{e.val}</span>
                </div>
              ))
            )}
          </div>
        );
        return (
          <section style={{ marginBottom: 40 }}>
            <SectionTitle>🔮 Das Orakel — wer hat ihm vertraut?</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
              <div style={{ ...card, padding: "14px 16px" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#2a2a2a", marginBottom: 4 }}>🤖 Mensch gegen Maschine</div>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
                  <strong>{ou.beatOracle}</strong> von {ou.ratedPlayers} haben das „reine Orakel" geschlagen. Wer drunter liegt, hätte mit blindem Orakel-Kopieren mehr Punkte gehabt.
                </div>
                {miniList("Helden — schlugen die Maschine", beats.map((v) => ({ name: v.userName, val: `+${v.diff}` })), GREEN, "Niemand 😅")}
                {miniList("Hätten besser dem Orakel vertraut", shouldve.map((v) => ({ name: v.userName, val: `${v.diff}` })), RED)}
              </div>

              <div style={{ ...card, padding: "14px 16px" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#2a2a2a", marginBottom: 12 }}>🙏 Orakel-Jünger &amp; 🤘 Rebellen</div>
                {miniList("Treueste Jünger (Tendenz wie das Orakel)", juenger.map((l) => ({ name: l.userName, val: `${l.tendPct}%` })), BLUE)}
                {miniList("Sturste Rebellen (eigener Weg)", rebellen.map((l) => ({ name: l.userName, val: `${l.tendPct}%` })), ORANGE)}
              </div>

              <div style={{ ...card, padding: "14px 16px" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#2a2a2a", marginBottom: 4 }}>😰 Größter Orakel-Sog</div>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
                  Partien, bei denen die meisten dem Orakel folgten — und ob es aufging.
                </div>
                {sog.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#bbb" }}>Noch zu wenig ausgewertet.</div>
                ) : (
                  sog.map((sm, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i < sog.length - 1 ? "1px solid #f2f2f2" : "none" }}>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: "#2a2a2a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sm.label}</div>
                      <div style={{ fontSize: 12, color: "#999", flexShrink: 0 }}>{sm.tendPct}% folgten</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: sm.oracleHitTendency ? GREEN : RED, flexShrink: 0, width: 96, textAlign: "right" }}>
                        {sm.oracleHitTendency ? "✓ aufgegangen" : "✗ reingefallen"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        );
      })()}
    </>,
  );
}
