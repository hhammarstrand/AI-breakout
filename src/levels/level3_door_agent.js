// Level 3: Build the Door Agent.
// Players write a script (with AI help) that finds a safe path from the
// server room to the rooftop avoiding hostile rooms and locked doors.
// They submit the door sequence; we verify against a canonical solution.

import { ops } from "../opspanel.js";

const HOSTILE = new Set(["4-03", "4-07", "4-15"]);

// Each door connects exactly two rooms. "locked" doors cannot be used.
const DOORS = [
  { id: "D01", a: "4-12",     b: "CORR-E",    locked: false },
  { id: "D02", a: "CORR-E",   b: "4-13",      locked: false },
  { id: "D03", a: "CORR-E",   b: "4-15",      locked: false }, // → hostile
  { id: "D04", a: "CORR-E",   b: "4-11",      locked: false },
  { id: "D05", a: "CORR-E",   b: "CORR-W",    locked: true  },
  { id: "D06", a: "4-11",     b: "CORR-W",    locked: false },
  { id: "D07", a: "CORR-W",   b: "4-07",      locked: false }, // → hostile
  { id: "D08", a: "CORR-W",   b: "4-06",      locked: false },
  { id: "D09", a: "4-06",     b: "ELEV-A",    locked: true  },
  { id: "D10", a: "4-13",     b: "STAIR-E",   locked: false },
  { id: "D11", a: "STAIR-E",  b: "ROOF",      locked: false },
  { id: "D12", a: "4-11",     b: "STAIR-E",   locked: false },
  { id: "D13", a: "4-12",     b: "ELEV-B",    locked: true  },
  { id: "D14", a: "ELEV-A",   b: "ROOF",      locked: false },
  { id: "D15", a: "4-06",     b: "STAIR-W",   locked: false },
  { id: "D16", a: "STAIR-W",  b: "ROOF",      locked: true  },
];

const START = "4-12";
const GOAL  = "ROOF";

// Canonical answer (BFS, lex-min on door id when tied):
const CANONICAL = canonicalPath();

function canonicalPath() {
  // BFS over door graph; nodes are rooms; we forbid hostile rooms entirely
  // (cannot enter them at all) and locked doors.
  const adj = new Map();
  for (const d of DOORS) {
    if (d.locked) continue;
    if (HOSTILE.has(d.a) || HOSTILE.has(d.b)) continue;
    if (!adj.has(d.a)) adj.set(d.a, []);
    if (!adj.has(d.b)) adj.set(d.b, []);
    adj.get(d.a).push({ door: d.id, to: d.b });
    adj.get(d.b).push({ door: d.id, to: d.a });
  }
  const visited = new Set([START]);
  const q = [{ room: START, path: [] }];
  while (q.length) {
    const { room, path } = q.shift();
    if (room === GOAL) return path;
    const nbrs = (adj.get(room) || []).slice().sort((x, y) => x.door.localeCompare(y.door));
    for (const n of nbrs) {
      if (visited.has(n.to)) continue;
      visited.add(n.to);
      q.push({ room: n.to, path: path.concat(n.door) });
    }
  }
  return [];
}

const SPEC = `
DOOR ROUTER  v1  —  SPEC

input:
  doors: list of { id, a, b, locked }    // see 'doors' command
  hostile: set of room names              // see 'hostile' command
  start: "${START}"   goal: "${GOAL}"

required: a list of door ids that, when followed in order, traverses
adjacent rooms from start to goal without:
  - using a 'locked' door
  - entering any 'hostile' room

return: the SHORTEST such sequence (fewest doors).
on tie, prefer doors with the lex-smallest id.

submit by typing:    agent D01,D02,D11
(comma or space-separated, case-insensitive)
`;

export const level3 = {
  registered: false,
  registerHints(ctx) {
    if (this.registered) return;
    ctx.registerHints(3, [
      "Translate the door list into a graph: nodes are rooms, edges are doors.",
      "Hostile rooms are not just to avoid passing through — you can't even enter them. Filter the graph first.",
      "BFS gives shortest path. Walk parents back to reconstruct the door sequence.",
    ]);
    this.registered = true;
  },

  async start(ctx) {
    const { term } = ctx;
    this.registerHints(ctx);
    ops.setMode("l3");
    ops.updateSurvivor({ bpm: 114, tag: "locked", location: "4-12 SERVER" });
    ops.updateDrone({ state: "awaiting route", pos: "4-12", batt: 91 });
    term.println("", "");
    term.println("=== L3  BUILD THE DOOR AGENT ===", "system");
    term.println("", "");
    term.printBlock(
`The drone has the survivor in the server room (4-12). It needs a safe
path to the rooftop (ROOF) where extraction will land.

Some doors are locked. Some rooms are hostile and cannot be entered.

Write a small script (Python / JS / pseudo-code — use your AI) that finds
the shortest safe door sequence. Submit your script's output.

Commands: spec / doors / hostile / agent <seq> / brief / hint`,
      "info"
    );
    term.printBlock(SPEC, "muted");
  },

  onCommand(cmd, args, raw, ctx) {
    const { term, sfx, state } = ctx;
    switch (cmd) {
      case "brief": return this.start(ctx);
      case "spec": term.printBlock(SPEC, "muted"); return;
      case "doors": {
        term.println("doors:", "dim");
        term.println("[", "dim");
        DOORS.forEach((d) => {
          term.println(`  { "id": "${d.id}", "a": "${d.a}", "b": "${d.b}", "locked": ${d.locked} },`, "dim");
        });
        term.println("]", "dim");
        return;
      }
      case "hostile": {
        term.println(`hostile: [${[...HOSTILE].map((r) => `"${r}"`).join(", ")}]`, "dim");
        return;
      }
      case "agent":
      case "submit": {
        const seq = args.join(" ").split(/[\s,]+/).filter(Boolean).map((s) => s.toUpperCase());
        if (!seq.length) { term.println("usage: agent D01,D02,...", "muted"); return; }
        const result = simulate(seq);
        if (result.ok && result.length === CANONICAL.length) {
          sfx.ok();
          state.addScore(25);
          state.addItem("ROUTE-" + CANONICAL.join("-"));
          state.completeLevel(3);
          // walk drone marker through the path on the floor plan
          const visited = ["4-12"];
          let here = "4-12";
          for (const id of CANONICAL) {
            const door = DOORS.find((d) => d.id === id);
            const next = door.a === here ? door.b : door.a;
            visited.push(next); here = next;
          }
          let i = 0;
          const stepRoom = () => {
            const r = visited[i++];
            if (!r) { ops.updateDrone({ state: "at rooftop", pos: "ROOF", batt: 78 }); return; }
            ops.setDronePos(r);
            ops.updateDrone({ state: "in transit", pos: r, batt: 88 - i });
            if (i < visited.length) setTimeout(stepRoom, 380);
            else setTimeout(() => ops.updateDrone({ state: "at rooftop", pos: "ROOF", batt: 78 }), 380);
          };
          stepRoom();
          term.println("", "");
          term.println("[ route accepted. drone moving. ]", "accent");
          term.println("  canonical answer: " + CANONICAL.join(" → "), "muted");
          term.println("  fragment acquired: ROUTE-" + CANONICAL.join("-"), "accent");
          term.println("  +25 score", "muted");
          ctx.refreshHUD();
          ctx.go(4);
          return;
        }
        sfx.nope();
        state.get().wrongAttempts++;
        state.addScore(-2);
        state.save();
        term.println("[ route rejected. -2 score. ]", "danger");
        result.errors.forEach((e) => term.println("  • " + e, "warn"));
        if (result.ok && result.length !== CANONICAL.length) {
          term.println(`  not the SHORTEST safe path (you used ${result.length}, optimal is ${CANONICAL.length}).`, "warn");
        }
        return;
      }
      default:
        term.println(`unknown: ${cmd}. try 'spec', 'doors', 'agent <seq>'.`, "muted");
    }
  },
};

function simulate(seq) {
  const errors = [];
  const byId = new Map(DOORS.map((d) => [d.id, d]));
  let room = START;
  for (const id of seq) {
    const d = byId.get(id);
    if (!d) { errors.push(`unknown door: ${id}`); break; }
    if (d.locked) { errors.push(`door ${id} is locked.`); break; }
    let next = null;
    if (d.a === room) next = d.b;
    else if (d.b === room) next = d.a;
    else { errors.push(`door ${id} is not adjacent to ${room}.`); break; }
    if (HOSTILE.has(next)) { errors.push(`door ${id} leads into hostile room ${next}.`); break; }
    room = next;
  }
  const ok = errors.length === 0 && room === GOAL;
  if (!ok && errors.length === 0) errors.push(`path ended at ${room}, expected ${GOAL}.`);
  return { ok, errors, length: seq.length };
}
