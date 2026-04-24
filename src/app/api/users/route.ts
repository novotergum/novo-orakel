import { NextResponse } from "next/server";
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

const USERS_KEY = "users:all";

export interface UserProfile {
  userId: string;
  userName: string;
  location: string;
  stake?: number;
  registeredAt: string;
}

/**
 * GET /api/users – List all registered users (used by leaderboard / pott calc).
 */
export async function GET() {
  try {
    if (!process.env.UPSTASH_REDIS_REST_URL) return NextResponse.json({ users: [] });
    const redis = getRedis();
    const keys = await redis.smembers(USERS_KEY);
    if (!keys.length) return NextResponse.json({ users: [] });

    const pipeline = redis.pipeline();
    for (const k of keys) pipeline.get(k);
    const results = await pipeline.exec();

    const users = results.filter(Boolean) as UserProfile[];
    users.sort((a, b) => a.userName.localeCompare(b.userName));

    return NextResponse.json({ users });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/users – DEPRECATED.
 * Registration runs through the magic-link flow now:
 *   /api/auth/request-link -> /api/auth/verify -> /api/auth/onboarding
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Registrierung laeuft jetzt ueber Email-Login. Bitte gehe auf die Startseite.",
    },
    { status: 410 },
  );
}
