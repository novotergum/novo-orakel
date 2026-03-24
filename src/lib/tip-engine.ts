/**
 * Tip-Engine: Converts a prediction into a concrete Tippspiel tip.
 * Agent-Persoenlichkeit: strategisch, adaptiv, nachvollziehbar.
 */

export type TipStyle = "safe" | "balanced" | "risky";
export type Outcome = "home_win" | "draw" | "away_win";
export type WinnerPick = "1" | "X" | "2";

export interface TipInput {
  prediction: string;
  confidence: number;
  probabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
}

export interface TipResult {
  winnerPick: WinnerPick;
  scoreTip: string;
  style: TipStyle;
  reasoning: string[];
  pickProbability: number; // probability of the chosen outcome
}

// ---------------------------------------------------------------------------
// Determine outcome from probabilities
// ---------------------------------------------------------------------------

function pickOutcome(
  probs: TipInput["probabilities"],
  style: TipStyle,
): Outcome {
  const { homeWin, draw, awayWin } = probs;
  const max = Math.max(homeWin, draw, awayWin);

  if (style === "safe") {
    if (max < 0.45) return "draw";
    if (homeWin === max) return "home_win";
    if (awayWin === max) return "away_win";
    return "draw";
  }

  if (style === "risky") {
    // Aggressive: pick the leader even if slim margin
    if (homeWin > awayWin && homeWin > draw) return "home_win";
    if (awayWin > homeWin && awayWin > draw) return "away_win";
    // Tight game → still pick a winner if gap > 0.05
    if (Math.abs(homeWin - awayWin) > 0.05) {
      return homeWin > awayWin ? "home_win" : "away_win";
    }
    return "draw";
  }

  // balanced (default)
  if (max < 0.40) return "draw";
  if (homeWin === max) return "home_win";
  if (awayWin === max) return "away_win";
  return "draw";
}

// ---------------------------------------------------------------------------
// Map outcome + style to a concrete score tip
// ---------------------------------------------------------------------------

const SCORE_MAP: Record<Outcome, Record<TipStyle, string>> = {
  home_win: { safe: "1:0", balanced: "2:1", risky: "3:1" },
  draw: { safe: "1:1", balanced: "1:1", risky: "2:2" },
  away_win: { safe: "0:1", balanced: "1:2", risky: "1:3" },
};

function pickWinner(outcome: Outcome): WinnerPick {
  if (outcome === "home_win") return "1";
  if (outcome === "away_win") return "2";
  return "X";
}

function outcomeProbability(
  probs: TipInput["probabilities"],
  outcome: Outcome,
): number {
  if (outcome === "home_win") return probs.homeWin;
  if (outcome === "away_win") return probs.awayWin;
  return probs.draw;
}

// ---------------------------------------------------------------------------
// Agent personality reasoning
// ---------------------------------------------------------------------------

function buildReasoning(
  probs: TipInput["probabilities"],
  outcome: Outcome,
  style: TipStyle,
  homeTeam?: string,
  awayTeam?: string,
): string[] {
  const lines: string[] = [];
  const h = homeTeam ?? "Home";
  const a = awayTeam ?? "Away";
  const max = Math.max(probs.homeWin, probs.draw, probs.awayWin);
  const pickProb = outcomeProbability(probs, outcome);

  lines.push(
    `${h}: ${(probs.homeWin * 100).toFixed(0)}% | Unentschieden: ${(probs.draw * 100).toFixed(0)}% | ${a}: ${(probs.awayWin * 100).toFixed(0)}%`,
  );

  // Strategic personality
  if (style === "risky" && pickProb < 0.35) {
    lines.push(
      "Ich gehe hier bewusst gegen den Trend - das Spiel ist ausgeglichener als erwartet.",
    );
  } else if (max > 0.60) {
    const fav = probs.homeWin === max ? h : probs.awayWin === max ? a : "Unentschieden";
    lines.push(`Klassischer Favoritensieg: ${fav} ist klar vorne.`);
  } else if (max > 0.45) {
    const fav = probs.homeWin === max ? h : probs.awayWin === max ? a : "keines";
    lines.push(`Leichter Vorteil fuer ${fav}, aber kein klares Spiel.`);
  } else {
    lines.push("Voellig offenes Spiel - hier entscheiden Kleinigkeiten.");
  }

  if (style === "risky") {
    lines.push("Strategie: Risiko-Modus - ich brauche Punkte.");
  } else if (style === "safe") {
    lines.push("Strategie: Absicherung - Vorsprung halten.");
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function buildTipFromPrediction(
  input: TipInput,
  style: TipStyle = "balanced",
  homeTeam?: string,
  awayTeam?: string,
): TipResult {
  const probs = input.probabilities;
  const outcome = pickOutcome(probs, style);
  const winnerPick = pickWinner(outcome);
  const scoreTip = SCORE_MAP[outcome][style];
  const pickProbability = outcomeProbability(probs, outcome);
  const reasoning = buildReasoning(probs, outcome, style, homeTeam, awayTeam);

  return { winnerPick, scoreTip, style, reasoning, pickProbability };
}
