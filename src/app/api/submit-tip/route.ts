import { NextRequest, NextResponse } from "next/server";
import { upsertPrediction, type PredictionRecord } from "../../../lib/store";
import { getMatches } from "../../../lib/football-data";

interface SubmitBody {
  matchId: number;
  userId: string;
  userName: string;
  winnerPick: "1" | "X" | "2";
  scoreTip: string;
  style?: string;
  source?: "human" | "agent";
  location?: string;
}

const VALID_PICKS = ["1", "X", "2"];
const SCORE_RE = /^\d+:\d+$/;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SubmitBody;

    if (!body?.matchId || !body.userId || !body.userName) {
      return NextResponse.json(
        { error: "matchId, userId, userName required" },
        { status: 400 },
      );
    }

    if (!VALID_PICKS.includes(body.winnerPick)) {
      return NextResponse.json(
        { error: "winnerPick must be 1, X, or 2" },
        { status: 400 },
      );
    }

    if (!body.scoreTip || !SCORE_RE.test(body.scoreTip)) {
      return NextResponse.json(
        { error: "scoreTip must be in format 'H:A' (e.g. 2:1)" },
        { status: 400 },
      );
    }

    // Deadline-Logik: Keine Tipps nach Anpfiff
    try {
      const matches = await getMatches();
      const match = matches.find((m) => m.id === body.matchId);
      if (match) {
        const kickoff = new Date(match.kickoff).getTime();
        const now = Date.now();
        if (now >= kickoff) {
          return NextResponse.json(
            { error: "Tippabgabe geschlossen" },
            { status: 400 },
          );
        }
      }
    } catch {
      // If match lookup fails, allow the tip (graceful degradation)
    }

    const record: PredictionRecord = {
      id: `${body.matchId}_${body.userId}`,
      matchId: body.matchId,
      userId: body.userId,
      userName: body.userName,
      source: body.source === "agent" ? "agent" : "human",
      winnerPick: body.winnerPick,
      scoreTip: body.scoreTip,
      style: body.style,
      location: body.location,
      createdAt: new Date().toISOString(),
    };

    const saved = await upsertPrediction(record);
    return NextResponse.json({ ok: true, prediction: saved });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
