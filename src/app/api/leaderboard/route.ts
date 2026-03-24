import { NextResponse } from "next/server";
import { readPredictions } from "../../../lib/store";

export async function GET() {
  try {
    const records = await readPredictions();

    const map = new Map<
      string,
      { userId: string; userName: string; source: string; points: number; tips: number }
    >();

    for (const r of records) {
      const existing = map.get(r.userId);
      if (existing) {
        existing.points += r.points ?? 0;
        existing.tips += 1;
      } else {
        map.set(r.userId, {
          userId: r.userId,
          userName: r.userName,
          source: r.source,
          points: r.points ?? 0,
          tips: 1,
        });
      }
    }

    const leaderboard = [...map.values()].sort((a, b) => b.points - a.points);

    return NextResponse.json({ leaderboard });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
