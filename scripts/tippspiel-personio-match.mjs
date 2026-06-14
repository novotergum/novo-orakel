#!/usr/bin/env node
// Matcht die WM-Tippspiel-Registrierungen gegen die NOVOTERGUM-Personio-
// Mitarbeiterliste. 4 Match-Stufen (E-Mail > voller Name > E-Mail-Localpart >
// Localpart-aus-Name), plus aktiv/ehemalig aus termination_date. Schreibt eine
// CSV nach ~/Downloads. Wiederverwendbar fuer Teilnahme-Statistik (z.B. Quote
// je Standort/Position) — einfach erneut ausfuehren.
//
//   node scripts/tippspiel-personio-match.mjs
//
// Zugaenge: ADMIN_SECRET aus ./.env.local, Personio-Creds aus
// ~/.config/personio/credentials. Personio-Auth-Quirks: form-encoded, Creds
// sind single-quoted, Token rotiert via Response-Header (fuer Pagination).
import { readFileSync, writeFileSync } from "node:fs";

const HOME = process.env.HOME;
const readKey = (file, key) => {
  const m = readFileSync(file, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].replace(/['"]/g, "").trim() : null;
};

// Umlaute ZUERST zu Digraphen expandieren (ä→ae …), DANN restliche Akzente
// strippen. So matchen beide Schreibweisen symmetrisch: registriertes
// "Baerecke" == Personio "Bärecke". NFC vorab, falls Quelle in NFD vorliegt.
const norm = (s) => (s || "").normalize("NFC").toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .normalize("NFD").replace(/[̀-ͯ]/g, "");
const normName = (s) => norm(s).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).sort().join(" ");
const localOf = (email) => (email || "").toLowerCase().split("@")[0];

// --- 1) Registrierungen aus der Prod-Admin-API ---
const ADMIN_SECRET = readKey("./.env.local", "ADMIN_SECRET");
const regsRes = await fetch(`https://wm-tippspiel.vercel.app/api/admin?secret=${ADMIN_SECRET}`);
const regs = (await regsRes.json()).users;

// --- 2) Personio-Mitarbeiter (paginiert, Token rotiert) ---
const authRes = await fetch("https://api.personio.de/v1/auth", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: readKey(`${HOME}/.config/personio/credentials`, "NTG_PERSONIO_CLIENT_ID"),
    client_secret: readKey(`${HOME}/.config/personio/credentials`, "NTG_PERSONIO_CLIENT_SECRET"),
  }),
});
let token = (await authRes.json()).data.token;

const emps = [];
for (let offset = 0; ; offset += 200) {
  const r = await fetch(`https://api.personio.de/v1/company/employees?limit=200&offset=${offset}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const nt = r.headers.get("authorization");
  if (nt) token = nt.replace(/^Bearer\s+/i, "");
  const j = await r.json();
  if (!j.success || !j.data?.length) break;
  for (const e of j.data) {
    const a = e.attributes || {};
    const g = (k) => (a[k] && typeof a[k] === "object" ? a[k].value : a[k]);
    const off = (() => { const o = g("office"); return o?.attributes ? o.attributes.name : o; })();
    const term = g("termination_date");
    const status = term ? (new Date(term) <= new Date() ? "ehemalig" : "aktiv (gek.)") : "aktiv";
    emps.push({
      first: g("first_name"), last: g("last_name"),
      email: (g("email") || "").toLowerCase().trim(),
      office: off, position: g("position"), status,
    });
  }
  if (j.data.length < 200) break;
}

// --- 3) Indizes ---
const byEmail = new Map(emps.filter((e) => e.email).map((e) => [e.email, e]));
const byName = new Map();
const byLocal = new Map();
for (const e of emps) {
  const nk = normName(`${e.first} ${e.last}`);
  (byName.get(nk) ?? byName.set(nk, []).get(nk)).push(e);
  const lk = localOf(e.email);
  if (lk) (byLocal.get(lk) ?? byLocal.set(lk, []).get(lk)).push(e);
}

// --- 4) Match-Stufen ---
const matchTiers = (u) => {
  const email = (u.email || u.userId || "").toLowerCase().trim();
  if (byEmail.has(email)) return { emp: byEmail.get(email), method: "email" };
  const nm = byName.get(normName(u.userName));
  if (nm?.length === 1) return { emp: nm[0], method: "name" };
  // Localpart exakt (anderer Domain, gleicher Handle — z.B. karinjakob@gmx vs @web)
  const lp = byLocal.get(localOf(email));
  if (lp?.length === 1) return { emp: lp[0], method: "localpart" };
  // Localpart -> Nachname + Vorname/Initial (z.B. s.treude, marcus.weber92)
  const toks = localOf(email).split(/[._-]+/).map((t) => norm(t.replace(/\d+$/, ""))).filter(Boolean);
  const cands = emps.filter((e) => {
    const fn = norm(e.first), ln = norm(e.last);
    if (!fn || !ln) return false;
    const lastHit = toks.some((t) => t.length >= 3 && t === ln);
    const firstHit = toks.some((t) => t === fn || (t.length === 1 && t === fn[0]) || (t.length >= 2 && fn.startsWith(t)));
    return lastHit && firstHit;
  });
  const uniq = [...new Map(cands.map((e) => [e.email || e.first + e.last, e])).values()];
  if (uniq.length === 1) return { emp: uniq[0], method: "localpart-name" };
  return { emp: null, method: null };
};

const classify = (u, m) => {
  if (m.method) return "MA";
  const email = (u.email || u.userId || "").toLowerCase();
  const [local, dom = ""] = email.split("@");
  if (dom === "novotergum.de" && !local.includes(".")) return "Standort-Postfach";
  if (dom === "novotergum.de") return "MA? (Mismatch)";
  if (dom.includes("united-therapy") || dom.includes("uth")) return "Schwester-Marke (UT)";
  if (dom.includes("vita-gesundheit")) return "Schwester-Marke (Vita)";
  return "Extern";
};

const rows = regs.map((u) => {
  const m = matchTiers(u);
  return {
    name: u.userName, email: (u.email || u.userId || "").toLowerCase(), location: u.location,
    tips: u.tips, excluded: u.excluded ? "ja" : "", kategorie: classify(u, m),
    method: m.method || "", personio: m.emp ? `${m.emp.first} ${m.emp.last}` : "",
    office: m.emp?.office || "", position: m.emp?.position || "", status: m.emp?.status || "",
  };
});

// --- 5) CSV ---
const esc = (v) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const head = ["Anzeigename", "Email", "Standort", "Tipps", "Raus", "Kategorie", "MatchVia", "PersonioName", "PersonioOffice", "Position", "Status"];
const csv = "﻿" + [head.join(","), ...rows.map((r) =>
  [r.name, r.email, r.location, r.tips, r.excluded, r.kategorie, r.method, r.personio, r.office, r.position, r.status].map(esc).join(","))].join("\n");
const out = `${HOME}/Downloads/tippspiel-personio-match.csv`;
writeFileSync(out, csv);

// --- 6) Summary ---
const tally = (key) => rows.reduce((a, r) => ((a[r[key]] = (a[r[key]] || 0) + 1), a), {});
console.log("EMPLOYEES:", emps.length, "| REGS:", regs.length);
console.log("Kategorie:", JSON.stringify(tally("kategorie")));
console.log("MatchVia:", JSON.stringify(tally("method")));
console.log("Status (gematcht):", JSON.stringify(rows.filter((r) => r.status).reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {})));
console.log("CSV:", out);
console.log("\n-- Weiterhin OHNE Personio-Match --");
for (const r of rows.filter((r) => !r.method))
  console.log(`  [${r.kategorie}] ${r.name} <${r.email}> · ${r.location} · ${r.tips} Tipps${r.excluded ? " · RAUS" : ""}`);
console.log("\n-- Neu via Localpart aufgeloest --");
for (const r of rows.filter((r) => r.method === "localpart" || r.method === "localpart-name"))
  console.log(`  ${r.name} <${r.email}> →[${r.method}] ${r.personio} (${r.office || "?"}, ${r.status})`);
