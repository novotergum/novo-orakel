/**
 * Einmaliger Sync: Login-Mail -> offizieller Personio-Standort (Office).
 *
 * Liest die Teilnehmer (Menschen) aus Redis (predictions), holt zu jeder Mail
 * den Personio-Standort und schreibt eine Map `standort:by-email` nach Upstash.
 * Das Statistik-Board nimmt dann diesen Standort (Selbstangabe nur Fallback).
 *
 * PII: nur Teilnehmer-Eintraege werden geschrieben, nichts ins Git.
 *
 * Lauf:  node scripts/personio-standort-map.mjs          (Report, schreibt NICHT)
 *        node scripts/personio-standort-map.mjs --write   (schreibt nach Redis)
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { Redis } from "@upstash/redis";

const WRITE = process.argv.includes("--write");

function loadEnvFile(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}

const appEnv = loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
const pio = loadEnvFile(`${homedir()}/.config/personio/credentials`);

const UPSTASH_URL = appEnv.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = appEnv.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const CLIENT_ID = pio.NTG_PERSONIO_CLIENT_ID;
const CLIENT_SECRET = pio.NTG_PERSONIO_CLIENT_SECRET;

if (!UPSTASH_URL || !UPSTASH_TOKEN) throw new Error("Upstash-Creds fehlen (.env.local)");
if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Personio-Creds fehlen");

const redis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });

async function personioToken() {
  const r = await fetch("https://api.personio.de/v1/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  const j = await r.json();
  if (!j?.data?.token) throw new Error("Personio auth fehlgeschlagen");
  return j.data.token;
}

async function fetchAllEmployees(token) {
  const out = [];
  const limit = 200;
  for (let offset = 0; ; offset += limit) {
    const r = await fetch(
      `https://api.personio.de/v1/company/employees?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const j = await r.json();
    const batch = j?.data || [];
    out.push(...batch);
    if (batch.length < limit) break;
  }
  return out;
}

function strVal(attr) {
  if (!attr || attr.value == null) return "";
  if (typeof attr.value === "string") return attr.value;
  if (typeof attr.value === "number") return String(attr.value);
  return "";
}

// --- 1) Teilnehmer-Mails (Menschen) aus Redis ---
const predHash = await redis.hgetall("predictions:h");
const participantEmails = new Set();
for (const v of Object.values(predHash || {})) {
  const rec = typeof v === "string" ? JSON.parse(v) : v;
  if (rec?.source === "human" && rec?.userId) {
    participantEmails.add(String(rec.userId).toLowerCase().trim());
  }
}
console.log(`Teilnehmer (Menschen) mit Tipps: ${participantEmails.size}`);

// --- 2) Personio email -> office ---
const token = await personioToken();
const employees = await fetchAllEmployees(token);
console.log(`Personio-Mitarbeiter geladen: ${employees.length}`);

const emailToOffice = new Map();
for (const emp of employees) {
  const a = emp.attributes || {};
  const email = strVal(a.email).toLowerCase().trim();
  const office = a.office?.value?.attributes?.name || "";
  if (email && office) emailToOffice.set(email, office);
}

// --- 3) Abgleich nur fuer Teilnehmer ---
const map = {};
const unmatched = [];
for (const email of participantEmails) {
  const office = emailToOffice.get(email);
  if (office) map[email] = office;
  else unmatched.push(email);
}

const matched = Object.keys(map).length;
console.log(
  `\nTreffer: ${matched}/${participantEmails.size} (${(
    (matched / Math.max(1, participantEmails.size)) *
    100
  ).toFixed(0)} %)`,
);

const officeCounts = {};
for (const o of Object.values(map)) officeCounts[o] = (officeCounts[o] || 0) + 1;
console.log("\nPersonio-Standorte der Teilnehmer (Anzahl):");
for (const [o, n] of Object.entries(officeCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${o}`);
}

console.log(`\nOhne Personio-Treffer (Fallback Selbstangabe): ${unmatched.length}`);
console.log(unmatched.slice(0, 25).join("\n"));

if (WRITE) {
  await redis.del("standort:by-email");
  if (Object.keys(map).length) await redis.hset("standort:by-email", map);
  await redis.set("standort:by-email:meta", JSON.stringify({
    matched, total: participantEmails.size, updatedAt: new Date().toISOString(),
  }));
  console.log(`\n✅ Geschrieben: standort:by-email (${matched} Eintraege)`);
} else {
  console.log("\n(Report-Modus — nichts geschrieben. Mit --write erneut ausfuehren.)");
}
