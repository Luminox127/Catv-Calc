/* CATV Calc — Wizard (1 question per screen) + Tabs: Calc / Info / AC
   - No meter pad (always 0)
   - Cable Segments step has mini sum calculator (8 inputs)
*/

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);

  // ---------- Data ----------
  const CABLE_LOSS_DB_PER_100FT = {
    // Values based on what you showed earlier in screenshots (250 & 1000), used as defaults.
    // You can tweak these later.
    RG59:  { "250": 4.10, "1000": 8.12 },
    RG6:   { "250": 3.30, "1000": 6.55 },
    RG11:  { "250": 2.05, "1000": 4.35 },
    QR540: { "250": 1.03, "1000": 2.17 },
    P3_500:{ "250": 1.20, "1000": 2.52 },
    P3_625:{ "250": 1.00, "1000": 2.07 },
    P3_750:{ "250": 0.81, "1000": 1.74 },
    P3_875:{ "250": 0.72, "1000": 1.53 },
  };

  const CABLE_LABELS = [
    ["P3_500", "P3-500"],
    ["P3_625", "P3-625"],
    ["P3_750", "P3-750"],
    ["P3_875", "P3-875"],
    ["QR540", "QR540"],
    ["RG11", "RG11"],
    ["RG6", "RG6"],
    ["RG59", "RG59"],
  ];

  // Field devices (simple default losses; tweak to match your tables if you want)
  const FIELD_DEVICES = [
    { id: "none", name: "(none)", loss: 0 },
    { id: "split2", name: "2-way splitter", loss: 3.5 },
    { id: "split3_bal", name: "3-way splitter (balanced)", loss: 5.5 },
    { id: "split3_unbal_low", name: "3-way splitter (unbalanced, LOW loss port)", loss: 3.5 },
    { id: "split3_unbal_high", name: "3-way splitter (unbalanced, HIGH loss port)", loss: 7.0 },
    { id: "dc8", name: "Directional Coupler (DC-8)", loss: 8.0 },
    { id: "dc9", name: "Directional Coupler (DC-9)", loss: 9.0 },
    { id: "dc12", name: "Directional Coupler (DC-12)", loss: 12.0 },
  ];

  // Inline taps (thru loss per tap; you can set per tap if needed)
  const INLINE_TAP_VALUES = [4, 8, 11, 14, 17, 20, 23, 26, 29];

  // ---------- State ----------
  const state = {
    tab: "calc", // calc | info | ac
    step: 0,
    // Calc wizard values
    whereMeasured: null, // "at_tap" | "upstream"
    meter250: "",
    meter1000: "",
    cableType: "P3_500",
    segments: [], // [{ft:number}]
    inlineTaps: [], // [{tap:number, thru:number}]
    currentTapValue: 0,
    currentTapThru: 0,
    internalDevice: "none", // internal add-on loss
    fieldDevice: "none",    // additional loss
    // mini sum calc
    mini: Array(8).fill(""),
    // AC Calc
    ac: { lengthFt:"", currentA:"", rPer1000:"", outV:"", inV:"" }
  };

  // Persist (optional)
  const STORAGE_KEY = "catv_calc_state_vA1";
  function saveState(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
  }
  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return;
      const s = JSON.parse(raw);
      // shallow merge with defaults (avoid breaking if fields missing)
      Object.assign(state, s);
      if(!Array.isArray(state.segments)) state.segments = [];
      if(!Array.isArray(state.inlineTaps)) state.inlineTaps = [];
      if(!Array.isArray(state.mini)) state.mini = Array(8).fill("");
    }catch(e){}
  }

  // ---------- Helpers ----------
  const fmt = (n, d=2) => (Number.isFinite(n) ? n.toFixed(d) : "—");
  const toNum = (x) => {
    const n = Number(String(x).trim());
    return Number.isFinite(n) ? n : NaN;
  };

  function cableLossPer100ft(cableKey, freq){
    const table = CABLE_LOSS_DB_PER_100FT[cableKey];
    if(!table) return NaN;
    if(freq === 250) return table["250"];
    if(freq === 1000) return table["1000"];
    return NaN;
  }

  function totalFeet(){
    return state.segments.reduce((sum,s)=> sum + (Number(s.ft)||0), 0);
  }

  function deviceLossById(id){
    const d = FIELD_DEVICES.find(x=>x.id===id);
    return d ? d.loss : 0;
  }
  function deviceNameById(id){
    const d = FIELD_DEVICES.find(x=>x.id===id);
    return d ? d.name : "(unknown)";
  }

  function inlineThruTotal(){
    return state.inlineTaps.reduce((sum,t)=> sum + (Number(t.thru)||0), 0);
  }

  // Main calc using your rule:
  // Tap Port Output = Meter(freq) - cableLoss(freq) - inlineThruTotal - currentTapValue - internal - field
  // (We treat "meter reading" as level at the measurement point depending on whereMeasured.)
  function computeResults(){
    const m250 = toNum(state.meter250);
    const m1000 = toNum(state.meter1000);

    // If one is missing, we still compute the other.
    const feet = totalFeet();
    const inlineThru = inlineThruTotal();
    const tapVal = toNum(state.currentTapValue) || 0;

    const internalLoss = deviceLossById(state.internalDevice);
    const fieldLoss = deviceLossById(state.fieldDevice);

    // For now, we calculate assuming the meter readings are at the start of the run if "upstream",
    // OR at the tap (local) if "at_tap". The wizard wording helps the user choose.
    // But the formula you want for tap port output matches "meter is upstream of run".
    // So we compute both "Tap Port (if upstream)" and "Tap Port (if local)" clearly.
    function calcAtFreq(freq, meter){
      if(!Number.isFinite(meter)) return null;
      const per100 = cableLossPer100ft(state.cableType, freq);
      const cableLoss = Number.isFinite(per100) ? (per100 * (feet/100)) : NaN;

      const tapPort_upstream = meter - cableLoss - inlineThru - tapVal - internalLoss - fieldLoss;
      const tapPort_local = meter - tapVal - internalLoss - fieldLoss; // if measured at tap location

      const thru_after_inline_upstream = meter - cableLoss - inlineThru - (toNum(state.currentTapThru)||0) - internalLoss - fieldLoss;
      const thru_after_inline_local = meter - (toNum(state.currentTapThru)||0) - internalLoss - fieldLoss;

      return {
        freq,
        meter,
        feet,
        per100,
        cableLoss,
        inlineThru,
        internalLoss,
        fieldLoss,
        tapVal,
        tapThru: (toNum(state.currentTapThru)||0),
        tapPort_upstream,
        tapPort_local,
        thru_upstream: thru_after_inline_upstream,
        thru_local: thru_after_inline_local
      };
    }

    return {
      r250: calcAtFreq(250, m250),
      r1000: calcAtFreq(1000, m1000)
    };
  }

  // ---------- UI Rendering ----------
  function layout(){
    return `
      <div class="shell">
        <div class="topbar">
          <div class="brand">
            <div class="title">CATV Calc</div>
            <div class="sub">Wizard • one question at a time • mobile-friendly</div>
          </div>
          <div class="tabs">
            <button class="tab ${state.tab==="calc"?"active":""}" data-tab="calc">CATV Calc</button>
            <button class="tab ${state.tab==="info"?"active":""}" data-tab="info">CATV Info</button>
            <button class="tab ${state.tab==="ac"?"active":""}" data-tab="ac">AC Powering</button>
          </div>
        </div>

        <div id="panel"></div>
      </div>
    `;
  }

  function card(title, desc, bodyHtml, rightPillsHtml=""){
    return `
      <div class="card">
        <div class="cardHeader">
          <div>
            <h2>${title}</h2>
            ${desc ? `<p>${desc}</p>` : ``}
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            ${rightPillsHtml}
          </div>
        </div>
        <div class="cardBody">
          ${bodyHtml}
        </div>
      </div>
    `;
  }

  // ---------- Wizard Steps (Calc) ----------
  const steps = [
    function stepWhere(){
      const body = `
        <div class="bigChoices">
          <div class="choice" data-set="whereMeasured" data-val="at_tap">
            <div class="label">AT TAP (local)</div>
            <div class="hint">You measured at the current tap location. We subtract the tap value only.</div>
          </div>
          <div class="choice" data-set="whereMeasured" data-val="upstream">
            <div class="label">UPSTREAM (before run)</div>
            <div class="hint">You measured before the run. We subtract cable loss + inline taps + tap value.</div>
          </div>
        </div>

        <div class="actions">
          <button class="btn danger" id="resetAll">Reset</button>
          <button class="btn primary" id="next" ${state.whereMeasured? "":"disabled"}>Next</button>
        </div>
      `;
      return card(
        "Where is your meter reading taken?",
        "Pick one. This changes how results are interpreted.",
        body,
        `<span class="pill">Step 1/8</span>`
      );
    },

    function stepMeters(){
      const body = `
        <div class="row">
          <div class="col">
            <div class="field">
              <label>Meter @ 250 MHz (dBmV)</label>
              <input inputmode="decimal" placeholder="Example: 34.5" id="meter250" value="${escapeHtml(state.meter250)}" />
            </div>
          </div>
          <div class="col">
            <div class="field">
              <label>Meter @ 1000 MHz (dBmV)</label>
              <input inputmode="decimal" placeholder="Example: 41" id="meter1000" value="${escapeHtml(state.meter1000)}" />
            </div>
          </div>
        </div>

        <div class="note">
          Tip: If you only have one reading, fill just one and we’ll compute that band.
        </div>

        <div class="actions">
          <button class="btn" id="back">Back</button>
          <button class="btn primary" id="next" ${(state.meter250||state.meter1000)? "":"disabled"}>Next</button>
        </div>
      `;
      return card("Enter your meter readings", "No meter pad. Always 0 dB compensation.", body, `<span class="pill">Step 2/8</span>`);
    },

    function stepCableType(){
      const opts = CABLE_LABELS.map(([k,label]) =>
        `<option value="${k}" ${state.cableType===k?"selected":""}>${label}</option>`
      ).join("");

      const body = `
        <div class="field">
          <label>Cable type</label>
          <select id="cableType">${opts}</select>
        </div>

        <div class="actions">
          <button class="btn" id="back">Back</button>
          <button class="btn primary" id="next">Next</button>
        </div>
      `;
      return card("Select cable type", "Used to calculate loss at 250 & 1000.", body, `<span class="pill">Step 3/8</span>`);
    },

    function stepSegments(){
      // list segments
      const segList = state.segments.length
        ? state.segments.map((s,i)=> `<div class="kv"><div class="k">Segment ${i+1}</div><div class="v">${fmt(Number(s.ft),0)} ft</div></div>`).join("")
        : `<div class="note">No segments added yet.</div>`;

      const body = `
        <div class="row">
          <div class="col">
            <div class="field">
              <label>Add a cable segment (feet)</label>
              <input inputmode="decimal" placeholder="Example: 300" id="segFt" />
            </div>
            <div class="actions">
              <button class="btn primary" id="addSeg">Add Segment</button>
              <button class="btn danger" id="clearSegs">Clear Segments</button>
            </div>

            <div class="hr"></div>

            <div class="pill">Total run: ${fmt(totalFeet(),0)} ft</div>
            <div style="margin-top:10px;">${segList}</div>

            <div class="miniCalc">
              <h3>Quick sum (up to 8 inputs)</h3>
              <div class="miniGrid">
                ${state.mini.map((v,idx)=> `
                  <input inputmode="decimal" placeholder="${idx+1}" data-mini="${idx}" value="${escapeHtml(v)}" />
                `).join("")}
              </div>
              <div class="sumRow">
                <div class="note">Use this to add multiple spans fast (example: 3+4+2+8+...)</div>
                <div class="sumVal" id="miniSum">${fmt(miniSum(),2)}</div>
              </div>
              <div class="actions" style="margin-top:10px;">
                <button class="btn" id="useMiniSum">Use sum as NEW segment</button>
                <button class="btn" id="clearMini">Clear mini</button>
              </div>
            </div>
          </div>

          <div class="col">
            <div class="kv">
              <div class="k">Loss/100ft @250</div>
              <div class="v">${fmt(cableLossPer100ft(state.cableType,250),2)} dB</div>
              <div class="k">Loss/100ft @1000</div>
              <div class="v">${fmt(cableLossPer100ft(state.cableType,1000),2)} dB</div>
            </div>
            <div class="note">Cable loss = (loss per 100ft) × (total feet / 100).</div>
          </div>
        </div>

        <div class="actions">
          <button class="btn" id="back">Back</button>
          <button class="btn primary" id="next" ${totalFeet()>0 ? "" : "disabled"}>Next</button>
        </div>
      `;
      return card("Cable segments", "Add segments — no typing cable names, just feet.", body, `<span class="pill">Step 4/8</span>`);
    },

    function stepInlineTaps(){
      const tapOpts = INLINE_TAP_VALUES.map(v=> `<option value="${v}">${v} dB tap</option>`).join("");

      const list = state.inlineTaps.length
        ? state.inlineTaps.map((t,i)=> `<div class="kv"><div class="k">Inline tap ${i+1}</div><div class="v">${t.tap} dB (THRU ${fmt(t.thru,2)} dB)</div></div>`).join("")
        : `<div class="note">No inline taps added.</div>`;

      const body = `
        <div class="row">
          <div class="col">
            <div class="field">
              <label>Inline tap value</label>
              <select id="inlineTapVal">${tapOpts}</select>
            </div>
            <div class="field">
              <label>Inline tap THRU loss (dB)</label>
              <input inputmode="decimal" id="inlineTapThru" value="1.5" />
            </div>

            <div class="actions">
              <button class="btn primary" id="addInline">Add Inline Tap</button>
              <button class="btn danger" id="clearInline">Clear Inline Taps</button>
            </div>

            <div class="hr"></div>
            <div class="pill">Inline THRU total: ${fmt(inlineThruTotal(),2)} dB</div>
            <div style="margin-top:10px;">${list}</div>
          </div>

          <div class="col">
            <div class="note">
              Inline taps THRU loss is subtracted on the THRU path. <br/>
              Your requested formula uses inline THRU total in the tap-port calculation when reading is upstream.
            </div>
          </div>
        </div>

        <div class="actions">
          <button class="btn" id="back">Back</button>
          <button class="btn primary" id="next">Next</button>
        </div>
      `;
      return card("Inline taps in the run", "Add any taps that are in the way (THRU losses).", body, `<span class="pill">Step 5/8</span>`);
    },

    function stepCurrentTap(){
      const body = `
        <div class="row">
          <div class="col">
            <div class="field">
              <label>Current tap value (dB)</label>
              <select id="curTapVal">
                ${INLINE_TAP_VALUES.map(v=> `<option value="${v}" ${Number(state.currentTapValue)===v?"selected":""}>${v} dB</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="col">
            <div class="field">
              <label>Current tap THRU loss (dB)</label>
              <input inputmode="decimal" id="curTapThru" value="${escapeHtml(String(state.currentTapThru||"1.5"))}" />
            </div>
          </div>
        </div>

        <div class="note">
          Tap PORT output subtracts tap value. THRU output subtracts tap THRU loss.
        </div>

        <div class="actions">
          <button class="btn" id="back">Back</button>
          <button class="btn primary" id="next">Next</button>
        </div>
      `;
      return card("Current tap", "Set the tap you’re working on.", body, `<span class="pill">Step 6/8</span>`);
    },

    function stepDevices(){
      const opts = FIELD_DEVICES.map(d=> `<option value="${d.id}" ${state.internalDevice===d.id?"selected":""}>${d.name} (${d.loss} dB)</option>`).join("");
      const opts2 = FIELD_DEVICES.map(d=> `<option value="${d.id}" ${state.fieldDevice===d.id?"selected":""}>${d.name} (${d.loss} dB)</option>`).join("");

      const body = `
        <div class="row">
          <div class="col">
            <div class="field">
              <label>Internal device loss (inside mini-bridger)</label>
              <select id="internalDevice">${opts}</select>
            </div>
            <div class="note">You asked for internal: 2-way, DC-8, DC-12. (We include those.)</div>
          </div>

          <div class="col">
            <div class="field">
              <label>Field device loss (in the field)</label>
              <select id="fieldDevice">${opts2}</select>
            </div>
            <div class="note">Includes splitters + DC-8/9/12. You can expand later.</div>
          </div>
        </div>

        <div class="actions">
          <button class="btn" id="back">Back</button>
          <button class="btn primary" id="next">Next</button>
        </div>
      `;
      return card("Devices / passives", "Add losses from splitters / DCs / etc.", body, `<span class="pill">Step 7/8</span>`);
    },

    function stepResults(){
      const res = computeResults();

      const pill = `<span class="pill">Step 8/8</span>`;
      const body = `
        <div class="note">
          Showing both interpretations:
          <b>UPSTREAM</b> assumes meter was before the run (subtract cable + inline THRU + tap value).  
          <b>AT TAP</b> assumes meter is local at the tap (subtract tap value only).
        </div>

        ${renderBand(res.r250)}
        ${renderBand(res.r1000)}

        <div class="actions">
          <button class="btn" id="back">Back</button>
          <button class="btn danger" id="resetAll">Reset</button>
        </div>
      `;
      return card("Results", "Your numbers, clean and explicit.", body, pill);
    }
  ];

  function renderBand(r){
    if(!r) return "";
    const mode = state.whereMeasured;

    // Your exact target when upstream:
    // meter - cableLoss - inlineThru - tapVal (and devices)
    const tapPortPreferred = (mode === "upstream") ? r.tapPort_upstream : r.tapPort_local;

    return `
      <div class="hr"></div>
      <div class="pill">${r.freq} MHz</div>

      <div class="kv" style="margin-top:10px;">
        <div class="k">Meter</div>
        <div class="v">${fmt(r.meter,2)} dBmV</div>

        <div class="k">Total cable</div>
        <div class="v">${fmt(r.feet,0)} ft</div>

        <div class="k">Cable loss</div>
        <div class="v">${fmt(r.cableLoss,2)} dB</div>

        <div class="k">Inline taps THRU total</div>
        <div class="v">${fmt(r.inlineThru,2)} dB</div>

        <div class="k">Current tap value</div>
        <div class="v">${fmt(r.tapVal,2)} dB</div>

        <div class="k">Internal device</div>
        <div class="v">${deviceNameById(state.internalDevice)} (${fmt(r.internalLoss,2)} dB)</div>

        <div class="k">Field device</div>
        <div class="v">${deviceNameById(state.fieldDevice)} (${fmt(r.fieldLoss,2)} dB)</div>
      </div>

      <div class="kv" style="margin-top:12px;">
        <div class="k">Tap PORT (preferred for your selection: ${mode === "upstream" ? "UPSTREAM" : "AT TAP"})</div>
        <div class="v">${fmt(tapPortPreferred,2)} dBmV</div>

        <div class="k">Tap PORT (UPSTREAM formula)</div>
        <div class="v">${fmt(r.tapPort_upstream,2)} dBmV</div>

        <div class="k">Tap PORT (AT TAP local)</div>
        <div class="v">${fmt(r.tapPort_local,2)} dBmV</div>

        <div class="k">THRU output (UPSTREAM)</div>
        <div class="v">${fmt(r.thru_upstream,2)} dBmV</div>

        <div class="k">THRU output (AT TAP local)</div>
        <div class="v">${fmt(r.thru_local,2)} dBmV</div>
      </div>
    `;
  }

  // ---------- CATV Info Tab ----------
  function renderInfoTab(){
    const body = `
      <div class="note">
        Quick reference notes you can expand. (No copyrighted text copied verbatim.)
      </div>

      <div class="infoList">
        <div class="infoItem">
          <h4>Humping</h4>
          <p>Build-up through midband. Often caused by over-equalization / incorrect roll-off correction across cascades.</p>
        </div>
        <div class="infoItem">
          <h4>Reflections (Standing waves)</h4>
          <p>Regular ripples/peaks across the band (sometimes more visible at higher freq). Common cause: impedance mismatch (not 75Ω) at some point.</p>
        </div>
        <div class="infoItem">
          <h4>High-end Roll-off</h4>
          <p>Level drops near top of band. Causes can include loose connectors, loose modules, diplex/filter problems, bad splices, wrong passives for band.</p>
        </div>
        <div class="infoItem">
          <h4>Notch</h4>
          <p>Sharp narrow dip. Often from loose connectors, bad faceplates/tap hardware, or internal grounding issues.</p>
        </div>
        <div class="infoItem">
          <h4>Standing wave distance formula</h4>
          <p>Used to estimate distance to a fault from ripple spacing in sweep response.</p>
          <div class="code">D = 492 × (Vp / F)</div>
          <p class="note">D in feet, Vp as velocity of propagation ratio (e.g. 0.87), F is ripple spacing (MHz).</p>
        </div>
      </div>
    `;
    return card("CATV Info", "Troubleshooting patterns + quick formulas.", body, `<span class="pill">Reference</span>`);
  }

  // ---------- AC Powering Tab ----------
  function renderACTab(){
    const body = `
      <div class="row">
        <div class="col">
          <div class="field">
            <label>Input voltage at supply (VAC)</label>
            <input inputmode="decimal" id="acInV" placeholder="Example: 90" value="${escapeHtml(state.ac.inV)}" />
          </div>
          <div class="field">
            <label>Run length (feet)</label>
            <input inputmode="decimal" id="acLen" placeholder="Example: 1200" value="${escapeHtml(state.ac.lengthFt)}" />
          </div>
          <div class="field">
            <label>Load current (amps)</label>
            <input inputmode="decimal" id="acA" placeholder="Example: 8" value="${escapeHtml(state.ac.currentA)}" />
          </div>
          <div class="field">
            <label>Cable resistance (ohms per 1000 ft)</label>
            <input inputmode="decimal" id="acR" placeholder="Example: 3.2" value="${escapeHtml(state.ac.rPer1000)}" />
          </div>

          <div class="actions">
            <button class="btn primary" id="acCalc">Calculate</button>
            <button class="btn danger" id="acClear">Clear</button>
          </div>
          <div class="note">
            Formula (single-phase AC approximation):<br/>
            <span class="code">Vdrop = I × R × (length/1000)</span><br/>
            If you want “round trip” (out + back), enter resistance that already includes both conductors, or double it.
          </div>
        </div>

        <div class="col">
          ${renderACResults()}
        </div>
      </div>
    `;
    return card("AC Powering", "Quick voltage drop estimate for plant powering.", body, `<span class="pill">Tools</span>`);
  }

  function renderACResults(){
    const inV = toNum(state.ac.inV);
    const len = toNum(state.ac.lengthFt);
    const a = toNum(state.ac.currentA);
    const r = toNum(state.ac.rPer1000);

    if(!Number.isFinite(inV) || !Number.isFinite(len) || !Number.isFinite(a) || !Number.isFinite(r)){
      return `<div class="note">Enter values and tap Calculate.</div>`;
    }
    const vdrop = a * r * (len/1000);
    const outV = inV - vdrop;

    return `
      <div class="kv">
        <div class="k">Voltage drop</div><div class="v">${fmt(vdrop,2)} VAC</div>
        <div class="k">Estimated voltage at load</div><div class="v">${fmt(outV,2)} VAC</div>
      </div>
      <div class="note">
        If this doesn’t match field readings, tell me your cable type + conductor size and whether you want round-trip modeled.
      </div>
    `;
  }

  // ---------- Events ----------
  function bindCommon(){
    // Tabs
    document.querySelectorAll(".tab").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const t = btn.getAttribute("data-tab");
        state.tab = t;
        saveState();
        render();
      });
    });
  }

  function bindCalcStep(){
    const panel = $("#panel");
    if(!panel) return;

    // choices
    panel.querySelectorAll(".choice[data-set]").forEach(el=>{
      el.addEventListener("click", ()=>{
        const key = el.getAttribute("data-set");
        const val = el.getAttribute("data-val");
        state[key] = val;
        saveState();
        render();
      });
    });

    // back/next/reset
    const back = $("#back", panel);
    if(back) back.addEventListener("click", ()=>{
      state.step = Math.max(0, state.step - 1);
      saveState();
      render();
    });

    const next = $("#next", panel);
    if(next) next.addEventListener("click", ()=>{
      state.step = Math.min(steps.length - 1, state.step + 1);
      saveState();
      render();
    });

    const resetAll = $("#resetAll", panel);
    if(resetAll) resetAll.addEventListener("click", ()=>{
      // reset calc-only fields, keep tab
      const keepTab = state.tab;
      Object.assign(state, {
        tab: keepTab,
        step: 0,
        whereMeasured: null,
        meter250: "",
        meter1000: "",
        cableType: "P3_500",
        segments: [],
        inlineTaps: [],
        currentTapValue: 0,
        currentTapThru: 0,
        internalDevice: "none",
        fieldDevice: "none",
        mini: Array(8).fill("")
      });
      saveState();
      render();
    });

    // Step-specific bindings
    const s = state.step;

    if(s === 1){
      const i250 = $("#meter250", panel);
      const i1000 = $("#meter1000", panel);
      if(i250) i250.addEventListener("input", (e)=>{ state.meter250 = e.target.value; saveState(); renderQuickEnableNext(); });
      if(i1000) i1000.addEventListener("input", (e)=>{ state.meter1000 = e.target.value; saveState(); renderQuickEnableNext(); });
    }

    if(s === 2){
      const sel = $("#cableType", panel);
      if(sel) sel.addEventListener("change", (e)=>{ state.cableType = e.target.value; saveState(); render(); });
    }

    if(s === 3){
      const segFt = $("#segFt", panel);
      const addSeg = $("#addSeg", panel);
      const clearSegs = $("#clearSegs", panel);

      if(addSeg) addSeg.addEventListener("click", ()=>{
        const ft = toNum(segFt ? segFt.value : "");
        if(!Number.isFinite(ft) || ft <= 0) return;
        state.segments.push({ft});
        if(segFt) segFt.value = "";
        saveState();
        render();
      });
      if(clearSegs) clearSegs.addEventListener("click", ()=>{
        state.segments = [];
        saveState();
        render();
      });

      // mini sum inputs
      panel.querySelectorAll("input[data-mini]").forEach(inp=>{
        inp.addEventListener("input", (e)=>{
          const idx = Number(e.target.getAttribute("data-mini"));
          state.mini[idx] = e.target.value;
          saveState();
          const sumEl = $("#miniSum", panel);
          if(sumEl) sumEl.textContent = fmt(miniSum(),2);
        });
      });

      const useMini = $("#useMiniSum", panel);
      if(useMini) useMini.addEventListener("click", ()=>{
        const sum = miniSum();
        if(!Number.isFinite(sum) || sum <= 0) return;
        state.segments.push({ft: sum});
        saveState();
        render();
      });

      const clearMini = $("#clearMini", panel);
      if(clearMini) clearMini.addEventListener("click", ()=>{
        state.mini = Array(8).fill("");
        saveState();
        render();
      });
    }

    if(s === 4){
      const addInline = $("#addInline", panel);
      const clearInline = $("#clearInline", panel);
      const valSel = $("#inlineTapVal", panel);
      const thruInp = $("#inlineTapThru", panel);

      if(addInline) addInline.addEventListener("click", ()=>{
        const tap = toNum(valSel ? valSel.value : "");
        const thru = toNum(thruInp ? thruInp.value : "");
        if(!Number.isFinite(tap)) return;
        const thruLoss = Number.isFinite(thru) ? thru : 1.5;
        state.inlineTaps.push({tap, thru: thruLoss});
        saveState();
        render();
      });

      if(clearInline) clearInline.addEventListener("click", ()=>{
        state.inlineTaps = [];
        saveState();
        render();
      });
    }

    if(s === 5){
      const curVal = $("#curTapVal", panel);
      const curThru = $("#curTapThru", panel);

      if(curVal) curVal.addEventListener("change", (e)=>{
        state.currentTapValue = toNum(e.target.value) || 0;
        saveState();
      });
      if(curThru) curThru.addEventListener("input", (e)=>{
        state.currentTapThru = e.target.value;
        saveState();
      });
    }

    if(s === 6){
      const internal = $("#internalDevice", panel);
      const field = $("#fieldDevice", panel);
      if(internal) internal.addEventListener("change",(e)=>{ state.internalDevice = e.target.value; saveState(); });
      if(field) field.addEventListener("change",(e)=>{ state.fieldDevice = e.target.value; saveState(); });
    }

    function renderQuickEnableNext(){
      const n = $("#next", panel);
      if(!n) return;
      n.disabled = !(state.meter250 || state.meter1000);
    }
  }

  function bindACTab(){
    const panel = $("#panel");
    if(!panel) return;

    const inV = $("#acInV", panel);
    const len = $("#acLen", panel);
    const a = $("#acA", panel);
    const r = $("#acR", panel);

    [inV,len,a,r].forEach((el)=>{
      if(!el) return;
      el.addEventListener("input",(e)=>{
        if(el === inV) state.ac.inV = e.target.value;
        if(el === len) state.ac.lengthFt = e.target.value;
        if(el === a) state.ac.currentA = e.target.value;
        if(el === r) state.ac.rPer1000 = e.target.value;
        saveState();
      });
    });

    const calc = $("#acCalc", panel);
    if(calc) calc.addEventListener("click", ()=>{
      saveState();
      render(); // re-render to show results
    });

    const clear = $("#acClear", panel);
    if(clear) clear.addEventListener("click", ()=>{
      state.ac = { lengthFt:"", currentA:"", rPer1000:"", outV:"", inV:"" };
      saveState();
      render();
    });
  }

  // ---------- Render ----------
  function render(){
    const root = $("#app");
    root.innerHTML = layout();

    const panel = $("#panel");
    if(state.tab === "calc"){
      const html = steps[state.step]();
      panel.innerHTML = html;
      bindCommon();
      bindCalcStep();
    } else if(state.tab === "info"){
      panel.innerHTML = renderInfoTab();
      bindCommon();
    } else if(state.tab === "ac"){
      panel.innerHTML = renderACTab();
      bindCommon();
      bindACTab();
    }
  }

  // ---------- Mini sum ----------
  function miniSum(){
    let sum = 0;
    for(const v of state.mini){
      const n = toNum(v);
      if(Number.isFinite(n)) sum += n;
    }
    return sum;
  }

  // ---------- Escape ----------
  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  // ---------- Boot ----------
  loadState();
  // Make sure step is valid
  if(!Number.isFinite(state.step) || state.step<0 || state.step>=steps.length) state.step = 0;
  if(!["calc","info","ac"].includes(state.tab)) state.tab = "calc";

  render();
})();
