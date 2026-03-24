import { NextRequest, NextResponse } from "next/server";
import { getMatches } from "../../../lib/football-data";
import { getTeamRecentMatches, buildTeamElo, predictFromElo } from "../../../lib/elo";
import { buildTipFromPrediction, type TipStyle } from "../../../lib/tip-engine";
import { upsertPrediction, readPredictions, type PredictionRecord } from "../../../lib/store";

const AGENT_ID = "novo-orakel";
const AGENT_NAME = "NOVO-Orakel";
const VALID_STYLES: TipStyle[] = ["safe", "balanced", "risky"];

// ---------------------------------------------------------------------------
// Strategic steering: adapt style based on leaderboard position
// ---------------------------------------------------------------------------

async function determineAgentStyle(): Promise<{ style: TipStyle; rank: number }> {
  const records = await readPredictions();

  const pointsMap = new Map<string, number>();
  for (const r of records) {
    pointsMap.set(r.userId, (pointsMap.get(r.userId) ?? 0) + (r.points ?? 0));
  }

  // Sort by points descending
  const sorted = [...pointsMap.entries()].sort((a, b) => b[1] - a[1]);
  const agentIdx = sorted.findIndex(([id]) => id === AGENT_ID);
  const rank = agentIdx >= 0 ? agentIdx + 1 : sorted.length + 1;

  // Strategic rules
  if (rank === 1) return { style: "safe", rank };
  if (rank > 3) return { style: "risky", rank };
  return { style: "balanced", rank };
}

// ---------------------------------------------------------------------------
// Daily "sichere Bank" pick
// ---------------------------------------------------------------------------

function findSichereBank(
  results: { home: string; away: string; pick: string; pickProbability?: number }[],
): string | null {
  let best: { text: string; prob: number } | null = null;
  for (const r of results) {
    const prob = r.pickProbability ?? 0;
    if (prob > 0.60 && (!best || prob > best.prob)) {
      const winner = r.pick === "1" ? r.home : r.pick === "2" ? r.away : null;
      if (winner) {
        best = { text: `Heute sichere Bank: ${winner} gewinnt`, prob };
      }
    }
  }
  return best?.text ?? null;
}

// ---------------------------------------------------------------------------
// Tip a single match
// ---------------------------------------------------------------------------

async function tipMatch(
  match: { id: number; homeTeam: { id: number; name: string }; awayTeam: { id: number; name: string } },
  style: TipStyle,
) {
  const [homeMatches, awayMatches] = await Promise.all([
    getTeamRecentMatches(match.homeTeam.id),
    getTeamRecentMatches(match.awayTeam.id),
  ]);

  const homeElo = buildTeamElo(homeMatches, match.homeTeam.id);
  const awayElo = buildTeamElo(awayMatches, match.awayTeam.id);

  const prediction = predictFromElo(
    { ...homeElo.stats, name: match.homeTeam.name },
    { ...awayElo.stats, name: match.awayTeam.name },
  );

  const probs = prediction.probabilities;
  const tip = buildTipFromPrediction(
    {
      prediction: prediction.prediction,
      confidence: prediction.confidence,
      probabilities: {
        homeWin: probs.home_win,
        draw: probs.draw,
        awayWin: probs.away_win,
      },
    },
    style,
    match.homeTeam.name,
    match.awayTeam.name,
  );

  const record: PredictionRecord = {
    id: `${match.id}_${AGENT_ID}`,
    matchId: match.id,
    userId: AGENT_ID,
    userName: AGENT_NAME,
    source: "agent",
    winnerPick: tip.winnerPick,
    scoreTip: tip.scoreTip,
    style: tip.style,
    pickProbability: tip.pickProbability,
    createdAt: new Date().toISOString(),
  };

  await upsertPrediction(record);

  return {
    matchId: match.id,
    home: match.homeTeam.name,
    away: match.awayTeam.name,
    tip: tip.scoreTip,
    pick: tip.winnerPick,
    pickProbability: tip.pickProbability,
    reasoning: tip.reasoning,
  };
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    // Determine style: explicit override or strategic auto
    let styleOverride: TipStyle | null = null;
    try {
      const body = await req.json();
      if (body?.style && VALID_STYLES.includes(body.style)) {
        styleOverride = body.style;
      }
    } catch {
      // no body is fine
    }

    const { style: autoStyle, rank } = await determineAgentStyle();
    const style = styleOverride ?? autoStyle;

    // Fetch upcoming matches
    const matches = await getMatches({ status: "SCHEDULED,TIMED" });

    if (!matches.length) {
      return NextResponse.json({
        ok: true,
        agent: AGENT_NAME,
        rank,
        style,
        count: 0,
        message: "Keine anstehenden Spiele gefunden",
        results: [],
      });
    }

    const results: {
      matchId: number;
      ok: boolean;
      home?: string;
      away?: string;
      tip?: string;
      pick?: string;
      pickProbability?: number;
      reasoning?: string[];
      error?: string;
    }[] = [];

    for (const m of matches) {
      try {
        const result = await tipMatch(
          {
            id: m.id,
            homeTeam: { id: m.homeTeam.id, name: m.homeTeam.name },
            awayTeam: { id: m.awayTeam.id, name: m.awayTeam.name },
          },
          style,
        );
        results.push({ ...result, ok: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        results.push({
          matchId: m.id,
          ok: false,
          home: m.homeTeam.name,
          away: m.awayTeam.name,
          error: msg,
        });
      }
    }

    const successful = results.filter((r) => r.ok);
    const sichereBank = findSichereBank(
      successful as { home: string; away: string; pick: string; pickProbability?: number }[],
    );

    return NextResponse.json({
      ok: true,
      agent: AGENT_NAME,
      rank,
      style,
      strategicNote:
        style === "risky"
          ? `Rang ${rank} - Risiko-Modus aktiviert, ich brauche Punkte.`
          : style === "safe"
            ? `Rang ${rank} - Fuehrung absichern, kein unnoeties Risiko.`
            : `Rang ${rank} - Ausgewogene Strategie.`,
      sichereBank,
      count: successful.length,
      total: matches.length,
      results,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
