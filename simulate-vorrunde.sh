#!/bin/bash
# ============================================================
# Vorrunde-Simulation: Loest alle betippten Spiele mit
# zufaelligen Ergebnissen auf (Testzwecke)
# ============================================================

BASE_URL="${1:-https://assistant-tau.vercel.app}"

echo "=== Vorrunde Simulation (Testzwecke) ==="
echo "URL: $BASE_URL"
echo ""

# Spiele mit Tipps: 2, 9, 12, 13, 14
# Zufaellige aber realistische Ergebnisse
declare -A RESULTS
RESULTS[2]='{"matchId":2,"actualHome":2,"actualAway":1}'   # Mexico vs South Africa → 2:1
RESULTS[9]='{"matchId":9,"actualHome":1,"actualAway":1}'   # Spiel 9 → 1:1
RESULTS[12]='{"matchId":12,"actualHome":1,"actualAway":0}' # Spiel 12 → 1:0
RESULTS[13]='{"matchId":13,"actualHome":0,"actualAway":2}' # Spiel 13 → 0:2
RESULTS[14]='{"matchId":14,"actualHome":0,"actualAway":3}' # Spiel 14 → 0:3

for id in 2 9 12 13 14; do
  echo "--- Spiel $id ---"
  RESPONSE=$(curl -s -X POST "$BASE_URL/api/resolve-match" \
    -H "Content-Type: application/json" \
    -d "${RESULTS[$id]}")
  echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
  echo ""
done

echo "=== Leaderboard nach Simulation ==="
curl -s "$BASE_URL/api/leaderboard" | python3 -m json.tool 2>/dev/null | head -60
