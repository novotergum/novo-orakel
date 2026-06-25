// Tägliche, catchy Headline fürs UT-Orakel. Regeln (A) + Live-Daten (B):
// erkennt die Spiel-Lage (Deutschland heute/live/bald, Spieltag, spielfrei,
// Turnier vorbei) und zieht eine passende, deterministische Tages-Headline aus
// einem kuratierten Pool. Kein Cron nötig — Funktion von (Datum + Spielplan).
// Deutsch, witzig, möglichst wenige Anglizismen.
import { getMatches } from "./football-data";
import { deTeam } from "./germanize";

export interface Headline {
  text: string;
  tag: string;
}

const isGermany = (n: string) => {
  const x = n.trim().toLowerCase();
  return x === "germany" || x === "deutschland";
};

function berlinDate(d = new Date()): string {
  if (isNaN(d.getTime())) return ""; // ungültiges/fehlendes Datum → nie crashen
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d); // YYYY-MM-DD
}
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function pick(pool: string[], seed: string): string {
  return pool[hashStr(seed) % pool.length];
}
function fill(t: string, v: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
}

const P = {
  germanyLive: [
    "Deutschland spielt GERADE – tief durchatmen, Faszien locker, Daumen drücken.",
    "Anpfiff ist durch: Jetzt hilft nur noch Daumendrücken und ruhige Bauchatmung.",
    "Es läuft! Deutschland am Ball – Puls hoch, Schultern runter.",
  ],
  germanyToday: [
    "Heute spielt Deutschland gegen {gegner} – erst tippen, dann zittern.",
    "Heute zählt's: Deutschland – {gegner}. Die einzige Mannschaft, bei der wir mitfiebern UND mitleiden.",
    "In rund {std} Stunden pfeift Deutschland an – ist dein Tipp schon aufgewärmt?",
    "Deutschland heute Abend, morgen volle Wartezimmer mit Sofa-Zerrungen.",
    "Spieltag mit der DFB-Elf gegen {gegner} – Tipp abgeben ist Pflicht, Fingernägel kauen freiwillig.",
  ],
  germanySoon: [
    "Bald geht's gegen {gegner} – Zeit, den Tipp schon mal vorzudehnen.",
    "Deutschland trifft demnächst auf {gegner}. Wer früh tippt, hat hinterher weniger Muskelkater im Gewissen.",
    "Es wird ernst: In ein paar Tagen Deutschland gegen {gegner}.",
  ],
  matchday: [
    "Heute wird gespielt – jeder richtige Tipp bringt dich nach oben, langsam und stetig wie eine gute Reha.",
    "Spieltag! Punkte sammeln ist wie Mobilisieren: dranbleiben zahlt sich aus.",
    "Heute rollt der Ball – Tipps abgeben und die Tabelle in Bewegung bringen.",
  ],
  spielfrei: [
    "Heute spielfrei – aktive Erholung für die Tipp-Finger.",
    "Kein Spiel heute? Gönn dir Regeneration und studier in Ruhe die Tabelle.",
    "Spielfreier Tag – die perfekte Gelegenheit, Ausreden für die letzten Tipps vorzubereiten.",
    "Pause im Spielplan – aber die Tabelle wartet nicht.",
  ],
  leader: [
    "{leader} thront ganz oben – die Tabellenspitze hätte mal wieder eine Behandlung nötig.",
    "Ganz vorne: {leader}. Wer renkt das wieder ein?",
    "{leader} führt souverän – Zeit für eine kleine Mobilisierung an der Spitze.",
  ],
  finished: [
    "Die WM ist Geschichte – ab in die Nachsorge: Schau dir die Siegerehrung an!",
    "Abpfiff fürs Turnier – die Tabelle ist eingerenkt, die Sieger stehen fest.",
  ],
};

export async function getDailyHeadline(opts?: { leaderName?: string }): Promise<Headline | null> {
  try {
    const matches = await getMatches();
    if (!matches || matches.length === 0) return null;

  const now = Date.now();
  const today = berlinDate();
  const sameDay = (iso: string) => berlinDate(new Date(iso)) === today;
  const leader = (opts?.leaderName || "").trim();
  const seed = today;

  const germany = matches.filter((m) => isGermany(m.homeTeam.name) || isGermany(m.awayTeam.name));
  const oppOf = (m: (typeof matches)[number]) =>
    isGermany(m.homeTeam.name) ? deTeam(m.awayTeam.name) : deTeam(m.homeTeam.name);

  const gLive = germany.find((m) => m.status === "IN_PLAY" || m.status === "PAUSED");
  const gToday = germany.find((m) => sameDay(m.kickoff) && m.status !== "FINISHED");
  const gNext = germany
    .filter((m) => m.status !== "FINISHED" && new Date(m.kickoff).getTime() >= now - 3 * 3600000)
    .sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff))[0];

  const anyToday = matches.some((m) => sameDay(m.kickoff) && m.status !== "FINISHED");
  const allFinished = matches.every((m) => m.status === "FINISHED");

  const hoursTo = (iso: string) => Math.max(1, Math.round((new Date(iso).getTime() - now) / 3600000));

  if (gLive) return { text: pick(P.germanyLive, seed), tag: "germany-live" };

  if (gToday)
    return {
      text: fill(pick(P.germanyToday, seed), { gegner: oppOf(gToday), std: String(hoursTo(gToday.kickoff)) }),
      tag: "germany-today",
    };

  if (gNext && new Date(gNext.kickoff).getTime() - now <= 48 * 3600000)
    return { text: fill(pick(P.germanySoon, seed), { gegner: oppOf(gNext) }), tag: "germany-soon" };

  if (allFinished) return { text: pick(P.finished, seed), tag: "finished" };

  // Kein Deutschland-Bezug: an spielfreien Tagen ab und zu eine Tabellen-Stichelei.
  if (anyToday) return { text: pick(P.matchday, seed), tag: "matchday" };

  if (leader && hashStr(seed) % 2 === 0)
    return { text: fill(pick(P.leader, seed), { leader }), tag: "leader" };
  return { text: pick(P.spielfrei, seed), tag: "spielfrei" };
  } catch {
    return null; // jede Laufzeit-Panne → kein Banner statt Seiten-Crash
  }
}
