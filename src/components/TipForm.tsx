"use client";

import { useState, useEffect } from "react";

interface Match {
  id: number;
  kickoff: string;
  status: string;
  homeTeam: { id: number; name: string; code: string | null };
  awayTeam: { id: number; name: string; code: string | null };
}

const PICKS = ["1", "X", "2"] as const;

const SCORE_SUGGESTIONS: Record<string, string[]> = {
  "1": ["1:0", "2:0", "2:1", "3:1"],
  X: ["0:0", "1:1", "2:2"],
  "2": ["0:1", "0:2", "1:2", "1:3"],
};

export default function TipForm() {
  const [name, setName] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [pick, setPick] = useState<"1" | "X" | "2" | "">("");
  const [score, setScore] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/matches")
      .then((r) => r.json())
      .then((d) => {
        setMatches(d.matches ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function submit() {
    if (!name.trim() || !selectedMatch || !pick || !score) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/submit-tip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: selectedMatch.id,
          userId: name.trim().toLowerCase().replace(/\s+/g, "-"),
          userName: name.trim(),
          winnerPick: pick,
          scoreTip: score,
          source: "human",
          style: "balanced",
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
  };

  return (
    <div style={s.section}>
      <h2 style={{ margin: "0 0 20px", fontSize: 20, color: "#fff" }}>
        Jetzt mitspielen
      </h2>

      {/* Name */}
      <div style={{ marginBottom: 16 }}>
        <label style={s.label}>Dein Name</label>
        <input
          style={s.input}
          placeholder="z.B. Sebastian"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {/* Match selection */}
      <div style={{ marginBottom: 16 }}>
        <label style={s.label}>Spiel ausw&auml;hlen</label>
        {loading ? (
          <p style={{ color: "#666", fontSize: 14 }}>Lade Spiele...</p>
        ) : matches.length === 0 ? (
          <p style={{ color: "#666", fontSize: 14 }}>
            Keine anstehenden Spiele gefunden.
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
      {name && selectedMatch && pick && score && (
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
