import { NextRequest, NextResponse } from "next/server";
import { getMatches, type NormalizedMatch } from "../../../../lib/football-data";
import {
  readPredictions,
  readExcludedUserIds,
  readTipEditCounts,
  readIpHashSets,
  type PredictionRecord,
} from "../../../../lib/store";

// Admin-Panel "Auffälligkeiten": leitet aus den vorhandenen Daten Indizien fuer
// Doppelregistrierung, Last-Minute-Tippen und haeufiges Aendern ab. Rein lesend.

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  return !!secret && req.nextUrl.searchParams.get("secret") === secret;
}

// E-Mail-Localpart normalisiert (Punkte + "+suffix" raus) — Gmail-Tricks.
function emailLocal(userId: string): string {
  const at = userId.indexOf("@");
  const local = (at === -1 ? userId : userId.slice(0, at)).toLowerCase();
  return local.replace(/\+.*$/, "").replace(/\./g, "");
}

function normName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

const LAST_MIN_WINDOW = 5; // Minuten vor Anpfiff = "Last Minute"
const TWIN_MIN_SHARED = 8; // Mindest-Anzahl gemeinsam getippter Spiele
const TWIN_MIN_PCT = 0.85; // Mindest-Uebereinstimmung exakter Ergebnistipps

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [records, matches, excludedArr, editCounts] = await Promise.all([
      readPredictions(),
      getMatches().catch(() => [] as NormalizedMatch[]),
      readExcludedUserIds().catch(() => [] as string[]),
      readTipEditCounts().catch(() => ({} as Record<string, number>)),
    ]);

    const excluded = new Set(excludedArr);
    const kickoff = new Map<number, number>();
    for (const m of matches) kickoff.set(m.id, new Date(m.kickoff).getTime());

    // Pro Mensch sammeln: Name, Tipps (matchId->scoreTip), Last-Minute-Zähler.
    interface U {
      userId: string;
      userName: string;
      tips: Map<number, string>;
      lastMinute: number;
      tipsWithKickoff: number;
      minMinutes: number; // knappster Abstand zum Anpfiff
    }
    const users = new Map<string, U>();
    const humanRecords: PredictionRecord[] = [];
    for (const r of records) {
      if (r.source !== "human") continue;
      humanRecords.push(r);
      let u = users.get(r.userId);
      if (!u) {
        u = {
          userId: r.userId,
          userName: r.userName,
          tips: new Map(),
          lastMinute: 0,
          tipsWithKickoff: 0,
          minMinutes: Infinity,
        };
        users.set(r.userId, u);
      }
      u.tips.set(r.matchId, r.scoreTip);
      const ko = kickoff.get(r.matchId);
      if (ko && r.createdAt) {
        const mins = (ko - new Date(r.createdAt).getTime()) / 60000;
        if (mins >= 0) {
          u.tipsWithKickoff++;
          u.minMinutes = Math.min(u.minMinutes, mins);
          if (mins <= LAST_MIN_WINDOW) u.lastMinute++;
        }
      }
    }
    const list = [...users.values()];

    // 1) Doppelregistrierungs-Verdacht ------------------------------------
    // a) gleicher E-Mail-Localpart über mehrere Adressen
    const byLocal = new Map<string, U[]>();
    for (const u of list) {
      const k = emailLocal(u.userId);
      (byLocal.get(k) ?? byLocal.set(k, []).get(k)!).push(u);
    }
    const sameLocalPart = [...byLocal.entries()]
      .filter(([, m]) => m.length > 1)
      .map(([localPart, m]) => ({
        localPart,
        members: m.map((u) => ({ userId: u.userId, userName: u.userName, excluded: excluded.has(u.userId) })),
      }));

    // b) identischer Anzeigename — nur bei VOLLEM Namen (Vor- + Nachname).
    // Reine Vornamen ("Tobi", "Marc") sind Zufall und werden ignoriert.
    const byName = new Map<string, U[]>();
    for (const u of list) {
      if (u.userName.trim().split(/\s+/).length < 2) continue; // nur Vorname -> raus
      const k = normName(u.userName);
      if (!k) continue;
      (byName.get(k) ?? byName.set(k, []).get(k)!).push(u);
    }
    const sameName = [...byName.entries()]
      .filter(([, m]) => m.length > 1)
      .map(([name, m]) => ({
        name: m[0].userName,
        members: m.map((u) => ({ userId: u.userId, userName: u.userName, excluded: excluded.has(u.userId) })),
      }));

    // c) Tipp-Zwillinge: zwei Accounts mit fast identischen Ergebnistipps
    const tipTwins: {
      a: string; aName: string; b: string; bName: string;
      shared: number; agree: number; pct: number;
      aExcluded: boolean; bExcluded: boolean;
    }[] = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        if (A.tips.size < TWIN_MIN_SHARED || B.tips.size < TWIN_MIN_SHARED) continue;
        let shared = 0, agree = 0;
        const [small, big] = A.tips.size <= B.tips.size ? [A, B] : [B, A];
        for (const [mid, tip] of small.tips) {
          const other = big.tips.get(mid);
          if (other === undefined) continue;
          shared++;
          if (other === tip) agree++;
        }
        if (shared >= TWIN_MIN_SHARED && agree / shared >= TWIN_MIN_PCT) {
          tipTwins.push({
            a: A.userId, aName: A.userName, b: B.userId, bName: B.userName,
            shared, agree, pct: Math.round((agree / shared) * 100),
            aExcluded: excluded.has(A.userId), bExcluded: excluded.has(B.userId),
          });
        }
      }
    }
    tipTwins.sort((x, y) => y.pct - x.pct || y.shared - x.shared);

    // IP-Korroboration: markiere Dubletten, die ZUSAETZLICH eine IP teilen.
    // Reines Bestaetigungssignal auf bereits geflaggten Treffern, KEIN Detektor
    // (Office-/Heim-NAT teilen IPs legitim). Nur fuer verwickelte User geladen.
    const involvedIds = new Set<string>();
    for (const c of sameLocalPart) for (const m of c.members) involvedIds.add(m.userId);
    for (const c of sameName) for (const m of c.members) involvedIds.add(m.userId);
    for (const t of tipTwins) { involvedIds.add(t.a); involvedIds.add(t.b); }
    const ipSets = await readIpHashSets([...involvedIds]).catch(
      () => new Map<string, Set<string>>(),
    );
    const groupSharesIp = (members: { userId: string }[]): boolean => {
      const seen = new Set<string>();
      for (const m of members) {
        for (const h of ipSets.get(m.userId) ?? []) {
          if (seen.has(h)) return true;
          seen.add(h);
        }
      }
      return false;
    };
    const pairSharesIp = (a: string, b: string): boolean => {
      const A = ipSets.get(a), B = ipSets.get(b);
      if (!A || !B) return false;
      for (const h of A) if (B.has(h)) return true;
      return false;
    };

    // Triage-Signal: auf WIE VIELEN Spielen haben die Mitglieder GEMEINSAM
    // getippt? 0 = reiner Account-Wechsel (kein Wertungsvorteil); viele = beide
    // Accounts parallel gewertet (der Fall, der zaehlt). Max ueber alle Paare.
    const groupSharedMatches = (members: { userId: string }[]): number => {
      let max = 0;
      for (let i = 0; i < members.length; i++) {
        const A = users.get(members[i].userId)?.tips;
        if (!A) continue;
        for (let j = i + 1; j < members.length; j++) {
          const B = users.get(members[j].userId)?.tips;
          if (!B) continue;
          let c = 0;
          for (const mid of A.keys()) if (B.has(mid)) c++;
          if (c > max) max = c;
        }
      }
      return max;
    };

    // 1d) Verdächtig hohe Exakt-Trefferquote ------------------------------
    // Exaktes Ergebnis zu treffen ist selten. Statt flacher Quote (bei kleiner
    // Stichprobe reines Rauschen) testen wir statistisch: Wie wahrscheinlich ist
    // diese Trefferzahl rein zufaellig, gegeben Feld-Schnitt + Spielanzahl?
    // Geflaggt nur, wenn das sehr unwahrscheinlich ist (< 1 %).
    const actual = new Map<number, { h: number; a: number }>();
    for (const m of matches) {
      if (m.score?.home != null && m.score?.away != null) {
        actual.set(m.id, { h: m.score.home, a: m.score.away });
      }
    }
    const accRows = list.map((u) => {
      let resolved = 0, exact = 0;
      for (const [mid, tip] of u.tips) {
        const a = actual.get(mid);
        if (!a) continue;
        resolved++;
        const [h, aw] = tip.split(":").map(Number);
        if (h === a.h && aw === a.a) exact++;
      }
      return { userId: u.userId, userName: u.userName, resolved, exact, excluded: excluded.has(u.userId) };
    });
    const fieldExact = accRows.reduce((s, r) => s + r.exact, 0);
    const fieldResolved = accRows.reduce((s, r) => s + r.resolved, 0);
    const fieldRate = fieldResolved ? fieldExact / fieldResolved : 0;

    // P(X >= k) bei n Versuchen, Erfolgschance p (Binomial-Obertail).
    const upperTail = (k: number, n: number, p: number): number => {
      if (k <= 0) return 1;
      const q = 1 - p;
      let pmf = Math.pow(q, n); // P(X=0)
      let cdf = pmf;
      for (let i = 1; i < k; i++) {
        pmf = (pmf * (p / q) * (n - i + 1)) / i;
        cdf += pmf;
      }
      return Math.max(0, Math.min(1, 1 - cdf));
    };

    const MIN_RESOLVED = 8; // unter dieser Stichprobe ist nichts aussagekraeftig
    const p = Math.max(0.05, fieldRate); // Feld-Schnitt als Nullhypothese
    const suspiciousAccuracy = accRows
      .filter((r) => r.resolved >= MIN_RESOLVED)
      .map((r) => ({
        userId: r.userId,
        userName: r.userName,
        resolved: r.resolved,
        exact: r.exact,
        ratePct: Math.round((r.exact / r.resolved) * 100),
        chancePct: Math.round(upperTail(r.exact, r.resolved, p) * 1000) / 10, // Zufallswahrscheinlichkeit in %
        excluded: r.excluded,
      }))
      .filter((r) => r.chancePct < 1) // < 1 % Zufallswahrscheinlichkeit
      .sort((a, b) => a.chancePct - b.chancePct);

    // 2) Last-Minute-Tipper -----------------------------------------------
    const lastMinute = list
      .filter((u) => u.lastMinute >= 2)
      .map((u) => ({
        userId: u.userId,
        userName: u.userName,
        lastMinuteTips: u.lastMinute,
        totalTips: u.tipsWithKickoff,
        share: u.tipsWithKickoff ? Math.round((u.lastMinute / u.tipsWithKickoff) * 100) : 0,
        knappsteMinuten: Number.isFinite(u.minMinutes) ? Math.round(u.minMinutes) : null,
        excluded: excluded.has(u.userId),
      }))
      .sort((a, b) => b.lastMinuteTips - a.lastMinuteTips || a.share - b.share);

    // 3) Häufige Änderungen (Zähler ab Einbau) ----------------------------
    const frequentChanges = list
      .map((u) => {
        const submits = Number(editCounts[u.userId] ?? 0);
        const distinct = u.tips.size;
        return {
          userId: u.userId,
          userName: u.userName,
          submits,
          distinctTips: distinct,
          changes: Math.max(0, submits - distinct),
          excluded: excluded.has(u.userId),
        };
      })
      .filter((x) => x.changes >= 2)
      .sort((a, b) => b.changes - a.changes);

    return NextResponse.json({
      counts: { humans: list.length, matchesWithKickoff: kickoff.size, fieldExactPct: Math.round(fieldRate * 100) },
      duplicates: {
        sameLocalPart: sameLocalPart.map((c) => ({
          ...c,
          sharedIp: groupSharesIp(c.members),
          sharedMatches: groupSharedMatches(c.members),
        })),
        sameName: sameName.map((c) => ({
          ...c,
          sharedIp: groupSharesIp(c.members),
          sharedMatches: groupSharedMatches(c.members),
        })),
        tipTwins: tipTwins.map((t) => ({ ...t, sharedIp: pairSharesIp(t.a, t.b) })),
      },
      suspiciousAccuracy,
      lastMinute,
      frequentChanges,
      note: "Änderungs-Zähler zählt erst ab Einbau dieses Features.",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
