import { NextResponse } from "next/server";
import { getMatches } from "../../../lib/football-data";
import { readPredictions, writePredictions } from "../../../lib/store";
import { parseScoreTip, scoreTip, upsetBonus } from "../../../lib/scoring";

/**
 * POST /api/resolve-all
 * Fetches all FINISHED matches, resolves every prediction that has no points yet.
 * Designed to be called by Make.com on a schedule (no iterator needed).
 */
export async function POST() {
  try {
    const matches = await getMatches({ status: "FINISHED" });
    if (!matches.length) {
      return NextResponse.json({
        ok: true,
        message: "Keine beendeten Spiele gefunden",
        resolved: 0,
        results: [],
      });
    }

    const records = await readPredictions();
    const results: {
      matchId: number;
      home: string;
      away: string;
      score: string;
      tipsResolved: number;
      upsetBonuses: number;
    }[] = [];

    let totalResolved = 0;
    let totalUpsets = 0;

    for (const m of matches) {
      if (m.score.home == null || m.score.away == null) continue;

      const actualHome = m.score.home;
      const actualAway = m.score.away;
      let matchResolved = 0;
      let matchUpsets = 0;

      for (const r of records) {
        if (r.matchId !== m.id) continue;
        // Skip already resolved tips
        if (r.points != null && r.points > 0) {
          matchResolved++;
          continue;
        }

        try {
          const parsed = parseScoreTip(r.scoreTip);
          let points = scoreTip(parsed.home, parsed.away, actualHome, actualAway);

          const pickProb = typeof r.pickProbability === "number" ? r.pickProbability : 1;
          const bonus = upsetBonus(r.winnerPick, actualHome, actualAway, pickProb);
          if (bonus > 0) matchUpsets++;
          points += bonus;

          r.points = points;
          matchResolved++;
        } catch {
          r.points = 0;
        }
      }

      if (matchResolved > 0) {
        results.push({
          matchId: m.id,
          home: m.homeTeam.name,
          away: m.awayTeam.name,
          score: `${actualHome}:${actualAway}`,
          tipsResolved: matchResolved,
          upsetBonuses: matchUpsets,
        });
        totalResolved += matchResolved;
        totalUpsets += matchUpsets;
      }
    }

    if (totalResolved > 0) {
      await writePredictions(records);
    }

    return NextResponse.json({
      ok: true,
      matchesChecked: matches.length,
      resolved: totalResolved,
      upsetBonuses: totalUpsets,
      results,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
