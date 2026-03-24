const BASE_URL = "https://api.football-data.org/v4";

export type Team = {
  id: number;
  name: string;
  tla?: string | null;
};

type FDMatch = {
  id: number;
  utcDate: string;
  status: string;
  stage?: string | null;
  group?: string | null;
  homeTeam: Team;
  awayTeam: Team;
  score: {
    fullTime: {
      home?: number | null;
      away?: number | null;
    };
  };
};

type MatchesResponse = {
  matches: FDMatch[];
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

export async function getMatches(params?: {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}): Promise<NormalizedMatch[]> {
  const token = process.env.FOOTBALL_DATA_API_KEY;
  if (!token) {
    throw new Error("FOOTBALL_DATA_API_KEY is not set");
  }

  const competition = process.env.FOOTBALL_DATA_COMPETITION_CODE || "WC";
  const url = new URL(`${BASE_URL}/competitions/${competition}/matches`);

  if (params?.dateFrom) url.searchParams.set("dateFrom", params.dateFrom);
  if (params?.dateTo) url.searchParams.set("dateTo", params.dateTo);
  if (params?.status) url.searchParams.set("status", params.status);

  const res = await fetch(url.toString(), {
    headers: {
      "X-Auth-Token": token,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `football-data request failed: ${res.status} ${res.statusText}`,
    );
  }

  const data: MatchesResponse = await res.json();

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

  return mapped;
}

export const FootballData = {
  getMatches,
};

export default FootballData;
