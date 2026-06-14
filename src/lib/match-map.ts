/**
 * Canonical WC2026 group-stage match numbers (matchId 1..72).
 *
 * The original data provider (WC2026 API) was rate-limit-suspended, so this map
 * was RECONSTRUCTED and VERIFIED without it:
 *  - 64 of 72 matchId→teams recovered by joining `feed:events` (carries the
 *    team label) to `predictions:h` (carries the matchId) on userName + exact
 *    timestamp — submit-tip writes both with the same instant.
 *  - the 8 early/finished matches were filled via per-group round-robin
 *    elimination + the real results back-computed from already-scored tips.
 *  - every entry cross-checked against football-data.org: group blocks line up
 *    (A=1–6 … L=67–72) and the orientation of all finished games matches the
 *    real score 5/5.
 *
 * Tuple is [home, away] in the orientation users TIPPED against (scoreTip is
 * home:away). Names are football-data.org's canonical spellings, so a
 * football-data match maps here by exact normalized team pair.
 *
 * Residual: matchId 7 vs 9 (Canada–Bosnia / Qatar–Switzerland) are
 * interchangeable — both finished 1:1, so no scoring impact, only a cosmetic
 * team label on two finished cards.
 */
export const GROUP_MATCH_TEAMS: Record<number, [string, string]> = {
  1: ["South Korea", "Czechia"],
  2: ["Mexico", "South Africa"],
  3: ["Czechia", "South Africa"],
  4: ["Mexico", "South Korea"],
  5: ["South Africa", "South Korea"],
  6: ["Czechia", "Mexico"],
  7: ["Canada", "Bosnia-Herzegovina"],
  8: ["Switzerland", "Bosnia-Herzegovina"],
  9: ["Qatar", "Switzerland"],
  10: ["Canada", "Qatar"],
  11: ["Bosnia-Herzegovina", "Qatar"],
  12: ["Switzerland", "Canada"],
  13: ["Brazil", "Morocco"],
  14: ["Scotland", "Morocco"],
  15: ["Haiti", "Scotland"],
  16: ["Brazil", "Haiti"],
  17: ["Morocco", "Haiti"],
  18: ["Scotland", "Brazil"],
  19: ["Australia", "Turkey"],
  20: ["United States", "Paraguay"],
  21: ["Turkey", "Paraguay"],
  22: ["United States", "Australia"],
  23: ["Paraguay", "Australia"],
  24: ["Turkey", "United States"],
  25: ["Ecuador", "Curaçao"],
  26: ["Germany", "Curaçao"],
  27: ["Ecuador", "Germany"],
  28: ["Ivory Coast", "Ecuador"],
  29: ["Germany", "Ivory Coast"],
  30: ["Curaçao", "Ivory Coast"],
  31: ["Netherlands", "Sweden"],
  32: ["Japan", "Sweden"],
  33: ["Sweden", "Tunisia"],
  34: ["Netherlands", "Japan"],
  35: ["Tunisia", "Japan"],
  36: ["Tunisia", "Netherlands"],
  37: ["Iran", "New Zealand"],
  38: ["Belgium", "Iran"],
  39: ["Egypt", "Iran"],
  40: ["Belgium", "Egypt"],
  41: ["New Zealand", "Egypt"],
  42: ["New Zealand", "Belgium"],
  43: ["Spain", "Cape Verde Islands"],
  44: ["Uruguay", "Cape Verde Islands"],
  45: ["Saudi Arabia", "Uruguay"],
  46: ["Uruguay", "Spain"],
  47: ["Spain", "Saudi Arabia"],
  48: ["Cape Verde Islands", "Saudi Arabia"],
  49: ["France", "Iraq"],
  50: ["Senegal", "Iraq"],
  51: ["Iraq", "Norway"],
  52: ["France", "Senegal"],
  53: ["Norway", "Senegal"],
  54: ["Norway", "France"],
  55: ["Austria", "Jordan"],
  56: ["Argentina", "Austria"],
  57: ["Algeria", "Austria"],
  58: ["Argentina", "Algeria"],
  59: ["Jordan", "Algeria"],
  60: ["Jordan", "Argentina"],
  61: ["Portugal", "Congo DR"],
  62: ["Colombia", "Congo DR"],
  63: ["Uzbekistan", "Colombia"],
  64: ["Portugal", "Uzbekistan"],
  65: ["Congo DR", "Uzbekistan"],
  66: ["Colombia", "Portugal"],
  67: ["Panama", "Croatia"],
  68: ["England", "Croatia"],
  69: ["Panama", "England"],
  70: ["Ghana", "Panama"],
  71: ["England", "Ghana"],
  72: ["Croatia", "Ghana"],
};

/** Lowercase, strip diacritics & punctuation so spellings match robustly. */
export function normTeam(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Order-independent key for a fixture. */
export function pairKey(a: string, b: string): string {
  return [normTeam(a), normTeam(b)].sort().join("|");
}

const PAIR_TO_ID = new Map<string, number>();
for (const [id, [h, a]] of Object.entries(GROUP_MATCH_TEAMS)) {
  PAIR_TO_ID.set(pairKey(h, a), Number(id));
}

/** Canonical matchId for a group-stage fixture, or null if not a known pairing. */
export function groupMatchId(home: string, away: string): number | null {
  return PAIR_TO_ID.get(pairKey(home, away)) ?? null;
}

/** True if `home` is the canonical home team for this matchId (orientation check). */
export function isCanonicalHome(matchId: number, home: string): boolean {
  const m = GROUP_MATCH_TEAMS[matchId];
  return !!m && normTeam(m[0]) === normTeam(home);
}
