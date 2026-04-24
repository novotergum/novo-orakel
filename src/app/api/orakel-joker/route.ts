import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getTeamRecentMatches, buildTeamElo, predictFromElo } from "../../../lib/elo";
import { buildTipFromPrediction, type TipStyle } from "../../../lib/tip-engine";
import { getSession, userIdFromEmail } from "@/lib/auth";

const MAX_JOKERS = 10;

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

function jokerKey(userId: string) {
  return `joker:${userId}`;
}

/**
 * GET /api/orakel-joker
 * Returns remaining joker count for the current user (from session).
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "nicht eingeloggt" }, { status: 401 });
  }
  const userId = userIdFromEmail(session.email);

  const redis = getRedis();
  const used = ((await redis.get(jokerKey(userId))) as number) ?? 0;
  return NextResponse.json({ used, remaining: MAX_JOKERS - used, max: MAX_JOKERS });
}

/**
 * POST /api/orakel-joker
 * Uses one joker to get the Orakel's prediction for a match.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "nicht eingeloggt" }, { status: 401 });
    }
    const userId = userIdFromEmail(session.email);

    const body = await req.json();
    const { matchId, homeTeamId, awayTeamId, homeTeam, awayTeam } = body;

    if (!matchId || !homeTeamId || !awayTeamId) {
      return NextResponse.json(
        { error: "matchId, homeTeamId, awayTeamId required" },
        { status: 400 },
      );
    }

    const redis = getRedis();
    const used = ((await redis.get(jokerKey(userId))) as number) ?? 0;

    if (used >= MAX_JOKERS) {
      return NextResponse.json(
        { error: "Keine Joker mehr! Du hast alle 10 aufgebraucht.", remaining: 0 },
        { status: 403 },
      );
    }

    // Fetch Elo data and predict
    const [homeMatches, awayMatches] = await Promise.all([
      getTeamRecentMatches(homeTeamId),
      getTeamRecentMatches(awayTeamId),
    ]);

    const homeElo = buildTeamElo(homeMatches, homeTeamId, homeTeam);
    const awayElo = buildTeamElo(awayMatches, awayTeamId, awayTeam);

    const prediction = predictFromElo(
      { ...homeElo.stats, name: homeTeam },
      { ...awayElo.stats, name: awayTeam },
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
        topScores: prediction.topScores,
      },
      "balanced",
      homeTeam,
      awayTeam,
    );

    // Consume one joker
    const newUsed = used + 1;
    await redis.set(jokerKey(userId), newUsed);

    return NextResponse.json({
      ok: true,
      jokerUsed: newUsed,
      jokersRemaining: MAX_JOKERS - newUsed,
      tip: {
        winnerPick: tip.winnerPick,
        scoreTip: tip.scoreTip,
        reasoning: tip.reasoning,
        pickProbability: tip.pickProbability,
      },
      probabilities: {
        homeWin: Number(probs.home_win.toFixed(2)),
        draw: Number(probs.draw.toFixed(2)),
        awayWin: Number(probs.away_win.toFixed(2)),
      },
      confidence: prediction.confidence,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
