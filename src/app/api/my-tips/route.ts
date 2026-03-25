import { NextRequest, NextResponse } from "next/server";
import { readPredictions } from "../../../lib/store";

/**
 * GET /api/my-tips?userId=xxx
 * Returns all tips for a specific user, keyed by matchId.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  try {
    const records = await readPredictions();
    const mine = records.filter((r) => r.userId === userId);
    const byMatch: Record<number, { winnerPick: string; scoreTip: string; points?: number }> = {};
    for (const r of mine) {
      byMatch[r.matchId] = {
        winnerPick: r.winnerPick,
        scoreTip: r.scoreTip,
        points: r.points,
      };
    }
    return NextResponse.json({ tips: byMatch });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
