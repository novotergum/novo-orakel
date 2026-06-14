import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import {
  readPredictions,
  writePredictions,
  readExcludedUserIds,
  setUserExcluded,
} from "../../../lib/store";
import { matchRegistrations, localNorm, type MatchInfo } from "../../../lib/personio";

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
    const tippedByUser = new Map<string, Set<number>>();
    for (const p of predictions) {
      tipCounts.set(p.userId, (tipCounts.get(p.userId) ?? 0) + 1);
      pointsMap.set(p.userId, (pointsMap.get(p.userId) ?? 0) + (p.points ?? 0));
      (tippedByUser.get(p.userId) ?? tippedByUser.set(p.userId, new Set()).get(p.userId)!).add(p.matchId);
    }

    // Load joker usage
    let jokerResults: (number | null)[] = [];
    if (users.length > 0) {
      const jokerPipeline = redis.pipeline();
      for (const u of users) jokerPipeline.get(`joker:${u.userId}`);
      jokerResults = await jokerPipeline.exec();
    }

    // "Zuletzt aktiv" aus dem Presence-Heartbeat (Hash presence:seen, userId -> ms)
    const seen = (await redis.hgetall<Record<string, number>>("presence:seen")) ?? {};

    // Aus der Wertung genommene userIds
    const excluded = new Set(await readExcludedUserIds());

    // Personio-Abgleich (best-effort): Status/Kategorie pro User + Doppel-Account-
    // Gruppen (zwei Registrierungen → dieselbe Personio-Person). Faellt der Abruf
    // aus, bleibt das Panel ohne Personio-Daten, der Rest funktioniert weiter.
    let matches: Map<string, MatchInfo> | null = null;
    let personioError: string | null = null;
    try {
      matches = await matchRegistrations(
        users.map((u) => ({ userId: u.userId, userName: u.userName, email: u.userId })),
      );
    } catch (e) {
      personioError = e instanceof Error ? e.message : "Personio nicht verfügbar";
    }

    const enriched = users.map((u, i) => ({
      ...u,
      tips: tipCounts.get(u.userId) ?? 0,
      points: pointsMap.get(u.userId) ?? 0,
      jokersUsed: (jokerResults[i] as number) ?? 0,
      lastActiveAt: seen[u.userId] != null ? new Date(Number(seen[u.userId])).toISOString() : null,
      excluded: excluded.has(u.userId),
      personio: matches?.get(u.userId) ?? null,
    }));

    // Doppel-Accounts = zwei+ Registrierungen, die dieselbe Person sind:
    //   (a) gleiche Personio-Identitaet (empId) — fängt z.B. Tobi Hellmann/Scharein
    //   (b) gleicher normalisierter E-Mail-Handle über Domains — fängt z.B.
    //       verena.limbacher@gmail ↔ @gmx (auch ohne Personio-Treffer)
    const groups = new Map<string, typeof enriched>();
    for (const u of enriched) {
      const empId = u.personio?.empId;
      if (empId) (groups.get(`emp:${empId}`) ?? groups.set(`emp:${empId}`, []).get(`emp:${empId}`)!).push(u);
      const lk = `lp:${localNorm(u.userId)}`;
      (groups.get(lk) ?? groups.set(lk, []).get(lk)!).push(u);
    }
    // Triage: auf wie vielen Spielen haben zwei Accounts der Gruppe GEMEINSAM
    // getippt? 0 = reiner Wechsel (kein Wertungsvorteil), >0 = parallel gewertet.
    const groupSharedMatches = (members: { userId: string }[]): number => {
      let max = 0;
      for (let i = 0; i < members.length; i++) {
        const a = tippedByUser.get(members[i].userId);
        if (!a) continue;
        for (let j = i + 1; j < members.length; j++) {
          const b = tippedByUser.get(members[j].userId);
          if (!b) continue;
          let c = 0;
          for (const mid of a) if (b.has(mid)) c++;
          if (c > max) max = c;
        }
      }
      return max;
    };

    // Empfehlung, welcher Account aus der Wertung soll:
    //  - ehemalige MA: der noch aktive (nicht teilnahmeberechtigt)
    //  - sonst: der Zweit-Account mit weniger Tipps raus, vollständigeren behalten
    //    (Gleichstand → weniger Punkte behalten, dann Arbeits-Mail bevorzugen)
    //  - ist schon einer raus: erledigt (keine Empfehlung)
    const lastActive = (u: (typeof enriched)[number]) => (u.lastActiveAt ? new Date(u.lastActiveAt).getTime() : 0);
    const recommendFor = (
      g: typeof enriched,
      status: string,
      shared: number,
    ): { removeId: string | null; note: string } => {
      const active = g.filter((u) => !u.excluded);
      // Ehemalige MA: NICHT eigenmächtig deaktivieren — erst Rücksprache.
      if (status === "ehemalig")
        return { removeId: null, note: "ehemalige(r) MA – vor vollständiger Deaktivierung mit Dana abklären" };
      // 0 gemeinsame Spiele = kein paralleler Wertungsvorteil → nur beobachten.
      if (shared === 0)
        return { removeId: null, note: "nur beobachten – 0 gemeinsame Spiele, kein Wertungsvorteil" };
      if (active.length <= 1)
        return { removeId: null, note: "bereits entschärft – ein Account ist schon aus der Wertung" };
      // Parallel gewertet: aktiveren Account behalten (zuletzt aktiv ist das beste
      // Signal für den „echten" Account), sonst mehr Tipps / weniger Punkte / Arbeits-Mail.
      const haveActivity = g.some((u) => u.lastActiveAt);
      const ranked = [...g].sort(
        (a, b) =>
          lastActive(b) - lastActive(a) ||
          b.tips - a.tips ||
          a.points - b.points ||
          (a.userId.endsWith("@novotergum.de") === b.userId.endsWith("@novotergum.de")
            ? 0
            : a.userId.endsWith("@novotergum.de") ? -1 : 1),
      );
      const remove = ranked[ranked.length - 1];
      return {
        removeId: remove.userId,
        note: haveActivity
          ? "aktiveren Account behalten (zuletzt aktiv), Zweit-Account raus"
          : "Zweit-Account mit weniger Tipps raus – letzte Aktivität noch unbekannt, ggf. manuell prüfen",
      };
    };

    const seenGroup = new Set<string>();
    const personioDuplicates: {
      empName: string; office: string | null; status: string; via: string;
      sharedMatches: number; recommendRemoveId: string | null; recommendNote: string;
      members: { userId: string; userName: string; excluded: boolean }[];
    }[] = [];
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const key = g.map((u) => u.userId).sort().join("|");
      if (seenGroup.has(key)) continue;
      seenGroup.add(key);
      const matched = g.find((u) => u.personio?.empName);
      const shared = groupSharedMatches(g);
      const rec = recommendFor(g, matched?.personio?.status ?? "", shared);
      personioDuplicates.push({
        empName: matched?.personio?.empName ?? `gleicher E-Mail-Handle „${localNorm(g[0].userId)}"`,
        office: matched?.personio?.office ?? null,
        status: matched?.personio?.status ?? "",
        via: matched ? "Personio-Identität" : "gleicher E-Mail-Handle",
        sharedMatches: shared,
        recommendRemoveId: rec.removeId,
        recommendNote: rec.note,
        members: g.map((u) => ({ userId: u.userId, userName: u.userName, excluded: u.excluded, registeredAt: u.registeredAt, lastActiveAt: u.lastActiveAt })),
      });
    }

    return NextResponse.json({ users: enriched, personioDuplicates, personioError });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PUT /api/admin?secret=xxx
 * Update a user: { userId, userName?, location?, jokersUsed? }
 */
export async function PUT(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { userId, userName, location, jokersUsed } = body;

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

    // Joker count is stored separately under joker:{userId}
    if (jokersUsed !== undefined && jokersUsed !== null) {
      const n = Math.max(0, Math.floor(Number(jokersUsed)));
      if (!Number.isNaN(n)) {
        await redis.set(`joker:${userId}`, n);
      }
    }

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
 * POST /api/admin?secret=xxx
 * Actions:
 *   { action: "toggleExcluded", userId, excluded }
 *     Nimmt eine userId aus der Wertung (excluded=true) oder zurueck in die
 *     Wertung (excluded=false). Tipps bleiben in jedem Fall erhalten — der
 *     Spieler taucht nur in keiner Rangliste/keinem Board mehr auf.
 */
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, userId, excluded } = body;

    if (action === "toggleExcluded") {
      if (!userId) {
        return NextResponse.json({ error: "userId required" }, { status: 400 });
      }
      await setUserExcluded(userId, Boolean(excluded));
      return NextResponse.json({ ok: true, userId, excluded: Boolean(excluded) });
    }

    return NextResponse.json({ error: "Unbekannte action" }, { status: 400 });
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
          // Extract userId from key "user:xxx" to delete joker + IP-Hashes
          const uid = k.replace("user:", "");
          pipeline.del(`joker:${uid}`);
          pipeline.del(`ip:${uid}`);
        }
        pipeline.del(USERS_KEY);
        // Presence-Daten (online + zuletzt aktiv) komplett mit weg
        pipeline.del("presence:seen");
        pipeline.del("presence:zset");
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

    // Delete joker count + "zuletzt aktiv"-Eintrag + IP-Hashes
    await redis.del(`joker:${userId}`);
    await redis.hdel("presence:seen", userId);
    await redis.del(`ip:${userId}`);

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
