// Entry point. Wires terminal, state, audio, and the level state machine.

import { Terminal, parseCommand, sleep } from "./src/terminal.js";
import { state } from "./src/state.js";
import { sfx, refreshAudio, startAmbient } from "./src/audio.js";
import { nextHint, registerHints, hintCount } from "./src/hints.js";

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
  if (totalSec <= 0) {
    ui.crt.classList.add("danger");
    ui.timer.textContent = "00:00";
  } else if (totalSec < 600) {
    ui.crt.classList.add("danger");
  } else {
    ui.crt.classList.remove("danger");
  }
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
  go(n) { runLevel(n); },
  refreshHUD,
};

async function runLevel(n) {
  state.setLevel(n);
  setLabel();
  refreshHUD();
  activeLevel = levels[n];
  if (!activeLevel) {
    term.println(`[fatal] no module for level ${n}`, "danger");
    return;
  }
  await activeLevel.start(ctx);
}

function dispatch(line) {
  sfx.key();
  const args = parseCommand(line);
  const cmd = (args[0] || "").toLowerCase();
  const rest = args.slice(1);

  // Global commands always available.
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
    case "clear":    term.clear(); return true;
    case "status":   return showStatus();
    case "inventory":
    case "inv":      return showInventory();
    case "hint":     return giveHint();
    case "audio":    return toggleAudio();
    case "reset":    return doReset(rest[0] === "--confirm");
    case "skip":
      // dev cheat: only available with ?dev=1
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
  status            — mission status
  inventory | inv   — list collected fragments
  hint              — request a hint (first free per level, then -5 pts)
  clear             — clear the terminal
  audio             — toggle SFX
  reset --confirm   — wipe all progress

level-specific commands appear after each briefing. type 'brief' to re-read it.`,
    "dim"
  );
  return true;
}

function showStatus() {
  const s = state.get();
  term.printBlock(
`mission   : OPERATION LIFELINE
status    : ${s.completed.length === 4 ? "EXTRACTED" : "ACTIVE"}
progress  : ${s.completed.length}/${state.totalLevels} levels
score     : ${s.score}
hints     : ${s.hintsUsed}
errors    : ${s.wrongAttempts}
items     : ${s.inventory.length ? s.inventory.join(", ") : "(none)"}`,
    "dim"
  );
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
  state.get().hintsUsed += 1;
  state.save();
  term.println(`[hint ${h.index || "-"}/${h.total || "-"}]`, "warn");
  term.println("  " + h.text, "warn");
  if (h.cost > 0) term.println(`  (-${h.cost} pts)`, "muted");
  refreshHUD();
  return true;
}

function toggleAudio() {
  const enabled = state.toggleAudio();
  ui.audioBtn.textContent = enabled ? "SFX ON" : "SFX OFF";
  refreshAudio();
  if (enabled) startAmbient();
  term.println(enabled ? "audio: ON" : "audio: OFF", "muted");
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

// Boot.
async function boot() {
  state.load();
  refreshHUD();
  setLabel();
  ui.audioBtn.textContent = state.get().audio ? "SFX ON" : "SFX OFF";
  ui.audioBtn.addEventListener("click", () => toggleAudio());

  document.getElementById("prompt-form").addEventListener("submit", (e) => {
    e.preventDefault();
  });

  term.setHandler(dispatch);

  // start ambient on first user gesture (browsers require it)
  const startAudioOnce = () => {
    startAmbient();
    document.removeEventListener("keydown", startAudioOnce);
    document.removeEventListener("click", startAudioOnce);
  };
  document.addEventListener("keydown", startAudioOnce);
  document.addEventListener("click", startAudioOnce);

  // tick timer
  setInterval(updateTimer, 1000);
  updateTimer();

  term.focus();

  const startLevel = state.get().level || 0;
  await runLevel(startLevel);
}

boot();
