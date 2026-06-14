/**
 * Personio-Abgleich für das Admin-Panel: matcht die Tippspiel-Registrierungen
 * gegen die NOVOTERGUM-Mitarbeiterliste, um ehemalige MA, Externe und vor allem
 * Doppel-Accounts (zwei Registrierungen → dieselbe Person) zu flaggen.
 *
 * Read-only auf die Personio v1 Employee-API. Mitarbeiterliste wird in Redis
 * gecacht (12 h), damit nicht bei jedem Admin-Load ~2800 MA nachgeladen werden.
 * Best-effort: Aufrufer fängt Fehler ab, das restliche Admin-Panel bleibt heil.
 */
import { Redis } from "@upstash/redis";

const EMP_CACHE_KEY = "personio:emp:v1";
const EMP_CACHE_TTL = 60 * 60 * 12; // 12 h

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

export interface Employee {
  id: string;
  first: string;
  last: string;
  email: string;
  office: string | null;
  position: string | null;
  status: "aktiv" | "aktiv (gek.)" | "ehemalig";
}

export interface MatchInfo {
  category: "MA" | "MA? (Mismatch)" | "Standort-Postfach" | "Schwester-Marke (UT)" | "Schwester-Marke (Vita)" | "Extern";
  method: "email" | "name" | "localpart" | "localpart~" | "localpart-name" | "";
  empId: string | null;
  empName: string | null;
  office: string | null;
  status: Employee["status"] | "";
}

// Umlaut-Transliteration vor dem Akzent-Strip → ä/ae matchen symmetrisch.
const norm = (s: string) =>
  (s || "").normalize("NFC").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
const normName = (s: string) =>
  norm(s).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).sort().join(" ");
const localOf = (email: string) => (email || "").toLowerCase().split("@")[0];
// Localpart ohne Trenner: "t.scharein" und "tscharein" werden gleich.
export const localNorm = (email: string) => localOf(email).replace(/[._-]+/g, "");

async function fetchEmployees(): Promise<Employee[]> {
  const cid = process.env.NTG_PERSONIO_CLIENT_ID;
  const csec = process.env.NTG_PERSONIO_CLIENT_SECRET;
  if (!cid || !csec) throw new Error("Personio-Credentials fehlen");

  const authRes = await fetch("https://api.personio.de/v1/auth", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cid, client_secret: csec }),
  });
  const auth = await authRes.json();
  if (!auth?.success) throw new Error("Personio-Auth fehlgeschlagen");
  let token: string = auth.data.token;

  const emps: Employee[] = [];
  for (let offset = 0; ; offset += 200) {
    const r = await fetch(`https://api.personio.de/v1/company/employees?limit=200&offset=${offset}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const nt = r.headers.get("authorization");
    if (nt) token = nt.replace(/^Bearer\s+/i, "");
    const j = await r.json();
    if (!j?.success || !Array.isArray(j.data) || j.data.length === 0) break;
    for (const e of j.data) {
      const a = e.attributes || {};
      const g = (k: string) => (a[k] && typeof a[k] === "object" ? a[k].value : a[k]);
      const off = (() => { const o = g("office"); return o?.attributes ? o.attributes.name : o; })();
      const term = g("termination_date");
      const status: Employee["status"] = term
        ? (new Date(term) <= new Date() ? "ehemalig" : "aktiv (gek.)")
        : "aktiv";
      emps.push({
        id: String(g("id") ?? ""),
        first: g("first_name") || "", last: g("last_name") || "",
        email: (g("email") || "").toLowerCase().trim(),
        office: off ?? null, position: g("position") ?? null, status,
      });
    }
    if (j.data.length < 200) break;
  }
  return emps;
}

async function getEmployees(): Promise<Employee[]> {
  const redis = getRedis();
  const cached = await redis.get<Employee[]>(EMP_CACHE_KEY).catch(() => null);
  if (cached && Array.isArray(cached) && cached.length) return cached;
  const emps = await fetchEmployees();
  await redis.set(EMP_CACHE_KEY, emps, { ex: EMP_CACHE_TTL }).catch(() => {});
  return emps;
}

export interface RegLike { userId: string; userName: string; email?: string }

export async function matchRegistrations(users: RegLike[]): Promise<Map<string, MatchInfo>> {
  const emps = await getEmployees();
  const byEmail = new Map<string, Employee>();
  const byName = new Map<string, Employee[]>();
  const byLocal = new Map<string, Employee[]>();
  const byLocalN = new Map<string, Employee[]>();
  for (const e of emps) {
    if (e.email) byEmail.set(e.email, e);
    const nk = normName(`${e.first} ${e.last}`);
    (byName.get(nk) ?? byName.set(nk, []).get(nk)!).push(e);
    const lk = localOf(e.email);
    if (lk) {
      (byLocal.get(lk) ?? byLocal.set(lk, []).get(lk)!).push(e);
      const ln = localNorm(e.email);
      (byLocalN.get(ln) ?? byLocalN.set(ln, []).get(ln)!).push(e);
    }
  }

  const tier = (u: RegLike): { emp: Employee | null; method: MatchInfo["method"] } => {
    const email = (u.email || u.userId || "").toLowerCase().trim();
    if (byEmail.has(email)) return { emp: byEmail.get(email)!, method: "email" };
    const nm = byName.get(normName(u.userName));
    if (nm?.length === 1) return { emp: nm[0], method: "name" };
    const lp = byLocal.get(localOf(email));
    if (lp?.length === 1) return { emp: lp[0], method: "localpart" };
    const lpn = byLocalN.get(localNorm(email));
    if (lpn?.length === 1) return { emp: lpn[0], method: "localpart~" };
    const toks = localOf(email).split(/[._-]+/).map((t) => norm(t.replace(/\d+$/, ""))).filter(Boolean);
    const cands = emps.filter((e) => {
      const fn = norm(e.first), ln = norm(e.last);
      if (!fn || !ln) return false;
      const lastHit = toks.some((t) => t.length >= 3 && t === ln);
      const firstHit = toks.some((t) => t === fn || (t.length === 1 && t === fn[0]) || (t.length >= 2 && fn.startsWith(t)));
      return lastHit && firstHit;
    });
    const uniq = [...new Map(cands.map((e) => [e.id, e])).values()];
    return uniq.length === 1 ? { emp: uniq[0], method: "localpart-name" } : { emp: null, method: "" };
  };

  const out = new Map<string, MatchInfo>();
  for (const u of users) {
    const { emp, method } = tier(u);
    let category: MatchInfo["category"];
    if (emp) category = "MA";
    else {
      const email = (u.email || u.userId || "").toLowerCase();
      const [local, dom = ""] = email.split("@");
      if (dom === "novotergum.de" && !local.includes(".")) category = "Standort-Postfach";
      else if (dom === "novotergum.de") category = "MA? (Mismatch)";
      else if (dom.includes("united-therapy") || dom.includes("uth")) category = "Schwester-Marke (UT)";
      else if (dom.includes("vita-gesundheit")) category = "Schwester-Marke (Vita)";
      else category = "Extern";
    }
    out.set(u.userId, {
      category, method,
      empId: emp?.id ?? null, empName: emp ? `${emp.first} ${emp.last}` : null,
      office: emp?.office ?? null, status: emp?.status ?? "",
    });
  }
  return out;
}
