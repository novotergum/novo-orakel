/**
 * Tippspiel scoring (NOVO-Orakel WM 2026):
 *   4P exaktes Ergebnis
 *   3P richtige Tordifferenz
 *   2P richtige Tendenz (Sieg/Unentschieden/Niederlage)
 *   0P falsch
 *   +5P Upset-Bonus (korrekte Prediction bei < 35% Wahrscheinlichkeit)
 *
 * K.O.-Runden-Multiplikator:
 *   Gruppenphase:  1x
 *   Achtelfinale:  1.5x
 *   Viertelfinale: 2x
 *   Halbfinale:    2.5x
 *   Spiel um Platz 3: 2x
 *   Finale:        3x
 */

type Tendency = "1" | "X" | "2";

function tendency(home: number, away: number): Tendency {
  if (home > away) return "1";
  if (home < away) return "2";
  return "X";
}

export function parseScoreTip(scoreTip: string): { home: number; away: number } {
  const parts = scoreTip.split(":");
  if (parts.length !== 2) throw new Error(`Invalid scoreTip: ${scoreTip}`);
  const home = parseInt(parts[0], 10);
  const away = parseInt(parts[1], 10);
  if (isNaN(home) || isNaN(away)) throw new Error(`Invalid scoreTip: ${scoreTip}`);
  return { home, away };
}

export function scoreTip(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number,
): number {
  // Exaktes Ergebnis → 4 Punkte
  if (predictedHome === actualHome && predictedAway === actualAway) return 4;

  // Richtige Tordifferenz → 3 Punkte
  if (predictedHome - predictedAway === actualHome - actualAway) return 3;

  // Richtige Tendenz → 2 Punkte
  if (tendency(predictedHome, predictedAway) === tendency(actualHome, actualAway)) return 2;

  return 0;
}

/**
 * Upset-Bonus: +5 wenn die getippte Tendenz korrekt war
 * UND die Wahrscheinlichkeit des getippten Outcomes < 0.35.
 */
/**
 * Multiplikator basierend auf der Turnierphase.
 * Punkte werden gerundet (Math.round).
 */
export function stageMultiplier(stage: string | null | undefined): number {
  switch (stage) {
    case "LAST_16":
      return 1.5;
    case "QUARTER_FINALS":
      return 2;
    case "SEMI_FINALS":
      return 2.5;
    case "THIRD_PLACE":
      return 2;
    case "FINAL":
      return 3;
    default:
      return 1;
  }
}

export const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE: "Gruppenphase",
  LAST_16: "Achtelfinale",
  QUARTER_FINALS: "Viertelfinale",
  SEMI_FINALS: "Halbfinale",
  THIRD_PLACE: "Spiel um Platz 3",
  FINAL: "Finale",
};

export function upsetBonus(
  winnerPick: "1" | "X" | "2",
  actualHome: number,
  actualAway: number,
  pickProbability: number,
): number {
  const actualTendency = tendency(actualHome, actualAway);
  if (winnerPick !== actualTendency) return 0;
  if (pickProbability >= 0.35) return 0;
  return 5;
}
