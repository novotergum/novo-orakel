import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getSession, userIdFromEmail } from "@/lib/auth";

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

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ authenticated: false });

  const redis = getRedis();
  const userKey = `user:${userIdFromEmail(session.email)}`;
  const profile = await redis.get(userKey);

  return NextResponse.json({
    authenticated: true,
    email: session.email,
    profile: profile || null,
  });
}
