import { redirect } from "next/navigation";
import Link from "next/link";
import { computeStats } from "@/lib/stats";
import { getSession, userIdFromEmail } from "@/lib/auth";
import Siegerehrung, { type PodiumPlace } from "@/components/Siegerehrung";

export const dynamic = "force-dynamic";

// Siegerehrung: animierte Podium-Reveal-Sequenz nach dem Finale.
// Gating identisch zu /statistik: vor dem Finale nur per ?preview=1 sichtbar.
export default async function SiegerehrungPage({
  searchParams,
}: {
  searchParams: { preview?: string };
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const preview = searchParams?.preview === "1";
  const s = await computeStats();
  const me = userIdFromEmail(session.email);

  // Gate vor dem Finale
  if (!s.tournamentEnded && !preview) {
    return (
      <Stage>
        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            borderRadius: 16,
            padding: "48px 28px",
            textAlign: "center",
            color: "#fff",
            maxWidth: 460,
          }}
        >
          <div style={{ fontSize: 44, marginBottom: 12 }}>🏆</div>
          <div style={{ fontSize: 19, fontWeight: 700 }}>
            Die Siegerehrung steigt nach dem Finale
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginTop: 10, lineHeight: 1.6 }}>
            Sobald das WM-Finale ausgewertet ist, werden hier feierlich die
            Medaillen vergeben — Gold, Silber und Bronze für die besten Tipper.
          </div>
          <Link
            href="/"
            style={{ display: "inline-block", marginTop: 24, color: "rgba(255,255,255,0.6)", fontSize: 13, textDecoration: "none" }}
          >
            ← zurück zum Tippspiel
          </Link>
        </div>
      </Stage>
    );
  }

  // Komplettes Feld mit Competition-Rang (Punktgleiche teilen sich den Rang).
  // Top 3 ans Podest, ALLE bekommen in der Ehrenrunde eine Medaille.
  let lastPoints: number | null = null;
  let lastRank = 0;
  const players: PodiumPlace[] = s.board.map((p, i) => {
    const rank = lastPoints !== null && p.points === lastPoints ? lastRank : i + 1;
    lastPoints = p.points;
    lastRank = rank;
    return {
      rank,
      userName: p.userName,
      points: p.points,
      source: p.source,
      isMe: p.userId === me,
    };
  });

  return (
    <Stage>
      <Siegerehrung
        players={players}
        preview={preview && !s.tournamentEnded}
        finishedMatches={s.finishedMatches}
      />
    </Stage>
  );
}

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(1200px 600px at 50% -10%, #2a2a55 0%, #14142b 45%, #0b0b1a 100%)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {children}
    </div>
  );
}
