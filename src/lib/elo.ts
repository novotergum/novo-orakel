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
  if (!token) throw new Error("FOOTBALL_DATA_API_KEY is not set");

  const url = new URL(`${BASE_URL}/teams/${teamId}/matches`);
  url.searchParams.set("status", "FINISHED");
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), {
    headers: { "X-Auth-Token": token },
    cache: "no-store",
  });

  if (!res.ok) {
    const msg = res.status === 429
      ? "Zu viele Anfragen – bitte warte einen Moment und versuche es erneut."
      : `football-data Fehler: ${res.status} ${res.statusText}`;
    throw new Error(msg);
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
// football-data.org team IDs → { elo, form, goals_scored, goals_conceded }
// ---------------------------------------------------------------------------

const STATIC_TEAM_DATA: Record<number, TeamStats> = {
  // Pot 1 / Top teams
  770: { elo: 2136, form: 0.80, goals_scored: 2.3, goals_conceded: 0.5, missing_impact: 0 },  // Brazil
  2072: { elo: 2088, form: 0.75, goals_scored: 2.1, goals_conceded: 0.6, missing_impact: 0 }, // Argentina
  773: { elo: 2060, form: 0.78, goals_scored: 2.4, goals_conceded: 0.7, missing_impact: 0 },  // France
  760: { elo: 2010, form: 0.70, goals_scored: 2.0, goals_conceded: 0.8, missing_impact: 0 },  // Spain
  759: { elo: 1990, form: 0.72, goals_scored: 2.2, goals_conceded: 0.7, missing_impact: 0 },  // Germany
  66: { elo: 1970, form: 0.68, goals_scored: 1.8, goals_conceded: 0.6, missing_impact: 0 },   // England
  769: { elo: 1950, form: 0.65, goals_scored: 1.9, goals_conceded: 0.7, missing_impact: 0 },  // Netherlands
  765: { elo: 1960, form: 0.72, goals_scored: 2.0, goals_conceded: 0.6, missing_impact: 0 },  // Portugal
  768: { elo: 1920, form: 0.65, goals_scored: 1.7, goals_conceded: 0.7, missing_impact: 0 },  // Belgium
  758: { elo: 1910, form: 0.68, goals_scored: 1.8, goals_conceded: 0.8, missing_impact: 0 },  // Italy
  // Strong teams
  781: { elo: 1880, form: 0.62, goals_scored: 1.6, goals_conceded: 0.7, missing_impact: 0 },  // Uruguay
  762: { elo: 1870, form: 0.60, goals_scored: 1.5, goals_conceded: 0.6, missing_impact: 0 },  // Croatia
  780: { elo: 1860, form: 0.65, goals_scored: 1.7, goals_conceded: 0.8, missing_impact: 0 },  // Colombia
  7835: { elo: 1850, form: 0.60, goals_scored: 1.5, goals_conceded: 0.7, missing_impact: 0 }, // USA
  764: { elo: 1840, form: 0.58, goals_scored: 1.4, goals_conceded: 0.6, missing_impact: 0 },  // Denmark
  788: { elo: 1830, form: 0.62, goals_scored: 1.5, goals_conceded: 0.7, missing_impact: 0 },  // Switzerland
  782: { elo: 1830, form: 0.62, goals_scored: 1.6, goals_conceded: 0.8, missing_impact: 0 },  // Mexico
  791: { elo: 1820, form: 0.58, goals_scored: 1.4, goals_conceded: 0.7, missing_impact: 0 },  // Japan
  772: { elo: 1810, form: 0.55, goals_scored: 1.3, goals_conceded: 0.6, missing_impact: 0 },  // Sweden
  // Mid-tier
  785: { elo: 1790, form: 0.55, goals_scored: 1.4, goals_conceded: 0.8, missing_impact: 0 },  // Senegal
  771: { elo: 1780, form: 0.52, goals_scored: 1.3, goals_conceded: 0.7, missing_impact: 0 },  // Serbia
  784: { elo: 1780, form: 0.55, goals_scored: 1.5, goals_conceded: 0.9, missing_impact: 0 },  // Ecuador
  795: { elo: 1800, form: 0.58, goals_scored: 1.5, goals_conceded: 0.7, missing_impact: 0 },  // South Korea
  792: { elo: 1770, form: 0.52, goals_scored: 1.3, goals_conceded: 0.8, missing_impact: 0 },  // Australia
  8030: { elo: 1760, form: 0.50, goals_scored: 1.2, goals_conceded: 0.8, missing_impact: 0 }, // IR Iran
  793: { elo: 1750, form: 0.55, goals_scored: 1.4, goals_conceded: 0.9, missing_impact: 0 },  // Cameroon
  767: { elo: 1780, form: 0.55, goals_scored: 1.4, goals_conceded: 0.7, missing_impact: 0 },  // Poland
  786: { elo: 1750, form: 0.50, goals_scored: 1.3, goals_conceded: 0.8, missing_impact: 0 },  // Morocco
  763: { elo: 1760, form: 0.52, goals_scored: 1.3, goals_conceded: 0.7, missing_impact: 0 },  // Wales / Ukraine
  796: { elo: 1740, form: 0.48, goals_scored: 1.2, goals_conceded: 0.8, missing_impact: 0 },  // Tunisia
  766: { elo: 1780, form: 0.55, goals_scored: 1.4, goals_conceded: 0.7, missing_impact: 0 },  // Austria
  794: { elo: 1730, form: 0.50, goals_scored: 1.3, goals_conceded: 0.9, missing_impact: 0 },  // Ghana
  8601: { elo: 1820, form: 0.55, goals_scored: 1.3, goals_conceded: 0.5, missing_impact: 0 }, // Canada
  // Lower-tier WC teams
  797: { elo: 1720, form: 0.48, goals_scored: 1.2, goals_conceded: 0.9, missing_impact: 0 },  // Saudi Arabia
  783: { elo: 1710, form: 0.45, goals_scored: 1.1, goals_conceded: 0.9, missing_impact: 0 },  // Costa Rica
  776: { elo: 1700, form: 0.48, goals_scored: 1.2, goals_conceded: 1.0, missing_impact: 0 },  // Paraguay
  775: { elo: 1720, form: 0.50, goals_scored: 1.3, goals_conceded: 0.8, missing_impact: 0 },  // Chile
  787: { elo: 1740, form: 0.52, goals_scored: 1.3, goals_conceded: 0.8, missing_impact: 0 },  // Nigeria
  8536: { elo: 1680, form: 0.42, goals_scored: 1.0, goals_conceded: 0.9, missing_impact: 0 }, // Qatar
  789: { elo: 1670, form: 0.40, goals_scored: 1.0, goals_conceded: 1.0, missing_impact: 0 },  // South Africa
  779: { elo: 1730, form: 0.48, goals_scored: 1.2, goals_conceded: 0.8, missing_impact: 0 },  // Peru
  8490: { elo: 1700, form: 0.45, goals_scored: 1.1, goals_conceded: 0.8, missing_impact: 0 }, // Egypt
  777: { elo: 1700, form: 0.48, goals_scored: 1.2, goals_conceded: 0.9, missing_impact: 0 },  // Bolivia
  774: { elo: 1690, form: 0.45, goals_scored: 1.1, goals_conceded: 0.9, missing_impact: 0 },  // Venezuela
  778: { elo: 1660, form: 0.40, goals_scored: 1.0, goals_conceded: 1.0, missing_impact: 0 },  // Honduras
  8032: { elo: 1670, form: 0.42, goals_scored: 1.0, goals_conceded: 0.9, missing_impact: 0 }, // Jamaica
  761: { elo: 1790, form: 0.55, goals_scored: 1.4, goals_conceded: 0.7, missing_impact: 0 },  // Czech Republic
  790: { elo: 1670, form: 0.42, goals_scored: 1.1, goals_conceded: 1.0, missing_impact: 0 },  // Algeria
  8028: { elo: 1650, form: 0.38, goals_scored: 0.9, goals_conceded: 1.0, missing_impact: 0 }, // New Zealand
  757: { elo: 1770, form: 0.52, goals_scored: 1.3, goals_conceded: 0.7, missing_impact: 0 },  // Scotland
  8029: { elo: 1680, form: 0.45, goals_scored: 1.1, goals_conceded: 0.8, missing_impact: 0 }, // Panama
};

function getStaticFallback(teamId: number): TeamStats {
  return STATIC_TEAM_DATA[teamId] ?? {
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
    const fallback = getStaticFallback(teamId);
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
