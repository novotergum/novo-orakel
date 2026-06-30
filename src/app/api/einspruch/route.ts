import { NextResponse } from "next/server";
import { getSession, userIdFromEmail } from "../../../lib/auth";
import { readCard, setCardAppeal } from "../../../lib/store";

// Einspruch des Spielers gegen seine Karte. Session-authentifiziert: der
// eingeloggte Nutzer kann NUR gegen die eigene Karte Einspruch einlegen.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });
  }

  let text = "";
  try {
    const body = await req.json();
    text = String(body?.text ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }
  if (text.length < 3) {
    return NextResponse.json({ error: "Bitte kurz begründen." }, { status: 400 });
  }
  if (text.length > 1000) text = text.slice(0, 1000);

  const userId = userIdFromEmail(session.email);
  const card = await readCard(userId);
  if (!card) {
    return NextResponse.json({ error: "Keine Karte vorhanden." }, { status: 404 });
  }
  if (card.status === "bestätigt" || card.status === "zurückgenommen") {
    return NextResponse.json({ error: "Diese Karte ist bereits entschieden." }, { status: 409 });
  }

  const updated = await setCardAppeal(userId, text);
  return NextResponse.json({ ok: true, card: updated });
}
