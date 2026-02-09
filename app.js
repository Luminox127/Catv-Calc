/* CATV Calc - Wizard + Tabs (CATV Calc / CATV Info / AC Power)
   - Dual-band inputs: 250 + 1000 only (no frequency chooser)
   - Meter pad removed (always 0)
   - Wizard: one step at a time
   - Cable Segments step includes mini 8-input add calculator
*/

(() => {
  const $ = (sel) => document.querySelector(sel);

  // ---------- Data ----------
  // Cable loss @ 250 and @ 1000 per 100 ft (based on your screenshots / typical tables)
  // You can tweak any numbers later.
  const CABLES = [
    { id:"RG59", label:"RG59", loss250:4.10, loss1000:8.12 },
    { id:"RG6",  label:"RG6",  loss250:3.30, loss1000:6.55 },
    { id:"RG11", label:"RG11", loss250:2.05, loss1000:4.35 },
    { id:"QR540",label:"QR540",loss250:1.03, loss1000:2.17 },
    { id:"P3-500",label:"P3-500",loss250:1.20, loss1000:2.52 },
    { id:"P3-625",label:"P3-625",loss250:1.00, loss1000:2.07 },
    { id:"P3-750",label:"P3-750",loss250:0.81, loss1000:1.74 },
    { id:"P3-875",label:"P3-875",loss250:0.72, loss1000:1.53 }
  ];

  // Devices (field passives / internal) – starter set; you can expand any time
  const INTERNAL_DEVICES = [
    { id:"none", label:"(none)", loss:0 },
    { id:"dc8", label:"DC-8 (internal)", loss:8 },
    { id:"dc12", label:"DC-12 (internal)", loss:12 },
    { id:"2w-internal", label:"2-way splitter (internal)", loss:3.5 }
  ];

  const FIELD_DEVICES = [
    { id:"none", label:"(none)", loss:0 },
    { id:"2w", label:"2-way splitter", loss:3.5 },
    { id:"2w-bal", label:"2-way balanced splitter", loss:3.5 },
    { id:"3w-636", label:"3-way (6/3/6)", loss:6 },     // main loss reference; you can refine per port later
    { id:"dc8", label:"DC-8 (field)", loss:8 },
    { id:"dc9", label:"DC-9 (field)", loss:9 },
    { id:"dc12", label:"DC-12 (field)", loss:12 }
  ];

  const TAP_VALUES = [4, 7, 8, 11, 14, 17, 20, 23, 26, 29];

  // ---------- Wizard Steps ----------
  const STEPS = [
    "start",
    "meterWhere",
    "meterLevels",
    "currentTap",
    "segments",
    "inlineTaps",
    "devices",
    "results"
  ];

  // ---------- State ----------
  const state = {
    tab: "calc", // calc | info | ac
    step: "start",
    started: false,

    meterWhere: null, // "atTap" | "upstream"
    meter250: "",
    meter1000: "",

    tapValue: 4,
    tapThruLoss: 1.5, // affects THRU path only

    // segments: array of { cableId, feet }
    segments: [
      { cableId:"P3-500", feet: 0 }
    ],

    // inline taps: array of { tapValue, thruLoss }
    inlineTaps: [],

    // devices
    internal: [], // array of device ids (internal)
    field: [],    // array of device ids (field)

    // mini calc values
    mini: Array(8).fill("")
  };

  // ---------- Helpers ----------
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const clamp = (v, minV, maxV) => Math.max(minV, Math.min(maxV, v));

  const toast = (msg) => {
    let t = $("#toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast hidden";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toast._tm);
    toast._tm = setTimeout(() => t.classList.add("hidden"), 2200);
  };

  const setStep = (step) => {
    state.step = step;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const nextStep = () => {
    const idx = STEPS.indexOf(state.step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };

  const prevStep = () => {
    const idx = STEPS.indexOf(state.step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const cableById = (id) => CABLES.find(c => c.id === id) || CABLES[0];

  const deviceLossSum = (ids, catalog) => {
    return ids.reduce((sum, id) => {
      const d = catalog.find(x => x.id === id);
      return sum + (d ? d.loss : 0);
    }, 0);
  };

  const segmentsLoss = () => {
    // Returns {loss250, loss1000} total based on segments
    let l250 = 0, l1000 = 0;
    for (const s of state.segments) {
      const feet = clamp(num(s.feet), 0, 200000);
      const c = cableById(s.cableId);
      l250 += (c.loss250 * (feet / 100));
      l1000 += (c.loss1000 * (feet / 100));
    }
    return { loss250: l250, loss1000: l1000 };
  };

  const inlineThruLossSum = () => {
    return state.inlineTaps.reduce((sum, t) => sum + num(t.thruLoss), 0);
  };

  const calcAll = () => {
    const m250 = num(state.meter250);
    const m1000 = num(state.meter1000);

    const tapValue = num(state.tapValue);
    const tapThruLoss = num(state.tapThruLoss);

    const seg = segmentsLoss();
    const inlineThru = inlineThruLossSum();
    const internalLoss = deviceLossSum(state.internal, INTERNAL_DEVICES);
    const fieldLoss = deviceLossSum(state.field, FIELD_DEVICES);

    // If meter is taken AT TAP (tap port), upstream = meter + tapValue
    // If meter is taken UPSTREAM, upstream = meter
    const upstream250 = (state.meterWhere === "atTap") ? (m250 + tapValue) : m250;
    const upstream1000 = (state.meterWhere === "atTap") ? (m1000 + tapValue) : m1000;

    // Tap port output level at the current tap location:
    // upstream - tapValue - inlineThru - devices - segments
    // (This matches what you said: meter - cable - inline thru - tap value = expected)
    const tapPortOut250 = upstream250 - tapValue - inlineThru - internalLoss - fieldLoss - seg.loss250;
    const tapPortOut1000 = upstream1000 - tapValue - inlineThru - internalLoss - fieldLoss - seg.loss1000;

    // THRU output (leaving tap on thru path) uses tapThruLoss instead of tapValue:
    const thruOut250 = upstream250 - tapThruLoss - inlineThru - internalLoss - fieldLoss - seg.loss250;
    const thruOut1000 = upstream1000 - tapThruLoss - inlineThru - internalLoss - fieldLoss - seg.loss1000;

    return {
      upstream250, upstream1000,
      tapPortOut250, tapPortOut1000,
      thruOut250, thruOut1000,
      seg, inlineThru, internalLoss, fieldLoss
    };
  };

  // ---------- UI Builders ----------
  const appShell = (inner) => {
    return `
      <div class="container">
        <div class="topbar">
          <div class="brand">
            <div class="title">CATV Calc</div>
            <div class="sub">Dual-band (250 + 1000) • Wizard • Segments</div>
          </div>
          <div class="top-actions">
            <button class="btn" id="btnResults">Results</button>
            <button class="btn danger" id="btnReset">Reset</button>
          </div>
        </div>

        <div class="tabs">
          <div class="tab ${state.tab === "calc" ? "active" : ""}" data-tab="calc">CATV Calc</div>
          <div class="tab ${state.tab === "info" ? "active" : ""}" data-tab="info">CATV Info</div>
          <div class="tab ${state.tab === "ac" ? "active" : ""}" data-tab="ac">AC Power</div>
        </div>

        ${inner}
      </div>
    `;
  };

  const navButtons = ({ back=true, next=true, nextLabel="Next" }={}) => `
    <div class="nav">
      ${back ? `<button class="btn" id="btnBack">Back</button>` : `<span></span>`}
      ${next ? `<button class="btn primary" id="btnNext">${nextLabel}</button>` : `<span></span>`}
    </div>
  `;

  // ---------- Tabs ----------
  const renderInfoTab = () => {
    return appShell(`
      <div class="card">
        <h2>CATV Info</h2>
        <h1>Common sweep / response patterns</h1>
        <p class="help">Quick reference. (You can add more pages later.)</p>

        <div class="hr"></div>

        <h2>Humping</h2>
        <p class="help">
          Signal build-up in the midband. Often caused by over-equalizing amplifiers in the cascade,
          especially if EQ was used to correct roll-off.
        </p>

        <h2>Reflections</h2>
        <p class="help">
          Standing waves: stable symmetrical peaks/valleys. Usually impedance mismatch (not 75Ω).
          Often shows in higher frequency region.
        </p>

        <div class="hr"></div>

        <h2>High-End Roll-off</h2>
        <p class="help">
          Response drops near upper band edge. Causes: loose connectors/center seizure,
          loose modules, amplifier misalignment, diplex/filter issues, bad splices,
          passives designed for lower passband.
        </p>

        <h2>Notch</h2>
        <p class="help">
          Sharp dip. Often loose connectors, tap/coupler faceplates, amplifier modules,
          internal RF grounding issues.
        </p>

        <div class="hr"></div>

        <h2>Standing-wave distance (quick)</h2>
        <p class="help">
          D = 492 (Vp / F) &nbsp; where D in feet, Vp = velocity of propagation (% of c), F = frequency width (MHz).
        </p>
      </div>
    `);
  };

  const renderACTab = () => {
    return appShell(`
      <div class="card">
        <h2>AC Power</h2>
        <h1>Voltage Drop (simple)</h1>
        <p class="help">
          This is a basic calculator tab. We can refine with real cable resistance tables for .500/.625/.750/.875 later.
        </p>

        <div class="row">
          <div class="field">
            <label>Source Voltage (VAC)</label>
            <input id="acV" placeholder="ex: 90" inputmode="decimal" />
          </div>
          <div class="field">
            <label>Load Current (amps)</label>
            <input id="acA" placeholder="ex: 6.0" inputmode="decimal" />
          </div>
          <div class="field">
            <label>Loop Resistance (ohms)</label>
            <input id="acR" placeholder="ex: 1.2" inputmode="decimal" />
          </div>
        </div>

        <div class="smallBtnRow">
          <button class="btn primary" id="acCalc">Calculate</button>
          <button class="btn" id="acClear">Clear</button>
        </div>

        <div class="hr"></div>

        <div class="kv" id="acOut">
          <div class="k">Voltage drop (V)</div><div class="v">—</div>
          <div class="k">Load voltage (V)</div><div class="v">—</div>
          <div class="k">Power loss (W)</div><div class="v">—</div>
        </div>

        <p class="note" style="margin-top:10px">
          Formula used: Vdrop = I × R(loop). LoadV = SourceV - Vdrop. Ploss = I² × R(loop).
        </p>
      </div>
    `);
  };

  // ---------- Wizard Screens ----------
  const renderStart = () => {
    const startedLabel = state.started ? "Ready ✓" : "Tap START (required on iPhone for audio)";
    return `
      <div class="card">
        <h2>Start</h2>
        <h1>Unlock the wizard</h1>
        <p class="help">
          Tap START once to enable audio + unlock the wizard (Safari/iPhone requires a user tap before sound).
          Sound is optional — the wizard still works without it.
        </p>

        <div class="row" style="align-items:center">
          <button class="btn primary" id="btnStart">START</button>
          <div class="badge">${startedLabel}</div>
        </div>

        ${navButtons({ back:false, next:true, nextLabel:"Begin" })}
      </div>
    `;
  };

  const renderMeterWhere = () => `
    <div class="card">
      <h2>A) Meter Location</h2>
      <h1>Where is your meter reading taken?</h1>
      <p class="help">
        <b>At Current Tap</b> = you measured at the tap port.<br/>
        <b>Upstream</b> = you measured before losses (before segments + inline taps + devices).
      </p>

      <div class="choice-grid">
        <div class="choice" id="pickAtTap">
          <div class="big">AT CURRENT TAP</div>
          <div class="small">measured at tap port</div>
        </div>
        <div class="choice" id="pickUpstream">
          <div class="big">UPSTREAM</div>
          <div class="small">measured before losses</div>
        </div>
      </div>

      <div class="pill ${state.meterWhere === "atTap" ? "active" : ""}">Selected: ${state.meterWhere ? (state.meterWhere==="atTap" ? "AT TAP" : "UPSTREAM") : "NONE"}</div>

      ${navButtons({ back:true, next:true })}
    </div>
  `;

  const renderMeterLevels = () => `
    <div class="card">
      <h2>B) Meter Readings</h2>
      <h1>Enter your levels</h1>
      <p class="help">
        Enter both readings. Meter pad is always <b>0</b>. App calculates both bands (250 + 1000).
      </p>

      <div class="row">
        <div class="field">
          <label>Meter @ 250 (dBmV)</label>
          <input id="meter250" placeholder="ex: 34.5" value="${state.meter250}" inputmode="decimal" />
        </div>
        <div class="field">
          <label>Meter @ 1000 (dBmV)</label>
          <input id="meter1000" placeholder="ex: 41" value="${state.meter1000}" inputmode="decimal" />
        </div>
      </div>

      ${navButtons({ back:true, next:true })}
    </div>
  `;

  const renderCurrentTap = () => `
    <div class="card">
      <h2>C) Current Tap</h2>
      <h1>Select tap values</h1>
      <p class="help">
        Tap value affects <b>tap port</b>. THRU loss affects <b>thru path</b>.
      </p>

      <div class="row">
        <div class="field">
          <label>Tap value (dB)</label>
          <select id="tapValue">
            ${TAP_VALUES.map(v => `<option value="${v}" ${Number(state.tapValue)===v?"selected":""}>${v}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Tap THRU loss (dB)</label>
          <input id="tapThru" placeholder="ex: 1.5" value="${state.tapThruLoss}" inputmode="decimal" />
        </div>
      </div>

      ${navButtons({ back:true, next:true })}
    </div>
  `;

  const renderSegments = () => {
    const rows = state.segments.map((s, i) => `
      <li>
        <div class="row">
          <div class="field">
            <label>Cable</label>
            <select data-segCable="${i}">
              ${CABLES.map(c => `<option value="${c.id}" ${c.id===s.cableId?"selected":""}>${c.label}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Feet</label>
            <input data-segFeet="${i}" value="${s.feet}" placeholder="0" inputmode="decimal" />
          </div>
        </div>
        <div class="smallBtnRow">
          <button class="btn" data-segDup="${i}">Duplicate</button>
          <button class="btn danger" data-segDel="${i}">Delete</button>
        </div>
      </li>
    `).join("");

    const miniSum = state.mini.reduce((sum, v) => sum + num(v), 0);

    return `
      <div class="card">
        <h2>D) Cable Segments</h2>
        <h1>Build your run (segments)</h1>
        <p class="help">
          Add segments if the run changes cable size/type. Loss is calculated for both 250 & 1000 automatically.
        </p>

        <ul class="list">${rows || ""}</ul>

        <div class="smallBtnRow">
          <button class="btn primary" id="addSeg">Add Segment</button>
          <button class="btn" id="clearSeg">Clear Segments</button>
        </div>

        <div class="miniCalc">
          <h3>Mini add calculator (up to 8 numbers)</h3>
          <div class="miniGrid">
            ${state.mini.map((v, idx) => `
              <input data-mini="${idx}" value="${v}" placeholder="0" inputmode="decimal" />
            `).join("")}
          </div>
          <div class="miniOut">
            <div class="badge">SUM: ${miniSum.toFixed(2)}</div>
            <div class="note">Use this for quick adds (example: 3+4+2+8+4+6+5+5)</div>
          </div>
        </div>

        ${navButtons({ back:true, next:true })}
      </div>
    `;
  };

  const renderInlineTaps = () => {
    const list = state.inlineTaps.map((t, i) => `
      <li>
        <div><b>${t.tapValue} dB tap</b> • THRU ${Number(t.thruLoss).toFixed(2)} dB</div>
        <div class="smallBtnRow">
          <button class="btn" data-itEdit="${i}">Edit</button>
          <button class="btn danger" data-itDel="${i}">Delete</button>
        </div>
      </li>
    `).join("");

    return `
      <div class="card">
        <h2>E) Inline Taps</h2>
        <h1>Add taps that are in the way (thru losses)</h1>
        <p class="help">
          These are taps in-line before your current tap. We subtract their <b>THRU loss</b> from both paths.
        </p>

        <div class="row">
          <div class="field">
            <label>Inline tap value (dB)</label>
            <select id="itVal">
              ${TAP_VALUES.map(v => `<option value="${v}">${v}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Inline tap THRU loss (dB)</label>
            <input id="itThru" value="1.5" inputmode="decimal" />
          </div>
        </div>

        <div class="smallBtnRow">
          <button class="btn primary" id="addInlineTap">Add Inline Tap</button>
          <button class="btn" id="clearInlineTap">Clear Inline Taps</button>
        </div>

        <div class="hr"></div>

        <div class="kv">
          <div class="k">Inline THRU total (dB)</div><div class="v">${inlineThruLossSum().toFixed(2)}</div>
        </div>

        <ul class="list">${list || ""}</ul>

        ${navButtons({ back:true, next:true })}
      </div>
    `;
  };

  const renderDevices = () => {
    const internalTotal = deviceLossSum(state.internal, INTERNAL_DEVICES);
    const fieldTotal = deviceLossSum(state.field, FIELD_DEVICES);

    const internalList = state.internal.map((id, i) => {
      const d = INTERNAL_DEVICES.find(x => x.id === id);
      return `${i+1}) ${d ? d.label : id} (${d ? d.loss : "?"} dB)`;
    }).join("<br/>") || "(none)";

    const fieldList = state.field.map((id, i) => {
      const d = FIELD_DEVICES.find(x => x.id === id);
      return `${i+1}) ${d ? d.label : id} (${d ? d.loss : "?"} dB)`;
    }).join("<br/>") || "(none)";

    return `
      <div class="card">
        <h2>F) Devices</h2>
        <h1>Add internal + field losses</h1>
        <p class="help">
          Internal = inside minibridger (internal 2-way, DC-8, DC-12). Field = passives out in the field (splitters, DCs).
        </p>

        <div class="row">
          <div class="field">
            <label>Internal device</label>
            <select id="internalPick">
              ${INTERNAL_DEVICES.map(d => `<option value="${d.id}">${d.label}</option>`).join("")}
            </select>
            <div class="smallBtnRow">
              <button class="btn primary" id="addInternal">Add Internal</button>
              <button class="btn" id="clearInternal">Clear Internal</button>
            </div>
            <div class="help" style="margin-top:8px"><b>Internal list:</b><br/>${internalList}</div>
            <div class="badge">Internal total: ${internalTotal.toFixed(2)} dB</div>
          </div>

          <div class="field">
            <label>Field device</label>
            <select id="fieldPick">
              ${FIELD_DEVICES.map(d => `<option value="${d.id}">${d.label}</option>`).join("")}
            </select>
            <div class="smallBtnRow">
              <button class="btn primary" id="addField">Add Field</button>
              <button class="btn" id="clearField">Clear Field</button>
            </div>
            <div class="help" style="margin-top:8px"><b>Field list:</b><br/>${fieldList}</div>
            <div class="badge">Field total: ${fieldTotal.toFixed(2)} dB</div>
          </div>
        </div>

        ${navButtons({ back:true, next:true, nextLabel:"See Results" })}
      </div>
    `;
  };

  const renderResults = () => {
    const r = calcAll();
    const seg = r.seg;

    return `
      <div class="card">
        <h2>Results</h2>
        <h1>Dual-band levels</h1>
        <p class="help">
          Calculated for both bands using your segments + inline taps + devices.
          Tap port output includes <b>tap value</b>. Thru output includes <b>tap thru loss</b>.
        </p>

        <div class="kv">
          <div class="k">Upstream @250</div><div class="v">${r.upstream250.toFixed(2)} dBmV</div>
          <div class="k">Upstream @1000</div><div class="v">${r.upstream1000.toFixed(2)} dBmV</div>

          <div class="k">Tap port output @250</div><div class="v">${r.tapPortOut250.toFixed(2)} dBmV</div>
          <div class="k">Tap port output @1000</div><div class="v">${r.tapPortOut1000.toFixed(2)} dBmV</div>

          <div class="k">Thru output @250</div><div class="v">${r.thruOut250.toFixed(2)} dBmV</div>
          <div class="k">Thru output @1000</div><div class="v">${r.thruOut1000.toFixed(2)} dBmV</div>
        </div>

        <div class="hr"></div>

        <div class="kv">
          <div class="k">Segments loss @250</div><div class="v">${seg.loss250.toFixed(2)} dB</div>
          <div class="k">Segments loss @1000</div><div class="v">${seg.loss1000.toFixed(2)} dB</div>

          <div class="k">Inline taps THRU total</div><div class="v">${r.inlineThru.toFixed(2)} dB</div>
          <div class="k">Internal devices total</div><div class="v">${r.internalLoss.toFixed(2)} dB</div>

          <div class="k">Field devices total</div><div class="v">${r.fieldLoss.toFixed(2)} dB</div>
          <div class="k">Meter mode</div><div class="v">${state.meterWhere === "atTap" ? "AT TAP" : "UPSTREAM"}</div>
        </div>

        <div class="hr"></div>

        <p class="note">
          Tap port output formula:
          upstream − tap value − inline THRU − devices − segments.
          <br/>
          Thru output formula:
          upstream − tap THRU − inline THRU − devices − segments.
        </p>

        ${navButtons({ back:true, next:false })}
      </div>
    `;
  };

  const renderCalcTab = () => {
    let inner = "";
    if (state.step === "start") inner = renderStart();
    if (state.step === "meterWhere") inner = renderMeterWhere();
    if (state.step === "meterLevels") inner = renderMeterLevels();
    if (state.step === "currentTap") inner = renderCurrentTap();
    if (state.step === "segments") inner = renderSegments();
    if (state.step === "inlineTaps") inner = renderInlineTaps();
    if (state.step === "devices") inner = renderDevices();
    if (state.step === "results") inner = renderResults();

    return appShell(inner);
  };

  // ---------- Render ----------
  const render = () => {
    if (state.tab === "info") {
      $("#app").innerHTML = renderInfoTab();
      wireCommon();
      return;
    }
    if (state.tab === "ac") {
      $("#app").innerHTML = renderACTab();
      wireCommon();
      wireAC();
      return;
    }

    $("#app").innerHTML = renderCalcTab();
    wireCommon();
    wireWizard();
  };

  const wireCommon = () => {
    // Tabs
    document.querySelectorAll(".tab").forEach(t => {
      t.addEventListener("click", () => {
        state.tab = t.dataset.tab;
        render();
      });
    });

    // Reset / Results
    $("#btnReset")?.addEventListener("click", () => {
      if (!confirm("Reset everything?")) return;
      state.step = "start";
      state.started = false;
      state.meterWhere = null;
      state.meter250 = "";
      state.meter1000 = "";
      state.tapValue = 4;
      state.tapThruLoss = 1.5;
      state.segments = [{ cableId:"P3-500", feet:0 }];
      state.inlineTaps = [];
      state.internal = [];
      state.field = [];
      state.mini = Array(8).fill("");
      render();
    });

    $("#btnResults")?.addEventListener("click", () => {
      if (state.tab !== "calc") {
        state.tab = "calc";
      }
      setStep("results");
    });
  };

  const wireWizard = () => {
    // Start
    $("#btnStart")?.addEventListener("click", async () => {
      state.started = true;
      // optional tiny beep (no external file)
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = 880;
        g.gain.value = 0.06;
        o.connect(g); g.connect(ctx.destination);
        o.start();
        setTimeout(() => { o.stop(); ctx.close(); }, 90);
      } catch {}
      toast("Wizard unlocked");
      render();
    });

    // Back/Next
    $("#btnBack")?.addEventListener("click", () => prevStep());
    $("#btnNext")?.addEventListener("click", () => {
      // validation for some steps
      if (state.step === "start") {
        if (!state.started) toast("Tap START first (iPhone audio unlock).");
        setStep("meterWhere");
        return;
      }
      if (state.step === "meterWhere") {
        if (!state.meterWhere) return toast("Pick AT TAP or UPSTREAM.");
      }
      if (state.step === "meterLevels") {
        if (!state.meter250 || !state.meter1000) return toast("Enter both meter readings.");
      }
      nextStep();
    });

    // Step specific wiring
    if (state.step === "meterWhere") {
      $("#pickAtTap").addEventListener("click", () => { state.meterWhere="atTap"; render(); });
      $("#pickUpstream").addEventListener("click", () => { state.meterWhere="upstream"; render(); });
    }

    if (state.step === "meterLevels") {
      $("#meter250").addEventListener("input", (e) => state.meter250 = e.target.value);
      $("#meter1000").addEventListener("input", (e) => state.meter1000 = e.target.value);
    }

    if (state.step === "currentTap") {
      $("#tapValue").addEventListener("change", (e) => state.tapValue = Number(e.target.value));
      $("#tapThru").addEventListener("input", (e) => state.tapThruLoss = e.target.value);
    }

    if (state.step === "segments") {
      // update seg inputs
      document.querySelectorAll("[data-segCable]").forEach(sel => {
        sel.addEventListener("change", (e) => {
          const i = Number(sel.getAttribute("data-segCable"));
          state.segments[i].cableId = e.target.value;
        });
      });
      document.querySelectorAll("[data-segFeet]").forEach(inp => {
        inp.addEventListener("input", (e) => {
          const i = Number(inp.getAttribute("data-segFeet"));
          state.segments[i].feet = e.target.value;
        });
      });

      // duplicate / delete
      document.querySelectorAll("[data-segDup]").forEach(btn => {
        btn.addEventListener("click", () => {
          const i = Number(btn.getAttribute("data-segDup"));
          const copy = { ...state.segments[i] };
          state.segments.splice(i+1, 0, copy);
          render();
        });
      });
      document.querySelectorAll("[data-segDel]").forEach(btn => {
        btn.addEventListener("click", () => {
          const i = Number(btn.getAttribute("data-segDel"));
          state.segments.splice(i, 1);
          if (state.segments.length === 0) state.segments.push({ cableId:"P3-500", feet:0 });
          render();
        });
      });

      $("#addSeg").addEventListener("click", () => {
        state.segments.push({ cableId:"P3-500", feet:0 });
        render();
      });
      $("#clearSeg").addEventListener("click", () => {
        state.segments = [{ cableId:"P3-500", feet:0 }];
        render();
      });

      // mini calc
      document.querySelectorAll("[data-mini]").forEach(inp => {
        inp.addEventListener("input", (e) => {
          const i = Number(inp.getAttribute("data-mini"));
          state.mini[i] = e.target.value;
          // live update sum without full render? easiest: render (small app, ok)
          render();
        });
      });
    }

    if (state.step === "inlineTaps") {
      $("#addInlineTap").addEventListener("click", () => {
        const v = Number($("#itVal").value);
        const t = num($("#itThru").value || 0);
        state.inlineTaps.push({ tapValue:v, thruLoss:t });
        render();
      });
      $("#clearInlineTap").addEventListener("click", () => {
        state.inlineTaps = [];
        render();
      });

      document.querySelectorAll("[data-itDel]").forEach(btn => {
        btn.addEventListener("click", () => {
          const i = Number(btn.getAttribute("data-itDel"));
          state.inlineTaps.splice(i, 1);
          render();
        });
      });

      document.querySelectorAll("[data-itEdit]").forEach(btn => {
        btn.addEventListener("click", () => {
          const i = Number(btn.getAttribute("data-itEdit"));
          const cur = state.inlineTaps[i];
          const newThru = prompt(`Edit THRU loss for ${cur.tapValue}dB tap`, String(cur.thruLoss));
          if (newThru === null) return;
          cur.thruLoss = num(newThru);
          render();
        });
      });
    }

    if (state.step === "devices") {
      $("#addInternal").addEventListener("click", () => {
        const id = $("#internalPick").value;
        if (id === "none") return;
        state.internal.push(id);
        render();
      });
      $("#clearInternal").addEventListener("click", () => {
        state.internal = [];
        render();
      });

      $("#addField").addEventListener("click", () => {
        const id = $("#fieldPick").value;
        if (id === "none") return;
        state.field.push(id);
        render();
      });
      $("#clearField").addEventListener("click", () => {
        state.field = [];
        render();
      });
    }
  };

  const wireAC = () => {
    $("#acCalc").addEventListener("click", () => {
      const V = num($("#acV").value);
      const I = num($("#acA").value);
      const R = num($("#acR").value);
      const vdrop = I * R;
      const loadV = V - vdrop;
      const ploss = (I * I) * R;
      const out = $("#acOut");
      out.innerHTML = `
        <div class="k">Voltage drop (V)</div><div class="v">${vdrop.toFixed(2)}</div>
        <div class="k">Load voltage (V)</div><div class="v">${loadV.toFixed(2)}</div>
        <div class="k">Power loss (W)</div><div class="v">${ploss.toFixed(2)}</div>
      `;
    });

    $("#acClear").addEventListener("click", () => {
      $("#acV").value = "";
      $("#acA").value = "";
      $("#acR").value = "";
      $("#acOut").innerHTML = `
        <div class="k">Voltage drop (V)</div><div class="v">—</div>
        <div class="k">Load voltage (V)</div><div class="v">—</div>
        <div class="k">Power loss (W)</div><div class="v">—</div>
      `;
    });
  };

  // ---------- Boot ----------
  const boot = () => {
    const root = $("#app");
    if (!root) return;
    render();
  };

  document.addEventListener("DOMContentLoaded", boot);
})();
