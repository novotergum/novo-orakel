import { NextResponse } from "next/server";
import { getMatches, type NormalizedMatch } from "../../../lib/football-data";
import { readPredictions } from "../../../lib/store";

/**
 * GET /api/oracle-tips
 * Deckt die Tipps des UT-Orakels auf — aber NUR für Spiele, deren Anpfiff
 * (= Tippschluss) bereits vorbei ist. Tipps für noch offene Spiele verlassen
 * den Server nie, damit niemand das Orakel abschreiben kann. Transparenz nach
 * Lock, kein Kopier-Risiko davor.
 */

const ORACLE_ID = "ut-orakel";

export async function GET() {
  try {
    const [matches, preds] = await Promise.all([
      getMatches().catch(() => [] as NormalizedMatch[]),
      readPredictions().catch(() => []),
    ]);
    const now = Date.now();
    const kickoff = new Map<number, number>();
    for (const m of matches) {
      if (m.kickoff) kickoff.set(m.id, new Date(m.kickoff).getTime());
    }

    const tips: Record<number, { scoreTip: string; winnerPick: string; confidence: number | null }> = {};
    for (const p of preds) {
      if (p.userId !== ORACLE_ID) continue;
      const ko = kickoff.get(p.matchId);
      if (ko == null || now < ko) continue; // STRIKT: erst nach Anpfiff aufdecken
      tips[p.matchId] = {
        scoreTip: p.scoreTip,
        winnerPick: p.winnerPick,
        confidence: typeof p.pickProbability === "number" ? Math.round(p.pickProbability * 100) : null,
      };
    }
    return NextResponse.json({ tips });
  } catch {
    return NextResponse.json({ tips: {} });
  }
}
