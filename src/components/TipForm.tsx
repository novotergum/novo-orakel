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
  GROUP_STAGE: { bg: "#0f1a2e", border: "#1e3a5f", text: "#60a5fa" },
  LAST_16: { bg: "#1a1a0f", border: "#3f3a1e", text: "#fbbf24" },
  QUARTER_FINALS: { bg: "#1a0f1a", border: "#3f1e3f", text: "#c084fc" },
  SEMI_FINALS: { bg: "#0f1a1a", border: "#1e3f3f", text: "#2dd4bf" },
  THIRD_PLACE: { bg: "#1a1a0f", border: "#3f3a1e", text: "#fb923c" },
  FINAL: { bg: "#1a0f0f", border: "#5f1e1e", text: "#f87171" },
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

const PICKS = ["1", "X", "2"] as const;

const SCORE_SUGGESTIONS: Record<string, string[]> = {
  "1": ["1:0", "2:0", "2:1", "3:1"],
  X: ["0:0", "1:1", "2:2"],
  "2": ["0:1", "0:2", "1:2", "1:3"],
};

const LS_KEY = "novo-orakel-user";

export default function TipForm() {
  // User state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [regName, setRegName] = useState("");
  const [regLocation, setRegLocation] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [registering, setRegistering] = useState(false);

  // Match + tip state
  const [matches, setMatches] = useState<Match[]>([]);
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
        setMatches(d.matches ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) setCurrentUser(JSON.parse(saved));
    } catch {
      // no saved user
    }
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

  const logout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem(LS_KEY);
    setMyTips({});
  }, []);

  async function register() {
    if (!regName.trim() || !regLocation.trim()) return;
    setRegistering(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: regName.trim(),
          location: regLocation.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        selectUser(data.user);
        setUsers((prev) => [...prev, data.user]);
        setRegName("");
        setRegLocation("");
      }
    } catch {
      // ignore
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

  const pickLabel = (p: string) => {
    if (p === "1") return "Heim";
    if (p === "2") return "Ausw.";
    return "X";
  };

  // ---- Styles ----
  const s = {
    section: {
      background: "#141414",
      borderRadius: 12,
      padding: "28px 24px",
      marginTop: 32,
      border: "1px solid #222",
    } as React.CSSProperties,
    label: {
      display: "block",
      fontSize: 12,
      color: "#888",
      marginBottom: 6,
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
    },
    input: {
      width: "100%",
      padding: "10px 12px",
      background: "#1a1a1a",
      border: "1px solid #333",
      borderRadius: 8,
      color: "#fff",
      fontSize: 15,
      outline: "none",
      boxSizing: "border-box" as const,
    },
    btn: (active: boolean) =>
      ({
        padding: "10px 16px",
        background: active ? "#2563eb" : "#1a1a1a",
        border: active ? "1px solid #2563eb" : "1px solid #333",
        borderRadius: 8,
        color: "#fff",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: active ? 700 : 400,
      }) as React.CSSProperties,
    pickBtn: (active: boolean) =>
      ({
        flex: 1,
        padding: "8px",
        background: active ? "#2563eb" : "#1a1a1a",
        border: active ? "1px solid #2563eb" : "1px solid #333",
        borderRadius: 8,
        color: "#fff",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 700,
        textAlign: "center" as const,
      }) as React.CSSProperties,
    scoreBtn: (active: boolean) =>
      ({
        padding: "6px 12px",
        background: active ? "#2563eb" : "#1a1a1a",
        border: active ? "1px solid #2563eb" : "1px solid #333",
        borderRadius: 8,
        color: "#fff",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
      }) as React.CSSProperties,
    link: {
      background: "none",
      border: "none",
      color: "#2563eb",
      cursor: "pointer",
      fontSize: 13,
      padding: 0,
      textDecoration: "underline",
    } as React.CSSProperties,
  };

  // ---- Render: inline match card with tip ----
  function renderMatchCard(m: Match, stageColor: string) {
    const tip = myTips[m.id];
    const isExpanded = expandedMatch === m.id;
    const orakel = orakelResults[m.id];
    const matchResult = result?.matchId === m.id ? result : null;

    return (
      <div
        key={m.id}
        style={{
          background: isExpanded ? "#111827" : "#0d0d0d",
          border: isExpanded ? `1px solid ${stageColor}66` : "1px solid #1a1a1a",
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
            <div style={{ fontWeight: 600, fontSize: 13, color: "#fff", lineHeight: 1.4 }}>
              {m.homeTeam.code ?? m.homeTeam.name}
              <span style={{ color: "#555", margin: "0 4px" }}>vs</span>
              {m.awayTeam.code ?? m.awayTeam.name}
            </div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 1 }}>
              {fmtDate(m.kickoff)}
            </div>
          </div>

          {/* Existing tip badge OR tip button */}
          {tip ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "#052e16",
                border: "1px solid #166534",
                borderRadius: 8,
                padding: "4px 10px",
                fontSize: 12,
                color: "#4ade80",
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              <span>{tip.scoreTip}</span>
              <span style={{ color: "#166534" }}>|</span>
              <span>{pickLabel(tip.winnerPick)}</span>
              {tip.points != null && (
                <>
                  <span style={{ color: "#166534" }}>|</span>
                  <span>{tip.points}P</span>
                </>
              )}
            </div>
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
                background: isExpanded ? "#1e3a5f" : "#1a1a1a",
                border: isExpanded ? "1px solid #2563eb" : "1px solid #333",
                borderRadius: 8,
                color: "#fff",
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
        {isExpanded && currentUser && !tip && (
          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px solid #222",
            }}
          >
            {/* Orakel suggestion */}
            {orakel && (
              <div
                style={{
                  background: "#1a0f2e",
                  border: "1px solid #7c3aed44",
                  borderRadius: 8,
                  padding: "8px 12px",
                  marginBottom: 10,
                  fontSize: 12,
                }}
              >
                <div style={{ color: "#a78bfa", fontWeight: 700, marginBottom: 4 }}>
                  Novo-Orakel empfiehlt:
                </div>
                <div style={{ color: "#c4b5fd", fontWeight: 600, fontSize: 14 }}>
                  {orakel.scoreTip} ({pickLabel(orakel.winnerPick)})
                </div>
                {orakel.reasoning.map((line, i) => (
                  <div key={i} style={{ color: "#8b5cf6", marginTop: 2 }}>
                    {line}
                  </div>
                ))}
              </div>
            )}

            {/* Tendenz */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>TENDENZ</div>
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
                <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>ERGEBNIS</div>
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
                    background: "#2563eb",
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
                    background: "#1a0f2e",
                    border: "1px solid #7c3aed44",
                    borderRadius: 8,
                    color: "#a78bfa",
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
                          background: "#7c3aed33",
                          padding: "1px 6px",
                          borderRadius: 10,
                          fontSize: 10,
                          color: "#c4b5fd",
                        }}
                      >
                        {jokersRemaining}/10
                      </span>
                    </>
                  )}
                </button>
              )}

              {!orakel && jokersRemaining <= 0 && (
                <span style={{ fontSize: 11, color: "#666" }}>
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
                  background: matchResult.ok ? "#052e16" : "#3b0712",
                  color: matchResult.ok ? "#4ade80" : "#f87171",
                  border: matchResult.ok ? "1px solid #166534" : "1px solid #991b1b",
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
        <h2 style={{ margin: "0 0 20px", fontSize: 20, color: "#fff" }}>
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
                  <span style={{ fontSize: 11, color: "#666", marginLeft: 6 }}>
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
            <button
              style={{
                width: "100%",
                padding: "14px",
                background: "#2563eb",
                border: "none",
                borderRadius: 10,
                color: "#fff",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
                opacity: registering || !regName || !regLocation ? 0.5 : 1,
              }}
              onClick={register}
              disabled={registering || !regName || !regLocation}
            >
              {registering ? "Wird registriert..." : "Registrieren"}
            </button>
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
          <h2 style={{ margin: 0, fontSize: 20, color: "#fff" }}>
            Spiele & Tipps
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#888" }}>
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
              background: "#1a0f2e",
              border: "1px solid #7c3aed33",
              borderRadius: 20,
              padding: "4px 12px",
              fontSize: 12,
              color: "#a78bfa",
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

      {/* Match list */}
      {loading ? (
        <p style={{ color: "#666", fontSize: 14 }}>Lade Spiele...</p>
      ) : matches.length === 0 ? (
        <p style={{ color: "#666", fontSize: 14 }}>Keine anstehenden Spiele.</p>
      ) : (
        <div>
          {groupMatchesByStage(matches).map((sg) => {
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
                          background: "#111827",
                          borderRadius: 10,
                          padding: "10px 12px",
                          border: "1px solid #1e3a5f",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#3b82f6",
                            marginBottom: 4,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            textAlign: "center",
                            padding: "2px 0 6px",
                            borderBottom: "1px solid #1e3a5f",
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
          })}
        </div>
      )}
    </div>
  );
}
