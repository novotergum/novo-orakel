"use client";

import { useEffect, useState } from "react";
import { SURVEY_OPTIONS } from "@/lib/survey";

const card: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 16,
  padding: "24px 28px",
  border: "1px solid rgba(0,0,0,0.06)",
  boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
};

export default function FeatureSurvey() {
  const [mine, setMine] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [voters, setVoters] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  // Ergebnisse zeigen, sobald man abgestimmt hat (kein Beeinflussen vorher)
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    fetch("/api/survey")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setCounts(d.counts ?? {});
        setVoters(d.voters ?? 0);
        setMine(Array.isArray(d.mine) ? d.mine : []);
        if (Array.isArray(d.mine) && d.mine.length > 0) setShowResults(true);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  function toggle(id: string) {
    setMine((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function save() {
    setSaving(true);
    try {
      const r = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected: mine }),
      });
      const d = await r.json();
      if (r.ok) {
        setCounts(d.counts ?? {});
        setVoters(d.voters ?? 0);
        setMine(Array.isArray(d.mine) ? d.mine : []);
        setShowResults(true);
      }
    } catch {
      /* still */
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  const maxCount = Math.max(1, ...SURVEY_OPTIONS.map((o) => counts[o.id] ?? 0));

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ ...card, borderLeft: "4px solid #e8a33d" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>🗳️</span>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "#2a2a2a" }}>
            Welches Feature fehlt dir noch?
          </h2>
        </div>
        <p style={{ fontSize: 13, color: "#777", margin: "6px 0 18px" }}>
          Tipp an, was du dir wünschst — Mehrfachauswahl möglich.
          {voters > 0 && (
            <span> · {voters} {voters === 1 ? "Person hat" : "Personen haben"} abgestimmt</span>
          )}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {SURVEY_OPTIONS.map((o) => {
            const active = mine.includes(o.id);
            const n = counts[o.id] ?? 0;
            const pct = voters > 0 ? Math.round((n / voters) * 100) : 0;
            const barW = showResults ? (n / maxCount) * 100 : 0;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                style={{
                  position: "relative",
                  overflow: "hidden",
                  textAlign: "left",
                  cursor: "pointer",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: active ? "2px solid #e8a33d" : "1px solid #e2e2e2",
                  background: active ? "#fdf6ea" : "#fafafa",
                  font: "inherit",
                }}
              >
                {/* Ergebnis-Balken im Hintergrund */}
                {showResults && (
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: `${barW}%`,
                      background: active ? "rgba(232,163,61,0.20)" : "rgba(0,0,0,0.05)",
                      transition: "width 0.5s ease",
                    }}
                  />
                )}
                <span
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 14,
                    fontWeight: active ? 700 : 500,
                    color: "#2a2a2a",
                  }}
                >
                  <span style={{ fontSize: 18 }}>{o.emoji}</span>
                  <span style={{ flex: 1 }}>{o.label}</span>
                  {showResults && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#9a7220", whiteSpace: "nowrap" }}>
                      {pct}% · {n}
                    </span>
                  )}
                  {active && !showResults && <span style={{ color: "#e8a33d" }}>✓</span>}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16 }}>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              padding: "10px 22px",
              background: "#e8a33d",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              borderRadius: 8,
              border: "none",
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Speichern…" : showResults ? "Auswahl aktualisieren" : "Abstimmen"}
          </button>
          {showResults && (
            <span style={{ fontSize: 12, color: "#999" }}>Gespeichert ✓ — du kannst jederzeit ändern.</span>
          )}
        </div>
      </div>
    </section>
  );
}
