// Live ops console: hexagonal Paraply logo, SVG floor plan with state-driven
// coloring, drone/survivor/thermite modules. Each level toggles relevant
// sections via setMode().

import { buildingView } from "./buildingview.js";

const ROOMS = [
  { id: "4-01", x:   0, y:  0, w: 44, h: 32, label: "OFFICE" },
  { id: "4-02", x:  44, y:  0, w: 44, h: 32, label: "OFFICE" },
  { id: "4-03", x:  88, y:  0, w: 44, h: 32, label: "LAB-A" },
  { id: "4-04", x: 132, y:  0, w: 44, h: 32, label: "STORE" },
  { id: "4-05", x: 176, y:  0, w: 44, h: 32, label: "OFFICE" },

  { id: "4-06", x:   0, y: 34, w: 88, h: 32, label: "CONF" },
  { id: "CORR-W", x: 88,  y: 34, w: 44, h: 32, label: "corridor", corridor: true },
  { id: "4-07", x: 132, y: 34, w: 44, h: 32, label: "LAB-B" },
  { id: "4-08", x: 176, y: 34, w: 44, h: 32, label: "OFFICE" },

  { id: "4-09", x:   0, y: 68, w: 44, h: 32, label: "OFFICE" },
  { id: "4-10", x:  44, y: 68, w: 44, h: 32, label: "OFFICE" },
  { id: "4-11", x:  88, y: 68, w: 44, h: 32, label: "COMMS" },
  { id: "4-12", x: 132, y: 68, w: 44, h: 32, label: "SERVER" },
  { id: "4-13", x: 176, y: 68, w: 44, h: 32, label: "OFFICE" },

  { id: "CORR-E", x:  0,  y: 102, w: 176, h: 32, label: "corridor", corridor: true },
  { id: "4-15", x: 176, y: 102, w: 44,  h: 32, label: "BIO-3" },
];

const ROOM_BY_ID = new Map(ROOMS.map((r) => [r.id, r]));

let panelEl = null;
let floorSvg = null;
let droneEl = null;
let mode = "idle";
let dronePos = null; // null = drone marker hidden on floor plan
let droneState = { state: "idle", batt: 100 };
let survivor = { bpm: 0, tag: "searching", visible: false };

const DEFAULT_TIME_MS = 60 * 60 * 1000;
let containmentRemainingMs = DEFAULT_TIME_MS;

// hex frame + double-helix glyph — bio-tech corporate mark, original.
const PARAPLY_LOGO = `<svg class="logo" viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ff8a8a" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#ff3a3a" stop-opacity="0.7"/>
    </linearGradient>
  </defs>
  <polygon points="50,6 90,28 90,72 50,94 10,72 10,28"
           fill="rgba(255,90,90,0.06)" stroke="url(#pg)" stroke-width="2.4"/>
  <path d="M 36 24 C 64 36, 36 60, 64 76" fill="none" stroke="#ff5a5a" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M 64 24 C 36 36, 64 60, 36 76" fill="none" stroke="#ff5a5a" stroke-width="2.2" stroke-linecap="round" opacity="0.7"/>
  <line x1="40" y1="34" x2="60" y2="34" stroke="#ff5a5a" stroke-width="0.9" opacity="0.6"/>
  <line x1="40" y1="50" x2="60" y2="50" stroke="#ff5a5a" stroke-width="0.9" opacity="0.6"/>
  <line x1="40" y1="66" x2="60" y2="66" stroke="#ff5a5a" stroke-width="0.9" opacity="0.6"/>
</svg>`;

export const ops = {
  init() {
    panelEl = document.getElementById("ops-panel");
    this.setMode("idle");
  },

  setMode(m) {
    mode = m;
    this.render();
  },

  render() {
    if (!panelEl) return;
    panelEl.innerHTML = `
      <div class="ops-section ops-brand">
        ${PARAPLY_LOGO}
        <div class="ops-brand-text">
          <div class="brand">PARAPLY</div>
          <div class="brand-sub">// BIOTEKNIK AB</div>
          <div class="brand-tag">building mgmt :: helix tower</div>
        </div>
      </div>

      <div id="building-mount"></div>
      ${this._sectionFloor()}
      ${this._sectionVitals()}
      ${this._sectionDrone()}
      ${this._sectionThermite()}
    `;
    const bm = panelEl.querySelector("#building-mount");
    if (bm) buildingView.mount(bm);
    floorSvg = panelEl.querySelector(".floorplan");
    droneEl = panelEl.querySelector(".drone");
    this._applyDronePos();
    this.updateThermite(containmentRemainingMs);
    this.updateSurvivor(survivor);
    this.updateDrone(droneState);
  },

  pulseBuilding() { buildingView.pulse(); },

  // ============== floor plan ==============

  _sectionFloor() {
    const roomEls = ROOMS.map((r) => {
      const cx = r.x + r.w / 2;
      const rectCls = r.corridor ? "corridor" : "room";
      const labels = r.corridor
        ? `<text class="corridor-label" x="${cx}" y="${r.y + r.h/2 + 2}" text-anchor="middle">${r.label}</text>`
        : `<text class="label" x="${cx}" y="${r.y + r.h/2 - 2}" text-anchor="middle">${r.id}</text>
           <text class="label-sub" x="${cx}" y="${r.y + r.h/2 + 8}" text-anchor="middle">${r.label}</text>`;
      return `
        <rect class="${rectCls}" id="rm-${r.id}"
              x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"
              ${r.corridor ? 'fill="transparent" stroke="rgba(95,169,127,0.18)" stroke-dasharray="2 2"' : ""} />
        ${labels}
      `;
    }).join("");

    return `
      <div class="ops-section ops-floor">
        <h4>Floor 4 — Live</h4>
        <svg class="floorplan" viewBox="-2 -2 224 138" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="sweep-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"  stop-color="rgba(108,240,194,0)"/>
              <stop offset="70%" stop-color="rgba(108,240,194,0.18)"/>
              <stop offset="100%" stop-color="rgba(108,240,194,0.55)"/>
            </linearGradient>
          </defs>
          ${roomEls}
          <rect class="radar-sweep" x="-22" y="-2" width="22" height="142"
                fill="url(#sweep-grad)" opacity="0.7" pointer-events="none">
            <animateTransform attributeName="transform" type="translate"
                              from="-22 0" to="244 0" dur="4.2s" repeatCount="indefinite"/>
          </rect>
          <circle class="drone" r="2.6" cx="0" cy="0" style="display:none">
            <animate attributeName="r" values="2.4;3.4;2.4" dur="1.5s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.85;1;0.85" dur="1.5s" repeatCount="indefinite"/>
          </circle>
        </svg>
        <div class="ops-legend">
          <span><span class="swatch cold"></span>cool</span>
          <span><span class="swatch warm"></span>warm</span>
          <span><span class="swatch hot"></span>hostile</span>
          <span><span class="swatch surv"></span>survivor</span>
        </div>
      </div>
    `;
  },

  // ============== vitals (survivor) ==============

  _sectionVitals() {
    return `
      <div class="ops-section ops-vitals">
        <h4>Survivor — tag K-NORDLUND</h4>
        <div class="vitals-row"><span>HEARTRATE</span><span><span class="heart" id="bpm-heart" style="display:none">♥</span><span id="bpm-val">—</span></span></div>
        <div class="bar-track"><div id="bpm-bar" class="bar-fill bar-survivor" style="width:0"></div></div>
        <div class="vitals-row"><span>TAG</span><span id="tag-val">searching</span></div>
        <div class="vitals-row"><span>LOCATION</span><span id="loc-val">unknown</span></div>
      </div>
    `;
  },

  updateSurvivor(s) {
    survivor = { ...survivor, ...s };
    if (!panelEl) return;
    const bpmEl  = panelEl.querySelector("#bpm-val");
    const heart  = panelEl.querySelector("#bpm-heart");
    const bar    = panelEl.querySelector("#bpm-bar");
    const tagEl  = panelEl.querySelector("#tag-val");
    const locEl  = panelEl.querySelector("#loc-val");
    if (bpmEl) bpmEl.textContent = survivor.bpm ? `${survivor.bpm} bpm` : "—";
    if (heart) heart.style.display = survivor.bpm ? "" : "none";
    if (bar)   bar.style.width = `${Math.min(100, (survivor.bpm || 0) * 0.6)}%`;
    if (tagEl) tagEl.textContent = survivor.tag || "—";
    if (locEl) locEl.textContent = survivor.location || "unknown";
    if (heart && survivor.bpm) {
      const dur = Math.max(0.4, 60 / survivor.bpm).toFixed(2);
      heart.style.animationDuration = `${dur}s`;
    }
  },

  // ============== drone ==============

  _sectionDrone() {
    return `
      <div class="ops-section ops-drone">
        <h4>Drone — Unit-7</h4>
        <div class="vitals-row"><span>STATE</span><span id="drone-state-val">idle</span></div>
        <div class="vitals-row"><span>POSITION</span><span id="drone-pos-val">—</span></div>
        <div class="vitals-row"><span>BATTERY</span><span id="drone-batt-val">100%</span></div>
        <div class="bar-track"><div id="drone-batt-bar" class="bar-fill" style="width:100%"></div></div>
      </div>
    `;
  },

  updateDrone(d) {
    droneState = { ...droneState, ...d };
    if (!panelEl) return;
    const stateEl = panelEl.querySelector("#drone-state-val");
    const posEl   = panelEl.querySelector("#drone-pos-val");
    const battEl  = panelEl.querySelector("#drone-batt-val");
    const battBar = panelEl.querySelector("#drone-batt-bar");
    if (stateEl) stateEl.textContent = droneState.state || "idle";
    if (posEl)   posEl.textContent   = droneState.pos || dronePos || "—";
    if (battEl)  battEl.textContent  = (droneState.batt ?? 100) + "%";
    if (battBar) {
      const b = droneState.batt ?? 100;
      battBar.style.width = b + "%";
      battBar.className = "bar-fill" + (b < 25 ? " bar-danger" : b < 50 ? " bar-warn" : "");
    }
  },

  setDronePos(roomId) {
    dronePos = roomId;
    droneState.pos = roomId;
    this.updateDrone({});
    this._applyDronePos();
  },

  _applyDronePos() {
    if (!droneEl) return;
    const r = ROOM_BY_ID.get(dronePos);
    if (!r) { droneEl.style.display = "none"; return; }
    droneEl.style.display = "";
    droneEl.setAttribute("cx", r.x + r.w / 2);
    droneEl.setAttribute("cy", r.y + r.h / 2);
  },

  // ============== thermite ==============

  _sectionThermite() {
    return `
      <div class="ops-section ops-thermite">
        <h4>Thermite suppression</h4>
        <div class="bar-track"><div id="thermite-bar" class="bar-fill bar-danger" style="width:100%"></div></div>
        <div class="ops-thermite-time" id="thermite-time">60:00</div>
      </div>
    `;
  },

  updateThermite(remainingMs) {
    containmentRemainingMs = remainingMs;
    if (!panelEl) return;
    const bar = panelEl.querySelector("#thermite-bar");
    const txt = panelEl.querySelector("#thermite-time");
    const pct = Math.max(0, Math.min(100, (remainingMs / DEFAULT_TIME_MS) * 100));
    if (bar) {
      bar.style.width = pct + "%";
      bar.className = "bar-fill" + (pct < 17 ? " bar-danger" : pct < 50 ? " bar-warn" : " bar-survivor");
    }
    if (txt) {
      const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
      const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
      const ss = (totalSec % 60).toString().padStart(2, "0");
      txt.textContent = `${m}:${ss}`;
      txt.classList.toggle("calm", pct >= 50);
    }
  },

  // ============== floor plan room state ==============

  scanRoom(id, kind) {
    if (!floorSvg) return;
    const el = floorSvg.querySelector("#rm-" + id);
    if (!el) return;
    el.classList.remove("scanned-cold", "scanned-warm", "scanned-hot", "survivor");
    if (kind === "survivor") el.classList.add("survivor");
    else if (kind === "hot") el.classList.add("scanned-hot");
    else if (kind === "warm") el.classList.add("scanned-warm");
    else if (kind === "cold") el.classList.add("scanned-cold");
  },

  scanAll(stateMap) {
    for (const [id, kind] of Object.entries(stateMap)) this.scanRoom(id, kind);
  },

  markRoom(id, kind) {
    if (!floorSvg) return;
    const el = floorSvg.querySelector("#rm-" + id);
    if (!el) return;
    el.classList.remove("marked-survivor", "marked-hostile");
    if (kind === "survivor") el.classList.add("marked-survivor");
    else if (kind === "hostile") el.classList.add("marked-hostile");
  },

  unmarkRoom(id) {
    if (!floorSvg) return;
    const el = floorSvg.querySelector("#rm-" + id);
    if (!el) return;
    el.classList.remove("marked-survivor", "marked-hostile");
  },

  resetFloor() {
    if (!floorSvg) return;
    floorSvg.querySelectorAll(".room").forEach((el) => {
      el.classList.remove("scanned-cold", "scanned-warm", "scanned-hot",
                          "survivor", "marked-survivor", "marked-hostile");
    });
  },
};
