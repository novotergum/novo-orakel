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
