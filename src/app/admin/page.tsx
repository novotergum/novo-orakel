"use client";

import { useState, useEffect, useCallback } from "react";

interface AdminUser {
  userId: string;
  userName: string;
  email?: string;
  location: string;
  registeredAt: string;
  lastActiveAt?: string | null;
  tips: number;
  points: number;
  jokersUsed: number;
  excluded: boolean;
  personio?: {
    category: "MA" | "MA? (Mismatch)" | "Standort-Postfach" | "Schwester-Marke (UT)" | "Schwester-Marke (Vita)" | "Extern";
    method: string;
    empId: string | null;
    empName: string | null;
    office: string | null;
    status: "" | "aktiv" | "aktiv (gek.)" | "ehemalig";
  } | null;
}

interface PersonioDup {
  empName: string;
  office: string | null;
  status: string;
  via: string;
  sharedMatches: number;
  members: { userId: string; userName: string; email?: string; excluded: boolean }[];
}

interface AnMember { userId: string; userName: string; excluded: boolean }
interface Anomalies {
  counts: { humans: number; matchesWithKickoff: number; fieldExactPct: number };
  duplicates: {
    sameLocalPart: { localPart: string; members: AnMember[]; sharedIp: boolean; sharedMatches: number }[];
    sameName: { name: string; members: AnMember[]; sharedIp: boolean; sharedMatches: number }[];
    tipTwins: { a: string; aName: string; b: string; bName: string; shared: number; agree: number; pct: number; aExcluded: boolean; bExcluded: boolean; sharedIp: boolean }[];
  };
  suspiciousAccuracy: { userId: string; userName: string; resolved: number; exact: number; ratePct: number; chancePct: number; excluded: boolean }[];
  lastMinute: { userId: string; userName: string; lastMinuteTips: number; totalTips: number; share: number; knappsteMinuten: number | null; excluded: boolean }[];
  frequentChanges: { userId: string; userName: string; submits: number; distinctTips: number; changes: number; excluded: boolean }[];
  note: string;
}

const LS_SECRET_KEY = "ut-orakel-admin-secret";

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editJokers, setEditJokers] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [nlEmails, setNlEmails] = useState<string[]>([]);
  const [nlLoading, setNlLoading] = useState(false);
  const [anomalies, setAnomalies] = useState<Anomalies | null>(null);
  const [anLoading, setAnLoading] = useState(false);
  const [personioDups, setPersonioDups] = useState<PersonioDup[]>([]);
  const [personioError, setPersonioError] = useState<string | null>(null);

  const loadUsers = useCallback(async (s: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin?secret=${encodeURIComponent(s)}`);
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users ?? []);
        setPersonioDups(data.personioDuplicates ?? []);
        setPersonioError(data.personioError ?? null);
        setAuthenticated(true);
        localStorage.setItem(LS_SECRET_KEY, s);
        // Newsletter-Abonnenten + Auffälligkeiten laden
        loadNewsletter(s);
        loadAnomalies(s);
      } else {
        setError(data.error ?? "Fehler");
        setAuthenticated(false);
      }
    } catch {
      setError("Netzwerkfehler");
    }
    setLoading(false);
  }, []);

  const loadNewsletter = useCallback(async (s: string) => {
    setNlLoading(true);
    try {
      const res = await fetch(`/api/newsletter?secret=${encodeURIComponent(s)}`);
      const data = await res.json();
      if (res.ok) {
        setNlEmails(data.emails ?? []);
      }
    } catch {
      // ignore
    }
    setNlLoading(false);
  }, []);

  const loadAnomalies = useCallback(async (s: string) => {
    setAnLoading(true);
    try {
      const res = await fetch(`/api/admin/anomalies?secret=${encodeURIComponent(s)}`);
      const data = await res.json();
      if (res.ok) setAnomalies(data as Anomalies);
    } catch {
      // ignore
    }
    setAnLoading(false);
  }, []);

  // Auto-login from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(LS_SECRET_KEY);
    if (saved) {
      setSecret(saved);
      loadUsers(saved);
    }
  }, [loadUsers]);

  async function updateUser(userId: string) {
    setActionMsg("");
    try {
      const res = await fetch(`/api/admin?secret=${encodeURIComponent(secret)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          userName: editName,
          location: editLocation,
          jokersUsed: editJokers === "" ? undefined : Number(editJokers),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setActionMsg(`${editName} aktualisiert`);
        setEditingId(null);
        loadUsers(secret);
      } else {
        setActionMsg(data.error ?? "Fehler");
      }
    } catch {
      setActionMsg("Netzwerkfehler");
    }
  }

  async function deleteUser(userId: string, userName: string) {
    if (!confirm(`"${userName}" wirklich loeschen? Alle Tipps gehen verloren.`)) return;
    setActionMsg("");
    try {
      const res = await fetch(`/api/admin?secret=${encodeURIComponent(secret)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, deleteTips: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setActionMsg(`${userName} geloescht (${data.tipsDeleted} Tipps entfernt)`);
        loadUsers(secret);
      } else {
        setActionMsg(data.error ?? "Fehler");
      }
    } catch {
      setActionMsg("Netzwerkfehler");
    }
  }

  async function toggleExcluded(userId: string, userName: string, excluded: boolean) {
    const verb = excluded ? "aus der Wertung nehmen" : "wieder in die Wertung aufnehmen";
    if (!confirm(`"${userName}" ${verb}? Die Tipps bleiben erhalten.`)) return;
    setActionMsg("");
    try {
      const res = await fetch(`/api/admin?secret=${encodeURIComponent(secret)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggleExcluded", userId, excluded }),
      });
      const data = await res.json();
      if (data.ok) {
        setActionMsg(
          excluded
            ? `${userName} aus der Wertung genommen`
            : `${userName} wieder in der Wertung`,
        );
        setUsers((prev) =>
          prev.map((u) => (u.userId === userId ? { ...u, excluded } : u)),
        );
      } else {
        setActionMsg(data.error ?? "Fehler");
      }
    } catch {
      setActionMsg("Netzwerkfehler");
    }
  }

  async function flushLeaderboard() {
    if (!confirm("Alle Tipps und Punkte loeschen? Das Leaderboard wird komplett zurueckgesetzt.")) return;
    setActionMsg("");
    try {
      const res = await fetch(`/api/admin?secret=${encodeURIComponent(secret)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "flushLeaderboard" }),
      });
      const data = await res.json();
      setActionMsg(data.ok ? "Leaderboard geflusht" : (data.error ?? "Fehler"));
      if (data.ok) loadUsers(secret);
    } catch { setActionMsg("Netzwerkfehler"); }
  }

  async function flushAll() {
    if (!confirm("ALLES loeschen? Alle User, Tipps, Punkte, Joker werden unwiderruflich entfernt.")) return;
    if (!confirm("Bist du wirklich sicher?")) return;
    setActionMsg("");
    try {
      const res = await fetch(`/api/admin?secret=${encodeURIComponent(secret)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "flushAll" }),
      });
      const data = await res.json();
      setActionMsg(data.ok ? data.message : (data.error ?? "Fehler"));
      if (data.ok) loadUsers(secret);
    } catch { setActionMsg("Netzwerkfehler"); }
  }

  function exportPlayers() {
    if (users.length === 0) return;
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Name", "Email", "Standort", "Tipps", "Punkte", "JokerGenutzt", "JokerMax", "Registriert", "ZuletztAktiv"];
    const rows = users.map((u) => [
      esc(u.userName),
      esc(u.email ?? ""),
      esc(u.location),
      u.tips,
      u.points,
      u.jokersUsed,
      10,
      esc(new Date(u.registeredAt).toISOString().slice(0, 10)),
      esc(u.lastActiveAt ? new Date(u.lastActiveAt).toISOString().slice(0, 16).replace("T", " ") : ""),
    ].join(","));
    const csv = "﻿" + [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wm-tippspiel-spieler-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function logout() {
    setAuthenticated(false);
    setSecret("");
    setUsers([]);
    localStorage.removeItem(LS_SECRET_KEY);
  }

  // ---- Styles ----
  const s = {
    page: {
      maxWidth: 800,
      margin: "0 auto",
      padding: "24px 16px",
      fontFamily: "'Inter', -apple-system, sans-serif",
      color: "#3A3A3A",
    } as React.CSSProperties,
    card: {
      background: "#fff",
      border: "1px solid #e0ddd9",
      borderRadius: 12,
      padding: "20px 24px",
      marginBottom: 16,
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    } as React.CSSProperties,
    input: {
      padding: "8px 12px",
      background: "#F7F5F3",
      border: "1px solid #e0ddd9",
      borderRadius: 8,
      fontSize: 14,
      outline: "none",
    } as React.CSSProperties,
    btn: (color: string) => ({
      padding: "6px 14px",
      background: color,
      border: "none",
      borderRadius: 8,
      color: "#fff",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
    }) as React.CSSProperties,
    btnOutline: {
      padding: "6px 14px",
      background: "transparent",
      border: "1px solid #e0ddd9",
      borderRadius: 8,
      color: "#7A7A7A",
      fontSize: 13,
      cursor: "pointer",
    } as React.CSSProperties,
    th: {
      textAlign: "left" as const,
      fontSize: 11,
      color: "#7A7A7A",
      textTransform: "uppercase" as const,
      letterSpacing: "0.06em",
      padding: "8px 10px",
      borderBottom: "2px solid #e0ddd9",
    },
    td: {
      padding: "10px",
      borderBottom: "1px solid #f0ede9",
      fontSize: 14,
    },
  };

  // ---- Styles fuer das Auffälligkeiten-Panel ----
  const anStyles = {
    box: {
      border: "1px solid #f0d9d9",
      background: "#fdf7f7",
      borderRadius: 10,
      padding: "10px 12px",
      marginBottom: 10,
    } as React.CSSProperties,
    tag: (color: string) =>
      ({
        fontSize: 11,
        fontWeight: 700,
        color,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        marginBottom: 6,
      }) as React.CSSProperties,
    row: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontSize: 13,
      padding: "5px 0",
    } as React.CSSProperties,
    exBadge: {
      marginLeft: 8,
      fontSize: 10,
      fontWeight: 700,
      color: "#fff",
      background: "#9e9e9e",
      borderRadius: 4,
      padding: "1px 5px",
      textTransform: "uppercase" as const,
    } as React.CSSProperties,
    ipBadge: {
      display: "inline-block",
      marginLeft: 8,
      fontSize: 10,
      fontWeight: 700,
      color: "#fff",
      background: "#5b3a8e",
      borderRadius: 4,
      padding: "1px 6px",
      textTransform: "none" as const,
      letterSpacing: 0,
    } as React.CSSProperties,
    triage: (warn: boolean) =>
      ({
        display: "block",
        marginTop: 4,
        fontSize: 11,
        fontWeight: 600,
        color: warn ? "#b26a00" : "#2e7d32",
        textTransform: "none",
        letterSpacing: 0,
      }) as React.CSSProperties,
  };

  // Triage-Hinweis: unterscheidet bequemen Account-Wechsel (0 gemeinsame
  // Spiele, kein Wertungsvorteil) von zwei parallel gewerteten Accounts.
  const triageLine = (sharedMatches: number) =>
    sharedMatches === 0 ? (
      <span style={anStyles.triage(false)}>↔︎ nur Account-Wechsel · 0 gemeinsam getippte Spiele</span>
    ) : (
      <span style={anStyles.triage(true)}>⚠ {sharedMatches} Spiele parallel getippt — beide Accounts gewertet</span>
    );

  // ---- Login screen ----
  if (!authenticated) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <h1 style={{ margin: "0 0 16px", fontSize: 22, color: "#F39200" }}>
            Admin Login
          </h1>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              style={{ ...s.input, flex: 1 }}
              type="password"
              placeholder="Admin Secret"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadUsers(secret)}
            />
            <button
              style={s.btn("#F39200")}
              onClick={() => loadUsers(secret)}
              disabled={loading || !secret}
            >
              {loading ? "..." : "Login"}
            </button>
          </div>
          {error && (
            <p style={{ color: "#c62828", fontSize: 13, marginTop: 10 }}>{error}</p>
          )}
        </div>
      </div>
    );
  }

  // ---- Admin dashboard ----
  return (
    <div style={s.page}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: "#F39200" }}>
          UT Orakel Admin
        </h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#7A7A7A" }}>
            {users.length} User
          </span>
          <button style={s.btnOutline} onClick={() => loadUsers(secret)}>
            Aktualisieren
          </button>
          {users.length > 0 && (
            <button style={s.btn("#4293D0")} onClick={exportPlayers}>
              Spieler CSV
            </button>
          )}
          <button style={s.btnOutline} onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      {/* Action message */}
      {actionMsg && (
        <div style={{
          ...s.card,
          background: actionMsg.includes("Fehler") || actionMsg.includes("Netzwerk") ? "#ffebee" : "#e8f5e9",
          color: actionMsg.includes("Fehler") || actionMsg.includes("Netzwerk") ? "#c62828" : "#2e7d32",
          border: "none",
          padding: "10px 16px",
          fontSize: 13,
        }}>
          {actionMsg}
        </div>
      )}

      {/* User table */}
      <div style={{ ...s.card, padding: 0, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={s.th}>Name</th>
              <th style={s.th}>Standort</th>
              <th style={s.th}>Tipps</th>
              <th style={s.th}>Punkte</th>
              <th style={s.th}>Joker</th>
              <th style={s.th}>Registriert</th>
              <th style={s.th}>Zuletzt aktiv</th>
              <th style={s.th}>Wertung</th>
              <th style={s.th}>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.userId} style={u.excluded ? { opacity: 0.5 } : undefined}>
                {editingId === u.userId ? (
                  <>
                    <td style={s.td}>
                      <input
                        style={{ ...s.input, width: "100%" }}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </td>
                    <td style={s.td}>
                      <input
                        style={{ ...s.input, width: "100%" }}
                        value={editLocation}
                        onChange={(e) => setEditLocation(e.target.value)}
                      />
                    </td>
                    <td style={s.td}>{u.tips}</td>
                    <td style={s.td}>{u.points}</td>
                    <td style={s.td}>
                      <input
                        style={{ ...s.input, width: 60 }}
                        type="number"
                        min={0}
                        max={10}
                        value={editJokers}
                        onChange={(e) => setEditJokers(e.target.value)}
                      />
                      <span style={{ color: "#7A7A7A" }}> /10</span>
                    </td>
                    <td style={s.td}>{new Date(u.registeredAt).toLocaleDateString("de-DE")}</td>
                    <td style={s.td}>{u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                    <td style={s.td}>{u.excluded ? "raus" : "gewertet"}</td>
                    <td style={s.td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={s.btn("#4293D0")} onClick={() => updateUser(u.userId)}>
                          Speichern
                        </button>
                        <button style={s.btnOutline} onClick={() => setEditingId(null)}>
                          Abbrechen
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ ...s.td, fontWeight: 600 }}>
                      {u.userName}
                      {u.email && (
                        <div style={{ fontSize: 12, fontWeight: 400, color: "#7A7A7A" }}>
                          {u.email}
                        </div>
                      )}
                    </td>
                    <td style={s.td}>{u.location}</td>
                    <td style={s.td}>{u.tips}</td>
                    <td style={s.td}>{u.points}</td>
                    <td style={s.td}>{u.jokersUsed}/10</td>
                    <td style={{ ...s.td, fontSize: 12, color: "#7A7A7A" }}>
                      {new Date(u.registeredAt).toLocaleDateString("de-DE")}
                    </td>
                    <td style={{ ...s.td, fontSize: 12, color: "#7A7A7A" }}>
                      {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                    <td style={s.td}>
                      <button
                        style={u.excluded ? s.btn("#2e7d32") : s.btnOutline}
                        title={u.excluded
                          ? "Spieler ist aus der Wertung — Tipps bleiben erhalten"
                          : "Spieler aus der Wertung nehmen (Tipps bleiben erhalten)"}
                        onClick={() => toggleExcluded(u.userId, u.userName, !u.excluded)}
                      >
                        {u.excluded ? "Reaktivieren" : "Aus Wertung"}
                      </button>
                    </td>
                    <td style={s.td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          style={s.btn("#4293D0")}
                          onClick={() => {
                            setEditingId(u.userId);
                            setEditName(u.userName);
                            setEditLocation(u.location);
                            setEditJokers(String(u.jokersUsed));
                            setActionMsg("");
                          }}
                        >
                          Bearbeiten
                        </button>
                        <button
                          style={s.btn("#c62828")}
                          onClick={() => deleteUser(u.userId, u.userName)}
                        >
                          Loeschen
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Auffälligkeiten & Personio */}
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 15, color: "#c62828" }}>
            🔍 Auffälligkeiten &amp; Personio
          </h3>
          <button style={s.btnOutline} onClick={() => { loadUsers(secret); loadAnomalies(secret); }}>
            {anLoading || loading ? "..." : "Aktualisieren"}
          </button>
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#7A7A7A" }}>
          Personio-Abgleich + Indizien aus den Tipp-Daten – kein Automatismus, Bewertung bleibt bei dir. Buttons nehmen den Account aus der Wertung (Tipps bleiben).
        </p>

        {/* ── Personio-Abgleich ── */}
        {personioError && (
          <p style={{ fontSize: 13, color: "#c62828", margin: "0 0 16px" }}>Personio-Abgleich nicht verfügbar: {personioError}</p>
        )}
        {!personioError && (() => {
          const exNow = (id: string) => users.find((u) => u.userId === id)?.excluded ?? false;
          const former = users.filter((u) => u.personio?.status === "ehemalig" || u.personio?.status === "aktiv (gek.)");
          const nonMa = users.filter((u) => u.personio && u.personio.category !== "MA");
          const ExBtn = ({ id, name }: { id: string; name: string }) => (
            <button
              style={exNow(id) ? s.btn("#2e7d32") : s.btnOutline}
              onClick={() => toggleExcluded(id, name, !exNow(id))}
            >
              {exNow(id) ? "Reaktivieren" : "Aus Wertung"}
            </button>
          );
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 18 }}>
              {/* Doppel-Accounts: gleiche Person laut Personio */}
              <div>
                <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#3A3A3A" }}>
                  👥 Doppel-Accounts (gleiche Person laut Personio)
                </h4>
                {personioDups.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#2e7d32", margin: 0 }}>Keine.</p>
                ) : (
                  personioDups.map((d, i) => (
                    <div key={`pd-${i}`} style={anStyles.box}>
                      <div style={anStyles.tag("#5b3a8e")}>
                        {d.empName}{d.office ? ` · ${d.office}` : ""}{d.status && d.status !== "aktiv" ? ` · ${d.status}` : ""}
                        <span style={{ marginLeft: 8, color: "#999", fontWeight: 400, textTransform: "none" }}>({d.via})</span>
                        {triageLine(d.sharedMatches)}
                      </div>
                      {d.members.map((m) => (
                        <div key={m.userId} style={anStyles.row}>
                          <span style={{ flex: 1 }}>
                            <b>{m.userName}</b> <span style={{ color: "#999" }}>· {m.email || m.userId}</span>
                            {exNow(m.userId) && <span style={anStyles.exBadge}>raus</span>}
                          </span>
                          <ExBtn id={m.userId} name={m.userName} />
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>

              {/* Ehemalige / Kündigung läuft */}
              <div>
                <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#3A3A3A" }}>
                  🔴 Ehemalige MA / Kündigung läuft
                </h4>
                {former.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#2e7d32", margin: 0 }}>Keine.</p>
                ) : (
                  former.map((u) => (
                    <div key={`fm-${u.userId}`} style={anStyles.row}>
                      <span style={{ flex: 1 }}>
                        <b>{u.userName}</b> <span style={{ color: "#999" }}>· {u.userId}</span>
                        <span style={{ marginLeft: 8, color: u.personio?.status === "ehemalig" ? "#c62828" : "#b26a00", fontWeight: 700, fontSize: 12 }}>
                          {u.personio?.status === "ehemalig" ? "ehemalig" : "Kündigung läuft"}
                        </span>
                        {u.personio?.empName && <span style={{ color: "#999", fontSize: 12 }}> · {u.personio.empName}</span>}
                        {exNow(u.userId) && <span style={anStyles.exBadge}>raus</span>}
                      </span>
                      <span style={{ color: "#999", fontSize: 12, marginRight: 10 }}>{u.tips} Tipps</span>
                      <ExBtn id={u.userId} name={u.userName} />
                    </div>
                  ))
                )}
              </div>

              {/* Kein MA-Match */}
              <div>
                <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#3A3A3A" }}>
                  ⚪ Kein MA-Match (extern / Standort-Postfach / Schwester-Marke)
                </h4>
                {nonMa.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0 }}>Keine.</p>
                ) : (
                  nonMa.map((u) => (
                    <div key={`nm-${u.userId}`} style={anStyles.row}>
                      <span style={{ flex: 1 }}>
                        <b>{u.userName}</b> <span style={{ color: "#999" }}>· {u.userId}</span>
                        <span style={{ marginLeft: 8, color: "#7A7A7A", fontSize: 12 }}>{u.personio?.category}</span>
                        {exNow(u.userId) && <span style={anStyles.exBadge}>raus</span>}
                      </span>
                      <span style={{ color: "#999", fontSize: 12, marginRight: 10 }}>{u.tips} Tipps</span>
                      <ExBtn id={u.userId} name={u.userName} />
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })()}

        {!anomalies ? (
          <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0 }}>{anLoading ? "Lädt…" : "—"}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Weitere Doppel-Signale (Tipps / Name) — E-Mail-Basis steckt schon
                in den Personio-Doppel-Accounts oben, daher hier ausgelassen. */}
            <div>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#3A3A3A" }}>
                Weitere Doppel-Signale (gleiche Tipps / gleicher Name)
              </h4>

              {anomalies.duplicates.tipTwins.length === 0 &&
               anomalies.duplicates.sameName.length === 0 && (
                <p style={{ fontSize: 13, color: "#2e7d32", margin: 0 }}>Keine.</p>
              )}

              {anomalies.duplicates.tipTwins.map((t) => (
                <div key={`tw-${t.a}-${t.b}`} style={anStyles.box}>
                  <div style={anStyles.tag("#c62828")}>
                    Tipp-Zwillinge · {t.pct}% gleiche Ergebnisse ({t.agree}/{t.shared})
                    {t.sharedIp && <span style={anStyles.ipBadge}>🔗 gleiche IP</span>}
                  </div>
                  {[{ id: t.a, name: t.aName, ex: t.aExcluded }, { id: t.b, name: t.bName, ex: t.bExcluded }].map((m) => (
                    <div key={m.id} style={anStyles.row}>
                      <span style={{ flex: 1 }}>
                        <b>{m.name}</b> <span style={{ color: "#999" }}>· {m.id}</span>
                        {m.ex && <span style={anStyles.exBadge}>raus</span>}
                      </span>
                      <button
                        style={m.ex ? s.btn("#2e7d32") : s.btnOutline}
                        onClick={() => toggleExcluded(m.id, m.name, !m.ex).then(() => loadAnomalies(secret))}
                      >
                        {m.ex ? "Reaktivieren" : "Aus Wertung"}
                      </button>
                    </div>
                  ))}
                </div>
              ))}

              {anomalies.duplicates.sameName.map((c, idx) => (
                <div key={`nm-${idx}`} style={anStyles.box}>
                  <div style={anStyles.tag("#9e9e9e")}>
                    Gleicher Anzeigename (schwaches Signal)
                    {c.sharedIp && <span style={anStyles.ipBadge}>🔗 gleiche IP</span>}
                    {triageLine(c.sharedMatches)}
                  </div>
                  {c.members.map((m) => (
                    <div key={m.userId} style={anStyles.row}>
                      <span style={{ flex: 1 }}>
                        <b>{m.userName}</b> <span style={{ color: "#999" }}>· {m.userId}</span>
                        {m.excluded && <span style={anStyles.exBadge}>raus</span>}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Verdächtig hohe Trefferquote */}
            <div>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#3A3A3A" }}>
                Verdächtig hohe Exakt-Quote{" "}
                <span style={{ color: "#999", fontWeight: 400 }}>
                  (Feld-Schnitt {anomalies.counts.fieldExactPct}% · statistisch unwahrscheinlich, ab 8 Spielen)
                </span>
              </h4>
              {anomalies.suspiciousAccuracy.length === 0 ? (
                <p style={{ fontSize: 13, color: "#2e7d32", margin: 0 }}>Keine (oder noch zu wenige Spiele gewertet).</p>
              ) : (
                anomalies.suspiciousAccuracy.map((u) => (
                  <div key={u.userId} style={anStyles.row}>
                    <span style={{ flex: 1 }}>
                      <b>{u.userName}</b>
                      {u.excluded && <span style={anStyles.exBadge}>raus</span>}
                    </span>
                    <span style={{ color: "#c62828", fontWeight: 700, marginRight: 10 }}>
                      {u.ratePct}% exakt
                    </span>
                    <span style={{ color: "#999", fontSize: 12 }}>
                      {u.exact}/{u.resolved} · nur {u.chancePct}% Zufall
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Last-Minute */}
            <div>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#3A3A3A" }}>
                Last-Minute-Tipper <span style={{ color: "#999", fontWeight: 400 }}>(≤ 5 Min vor Anpfiff, ab 2 Tipps)</span>
              </h4>
              {anomalies.lastMinute.length === 0 ? (
                <p style={{ fontSize: 13, color: "#2e7d32", margin: 0 }}>Keine.</p>
              ) : (
                anomalies.lastMinute.map((u) => (
                  <div key={u.userId} style={anStyles.row}>
                    <span style={{ flex: 1 }}>
                      <b>{u.userName}</b>
                      {u.excluded && <span style={anStyles.exBadge}>raus</span>}
                    </span>
                    <span style={{ color: "#c62828", fontWeight: 700, marginRight: 10 }}>
                      {u.lastMinuteTips}× last-minute
                    </span>
                    <span style={{ color: "#999", fontSize: 12 }}>
                      {u.share}% · knappste {u.knappsteMinuten} Min
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Häufige Änderungen */}
            <div>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#3A3A3A" }}>
                Häufige Tipp-Änderungen
              </h4>
              {anomalies.frequentChanges.length === 0 ? (
                <p style={{ fontSize: 13, color: "#7A7A7A", margin: 0 }}>Keine (oder noch keine Daten).</p>
              ) : (
                anomalies.frequentChanges.map((u) => (
                  <div key={u.userId} style={anStyles.row}>
                    <span style={{ flex: 1 }}>
                      <b>{u.userName}</b>
                      {u.excluded && <span style={anStyles.exBadge}>raus</span>}
                    </span>
                    <span style={{ color: "#c62828", fontWeight: 700, marginRight: 10 }}>
                      {u.changes} Änderungen
                    </span>
                    <span style={{ color: "#999", fontSize: 12 }}>
                      {u.submits} Abgaben / {u.distinctTips} Spiele
                    </span>
                  </div>
                ))
              )}
              <p style={{ margin: "8px 0 0", fontSize: 11, color: "#bbb" }}>{anomalies.note}</p>
            </div>
          </div>
        )}
      </div>

      {/* Newsletter-Abonnenten */}
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, color: "#F39200" }}>
            Newsletter-Abonnenten ({nlEmails.length})
          </h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={s.btnOutline} onClick={() => loadNewsletter(secret)}>
              {nlLoading ? "..." : "Aktualisieren"}
            </button>
            {nlEmails.length > 0 && (
              <button
                style={s.btn("#4293D0")}
                onClick={() => {
                  const csv = nlEmails.join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `newsletter-abonnenten-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                CSV Export
              </button>
            )}
          </div>
        </div>
        {nlEmails.length === 0 ? (
          <p style={{ color: "#7A7A7A", fontSize: 13, margin: 0 }}>Noch keine Abonnenten.</p>
        ) : (
          <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 13 }}>
            {nlEmails.map((email) => (
              <div
                key={email}
                style={{
                  padding: "6px 0",
                  borderBottom: "1px solid #f0ede9",
                  color: "#3A3A3A",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{email}</span>
                <button
                  style={{ background: "none", border: "none", color: "#c62828", cursor: "pointer", fontSize: 12, padding: "2px 6px" }}
                  onClick={async () => {
                    if (!confirm(`"${email}" abmelden?`)) return;
                    try {
                      await fetch(`/api/newsletter?secret=${encodeURIComponent(secret)}`, {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email }),
                      });
                      setNlEmails((prev) => prev.filter((e) => e !== email));
                    } catch { /* ignore */ }
                  }}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div style={{ ...s.card, borderColor: "#ef9a9a" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#c62828" }}>Danger Zone</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={s.btn("#E5172D")} onClick={flushLeaderboard}>
            Leaderboard flushen
          </button>
          <button style={s.btn("#7A7A7A")} onClick={flushAll}>
            Alles loeschen (User + Tipps)
          </button>
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "#7A7A7A" }}>
          Leaderboard flushen entfernt alle Tipps und Punkte. User bleiben erhalten.
        </p>
      </div>
    </div>
  );
}
