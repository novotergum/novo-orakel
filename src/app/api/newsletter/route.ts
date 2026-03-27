import { NextRequest, NextResponse } from "next/server";
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

const NL_KEY = "newsletter:emails";

/**
 * POST /api/newsletter — E-Mail fuer Newsletter eintragen
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = body?.email?.trim()?.toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Bitte gib eine g\u00FCltige E-Mail-Adresse ein" }, { status: 400 });
    }

    const redis = getRedis();
    const added = await redis.sadd(NL_KEY, email);

    if (added === 0) {
      return NextResponse.json({ ok: true, message: "Bereits angemeldet" });
    }

    return NextResponse.json({ ok: true, message: "Erfolgreich angemeldet" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/newsletter — Alle angemeldeten E-Mails (Admin-Export)
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const redis = getRedis();
    const emails = await redis.smembers(NL_KEY);
    return NextResponse.json({ count: emails.length, emails: emails.sort() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
