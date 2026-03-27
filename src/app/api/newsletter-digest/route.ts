import { NextRequest, NextResponse } from "next/server";
import { readPredictions, type PredictionRecord } from "../../../lib/store";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  return req.nextUrl.searchParams.get("secret") === secret;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlayerStats {
  userId: string;
  userName: string;
  source: string;
  location: string;
  points: number;
  tips: number;
  exact: number;
  diffCorrect: number;
  tendencyCorrect: number;
  picks: Record<string, number>; // "1" | "X" | "2" counts
  scoreTips: string[];
}

interface StandortEntry {
  location: string;
  points: number;
  players: number;
  avgPoints: number;
}

// ---------------------------------------------------------------------------
// Data collection
// ---------------------------------------------------------------------------

function buildStats(records: PredictionRecord[]) {
  const playerMap = new Map<string, PlayerStats>();

  for (const r of records) {
    const pts = r.points ?? 0;
    const existing = playerMap.get(r.userId);
    if (existing) {
      existing.points += pts;
      existing.tips += 1;
      if (pts === 4) existing.exact += 1;
      else if (pts === 3) existing.diffCorrect += 1;
      else if (pts === 2) existing.tendencyCorrect += 1;
      existing.picks[r.winnerPick] = (existing.picks[r.winnerPick] ?? 0) + 1;
      existing.scoreTips.push(r.scoreTip);
    } else {
      playerMap.set(r.userId, {
        userId: r.userId,
        userName: r.userName,
        source: r.source,
        location: r.location ?? "",
        points: pts,
        tips: 1,
        exact: pts === 4 ? 1 : 0,
        diffCorrect: pts === 3 ? 1 : 0,
        tendencyCorrect: pts === 2 ? 1 : 0,
        picks: { [r.winnerPick]: 1 },
        scoreTips: [r.scoreTip],
      });
    }
  }

  const board = [...playerMap.values()].sort((a, b) =>
    b.points - a.points ||
    b.exact - a.exact ||
    a.userName.localeCompare(b.userName)
  );

  return { board, playerMap };
}

function buildStandorte(records: PredictionRecord[]): StandortEntry[] {
  const locMap = new Map<string, { points: number; players: Set<string> }>();
  for (const r of records) {
    if (!r.location || r.source === "agent") continue;
    const existing = locMap.get(r.location);
    if (existing) {
      existing.points += r.points ?? 0;
      existing.players.add(r.userId);
    } else {
      locMap.set(r.location, { points: r.points ?? 0, players: new Set([r.userId]) });
    }
  }
  return [...locMap.entries()]
    .map(([location, d]) => ({
      location,
      points: d.points,
      players: d.players.size,
      avgPoints: Math.round((d.points / d.players.size) * 10) / 10,
    }))
    .sort((a, b) => b.avgPoints - a.avgPoints);
}

// ---------------------------------------------------------------------------
// Fun Facts Generator
// ---------------------------------------------------------------------------

function generateFunFacts(board: PlayerStats[], records: PredictionRecord[]): string[] {
  const facts: string[] = [];
  if (board.length === 0) return facts;

  // 1. Wer tippt am liebsten auf Unentschieden?
  const drawLover = [...board]
    .filter((p) => p.tips >= 3)
    .sort((a, b) => ((b.picks["X"] ?? 0) / b.tips) - ((a.picks["X"] ?? 0) / a.tips))[0];
  if (drawLover && (drawLover.picks["X"] ?? 0) >= 2) {
    const pct = Math.round(((drawLover.picks["X"] ?? 0) / drawLover.tips) * 100);
    facts.push(`${drawLover.userName} tippt ${pct}% der Spiele auf Unentschieden.`);
  }

  // 2. Wer tippt am offensivsten? (hoechste Tore pro Tipp)
  const avgGoals = board.map((p) => {
    const total = p.scoreTips.reduce((sum, s) => {
      const [h, a] = s.split(":").map(Number);
      return sum + (h || 0) + (a || 0);
    }, 0);
    return { ...p, avgGoals: total / p.tips };
  }).sort((a, b) => b.avgGoals - a.avgGoals);
  if (avgGoals.length > 0 && avgGoals[0].avgGoals > 2.5) {
    facts.push(`${avgGoals[0].userName} erwartet im Schnitt ${avgGoals[0].avgGoals.toFixed(1)} Tore pro Spiel \u2013 der Offensiv-Optimist.`);
  }

  // 3. Wer tippt am defensivsten?
  const defensive = avgGoals[avgGoals.length - 1];
  if (defensive && defensive.avgGoals < 2 && defensive.userId !== avgGoals[0].userId) {
    facts.push(`${defensive.userName} tippt dagegen nur ${defensive.avgGoals.toFixed(1)} Tore im Schnitt \u2013 der Mauertaktiker.`);
  }

  // 4. Beliebtester Tipp
  const scoreCount = new Map<string, number>();
  for (const r of records) {
    scoreCount.set(r.scoreTip, (scoreCount.get(r.scoreTip) ?? 0) + 1);
  }
  const topScore = [...scoreCount.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topScore) {
    facts.push(`Das beliebteste Ergebnis: ${topScore[0]} (${topScore[1]}x getippt).`);
  }

  // 5. Exaktester Tipper
  const exactKing = [...board].sort((a, b) => b.exact - a.exact)[0];
  if (exactKing && exactKing.exact > 0) {
    facts.push(`${exactKing.userName} hat ${exactKing.exact} Exakt-Treffer \u2013 die Kristallkugel funktioniert.`);
  }

  // 6. Wer tippt am haeufigsten auf Heimsieg?
  const homeFan = [...board]
    .filter((p) => p.tips >= 3)
    .sort((a, b) => ((b.picks["1"] ?? 0) / b.tips) - ((a.picks["1"] ?? 0) / a.tips))[0];
  if (homeFan && (homeFan.picks["1"] ?? 0) / homeFan.tips > 0.5) {
    const pct = Math.round(((homeFan.picks["1"] ?? 0) / homeFan.tips) * 100);
    facts.push(`${homeFan.userName} glaubt an Heimvorteil: ${pct}% Heimsieg-Tipps.`);
  }

  // 7. Laengste Null-Serie (aufeinanderfolgende 0-Punkte-Tipps)
  const streaks = new Map<string, number>();
  const currentStreak = new Map<string, number>();
  const sortedByDate = [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const r of sortedByDate) {
    if ((r.points ?? 0) === 0) {
      currentStreak.set(r.userId, (currentStreak.get(r.userId) ?? 0) + 1);
      const cur = currentStreak.get(r.userId) ?? 0;
      if (cur > (streaks.get(r.userId) ?? 0)) {
        streaks.set(r.userId, cur);
      }
    } else {
      currentStreak.set(r.userId, 0);
    }
  }
  const worstStreak = [...streaks.entries()].sort((a, b) => b[1] - a[1])[0];
  if (worstStreak && worstStreak[1] >= 3) {
    const name = board.find((p) => p.userId === worstStreak[0])?.userName ?? worstStreak[0];
    facts.push(`${name} hatte eine Durststrecke von ${worstStreak[1]} Spielen ohne Punkte.`);
  }

  // 8. Agent vs. bester Mensch
  const agent = board.find((p) => p.source === "agent");
  const bestHuman = board.find((p) => p.source === "human");
  if (agent && bestHuman) {
    const diff = bestHuman.points - agent.points;
    if (diff > 0) {
      facts.push(`${bestHuman.userName} schlaegt die KI um ${diff} Punkte. Der Mensch lebt!`);
    } else if (diff < 0) {
      facts.push(`Die KI fuehrt ${Math.abs(diff)} Punkte vor ${bestHuman.userName}. Skynet laesst gruessen.`);
    } else {
      facts.push(`${bestHuman.userName} und die KI liefern sich ein Kopf-an-Kopf-Rennen \u2013 Gleichstand!`);
    }
  }

  // 9. Noch nie auf Team X getippt
  const awayPicks = new Map<string, Set<string>>();
  for (const r of records) {
    if (r.winnerPick === "2") {
      awayPicks.set(r.userId, (awayPicks.get(r.userId) ?? new Set()).add(r.userId));
    }
  }
  const neverAway = board.filter((p) => !awayPicks.has(p.userId) && p.tips >= 5);
  if (neverAway.length > 0) {
    facts.push(`${neverAway[0].userName} hat noch nie auf einen Auswaertssieg getippt.`);
  }

  return facts.slice(0, 6); // Max 6 fun facts
}

// ---------------------------------------------------------------------------
// HTML Builder
// ---------------------------------------------------------------------------

function buildHTML(
  board: PlayerStats[],
  standorte: StandortEntry[],
  funFacts: string[],
  mvm: { humanAvg: number; agentAvg: number; leader: string },
): string {
  const leaderboardRows = board.slice(0, 10).map((p, i) => {
    const medal = i === 0 ? "\uD83E\uDD47" : i === 1 ? "\uD83E\uDD48" : i === 2 ? "\uD83E\uDD49" : `${i + 1}.`;
    const tag = p.source === "agent" ? ' <span style="background:#4293D0;color:#fff;padding:1px 5px;border-radius:3px;font-size:10px;">AGENT</span>' : "";
    return `<tr>
      <td style="padding:8px 12px;text-align:center;">${medal}</td>
      <td style="padding:8px 12px;font-weight:600;">${p.userName}${tag}</td>
      <td style="padding:8px 12px;text-align:right;">${p.exact}</td>
      <td style="padding:8px 12px;text-align:right;font-weight:700;font-size:18px;color:#F39200;">${p.points}</td>
    </tr>`;
  }).join("\n");

  const standortRows = standorte.map((s, i) => {
    const medal = i === 0 ? "\uD83C\uDFC6" : "";
    return `<tr>
      <td style="padding:8px 12px;font-weight:600;">${medal} ${s.location}</td>
      <td style="padding:8px 12px;text-align:center;">${s.players}</td>
      <td style="padding:8px 12px;text-align:right;font-weight:700;color:#F39200;">${s.avgPoints}</td>
    </tr>`;
  }).join("\n");

  const funFactItems = funFacts.map((f) => `<li style="margin-bottom:8px;">${f}</li>`).join("\n");

  const mvmColor = mvm.leader === "mensch" ? "#E5172D" : mvm.leader === "maschine" ? "#4293D0" : "#555";
  const mvmText = mvm.leader === "mensch"
    ? `Menschen fuehren mit ${mvm.humanAvg.toFixed(1)} vs ${mvm.agentAvg.toFixed(1)} \u00D8 Punkten`
    : mvm.leader === "maschine"
    ? `Maschine fuehrt mit ${mvm.agentAvg.toFixed(1)} vs ${mvm.humanAvg.toFixed(1)} \u00D8 Punkten`
    : `Gleichstand: ${mvm.humanAvg.toFixed(1)} \u00D8 Punkte`;

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:20px;">

  <!-- Header -->
  <div style="background:#0d0d1f;border-radius:16px 16px 0 0;padding:32px 24px;text-align:center;">
    <img src="https://wm-tippspiel.vercel.app/ut-logo.png" width="48" height="50" alt="UT" style="margin-bottom:12px;">
    <h1 style="margin:0;font-size:28px;color:#fff;">
      <span style="color:#4293D0;">UT</span> Orakel
    </h1>
    <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;">
      W&ouml;chentlicher Digest
    </p>
  </div>

  <div style="background:#fff;border-radius:0 0 16px 16px;padding:0;">

    <!-- Mensch vs. Maschine -->
    <div style="padding:24px;text-align:center;border-bottom:1px solid #eee;">
      <p style="margin:0 0 4px;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:0.06em;">Mensch vs. Maschine</p>
      <p style="margin:0;font-size:18px;font-weight:700;color:${mvmColor};">${mvmText}</p>
    </div>

    <!-- Leaderboard -->
    <div style="padding:24px;">
      <h2 style="margin:0 0 16px;font-size:16px;color:#333;text-transform:uppercase;letter-spacing:0.06em;">
        Leaderboard
      </h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="border-bottom:2px solid #eee;color:#999;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">
            <th style="padding:8px 12px;width:40px;text-align:center;">#</th>
            <th style="padding:8px 12px;text-align:left;">Spieler</th>
            <th style="padding:8px 12px;text-align:right;">Exakt</th>
            <th style="padding:8px 12px;text-align:right;">Punkte</th>
          </tr>
        </thead>
        <tbody>
          ${leaderboardRows}
        </tbody>
      </table>
    </div>

    <!-- Standort-Ranking -->
    ${standorte.length > 0 ? `
    <div style="padding:0 24px 24px;">
      <h2 style="margin:0 0 16px;font-size:16px;color:#333;text-transform:uppercase;letter-spacing:0.06em;">
        Standort-Ranking
      </h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="border-bottom:2px solid #eee;color:#999;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">
            <th style="padding:8px 12px;text-align:left;">Standort</th>
            <th style="padding:8px 12px;text-align:center;">Spieler</th>
            <th style="padding:8px 12px;text-align:right;">\u00D8 Punkte</th>
          </tr>
        </thead>
        <tbody>
          ${standortRows}
        </tbody>
      </table>
    </div>` : ""}

    <!-- Fun Facts -->
    ${funFacts.length > 0 ? `
    <div style="padding:0 24px 24px;">
      <h2 style="margin:0 0 16px;font-size:16px;color:#333;text-transform:uppercase;letter-spacing:0.06em;">
        Fun Facts
      </h2>
      <ul style="margin:0;padding:0 0 0 20px;font-size:14px;color:#555;line-height:1.7;">
        ${funFactItems}
      </ul>
    </div>` : ""}

    <!-- CTA -->
    <div style="padding:24px;text-align:center;border-top:1px solid #eee;">
      <a href="https://wm-tippspiel.vercel.app" style="display:inline-block;padding:12px 32px;background:#F39200;color:#fff;font-size:15px;font-weight:700;border-radius:10px;text-decoration:none;">
        Jetzt tippen
      </a>
    </div>

  </div>

  <!-- Footer -->
  <p style="text-align:center;font-size:11px;color:#999;margin-top:20px;">
    United Therapy GmbH &middot; Du erh&auml;ltst diese E-Mail als Teilnehmer:in des UT Orakel WM 2026 Tippspiels.
  </p>

</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// GET /api/newsletter-digest?secret=xxx
// Optional: ?format=json for raw data, default: html
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const format = req.nextUrl.searchParams.get("format") ?? "html";
    const records = await readPredictions();
    const { board } = buildStats(records);
    const standorte = buildStandorte(records);
    const funFacts = generateFunFacts(board, records);

    // Mensch vs. Maschine
    const humans = board.filter((p) => p.source === "human");
    const agents = board.filter((p) => p.source === "agent");
    const humanAvg = humans.length ? humans.reduce((s, p) => s + p.points, 0) / humans.length : 0;
    const agentAvg = agents.length ? agents.reduce((s, p) => s + p.points, 0) / agents.length : 0;
    const leader = humanAvg > agentAvg ? "mensch" : agentAvg > humanAvg ? "maschine" : "gleichstand";

    // Newsletter subscribers count
    let subscriberCount = 0;
    try {
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      });
      const emails = await redis.smembers("newsletter:emails");
      subscriberCount = emails.length;
    } catch {
      // ignore
    }

    if (format === "json") {
      return NextResponse.json({
        leaderboard: board.slice(0, 15).map(({ scoreTips, picks, ...rest }) => rest),
        standorte,
        funFacts,
        menschVsMaschine: { humanAvg, agentAvg, leader },
        subscriberCount,
      });
    }

    // HTML response
    const html = buildHTML(board, standorte, funFacts, { humanAvg, agentAvg, leader });
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
