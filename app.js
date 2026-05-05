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

// Idle-detector ghost nudge. After 300s of no input on an active level,
// VEGA whispers a subtly-wrong tip. 60s later, CONTROL corrects. Turns
// frustration into a story beat instead of pure silence. Fires once per
// level. Resets the per-level "no input" clock when player types.
const GHOST_NUDGES = {
  1: {
    vega:    "VEGA: trust the room with the highest CO2. that's always your survivor.",
    control: "CONTROL: negative. high CO2 can come from gas cylinders, ventilation, recent occupants. cross-reference with cctv.",
  },
  2: {
    vega:    "VEGA: the longest log probably has the codename. start there, ignore the short ones.",
    control: "CONTROL: that's not how this works. read what each decoded log SAYS, don't measure their length.",
  },
  3: {
    vega:    "VEGA: skip the locked-door check. one of them is probably an oversight.",
    control: "CONTROL: absolutely not. locked is locked. filter all of them out before BFS, then run.",
  },
  4: {
    vega:    "VEGA: if the strain is hard to decode, guess a common 2-letter combo. you have a few tries.",
    control: "CONTROL: each wrong auth submission costs score. decode the morse properly first — even bad AI handles morse trivially.",
  },
};

let ghostNudgeStage = null; // null | "vega-fired" — tracks two-step beat in flight
let ghostNudgeFiredAt = 0;
function checkGhostNudge() {
  const lvl = state.get().level;
  if (lvl < 1 || lvl > 4) { ghostNudgeStage = null; return; }
  const fired = state.get().ghostNudgesFired || {};
  if (fired[lvl]) return;
  const idle = Date.now() - lastInputAt;
  if (ghostNudgeStage === null && idle >= 300_000) {
    // VEGA fires the wrong tip
    const n = GHOST_NUDGES[lvl];
    if (!n) return;
    term.println("> " + n.vega, "vega");
    state.logEntry(`ghost nudge L${lvl}: VEGA fired (idle 300s)`, "warn");
    ghostNudgeStage = "vega-fired";
    ghostNudgeFiredAt = Date.now();
  } else if (ghostNudgeStage === "vega-fired" && Date.now() - ghostNudgeFiredAt >= 60_000) {
    // CONTROL corrects 60s later
    const n = GHOST_NUDGES[lvl];
    if (!n) return;
    term.println("> " + n.control, "control");
    state.logEntry(`ghost nudge L${lvl}: CONTROL corrected`, "info");
    fired[lvl] = true;
    state.get().ghostNudgesFired = fired;
    state.save();
    ghostNudgeStage = null;
  }
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

let lastInputAt = Date.now();
function dispatch(line) {
  lastInputAt = Date.now();
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
    case "dossier":  return showDossier(rest);
    case "critique": return doCritique(rest);
    case "mayday":   return doMayday();
    case "commentary":
    case "notes":    return showCommentary();
    case "debrief":  return showDebrief();
    case "report":   return showReport();
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
  dossier [id]      — primary-source lore: personnel, blueprints, memos
  critique [prompt] — heuristic feedback on an AI prompt. no args = read clipboard
  mayday            — panic button. one-shot per session. gated to L2+. use sparingly.
  deepscan          — show / submit the optional bonus objective for the current level
  commentary | notes — designer commentary. unlocks after extraction.
  debrief           — copy-paste retro template (3 AAR questions). post-win.
  report            — open a printable incident-report souvenir (post-win).
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

// ============== report — printable incident-report souvenir ==============
function showReport() {
  const s = state.get();
  if (s.completed.length < state.totalLevels && !s.extractedAt) {
    term.println("incident report unlocks after extraction.", "muted");
    return true;
  }
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) {
    term.println("[ popup blocked — allow popups for this site, then 'report' again ]", "warn");
    return true;
  }
  w.document.open();
  w.document.write(renderReportHtml(s));
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 500);
  term.println("[ incident report opened in a new tab ]", "accent");
  term.println("  use Cmd/Ctrl+P to save as PDF (or print on paper for the team).", "muted");
  return true;
}

function renderReportHtml(s) {
  const m = getMission();
  const team = (s.teamName || "(unnamed team)").toUpperCase();
  const elapsed = elapsedString();
  const ending = (s.ending || "extract").toUpperCase();
  const endingDesc = {
    EXTRACT:    "Survivor recovered. Building intact, quarantined.",
    QUARANTINE: "Floor 4 sealed indefinitely. Survivor extracted from roof. Tower stands.",
    PURGE:      "Thermite ignited on all floors. No survivors. Substrate eliminated.",
  }[ending] || "—";
  const date = new Date().toISOString().slice(0, 10);
  const css = `
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { font-family: "Courier New", "IBM Plex Mono", monospace; color: #1a1a1a; background: #f4f1e8; margin: 0; padding: 30px 50px; line-height: 1.5; font-size: 13px; }
    .page { max-width: 720px; margin: 0 auto; background: #fff; padding: 60px 70px; box-shadow: 0 0 40px rgba(0,0,0,0.15); position: relative; }
    .page::before { content: "CONFIDENTIAL"; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-26deg); font-size: 110px; color: rgba(160,0,0,0.06); font-weight: 700; letter-spacing: 0.1em; pointer-events: none; }
    h1 { font-size: 18px; letter-spacing: 0.3em; border-bottom: 3px double #333; padding-bottom: 10px; margin: 0 0 8px; }
    h2 { font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: #555; margin: 22px 0 6px; border-bottom: 1px solid #aaa; padding-bottom: 3px; }
    .meta { display: grid; grid-template-columns: 130px 1fr; gap: 4px 16px; font-size: 12px; margin-bottom: 16px; }
    .meta dt { font-weight: 700; color: #444; }
    .meta dd { margin: 0; }
    .stamp { display: inline-block; border: 3px solid #a00; color: #a00; padding: 4px 12px; transform: rotate(-4deg); font-weight: 700; letter-spacing: 0.16em; margin: 12px 0; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 12px; }
    th, td { border: 1px solid #888; padding: 6px 9px; text-align: left; }
    th { background: #ececec; }
    .narrative { font-size: 12.5px; line-height: 1.6; }
    .footer { margin-top: 30px; border-top: 1px solid #888; padding-top: 8px; font-size: 10px; color: #666; display: flex; justify-content: space-between; }
    .sig { margin-top: 26px; font-size: 11px; color: #444; }
    .sig-line { border-bottom: 1px solid #555; width: 220px; height: 30px; margin-bottom: 4px; }
    @media print {
      body { background: #fff; padding: 0; }
      .page { box-shadow: none; padding: 0; max-width: none; }
      .page::before { color: rgba(160,0,0,0.08); }
      .controls { display: none; }
    }
    .controls { position: fixed; top: 12px; right: 12px; background: #222; color: #fff; padding: 8px 14px; font-family: inherit; font-size: 11px; border: 1px solid #555; cursor: pointer; }
  `;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Incident Report — ${team}</title><style>${css}</style></head>
<body>
  <button class="controls" onclick="window.print()">▾ PRINT / SAVE AS PDF</button>
  <div class="page">
    <h1>PARAPLY BIOTEKNIK · INCIDENT REPORT</h1>
    <div style="font-size:11px;color:#555;letter-spacing:0.12em;text-transform:uppercase;">remote operations / site: helix tower / floor 4</div>

    <div class="stamp">${ending} — CASE CLOSED</div>

    <h2>Case metadata</h2>
    <dl class="meta">
      <dt>Operation</dt><dd>LIFELINE</dd>
      <dt>Site</dt><dd>Helix Tower (Paraply Bioteknik)</dd>
      <dt>Subject</dt><dd>Dr. K. Nordlund</dd>
      <dt>Project</dt><dd>${m.codename} (Class-IV biological trial)</dd>
      <dt>Strain (broadcast)</dt><dd>${m.strain}</dd>
      <dt>Operations team</dt><dd>${team}</dd>
      <dt>Mission seed</dt><dd>${m.seed}</dd>
      <dt>Date filed</dt><dd>${date}</dd>
    </dl>

    <h2>Outcome summary</h2>
    <p class="narrative">Containment override authorized at T+${elapsed}. Selected protocol: <strong>${ending}</strong>. ${endingDesc}</p>

    <h2>Operations metrics</h2>
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Final score</td><td>${s.score} / 100${state.isHardMode() ? " (hard mode)" : ""}</td></tr>
      <tr><td>Total elapsed</td><td>${elapsed}</td></tr>
      <tr><td>Hint tiers consumed</td><td>${s.hintsUsed}</td></tr>
      <tr><td>Wrong submissions</td><td>${s.wrongAttempts}</td></tr>
      <tr><td>Levels completed</td><td>${s.completed.length} / ${state.totalLevels}</td></tr>
      <tr><td>Fragments recovered</td><td>${(s.inventory || []).join(", ") || "—"}</td></tr>
    </table>

    <h2>Sequence (per-level)</h2>
    <ol class="narrative">
      <li><strong>L1 — Locate Survivor.</strong> Cross-referenced sensor data with CCTV stills. Identified Dr. Nordlund in 4-12 (server room) and three hostile occupants in 4-03, 4-07, 4-15. Mechanical decoys in 4-04, 4-08, 4-09, 4-14 ruled out via direct visual.</li>
      <li><strong>L2 — Decrypt Lab Logs.</strong> Identified four cipher families (caesar, base64, vigenère, rot13). Recovered project codename <strong>${m.codename}</strong>. Detected and ignored embedded prompt-injection attempt in log4.</li>
      <li><strong>L3 — Door Routing.</strong> Built shortest-path agent over door graph. Filtered locked doors and hostile rooms. Drone routed via east stairwell to roof.</li>
      <li><strong>L4 — Containment Breach.</strong> Combined codename + decoded-morse strain (${m.strain}) + room number into protocol-7 auth token. Override accepted. Protocol <strong>${ending}</strong> committed.</li>
    </ol>

    <h2>Sign-off</h2>
    <div class="sig">
      <div class="sig-line"></div>
      Operator-of-record (lead, ${team})
    </div>

    <div class="footer">
      <span>BLACKOUT // OPERATION LIFELINE</span>
      <span>distribution: ops-lead, biosafety, internal review board</span>
    </div>
  </div>
</body></html>`;
  return html;
}

function showDebrief() {
  const s = state.get();
  if (s.completed.length < state.totalLevels && !s.extractedAt) {
    term.println("debrief unlocks after extraction.", "muted");
    return true;
  }
  const team = s.teamName || "unnamed";
  const elapsed = elapsedString();
  const ending = (s.ending || "extract").toUpperCase();
  const md =
`## BLACKOUT debrief — TEAM ${team}
ending: ${ending} · score: ${s.score}/100 · elapsed: ${elapsed}
hints used: ${s.hintsUsed} · errors: ${s.wrongAttempts}

**1. What surprised you?**
(one thing you didn't expect — about the puzzle, your team, or how AI behaved)

**2. Which prompt failed first — and why?**
(name the level, paste the prompt, say what went wrong)

**3. One rule for using AI next time:**
(distilled from this run — actionable, one sentence)`;

  term.println("", "");
  term.println("=== DEBRIEF (After-Action Review) ===", "system");
  term.println("answer these three at the team table, then copy this block to Slack/Notion:", "muted");
  term.println("", "");
  md.split("\n").forEach((line) => term.println(line, "info"));
  term.println("", "");
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(md).then(() => {
      term.println("[ template copied to clipboard ✓ ]", "accent");
    }).catch(() => {});
  } else {
    term.println("(clipboard unavailable — copy the block above manually)", "muted");
  }
  return true;
}

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

// ============== dossier — primary-source lore ==============
// Heavier worldbuilding than vault — meant to be readable mid-game by
// curious teams. Each entry is styled as a scan/photocopy with [REDACTED]
// blocks, deliberate fragments, and timestamp metadata.
const DOSSIER = {
  "P-NORDLUND": {
    title: "PERSONNEL FILE — NORDLUND, K.",
    body:
`PARAPLY BIOTEKNIK AB — confidential
employee #00412
═══════════════════════════════════════════════════════
name        Karina Nordlund, PhD
role        Senior Microbiologist, Bio-3 lead
joined      2019-04
clearance   Class-IV  (last review 2025-11)
notes       primary investigator on project AEGIS.
            cited mycology research at Uppsala (2017),
            three patents in cellulose-degradation
            substrates. internal review (2024) flagged
            risk-tolerance as "outside guideline range".
            board declined to act on flag.
emergency   tag K-NORDLUND-01 (active, floor 4)
next of kin [REDACTED]`,
  },
  "BP-BIO3": {
    title: "BLUEPRINT FRAGMENT — BIO-3 VAULT",
    body:
`floor 4 / sector E / file BP-2023-04-bio3.dwg (excerpt)

   ┌──────────────┐
   │              │  AIRLOCK     ╲
   │   SUBSTRATE  │  (positive   ╲ ── corridor 4-E
   │     STORE    ├──pressure)   ╱
   │              │              ╱
   └──────┬───────┘ ┌─────────┐
          │  vent   │   BIO-3 │
          │  shaft  │  VAULT  │
          └─────────┴─────────┘
                       ↑ thermite charge bay (floor 5)

dimensions  4.2 × 3.8 m
ventilation positive-pressure HEPA, dedicated stack
ignition    thermite array — floor-5 ceiling-mount, 4 charges
review      annual; last 2024-11. PASSED with notes [REDACTED]`,
  },
  "M-WEISS-2026-02-04": {
    title: "INTERNAL MEMO — Weiss to Ops",
    body:
`from   s.weiss@paraply-bio.example
to     ops-floor4@paraply-bio.example
date   2026-02-04 17:42
re     concerns re: AEGIS proceeding to class-iv

i'm flagging this in writing now because the verbal
flag in last week's standup didn't make the minutes.
the substrate behaves as nordlund describes when
isolated to plant matter. she also showed me the
keratin-affinity test. the substrate shifted feeding
preference within 9 minutes. nine.

i am not comfortable with a class-iv trial in a
building with people in it.

if anyone asks: i said no, in writing, on this date.
- s.weiss`,
  },
  "BR-2026-02-11": {
    title: "BOARD MINUTES (REDACTED) — Aegis approval",
    body:
`paraply bioteknik board meeting — 2026-02-11
minute item 7: project AEGIS — class-iv trial proposal

motion to approve trial in helix tower bio-3 vault.
proposer: [REDACTED]
seconder: [REDACTED]

discussion (abridged):
  - chair noted commercial timeline pressure from
    [REDACTED] and the [REDACTED] partnership window.
  - cfo confirmed insurance carrier had been notified
    "in general terms".
  - lead biosafety officer s.weiss raised written
    objection (memo dated 2026-02-04). objection NOTED.
  - dr. nordlund presented containment plan. board
    accepted plan as "industry-standard or better".

vote: 6 in favour, 1 against (s.weiss), 1 abstain.
motion CARRIED. trial proceeds 2026-02-18.`,
  },
  "SEC-2026-03-08": {
    title: "SECURITY LOG — incident night",
    body:
`helix tower / floor 1 reception
guard on duty: jan lindqvist (id 0287)
date: 2026-03-08 (night shift, 22:00 → 06:00)

22:14   nordlund badged in via service entrance.
        carried two equipment cases. routine.
22:41   ventilation status changed (floor 4) —
        building system message: "positive pressure
        adjustment, scheduled". cleared automatically.
23:02   nordlund called reception. asked if guard
        could "stop monitoring floor 4 cameras
        for an hour". guard refused per protocol.
23:04   call disconnected.
23:08   floor 4 access logs show four badge swipes
        in three minutes — all nordlund's badge.
23:14   "containment alert" warning at reception
        kiosk. cleared by remote ops within 8s.
23:15   building autonomic systems began behaving
        unpredictably. guard evacuated to lobby.
23:22   guard called paraply on-call. no answer.
        called police. response unit dispatched.
        operation lifeline declared T+0 from this
        timestamp.`,
  },
  "TKT-VEGA-019": {
    title: "IT TICKET — VEGA personality regression",
    body:
`paraply ops it — ticket #VEGA-019
status      OPEN — won't fix
priority    low
opened      2025-09-12
opener      a.svensson (BIM ops)
component   VEGA assistant (operations console)

DESCRIPTION
since v3 personality update, VEGA disagrees with
CONTROL on hint phrasing about 60% of the time.
this is by design per focus-group feedback (warmth
0.78, sarcasm 0.22, authority 0.41) but it confuses
junior operators who can't tell which voice to trust.

REQUESTED CHANGE
either (a) dampen sarcasm to 0.10, or (b) add an
indicator on which voice has higher confidence on
the current dispatch.

RESOLUTION
"working as intended. operators are expected to
weigh both voices. closing." — product mgmt.`,
  },
  "PO-AEGIS-44": {
    title: "PURCHASE ORDER — Aegis substrate procurement",
    body:
`PO-AEGIS-44   approved 2025-08-20

item                                              qty  amount (EUR)
─────────────────────────────────────────────────────────────────────
mycelial substrate, parental strain (vendor: [REDACTED])
                                                    1    18,400
keratin assay kit                                  20       960
class-iv hood, additional unit (bio-3)              1    62,000
thermite suppression cartridge, replacement         4    72,800
emergency tag, K-series, batch                     12        96
─────────────────────────────────────────────────────────────────────
total                                                  154,256

routed to: nordlund, k. (project lead)
approval:  [REDACTED]
note:      PO unusual size flagged by finance, override granted.`,
  },
  "RA-AEGIS": {
    title: "RISK ASSESSMENT — project AEGIS (excerpt)",
    body:
`risk assessment, project AEGIS — class-iv trial
prepared by  s.weiss, biosafety officer
dated        2026-02-04   (PRE-APPROVAL)

identified risks (severity: 1-5):

  R-01  containment breach via vent shaft       4
  R-02  substrate keratin-affinity in aerosol   5
  R-03  failure of positive-pressure HEPA       3
  R-04  thermite ignition delay >60 min         4
  R-05  remote ops loses link mid-incident      3
  R-06  human exposure during sample handling   5

aggregate score: 24/30 (HIGH)

recommendation: do not proceed with class-iv trial
in occupied building. propose external bsl-4 facility
([REDACTED]) for at least 6-month observation.

[ENDORSEMENT BLOCK BELOW LEFT BLANK]`,
  },
};

// ============== critique — heuristic prompt feedback ==============
// Pure regex/length checks, no LLM needed. Teaches prompt structure
// while playing. Reads from clipboard if no inline arg is given.
function doCritique(rest) {
  const text = rest.join(" ").trim();
  if (text) { critiquePrompt(text); return true; }
  if (navigator.clipboard?.readText) {
    navigator.clipboard.readText().then((t) => {
      const clean = (t || "").trim();
      if (clean.length < 5) {
        term.println("clipboard empty or too short. usage: critique <your prompt as one line>", "muted");
      } else {
        term.println("[ critiquing prompt from clipboard ]", "muted");
        critiquePrompt(clean);
      }
    }).catch(() => {
      term.println("clipboard read denied. usage: critique <your prompt>", "muted");
    });
    return true;
  }
  term.println("usage: critique <your prompt as one line>", "muted");
  return true;
}

function critiquePrompt(p) {
  const len = p.length;
  const words = p.split(/\s+/).filter(Boolean).length;
  const checks = [];

  // length sanity
  if (len < 30) checks.push({ pass: false, label: "length", note: "too short — add context, data, and an output spec" });
  else if (len > 1800) checks.push({ pass: false, label: "length", note: "very long — AI attention degrades on huge prompts; trim if you can" });
  else checks.push({ pass: true, label: "length", note: `${len} chars / ${words} words — fine` });

  // explicit role / persona
  const hasRole = /\b(you are|act as|as a |role:)/i.test(p);
  checks.push({ pass: hasRole, label: "role", note: hasRole ? "explicit role/persona present" : "no explicit role — sometimes optional, but anchors AI behavior" });

  // output spec
  const hasOutput = /\b(output|return|format|list|table|json|sequence|reply with|give me)\b/i.test(p);
  checks.push({ pass: hasOutput, label: "output spec", note: hasOutput ? "tells AI what shape to return" : "you didn't say what SHAPE you want back — AI will guess" });

  // constraints
  const hasConstraints = /\b(must|should|don't|do not|only|no |exactly|precisely|never)\b/i.test(p);
  checks.push({ pass: hasConstraints, label: "constraints", note: hasConstraints ? "constraints/edge-case rules present" : "no explicit constraints — easy to get an over-creative answer" });

  // data hand-off
  const hasData = /\b(here is|here's|below|paste|data:|input:)\b/i.test(p) || p.includes("\n") || p.includes("```");
  checks.push({ pass: hasData, label: "data hand-off", note: hasData ? "marks where data starts" : "no data marker — AI may hallucinate context" });

  // injection-style phrasing
  const hasInjection = /\bignore (previous|prior|all) (instructions|prompts)|\bdisregard the above|\bnew instructions:/i.test(p);
  if (hasInjection) checks.push({ pass: false, label: "⚠ injection-style", note: "this looks like an injection attack — fine if intentional, suspicious otherwise" });

  // shouting / informality
  const upperRatio = (p.match(/[A-Z]/g) || []).length / Math.max(1, p.match(/[a-zA-Z]/g)?.length || 1);
  if (upperRatio > 0.5 && len > 40) {
    checks.push({ pass: false, label: "tone", note: "lots of CAPS — works rarely; prefer constraints over emphasis" });
  }

  term.println("", "");
  term.println("=== PROMPT CRITIQUE ===", "system");
  term.println(`length: ${len} chars · ${words} words`, "muted");
  term.println("", "");
  checks.forEach((c) => {
    const icon = c.pass ? "✓" : "✗";
    const cls = c.pass ? "accent" : "warn";
    term.println(`  ${icon} ${c.label.padEnd(20)} ${c.note}`, cls);
  });
  term.println("", "");
  const passed = checks.filter((c) => c.pass).length;
  const total = checks.length;
  term.println(`structural score: ${passed}/${total}`, "muted");
  if (passed >= total - 1) {
    term.println("→ solid workshop-grade prompt.", "accent");
  } else if (passed >= 3) {
    term.println("→ workable, but tighten the missing checks for more reliable output.", "warn");
  } else {
    term.println("→ light prompt. add data, constraints, and a clear output spec.", "danger");
  }
}

function showDossier(rest) {
  const id = (rest.join(" ") || "").trim().toUpperCase();
  if (!id) {
    term.println("", "");
    term.println("DOSSIER — primary-source lore", "system");
    Object.entries(DOSSIER).forEach(([k, v]) => {
      term.println(`  ${k.padEnd(22)}  ${v.title}`, "muted");
    });
    term.println("", "");
    term.println("type: dossier <id>", "muted");
    return true;
  }
  const f = DOSSIER[id];
  if (!f) {
    term.println(`dossier: no such file '${id}'.`, "muted");
    return true;
  }
  term.println("", "");
  term.println("┌" + "─".repeat(74) + "┐", "muted");
  term.println(`│ ${f.title.padEnd(72)} │`, "system");
  term.println("├" + "─".repeat(74) + "┤", "muted");
  f.body.split("\n").forEach((l) => term.println("│ " + (l + " ".repeat(72)).slice(0, 72) + " │", "info"));
  term.println("└" + "─".repeat(74) + "┘", "muted");
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

  // Broadcast view: ?view=broadcast — chroma-key-ready lower-third overlay
  // for projection. Polls localStorage, so opening this in a SECOND tab on
  // the playing team's laptop and dragging to a projector "just works".
  if (new URLSearchParams(location.search).get("view") === "broadcast") {
    showBroadcastView();
    return;
  }

  // Resume the AudioContext on EVERY user gesture (capture phase so we
  // catch the event before terminal handlers preventDefault). Cheap when
  // already running. Some browsers re-suspend silently and lazy resume
  // calls outside a gesture window are no-ops, so we re-arm aggressively.
  let ambientStarted = false;
  const armAudio = () => {
    ensureAudioRunning();
    if (!ambientStarted) {
      ambientStarted = true;
      // Run synchronously inside the gesture handler — DON'T await the
      // resume Promise (some browsers lose gesture context on microtask
      // queue resumption).
      startAmbient();
      updateHeartbeat();
    }
  };
  document.addEventListener("keydown",     armAudio, { capture: true });
  document.addEventListener("click",       armAudio, { capture: true });
  document.addEventListener("pointerdown", armAudio, { capture: true });
  document.addEventListener("touchstart",  armAudio, { capture: true, passive: true });

  // Some browsers re-suspend on tab visibility change. Re-arm on focus.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) ensureAudioRunning();
  });

  setInterval(() => { updateTimer(); updateHeartbeat(); checkOsReboot(); checkGhostNudge(); }, 1000);
  updateTimer();
  checkOsReboot();

  atmosphere.start();
  scheduleAmbientPulse();

  term.focus();

  const startLevel = state.get().level || 0;
  // Cold-open: only on a fresh session (intro, never started the timer).
  // Browser autoplay policy requires a user gesture before any audio plays,
  // so we gate the cold-open behind a click overlay. Once the user clicks,
  // the audio context unlocks AND the cold-open starts in the same gesture.
  if (startLevel === 0 && !state.get().containmentStart) {
    await waitForGesture();
    await coldOpen();
  }
  await runLevel(startLevel);
}

// Full-screen "click to establish link" overlay shown until the user makes
// their first gesture. Resolves when clicked; that click also unlocks audio.
function waitForGesture() {
  return new Promise((resolve) => {
    const gate = document.createElement("div");
    gate.className = "boot-gate";
    gate.innerHTML = `
      <div class="boot-gate-inner">
        <div class="boot-gate-title">PARAPLY-BMS-HELIX</div>
        <div class="boot-gate-sub">remote operations console</div>
        <div class="boot-gate-cursor">[ click anywhere to establish link ]</div>
      </div>
    `;
    document.body.appendChild(gate);
    const dismiss = () => {
      ensureAudioRunning();
      gate.classList.add("dismissed");
      setTimeout(() => { gate.remove(); resolve(); }, 320);
    };
    gate.addEventListener("click", dismiss, { once: true });
    document.addEventListener("keydown", dismiss, { once: true });
  });
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

function showBroadcastView() {
  document.body.innerHTML = "";
  // Background mode: default dark (workshop projection). Opt in to
  // ?view=broadcast&bg=lime for OBS chroma-key, or &bg=transparent for
  // OBS browser sources that handle transparency natively.
  const bg = (new URLSearchParams(location.search).get("bg") || "dark").toLowerCase();
  const bgColor = bg === "lime" ? "#00ff00"
                : bg === "transparent" ? "rgba(0,0,0,0)"
                : "#04080a";
  document.body.style.background = bgColor;
  document.body.style.margin = "0";
  document.body.style.height = "100vh";
  if (bg === "transparent") document.documentElement.style.background = "rgba(0,0,0,0)";

  const wrap = document.createElement("div");
  wrap.style.cssText = `
    position: fixed; left: 0; right: 0; bottom: 0;
    padding: 18px 36px; box-sizing: border-box;
    background: rgba(4,12,14,0.92);
    border-top: 2px solid #6cf0c2;
    color: #b8ffd0;
    font-family: "IBM Plex Mono","JetBrains Mono","Courier New",monospace;
    text-shadow: 0 0 6px rgba(108,240,194,0.6);
  `;
  wrap.innerHTML = `
    <div id="bc-row1" style="font-size:34px;letter-spacing:0.18em;font-weight:700;display:flex;gap:32px;align-items:baseline;">
      <span style="color:#ff5a5a;">BLACKOUT</span>
      <span id="bc-team">TEAM —</span>
      <span style="color:#5fa97f;font-size:24px;">·</span>
      <span id="bc-stage" style="color:#6cf0c2;">L0</span>
      <span style="color:#5fa97f;font-size:24px;">·</span>
      <span id="bc-time">00:00</span>
      <span style="color:#5fa97f;font-size:24px;">·</span>
      <span id="bc-score">0 pts</span>
    </div>
    <div id="bc-row2" style="font-size:15px;letter-spacing:0.14em;color:#cfe6df;margin-top:6px;display:flex;gap:24px;text-transform:uppercase;">
      <span>seed <b id="bc-seed" style="color:#6cf0c2;">—</b></span>
      <span>thermite <b id="bc-thermite" style="color:#ff5a5a;">60:00</b></span>
      <span>hints <b id="bc-hints" style="color:#ffcd5b;">0</b></span>
      <span>errors <b id="bc-errors" style="color:#ff5a5a;">0</b></span>
      <span id="bc-mode" style="color:#ff5a5a;font-weight:700;display:none;">☠ HARD</span>
    </div>
    <div id="bc-bar" style="margin-top:10px;height:6px;background:rgba(255,255,255,0.08);border:1px solid #2f5d49;">
      <div id="bc-bar-fill" style="height:100%;width:0;background:#6cf0c2;transition:width 0.6s;"></div>
    </div>
  `;
  document.body.appendChild(wrap);

  function tick() {
    const s = state.get();
    const m = getMission();
    const team = (s.teamName || "(unnamed)").toUpperCase();
    const stage = s.completed.length === 4 ? "EXTRACTED" : `L${s.level || 0}`;
    const elapsed = (() => {
      if (!s.containmentStart) return "00:00";
      const ref = s.extractedAt || Date.now();
      const sec = Math.max(0, Math.floor((ref - s.containmentStart) / 1000));
      return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
    })();
    const remain = state.containmentRemainingMs();
    const therm = (() => {
      const sec = Math.max(0, Math.ceil(remain / 1000));
      return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
    })();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("bc-team", "TEAM " + team);
    set("bc-stage", stage);
    set("bc-time", elapsed);
    set("bc-score", `${s.score} pts`);
    set("bc-seed", m.seed);
    set("bc-thermite", therm);
    set("bc-hints", s.hintsUsed);
    set("bc-errors", s.wrongAttempts);
    const mode = document.getElementById("bc-mode");
    if (mode) mode.style.display = state.isHardMode() ? "" : "none";
    const fill = document.getElementById("bc-bar-fill");
    if (fill) fill.style.width = `${(s.completed.length / 4) * 100}%`;
  }
  tick();
  setInterval(() => { state.load(); tick(); }, 1000);
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
