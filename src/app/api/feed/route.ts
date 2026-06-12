import { NextResponse } from "next/server";
import { readFeedEvents, type FeedEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

// Short server-side cache so the Redis LRANGE is hit at most a few times per
// minute regardless of how many browser tabs are polling — this decouples
// Redis command volume from the number of online users. The cache lives on the
// warm serverless instance; a cold start just does one extra read.
const CACHE_MS = 12_000;
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
    events = await readFeedEvents(30);
  } catch {
    // On Redis error, serve whatever we last had rather than 500-ing the ticker.
    if (cache) return NextResponse.json({ events: cache.events });
  }
  cache = { at: now, events };
  return NextResponse.json({ events }, { headers: { "x-feed-cache": "miss" } });
}
