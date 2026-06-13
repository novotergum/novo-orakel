"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Stadion-Sound-Toggle (standardmaessig AUS). Erzeugt selbst per Web Audio API
 * eine Stadion-Atmosphaere: Geraeuschteppich (gefiltertes Rauschen mit langsamen
 * Schwellungen) + einen geloopten "Olé"-Fangesang. Kein externes Audio-File,
 * daher keine Lizenz-/Hosting-Fragen. Start nur per Klick (Autoplay-Policy ok).
 *
 * Echte MP3 stattdessen gewuenscht? Datei nach /public legen und hier abspielen.
 */

// "Olé, olé olé olé …" – Kontur des Terrassen-Gesangs (Frequenz Hz, Dauer s).
const MELODY: { f: number; d: number }[] = [
  { f: 392.0, d: 0.34 }, // o
  { f: 523.25, d: 0.34 }, // lé
  { f: 392.0, d: 0.34 }, // o
  { f: 523.25, d: 0.34 }, // lé
  { f: 392.0, d: 0.34 }, // o
  { f: 523.25, d: 0.34 }, // lé
  { f: 392.0, d: 0.44 }, // o
  { f: 523.25, d: 0.5 }, // lé
  { f: 440.0, d: 0.34 }, // o
  { f: 392.0, d: 0.5 }, // lé
  { f: 349.23, d: 0.34 }, // o
  { f: 329.63, d: 0.6 }, // lé
];
const LOOP_REST = 1.4; // Pause zwischen den Gesang-Durchläufen (s)

export default function StadionGesang() {
  const [on, setOn] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  // Aufräumen beim Unmount.
  useEffect(() => {
    return () => {
      stopRef.current?.();
      ctxRef.current?.close?.().catch(() => {});
    };
  }, []);

  function start() {
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;

    const ctx = ctxRef.current ?? new AC();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    master.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.8);

    // ── Geräuschteppich (Crowd) ──────────────────────────────────────────
    const bufSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // brownish noise -> Stadion-Rauschen
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 600;
    bp.Q.value = 0.7;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.2;
    // Langsame Schwellungen (Jubel kommt und geht)
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.09;
    lfo.connect(lfoGain);
    lfoGain.connect(noiseGain.gain);
    noise.connect(bp);
    bp.connect(noiseGain);
    noiseGain.connect(master);
    noise.start();
    lfo.start();

    // ── Fangesang ("Olé") ────────────────────────────────────────────────
    function playNote(f: number, t: number, d: number) {
      const o1 = ctx.createOscillator();
      o1.type = "sawtooth";
      o1.frequency.value = f;
      const o2 = ctx.createOscillator();
      o2.type = "sawtooth";
      o2.frequency.value = f;
      o2.detune.value = 8; // leicht verstimmt -> "viele Stimmen"
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.04);
      g.gain.setValueAtTime(0.5, t + d - 0.07);
      g.gain.linearRampToValueAtTime(0, t + d);
      // Vibrato
      const vib = ctx.createOscillator();
      vib.frequency.value = 5;
      const vibg = ctx.createGain();
      vibg.gain.value = 6;
      vib.connect(vibg);
      vibg.connect(o1.detune);
      vibg.connect(o2.detune);
      o1.connect(lp);
      o2.connect(lp);
      lp.connect(g);
      g.connect(master);
      o1.start(t);
      o2.start(t);
      vib.start(t);
      o1.stop(t + d);
      o2.stop(t + d);
      vib.stop(t + d);
    }

    let timer: ReturnType<typeof setTimeout>;
    function scheduleLoop() {
      const t0 = ctx.currentTime + 0.1;
      let t = t0;
      for (const n of MELODY) {
        playNote(n.f, t, n.d);
        t += n.d;
      }
      const total = t - t0 + LOOP_REST;
      timer = setTimeout(scheduleLoop, total * 1000);
    }
    scheduleLoop();

    stopRef.current = () => {
      clearTimeout(timer);
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          noise.stop();
        } catch {
          // already stopped
        }
        try {
          lfo.stop();
        } catch {
          // already stopped
        }
      }, 350);
    };
  }

  function toggle() {
    if (on) {
      stopRef.current?.();
      stopRef.current = null;
      setOn(false);
    } else {
      start();
      setOn(true);
    }
  }

  return (
    <button
      onClick={toggle}
      aria-pressed={on}
      title={on ? "Stadiongesang aus" : "Stadiongesang an"}
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        borderRadius: 999,
        border: on ? "1px solid #F39200" : "1px solid #e0ddd9",
        background: on ? "#F39200" : "#ffffff",
        color: on ? "#fff" : "#3A3A3A",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        boxShadow: on
          ? "0 4px 18px rgba(243,146,0,0.4)"
          : "0 2px 12px rgba(0,0,0,0.12)",
        transition: "all 0.2s",
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>{on ? "🔊" : "🔇"}</span>
      <span>Stadiongesang</span>
      {on && (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#fff",
            animation: "stadion-pulse 1s infinite",
          }}
        />
      )}
      <style>{`
        @keyframes stadion-pulse {
          0% { opacity: 1; }
          50% { opacity: 0.3; }
          100% { opacity: 1; }
        }
      `}</style>
    </button>
  );
}
