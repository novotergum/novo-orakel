import { NextResponse } from "next/server";
import { readRankedPredictions } from "../../../lib/store";

const AGENT_ID = "ut-orakel";

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

// ---------------------------------------------------------------------------
// Leaderboard narrative for Teams
// ---------------------------------------------------------------------------

function buildNarrative(board: PlayerEntry[]): string {
  const lines: string[] = [];
  lines.push("Leaderboard Update:");
  lines.push("");

  const top = board.slice(0, 10);
  for (const e of top) {
    lines.push(`${e.userName} -- ${e.points} Punkte`);
  }

  lines.push("");
  lines.push("Analyse:");

  if (board.length === 0) {
    lines.push("Noch keine Tipps abgegeben.");
    return lines.join("\n");
  }

  const leader = board[0];
  const second = board[1];
  const agent = board.find((e) => e.userId === AGENT_ID);
  const agentRank = agent ? board.indexOf(agent) + 1 : -1;

  // Leader analysis
  if (second && leader.points - second.points >= 5) {
    lines.push(`${leader.userName} setzt sich deutlich ab.`);
  } else if (second && leader.points - second.points <= 2) {
    lines.push("Spannung an der Spitze.");
  } else {
    lines.push(`${leader.userName} verteidigt Platz 1.`);
  }

  // Aufsteiger: player with most tips but not #1
  if (board.length > 2) {
    const mostTips = [...board].sort((a, b) => b.tips - a.tips)[0];
    if (mostTips.userId !== leader.userId) {
      lines.push(`${mostTips.userName} arbeitet sich nach oben.`);
    }
  }

  // Agent analysis
  if (agent && agentRank > 0) {
    if (agentRank <= 2) {
      lines.push("Das Orakel ist im Spiel.");
    } else if (agentRank > board.length / 2) {
      lines.push("Das Orakel liegt heute daneben.");
    } else {
      lines.push("Das Orakel haelt sich im Mittelfeld.");
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

// Server-side cache: the full ranking is recomputed from *every* prediction in
// Redis on each request (O(records)), which is by far the heaviest route in the
// app. With many tabs open during the tournament this dominated Fluid Active
// CPU. A short cache on the warm instance decouples the recompute cost from the
// number of online users — at most a couple of recomputes per minute.
const CACHE_MS = 30_000;
let cache: { at: number; payload: unknown } | null = null;

export async function GET() {
  const cacheNow = Date.now();
  if (cache && cacheNow - cache.at < CACHE_MS) {
    return NextResponse.json(cache.payload, {
      headers: { "x-leaderboard-cache": "hit" },
    });
  }
  try {
    const records = await readRankedPredictions();

    // --- Einzelranking ---
    const playerMap = new Map<string, PlayerEntry>();
    for (const r of records) {
      const pts = r.points ?? 0;
      // "tips" = abgegebene Tipps insgesamt (Beteiligung). Kategorie dagegen
      // aus den Basis-Punkten (vor K.o.-Multiplikator) der ausgewerteten Spiele.
      const base = r.basePoints ?? r.points ?? 0;
      const existing = playerMap.get(r.userId);
      if (existing) {
        existing.points += pts;
        existing.tips += 1;
        if (base === 4) existing.exact += 1;
        else if (base === 3) existing.diffCorrect += 1;
        else if (base === 2) existing.tendencyCorrect += 1;
      } else {
        playerMap.set(r.userId, {
          userId: r.userId,
          userName: r.userName,
          source: r.source,
          location: r.location ?? null,
          points: pts,
          tips: 1,
          exact: base === 4 ? 1 : 0,
          diffCorrect: base === 3 ? 1 : 0,
          tendencyCorrect: base === 2 ? 1 : 0,
        });
      }
    }
    const leaderboard = [...playerMap.values()].sort(
      (a, b) => b.points - a.points,
    );

    // --- Mensch vs. Maschine ---
    const humans = leaderboard.filter((e) => e.source === "human");
    const agents = leaderboard.filter((e) => e.source === "agent");
    // 0-Punkte-Tipper raus aus dem fairen Schnitt (sonst Maschine künstlich vorn).
    const scoringHumans = humans.filter((e) => e.points > 0);
    const avgHuman =
      scoringHumans.length > 0
        ? scoringHumans.reduce((s, e) => s + e.points, 0) / scoringHumans.length
        : 0;
    const avgAgent =
      agents.length > 0
        ? agents.reduce((s, e) => s + e.points, 0) / agents.length
        : 0;

    const menschVsMaschine = {
      humanPlayers: scoringHumans.length,
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

    // --- Narrative for Teams ---
    const teamsPost = buildNarrative(leaderboard);

    const payload = {
      leaderboard,
      menschVsMaschine,
      standorte,
      teamsPost,
    };
    cache = { at: Date.now(), payload };
    return NextResponse.json(payload, {
      headers: { "x-leaderboard-cache": "miss" },
    });
  } catch (e: unknown) {
    // On Redis/compute error, serve the last good payload rather than 500-ing.
    if (cache) {
      return NextResponse.json(cache.payload, {
        headers: { "x-leaderboard-cache": "stale" },
      });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
