/**
 * Post-Turnier-Auswertung (WM 2026 Tippspiel).
 *
 * Liest alle Tipps (predictions:h) und joint sie mit den beendeten Spielen,
 * um Grundpunkte / Upset-Bonus / echtes Ergebnis sauber zu rekonstruieren
 * (das gespeicherte r.points enthaelt bereits Multiplikator + Bonus, aber fuer
 * "exakt/Tendenz", "groesster Upset" und "krasseste Fehlprognose" brauchen wir
 * die Einzelteile + das tatsaechliche Ergebnis).
 *
 * Kern-Idee Mensch vs. Maschine: Das Orakel ist EIN Tipper. Der faire Vergleich
 * ist gegen den Durchschnitt/Median der Menschen und das Perzentil
 * ("schlaegt X % aller Menschen") — nicht gegen den Glueckstreffer aus ~100.
 */

import { readPredictions, readStandortByEmail } from "./store";
import { getMatches, type NormalizedMatch } from "./football-data";
import { parseScoreTip, scoreTip, upsetBonus, stageMultiplier } from "./scoring";

const MIN_TIPS_FOR_RATE = 8; // Mindesttipps fuer "Treffsicherster" (sonst 1/1 = 100 %)
const MIN_PLAYERS_PER_LOCATION = 2; // Mindestspieler, damit ein Standort gewertet wird

// Der Standort ist ein Freitextfeld -> Schreibvarianten zersplittern denselben
// Ort. Wir normalisieren (lowercase, ohne Diakritika, Bindestrich=Leerzeichen)
// und mergen bekannte Varianten ueber LOCATION_ALIASES. Schluessel sind bereits
// normalisiert. Bewusst KONSERVATIV: nur eindeutig gleiche Orte zusammenfassen
// (z. B. Koeln Rodenkirchen bleibt getrennt von Koeln).
const LOCATION_ALIASES: Record<string, string> = {
  westerholt: "herten westerholt",
  // "Herten-Westerholt" normalisiert ohnehin zu "herten westerholt"
};
// Bevorzugte Anzeige je kanonischem Schluessel (sonst Personio-/haeufigste Eingabe).
const LOCATION_DISPLAY: Record<string, string> = {
  "uthiii.hq": "Zentrale",
  "uthiii.hq bayern": "Zentrale Bayern",
};

function normLocation(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Diakritika entfernen (Hürth -> hurth)
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalLocationKey(raw: string): string {
  const k = normLocation(raw);
  return LOCATION_ALIASES[k] ?? k;
}

function mostCommon(labels: Map<string, number>): string {
  let best = "";
  let bestN = -1;
  for (const [label, n] of labels) {
    if (n > bestN) {
      best = label;
      bestN = n;
    }
  }
  return best;
}

// Anzeige: explizites Label > haeufigste Personio-Schreibweise > haeufigste
// Selbstangabe. So gewinnt der offizielle Standortname die Beschriftung.
function locationDisplayLabel(
  key: string,
  personioLabels: Map<string, number>,
  selfLabels: Map<string, number>,
): string {
  return (
    LOCATION_DISPLAY[key] ||
    mostCommon(personioLabels) ||
    mostCommon(selfLabels) ||
    key
  );
}

export interface PlayerStat {
  userId: string;
  userName: string;
  source: "human" | "agent";
  location: string;
  fromPersonio: boolean; // Standort aus Personio (sonst Selbstangabe)
  points: number;
  tips: number;
  exact: number;
  diff: number;
  tendency: number;
  upsetHits: number;
}

export interface RecordFact {
  userName: string;
  source: "human" | "agent";
  matchLabel: string;
  stage: string | null;
  scoreTip: string;
  actual: string;
  base: number;
  bonus: number;
  total: number;
  diffError: number; // |getippte Tordifferenz - echte Tordifferenz|
  pickProbability?: number;
}

export interface LocationStat {
  location: string;
  avg: number;
  median: number;
  players: number;
  points: number;
}

export interface OrakelStat {
  userName: string;
  points: number;
  tips: number;
  rank: number; // Platz im Gesamtranking (inkl. Menschen)
  totalPlayers: number;
  percentile: number; // % der Menschen mit weniger Punkten
  beatsHumans: number; // Anzahl Menschen mit weniger Punkten
}

export interface StatsResult {
  tournamentEnded: boolean;
  finishedMatches: number;
  totalTips: number;
  // Mensch vs. Maschine (fair)
  humanAvg: number;
  humanMedian: number;
  humanCount: number;
  humanBest: number;
  orakel: OrakelStat | null;
  machineAvg: number;
  machineCount: number;
  // Champion & Helden
  champion: PlayerStat | null;
  bestHuman: PlayerStat | null;
  sharpest: PlayerStat | null; // beste Exakt-Quote (min. Tipps)
  busiest: PlayerStat | null; // meiste Tipps
  highestSingle: RecordFact | null; // hoechste Einzelpunktzahl
  // Ausreisser & Kuriositaeten
  biggestUpset: RecordFact | null;
  worstMiss: RecordFact | null;
  mostTippedScore: { score: string; count: number; correctCount: number } | null;
  // Standort
  locations: LocationStat[];
  // Voll-Ranking (fuer optionale Tabelle)
  board: PlayerStat[];
}

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function computeStats(): Promise<StatsResult> {
  const [records, finished, standortByEmail] = await Promise.all([
    readPredictions(),
    getMatches({ status: "FINISHED" }).catch(() => [] as NormalizedMatch[]),
    readStandortByEmail().catch(() => ({} as Record<string, string>)),
  ]);

  const matchById = new Map<number, NormalizedMatch>();
  for (const m of finished) matchById.set(m.id, m);

  const tournamentEnded = finished.some(
    (m) => m.stage === "FINAL" && m.score.home != null && m.score.away != null,
  );

  const players = new Map<string, PlayerStat>();
  const facts: RecordFact[] = [];
  const scoreCounter = new Map<string, { count: number; correct: number }>();
  let resolvedTips = 0;

  for (const r of records) {
    let p = players.get(r.userId);
    if (!p) {
      const personioLoc = standortByEmail[r.userId.toLowerCase().trim()];
      p = {
        userId: r.userId,
        userName: r.userName,
        source: r.source,
        location: personioLoc || (r.location || "").trim() || "Unbekannt",
        fromPersonio: Boolean(personioLoc),
        points: 0,
        tips: 0,
        exact: 0,
        diff: 0,
        tendency: 0,
        upsetHits: 0,
      };
      players.set(r.userId, p);
    }

    const m = matchById.get(r.matchId);
    const hasResult = m && m.score.home != null && m.score.away != null;
    if (!hasResult) continue; // nur ausgewertete Tipps zaehlen ins Endergebnis

    const actualHome = m.score.home as number;
    const actualAway = m.score.away as number;

    let base = 0;
    let bonus = 0;
    let diffError = 0;
    try {
      const parsed = parseScoreTip(r.scoreTip);
      base = scoreTip(parsed.home, parsed.away, actualHome, actualAway);
      const prob = typeof r.pickProbability === "number" ? r.pickProbability : 1;
      bonus = upsetBonus(r.winnerPick, actualHome, actualAway, prob);
      diffError = Math.abs(parsed.home - parsed.away - (actualHome - actualAway));
    } catch {
      base = 0;
      bonus = 0;
    }
    const stage = r.stage || m.stage;
    const mult = stageMultiplier(stage);
    const total =
      typeof r.points === "number" ? r.points : Math.round((base + bonus) * mult);

    resolvedTips += 1;
    p.points += total;
    p.tips += 1;
    if (base === 4) p.exact += 1;
    else if (base === 3) p.diff += 1;
    else if (base === 2) p.tendency += 1;
    if (bonus > 0) p.upsetHits += 1;

    facts.push({
      userName: r.userName,
      source: r.source,
      matchLabel: `${m.homeTeam.name} – ${m.awayTeam.name}`,
      stage,
      scoreTip: r.scoreTip,
      actual: `${actualHome}:${actualAway}`,
      base,
      bonus,
      total,
      diffError,
      pickProbability: r.pickProbability,
    });

    const sc = scoreCounter.get(r.scoreTip) || { count: 0, correct: 0 };
    sc.count += 1;
    if (base === 4) sc.correct += 1;
    scoreCounter.set(r.scoreTip, sc);
  }

  const board = [...players.values()]
    .filter((p) => p.tips > 0)
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.exact - a.exact ||
        b.diff - a.diff ||
        b.tendency - a.tendency ||
        a.userName.localeCompare(b.userName),
    );

  const humans = board.filter((e) => e.source === "human");
  const machines = board.filter((e) => e.source === "agent");
  const humanPoints = humans.map((h) => h.points);

  const humanAvg = mean(humanPoints);
  const humanMedian = median(humanPoints);
  const humanBest = humans.length ? humans[0].points : 0;
  const machineAvg = mean(machines.map((m) => m.points));

  // Orakel = staerkster Agent (Headline-Maschine)
  let orakel: OrakelStat | null = null;
  if (machines.length) {
    const top = machines[0];
    const rank = board.findIndex((e) => e.userId === top.userId) + 1;
    const beatsHumans = humans.filter((h) => h.points < top.points).length;
    orakel = {
      userName: top.userName,
      points: top.points,
      tips: top.tips,
      rank,
      totalPlayers: board.length,
      beatsHumans,
      percentile: humans.length ? (beatsHumans / humans.length) * 100 : 0,
    };
  }

  // Champion & Helden
  const champion = board[0] ?? null;
  const bestHuman = humans[0] ?? null;

  const sharpest =
    [...board]
      .filter((p) => p.tips >= MIN_TIPS_FOR_RATE)
      .sort((a, b) => b.exact / b.tips - a.exact / a.tips || b.tips - a.tips)[0] ??
    null;

  const busiest = [...board].sort((a, b) => b.tips - a.tips)[0] ?? null;

  const highestSingle =
    [...facts].sort((a, b) => b.total - a.total || a.scoreTip.localeCompare(b.scoreTip))[0] ??
    null;

  // Ausreisser
  const upsets = facts.filter((f) => f.bonus > 0);
  const biggestUpset =
    [...upsets].sort(
      (a, b) =>
        (a.pickProbability ?? 1) - (b.pickProbability ?? 1) || b.total - a.total,
    )[0] ?? null;

  const worstMiss =
    [...facts]
      .filter((f) => f.base === 0)
      .sort((a, b) => b.diffError - a.diffError)[0] ?? null;

  let mostTippedScore: StatsResult["mostTippedScore"] = null;
  for (const [score, agg] of scoreCounter) {
    if (!mostTippedScore || agg.count > mostTippedScore.count) {
      mostTippedScore = { score, count: agg.count, correctCount: agg.correct };
    }
  }

  // Standort-Wertung (nur Menschen, mind. MIN_PLAYERS_PER_LOCATION).
  // Freitext-Eingaben werden normalisiert + bekannte Varianten gemerged, damit
  // z. B. "Herten Westerholt"/"Herten-Westerholt"/"Westerholt" EIN Standort sind.
  const locGroups = new Map<
    string,
    { pts: number[]; personioLabels: Map<string, number>; selfLabels: Map<string, number> }
  >();
  for (const h of humans) {
    if (h.location === "Unbekannt") continue;
    const key = canonicalLocationKey(h.location);
    let g = locGroups.get(key);
    if (!g) {
      g = { pts: [], personioLabels: new Map(), selfLabels: new Map() };
      locGroups.set(key, g);
    }
    g.pts.push(h.points);
    const disp = h.location.trim().replace(/\s+/g, " ");
    const bucket = h.fromPersonio ? g.personioLabels : g.selfLabels;
    bucket.set(disp, (bucket.get(disp) ?? 0) + 1);
  }
  const locations: LocationStat[] = [...locGroups.entries()]
    .filter(([, g]) => g.pts.length >= MIN_PLAYERS_PER_LOCATION)
    .map(([key, g]) => ({
      location: locationDisplayLabel(key, g.personioLabels, g.selfLabels),
      avg: mean(g.pts),
      median: median(g.pts),
      players: g.pts.length,
      points: g.pts.reduce((s, n) => s + n, 0),
    }))
    .sort((a, b) => b.avg - a.avg || b.players - a.players);

  return {
    tournamentEnded,
    finishedMatches: finished.filter((m) => m.score.home != null).length,
    totalTips: resolvedTips,
    humanAvg,
    humanMedian,
    humanCount: humans.length,
    humanBest,
    orakel,
    machineAvg,
    machineCount: machines.length,
    champion,
    bestHuman,
    sharpest,
    busiest,
    highestSingle,
    biggestUpset,
    worstMiss,
    mostTippedScore,
    locations,
    board,
  };
}
