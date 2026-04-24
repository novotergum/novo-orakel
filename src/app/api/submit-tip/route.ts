import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { upsertPrediction, type PredictionRecord } from "../../../lib/store";
import { getMatches } from "../../../lib/football-data";
import { getSession, userIdFromEmail } from "@/lib/auth";

interface SubmitBody {
  matchId: number;
  winnerPick: "1" | "X" | "2";
  scoreTip: string;
  style?: string;
  source?: "human" | "agent"; // ignored for human submissions; agents use a separate endpoint
}

const VALID_PICKS = ["1", "X", "2"];
const SCORE_RE = /^\d+:\d+$/;

interface UserProfile {
  userId: string;
  userName: string;
  location?: string;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "nicht eingeloggt" }, { status: 401 });
    }

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    const userId = userIdFromEmail(session.email);
    const profile = (await redis.get(`user:${userId}`)) as UserProfile | null;
    if (!profile) {
      return NextResponse.json({ error: "Profil fehlt" }, { status: 403 });
    }

    const body = (await req.json()) as SubmitBody;

    if (!body?.matchId) {
      return NextResponse.json(
        { error: "matchId required" },
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

    // Deadline-Logik & Stage ermitteln
    let stage: string | undefined;
    try {
      const matches = await getMatches();
      const match = matches.find((m) => m.id === body.matchId);
      if (match) {
        const kickoff = new Date(match.kickoff).getTime();
        if (Date.now() >= kickoff) {
          return NextResponse.json(
            { error: "Tippabgabe geschlossen" },
            { status: 400 },
          );
        }
        if (match.stage) stage = match.stage;
      }
    } catch {
      // If match lookup fails, allow the tip (graceful degradation)
    }

    // Identity & location come from the server-side profile, NOT the client body.
    const record: PredictionRecord = {
      id: `${body.matchId}_${userId}`,
      matchId: body.matchId,
      userId,
      userName: profile.userName,
      source: "human",
      winnerPick: body.winnerPick,
      scoreTip: body.scoreTip,
      style: body.style,
      location: profile.location,
      stage,
      createdAt: new Date().toISOString(),
    };

    const saved = await upsertPrediction(record);
    return NextResponse.json({ ok: true, prediction: saved });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
