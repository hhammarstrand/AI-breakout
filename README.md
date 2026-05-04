# BLACKOUT — AI Breakout

A ~60-minute terminal-style escape-room for an AI workshop. Teams play remote
operators guiding a survivor out of an infected smart-building. Every level
requires using AI tools (Claude / Copilot / Gemini / etc.) to solve.

Pure static site: vanilla HTML/CSS/JS, no build, no dependencies.

## Run locally

The site uses ES modules, which Chrome/Firefox **block over `file://`**. So
double-clicking `index.html` will give you a black screen with a fallback
message. Serve over http instead — from the project folder:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works (`npx serve`, Caddy, etc.).

## Game flow

1. **Intro** — boot sequence, briefing, type `begin`.
2. **L1 Locate the Survivor** — read sensors and CCTV stills, mark the
   survivor's room and three hostile rooms, `commit`.
3. **L2 Decrypt the Lab Logs** — three logs, three different ciphers
   (caesar / base64 / vigenère). Find the shared codename, `submit <word>`.
4. **L3 Build the Door Agent** — write a graph-search script (with AI's help)
   that finds the shortest safe path; `agent <door-sequence>`.
5. **L4 The Breach** — combine inventory fragments + a morse transmission to
   form the auth code; `auth <code>`.
6. **Outro** — extraction, score, debrief tying back to AI patterns.

Global commands at any time:

```
help    status    inventory    hint    clear    audio    reset --confirm    brief
```

## Scoring

- 25 points per level cleared.
- First hint per level is free; each subsequent hint -5 points.
- Each wrong submission -2 points.
- Total possible: 100.

## Facilitator notes

- Run with one shared screen per team (3-5 players). One player drives the
  terminal, the rest run AI tools on their laptops.
- Encourage teams to copy game data (sensor tables, ciphered logs, the door
  spec) directly into Claude/Copilot/Gemini. This is the point.
- The 60-minute containment timer is for atmosphere. Solving in ~45 min is
  comfortable. Failing the timer doesn't lock out the game; it just turns
  the screen red.
- LocalStorage persists progress. To reset between teams: `reset --confirm`
  or open a fresh incognito window.
- Dev cheat: append `?dev=1` to the URL and the `skip` command will jump
  forward one level.

## Tech

- `index.html` — single-page shell + HUD.
- `style.css` — CRT theme (scanlines, flicker, glitch, vignette).
- `app.js` — entry point, state machine, global command dispatch.
- `src/terminal.js` — input/output engine with typewriter effect.
- `src/state.js` — localStorage-backed game state.
- `src/hints.js` — tiered hint system.
- `src/audio.js` — WebAudio SFX + ambient + morse player.
- `src/levels/*.js` — one module per level (intro, level1-4, outro).

## Deployment

GitHub Pages workflow at `.github/workflows/static.yml` deploys on push to
`main` (and the working branch). Enable Pages in the repo's Settings →
Pages → "Source: GitHub Actions".

## Content

All narrative, code, scenarios, ciphers, and assets are original.
