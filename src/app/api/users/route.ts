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

const USERS_KEY = "users:all";

export interface UserProfile {
  userId: string;
  userName: string;
  location: string;
  stake?: number;
  registeredAt: string;
}

/**
 * GET /api/users – List all registered users
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
 * POST /api/users – Register a new user
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body?.userName?.trim()) {
      return NextResponse.json({ error: "userName required" }, { status: 400 });
    }
    if (!body?.location?.trim()) {
      return NextResponse.json({ error: "location (Standort) required" }, { status: 400 });
    }

    // Einladungscode prüfen
    const requiredCode = process.env.INVITE_CODE;
    if (requiredCode && body.inviteCode?.trim() !== requiredCode) {
      return NextResponse.json(
        { error: "Ungültiger Einladungscode. Frag im Teams-Kanal nach dem Code!" },
        { status: 403 },
      );
    }

    // Einsatz validieren (2-5€)
    const stake = Number(body.stake);
    if (!stake || stake < 2 || stake > 5 || !Number.isInteger(stake)) {
      return NextResponse.json(
        { error: "Einsatz muss zwischen 2\u20AC und 5\u20AC liegen" },
        { status: 400 },
      );
    }

    const userId = body.userName.trim().toLowerCase().replace(/\s+/g, "-");
    const profile: UserProfile = {
      userId,
      userName: body.userName.trim(),
      location: body.location.trim(),
      stake,
      registeredAt: new Date().toISOString(),
    };

    const redis = getRedis();
    const key = `user:${userId}`;

    // Duplikat-Prüfung: Name bereits vergeben?
    const existing = await redis.get(key);
    if (existing) {
      return NextResponse.json(
        { error: "Dieser Name ist bereits registriert. Bitte wähle dich in der Liste aus." },
        { status: 409 },
      );
    }

    await redis.set(key, JSON.stringify(profile));
    await redis.sadd(USERS_KEY, key);

    return NextResponse.json({ ok: true, user: profile });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
