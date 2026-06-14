import { NextResponse } from "next/server";
import { getMatches } from "../../../lib/football-data";
import { readPredictions, writePredictions, recordRankSnapshot } from "../../../lib/store";
import { parseScoreTip, scoreTip, stageMultiplier } from "../../../lib/scoring";

/**
 * POST /api/resolve-all
 * Fetches all FINISHED matches, resolves every prediction that has no points yet.
 * Posts to Teams only if new results were resolved.
 */

// Berlin-lokaler Kalendertag (YYYY-MM-DD) eines UTC-Anstoßes. Lexikografisch
// vergleichbar, daher als simpler String-Vergleich nutzbar.
function berlinDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
}

// Höchster Kalendertag, an dem ALLE angesetzten Spiele FINISHED sind. Das ist
// der Tag, dessen Rang-Snapshot/Banner jetzt fällig ist (null = kein Tag fertig).
function latestCompletedDay(allMatches: { kickoff: string; status: string }[]): string | null {
  const byDay = new Map<string, { total: number; finished: number }>();
  for (const m of allMatches) {
    if (!m.kickoff) continue;
    const d = berlinDay(m.kickoff);
    const e = byDay.get(d) ?? { total: 0, finished: 0 };
    e.total++;
    if (m.status === "FINISHED") e.finished++;
    byDay.set(d, e);
  }
  const complete = [...byDay.entries()]
    .filter(([, v]) => v.total > 0 && v.finished === v.total)
    .map(([d]) => d)
    .sort();
  return complete.length ? complete[complete.length - 1] : null;
}

async function postToTeams(text: string): Promise<boolean> {
  const url = process.env.TEAMS_WEBHOOK_ERGEBNIS;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.status === 202 || res.ok;
  } catch {
    return false;
  }
}

export async function POST() {
  try {
    // Alle Spiele holen, damit wir Tag-Vollständigkeit bestimmen können; fürs
    // Scoring zählen nur die beendeten.
    const allMatches = await getMatches();
    const matches = allMatches.filter((m) => m.status === "FINISHED");
    if (!matches.length) {
      return NextResponse.json({
        ok: true,
        message: "Keine beendeten Spiele gefunden",
        resolved: 0,
        teamsPosted: false,
        results: [],
      });
    }

    const records = await readPredictions();
    const results: {
      matchId: number;
      home: string;
      away: string;
      score: string;
      tipsResolved: number;
      tipsNew: number;
      upsetBonuses: number;
    }[] = [];

    let totalResolved = 0;
    let totalUpsets = 0;
    let newlyResolved = 0;

    for (const m of matches) {
      if (m.score.home == null || m.score.away == null) continue;

      const actualHome = m.score.home;
      const actualAway = m.score.away;
      let matchResolved = 0;
      let matchNew = 0;
      let matchUpsets = 0;

      for (const r of records) {
        if (r.matchId !== m.id) continue;
        // Skip already resolved tips (0 points is a valid, resolved result)
        if (r.points != null) {
          matchResolved++;
          continue;
        }

        try {
          const parsed = parseScoreTip(r.scoreTip);
          const basePoints = scoreTip(parsed.home, parsed.away, actualHome, actualAway);

          // K.O.-Multiplikator: stage aus Prediction oder aus Match-Daten
          const stage = r.stage || m.stage;
          const multiplier = stageMultiplier(stage);
          r.basePoints = basePoints;
          r.points = Math.round(basePoints * multiplier);
          matchResolved++;
          matchNew++;
        } catch {
          r.basePoints = 0;
          r.points = 0;
        }
      }

      if (matchResolved > 0) {
        results.push({
          matchId: m.id,
          home: m.homeTeam.name,
          away: m.awayTeam.name,
          score: `${actualHome}:${actualAway}`,
          tipsResolved: matchResolved,
          tipsNew: matchNew,
          upsetBonuses: matchUpsets,
        });
        totalResolved += matchResolved;
        totalUpsets += matchUpsets;
        newlyResolved += matchNew;
      }
    }

    if (newlyResolved > 0) {
      await writePredictions(records);
    }
    // Rang-Snapshot/Banner: einmal pro vollständig beendetem Kalendertag (intern
    // gegen rank:lastDay gegated). Bewusst ENTKOPPELT vom Per-Spiel-Scoring oben,
    // damit der "Starker Spieltag +N"-Banner die volle Tages-Bewegung zeigt statt
    // pro Einzelspiel zu feuern. Punkte/Teams bleiben weiterhin zeitnah pro Lauf.
    await recordRankSnapshot(records, latestCompletedDay(allMatches)).catch(() => {});

    // Post to Teams only if new tips were resolved
    let teamsPosted = false;
    if (newlyResolved > 0) {
      const newResults = results.filter((r) => r.tipsNew > 0);
      const lines: string[] = [];
      lines.push("Ergebnis-Check abgeschlossen:");
      lines.push("");
      for (const r of newResults) {
        lines.push(`${r.home} vs ${r.away}: ${r.score} -- ${r.tipsNew} Tipps ausgewertet`);
      }
      if (totalUpsets > 0) {
        lines.push("");
        lines.push(`${totalUpsets} Upset-Bonus vergeben!`);
      }
      lines.push("");
      lines.push("Leaderboard: https://wm-tippspiel.vercel.app");

      teamsPosted = await postToTeams(lines.join("\n"));
    }

    return NextResponse.json({
      ok: true,
      matchesChecked: matches.length,
      resolved: totalResolved,
      newlyResolved,
      upsetBonuses: totalUpsets,
      teamsPosted,
      results,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
