/**
 * Match data layer — powered by WC2026 API (api.wc2026api.com)
 *
 * Single source for all match data: fixtures, live scores, results.
 * No rate-limit issues, stable IDs, dedicated WC 2026 API.
 */

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
};

// ---------------------------------------------------------------------------
// WC2026 API types
// ---------------------------------------------------------------------------

interface WCMatch {
  id: number;
  match_number: number;
  round: string;
  group_name: string | null;
  home_team_id: number;
  home_team: string;
  home_team_code: string;
  home_team_flag: string | null;
  away_team_id: number;
  away_team: string;
  away_team_code: string;
  away_team_flag: string | null;
  stadium_id: number;
  stadium: string;
  stadium_city: string;
  stadium_country: string;
  kickoff_utc: string;
  home_score: number | null;
  away_score: number | null;
  status: string; // "scheduled", "live", "completed"
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const cache = new Map<string, { data: NormalizedMatch[]; ts: number }>();

// ---------------------------------------------------------------------------
// Map WC2026 API round to our stage constants
// ---------------------------------------------------------------------------

function mapStage(round: string): string | null {
  switch (round) {
    case "group": return "GROUP_STAGE";
    case "R32": return "ROUND_OF_32";
    case "R16": return "LAST_16";
    case "QF": return "QUARTER_FINALS";
    case "SF": return "SEMI_FINALS";
    case "3rd": return "THIRD_PLACE";
    case "final": return "FINAL";
    default: return null;
  }
}

// Map WC2026 API status to our status constants
function mapStatus(status: string): string {
  switch (status) {
    case "completed": return "FINISHED";
    case "live": return "IN_PLAY";
    case "scheduled": return "SCHEDULED";
    default: return "SCHEDULED";
  }
}

// Map our status filter to WC2026 API status
function mapStatusFilter(status: string): string | null {
  switch (status.toUpperCase()) {
    case "FINISHED": return "completed";
    case "IN_PLAY": return "live";
    case "SCHEDULED":
    case "TIMED": return "scheduled";
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Main: getMatches
// ---------------------------------------------------------------------------

const API_BASE = "https://api.wc2026api.com";

export async function getMatches(params?: {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}): Promise<NormalizedMatch[]> {
  const cacheKey = JSON.stringify(params ?? {});
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  const token = process.env.WC2026_API_KEY;
  if (!token) {
    throw new Error("WC2026_API_KEY is not set");
  }

  // Determine API status filter
  const statusFilters = params?.status?.split(",").map((s) => s.trim()) ?? [];
  const apiStatuses = statusFilters
    .map(mapStatusFilter)
    .filter((s): s is string => s !== null);

  // Fetch matches (possibly multiple calls for different statuses, or one call without filter)
  let allApiMatches: WCMatch[] = [];

  if (apiStatuses.length === 0 || apiStatuses.length > 2) {
    // Fetch all
    const res = await fetchWC(token, "/matches");
    allApiMatches = res;
  } else {
    // Fetch per status to use API filtering
    for (const st of [...new Set(apiStatuses)]) {
      const res = await fetchWC(token, `/matches?status=${st}`);
      allApiMatches.push(...res);
    }
  }

  // Normalize
  const mapped: NormalizedMatch[] = allApiMatches.map((m) => ({
    id: m.id,
    kickoff: m.kickoff_utc,
    status: mapStatus(m.status),
    stage: mapStage(m.round),
    group: m.group_name ? `Group ${m.group_name}` : null,
    homeTeam: {
      id: m.home_team_id,
      name: m.home_team,
      code: m.home_team_code || null,
    },
    awayTeam: {
      id: m.away_team_id,
      name: m.away_team,
      code: m.away_team_code || null,
    },
    score: {
      home: m.home_score,
      away: m.away_score,
    },
  }));

  // Apply date filters client-side
  let filtered = mapped;

  if (params?.dateFrom) {
    const from = new Date(params.dateFrom).getTime();
    filtered = filtered.filter((m) => new Date(m.kickoff).getTime() >= from);
  }
  if (params?.dateTo) {
    const to = new Date(params.dateTo).getTime();
    filtered = filtered.filter((m) => new Date(m.kickoff).getTime() <= to);
  }

  // Apply status filter client-side (for mixed filters like "SCHEDULED,TIMED")
  if (statusFilters.length > 0) {
    filtered = filtered.filter((m) => {
      if (statusFilters.includes("TIMED") || statusFilters.includes("SCHEDULED")) {
        if (m.status === "SCHEDULED" || m.status === "TIMED") return true;
      }
      return statusFilters.includes(m.status);
    });
  }

  // Sort by kickoff
  filtered.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

  // Cache
  cache.set(cacheKey, { data: filtered, ts: Date.now() });
  if (cache.size > 20) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) cache.delete(oldest[0]);
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function fetchWC(token: string, path: string): Promise<WCMatch[]> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const msg = res.status === 429
      ? "Zu viele Anfragen – bitte warte einen Moment und versuche es erneut."
      : `WC2026 API Fehler: ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  return res.json();
}

export const FootballData = { getMatches };
export default FootballData;
