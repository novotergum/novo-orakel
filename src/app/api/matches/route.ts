import { NextRequest, NextResponse } from "next/server";
import { getMatches } from "../../../lib/football-data";

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
      return NextResponse.json({ matches: filtered, count: filtered.length }, { headers });
    }

    return NextResponse.json({ matches, count: matches.length }, { headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
