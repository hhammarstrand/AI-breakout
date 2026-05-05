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
  // Browsers can leave an AudioContext in "suspended" state until an
  // explicit resume() inside a user gesture. Some OS/browser combos also
  // re-suspend on tab idle. Touching the context cheaply nudges it back.
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function on() { return state.get().audio && ensureCtx(); }

// Force-resume hook — wired into the audio toggle button + first-keystroke
// listener so that any user gesture reliably wakes the context.
// Also fires a silent warmup oscillator the very first time we successfully
// resume; some browsers won't actually emit audio until the first scheduled
// node has played, even after state === "running".
let warmedUp = false;
export function ensureAudioRunning() {
  if (!ctx) ensureCtx();
  if (!ctx) return Promise.resolve();
  const after = () => {
    if (warmedUp) return;
    if (ctx.state !== "running") return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.0001; // inaudible
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.05);
      warmedUp = true;
    } catch {}
  };
  if (ctx.state !== "running") {
    return ctx.resume().then(after).catch(() => {});
  }
  after();
  return Promise.resolve();
}

// Richer ambient: detuned drone-pad (beating sines) + filtered noise layer
// (HVAC hiss with slow LFO on cutoff) + breathing tremolo on the drone.
// Aim: warm, ominous, alive — not annoying.
export function startAmbient() {
  if (!on() || ambientNode) return;

  // master gain so we can fade everything together
  ambientGain = ctx.createGain();
  ambientGain.gain.value = 0;
  ambientGain.connect(ctx.destination);
  // smooth fade-in over ~3s
  ambientGain.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 3);

  // ---- drone pad ----
  // four sines, slightly detuned, through a soft lowpass
  const droneLp = ctx.createBiquadFilter();
  droneLp.type = "lowpass";
  droneLp.frequency.value = 380;
  droneLp.Q.value = 0.6;

  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.038;

  const droneOscs = [55, 55.4, 110.7, 165.3].map((f) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    o.connect(droneLp);
    o.start();
    return o;
  });
  droneLp.connect(droneGain);
  droneGain.connect(ambientGain);

  // breathing tremolo on the drone gain (LFO ~0.13Hz, ±0.012 depth)
  const tremolo = ctx.createOscillator();
  tremolo.type = "sine";
  tremolo.frequency.value = 0.13;
  const tremoloDepth = ctx.createGain();
  tremoloDepth.gain.value = 0.012;
  tremolo.connect(tremoloDepth);
  tremoloDepth.connect(droneGain.gain);
  tremolo.start();

  // ---- filtered noise (HVAC) ----
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = (Math.random() * 2 - 1) * 0.5;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;

  const noiseLp = ctx.createBiquadFilter();
  noiseLp.type = "lowpass";
  noiseLp.frequency.value = 520;
  noiseLp.Q.value = 0.8;

  const noiseHp = ctx.createBiquadFilter();
  noiseHp.type = "highpass";
  noiseHp.frequency.value = 90;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.022;

  noise.connect(noiseHp);
  noiseHp.connect(noiseLp);
  noiseLp.connect(noiseGain);
  noiseGain.connect(ambientGain);
  noise.start();

  // slow LFO on noise filter cutoff so the "wind" breathes
  const noiseLfo = ctx.createOscillator();
  noiseLfo.type = "sine";
  noiseLfo.frequency.value = 0.07;
  const noiseLfoDepth = ctx.createGain();
  noiseLfoDepth.gain.value = 180;
  noiseLfo.connect(noiseLfoDepth);
  noiseLfoDepth.connect(noiseLp.frequency);
  noiseLfo.start();

  ambientNode = { droneOscs, tremolo, noise, noiseLfo };
}

export function stopAmbient() {
  if (!ambientNode) return;
  // quick fade-out before stopping to avoid clicks
  if (ambientGain) {
    const now = ctx.currentTime;
    ambientGain.gain.cancelScheduledValues(now);
    ambientGain.gain.setValueAtTime(ambientGain.gain.value, now);
    ambientGain.gain.linearRampToValueAtTime(0, now + 0.4);
  }
  const node = ambientNode;
  ambientNode = null;
  setTimeout(() => {
    try { node.droneOscs.forEach((o) => o.stop()); } catch {}
    try { node.tremolo.stop(); } catch {}
    try { node.noise.stop(); } catch {}
    try { node.noiseLfo.stop(); } catch {}
  }, 450);
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

// throttled per-char typewriter click — at most one click per ~38ms so
// fast typing (intro at 6-12ms/char) still sounds organic rather than
// a buzzsaw. Slow typing (survivor at 30-70ms/char) plays per-char.
let lastTypeAt = 0;
function typewriterClick(ch) {
  if (!on()) return;
  // skip whitespace + newlines to avoid clicks on indentation
  if (ch === " " || ch === "\n" || ch === "\t" || ch === "") return;
  const now = performance.now();
  if (now - lastTypeAt < 38) return;
  lastTypeAt = now;
  // small randomization — feels more like a real keyboard
  const f = 1600 + (Math.random() * 400 - 200);
  blip(f, 0.012, "square", 0.02);
}

export const sfx = {
  key()    { blip(1100, 0.02, "square", 0.025); },
  // Per-character click for typewriter output. Throttled so fast typing
  // (5-15ms/char) becomes a low rumble instead of 100+ blips/second.
  type:    typewriterClick,
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

  // ========= rich event stings (Tier S phase 5) =========
  // unlock: triumphant rising arpeggio on level/sub-objective complete
  unlock() {
    if (!on()) return;
    blip(523, 0.07, "triangle", 0.06);                                 // C5
    setTimeout(() => blip(659, 0.07, "triangle", 0.06),  90);          // E5
    setTimeout(() => blip(784, 0.10, "triangle", 0.07), 180);          // G5
    setTimeout(() => blip(1047, 0.18, "triangle", 0.07), 270);         // C6
  },
  // bigwrong: heavier "rejected" stinger for important rejections (L4 auth)
  bigwrong() {
    if (!on()) return;
    blip(330, 0.10, "sawtooth", 0.07);
    setTimeout(() => blip(247, 0.14, "sawtooth", 0.07), 100);
    setTimeout(() => blip(196, 0.22, "sawtooth", 0.06), 240);
  },
  // breach: dramatic "containment override accepted" fanfare for L4 success
  breach() {
    if (!on()) return;
    // bass swell
    blip(110, 0.4, "sine",   0.06);
    blip(165, 0.4, "sine",   0.05);
    // ascending lead
    setTimeout(() => blip(523, 0.10, "square", 0.05),   0);
    setTimeout(() => blip(659, 0.10, "square", 0.05), 110);
    setTimeout(() => blip(784, 0.10, "square", 0.05), 220);
    setTimeout(() => blip(988, 0.18, "square", 0.06), 330);
    setTimeout(() => blip(1319,0.30, "square", 0.06), 540);
    // closing chord
    setTimeout(() => { blip(523,0.5,"triangle",0.04); blip(659,0.5,"triangle",0.04); blip(784,0.5,"triangle",0.04); }, 900);
  },
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

