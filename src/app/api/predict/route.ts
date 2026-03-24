import { NextRequest, NextResponse } from "next/server";
import { predictMatch } from "../../../lib/prediction-engine";
import type { TeamStats, PredictionResult } from "../../../lib/types";

interface PredictBody {
  match?: string; // accepted but not echoed to keep response minimal
  home: TeamStats;
  away: TeamStats;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PredictBody;

    if (!body || !body.home || !body.away) {
      return NextResponse.json(
        { error: "Invalid body: expected home and away" },
        { status: 400 },
      );
    }

    const validate = (t: TeamStats, label: string) => {
      const errs: string[] = [];
      if (!Number.isFinite(t.elo)) errs.push(`${label}.elo`);
      if (!Number.isFinite(t.form) || t.form < 0 || t.form > 1)
        errs.push(`${label}.form`);
      if (!Number.isFinite(t.goals_scored) || t.goals_scored < 0)
        errs.push(`${label}.goals_scored`);
      if (!Number.isFinite(t.goals_conceded) || t.goals_conceded < 0)
        errs.push(`${label}.goals_conceded`);
      if (
        !Number.isFinite(t.missing_impact) ||
        t.missing_impact < 0 ||
        t.missing_impact > 1
      )
        errs.push(`${label}.missing_impact`);
      return errs;
    };

    const errs = [...validate(body.home, "home"), ...validate(body.away, "away")];

    if (errs.length) {
      return NextResponse.json(
        { error: `Invalid fields: ${errs.join(", ")}` },
        { status: 400 },
      );
    }

    const res = predictMatch(body.home, body.away);

    const out: PredictionResult = {
      prediction: res.prediction,
      probabilities: res.probabilities,
      confidence: res.confidence,
      reasoning: res.reasoning,
    };

    return NextResponse.json(out);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
