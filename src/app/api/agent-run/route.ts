import { NextRequest, NextResponse } from "next/server";
import { getMatches } from "../../../lib/football-data";
import { getTeamRecentMatches, buildTeamElo, predictFromElo } from "../../../lib/elo";
import { buildTipFromPrediction, type TipStyle } from "../../../lib/tip-engine";
import { upsertPrediction, type PredictionRecord } from "../../../lib/store";

const AGENT_ID = "novo-orakel";
const AGENT_NAME = "NOVO-Orakel";
const VALID_STYLES: TipStyle[] = ["safe", "balanced", "risky"];

async function tipMatch(
  match: { id: number; homeTeam: { id: number; name: string }; awayTeam: { id: number; name: string } },
  style: TipStyle,
) {
  const [homeMatches, awayMatches] = await Promise.all([
    getTeamRecentMatches(match.homeTeam.id),
    getTeamRecentMatches(match.awayTeam.id),
  ]);

  const homeElo = buildTeamElo(homeMatches, match.homeTeam.id);
  const awayElo = buildTeamElo(awayMatches, match.awayTeam.id);

  const prediction = predictFromElo(
    { ...homeElo.stats, name: match.homeTeam.name },
    { ...awayElo.stats, name: match.awayTeam.name },
  );

  const probs = prediction.probabilities;
  const tip = buildTipFromPrediction(
    {
      prediction: prediction.prediction,
      confidence: prediction.confidence,
      probabilities: {
        homeWin: probs.home_win,
        draw: probs.draw,
        awayWin: probs.away_win,
      },
    },
    style,
    match.homeTeam.name,
    match.awayTeam.name,
  );

  const record: PredictionRecord = {
    id: `${match.id}_${AGENT_ID}`,
    matchId: match.id,
    userId: AGENT_ID,
    userName: AGENT_NAME,
    source: "agent",
    winnerPick: tip.winnerPick,
    scoreTip: tip.scoreTip,
    style: tip.style,
    createdAt: new Date().toISOString(),
  };

  await upsertPrediction(record);

  return {
    matchId: match.id,
    home: match.homeTeam.name,
    away: match.awayTeam.name,
    tip: tip.scoreTip,
    pick: tip.winnerPick,
    reasoning: tip.reasoning,
  };
}

export async function POST(req: NextRequest) {
  try {
    let style: TipStyle = "balanced";
    try {
      const body = await req.json();
      if (body?.style && VALID_STYLES.includes(body.style)) {
        style = body.style;
      }
    } catch {
      // no body is fine, use default style
    }

    // Fetch upcoming matches
    const matches = await getMatches({ status: "SCHEDULED,TIMED" });

    if (!matches.length) {
      return NextResponse.json({
        ok: true,
        count: 0,
        message: "Keine anstehenden Spiele gefunden",
        results: [],
      });
    }

    const results: { matchId: number; ok: boolean; home?: string; away?: string; tip?: string; pick?: string; reasoning?: string[]; error?: string }[] = [];

    for (const m of matches) {
      try {
        const result = await tipMatch(
          {
            id: m.id,
            homeTeam: { id: m.homeTeam.id, name: m.homeTeam.name },
            awayTeam: { id: m.awayTeam.id, name: m.awayTeam.name },
          },
          style,
        );
        results.push({ ...result, ok: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        results.push({ matchId: m.id, ok: false, home: m.homeTeam.name, away: m.awayTeam.name, error: msg });
      }
    }

    return NextResponse.json({
      ok: true,
      agent: AGENT_NAME,
      style,
      count: results.filter((r) => r.ok).length,
      total: matches.length,
      results,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
