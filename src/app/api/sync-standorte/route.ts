import { NextRequest, NextResponse } from "next/server";
import { readPredictions, readStandortByEmail, writeStandortByEmail } from "@/lib/store";
import { matchRegistrations } from "@/lib/personio";

/**
 * POST /api/sync-standorte
 *
 * Täglicher Abgleich (Vercel Cron, 1×/Tag): matcht alle Tipper gegen Personio
 * und schreibt den offiziellen Standort jedes erkannten Mitarbeiters in die
 * Standort-Map (`standort:by-email`). So bekommen neue Spieler automatisch ihren
 * echten Personio-Standort statt nur der Selbstangabe — ohne manuellen Backfill.
 *
 * - NUR upsert: bestehende Einträge ohne neuen Personio-Match (z.B. Standort-
 *   Postfächer wie Hamburg Rahlstedt) bleiben unangetastet.
 * - Die Standort-Wertung selbst ist `force-dynamic` und liest die Map bei jedem
 *   Aufruf live → nach dem Sync ist sie beim nächsten Reload aktuell.
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (von Vercel Cron gesetzt) oder
 * <ADMIN_SECRET> (für manuellen Trigger).
 */

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const cron = process.env.CRON_SECRET;
  const admin = process.env.ADMIN_SECRET;
  return Boolean((cron && token === cron) || (admin && token === admin));
}

async function run() {
  const records = await readPredictions();

  // Eindeutige menschliche Tipper (Agenten raus).
  const players = new Map<string, string>();
  for (const r of records) {
    if (r.source === "agent") continue;
    if (!players.has(r.userId)) players.set(r.userId, r.userName);
  }

  const [matches, current] = await Promise.all([
    matchRegistrations(
      [...players].map(([userId, userName]) => ({ userId, userName, email: userId })),
    ),
    readStandortByEmail(),
  ]);

  const updates: Record<string, string> = {};
  const changes: { email: string; from: string | null; to: string }[] = [];
  let matchedMA = 0;
  let mailboxes = 0;
  let unmatched = 0;

  for (const [userId] of players) {
    const m = matches.get(userId);
    if (m?.category === "Standort-Postfach") mailboxes++;
    if (!m || m.category !== "MA" || !m.office) {
      if (!m || !m.empId) unmatched++;
      continue;
    }
    matchedMA++;
    const key = userId.toLowerCase().trim();
    const prev = current[key] ?? null;
    if (prev !== m.office) {
      updates[key] = m.office;
      changes.push({ email: key, from: prev, to: m.office });
    }
  }

  await writeStandortByEmail(updates);

  return {
    ok: true,
    scannedPlayers: players.size,
    matchedMA,
    mailboxes,
    unmatched,
    updated: changes.length,
    changes,
  };
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await run());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Vercel Cron triggert per GET — gleiche Logik, gleicher Auth-Check.
export async function GET(req: NextRequest) {
  return POST(req);
}
