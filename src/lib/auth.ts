/**
 * Session + magic-link auth primitives.
 *
 * Two JWT flavours:
 *   - magic-link token    : short-lived (15 min), emailed to the user
 *   - session token       : long-lived (30d), set as HttpOnly cookie after verify
 *
 * Both are signed with HS256 using AUTH_SECRET.
 * Stateless — no Redis round-trip to validate; verify only checks signature + expiry.
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SESSION_COOKIE = "wm_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days in seconds
const MAGIC_TTL = 60 * 15; // 15 minutes

function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET env var not set");
  return new TextEncoder().encode(s);
}

export function getAllowedDomains(): string[] {
  const raw = process.env.ALLOWED_EMAIL_DOMAINS || "";
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string): boolean {
  const normalized = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return false;
  const allowed = getAllowedDomains();
  if (!allowed.length) return false; // fail-closed if not configured
  const domain = normalized.split("@")[1];
  return allowed.includes(domain);
}

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export async function signMagicToken(email: string): Promise<string> {
  return await new SignJWT({ email: normalizeEmail(email), type: "magic" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + MAGIC_TTL)
    .sign(getSecret());
}

export async function verifyMagicToken(
  token: string,
): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.type !== "magic" || typeof payload.email !== "string") return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

export async function signSession(email: string): Promise<string> {
  return await new SignJWT({ email: normalizeEmail(email), type: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE)
    .sign(getSecret());
}

export async function verifySession(
  token: string,
): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.type !== "session" || typeof payload.email !== "string") return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

/** Read current session from cookies (server components / route handlers). */
export async function getSession(): Promise<{ email: string } | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** Derive a stable userId from email. Email is already the identity. */
export function userIdFromEmail(email: string): string {
  return normalizeEmail(email);
}
