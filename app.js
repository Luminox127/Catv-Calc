(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const STORAGE_KEY = "catv_calc_v4_full_state";

  // ---------- RF DATA ----------
  const CABLES = [
    { id: "RG59", name: "RG59", loss250: 4.10, loss1000: 8.12 },
    { id: "RG6", name: "RG6", loss250: 3.30, loss1000: 6.55 },
    { id: "RG11", name: "RG11", loss250: 2.05, loss1000: 4.35 },
    { id: "QR540", name: "QR540", loss250: 1.03, loss1000: 2.17 },
    { id: "P3-500", name: "P3-500", loss250: 1.20, loss1000: 2.52 },
    { id: "P3-625", name: "P3-625", loss250: 1.00, loss1000: 2.07 },
    { id: "P3-750", name: "P3-750", loss250: 0.81, loss1000: 1.74 },
    { id: "P3-875", name: "P3-875", loss250: 0.72, loss1000: 1.53 },
  ];

  const TAP_VALUES = [4, 8, 11, 14, 17, 20, 23, 26, 29];
  const THRU_LOSS_OPTIONS = [0.8, 1.0, 1.2, 1.5, 1.8, 2.0, 2.4, 2.7, 3.0, 3.3];

  const INTERNAL_DEVICES = [
    { id: "none", name: "(none)", loss: 0 },
    { id: "int_2w", name: "Internal 2-way splitter", loss: 3.5 },
    { id: "int_dc8", name: "Internal DC-8", loss: 8.0 },
    { id: "int_dc12", name: "Internal DC-12", loss: 12.0 },
  ];

  const FIELD_DEVICES = [
    { id: "none", name: "(none)", loss: 0 },
    { id: "2w", name: "2-way splitter", loss: 3.5 },
    { id: "3w_bal", name: "3-way balanced splitter", loss: 5.5 },
    { id: "636", name: "3-way (6/3/6)", loss: 6.0 },
    { id: "dc9", name: "Directional coupler DC-9", loss: 9.0 },
    { id: "dc12", name: "Directional coupler DC-12", loss: 12.0 },
    { id: "pwr_ins", name: "Power inserter (insertion)", loss: 1.0 },
  ];

  // ---------- AC DATA (typical Ω/1000ft) ----------
  const AC_CABLES = [
    { id: "0.500", name: ".500", ohm_per_1000ft: 1.62 },
    { id: "0.625", name: ".625", ohm_per_1000ft: 1.02 },
    { id: "0.750", name: ".750", ohm_per_1000ft: 0.67 },
    { id: "0.875", name: ".875", ohm_per_1000ft: 0.50 },
  ];

  // ---------- WIZARD ----------
  const STEPS = [
    { key: "A", title: "Where is your meter reading taken?" },
    { key: "B", title: "Enter meter readings (250 + 1000 MHz)" },
    { key: "C", title: "Add cable segments (type + feet)" },
    { key: "D", title: "Add inline taps (THRU loss counts)" },
    { key: "E", title: "Select current tap (value + THRU loss)" },
    { key: "F", title: "Add devices (internal + field)" },
    { key: "G", title: "Results" },
  ];

  // ---------- STATE ----------
  const defaultState = {
    tab: "calc", // calc | info | ac
    step: 0,

    // RF
    meterLocation: "AT_TAP", // AT_TAP | UPSTREAM
    meter250: "",
    meter1000: "",
    segments: [],
    inlineTaps: [],
    currentTapValue: 4,
    currentTapThruLoss: 1.5,
    internalDeviceId: "none",
    fieldDeviceId: "none",

    // AC
    acStartVolts: "90",
    acAmps: "4",
    acSegments: [],
  };

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultState);
      const parsed = JSON.parse(raw);
      return { ...structuredClone(defaultState), ...parsed };
    } catch {
      return structuredClone(defaultState);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function resetAll() {
    state = structuredClone(defaultState);
    saveState();
    render();
  }

  // ---------- HELPERS ----------
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const fmt = (x) => (x == null || !Number.isFinite(Number(x)) ? "—" : Number(x).toFixed(2));
  const esc = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  function getDeviceLoss(list, id) {
    const d = list.find((x) => x.id === id);
    return d ? Number(d.loss || 0) : 0;
  }

  function inlineThruTotal() {
    return sum(state.inlineTaps.map((t) => Number(t.thruLoss || 0)));
  }

  function cableLoss(freq) {
    let total = 0;
    for (const seg of state.segments) {
      const cable = CABLES.find((c) => c.id === seg.cableId);
      if (!cable) continue;
      const feet = Math.max(0, Number(seg.feet || 0));
      const per100 = freq === 250 ? cable.loss250 : cable.loss1000;
      total += (feet / 100) * per100;
    }
    return total;
  }

  function levelClass(x) {
    if (x == null) return "warn";
    if (x >= 0 && x <= 15) return "good";
    if (x < 0) return "bad";
    return "warn";
  }

  // ---------- RF RESULTS ----------
  function computeRF() {
    const m250 = num(state.meter250);
    const m1000 = num(state.meter1000);

    const cable250 = cableLoss(250);
    const cable1000 = cableLoss(1000);

    const inlineThru = inlineThruTotal();
    const internalLoss = getDeviceLoss(INTERNAL_DEVICES, state.internalDeviceId);
    const fieldLoss = getDeviceLoss(FIELD_DEVICES, state.fieldDeviceId);

    const thru250 = cable250 + inlineThru + internalLoss + fieldLoss;
    const thru1000 = cable1000 + inlineThru + internalLoss + fieldLoss;

    const tapVal = Number(state.currentTapValue || 0);
    const tapThru = Number(state.currentTapThruLoss || 0);

    function calc(freq, meter, thruLoss) {
      if (meter == null) return null;

      let levelAtTapIn, tapPortOut, thruOutAtTap, upstreamEquivalent;

      if (state.meterLocation === "UPSTREAM") {
        upstreamEquivalent = meter;
        levelAtTapIn = meter - thruLoss;
        tapPortOut = levelAtTapIn - tapVal;
        thruOutAtTap = levelAtTapIn - tapThru;
      } else {
        tapPortOut = meter; // meter taken at tap port out
        levelAtTapIn = meter + tapVal;
        thruOutAtTap = levelAtTapIn - tapThru;
        upstreamEquivalent = levelAtTapIn + thruLoss;
      }

      return { freq, meter, thruLoss, levelAtTapIn, tapPortOut, thruOutAtTap, upstreamEquivalent };
    }

    return {
      r250: calc(250, m250, thru250),
      r1000: calc(1000, m1000, thru1000),
      cable250, cable1000, inlineThru, internalLoss, fieldLoss, tapVal, tapThru,
    };
  }

  // ---------- AC RESULTS ----------
  function acSegDrop(seg, amps) {
    const cable = AC_CABLES.find((c) => c.id === seg.sizeId);
    if (!cable) return 0;
    const feet = Math.max(0, Number(seg.feet || 0));
    const ohms = cable.ohm_per_1000ft * (feet / 1000);
    return amps * ohms; // V = I*R
  }

  function computeAC() {
    const startV = num(state.acStartVolts);
    const amps = num(state.acAmps);
    if (startV == null || amps == null) return null;
    const drops = state.acSegments.map((s) => acSegDrop(s, amps));
    const totalDrop = sum(drops);
    return { startV, amps, drops, totalDrop, endV: startV - totalDrop };
  }

  // ---------- RENDER ----------
  function render() {
    const root = $("#app");
    root.innerHTML = `
      <div class="shell">
        ${topbarHTML()}
        ${state.tab === "calc" ? calcHTML() : state.tab === "info" ? infoHTML() : acHTML()}
      </div>
    `;
    bind();
  }

  function topbarHTML() {
    const active = (t) => (state.tab === t ? "active" : "");
    return `
      <div class="topbar">
        <div class="brand">
          <div class="title">CATV Calc</div>
          <div class="sub">Wizard • Info • AC Powering</div>
        </div>
        <div class="tabs">
          <button class="pill ${active("calc")}" data-tab="calc">CATV Calc</button>
          <button class="pill ${active("info")}" data-tab="info">CATV Info</button>
          <button class="pill ${active("ac")}" data-tab="ac">AC Powering</button>
          <button class="btn danger" data-action="resetAll">Reset</button>
        </div>
      </div>
    `;
  }

  function calcHTML() {
    const s = STEPS[state.step];
    return `
      <div class="card">
        <div class="hd">
          <div class="h1">Step ${s.key}: ${s.title}</div>
          <div class="h2">Only this question is visible • Back / Next controls the wizard</div>
        </div>
        <div class="bd">
          ${stepBody(s.key)}
          <div class="hr"></div>
          <div class="row tight" style="justify-content:space-between">
            <button class="btn ghost" data-action="back" ${state.step === 0 ? "disabled" : ""}>Back</button>
            <button class="btn primary" data-action="next" ${state.step === STEPS.length - 1 ? "disabled" : ""}>Next</button>
          </div>
        </div>
      </div>
    `;
  }

  function stepBody(key) {
    if (key === "A") {
      const on = (v) => (state.meterLocation === v ? "primary" : "");
      return `
        <div class="row">
          <button class="btn ${on("AT_TAP")}" data-set="meterLocation" data-val="AT_TAP">AT TAP (local)</button>
          <button class="btn ${on("UPSTREAM")}" data-set="meterLocation" data-val="UPSTREAM">UPSTREAM (before run)</button>
        </div>
        <div class="small" style="margin-top:10px">
          AT TAP = your meter reading is <b>tap port output</b>. UPSTREAM = before cable + inline THRU losses.
        </div>
      `;
    }

    if (key === "B") {
      return `
        <div class="row">
          <div class="field">
            <label>Meter @ 250 MHz (dBmV)</label>
            <input id="meter250" inputmode="decimal" type="text" placeholder="ex: 34.5" value="${esc(state.meter250)}">
          </div>
          <div class="field">
            <label>Meter @ 1000 MHz (dBmV)</label>
            <input id="meter1000" inputmode="decimal" type="text" placeholder="ex: 41" value="${esc(state.meter1000)}">
          </div>
        </div>
      `;
    }

    if (key === "C") {
      const list = state.segments.length
        ? state.segments.map((seg, i) => {
            const c = CABLES.find((x) => x.id === seg.cableId);
            return `
              <div class="item">
                <div class="left">
                  <div class="name">${c ? c.name : "?"} • ${Number(seg.feet || 0)} ft</div>
                  <div class="meta">Loss/100ft @250=${c ? c.loss250 : "?"} • @1000=${c ? c.loss1000 : "?"}</div>
                </div>
                <div class="row tight">
                  <button class="btn danger" data-action="segDel" data-idx="${i}">Remove</button>
                </div>
              </div>
            `;
          }).join("")
        : `<div class="item"><div class="left"><div class="name">(no segments yet)</div><div class="meta">Add a segment below</div></div></div>`;

      return `
        <div class="field">
          <label>Add a segment</label>
          <div class="row">
            <select id="newCable">
              ${CABLES.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}
            </select>
            <input id="newFeet" inputmode="numeric" type="text" placeholder="Feet (ex: 814)">
          </div>
          <div class="row tight" style="margin-top:8px">
            <button class="btn primary" data-action="segAdd">Add Segment</button>
            <button class="btn" data-action="segClear">Clear</button>
          </div>
        </div>

        <div class="list">${list}</div>

        <div class="row" style="margin-top:12px">
          <div class="resBox"><div class="k">Cable loss @250</div><div class="v">${fmt(cableLoss(250))} dB</div></div>
          <div class="resBox"><div class="k">Cable loss @1000</div><div class="v">${fmt(cableLoss(1000))} dB</div></div>
        </div>
      `;
    }

    if (key === "D") {
      const list = state.inlineTaps.length
        ? state.inlineTaps.map((t, i) => `
          <div class="item">
            <div class="left">
              <div class="name">${t.tapValue} dB tap</div>
              <div class="meta">THRU loss: ${fmt(t.thruLoss)} dB</div>
            </div>
            <div class="row tight">
              <button class="btn danger" data-action="inDel" data-idx="${i}">Remove</button>
            </div>
          </div>
        `).join("")
        : `<div class="item"><div class="left"><div class="name">(no inline taps)</div><div class="meta">Add taps in the way</div></div></div>`;

      return `
        <div class="field">
          <label>Add an inline tap</label>
          <div class="row">
            <select id="inTapVal">
              ${TAP_VALUES.map(v => `<option value="${v}">${v}</option>`).join("")}
            </select>
            <select id="inThru">
              ${THRU_LOSS_OPTIONS.map(v => `<option value="${v}">${v}</option>`).join("")}
            </select>
          </div>
          <div class="row tight" style="margin-top:8px">
            <button class="btn primary" data-action="inAdd">Add Inline Tap</button>
            <button class="btn" data-action="inClear">Clear</button>
          </div>
        </div>

        <div class="list">${list}</div>

        <div class="row" style="margin-top:12px">
          <div class="resBox"><div class="k">Inline taps THRU total</div><div class="v">${fmt(inlineThruTotal())} dB</div></div>
        </div>
      `;
    }

    if (key === "E") {
      return `
        <div class="row">
          <div class="field">
            <label>Current tap value (dB)</label>
            <select id="curTapVal">
              ${TAP_VALUES.map(v => `<option value="${v}" ${Number(state.currentTapValue)===v ? "selected":""}>${v}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Current tap THRU loss (dB)</label>
            <select id="curTapThru">
              ${THRU_LOSS_OPTIONS.map(v => `<option value="${v}" ${Number(state.currentTapThruLoss)===v ? "selected":""}>${v}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="small">
          Includes inline tap THRU loss on the thru path (fix you wanted).
        </div>
      `;
    }

    if (key === "F") {
      return `
        <div class="row">
          <div class="field">
            <label>Internal device</label>
            <select id="intDev">
              ${INTERNAL_DEVICES.map(d => `<option value="${d.id}" ${state.internalDeviceId===d.id?"selected":""}>${d.name} (${fmt(d.loss)} dB)</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Field device</label>
            <select id="fldDev">
              ${FIELD_DEVICES.map(d => `<option value="${d.id}" ${state.fieldDeviceId===d.id?"selected":""}>${d.name} (${fmt(d.loss)} dB)</option>`).join("")}
            </select>
          </div>
        </div>
      `;
    }

    // G results
    const res = computeRF();
    const band = (r) => {
      if (!r) return `<div class="small">Enter meter readings first.</div>`;
      return `
        <div class="row">
          <div class="resBox"><div class="k">Level at tap IN</div><div class="v">${fmt(r.levelAtTapIn)} dBmV</div></div>
          <div class="resBox"><div class="k">Tap port output</div><div class="v ${levelClass(r.tapPortOut)}">${fmt(r.tapPortOut)} dBmV</div></div>
        </div>
        <div class="row" style="margin-top:10px">
          <div class="resBox"><div class="k">THRU output at tap</div><div class="v">${fmt(r.thruOutAtTap)} dBmV</div></div>
          <div class="resBox"><div class="k">Thru-path loss to tap</div><div class="v">${fmt(r.thruLoss)} dB</div></div>
        </div>
      `;
    };

    return `
      <div class="grid two">
        <div class="card" style="box-shadow:none;border-color:rgba(255,255,255,.10)">
          <div class="hd"><div class="h1">250 MHz</div><div class="h2">${state.meterLocation}</div></div>
          <div class="bd">${band(res.r250)}</div>
        </div>
        <div class="card" style="box-shadow:none;border-color:rgba(255,255,255,.10)">
          <div class="hd"><div class="h1">1000 MHz</div><div class="h2">${state.meterLocation}</div></div>
          <div class="bd">${band(res.r1000)}</div>
        </div>
      </div>

      <div class="hr"></div>
      <div class="row">
        <div class="resBox"><div class="k">Cable loss @250</div><div class="v">${fmt(res.cable250)} dB</div></div>
        <div class="resBox"><div class="k">Inline THRU total</div><div class="v">${fmt(res.inlineThru)} dB</div></div>
      </div>
      <div class="row" style="margin-top:10px">
        <div class="resBox"><div class="k">Internal loss</div><div class="v">${fmt(res.internalLoss)} dB</div></div>
        <div class="resBox"><div class="k">Field loss</div><div class="v">${fmt(res.fieldLoss)} dB</div></div>
      </div>
    `;
  }

  function infoHTML() {
    return `
      <div class="card">
        <div class="hd">
          <div class="h1">CATV Info</div>
          <div class="h2">Quick reference</div>
        </div>
        <div class="bd">
          <div class="resBox"><div class="k">Humping</div><div class="small">Midband build-up. Often over-equalizing amps in cascade.</div></div>
          <div class="resBox" style="margin-top:10px"><div class="k">Reflections</div><div class="small">Standing waves from impedance mismatch (not 75Ω).</div></div>
          <div class="resBox" style="margin-top:10px"><div class="k">High-end roll-off</div><div class="small">Loose connectors/modules, diplex, bad splices, wrong passives.</div></div>
          <div class="resBox" style="margin-top:10px"><div class="k">Notch</div><div class="small">Sharp dip: loose connectors, bad faceplates/modules, grounding.</div></div>
        </div>
      </div>
    `;
  }

  function acHTML() {
    const res = computeAC();
    const list = state.acSegments.length
      ? state.acSegments.map((seg, i) => {
          const c = AC_CABLES.find((x) => x.id === seg.sizeId);
          const amps = num(state.acAmps) ?? 0;
          const drop = acSegDrop(seg, amps);
          return `
            <div class="item">
              <div class="left">
                <div class="name">${c ? c.name : "?"} • ${Number(seg.feet || 0)} ft</div>
                <div class="meta">Drop @ ${amps}A: ${fmt(drop)} V</div>
              </div>
              <div class="row tight">
                <button class="btn danger" data-action="acDel" data-idx="${i}">Remove</button>
              </div>
            </div>
          `;
        }).join("")
      : `<div class="item"><div class="left"><div class="name">(no AC segments yet)</div><div class="meta">Add segments below</div></div></div>`;

    return `
      <div class="card">
        <div class="hd">
          <div class="h1">AC Powering</div>
          <div class="h2">Voltage drop estimate</div>
        </div>
        <div class="bd">
          <div class="row">
            <div class="field">
              <label>Start voltage (VAC)</label>
              <input id="acStart" inputmode="decimal" type="text" value="${esc(state.acStartVolts)}" placeholder="ex: 90">
            </div>
            <div class="field">
              <label>Load current (amps)</label>
              <input id="acAmps" inputmode="decimal" type="text" value="${esc(state.acAmps)}" placeholder="ex: 4">
            </div>
          </div>

          <div class="field">
            <label>Add AC segment</label>
            <div class="row">
              <select id="acSize">
                ${AC_CABLES.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}
              </select>
              <input id="acFeet" inputmode="numeric" type="text" placeholder="Feet (ex: 1200)">
            </div>
            <div class="row tight" style="margin-top:8px">
              <button class="btn primary" data-action="acAdd">Add Segment</button>
              <button class="btn" data-action="acClear">Clear</button>
            </div>
            <div class="small">Model: Vdrop = I × (Ω/1000ft × ft/1000)</div>
          </div>

          <div class="list">${list}</div>

          <div class="row" style="margin-top:12px">
            <div class="resBox"><div class="k">Total drop</div><div class="v">${res ? fmt(res.totalDrop) : "—"} V</div></div>
            <div class="resBox"><div class="k">End voltage</div><div class="v ${res ? (res.endV < 60 ? "bad" : "good") : ""}">${res ? fmt(res.endV) : "—"} VAC</div></div>
          </div>
        </div>
      </div>
    `;
  }

  // ---------- EVENTS ----------
  function bind() {
    $$("[data-tab]").forEach((b) =>
      b.addEventListener("click", () => {
        state.tab = b.getAttribute("data-tab");
        saveState();
        render();
      })
    );

    const reset = $("[data-action='resetAll']");
    if (reset) reset.addEventListener("click", resetAll);

    const back = $("[data-action='back']");
    const next = $("[data-action='next']");
    if (back)
      back.addEventListener("click", () => {
        state.step = Math.max(0, state.step - 1);
        saveState();
        render();
      });
    if (next)
      next.addEventListener("click", () => {
        state.step = Math.min(STEPS.length - 1, state.step + 1);
        saveState();
        render();
      });

    $$("[data-set='meterLocation']").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.meterLocation = btn.getAttribute("data-val");
        saveState();
        render();
      })
    );

    const m250 = $("#meter250");
    const m1000 = $("#meter1000");
    if (m250) m250.addEventListener("input", (e) => { state.meter250 = e.target.value; saveState(); });
    if (m1000) m1000.addEventListener("input", (e) => { state.meter1000 = e.target.value; saveState(); });

    // Segments
    const segAdd = $("[data-action='segAdd']");
    if (segAdd) segAdd.addEventListener("click", () => {
      const cableId = $("#newCable").value;
      const feet = Number(($("#newFeet").value || "").trim());
      if (!Number.isFinite(feet) || feet <= 0) return alert("Enter valid feet.");
      state.segments.push({ cableId, feet });
      $("#newFeet").value = "";
      saveState(); render();
    });

    const segClear = $("[data-action='segClear']");
    if (segClear) segClear.addEventListener("click", () => { state.segments = []; saveState(); render(); });

    $$("[data-action='segDel']").forEach((btn) => btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-idx"));
      state.segments.splice(idx, 1);
      saveState(); render();
    }));

    // Inline taps
    const inAdd = $("[data-action='inAdd']");
    if (inAdd) inAdd.addEventListener("click", () => {
      const tapValue = Number($("#inTapVal").value);
      const thruLoss = Number($("#inThru").value);
      state.inlineTaps.push({ tapValue, thruLoss });
      saveState(); render();
    });

    const inClear = $("[data-action='inClear']");
    if (inClear) inClear.addEventListener("click", () => { state.inlineTaps = []; saveState(); render(); });

    $$("[data-action='inDel']").forEach((btn) => btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-idx"));
      state.inlineTaps.splice(idx, 1);
      saveState(); render();
    }));

    // Current tap
    const curTapVal = $("#curTapVal");
    const curTapThru = $("#curTapThru");
    if (curTapVal) curTapVal.addEventListener("change", () => { state.currentTapValue = Number(curTapVal.value); saveState(); });
    if (curTapThru) curTapThru.addEventListener("change", () => { state.currentTapThruLoss = Number(curTapThru.value); saveState(); });

    // Devices
    const intDev = $("#intDev");
    const fldDev = $("#fldDev");
    if (intDev) intDev.addEventListener("change", () => { state.internalDeviceId = intDev.value; saveState(); });
    if (fldDev) fldDev.addEventListener("change", () => { state.fieldDeviceId = fldDev.value; saveState(); });

    // AC
    const acStart = $("#acStart");
    const acAmps = $("#acAmps");
    if (acStart) acStart.addEventListener("input", (e) => { state.acStartVolts = e.target.value; saveState(); render(); });
    if (acAmps) acAmps.addEventListener("input", (e) => { state.acAmps = e.target.value; saveState(); render(); });

    const acAdd = $("[data-action='acAdd']");
    if (acAdd) acAdd.addEventListener("click", () => {
      const sizeId = $("#acSize").value;
      const feet = Number(($("#acFeet").value || "").trim());
      if (!Number.isFinite(feet) || feet <= 0) return alert("Enter valid feet.");
      state.acSegments.push({ sizeId, feet });
      $("#acFeet").value = "";
      saveState(); render();
    });

    const acClear = $("[data-action='acClear']");
    if (acClear) acClear.addEventListener("click", () => { state.acSegments = []; saveState(); render(); });

    $$("[data-action='acDel']").forEach((btn) => btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-idx"));
      state.acSegments.splice(idx, 1);
      saveState(); render();
    }));
  }

  render();
})();
