// Ambient pressure: random building-system noise lines + sporadic survivor
// comms drop into the terminal during gameplay (levels 1-4 only).

import { state } from "./state.js";

const NOISE_POOL = [
  "[SEC]  motion neg :: floor-2 corridor-east",
  "[HVAC] pressure delta +0.3 kPa :: floor-4 lab-b",
  "[NET]  uplink-3 retransmit count: 47 (degrading)",
  "[PWR]  brownout warning :: substation B (battery 71%)",
  "[BMS]  door 4-15 :: state DISCREPANCY (sensor says open, lock says open)",
  "[FIRE] suppression armature :: ARMED :: thermite charge nominal",
  "[SEC]  audio peak floor-1 lobby :: 41 dB :: source unknown",
  "[NET]  ping 4-12 :: 412ms :: jitter 84ms",
  "[HVAC] supply temperature drift :: floor-4 :: +1.2°C/h",
  "[SEC]  motion event :: stairwell-W :: ignored (rated below threshold)",
  "[BMS]  elevator A :: held :: maintenance lock",
  "[PWR]  generator 2 :: cycling :: rpm 3140",
  "[SEC]  audio anomaly floor-4 :: percussive :: 4 events/min",
  "[NET]  packet loss :: link to extr-relay :: 12.3%",
  "[BMS]  sprinkler valve 4-07 :: stuck closed :: aegis lab override",
  "[SEC]  no breath signature in motion zones :: floor-4",
  "[PWR]  ups :: estimated runtime 47 min",
  "[FIRE] thermite suppression timer :: T-MINUS active",
  "[BMS]  sub-system :: parasoll-bms-helix :: heartbeat 3s",
  "[SEC]  thermal source :: 39.8°C :: 4-15 :: tracking",
];

const SURV_CALM = [
  "i hear you. i'm staying low.",
  "tag battery says 64. i don't know what that means in time.",
  "the racks are still warm. i'm using them as cover.",
  "if you need me to move, just say where.",
  "the building keeps... humming wrong. is that you?",
  "i can hear something in the corridor. can you tell where?",
  "did the door just unlock? i can't see from here.",
  "thank you. for being there.",
];

const SURV_TENSE = [
  "they're closer. i can hear breathing that isn't breathing.",
  "the heat is unbearable in here. is the lab venting?",
  "tell me the drone is coming. please tell me.",
  "i don't know how long i can stay still.",
  "battery 22%. tag is failing. hurry.",
  "something is in the corridor. i don't think it's human.",
  "my hands are shaking too much. i can barely hold the tag.",
];

const SURV_PANIC = [
  "they know i'm here.",
  "i can't stay quiet anymore.",
  "the door. the door.",
  "please. please. please.",
];

let timer = null;
let survivorTimer = null;

let term = null;

const NOISE_MIN = 35_000, NOISE_MAX = 80_000;
const SURV_MIN  = 90_000, SURV_MAX  = 180_000;

export const atmosphere = {
  attach(terminal) { term = terminal; },

  start() {
    this.stop();
    this.#scheduleNoise();
    this.#scheduleSurvivor();
  },

  stop() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (survivorTimer) { clearTimeout(survivorTimer); survivorTimer = null; }
  },

  #active() {
    const lvl = state.get().level;
    return lvl >= 1 && lvl <= 4;
  },

  #scheduleNoise() {
    const wait = NOISE_MIN + Math.random() * (NOISE_MAX - NOISE_MIN);
    timer = setTimeout(() => {
      if (this.#active() && term) {
        const line = NOISE_POOL[Math.floor(Math.random() * NOISE_POOL.length)];
        const ts = nowStamp();
        term.println(`${ts}  ${line}`, "noise");
      }
      this.#scheduleNoise();
    }, wait);
  },

  #scheduleSurvivor() {
    const remaining = state.containmentRemainingMs();
    let pool = SURV_CALM;
    let scale = 1;
    if (remaining < 12 * 60 * 1000) { pool = SURV_PANIC; scale = 0.5; }
    else if (remaining < 25 * 60 * 1000) { pool = SURV_TENSE; scale = 0.7; }
    const min = SURV_MIN * scale, max = SURV_MAX * scale;
    const wait = min + Math.random() * (max - min);
    survivorTimer = setTimeout(() => {
      if (this.#active() && term) {
        const msg = pool[Math.floor(Math.random() * pool.length)];
        term.println(msg, "survivor");
      }
      this.#scheduleSurvivor();
    }, wait);
  },
};

function nowStamp() {
  const d = new Date();
  return `[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]`;
}
function pad(n) { return n.toString().padStart(2, "0"); }
