import type { TeamStats } from "./types";

// Deterministic, interpretable model.
//
// Verbesserungen ggü. V1 (2026-06-16, nach Walk-forward-Backtest über die
// bereits ausgewerteten Turnierspiele):
//  #2 Dixon-Coles-Korrektur (rho<0) hebt die Tiefscore-Remis (0:0/1:1) an, die
//     ein UNABHÄNGIGES Doppel-Poisson systematisch unterschätzt.
//  #3 Team-spezifische xG aus Angriff×Abwehr (statt fixer 2,7-Gesamtsumme) →
//     bildet Kantersiege UND Hänger ab. Angriff/Abwehr werden auf ihren
//     jeweiligen Tabellen-Schnitt normiert (sonst werden die xG gedrückt).
//  Ergebnis-Tipp = wahrscheinlichster exakter Score (Mode-Picker). Ein zuvor
//     getesteter EV-Picker (max. erwartete Punkte) schnitt im Backtest klar
//     schlechter ab (verschenkt die 4-Punkte-Exakttreffer) und wurde verworfen.
//  #4 Konfidenz = Wahrscheinlichkeit der getippten Tendenz, ehrlich kalibriert.

const AVG_GOALS = 1.35; // Tore pro Team & Spiel (WM-Schnitt ~2,7 gesamt)
// Mittelwerte der statischen FIFA-Basistabelle (STATIC_TEAM_DATA in elo.ts).
// Hart kodiert, um eine zirkuläre Import-Abhängigkeit zu elo.ts zu vermeiden.
const MEAN_GS = 1.28; // Durchschnitt goals_scored
const MEAN_GC = 0.78; // Durchschnitt goals_conceded
const ELO_TILT_DIV = 600; // wie stark die Elo-Differenz die xG kippt
const HOST_HOME_ADV = 1.1; // Heimvorteil-Multiplikator (nur Gastgeber)
const DC_RHO = -0.08; // Dixon-Coles-Korrelation (<0 → mehr Remis); Backtest-Optimum
const MAX_GOALS = 8; // Gitter-Obergrenze (deckt 7:1 etc.)
// xG-Deckel (2026-06-26-Kalibrierung). Der alte Deckel (4,8/4,2) ließ den
// Elo-Tilt die Favoriten-xG so hoch treiben, dass der Mode-Picker reihenweise
// 4:0/0:4 tippte — Tendenz oft richtig, Exakt-Treffer aber fast nie (real ist
// 4:0 selten). Walk-forward-Backtest über die 60 Gruppenspiele: Deckel 3,2
// hebt Ø-Punkte 1,33→1,43 und Exakt-Quote 10%→15% bei gleicher Tendenz-Quote
// (52%) und besserer Kalibrierung (Brier 0,271→0,260). Tiefer als 3,2 killt die
// echten Kantersiege (3:0) wieder. Der Tilt-Divisor (600) war NICHT der Treiber.
const HOME_XG_CAP = 3.2;
const AWAY_XG_CAP = 3.2;

function clamp(x: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, x));
}

// WC 2026 host nations — only these get a real home advantage
const HOST_NATIONS = new Set(["United States", "USA", "Mexico", "Canada"]);

// ---------------------------------------------------------------------------
// #3 Team-spezifische erwartete Tore (Angriff × gegnerische Abwehr, Elo-Tilt).
// Angriff relativ zum Tor-Schnitt, Abwehr relativ zum Gegentor-Schnitt — so
// ergibt eine Durchschnittspaarung genau den Liga-Schnitt, statt zu niedrig.
// ---------------------------------------------------------------------------
function expectedGoals(home: TeamStats, away: TeamStats) {
  const homeAttack = Math.max(0.2, home.goals_scored) / MEAN_GS;
  const homeDefense = Math.max(0.2, home.goals_conceded) / MEAN_GC;
  const awayAttack = Math.max(0.2, away.goals_scored) / MEAN_GS;
  const awayDefense = Math.max(0.2, away.goals_conceded) / MEAN_GC;

  const baseHome = AVG_GOALS * homeAttack * awayDefense;
  const baseAway = AVG_GOALS * awayAttack * homeDefense;

  // Elo-Differenz kippt die xG multiplikativ (Favorit trifft mehr, kassiert weniger)
  const tilt = Math.exp((home.elo - away.elo) / ELO_TILT_DIV);
  const hostMult = home.name && HOST_NATIONS.has(home.name) ? HOST_HOME_ADV : 1;

  const homeXg = clamp(baseHome * tilt * hostMult, 0.2, HOME_XG_CAP);
  const awayXg = clamp(baseAway / tilt, 0.15, AWAY_XG_CAP);
  return { homeXg, awayXg };
}

function poisson(lambda: number, k: number) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

// ---------------------------------------------------------------------------
// #2 Score-Gitter mit Dixon-Coles-Tiefscore-Korrektur
// ---------------------------------------------------------------------------
function dcTau(h: number, a: number, lambda: number, mu: number, rho: number) {
  if (h === 0 && a === 0) return 1 - lambda * mu * rho;
  if (h === 0 && a === 1) return 1 + lambda * rho;
  if (h === 1 && a === 0) return 1 + mu * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

function grid(homeXg: number, awayXg: number, maxGoals = MAX_GOALS) {
  const g: number[][] = [];
  let sum = 0;
  for (let h = 0; h <= maxGoals; h++) {
    const row: number[] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const p =
        poisson(homeXg, h) *
        poisson(awayXg, a) *
        Math.max(0, dcTau(h, a, homeXg, awayXg, DC_RHO));
      row.push(p);
      sum += p;
    }
    g.push(row);
  }
  if (sum > 0) for (const row of g) for (let a = 0; a < row.length; a++) row[a] /= sum;
  return g;
}

function aggregate(g: number[][]) {
  let home = 0,
    draw = 0,
    away = 0;
  for (let h = 0; h < g.length; h++) {
    for (let a = 0; a < g[h].length; a++) {
      const p = g[h][a];
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
    }
  }
  const sum = home + draw + away || 1;
  return { home_win: home / sum, draw: draw / sum, away_win: away / sum };
}

// Wahrscheinlichster exakter Score (Mode-Picker)
function bestScore(g: number[][]) {
  let best = { h: 0, a: 0, p: -1 };
  for (let h = 0; h < g.length; h++) {
    for (let a = 0; a < g[h].length; a++) {
      if (g[h][a] > best.p) best = { h, a, p: g[h][a] };
    }
  }
  return { home: best.h, away: best.a, prob: best.p };
}

function topScores(g: number[][], n = 10) {
  const all: { home: number; away: number; prob: number }[] = [];
  for (let h = 0; h < g.length; h++) {
    for (let a = 0; a < g[h].length; a++) {
      all.push({ home: h, away: a, prob: g[h][a] });
    }
  }
  return all.sort((a, b) => b.prob - a.prob).slice(0, n);
}

export function predictMatch(home: TeamStats, away: TeamStats) {
  const { homeXg, awayXg } = expectedGoals(home, away);
  const g = grid(homeXg, awayXg);
  const probs = aggregate(g);
  const mode = bestScore(g); // Tipp = wahrscheinlichster exakter Score

  // #4 Konfidenz = Wahrscheinlichkeit der getippten Tendenz, ehrlich kalibriert
  const tendency =
    mode.home > mode.away ? "home_win" : mode.home < mode.away ? "away_win" : "draw";
  const confidence =
    tendency === "home_win"
      ? probs.home_win
      : tendency === "away_win"
        ? probs.away_win
        : probs.draw;

  const reasoning = `xG(H/A)=${homeXg.toFixed(2)}/${awayXg.toFixed(2)}, Tipp(Mode)=${mode.home}:${mode.away} p=${mode.prob.toFixed(2)}, probs(H/D/A)=${probs.home_win.toFixed(2)}/${probs.draw.toFixed(2)}/${probs.away_win.toFixed(2)}`;

  return {
    prediction: `${mode.home}:${mode.away}`,
    modeScore: `${mode.home}:${mode.away}`,
    probabilities: probs,
    // confidence = Wahrscheinlichkeit der getippten TENDENZ (Sieg/Remis/Niederl.),
    // NICHT die des exakten Ergebnisses. Ein 3:0-Tipp kann mit 95% Tendenz-Konfidenz
    // stehen, obwohl exakt 3:0 nur ~10% wahrscheinlich ist. Anzeige entsprechend als
    // "Tendenz-Sicherheit" labeln und exactProbability separat zeigen (#3-Fix).
    confidence: Number(clamp(confidence).toFixed(2)),
    tendencyConfidence: Number(clamp(confidence).toFixed(2)),
    exactProbability: Number(clamp(mode.prob).toFixed(2)),
    reasoning,
    topScores: topScores(g, 10),
    expected: { homeXg, awayXg },
  } as const;
}
