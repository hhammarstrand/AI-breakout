// Right-hand ops panel: live tower view, fragments, drone uplink, BMS eye.
// Purely presentational — it never shows anything a team hasn't earned.

const $ = (id) => document.getElementById(id);
const FLOORS = 4, ROOMS = 15;

let survivor = null;   // "2-09" once mission A is solved
let droneT = 0;        // 0..1 progress of the drone (mission C)
let safe = false;      // final solved
let deadlineAnim = null;

const units = [...Array(3)].map(() => ({ f: rnd(1, 4), r: rnd(1, 15), x: 0, y: 0, next: 0 }));

function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

// Theme-aware colours: read CSS variables (cached) and emit rgba().
let pal = {}, palAt = 0;
function col(name, a = 1) {
  if (!palAt || performance.now() - palAt > 500) {
    const cs = getComputedStyle(document.documentElement);
    pal = {};
    for (const n of ["ok", "accent", "info", "danger", "fg", "fg-muted", "warn"]) {
      const h = cs.getPropertyValue("--" + n).trim().replace("#", "");
      pal[n] = h.length === 6 ? [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(",") : "200,200,200";
    }
    palAt = performance.now();
  }
  return `rgba(${pal[name]},${a})`;
}

// BMS "CPU load" history for the btop-style graph.
const load = [...Array(60)].fill(0.15);
let loadTarget = 0.15;

function roomXY(f, r, W, H) {
  const left = 26, top = 10, w = (W - left - 6) / ROOMS, h = (H - top - 8) / FLOORS;
  return { x: left + (r - 1) * w, y: top + (FLOORS - f) * h, w, h };
}

function drawTower(now) {
  const cv = $("tower");
  if (!cv || !cv.offsetParent) return requestAnimationFrame(drawTower);
  const g = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const sweep = ((now / 2600) % 1) * W;
  g.font = "9px monospace";
  for (let f = 1; f <= FLOORS; f++) {
    const { y, h } = roomXY(f, 1, W, H);
    g.fillStyle = col("fg-muted", 0.9);
    g.fillText(`F${f}`, 4, y + h / 2 + 3);
    for (let r = 1; r <= ROOMS; r++) {
      const b = roomXY(f, r, W, H);
      const near = Math.max(0, 1 - Math.abs(b.x + b.w / 2 - sweep) / 40);
      const flicker = Math.random() < 0.004 ? 0.35 : 0;
      g.fillStyle = safe ? col("ok", 0.08 + near * 0.15) : col("accent", 0.03 + near * 0.16 + flicker);
      g.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      g.strokeStyle = safe ? col("ok", 0.35) : col("fg-muted", 0.45);
      g.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    }
  }
  // sweep beam
  const grad = g.createLinearGradient(sweep - 30, 0, sweep, 0);
  grad.addColorStop(0, col("accent", 0));
  grad.addColorStop(1, safe ? col("ok", 0.25) : col("accent", 0.25));
  g.fillStyle = grad;
  g.fillRect(sweep - 30, 8, 30, H - 14);

  // roaming units (what the BMS *claims* to see)
  if (!safe) {
    for (const u of units) {
      if (now > u.next) { u.f = rnd(1, 4); u.r = rnd(1, 15); u.next = now + 1800 + Math.random() * 3200; }
      const b = roomXY(u.f, u.r, W, H);
      const tx = b.x + b.w / 2, ty = b.y + b.h / 2;
      u.x = u.x ? u.x + (tx - u.x) * 0.04 : tx;
      u.y = u.y ? u.y + (ty - u.y) * 0.04 : ty;
      g.fillStyle = col("danger", 0.55 + 0.4 * Math.sin(now / 180));
      g.beginPath(); g.arc(u.x, u.y, 3, 0, Math.PI * 2); g.fill();
    }
  }

  // survivor
  if (survivor) {
    const [f, r] = survivor.split("-").map(Number);
    const b = roomXY(f, r, W, H);
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    g.fillStyle = col("ok", 0.35 + pulse * 0.4);
    g.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    g.strokeStyle = col("ok", 1);
    g.lineWidth = 1.5;
    g.strokeRect(b.x - 1 - pulse * 3, b.y - 1 - pulse * 3, b.w + 2 + pulse * 6, b.h + 2 + pulse * 6);
    g.lineWidth = 1;
    g.fillStyle = col("fg", 1);
    g.fillText("K.N.", Math.min(b.x, W - 26), b.y - 2 > 8 ? b.y - 2 : b.y + b.h + 9);
  }

  // drone: climbs from the street toward the survivor (or floor 4)
  if (droneT > 0) {
    const target = survivor ? survivor.split("-").map(Number) : [4, 8];
    const b = roomXY(target[0], target[1], W, H);
    const sx = W - 4, sy = H - 2;
    const x = sx + (b.x + b.w / 2 - sx) * droneT, y = sy + (b.y + b.h / 2 - sy) * droneT;
    g.strokeStyle = col("info", 0.6);
    g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(x, y); g.stroke();
    g.setLineDash([]);
    g.fillStyle = col("info", 1);
    g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill();
  }
  drawLoad(now);
  requestAnimationFrame(drawTower);
}

let lastLoad = 0;
function drawLoad(now) {
  const cv = $("bms-load");
  if (!cv) return;
  if (now - lastLoad > 250) {
    lastLoad = now;
    loadTarget = Math.max(safe ? 0 : 0.12, loadTarget * 0.92);
    load.push(Math.min(1, loadTarget + Math.random() * 0.12));
    load.shift();
  }
  const g = cv.getContext("2d");
  const W = cv.width, H = cv.height, bw = W / load.length;
  g.clearRect(0, 0, W, H);
  load.forEach((v, i) => {
    const h = Math.max(1, v * (H - 2));
    g.fillStyle = v > 0.6 ? col("danger", 0.9) : v > 0.35 ? col("warn", 0.8) : col("accent", 0.6);
    g.fillRect(i * bw, H - h, bw - 1, h);
  });
}

export const ops = {
  init() {
    const segs = $("segs");
    segs.innerHTML = "";
    for (let i = 0; i < 10; i++) segs.appendChild(Object.assign(document.createElement("div"), { className: "seg" }));
    requestAnimationFrame(drawTower);
  },

  setSurvivor(room) { survivor = /^[1-4]-(0[1-9]|1[0-5])$/.test(room || "") ? room : null; },

  setFragments(s) {
    for (const el of document.querySelectorAll(".frag")) {
      const id = el.dataset.id;
      const done = !!s.solved[id] || (id !== "F" && !!s.fragments[id]);
      el.classList.toggle("done", done);
      const allFrags = ["A", "B", "C"].every((k) => s.fragments[k]);
      el.classList.toggle("armed", id === "F" && allFrags && !s.solved.F);
      el.querySelector("i").textContent = done ? (id === "F" ? "override ok" : "acquired") : id === "F" ? (allFrags ? "armed" : "sealed") : "locked";
    }
    if (s.solved.C) { droneT = 1; this.uplinkDone(); }
  },

  bms(status, mood = "") {
    $("bms-status").textContent = status;
    const mod = $("bar-bms");
    if (mod) {
      mod.classList.toggle("talking", mood.includes("talking"));
      mod.classList.toggle("dead", mood === "dead");
    }
    if (mood.includes("talking")) loadTarget = 0.95;
    const eye = $("bms-eye");
    eye.classList.remove("talking", "angry");
    if (mood === "dead") eye.classList.add("dead");
    else if (mood) eye.classList.add(...mood.split(" "));
  },

  timer(text, danger) {
    $("big-timer").textContent = text;
  },

  uplinkStart(round, ms) {
    const segs = [...document.querySelectorAll(".seg")];
    segs.forEach((el, i) => { el.className = "seg" + (i < round - 1 ? " ok" : i === round - 1 ? " live" : ""); });
    $("uplink-label").textContent = `segment ${round}/10`;
    droneT = Math.max(droneT, (round - 1) / 10);
    const bar = $("deadline-bar");
    cancelAnimationFrame(deadlineAnim);
    const t0 = performance.now();
    const step = (now) => {
      const left = Math.max(0, 1 - (now - t0) / ms);
      bar.style.width = `${left * 100}%`;
      bar.style.background = left < 0.3 ? "var(--danger)" : "var(--warn)";
      if (left > 0) deadlineAnim = requestAnimationFrame(step);
    };
    deadlineAnim = requestAnimationFrame(step);
  },

  uplinkOk(round) {
    const seg = document.querySelectorAll(".seg")[round - 1];
    if (seg) seg.className = "seg ok";
    droneT = round / 10;
  },

  uplinkFail(round) {
    cancelAnimationFrame(deadlineAnim);
    $("deadline-bar").style.width = "0";
    const seg = document.querySelectorAll(".seg")[round - 1];
    if (seg) seg.className = "seg fail";
    $("uplink-label").textContent = "signal lost";
    droneT = 0;
  },

  uplinkDone() {
    cancelAnimationFrame(deadlineAnim);
    $("deadline-bar").style.width = "0";
    document.querySelectorAll(".seg").forEach((el) => (el.className = "seg ok"));
    $("uplink-label").textContent = "on station";
  },

  makeSafe() {
    safe = true;
    document.querySelector(".thermite").classList.add("safe");
    $("big-timer").textContent = "DISARMED";
  },
};
