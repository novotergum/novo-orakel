/**
 * Elo computation from football-data.org match history.
 * Bridge between raw match data and the prediction engine's TeamStats.
 */

import type { TeamStats } from "./types";

const BASE_URL = "https://api.football-data.org/v4";
const START_ELO = 1500;
const K = 32;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 Stunde

// ---------------------------------------------------------------------------
// In-memory cache for team matches (avoids hitting API rate limit)
// ---------------------------------------------------------------------------

const teamMatchesCache = new Map<number, { data: FDTeamMatch[]; ts: number }>();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FDTeamMatch {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  score: { fullTime: { home: number | null; away: number | null } };
}

interface TeamMatchesResponse {
  matches: FDTeamMatch[];
}

export interface EloResult {
  rating: number;
  trend: number; // diff from start
  matchesUsed: number;
}

// ---------------------------------------------------------------------------
// Fetch recent finished matches for a team
// ---------------------------------------------------------------------------

export async function getTeamRecentMatches(
  teamId: number,
  limit = 10,
): Promise<FDTeamMatch[]> {
  // Check in-memory cache first
  const cached = teamMatchesCache.get(teamId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  const token = process.env.FOOTBALL_DATA_API_KEY;
  // WC2026 API uses sequential IDs (1-48) that don't match football-data.org IDs.
  // football-data.org national team IDs are typically 700+.
  // Skip API call for mismatched IDs → static fallback will be used.
  if (!token || teamId < 700 || teamId > 100000) {
    return [];
  }

  try {
    const url = new URL(`${BASE_URL}/teams/${teamId}/matches`);
    url.searchParams.set("status", "FINISHED");
    url.searchParams.set("limit", String(limit));

    const res = await fetch(url.toString(), {
      headers: { "X-Auth-Token": token },
      cache: "no-store",
    });

    if (!res.ok) {
      // Graceful: return empty on error, static fallback will be used
      return [];
    }

    const data: TeamMatchesResponse = await res.json();

    // Store in cache
    teamMatchesCache.set(teamId, { data: data.matches, ts: Date.now() });

    // Evict old entries if cache grows too large (max 100 teams)
    if (teamMatchesCache.size > 100) {
      const oldest = [...teamMatchesCache.entries()]
        .sort((a, b) => a[1].ts - b[1].ts)[0];
      if (oldest) teamMatchesCache.delete(oldest[0]);
    }

    return data.matches;
  } catch {
    // Network error etc. → graceful fallback
    return [];
  }
}

// ---------------------------------------------------------------------------
// Build Elo + TeamStats from match history
// ---------------------------------------------------------------------------

function matchOutcome(
  match: FDTeamMatch,
  teamId: number,
): { scored: number; conceded: number; result: number } | null {
  const h = match.score.fullTime.home;
  const a = match.score.fullTime.away;
  if (h == null || a == null) return null;

  const isHome = match.homeTeam.id === teamId;
  const scored = isHome ? h : a;
  const conceded = isHome ? a : h;
  const result = scored > conceded ? 1 : scored === conceded ? 0.5 : 0;
  return { scored, conceded, result };
}

// ---------------------------------------------------------------------------
// Static Elo fallback for WC 2026 teams (approximate World Football Elo, March 2026)
// Used when no match history is available from the API.
// Keyed by team name (matching WC2026 API / openfootball names)
// ---------------------------------------------------------------------------

// FIFA Ranking points (March 2026) — source: football-ranking.com
// form & goals derived from ranking tier + recent tournament performance
const STATIC_TEAM_DATA: Record<string, TeamStats> = {
  // Tier 1 — Top 5
  "Spain":         { elo: 1877, form: 0.80, goals_scored: 2.1, goals_conceded: 0.6, missing_impact: 0 },
  "Argentina":     { elo: 1873, form: 0.78, goals_scored: 2.0, goals_conceded: 0.6, missing_impact: 0 },
  "France":        { elo: 1870, form: 0.78, goals_scored: 2.2, goals_conceded: 0.7, missing_impact: 0 },
  "England":       { elo: 1834, form: 0.72, goals_scored: 1.9, goals_conceded: 0.6, missing_impact: 0 },
  "Morocco":       { elo: 1781, form: 0.70, goals_scored: 1.6, goals_conceded: 0.5, missing_impact: 0 },
  // Tier 2 — 6-12
  "Brazil":        { elo: 1760, form: 0.65, goals_scored: 1.8, goals_conceded: 0.8, missing_impact: 0 },
  "Portugal":      { elo: 1760, form: 0.70, goals_scored: 1.9, goals_conceded: 0.6, missing_impact: 0 },
  "Netherlands":   { elo: 1756, form: 0.65, goals_scored: 1.8, goals_conceded: 0.7, missing_impact: 0 },
  "Belgium":       { elo: 1731, form: 0.58, goals_scored: 1.6, goals_conceded: 0.7, missing_impact: 0 },
  "Germany":       { elo: 1724, form: 0.65, goals_scored: 2.0, goals_conceded: 0.8, missing_impact: 0 },
  "Croatia":       { elo: 1717, form: 0.62, goals_scored: 1.5, goals_conceded: 0.6, missing_impact: 0 },
  "Italy":         { elo: 1702, form: 0.62, goals_scored: 1.7, goals_conceded: 0.7, missing_impact: 0 },
  // Tier 3 — 13-20
  "Colombia":      { elo: 1701, form: 0.65, goals_scored: 1.6, goals_conceded: 0.7, missing_impact: 0 },
  "United States": { elo: 1682, form: 0.58, goals_scored: 1.5, goals_conceded: 0.7, missing_impact: 0 },
  "USA":           { elo: 1682, form: 0.58, goals_scored: 1.5, goals_conceded: 0.7, missing_impact: 0 },
  "Mexico":        { elo: 1680, form: 0.58, goals_scored: 1.4, goals_conceded: 0.7, missing_impact: 0 },
  "Uruguay":       { elo: 1673, form: 0.60, goals_scored: 1.5, goals_conceded: 0.7, missing_impact: 0 },
  "Senegal":       { elo: 1663, form: 0.58, goals_scored: 1.4, goals_conceded: 0.7, missing_impact: 0 },
  "Switzerland":   { elo: 1655, form: 0.60, goals_scored: 1.4, goals_conceded: 0.6, missing_impact: 0 },
  "Japan":         { elo: 1650, form: 0.62, goals_scored: 1.6, goals_conceded: 0.7, missing_impact: 0 },
  "Iran":          { elo: 1617, form: 0.55, goals_scored: 1.3, goals_conceded: 0.7, missing_impact: 0 },
  "IR Iran":       { elo: 1617, form: 0.55, goals_scored: 1.3, goals_conceded: 0.7, missing_impact: 0 },
  "Denmark":       { elo: 1617, form: 0.55, goals_scored: 1.3, goals_conceded: 0.6, missing_impact: 0 },
  // Tier 4 — 21-35
  "South Korea":   { elo: 1599, form: 0.55, goals_scored: 1.4, goals_conceded: 0.7, missing_impact: 0 },
  "Korea Republic": { elo: 1599, form: 0.55, goals_scored: 1.4, goals_conceded: 0.7, missing_impact: 0 },
  "Ecuador":       { elo: 1592, form: 0.55, goals_scored: 1.4, goals_conceded: 0.8, missing_impact: 0 },
  "Austria":       { elo: 1586, form: 0.55, goals_scored: 1.4, goals_conceded: 0.7, missing_impact: 0 },
  "Nigeria":       { elo: 1582, form: 0.52, goals_scored: 1.3, goals_conceded: 0.8, missing_impact: 0 },
  "Australia":     { elo: 1574, form: 0.50, goals_scored: 1.2, goals_conceded: 0.8, missing_impact: 0 },
  "Algeria":       { elo: 1561, form: 0.50, goals_scored: 1.2, goals_conceded: 0.8, missing_impact: 0 },
  "Canada":        { elo: 1559, form: 0.50, goals_scored: 1.2, goals_conceded: 0.7, missing_impact: 0 },
  "Ukraine":       { elo: 1557, form: 0.52, goals_scored: 1.3, goals_conceded: 0.7, missing_impact: 0 },
  "Egypt":         { elo: 1557, form: 0.50, goals_scored: 1.2, goals_conceded: 0.7, missing_impact: 0 },
  "Norway":        { elo: 1553, form: 0.52, goals_scored: 1.3, goals_conceded: 0.7, missing_impact: 0 },
  "Panama":        { elo: 1538, form: 0.48, goals_scored: 1.1, goals_conceded: 0.8, missing_impact: 0 },
  "Poland":        { elo: 1532, form: 0.48, goals_scored: 1.2, goals_conceded: 0.8, missing_impact: 0 },
  "Wales":         { elo: 1530, form: 0.48, goals_scored: 1.1, goals_conceded: 0.7, missing_impact: 0 },
  "Côte d'Ivoire": { elo: 1522, form: 0.52, goals_scored: 1.3, goals_conceded: 0.8, missing_impact: 0 },
  "Ivory Coast":   { elo: 1522, form: 0.52, goals_scored: 1.3, goals_conceded: 0.8, missing_impact: 0 },
  // Tier 5 — 36-50
  "Scotland":      { elo: 1507, form: 0.48, goals_scored: 1.2, goals_conceded: 0.7, missing_impact: 0 },
  "Serbia":        { elo: 1506, form: 0.48, goals_scored: 1.2, goals_conceded: 0.8, missing_impact: 0 },
  "Paraguay":      { elo: 1502, form: 0.48, goals_scored: 1.2, goals_conceded: 0.9, missing_impact: 0 },
  "Sweden":        { elo: 1487, form: 0.45, goals_scored: 1.1, goals_conceded: 0.7, missing_impact: 0 },
  "Czech Republic": { elo: 1487, form: 0.45, goals_scored: 1.1, goals_conceded: 0.7, missing_impact: 0 },
  "Czechia":       { elo: 1487, form: 0.45, goals_scored: 1.1, goals_conceded: 0.7, missing_impact: 0 },
  "Cameroon":      { elo: 1482, form: 0.48, goals_scored: 1.2, goals_conceded: 0.9, missing_impact: 0 },
  "Tunisia":       { elo: 1479, form: 0.48, goals_scored: 1.1, goals_conceded: 0.7, missing_impact: 0 },
  "Congo DR":      { elo: 1468, form: 0.48, goals_scored: 1.2, goals_conceded: 0.9, missing_impact: 0 },
  "Venezuela":     { elo: 1465, form: 0.45, goals_scored: 1.1, goals_conceded: 0.9, missing_impact: 0 },
  // Tier 6 — 50+
  "Costa Rica":    { elo: 1464, form: 0.45, goals_scored: 1.0, goals_conceded: 0.8, missing_impact: 0 },
  "Uzbekistan":    { elo: 1461, form: 0.48, goals_scored: 1.2, goals_conceded: 0.8, missing_impact: 0 },
  "Peru":          { elo: 1460, form: 0.45, goals_scored: 1.1, goals_conceded: 0.8, missing_impact: 0 },
  "Chile":         { elo: 1458, form: 0.45, goals_scored: 1.1, goals_conceded: 0.8, missing_impact: 0 },
  "Qatar":         { elo: 1455, form: 0.42, goals_scored: 1.0, goals_conceded: 0.8, missing_impact: 0 },
  "South Africa":  { elo: 1433, form: 0.42, goals_scored: 1.0, goals_conceded: 0.9, missing_impact: 0 },
  "Saudi Arabia":  { elo: 1429, form: 0.42, goals_scored: 1.0, goals_conceded: 0.9, missing_impact: 0 },
  "Jordan":        { elo: 1389, form: 0.40, goals_scored: 1.0, goals_conceded: 0.9, missing_impact: 0 },
  "Honduras":      { elo: 1380, form: 0.38, goals_scored: 0.9, goals_conceded: 1.0, missing_impact: 0 },
  "Cabo Verde":    { elo: 1370, form: 0.38, goals_scored: 0.9, goals_conceded: 0.9, missing_impact: 0 },
  "Cape Verde":    { elo: 1370, form: 0.38, goals_scored: 0.9, goals_conceded: 0.9, missing_impact: 0 },
  "Jamaica":       { elo: 1362, form: 0.38, goals_scored: 0.9, goals_conceded: 0.9, missing_impact: 0 },
  "Ghana":         { elo: 1351, form: 0.38, goals_scored: 1.0, goals_conceded: 1.0, missing_impact: 0 },
  "Bolivia":       { elo: 1331, form: 0.35, goals_scored: 0.9, goals_conceded: 1.0, missing_impact: 0 },
  "Curaçao":       { elo: 1303, form: 0.35, goals_scored: 0.8, goals_conceded: 1.0, missing_impact: 0 },
  "Haiti":         { elo: 1294, form: 0.32, goals_scored: 0.8, goals_conceded: 1.1, missing_impact: 0 },
  "New Zealand":   { elo: 1279, form: 0.32, goals_scored: 0.8, goals_conceded: 1.0, missing_impact: 0 },
  "Bahrain":       { elo: 1259, form: 0.32, goals_scored: 0.8, goals_conceded: 1.0, missing_impact: 0 },
  "Trinidad and Tobago": { elo: 1225, form: 0.30, goals_scored: 0.7, goals_conceded: 1.0, missing_impact: 0 },
  "Indonesia":     { elo: 1200, form: 0.28, goals_scored: 0.7, goals_conceded: 1.1, missing_impact: 0 },
};

// Lookup by team name (case-insensitive, partial match)
function getStaticFallbackByName(name: string): TeamStats {
  // Exact match first
  if (STATIC_TEAM_DATA[name]) return STATIC_TEAM_DATA[name];
  // Case-insensitive
  const lower = name.toLowerCase();
  for (const [key, val] of Object.entries(STATIC_TEAM_DATA)) {
    if (key.toLowerCase() === lower) return val;
  }
  // Partial match (e.g. "Korea Republic" → "South Korea")
  for (const [key, val] of Object.entries(STATIC_TEAM_DATA)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return val;
  }
  return {
    elo: START_ELO,
    form: 0.45,
    goals_scored: 1.1,
    goals_conceded: 0.9,
    missing_impact: 0,
  };
}

export function buildTeamElo(
  matches: FDTeamMatch[],
  teamId: number,
  teamName?: string,
): { elo: EloResult; stats: TeamStats } {
  let rating = START_ELO;
  let totalScored = 0;
  let totalConceded = 0;
  let formWeightedSum = 0;
  let formWeightTotal = 0;
  let used = 0;

  // Process chronologically (oldest first)
  const sorted = [...matches].sort(
    (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime(),
  );

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    const o = matchOutcome(m, teamId);
    if (!o) continue;
    used++;
    totalScored += o.scored;
    totalConceded += o.conceded;

    // Recency weight: newer matches count more (1.0 → 2.0 linear)
    const recency = 1.0 + (i / Math.max(sorted.length - 1, 1));

    // Form: W=1, D=0.5, L=0 (weighted by recency)
    formWeightedSum += o.result * recency;
    formWeightTotal += recency;

    // Elo update with recency-scaled K factor
    const expected = 1 / (1 + Math.pow(10, (START_ELO - rating) / 400));
    rating += (K * recency) * (o.result - expected);
  }

  // Fallback to static data when no match history available
  if (used === 0) {
    const fallback = teamName ? getStaticFallbackByName(teamName) : getStaticFallbackByName(String(teamId));
    return {
      elo: {
        rating: fallback.elo,
        trend: fallback.elo - START_ELO,
        matchesUsed: 0,
      },
      stats: fallback,
    };
  }

  const gamesPlayed = used;
  const form = Math.min(1, Math.max(0, formWeightedSum / formWeightTotal));
  const goalsScored = totalScored / gamesPlayed;
  const goalsConceded = totalConceded / gamesPlayed;

  return {
    elo: {
      rating: Number(rating.toFixed(1)),
      trend: Number((rating - START_ELO).toFixed(1)),
      matchesUsed: used,
    },
    stats: {
      elo: Number(rating.toFixed(1)),
      form,
      goals_scored: Number(goalsScored.toFixed(2)),
      goals_conceded: Number(goalsConceded.toFixed(2)),
      missing_impact: 0, // V1: no injury data
    },
  };
}

// ---------------------------------------------------------------------------
// Convenience: predict from Elo-based stats
// ---------------------------------------------------------------------------

import { predictMatch } from "./prediction-engine";

export function predictFromElo(
  homeStats: TeamStats,
  awayStats: TeamStats,
) {
  return predictMatch(homeStats, awayStats);
}
