// Final — containment override. Unlocked by fragments A+B+C. The
// information needed is split across three roles; each teammate opens one.

import { open } from "../crypto.js";

const ROLES = ["operator", "engineer", "medic"];
let views = null;

export const missionF = {
  id: "F",
  title: "OVERRIDE",
  tag: "teamwork",
  hints: [
    "Every teammate can run this terminal on their own machine: 'fragment <token>' for each fragment, then 'mission F' and 'role <name>'. Split the roles and talk.",
    "The engineer needs the serial number and valve readings from the operator, and SpO2, heart rate and blood type from the medic.",
    "Rh-negative means the blood type ends in '-'. Reverse the whole six-digit string, not just part of it.",
  ],

  async unlock(ctx) {
    if (views) return views;
    const f = ctx.state.get().fragments;
    if (!f.A || !f.B || !f.C) return null;
    ctx.term.println("assembling fragments...", "muted");
    views = await open(`${f.A} ${f.B} ${f.C}`, ctx.manifest.missions.F.lock);
    if (views && !ctx.state.get().solved.F) document.querySelector(".crt").classList.add("final-phase");
    return views;
  },

  async brief(ctx) {
    const { term, state } = ctx;
    term.println("=== FINAL  ::  OVERRIDE  [teamwork] ===", "system");
    const f = state.get().fragments;
    const missing = ["A", "B", "C"].filter((k) => !f[k]);
    if (missing.length) {
      term.printBlock(
`The containment controller needs all three override fragments.
missing: ${missing.join(", ")}

Solved a mission on another machine? Add its fragment here with
  fragment <token>`, "warn");
      return;
    }
    if (!(await this.unlock(ctx))) { term.println("[ fragments rejected — check them with 'fragments' ]", "danger"); return; }
    term.printBlock(
`Fragments accepted. Controller console unlocked.

The thermite suppression is armed. The override needs a six-digit code.
Nobody on your team has the whole picture:

  role operator   — sees the controller's front panel
  role engineer   — has the override manual
  role medic      — sees the survivor's vitals via the drone

Each teammate: open this terminal on your own machine, add the fragments,
pick ONE role. Then talk.

submit:  override <six digits>      (one wrong code costs ${ctx.state.costs.WRONG_COST} pts)`,
      "info");
  },

  async onCommand(cmd, args, raw, ctx) {
    const { term, manifest } = ctx;
    if (cmd !== "role" && cmd !== "override") return false;
    if (!(await this.unlock(ctx))) { term.println("console locked — collect fragments A, B and C first.", "warn"); return true; }
    if (cmd === "role") {
      const r = (args[0] || "").toLowerCase();
      if (!ROLES.includes(r)) { term.println(`usage: role ${ROLES.join(" | ")}`, "muted"); return true; }
      term.blank();
      term.printBlock(views[r], "dim");
      return true;
    }
    if (!args.length) { term.println("usage: override <six digits>", "muted"); return true; }
    const payload = await ctx.check("F", args.join(""), manifest.missions.F.box);
    if (payload) {
      await ctx.complete("F", null, args.join(""));
      await ctx.outro(payload.flag);
    }
    return true;
  },
};
