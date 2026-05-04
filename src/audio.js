// WebAudio SFX & ambient. Stub-able via state.audio toggle.
// Uses oscillators only — no audio assets needed.

import { state } from "./state.js";

let ctx = null;
let ambientGain = null;
let ambientNode = null;

function ensureCtx() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { ctx = null; }
  }
  return ctx;
}

function on() { return state.get().audio && ensureCtx(); }

export function startAmbient() {
  if (!on() || ambientNode) return;
  // low rumble + faint hum to suggest a server room
  const rumble = ctx.createOscillator();
  rumble.type = "sine";
  rumble.frequency.value = 55;
  const hum = ctx.createOscillator();
  hum.type = "sawtooth";
  hum.frequency.value = 110;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 280;
  ambientGain = ctx.createGain();
  ambientGain.gain.value = 0.018;
  rumble.connect(lp); hum.connect(lp); lp.connect(ambientGain);
  ambientGain.connect(ctx.destination);
  rumble.start(); hum.start();
  ambientNode = { rumble, hum };
}

export function stopAmbient() {
  if (!ambientNode) return;
  try { ambientNode.rumble.stop(); ambientNode.hum.stop(); } catch {}
  ambientNode = null;
}

export function refreshAudio() {
  if (state.get().audio) startAmbient();
  else stopAmbient();
}

function blip(freq = 880, dur = 0.04, type = "square", gain = 0.04) {
  if (!on()) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(); o.stop(ctx.currentTime + dur);
}

export const sfx = {
  key()    { blip(1100, 0.02, "square", 0.025); },
  ok()     { blip(880, 0.06, "sine", 0.05); setTimeout(() => blip(1320, 0.08, "sine", 0.05), 60); },
  nope()   { blip(220, 0.08, "sawtooth", 0.06); setTimeout(() => blip(180, 0.12, "sawtooth", 0.06), 70); },
  alarm()  {
    if (!on()) return;
    blip(660, 0.12, "square", 0.05);
    setTimeout(() => blip(440, 0.12, "square", 0.05), 130);
    setTimeout(() => blip(660, 0.12, "square", 0.05), 260);
  },
  glitch() {
    if (!on()) return;
    for (let i = 0; i < 6; i++) {
      setTimeout(() => blip(200 + Math.random() * 800, 0.03, "sawtooth", 0.04), i * 25);
    }
  },
  save()   { blip(1500, 0.04, "square", 0.04); setTimeout(() => blip(1200, 0.06, "square", 0.04), 50); },
};

// Plays morse audibly using short/long beeps. dits=120ms longs=360ms gap=120ms letter-gap=360ms word-gap=720ms
export async function playMorse(seq, { dot = 120, freq = 700 } = {}) {
  if (!on()) return;
  const dash = dot * 3;
  const inner = dot;
  const letterGap = dot * 3;
  const wordGap = dot * 7;
  for (const ch of seq) {
    if (ch === ".") { tone(freq, dot); await sleep(dot + inner); }
    else if (ch === "-") { tone(freq, dash); await sleep(dash + inner); }
    else if (ch === " ") { await sleep(letterGap); }
    else if (ch === "/") { await sleep(wordGap); }
  }
}

function tone(freq, ms) {
  if (!on()) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.05, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
  o.connect(g); g.connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + ms / 1000);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ============== heartbeat ==============
// Plays a low double-thump on a self-scheduling timer. Tempo follows BPM.
// Volume scales up as the rate increases (ramps tension).

let heartbeatTimer = null;
let heartbeatBpm = 0;

function thump(volume = 0.05) {
  if (!on()) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(120, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(48, ctx.currentTime + 0.13);
  g.gain.setValueAtTime(volume, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
  o.connect(g); g.connect(ctx.destination);
  o.start(); o.stop(ctx.currentTime + 0.18);
}

export function setHeartbeat(bpm) {
  heartbeatBpm = bpm | 0;
  if (heartbeatTimer) { clearTimeout(heartbeatTimer); heartbeatTimer = null; }
  if (!heartbeatBpm) return;
  scheduleHeart();
}

function scheduleHeart() {
  if (!heartbeatBpm) return;
  const interval = 60_000 / heartbeatBpm;
  heartbeatTimer = setTimeout(() => {
    if (!state.get().audio) { scheduleHeart(); return; }
    const vol = Math.min(0.07, 0.025 + Math.max(0, heartbeatBpm - 80) * 0.0015);
    thump(vol);
    setTimeout(() => thump(vol * 0.65), Math.max(110, interval * 0.18));
    scheduleHeart();
  }, interval);
}

