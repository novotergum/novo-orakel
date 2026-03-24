import { NextResponse } from "next/server";
import { getMatches } from "../../../lib/football-data";

export async function GET() {
  try {
    const matches = await getMatches({ status: "SCHEDULED,TIMED" });
    return NextResponse.json({ matches });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
