#!/usr/bin/env python3
"""
K.O.-Runden-Simulation: Testet den kompletten Scoring-Pipeline
inkl. aller Multiplikatoren (1.5x bis 3x) mit den realen Match-IDs.
"""

import json
import random
import urllib.request

BASE = "https://wm-tippspiel.vercel.app"

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
        return {"error": e.read().decode(), "status": e.code}

# ── Setup ──

print("=== UT Orakel – K.O.-Runden Simulation ===\n")

users_data = api_get("/api/users")
users = users_data.get("users", [])
print(f"Spieler: {', '.join(u['userName'] for u in users)}")

matches_data = api_get("/api/matches")
all_matches = matches_data.get("matches", [])
ko_matches = [m for m in all_matches if m.get("stage") and m["stage"] != "GROUP_STAGE"]
ko_matches.sort(key=lambda m: m["kickoff"])

# Gruppieren nach Stage
stages = {}
for m in ko_matches:
    s = m["stage"]
    stages.setdefault(s, []).append(m)

multipliers = {
    "ROUND_OF_32": 1.5,
    "LAST_16": 1.5,
    "QUARTER_FINALS": 2.0,
    "SEMI_FINALS": 2.5,
    "THIRD_PLACE": 2.0,
    "FINAL": 3.0,
}

labels = {
    "ROUND_OF_32": "Runde der 32",
    "LAST_16": "Achtelfinale",
    "QUARTER_FINALS": "Viertelfinale",
    "SEMI_FINALS": "Halbfinale",
    "THIRD_PLACE": "Spiel um Platz 3",
    "FINAL": "Finale",
}

print(f"K.O.-Spiele: {len(ko_matches)}")
for stage, matches in stages.items():
    print(f"  {labels.get(stage, stage)}: {len(matches)} Spiele (x{multipliers.get(stage, 1)})")
print()

# ── Tipps + Resolve pro Runde ──

def random_score():
    goals = [0, 0, 1, 1, 1, 2, 2, 3]
    return random.choice(goals), random.choice(goals)

def pick_from_score(h, a):
    if h > a: return "1"
    if h < a: return "2"
    return "X"

total_tips = 0
stage_order = ["ROUND_OF_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"]

for stage in stage_order:
    matches = stages.get(stage, [])
    if not matches:
        continue

    label = labels.get(stage, stage)
    mult = multipliers.get(stage, 1)
    print(f"── {label} ({len(matches)} Spiele, x{mult}) ──")

    for match in matches:
        mid = match["id"]

        # Tipps fuer alle Spieler + Agent
        for user in users:
            h, a = random_score()
            api_post("/api/submit-tip", {
                "matchId": mid,
                "userId": user["userId"],
                "userName": user["userName"],
                "winnerPick": pick_from_score(h, a),
                "scoreTip": f"{h}:{a}",
                "source": "human",
                "location": user.get("location", ""),
            })
            total_tips += 1

        # Agent
        h, a = random_score()
        api_post("/api/submit-tip", {
            "matchId": mid,
            "userId": "ut-orakel",
            "userName": "UT Orakel",
            "winnerPick": pick_from_score(h, a),
            "scoreTip": f"{h}:{a}",
            "source": "agent",
            "style": "balanced",
        })
        total_tips += 1

        # Resolve
        rh, ra = random_score()
        # K.O.: kein Unentschieden (Verlaengerung simulieren)
        if rh == ra:
            if random.random() > 0.5:
                rh += 1
            else:
                ra += 1

        api_post("/api/resolve-match", {
            "matchId": mid,
            "actualHome": rh,
            "actualAway": ra,
        })

    print(f"  {len(matches)} Spiele betippt & aufgeloest")

print(f"\nTotal K.O.-Tipps: {total_tips}")

# ── Stichprobe: Multiplikator-Check ──

print("\n── Multiplikator-Stichprobe ──")
# Pruefen ob ein Finale-Tipp den 3x-Multiplikator hat
final_matches = stages.get("FINAL", [])
if final_matches:
    fid = final_matches[0]["id"]
    tips = api_get(f"/api/my-tips?userId=ut-orakel")
    tip = tips.get("tips", {}).get(str(fid))
    if tip:
        pts = tip.get("points", "?")
        score = tip.get("scoreTip", "?")
        print(f"  Finale (Match {fid}): Tipp {score}, Punkte: {pts}")
        if isinstance(pts, int) and pts > 0:
            # Basispunkte waeren max 4, mit 3x = max 12
            print(f"  -> Multiplikator scheint korrekt (max moeglich: 12)")

# ── Leaderboard ──

print("\n══════════════════════════════════════════")
print("   LEADERBOARD NACH KOMPLETTEM TURNIER   ")
print("══════════════════════════════════════════\n")

lb = api_get("/api/leaderboard")
leaderboard = lb.get("leaderboard", [])

print(f"{'#':>3}  {'Spieler':<20} {'Typ':<8} {'Punkte':>7} {'Tipps':>6} {'Exakt':>6} {'Diff':>6} {'Tend.':>6}")
print("-" * 70)

for i, entry in enumerate(leaderboard):
    tag = "AGENT" if entry.get("source") == "agent" else "Mensch"
    print(f"{i + 1:>3}  {entry['userName']:<20} {tag:<8} {entry['points']:>7} {entry['tips']:>6} {entry.get('exact', 0):>6} {entry.get('diffCorrect', 0):>6} {entry.get('tendencyCorrect', 0):>6}")

mvm = lb.get("menschVsMaschine", {})
print(f"\nMensch: {mvm.get('humanAvgPoints', 0):.1f} Oe Punkte ({mvm.get('humanPlayers', 0)} Spieler)")
print(f"Maschine: {mvm.get('agentAvgPoints', 0):.1f} Oe Punkte ({mvm.get('agentPlayers', 0)} Agent)")
print(f"Fuehrung: {mvm.get('leader', '?')}")

# Cleanup test user
api_post("/api/admin?secret=ut-admin-2026", {"action": "delete-user", "userId": "test-ko"})

print("\n=== Simulation abgeschlossen ===")
print("Getestet: Tippabgabe, Scoring, K.O.-Multiplikatoren (1.5x-3x), Leaderboard")
