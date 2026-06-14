"use client";

import { useState, useEffect, useCallback } from "react";

interface Match {
  id: number;
  kickoff: string;
  status: string;
  stage: string | null;
  group: string | null;
  homeTeam: { id: number; name: string; code: string | null };
  awayTeam: { id: number; name: string; code: string | null };
  score?: { home: number | null; away: number | null };
}

interface UserProfile {
  userId: string;
  userName: string;
  location: string;
}

interface MyTip {
  winnerPick: string;
  scoreTip: string;
  points?: number;
}

interface OrakelResult {
  winnerPick: string;
  scoreTip: string;
  reasoning: string[];
}

const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE: "Gruppenphase",
  LAST_16: "Achtelfinale",
  QUARTER_FINALS: "Viertelfinale",
  SEMI_FINALS: "Halbfinale",
  THIRD_PLACE: "Spiel um Platz 3",
  FINAL: "Finale",
};

const STAGE_MULTIPLIERS: Record<string, string> = {
  LAST_16: "1.5x",
  QUARTER_FINALS: "2x",
  SEMI_FINALS: "2.5x",
  THIRD_PLACE: "2x",
  FINAL: "3x",
};

const STAGE_ORDER = [
  "GROUP_STAGE",
  "LAST_16",
  "QUARTER_FINALS",
  "SEMI_FINALS",
  "THIRD_PLACE",
  "FINAL",
];

const STAGE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  GROUP_STAGE: { bg: "#eef6fb", border: "#4293D044", text: "#4293D0" },
  LAST_16: { bg: "#fef6e8", border: "#F3920044", text: "#F39200" },
  QUARTER_FINALS: { bg: "#f3f0f7", border: "#65597F44", text: "#65597F" },
  SEMI_FINALS: { bg: "#eef6fb", border: "#4293D044", text: "#4293D0" },
  THIRD_PLACE: { bg: "#fef6e8", border: "#F3920044", text: "#E76C0A" },
  FINAL: { bg: "#fdeef0", border: "#E5172D44", text: "#E5172D" },
};

interface StageGroup {
  stage: string;
  subGroups?: { group: string; matches: Match[] }[];
  matches?: Match[];
}

function groupMatchesByStage(matches: Match[]): StageGroup[] {
  const stageMap = new Map<string, Match[]>();
  for (const m of matches) {
    const key = m.stage || "GROUP_STAGE";
    if (!stageMap.has(key)) stageMap.set(key, []);
    stageMap.get(key)!.push(m);
  }

  return STAGE_ORDER
    .filter((s) => stageMap.has(s))
    .map((s) => {
      const stageMatches = stageMap.get(s)!;
      if (s === "GROUP_STAGE") {
        const groupMap = new Map<string, Match[]>();
        for (const m of stageMatches) {
          const g = m.group || "?";
          if (!groupMap.has(g)) groupMap.set(g, []);
          groupMap.get(g)!.push(m);
        }
        const subGroups = [...groupMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([group, matches]) => ({ group, matches }));
        return { stage: s, subGroups };
      }
      return { stage: s, matches: stageMatches };
    });
}

// FIFA code → ISO 3166-1 alpha-2 (for flag CDN)
const FIFA_TO_ISO: Record<string, string> = {
  MEX: "mx", RSA: "za", KOR: "kr", CAN: "ca", QAT: "qa", SUI: "ch",
  BRA: "br", HAI: "ht", MAR: "ma", SCO: "gb-sct", USA: "us", PAR: "py",
  AUS: "au", GER: "de", CUW: "cw", NED: "nl", JPN: "jp", CIV: "ci",
  TUN: "tn", ESP: "es", CPV: "cv", BEL: "be", EGY: "eg", KSA: "sa",
  URU: "uy", IRN: "ir", NZL: "nz", FRA: "fr", SEN: "sn", NOR: "no",
  ARG: "ar", ALG: "dz", AUT: "at", JOR: "jo", POR: "pt", UZB: "uz",
  COL: "co", ENG: "gb-eng", CRO: "hr", GHA: "gh", PAN: "pa",
  IDN: "id", BHR: "bh",
  BIH: "ba", COD: "cd", CZE: "cz", ECU: "ec", IRQ: "iq", SWE: "se", TUR: "tr",
};

// Team noch nicht feststehend (Platzhalter wie "1A", "W49", "Winner Path B", PO-Codes)
function teamIsTBD(t: { name: string; code: string | null }): boolean {
  return Boolean(
    !t.name ||
      (t.code?.startsWith("PO") && t.code !== "POR") ||
      /winner|path/i.test(t.name) ||
      /^(1|2)[A-L]$/.test(t.name) ||
      /^[WL]\d+$/.test(t.name),
  );
}

function matchTeamsKnown(m: Match): boolean {
  return !teamIsTBD(m.homeTeam) && !teamIsTBD(m.awayTeam);
}

function FlagImg({ code }: { code: string | null }) {
  if (!code) return null;
  const iso = FIFA_TO_ISO[code];
  if (!iso) return null;
  return (
    <img
      src={`https://flagcdn.com/20x15/${iso}.png`}
      srcSet={`https://flagcdn.com/40x30/${iso}.png 2x`}
      width={20}
      height={15}
      alt={code}
      style={{ verticalAlign: "middle", marginRight: 4, borderRadius: 2 }}
    />
  );
}

const PICKS = ["1", "X", "2"] as const;

const SCORE_SUGGESTIONS: Record<string, string[]> = {
  "1": ["1:0", "2:0", "2:1", "3:1"],
  X: ["0:0", "1:1", "2:2"],
  "2": ["0:1", "0:2", "1:2", "1:3"],
};

const LS_KEY = "ut-orakel-user";

export default function TipForm({ initialUser }: { initialUser?: UserProfile }) {
  // User state — when authed-via-magic-link, page passes the server-side profile.
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(initialUser ?? null);
  const [regName, setRegName] = useState("");
  const [regLocation, setRegLocation] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [regCode, setRegCode] = useState("");

  const [regError, setRegError] = useState("");

  // Clock for countdowns (ticks every 30s)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Match + tip state
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchesError, setMatchesError] = useState(false);
  const [finishedMatches, setFinishedMatches] = useState<Match[]>([]);
  // Orakel-Tipps, aufgedeckt nur für Spiele nach Anpfiff (server-seitig gegated).
  const [oracleTips, setOracleTips] = useState<Record<number, { scoreTip: string; winnerPick: string; confidence: number | null }>>({});
  // Aktuell laufende Spiele (IN_PLAY) — prominent mit aufgedecktem Orakel-Tipp.
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [showTbd, setShowTbd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [myTips, setMyTips] = useState<Record<number, MyTip>>({});
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null);
  const [pick, setPick] = useState<"1" | "X" | "2" | "">("");
  const [score, setScore] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string; matchId?: number } | null>(null);

  // Orakel Joker state
  const [jokersRemaining, setJokersRemaining] = useState(10);
  const [orakelLoading, setOrakelLoading] = useState<number | null>(null); // matchId loading
  const [orakelResults, setOrakelResults] = useState<Record<number, OrakelResult>>({});

  // Load users + matches + saved user
  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .catch(() => {});

    fetch("/api/matches")
      .then((r) => r.json())
      .then((d) => {
        // Bei API-Ausfall liefert die Route { error } statt { matches } – das
        // ehrlich anzeigen statt faelschlich "Keine anstehenden Spiele".
        if (d.error) {
          setMatchesError(true);
        } else {
          setMatches(d.matches ?? []);
        }
        setLoading(false);
      })
      .catch(() => {
        setMatchesError(true);
        setLoading(false);
      });

    // Beendete Spiele fuer die "Meine Ergebnisse"-Ansicht
    fetch("/api/matches?status=FINISHED")
      .then((r) => r.json())
      .then((d) => setFinishedMatches(d.matches ?? []))
      .catch(() => {});

    // Orakel-Tipps (nur Spiele nach Anpfiff — kommt server-seitig gegated)
    fetch("/api/oracle-tips")
      .then((r) => r.json())
      .then((d) => setOracleTips(d.tips ?? {}))
      .catch(() => {});

    // Aktuell laufende Spiele
    fetch("/api/matches?status=IN_PLAY")
      .then((r) => r.json())
      .then((d) => setLiveMatches(d.matches ?? []))
      .catch(() => {});

    // Only fall back to localStorage if no server-side profile was passed in.
    if (!initialUser) {
      try {
        const saved = localStorage.getItem(LS_KEY);
        if (saved) setCurrentUser(JSON.parse(saved));
      } catch {
        // no saved user
      }
    }
  }, [initialUser]);

  // Live-Stand + Orakel-Reveals + frische Endstände alle 60 s nachziehen, damit
  // der rollende „Heute"-Block aktuell bleibt (angepfiffen → live → beendet).
  useEffect(() => {
    const tick = () => {
      fetch("/api/matches?status=IN_PLAY").then((r) => r.json()).then((d) => setLiveMatches(d.matches ?? [])).catch(() => {});
      fetch("/api/oracle-tips").then((r) => r.json()).then((d) => setOracleTips(d.tips ?? {})).catch(() => {});
      fetch("/api/matches?status=FINISHED").then((r) => r.json()).then((d) => setFinishedMatches(d.matches ?? [])).catch(() => {});
    };
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  // Load user's tips + joker count when user is set
  useEffect(() => {
    if (!currentUser) return;

    fetch(`/api/my-tips?userId=${encodeURIComponent(currentUser.userId)}`)
      .then((r) => r.json())
      .then((d) => setMyTips(d.tips ?? {}))
      .catch(() => {});

    fetch(`/api/orakel-joker?userId=${encodeURIComponent(currentUser.userId)}`)
      .then((r) => r.json())
      .then((d) => setJokersRemaining(d.remaining ?? 10))
      .catch(() => {});
  }, [currentUser]);

  const selectUser = useCallback((user: UserProfile) => {
    setCurrentUser(user);
    localStorage.setItem(LS_KEY, JSON.stringify(user));
    setShowRegister(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore — fall through to client cleanup either way
    }
    localStorage.removeItem(LS_KEY);
    window.location.href = "/";
  }, []);

  async function register() {
    if (!regName.trim() || !regLocation.trim()) return;
    setRegistering(true);
    setRegError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: regName.trim(),
          location: regLocation.trim(),
          inviteCode: regCode.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        selectUser(data.user);
        setUsers((prev) => [...prev, data.user]);
        setRegName("");
        setRegLocation("");
        setRegError("");
      } else {
        setRegError(data.error ?? "Registrierung fehlgeschlagen");
      }
    } catch {
      setRegError("Netzwerkfehler");
    }
    setRegistering(false);
  }

  async function submitTip(match: Match) {
    if (!currentUser || !pick || !score) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/submit-tip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          userId: currentUser.userId,
          userName: currentUser.userName,
          winnerPick: pick,
          scoreTip: score,
          source: "human",
          style: "balanced",
          location: currentUser.location,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult({ ok: true, msg: `Tipp gespeichert: ${score} (${pick})`, matchId: match.id });
        setMyTips((prev) => ({ ...prev, [match.id]: { winnerPick: pick, scoreTip: score } }));
        setPick("");
        setScore("");
        setExpandedMatch(null);
      } else {
        setResult({ ok: false, msg: data.error ?? "Fehler", matchId: match.id });
      }
    } catch {
      setResult({ ok: false, msg: "Netzwerkfehler", matchId: match.id });
    }
    setSubmitting(false);
  }

  async function askOrakel(match: Match) {
    if (!currentUser || jokersRemaining <= 0) return;
    setOrakelLoading(match.id);
    try {
      const res = await fetch("/api/orakel-joker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.userId,
          matchId: match.id,
          homeTeamId: match.homeTeam.id,
          awayTeamId: match.awayTeam.id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setJokersRemaining(data.jokersRemaining);
        setOrakelResults((prev) => ({
          ...prev,
          [match.id]: {
            winnerPick: data.tip.winnerPick,
            scoreTip: data.tip.scoreTip,
            reasoning: data.tip.reasoning,
          },
        }));
        // Pre-fill the tip form
        setPick(data.tip.winnerPick);
        setScore(data.tip.scoreTip);
        setExpandedMatch(match.id);
      } else {
        setResult({ ok: false, msg: data.error ?? "Orakel-Fehler", matchId: match.id });
      }
    } catch {
      setResult({ ok: false, msg: "Netzwerkfehler", matchId: match.id });
    }
    setOrakelLoading(null);
  }

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const countdownInfo = (
    iso: string,
  ): { text: string; color: string; urgent: boolean; pulse: boolean } => {
    const diff = new Date(iso).getTime() - now;
    if (diff <= 0)
      return { text: "Anpfiff vorbei", color: "#c62828", urgent: false, pulse: false };
    const mins = Math.floor(diff / 60_000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (days > 0)
      return {
        text: `in ${days} ${days === 1 ? "Tag" : "Tagen"}`,
        color: "#7A7A7A",
        urgent: false,
        pulse: false,
      };
    if (hrs >= 2)
      return { text: `in ${hrs} Std`, color: "#7A7A7A", urgent: false, pulse: false };
    // < 2 Std → Dringlichkeit steigt
    if (mins >= 60)
      return {
        text: `noch ${hrs} Std ${mins % 60} Min`,
        color: "#E76C0A",
        urgent: true,
        pulse: false,
      };
    if (mins >= 15)
      return { text: `⏰ noch ${mins} Min`, color: "#c62828", urgent: true, pulse: false };
    return { text: `🔴 Anpfiff in ${mins} Min!`, color: "#c62828", urgent: true, pulse: true };
  };

  const pickLabel = (p: string) => {
    if (p === "1") return "Heim";
    if (p === "2") return "Ausw.";
    return "X";
  };

  // ---- Styles ----
  const s = {
    section: {
      background: "#ffffff",
      borderRadius: 12,
      padding: "28px 24px",
      marginTop: 32,
      border: "1px solid #e0ddd9",
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    } as React.CSSProperties,
    label: {
      display: "block",
      fontSize: 12,
      color: "#7A7A7A",
      marginBottom: 6,
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
    },
    input: {
      width: "100%",
      padding: "10px 12px",
      background: "#F7F5F3",
      border: "1px solid #e0ddd9",
      borderRadius: 8,
      color: "#3A3A3A",
      fontSize: 15,
      outline: "none",
      boxSizing: "border-box" as const,
    },
    btn: (active: boolean) =>
      ({
        padding: "10px 16px",
        background: active ? "#F39200" : "#F7F5F3",
        border: active ? "1px solid #F39200" : "1px solid #e0ddd9",
        borderRadius: 8,
        color: active ? "#fff" : "#3A3A3A",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: active ? 700 : 400,
      }) as React.CSSProperties,
    pickBtn: (active: boolean) =>
      ({
        flex: 1,
        padding: "8px",
        background: active ? "#F39200" : "#F7F5F3",
        border: active ? "1px solid #F39200" : "1px solid #e0ddd9",
        borderRadius: 8,
        color: active ? "#fff" : "#3A3A3A",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 700,
        textAlign: "center" as const,
      }) as React.CSSProperties,
    scoreBtn: (active: boolean) =>
      ({
        padding: "6px 12px",
        background: active ? "#F39200" : "#F7F5F3",
        border: active ? "1px solid #F39200" : "1px solid #e0ddd9",
        borderRadius: 8,
        color: active ? "#fff" : "#3A3A3A",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
      }) as React.CSSProperties,
    link: {
      background: "none",
      border: "none",
      color: "#F39200",
      cursor: "pointer",
      fontSize: 13,
      padding: 0,
      textDecoration: "underline",
    } as React.CSSProperties,
  };

  // ---- Render: inline match card with tip ----
  function renderMatchCard(m: Match, stageColor: string, showOracle = false) {
    const tip = myTips[m.id];
    const editable = new Date(m.kickoff).getTime() > now;
    const sh = m.score?.home;
    const sa = m.score?.away;
    const finished = m.status === "FINISHED";
    const live = m.status === "IN_PLAY";
    const shownScore = sh != null && sa != null ? `${sh}:${sa}` : "–";
    const ptColor =
      tip?.points == null
        ? "#7A7A7A"
        : tip.points >= 4
          ? "#2e7d32"
          : tip.points >= 2
            ? "#E76C0A"
            : "#b0b0b0";
    const isExpanded = expandedMatch === m.id;
    const orakel = orakelResults[m.id];
    const matchResult = result?.matchId === m.id ? result : null;
    const teamsKnown = matchTeamsKnown(m);

    return (
      <div
        key={m.id}
        style={{
          background: isExpanded ? "#fef9f2" : "#ffffff",
          border: isExpanded ? `1px solid ${stageColor}66` : "1px solid #e0ddd9",
          borderRadius: 10,
          padding: "10px 12px",
          marginTop: 6,
          transition: "all 0.15s",
        }}
      >
        {/* Match row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          {/* Teams + date */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#3A3A3A", lineHeight: 1.4 }}>
              <FlagImg code={m.homeTeam.code} />{m.homeTeam.code ?? m.homeTeam.name}
              {finished ? (
                <span style={{ color: "#3A3A3A", fontWeight: 700, margin: "0 6px" }}>
                  {shownScore}
                </span>
              ) : (
                <span style={{ color: "#7A7A7A", margin: "0 4px" }}>vs</span>
              )}
              <FlagImg code={m.awayTeam.code} />{m.awayTeam.code ?? m.awayTeam.name}
            </div>
            <div style={{ fontSize: 11, color: "#7A7A7A", marginTop: 1 }}>
              {fmtDate(m.kickoff)}
              {finished && (
                <span style={{ color: "#7A7A7A", fontWeight: 600 }}> &middot; beendet</span>
              )}
              {live && (
                <span className="cd-pulse" style={{ color: "#c62828", fontWeight: 700 }}> &middot; LIVE</span>
              )}
              {" "}
              {!finished && !live && (() => {
                const cd = countdownInfo(m.kickoff);
                return (
                  <span
                    className={cd.pulse ? "cd-pulse" : undefined}
                    style={{
                      fontSize: cd.urgent ? 11 : 10,
                      color: cd.color,
                      fontWeight: cd.urgent ? 700 : 500,
                      ...(cd.urgent
                        ? {
                            display: "inline-block",
                            background: `${cd.color}1a`,
                            padding: "1px 7px",
                            borderRadius: 10,
                            marginLeft: 2,
                          }
                        : {}),
                    }}
                  >
                    {cd.text}
                  </span>
                );
              })()}
            </div>
            {showOracle && oracleTips[m.id] && (() => {
              const ot = oracleTips[m.id];
              let hit: "exact" | "tend" | "miss" | null = null;
              if (finished && sh != null && sa != null) {
                const actualPick = sh > sa ? "1" : sh < sa ? "2" : "X";
                hit = ot.scoreTip === `${sh}:${sa}` ? "exact" : ot.winnerPick === actualPick ? "tend" : "miss";
              }
              return (
                <div style={{ fontSize: 11, color: "#5b3a8e", marginTop: 3, fontWeight: 600 }}>
                  🔮 Orakel: {ot.scoreTip}{ot.confidence != null ? ` · ${ot.confidence}%` : ""}
                  {hit === "exact" && <span style={{ color: "#2e7d32" }}> ✓ exakt</span>}
                  {hit === "tend" && <span style={{ color: "#E76C0A" }}> ✓ Tendenz</span>}
                  {hit === "miss" && <span style={{ color: "#b0b0b0" }}> ✗</span>}
                </div>
              );
            })()}
          </div>

          {/* Existing tip badge OR tip button */}
          {!teamsKnown ? (
              <span style={{ fontSize: 11, color: "#7A7A7A", fontStyle: "italic", flexShrink: 0 }}>
                TBD
              </span>
          ) : tip ? (
            <div
              onClick={
                editable
                  ? () => {
                      if (isExpanded) {
                        setExpandedMatch(null);
                        setPick("");
                        setScore("");
                      } else {
                        setExpandedMatch(m.id);
                        setPick(tip.winnerPick as "1" | "X" | "2");
                        setScore(tip.scoreTip);
                        setResult(null);
                      }
                    }
                  : undefined
              }
              title={editable ? "Tipp ändern" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: finished ? "#f5f3f0" : "#e8f5e9",
                border: finished ? "1px solid #e0ddd9" : "1px solid #a5d6a7",
                borderRadius: 8,
                padding: "4px 10px",
                fontSize: 12,
                color: finished ? "#555" : "#2e7d32",
                fontWeight: 600,
                flexShrink: 0,
                cursor: editable ? "pointer" : "default",
              }}
            >
              <span>{tip.scoreTip}</span>
              <span style={{ color: finished ? "#ccc" : "#a5d6a7" }}>|</span>
              <span>{pickLabel(tip.winnerPick)}</span>
              {tip.points != null && (
                <>
                  <span style={{ color: finished ? "#ccc" : "#a5d6a7" }}>|</span>
                  <span style={finished ? { color: ptColor } : undefined}>{tip.points}P</span>
                </>
              )}
              {editable && (
                <span style={{ color: "#66bb6a", marginLeft: 2 }}>✎</span>
              )}
            </div>
          ) : finished ? (
            <span
              style={{
                fontSize: 11,
                color: "#b0b0b0",
                fontStyle: "italic",
                flexShrink: 0,
              }}
            >
              nicht getippt
            </span>
          ) : currentUser ? (
            <button
              onClick={() => {
                if (isExpanded) {
                  setExpandedMatch(null);
                  setPick("");
                  setScore("");
                } else {
                  setExpandedMatch(m.id);
                  setPick("");
                  setScore("");
                  setResult(null);
                }
              }}
              style={{
                padding: "6px 14px",
                background: isExpanded ? "#F39200" : "#F7F5F3",
                border: isExpanded ? "1px solid #F39200" : "1px solid #e0ddd9",
                borderRadius: 8,
                color: isExpanded ? "#fff" : "#3A3A3A",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {isExpanded ? "Abbrechen" : "Tippen"}
            </button>
          ) : null}
        </div>

        {/* Expanded inline tip form */}
        {isExpanded && currentUser && teamsKnown && (
          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px solid #e0ddd9",
            }}
          >
            {/* Orakel suggestion */}
            {orakel && (
              <div
                style={{
                  background: "#fef6e8",
                  border: "1px solid #F3920044",
                  borderRadius: 8,
                  padding: "8px 12px",
                  marginBottom: 10,
                  fontSize: 12,
                }}
              >
                <div style={{ color: "#F39200", fontWeight: 700, marginBottom: 4 }}>
                  UT Orakel empfiehlt:
                </div>
                <div style={{ color: "#E76C0A", fontWeight: 600, fontSize: 14 }}>
                  {orakel.scoreTip} ({pickLabel(orakel.winnerPick)})
                </div>
                {orakel.reasoning.map((line, i) => (
                  <div key={i} style={{ color: "#7A7A7A", marginTop: 2 }}>
                    {line}
                  </div>
                ))}
              </div>
            )}

            {/* Tendenz */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#7A7A7A", marginBottom: 4 }}>TENDENZ</div>
              <div style={{ display: "flex", gap: 6 }}>
                {PICKS.map((p) => (
                  <button
                    key={p}
                    style={s.pickBtn(pick === p)}
                    onClick={() => { setPick(p); setScore(""); }}
                  >
                    {p === "1"
                      ? m.homeTeam.code ?? "1"
                      : p === "2"
                        ? m.awayTeam.code ?? "2"
                        : "X"}
                  </button>
                ))}
              </div>
            </div>

            {/* Score */}
            {pick && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "#7A7A7A", marginBottom: 4 }}>ERGEBNIS</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {SCORE_SUGGESTIONS[pick].map((sc) => (
                    <button
                      key={sc}
                      style={s.scoreBtn(score === sc)}
                      onClick={() => setScore(sc)}
                    >
                      {sc}
                    </button>
                  ))}
                  <input
                    style={{ ...s.input, width: 70, padding: "6px 8px", fontSize: 13 }}
                    placeholder="4:2"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Actions row: submit + orakel joker */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              {pick && score && (
                <button
                  onClick={() => submitTip(m)}
                  disabled={submitting}
                  style={{
                    padding: "8px 20px",
                    background: "#F39200",
                    border: "none",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    opacity: submitting ? 0.6 : 1,
                  }}
                >
                  {submitting ? "..." : "Tipp abgeben"}
                </button>
              )}

              {!orakel && jokersRemaining > 0 && (
                <button
                  onClick={() => askOrakel(m)}
                  disabled={orakelLoading === m.id}
                  style={{
                    padding: "8px 14px",
                    background: "#eef6fb",
                    border: "1px solid #4293D044",
                    borderRadius: 8,
                    color: "#4293D0",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    opacity: orakelLoading === m.id ? 0.6 : 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {orakelLoading === m.id ? (
                    "Orakel denkt..."
                  ) : (
                    <>
                      Orakel fragen
                      <span
                        style={{
                          background: "#4293D022",
                          padding: "1px 6px",
                          borderRadius: 10,
                          fontSize: 10,
                          color: "#4293D0",
                        }}
                      >
                        {jokersRemaining}/10
                      </span>
                    </>
                  )}
                </button>
              )}

              {!orakel && jokersRemaining <= 0 && (
                <span style={{ fontSize: 11, color: "#7A7A7A" }}>
                  Keine Joker mehr
                </span>
              )}
            </div>

            {/* Inline result message */}
            {matchResult && (
              <div
                style={{
                  marginTop: 8,
                  padding: "6px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                  background: matchResult.ok ? "#e8f5e9" : "#ffebee",
                  color: matchResult.ok ? "#2e7d32" : "#c62828",
                  border: matchResult.ok ? "1px solid #a5d6a7" : "1px solid #ef9a9a",
                }}
              >
                {matchResult.msg}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // Render: Not logged in
  // =========================================================================

  if (!currentUser) {
    return (
      <div style={s.section}>
        <h2 style={{ margin: "0 0 20px", fontSize: 20, color: "#3A3A3A" }}>
          Jetzt mitspielen
        </h2>

        {!showRegister && users.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={s.label}>Wer bist du?</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {users.map((u) => (
                <button
                  key={u.userId}
                  style={s.btn(false)}
                  onClick={() => selectUser(u)}
                >
                  {u.userName}
                  <span style={{ fontSize: 11, color: "#7A7A7A", marginLeft: 6 }}>
                    {u.location}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!showRegister && (
          <button style={s.link} onClick={() => setShowRegister(true)}>
            Neu registrieren
          </button>
        )}

        {(showRegister || users.length === 0) && (
          <div>
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 2 }}>
                <label style={s.label}>Dein Name</label>
                <input
                  style={s.input}
                  placeholder="z.B. Sebastian"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={s.label}>Standort</label>
                <input
                  style={s.input}
                  placeholder="z.B. Essen"
                  value={regLocation}
                  onChange={(e) => setRegLocation(e.target.value)}
                />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={s.label}>Einladungscode</label>
              <input
                style={s.input}
                placeholder="Code aus dem Teams-Kanal"
                value={regCode}
                onChange={(e) => setRegCode(e.target.value)}
              />
            </div>
            <button
              style={{
                width: "100%",
                padding: "14px",
                background: "#F39200",
                border: "none",
                borderRadius: 10,
                color: "#fff",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
                opacity: registering || !regName || !regLocation || !regCode ? 0.5 : 1,
              }}
              onClick={register}
              disabled={registering || !regName || !regLocation || !regCode}
            >
              {registering ? "Wird registriert..." : "Registrieren"}
            </button>
            {regError && (
              <div style={{
                marginTop: 10,
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 13,
                background: "#ffebee",
                color: "#c62828",
                border: "1px solid #ef9a9a",
              }}>
                {regError}
              </div>
            )}
            {users.length > 0 && (
              <button
                style={{ ...s.link, marginTop: 12, display: "block" }}
                onClick={() => setShowRegister(false)}
              >
                Bereits registriert? Hier einloggen
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // Render: Logged in – matches with inline tips
  // =========================================================================

  // Spiele mit Anpfiff in den nächsten 24 h -> prominenter Block oben.
  // Bewusst rollierendes Fenster statt Kalendertag: viele Spiele starten früh
  // morgens, ein Spiel "morgen 6:00" ist näher dran als "heute 23:00".
  const WINDOW_MS = 24 * 60 * 60 * 1000;
  const todayUpcoming = matches
    .filter((m) => {
      const t = new Date(m.kickoff).getTime();
      return t > now && t <= now + WINDOW_MS;
    })
    .sort(
      (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
    );
  const todayUntipped = todayUpcoming.filter((m) => !myTips[m.id]).length;
  // Dringlichster ungetippter Anpfiff im Fenster (Minuten bis Kickoff, sonst null)
  const imminentMins = todayUpcoming
    .filter((m) => !myTips[m.id])
    .map((m) => Math.floor((new Date(m.kickoff).getTime() - now) / 60_000))
    .filter((mins) => mins <= 60)
    .sort((a, b) => a - b)[0];
  const hasImminent = imminentMins !== undefined;
  // Beendete Spiele zusaetzlich in die Stage-Tabellen zuruecknehmen (mit
  // Endstand) – nicht nur unter "Meine Ergebnisse". Upcoming + finished mergen,
  // deduplizieren, chronologisch sortieren (damit Gruppen-/KO-Listen stimmen).
  const allMatchesById = new Map<number, Match>();
  for (const m of matches) allMatchesById.set(m.id, m);
  for (const m of liveMatches) allMatchesById.set(m.id, m); // Live frisch
  for (const m of finishedMatches) allMatchesById.set(m.id, m); // beendet ist autoritativ
  const allMatches = [...allMatchesById.values()].sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
  );
  // „Heute"-Block: laufende + anstehende Spiele des heutigen Spieltags (Live +
  // nächste 24 h). BEENDETE Spiele gehören NICHT hierher — die wandern zurück in
  // die Stage-/Gruppentabellen. Nur hier wird der Orakel-Tipp aufgedeckt.
  const LIVE_WINDOW_MS = 3.5 * 60 * 60 * 1000;
  const todayWindow = allMatches
    .filter((m) => {
      if (m.status === "FINISHED") return false;
      const t = new Date(m.kickoff).getTime();
      return t > now - LIVE_WINDOW_MS && t <= now + WINDOW_MS;
    })
    .sort((a, b) => {
      const la = a.status === "IN_PLAY" ? 0 : 1;
      const lb = b.status === "IN_PLAY" ? 0 : 1;
      if (la !== lb) return la - lb; // live zuerst
      return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
    });
  const todayWindowIds = new Set(todayWindow.map((m) => m.id));
  const hasLive = todayWindow.some((m) => m.status === "IN_PLAY");
  const restMatches = allMatches.filter((m) => !todayWindowIds.has(m.id));

  return (
    <div style={s.section}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 20, color: "#3A3A3A" }}>
            Spiele & Tipps
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#7A7A7A" }}>
            {currentUser.userName} &middot; {currentUser.location}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Joker counter */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "#eef6fb",
              border: "1px solid #4293D033",
              borderRadius: 20,
              padding: "4px 12px",
              fontSize: 12,
              color: "#4293D0",
              fontWeight: 600,
            }}
          >
            Joker: {jokersRemaining}/10
          </div>
          <button style={s.link} onClick={logout}>
            Wechseln
          </button>
        </div>
      </div>

      <style>{`
        @keyframes cdPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        .cd-pulse { animation: cdPulse 1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .cd-pulse { animation: none; }
        }
      `}</style>

      {/* ── Heute: anstehende & laufende Spiele des heutigen Spieltags ── */}
      {!loading && todayWindow.length > 0 && (
        <div
          style={{
            marginBottom: 24,
            background: hasImminent || hasLive ? "#fdecec" : "#fff8ef",
            border: hasImminent || hasLive ? "1px solid #c6282855" : "1px solid #F3920055",
            borderRadius: 14,
            padding: "16px 16px 18px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 16,
                color: "#3A3A3A",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 18 }}>⚽</span> Heute
              {hasLive && (
                <span className="cd-pulse" style={{ color: "#c62828", fontSize: 12, fontWeight: 700 }}>
                  🔴 LIVE
                </span>
              )}
            </h3>
            {todayUpcoming.length === 0 ? null : todayUntipped > 0 ? (
              <span
                className={hasImminent ? "cd-pulse" : undefined}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: hasImminent ? "#fff" : "#E76C0A",
                  background: hasImminent ? "#c62828" : "#F3920022",
                  borderRadius: 20,
                  padding: "4px 12px",
                }}
              >
                {hasImminent
                  ? `⏰ Anpfiff in ${imminentMins} Min`
                  : `${todayUntipped} noch zu tippen`}
              </span>
            ) : (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#2e7d32",
                  background: "#e8f5e9",
                  borderRadius: 20,
                  padding: "4px 12px",
                }}
              >
                alle getippt ✓
              </span>
            )}
          </div>
          <p
            style={{
              margin: "0 0 12px",
              fontSize: 12,
              color: hasImminent ? "#c62828" : "#7A7A7A",
              fontWeight: hasImminent ? 600 : 400,
            }}
          >
            {hasImminent
              ? "Letzte Chance – nach dem Anpfiff ist der Tipp dicht!"
              : "Heutiger Spieltag – anstehende & laufende Spiele. Anstehende tippen, bevor der Anpfiff kommt; bei laufenden deckt das Orakel seinen Tipp auf."}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {todayWindow.map((m) => renderMatchCard(m, "#F39200", true))}
          </div>
        </div>
      )}

      {/* Match list */}
      {loading ? (
        <p style={{ color: "#7A7A7A", fontSize: 14 }}>Lade Spiele...</p>
      ) : matchesError ? (
        <div
          style={{
            background: "#fff8ef",
            border: "1px solid #F3920055",
            borderRadius: 12,
            padding: "14px 16px",
            fontSize: 14,
            color: "#7A4A00",
          }}
        >
          ⚠️ Spieldaten gerade nicht erreichbar. Die Spiele stehen weiter an –
          bitte in ein paar Minuten neu laden.
        </div>
      ) : matches.length === 0 ? (
        <p style={{ color: "#7A7A7A", fontSize: 14 }}>Keine anstehenden Spiele.</p>
      ) : restMatches.length === 0 ? null : (
        <div>
          {(() => {
            const allGroups = groupMatchesByStage(restMatches);
            const stageMatches = (sg: StageGroup) =>
              sg.subGroups
                ? sg.subGroups.flatMap((g) => g.matches)
                : sg.matches ?? [];
            const isTbdGroup = (sg: StageGroup) =>
              !stageMatches(sg).some(matchTeamsKnown);
            const visibleGroups = allGroups.filter((sg) => !isTbdGroup(sg));
            const tbdGroups = allGroups.filter(isTbdGroup);
            const tbdCount = tbdGroups.reduce(
              (n, sg) => n + stageMatches(sg).length,
              0,
            );
            const renderStage = (sg: StageGroup) => {
            const colors = STAGE_COLORS[sg.stage] ?? STAGE_COLORS.GROUP_STAGE;
            return (
              <div
                key={sg.stage}
                style={{
                  marginBottom: 16,
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 14,
                  padding: "14px 16px",
                }}
              >
                {/* Stage header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: colors.text,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {STAGE_LABELS[sg.stage] ?? sg.stage}
                  </span>
                  {STAGE_MULTIPLIERS[sg.stage] && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: "3px 10px",
                        background: `${colors.text}22`,
                        color: colors.text,
                        borderRadius: 20,
                        fontWeight: 700,
                        border: `1px solid ${colors.text}44`,
                      }}
                    >
                      {STAGE_MULTIPLIERS[sg.stage]} Punkte
                    </span>
                  )}
                </div>

                {/* GROUP_STAGE: sub-groups */}
                {sg.subGroups && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {sg.subGroups.map(({ group, matches: gMatches }) => (
                      <div
                        key={group}
                        style={{
                          background: "#f8fbfd",
                          borderRadius: 10,
                          padding: "10px 12px",
                          border: "1px solid #4293D033",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#4293D0",
                            marginBottom: 4,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            textAlign: "center",
                            padding: "2px 0 6px",
                            borderBottom: "1px solid #4293D033",
                          }}
                        >
                          {group.replace("GROUP_", "Gruppe ")}
                        </div>
                        {gMatches.map((m) => renderMatchCard(m, colors.text))}
                      </div>
                    ))}
                  </div>
                )}

                {/* KO rounds */}
                {sg.matches && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {sg.matches.map((m) => renderMatchCard(m, colors.text))}
                  </div>
                )}
              </div>
            );
            };
            return (
              <>
                {visibleGroups.map(renderStage)}
                {tbdGroups.length > 0 && (
                  <>
                    <button
                      onClick={() => setShowTbd((v) => !v)}
                      style={{
                        width: "100%",
                        textAlign: "center",
                        background: "#f5f3f0",
                        border: "1px dashed #cfc9c2",
                        borderRadius: 10,
                        padding: "12px",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#7A7A7A",
                        cursor: "pointer",
                        marginBottom: 16,
                      }}
                    >
                      {showTbd
                        ? "Spätere Runden ausblenden ▴"
                        : `Spätere Runden anzeigen (${tbdCount} Spiele, Teams noch offen) ▾`}
                    </button>
                    {showTbd && tbdGroups.map(renderStage)}
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ── Meine Ergebnisse (beendete Spiele, read-only) ── */}
      {(() => {
        const myResults = finishedMatches
          .filter((m) => myTips[m.id])
          .sort(
            (a, b) =>
              new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime(),
          );
        if (myResults.length === 0) return null;
        return (
          <details style={{ marginTop: 32 }}>
            <summary
              style={{
                listStyle: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 16,
                fontWeight: 600,
                color: "#3A3A3A",
                userSelect: "none",
                marginBottom: 4,
              }}
            >
              <span>Meine Ergebnisse ({myResults.length})</span>
              <span style={{ fontSize: 12, color: "#bbb", fontWeight: 400 }}>
                anzeigen ▾
              </span>
            </summary>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "#7A7A7A" }}>
              Deine bereits ausgewerteten Tipps – Endstand, dein Tipp und
              erzielte Punkte.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {myResults.map((m) => {
                const tip = myTips[m.id];
                const sh = m.score?.home;
                const sa = m.score?.away;
                const finalScore =
                  sh != null && sa != null ? `${sh}:${sa}` : "–";
                const pts = tip.points;
                const ptColor =
                  pts == null
                    ? "#7A7A7A"
                    : pts >= 4
                      ? "#2e7d32"
                      : pts >= 2
                        ? "#E76C0A"
                        : "#b0b0b0";
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      background: "#fff",
                      border: "1px solid #e0ddd9",
                      borderRadius: 10,
                      padding: "10px 12px",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          color: "#3A3A3A",
                          lineHeight: 1.4,
                        }}
                      >
                        <FlagImg code={m.homeTeam.code} />
                        {m.homeTeam.code ?? m.homeTeam.name}
                        <span
                          style={{
                            color: "#3A3A3A",
                            fontWeight: 700,
                            margin: "0 6px",
                          }}
                        >
                          {finalScore}
                        </span>
                        <FlagImg code={m.awayTeam.code} />
                        {m.awayTeam.code ?? m.awayTeam.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#7A7A7A",
                          marginTop: 1,
                        }}
                      >
                        {fmtDate(m.kickoff)}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: "#f5f3f0",
                        border: "1px solid #e0ddd9",
                        borderRadius: 8,
                        padding: "4px 10px",
                        fontSize: 12,
                        color: "#555",
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                      title="Dein Tipp"
                    >
                      <span>{tip.scoreTip}</span>
                      <span style={{ color: "#ccc" }}>|</span>
                      <span>{pickLabel(tip.winnerPick)}</span>
                      <span style={{ color: "#ccc" }}>|</span>
                      <span style={{ color: ptColor }}>
                        {pts != null ? `${pts}P` : "–"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        );
      })()}
    </div>
  );
}
