import type { TeamStats } from "./types";

// Deterministic, interpretable MVP model
// Weights: Elo (highest), Form (mid), Attack/Defense (mid), Missing impact reduces strength, small home advantage

function clamp(x: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, x));
}

function teamStrength(t: TeamStats) {
  const eloNorm = (t.elo - 1500) / 600; // ~ -0.5..+1.2 typical
  const form = clamp(t.form); // 0..1
  const attack = Math.max(0, t.goals_scored - 0.8) / 2.2; // normalize ~0..1
  const defense = 1 - Math.max(0, t.goals_conceded - 0.6) / 2.0; // lower conceded => higher
  const base = 0.5 * eloNorm + 0.2 * form + 0.15 * attack + 0.15 * defense;
  const penalty = clamp(t.missing_impact); // 0..1
  return base * (1 - 0.6 * penalty);
}

function relativeStrength(home: TeamStats, away: TeamStats) {
  return teamStrength(home) - teamStrength(away) + 0.1; // small home advantage
}

function expectedGoals(rel: number) {
  // Map relative strength to expected goals around a ~2.4 total goals baseline
  const total = 2.4;
  const homeShare = 1 / (1 + Math.exp(-2.2 * rel)); // 0..1
  const homeXg = Math.min(
    Math.max(total * (0.35 + (0.3 * (homeShare - 0.5)) / 0.5), 0.2),
    3.5,
  );
  const awayXg = Math.min(Math.max(total - homeXg, 0.1), 3.0);
  return { homeXg, awayXg };
}

function poisson(lambda: number, k: number) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

function grid(homeXg: number, awayXg: number, maxGoals = 6) {
  const g: number[][] = [];
  for (let h = 0; h <= maxGoals; h++) {
    const row: number[] = [];
    for (let a = 0; a <= maxGoals; a++) {
      row.push(poisson(homeXg, h) * poisson(awayXg, a));
    }
    g.push(row);
  }
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

function bestScore(g: number[][]) {
  let best = { h: 0, a: 0, p: -1 };
  for (let h = 0; h < g.length; h++) {
    for (let a = 0; a < g[h].length; a++) {
      const p = g[h][a];
      if (p > best.p) best = { h, a, p };
    }
  }
  return { home: best.h, away: best.a, prob: best.p };
}

function topScores(g: number[][], n = 5) {
  const all: { home: number; away: number; prob: number }[] = [];
  for (let h = 0; h < g.length; h++) {
    for (let a = 0; a < g[h].length; a++) {
      all.push({ home: h, away: a, prob: g[h][a] });
    }
  }
  return all.sort((a, b) => b.prob - a.prob).slice(0, n);
}

export function predictMatch(home: TeamStats, away: TeamStats) {
  const rel = relativeStrength(home, away);
  const { homeXg, awayXg } = expectedGoals(rel);
  const g = grid(homeXg, awayXg);
  const probs = aggregate(g);
  const top = bestScore(g);

  const spread = Math.max(probs.home_win, probs.away_win) - 0.5;
  const confidence = Math.max(
    0,
    Math.min(
      1,
      0.4 * spread +
        0.3 * (1 - probs.draw) +
        (0.3 * Math.min(0.35, top.prob)) / 0.35,
    ),
  );

  const reasoning = `RelStrength=${rel.toFixed(3)}, xG(H/A)=${homeXg.toFixed(2)}/${awayXg.toFixed(2)}, top=${top.home}:${top.away} p=${top.prob.toFixed(2)}, probs(H/D/A)=${probs.home_win.toFixed(2)}/${probs.draw.toFixed(2)}/${probs.away_win.toFixed(2)}`;

  const topN = topScores(g, 5);

  return {
    prediction: `${top.home}:${top.away}`,
    probabilities: probs,
    confidence: Number(confidence.toFixed(2)),
    reasoning,
    topScores: topN,
  } as const;
}
