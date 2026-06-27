import { NextResponse } from "next/server";
import { readFeedEvents, type FeedEvent } from "@/lib/store";
import { getMatches } from "@/lib/football-data";

export const dynamic = "force-dynamic";

// Short server-side cache so the Redis LRANGE is hit at most a few times per
// minute regardless of how many browser tabs are polling — this decouples
// Redis command volume from the number of online users. The cache lives on the
// warm serverless instance; a cold start just does one extra read.
const CACHE_MS = 12_000;
// Freshness window: only show events from the last 24h. Since the feed is
// count-capped (not time-capped), this keeps the ticker from looking stale on
// quiet days — an old entry simply ages out of view instead of lingering on top.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
let cache: { at: number; events: FeedEvent[] } | null = null;

// Edge-Cache: der Feed ist für alle Nutzer identisch und wird vom LiveTicker je
// offenem Tab gepollt. Vercel-CDN-Cache-Control lässt Vercels CDN diese Polls am
// Edge bedienen, ohne die Function (Fluid Active CPU) aufzurufen — entkoppelt die
// Last von der Zahl der Tabs. Der bestehende In-Memory-Cache bleibt als zweite
// Schicht für Edge-Miss/Cold-Start.
const EDGE_HEADERS = {
  "Vercel-CDN-Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
} as const;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return NextResponse.json(
      { events: cache.events },
      { headers: { ...EDGE_HEADERS, "x-feed-cache": "hit" } },
    );
  }

  let events: FeedEvent[] = [];
  try {
    const all = await readFeedEvents(30);
    events = all.filter((e) => now - new Date(e.ts).getTime() <= MAX_AGE_MS);
  } catch {
    // On Redis error, serve whatever we last had rather than 500-ing the ticker.
    if (cache) return NextResponse.json({ events: cache.events }, { headers: EDGE_HEADERS });
  }

  // Labels LIVE auflösen: aktuelle Teamnamen je matchId aus den Spieldaten ziehen.
  // So zeigt eine zum Tipp-Zeitpunkt noch nicht ausgeloste Partie später ihre
  // echten Teams. Legacy-Events ohne matchId, deren Label noch ein "?" enthält,
  // werden bereinigt (kein "? – ?" mehr im Ticker). Fällt der Lookup aus, bleibt
  // das gespeicherte Label erhalten (best-effort, nie 500).
  let labelById: Map<number, string> | null = null;
  try {
    const ms = await getMatches();
    labelById = new Map();
    for (const m of ms) {
      if (m.homeTeam?.name && m.awayTeam?.name) {
        labelById.set(m.id, `${m.homeTeam.name} – ${m.awayTeam.name}`);
      }
    }
  } catch {
    // ohne Live-Daten unten nur die "?"-Bereinigung
  }

  events = events.map((e) => {
    const clean = (l?: string) => (l && !l.includes("?") ? l : undefined);
    if (e.matchId != null && labelById) {
      const live = labelById.get(e.matchId);
      return { ...e, matchLabel: live ?? clean(e.matchLabel) };
    }
    return clean(e.matchLabel) === e.matchLabel ? e : { ...e, matchLabel: clean(e.matchLabel) };
  });

  cache = { at: now, events };
  return NextResponse.json({ events }, { headers: { ...EDGE_HEADERS, "x-feed-cache": "miss" } });
}
