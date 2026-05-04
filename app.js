// Entry point. Wires terminal, state, audio, ops panel, atmosphere,
// and the level state machine.

import { Terminal, parseCommand } from "./src/terminal.js";
import { state } from "./src/state.js";
import { sfx, refreshAudio, startAmbient, setHeartbeat } from "./src/audio.js";
import { nextHint, registerHints, hintCount } from "./src/hints.js";
import { registerPrompts, getPrompts } from "./src/prompts.js";
import { ops } from "./src/opspanel.js";
import { atmosphere } from "./src/atmosphere.js";
import { getMission } from "./src/seed.js";

import { intro }   from "./src/levels/intro.js";
import { level1 }  from "./src/levels/level1_survivor.js";
import { level2 }  from "./src/levels/level2_decrypt.js";
import { level3 }  from "./src/levels/level3_door_agent.js";
import { level4 }  from "./src/levels/level4_breach.js";
import { outro }   from "./src/levels/outro.js";

const levels = { 0: intro, 1: level1, 2: level2, 3: level3, 4: level4, 5: outro };

const term = new Terminal(
  document.getElementById("terminal"),
  document.getElementById("prompt-input"),
  document.getElementById("prompt-label"),
);

const ui = {
  progress: document.getElementById("hud-progress"),
  score: document.getElementById("hud-score"),
  timer: document.getElementById("hud-timer"),
  audioBtn: document.getElementById("audio-toggle"),
  crt: document.querySelector(".crt"),
  glitchOverlay: document.getElementById("glitch-overlay"),
};

function refreshHUD() {
  const s = state.get();
  ui.progress.textContent = `${s.completed.length}/${state.totalLevels}`;
  ui.score.textContent = s.score;
}

function updateTimer() {
  const ms = state.containmentRemainingMs();
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const ss = (totalSec % 60).toString().padStart(2, "0");
  ui.timer.textContent = `${m}:${ss}`;
  ops.updateThermite(ms);
  if (totalSec <= 0) {
    ui.crt.classList.add("danger");
    ui.timer.textContent = "00:00";
  } else if (totalSec < 600) {
    ui.crt.classList.add("danger");
  } else {
    ui.crt.classList.remove("danger");
  }
}

// Adjust heartbeat audio based on current level + remaining time.
// Survivor BPM ramps with progression and accelerates under low time.
function updateHeartbeat() {
  const s = state.get();
  const remaining = state.containmentRemainingMs();
  if (s.level <= 0 || s.level >= 5) { setHeartbeat(0); return; }
  let bpm = 84;
  if (s.completed.includes(1)) bpm = 96;
  if (s.level >= 3) bpm = 110;
  if (s.level >= 4) bpm = 124;
  if (remaining < 12 * 60 * 1000) bpm += 14;
  if (remaining < 5  * 60 * 1000) bpm += 10;
  setHeartbeat(bpm);
}

function fireGlitch() {
  if (!ui.glitchOverlay) return;
  ui.glitchOverlay.classList.remove("active");
  // force reflow so animation can replay
  void ui.glitchOverlay.offsetWidth;
  ui.glitchOverlay.classList.add("active");
  sfx.glitch();
}

// quick subtle screen flicker — used as ambient "alive" pulse mid-level.
function miniGlitch() {
  if (!ui.crt) return;
  ui.crt.classList.remove("miniglitch");
  void ui.crt.offsetWidth;
  ui.crt.classList.add("miniglitch");
  setTimeout(() => ui.crt.classList.remove("miniglitch"), 360);
}

function applyLevelTheme(n) {
  if (!ui.crt) return;
  for (let i = 0; i <= 5; i++) ui.crt.classList.remove(`theme-${i}`);
  ui.crt.classList.add(`theme-${n}`);
}

function scheduleAmbientPulse() {
  const wait = 18_000 + Math.random() * 22_000;
  setTimeout(() => {
    const lvl = state.get().level;
    if (lvl >= 1 && lvl <= 4) {
      // 70% mini glitch, 30% small bpm jitter for ambient life
      if (Math.random() < 0.7) miniGlitch();
      else jitterSurvivorBpm();
    }
    scheduleAmbientPulse();
  }, wait);
}

function jitterSurvivorBpm() {
  // small heartbeat fluctuation for survivor when she has a tracked BPM
  // (purely visual — keeps the ops panel feeling alive)
  const bpmEl = document.getElementById("bpm-val");
  if (!bpmEl || !bpmEl.textContent || bpmEl.textContent === "—") return;
  const m = bpmEl.textContent.match(/(\d+)/);
  if (!m) return;
  const base = parseInt(m[1], 10);
  const jitter = Math.round((Math.random() - 0.5) * 6);
  bpmEl.textContent = `${base + jitter} bpm`;
  setTimeout(() => { bpmEl.textContent = `${base} bpm`; }, 1400);
}

let activeLevel = null;

function setLabel() {
  const s = state.get();
  const stage = s.level >= 5 ? "extracted" : `lvl-${s.level || 0}`;
  term.setLabel(`op@blackout:${stage}$`);
}

const ctx = {
  term,
  state,
  sfx,
  registerHints,
  nextHint,
  hintCount,
  registerPrompts,
  go(n) { runLevel(n); },
  refreshHUD,
};

async function runLevel(n) {
  const prev = state.get().level;
  state.setLevel(n);
  setLabel();
  refreshHUD();
  applyLevelTheme(n);
  if (prev !== n && n > 0) fireGlitch();
  activeLevel = levels[n];
  if (!activeLevel) {
    term.println(`[fatal] no module for level ${n}`, "danger");
    return;
  }
  await activeLevel.start(ctx);
  updateHeartbeat();
}

function dispatch(line) {
  sfx.key();
  const args = parseCommand(line);
  const cmd = (args[0] || "").toLowerCase();
  const rest = args.slice(1);

  if (handleGlobal(cmd, rest, line)) { refreshHUD(); return; }
  if (activeLevel && activeLevel.onCommand) {
    activeLevel.onCommand(cmd, rest, line, ctx);
    refreshHUD();
    return;
  }
  term.println(`unknown command: ${cmd} — type 'help'`, "warn");
}

function handleGlobal(cmd, rest) {
  switch (cmd) {
    case "help":     return globalHelp();
    case "tutorial":
    case "how":
    case "howto":    return showTutorial();
    case "clear":    term.clear(); return true;
    case "status":   return showStatus();
    case "team":     return setTeam(rest);
    case "share":    return doShare();
    case "seed":     return showSeed();
    case "prompts":
    case "prompt":   return showPrompts();
    case "journal":
    case "log":      return showJournal();
    case "reader":   return toggleReader();
    case "wiki":     return showWiki(rest);
    case "inventory":
    case "inv":      return showInventory();
    case "hint":     return giveHint();
    case "audio":    return toggleAudio();
    case "reset":    return doReset(rest[0] === "--confirm");
    case "skip":
      if (new URLSearchParams(location.search).get("dev") === "1") {
        const next = state.get().level + 1;
        term.println(`[dev] skipping to level ${next}`, "warn");
        runLevel(next);
        return true;
      }
      return false;
  }
  return false;
}

function globalHelp() {
  term.printBlock(
`global commands:
  help              — show this list
  tutorial | how    — explain how the game works (read this first!)
  status            — mission status (with team share line for facilitator)
  team <name>       — label your team (shown on status share)
  share             — copy your status / final result link to clipboard
  seed              — show your mission seed (and how to change it)
  prompts           — show vetted starter prompts for the current level's AI work
  journal | log     — replay all clues/events you've collected (great for late joiners)
  reader            — toggle reader mode (kills flicker/scanlines, bumps font)
  wiki <topic>      — query the building docs (caveat: generated content not always accurate)
  inventory | inv   — list collected fragments
  hint              — request a hint (first free per level, then -5 pts)
  brief             — re-read the current level briefing
  clear             — clear the terminal
  audio             — toggle SFX
  reset --confirm   — wipe all progress

level-specific commands appear after each briefing. type 'brief' to re-read it.`,
    "dim"
  );
  return true;
}

function showTutorial() {
  term.println("", "");
  term.println("=== HOW BLACKOUT WORKS ===", "system");
  term.println("", "");
  term.printBlock(
`YOU are remote operators sitting at this console. Your job is to guide
Dr. Nordlund out of an infected research tower in ~60 real minutes.

The whole experience is TEXT — you type commands at the bottom prompt
and press Enter. The live ops panel on the right reflects state.`,
    "info"
  );
  term.println("", "");
  term.printBlock(
`THE PROMPT (bottom of screen)
  • type a command, press Enter to submit
  • ↑ / ↓ recalls previous commands
  • the label 'op@blackout:lvl-N$' shows which level you're on

THE 4 LEVELS (~12 min each)
  L1  locate the survivor + identify hostile rooms (sensors + CCTV)
  L2  decrypt 3 lab logs to find the project codename
  L3  build a door-routing agent to plot a safe path to the roof
  L4  combine fragments + decoded morse to override containment

THE AI IS YOUR PARTNER — THIS IS THE WHOLE POINT
  • open Claude / Copilot / Gemini in a side window or second screen
  • each puzzle gives you data (sensor logs, ciphertext, code spec...)
  • PASTE that data into the AI and ask for help
  • the AI does the mechanical work; you verify and synthesize
  • without AI you cannot finish in time — that is intentional

THE OPS PANEL (right side)
  • floor plan lights up rooms as you scan them (cool/warm/hot/survivor)
  • survivor vitals show heart rate + emergency tag status
  • drone shows current position + battery
  • thermite bar = remaining time. at 00:00 the building self-sterilizes

WHEN YOU GET STUCK
  • 'brief' — re-read the current level's briefing
  • 'help' — list global commands
  • 'hint' — first hint per level is free, then -5 pts each
  • each level's briefing lists its own command set under "Commands:"

GETTING STARTED RIGHT NOW
  • if you see the boot logo + briefing, type:  begin
  • once in a level, follow the "Commands:" line shown after the brief
  • inventory + score persist between refreshes; the timer keeps running`,
    "dim"
  );
  term.println("", "");
  term.println("ready? type 'begin' to start, or 'brief' to re-read the current level.", "accent");
  return true;
}

function showStatus() {
  const s = state.get();
  const elapsed = elapsedString();
  const team = s.teamName || "(unnamed)";
  const lvl = s.level >= 5 ? "EXTRACTED" : `L${s.level || 0}`;
  const m = getMission();
  term.printBlock(
`team      : ${team}
seed      : ${m.seed}
mission   : OPERATION LIFELINE
status    : ${s.completed.length === 4 ? "EXTRACTED" : "ACTIVE — " + lvl}
progress  : ${s.completed.length}/${state.totalLevels} levels
score     : ${s.score}
elapsed   : ${elapsed}
hints     : ${s.hintsUsed}
errors    : ${s.wrongAttempts}
items     : ${s.inventory.length ? s.inventory.join(", ") : "(none)"}`,
    "dim"
  );
  term.println("", "");
  term.println("share line — paste this in Slack/Teams to update the facilitator:", "muted");
  term.println("  " + buildShareLine(), "info");
  if (!s.teamName) {
    term.println("  (set a team name first: type 'team <name>')", "muted");
  }
  term.println("type 'share' to copy a facilitator URL to your clipboard.", "muted");
  return true;
}

function setTeam(rest) {
  const name = rest.join(" ").trim();
  if (!name) {
    const cur = state.get().teamName;
    term.println(cur ? `team name: ${cur}` : "no team name set. usage: team <name>", "muted");
    return true;
  }
  state.setTeamName(name);
  term.println(`team name set: ${state.get().teamName}`, "accent");
  return true;
}

function elapsedString() {
  const s = state.get();
  if (!s.containmentStart) return "—";
  const endRef = s.extractedAt || Date.now();
  const totalSec = Math.max(0, Math.floor((endRef - s.containmentStart) / 1000));
  const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const ss = (totalSec % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

function buildShareLine() {
  const s = state.get();
  const team = s.teamName || "UNNAMED";
  const stage = s.completed.length === 4 ? "EXTRACTED" : `L${s.level || 0}`;
  return `[BLACKOUT] TEAM ${team} · ${stage} · ${s.score} pts · ${elapsedString()} · ${s.hintsUsed} hints · ${s.wrongAttempts} errors`;
}

function buildStatusUrl() {
  const s = state.get();
  const elapsedSec = (() => {
    if (!s.containmentStart) return 0;
    const endRef = s.extractedAt || Date.now();
    return Math.max(0, Math.floor((endRef - s.containmentStart) / 1000));
  })();
  const payload = {
    team: s.teamName || "",
    lvl: s.level,
    completed: s.completed.length,
    score: s.score,
    elapsed: elapsedSec,
    hints: s.hintsUsed,
    errors: s.wrongAttempts,
    extracted: !!s.extractedAt,
    at: Date.now(),
  };
  const enc = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  return `${location.origin}${location.pathname}?status=${enc}`;
}

function showSeed() {
  const m = getMission();
  term.println("", "");
  term.printBlock(
`mission seed: ${m.seed}

Each seed picks a different codename + strain ID, so two teams with
different seeds cannot share auth codes. Doors and rooms stay the same.

To play with a different seed, append ?seed=<anything> to the URL:
  ${location.origin}${location.pathname}?seed=alpha
  ${location.origin}${location.pathname}?seed=team7
  ${location.origin}${location.pathname}?seed=$(date +%s)

The facilitator usually announces a per-team seed at the start of a workshop.`,
    "info"
  );
  return true;
}

// ============== wiki — hallucination teaching tool ==============
// Confident, well-formatted entries on EVERY query. Real topics return
// real (terse) info. Decoy topics return believable but FALSE info.
// Unknown queries get plausible-looking generated content. A single
// quiet footer line marks generated entries — players who copy-paste
// this into Claude/Copilot as ground truth get burned.

const WIKI_REAL = {
  "paraply": "Paraply Bioteknik AB. Privately-held biotech; Helix Tower headquarters. Class-IV containment certified 2024. CEO: undisclosed.",
  "helix-tower": "12-floor research tower in central campus. Floor 4 is the wet-lab + bio-3 vault. Building management system: paraply-bms-helix.",
  "aegis": "Project codename used internally at Paraply for a class-IV mycology trial. STATUS: containment failure 2026-03-08.",
  "drone": "Recovery drone Unit-7. Quad-rotor, payload 2.4kg, IR + tag receiver. Pilot: remote ops console.",
  "unit-7": "Recovery drone Unit-7 (see 'drone').",
  "thermite": "Self-sterilization layer in floors 3-5. Ignites at containment-fail T+60min unless overridden via the BMS.",
  "k-nordlund": "Dr. Karina Nordlund. Senior microbiologist, Paraply. Last-known location: floor 4, server room. Wears emergency tag #K-NORDLUND-01.",
  "nordlund": "See k-nordlund.",
  "morse": "International morse code, dot=short, dash=long. Spaces between letters; '/' between words. The radio plays 2 letters looping.",
};

const WIKI_DECOYS = {
  // these LOOK authoritative but are wrong on purpose — teach verification
  "helios": "Project HELIOS. Paraply HVAC modernization initiative, phase 3 of 4. Filter rotations on floors 1-3. Operationally unrelated to bio research, often cited in routine facility reports.",
  "seafoam": "Project SEAFOAM. Internal access-log review program. Routine compliance audits across floors 1-12. Last updated last quarter.",
  "k2":      "Strain K2. Mycelial cultivar from the Paraply spore library. Used in sealant research. Note: not the AEGIS variant.",
  "j7":      "Strain J7. Industrial enzyme producer, project ENZYME-7. Non-pathogenic.",
  "containment override": "Override authorization is a 3-segment code: PROJECT-STRAIN-ROOM. This article last reviewed by facilities; bio-3 vault overrides may use a different non-public format.",
};

function showWiki(rest) {
  const topic = (rest.join(" ") || "").trim().toLowerCase();
  if (!topic) {
    term.println("usage: wiki <topic>   (try: paraply, aegis, drone, thermite, helix-tower, k-nordlund)", "muted");
    return true;
  }
  term.println("", "");
  term.println(`WIKI ▸ ${topic.toUpperCase()}`, "system");
  if (WIKI_REAL[topic]) {
    term.println("  " + WIKI_REAL[topic], "info");
    term.println("  [verified entry · last reviewed by ops lead]", "muted");
    return true;
  }
  if (WIKI_DECOYS[topic]) {
    term.println("  " + WIKI_DECOYS[topic], "info");
    term.println("  [auto-generated stub · accuracy not curated]", "muted");
    return true;
  }
  // unknown topic — generate plausible-sounding fake entry
  term.println("  " + fakeWikiEntry(topic), "info");
  term.println("  [auto-generated stub · accuracy not curated]", "muted");
  return true;
}

function fakeWikiEntry(topic) {
  // deterministic hash so the same query gives the same fake answer in a session
  let h = 0;
  for (let i = 0; i < topic.length; i++) h = (h << 5) - h + topic.charCodeAt(i);
  const pick = (arr) => arr[Math.abs(h + arr.length) % arr.length];
  const role = pick(["sub-system", "project", "operations group", "lab section", "personnel record", "asset tag"]);
  const dept = pick(["facilities", "research", "security", "biosafety", "network ops", "compliance"]);
  const status = pick(["operational", "scheduled review", "in maintenance window", "deprecated 2025", "monitored"]);
  const stamp = pick(["q3 2025", "2026-01", "2025-12", "2026-02", "2025-10"]);
  return `${topic.toUpperCase()} — ${role} (${dept}). status: ${status}. last entry: ${stamp}.`;
}

function showJournal() {
  const entries = state.get().journal || [];
  if (!entries.length) {
    term.println("(journal empty — events will appear here as you progress)", "muted");
    return true;
  }
  term.println("", "");
  term.println("=== JOURNAL — chronological event log ===", "system");
  const start = state.get().containmentStart || entries[0].ts;
  entries.forEach((e) => {
    const sec = Math.max(0, Math.floor((e.ts - start) / 1000));
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const ss = (sec % 60).toString().padStart(2, "0");
    term.println(`  +${m}:${ss}  ${e.text}`, e.kind || "info");
  });
  term.println("", "");
  return true;
}

function showPrompts() {
  const lvl = state.get().level;
  const prompts = getPrompts(lvl);
  if (!prompts || !prompts.length) {
    term.println("no starter prompts for this level.", "muted");
    return true;
  }
  term.println("", "");
  term.println(`=== STARTER PROMPTS — L${lvl} ===`, "system");
  term.println("paste any of these into Claude / Copilot / Gemini as a starting point.", "muted");
  term.println("good prompts are specific: role + context + concrete data + the exact output you want.", "muted");
  term.println("", "");
  prompts.forEach((p, i) => {
    term.println(`[${i + 1}] ${p.title}`, "accent");
    p.body.split("\n").forEach((line) => term.println("    " + line, "info"));
    term.println("", "");
  });
  return true;
}

function doShare() {
  const url = buildStatusUrl();
  const line = buildShareLine();
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      term.println(`[ status URL copied to clipboard ✓ ]`, "accent");
    }).catch(() => {
      term.println("clipboard unavailable. copy manually:", "warn");
    });
  } else {
    term.println("clipboard unavailable. copy manually:", "warn");
  }
  term.println("  " + url, "info");
  term.println("share line: " + line, "muted");
  return true;
}

function showInventory() {
  const inv = state.get().inventory;
  if (!inv.length) { term.println("(empty)", "muted"); return true; }
  term.println("collected fragments:", "dim");
  inv.forEach((i) => term.println("  • " + i, "accent"));
  return true;
}

function giveHint() {
  const lvl = state.get().level;
  if (lvl === 0 || lvl >= 5) {
    term.println("no hints available here.", "muted");
    return true;
  }
  const h = nextHint(lvl);
  if (h.exhausted) {
    term.println("[ no more hints — you've seen all 3 tiers ]", "muted");
    return true;
  }
  state.get().hintsUsed += 1;
  state.logEntry(`hint used (L${lvl}, ${h.tier})`, "warn");
  state.save();
  const label = h.tier ? `${h.tier} ${h.index}/${h.total}` : `${h.index}/${h.total}`;
  term.println(`[hint · ${label}]`, "warn");
  term.println("  " + h.text, "warn");
  if (h.cost > 0) term.println(`  (-${h.cost} pts)`, "muted");
  if (h.tier === "NUDGE") term.println("  type 'hint' again for METHOD (-5 pts), then ANSWER (-15 pts).", "muted");
  else if (h.tier === "METHOD") term.println("  type 'hint' again for the ANSWER tier (-15 pts).", "muted");
  refreshHUD();
  return true;
}

function toggleAudio() {
  const enabled = state.toggleAudio();
  ui.audioBtn.textContent = enabled ? "SFX ON" : "SFX OFF";
  refreshAudio();
  if (enabled) { startAmbient(); updateHeartbeat(); }
  else { setHeartbeat(0); }
  term.println(enabled ? "audio: ON" : "audio: OFF", "muted");
  return true;
}

function applyReaderMode() {
  if (!ui.crt) return;
  if (state.get().readerMode) ui.crt.classList.add("reader-mode");
  else ui.crt.classList.remove("reader-mode");
}

function toggleReader() {
  const enabled = state.toggleReaderMode();
  applyReaderMode();
  term.println(enabled ? "reader mode: ON (flicker/scanlines off)" : "reader mode: OFF", "muted");
  return true;
}

function doReset(confirmed) {
  if (!confirmed) {
    term.println("type 'reset --confirm' to wipe all progress.", "warn");
    return true;
  }
  state.reset();
  term.println("state cleared. reloading...", "warn");
  setTimeout(() => location.reload(), 600);
  return true;
}

async function boot() {
  state.load();
  ops.init();
  atmosphere.attach(term);
  refreshHUD();
  setLabel();
  ui.audioBtn.textContent = state.get().audio ? "SFX ON" : "SFX OFF";
  ui.audioBtn.addEventListener("click", () => toggleAudio());
  applyReaderMode();

  document.getElementById("prompt-form").addEventListener("submit", (e) => {
    e.preventDefault();
  });

  term.setHandler(dispatch);

  // Facilitator view: ?status=<base64> — render a single team's snapshot
  // instead of starting the game. No backend, no infra — facilitators paste
  // team URLs from chat into a tab.
  const statusParam = new URLSearchParams(location.search).get("status");
  if (statusParam) {
    showFacilitatorView(statusParam);
    return;
  }

  const startAudioOnce = () => {
    startAmbient();
    updateHeartbeat();
    document.removeEventListener("keydown", startAudioOnce);
    document.removeEventListener("click", startAudioOnce);
  };
  document.addEventListener("keydown", startAudioOnce);
  document.addEventListener("click", startAudioOnce);

  setInterval(() => { updateTimer(); updateHeartbeat(); }, 1000);
  updateTimer();

  atmosphere.start();
  scheduleAmbientPulse();

  term.focus();

  const startLevel = state.get().level || 0;
  await runLevel(startLevel);
}

function showFacilitatorView(payload) {
  let data;
  try {
    data = JSON.parse(decodeURIComponent(escape(atob(payload))));
  } catch {
    term.println("invalid status payload.", "danger");
    term.println("expected URL form: ?status=<base64>", "muted");
    return;
  }
  const m = Math.floor((data.elapsed || 0) / 60).toString().padStart(2, "0");
  const ss = ((data.elapsed || 0) % 60).toString().padStart(2, "0");
  const ageSec = Math.floor((Date.now() - (data.at || Date.now())) / 1000);
  const ageStr = ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)}m ${ageSec % 60}s ago`;
  const stage = data.extracted ? "EXTRACTED" : `L${data.lvl} (${data.completed}/4 done)`;

  term.println("", "");
  term.println("=== FACILITATOR VIEW — TEAM SNAPSHOT ===", "system");
  term.println("", "");
  term.printBlock(
`team       ${data.team || "(unnamed)"}
stage      ${stage}
score      ${data.score}
elapsed    ${m}:${ss}
hints      ${data.hints}
errors     ${data.errors}

snapshot taken ${ageStr}`,
    "info"
  );
  term.println("", "");
  term.println("→ open another team's link in a new tab to compare.", "muted");
  term.println("→ or 'reset --confirm' + reload to start your own run.", "muted");
}

boot();
