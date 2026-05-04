// Intro: boot sequence + briefing.

import { sleep } from "../terminal.js";
import { ops } from "../opspanel.js";

const LOGO = String.raw`
██████╗ ██╗      █████╗  ██████╗██╗  ██╗ ██████╗ ██╗   ██╗████████╗
██╔══██╗██║     ██╔══██╗██╔════╝██║ ██╔╝██╔═══██╗██║   ██║╚══██╔══╝
██████╔╝██║     ███████║██║     █████╔╝ ██║   ██║██║   ██║   ██║
██╔══██╗██║     ██╔══██║██║     ██╔═██╗ ██║   ██║██║   ██║   ██║
██████╔╝███████╗██║  ██║╚██████╗██║  ██╗╚██████╔╝╚██████╔╝   ██║
╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝    ╚═╝

       ✦  lifeline protocol  ·  v0.9.4-rc  ·  remote ops console
`;

export const intro = {
  state: "boot",
  async start(ctx) {
    const { term, state, sfx } = ctx;
    term.clear();
    term.setEnabled(false);
    ops.setMode("idle");
    ops.updateSurvivor({ bpm: 0, tag: "no signal", location: "—" });
    ops.updateDrone({ state: "powered down", pos: "—", batt: 100 });

    const bootLines = [
      "[ 0.000ms] BIOS init",
      "[ 0.041ms] mounting /dev/ssd0 ... ok",
      "[ 0.092ms] checking parity ......... ok",
      "[ 0.144ms] establishing tunnel to helix-tower-bms ... ",
      "          waiting for reverse-proxy ack ...",
      "          ack received [latency 412ms]",
      "[ 0.612ms] handshake ... ok",
      "[ 0.713ms] loading mission profile: OP-LIFELINE",
    ];
    for (const l of bootLines) {
      await term.type(l, "boot", 6);
      await sleep(70);
    }
    await sleep(220);
    term.printBlock(LOGO, "ascii");
    await sleep(300);

    const briefing = [
      "",
      "[ 14:02:11 ] INCOMING TRANSMISSION FROM OPS LEAD",
      "",
      "  > Helix Tower is dark. We lost contact 41 minutes ago.",
      "  > Paraply Bioteknik was running a Class-IV trial on floor 4.",
      "  > Building autonomic systems are still online but acting strange.",
      "  > One survivor confirmed via emergency tag — name: DR. K. NORDLUND.",
      "  > She is somewhere inside. We don't know where. We don't know what",
      "    else is in there with her.",
      "",
      "  > In 60 minutes the lab's containment will fail and the entire",
      "    structure will be sterilized by thermite suppression.",
      "  > You are her only way out. You will operate remote.",
      "",
      "  > Use AI. Use everything. Just bring her home.",
      "",
      "  > End of transmission.",
      "",
    ];
    for (const l of briefing) {
      await term.type(l, l.startsWith("  >") ? "info" : "system", 8);
    }

    term.println("", "");
    term.printBlock(
`primary objectives:
  L1  locate survivor                    — read sensors and CCTV, deduce position
  L2  decrypt lab logs                   — recover what aegis was running
  L3  build a door-routing agent         — clear a path through the building
  L4  override containment               — auth code, then extract`,
      "dim"
    );
    term.println("", "");
    term.printBlock(
`available commands at any time:
  help        tutorial      status        inventory
  hint        clear         audio         brief         begin`,
      "muted"
    );
    term.println("", "");
    term.println("first time? type 'tutorial' to learn how the game works.", "info");
    term.println("ready? type 'begin' to start the operation.", "accent");
    term.println("(↓ click the input field at the bottom and start typing.)", "muted");
    term.setEnabled(true);
    sfx.alarm();
  },

  onCommand(cmd, args, raw, ctx) {
    const { term, sfx, state } = ctx;
    if (cmd === "begin") {
      sfx.save();
      state.startContainment();
      term.println("[ tunnel locked. containment timer armed. routing to L1. ]", "accent");
      ctx.go(1);
      return;
    }
    if (cmd === "brief") return this.start(ctx);
    term.println("type 'begin' to start the operation.", "muted");
  },
};
