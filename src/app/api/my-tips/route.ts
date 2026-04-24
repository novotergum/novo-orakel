import { NextResponse } from "next/server";
import { readPredictions } from "../../../lib/store";
import { getSession, userIdFromEmail } from "@/lib/auth";

/**
 * GET /api/my-tips
 * Returns all tips for the currently authenticated user, keyed by matchId.
 * Identity is derived from the session cookie — no userId query param accepted.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "nicht eingeloggt" }, { status: 401 });
  }
  const userId = userIdFromEmail(session.email);

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
