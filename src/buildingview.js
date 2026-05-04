// Rotating 3D wireframe of HELIX TOWER, rendered to canvas.
// Procedural mesh: octagonal floors stacked vertically with a slight
// helical twist + an antenna spire. The "active" floor (default 4) is
// highlighted in red; everything else in cyan.
//
// Public:
//   buildingView.mount(container)        — inject canvas + start animating
//   buildingView.setHighlightFloor(n)    — change which floor reads as live
//   buildingView.pulse()                 — single-shot accent flash
//   buildingView.stop() / start()        — animation control

const FLOORS = 12;
const N_SIDES = 8;
const RADIUS_BASE = 38;
const RADIUS_TOP = 24;
const FLOOR_H = 11;
const TWIST = Math.PI / 22;
const ACTIVE_FLOOR_INDEX = 7;  // 8th ring counting from base = "floor 4" lore-wise

export const buildingView = {
  canvas: null,
  ctx: null,
  raf: null,
  yaw: 0,
  pulseTime: 0,
  highlightFloor: 4,
  points: [],
  edges: [],
  ringFloor: [],

  mount(container) {
    this.stop();
    this._build();
    container.innerHTML = `
      <div class="ops-section ops-building">
        <h4>Helix Tower — wireframe</h4>
        <canvas class="building-canvas" width="320" height="200"></canvas>
        <div class="building-meta">
          <span>floor <span class="hf">${this.highlightFloor}</span> · live</span>
          <span class="building-coords">8-side · helix +8°/floor</span>
        </div>
      </div>
    `;
    this.canvas = container.querySelector(".building-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.start();
  },

  setHighlightFloor(n) {
    this.highlightFloor = n;
    if (this.canvas) {
      const lbl = this.canvas.parentElement.querySelector(".hf");
      if (lbl) lbl.textContent = n;
    }
  },

  pulse() { this.pulseTime = performance.now(); },

  start() {
    if (this.raf || !this.ctx) return;
    const loop = () => {
      this.yaw += 0.0045;
      this._draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  },

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  },

  _addPoint(x, y, z) { this.points.push([x, y, z]); return this.points.length - 1; },

  _build() {
    this.points = [];
    this.edges = [];
    this.ringFloor = [];
    const rings = [];
    for (let f = 0; f < FLOORS; f++) {
      const t = f / (FLOORS - 1);
      const r = RADIUS_BASE + (RADIUS_TOP - RADIUS_BASE) * t;
      const y = -55 + f * FLOOR_H;
      const ring = [];
      for (let i = 0; i < N_SIDES; i++) {
        const a = (i / N_SIDES) * Math.PI * 2 + f * TWIST;
        ring.push(this._addPoint(Math.cos(a) * r, y, Math.sin(a) * r));
      }
      rings.push(ring);
      // ring edges (perimeter at each floor)
      for (let i = 0; i < ring.length; i++) {
        this.edges.push({ a: ring[i], b: ring[(i + 1) % ring.length], floor: f, kind: "ring" });
      }
    }
    // vertical struts between floors
    for (let f = 1; f < FLOORS; f++) {
      const top = rings[f], bot = rings[f - 1];
      for (let i = 0; i < top.length; i++) {
        this.edges.push({ a: top[i], b: bot[i], floor: f - 0.5, kind: "strut" });
      }
    }
    // diagonal cross-bracing on every other floor (visual interest)
    for (let f = 1; f < FLOORS; f += 2) {
      const top = rings[f], bot = rings[f - 1];
      for (let i = 0; i < top.length; i += 2) {
        this.edges.push({
          a: top[i], b: bot[(i + 1) % top.length],
          floor: f - 0.5, kind: "brace",
        });
      }
    }
    // antenna spire on top
    const topRing = rings[FLOORS - 1];
    const spireY = -55 + FLOORS * FLOOR_H + 22;
    const spire = this._addPoint(0, spireY, 0);
    for (const i of topRing) {
      this.edges.push({ a: i, b: spire, floor: 99, kind: "spire" });
    }
    // ground markers — a + cross at the base for spatial reference
    const a = this._addPoint(-65, -55, 0);
    const b = this._addPoint(65, -55, 0);
    const c = this._addPoint(0, -55, -65);
    const d = this._addPoint(0, -55, 65);
    this.edges.push({ a, b, floor: -1, kind: "ground" });
    this.edges.push({ a: c, b: d, floor: -1, kind: "ground" });
  },

  _project([x, y, z]) {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const xr = x * cy + z * sy;
    const zr = -x * sy + z * cy;
    const tilt = -0.32;
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const yr = y * ct - zr * st;
    const zt = y * st + zr * ct;
    const dist = 220;
    const f = 260 / (zt + dist);
    return [xr * f, -yr * f, zt];
  },

  _draw() {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2 + 22;

    // pulse decay (0..1)
    const elapsed = performance.now() - this.pulseTime;
    const pulse = Math.max(0, 1 - elapsed / 700);

    // project + sort by depth so we draw back-to-front (cheap painter's algorithm)
    const projected = this.points.map((p) => this._project(p));
    const sorted = this.edges
      .map((e) => ({ e, depth: (projected[e.a][2] + projected[e.b][2]) / 2 }))
      .sort((u, v) => v.depth - u.depth);

    const isHighlightFloor = (f) => {
      // we mark ring at ACTIVE_FLOOR_INDEX and the strut layer below it
      return Math.floor(f) === ACTIVE_FLOOR_INDEX
          || Math.floor(f) === ACTIVE_FLOOR_INDEX - 1
          || (f === ACTIVE_FLOOR_INDEX - 0.5);
    };

    for (const { e } of sorted) {
      const p1 = projected[e.a], p2 = projected[e.b];
      const hl = isHighlightFloor(e.floor);
      let stroke, glow, lw;
      if (e.kind === "ground") {
        stroke = "rgba(108,240,194,0.18)"; glow = "transparent"; lw = 1;
      } else if (hl) {
        const a = 0.85 + pulse * 0.15;
        stroke = `rgba(255,90,90,${a})`;
        glow = `rgba(255,90,90,${0.5 + pulse * 0.4})`;
        lw = 1.5;
      } else if (e.kind === "spire") {
        stroke = "rgba(108,240,194,0.95)"; glow = "rgba(108,240,194,0.55)"; lw = 1;
      } else if (e.kind === "brace") {
        stroke = "rgba(108,240,194,0.32)"; glow = "rgba(108,240,194,0.15)"; lw = 0.7;
      } else {
        stroke = "rgba(108,240,194,0.78)"; glow = "rgba(108,240,194,0.35)"; lw = 1;
      }
      ctx.shadowColor = glow;
      ctx.shadowBlur = hl ? 9 : 4;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(cx + p1[0], cy + p1[1]);
      ctx.lineTo(cx + p2[0], cy + p2[1]);
      ctx.stroke();
    }

    // active-floor marker dot (centered over the highlighted ring)
    const ringPts = this.points
      .map((p, i) => ({ p: projected[i], idx: i }))
      .filter((_, i) => {
        // ring point indices for ACTIVE_FLOOR_INDEX
        const ringStart = ACTIVE_FLOOR_INDEX * N_SIDES;
        return i >= ringStart && i < ringStart + N_SIDES;
      });
    if (ringPts.length) {
      let mx = 0, my = 0;
      for (const r of ringPts) { mx += r.p[0]; my += r.p[1]; }
      mx /= ringPts.length; my /= ringPts.length;
      ctx.shadowColor = "rgba(255,90,90,0.7)";
      ctx.shadowBlur = 12 + pulse * 8;
      ctx.fillStyle = `rgba(255,140,140,${0.85 + pulse * 0.15})`;
      ctx.beginPath();
      ctx.arc(cx + mx, cy + my, 2.6 + pulse * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
  },
};
