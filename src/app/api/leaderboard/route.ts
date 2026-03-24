import { NextResponse } from "next/server";
import { readPredictions } from "../../../lib/store";

const AGENT_ID = "novo-orakel";

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

    // --- Narrative for Teams ---
    const teamsPost = buildNarrative(leaderboard);

    return NextResponse.json({
      leaderboard,
      menschVsMaschine,
      standorte,
      teamsPost,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
