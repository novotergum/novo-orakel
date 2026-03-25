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

  const gamesPlayed = used || 1;
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
