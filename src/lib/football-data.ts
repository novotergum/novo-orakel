/**
 * Match data layer — powered by football-data.org (competition WC, id 2000).
 *
 * Replaces the WC2026 API, whose free key was auto-suspended for exceeding its
 * 100-requests/day limit. football-data.org gives the full 104-match schedule
 * with real live scores at 10 req/min.
 *
 * Canonical match IDs are preserved: group-stage fixtures are mapped to the
 * original WC2026 match numbers (1..72) via src/lib/match-map.ts, and scores are
 * re-oriented to the home/away the existing 4109 tips were placed against — so
 * all stored predictions keep resolving correctly. Knockout matches (not yet
 * tippable) carry football-data.org's own stable id.
 *
 * Rate limit is killed by a layered cache: per-instance memory (30s) →
 * shared Upstash (60s) → football-data.org, with a stale-on-error fallback so an
 * upstream blip never blanks the app.
 */

import { Redis } from "@upstash/redis";
import { groupMatchId, isCanonicalHome } from "./match-map";

// ---------------------------------------------------------------------------
// Shared types (unchanged interface for all consumers)
// ---------------------------------------------------------------------------

export type Team = {
  id: number;
  name: string;
  tla?: string | null;
};

export type NormalizedMatch = {
  id: number;
  kickoff: string;
  status: string;
  stage: string | null;
  group: string | null;
  homeTeam: { id: number; name: string; code: string | null };
  awayTeam: { id: number; name: string; code: string | null };
  score: { home: number | null; away: number | null };
  halftime?: boolean; // true when the live game is paused at half-time
};

// ---------------------------------------------------------------------------
// football-data.org types (only what we use)
// ---------------------------------------------------------------------------

interface FDTeam {
  id: number;
  name: string;
  tla: string | null;
}
interface FDMatch {
  id: number;
  utcDate: string;
  status: string; // SCHEDULED, TIMED, IN_PLAY, PAUSED, FINISHED, ...
  stage: string; // GROUP_STAGE, LAST_32, LAST_16, QUARTER_FINALS, ...
  group: string | null; // "GROUP_A"
  homeTeam: FDTeam;
  awayTeam: FDTeam;
  score: { fullTime: { home: number | null; away: number | null } };
}

// ---------------------------------------------------------------------------
// Status / group mapping
// ---------------------------------------------------------------------------

function mapStatus(status: string): string {
  switch (status) {
    case "IN_PLAY":
    case "PAUSED":
      return "IN_PLAY";
    case "FINISHED":
    case "AWARDED":
      return "FINISHED";
    default:
      return "SCHEDULED"; // SCHEDULED, TIMED, POSTPONED, SUSPENDED, CANCELLED
  }
}

function mapGroup(g: string | null): string | null {
  if (!g) return null;
  // "GROUP_A" -> "Group A"
  return g
    .replace(/^GROUP_/, "Group ")
    .replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Normalize one football-data match -> canonical NormalizedMatch
// ---------------------------------------------------------------------------

function normalize(m: FDMatch): NormalizedMatch {
  let home = m.homeTeam;
  let away = m.awayTeam;
  let sh = m.score?.fullTime?.home ?? null;
  let sa = m.score?.fullTime?.away ?? null;

  let id = m.id; // knockouts & any unmapped fixture keep football-data's stable id

  if (m.stage === "GROUP_STAGE") {
    const mid = groupMatchId(m.homeTeam.name, m.awayTeam.name);
    if (mid != null) {
      id = mid;
      // Re-orient to the canonical home/away the tips were placed against.
      if (!isCanonicalHome(mid, m.homeTeam.name)) {
        [home, away] = [away, home];
        [sh, sa] = [sa, sh];
      }
    }
  }

  return {
    id,
    kickoff: m.utcDate,
    status: mapStatus(m.status),
    stage: m.stage,
    group: mapGroup(m.group),
    homeTeam: { id: home.id, name: home.name, code: home.tla ?? null },
    awayTeam: { id: away.id, name: away.name, code: away.tla ?? null },
    score: { home: sh, away: sa },
    halftime: m.status === "PAUSED",
  };
}

// ---------------------------------------------------------------------------
// Fetch from football-data.org
// ---------------------------------------------------------------------------

const FD_BASE = "https://api.football-data.org/v4";
const COMP = process.env.FOOTBALL_DATA_COMPETITION_CODE || "WC";

async function fetchAllFromFD(): Promise<NormalizedMatch[]> {
  const token = process.env.FOOTBALL_DATA_API_KEY;
  if (!token) throw new Error("FOOTBALL_DATA_API_KEY is not set");

  const res = await fetch(`${FD_BASE}/competitions/${COMP}/matches`, {
    headers: { "X-Auth-Token": token },
    cache: "no-store",
  });

  if (!res.ok) {
    const msg =
      res.status === 429
        ? "Zu viele Anfragen – bitte warte einen Moment und versuche es erneut."
        : `football-data.org Fehler: ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  const data: { matches?: FDMatch[] } = await res.json();
  return (data.matches ?? [])
    .map(normalize)
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
}

// ---------------------------------------------------------------------------
// Layered cache: memory (per instance) -> Upstash (shared) -> football-data.org
// Upstash also holds a "last good" snapshot for stale-on-error fallback.
// ---------------------------------------------------------------------------

const MEM_TTL_MS = 30 * 1000;
const REDIS_TTL_S = 60;
const FRESH_KEY = "fd:matches:all";
const LASTGOOD_KEY = "fd:matches:lastgood";

let mem: { data: NormalizedMatch[]; ts: number } | null = null;

let _redis: Redis | null = null;
function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

async function getAllMatches(): Promise<NormalizedMatch[]> {
  // 1) per-instance memory
  if (mem && Date.now() - mem.ts < MEM_TTL_MS) return mem.data;

  const redis = getRedis();

  // 2) shared fresh cache
  if (redis) {
    try {
      const cached = await redis.get<NormalizedMatch[]>(FRESH_KEY);
      if (cached && Array.isArray(cached) && cached.length) {
        mem = { data: cached, ts: Date.now() };
        return cached;
      }
    } catch {
      // ignore cache read errors
    }
  }

  // 3) origin
  try {
    const data = await fetchAllFromFD();
    mem = { data, ts: Date.now() };
    if (redis) {
      try {
        await redis.set(FRESH_KEY, data, { ex: REDIS_TTL_S });
        await redis.set(LASTGOOD_KEY, data); // no expiry: survives outages
      } catch {
        // ignore cache write errors
      }
    }
    return data;
  } catch (err) {
    // 4) stale-on-error: last known good snapshot keeps the app usable
    if (redis) {
      try {
        const stale = await redis.get<NormalizedMatch[]>(LASTGOOD_KEY);
        if (stale && Array.isArray(stale) && stale.length) {
          mem = { data: stale, ts: Date.now() };
          return stale;
        }
      } catch {
        // ignore
      }
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Manuelle KO-Platz-Overrides
// ---------------------------------------------------------------------------
// football-data.org trägt offiziell feststehende KO-Paarungen teils mit Stunden
// Verzug ein. Bis dahin füllen wir bekannte Gegner selbst — aber NUR solange der
// Slot wirklich leer ist (name == null). Sobald die Quelle das echte Team
// liefert, greift automatisch wieder die Live-Quelle (self-healing, kein
// Risiko einer falschen Festschreibung).
const KO_OVERRIDES: Record<
  number,
  {
    home?: { id: number; name: string; code: string | null };
    away?: { id: number; name: string; code: string | null };
  }
> = {
  // Sechzehntelfinale Deutschland – Paraguay (29.06., Boston). Offiziell fix,
  // nachdem Spanien 1:0 gegen Uruguay gewann und Paraguay Gruppe-D-Dritter wurde.
  537415: { away: { id: 761, name: "Paraguay", code: "PAR" } },
};

function applyKoOverrides(matches: NormalizedMatch[]): NormalizedMatch[] {
  return matches.map((m) => {
    const ov = KO_OVERRIDES[m.id];
    if (!ov) return m;
    const next = { ...m };
    if (ov.home && !next.homeTeam.name) next.homeTeam = ov.home;
    if (ov.away && !next.awayTeam.name) next.awayTeam = ov.away;
    return next;
  });
}

// ---------------------------------------------------------------------------
// Public API (unchanged signature)
// ---------------------------------------------------------------------------

export async function getMatches(params?: {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}): Promise<NormalizedMatch[]> {
  let matches = applyKoOverrides(await getAllMatches());

  const statusFilters = params?.status?.split(",").map((s) => s.trim().toUpperCase()) ?? [];
  if (statusFilters.length > 0) {
    const wantScheduled =
      statusFilters.includes("SCHEDULED") || statusFilters.includes("TIMED");
    matches = matches.filter((m) => {
      if (wantScheduled && m.status === "SCHEDULED") return true;
      return statusFilters.includes(m.status);
    });
  }

  if (params?.dateFrom) {
    const from = new Date(params.dateFrom).getTime();
    matches = matches.filter((m) => new Date(m.kickoff).getTime() >= from);
  }
  if (params?.dateTo) {
    const to = new Date(params.dateTo).getTime();
    matches = matches.filter((m) => new Date(m.kickoff).getTime() <= to);
  }

  return matches;
}
