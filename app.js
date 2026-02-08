/* app.js — CATV Calc (Wizard + Info Tab) — v2 (fixed click/tap issues)
   Paste this WHOLE file over your current app.js

   IMPORTANT:
   - Your index.html MUST load this as a real .js (not .txt) file.
   - In your repo, files must be named exactly:
       app.js
       index.html
       style.css   (optional)
       manifest.json
       sw.js       (optional)
     If yours are app.js.txt etc, GitHub Pages will NOT execute JS.

   What this does:
   - Questionnaire / wizard flow (tap choices, no typing cable name)
   - No “meter pad” (always 0)
   - Dual-band results (250 + 1000) automatically
   - Cable segments list (multiple types/lengths)
   - Inline taps THRU losses subtracted correctly
   - Internal + Field devices (ATX table TYP @200≈250, @1002≈1000)
   - Cable-segments screen includes a mini 8-number adder calculator
   - CATV Info tab with the content you sent (typed in)

*/

(() => {
  // ---------- Helpers ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const num = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // ---------- Data: Cable loss (dB / 100ft) ----------
  // from your screenshots
  const CABLES = {
    RG59: { loss250: 4.10, loss1000: 8.12 },
    RG6: { loss250: 3.30, loss1000: 6.55 },
    RG11: { loss250: 2.05, loss1000: 4.35 },
    QR540: { loss250: 1.03, loss1000: 2.17 },
    "P3-500": { loss250: 1.20, loss1000: 2.52 },
    "P3-625": { loss250: 1.00, loss1000: 2.07 },
    "P3-750": { loss250: 0.81, loss1000: 1.74 },
    "P3-875": { loss250: 0.72, loss1000: 1.53 },
  };

  // ---------- Data: ATX GigaXtend Line Passives (Insertion Loss IN-OUT, TYP) ----------
  // Use 200 MHz as ~250, and 1002 MHz as ~1000
  const DEVICES = {
    "2-way splitter": { loss250: 4.2, loss1000: 5.0, group: "Splitters" },
    "3-way splitter (unbalanced) [636]": { loss250: 4.5, loss1000: 5.1, group: "Splitters" },
    "3-way splitter (balanced)": { loss250: 6.3, loss1000: 6.9, group: "Splitters" },

    "DC-8 (8 dB coupler) [THRU insertion]": { loss250: 2.0, loss1000: 2.4, group: "Couplers / DC (THRU)" },
    "DC-12 (12 dB coupler) [THRU insertion]": { loss250: 1.4, loss1000: 2.0, group: "Couplers / DC (THRU)" },
    "DC-16 (16 dB coupler) [THRU insertion]": { loss250: 1.2, loss1000: 1.9, group: "Couplers / DC (THRU)" },

    "Power Inserter (AC-in) [THRU insertion]": { loss250: 0.5, loss1000: 0.7, group: "Power" },
  };

  // ---------- State ----------
  const state = {
    tab: "calc",           // calc | info
    step: 0,               // wizard step
    readingWhere: "UPSTREAM", // UPSTREAM | AT_TAP_IN
    meter250: "",
    meter1000: "",
    segments: [],          // { cable, ft }
    inlineTaps: [],        // { tapVal, thruLoss }
    currentTapVal: "",
    currentTapThru: "",
    internalDevices: [],   // keys
    fieldDevices: [],      // keys
    calcInputs: Array(8).fill(""),
  };

  // ---------- Calculations ----------
  function cableLoss(band) {
    const key = band === 250 ? "loss250" : "loss1000";
    let total = 0;
    for (const seg of state.segments) {
      const data = CABLES[seg.cable];
      if (!data) continue;
      const ft = Math.max(0, num(seg.ft, 0));
      total += (ft / 100) * data[key];
    }
    return total;
  }

  function deviceLoss(keys, band) {
    const k = band === 250 ? "loss250" : "loss1000";
    return sum(keys.map((name) => (DEVICES[name] ? DEVICES[name][k] : 0)));
  }

  function inlineThruTotal() {
    return sum(state.inlineTaps.map((t) => num(t.thruLoss, 0)));
  }

  function computeBand(band) {
    const meter = band === 250 ? num(state.meter250, 0) : num(state.meter1000, 0);

    const internal = deviceLoss(state.internalDevices, band);
    const field = deviceLoss(state.fieldDevices, band);
    const inline = inlineThruTotal();
    const cab = cableLoss(band);

    let tapIn = 0;
    if (state.readingWhere === "UPSTREAM") {
      tapIn = meter - internal - field - inline - cab;
    } else {
      tapIn = meter; // already at tap input
    }

    const tapVal = num(state.currentTapVal, 0);
    const tapThru = num(state.currentTapThru, 0);

    return {
      band,
      meter,
      tapIn,
      tapPortOut: tapIn - tapVal,
      thruOut: tapIn - tapThru,
      breakdown: { internal, field, inline, cab },
    };
  }

  function computeAll() {
    return { r250: computeBand(250), r1000: computeBand(1000) };
  }

  // ---------- Root ----------
  function ensureRoot() {
    let root = document.getElementById("app");
    if (!root) {
      root = document.createElement("div");
      root.id = "app";
      document.body.appendChild(root);
    }
    return root;
  }
  const root = ensureRoot();

  // ---------- Styles (2026 clean vibe, big tappable buttons) ----------
  const style = document.createElement("style");
  style.textContent = `
    :root{
      --bg0:#070A12; --bg1:#0B1022;
      --card:#0F1733CC; --stroke:#2A3A74;
      --text:#EAF0FF; --muted:#A9B7E8;
      --accent:#7B61FF; --danger:#FF5470;
      --shadow:0 18px 50px rgba(0,0,0,.35);
      --r:18px; --r2:14px;
      --font: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
    }
    *{box-sizing:border-box}
    body{
      margin:0; font-family:var(--font); color:var(--text);
      background:
        radial-gradient(1200px 700px at 20% 10%, rgba(123,97,255,.18), transparent 60%),
        radial-gradient(1000px 600px at 80% 30%, rgba(53,208,255,.12), transparent 55%),
        linear-gradient(180deg, var(--bg0), var(--bg1));
      min-height:100vh;
    }
    .wrap{max-width:1100px;margin:0 auto;padding:22px 16px 60px}
    .topbar{
      display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
      padding:16px 16px;
      border-radius:var(--r);
      border:1px solid rgba(42,58,116,.55);
      background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
      box-shadow:var(--shadow); backdrop-filter:blur(10px);
    }
    .brand h1{margin:0;font-size:20px}
    .brand .sub{color:var(--muted);font-size:13px;margin-top:4px}
    .tabs{display:flex;gap:10px;flex-wrap:wrap}
    .tabbtn{
      border:1px solid rgba(42,58,116,.7);
      background:rgba(15,23,51,.6);
      padding:10px 14px;border-radius:999px;
      font-weight:800; cursor:pointer; user-select:none;
    }
    .tabbtn.active{
      border-color:rgba(123,97,255,.95);
      box-shadow:0 0 0 4px rgba(123,97,255,.14);
      background:rgba(123,97,255,.18);
    }
    .content{margin-top:16px}
    .card{
      border-radius:var(--r);
      border:1px solid rgba(42,58,116,.55);
      background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
      box-shadow:var(--shadow); backdrop-filter:blur(10px);
      overflow:hidden;
    }
    .cardHead{padding:16px;border-bottom:1px solid rgba(42,58,116,.45)}
    .cardHead h2{margin:0;font-size:18px}
    .cardHead p{margin:6px 0 0;color:var(--muted);font-size:13px}
    .cardBody{padding:16px}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    @media (max-width:900px){.grid2{grid-template-columns:1fr}}
    .choice{
      border:1px solid rgba(42,58,116,.7);
      background:rgba(15,23,51,.55);
      padding:14px;border-radius:var(--r2);
      cursor:pointer; user-select:none;
      min-height:92px;
      display:flex;flex-direction:column;justify-content:center;
    }
    .choice:hover{border-color:rgba(123,97,255,.9)}
    .choice .t{font-weight:900}
    .choice .d{color:var(--muted);font-size:13px;margin-top:6px}
    label{color:var(--muted);font-size:13px}
    input, select{
      width:100%; padding:12px; border-radius:12px;
      border:1px solid rgba(42,58,116,.65);
      background:rgba(7,10,18,.35);
      color:var(--text); outline:none;
    }
    input:focus, select:focus{
      border-color:rgba(123,97,255,.95);
      box-shadow:0 0 0 4px rgba(123,97,255,.14);
    }
    .btnRow{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
    .btn{
      border:1px solid rgba(42,58,116,.7);
      background:rgba(15,23,51,.55);
      padding:12px 14px;border-radius:14px;
      font-weight:900; cursor:pointer; user-select:none;
      min-width:120px;text-align:center;
    }
    .btn.primary{border-color:rgba(123,97,255,.95);background:rgba(123,97,255,.22)}
    .btn.danger{border-color:rgba(255,84,112,.85);background:rgba(255,84,112,.14)}
    .pill{
      display:inline-flex;gap:8px;align-items:center;
      padding:10px 12px;border-radius:999px;
      border:1px solid rgba(42,58,116,.6);
      background:rgba(15,23,51,.55);
      font-size:13px;
    }
    .list{margin:12px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
    .li{
      padding:12px;border-radius:14px;
      border:1px solid rgba(42,58,116,.55);
      background:rgba(15,23,51,.45);
      display:flex;justify-content:space-between;align-items:center;gap:10px;
    }
    .li small{color:var(--muted)}
    .x{
      width:34px;height:34px;display:grid;place-items:center;
      border-radius:10px;border:1px solid rgba(42,58,116,.65);
      background:rgba(7,10,18,.35);cursor:pointer;user-select:none;
    }
    .x:hover{border-color:rgba(255,84,112,.9)}
    .panel{
      border-radius:16px;border:1px solid rgba(42,58,116,.55);
      background:rgba(15,23,51,.42);
      padding:14px;
    }
    .resultsGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
    @media (max-width:900px){.resultsGrid{grid-template-columns:1fr}}
    .kv{display:flex;justify-content:space-between;gap:10px;margin:6px 0}
    .kv .k{color:var(--muted)}
    .kv .v{font-weight:900}
    .hr{height:1px;background:rgba(42,58,116,.55);margin:10px 0}
    .tiny{font-size:12px;color:var(--muted);line-height:1.45}
    .calc8{margin-top:14px;border-radius:16px;border:1px solid rgba(42,58,116,.55);background:rgba(15,23,51,.42);padding:12px}
    .calc8 h3{margin:0 0 10px;font-size:14px}
    .calcGrid{display:grid;grid-template-columns:repeat(4, 1fr);gap:8px}
    @media (max-width:560px){.calcGrid{grid-template-columns:repeat(2, 1fr)}}
    .calcSum{margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
  `;
  document.head.appendChild(style);

  // ---------- Wizard Steps ----------
  const STEPS = [
    {
      title: "Where is your meter reading taken?",
      desc: "UPSTREAM = before losses. AT TAP = already at current tap input.",
      render: () => `
        <div class="grid2">
          <div class="choice" data-action="setWhere" data-value="UPSTREAM">
            <div class="t">UPSTREAM (before run)</div>
            <div class="d">Measured before cable / inline taps / devices.</div>
          </div>
          <div class="choice" data-action="setWhere" data-value="AT_TAP_IN">
            <div class="t">AT TAP (tap input)</div>
            <div class="d">Measured at current tap input (after run).</div>
          </div>
        </div>
      `,
    },
    {
      title: "Enter meter readings",
      desc: "No band selection — results are shown for BOTH 250 and 1000.",
      render: () => `
        <div class="grid2">
          <div>
            <label>Meter @ 250 MHz (dBmV)</label>
            <input id="meter250" inputmode="decimal" placeholder="ex: 34.5" value="${state.meter250}">
          </div>
          <div>
            <label>Meter @ 1000 MHz (dBmV)</label>
            <input id="meter1000" inputmode="decimal" placeholder="ex: 41" value="${state.meter1000}">
          </div>
        </div>
      `,
      onNext: () => {
        state.meter250 = $("#meter250")?.value ?? "";
        state.meter1000 = $("#meter1000")?.value ?? "";
      },
    },
    {
      title: "Cable segments",
      desc: "Add multiple segments (different cable types/lengths).",
      render: () => {
        const cableOpts = Object.keys(CABLES).map((k) => `<option value="${k}">${k}</option>`).join("");
        const list = state.segments.map((s, i) => {
          const l250 = (CABLES[s.cable].loss250 * (num(s.ft, 0) / 100));
          const l1000 = (CABLES[s.cable].loss1000 * (num(s.ft, 0) / 100));
          return `
            <li class="li">
              <div>
                <div><b>${s.cable}</b> — ${fmt(num(s.ft, 0), 0)} ft</div>
                <small>@250: ${fmt(l250, 2)} dB • @1000: ${fmt(l1000, 2)} dB</small>
              </div>
              <div class="x" data-action="rmSeg" data-index="${i}">✕</div>
            </li>
          `;
        }).join("");

        const calcSum = sum(state.calcInputs.map((x) => num(x, 0)));
        const calcInputs = state.calcInputs.map((v, i) =>
          `<input data-action="calcIn" data-index="${i}" inputmode="decimal" placeholder="${i + 1}" value="${v}">`
        ).join("");

        return `
          <div class="grid2">
            <div>
              <label>Cable type</label>
              <select id="segCable">${cableOpts}</select>
            </div>
            <div>
              <label>Length (ft)</label>
              <input id="segFt" inputmode="decimal" placeholder="ex: 814">
            </div>
          </div>
          <div class="btnRow">
            <div class="btn primary" data-action="addSeg">Add Segment</div>
            <div class="btn danger" data-action="clrSeg">Clear Segments</div>
          </div>

          <ul class="list">${list || `<li class="li"><small>(no segments yet)</small></li>`}</ul>

          <div class="calc8">
            <h3>Quick add (8 numbers)</h3>
            <div class="calcGrid">${calcInputs}</div>
            <div class="calcSum">
              <div class="pill">Sum: <b id="calcSum">${fmt(calcSum, 2)}</b></div>
              <div class="btn" data-action="calcClr">Clear</div>
            </div>
          </div>
        `;
      },
    },
    {
      title: "Inline taps in the way (THRU losses)",
      desc: "Add each inline tap the signal goes THROUGH before your current tap.",
      render: () => {
        const tapVals = [4, 7, 8, 11, 14, 17, 20, 23, 26, 29];
        const tapOpts = tapVals.map((v) => `<option value="${v}">${v} dB tap</option>`).join("");
        const list = state.inlineTaps.map((t, i) => `
          <li class="li">
            <div>
              <div><b>${fmt(num(t.tapVal, 0), 0)} dB</b> tap • THRU ${fmt(num(t.thruLoss, 0), 2)} dB</div>
              <small>Counts toward inline THRU total</small>
            </div>
            <div class="x" data-action="rmInline" data-index="${i}">✕</div>
          </li>
        `).join("");

        return `
          <div class="grid2">
            <div>
              <label>Inline tap value</label>
              <select id="inTapVal">${tapOpts}</select>
            </div>
            <div>
              <label>Inline tap THRU loss (dB)</label>
              <input id="inTapThru" inputmode="decimal" value="1.5">
            </div>
          </div>

          <div class="btnRow">
            <div class="btn primary" data-action="addInline">Add Inline Tap</div>
            <div class="btn danger" data-action="clrInline">Clear Inline Taps</div>
            <div class="pill">Inline THRU total: <b>${fmt(inlineThruTotal(), 2)} dB</b></div>
          </div>

          <ul class="list">${list || `<li class="li"><small>(no inline taps yet)</small></li>`}</ul>
        `;
      },
    },
    {
      title: "Current tap (target)",
      desc: "Tap value affects TAP PORT output. Tap THRU affects THRU output.",
      render: () => `
        <div class="grid2">
          <div>
            <label>Current tap value (dB)</label>
            <input id="curTapVal" inputmode="decimal" placeholder="ex: 4" value="${state.currentTapVal}">
          </div>
          <div>
            <label>Current tap THRU loss (dB)</label>
            <input id="curTapThru" inputmode="decimal" placeholder="ex: 1.5" value="${state.currentTapThru}">
          </div>
        </div>
      `,
      onNext: () => {
        state.currentTapVal = $("#curTapVal")?.value ?? "";
        state.currentTapThru = $("#curTapThru")?.value ?? "";
      },
    },
    {
      title: "Internal devices",
      desc: "Add devices inside the housing (insertion loss).",
      render: () => devicePicker("internal"),
    },
    {
      title: "Field devices",
      desc: "Add devices out in the run (insertion loss).",
      render: () => devicePicker("field"),
      nextLabel: "Results",
    },
    {
      title: "Results",
      desc: "Dual-band outputs (250 + 1000).",
      render: () => resultsView(),
      nextLabel: "Restart",
      onNext: () => { state.step = 0; },
    },
  ];

  function devicePicker(which) {
    const selected = which === "internal" ? state.internalDevices : state.fieldDevices;

    const groups = {};
    for (const name of Object.keys(DEVICES)) {
      const g = DEVICES[name].group || "Other";
      (groups[g] ||= []).push(name);
    }

    const options = Object.keys(groups).map((g) => {
      const opts = groups[g].map((n) => `<option value="${n}">${n}</option>`).join("");
      return `<optgroup label="${g}">${opts}</optgroup>`;
    }).join("");

    const list = selected.map((n, i) => `
      <li class="li">
        <div>
          <div><b>${n}</b></div>
          <small>@250: ${fmt(DEVICES[n].loss250, 2)} dB • @1000: ${fmt(DEVICES[n].loss1000, 2)} dB</small>
        </div>
        <div class="x" data-action="${which}RmDev" data-index="${i}">✕</div>
      </li>
    `).join("");

    const t250 = deviceLoss(selected, 250);
    const t1000 = deviceLoss(selected, 1000);

    return `
      <div class="grid2">
        <div>
          <label>Select device</label>
          <select id="${which}DevSel">${options}</select>
        </div>
        <div>
          <label>&nbsp;</label>
          <div class="btn primary" style="width:100%" data-action="${which}AddDev">Add</div>
        </div>
      </div>

      <div class="btnRow">
        <div class="btn danger" data-action="${which}ClrDev">Clear</div>
        <div class="pill">Total @250: <b>${fmt(t250, 2)} dB</b></div>
        <div class="pill">Total @1000: <b>${fmt(t1000, 2)} dB</b></div>
      </div>

      <ul class="list">${list || `<li class="li"><small>(none selected)</small></li>`}</ul>
    `;
  }

  function resultsView() {
    const { r250, r1000 } = computeAll();
    const whereLabel = state.readingWhere === "UPSTREAM" ? "UPSTREAM" : "AT TAP";

    const panel = (r) => `
      <div class="panel">
        <div class="pill">Band: <b>${r.band} MHz</b></div>
        <div class="hr"></div>

        <div class="kv"><div class="k">Meter used</div><div class="v">${fmt(r.meter, 2)} dBmV</div></div>
        <div class="kv"><div class="k">LEVEL @ TAP IN</div><div class="v">${fmt(r.tapIn, 2)} dBmV</div></div>
        <div class="kv"><div class="k">TAP PORT OUT</div><div class="v">${fmt(r.tapPortOut, 2)} dBmV</div></div>
        <div class="kv"><div class="k">THRU OUT</div><div class="v">${fmt(r.thruOut, 2)} dBmV</div></div>

        <div class="hr"></div>
        <div class="kv"><div class="k">Internal loss</div><div class="v">${fmt(r.breakdown.internal, 2)} dB</div></div>
        <div class="kv"><div class="k">Field loss</div><div class="v">${fmt(r.breakdown.field, 2)} dB</div></div>
        <div class="kv"><div class="k">Inline taps THRU</div><div class="v">${fmt(r.breakdown.inline, 2)} dB</div></div>
        <div class="kv"><div class="k">Cable loss</div><div class="v">${fmt(r.breakdown.cab, 2)} dB</div></div>

        <div class="hr"></div>
        <div class="tiny">
          If meter is <b>UPSTREAM</b>:<br>
          Tap In = Meter − Internal − Field − Inline THRU − Cable<br>
          Tap Port Out = Tap In − Tap Value<br>
          Thru Out = Tap In − Tap THRU
        </div>
      </div>
    `;

    return `
      <div class="pill">Meter location: <b>${whereLabel}</b></div>
      <div class="resultsGrid">
        ${panel(r250)}
        ${panel(r1000)}
      </div>
    `;
  }

  // ---------- Info Tab ----------
  function infoTabView() {
    return `
      <div class="card">
        <div class="cardHead">
          <h2>CATV Info</h2>
          <p>Quick sweep pattern definitions + standing-wave distance formula.</p>
        </div>
        <div class="cardBody">
          <div class="panel">
            <div style="margin-bottom:10px">
              <b>Humping</b>
              <div class="tiny">Signal build-up through the midband. Often caused by over-equalizing in the cascade (especially when using EQ to “fix” roll-off).</div>
            </div>
            <div style="margin-bottom:10px">
              <b>Reflections (Standing waves)</b>
              <div class="tiny">Stable repeating peaks/valleys. Typical cause: impedance mismatch somewhere (not 75Ω). Common near bidirectional test points. Use forward sweep standing-wave spacing for distance estimates.</div>
            </div>
            <div style="margin-bottom:10px">
              <b>High-end Roll-off</b>
              <div class="tiny">Response drops near upper edge. Causes: loose connectors/seizures, loose modules, amp misalignment, diplex/filter problems, bad splice/center conductor, wrong-band passives/EQ.</div>
            </div>
            <div>
              <b>Notch</b>
              <div class="tiny">Sharp deep dip. Causes: loose connectors, tap/coupler faceplate or amplifier module problems, internal RF grounding problems.</div>
            </div>
          </div>

          <div class="panel" style="margin-top:12px">
            <b>Standing-wave distance</b>
            <div class="hr"></div>
            <div class="tiny">D = distance to fault (feet), Vp = velocity of propagation (fraction of c, ~0.87 typical), F = frequency width (MHz) of one standing-wave cycle.</div>
            <div style="margin:10px 0;font-weight:900;font-size:18px">D = 492 × (Vp / F)</div>
            <div class="tiny">Use <b>149</b> instead of 492 for meters.</div>
          </div>
        </div>
      </div>
    `;
  }

  // ---------- Render ----------
  function render() {
    const step = STEPS[clamp(state.step, 0, STEPS.length - 1)];
    root.innerHTML = `
      <div class="wrap">
        <div class="topbar">
          <div class="brand">
            <h1>CATV Calc</h1>
            <div class="sub">Wizard • Dual-band (250 + 1000) • Tap THRU fixed</div>
          </div>
          <div class="tabs">
            <div class="tabbtn ${state.tab === "calc" ? "active" : ""}" data-action="tab" data-value="calc">CATV Calc</div>
            <div class="tabbtn ${state.tab === "info" ? "active" : ""}" data-action="tab" data-value="info">CATV Info</div>
            <div class="tabbtn" data-action="reset">Reset</div>
          </div>
        </div>

        <div class="content">
          ${
            state.tab === "info"
              ? infoTabView()
              : `
                <div class="card">
                  <div class="cardHead">
                    <h2>${step.title}</h2>
                    <p>${step.desc || ""}</p>
                  </div>
                  <div class="cardBody">
                    ${step.render()}

                    <div class="btnRow">
                      <div class="btn" data-action="back" ${state.step === 0 ? 'style="opacity:.55;pointer-events:none"' : ""}>Back</div>
                      <div class="btn primary" data-action="next">${step.nextLabel || "Next"}</div>
                    </div>

                    <div class="tiny" style="margin-top:12px">Step ${state.step + 1} of ${STEPS.length}</div>
                  </div>
                </div>
              `
          }
        </div>
      </div>
    `;
  }

  function resetAll() {
    state.tab = "calc";
    state.step = 0;
    state.readingWhere = "UPSTREAM";
    state.meter250 = "";
    state.meter1000 = "";
    state.segments = [];
    state.inlineTaps = [];
    state.currentTapVal = "";
    state.currentTapThru = "";
    state.internalDevices = [];
    state.fieldDevices = [];
    state.calcInputs = Array(8).fill("");
  }

  // ---------- Tap/click handling (fixes iPhone “tapping doesn’t work”) ----------
  // Use pointerup + click (some iOS Safari cases miss click on divs)
  function onAction(e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;

    const action = el.getAttribute("data-action");
    const value = el.getAttribute("data-value");
    const idx = el.getAttribute("data-index");

    switch (action) {
      case "tab":
        state.tab = value;
        render();
        break;

      case "reset":
        resetAll();
        render();
        break;

      case "back":
        state.step = Math.max(0, state.step - 1);
        render();
        break;

      case "next": {
        const step = STEPS[clamp(state.step, 0, STEPS.length - 1)];
        if (step.onNext) step.onNext();
        state.step = Math.min(STEPS.length - 1, state.step + 1);
        render();
        break;
      }

      case "setWhere":
        state.readingWhere = value;
        state.step = Math.min(STEPS.length - 1, state.step + 1); // auto-advance
        render();
        break;

      case "addSeg": {
        const cable = $("#segCable")?.value || "P3-500";
        const ft = num($("#segFt")?.value, 0);
        if (ft > 0 && CABLES[cable]) {
          state.segments.push({ cable, ft });
        }
        render();
        break;
      }

      case "rmSeg":
        state.segments.splice(num(idx, -1), 1);
        render();
        break;

      case "clrSeg":
        state.segments = [];
        render();
        break;

      case "addInline": {
        const tapVal = num($("#inTapVal")?.value, 0);
        const thruLoss = num($("#inTapThru")?.value, 1.5);
        state.inlineTaps.push({ tapVal, thruLoss });
        render();
        break;
      }

      case "rmInline":
        state.inlineTaps.splice(num(idx, -1), 1);
        render();
        break;

      case "clrInline":
        state.inlineTaps = [];
        render();
        break;

      case "internalAddDev": {
        const sel = $("#internalDevSel");
        if (sel && DEVICES[sel.value]) state.internalDevices.push(sel.value);
        render();
        break;
      }

      case "internalRmDev":
        state.internalDevices.splice(num(idx, -1), 1);
        render();
        break;

      case "internalClrDev":
        state.internalDevices = [];
        render();
        break;

      case "fieldAddDev": {
        const sel = $("#fieldDevSel");
        if (sel && DEVICES[sel.value]) state.fieldDevices.push(sel.value);
        render();
        break;
      }

      case "fieldRmDev":
        state.fieldDevices.splice(num(idx, -1), 1);
        render();
        break;

      case "fieldClrDev":
        state.fieldDevices = [];
        render();
        break;

      case "calcClr":
        state.calcInputs = Array(8).fill("");
        render();
        break;

      default:
        break;
    }
  }

  document.addEventListener("click", onAction, { passive: true });
  document.addEventListener("pointerup", onAction, { passive: true });

  // Inputs (mini-calc)
  document.addEventListener("input", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;

    if (el.getAttribute("data-action") === "calcIn") {
      const i = num(el.getAttribute("data-index"), -1);
      if (i >= 0 && i < state.calcInputs.length) {
        state.calcInputs[i] = el.value;
        const s = sum(state.calcInputs.map((x) => num(x, 0)));
        const out = $("#calcSum");
        if (out) out.textContent = fmt(s, 2);
      }
    }
  });

  // ---------- Boot ----------
  render();
})();
