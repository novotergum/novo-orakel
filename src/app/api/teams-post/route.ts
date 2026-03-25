import { NextRequest, NextResponse } from "next/server";
import { readPredictions } from "../../../lib/store";

const AGENT_ID = "ut-orakel";

/**
 * GET /api/teams-post?type=leaderboard
 * Returns a ready-to-send JSON body for Power Automate webhooks.
 * The "text" field is properly escaped for JSON transport.
 */
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "leaderboard";

  try {
    if (type === "leaderboard") {
      const records = await readPredictions();

      const pointsMap = new Map<string, { name: string; points: number; source: string }>();
      for (const r of records) {
        const existing = pointsMap.get(r.userId);
        if (existing) {
          existing.points += r.points ?? 0;
        } else {
          pointsMap.set(r.userId, {
            name: r.userName,
            points: r.points ?? 0,
            source: r.source,
          });
        }
      }

      const board = [...pointsMap.values()].sort((a, b) => b.points - a.points);
      const top = board.slice(0, 10);
      const agent = board.find((e) => pointsMap.get(AGENT_ID)?.name === e.name);
      const agentRank = agent ? board.indexOf(agent) + 1 : -1;

      const lines: string[] = [];
      lines.push("Leaderboard Update:");
      lines.push("");
      for (const e of top) {
        lines.push(`${e.name} -- ${e.points} Punkte`);
      }
      lines.push("");
      lines.push("Analyse:");

      if (board.length > 0) {
        const leader = board[0];
        const second = board[1];

        if (second && leader.points - second.points <= 2) {
          lines.push("Spannung an der Spitze.");
        } else if (second && leader.points - second.points >= 5) {
          lines.push(`${leader.name} setzt sich deutlich ab.`);
        } else {
          lines.push(`${leader.name} verteidigt Platz 1.`);
        }

        if (agentRank > 0 && agentRank <= 2) {
          lines.push("Das Orakel ist im Spiel.");
        } else if (agentRank > 0 && agentRank > board.length / 2) {
          lines.push("Das Orakel liegt heute daneben.");
        }
      }

      return NextResponse.json({ text: lines.join("\n") });
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
