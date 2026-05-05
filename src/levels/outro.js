// Outro: extraction sequence, score summary, debrief.
// Three branching endings via state.ending: extract / quarantine / purge.

import { sleep } from "../terminal.js";
import { ops } from "../opspanel.js";

const ART_HOME = String.raw`
        ██╗  ██╗ ██████╗ ███╗   ███╗███████╗
        ██║  ██║██╔═══██╗████╗ ████║██╔════╝
        ███████║██║   ██║██╔████╔██║█████╗
        ██╔══██║██║   ██║██║╚██╔╝██║██╔══╝
        ██║  ██║╚██████╔╝██║ ╚═╝ ██║███████╗
        ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝

                  :: SHE IS HOME ::
`;

const ART_SEALED = String.raw`
     ███████╗███████╗ █████╗ ██╗     ███████╗██████╗
     ██╔════╝██╔════╝██╔══██╗██║     ██╔════╝██╔══██╗
     ███████╗█████╗  ███████║██║     █████╗  ██║  ██║
     ╚════██║██╔══╝  ██╔══██║██║     ██╔══╝  ██║  ██║
     ███████║███████╗██║  ██║███████╗███████╗██████╔╝
     ╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝╚═════╝

                :: SHE IS WAITING ::
`;

const ART_ASH = String.raw`
                █████╗ ███████╗██╗  ██╗
               ██╔══██╗██╔════╝██║  ██║
               ███████║███████╗███████║
               ██╔══██║╚════██║██╔══██║
               ██║  ██║███████║██║  ██║
               ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝

                :: SHE IS QUIET ::
`;

const ENDINGS = {
  extract: {
    art: ART_HOME,
    label: "EXTRACTION",
    survivor: { bpm: 88, tag: "stable", location: "MED-EVAC INBOUND" },
    drone:    { state: "clear of structure", pos: "EXIT", batt: 64 },
    lines: [
      "[ extraction confirmed. drone clear of building. ]",
      "[ thermite stand-down acknowledged across all floors. ]",
      "[ Dr. Nordlund vital signs: nominal. en route to medevac. ]",
      "[ Helix Tower: contained. follow-up sweep scheduled. ]",
    ],
    epilogue:
`the by-the-book ending. nordlund goes home. the building stands.
the substrate is contained, study continues. an internal review
will ask why your team had to be remote. nobody dies today.`,
  },
  quarantine: {
    art: ART_SEALED,
    label: "QUARANTINE",
    survivor: { bpm: 92, tag: "stable", location: "MED-EVAC INBOUND" },
    drone:    { state: "holding clear of structure", pos: "EXIT", batt: 58 },
    lines: [
      "[ floor 4 isolation lockdown engaged. ]",
      "[ thermite armed but held. building stands. ]",
      "[ Dr. Nordlund extracted from roof. medevac inbound. ]",
      "[ Helix Tower: sealed indefinitely. floor 4 will not reopen. ]",
    ],
    epilogue:
`the cautious ending. she goes home. the floor never does.
hostiles remain alive on floor 4, contained. the building is dead
real estate now — its top floors useful only to bio-3 researchers
who will not enter for years. paraply takes the loss publicly.`,
  },
  purge: {
    art: ART_ASH,
    label: "PURGE",
    survivor: { bpm: 0, tag: "KIA", location: "HELIX TOWER" },
    drone:    { state: "lost in ignition", pos: "—", batt: 0 },
    lines: [
      "[ thermite ignition: ALL FLOORS ]",
      "[ helix tower: structural failure at T+00:14 ]",
      "[ tag K-NORDLUND-01: signal lost ]",
      "[ substrate: not detected outside containment ]",
    ],
    epilogue:
`the heavy ending. nothing escaped. neither did she.
the city is safe. the substrate is dead. the operator chose this.
the report will not name your team. you'll know what you did.
some things you can't undo by reloading.`,
  },
};

export const outro = {
  async start(ctx) {
    const { term, state, sfx } = ctx;
    state.markExtracted();
    ops.setMode("outro");

    const choice = state.get().ending || "extract";
    const ending = ENDINGS[choice] || ENDINGS.extract;

    ops.updateSurvivor(ending.survivor);
    ops.updateDrone(ending.drone);

    term.println("", "");
    for (const line of ending.lines) {
      term.println(line, choice === "purge" ? "danger" : "accent");
      await sleep(450);
    }
    sfx.save();
    term.printBlock(ending.art, "ascii");

    term.println("", "");
    term.println(ending.epilogue, choice === "purge" ? "warn" : "info");

    const s = state.get();
    const endRef = s.extractedAt || Date.now();
    const totalSec = Math.ceil((endRef - (s.containmentStart || endRef)) / 1000);
    const m = Math.floor(totalSec / 60);
    const ss = (totalSec % 60).toString().padStart(2, "0");

    term.println("", "");
    term.println("OPERATION DEBRIEF", "system");
    term.println("", "");
    term.printBlock(
`mission     OPERATION LIFELINE — ${ending.label.toLowerCase()}
elapsed     ${m}:${ss}
score       ${s.score}/100
hints used  ${s.hintsUsed}
errors      ${s.wrongAttempts}
fragments   ${s.inventory.join(", ")}
ending      ${ending.label}`,
      "dim"
    );

    term.println("", "");
    term.printBlock(
`what your team just did, in plain terms:

  L1  retrieval-augmented analysis
      pasting heterogeneous sensor + image data into an LLM and asking
      it to triangulate. this is the simplest, most universal AI use.

  L2  multi-step reasoning + adversarial input
      identifying cipher type, applying the right inverse, AND spotting
      the prompt-injection attempt buried in one of the logs. AI handles
      the decoding so you can focus on what's actually being said.

  L3  AI as pair-programmer
      AI wrote a graph search for you in seconds. you pre-filtered the
      input and verified the output. this is how AI changes day-to-day
      engineering: pair, don't outsource.

  L4  human-in-the-loop verification
      assembling the final code from heterogeneous fragments needed YOU.
      the partial-match feedback ('X/3 segments verified') taught
      that AI confidence ≠ correctness, segment by segment.

share your run with the room. type 'commentary' for designer notes.
type 'status' / 'inventory' / 'reset --confirm' / 'share'.`,
      "info"
    );
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
    term.println("you've already extracted. type 'status', 'commentary', 'share', or 'reset --confirm'.", "muted");
  },
};
