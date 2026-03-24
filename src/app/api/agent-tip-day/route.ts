import { NextRequest, NextResponse } from "next/server";
import { upsertPrediction, type PredictionRecord } from "../../../lib/store";
import { getTeamRecentMatches, buildTeamElo, predictFromElo } from "../../../lib/elo";
import { buildTipFromPrediction, type TipStyle } from "../../../lib/tip-engine";

interface MatchInput {
  id: number;
  homeTeamId: number;
  awayTeamId: number;
  homeTeam: string;
  awayTeam: string;
  utcDate: string;
  competition?: string;
}

interface AgentTipDayBody {
  matches: MatchInput[];
  style?: TipStyle;
}

const VALID_STYLES: TipStyle[] = ["safe", "balanced", "risky"];

async function tipSingleMatch(match: MatchInput, style: TipStyle) {
  // Fetch recent matches
  const [homeMatches, awayMatches] = await Promise.all([
    getTeamRecentMatches(match.homeTeamId),
    getTeamRecentMatches(match.awayTeamId),
  ]);

  // Build Elo + stats
  const homeElo = buildTeamElo(homeMatches, match.homeTeamId);
  const awayElo = buildTeamElo(awayMatches, match.awayTeamId);

  // Predict
  const prediction = predictFromElo(
    { ...homeElo.stats, name: match.homeTeam },
    { ...awayElo.stats, name: match.awayTeam },
  );

  const probs = prediction.probabilities;

  // Build tip
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
    match.homeTeam,
    match.awayTeam,
  );

  // Persist as agent prediction
  const record: PredictionRecord = {
    id: `${match.id}_openclaw`,
    matchId: match.id,
    userId: "openclaw",
    userName: "OpenClaw Orakel",
    source: "agent",
    winnerPick: tip.winnerPick,
    scoreTip: tip.scoreTip,
    style: tip.style,
    createdAt: new Date().toISOString(),
  };

  await upsertPrediction(record);

  return { matchId: match.id, ok: true, tip };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AgentTipDayBody;

    if (!body?.matches?.length) {
      return NextResponse.json(
        { error: "matches array required" },
        { status: 400 },
      );
    }

    const style: TipStyle =
      body.style && VALID_STYLES.includes(body.style) ? body.style : "balanced";

    const results: { matchId: number; ok: boolean; tip?: unknown; error?: string }[] = [];

    for (const match of body.matches) {
      try {
        const result = await tipSingleMatch(match, style);
        results.push(result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        results.push({ matchId: match.id, ok: false, error: msg });
      }
    }

    return NextResponse.json({
      ok: true,
      count: results.filter((r) => r.ok).length,
      results,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
