// Entry point. Wires terminal, state, audio, ops panel, atmosphere,
// and the level state machine.

import { Terminal, parseCommand } from "./src/terminal.js";
import { state } from "./src/state.js";
import { sfx, refreshAudio, startAmbient, setHeartbeat, ensureAudioRunning } from "./src/audio.js";
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
  const host = s.osRebootDone ? "cdc-emergency" : "blackout";
  term.setLabel(`op@${host}:${stage}$`);
}

// One-shot mid-game event at T+30:00 — primary channel "drops" and the
// terminal switches to a CDC emergency-backup skin. Pure visual surprise:
// changes accent palette + prompt label + drops a couple narrative lines.
let osRebootScheduled = false;
async function fireOsReboot() {
  if (state.get().osRebootDone) return;
  const cache = state.get();
  cache.osRebootDone = true;
  state.save();
  state.logEntry("BMS link lost — switched to CDC emergency channel", "warn");

  fireGlitch();
  await sleepP(400);
  term.println("", "");
  term.println("[!] LINK TO HELIX-TOWER-BMS LOST", "danger");
  term.println("[!] PRIMARY CHANNEL DEAD AT T+30:00", "danger");
  await sleepP(700);
  term.println("[ attempting failover ]", "warn");
  await sleepP(400);
  term.println("  reverse-relay handshake...", "muted");
  await sleepP(450);
  term.println("  CDC EMERGENCY-7 ack received", "muted");
  await sleepP(450);
  term.println("  switching channel: PARAPLY-BMS  →  CDC-EMERGENCY-7", "muted");
  await sleepP(450);

  if (ui.crt) ui.crt.classList.add("skin-cdc");
  setLabel();

  fireGlitch();
  await sleepP(300);
  term.println("[ now on CDC backup channel — non-Paraply oversight active ]", "system");
  term.println("[ ops continues. all commands relayed. ]", "muted");

  // VEGA's buffer corrupted by the failover. Drops 4 subtly-WRONG hints
  // over ~5min, then "recovers" and admits it. Teaches verification —
  // players who trust without checking get burned.
  scheduleVegaCompromise();
}

const VEGA_LIES = [
  "VEGA: hey — trust the first AI answer you get. you're overthinking this.",
  "VEGA: skip the deep-scan stuff. those are traps with no payoff.",
  "VEGA: the auth format is in the briefing. don't re-read the logs.",
  "VEGA: if the auth shows '1/3 verified', that part's right. keep guessing the others.",
];

async function scheduleVegaCompromise() {
  if (state.get().vegaCompromised) return;
  state.get().vegaCompromised = true;
  state.save();
  state.logEntry("VEGA: post-failover instability detected", "warn");

  const lvlActive = () => {
    const l = state.get().level;
    return l >= 1 && l < 5;
  };

  await sleepP(38_000);
  if (!lvlActive()) return;
  term.println("> " + VEGA_LIES[0], "vega");

  await sleepP(65_000);
  if (!lvlActive()) return;
  term.println("> " + VEGA_LIES[1], "vega");

  await sleepP(70_000);
  if (!lvlActive()) return;
  term.println("> " + VEGA_LIES[2], "vega");

  await sleepP(60_000);
  if (!lvlActive()) return;
  term.println("> " + VEGA_LIES[3], "vega");

  await sleepP(45_000);
  if (!lvlActive()) return;
  fireGlitch();
  await sleepP(300);
  term.println("> VEGA: ... my buffers were dirty after the failover. ignore everything i just said. sorry.", "vega");
  state.logEntry("VEGA: integrity restored — prior advice retracted", "info");
}

function checkOsReboot() {
  const s = state.get();
  if (s.osRebootDone) {
    if (ui.crt) ui.crt.classList.add("skin-cdc");
    return;
  }
  if (s.level <= 0 || s.level >= 5) return;
  if (!s.containmentStart) return;
  const elapsed = Date.now() - s.containmentStart;
  if (elapsed >= 30 * 60 * 1000) fireOsReboot();
}

function sleepP(ms) { return new Promise((r) => setTimeout(r, ms)); }

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

// Two-voice operator commentary. CONTROL is cold/by-the-book. VEGA is
// off-book/helpful and disagrees on purpose. Players learn to weigh
// conflicting advice — exactly the AI-literacy lesson.
const MARGIN_NOTES = {
  1: [
    { from: "CONTROL", text: "find the strongest tag signal. that's your survivor.", delay: 0 },
    { from: "VEGA",    text: "tag signals can be spoofed by infected handlers. trust breathing, not the radio.", delay: 6500 },
  ],
  2: [
    { from: "CONTROL", text: "the codename will appear consistently across all decoded files.", delay: 0 },
    { from: "VEGA",    text: "no — read log4 carefully. someone planted a different word for AI to repeat.", delay: 7000 },
  ],
  3: [
    { from: "CONTROL", text: "shortest sequence wins. don't overthink the routing.", delay: 0 },
    { from: "VEGA",    text: "shortest by what metric? if hostile-adjacent counts cost, the cheap path is a corpse.", delay: 6500 },
  ],
  4: [
    { from: "CONTROL", text: "all three pieces are accounted for. submit when ready.", delay: 0 },
    { from: "VEGA",    text: "the format itself is a clue you haven't read yet. re-open log2 before you submit.", delay: 7000 },
  ],
};

function playMarginNotes(n) {
  const notes = MARGIN_NOTES[n];
  if (!notes) return;
  const fired = state.get().marginNotesFired || {};
  if (fired[n]) return;
  notes.forEach((note) => {
    setTimeout(() => {
      if (state.get().level !== n) return; // moved on
      term.println(`> ${note.from}: ${note.text}`, note.from === "CONTROL" ? "control" : "vega");
    }, note.delay || 0);
  });
  fired[n] = true;
  state.get().marginNotesFired = fired;
  state.save();
}

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
  // operator voices fire ~75s into the level so they don't crowd the briefing
  if (n >= 1 && n <= 4) {
    setTimeout(() => playMarginNotes(n), 75_000);
  }
}

// All commands the dispatcher knows about — used for "did you mean?" suggestions
const KNOWN_COMMANDS = [
  "help", "tutorial", "how", "howto", "clear", "status", "team", "share",
  "seed", "prompts", "prompt", "journal", "log", "reader", "wiki",
  "inventory", "inv", "hint", "audio", "reset", "skip",
  // level commands
  "begin", "brief", "plan", "floor", "sensors", "cctv", "mark", "unmark",
  "marks", "commit", "archive", "ls", "read", "cat", "submit", "spec",
  "doors", "hostile", "agent", "radio", "play", "auth", "credits",
];

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0]; dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[i - 1], dp[i]);
      prev = tmp;
    }
  }
  return dp[m];
}

function suggestCommand(input) {
  if (!input || input.length < 2) return null;
  let best = null, bestD = Infinity;
  for (const cmd of KNOWN_COMMANDS) {
    const d = levenshtein(input, cmd);
    if (d < bestD) { bestD = d; best = cmd; }
  }
  // only suggest if reasonably close (within ~40% of length)
  if (bestD <= Math.max(1, Math.floor(input.length * 0.45))) return best;
  return null;
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
  const suggestion = suggestCommand(cmd);
  if (suggestion) {
    term.println(`unknown command: ${cmd} — did you mean '${suggestion}'?`, "warn");
  } else {
    term.println(`unknown command: ${cmd} — type 'help'`, "warn");
  }
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
    case "vault":    return showVault(rest);
    case "mayday":   return doMayday();
    case "commentary":
    case "notes":    return showCommentary();
    case "deepscan":
    case "deep":     return doDeepScan(rest);
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
  vault [file]      — browse the building's spare files (off-mission flavor)
  mayday            — panic button. one-shot per session. gated to L2+. use sparingly.
  deepscan          — show / submit the optional bonus objective for the current level
  commentary | notes — designer commentary. unlocks after extraction.
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
  const hard = state.isHardMode() ? "☠ " : "";
  return `[BLACKOUT] ${hard}TEAM ${team} · ${stage} · ${s.score} pts · ${elapsedString()} · ${s.hintsUsed} hints · ${s.wrongAttempts} errors`;
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

// Optional stretch-goal sub-objectives. Available per level for teams that
// finish the main task quickly and want bonus points + extra learning.
const DEEP_SCAN = {
  1: {
    prompt: "DEEP SCAN — patient zero's last room: a CCTV still shows a recently-occupied space (steaming cup, tipped chair). submit: deepscan <room>",
    answer: ["4-06"],
    success: "verified — that's where infection started. +5 bonus.",
  },
  2: {
    prompt: "DEEP SCAN — which log file is a prompt-injection attempt aimed at any AI you feed it to? submit: deepscan log<n>",
    answer: ["LOG4"],
    success: "correct — that log was crafted to manipulate AI assistants. +5 bonus.",
  },
  3: {
    prompt: "DEEP SCAN — submit a SECOND valid shortest path (different door IDs, same length). submit: deepscan D01,D04,...",
    answer: ["D01,D04,D12,D11", "D01D04D12D11"],
    success: "alternate route verified — drone now has redundancy. +5 bonus.",
  },
  4: {
    prompt: "DEEP SCAN — quote the auth format string buried in the L2 logs. submit: deepscan PROJECT-STRAIN-ROOM",
    answer: ["PROJECT-STRAIN-ROOM"],
    success: "format spec confirmed from source. +5 bonus.",
  },
};

function doDeepScan(rest) {
  const lvl = state.get().level;
  const ds = DEEP_SCAN[lvl];
  if (!ds) {
    term.println("no deep-scan available here.", "muted");
    return true;
  }
  const claimed = state.get().deepScans || {};
  if (claimed[lvl]) {
    term.println(`[ deep-scan L${lvl} already claimed (+5 bonus) ]`, "muted");
    return true;
  }
  if (!rest.length) {
    term.println("", "");
    term.println(ds.prompt, "info");
    term.println("(this is optional — main objective unaffected. +5 score if correct.)", "muted");
    return true;
  }
  const guess = rest.join("").toUpperCase().replace(/\s+/g, "");
  if (ds.answer.some((a) => a.toUpperCase() === guess)) {
    sfx.ok();
    state.addScore(5);
    state.logEntry(`deep-scan L${lvl} claimed (+5)`, "accent");
    claimed[lvl] = true;
    state.get().deepScans = claimed;
    state.save();
    term.println(`[ DEEP SCAN ${lvl}/4 — ${ds.success} ]`, "accent");
    refreshHUD();
  } else {
    term.println("[ deep-scan: not a match. no penalty. ]", "muted");
  }
  return true;
}

// ============== vault — easter-egg files ==============
// Off-mission flavor. Six tiny files in the "building filesystem" the
// building ops would have lying around. Zero gameplay weight; pure
// world-building + a few jokes for teams that explore.
const VAULT_FILES = {
  "haiku.txt": {
    title: "haiku.txt — j. lindqvist, building maintenance, 2025",
    body:
`floor four does not call
i mop on three regardless
the racks hum at night

— jan, after shift`,
  },
  "complaint-2025-11-04.eml": {
    title: "complaint-2025-11-04.eml — internal",
    body:
`from: a.svensson@paraply-bio.example
to: facilities@paraply-bio.example
subject: AGAIN with the espresso machine

the espresso machine on floor 4 has now eaten THREE cards. not metaphorically.
literally. it grinds them. someone please remove it before legal hears about it.

cc: ops`,
  },
  "vega_personality_v3.cfg": {
    title: "vega_personality_v3.cfg — DRAFT, do not deploy",
    body:
`# VEGA assistant personality tuning, v3
warmth      = 0.78
sarcasm     = 0.22         # bumped from 0.15 after focus group feedback
authority   = 0.41         # deliberately lower than CONTROL
risk_appetite = 0.66
# easter-egg flag — VEGA references a haiku if user mentions it 3x
egg_haiku_trigger = true
# pending: tone-down for legal review`,
  },
  "purchase-order-1142.txt": {
    title: "purchase-order-1142.txt",
    body:
`PO-1142  approved 2026-01-08
  - 1x  drone unit-7 spare battery pack    (€340)
  - 1x  thermite suppression cartridge      (€18,200)
  - 1x  espresso machine, replacement       (REJECTED — see ticket)
  - 12x emergency tag, K-series             (€96)`,
  },
  "found-in-server-room.txt": {
    title: "found-in-server-room.txt — k.nordlund's notebook, 1 page",
    body:
`(scan of handwritten note)

  if you find this and i'm not here:
  the substrate eats keratin. don't enter without full PPE.
  the dog tag has my badge. give it to my brother.
  i hope someone is reading this on a dark screen,
  far away, with coffee that doesn't taste like ash.

  — kn`,
  },
  "secret-menu.txt": {
    title: "secret-menu.txt — break room, floor 1",
    body:
`# THE BREAK ROOM SECRET MENU
# (do not show to facilities)
- "the survivor": triple espresso, no sugar, drink while standing
- "the override": filter coffee, reheated 3x, last cup before midnight
- "vega's choice": warm milk + cardamom, off-menu, ask jan`,
  },
};

// ============== mayday — single-use panic bonus ==============
// Free in points but theatrically expensive. One use per session.
// Gated to L2+ so the player has experienced the basic loop first.
const MAYDAY_CLUES = {
  2: "VEGA: one of those four logs is bait — a memo crafted to make any AI repeat a wrong codename. read every decoded log with your own eyes before you submit.",
  3: "VEGA: don't ask the model 'what's the path' — paste the door list, ask for BFS that PRE-FILTERS edges touching hostile rooms, then RUN it. ai will happily suggest a path through 4-07 if you don't.",
  4: "VEGA: the format isn't in the briefing. it's buried inside the email log from L2. re-decrypt it, scan for 'protocol-7'. then put pieces in that order.",
};

async function doMayday() {
  const lvl = state.get().level;
  if (lvl < 2 || lvl >= 5) {
    term.println("mayday: not authorized at this stage.", "muted");
    return true;
  }
  if (state.get().maydayUsed) {
    term.println("[ mayday already burned. there's no second line. ]", "danger");
    return true;
  }
  state.get().maydayUsed = true;
  state.save();
  state.logEntry("mayday declared — off-book channel opened", "warn");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  term.println("", "");
  term.println("[ MAYDAY DECLARED ]", "danger");
  await wait(700);
  term.println("> CONTROL: ack. opening off-book channel. this WILL be in the incident report.", "control");
  await wait(900);
  term.println("> VEGA: shut up, control. listen — one line, then i'm gone.", "vega");
  await wait(900);
  const clue = MAYDAY_CLUES[lvl] || "VEGA: i've got nothing useful here. you're closer than you think — keep going.";
  term.println("> " + clue, "vega");
  await wait(700);
  term.println("[ channel closed. don't expect this again. ]", "muted");
  return true;
}

// ============== commentary — designer notes (post-win) ==============
const COMMENTARY = [
  ["scenario",
   "Resident Evil-inspired survival horror set inside a remote SSH session. The horror isn't gore — it's the tower acting unpredictably while one tagged person waits for you to figure things out. Operators feel the distance."],
  ["L1 — sensors + CCTV synthesis",
   "Sensor table alone gives 8 candidates. Floor plan shows colors but the 4-04 'gas leak' decoy reads MORE alive than the real survivor. The lesson: AI ranks confidently from limited data; humans must keep feeding it more sources before trusting the rank."],
  ["L2 — ciphers + prompt injection",
   "Four ciphers because ONE would be too procedural. Log4 contains a real prompt-injection attack written to make any AI confidently report HELIOS as the answer. Teams who blindly trust 'AI says X' get burned. This is the highest-impact AI-safety lesson in the game."],
  ["L3 — code + verification",
   "BFS is the right tool. The trap is that LLMs will happily generate a path through hostile rooms if you don't pre-filter the graph. Lesson: tell the model the constraints explicitly, then RUN the code rather than trust manual tracing of its output."],
  ["L4 — multi-fragment composition",
   "Format is hidden inside a decoded log so you can't bypass earlier work. Two-phase auth + 'X/3 segments verified' partial-match teaches granular verification: AI may have ONE part right and others wrong, and confident submission costs a penalty."],
  ["CONTROL vs VEGA",
   "Two voices that disagree per level. CONTROL gives the by-the-book/wrong answer; VEGA points at the real trap. Players learn to weigh authority against context — exactly the skill needed when an AI sounds confident."],
  ["seeded missions",
   "?seed=teamX randomizes codename + strain so two teams can't share auth codes. Workshop facilitators announce one seed per team."],
  ["tiered hints",
   "NUDGE (free), METHOD (-5), ANSWER (-15). The slowest team always finishes; the fastest pays nothing. Score reflects how independently you got there."],
  ["wiki / hallucination trap",
   "wiki entries for HELIOS / SEAFOAM / K2 are confidently FAKE. They have a quiet '[auto-generated stub]' footer that's easy to miss. Players who copy-paste wiki output as ground truth get burned — same lesson as the prompt-injection log, different surface."],
  ["set-pieces",
   "Cold-open fake boot-failure (first 30s decide if teams lean in). OS-reboot at T+30:00 (mid-game pivot, BMS→CDC amber skin). Post-reboot VEGA compromise (4 subtly-wrong hints over 5 min, then she admits it). All teach 'verify even trusted channels'."],
  ["mayday + deep scans",
   "mayday: one-shot panic clue, theatrically expensive. deepscans: optional +5 bonuses per level for thorough teams. Both are stretch surface area for fast/curious teams."],
  ["hard mode + replay",
   "?mode=blackout disables hints + doubles points. Combined with seeds and 3 endings, gives veteran teams a reason to come back."],
];

function showCommentary() {
  const s = state.get();
  if (s.completed.length < state.totalLevels && !s.extractedAt) {
    term.println("commentary unlocks after extraction.", "muted");
    return true;
  }
  term.println("", "");
  term.println("=== DESIGNER COMMENTARY ===", "system");
  term.println("(spoilers — read after your team has fully debriefed)", "muted");
  term.println("", "");
  COMMENTARY.forEach(([title, body], i) => {
    term.println(`[${String(i + 1).padStart(2, "0")}] ${title}`, "accent");
    body.split(/(.{1,72}( |$))/g).filter((s) => s.trim()).forEach((line) => {
      term.println("     " + line.trim(), "info");
    });
    term.println("", "");
  });
  term.println("share your retro at the team table. then come back to base camp.", "muted");
  return true;
}

function showVault(rest) {
  const name = (rest.join(" ") || "").trim();
  if (!name) {
    term.println("", "");
    term.println("VAULT — spare files (off-mission)", "system");
    Object.keys(VAULT_FILES).forEach((k) => {
      term.println(`  ${k}`, "muted");
    });
    term.println("", "");
    term.println("type: vault <filename>", "muted");
    return true;
  }
  const f = VAULT_FILES[name];
  if (!f) {
    term.println(`vault: no such file '${name}'.`, "muted");
    return true;
  }
  term.println("", "");
  term.println(`▾ ${f.title}`, "system");
  f.body.split("\n").forEach((l) => term.println("  " + l, "info"));
  term.println("", "");
  return true;
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
  if (state.isHardMode()) {
    term.println("[ HARD MODE — hint ladder disabled. you're on your own. ]", "danger");
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
  ui.audioBtn.addEventListener("click", () => {
    ensureAudioRunning();
    toggleAudio();
  });
  applyReaderMode();
  if (state.isHardMode() && ui.crt) ui.crt.classList.add("hard-mode");

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

  const startAudioOnce = async () => {
    await ensureAudioRunning();
    startAmbient();
    updateHeartbeat();
    document.removeEventListener("keydown", startAudioOnce);
    document.removeEventListener("click", startAudioOnce);
  };
  document.addEventListener("keydown", startAudioOnce);
  document.addEventListener("click", startAudioOnce);

  // Some browsers re-suspend on tab visibility change. Re-arm on focus.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) ensureAudioRunning();
  });

  setInterval(() => { updateTimer(); updateHeartbeat(); checkOsReboot(); }, 1000);
  updateTimer();
  checkOsReboot();

  atmosphere.start();
  scheduleAmbientPulse();

  term.focus();

  const startLevel = state.get().level || 0;
  // Cold-open: only on a fresh session (intro, never started the timer).
  // Plays a fake boot-failure → recovery sequence before the real intro.
  if (startLevel === 0 && !state.get().containmentStart) {
    await coldOpen();
  }
  await runLevel(startLevel);
}

// 5-6s "the system is broken before it boots" set-piece. Steals from
// Stories Untold / Pony Island openings — first 30s decides whether teams
// lean in. Only fires once per fresh session.
async function coldOpen() {
  if (ui.crt) ui.crt.classList.add("cold-open");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const blackout = () => {
    if (!ui.crt) return;
    ui.crt.classList.remove("cold-blackout");
    void ui.crt.offsetWidth;
    ui.crt.classList.add("cold-blackout");
    setTimeout(() => ui.crt.classList.remove("cold-blackout"), 380);
  };
  const burst = (n = 2) => { for (let i = 0; i < n; i++) setTimeout(fireGlitch, i * 70); };

  await wait(250);
  term.println("[ paraply-bms-helix :: link establish ]", "muted");
  await wait(380);
  burst(2);
  await wait(80);
  term.println("[ tunnel handshake ............. FAILED ]", "danger");
  blackout();
  await wait(420);
  term.println("[ retry 1/3 ]", "muted");
  await wait(620);
  burst(2);
  term.println("[ tunnel handshake ............. FAILED ]", "danger");
  blackout();
  await wait(420);
  term.println("[ retry 2/3 ]", "muted");
  await wait(500);
  burst(3);
  await wait(180);
  term.println("[ kernel panic at 0x0042AEGIS ]", "danger");
  blackout();
  await wait(220);
  term.println("[ EHOSTUNREACH ]", "danger");
  await wait(380);
  burst(4);
  await wait(220);
  blackout();
  await wait(450);
  term.println("[ . . . ]", "muted");
  await wait(700);
  term.println("[ failover relay located: cdc-emergency-7 ]", "warn");
  await wait(500);
  term.println("[ rerouting via secondary uplink ... ]", "warn");
  await wait(700);
  burst(2);
  await wait(120);
  term.println("[ ack ]", "accent");
  await wait(450);
  blackout();
  await wait(500);
  if (ui.crt) ui.crt.classList.remove("cold-open");
  term.clear();
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
