"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export interface PodiumPlace {
  rank: number;
  userName: string;
  points: number;
  source: "human" | "agent";
  isMe: boolean;
}

// Canvas-Auflösung (wie Elfmeter Arena: pixelig, 4:3-nah)
const W = 384;
const H = 300;
const GROUND = 250;

// Slot je Standfläche: index 0 = Gold (Mitte), 1 = Silber (links), 2 = Bronze (rechts)
const SLOTS = [
  { cx: 192, w: 74, top: GROUND - 96, medal: "#F3C220", ribbon: "#c8332a", enter: 5.4, trophy: true, label: "Gold" },
  { cx: 104, w: 68, top: GROUND - 58, medal: "#cfd3da", ribbon: "#4293D0", enter: 2.9, trophy: false, label: "Silber" },
  { cx: 280, w: 68, top: GROUND - 38, medal: "#cd7f32", ribbon: "#3c7a2e", enter: 0.5, trophy: false, label: "Bronze" },
];
const WALK_DUR = 1.7;
const CLIMB_DUR = 0.75;

// Podium-Figuren sind metallische Statuen in ihrer Medaillenfarbe — KEIN Hautton.
// Bewusst, weil hier echte, namentlich benannte Personen stehen; ihnen eine
// Hautfarbe zuzuweisen wäre unangemessen. Index 0=Gold, 1=Silber, 2=Bronze.
const STATUE = [
  { base: "#F3C220", dark: "#b8910f", light: "#fff3b0" },
  { base: "#cfd3da", dark: "#8e949e", light: "#ffffff" },
  { base: "#cd7f32", dark: "#8a5320", light: "#f0b878" },
];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 2.4);

export default function Siegerehrung({
  players,
  preview,
  finishedMatches,
}: {
  players: PodiumPlace[];
  preview: boolean;
  finishedMatches: number;
}) {
  const podium = players.slice(0, 3);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const startedRef = useRef(false);
  const runRef = useRef({ t0: 0, celebrated: false, runId: 0 });
  const acRef = useRef<AudioContext | null>(null);

  // Audio (Chiptune) — wie Elfmeter Arena, erst nach User-Geste
  function tone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.12, when = 0) {
    const ac = acRef.current;
    if (!ac) return;
    try {
      const t = ac.currentTime + when;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch {
      /* ignore */
    }
  }
  const fanfare = () =>
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.18, "square", 0.13, i * 0.13));

  function start() {
    if (!acRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      try {
        acRef.current = new AC();
      } catch {
        /* kein Audio */
      }
    }
    acRef.current?.resume?.();
    runRef.current = { t0: performance.now(), celebrated: false, runId: runRef.current.runId + 1 };
    startedRef.current = true;
    setDone(false);
    setStarted(true);
  }

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const cx = cv.getContext("2d");
    if (!cx) return;
    cx.imageSmoothingEnabled = false;

    const reduceMotion =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // ── Pixel-Helfer ──
    const px = (x: number, y: number, w: number, h: number, c: string) => {
      cx.fillStyle = c;
      cx.fillRect(x | 0, y | 0, w, h);
    };
    const poly = (pts: number[][], c: string) => {
      cx.fillStyle = c;
      cx.beginPath();
      cx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) cx.lineTo(pts[i][0], pts[i][1]);
      cx.closePath();
      cx.fill();
    };
    const txt = (t: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left") => {
      cx.font = "bold " + size + 'px "Courier New",monospace';
      cx.textAlign = align;
      cx.textBaseline = "top";
      cx.fillStyle = "#000";
      cx.fillText(t, x + 1, y + 1);
      cx.fillStyle = color;
      cx.fillText(t, x, y);
    };

    // Crowd vorrendern (2 Frames fürs Flimmern)
    const crowd = [0, 1].map(() => {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = 40;
      const g = c.getContext("2d")!;
      const cols = ["#2a3560", "#39466f", "#222b4e", "#414f7d", "#F46524", "#00A896", "#56629a"];
      for (let y = 0; y < 40; y += 4)
        for (let x = 0; x < W; x += 4) {
          g.fillStyle = cols[(Math.random() * cols.length) | 0];
          g.fillRect(x, y, 3, 3);
        }
      return c;
    });

    let adScroll = 0;
    const CC = ["#F46524", "#00A896", "#ffe97a", "#ffffff", "#4293D0", "#E5172D", "#F3C220"];

    // ── Feuerwerk: Raketen steigen auf, explodieren in Funken-Sternen ──
    const rockets: { x: number; y: number; vy: number; ty: number; c: string }[] = [];
    const sparks: { x: number; y: number; vx: number; vy: number; c: string; life: number; max: number }[] = [];
    let fwActive = false;
    let fwFrame = 0;
    function launchRocket() {
      const tx = 50 + Math.random() * (W - 100);
      rockets.push({ x: tx, y: H + 4, vy: -(2.6 + Math.random() * 1.3), ty: 34 + Math.random() * 78, c: CC[(Math.random() * CC.length) | 0] });
    }
    function explode(x: number, y: number, color: string) {
      const n = 22 + ((Math.random() * 12) | 0);
      const two = Math.random() < 0.4; // manche Explosionen zweifarbig
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
        const sp = 0.7 + Math.random() * 1.6;
        sparks.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          c: Math.random() < 0.25 ? "#fff" : two && i % 2 ? CC[(Math.random() * CC.length) | 0] : color,
          life: 1,
          max: 0.7 + Math.random() * 0.6,
        });
      }
    }
    function updateFireworks() {
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.y += r.vy;
        r.vy += 0.03;
        px(r.x, r.y, 2, 4, r.c); // Leuchtspur
        px(r.x, r.y - 2, 2, 2, "#fff");
        if (r.y <= r.ty || r.vy >= -0.2) {
          explode(r.x, r.y, r.c);
          rockets.splice(i, 1);
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.045; // Gravitation
        s.vx *= 0.99;
        s.life -= 0.02 / s.max;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        cx!.globalAlpha = Math.max(0, Math.min(1, s.life));
        const sz = s.life > 0.6 ? 3 : 2;
        px(s.x, s.y, sz, sz, s.c);
        cx!.globalAlpha = 1;
      }
      // Während der Feier laufend nachzünden
      if (fwActive && !reduceMotion) {
        fwFrame++;
        if (fwFrame % 42 === 0 || (fwFrame < 6 && fwFrame % 2 === 0)) launchRocket();
      }
    }

    function drawStadium(now: number) {
      // Himmel
      px(0, 0, W, 40, "#0a1030");
      px(0, 40, W, 18, "#0e1740");
      px(0, 58, W, 16, "#122051");
      // Flutlichter
      for (const lx of [40, 344]) {
        px(lx - 1, 16, 2, 24, "#39466f");
        px(lx - 7, 10, 14, 7, "#1c2750");
        for (let i = 0; i < 4; i++) px(lx - 6 + i * 3.4, 12, 2, 2, "#ffe97a");
      }
      // Tribüne
      cx!.drawImage(crowd[((now / 260) | 0) % 2], 0, 74);
      px(0, 72, W, 4, "#0a0f26");
      // Werbebande
      px(0, 116, W, 14, "#0d1535");
      cx!.save();
      cx!.beginPath();
      cx!.rect(0, 116, W, 14);
      cx!.clip();
      const ad = "  WM-TIPPSPIEL 2026     NOVOTERGUM     SIEGEREHRUNG     GLUECKWUNSCH!     ";
      cx!.font = 'bold 10px "Courier New",monospace';
      cx!.textBaseline = "top";
      const aw = cx!.measureText(ad).width;
      const ax = -(adScroll % aw);
      cx!.fillStyle = "#00A896";
      cx!.fillText(ad, ax, 119);
      cx!.fillText(ad, ax + aw, 119);
      cx!.restore();
      // Rasen mit Perspektiv-Streifen
      px(0, 130, W, H - 130, "#0d6b46");
      for (let i = -4; i < 6; i += 2) {
        const x1 = 192 + i * 46,
          x2 = 192 + (i + 1) * 46;
        poly([[x1, H], [x2, H], [192 + (x2 - 192) * 0.18, 130], [192 + (x1 - 192) * 0.18, 130]], "#0b5e3d");
      }
      px(0, GROUND + 14, W, 2, "#0a4a30");
    }

    function drawPodiumBlock(i: number, p: PodiumPlace | null) {
      const s = SLOTS[i];
      const x = s.cx - s.w / 2;
      const h = GROUND - s.top + 14;
      // Block-Front + Top
      px(x, s.top, s.w, h, "#26304f");
      px(x, s.top, s.w, 5, "#3a4a73");
      px(x, s.top, 3, h, "#1a2138");
      px(x + s.w - 3, s.top, 3, h, "#1a2138");
      // Rangzahl auf der Front
      txt(String(i + 1), s.cx, s.top + 14, 20, s.medal, "center");
      // Name + Punkte auf dem Block (sobald gestartet)
      if (p) {
        txt(p.userName.slice(0, 9).toUpperCase(), s.cx, s.top + 38, 8, p.isMe ? "#ffe97a" : "#fff", "center");
        txt(p.points + " PKT", s.cx, s.top + 50, 7, "#9aa6cc", "center");
      }
    }

    // Ehrenrunde: laufendes Band mit ALLEN Teilnehmern, jeder mit Medaille
    const HONOR_START = SLOTS[0].enter + WALK_DUR + CLIMB_DUR + 1.0;
    const honorMedal = (rank: number) =>
      rank === 1 ? "#F3C220" : rank === 2 ? "#cfd3da" : rank === 3 ? "#cd7f32" : "#00A896";
    function drawHonorRoll(t: number) {
      if (t < HONOR_START) return;
      const y = 282;
      px(0, y, W, 18, "#0d1535");
      px(0, y, W, 1, "#ffe97a");
      cx!.save();
      cx!.beginPath();
      cx!.rect(0, y, W, 18);
      cx!.clip();
      cx!.font = 'bold 9px "Courier New",monospace';
      cx!.textBaseline = "middle";
      const gap = 18;
      const medalW = 15;
      const entries = players.map((p) => ({
        p,
        label: p.userName.toUpperCase(),
        w: medalW + cx!.measureText(p.userName.toUpperCase()).width + gap,
      }));
      const totalW = entries.reduce((sum, e) => sum + e.w, 0) || 1;
      const off = ((t - HONOR_START) * 36) % totalW;
      for (let pass = 0; pass < 2; pass++) {
        let x = -off + pass * totalW;
        for (const e of entries) {
          if (x + e.w > 0 && x < W) {
            // Medaille: Band + Scheibe
            px((x + 5) | 0, y + 2, 2, 4, "#c8332a");
            cx!.fillStyle = honorMedal(e.p.rank);
            cx!.beginPath();
            cx!.arc(x + 6, y + 10, 4, 0, 7);
            cx!.fill();
            px((x + 5) | 0, y + 8, 2, 2, "#ffffffaa");
            // Name
            cx!.textAlign = "left";
            cx!.fillStyle = "#000";
            cx!.fillText(e.label, x + medalW + 1, y + 10);
            cx!.fillStyle = e.p.isMe ? "#ffe97a" : "#cfe3ff";
            cx!.fillText(e.label, x + medalW, y + 9);
          }
          x += e.w;
        }
      }
      cx!.restore();
    }

    // ── Pixel-Figur ──
    function limb(lx: number, ly: number, ang: number, len: number, w: number, c: string, endc?: string) {
      cx!.save();
      cx!.translate(lx, ly);
      cx!.rotate(ang);
      px(-w / 2, 0, w, len, c);
      if (endc) px(-w / 2, len - 2, w, 3, endc);
      cx!.restore();
    }

    function drawTrophy(yTop: number) {
      // kleiner goldener Pokal, zentriert bei x=0 (figur-lokal), yTop = Oberkante
      const g = "#F3C220",
        gd = "#b8910f",
        sh = "#fff6c8";
      px(-8, yTop, 16, 3, g); // Becher-Rand
      poly([[-8, yTop + 3], [8, yTop + 3], [5, yTop + 12], [-5, yTop + 12]], g); // Kelch
      poly([[8, yTop + 3], [5, yTop + 12], [5, yTop + 4]], gd); // Schatten
      px(-2, yTop + 12, 4, 4, gd); // Stiel
      px(-6, yTop + 16, 12, 3, g); // Fuß
      // Henkel
      px(-11, yTop + 3, 3, 2, g);
      px(-12, yTop + 5, 2, 4, g);
      px(8, yTop + 3, 3, 2, g);
      px(10, yTop + 5, 2, 4, g);
      px(-5, yTop + 1, 3, 2, sh); // Glanz
    }

    function drawFigure(opt: {
      x: number;
      feetY: number;
      scale: number;
      legSwing: number;
      armUp: number; // 0 unten .. 1 über Kopf
      base: string;
      dark: string;
      light: string;
      trophy: boolean;
      isMe: boolean;
      bob: number;
    }) {
      const { base, dark, light } = opt;
      // Schatten
      cx!.fillStyle = "rgba(0,0,0,.35)";
      cx!.beginPath();
      cx!.ellipse(opt.x, opt.feetY + 1, 9 * opt.scale, 3 * opt.scale, 0, 0, 7);
      cx!.fill();

      cx!.save();
      cx!.translate(opt.x, opt.feetY - opt.bob);
      cx!.scale(opt.scale, opt.scale);
      // Statue komplett in Medaillenfarbe (Beine, Körper, Arme, Kopf) — kein Hautton
      // Beine
      limb(-3, -14, opt.legSwing, 14, 4, base, dark);
      limb(3, -14, -opt.legSwing, 14, 4, base, dark);
      // Torso mit Highlight (links) + Facette (rechts) für plastischen Statue-Look
      px(-7, -34, 14, 20, base);
      px(-7, -34, 3, 20, light);
      poly([[3, -34], [7, -14], [7, -30]], dark);
      // Arme: armUp interpoliert von ~0.3 (locker) bis über Kopf
      const aBase = 0.3 + opt.legSwing * 0.6;
      const aL = lerp(aBase, Math.PI - 0.15, opt.armUp);
      const aR = lerp(-aBase, -Math.PI + 0.15, opt.armUp);
      limb(-7, -31, aL, 12, 4, base, light);
      limb(7, -31, aR, 12, 4, base, dark);
      // Kopf (in Metallfarbe, mit Glanz)
      px(-4, -45, 9, 9, base);
      px(-4, -46, 9, 2, dark);
      px(-3, -44, 2, 2, light);
      // Pokal über erhobenen Händen
      if (opt.trophy && opt.armUp > 0.7) drawTrophy(-66);
      cx!.restore();

      // "DU"-Marker
      if (opt.isMe) {
        const my = opt.feetY - opt.scale * 50 - 14 - opt.bob;
        txt("DU", opt.x, my - 12, 9, "#ffe97a", "center");
        poly([[opt.x - 4, my], [opt.x + 4, my], [opt.x, my + 5]], "#ffe97a");
      }
    }

    function figureState(i: number, t: number) {
      const s = SLOTS[i];
      const e = t - s.enter;
      if (e < 0) return null;
      const fromLeft = s.cx < 192 || i === 1; // Silber/links von links, sonst Mitte/rechts ebenfalls von links herein
      const startX = fromLeft ? -24 : W + 24;
      let x: number,
        feetY: number,
        legSwing = 0,
        armUp = 0,
        bob = 0;
      if (e < WALK_DUR) {
        const u = easeOut(clamp(e / WALK_DUR, 0, 1));
        x = lerp(startX, s.cx, u);
        feetY = GROUND;
        legSwing = Math.sin(e * 11) * 0.5; // laufen
      } else {
        x = s.cx;
        const ce = e - WALK_DUR;
        if (ce < CLIMB_DUR) {
          const cu = easeOut(clamp(ce / CLIMB_DUR, 0, 1));
          feetY = lerp(GROUND, s.top, cu);
          legSwing = Math.sin(ce * 16) * 0.35; // Stufen steigen
        } else {
          feetY = s.top;
          const idle = ce - CLIMB_DUR;
          bob = Math.abs(Math.sin(idle * 3)) * 2; // jubelndes Wippen
          const medalAt = 0.25;
          if (idle > medalAt) armUp = clamp((idle - medalAt) / 0.5, 0, 1) * (s.trophy ? 1 : 0.55);
        }
      }
      const medalShown = e > WALK_DUR + CLIMB_DUR + 0.3;
      return { x, feetY, legSwing, armUp, bob, medalShown, slot: s };
    }

    let raf = 0;
    let localRun = -1;
    function frame(now: number) {
      // Replay erkannt -> Feuerwerk-Zustand zurücksetzen
      if (runRef.current.runId !== localRun) {
        localRun = runRef.current.runId;
        fwActive = false;
        fwFrame = 0;
        rockets.length = 0;
        sparks.length = 0;
      }

      adScroll = now * 0.03;
      drawStadium(now);

      const playing = startedRef.current;
      const t = playing ? (now - runRef.current.t0) / 1000 : -1;

      for (let i = 0; i < Math.min(podium.length, 3); i++) drawPodiumBlock(i, playing ? podium[i] : null);

      // Feier-Trigger beim Pokal-Lift (Gold = index 0): Feuerwerk + Fanfare
      const gold = playing && podium.length > 0 ? figureState(0, t) : null;
      if (gold && gold.armUp > 0.85 && !runRef.current.celebrated) {
        runRef.current.celebrated = true;
        fwActive = true;
        if (!reduceMotion) {
          launchRocket();
          launchRocket();
        }
        fanfare();
        setTimeout(() => setDone(true), 600);
      }

      // Figuren zeichnen — hinten (Silber/Bronze) zuerst, Gold zuletzt
      const order = [1, 2, 0];
      for (const i of order) {
        if (i >= podium.length) continue;
        const p = podium[i];
        const st = playing ? figureState(i, t) : null;
        if (st) {
          drawFigure({
            x: st.x,
            feetY: st.feetY,
            scale: i === 0 ? 2.5 : 2.2,
            legSwing: st.legSwing,
            armUp: st.armUp,
            base: STATUE[i].base,
            dark: STATUE[i].dark,
            light: STATUE[i].light,
            trophy: st.slot.trophy,
            isMe: p.isMe,
            bob: st.bob,
          });
        }
      }

      // Feuerwerk (steigt vor Tribüne/Himmel, hinter HUD)
      updateFireworks();

      // Ehrenrunde: ALLE Mitspieler bekommen eine Medaille (Laufband)
      if (playing) drawHonorRoll(t);

      // HUD
      px(6, 6, 150, 14, "rgba(0,0,0,.8)");
      px(6, 6, 3, 14, "#F46524");
      txt("SIEGEREHRUNG", 14, 9, 9, "#fff");
      px(W - 52, 6, 46, 12, "rgba(0,0,0,.8)");
      txt("WM'26", W - 47, 8, 8, "#00A896");

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [players]);

  if (podium.length === 0) {
    return (
      <div style={{ color: "#fff", textAlign: "center" }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🏆</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Noch keine Tipps gewertet</div>
        <Link href="/" style={{ display: "inline-block", marginTop: 20, color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
          ← zurück zum Tippspiel
        </Link>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: 760, textAlign: "center" }}>
      {preview && (
        <div
          style={{
            display: "inline-block",
            marginBottom: 14,
            padding: "6px 14px",
            borderRadius: 20,
            background: "rgba(243,146,0,0.18)",
            border: "1px solid #F3920066",
            color: "#ffce80",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "'Courier New',monospace",
          }}
        >
          👁️ VORSCHAU · GENERALPROBE ({finishedMatches} SPIELE)
        </div>
      )}

      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 640,
          margin: "0 auto",
          aspectRatio: "384 / 300",
          background: "#000",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow:
            "0 0 0 6px #15151c, 0 0 0 8px #2a2a36, 0 30px 80px rgba(0,0,0,.8), inset 0 0 120px rgba(0,0,0,.55)",
        }}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", imageRendering: "pixelated" }}
        />
        {/* CRT-Scanlines */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            mixBlendMode: "multiply",
            opacity: 0.5,
            background:
              "repeating-linear-gradient(0deg, rgba(255,255,255,.97) 0 2px, rgba(150,160,185,.78) 2px 4px)",
          }}
        />
        {/* Vignette */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: "radial-gradient(110% 95% at 50% 45%, transparent 55%, rgba(0,0,0,.5) 100%)",
          }}
        />
        {/* Start-Overlay */}
        {!started && (
          <button
            onClick={start}
            style={{
              position: "absolute",
              inset: 0,
              border: "none",
              cursor: "pointer",
              background: "rgba(5,6,12,0.82)",
              color: "#fff",
              fontFamily: "'Courier New',monospace",
              letterSpacing: "0.08em",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
            }}
          >
            <div style={{ fontSize: "clamp(20px,5vw,36px)", fontWeight: "bold", textShadow: "3px 3px 0 #F46524, 6px 6px 0 #00000088" }}>
              🏆 SIEGEREHRUNG
            </div>
            <div style={{ fontSize: "clamp(11px,2.4vw,15px)", color: "#ffe97a", animation: "sePress 1.1s step-end infinite" }}>
              – PRESS START –
            </div>
            <div style={{ fontSize: "clamp(9px,1.8vw,12px)", color: "#7e88aa" }}>WM-TIPPSPIEL 2026 · MIT TON</div>
            <style>{`@keyframes sePress{50%{opacity:0}}`}</style>
          </button>
        )}
      </div>

      <div style={{ marginTop: 20, display: "flex", gap: 16, justifyContent: "center", alignItems: "center" }}>
        {(started || done) && (
          <button
            type="button"
            onClick={start}
            style={{
              padding: "10px 22px",
              background: "#F39200",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "'Courier New',monospace",
              letterSpacing: "0.04em",
            }}
          >
            ↻ NOCHMAL
          </button>
        )}
        <Link
          href="/"
          style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, textDecoration: "none", fontFamily: "'Courier New',monospace" }}
        >
          ← zurück zum Tippspiel
        </Link>
      </div>
    </div>
  );
}
