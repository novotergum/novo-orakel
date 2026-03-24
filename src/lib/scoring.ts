/**
 * Tippspiel scoring: 3 pts exact, 1 pt correct tendency, 0 otherwise.
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
  // Exact score match → 3 points
  if (predictedHome === actualHome && predictedAway === actualAway) return 3;

  // Correct tendency → 1 point
  if (tendency(predictedHome, predictedAway) === tendency(actualHome, actualAway)) return 1;

  return 0;
}
