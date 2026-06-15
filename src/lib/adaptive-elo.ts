/**
 * #5 Adaptives Elo: nimmt die statische FIFA-Basis (elo.ts) und spielt die
 * bereits ausgetragenen Turnierspiele nach, damit das Orakel die aktuelle
 * Turnierform kennt statt auf dem März-Ranking festzustecken.
 *
 *  - Elo-Update gegen den ECHTEN Gegner (nicht gegen einen 1500-Phantomgegner
 *    wie im toten dynamischen Pfad), K nach Tordifferenz gewichtet
 *    ("World Football Elo").
 *  - Torraten (goals_scored/conceded) und Form per EWMA Richtung Turnier.
 *
 * Reine Funktion: rein gehen die beendeten Spiele, raus kommt eine Map
 * name → TeamStats. Wer beim Live-Tipp ein anstehendes Spiel bewertet, ruft
 * buildAdaptiveStats nur mit den BEREITS beendeten Spielen auf → kein
 * Look-ahead.
 */

import type { TeamStats } from "./types";
import { getStaticFallbackByName } from "./elo";

export interface FinishedMatch {
  kickoff: string;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
}

const K_BASE = 24; // Turnier-K (wenige, hochkarätige Spiele)
const GOALS_ALPHA = 0.4; // EWMA-Gewicht der Turnier-Torraten
const FORM_ALPHA = 0.4;

// World-Football-Elo-Tordifferenz-Gewicht
function goalDiffMultiplier(gd: number): number {
  if (gd <= 1) return 1;
  if (gd === 2) return 1.5;
  return (11 + gd) / 8; // 3→1.75, 4→1.875, …
}

function expectedScore(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

export function buildAdaptiveStats(
  finished: FinishedMatch[],
): Map<string, TeamStats> {
  const map = new Map<string, TeamStats>();

  // Lazy-Seed aus der statischen FIFA-Basis, einmal pro Team
  const seed = (name: string): TeamStats => {
    let s = map.get(name);
    if (!s) {
      const base = getStaticFallbackByName(name);
      s = { ...base, name };
      map.set(name, s);
    }
    return s;
  };

  const games = [...finished].sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
  );

  for (const m of games) {
    if (!Number.isFinite(m.homeGoals) || !Number.isFinite(m.awayGoals)) continue;
    const home = seed(m.homeName);
    const away = seed(m.awayName);

    const resultHome =
      m.homeGoals > m.awayGoals ? 1 : m.homeGoals === m.awayGoals ? 0.5 : 0;
    const expHome = expectedScore(home.elo, away.elo);
    const gd = Math.abs(m.homeGoals - m.awayGoals);
    const k = K_BASE * goalDiffMultiplier(gd);
    const delta = k * (resultHome - expHome);

    home.elo = home.elo + delta;
    away.elo = away.elo - delta;

    // Torraten + Form per EWMA Richtung Turnier
    home.goals_scored = (1 - GOALS_ALPHA) * home.goals_scored + GOALS_ALPHA * m.homeGoals;
    home.goals_conceded = (1 - GOALS_ALPHA) * home.goals_conceded + GOALS_ALPHA * m.awayGoals;
    away.goals_scored = (1 - GOALS_ALPHA) * away.goals_scored + GOALS_ALPHA * m.awayGoals;
    away.goals_conceded = (1 - GOALS_ALPHA) * away.goals_conceded + GOALS_ALPHA * m.homeGoals;
    home.form = (1 - FORM_ALPHA) * home.form + FORM_ALPHA * resultHome;
    away.form = (1 - FORM_ALPHA) * away.form + FORM_ALPHA * (1 - resultHome);
  }

  return map;
}

/** Adaptive Stats für ein Team, mit statischem Fallback wenn noch kein Spiel. */
export function resolveStats(
  name: string,
  adaptive: Map<string, TeamStats>,
): TeamStats {
  const a = adaptive.get(name);
  if (a) return a;
  return { ...getStaticFallbackByName(name), name };
}
