/**
 * Prediction store backed by Upstash Redis.
 *
 * All predictions live in ONE Redis hash at key "predictions:h", field
 * "{matchId}_{userId}" -> PredictionRecord. A full read is a single HGETALL,
 * an upsert a single HSET. This replaces the previous layout (one key per
 * prediction + a "predictions:all" set), where a full read cost ~N Upstash
 * commands via a pipeline of N GETs and exhausted the request quota.
 *
 * Legacy data is migrated lazily on the first read after deploy — see
 * readPredictions().
 */

import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

const HASH_KEY = "predictions:h";

function field(matchId: number, userId: string) {
  return `${matchId}_${userId}`;
}

// --- Wertungs-Ausschluss ("aus der Wertung genommen") --------------------
// Soft-Ausschluss: userIds in diesem Redis-Set tauchen in KEINER Rangliste /
// keinem Board mehr auf, ihre Tipps bleiben aber vollstaendig in Redis erhalten.
// Verwaltung ueber das Admin-Board (POST /api/admin action=toggleExcluded).
// Wichtig: readPredictions() liefert weiterhin ALLE Records (damit resolve/admin-
// Schreibpfade die Tipps nicht loeschen) — nur die Anzeige-Pfade nutzen
// readRankedPredictions(), das die ausgeschlossenen userIds herausfiltert.
const EXCLUDED_KEY = "ranking:excluded";

export async function readExcludedUserIds(): Promise<string[]> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return [];
  const redis = getRedis();
  return (await redis.smembers<string[]>(EXCLUDED_KEY)) || [];
}

export async function setUserExcluded(
  userId: string,
  excluded: boolean,
): Promise<void> {
  const redis = getRedis();
  if (excluded) await redis.sadd(EXCLUDED_KEY, userId);
  else await redis.srem(EXCLUDED_KEY, userId);
}

// Wie readPredictions(), aber ohne die aus der Wertung genommenen userIds. Fuer
// alle Anzeige-/Ranking-Oberflaechen (Board, Leaderboard, Teams, Newsletter,
// Statistik) — NICHT fuer Schreib-/Resolve-Pfade.
export async function readRankedPredictions(): Promise<PredictionRecord[]> {
  const [records, excluded] = await Promise.all([
    readPredictions(),
    readExcludedUserIds().catch(() => [] as string[]),
  ]);
  if (!excluded.length) return records;
  const ex = new Set(excluded);
  return records.filter((r) => !ex.has(r.userId));
}

// --- Legacy (pre-hash) layout, read only for the one-time migration ---
const LEGACY_ALL_KEY = "predictions:all";

export interface PredictionRecord {
  id: string;
  matchId: number;
  userId: string;
  userName: string;
  source: "human" | "agent";
  winnerPick: "1" | "X" | "2";
  scoreTip: string;
  style?: string;
  location?: string; // NOVOTERGUM-Standort
  stage?: string; // Turnierphase (GROUP_STAGE, LAST_16, ...)
  pickProbability?: number; // Wahrscheinlichkeit des getippten Outcomes (fuer Upset-Bonus)
  createdAt: string;
  points?: number;
  // Basis-Punkte aus scoreTip vs. Ergebnis (4/3/2/0) VOR dem K.o.-Multiplikator.
  // Damit die Exakt/Diff/Tendenz-Zaehler korrekt kategorisieren, auch wenn
  // `points` durch einen Multiplikator von der Basis abweicht.
  basePoints?: number;
}

// The Upstash SDK auto-deserializes JSON values, so a record may come back as
// an already-parsed object or (defensively) as a JSON string.
function coerce(v: unknown): PredictionRecord | null {
  if (!v) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as PredictionRecord;
    } catch {
      return null;
    }
  }
  return v as PredictionRecord;
}

function toHashMap(records: PredictionRecord[]): Record<string, PredictionRecord> {
  const map: Record<string, PredictionRecord> = {};
  for (const r of records) map[field(r.matchId, r.userId)] = r;
  return map;
}

// One-time migration: read the legacy set + per-key entries, fold them into the
// hash, and drop the legacy set so this path is never taken again. Costs ~N
// commands exactly once; every subsequent read is a single HGETALL.
async function migrateLegacy(redis: Redis): Promise<PredictionRecord[]> {
  const keys = await redis.smembers<string[]>(LEGACY_ALL_KEY);
  if (!keys.length) return [];

  const pipeline = redis.pipeline();
  for (const k of keys) pipeline.get(k);
  const results = await pipeline.exec();
  const records = results.map(coerce).filter(Boolean) as PredictionRecord[];

  if (records.length) {
    await redis.hset(HASH_KEY, toHashMap(records));
  }
  // Retire the legacy index so the fallback returns [] next time. The orphaned
  // pred:* keys are harmless and left in place (deleting all of them would
  // cost another ~N commands for no functional gain).
  await redis.del(LEGACY_ALL_KEY);
  return records;
}

export async function readPredictions(): Promise<PredictionRecord[]> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return [];
  const redis = getRedis();

  const all = await redis.hgetall<Record<string, PredictionRecord>>(HASH_KEY);
  if (all && Object.keys(all).length) {
    return Object.values(all).map(coerce).filter(Boolean) as PredictionRecord[];
  }

  // Hash empty -> first read after deploy: migrate legacy data once.
  return migrateLegacy(redis);
}

export async function writePredictions(
  records: PredictionRecord[],
): Promise<void> {
  const redis = getRedis();
  // Bulk replace — used by resolve-match recompute. The hash is the single
  // source of truth, so clear and rewrite it (2 commands total).
  await redis.del(HASH_KEY);
  if (!records.length) return;
  await redis.hset(HASH_KEY, toHashMap(records));
}

export async function upsertPrediction(
  record: PredictionRecord,
): Promise<PredictionRecord> {
  const redis = getRedis();
  await redis.hset(HASH_KEY, { [field(record.matchId, record.userId)]: record });
  return record;
}

// Read a single prediction (used to distinguish a new tip from a change for the
// activity feed). Single HGET.
export async function getPrediction(
  matchId: number,
  userId: string,
): Promise<PredictionRecord | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return null;
  const redis = getRedis();
  const v = await redis.hget(HASH_KEY, field(matchId, userId));
  return coerce(v);
}

// --- Standort-Map (Login-Mail -> offizieller Personio-Standort) ----------
// Einmalig per scripts/personio-standort-map.mjs befuellt. Das Statistik-Board
// nimmt diesen Standort als Source of Truth, Selbstangabe nur als Fallback.
const STANDORT_KEY = "standort:by-email";

export async function readStandortByEmail(): Promise<Record<string, string>> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return {};
  const redis = getRedis();
  const all = await redis.hgetall<Record<string, string>>(STANDORT_KEY);
  return all || {};
}

// --- Tipp-Aktivitaet (Änderungs-Zähler) ----------------------------------
// Zaehlt JEDE Tippabgabe/Änderung pro Spieler dauerhaft hoch (ab Einbau). Aus
// "Gesamt-Abgaben minus eindeutig getippte Spiele" leitet das Admin-Panel die
// Zahl der Tipp-Änderungen ab (Indiz fuer auffaellig haeufiges Hin-und-Her).
const TIP_EDITS_KEY = "tip:edits";

export async function bumpTipEditCount(userId: string): Promise<void> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return;
  const redis = getRedis();
  await redis.hincrby(TIP_EDITS_KEY, userId, 1);
}

export async function readTipEditCounts(): Promise<Record<string, number>> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return {};
  const redis = getRedis();
  const all = await redis.hgetall<Record<string, number>>(TIP_EDITS_KEY);
  return all || {};
}

// --- Rang-Bewegung pro Spieltag ------------------------------------------
// Nach jeder Spieltag-Aufloesung (resolve-all) snapshotten wir die Rangliste.
// Aus dem Vergleich "Rang vorher -> Rang jetzt" leiten wir motivierende
// Sprueche ab, die der Spieler beim naechsten Dashboard-Besuch genau EINMAL
// sieht (Dismiss ueber rank:seen). Nur Menschen, ausgeschlossene IDs raus.
const RANK_PREV_KEY = "rank:prev"; // hash userId -> Rang VOR dem letzten Resolve
const RANK_MOVE_KEY = "rank:move"; // hash userId -> JSON(RankMove) der letzten Bewegung
const RANK_SEEN_KEY = "rank:seen"; // hash userId -> zuletzt quittierte Runde
const RANK_ROUND_KEY = "rank:round"; // monoton steigender Runden-Zaehler
const RANK_LASTDAY_KEY = "rank:lastDay"; // letzter Kalendertag (YYYY-MM-DD), fuer den gesnappt wurde

export interface RankMove {
  from: number | null; // null = war vorher nicht in der Wertung
  to: number;
  points: number;
  round: number;
  improved: boolean; // Rang verbessert (kleinere Zahl)
  enteredTop3: boolean; // neu ins Podium geklettert
  becameLeader: boolean; // neu auf Platz 1
}

// Baut die Rangliste fuer die Bewegungs-Banner — IDENTISCH zur sichtbaren
// Tabelle (page.tsx): alle Spieler inkl. Orakel, Competition-Ranking nach
// Punkten (Punktgleiche teilen sich den Rang). Damit stimmt der Banner-Rang
// mit dem Tabellen-Rang ueberein und reine Tiebreaker-/Alphabet-Verschiebungen
// in einem Punkte-Cluster erzeugen keine falschen "+N Plaetze"-Meldungen mehr.
function boardRanking(
  records: PredictionRecord[],
  excluded: Set<string>,
): Map<string, { rank: number; points: number }> {
  const agg = new Map<string, { points: number; name: string }>();
  for (const r of records) {
    if (excluded.has(r.userId)) continue;
    const pts = r.points ?? 0;
    const e = agg.get(r.userId) ?? { points: 0, name: r.userName };
    e.points += pts;
    agg.set(r.userId, e);
  }
  // Anzeige-Reihenfolge: Punkte, dann Name (nur fuer stabile Sortierung —
  // der Rang selbst kommt aus dem Competition-Schema und ignoriert den Namen).
  const sorted = [...agg.entries()].sort(
    (a, b) => b[1].points - a[1].points || a[1].name.localeCompare(b[1].name),
  );
  const out = new Map<string, { rank: number; points: number }>();
  let prevPts: number | null = null;
  let prevRank = 0;
  sorted.forEach(([userId, e], i) => {
    const rank = prevPts === null || e.points < prevPts ? i + 1 : prevRank;
    out.set(userId, { rank, points: e.points });
    prevPts = e.points;
    prevRank = rank;
  });
  return out;
}

// Nach Spieltag-Aufloesung aufrufen: vergleicht mit dem letzten Snapshot,
// schreibt pro Spieler die Bewegung und aktualisiert den Snapshot.
export async function recordRankSnapshot(
  records: PredictionRecord[],
  completedDay: string | null,
): Promise<void> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return;
  // Nur einmal pro vollstaendig beendetem Kalendertag snapshotten. Ohne fertigen
  // Tag (oder Tag bereits gesnappt) passiert nichts -> Banner/Ticker buendeln die
  // volle Tages-Bewegung statt pro Einzelspiel zu feuern.
  if (!completedDay) return;
  const redis = getRedis();
  const lastDay = await redis.get<string>(RANK_LASTDAY_KEY);
  if (lastDay != null && String(lastDay) >= completedDay) return;
  const excluded = new Set(await readExcludedUserIds().catch(() => [] as string[]));
  const current = boardRanking(records, excluded);
  if (current.size === 0) return;

  const prev = (await redis.hgetall<Record<string, number>>(RANK_PREV_KEY)) || {};
  // Beim allerersten Snapshot (kein prev) waere jeder "neu" — keine Ticker-Events,
  // nur die Ausgangslage festschreiben.
  const hadPrev = Object.keys(prev).length > 0;
  const round = await redis.incr(RANK_ROUND_KEY);

  // userId -> Anzeigename (nur Menschen) fuer die Liveticker-Texte.
  const names = new Map<string, string>();
  for (const r of records) {
    if (r.source === "human" && !names.has(r.userId)) names.set(r.userId, r.userName);
  }

  const moves: Record<string, string> = {};
  const newPrev: Record<string, number> = {};
  let newLeader: string | null = null; // userId der neuen #1
  const podiumEntrants: string[] = []; // userIds, neu in Top 3 (ohne neuen Leader)
  for (const [userId, { rank, points }] of current) {
    const from = userId in prev ? Number(prev[userId]) : null;
    const becameLeader = rank === 1 && from !== 1;
    const enteredTop3 = rank <= 3 && (from == null || from > 3);
    const move: RankMove = {
      from,
      to: rank,
      points,
      round,
      improved: from != null && rank < from,
      enteredTop3,
      becameLeader,
    };
    moves[userId] = JSON.stringify(move);
    newPrev[userId] = rank;
    // Ticker-Events nur fuer Menschen (names kennt nur Menschen). Das Orakel
    // wird zwar mitgerankt, aber nicht namentlich angekuendigt.
    if (!names.has(userId)) continue;
    if (becameLeader) newLeader = userId;
    else if (enteredTop3) podiumEntrants.push(userId);
  }

  // Snapshot + Bewegungen atomar genug ueber zwei Rewrites ersetzen.
  await redis.del(RANK_MOVE_KEY);
  await redis.hset(RANK_MOVE_KEY, moves);
  await redis.del(RANK_PREV_KEY);
  await redis.hset(RANK_PREV_KEY, newPrev);
  // Tag als gesnappt markieren (auch im Baseline-Fall unten), damit er nicht
  // beim naechsten resolve-all-Lauf erneut feuert.
  await redis.set(RANK_LASTDAY_KEY, completedDay);

  // Kuratierte Liveticker-Events: nur die zwei Schwellen-Momente mit Erzaehlwert
  // (Fuehrungswechsel + Podiums-Neuzugang), gebuendelt pro Aufloesung. Der neue
  // Leader wird nur als Fuehrungswechsel angekuendigt, nicht doppelt als Podium.
  if (!hadPrev) return;
  const ts = new Date().toISOString();
  // Podium zuerst pushen, Leader zuletzt -> Leader steht im Ticker oben (LPUSH).
  if (podiumEntrants.length > 0) {
    const names3 = podiumEntrants.map((id) => names.get(id) || "Jemand");
    const label =
      names3.length <= 2
        ? names3.join(" & ")
        : `${names3.slice(0, -1).join(", ")} & ${names3[names3.length - 1]}`;
    await pushFeedEvent({
      id: crypto.randomUUID(),
      type: "entered_podium",
      userName: label,
      ts,
      count: names3.length,
    }).catch(() => {});
  }
  if (newLeader) {
    await pushFeedEvent({
      id: crypto.randomUUID(),
      type: "took_lead",
      userName: names.get(newLeader) || "Jemand",
      ts,
    }).catch(() => {});
  }
}

// Liefert die noch nicht quittierte, positive Bewegung eines Spielers (oder null).
export async function getPendingRankMove(userId: string): Promise<RankMove | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return null;
  const redis = getRedis();
  const raw = await redis.hget(RANK_MOVE_KEY, userId);
  if (!raw) return null;
  const move: RankMove = typeof raw === "string" ? JSON.parse(raw) : (raw as RankMove);
  const seen = await redis.hget<number>(RANK_SEEN_KEY, userId);
  if (seen != null && Number(seen) >= move.round) return null;
  // Nur positive Ereignisse feiern.
  if (!move.improved && !move.enteredTop3 && !move.becameLeader) return null;
  return move;
}

// Markiert die aktuelle Bewegung als gesehen (Dismiss).
export async function markRankMoveSeen(userId: string): Promise<void> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return;
  const redis = getRedis();
  const raw = await redis.hget(RANK_MOVE_KEY, userId);
  if (!raw) return;
  const move: RankMove = typeof raw === "string" ? JSON.parse(raw) : (raw as RankMove);
  await redis.hset(RANK_SEEN_KEY, { [userId]: move.round });
}

// --- Activity feed -------------------------------------------------------
// Append-only, capped list of recent events for the live ticker. Stored as a
// Redis list at FEED_KEY: newest first (LPUSH), trimmed to FEED_MAX (LTRIM).
// Events deliberately carry NO tip content (no score/pick) — only "who did
// what, when" — so the feed can be public without leaking picks before kickoff.
const FEED_KEY = "feed:events";
const FEED_MAX = 200;

export interface FeedEvent {
  id: string;
  type:
    | "registered"
    | "tip_placed"
    | "tip_changed"
    | "agent_tipped"
    | "took_lead" // neue Person auf Platz 1
    | "entered_podium"; // neu in die Top 3 geklettert (gebuendelt pro Spieltag)
  userName: string;
  ts: string; // ISO
  matchLabel?: string; // e.g. "Deutschland – Frankreich" (no score)
  minutesToKickoff?: number; // for the "last minute" badge
  count?: number; // Anzahl Spiele (agent_tipped) bzw. Anzahl Personen (entered_podium)
}

export async function pushFeedEvent(ev: FeedEvent): Promise<void> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return;
  const redis = getRedis();
  await redis.lpush(FEED_KEY, JSON.stringify(ev));
  await redis.ltrim(FEED_KEY, 0, FEED_MAX - 1);
}

export async function readFeedEvents(limit = 30): Promise<FeedEvent[]> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return [];
  const redis = getRedis();
  const raw = await redis.lrange(FEED_KEY, 0, limit - 1);
  return raw
    .map((r) => {
      if (typeof r === "string") {
        try {
          return JSON.parse(r) as FeedEvent;
        } catch {
          return null;
        }
      }
      return r as FeedEvent;
    })
    .filter(Boolean) as FeedEvent[];
}
