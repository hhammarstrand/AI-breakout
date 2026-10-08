// Mission B — the lab's record export: a lying digest and a sealed record.

export const missionB = {
  id: "B",
  title: "DEAD DROP",
  tag: "crypto / reversing",
  hints: [
    "Two sections, two different ciphers. The digest is a classic polyalphabetic cipher with an unknown key — think Kasiski / frequency analysis.",
    "The building had write access to the lab network. Don't submit what the digest tells you to submit. Read what it says about the sealed record and where its routine lives.",
    "The terminal you are using ships the lab's sealing routine (look at the page's scripts / window.__bms). It only encrypts — invert it byte by byte and test your decoder by round-tripping.",
  ],

  brief({ term }) {
    term.println("=== MISSION B  ::  DEAD DROP  [crypto / reversing] ===", "system");
    term.printBlock(
`Before going dark, Aegis Lab 4 pushed one last record export. It contains
the containment override fragment for this sector.

Two sections. Two ciphers. One of them is lying to you.`,
      "info");
    term.blank();
    term.link("  ↓ data/aegis_lab4_export.txt", "data/aegis_lab4_export.txt");
    term.blank();
    term.printBlock(
`submit:  submit <fragment>
other :  download | brief | hint | back`, "muted");
  },

  async onCommand(cmd, args, raw, ctx) {
    const { term, manifest } = ctx;
    switch (cmd) {
      case "download":
        term.link("  ↓ data/aegis_lab4_export.txt", "data/aegis_lab4_export.txt");
        return true;
      case "submit": {
        if (!args.length) { term.println("usage: submit <fragment>", "muted"); return true; }
        const answer = args.join(" ");
        const payload = await ctx.check("B", answer, manifest.missions.B.box,
          "[ BMS ] fragment accepted. ...just kidding. The building rewrote that digest at 13:09.");
        if (payload) {
          term.println("[ fragment B authenticated against lab 4 key store. ]", "accent");
          await ctx.complete("B", payload.fragment);
        }
        return true;
      }
    }
    return false;
  },
};
