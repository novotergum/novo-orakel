import { NextResponse } from "next/server";
import { getMatches } from "../../../lib/football-data";
import { readPredictions, writePredictions } from "../../../lib/store";
import { parseScoreTip, scoreTip, upsetBonus } from "../../../lib/scoring";

/**
 * POST /api/resolve-all
 * Fetches all FINISHED matches, resolves every prediction that has no points yet.
 * Posts to Teams only if new results were resolved.
 */

async function postToTeams(text: string): Promise<boolean> {
  const url = process.env.TEAMS_WEBHOOK_ERGEBNIS;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.status === 202 || res.ok;
  } catch {
    return false;
  }
}

export async function POST() {
  try {
    const matches = await getMatches({ status: "FINISHED" });
    if (!matches.length) {
      return NextResponse.json({
        ok: true,
        message: "Keine beendeten Spiele gefunden",
        resolved: 0,
        teamsPosted: false,
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
    let newlyResolved = 0;

    for (const m of matches) {
      if (m.score.home == null || m.score.away == null) continue;

      const actualHome = m.score.home;
      const actualAway = m.score.away;
      let matchResolved = 0;
      let matchNew = 0;
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
          matchNew++;
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
        newlyResolved += matchNew;
      }
    }

    if (newlyResolved > 0) {
      await writePredictions(records);
    }

    // Post to Teams only if new tips were resolved
    let teamsPosted = false;
    if (newlyResolved > 0) {
      const newResults = results.filter((r) => r.tipsResolved > 0);
      const lines: string[] = [];
      lines.push("Ergebnis-Check abgeschlossen:");
      lines.push("");
      for (const r of newResults) {
        lines.push(`${r.home} vs ${r.away}: ${r.score} -- ${r.tipsResolved} Tipps ausgewertet`);
      }
      if (totalUpsets > 0) {
        lines.push("");
        lines.push(`${totalUpsets} Upset-Bonus vergeben!`);
      }
      lines.push("");
      lines.push("Leaderboard: https://assistant-tau.vercel.app");

      teamsPosted = await postToTeams(lines.join("\n"));
    }

    return NextResponse.json({
      ok: true,
      matchesChecked: matches.length,
      resolved: totalResolved,
      newlyResolved,
      upsetBonuses: totalUpsets,
      teamsPosted,
      results,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
