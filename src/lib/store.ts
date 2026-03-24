/**
 * Prediction store backed by Upstash Redis.
 * Each prediction is stored as a hash at key "pred:{matchId}_{userId}".
 * A set "predictions:all" tracks all prediction keys for listing.
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

const ALL_KEY = "predictions:all";

function predKey(matchId: number, userId: string) {
  return `pred:${matchId}_${userId}`;
}

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
  pickProbability?: number; // Wahrscheinlichkeit des getippten Outcomes (fuer Upset-Bonus)
  createdAt: string;
  points?: number;
}

export async function readPredictions(): Promise<PredictionRecord[]> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return [];
  const redis = getRedis();
  const keys = await redis.smembers(ALL_KEY);
  if (!keys.length) return [];

  const pipeline = redis.pipeline();
  for (const k of keys) pipeline.get(k);
  const results = await pipeline.exec();

  return results.filter(Boolean) as PredictionRecord[];
}

export async function writePredictions(
  records: PredictionRecord[],
): Promise<void> {
  const redis = getRedis();
  // Clear and rewrite all — used by resolve-match bulk update
  const oldKeys = await redis.smembers(ALL_KEY);
  if (oldKeys.length) {
    const pipeline = redis.pipeline();
    for (const k of oldKeys) pipeline.del(k);
    pipeline.del(ALL_KEY);
    await pipeline.exec();
  }

  if (!records.length) return;

  const pipeline = redis.pipeline();
  for (const r of records) {
    const key = predKey(r.matchId, r.userId);
    pipeline.set(key, JSON.stringify(r));
    pipeline.sadd(ALL_KEY, key);
  }
  await pipeline.exec();
}

export async function upsertPrediction(
  record: PredictionRecord,
): Promise<PredictionRecord> {
  const redis = getRedis();
  const key = predKey(record.matchId, record.userId);
  await redis.set(key, JSON.stringify(record));
  await redis.sadd(ALL_KEY, key);
  return record;
}
