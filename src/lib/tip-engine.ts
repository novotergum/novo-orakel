/**
 * Tip-Engine: formt eine Prediction in einen konkreten Tippspiel-Tipp.
 *
 * Seit 2026-06-16 ist die Score-Wahl in die prediction-engine gewandert:
 *  - `prediction`  = EV-optimaler Score (max. erwartete Punkte) → safe/balanced
 *  - `modeScore`   = wahrscheinlichster exakter Score → risky (jagt die 4 Punkte)
 * Diese Datei wählt nur noch nach Stil aus und baut die Begründung.
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
  prediction: string; // EV-optimaler Score "H:A"
  modeScore?: string; // wahrscheinlichster exakter Score "H:A"
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

const SCORE_FALLBACK: Record<TipStyle, string> = {
  safe: "1:0",
  balanced: "1:1",
  risky: "2:1",
};

function parseScore(s: string | undefined): { home: number; away: number } | null {
  if (!s) return null;
  const [h, a] = s.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(a)) return null;
  return { home: h, away: a };
}

function outcomeOf(home: number, away: number): Outcome {
  if (home > away) return "home_win";
  if (home < away) return "away_win";
  return "draw";
}

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
  const fav = probs.homeWin === max ? h : probs.awayWin === max ? a : null;
  const underdog = probs.homeWin < probs.awayWin ? h : a;

  lines.push(`${h}: ${hPct}% | Unentschieden: ${dPct}% | ${a}: ${aPct}%`);

  const seed = (h.length * 7 + a.length * 13) % 10;

  if (max > 0.6) {
    const t = [
      `${fav} geht als klarer Favorit in die Partie – wenig Raum fuer Ueberraschungen.`,
      `Die Datenlage spricht deutlich fuer ${fav}. ${underdog} muesste den Abend des Lebens spielen.`,
      `${fav} dominiert in allen Kategorien. Ich erwarte ein kontrolliertes Spiel.`,
      `Hier gibt es wenig zu ueberlegen – ${fav} hat die klar besseren Karten.`,
      `Starke Elo-Differenz: ${fav} sollte das souveraen loesen.`,
    ];
    lines.push(t[seed % t.length]);
  } else if (max > 0.5) {
    const t = [
      `Leichter Vorteil fuer ${fav}, aber ${underdog} ist nicht zu unterschaetzen.`,
      `${fav} fuehrt im Modell, doch die Werte sind knapper als viele denken.`,
      `Tendenz ${fav}, aber ein ${scoreTip.includes(":") && outcome === "draw" ? "Unentschieden" : "Ausrutscher"} waere keine Ueberraschung.`,
      `${fav} geht mit kleinem Vorsprung ins Spiel. ${underdog} hat aber Qualitaet.`,
      `Das Modell favorisiert ${fav} – jedoch nicht mit grosser Ueberzeugung.`,
    ];
    lines.push(t[seed % t.length]);
  } else if (max > 0.4) {
    const t = [
      `Enges Spiel! Beide Teams sind nahezu gleichwertig.`,
      `Hier trennt die Teams fast nichts. Eine Kleinigkeit entscheidet.`,
      `Ausgeglichenes Duell – mein Tipp basiert auf minimalen Unterschieden.`,
      `50/50-Partie mit leichter Tendenz. Koennte in jede Richtung kippen.`,
      `Die Daten sagen: offen. Mein Tipp: ${scoreTip}.`,
    ];
    lines.push(t[seed % t.length]);
  } else {
    const t = [
      `Absolut offenes Spiel – hier entscheidet die Tagesform.`,
      `Voellig unvorhersehbar. Mein Algorithmus schwankt selbst.`,
      `Drei-Wege-Spiel: Sieg, Remis, Niederlage – alles denkbar.`,
    ];
    lines.push(t[seed % t.length]);
  }

  if (outcome === "draw") {
    lines.push("Mein Modell sieht hier echte Remis-Gefahr – der Tipp spielt das bewusst.");
  } else if (style === "safe") {
    lines.push("Strategie: Absicherung – Vorsprung halten.");
  } else if (style === "risky") {
    lines.push("Strategie: Risiko-Modus – ich jage das exakte Ergebnis.");
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
  // Risiko jagt das exakte Ergebnis (Modus), sonst der EV-optimale Score.
  const chosen =
    (style === "risky" ? parseScore(input.modeScore) : null) ??
    parseScore(input.prediction) ??
    parseScore(SCORE_FALLBACK[style])!;

  const outcome = outcomeOf(chosen.home, chosen.away);
  const winnerPick = pickWinner(outcome);
  const scoreTip = `${chosen.home}:${chosen.away}`;
  const pickProbability = outcomeProbability(input.probabilities, outcome);
  const reasoning = buildReasoning(
    input.probabilities,
    outcome,
    style,
    scoreTip,
    homeTeam,
    awayTeam,
  );

  return { winnerPick, scoreTip, style, reasoning, pickProbability };
}
