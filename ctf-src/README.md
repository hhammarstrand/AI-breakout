# BLACKOUT — AI Breakout, CTF edition

A ~60-minute jeopardy-style CTF for 2–3 engineering teams, played **with AI
tools** over Teams. The terminal-style site is the game world; the puzzles
are designed so that pasting them into a chat is not enough — teams have to
make AI write and run code, and decide what to trust. The building's
compromised management system actively tries to mislead the teams' AI.

Pure static site (GitHub Pages, served at `/ctf/`), no backend, no LLM, no dependencies.

## Missions

| | Mission | Category | Why AI alone isn't enough |
|---|---|---|---|
| A | Sensor Ghosts | forensics | 23k-row CSV (too big to paste). Contains a planted **prompt injection** aimed at the team's AI, a spoofed badge ping and a cold-storage room whose CO2 also climbs. |
| B | Dead Drop | crypto / reversing | The Vigenère digest decrypts to a convincing **fake fragment**. The real one is sealed with the lab's custom cipher, of which only the *encoder* ships (minified) with the site — it must be inverted. |
| C | Door Agent | programming | 10 chained rounds, 8 s each, 80–130 doors with timed schedules. Must be scripted via the console API. Naive BFS is wrong; the route requires waiting. |
| F | Override | teamwork | Unlocked by fragments A+B+C. Info is split across three roles (operator / engineer / medic) on different machines. |

Scoring: 250 per mission. First hint free, then −25. Wrong answer −10.
Submitting an answer the building planted: −50.

## How answers stay secret on a public, static site

- Every puzzle is **generated at build time from a secret seed**
  (`BLACKOUT_SEED`, a repository secret). The generator code is public; the
  answers are not.
- Answers are never stored. Each reward is AES-GCM–encrypted with a key
  derived from the answer (PBKDF2, 400k iterations). Checking an answer means
  trying to decrypt its box. Reading the page source is allowed and expected.
- Mission C's round N+1 is encrypted with the answer to round N, so the only
  way through is to solve each round. The final is encrypted with A+B+C.
- `tools/selftest.mjs` solves every mission from the published files only (as
  a team would) and asserts that no plaintext secret exists in `dist/`. CI runs
  it on every `publish-site` and never prints answers with a real seed.

## Deployment (no secrets, no settings)

The game lives in `ctf-src/` and is published **prebuilt** to `ctf/` in the repo
root, which the existing Pages workflow serves at `/ctf/` next to the main
BLACKOUT game. `ctf/` contains only sealed data.

To regenerate (e.g. after changing a puzzle), from `ctf-src/`:

```sh
BLACKOUT_SEED=<seed from your facilitator sheet> npm run publish-site   # builds ../ctf, runs the self-test
```

Then commit `ctf/` and push to `main`. A new seed means new answers.

The build also writes `ctf-src/facilitator/answers.md` and
`ctf-src/facilitator/facilitator.html` (gitignored — they contain the answers
and the seed). The HTML page is the facilitator console: paste the Teams chat
and it verifies receipts and shows the scoreboard, offline.

## Running the event (Teams)

- One Teams meeting, one breakout room per team (3–5 players). One player
  shares the terminal; everyone else works on their own laptop with their AI.
- Teams can solve missions on different machines: `fragment <token>` moves a
  fragment to another machine. For the final, each player opens the site,
  adds the fragments, and takes one `role`.
- Each solve prints a receipt like `RCPT-A-red-team-200-1a2b3c4d`. Teams paste
  it in the main Teams chat — the chat timestamp is the scoreboard order.
- Verify receipts and get totals: paste the Teams chat into
  `facilitator.html`, or `BLACKOUT_SEED=<seed> node tools/verify.mjs < chat.txt`.
- Suggested timing: 5 min intro, ~40 min A/B/C, ~10 min final, 10 min debrief.
  The outro prints debrief questions.
- Progress lives in localStorage per machine. `reset --confirm` or an incognito
  window starts fresh. A new seed (new build) resets everyone automatically.

### Known, accepted shortcuts

- **The public repo is a spoiler.** The generators and `ctf-src/tools/selftest.mjs`
  show *how* each mission works (they can't reveal answers — those depend on
  the seed). The intro declares the repo out of scope; say it out loud at
  kick-off too. If that's not enough, move `ctf-src/tools/` to a private repo.

- Receipts encode the team's own point count; a team that knows the answer
  could forge a higher one. `verify.mjs` catches tampering only if they
  don't — it's an honor system with a lock on it.
- A team can open all three final roles on one machine. Fine — it's an
  engineering game.
- Mission A's answer space (room × door-close time) is large but finite; a
  team that brute-forces PBKDF2 against the box has earned it.

## Local development

```sh
npm run dev      # builds with the public "dev" seed, serves http://localhost:8000
npm test         # dev build + end-to-end solvability/leak test
```

Requires Node 20+ and Python 3 (for the static server). Opening `index.html`
directly or serving the unbuilt tree shows a "manifest not found" message — the
game only runs from `dist/`.

## Layout

- `index.html`, `style.css`, `app.js` — terminal shell, HUD, mission hub
- `src/crypto.js` — sealing, receipts (shared by browser and Node)
- `src/missions/` — A, B, C, F mission modules
- `src/labcrypt.js` — the lab's (minified) sealing routine, part of mission B
- `tools/gen/` — seeded puzzle generators; `tools/build.mjs`, `verify.mjs`, `selftest.mjs`
