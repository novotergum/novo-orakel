import { NextResponse } from "next/server";
import { readFeedEvents, type FeedEvent } from "@/lib/store";

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

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return NextResponse.json(
      { events: cache.events },
      { headers: { "x-feed-cache": "hit" } },
    );
  }

  let events: FeedEvent[] = [];
  try {
    const all = await readFeedEvents(30);
    events = all.filter((e) => now - new Date(e.ts).getTime() <= MAX_AGE_MS);
  } catch {
    // On Redis error, serve whatever we last had rather than 500-ing the ticker.
    if (cache) return NextResponse.json({ events: cache.events });
  }
  cache = { at: now, events };
  return NextResponse.json({ events }, { headers: { "x-feed-cache": "miss" } });
}
