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

// --- Activity feed -------------------------------------------------------
// Append-only, capped list of recent events for the live ticker. Stored as a
// Redis list at FEED_KEY: newest first (LPUSH), trimmed to FEED_MAX (LTRIM).
// Events deliberately carry NO tip content (no score/pick) — only "who did
// what, when" — so the feed can be public without leaking picks before kickoff.
const FEED_KEY = "feed:events";
const FEED_MAX = 200;

export interface FeedEvent {
  id: string;
  type: "registered" | "tip_placed" | "tip_changed";
  userName: string;
  ts: string; // ISO
  matchLabel?: string; // e.g. "Deutschland – Frankreich" (no score)
  minutesToKickoff?: number; // for the "last minute" badge
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
