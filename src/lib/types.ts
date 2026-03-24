/// Shared types for prediction inputs/outputs (NOVO-Orakel)

export interface TeamStats {
  elo: number; // e.g., 1500–2200
  form: number; // 0..1
  goals_scored: number; // per match, >= 0
  goals_conceded: number; // per match, >= 0
  missing_impact: number; // 0..1 (fractional reduction of strength)
  name?: string;
}

export interface Probabilities {
  home_win: number;
  draw: number;
  away_win: number;
}

export interface PredictionResult {
  prediction: string; // e.g., "2:1"
  probabilities: Probabilities; // sum to ~1
  confidence: number; // 0..1
  reasoning: string; // short, deterministic rationale
}
