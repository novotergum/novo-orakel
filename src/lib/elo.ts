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
  // No API key or hash-based ID (from openfootball) → return empty, let fallback handle it
  if (!token || teamId > 100000) {
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

const STATIC_TEAM_DATA: Record<string, TeamStats> = {
  // Pot 1 / Top teams
  "Brazil":        { elo: 2136, form: 0.80, goals_scored: 2.3, goals_conceded: 0.5, missing_impact: 0 },
  "Argentina":     { elo: 2088, form: 0.75, goals_scored: 2.1, goals_conceded: 0.6, missing_impact: 0 },
  "France":        { elo: 2060, form: 0.78, goals_scored: 2.4, goals_conceded: 0.7, missing_impact: 0 },
  "Spain":         { elo: 2010, form: 0.70, goals_scored: 2.0, goals_conceded: 0.8, missing_impact: 0 },
  "Germany":       { elo: 1990, form: 0.72, goals_scored: 2.2, goals_conceded: 0.7, missing_impact: 0 },
  "England":       { elo: 1970, form: 0.68, goals_scored: 1.8, goals_conceded: 0.6, missing_impact: 0 },
  "Netherlands":   { elo: 1950, form: 0.65, goals_scored: 1.9, goals_conceded: 0.7, missing_impact: 0 },
  "Portugal":      { elo: 1960, form: 0.72, goals_scored: 2.0, goals_conceded: 0.6, missing_impact: 0 },
  "Belgium":       { elo: 1920, form: 0.65, goals_scored: 1.7, goals_conceded: 0.7, missing_impact: 0 },
  "Italy":         { elo: 1910, form: 0.68, goals_scored: 1.8, goals_conceded: 0.8, missing_impact: 0 },
  // Strong teams
  "Uruguay":       { elo: 1880, form: 0.62, goals_scored: 1.6, goals_conceded: 0.7, missing_impact: 0 },
  "Croatia":       { elo: 1870, form: 0.60, goals_scored: 1.5, goals_conceded: 0.6, missing_impact: 0 },
  "Colombia":      { elo: 1860, form: 0.65, goals_scored: 1.7, goals_conceded: 0.8, missing_impact: 0 },
  "United States": { elo: 1850, form: 0.60, goals_scored: 1.5, goals_conceded: 0.7, missing_impact: 0 },
  "USA":           { elo: 1850, form: 0.60, goals_scored: 1.5, goals_conceded: 0.7, missing_impact: 0 },
  "Denmark":       { elo: 1840, form: 0.58, goals_scored: 1.4, goals_conceded: 0.6, missing_impact: 0 },
  "Switzerland":   { elo: 1830, form: 0.62, goals_scored: 1.5, goals_conceded: 0.7, missing_impact: 0 },
  "Mexico":        { elo: 1830, form: 0.62, goals_scored: 1.6, goals_conceded: 0.8, missing_impact: 0 },
  "Japan":         { elo: 1820, form: 0.58, goals_scored: 1.4, goals_conceded: 0.7, missing_impact: 0 },
  "Sweden":        { elo: 1810, form: 0.55, goals_scored: 1.3, goals_conceded: 0.6, missing_impact: 0 },
  // Mid-tier
  "Senegal":       { elo: 1790, form: 0.55, goals_scored: 1.4, goals_conceded: 0.8, missing_impact: 0 },
  "Serbia":        { elo: 1780, form: 0.52, goals_scored: 1.3, goals_conceded: 0.7, missing_impact: 0 },
  "Ecuador":       { elo: 1780, form: 0.55, goals_scored: 1.5, goals_conceded: 0.9, missing_impact: 0 },
  "South Korea":   { elo: 1800, form: 0.58, goals_scored: 1.5, goals_conceded: 0.7, missing_impact: 0 },
  "Korea Republic": { elo: 1800, form: 0.58, goals_scored: 1.5, goals_conceded: 0.7, missing_impact: 0 },
  "Australia":     { elo: 1770, form: 0.52, goals_scored: 1.3, goals_conceded: 0.8, missing_impact: 0 },
  "Iran":          { elo: 1760, form: 0.50, goals_scored: 1.2, goals_conceded: 0.8, missing_impact: 0 },
  "IR Iran":       { elo: 1760, form: 0.50, goals_scored: 1.2, goals_conceded: 0.8, missing_impact: 0 },
  "Cameroon":      { elo: 1750, form: 0.55, goals_scored: 1.4, goals_conceded: 0.9, missing_impact: 0 },
  "Poland":        { elo: 1780, form: 0.55, goals_scored: 1.4, goals_conceded: 0.7, missing_impact: 0 },
  "Morocco":       { elo: 1750, form: 0.50, goals_scored: 1.3, goals_conceded: 0.8, missing_impact: 0 },
  "Wales":         { elo: 1760, form: 0.52, goals_scored: 1.3, goals_conceded: 0.7, missing_impact: 0 },
  "Tunisia":       { elo: 1740, form: 0.48, goals_scored: 1.2, goals_conceded: 0.8, missing_impact: 0 },
  "Austria":       { elo: 1780, form: 0.55, goals_scored: 1.4, goals_conceded: 0.7, missing_impact: 0 },
  "Ghana":         { elo: 1730, form: 0.50, goals_scored: 1.3, goals_conceded: 0.9, missing_impact: 0 },
  "Canada":        { elo: 1820, form: 0.55, goals_scored: 1.3, goals_conceded: 0.5, missing_impact: 0 },
  // Lower-tier WC teams
  "Saudi Arabia":  { elo: 1720, form: 0.48, goals_scored: 1.2, goals_conceded: 0.9, missing_impact: 0 },
  "Costa Rica":    { elo: 1710, form: 0.45, goals_scored: 1.1, goals_conceded: 0.9, missing_impact: 0 },
  "Paraguay":      { elo: 1700, form: 0.48, goals_scored: 1.2, goals_conceded: 1.0, missing_impact: 0 },
  "Chile":         { elo: 1720, form: 0.50, goals_scored: 1.3, goals_conceded: 0.8, missing_impact: 0 },
  "Nigeria":       { elo: 1740, form: 0.52, goals_scored: 1.3, goals_conceded: 0.8, missing_impact: 0 },
  "Qatar":         { elo: 1680, form: 0.42, goals_scored: 1.0, goals_conceded: 0.9, missing_impact: 0 },
  "South Africa":  { elo: 1670, form: 0.40, goals_scored: 1.0, goals_conceded: 1.0, missing_impact: 0 },
  "Peru":          { elo: 1730, form: 0.48, goals_scored: 1.2, goals_conceded: 0.8, missing_impact: 0 },
  "Egypt":         { elo: 1700, form: 0.45, goals_scored: 1.1, goals_conceded: 0.8, missing_impact: 0 },
  "Bolivia":       { elo: 1700, form: 0.48, goals_scored: 1.2, goals_conceded: 0.9, missing_impact: 0 },
  "Venezuela":     { elo: 1690, form: 0.45, goals_scored: 1.1, goals_conceded: 0.9, missing_impact: 0 },
  "Honduras":      { elo: 1660, form: 0.40, goals_scored: 1.0, goals_conceded: 1.0, missing_impact: 0 },
  "Jamaica":       { elo: 1670, form: 0.42, goals_scored: 1.0, goals_conceded: 0.9, missing_impact: 0 },
  "Czech Republic": { elo: 1790, form: 0.55, goals_scored: 1.4, goals_conceded: 0.7, missing_impact: 0 },
  "Algeria":       { elo: 1670, form: 0.42, goals_scored: 1.1, goals_conceded: 1.0, missing_impact: 0 },
  "New Zealand":   { elo: 1650, form: 0.38, goals_scored: 0.9, goals_conceded: 1.0, missing_impact: 0 },
  "Scotland":      { elo: 1770, form: 0.52, goals_scored: 1.3, goals_conceded: 0.7, missing_impact: 0 },
  "Panama":        { elo: 1680, form: 0.45, goals_scored: 1.1, goals_conceded: 0.8, missing_impact: 0 },
  "Uzbekistan":    { elo: 1690, form: 0.45, goals_scored: 1.1, goals_conceded: 0.8, missing_impact: 0 },
  "Indonesia":     { elo: 1620, form: 0.35, goals_scored: 0.8, goals_conceded: 1.1, missing_impact: 0 },
  "Bahrain":       { elo: 1640, form: 0.38, goals_scored: 0.9, goals_conceded: 1.0, missing_impact: 0 },
  "Trinidad and Tobago": { elo: 1650, form: 0.38, goals_scored: 0.9, goals_conceded: 1.0, missing_impact: 0 },
  "Haiti":         { elo: 1620, form: 0.35, goals_scored: 0.8, goals_conceded: 1.1, missing_impact: 0 },
  "Curaçao":       { elo: 1610, form: 0.32, goals_scored: 0.8, goals_conceded: 1.2, missing_impact: 0 },
  "Ivory Coast":   { elo: 1750, form: 0.52, goals_scored: 1.3, goals_conceded: 0.8, missing_impact: 0 },
  "Côte d'Ivoire": { elo: 1750, form: 0.52, goals_scored: 1.3, goals_conceded: 0.8, missing_impact: 0 },
  "Cape Verde":    { elo: 1630, form: 0.36, goals_scored: 0.9, goals_conceded: 1.0, missing_impact: 0 },
  "Cabo Verde":    { elo: 1630, form: 0.36, goals_scored: 0.9, goals_conceded: 1.0, missing_impact: 0 },
  "Norway":        { elo: 1780, form: 0.52, goals_scored: 1.4, goals_conceded: 0.7, missing_impact: 0 },
  "Jordan":        { elo: 1660, form: 0.40, goals_scored: 1.0, goals_conceded: 0.9, missing_impact: 0 },
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
  let wins = 0;
  let used = 0;

  // Process chronologically (oldest first)
  const sorted = [...matches].sort(
    (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime(),
  );

  for (const m of sorted) {
    const o = matchOutcome(m, teamId);
    if (!o) continue;
    used++;
    totalScored += o.scored;
    totalConceded += o.conceded;
    if (o.result === 1) wins++;

    // Elo update (opponent assumed ~1500 for simplicity in V1)
    const expected = 1 / (1 + Math.pow(10, (START_ELO - rating) / 400));
    rating += K * (o.result - expected);
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
  const form = Math.min(1, Math.max(0, wins / gamesPlayed));
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
