/**
 * Match data layer.
 *
 * Primary source (fixtures/schedule):  openfootball/worldcup.json on GitHub
 *   - No API key, no rate limit, complete WC 2026 data
 *
 * Secondary source (live results):     football-data.org v4
 *   - Used only for FINISHED match scores (resolve-all)
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
// openfootball types
// ---------------------------------------------------------------------------

interface OFMatch {
  round: string;
  date: string;
  time?: string;
  team1: string;
  team2: string;
  group?: string;
  ground?: string;
  score?: { ft: [number, number] };
}

interface OFData {
  name: string;
  matches: OFMatch[];
}

interface OFTeamMeta {
  name: string;
  fifa_code: string | null;
  flag_icon: string | null;
  group: string | null;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min (GitHub raw doesn't change often)
const FD_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min for football-data.org

let ofCache: { data: OFData; teams: OFTeamMeta[]; ts: number } | null = null;
const fdCache = new Map<string, { data: NormalizedMatch[]; ts: number }>();

// ---------------------------------------------------------------------------
// openfootball: fetch & parse
// ---------------------------------------------------------------------------

const OF_BASE = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026";

async function fetchOpenFootball(): Promise<{ data: OFData; teams: OFTeamMeta[] }> {
  if (ofCache && Date.now() - ofCache.ts < CACHE_TTL_MS) {
    return { data: ofCache.data, teams: ofCache.teams };
  }

  const [matchesRes, teamsRes] = await Promise.all([
    fetch(`${OF_BASE}/worldcup.json`, { cache: "no-store" }),
    fetch(`${OF_BASE}/worldcup.teams_meta.json`, { cache: "no-store" }),
  ]);

  if (!matchesRes.ok) throw new Error(`openfootball matches fetch failed: ${matchesRes.status}`);
  if (!teamsRes.ok) throw new Error(`openfootball teams fetch failed: ${teamsRes.status}`);

  const data: OFData = await matchesRes.json();
  const teams: OFTeamMeta[] = await teamsRes.json();

  ofCache = { data, teams, ts: Date.now() };
  return { data, teams };
}

// ---------------------------------------------------------------------------
// Map openfootball round names to our stage constants
// ---------------------------------------------------------------------------

function mapStage(round: string): string | null {
  const r = round.toLowerCase();
  if (r.startsWith("matchday")) return "GROUP_STAGE";
  if (r.includes("round of 32")) return "ROUND_OF_32";
  if (r.includes("round of 16")) return "LAST_16";
  if (r.includes("quarter")) return "QUARTER_FINALS";
  if (r.includes("semi")) return "SEMI_FINALS";
  if (r.includes("third")) return "THIRD_PLACE";
  if (r === "final") return "FINAL";
  return null;
}

// ---------------------------------------------------------------------------
// Stable numeric ID from team names (deterministic hash)
// ---------------------------------------------------------------------------

function stableId(team1: string, team2: string, date: string): number {
  const str = `${date}:${team1}:${team2}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function teamId(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ---------------------------------------------------------------------------
// Parse kickoff time from openfootball date + time
// ---------------------------------------------------------------------------

function parseKickoff(date: string, time?: string): string {
  if (!time) return new Date(`${date}T00:00:00Z`).toISOString();

  // time format: "13:00 UTC-6" or "20:00 UTC-6"
  const match = time.match(/^(\d{1,2}):(\d{2})\s*UTC([+-]\d+)?$/);
  if (!match) return new Date(`${date}T00:00:00Z`).toISOString();

  const hours = parseInt(match[1]);
  const minutes = match[2];
  const offset = match[3] ? parseInt(match[3]) : 0;

  // Convert to UTC
  const utcHours = hours - offset;
  const h = String(utcHours).padStart(2, "0");
  return new Date(`${date}T${h}:${minutes}:00Z`).toISOString();
}

// ---------------------------------------------------------------------------
// Determine match status from kickoff + score
// ---------------------------------------------------------------------------

function matchStatus(kickoff: string, score?: { ft: [number, number] }): string {
  if (score) return "FINISHED";
  const now = Date.now();
  const kick = new Date(kickoff).getTime();
  if (now >= kick + 120 * 60 * 1000) return "FINISHED"; // 2h after kickoff
  if (now >= kick) return "IN_PLAY";
  return "SCHEDULED";
}

// ---------------------------------------------------------------------------
// Main: getMatches (drop-in replacement)
// ---------------------------------------------------------------------------

export async function getMatches(params?: {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}): Promise<NormalizedMatch[]> {
  const statusFilter = params?.status?.split(",").map((s) => s.trim()) ?? [];
  const needsFinished = statusFilter.includes("FINISHED");

  // For FINISHED matches: use football-data.org (live scores)
  if (needsFinished && statusFilter.length === 1) {
    return getMatchesFromFootballData(params);
  }

  // For schedule/upcoming: use openfootball
  const { data, teams } = await fetchOpenFootball();

  const teamCodeMap = new Map<string, string>();
  for (const t of teams) {
    if (t.fifa_code) teamCodeMap.set(t.name, t.fifa_code);
  }

  const mapped: NormalizedMatch[] = data.matches.map((m) => {
    const kickoff = parseKickoff(m.date, m.time);
    const status = matchStatus(kickoff, m.score);
    const id = stableId(m.team1, m.team2, m.date);

    return {
      id,
      kickoff,
      status,
      stage: mapStage(m.round),
      group: m.group ?? null,
      homeTeam: {
        id: teamId(m.team1),
        name: m.team1,
        code: teamCodeMap.get(m.team1) ?? null,
      },
      awayTeam: {
        id: teamId(m.team2),
        name: m.team2,
        code: teamCodeMap.get(m.team2) ?? null,
      },
      score: {
        home: m.score?.ft?.[0] ?? null,
        away: m.score?.ft?.[1] ?? null,
      },
    };
  });

  // Apply filters
  let filtered = mapped;

  if (statusFilter.length > 0) {
    filtered = filtered.filter((m) => {
      // TIMED and SCHEDULED are both "upcoming"
      if (statusFilter.includes("TIMED") || statusFilter.includes("SCHEDULED")) {
        if (m.status === "SCHEDULED" || m.status === "TIMED") return true;
      }
      return statusFilter.includes(m.status);
    });
  }

  if (params?.dateFrom) {
    const from = new Date(params.dateFrom).getTime();
    filtered = filtered.filter((m) => new Date(m.kickoff).getTime() >= from);
  }

  if (params?.dateTo) {
    const to = new Date(params.dateTo).getTime();
    filtered = filtered.filter((m) => new Date(m.kickoff).getTime() <= to);
  }

  // Sort by kickoff
  filtered.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

  return filtered;
}

// ---------------------------------------------------------------------------
// football-data.org: only for FINISHED matches (live scores)
// ---------------------------------------------------------------------------

const FD_BASE_URL = "https://api.football-data.org/v4";

async function getMatchesFromFootballData(params?: {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}): Promise<NormalizedMatch[]> {
  const cacheKey = JSON.stringify(params ?? {});
  const cached = fdCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < FD_CACHE_TTL_MS) {
    return cached.data;
  }

  const token = process.env.FOOTBALL_DATA_API_KEY;
  if (!token) {
    // Fallback: return openfootball data with scores (if manually updated)
    return getMatchesFromOpenFootball(params);
  }

  const competition = process.env.FOOTBALL_DATA_COMPETITION_CODE || "WC";
  const url = new URL(`${FD_BASE_URL}/competitions/${competition}/matches`);

  if (params?.dateFrom) url.searchParams.set("dateFrom", params.dateFrom);
  if (params?.dateTo) url.searchParams.set("dateTo", params.dateTo);
  if (params?.status) url.searchParams.set("status", params.status);

  const res = await fetch(url.toString(), {
    headers: { "X-Auth-Token": token },
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 429) {
      // Rate limited: fall back to openfootball
      return getMatchesFromOpenFootball(params);
    }
    const msg = `football-data Fehler: ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  type FDMatch = {
    id: number;
    utcDate: string;
    status: string;
    stage?: string | null;
    group?: string | null;
    homeTeam: { id: number; name: string; tla?: string | null };
    awayTeam: { id: number; name: string; tla?: string | null };
    score: { fullTime: { home?: number | null; away?: number | null } };
  };

  const data: { matches: FDMatch[] } = await res.json();

  const mapped: NormalizedMatch[] = data.matches.map((m) => ({
    id: m.id,
    kickoff: m.utcDate,
    status: m.status,
    stage: m.stage ?? null,
    group: m.group ?? null,
    homeTeam: {
      id: m.homeTeam.id,
      name: m.homeTeam.name,
      code: m.homeTeam.tla ?? null,
    },
    awayTeam: {
      id: m.awayTeam.id,
      name: m.awayTeam.name,
      code: m.awayTeam.tla ?? null,
    },
    score: {
      home: m.score?.fullTime?.home ?? null,
      away: m.score?.fullTime?.away ?? null,
    },
  }));

  fdCache.set(cacheKey, { data: mapped, ts: Date.now() });

  if (fdCache.size > 20) {
    const oldest = [...fdCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) fdCache.delete(oldest[0]);
  }

  return mapped;
}

// Fallback: openfootball for finished matches (when football-data.org is unavailable)
async function getMatchesFromOpenFootball(params?: {
  status?: string;
}): Promise<NormalizedMatch[]> {
  const all = await getMatches({ ...params, status: undefined });
  const statusFilter = params?.status?.split(",").map((s) => s.trim()) ?? [];
  if (statusFilter.length === 0) return all;
  return all.filter((m) => statusFilter.includes(m.status));
}

export const FootballData = { getMatches };
export default FootballData;
