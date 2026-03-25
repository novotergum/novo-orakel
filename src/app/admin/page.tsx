"use client";

import { useState, useEffect, useCallback } from "react";

interface AdminUser {
  userId: string;
  userName: string;
  location: string;
  registeredAt: string;
  tips: number;
  points: number;
  jokersUsed: number;
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
  const [actionMsg, setActionMsg] = useState("");

  const loadUsers = useCallback(async (s: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin?secret=${encodeURIComponent(s)}`);
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users ?? []);
        setAuthenticated(true);
        localStorage.setItem(LS_SECRET_KEY, s);
      } else {
        setError(data.error ?? "Fehler");
        setAuthenticated(false);
      }
    } catch {
      setError("Netzwerkfehler");
    }
    setLoading(false);
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
        body: JSON.stringify({ userId, userName: editName, location: editLocation }),
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
          <span style={{ fontSize: 12, color: "#7A7A7A" }}>{users.length} User</span>
          <button style={s.btnOutline} onClick={() => loadUsers(secret)}>
            Aktualisieren
          </button>
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
              <th style={s.th}>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.userId}>
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
                    <td style={s.td}>{u.jokersUsed}/10</td>
                    <td style={s.td}>{new Date(u.registeredAt).toLocaleDateString("de-DE")}</td>
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
                    <td style={{ ...s.td, fontWeight: 600 }}>{u.userName}</td>
                    <td style={s.td}>{u.location}</td>
                    <td style={s.td}>{u.tips}</td>
                    <td style={s.td}>{u.points}</td>
                    <td style={s.td}>{u.jokersUsed}/10</td>
                    <td style={{ ...s.td, fontSize: 12, color: "#7A7A7A" }}>
                      {new Date(u.registeredAt).toLocaleDateString("de-DE")}
                    </td>
                    <td style={s.td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          style={s.btn("#4293D0")}
                          onClick={() => {
                            setEditingId(u.userId);
                            setEditName(u.userName);
                            setEditLocation(u.location);
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
