import { NextRequest, NextResponse } from "next/server";
import { getTeamRecentMatches, buildTeamElo, predictFromElo } from "../../../lib/elo";
import { buildTipFromPrediction, type TipStyle } from "../../../lib/tip-engine";

interface TipBody {
  match: {
    id: number;
    homeTeamId: number;
    awayTeamId: number;
    homeTeam: string;
    awayTeam: string;
    utcDate: string;
    status?: string;
    competition?: string;
  };
  style?: TipStyle;
}

const VALID_STYLES: TipStyle[] = ["safe", "balanced", "risky"];

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TipBody;

    if (!body?.match?.id || !body.match.homeTeamId || !body.match.awayTeamId) {
      return NextResponse.json(
        { error: "Invalid body: match with id, homeTeamId, awayTeamId required" },
        { status: 400 },
      );
    }

    const style: TipStyle =
      body.style && VALID_STYLES.includes(body.style) ? body.style : "balanced";

    // Fetch recent matches for both teams
    const [homeMatches, awayMatches] = await Promise.all([
      getTeamRecentMatches(body.match.homeTeamId),
      getTeamRecentMatches(body.match.awayTeamId),
    ]);

    // Build Elo + stats
    const homeElo = buildTeamElo(homeMatches, body.match.homeTeamId, body.match.homeTeam);
    const awayElo = buildTeamElo(awayMatches, body.match.awayTeamId, body.match.awayTeam);

    // Predict
    const prediction = predictFromElo(
      { ...homeElo.stats, name: body.match.homeTeam },
      { ...awayElo.stats, name: body.match.awayTeam },
    );

    // Determine outcome label
    const probs = prediction.probabilities;
    const maxProb = Math.max(probs.home_win, probs.draw, probs.away_win);
    let predictionLabel: string;
    let label: string;
    if (maxProb === probs.home_win) {
      predictionLabel = "home_win";
      label = "Heimsieg";
    } else if (maxProb === probs.away_win) {
      predictionLabel = "away_win";
      label = "Auswärtssieg";
    } else {
      predictionLabel = "draw";
      label = "Unentschieden";
    }

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
      body.match.homeTeam,
      body.match.awayTeam,
    );

    return NextResponse.json({
      match: {
        id: body.match.id,
        homeTeam: body.match.homeTeam,
        awayTeam: body.match.awayTeam,
        utcDate: body.match.utcDate,
        competition: body.match.competition ?? null,
      },
      prediction: predictionLabel,
      label,
      confidence: prediction.confidence,
      style,
      tip,
      probabilities: {
        homeWin: Number(probs.home_win.toFixed(4)),
        draw: Number(probs.draw.toFixed(4)),
        awayWin: Number(probs.away_win.toFixed(4)),
      },
      elo: {
        home: homeElo.elo,
        away: awayElo.elo,
        diff: Number(
          Math.abs(homeElo.elo.rating - awayElo.elo.rating).toFixed(1),
        ),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
