// Mission C — door agent. Ten chained routing rounds against the clock.
// Round N+1 is encrypted with the answer to round N, so there is no way
// around actually solving every round. The deadline makes manual solving
// impossible: teams are expected to script the console API.

import { open, normalize } from "../crypto.js";

const DEADLINE_MS = 8000;
const ROUNDS = 10;

const SPEC =
`DOOR AGENT PROTOCOL v3
  scenario = { round, start, goal, hostile: [room...],
               doors: [{ id, a, b, period, open, phase }...] }

  - at tick 0 the drone is in 'start'.
  - each tick the drone either WAITS, or passes through ONE door adjacent
    to its room that is open at that tick. it arrives at tick + 1.
  - a door is open at tick t   iff   (t + phase) % period < open
  - doors work in both directions. never enter a hostile room.
  - answer: the door ids, in order, of the route that reaches 'goal' at
    the EARLIEST possible tick. waits are not listed.
    exactly one door sequence achieves the earliest arrival.

  ${ROUNDS} rounds. ${DEADLINE_MS / 1000} s per round. a wrong answer or a missed deadline
  loses the drone and the chain restarts at round 1.

console API (DevTools):
  BLACKOUT.doors.start()            -> scenario (round 1)
  BLACKOUT.doors.current()          -> scenario | null
  await BLACKOUT.doors.submit(seq)  -> { ok, done, round, message }
                                       seq = ["D101","D202"] or "D101 D202"`;

let run = null; // { round, scenario, deadline, timer }

export const missionC = {
  id: "C",
  title: "DOOR AGENT",
  tag: "programming",
  hints: [
    "Nobody types fast enough. Use the console API (BLACKOUT.doors.*) from DevTools and have your AI write the solver loop.",
    "From round 4, doors open on a schedule. Plain BFS over rooms gives the wrong route — search over (room, tick) states, and waiting is a move.",
    "Door open at tick t iff (t + phase) % period < open. Passing takes one tick. BFS over (room, tick) layer by layer; keep parent pointers; return only the doors.",
  ],

  install(ctx) {
    const api = {
      start: () => this.start(ctx),
      current: () => (run && Date.now() <= run.deadline ? structuredClone(run.scenario) : null),
      submit: (seq) => this.submit(ctx, seq),
      spec: () => SPEC,
    };
    window.BLACKOUT = Object.assign(window.BLACKOUT || {}, { doors: api });
  },

  brief({ term }) {
    term.println("=== MISSION C  ::  DOOR AGENT  [programming] ===", "system");
    term.printBlock(
`The drone must cross the building to reach the survivor. The BMS is
cycling doors on schedules and maintenance units have taken some rooms.

Our uplink only holds for ${DEADLINE_MS / 1000} seconds per segment. Ten segments, back to
back. No human can route that fast. Build an agent that can.`,
      "info");
    term.blank();
    term.printBlock(SPEC, "muted");
    term.blank();
    term.printBlock(
`commands: start | show | route <doors...> | spec | brief | hint | back`, "muted");
  },

  start(ctx) {
    this.stop();
    run = { round: 1, scenario: ctx.manifest.missions.C.first };
    this.arm(ctx);
    return structuredClone(run.scenario);
  },

  arm(ctx) {
    const { term } = ctx;
    const sc = run.scenario;
    run.deadline = Date.now() + DEADLINE_MS;
    run.timer = setTimeout(() => {
      term.println(`[ round ${sc.round}: uplink timeout — drone lost. 'start' to retry. ]`, "danger");
      ctx.sfx.nope();
      run = null;
    }, DEADLINE_MS);
    term.println(
      `[ round ${sc.round}/${ROUNDS} ] ${sc.doors.length} doors, ${sc.hostile.length} hostile, ${sc.start} → ${sc.goal}  ::  ${DEADLINE_MS / 1000}s`,
      "warn");
  },

  stop() {
    if (run?.timer) clearTimeout(run.timer);
    run = null;
  },

  async submit(ctx, seq) {
    const { term, sfx, manifest } = ctx;
    if (!run || Date.now() > run.deadline) return { ok: false, done: false, round: 0, message: "no active round — call start()" };
    const answer = normalize(Array.isArray(seq) ? seq.join(" ") : seq);
    const r = run.round;
    const box = r < ROUNDS ? manifest.missions.C.next[r - 1] : manifest.missions.C.reward;
    clearTimeout(run.timer);
    const payload = await open(answer, box);
    if (!payload) {
      sfx.nope();
      term.println(`[ round ${r}: route rejected — drone lost. chain reset. ]`, "danger");
      run = null;
      return { ok: false, done: false, round: r, message: "wrong route — chain reset, call start()" };
    }
    sfx.ok();
    term.println(`[ round ${r}: route confirmed ]`, "accent");
    if (r === ROUNDS) {
      run = null;
      term.println("[ drone has reached the survivor's floor. ]", "accent");
      await ctx.complete("C", payload.fragment);
      return { ok: true, done: true, round: r, message: "all rounds cleared" };
    }
    run = { round: r + 1, scenario: payload };
    this.arm(ctx);
    return { ok: true, done: false, round: r + 1, message: "next round", scenario: structuredClone(payload) };
  },

  async onCommand(cmd, args, raw, ctx) {
    const { term } = ctx;
    switch (cmd) {
      case "spec": term.printBlock(SPEC, "muted"); return true;
      case "start": this.start(ctx); return true;
      case "show":
        if (!run) { term.println("no active round. 'start' first.", "muted"); return true; }
        term.printBlock(JSON.stringify(run.scenario), "dim");
        return true;
      case "route":
      case "submit":
        if (!args.length) { term.println("usage: route D101 D202 ...", "muted"); return true; }
        await this.submit(ctx, args.join(" "));
        return true;
    }
    return false;
  },

  leave() { /* keep the run alive; the API works from any mission */ },
};
