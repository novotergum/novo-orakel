import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getSession, userIdFromEmail } from "@/lib/auth";
import { SURVEY_OPTIONS, SURVEY_OPTION_IDS } from "@/lib/survey";

// Feature-Umfrage. Pro User EIN Hash-Feld mit der Liste gewaehlter Options-IDs,
// damit Stimmen jederzeit aenderbar sind und nicht doppelt zaehlen. Aggregation
// ueber ein einziges HGETALL — bei wenigen hundert Spielern unkritisch.
const VOTES_KEY = "survey:votes";

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

function tally(all: Record<string, unknown>) {
  const counts: Record<string, number> = {};
  for (const o of SURVEY_OPTIONS) counts[o.id] = 0;
  let voters = 0;
  for (const raw of Object.values(all)) {
    let ids: string[] = [];
    if (Array.isArray(raw)) ids = raw as string[];
    else if (typeof raw === "string") {
      try {
        ids = JSON.parse(raw);
      } catch {
        ids = [];
      }
    }
    if (!Array.isArray(ids) || ids.length === 0) continue;
    voters++;
    for (const id of ids) if (id in counts) counts[id]++;
  }
  return { counts, voters };
}

// GET /api/survey -> Stimmenverteilung + eigene Auswahl
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "nicht eingeloggt" }, { status: 401 });
  }
  const userId = userIdFromEmail(session.email);
  const redis = getRedis();
  const all = (await redis.hgetall(VOTES_KEY)) ?? {};
  const { counts, voters } = tally(all);

  let mine: string[] = [];
  const raw = all[userId];
  if (Array.isArray(raw)) mine = raw as string[];
  else if (typeof raw === "string") {
    try {
      mine = JSON.parse(raw);
    } catch {
      mine = [];
    }
  }

  return NextResponse.json({ counts, voters, mine, options: SURVEY_OPTIONS });
}

// POST /api/survey { selected: string[] } -> speichert eigene Auswahl
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "nicht eingeloggt" }, { status: 401 });
    }
    const userId = userIdFromEmail(session.email);

    const body = await req.json();
    const selected: string[] = Array.isArray(body?.selected) ? body.selected : [];
    const clean = [...new Set(selected.filter((id) => SURVEY_OPTION_IDS.has(id)))];

    const redis = getRedis();
    if (clean.length === 0) {
      await redis.hdel(VOTES_KEY, userId);
    } else {
      await redis.hset(VOTES_KEY, { [userId]: JSON.stringify(clean) });
    }

    const all = (await redis.hgetall(VOTES_KEY)) ?? {};
    const { counts, voters } = tally(all);
    return NextResponse.json({ ok: true, counts, voters, mine: clean });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
