import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { setSessionCookie, signSession, userIdFromEmail, verifyMagicToken } from "@/lib/auth";

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

function appOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const origin = appOrigin(req);

  if (!token) {
    return NextResponse.redirect(`${origin}/?auth_error=missing_token`);
  }

  const decoded = await verifyMagicToken(token);
  if (!decoded) {
    return NextResponse.redirect(`${origin}/?auth_error=invalid_or_expired`);
  }

  // One-time-use: mark this token's JTI as consumed. JWT has no built-in jti,
  // but the token string itself is unique within its 15-min validity window.
  // Use a hash-suffix of the token as the dedupe key.
  const redis = getRedis();
  const dedupeKey = `magic:used:${token.slice(-40)}`;
  const wasFirst = await redis.set(dedupeKey, "1", { nx: true, ex: 60 * 30 });
  if (wasFirst === null) {
    return NextResponse.redirect(`${origin}/?auth_error=already_used`);
  }

  // Issue session
  const sessionToken = await signSession(decoded.email);
  await setSessionCookie(sessionToken);

  // Route: onboarding if no profile yet, home otherwise
  const userKey = `user:${userIdFromEmail(decoded.email)}`;
  const profile = await redis.get(userKey);
  const dest = profile ? "/" : "/onboarding";

  return NextResponse.redirect(`${origin}${dest}`);
}
