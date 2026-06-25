"use client";

import { useEffect, useState } from "react";

// Einmaliger, neutral gehaltener Info-Hinweis fuers Dashboard. Wird pro Browser
// genau einmal gezeigt und per localStorage quittiert (kein Server noetig).
// Fuer einen neuen Hinweis einfach NOTICE_ID + Text aendern — alte Quittung
// verfaellt dann automatisch, weil der Key neu ist.
const NOTICE_ID = "korrektur-esp-ksa-20260623";

const NOTICE_TEXT =
  "Punktekorrektur (23.06.): Beim Spiel Spanien–Saudi-Arabien hat der Datendienst " +
  "kurzzeitig ein falsches 5:0 gemeldet — offiziell endete das Spiel 4:0. " +
  "Wir haben die Punkte für dieses Spiel auf das richtige Ergebnis umgestellt: " +
  "Wer 4:0 getippt hat, bekommt jetzt die vollen 4 Punkte. " +
  "Ein paar Tipps verschieben sich dadurch leicht. Danke fürs Aufmerksam­machen!";

export default function NoticeBanner() {
  const [show, setShow] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(`notice:${NOTICE_ID}`) !== "seen") setShow(true);
    } catch {
      /* ignore */
    }
  }, []);

  function dismiss() {
    setClosing(true);
    try {
      localStorage.setItem(`notice:${NOTICE_ID}`, "seen");
    } catch {
      /* ignore */
    }
    setTimeout(() => setShow(false), 220);
  }

  if (!show) return null;

  return (
    <div
      style={{
        marginBottom: 24,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "14px 18px",
        borderRadius: 14,
        background: "linear-gradient(90deg, #EAF2FB 0%, #D9E8F8 100%)",
        border: "1px solid #8DB7E0",
        boxShadow: "0 4px 18px rgba(33,89,150,0.15)",
        opacity: closing ? 0 : 1,
        transform: closing ? "translateY(-6px)" : "none",
        transition: "opacity 0.2s, transform 0.2s",
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1.3, flexShrink: 0 }} aria-hidden>
        ℹ️
      </span>
      <span style={{ fontSize: 14.5, fontWeight: 600, color: "#1f4368", flex: 1, lineHeight: 1.4 }}>
        {NOTICE_TEXT}
      </span>
      <button
        onClick={dismiss}
        aria-label="Schließen"
        style={{
          flexShrink: 0,
          background: "rgba(0,0,0,0.06)",
          border: "none",
          borderRadius: 8,
          width: 28,
          height: 28,
          cursor: "pointer",
          color: "#1f4368",
          fontSize: 16,
          lineHeight: 1,
          fontWeight: 700,
        }}
      >
        ×
      </button>
    </div>
  );
}
