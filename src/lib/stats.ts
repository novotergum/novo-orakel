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

import { readRankedPredictions, readStandortByEmail } from "./store";
import { matchRegistrations, type MatchInfo } from "./personio";
import { getMatches, type NormalizedMatch } from "./football-data";
import { parseScoreTip, scoreTip, upsetBonus, stageMultiplier } from "./scoring";

const MIN_TIPS_FOR_RATE = 8; // Mindesttipps fuer "Treffsicherster" (sonst 1/1 = 100 %)
const MIN_PLAYERS_PER_LOCATION = 2; // Mindestspieler, damit ein Standort gewertet wird

// Der Standort ist ein Freitextfeld -> Schreibvarianten zersplittern denselben
// Ort. Wir normalisieren (lowercase, ohne Diakritika, Bindestrich=Leerzeichen)
// und mergen bekannte Varianten ueber LOCATION_ALIASES. Schluessel sind bereits
// normalisiert. Bewusst KONSERVATIV: nur eindeutig gleiche Orte zusammenfassen.
const LOCATION_ALIASES: Record<string, string> = {
  westerholt: "herten westerholt",
  // "Herten-Westerholt" normalisiert ohnehin zu "herten westerholt"
  budingen: "budingen rehamed", // "Büdingen" = "Büdingen Rehamed" (ein Standort)
  essen: "uthiii.hq", // NOVOTERGUM-Zentrale sitzt in Essen -> "Essen" = Zentrale
  "essen zentrale": "uthiii.hq",
  koln: "koln rodenkirchen", // "Köln" = Standort Köln Rodenkirchen
  rechnungswesen: "uthiii.hq", // Abteilung Rechnungswesen sitzt in der Zentrale
};
// Bevorzugte Anzeige je kanonischem Schluessel (sonst Personio-/haeufigste Eingabe).
const LOCATION_DISPLAY: Record<string, string> = {
  "uthiii.hq": "Zentrale",
  "uthiii.hq bayern": "Zentrale Bayern",
  "koln rodenkirchen": "Köln Rodenkirchen",
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

// Anspruchnahme des Orakels: wie sehr lehnten sich Menschen ans Orakel an?
export interface OracleUsage {
  oracleName: string;
  // Mensch vs. Maschine: echte Punkte vs. Punkte bei blindem Orakel-Kopieren
  // (über die Spiele, die der Spieler selbst getippt hat).
  vsOracle: { userName: string; actual: number; copy: number; diff: number }[];
  beatOracle: number; // wie viele schlugen das "reine Orakel"
  ratedPlayers: number;
  // Treue: Anteil der Tipps, die mit dem Orakel übereinstimmten (Tendenz/exakt)
  loyalty: { userName: string; tips: number; tendPct: number; exactPct: number }[];
  // Sog pro Partie: Anteil der Tipper, die exakt/tendenziell das Orakel kopierten
  sog: { label: string; tippedBy: number; tendPct: number; exactPct: number; oracleHitTendency: boolean }[];
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
  // Orakel-Anspruchnahme
  oracleUsage: OracleUsage | null;
  // Voll-Ranking (fuer optionale Tabelle)
  board: PlayerStat[];
}

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}

// Wie viele DISTINKTE Standorte sind vertreten (mind. 1 Tipper)? Nutzt dieselbe
// Kanonisierung wie die Wertung, damit Schreibvarianten nicht doppelt zaehlen.
export function representedLocationCount(locations: string[]): number {
  const keys = new Set<string>();
  for (const l of locations) {
    const t = (l || "").trim();
    if (!t || t === "Unbekannt") continue;
    keys.add(canonicalLocationKey(t));
  }
  return keys.size;
}

// Standort-Wertung (nur Menschen, mind. MIN_PLAYERS_PER_LOCATION). Freitext-
// Eingaben werden normalisiert + bekannte Varianten gemerged, damit z. B.
// "Herten Westerholt"/"Herten-Westerholt"/"Westerholt" EIN Standort sind.
// Geteilt von computeStats (Personio-Matcher) und dem Dashboard (Standort-Map).
export function aggregateLocations(
  players: { location: string; points: number; fromPersonio: boolean }[],
): LocationStat[] {
  const locGroups = new Map<
    string,
    { pts: number[]; personioLabels: Map<string, number>; selfLabels: Map<string, number> }
  >();
  for (const h of players) {
    if (!h.location || h.location === "Unbekannt") continue;
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
  return [...locGroups.entries()]
    .filter(([, g]) => g.pts.length >= MIN_PLAYERS_PER_LOCATION)
    .map(([key, g]) => ({
      location: locationDisplayLabel(key, g.personioLabels, g.selfLabels),
      avg: mean(g.pts),
      median: median(g.pts),
      players: g.pts.length,
      points: g.pts.reduce((s, n) => s + n, 0),
    }))
    .sort((a, b) => b.avg - a.avg || b.players - a.players);
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function computeStats(): Promise<StatsResult> {
  const [records, finished, standortByEmail] = await Promise.all([
    readRankedPredictions(),
    getMatches({ status: "FINISHED" }).catch(() => [] as NormalizedMatch[]),
    readStandortByEmail().catch(() => ({} as Record<string, string>)),
  ]);

  // Standort primär über den 4-Stufen-Personio-Matcher (gleiche Logik wie das
  // Admin-Panel) — erfasst auch Privat-Mail-Spieler. Best-effort: bei Ausfall
  // greift die alte Standort-Map bzw. die Selbstangabe.
  const uniquePlayers = new Map<string, string>();
  for (const r of records) if (!uniquePlayers.has(r.userId)) uniquePlayers.set(r.userId, r.userName);
  let personioMatch = new Map<string, MatchInfo>();
  try {
    personioMatch = await matchRegistrations(
      [...uniquePlayers].map(([userId, userName]) => ({ userId, userName, email: userId })),
    );
  } catch {
    /* Fallback: alte Map / Selbstangabe */
  }

  const matchById = new Map<number, NormalizedMatch>();
  for (const m of finished) matchById.set(m.id, m);

  const tournamentEnded = finished.some(
    (m) => m.stage === "FINAL" && m.score.home != null && m.score.away != null,
  );

  const players = new Map<string, PlayerStat>();
  const facts: RecordFact[] = [];
  const scoreCounter = new Map<string, { count: number; correct: number }>();
  let resolvedTips = 0;

  // Orakel-Tipps + erzielte Punkte je Spiel (für die Anspruchnahme-Stats).
  const ORACLE_ID = "ut-orakel";
  const oracleTipByMatch = new Map<number, { score: string; pick: string; hitTendency: boolean }>();
  const oraclePtsByMatch = new Map<number, number>();

  for (const r of records) {
    let p = players.get(r.userId);
    if (!p) {
      const m4 = personioMatch.get(r.userId);
      const personioLoc =
        (m4?.category === "MA" ? m4.office : null) ||
        standortByEmail[r.userId.toLowerCase().trim()] ||
        null;
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

    if (r.userId === ORACLE_ID) {
      oraclePtsByMatch.set(r.matchId, total);
      oracleTipByMatch.set(r.matchId, { score: r.scoreTip, pick: r.winnerPick, hitTendency: base >= 2 });
    }

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
  const locations = aggregateLocations(humans);

  // --- Orakel-Anspruchnahme: Treue, Mensch-vs-Maschine, Sog pro Partie ---
  const ORACLE_MIN_TIPS = 5;
  const loy = new Map<string, { userName: string; tips: number; tend: number; exact: number; copy: number; actual: number }>();
  const sogM = new Map<number, { label: string; n: number; tend: number; exact: number; hitTend: boolean }>();
  for (const r of records) {
    if (r.source !== "human") continue;
    const ot = oracleTipByMatch.get(r.matchId);
    const opts = oraclePtsByMatch.get(r.matchId);
    if (!ot || opts == null) continue; // nur ausgewertete Spiele, die das Orakel getippt hat
    const m = matchById.get(r.matchId)!;
    let pts = 0;
    try {
      const p = parseScoreTip(r.scoreTip);
      const base = scoreTip(p.home, p.away, m.score.home as number, m.score.away as number);
      const bonus = upsetBonus(r.winnerPick, m.score.home as number, m.score.away as number, typeof r.pickProbability === "number" ? r.pickProbability : 1);
      pts = typeof r.points === "number" ? r.points : Math.round((base + bonus) * stageMultiplier(r.stage || m.stage));
    } catch {
      pts = typeof r.points === "number" ? r.points : 0;
    }
    const exactCopy = r.scoreTip === ot.score;
    const tendCopy = r.winnerPick === ot.pick;
    let L = loy.get(r.userId);
    if (!L) { L = { userName: r.userName, tips: 0, tend: 0, exact: 0, copy: 0, actual: 0 }; loy.set(r.userId, L); }
    L.tips += 1; if (tendCopy) L.tend += 1; if (exactCopy) L.exact += 1; L.copy += opts; L.actual += pts;
    let S = sogM.get(r.matchId);
    if (!S) { S = { label: `${m.homeTeam.name} – ${m.awayTeam.name}`, n: 0, tend: 0, exact: 0, hitTend: ot.hitTendency }; sogM.set(r.matchId, S); }
    S.n += 1; if (tendCopy) S.tend += 1; if (exactCopy) S.exact += 1;
  }

  let oracleUsage: OracleUsage | null = null;
  if (orakel && loy.size) {
    const rated = [...loy.values()].filter((l) => l.tips >= ORACLE_MIN_TIPS);
    const vsOracle = rated
      .map((l) => ({ userName: l.userName, actual: l.actual, copy: l.copy, diff: l.actual - l.copy }))
      .sort((a, b) => b.diff - a.diff);
    const loyalty = rated
      .map((l) => ({ userName: l.userName, tips: l.tips, tendPct: Math.round((l.tend / l.tips) * 100), exactPct: Math.round((l.exact / l.tips) * 100) }))
      .sort((a, b) => b.tendPct - a.tendPct || b.exactPct - a.exactPct);
    const sog = [...sogM.values()]
      .filter((s) => s.n >= ORACLE_MIN_TIPS)
      .map((s) => ({ label: s.label, tippedBy: s.n, tendPct: Math.round((s.tend / s.n) * 100), exactPct: Math.round((s.exact / s.n) * 100), oracleHitTendency: s.hitTend }))
      .sort((a, b) => b.tendPct - a.tendPct || b.exactPct - a.exactPct);
    oracleUsage = { oracleName: orakel.userName, vsOracle, beatOracle: vsOracle.filter((v) => v.diff > 0).length, ratedPlayers: vsOracle.length, loyalty, sog };
  }

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
    oracleUsage,
    board,
  };
}
