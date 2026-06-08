#!/usr/bin/env python3
"""
Vorrunde-Simulation: Generiert Tipps fuer alle Spieler + Agent,
loest Spiele mit simulierten Ergebnissen auf, zeigt Leaderboard.
"""

import json
import random
import time
import urllib.request

BASE = "https://wm-tippspiel.vercel.app"

# ── 1. Spieler und Matches laden ──

def api_get(path):
    req = urllib.request.Request(f"{BASE}{path}")
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read())

def api_post(path, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(f"{BASE}{path}", data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        return {"error": err, "status": e.code}

print("=== UT Orakel – Vorrunde Simulation ===\n")

# Spieler
users_data = api_get("/api/users")
users = users_data.get("users", [])
print(f"Spieler: {', '.join(u['userName'] for u in users)}")

# Matches (nur Vorrunde)
matches_data = api_get("/api/matches")
all_matches = matches_data.get("matches", [])
group_matches = [m for m in all_matches if m.get("stage") == "GROUP_STAGE"]
group_matches.sort(key=lambda m: (m["kickoff"], m["id"]))
print(f"Vorrunde-Spiele: {len(group_matches)}\n")

# ── 2. Tipps generieren und abgeben ──

def random_score():
    """Realistische Zufallsergebnisse (gewichtet)"""
    goals = [0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4]
    return random.choice(goals), random.choice(goals)

def pick_from_score(home, away):
    if home > away: return "1"
    if home < away: return "2"
    return "X"

print("── Tipps abgeben ──")
tip_count = 0
agent_tips = {}  # matchId -> tip data

for i, match in enumerate(group_matches):
    mid = match["id"]
    home = match["homeTeam"]["name"]
    away = match["awayTeam"]["name"]

    # Agent-Tipp per Prediction Engine
    tip_resp = api_post("/api/tip", {
        "match": {
            "id": mid,
            "homeTeamId": match["homeTeam"]["id"],
            "awayTeamId": match["awayTeam"]["id"],
            "homeTeam": home,
            "awayTeam": away,
            "utcDate": match["kickoff"],
        },
        "style": "balanced"
    })

    if "tip" in tip_resp:
        agent_score = tip_resp["tip"]["scoreTip"]
        agent_pick = tip_resp["tip"]["winnerPick"]
        agent_tips[mid] = {"score": agent_score, "pick": agent_pick}
    else:
        # Fallback
        h, a = random_score()
        agent_score = f"{h}:{a}"
        agent_pick = pick_from_score(h, a)
        agent_tips[mid] = {"score": agent_score, "pick": agent_pick}

    # Agent-Tipp submitten
    api_post("/api/submit-tip", {
        "matchId": mid,
        "userId": "ut-orakel",
        "userName": "UT Orakel",
        "winnerPick": agent_pick,
        "scoreTip": agent_score,
        "source": "agent",
        "style": "balanced",
    })

    # Menschliche Tipps
    for user in users:
        h, a = random_score()
        score = f"{h}:{a}"
        pick = pick_from_score(h, a)
        api_post("/api/submit-tip", {
            "matchId": mid,
            "userId": user["userId"],
            "userName": user["userName"],
            "winnerPick": pick,
            "scoreTip": score,
            "source": "human",
            "location": user.get("location", ""),
        })
        tip_count += 1

    tip_count += 1  # agent

    if (i + 1) % 10 == 0 or i == len(group_matches) - 1:
        print(f"  {i + 1}/{len(group_matches)} Spiele betippt ({tip_count} Tipps total)")

print(f"\nAlle Tipps abgegeben: {tip_count} Tipps\n")

# ── 3. Spiele aufloesen mit simulierten Ergebnissen ──

print("── Ergebnisse simulieren & aufloesen ──")
resolved = 0

for i, match in enumerate(group_matches):
    mid = match["id"]
    home = match["homeTeam"]["name"]
    away = match["awayTeam"]["name"]

    # Simuliertes Ergebnis (realistisch gewichtet)
    h, a = random_score()

    result = api_post("/api/resolve-match", {
        "matchId": mid,
        "actualHome": h,
        "actualAway": a,
    })

    updated = result.get("updated", 0)
    resolved += 1

    if (i + 1) % 12 == 0 or i == len(group_matches) - 1:
        print(f"  Spieltag {(i + 1) // 12 + 1}: {resolved} Spiele aufgeloest")

print(f"\nAlle {resolved} Vorrunde-Spiele aufgeloest!\n")

# ── 4. Leaderboard anzeigen ──

print("══════════════════════════════════════")
print("       LEADERBOARD NACH VORRUNDE     ")
print("══════════════════════════════════════\n")

lb = api_get("/api/leaderboard")
leaderboard = lb.get("leaderboard", [])

print(f"{'#':>3}  {'Spieler':<20} {'Typ':<8} {'Punkte':>7} {'Tipps':>6} {'Exakt':>6} {'Diff':>6} {'Tend.':>6}")
print("-" * 70)

for i, entry in enumerate(leaderboard):
    tag = "AGENT" if entry.get("source") == "agent" else "Mensch"
    print(f"{i + 1:>3}  {entry['userName']:<20} {tag:<8} {entry['points']:>7} {entry['tips']:>6} {entry.get('exact', 0):>6} {entry.get('diffCorrect', 0):>6} {entry.get('tendencyCorrect', 0):>6}")

print()

# Mensch vs. Maschine
mvm = lb.get("menschVsMaschine", {})
print(f"Mensch: {mvm.get('humanAvgPoints', 0):.1f} Ø Punkte ({mvm.get('humanPlayers', 0)} Spieler)")
print(f"Maschine: {mvm.get('agentAvgPoints', 0):.1f} Ø Punkte ({mvm.get('agentPlayers', 0)} Agent)")
print(f"Fuehrung: {mvm.get('leader', '?')}")
print()
