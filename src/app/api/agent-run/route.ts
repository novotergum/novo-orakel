import { NextRequest, NextResponse } from "next/server";
import { getMatches } from "../../../lib/football-data";
import { getTeamRecentMatches, buildTeamElo, predictFromElo } from "../../../lib/elo";
import { buildTipFromPrediction, type TipStyle } from "../../../lib/tip-engine";
import { upsertPrediction, readPredictions, type PredictionRecord } from "../../../lib/store";

const AGENT_ID = "ut-orakel";
const AGENT_NAME = "UT Orakel";
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

  const sorted = [...pointsMap.entries()].sort((a, b) => b[1] - a[1]);
  const agentIdx = sorted.findIndex(([id]) => id === AGENT_ID);
  const rank = agentIdx >= 0 ? agentIdx + 1 : sorted.length + 1;

  if (rank === 1) return { style: "safe", rank };
  if (rank > 3) return { style: "risky", rank };
  return { style: "balanced", rank };
}

// ---------------------------------------------------------------------------
// Agent comment per match
// ---------------------------------------------------------------------------

function agentComment(
  pickProbability: number,
  pick: string,
  home: string,
  away: string,
): string {
  if (pickProbability > 0.65) {
    const winner = pick === "1" ? home : pick === "2" ? away : null;
    if (winner) return `Das ist meine sichere Bank heute.`;
    return "Klare Sache laut Modell.";
  }
  if (pickProbability < 0.30) {
    return "Ich gehe hier bewusst gegen den Trend.";
  }
  if (pickProbability < 0.40) {
    return "Das wird enger als viele denken.";
  }
  if (pickProbability > 0.55) {
    return "Klassischer Favoritensieg.";
  }
  return "Leichter Vorteil, aber kein klares Spiel.";
}

function pickLabel(pick: string): string {
  if (pick === "1") return "HOME";
  if (pick === "2") return "AWAY";
  return "X";
}

// ---------------------------------------------------------------------------
// Build formatted Teams post
// ---------------------------------------------------------------------------

interface MatchResult {
  matchId: number;
  ok: boolean;
  home?: string;
  away?: string;
  tip?: string;
  pick?: string;
  pickProbability?: number;
  reasoning?: string[];
  comment?: string;
  error?: string;
}

function buildTeamsPost(results: MatchResult[], rank: number, style: TipStyle): string {
  const lines: string[] = [];
  lines.push("UT Orakel:");
  lines.push("");

  const successful = results.filter((r) => r.ok && r.home && r.away);

  for (const r of successful) {
    lines.push(`${r.home} vs ${r.away}`);
    lines.push(`Tipp: ${r.tip}`);
    lines.push(`Tendenz: ${pickLabel(r.pick!)}`);
    lines.push(`Confidence: ${Math.round((r.pickProbability ?? 0) * 100)}%`);
    lines.push(r.comment ?? "");
    lines.push("");
  }

  if (style === "risky") {
    lines.push(`Strategie: Rang ${rank} - Risiko-Modus. Ich brauche Punkte.`);
  } else if (style === "safe") {
    lines.push(`Strategie: Rang ${rank} - Absicherung. Vorsprung halten.`);
  } else {
    lines.push(`Strategie: Rang ${rank} - Ausgewogen.`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tip a single match
// ---------------------------------------------------------------------------

async function tipMatch(
  match: { id: number; homeTeam: { id: number; name: string }; awayTeam: { id: number; name: string } },
  style: TipStyle,
): Promise<MatchResult> {
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
      topScores: prediction.topScores,
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

  const comment = agentComment(
    tip.pickProbability,
    tip.winnerPick,
    match.homeTeam.name,
    match.awayTeam.name,
  );

  return {
    matchId: match.id,
    ok: true,
    home: match.homeTeam.name,
    away: match.awayTeam.name,
    tip: tip.scoreTip,
    pick: tip.winnerPick,
    pickProbability: tip.pickProbability,
    reasoning: tip.reasoning,
    comment,
  };
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
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

    const matches = await getMatches({ status: "SCHEDULED,TIMED" });

    if (!matches.length) {
      return NextResponse.json({
        ok: true,
        agent: AGENT_NAME,
        rank,
        style,
        count: 0,
        teamsPost: "UT Orakel:\n\nKeine Spiele heute. Pause.",
        results: [],
      });
    }

    const results: MatchResult[] = [];

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
        results.push(result);
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

    const teamsPost = buildTeamsPost(results, rank, style);

    return NextResponse.json({
      ok: true,
      agent: AGENT_NAME,
      rank,
      style,
      teamsPost,
      count: results.filter((r) => r.ok).length,
      total: matches.length,
      results,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
