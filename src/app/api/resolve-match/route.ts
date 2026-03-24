import { NextRequest, NextResponse } from "next/server";
import { readPredictions, writePredictions } from "../../../lib/store";
import { parseScoreTip, scoreTip, upsetBonus } from "../../../lib/scoring";

interface ResolveBody {
  matchId: number;
  actualHome: number;
  actualAway: number;
}

export async function POST(req: NextRequest) {
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
    let upsets = 0;

    for (const r of records) {
      if (r.matchId !== body.matchId) continue;
      try {
        const parsed = parseScoreTip(r.scoreTip);
        let points = scoreTip(
          parsed.home,
          parsed.away,
          body.actualHome,
          body.actualAway,
        );

        // Upset-Bonus: +5 wenn korrekte Tendenz bei <35% Wahrscheinlichkeit
        const pickProb = typeof r.pickProbability === "number" ? r.pickProbability : 1;
        const bonus = upsetBonus(
          r.winnerPick,
          body.actualHome,
          body.actualAway,
          pickProb,
        );
        if (bonus > 0) upsets++;
        points += bonus;

        r.points = points;
        updated++;
      } catch {
        r.points = 0;
      }
    }

    await writePredictions(records);

    return NextResponse.json({
      ok: true,
      matchId: body.matchId,
      actual: { home: body.actualHome, away: body.actualAway },
      tipsResolved: updated,
      upsetBonuses: upsets,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
