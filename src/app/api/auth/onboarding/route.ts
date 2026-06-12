import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getSession, userIdFromEmail } from "@/lib/auth";
import { pushFeedEvent } from "@/lib/store";

function getRedis(): Redis {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "nicht eingeloggt" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const userName = typeof body?.userName === "string" ? body.userName.trim() : "";
  const location = typeof body?.location === "string" ? body.location.trim() : "";

  if (!userName) return NextResponse.json({ error: "Name erforderlich" }, { status: 400 });
  if (!location) return NextResponse.json({ error: "Standort erforderlich" }, { status: 400 });

  const redis = getRedis();
  const userId = userIdFromEmail(session.email);
  const userKey = `user:${userId}`;

  const existing = await redis.get(userKey);
  if (existing) {
    return NextResponse.json({ error: "Profil existiert bereits" }, { status: 409 });
  }

  const profile = {
    userId,
    email: session.email,
    userName,
    location,
    registeredAt: new Date().toISOString(),
  };
  await redis.set(userKey, JSON.stringify(profile));
  await redis.sadd("users:all", userKey);

  // Activity feed — best-effort, never blocks registration.
  try {
    await pushFeedEvent({
      id: crypto.randomUUID(),
      type: "registered",
      userName,
      ts: profile.registeredAt,
    });
  } catch {
    // ignore feed errors
  }

  return NextResponse.json({ ok: true, profile });
}
