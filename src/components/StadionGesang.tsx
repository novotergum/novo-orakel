"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Stadion-Atmosphäre-Toggle (standardmaessig AUS). Erzeugt per Web Audio API
 * einen dezenten, warmen Crowd-Geräuschteppich (gedämpftes braunes Rauschen mit
 * langsamen Jubel-Schwellungen) – bewusst KEIN synthetischer "Olé"-Gesang mehr
 * (der klang grell). Kein externes Audio-File, daher keine Lizenz-/Hosting-Frage.
 * Start nur per Klick (Autoplay-Policy ok).
 *
 * Echte Stadion-MP3 stattdessen gewuenscht? Datei nach /public legen und hier
 * abspielen – klingt natürlicher als die Synthese.
 */
export default function StadionGesang() {
  const [on, setOn] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

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
    // dezent: sanft auf moderate Lautstärke einblenden
    master.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 1.2);

    // Braunes Rauschen als Crowd-Basis
    const bufSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    // Warm & "fern": Tiefpass statt schrillem Bandpass; Hochpass killt Wummern.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 850;
    lp.Q.value = 0.4;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 90;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.5;

    // Langsame Schwellungen (Jubel kommt und geht) – ruhig.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.14;
    lfo.connect(lfoGain);
    lfoGain.connect(noiseGain.gain);

    noise.connect(hp);
    hp.connect(lp);
    lp.connect(noiseGain);
    noiseGain.connect(master);
    noise.start();
    lfo.start();

    stopRef.current = () => {
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
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
      }, 450);
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
      title={on ? "Stadion-Sound aus" : "Stadion-Sound an"}
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
      <span>Stadion-Sound</span>
      {on && (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#fff",
            animation: "stadion-pulse 1.4s infinite",
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
