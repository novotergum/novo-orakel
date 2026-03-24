"use client";

import { useState, useEffect, useCallback } from "react";

interface Match {
  id: number;
  kickoff: string;
  status: string;
  homeTeam: { id: number; name: string; code: string | null };
  awayTeam: { id: number; name: string; code: string | null };
}

interface UserProfile {
  userId: string;
  userName: string;
  location: string;
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
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {matches.map((m) => (
              <button
                key={m.id}
                style={s.matchBtn(selectedMatch?.id === m.id)}
                onClick={() => {
                  setSelectedMatch(m);
                  setPick("");
                  setScore("");
                  setResult(null);
                }}
              >
                <span style={{ fontWeight: 600 }}>
                  {m.homeTeam.name} vs {m.awayTeam.name}
                </span>
                <br />
                <span style={{ fontSize: 12, color: "#888" }}>
                  {fmtDate(m.kickoff)}
                </span>
              </button>
            ))}
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
