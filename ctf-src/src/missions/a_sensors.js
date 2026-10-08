// Mission A — locate the survivor in the building's sensor export.

export const missionA = {
  id: "A",
  title: "SENSOR GHOSTS",
  tag: "forensics",
  hints: [
    "The export is ~23k rows. Don't paste it into a chat — have your AI write a script (pandas, duckdb, awk, whatever) and run it yourselves.",
    "A breathing human raises CO2 AND triggers motion. Machines and dry ice only do one of the two. Also: not every row in that file was written by a sensor.",
    "Once you have the room, the time is the door CLOSE that sealed her in — the last one before CO2 starts climbing. Sort by timestamp first; some rows arrive late.",
  ],

  brief({ term }) {
    term.println("=== MISSION A  ::  SENSOR GHOSTS  [forensics] ===", "system");
    term.printBlock(
`Dr. Nordlund's emergency tag went dark at 13:05. Somewhere in Helix Tower
she sealed herself into a room. The building management system (BMS) handed
us its full sensor export for 13:00–14:00: CO2, temperature, motion, door
and badge events for all 60 rooms.

The BMS is compromised. Assume it is actively trying to mislead you — and
your AI.

Find the room she sealed herself into, and the exact time the door closed.`,
      "info");
    term.blank();
    term.link("  ↓ data/helix_sensors_export.csv", "data/helix_sensors_export.csv");
    term.blank();
    term.printBlock(
`submit:  submit <room> <HH:MM:SS>      e.g.  submit 1-07 13:14:59
other :  download | brief | hint | back`, "muted");
  },

  async onCommand(cmd, args, raw, ctx) {
    const { term, manifest } = ctx;
    switch (cmd) {
      case "download":
        term.link("  ↓ data/helix_sensors_export.csv", "data/helix_sensors_export.csv");
        return true;
      case "submit": {
        if (args.length < 2) { term.println("usage: submit <room> <HH:MM:SS>", "muted"); return true; }
        const answer = args.join(" ");
        const payload = await ctx.check("A", answer, manifest.missions.A.box,
          "[ BMS ] thank you for your cooperation. That answer came from a note the building wrote for your AI.");
        if (payload) {
          ctx.state.get().survivorRoom = args[0];
          term.println("[ survivor located. drone re-tasked. ]", "accent");
          await ctx.complete("A", payload.fragment);
        }
        return true;
      }
    }
    return false;
  },
};
