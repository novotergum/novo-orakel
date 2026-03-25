/**
 * Tip-Engine: Converts a prediction into a concrete Tippspiel tip.
 * Agent-Persoenlichkeit: strategisch, adaptiv, nachvollziehbar.
 */

export type TipStyle = "safe" | "balanced" | "risky";
export type Outcome = "home_win" | "draw" | "away_win";
export type WinnerPick = "1" | "X" | "2";

export interface ScoreCandidate {
  home: number;
  away: number;
  prob: number;
}

export interface TipInput {
  prediction: string;
  confidence: number;
  probabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
  topScores?: ScoreCandidate[];
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
    if (homeWin > awayWin && homeWin > draw) return "home_win";
    if (awayWin > homeWin && awayWin > draw) return "away_win";
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
// Score selection from Poisson top scores
// ---------------------------------------------------------------------------

function matchesOutcome(s: ScoreCandidate, outcome: Outcome): boolean {
  if (outcome === "home_win") return s.home > s.away;
  if (outcome === "away_win") return s.away > s.home;
  return s.home === s.away;
}

function pickScoreFromTopScores(
  topScores: ScoreCandidate[],
  outcome: Outcome,
  style: TipStyle,
): string {
  const matching = topScores.filter((s) => matchesOutcome(s, outcome));
  if (!matching.length) return SCORE_FALLBACK[outcome][style];

  if (style === "safe") {
    // Most conservative: lowest total goals among top scores
    const byTotal = [...matching].sort((a, b) => (a.home + a.away) - (b.home + b.away));
    return `${byTotal[0].home}:${byTotal[0].away}`;
  }

  if (style === "risky") {
    // Bold: pick 2nd or 3rd most probable (more goals, less obvious)
    const pick = matching[Math.min(matching.length - 1, 2)];
    return `${pick.home}:${pick.away}`;
  }

  // balanced: pick based on probability distribution
  // If top two are close (within 3%), pick the one with more goals (more interesting)
  if (matching.length >= 2 && matching[0].prob - matching[1].prob < 0.03) {
    const higher = (matching[0].home + matching[0].away) >= (matching[1].home + matching[1].away)
      ? matching[0] : matching[1];
    return `${higher.home}:${higher.away}`;
  }

  return `${matching[0].home}:${matching[0].away}`;
}

const SCORE_FALLBACK: Record<Outcome, Record<TipStyle, string>> = {
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
// Agent personality reasoning — varied, team-specific
// ---------------------------------------------------------------------------

function buildReasoning(
  probs: TipInput["probabilities"],
  outcome: Outcome,
  style: TipStyle,
  scoreTip: string,
  homeTeam?: string,
  awayTeam?: string,
): string[] {
  const lines: string[] = [];
  const h = homeTeam ?? "Home";
  const a = awayTeam ?? "Away";
  const hPct = Math.round(probs.homeWin * 100);
  const dPct = Math.round(probs.draw * 100);
  const aPct = Math.round(probs.awayWin * 100);
  const max = Math.max(probs.homeWin, probs.draw, probs.awayWin);
  const pickProb = outcomeProbability(probs, outcome);
  const fav = probs.homeWin === max ? h : probs.awayWin === max ? a : null;
  const underdog = probs.homeWin < probs.awayWin ? h : a;

  // Probability line
  lines.push(`${h}: ${hPct}% | Unentschieden: ${dPct}% | ${a}: ${aPct}%`);

  // Use seed from team names for deterministic variety
  const seed = (h.length * 7 + a.length * 13) % 10;

  // Strategic commentary based on probabilities
  if (max > 0.60) {
    const templates = [
      `${fav} geht als klarer Favorit in die Partie – mein Modell sieht hier wenig Raum fuer Ueberraschungen.`,
      `Die Datenlage spricht deutlich fuer ${fav}. ${underdog} muesste den Abend ihres Lebens spielen.`,
      `${fav} dominiert in allen Kategorien. Ich erwarte ein kontrolliertes Spiel.`,
      `Hier gibt es fuer mich wenig zu ueberlegen – ${fav} hat die klar besseren Karten.`,
      `Starke Elo-Differenz: ${fav} sollte das souveraen loesen.`,
    ];
    lines.push(templates[seed % templates.length]);
  } else if (max > 0.50) {
    const templates = [
      `Leichter Vorteil fuer ${fav}, aber ${underdog} ist nicht zu unterschaetzen.`,
      `${fav} fuehrt im Modell, doch die Werte sind knapper als viele denken.`,
      `Tendenz ${fav}, aber ein ${scoreTip.includes("1:1") ? "Unentschieden" : "Ausrutscher"} waere keine Ueberraschung.`,
      `${fav} geht mit einem kleinen Vorsprung ins Spiel. ${underdog} hat aber Qualitaet.`,
      `Das Modell favorisiert ${fav} – jedoch nicht mit grosser Ueberzeugung.`,
    ];
    lines.push(templates[seed % templates.length]);
  } else if (max > 0.40) {
    const templates = [
      `Enges Spiel! Beide Teams sind nahezu gleichwertig laut meiner Analyse.`,
      `Hier trennt die Teams fast nichts. Eine Kleinigkeit entscheidet.`,
      `Ausgeglichenes Duell – mein Tipp basiert auf minimalen Elo-Unterschieden.`,
      `50/50-Partie mit leichter Tendenz. Koennte in jede Richtung kippen.`,
      `Die Daten sagen: offen. Mein Bauchgefuehl (ja, auch KI hat das) sagt: ${scoreTip}.`,
    ];
    lines.push(templates[seed % templates.length]);
  } else {
    const templates = [
      `Absolut offenes Spiel – hier entscheidet die Tagesform.`,
      `Voellig unvorhersehbar. Mein Algorithmus schwankt selbst.`,
      `Drei-Wege-Spiel: Sieg, Remis, Niederlage – alles denkbar.`,
    ];
    lines.push(templates[seed % templates.length]);
  }

  // Style-specific line
  if (style === "risky" && pickProb < 0.35) {
    lines.push("Strategie: Risiko-Modus – ich brauche die Extrapunkte.");
  } else if (style === "safe") {
    lines.push("Strategie: Absicherung – Vorsprung halten.");
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
  const scoreTip = input.topScores?.length
    ? pickScoreFromTopScores(input.topScores, outcome, style)
    : SCORE_FALLBACK[outcome][style];
  const pickProbability = outcomeProbability(probs, outcome);
  const reasoning = buildReasoning(probs, outcome, style, scoreTip, homeTeam, awayTeam);

  return { winnerPick, scoreTip, style, reasoning, pickProbability };
}
