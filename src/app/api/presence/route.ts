import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getSession, userIdFromEmail } from "@/lib/auth";

/**
 * Presence-Tracking fuer das Board.
 *   POST /api/presence  -> Heartbeat des eingeloggten Users (alle ~30 s).
 *   GET  /api/presence  -> Liste der userIds mit frischem Heartbeat (online).
 *
 * Gespeichert als Sorted Set `presence:zset` (member = userId, score = ms).
 * "online" = Heartbeat juenger als ONLINE_WINDOW_MS. Alte Eintraege werden bei
 * jedem GET weggeraeumt. Identitaet kommt aus der Session (kein Spoofing).
 */

const KEY = "presence:zset";
// Dauerhafter "zuletzt aktiv"-Zeitstempel pro User (wird NICHT weggeraeumt wie
// das Online-ZSet) — Quelle fuer die Admin-Spalte "Zuletzt aktiv".
const SEEN_KEY = "presence:seen";
const ONLINE_WINDOW_MS = 75_000;

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

export async function POST() {
  if (!process.env.UPSTASH_REDIS_REST_URL) return NextResponse.json({ ok: false });
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const redis = getRedis();
    const userId = userIdFromEmail(session.email);
    const now = Date.now();
    await redis.zadd(KEY, { score: now, member: userId });
    // Dauerhaftes "zuletzt aktiv" (ueberlebt das Aufraeumen des Online-ZSets).
    await redis.hset(SEEN_KEY, { [userId]: now });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  if (!process.env.UPSTASH_REDIS_REST_URL) return NextResponse.json({ online: [] });
  try {
    const redis = getRedis();
    const now = Date.now();
    const cutoff = now - ONLINE_WINDOW_MS;
    await redis.zremrangebyscore(KEY, 0, cutoff);
    const online = await redis.zrange<string[]>(KEY, cutoff, "+inf", {
      byScore: true,
    });
    return NextResponse.json({ online, count: online.length });
  } catch {
    return NextResponse.json({ online: [] });
  }
}
