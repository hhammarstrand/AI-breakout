// Entry point: terminal, state, mission hub and global commands.

import { Terminal, parseCommand } from "./src/terminal.js";
import { state, MISSIONS } from "./src/state.js";
import { sfx, refreshAudio, startAmbient } from "./src/audio.js";
import { open, normalize, sha256hex, receipt, slug } from "./src/crypto.js";
import { playIntro, MISSION_TABLE } from "./src/levels/intro.js";
import { playOutro } from "./src/levels/outro.js";
import { missionA } from "./src/missions/a_sensors.js";
import { missionB } from "./src/missions/b_lablog.js";
import { missionC } from "./src/missions/c_doors.js";
import { missionF } from "./src/missions/f_override.js";

const MOD = { A: missionA, B: missionB, C: missionC, F: missionF };

const term = new Terminal(
  document.getElementById("terminal"),
  document.getElementById("prompt-input"),
  document.getElementById("prompt-label"),
);

const ui = {
  progress: document.getElementById("hud-progress"),
  score: document.getElementById("hud-score"),
  timer: document.getElementById("hud-timer"),
  team: document.getElementById("hud-team"),
  audioBtn: document.getElementById("audio-toggle"),
  crt: document.querySelector(".crt"),
};

let manifest = null;

function refreshHUD() {
  const s = state.get();
  ui.progress.textContent = `${Object.keys(s.solved).length}/${MISSIONS.length}`;
  ui.score.textContent = state.score();
  ui.team.textContent = s.team || "—";
  const m = s.mission ? s.mission.toLowerCase() : "~";
  term.setLabel(s.team ? `${slug(s.team)}@blackout:${m}$` : "op@blackout:~$");
}

function updateTimer() {
  if (!state.get().containmentStart) return;
  const totalSec = Math.ceil(state.containmentRemainingMs() / 1000);
  const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const ss = (totalSec % 60).toString().padStart(2, "0");
  ui.timer.textContent = `${m}:${ss}`;
  ui.crt.classList.toggle("danger", totalSec < 600);
}

const ctx = {
  term, state, sfx,
  get manifest() { return manifest; },

  // Checks an answer against its sealed box. Returns the payload or null.
  async check(id, answer, box, decoyMsg = "[ BMS ] nice try.") {
    if (state.get().solved[id]) { term.println("already solved — your receipt is under 'receipts'.", "muted"); return null; }
    term.setEnabled(false);
    term.println("verifying...", "muted");
    try {
      const h = await sha256hex("blackout-decoy:" + normalize(answer));
      if ((manifest.decoys[id] || []).includes(h)) {
        state.bump("decoys", id);
        sfx.glitch();
        term.println(decoyMsg, "danger");
        term.println(`  -${state.costs.DECOY_COST} pts on mission ${id}. The building knows you use AI.`, "warn");
        return null;
      }
      const payload = await open(answer, box);
      if (!payload) {
        state.bump("wrong", id);
        sfx.nope();
        term.println(`[ rejected ]  -${state.costs.WRONG_COST} pts on mission ${id}`, "danger");
        return null;
      }
      return payload;
    } finally {
      term.setEnabled(true);
      refreshHUD();
    }
  },

  async complete(id, fragment, secret = fragment) {
    const s = state.get();
    const points = state.points(id);
    const rc = await receipt(id, s.team, points, secret);
    s.solved[id] = { points, receipt: rc, at: Date.now() };
    if (fragment) s.fragments[id] = fragment;
    state.save();
    sfx.ok();
    term.blank();
    if (fragment) term.println(`  fragment ${id}:  ${fragment}`, "accent");
    term.println(`  +${points} pts`, "accent");
    term.println(`  RECEIPT → paste in the Teams chat:  ${rc}`, "warn");
    term.blank();
    refreshHUD();
    if (["A", "B", "C"].every((k) => s.fragments[k]) && !s.solved.F) {
      term.println("all three fragments collected. 'mission F' to open the containment controller.", "accent");
    }
  },

  async outro(flag) {
    state.get().mission = null;
    state.save();
    refreshHUD();
    await playOutro(ctx, flag);
  },
};

function hub() {
  const s = state.get();
  term.println(`team ${s.team} — mission board`, "system");
  const lines = MISSION_TABLE.split("\n").map((l) => {
    const id = l.trim()[0];
    const done = s.solved[id];
    return (done ? `✓ ${String(done.points).padStart(3)} ` : "        ") + l.trim();
  });
  term.printBlock(lines.join("\n"), "dim");
  term.println("open one with 'mission <A|B|C|F>'. 'help' for all commands.", "muted");
}

async function enterMission(id) {
  if (!MOD[id]) { term.println("usage: mission <A|B|C|F>", "muted"); return; }
  state.get().mission = id;
  state.save();
  refreshHUD();
  term.blank();
  await MOD[id].brief(ctx);
}

function giveHint() {
  const s = state.get();
  const id = s.mission;
  if (!id) { term.println("open a mission first — hints are per mission.", "muted"); return; }
  const hints = MOD[id].hints;
  const n = s.hints[id];
  if (n >= hints.length) { term.println("no more hints. you're on your own.", "muted"); return; }
  state.bump("hints", id);
  term.println(`[hint ${n + 1}/${hints.length}${n > 0 ? `  -${state.costs.HINT_COST} pts` : "  (free)"}]`, "warn");
  term.println("  " + hints[n], "warn");
}

async function addFragment(token) {
  if (!token) { term.println("usage: fragment <token>", "muted"); return; }
  term.println("checking fragment...", "muted");
  for (const id of ["A", "B", "C"]) {
    if (await open(token, manifest.fragments[id])) {
      state.get().fragments[id] = normalize(token);
      state.save();
      sfx.ok();
      term.println(`[ fragment ${id} stored ]`, "accent");
      return;
    }
  }
  sfx.nope();
  term.println("[ not a valid fragment ]", "danger");
}

function globalHelp() {
  term.printBlock(
`global commands:
  mission <A|B|C|F>   open a mission (alias: cd)      back   return to the board
  board               mission board                    brief  re-read current briefing
  hint                hint for the current mission (first free, then -${state.costs.HINT_COST})
  fragment <token>    add a fragment a teammate found on another machine
  fragments           list collected fragments
  receipts            list your receipts (for the Teams chat)
  status | clear | audio | reset --confirm`,
    "dim");
}

function showStatus() {
  const s = state.get();
  term.printBlock(
`team      : ${s.team}
score     : ${state.score()}
solved    : ${Object.keys(s.solved).join(", ") || "—"}
fragments : ${Object.keys(s.fragments).join(", ") || "—"}
hints     : ${MISSIONS.map((m) => `${m}:${s.hints[m]}`).join("  ")}
wrong     : ${MISSIONS.map((m) => `${m}:${s.wrong[m]}`).join("  ")}
decoys    : ${MISSIONS.map((m) => `${m}:${s.decoys[m]}`).join("  ")}`,
    "dim");
}

async function dispatch(line) {
  sfx.key();
  const args = parseCommand(line);
  const cmd = (args[0] || "").toLowerCase();
  const rest = args.slice(1);
  const s = state.get();

  switch (cmd) {
    case "help": return globalHelp();
    case "clear": return term.clear();
    case "audio": {
      const on = state.toggleAudio();
      ui.audioBtn.textContent = on ? "SFX ON" : "SFX OFF";
      refreshAudio();
      return term.println(on ? "audio: ON" : "audio: OFF", "muted");
    }
    case "reset":
      if (rest[0] !== "--confirm") return term.println("type 'reset --confirm' to wipe all progress on this machine.", "warn");
      state.reset();
      term.println("state cleared. reloading...", "warn");
      return setTimeout(() => location.reload(), 500);
  }

  if (!s.team) {
    if (cmd !== "begin") return term.println("type 'begin <team name>' to start.", "muted");
    const team = rest.join(" ").trim();
    if (!team) return term.println("usage: begin <team name>", "muted");
    s.team = team;
    s.containmentStart = s.containmentStart || Date.now();
    state.save();
    sfx.save();
    term.println(`[ operator team '${team}' registered. containment clock running. ]`, "accent");
    term.blank();
    refreshHUD();
    return hub();
  }

  switch (cmd) {
    case "board": case "missions": case "ls": return hub();
    case "mission": case "cd":
      if (rest[0] === ".." ) return dispatch("back");
      return enterMission((rest[0] || "").toUpperCase());
    case "back":
      s.mission = null; state.save(); refreshHUD(); return hub();
    case "brief":
      return s.mission ? MOD[s.mission].brief(ctx) : hub();
    case "hint": giveHint(); return refreshHUD();
    case "status": return showStatus();
    case "fragment": return addFragment(rest.join(" "));
    case "fragments": case "inventory": case "inv": {
      const f = s.fragments;
      if (!Object.keys(f).length) return term.println("(no fragments yet)", "muted");
      return Object.entries(f).forEach(([k, v]) => term.println(`  ${k}  ${v}`, "accent"));
    }
    case "receipts": {
      if (!Object.keys(s.solved).length) return term.println("(no receipts yet)", "muted");
      return Object.values(s.solved).forEach((r) => term.println("  " + r.receipt, "warn"));
    }
    case "begin": return term.println(`already registered as '${s.team}'. 'reset --confirm' to start over.`, "muted");
  }

  if (s.mission && (await MOD[s.mission].onCommand(cmd, rest, line, ctx))) { refreshHUD(); return; }
  // Mission-specific commands work from the board too, if unambiguous.
  if (["role", "override"].includes(cmd)) return void (await missionF.onCommand(cmd, rest, line, ctx));
  if (["route", "start", "show", "spec"].includes(cmd)) return void (await missionC.onCommand(cmd, rest, line, ctx));
  term.println(`unknown command: ${cmd} — type 'help'`, "warn");
}

async function boot() {
  try {
    const res = await fetch("data/manifest.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    manifest = await res.json();
  } catch {
    term.clear();
    term.printBlock(
`[fatal] data/manifest.json not found.

this is the unbuilt source tree. build and serve the game with:
  npm run dev          (dev seed, http://localhost:8000)`, "danger");
    return;
  }

  state.load(manifest.build);
  missionC.install(ctx);
  refreshHUD();
  ui.audioBtn.textContent = state.get().audio ? "SFX ON" : "SFX OFF";
  ui.audioBtn.addEventListener("click", () => dispatch("audio"));
  document.getElementById("prompt-form").addEventListener("submit", (e) => e.preventDefault());
  term.setHandler((line) => { dispatch(line).catch((e) => term.println(`[error] ${e.message}`, "danger")); });

  const startAudioOnce = () => {
    startAmbient();
    document.removeEventListener("keydown", startAudioOnce);
    document.removeEventListener("click", startAudioOnce);
  };
  document.addEventListener("keydown", startAudioOnce);
  document.addEventListener("click", startAudioOnce);
  setInterval(updateTimer, 1000);
  updateTimer();
  term.focus();

  const s = state.get();
  if (!s.team) return playIntro(ctx);
  term.clear();
  term.println(`[ session restored — team ${s.team} ]`, "accent");
  term.blank();
  if (s.mission) return enterMission(s.mission);
  hub();
}

boot();
