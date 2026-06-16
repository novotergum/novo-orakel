// Vorausgefuellte Einladungs-Mail fuers Tippspiel. Empfaenger traegt der Nutzer
// selbst ein; from= kommt best-effort aus dem Login (mailto kann das From-Feld
// nicht erzwingen). Keine Gruss-Signatur im Body — die haengt der Mail-Client an.
// Geteilt vom Hero-CTA und der Standort-Wertung, damit beide denselben Link bauen.

export const APP_URL = "https://wm-tippspiel.vercel.app";

const INVITE_SUBJECT = "Mach mit beim United Therapy WM-Tippspiel! 🏆";

export function buildInviteMailto(senderEmail?: string): string {
  const body = [
    "Hi,",
    "",
    "wir tippen die Spiele der WM 2026 — durch ganz United Therapy, Standort gegen Standort.",
    "Dein Zentrum ist noch nicht in der Standort-Wertung? Dann hol es rein!",
    "",
    "Einfach mit deiner Firmen-Mailadresse anmelden:",
    APP_URL,
    "",
    "Dauert 2 Minuten — viel Erfolg beim Tippen!",
  ].join("\n");
  const params = [
    `subject=${encodeURIComponent(INVITE_SUBJECT)}`,
    `body=${encodeURIComponent(body)}`,
    ...(senderEmail ? [`from=${encodeURIComponent(senderEmail)}`] : []),
  ];
  return `mailto:?${params.join("&")}`;
}
