/**
 * Magic-link mail via Make.com webhook → Microsoft 365.
 *
 * The Make scenario "WM-Tippspiel Magic Link" (id 9121917) listens on the
 * webhook URL stored in MAIL_WEBHOOK_URL and forwards the payload to an
 * Outlook OAuth-authenticated SMTP send.
 *
 * Why webhook-relay instead of direct SMTP: NOVOTERGUM's M365 tenant has
 * SMTP AUTH disabled. Make has a working OAuth2 connection for the same
 * mailbox, so we piggy-back on it.
 */

export async function sendMagicLink(email: string, link: string): Promise<void> {
  const webhook = process.env.MAIL_WEBHOOK_URL;
  if (!webhook) throw new Error("MAIL_WEBHOOK_URL not set");

  const subject = "Dein Login-Link fürs WM-Tippspiel";

  // Optionaler Hinweis zum WM-Teams-Kanal (nur wenn konfiguriert)
  const teamsJoinUrl = process.env.TEAMS_JOIN_URL;
  const teamsBlock = teamsJoinUrl
    ? `
      <div style="margin: 28px 0 0 0; padding: 16px; border:1px solid #e2e8f0; border-left:4px solid #5b5fc7; border-radius:8px;">
        <div style="font-weight:600; margin-bottom:4px;">💬 Tritt dem WM-Teams-Kanal bei</div>
        <div style="color:#64748b; font-size:13px; line-height:1.5; margin-bottom:12px;">Updates, Ergebnisse &amp; Austausch zum Tippspiel.</div>
        <a href="${teamsJoinUrl}" style="background:#5b5fc7;color:#fff;text-decoration:none;padding:9px 18px;border-radius:8px;font-weight:600;display:inline-block;font-size:14px;">
          Kanal beitreten
        </a>
      </div>`
    : "";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #0f172a;">
      <h2 style="margin: 0 0 16px 0;">Dein Login-Link</h2>
      <p style="margin: 0 0 16px 0; line-height: 1.55;">
        Klick auf den Button unten, um dich beim <strong>UT-Orakel-Tippspiel</strong> anzumelden.
      </p>
      <p style="margin: 24px 0;">
        <a href="${link}" style="background:#0f172a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block;">
          Jetzt einloggen
        </a>
      </p>
      ${teamsBlock}
      <p style="margin: 16px 0 0 0; color:#64748b; font-size:13px; line-height:1.55;">
        Der Link ist 15 Minuten gültig. Falls der Button nicht geht, kopiere diese URL in den Browser:<br/>
        <span style="word-break: break-all; color: #334155;">${link}</span>
      </p>
      <p style="margin: 32px 0 0 0; color:#94a3b8; font-size:12px;">
        Diese Mail wurde an ${email} geschickt. Wenn du keinen Login angefordert hast, kannst du sie ignorieren.
      </p>
    </div>
  `;

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: email, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Mail webhook ${res.status}: ${body.slice(0, 200)}`);
  }
}
