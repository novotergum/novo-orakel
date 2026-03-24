import { NextResponse } from "next/server";
import { readPredictions } from "../../../lib/store";

interface PlayerEntry {
  userId: string;
  userName: string;
  source: string;
  location: string | null;
  points: number;
  tips: number;
  exact: number;
  diffCorrect: number;
  tendencyCorrect: number;
}

interface LocationEntry {
  location: string;
  points: number;
  tips: number;
  players: number;
  avgPoints: number;
}

export async function GET() {
  try {
    const records = await readPredictions();

    // --- Einzelranking ---
    const playerMap = new Map<string, PlayerEntry>();
    for (const r of records) {
      const pts = r.points ?? 0;
      const existing = playerMap.get(r.userId);
      if (existing) {
        existing.points += pts;
        existing.tips += 1;
        if (pts === 4) existing.exact += 1;
        else if (pts === 3) existing.diffCorrect += 1;
        else if (pts === 2) existing.tendencyCorrect += 1;
      } else {
        playerMap.set(r.userId, {
          userId: r.userId,
          userName: r.userName,
          source: r.source,
          location: r.location ?? null,
          points: pts,
          tips: 1,
          exact: pts === 4 ? 1 : 0,
          diffCorrect: pts === 3 ? 1 : 0,
          tendencyCorrect: pts === 2 ? 1 : 0,
        });
      }
    }
    const leaderboard = [...playerMap.values()].sort(
      (a, b) => b.points - a.points,
    );

    // --- Mensch vs. Maschine ---
    const humans = leaderboard.filter((e) => e.source === "human");
    const agents = leaderboard.filter((e) => e.source === "agent");
    const avgHuman =
      humans.length > 0
        ? humans.reduce((s, e) => s + e.points, 0) / humans.length
        : 0;
    const avgAgent =
      agents.length > 0
        ? agents.reduce((s, e) => s + e.points, 0) / agents.length
        : 0;

    const menschVsMaschine = {
      humanPlayers: humans.length,
      humanAvgPoints: Number(avgHuman.toFixed(1)),
      humanTotalPoints: humans.reduce((s, e) => s + e.points, 0),
      agentPlayers: agents.length,
      agentAvgPoints: Number(avgAgent.toFixed(1)),
      agentTotalPoints: agents.reduce((s, e) => s + e.points, 0),
      leader: avgHuman > avgAgent ? "mensch" : avgAgent > avgHuman ? "maschine" : "gleichstand",
    };

    // --- Standort-Ranking ---
    const locMap = new Map<string, { points: number; tips: number; players: Set<string> }>();
    for (const r of records) {
      if (!r.location) continue;
      const existing = locMap.get(r.location);
      if (existing) {
        existing.points += r.points ?? 0;
        existing.tips += 1;
        existing.players.add(r.userId);
      } else {
        locMap.set(r.location, {
          points: r.points ?? 0,
          tips: 1,
          players: new Set([r.userId]),
        });
      }
    }
    const standorte: LocationEntry[] = [...locMap.entries()]
      .map(([location, d]) => ({
        location,
        points: d.points,
        tips: d.tips,
        players: d.players.size,
        avgPoints: Number((d.points / d.players.size).toFixed(1)),
      }))
      .sort((a, b) => b.avgPoints - a.avgPoints);

    return NextResponse.json({
      leaderboard,
      menschVsMaschine,
      standorte,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
