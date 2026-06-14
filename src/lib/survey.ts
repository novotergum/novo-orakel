// Feature-Umfrage: "Welches Feature fehlt dir noch?"
// Optionen zentral definiert, damit API-Route (Validierung) und UI dieselbe
// Quelle nutzen. id wird in Redis gespeichert, label ist die Anzeige.

export interface SurveyOption {
  id: string;
  emoji: string;
  label: string;
}

export const SURVEY_OPTIONS: SurveyOption[] = [
  { id: "rename", emoji: "✏️", label: "Name einmalig ändern (wird gespeichert)" },
  { id: "jokers", emoji: "🃏", label: "Mehr Joker" },
  { id: "push", emoji: "📲", label: "Push-Benachrichtigung aufs Handy" },
  { id: "news", emoji: "📰", label: "WM-News & Hintergründe" },
  { id: "livescores", emoji: "🔴", label: "Live-Spielergebnisse" },
];

export const SURVEY_OPTION_IDS = new Set(SURVEY_OPTIONS.map((o) => o.id));
