# Magic-Link Auth — Setup

## Required env vars (Vercel Project Settings → Environment Variables)

| Name | Value | Notes |
|---|---|---|
| `AUTH_SECRET` | random base64 (≥32 bytes) | JWT signing key. Keep secret; rotation invalidates all sessions. Generate via `openssl rand -base64 48`. |
| `SMTP_USER` | `ticketsystem@novotergum.de` | Sender mailbox. Microsoft 365 already validates this domain — no DNS setup needed. |
| `SMTP_PASS` | App-Password from M365 | **Not the mailbox login password.** Generate via [aka.ms/CreateAppPassword](https://account.microsoft.com/security) → "App-Kennwörter". Revocable any time. |
| `MAGIC_LINK_FROM` | e.g. `UT-Orakel <ticketsystem@novotergum.de>` | Display name + sender. Address must match `SMTP_USER` (M365 rejects mismatched From). |
| `ALLOWED_EMAIL_DOMAINS` | e.g. `novotergum.de,united-therapy.de` | Comma-separated. Only mails on these domains may register. Empty = nobody can sign in (fail-closed). |
| `NEXT_PUBLIC_APP_URL` | `https://wm-tippspiel.vercel.app` | Used to build magic-link URLs. Optional — falls back to request host. |

Existing `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` stay as-is.
Legacy `INVITE_CODE` can be removed.

Optional SMTP overrides (rarely needed):
- `SMTP_HOST` (default `smtp.office365.com`)
- `SMTP_PORT` (default `587`, STARTTLS)

## App-Password generieren (einmalig)

1. Mit `ticketsystem@novotergum.de` auf https://account.microsoft.com/security einloggen
2. "Erweiterte Sicherheitsoptionen" → "App-Kennwörter" → "Neues App-Kennwort erstellen"
3. Bezeichnung: "WM-Tippspiel SMTP"
4. 16-Zeichen-Code direkt in Vercel als `SMTP_PASS` setzen (nicht in Code/Chat speichern)

Falls "App-Kennwörter" nicht sichtbar sind: Tenant-Admin muss MFA + App-Passwords erlauben, oder SMTP AUTH für dieses Postfach freischalten (Defaults to disabled in newer M365 tenants).

## Flow

1. User öffnet App → kein Session-Cookie → `<LoginScreen>` mit Email-Form
2. User gibt Email ein → POST `/api/auth/request-link`
   - Validiert gegen `ALLOWED_EMAIL_DOMAINS`
   - Rate-Limit: max 5/IP/15 min, max 3/Email/Stunde
   - Schickt Mail via O365 SMTP mit Link → `/api/auth/verify?token=…`
3. User klickt Link → JWT verifiziert → Session-Cookie gesetzt (30d, HttpOnly, sameSite=lax)
4. Kein Profil yet → redirect `/onboarding` → Form für Name + Standort + Einsatz
5. Nach Onboarding → redirect `/` → normale App

## Security model

- **Identity = email** (verified by mailbox ownership)
- **No client-supplied userId trusted**. All write endpoints (`submit-tip`, `orakel-joker`, `auth/onboarding`) leiten `userId` aus der Session ab
- **Rate limits** in Redis: `rl:ip:{ip}` (15 min, 5 max), `rl:email:{email}` (1 h, 3 max)
- **Magic-link tokens**: signed JWT, 15 min TTL, one-time use (dedupe via `magic:used:{token-tail}` Redis key, 30 min TTL)
- **Session cookie**: signed JWT, 30 d TTL, HttpOnly, secure in production
- **Domain whitelist** ist fail-closed: empty `ALLOWED_EMAIL_DOMAINS` blockt alles
- **SMTP**: STARTTLS auf Port 587, App-Password statt Login-Passwort (revocable, MFA-safe)

## Test lokal

`.env.local`:
```
AUTH_SECRET=<openssl rand -base64 48>
SMTP_USER=ticketsystem@novotergum.de
SMTP_PASS=<app-password>
MAGIC_LINK_FROM=UT-Orakel <ticketsystem@novotergum.de>
ALLOWED_EMAIL_DOMAINS=novotergum.de,united-therapy.de
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Dann `npm run dev` und `http://localhost:3000` aufrufen.

## Removed/Deprecated

- `POST /api/users` → 410 Gone. Registrierung läuft jetzt über Magic-Link
- `INVITE_CODE` env var nicht mehr gelesen
- `localStorage`-Identity in TipForm überschrieben durch server-side Profil-Prop
- `resend` npm dependency entfernt
