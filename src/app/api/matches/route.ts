import { NextRequest, NextResponse } from "next/server";
import { getMatches } from "../../../lib/football-data";

export async function GET(req: NextRequest) {
  try {
    // Default: upcoming matches. Pass ?status=FINISHED for played matches.
    const statusParam = req.nextUrl.searchParams.get("status") || "SCHEDULED,TIMED";
    const matches = await getMatches({ status: statusParam });

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
      return NextResponse.json({ matches: filtered, count: filtered.length });
    }

    return NextResponse.json({ matches, count: matches.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
