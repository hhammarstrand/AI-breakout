// HelixOS "window manager": lock screen, bar, workspaces, focus, toasts,
// launcher, themes and keybindings. Presentation only.

const $ = (id) => document.getElementById(id);
const THEME_KEY = "blackout-ctf.theme";
export const THEMES = ["tokyo-night", "catppuccin", "gruvbox", "nord", "rose-pine", "matte-black", "phosphor"];
const GAME_EPOCH = 14 * 3600 + 2 * 60 + 11; // in-fiction clock starts 14:02:11

let run = () => {};
let theme = "tokyo-night";
let themeTimer = null;

const pad = (n) => String(n).padStart(2, "0");

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export const wm = {
  cssVar,

  init(runner) {
    run = runner;
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch {}
    this.setTheme(THEMES.includes(saved) ? saved : "tokyo-night", { quiet: true });

    // focus follows click
    for (const w of document.querySelectorAll(".win")) w.addEventListener("mousedown", () => this.focus(w));
    $("prompt-input").addEventListener("focus", () => this.focus(document.querySelector(".win-term")));

    for (const b of document.querySelectorAll(".workspaces button")) b.addEventListener("click", () => this.exec(`mission ${b.dataset.ws}`));
    $("launcher-btn").addEventListener("click", () => this.openLauncher());
    this.bindLauncher();

    document.addEventListener("keydown", (e) => {
      if (e.altKey && /^Digit[1-4]$/.test(e.code)) { e.preventDefault(); this.exec(`mission ${"ABCF"[Number(e.code.at(-1)) - 1]}`); }
      else if ((e.altKey && e.code === "Space") || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) { e.preventDefault(); this.openLauncher(); }
      else if (e.altKey && e.code === "KeyT") { e.preventDefault(); this.exec("theme next"); }
      else if (e.key === "Escape") this.closeLauncher();
    });
  },

  exec(cmd) {
    this.closeLauncher();
    run(cmd, { echo: true });
    $("prompt-input").focus();
  },

  focus(win) {
    for (const w of document.querySelectorAll(".win")) w.classList.toggle("focused", w === win);
  },

  // ---------- bar ----------
  tick(state) {
    const s = state.get();
    let t;
    if (s.containmentStart) {
      const sec = GAME_EPOCH + Math.floor((Date.now() - s.containmentStart) / 1000);
      t = `${pad(Math.floor(sec / 3600) % 24)}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;
    } else {
      const d = new Date();
      t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    $("bar-clock").textContent = `fri 14 mar 2031 · ${t}`;
  },

  setWorkspace(id, s) {
    for (const b of document.querySelectorAll(".workspaces button")) {
      const ws = b.dataset.ws;
      b.classList.toggle("active", ws === id);
      b.classList.toggle("done", !!s.solved[ws]);
      b.classList.toggle("armed", ws === "F" && ["A", "B", "C"].every((k) => s.fragments[k]) && !s.solved.F);
    }
    const titles = { A: "sensor-ghosts — forensics", B: "dead-drop — crypto", C: "door-agent — programming", F: "override — teamwork" };
    $("bar-title").textContent = id ? titles[id] : "op@helix · mission board";
  },

  // ---------- themes ----------
  setTheme(name, { quiet = false, persist = true } = {}) {
    if (name === "next") name = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    if (!THEMES.includes(name)) return false;
    theme = name;
    clearTimeout(themeTimer);
    document.documentElement.dataset.theme = name;
    if (persist) try { localStorage.setItem(THEME_KEY, name); } catch {}
    if (!quiet) this.toast("theme", name);
    return true;
  },
  get theme() { return theme; },

  // The BMS briefly hijacks the palette.
  hijack(ms = 3500) {
    clearTimeout(themeTimer);
    document.documentElement.dataset.theme = "compromised";
    themeTimer = setTimeout(() => { document.documentElement.dataset.theme = theme; }, ms);
  },

  // ---------- toasts ----------
  toast(title, body, kind = "", ms = 5500) {
    const box = $("toasts");
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    const b = document.createElement("b");
    b.textContent = title;
    el.append(b, document.createTextNode(body));
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 320); }, ms);
  },

  // ---------- launcher ----------
  items() {
    return [
      ["mission board", "board"], ["mission A — sensor ghosts", "mission A"], ["mission B — dead drop", "mission B"],
      ["mission C — door agent", "mission C"], ["mission F — override", "mission F"],
      ["hint for current mission", "hint"], ["fragments", "fragments"], ["receipts", "receipts"], ["status", "status"],
      ["door agent: start run", "start"], ["download sensor export", "mission A"], ["download lab export", "mission B"],
      ["role: operator", "role operator"], ["role: engineer", "role engineer"], ["role: medic", "role medic"],
      ["fastfetch", "fastfetch"], ["toggle sound", "audio"], ["clear terminal", "clear"], ["help", "help"],
      ...THEMES.map((t) => [`theme: ${t}`, `theme ${t}`]),
    ];
  },

  bindLauncher() {
    const input = $("launcher-input");
    let sel = 0, shown = [];
    const render = () => {
      const q = input.value.toLowerCase().trim();
      shown = this.items().filter(([label, cmd]) => !q || q.split(/\s+/).every((w) => (label + " " + cmd).toLowerCase().includes(w)));
      if (q && !shown.some(([, c]) => c === q)) shown.push([`run "${q}"`, q]);
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      const ul = $("launcher-list");
      ul.innerHTML = "";
      shown.slice(0, 12).forEach(([label, cmd], i) => {
        const li = document.createElement("li");
        li.className = i === sel ? "sel" : "";
        const a = document.createElement("span"); a.textContent = label;
        const b = document.createElement("small"); b.textContent = cmd;
        li.append(a, b);
        li.addEventListener("mousedown", (e) => { e.preventDefault(); this.exec(cmd); });
        ul.appendChild(li);
      });
    };
    input.addEventListener("input", () => { sel = 0; render(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { sel = Math.min(sel + 1, Math.min(11, shown.length - 1)); render(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
      else if (e.key === "Enter" && shown[sel]) { e.preventDefault(); this.exec(shown[sel][1]); }
    });
    $("launcher").addEventListener("mousedown", (e) => { if (e.target.id === "launcher") this.closeLauncher(); });
    this.renderLauncher = render;
  },

  openLauncher() {
    if (!$("fx-gate").classList.contains("hidden")) return;
    $("launcher").classList.remove("hidden");
    $("launcher-input").value = "";
    this.renderLauncher();
    $("launcher-input").focus();
  },
  closeLauncher() { $("launcher").classList.add("hidden"); },

  // ---------- lock screen ----------
  lock(knownTeam) {
    const gate = $("fx-gate"), input = $("lock-input");
    const clock = () => {
      const d = new Date();
      $("lock-time").textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      $("lock-date").textContent = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    };
    clock();
    const clockTimer = setInterval(clock, 1000);
    const stopRain = rain($("lock-rain"));
    if (knownTeam) {
      input.value = knownTeam;
      $("lock-hint").textContent = `welcome back, ${knownTeam} · press enter to resume`;
    }
    setTimeout(() => input.focus(), 50);
    return new Promise((resolve) => {
      const go = (e) => {
        e?.preventDefault();
        const name = input.value.trim() || knownTeam;
        if (!name) {
          input.classList.remove("shake"); void input.offsetWidth; input.classList.add("shake");
          input.placeholder = "team name required";
          return;
        }
        clearInterval(clockTimer);
        gate.classList.add("hidden");
        setTimeout(stopRain, 700);
        resolve(name);
      };
      $("lock-form").addEventListener("submit", go);
      $("gate-btn").addEventListener("click", go);
    });
  },

  // ---------- fastfetch ----------
  fastfetch(term, info) {
    const logo = [
      "   ▄▄▄       ▄▄▄   ",
      "   ███       ███   ",
      "   ███▄▄▄▄▄▄▄███   ",
      "   █████████████   ",
      "   ███▀▀▀▀▀▀▀███   ",
      "   ███   ◆   ███   ",
      "   ▀▀▀       ▀▀▀   ",
      "                   ",
      "                   ",
    ];
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const rows = [
      `<span class="ff-key">${esc(info.user)}</span><span class="ff-sep">@</span><span class="ff-key">helix-ops</span>`,
      `<span class="ff-sep">${"─".repeat(info.user.length + 10)}</span>`,
      ...info.lines.map(([k, v]) => `<span class="ff-key">${esc(k)}</span><span class="ff-sep">: </span>${esc(v)}`),
    ];
    const swatches = ["--fg-muted", "--danger", "--ok", "--warn", "--accent", "--b2", "--info", "--fg"]
      .map((v) => `<span class="c" style="background:var(${v})"></span>`).join("");
    const n = Math.max(logo.length, rows.length + 2);
    for (let i = 0; i < n; i++) {
      const left = `<span style="color:var(--accent)">${esc(logo[i] || " ".repeat(19))}</span>  `;
      const right = i < rows.length ? rows[i] : i === rows.length + 1 ? swatches : "";
      term.html(left + right);
    }
  },
};

// tte-style rain of glyphs behind the lock screen.
function rain(cv) {
  const g = cv.getContext("2d");
  let W, H, cols, drops, raf, alive = true;
  const size = 16;
  const fit = () => {
    W = cv.width = innerWidth; H = cv.height = innerHeight;
    cols = Math.ceil(W / size);
    drops = [...Array(cols)].map(() => Math.random() * -H / size);
  };
  fit();
  addEventListener("resize", fit);
  const glyphs = "HELIXBMS0123456789◆▓▒░<>/#";
  const frame = () => {
    if (!alive) return;
    g.fillStyle = "rgba(0,0,0,0.08)";
    g.fillRect(0, 0, W, H);
    g.font = `${size - 2}px monospace`;
    const accent = cssVar("--accent") || "#7aa2f7";
    for (let i = 0; i < cols; i++) {
      const y = drops[i] * size;
      g.fillStyle = Math.random() < 0.04 ? "#fff" : accent;
      g.globalAlpha = 0.35 + Math.random() * 0.4;
      g.fillText(glyphs[(Math.random() * glyphs.length) | 0], i * size, y);
      drops[i] = y > H && Math.random() > 0.975 ? 0 : drops[i] + 0.5;
    }
    g.globalAlpha = 1;
    raf = setTimeout(() => requestAnimationFrame(frame), 33);
  };
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) frame();
  return () => { alive = false; clearTimeout(raf); removeEventListener("resize", fit); };
}
