import { NextRequest, NextResponse } from "next/server";
import { getMatches, type NormalizedMatch } from "../../../../lib/football-data";
import {
  readPredictions,
  readExcludedUserIds,
  readTipEditCounts,
  readIpHashSets,
  readCards,
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

// Abschreiber (gerichtete Kopie): hohe Uebereinstimmung UND ein Account tippt
// konsistent SPAETER als der andere -> der Spaetere schreibt ab.
const COPY_MIN_SHARED = 8; // gemeinsam getippte Spiele
const COPY_MIN_PCT = 0.8; // mind. 80 % gleiche Ergebnistipps
const COPY_DIR_PCT = 0.8; // in >=80 % der Spiele tippt derselbe Account spaeter
const COPY_MIN_LAG_MIN = 1; // Median-Nachlauf >= 1 Min (sonst Gleichzeitigkeit)

// Hedge: VERBUNDENE Identitaet (gleiche Mail-Basis / voller Name / IP), aber
// bewusst GEGENSAETZLICHE Tipps, um mehrere Ausgaenge gleichzeitig abzudecken.
const HEDGE_MIN_SHARED = 8; // gemeinsam getippte Spiele
const HEDGE_MIN_DIVERGE = 0.5; // >=50 % der Spiele unterschiedliche 1/X/2-Tendenz

// 1/X/2-Tendenz aus einem "h:a"-Ergebnistipp.
function outcome(scoreTip: string): "1" | "X" | "2" | null {
  const [h, a] = scoreTip.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  return h > a ? "1" : h < a ? "2" : "X";
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

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
      tipAt: Map<number, number>; // matchId -> createdAt (ms), fuer Abschreiber-Richtung
      lastMinute: number;
      tipsWithKickoff: number;
      minMinutes: number; // knappster Abstand zum Anpfiff
      lastTipAt: number; // jüngster Tipp-Zeitpunkt (ms)
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
          tipAt: new Map(),
          lastMinute: 0,
          tipsWithKickoff: 0,
          minMinutes: Infinity,
          lastTipAt: 0,
        };
        users.set(r.userId, u);
      }
      u.tips.set(r.matchId, r.scoreTip);
      if (r.createdAt) {
        const t = new Date(r.createdAt).getTime();
        u.tipAt.set(r.matchId, t);
        if (t > u.lastTipAt) u.lastTipAt = t;
      }
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

    // 1e) Abschreiber-Verdacht (gerichtete Kopie) ------------------------
    // Wie die Tipp-Zwillinge hohe Uebereinstimmung, ABER mit Richtung: auf den
    // gemeinsamen, gleichen Tipps tippt ein Account konsistent SPAETER -> der
    // Spaetere schreibt beim Frueheren ab. Liefert Leader -> Abschreiber + Lag.
    const copycats: {
      leader: string; leaderName: string; follower: string; followerName: string;
      shared: number; agree: number; pct: number; dirPct: number; medianLagMin: number;
      leaderExcluded: boolean; followerExcluded: boolean; sharedIp: boolean;
    }[] = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        if (A.tips.size < COPY_MIN_SHARED || B.tips.size < COPY_MIN_SHARED) continue;
        let shared = 0, agree = 0, timed = 0, aLater = 0, bLater = 0;
        const lags: number[] = []; // Betrag des Nachlaufs (Min) auf gleichen Tipps
        for (const [mid, tip] of A.tips) {
          const other = B.tips.get(mid);
          if (other === undefined) continue;
          shared++;
          if (other !== tip) continue;
          agree++;
          const ta = A.tipAt.get(mid), tb = B.tipAt.get(mid);
          if (ta != null && tb != null && ta !== tb) {
            timed++;
            if (tb > ta) { aLater++; lags.push((tb - ta) / 60000); } // B nach A
            else { bLater++; lags.push((ta - tb) / 60000); } // A nach B
          }
        }
        if (shared < COPY_MIN_SHARED || agree / shared < COPY_MIN_PCT) continue;
        if (timed < COPY_MIN_SHARED) continue; // zu wenige zeitlich vergleichbar
        const followerIsB = aLater >= bLater;
        const dir = followerIsB ? aLater : bLater;
        if (dir / timed < COPY_DIR_PCT) continue; // keine klare Richtung -> Zwilling
        const lag = median(lags);
        if (lag < COPY_MIN_LAG_MIN) continue; // praktisch gleichzeitig
        const leader = followerIsB ? A : B;
        const follower = followerIsB ? B : A;
        copycats.push({
          leader: leader.userId, leaderName: leader.userName,
          follower: follower.userId, followerName: follower.userName,
          shared, agree, pct: Math.round((agree / shared) * 100),
          dirPct: Math.round((dir / timed) * 100), medianLagMin: Math.round(lag),
          leaderExcluded: excluded.has(leader.userId),
          followerExcluded: excluded.has(follower.userId),
          sharedIp: false, // unten nach IP-Load gesetzt
        });
      }
    }
    copycats.sort((x, y) => y.pct - x.pct || y.dirPct - x.dirPct);

    // 1f) Hedge-Verdacht --------------------------------------------------
    // VERBUNDENE Identitaet (gleiche Mail-Basis ODER voller Name), die auf den
    // gemeinsamen Spielen bewusst GEGENSAETZLICH tippt -> deckt mehrere Ausgaenge
    // gleichzeitig ab, sodass immer ein Konto punktet. Brisant, wenn BEIDE
    // gewertet sind. Identitaet ist der Ausloeser, IP nur Korroboration.
    const linkKey = new Map<string, string[]>(); // Identitaets-Schluessel -> userIds
    for (const u of list) {
      const keys = [`mail:${emailLocal(u.userId)}`];
      if (u.userName.trim().split(/\s+/).length >= 2) keys.push(`name:${normName(u.userName)}`);
      for (const k of keys) (linkKey.get(k) ?? linkKey.set(k, []).get(k)!).push(u.userId);
    }
    const linkedPairs = new Set<string>(); // "idA|idB" (sortiert)
    for (const ids of linkKey.values()) {
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++)
          linkedPairs.add([ids[i], ids[j]].sort().join("|"));
    }
    const hedges: {
      a: string; aName: string; b: string; bName: string;
      shared: number; diverge: number; divergePct: number; outcomesCovered: number;
      aExcluded: boolean; bExcluded: boolean; bothScored: boolean; sharedIp: boolean;
    }[] = [];
    for (const key of linkedPairs) {
      const [ida, idb] = key.split("|");
      const A = users.get(ida), B = users.get(idb);
      if (!A || !B) continue;
      let shared = 0, diverge = 0;
      const covered = new Set<string>();
      for (const [mid, tip] of A.tips) {
        const other = B.tips.get(mid);
        if (other === undefined) continue;
        shared++;
        const oa = outcome(tip), ob = outcome(other);
        if (oa) covered.add(oa);
        if (ob) covered.add(ob);
        if (oa && ob && oa !== ob) diverge++;
      }
      if (shared < HEDGE_MIN_SHARED || diverge / shared < HEDGE_MIN_DIVERGE) continue;
      hedges.push({
        a: ida, aName: A.userName, b: idb, bName: B.userName,
        shared, diverge, divergePct: Math.round((diverge / shared) * 100),
        outcomesCovered: covered.size,
        aExcluded: excluded.has(ida), bExcluded: excluded.has(idb),
        bothScored: !excluded.has(ida) && !excluded.has(idb),
        sharedIp: false, // unten nach IP-Load gesetzt
      });
    }
    hedges.sort((x, y) => Number(y.bothScored) - Number(x.bothScored) || y.divergePct - x.divergePct);

    // IP-Korroboration: markiere Dubletten, die ZUSAETZLICH eine IP teilen.
    // Reines Bestaetigungssignal auf bereits geflaggten Treffern, KEIN Detektor
    // (Office-/Heim-NAT teilen IPs legitim). Nur fuer verwickelte User geladen.
    const involvedIds = new Set<string>();
    for (const c of sameLocalPart) for (const m of c.members) involvedIds.add(m.userId);
    for (const c of sameName) for (const m of c.members) involvedIds.add(m.userId);
    for (const t of tipTwins) { involvedIds.add(t.a); involvedIds.add(t.b); }
    for (const c of copycats) { involvedIds.add(c.leader); involvedIds.add(c.follower); }
    for (const h of hedges) { involvedIds.add(h.a); involvedIds.add(h.b); }
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
    for (const c of copycats) c.sharedIp = pairSharesIp(c.leader, c.follower);
    for (const h of hedges) h.sharedIp = pairSharesIp(h.a, h.b);

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

    // 0) Wer hat bisher überhaupt getippt? --------------------------------
    // Jeder Account mit mindestens einem menschlichen Tipp, sortiert nach
    // Tipp-Anzahl (dann jüngster Tipp). Rein informativ, kein Verdacht.
    const tippers = list
      .map((u) => ({
        userId: u.userId,
        userName: u.userName,
        tips: u.tips.size,
        lastTipAt: u.lastTipAt ? new Date(u.lastTipAt).toISOString() : null,
        excluded: excluded.has(u.userId),
      }))
      .sort((a, b) => b.tips - a.tips || (b.lastTipAt ?? "").localeCompare(a.lastTipAt ?? ""));

    // Vergebene Karten (Schiedsrichter) — für Karten-Status am Treffer + Einspruch-Inbox.
    const cards = await readCards().catch(() => []);

    return NextResponse.json({
      counts: { humans: list.length, matchesWithKickoff: kickoff.size, fieldExactPct: Math.round(fieldRate * 100) },
      tippers,
      cards,
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
      copycats,
      hedges,
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
