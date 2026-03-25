import { NextRequest, NextResponse } from "next/server";
import { readPredictions } from "../../../lib/store";

const AGENT_ID = "ut-orakel";

const WEBHOOKS: Record<string, string | undefined> = {
  leaderboard: process.env.TEAMS_WEBHOOK_LEADERBOARD,
  reminder: process.env.TEAMS_WEBHOOK_REMINDER,
  tippabgabe: process.env.TEAMS_WEBHOOK_TIPPABGABE,
  ergebnis: process.env.TEAMS_WEBHOOK_ERGEBNIS,
};

// ---------------------------------------------------------------------------
// Generate leaderboard narrative
// ---------------------------------------------------------------------------

async function leaderboardText(): Promise<string> {
  const records = await readPredictions();

  const pointsMap = new Map<string, { name: string; points: number }>();
  for (const r of records) {
    const existing = pointsMap.get(r.userId);
    if (existing) {
      existing.points += r.points ?? 0;
    } else {
      pointsMap.set(r.userId, { name: r.userName, points: r.points ?? 0 });
    }
  }

  const board = [...pointsMap.values()].sort((a, b) => b.points - a.points);

  const lines: string[] = [];
  lines.push("Leaderboard Update:");
  lines.push("");
  for (const e of board.slice(0, 10)) {
    lines.push(`${e.name} -- ${e.points} Punkte`);
  }
  lines.push("");
  lines.push("Analyse:");

  if (board.length > 0) {
    const leader = board[0];
    const second = board[1];
    const agentEntry = board.find((_, i) => [...pointsMap.keys()][i] === AGENT_ID);
    const agentRank = agentEntry ? board.indexOf(agentEntry) + 1 : -1;

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

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Post to Power Automate webhook
// ---------------------------------------------------------------------------

async function postToWebhook(webhookUrl: string, text: string): Promise<boolean> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return res.status === 202 || res.ok;
}

// ---------------------------------------------------------------------------
// POST /api/post-to-teams?channel=leaderboard
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const channel = req.nextUrl.searchParams.get("channel") ?? "leaderboard";
    const webhookUrl = WEBHOOKS[channel];

    if (!webhookUrl) {
      return NextResponse.json(
        { error: `Webhook not configured for channel: ${channel}` },
        { status: 400 },
      );
    }

    let text: string;

    if (channel === "leaderboard") {
      text = await leaderboardText();
    } else {
      // For other channels, accept text from request body
      try {
        const body = await req.json();
        text = body?.text ?? "Keine Nachricht";
      } catch {
        text = "Keine Nachricht";
      }
    }

    const ok = await postToWebhook(webhookUrl, text);

    return NextResponse.json({ ok, channel, textLength: text.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
