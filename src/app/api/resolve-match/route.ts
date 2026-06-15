import { NextRequest, NextResponse } from "next/server";
import { readPredictions, writePredictions } from "../../../lib/store";
import { parseScoreTip, scoreTip, stageMultiplier } from "../../../lib/scoring";

interface ResolveBody {
  matchId: number;
  actualHome: number;
  actualAway: number;
}

// Gleicher Schutz wie /api/admin: ohne korrektes ADMIN_SECRET kein Zugriff.
// Diese Route nimmt das Ergebnis aus dem Body (frei wählbar) und schreibt die
// Punkte ALLER Tipps des Spiels – ungeschützt könnte jeder Scores frisieren.
// Der automatische Pfad (resolve-all) zieht die echten football-data-Scores
// und ist davon unberührt.
function checkAuth(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  return req.nextUrl.searchParams.get("secret") === secret;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await req.json()) as ResolveBody;

    if (
      !body?.matchId ||
      !Number.isFinite(body.actualHome) ||
      !Number.isFinite(body.actualAway)
    ) {
      return NextResponse.json(
        { error: "matchId, actualHome, actualAway required" },
        { status: 400 },
      );
    }

    const records = await readPredictions();
    let updated = 0;

    for (const r of records) {
      if (r.matchId !== body.matchId) continue;
      try {
        const parsed = parseScoreTip(r.scoreTip);
        const basePoints = scoreTip(
          parsed.home,
          parsed.away,
          body.actualHome,
          body.actualAway,
        );

        // K.O.-Multiplikator anwenden (einheitlich 4/3/2/0, kein Upset-Bonus mehr)
        const multiplier = stageMultiplier(r.stage);
        r.basePoints = basePoints;
        r.points = Math.round(basePoints * multiplier);
        updated++;
      } catch {
        r.basePoints = 0;
        r.points = 0;
      }
    }

    await writePredictions(records);

    return NextResponse.json({
      ok: true,
      matchId: body.matchId,
      actual: { home: body.actualHome, away: body.actualAway },
      tipsResolved: updated,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
