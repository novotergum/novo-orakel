import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { isAllowedEmail, normalizeEmail, signMagicToken } from "@/lib/auth";
import { sendMagicLink } from "@/lib/email";

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

const MAX_PER_IP_15MIN = 5;
const MAX_PER_EMAIL_HOUR = 3;

function appUrl(req: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";

    if (!email) {
      return NextResponse.json({ error: "Email fehlt." }, { status: 400 });
    }
    if (!isAllowedEmail(email)) {
      return NextResponse.json(
        { error: "Diese Email-Adresse ist nicht zugelassen." },
        { status: 403 },
      );
    }

    // Rate limit
    const redis = getRedis();
    const ip = clientIp(req);

    const ipKey = `rl:ip:${ip}`;
    const ipCount = await redis.incr(ipKey);
    if (ipCount === 1) await redis.expire(ipKey, 60 * 15);
    if (ipCount > MAX_PER_IP_15MIN) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Versuch es in 15 Minuten nochmal." },
        { status: 429 },
      );
    }

    const emailKey = `rl:email:${email}`;
    const emailCount = await redis.incr(emailKey);
    if (emailCount === 1) await redis.expire(emailKey, 60 * 60);
    if (emailCount > MAX_PER_EMAIL_HOUR) {
      return NextResponse.json(
        { error: "Zu viele Anfragen für diese Email. Versuch es in einer Stunde nochmal." },
        { status: 429 },
      );
    }

    const token = await signMagicToken(email);
    const link = `${appUrl(req)}/api/auth/verify?token=${encodeURIComponent(token)}`;

    await sendMagicLink(email, link);

    return NextResponse.json({ ok: true, email });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
