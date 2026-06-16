import { redirect } from "next/navigation";
import { Redis } from "@upstash/redis";
import { readRankedPredictions, readStandortByEmail } from "../lib/store";
import TipForm from "../components/TipForm";
import CountdownScreen from "../components/CountdownScreen";
import LoginScreen from "../components/LoginScreen";
import WarmupGame from "../components/WarmupGame";
import LiveTicker from "../components/LiveTicker";
import Leaderboard from "../components/Leaderboard";
import RankUpBanner from "../components/RankUpBanner";
import { getAllowedDomains, getSession, userIdFromEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";

const WM_START = new Date("2026-06-11T00:00:00+02:00");
const SHOW_MAIN_AT = new Date(WM_START.getTime() - 7 * 24 * 60 * 60 * 1000);

interface LeaderboardEntry {
  userId: string;
  userName: string;
  source: "human" | "agent";
  location: string; // NOVOTERGUM-Standort (Personio-Map > Selbstangabe), "" wenn unbekannt
  points: number;
  tips: number;
  exact: number;
  diffCorrect: number;
  tendencyCorrect: number;
  rank: number; // Competition-Rang: Punktgleiche teilen sich denselben Rang
}

async function getData() {
  const [records, standortByEmail] = await Promise.all([
    readRankedPredictions(),
    readStandortByEmail(),
  ]);

  const playerMap = new Map<string, LeaderboardEntry>();
  for (const r of records) {
    const pts = r.points ?? 0;
    // "tips" = abgegebene Tipps insgesamt (Beteiligung, auch noch nicht
    // gespielte Spiele). Exakt/Diff/Tendenz kommen dagegen aus den Basis-
    // Punkten der bereits ausgewerteten Spiele.
    const base = r.basePoints ?? r.points ?? 0;
    const existing = playerMap.get(r.userId);
    if (existing) {
      existing.points += pts;
      existing.tips += 1;
      if (!existing.location && r.location) existing.location = r.location.trim();
      if (base === 4) existing.exact += 1;
      else if (base === 3) existing.diffCorrect += 1;
      else if (base === 2) existing.tendencyCorrect += 1;
    } else {
      playerMap.set(r.userId, {
        userId: r.userId,
        userName: r.userName,
        source: r.source,
        location: (r.location ?? "").trim(),
        points: pts,
        tips: 1,
        exact: base === 4 ? 1 : 0,
        diffCorrect: base === 3 ? 1 : 0,
        tendencyCorrect: base === 2 ? 1 : 0,
        rank: 0,
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

  // Standort auflösen: offizielle Personio-Map (Source of Truth) schlaegt die
  // Selbstangabe aus dem Tipp-Record. Agenten haben keinen Standort.
  for (const e of board) {
    if (e.source === "agent") {
      e.location = "";
      continue;
    }
    const official = standortByEmail[e.userId.toLowerCase().trim()];
    e.location = (official || e.location || "").trim();
  }

  // Competition-Ranking (1-2-2-4): Punktgleiche teilen sich den Rang. Verhindert,
  // dass die Reihenfolge innerhalb eines Punkte-Clusters (per Tiebreaker/Alphabet)
  // wie ein echter Auf-/Abstieg aussieht. Anzeige- und Banner-Rang sind identisch.
  let prevPts: number | null = null;
  board.forEach((e, i) => {
    if (prevPts === null || e.points < prevPts) {
      e.rank = i + 1;
      prevPts = e.points;
    } else {
      e.rank = board[i - 1].rank;
    }
  });

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

  return { board, humanAvg, agentAvg, humanCount: humans.length, agentCount: agents.length, leaderText, leaderSide };
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

  // Auth gate: no session → login screen; session but no profile → onboarding
  const session = await getSession();
  if (!session) {
    return <LoginScreen allowedDomains={getAllowedDomains()} />;
  }
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  const profileRaw = await redis.get(`user:${userIdFromEmail(session.email)}`);
  if (!profileRaw) redirect("/onboarding");
  const profile = profileRaw as { userId: string; userName: string; location: string };

  const { board, humanAvg, agentAvg, humanCount, agentCount, leaderText, leaderSide } = await getData();
  const top3 = board.slice(0, 3);
  const rest = board.slice(3);

  // Der aktuell Erstplatzierte sieht sein gesamtes Dashboard in einem Gold-Ton —
  // als kleine Auszeichnung. Greift nur aus SEINER Sicht (eingeloggt + Platz 1).
  const isLeader = board.length > 0 && board[0].userId === profile.userId;

  // Optionaler Beitrittslink zum WM-Teams-Kanal (nur gerendert, wenn gesetzt)
  const teamsJoinUrl = process.env.TEAMS_JOIN_URL;

  return (
    <div
      style={{
        minHeight: "100vh",
        // Erstplatzierter: warmer Gold-Ton statt neutralem Grau im Content-Bereich.
        background: isLeader
          ? "linear-gradient(180deg, #1a1405 0%, #1a1405 302px, #FBF1D8 302px, #FDF8EC 100%)"
          : "linear-gradient(180deg, #0d0d1f 0%, #0d0d1f 260px, #f5f5f7 260px)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* ── „Du führst"-Band (nur für den aktuell Erstplatzierten) ── */}
      {isLeader && (
        <div
          style={{
            background: "linear-gradient(90deg, #E0A106 0%, #F7C948 50%, #E0A106 100%)",
            color: "#3a2c00",
            textAlign: "center",
            padding: "11px 16px",
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            boxShadow: "0 2px 10px rgba(224,161,6,0.45)",
          }}
        >
          👑 Du führst &middot; Platz 1
        </div>
      )}
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

        {/* ── Motivationsspruch bei verbesserter Position (1× pro Spieltag) ── */}
        <RankUpBanner />

        {/* ── Live-Ticker: Aktivität (Registrierungen, Tipps, Last-Minute-Änderungen) ── */}
        <LiveTicker />

        {/* ── 2. Mensch vs. Maschine — der Hook, ganz oben ── */}
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

        {/* ── 3. Spiele & Tipps (Kernaktion — direkt unter dem Hook) ── */}
        <section id="tipform" style={{ marginBottom: 36 }}>
          <TipForm initialUser={profile} />
        </section>

        <Leaderboard top3={top3} rest={rest} currentUserId={profile.userId} />

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

        {/* ── Teams-Kanal Beitritt (nur wenn Link konfiguriert) ── */}
        {teamsJoinUrl && (
          <section style={{ marginBottom: 36 }}>
            <a
              href={teamsJoinUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...card,
                display: "flex",
                alignItems: "center",
                gap: 14,
                textDecoration: "none",
                borderLeft: "4px solid #5b5fc7",
              }}
            >
              <span style={{ fontSize: 26, lineHeight: 1 }}>💬</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#2a2a2a" }}>
                  Tritt dem WM-Teams-Kanal bei
                </div>
                <div style={{ fontSize: 13, color: "#777", marginTop: 2 }}>
                  Updates, Ergebnisse & Austausch zum Tippspiel
                </div>
              </div>
              <span
                style={{
                  flexShrink: 0,
                  padding: "9px 20px",
                  background: "#5b5fc7",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  borderRadius: 8,
                }}
              >
                Beitreten
              </span>
            </a>
          </section>
        )}

        {/* ── Warm-up: Elfmeter-Minispiel (Touch + Desktop) ── */}
        <WarmupGame />

        {/* ── Spielregeln (Accordion, standardmaessig zu) ── */}
        <section style={{ marginBottom: 36 }}>
          <details style={{ ...card, padding: 0 }}>
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
              <span>Spielregeln</span>
              <span style={{ fontSize: 12, color: "#bbb" }}>anzeigen ▾</span>
            </summary>
            <div style={{ padding: "0 24px 24px" }}>
              {/* Wichtigster Hinweis: Deadline */}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  background: "#F392000F",
                  border: "1px solid #F3920033",
                  borderRadius: 12,
                  padding: "14px 16px",
                  marginBottom: 20,
                }}
              >
                <span style={{ fontSize: 20, lineHeight: 1.2 }}>⏱️</span>
                <div style={{ fontSize: 14, color: "#2a2a2a", lineHeight: 1.5 }}>
                  <strong>Du kannst jedes Spiel bis zum Anpfiff tippen</strong> –
                  auch noch kurz vorher. Du musst nicht die ganze Vorrunde im
                  Voraus tippen: Tipp einfach, wann es dir passt, Spiel für Spiel.
                  Deinen Tipp kannst du bis zum Anpfiff <strong>beliebig oft
                  ändern</strong> – es zählt dein letzter.
                </div>
              </div>

              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  fontSize: 14,
                  color: "#444",
                  lineHeight: 1.7,
                }}
              >
                <li style={{ marginBottom: 10 }}>
                  <strong>Punkte je Spiel:</strong> 4P exaktes Ergebnis &middot; 3P
                  richtige Tordifferenz &middot; 2P richtige Tendenz &middot; 0P
                  daneben
                </li>
                <li style={{ marginBottom: 10 }}>
                  <strong>K.o.-Bonus:</strong> Achtelfinale 1,5× &middot;
                  Viertelfinale 2× &middot; Halbfinale 2,5× &middot; Finale 3×
                </li>
                <li style={{ marginBottom: 10 }}>
                  <strong>Gleichstand:</strong> Bei gleicher Punktzahl teilt man sich
                  denselben Platz. Für die Reihenfolge zählt dann der Reihe nach: mehr
                  exakte Treffer, mehr richtige Tordifferenzen, mehr richtige Tendenzen
                  – und zuletzt der Name (alphabetisch).
                </li>
                <li style={{ marginBottom: 10 }}>
                  <strong>Nicht getippt = 0 Punkte.</strong> Wer mehr Spiele
                  tippt, hat mehr Chancen auf Punkte.
                </li>
                <li style={{ marginBottom: 10 }}>
                  <strong>Deine Tipps nachschauen:</strong> Unten in der
                  Spieleliste findest du den Bereich <strong>„Meine
                  Ergebnisse"</strong> mit allen bereits ausgewerteten Spielen –
                  je Spiel der <strong>Endstand</strong>, dein Tipp
                  ({"Ergebnis | Heim/X/Ausw."}) und die erzielten
                  <strong> Punkte</strong>. So siehst du, ob du richtig lagst und
                  mit welcher Torangabe.
                </li>
                <li>
                  <strong>Das UT&nbsp;Orakel</strong> (unsere KI) tippt jeden Abend
                  automatisch mit – am Ende zählt: Mensch gegen Maschine.
                </li>
              </ul>
            </div>
          </details>
        </section>

        <footer
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "#bbb",
            paddingBottom: 40,
          }}
        >
          <a
            href="/statistik"
            style={{
              display: "inline-block",
              marginBottom: 12,
              color: "#4293D0",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            📊 Auswertung &amp; Rückblick
          </a>
          <br />
          UT Orakel &middot; WM 2026 Tippspiel
        </footer>
      </div>
    </div>
  );
}
