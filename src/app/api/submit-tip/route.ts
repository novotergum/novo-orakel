import { NextRequest, NextResponse } from "next/server";
import { upsertPrediction, type PredictionRecord } from "../../../lib/store";

interface SubmitBody {
  matchId: number;
  userId: string;
  userName: string;
  winnerPick: "1" | "X" | "2";
  scoreTip: string;
  style?: string;
  source?: "human" | "agent";
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

    const record: PredictionRecord = {
      id: `${body.matchId}_${body.userId}`,
      matchId: body.matchId,
      userId: body.userId,
      userName: body.userName,
      source: body.source === "agent" ? "agent" : "human",
      winnerPick: body.winnerPick,
      scoreTip: body.scoreTip,
      style: body.style,
      createdAt: new Date().toISOString(),
    };

    const saved = await upsertPrediction(record);
    return NextResponse.json({ ok: true, prediction: saved });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
