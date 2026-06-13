import { NextResponse } from "next/server";
import { getSession, userIdFromEmail } from "@/lib/auth";
import {
  getPendingRankMove,
  markRankMoveSeen,
  type RankMove,
} from "@/lib/store";

// Motivierender Spruch aus der Rang-Bewegung. Reihenfolge = Prioritaet:
// Spitze > Podium > generelle Verbesserung.
function messageFor(move: RankMove): string {
  if (move.becameLeader) return "👑 Neuer Spitzenreiter — du führst das Tippspiel an!";
  if (move.enteredTop3) return `🥉 Willkommen auf dem Podium — du stehst auf Platz ${move.to}!`;
  const places = move.from != null ? move.from - move.to : 0;
  if (places >= 3) return `🚀 +${places} Plätze! Starker Spieltag — jetzt Platz ${move.to}.`;
  if (places === 2) return `📈 Zwei Plätze gut — rauf auf Platz ${move.to}. Weiter so!`;
  return `📈 Ein Platz gut — jetzt Platz ${move.to}. Weiter so!`;
}

// Farbstufe: Gold bleibt EXKLUSIV der Spitze vorbehalten, Podium = Bronze,
// jede sonstige Verbesserung = Grün (neutral-positiv).
function tierFor(move: RankMove): "leader" | "podium" | "up" {
  if (move.becameLeader) return "leader";
  if (move.enteredTop3) return "podium";
  return "up";
}

/** GET /api/rank-move → { move, message } | { move: null } */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ move: null });
  try {
    const userId = userIdFromEmail(session.email);
    const move = await getPendingRankMove(userId);
    if (!move) return NextResponse.json({ move: null });
    return NextResponse.json({ move, message: messageFor(move), tier: tierFor(move) });
  } catch {
    return NextResponse.json({ move: null });
  }
}

/** POST /api/rank-move → quittiert die aktuelle Bewegung (Dismiss) */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    await markRankMoveSeen(userIdFromEmail(session.email));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
