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
  // For GROUP_STAGE, sub-grouped by group (A, B, C, ...)
  subGroups?: { group: string; matches: Match[] }[];
  // For KO rounds, flat list
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
        // Sub-group by group
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

  // Tip state
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [pick, setPick] = useState<"1" | "X" | "2" | "">("");
  const [score, setScore] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );

  // Load users + matches + saved user from localStorage
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

  const selectUser = useCallback((user: UserProfile) => {
    setCurrentUser(user);
    localStorage.setItem(LS_KEY, JSON.stringify(user));
    setShowRegister(false);
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem(LS_KEY);
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

  async function submit() {
    if (!currentUser || !selectedMatch || !pick || !score) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/submit-tip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: selectedMatch.id,
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
        setResult({ ok: true, msg: `Tipp gespeichert: ${score} (${pick})` });
        setPick("");
        setScore("");
        setSelectedMatch(null);
      } else {
        setResult({ ok: false, msg: data.error ?? "Fehler" });
      }
    } catch {
      setResult({ ok: false, msg: "Netzwerkfehler" });
    }
    setSubmitting(false);
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
    matchBtn: (active: boolean) =>
      ({
        display: "block",
        width: "100%",
        padding: "12px 14px",
        marginBottom: 6,
        background: active ? "#1e3a5f" : "#1a1a1a",
        border: active ? "1px solid #2563eb" : "1px solid #333",
        borderRadius: 8,
        color: "#fff",
        cursor: "pointer",
        textAlign: "left" as const,
        fontSize: 14,
      }) as React.CSSProperties,
    pickBtn: (active: boolean) =>
      ({
        flex: 1,
        padding: "12px",
        background: active ? "#2563eb" : "#1a1a1a",
        border: active ? "1px solid #2563eb" : "1px solid #333",
        borderRadius: 8,
        color: "#fff",
        cursor: "pointer",
        fontSize: 18,
        fontWeight: 700,
        textAlign: "center" as const,
      }) as React.CSSProperties,
    scoreBtn: (active: boolean) =>
      ({
        padding: "8px 16px",
        background: active ? "#2563eb" : "#1a1a1a",
        border: active ? "1px solid #2563eb" : "1px solid #333",
        borderRadius: 8,
        color: "#fff",
        cursor: "pointer",
        fontSize: 15,
        fontWeight: 600,
      }) as React.CSSProperties,
    submit: {
      width: "100%",
      padding: "14px",
      background: "#2563eb",
      border: "none",
      borderRadius: 10,
      color: "#fff",
      fontSize: 16,
      fontWeight: 700,
      cursor: "pointer",
      marginTop: 20,
      opacity: submitting ? 0.6 : 1,
    } as React.CSSProperties,
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

  // -------------------------------------------------------------------------
  // Render: Not logged in
  // -------------------------------------------------------------------------

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
                ...s.submit,
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

  // -------------------------------------------------------------------------
  // Render: Logged in – Tip form
  // -------------------------------------------------------------------------

  return (
    <div style={s.section}>
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
            Tipp abgeben
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#888" }}>
            {currentUser.userName} &middot; {currentUser.location}
          </p>
        </div>
        <button style={s.link} onClick={logout}>
          Wechseln
        </button>
      </div>

      {/* Match selection */}
      <div style={{ marginBottom: 16 }}>
        <label style={s.label}>Spiel</label>
        {loading ? (
          <p style={{ color: "#666", fontSize: 14 }}>Lade Spiele...</p>
        ) : matches.length === 0 ? (
          <p style={{ color: "#666", fontSize: 14 }}>
            Keine anstehenden Spiele.
          </p>
        ) : (
          <div style={{ maxHeight: 480, overflowY: "auto" }}>
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

                  {/* GROUP_STAGE: sub-groups as grid of cards */}
                  {sg.subGroups && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
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
                              marginBottom: 8,
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                              textAlign: "center",
                              padding: "2px 0 6px",
                              borderBottom: "1px solid #1e3a5f",
                            }}
                          >
                            {group.replace("GROUP_", "Gruppe ")}
                          </div>
                          {gMatches.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => {
                                setSelectedMatch(m);
                                setPick("");
                                setScore("");
                                setResult(null);
                              }}
                              style={{
                                display: "block",
                                width: "100%",
                                padding: "8px 8px",
                                marginTop: 4,
                                background:
                                  selectedMatch?.id === m.id
                                    ? "#1e3a5f"
                                    : "transparent",
                                border:
                                  selectedMatch?.id === m.id
                                    ? "1px solid #3b82f6"
                                    : "1px solid transparent",
                                borderRadius: 8,
                                color: "#fff",
                                cursor: "pointer",
                                textAlign: "left",
                                fontSize: 13,
                                transition: "all 0.15s",
                              }}
                            >
                              <div style={{ fontWeight: 600, lineHeight: 1.4 }}>
                                {m.homeTeam.code ?? m.homeTeam.name}
                                <span style={{ color: "#555", margin: "0 4px" }}>
                                  vs
                                </span>
                                {m.awayTeam.code ?? m.awayTeam.name}
                              </div>
                              <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                                {fmtDate(m.kickoff)}
                              </div>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* KO rounds: flat list as cards */}
                  {sg.matches && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {sg.matches.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => {
                            setSelectedMatch(m);
                            setPick("");
                            setScore("");
                            setResult(null);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "100%",
                            padding: "10px 14px",
                            background:
                              selectedMatch?.id === m.id
                                ? `${colors.text}18`
                                : "#0d0d0d",
                            border:
                              selectedMatch?.id === m.id
                                ? `1px solid ${colors.text}66`
                                : "1px solid #222",
                            borderRadius: 10,
                            color: "#fff",
                            cursor: "pointer",
                            textAlign: "left",
                            fontSize: 14,
                            transition: "all 0.15s",
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>
                            {m.homeTeam.name}
                            <span style={{ color: "#555", margin: "0 6px" }}>
                              vs
                            </span>
                            {m.awayTeam.name}
                          </span>
                          <span style={{ fontSize: 12, color: "#666" }}>
                            {fmtDate(m.kickoff)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tendenz */}
      {selectedMatch && (
        <div style={{ marginBottom: 16 }}>
          <label style={s.label}>Tendenz</label>
          <div style={{ display: "flex", gap: 8 }}>
            {PICKS.map((p) => (
              <button
                key={p}
                style={s.pickBtn(pick === p)}
                onClick={() => {
                  setPick(p);
                  setScore("");
                }}
              >
                {p === "1"
                  ? selectedMatch.homeTeam.code ?? "1"
                  : p === "2"
                    ? selectedMatch.awayTeam.code ?? "2"
                    : "X"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Score */}
      {pick && (
        <div style={{ marginBottom: 16 }}>
          <label style={s.label}>Ergebnis-Tipp</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SCORE_SUGGESTIONS[pick].map((sc) => (
              <button
                key={sc}
                style={s.scoreBtn(score === sc)}
                onClick={() => setScore(sc)}
              >
                {sc}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <input
              style={{ ...s.input, width: 100 }}
              placeholder="oder: 4:2"
              value={score}
              onChange={(e) => setScore(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Submit */}
      {selectedMatch && pick && score && (
        <button style={s.submit} onClick={submit} disabled={submitting}>
          {submitting ? "Wird gespeichert..." : "Tipp abgeben"}
        </button>
      )}

      {/* Result */}
      {result && (
        <p
          style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 14,
            background: result.ok ? "#052e16" : "#3b0712",
            color: result.ok ? "#4ade80" : "#f87171",
            border: result.ok ? "1px solid #166534" : "1px solid #991b1b",
          }}
        >
          {result.msg}
        </p>
      )}
    </div>
  );
}
