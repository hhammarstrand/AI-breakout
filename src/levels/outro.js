// Outro: extraction sequence, score summary, debrief.

import { sleep } from "../terminal.js";
import { ops } from "../opspanel.js";

const ART = String.raw`
        ██╗  ██╗ ██████╗ ███╗   ███╗███████╗
        ██║  ██║██╔═══██╗████╗ ████║██╔════╝
        ███████║██║   ██║██╔████╔██║█████╗
        ██╔══██║██║   ██║██║╚██╔╝██║██╔══╝
        ██║  ██║╚██████╔╝██║ ╚═╝ ██║███████╗
        ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝

                  :: SHE IS HOME ::
`;

export const outro = {
  async start(ctx) {
    const { term, state, sfx } = ctx;
    state.markExtracted();
    ops.setMode("outro");
    ops.updateSurvivor({ bpm: 88, tag: "stable", location: "MED-EVAC INBOUND" });
    ops.updateDrone({ state: "clear of structure", pos: "EXIT", batt: 64 });
    term.println("", "");
    term.println("[ extraction confirmed. drone clear of building. ]", "accent");
    await sleep(450);
    term.println("[ thermite stand-down acknowledged across all floors. ]", "accent");
    await sleep(450);
    term.println("[ Dr. Nordlund vital signs: nominal. ]", "accent");
    await sleep(450);
    sfx.save();
    term.printBlock(ART, "ascii");

    const s = state.get();
    const endRef = s.extractedAt || Date.now();
    const totalSec = Math.ceil((endRef - (s.containmentStart || endRef)) / 1000);
    const m = Math.floor(totalSec / 60);
    const ss = (totalSec % 60).toString().padStart(2, "0");

    term.println("", "");
    term.println("OPERATION DEBRIEF", "system");
    term.println("", "");
    term.printBlock(
`mission     OPERATION LIFELINE — completed
elapsed     ${m}:${ss}
score       ${s.score}/100
hints used  ${s.hintsUsed}
errors      ${s.wrongAttempts}
fragments   ${s.inventory.join(", ")}`,
      "dim"
    );

    term.println("", "");
    term.printBlock(
`what your team just did, in plain terms:

  L1  retrieval-augmented analysis
      pasting heterogeneous sensor + image data into an LLM and asking
      it to triangulate. this is the simplest, most universal AI use.

  L2  multi-step reasoning + code-of-thought
      identifying cipher type, applying the right inverse, reading the
      decoded text for meaning. AI handles the mechanical decoding so
      you can focus on synthesis.

  L3  AI as pair-programmer
      AI wrote a graph search for you in seconds. you verified by reading
      the output. this is how AI changes day-to-day engineering.

  L4  human-in-the-loop verification
      the morse was something AI could decode trivially. but assembling
      the final code from four heterogeneous fragments — that needed you.
      this is the pattern: AI does the bulk, humans close the loop.

share your score with the room. then come back to base camp for debrief.`,
      "info"
    );

    term.println("", "");
    term.println("commands: status / inventory / reset --confirm", "muted");
  },

  onCommand(cmd, args, raw, ctx) {
    const { term } = ctx;
    if (cmd === "credits") {
      term.printBlock(
`BLACKOUT
  AI breakout, ~60 min  ::  vanilla HTML/CSS/JS
  scenario, code, art: original.`,
        "muted"
      );
      return;
    }
    term.println("you've already extracted. type 'status' or 'reset --confirm'.", "muted");
  },
};
