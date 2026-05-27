import { NextRequest, NextResponse } from "next/server";
import { getMatches } from "../../../lib/football-data";

export async function GET(req: NextRequest) {
  try {
    const matches = await getMatches({ status: "SCHEDULED,TIMED" });

    const dateParam = req.nextUrl.searchParams.get("date");
    if (dateParam) {
      const target = dateParam === "today"
        ? new Date().toISOString().slice(0, 10)
        : dateParam;
      const filtered = matches.filter(
        (m: { kickoff?: string }) =>
          typeof m.kickoff === "string" && m.kickoff.slice(0, 10) === target,
      );
      return NextResponse.json({ matches: filtered, count: filtered.length });
    }

    return NextResponse.json({ matches, count: matches.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
