// Level 1: Locate the survivor on floor 4.
// Players use sensor data + CCTV stills (text descriptions) to identify
// the survivor's room and 3 hostile rooms.

import { ops } from "../opspanel.js";

const FLOOR_4_PLAN = String.raw`
  HELIX TOWER  :  FLOOR 4 — RESEARCH WING

  +---------+---------+---------+---------+---------+
  |  4-01   |  4-02   |  4-03 ! |  4-04   |  4-05   |
  |  Office |  Office |  Lab A  |  Storage|  Office |
  +---------+----+----+----+----+---------+---------+
  |  4-06        | corridor west|  4-07 ! |  4-08   |
  |  Conference  |              |  Lab B  |  Office |
  +---------+----+----+----+----+----+----+----+----+
  |  4-09   |  4-10   |  4-11   |  4-12   |  4-13   |
  |  Office |  Office | Comms   | Server  |  Office |
  +---------+---------+---------+---------+---------+
  |  4-14         corridor east           |  4-15 ! |
  |                                       |  Bio-3  |
  +---------------------------------------+---------+

  ! = high-priority area    Stairwells: 4-01 / 4-13   Elevators: 4-06 / 4-12
`;

const SENSORS = {
  // Each room: motion bursts/min, temperature C, CO2 ppm above ambient,
  // audio peaks dB above noise floor. Last 60s averaged.
  // 4-04, 4-08, 4-12 form a triple of survivor CANDIDATES whose profiles
  // intentionally LOOK alike — sensors alone can't disambiguate. In fact
  // 4-04's leaking gas cylinder pushes higher CO2 + more vibration than
  // 4-12's breathing, so AI ranking by raw numbers picks the WRONG room.
  // Only CCTV reveals which is real. Notes are kept observational, not
  // interpretive, so AI can't shortcut from the table alone.
  "4-01": { motion: 0,  temp: 22.1, co2: 0,   audio: 1,  notes: "—" },
  "4-02": { motion: 0,  temp: 22.0, co2: 0,   audio: 0,  notes: "—" },
  "4-03": { motion: 14, temp: 39.6, co2: 0,   audio: 38, notes: "—" },
  "4-04": { motion: 3,  temp: 22.0, co2: 580, audio: 4,  notes: "—" },
  "4-05": { motion: 0,  temp: 22.0, co2: 0,   audio: 0,  notes: "—" },
  "4-06": { motion: 1,  temp: 22.6, co2: 0,   audio: 2,  notes: "—" },
  "4-07": { motion: 22, temp: 40.1, co2: 0,   audio: 51, notes: "—" },
  "4-08": { motion: 1,  temp: 22.4, co2: 410, audio: 2,  notes: "—" },
  "4-09": { motion: 0,  temp: 22.0, co2: 0,   audio: 0,  notes: "—" },
  "4-10": { motion: 0,  temp: 22.2, co2: 0,   audio: 0,  notes: "—" },
  "4-11": { motion: 1,  temp: 23.4, co2: 0,   audio: 0,  notes: "—" },
  "4-12": { motion: 2,  temp: 22.6, co2: 510, audio: 2,  notes: "—" },
  "4-13": { motion: 0,  temp: 22.0, co2: 0,   audio: 1,  notes: "—" },
  "4-14": { motion: 0,  temp: 22.3, co2: 0,   audio: 0,  notes: "—" },
  "4-15": { motion: 31, temp: 39.9, co2: 0,   audio: 62, notes: "—" },
};

const CCTV = {
  "4-03": "image: thermal overlay, near-white silhouette pacing in tight loop. no exhalation plume detected. one hand drags along the wall. uniform: Paraply lab coat, torn.",
  "4-04": "image: storage room. metal cabinets along the wall. green hazmat tag visible: 'CO2 - 99% / N2 BACKUP'. one cylinder valve appears partially open. faint hiss audible. no occupants in frame. tag receiver: no signature.",
  "4-07": "image: lab bench overturned. fluid pooled. silhouette crouched over a second silhouette. no movement of chest cavity on either subject. ambient chitter audible — believed to be relay clicks.",
  "4-08": "image: empty office. door propped open into corridor. chair on its side. coffee cup tipped on desk. window slightly ajar. no breathing/pulse on passive sensors. tag receiver: no signature.",
  "4-11": "image: comms patch room. cold. no occupants. one rack flashing AMBER on uplink-3.",
  "4-12": "image: server room. low light. visible occupant: small frame, breathing rate 14/min, slumped against rack 7. left hand pressed to neck (likely wound or radio). right hand holds emergency tag glowing green.",
  "4-15": "image: bio-3 vault. door panel showing 'BREACH'. silhouette inside walking into walls. heat plume visible. no organized motion.",
  "4-06": "image: conference room. empty. coffee cup on table, still steaming faintly. chair tipped over.",
};

const ROOMS = Object.keys(SENSORS);
const SURVIVOR = "4-12";
const HOSTILES = new Set(["4-03", "4-07", "4-15"]);

let marks = { survivor: null, hostile: new Set() };
let briefedOnce = false;

function fmtRow(id, s) {
  return ` ${id}  motion=${String(s.motion).padStart(2)}/min` +
         `  temp=${s.temp.toFixed(1)}C` +
         `  co2=+${String(s.co2).padStart(4)}ppm` +
         `  audio=${String(s.audio).padStart(2)}dB  | ${s.notes}`;
}

// classify a room's sensor reading for the floor plan
function classify(s) {
  if (s.temp >= 38)             return "hot";
  if (s.co2 > 100)              return "warm"; // potential life signature
  if (s.temp >= 24 || s.audio > 5) return "warm";
  return "cold";
}

export const level1 = {
  registered: false,
  registerHints(ctx) {
    if (this.registered) return;
    ctx.registerHints(1, {
      nudge:  "Survivors breathe; the infected don't. CO2 means SOMETHING produces it — but the only living thing isn't the only source. Use CCTV.",
      method: "Hostiles share three signals: temp ≥ 38°C + motion ≥ 14 bursts/min + audio ≥ 38 dB. Survivor candidates: cool rooms with elevated CO2. MULTIPLE rooms will look like candidates from sensors alone — run 'cctv <id>' on every one to find the real survivor (the others are gas leaks or empty rooms).",
      answer: "Survivor: 4-12 (server room — green emergency tag visible). Hostiles: 4-03, 4-07, 4-15. The CO2 in 4-04 is from a leaking gas cylinder; 4-08 is empty with cross-ventilation.",
    });
    ctx.registerPrompts(1, [
      {
        title: "Classify rooms from sensor data",
        body:
`I have 15 rooms on a research-floor with sensor readings — motion bursts/min,
temperature (C), CO2 increase above ambient (ppm), audio peaks (dB).

ONE room hides a single living person (low motion, cool, elevated CO2 from
breathing). THREE rooms contain hostile entities (very high temp, very high
motion, very high audio, no breathing).

Build a scoring rule and rank each room. Output: a table with each room's
likely status (survivor / hostile / empty) and the criterion that triggered
that label.

DATA:
[paste 'sensors 4' output here]`,
      },
      {
        title: "Interpret a single CCTV description",
        body:
`Below is a text description from a CCTV still in a research building.
Tell me whether the subject is (a) alive and conscious, (b) infected/hostile,
(c) recently dead, or (d) empty room. Quote the specific words that justify
your call.

DESCRIPTION:
[paste 'cctv 4-XX' output here]`,
      },
      {
        title: "Disambiguate multiple survivor candidates",
        body:
`I have several rooms whose sensor readings look survivor-like (elevated CO2,
low motion, cool temperature). I also have CCTV descriptions for each.
Determine which room actually contains a single conscious survivor — the
others may be empty rooms with residual CO2, gas leaks, or recent corpses.

CANDIDATES (sensors + CCTV):
[paste rows from 'sensors 4' for the candidate rooms]
[paste 'cctv' output for each candidate]

Output: one room ID + a 2-sentence justification.`,
      },
    ]);
    this.registered = true;
  },

  async start(ctx) {
    const { term, sfx, state } = ctx;
    this.registerHints(ctx);
    ops.setMode("l1");
    ops.updateSurvivor({ bpm: 0, tag: "intermittent", location: "floor 4 (unresolved)" });
    ops.updateDrone({ state: "idle", pos: "—", batt: 100 });
    sfx.save();
    term.println("", "");
    term.println("=== L1  LOCATE THE SURVIVOR ===", "system");
    term.println("", "");
    if (!briefedOnce) {
      term.printBlock(
`Dr. Nordlund's emergency tag is broadcasting from somewhere on floor 4.
The building is dark. The infected lab personnel are still in there.

YOUR JOB
  • find which room she's in (ONE room — mark survivor)
  • find the THREE rooms with infected staff (mark hostile)
  • 'commit' when you're sure. drone will route to the survivor and
    avoid the hostile rooms.

WHAT TO LOOK FOR
  • infected: high temp (38-41°C), high motion bursts, audio spikes —
    AND no exhalation (CO2 stays at 0). they don't breathe.
  • survivor: a living human exhales. ELEVATED CO2 in a cool room with
    low motion is a candidate — but watch out: other things produce
    CO2 too (gas cylinders, ventilation cross-flow, recent occupants).
    expect MULTIPLE candidates from sensors alone — use CCTV to confirm.

USE AI — paste the sensor table into Claude / Copilot / Gemini and
ask it to RANK candidates. Then use CCTV on each candidate and ask
the AI to read each image description: living person, gas leak, or
empty room?

Commands you have here:
  sensors 4   — full sensor digest for floor 4 (start here)
  cctv 4-XX   — visual on a specific room
  plan 4      — ASCII floor plan
  mark survivor 4-XX     mark hostile 4-XX     unmark 4-XX
  marks       — show what you've marked
  commit      — submit your answer
  hint        — get a nudge (first hint free)`,
        "info"
      );
      briefedOnce = true;
    } else {
      term.println("brief reissued. type 'plan 4' to begin.", "muted");
    }
  },

  onCommand(cmd, args, raw, ctx) {
    const { term, sfx, state } = ctx;
    switch (cmd) {
      case "brief": return this.start(ctx);
      case "plan":
      case "floor": {
        const f = args[0] || "4";
        if (f !== "4") {
          term.println(`floor ${f}: power offline, plan unavailable.`, "muted");
          return;
        }
        term.printBlock(FLOOR_4_PLAN, "ascii");
        return;
      }
      case "sensors": {
        const f = args[0] || "4";
        if (f !== "4") {
          term.println(`sensors floor ${f}: feed dropped.`, "muted");
          return;
        }
        term.println("FLOOR 4 — sensor digest (60s avg):", "dim");
        ROOMS.forEach((id) => term.println(fmtRow(id, SENSORS[id]), "dim"));
        term.println("[ scanning rooms... ]", "muted");
        // sequential floor-plan light-up — feels like a real scan instead of
        // an instant blob. ~90ms per room.
        ROOMS.forEach((id, i) => {
          setTimeout(() => ops.scanRoom(id, classify(SENSORS[id])), i * 90);
        });
        setTimeout(() => {
          ops.updateSurvivor({
            bpm: 84, tag: "active",
            location: "floor 4, room unresolved",
          });
          term.println("[ scan complete. anomalies highlighted on floor plan. ]", "accent");
        }, ROOMS.length * 90 + 120);
        return;
      }
      case "cctv": {
        const id = (args[0] || "").toUpperCase().replace(/[^0-9-]/g, "").toLowerCase();
        const key = id.startsWith("4-") ? id : "4-" + id.replace(/^0+/, "").padStart(2, "0");
        if (!CCTV[key]) {
          term.println(`cctv ${key}: feed offline or no camera in that room.`, "muted");
          return;
        }
        term.println(`CCTV ${key}:`, "dim");
        term.println("  " + CCTV[key], "info");
        // brief flash on the floor plan
        const s = SENSORS[key];
        if (s) ops.scanRoom(key, classify(s));
        return;
      }
      case "mark": {
        const what = (args[0] || "").toLowerCase();
        const room = normRoom(args[1]);
        if (!room || !SENSORS[room]) {
          term.println("usage: mark survivor 4-XX  |  mark hostile 4-XX", "muted");
          return;
        }
        if (what === "survivor") {
          if (marks.survivor) ops.unmarkRoom(marks.survivor);
          marks.survivor = room;
          ops.markRoom(room, "survivor");
          term.println(`marked survivor → ${room}`, "accent");
        } else if (what === "hostile") {
          marks.hostile.add(room);
          ops.markRoom(room, "hostile");
          term.println(`marked hostile → ${room}`, "warn");
        } else {
          term.println("usage: mark survivor 4-XX  |  mark hostile 4-XX", "muted");
        }
        return;
      }
      case "unmark": {
        const room = normRoom(args[0]);
        if (!room) { term.println("usage: unmark 4-XX", "muted"); return; }
        if (marks.survivor === room) marks.survivor = null;
        marks.hostile.delete(room);
        ops.unmarkRoom(room);
        term.println(`cleared marks for ${room}`, "muted");
        return;
      }
      case "marks": {
        term.println(`survivor: ${marks.survivor || "(none)"}`, "dim");
        term.println(`hostile : ${[...marks.hostile].join(", ") || "(none)"}`, "dim");
        return;
      }
      case "commit": {
        if (!marks.survivor || marks.hostile.size !== 3) {
          term.println(`need exactly 1 survivor mark and 3 hostile marks. you have ${marks.survivor ? 1 : 0} survivor and ${marks.hostile.size} hostile.`, "warn");
          return;
        }
        const survivorOk = marks.survivor === SURVIVOR;
        const setEqual = marks.hostile.size === HOSTILES.size &&
          [...marks.hostile].every((r) => HOSTILES.has(r));
        if (survivorOk && setEqual) {
          sfx.ok();
          state.addScore(25);
          state.addItem("ROOM-12");
          state.completeLevel(1);
          ops.scanRoom(SURVIVOR, "survivor");
          ops.updateSurvivor({
            bpm: 96, tag: "locked",
            location: "4-12 SERVER",
          });
          ops.setDronePos("4-12");
          ops.updateDrone({ state: "en route", pos: "4-12", batt: 98 });
          term.println("", "");
          term.println("[ MATCH. Drone dispatched. Tag confirmed. ]", "accent");
          term.println("  fragment acquired: ROOM-12  (her room number)", "accent");
          term.println("  +25 score", "muted");
          ctx.refreshHUD();
          ctx.go(2);
          return;
        }
        sfx.nope();
        state.get().wrongAttempts++;
        state.addScore(-2);
        state.save();
        term.println("[ no match. drone aborted. -2 score. ]", "danger");
        if (!survivorOk) term.println("  survivor location seems wrong.", "warn");
        if (!setEqual)   term.println("  hostile set incorrect — review sensor anomalies.", "warn");
        return;
      }
      default:
        term.println(`unknown: ${cmd}. try: plan 4, sensors 4, cctv 4-XX, mark, commit.`, "muted");
    }
  },
};

function normRoom(s) {
  if (!s) return null;
  const m = String(s).toLowerCase().match(/^4-?(\d{1,2})$/);
  if (!m) return null;
  return "4-" + m[1].padStart(2, "0");
}
