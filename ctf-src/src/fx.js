// Full-screen effects: uplink gate, flashes, banners, shake, glitch, particles.

import { sleep } from "./terminal.js";

const $ = (id) => document.getElementById(id);
const crt = () => document.querySelector(".crt");
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

let bannerTimer = null;

export const fx = {
  flash(kind = "ok") {
    const el = $("fx-flash");
    el.className = "";
    void el.offsetWidth;
    el.className = kind;
  },

  async banner(kicker, title, sub = "", { kind = "ok", ms = 2600 } = {}) {
    const el = $("fx-banner");
    clearTimeout(bannerTimer);
    el.className = kind;
    el.innerHTML = "";
    for (const [cls, txt] of [["k", kicker], ["t", ""], ["s", sub]]) {
      const d = document.createElement("div");
      d.className = cls;
      d.textContent = txt;
      el.appendChild(d);
    }
    void el.offsetWidth;
    el.classList.add("show");
    // decode-in effect for the title
    const t = el.querySelector(".t");
    const glyphs = "!<>-_\\/[]{}=+*^?#ABCDEF0123456789";
    for (let i = 0; i <= title.length; i++) {
      t.textContent = title.slice(0, i) + [...Array(Math.min(4, title.length - i))].map(() => glyphs[Math.floor(Math.random() * glyphs.length)]).join("");
      await sleep(calm() ? 0 : 28);
    }
    bannerTimer = setTimeout(() => el.classList.remove("show"), ms);
  },

  shake() {
    if (calm()) return;
    const c = crt();
    c.classList.remove("shake");
    void c.offsetWidth;
    c.classList.add("shake");
    setTimeout(() => c.classList.remove("shake"), 500);
  },

  glitch(ms = 600) {
    if (calm()) return;
    crt().classList.add("glitching");
    setTimeout(() => crt().classList.remove("glitching"), ms);
  },

  burst(color = "108, 240, 194", n = 160) {
    if (calm()) return;
    const cv = $("fx-particles");
    const W = (cv.width = innerWidth), H = (cv.height = innerHeight);
    const g = cv.getContext("2d");
    const ps = [...Array(n)].map(() => {
      const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 9;
      return { x: W / 2, y: H * 0.42, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 1, ch: "01<>/#*+"[Math.floor(Math.random() * 8)] };
    });
    const tick = () => {
      g.clearRect(0, 0, W, H);
      let alive = 0;
      for (const p of ps) {
        if (p.life <= 0) continue;
        alive++;
        p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.99; p.life -= 0.012;
        g.fillStyle = `rgba(${color}, ${p.life})`;
        g.font = "14px monospace";
        g.fillText(p.ch, p.x, p.y);
      }
      if (alive) requestAnimationFrame(tick); else g.clearRect(0, 0, W, H);
    };
    tick();
  },
};
