import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { readPredictions, writePredictions } from "../../../lib/store";

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

interface UserProfile {
  userId: string;
  userName: string;
  location: string;
  registeredAt: string;
}

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const provided = req.nextUrl.searchParams.get("secret");
  return provided === secret;
}

/**
 * GET /api/admin?secret=xxx
 * Returns all users with their tip counts and joker usage.
 */
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const redis = getRedis();

    // Load users
    const userKeys = await redis.smembers(USERS_KEY);
    const users: UserProfile[] = [];
    if (userKeys.length) {
      const pipeline = redis.pipeline();
      for (const k of userKeys) pipeline.get(k);
      const results = await pipeline.exec();
      for (const r of results) {
        if (r) users.push(r as UserProfile);
      }
    }
    users.sort((a, b) => a.userName.localeCompare(b.userName));

    // Load predictions for tip counts
    const predictions = await readPredictions();
    const tipCounts = new Map<string, number>();
    const pointsMap = new Map<string, number>();
    for (const p of predictions) {
      tipCounts.set(p.userId, (tipCounts.get(p.userId) ?? 0) + 1);
      pointsMap.set(p.userId, (pointsMap.get(p.userId) ?? 0) + (p.points ?? 0));
    }

    // Load joker usage
    const jokerPipeline = redis.pipeline();
    for (const u of users) jokerPipeline.get(`joker:${u.userId}`);
    const jokerResults = await jokerPipeline.exec();

    const enriched = users.map((u, i) => ({
      ...u,
      tips: tipCounts.get(u.userId) ?? 0,
      points: pointsMap.get(u.userId) ?? 0,
      jokersUsed: (jokerResults[i] as number) ?? 0,
    }));

    return NextResponse.json({ users: enriched });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PUT /api/admin?secret=xxx
 * Update a user: { userId, userName?, location? }
 */
export async function PUT(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { userId, userName, location } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const redis = getRedis();
    const key = `user:${userId}`;
    const existing = await redis.get(key) as UserProfile | null;

    if (!existing) {
      return NextResponse.json({ error: "User nicht gefunden" }, { status: 404 });
    }

    const updated: UserProfile = {
      ...existing,
      userName: userName?.trim() || existing.userName,
      location: location?.trim() || existing.location,
    };

    await redis.set(key, JSON.stringify(updated));

    // If userName changed, update all predictions too
    if (userName && userName.trim() !== existing.userName) {
      const predictions = await readPredictions();
      let changed = false;
      for (const p of predictions) {
        if (p.userId === userId) {
          p.userName = userName.trim();
          changed = true;
        }
      }
      if (changed) await writePredictions(predictions);
    }

    return NextResponse.json({ ok: true, user: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/admin?secret=xxx
 * Actions:
 *   { action: "flushLeaderboard" }  — delete ALL tips/predictions
 *   { action: "flushAll" }          — delete ALL tips + ALL users + jokers
 *   { userId, deleteTips? }         — delete a single user
 */
export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, userId, deleteTips } = body;

    // Flush all predictions (leaderboard reset)
    if (action === "flushLeaderboard") {
      await writePredictions([]);
      return NextResponse.json({ ok: true, action: "flushLeaderboard", message: "Alle Tipps geloescht" });
    }

    // Flush everything: predictions + users + jokers
    if (action === "flushAll") {
      const redis = getRedis();
      // Delete all predictions
      await writePredictions([]);
      // Delete all users
      const userKeys = await redis.smembers(USERS_KEY);
      if (userKeys.length) {
        const pipeline = redis.pipeline();
        for (const k of userKeys) {
          pipeline.del(k);
          // Extract userId from key "user:xxx" to delete joker
          const uid = k.replace("user:", "");
          pipeline.del(`joker:${uid}`);
        }
        pipeline.del(USERS_KEY);
        await pipeline.exec();
      }
      return NextResponse.json({ ok: true, action: "flushAll", message: `Alles geloescht (${userKeys.length} User)` });
    }

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const redis = getRedis();
    const key = `user:${userId}`;

    // Delete user
    await redis.del(key);
    await redis.srem(USERS_KEY, key);

    // Delete joker count
    await redis.del(`joker:${userId}`);

    // Optionally delete their tips
    let tipsDeleted = 0;
    if (deleteTips) {
      const predictions = await readPredictions();
      const remaining = predictions.filter((p) => p.userId !== userId);
      tipsDeleted = predictions.length - remaining.length;
      if (tipsDeleted > 0) await writePredictions(remaining);
    }

    return NextResponse.json({ ok: true, userId, tipsDeleted });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
