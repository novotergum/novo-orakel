import { NextRequest, NextResponse } from "next/server";
import { getMatches } from "../../../lib/football-data";
import { stageMultiplier } from "../../../lib/scoring";

// K.O.-Phasen, deren Beginn in der Spieltag-Erinnerung angekündigt wird
// (Sechzehntel-, Achtel-, Viertel-, Halbfinale, Finale — kein Spiel um Platz 3).
const STAGE_LABEL: Record<string, string> = {
  LAST_32: "Sechzehntelfinale",
  LAST_16: "Achtelfinale",
  QUARTER_FINALS: "Viertelfinale",
  SEMI_FINALS: "Halbfinale",
  FINAL: "Finale",
};

// Liefert eine fertige Banner-Zeile, wenn `target` der ERSTE Spieltag einer
// angekündigten K.O.-Phase ist — sonst "". Basis ist die volle Fixture-Liste,
// damit "erster Tag" zuverlässig bestimmt werden kann.
function stageStartBanner(
  allMatches: { kickoff?: string; stage?: string | null }[],
  target: string,
  berlinDay: (d: Date) => string,
): { label: string; banner: string } | null {
  const earliest = new Map<string, string>(); // stage -> frühester Berlin-Tag
  for (const m of allMatches) {
    const stage = m.stage;
    if (!stage || !(stage in STAGE_LABEL) || typeof m.kickoff !== "string") continue;
    const day = berlinDay(new Date(m.kickoff));
    const cur = earliest.get(stage);
    if (!cur || day < cur) earliest.set(stage, day);
  }
  for (const [stage, day] of earliest) {
    if (day !== target) continue;
    const label = STAGE_LABEL[stage];
    const mult = stageMultiplier(stage).toLocaleString("de-DE");
    return {
      label,
      banner: `🏆 Das ${label} beginnt heute – ab jetzt zählt jeder Tipp x${mult}! `,
    };
  }
  return null;
}

// Edge-Cache: matches sind für ALLE Nutzer identisch und werden von TipForm
// im Sekunden-/Minutentakt × offene Tabs gepollt. Mit Vercel-CDN-Cache-Control
// bedient Vercels CDN wiederholte Polls aus dem Edge — ohne die Function (und
// damit Fluid Active CPU) überhaupt aufzurufen. stale-while-revalidate hält die
// Antwort währenddessen frisch. Laufende Spiele kürzer cachen, damit Live-Stände
// nicht zu lange stehen; ruhende Status (SCHEDULED/FINISHED) länger.
function edgeHeaders(statusParam: string): Record<string, string> {
  const live = statusParam.includes("IN_PLAY") || statusParam.includes("PAUSED");
  const sMaxAge = live ? 30 : 60;
  return {
    "Vercel-CDN-Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 2}`,
  };
}

export async function GET(req: NextRequest) {
  try {
    // Default: upcoming matches. Pass ?status=FINISHED for played matches.
    const statusParam = req.nextUrl.searchParams.get("status") || "SCHEDULED,TIMED";
    const matches = await getMatches({ status: statusParam });
    const headers = edgeHeaders(statusParam);

    const dateParam = req.nextUrl.searchParams.get("date");
    if (dateParam) {
      // Resolve the calendar day in German local time, so matches that kick
      // off late (e.g. 22:00 UTC = 00:00 Berlin) land on the day a German fan
      // would expect.
      const berlinDay = (d: Date) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Berlin",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(d);
      const target = dateParam === "today" ? berlinDay(new Date()) : dateParam;
      const filtered = matches.filter(
        (m: { kickoff?: string }) =>
          typeof m.kickoff === "string" && berlinDay(new Date(m.kickoff)) === target,
      );
      // Beginnt heute eine angekündigte K.O.-Phase? Braucht die VOLLE Liste
      // (nicht nur die kommenden Spiele aus `matches`), um den ersten Tag zu
      // erkennen. Bei leerem Tag (count=0) bleibt der Reminder ohnehin aus.
      const all = await getMatches();
      const stage = stageStartBanner(all, target, berlinDay);
      return NextResponse.json(
        {
          matches: filtered,
          count: filtered.length,
          stageStart: stage?.label ?? null,
          stageBanner: stage?.banner ?? "",
        },
        { headers },
      );
    }

    return NextResponse.json({ matches, count: matches.length }, { headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
