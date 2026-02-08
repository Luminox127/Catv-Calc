/* CATV Calc — Tabs:
   1) CATV Calc (wizard dual-band 250+1000)
   2) CATV Info (quick reference)
   3) AC Powering (voltage drop calc)

   NOTE: No Start button. Works on iPhone.
*/

(function(){
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const STORAGE_KEY = "catv_calc_v3_state";

  // -----------------------------
  // RF Data
  // -----------------------------
  const CABLES = [
    { id:"RG59",  name:"RG59",  loss250:4.10, loss1000:8.12 },
    { id:"RG6",   name:"RG6",   loss250:3.30, loss1000:6.55 },
    { id:"RG11",  name:"RG11",  loss250:2.05, loss1000:4.35 },
    { id:"QR540", name:"QR540", loss250:1.03, loss1000:2.17 },
    { id:"P3-500", name:"P3-500", loss250:1.20, loss1000:2.52 },
    { id:"P3-625", name:"P3-625", loss250:1.00, loss1000:2.07 },
    { id:"P3-750", name:"P3-750", loss250:0.81, loss1000:1.74 },
    { id:"P3-875", name:"P3-875", loss250:0.72, loss1000:1.53 },
  ];

  const INTERNAL_DEVICES = [
    { id:"none", name:"(none)", loss:0 },
    { id:"int_2w", name:"Internal 2-way splitter", loss:3.5 },
    { id:"int_dc8", name:"Internal DC-8", loss:8.0 },
    { id:"int_dc12", name:"Internal DC-12", loss:12.0 },
  ];

  const FIELD_DEVICES = [
    { id:"none", name:"(none)", loss:0 },
    { id:"2w", name:"2-way splitter", loss:3.5 },
    { id:"3w_bal", name:"3-way balanced splitter", loss:5.5 },
    { id:"636", name:"3-way (6/3/6)", loss:6.0 },
    { id:"dc9", name:"Directional coupler DC-9", loss:9.0 },
    { id:"dc12", name:"Directional coupler DC-12", loss:12.0 },
    { id:"pwr_ins", name:"Power inserter (insertion)", loss:1.0 },
  ];

  const THRU_LOSS_OPTIONS = [0.8, 1.0, 1.2, 1.5, 1.8, 2.0, 2.4, 2.7, 3.0, 3.3];
  const TAP_VALUES = [4, 8, 11, 14, 17, 20, 23, 26, 29];

  // -----------------------------
  // AC Powering Data
  // -----------------------------
  // These are reasonable *typical* values used for estimating AC drop.
  // If you have your company chart, we can swap in exact numbers.
  //
  // The math uses: Vdrop = (amps) * (ohms_per_1000ft) * (feet/1000)
  // You can adjust ohms_per_1000ft anytime.
  const AC_CABLES = [
    { id:"0.500", name:".500", ohm_per_1000ft: 1.62 },
    { id:"0.625", name:".625", ohm_per_1000ft: 1.02 },
    { id:"0.750", name:".750", ohm_per_1000ft: 0.67 },
    { id:"0.875", name:".875", ohm_per_1000ft: 0.50 },
  ];

  // -----------------------------
  // State
  // -----------------------------
  const defaultState = {
    tab: "calc", // calc | info | ac

    // CALC (wizard)
    step: 0,
    meterLocation: "AT_TAP", // AT_TAP | UPSTREAM
    meter250: "",
    meter1000: "",
    segments: [],
    inlineTaps: [],
    currentTapValue: 4,
    currentTapThruLoss: 1.5,
    internalDeviceId: "none",
    fieldDeviceId: "none",

    // INFO tab (static)

    // AC tab
    acStartVolts: "90",
    acAmps: "4",
    acSegments: [
      // { sizeId:"0.625", feet: 500 }
    ],
  };

  let state = loadState();

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return structuredClone(defaultState);
      const parsed = JSON.parse(raw);
      return { ...structuredClone(defaultState), ...parsed };
    } catch {
      return structuredClone(defaultState);
    }
  }

  function saveState(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function resetAll(){
    state = structuredClone(defaultState);
    saveState();
    render();
  }

  // -----------------------------
  // Helpers
  // -----------------------------
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const sum = (arr)=>arr.reduce((a,b)=>a+b,0);

  function getDeviceLoss(list, id){
    const d = list.find(x=>x.id===id);
    return d ? Number(d.loss||0) : 0;
  }

  function inlineThruTotal(){
    return sum(state.inlineTaps.map(t => Number(t.thruLoss || 0)));
  }

  function cableLossForSegmentsAt(freq){
    let total = 0;
    for(const seg of state.segments){
      const cable = CABLES.find(c=>c.id===seg.cableId);
      if(!cable) continue;
      const feet = Math.max(0, Number(seg.feet || 0));
      const per100 = (freq===250) ? cable.loss250 : cable.loss1000;
      total += (feet/100) * per100;
    }
    return total;
  }

  function classifyLevel(dbmv){
    if(dbmv == null) return "warn";
    if(dbmv >= 0 && dbmv <= 15) return "good";
    if(dbmv > 15 && dbmv <= 25) return "warn";
    if(dbmv < 0) return "bad";
    return "warn";
  }

  function fmt(x){
    if(x == null || !Number.isFinite(Number(x))) return "—";
    return Number(x).toFixed(2);
  }

  function escapeHtml(str){
    return String(str ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;");
  }

  // -----------------------------
  // RF Results
  // -----------------------------
  function computeResults(){
    const m250 = num(state.meter250);
    const m1000 = num(state.meter1000);

    const cable250 = cableLossForSegmentsAt(250);
    const cable1000 = cableLossForSegmentsAt(1000);

    const inlineThru = inlineThruTotal();
    const internalLoss = getDeviceLoss(INTERNAL_DEVICES, state.internalDeviceId);
    const fieldLoss = getDeviceLoss(FIELD_DEVICES, state.fieldDeviceId);

    const thruPathLoss250 = cable250 + inlineThru + internalLoss + fieldLoss;
    const thruPathLoss1000 = cable1000 + inlineThru + internalLoss + fieldLoss;

    const tapVal = Number(state.currentTapValue || 0);
    const tapThru = Number(state.currentTapThruLoss || 0);

    function calcFor(freq, meter, thruPathLoss){
      if(meter == null) return null;

      let levelAtTapIn, tapPortOut, thruOutAtTap, upstreamEquivalent;

      if(state.meterLocation === "UPSTREAM"){
        upstreamEquivalent = meter;
        levelAtTapIn = meter - thruPathLoss;
        tapPortOut = levelAtTapIn - tapVal;
        thruOutAtTap = levelAtTapIn - tapThru;
      } else {
        tapPortOut = meter;
        levelAtTapIn = meter + tapVal;
        thruOutAtTap = levelAtTapIn - tapThru;
        upstreamEquivalent = levelAtTapIn + thruPathLoss;
      }

      return { freq, meter, upstreamEquivalent, levelAtTapIn, tapPortOut, thruOutAtTap, thruPathLoss };
    }

    return {
      r250: calcFor(250, m250, thruPathLoss250),
      r1000: calcFor(1000, m1000, thruPathLoss1000),
      cable250, cable1000, inlineThru, internalLoss, fieldLoss, tapVal, tapThru,
      segmentsCount: state.segments.length,
      inlineCount: state.inlineTaps.length,
    };
  }

  // -----------------------------
  // AC Results
  // -----------------------------
  function acTotalFeet(){
    return sum(state.acSegments.map(s=>Number(s.feet||0)));
  }

  function acSegmentVdrop(seg, amps){
    const cable = AC_CABLES.find(c=>c.id===seg.sizeId);
    if(!cable) return 0;
    const feet = Math.max(0, Number(seg.feet || 0));
    const ohms = cable.ohm_per_1000ft * (feet/1000);
    return amps * ohms; // V = I*R
  }

  function acCompute(){
    const startV = num(state.acStartVolts);
    const amps = num(state.acAmps);
    if(startV == null || amps == null) return null;

    const drops = state.acSegments.map(seg => acSegmentVdrop(seg, amps));
    const totalDrop = sum(drops);
    const endV = startV - totalDrop;

    return { startV, amps, drops, totalDrop, endV };
  }

  // -----------------------------
  // Wizard Steps
  // -----------------------------
  const STEPS = [
    { key:"A", title:"Meter location", subtitle:"Where was your meter reading taken?" },
    { key:"B", title:"Meter readings", subtitle:"Enter readings for 250 MHz and 1000 MHz." },
    { key:"C", title:"Cable segments", subtitle:"Build the run using segments (cable type + feet)." },
    { key:"D", title:"Inline taps", subtitle:"Add taps that are in the way (THRU loss counts on thru path)." },
    { key:"E", title:"Current tap", subtitle:"Pick the tap you care about right now." },
    { key:"F", title:"Devices", subtitle:"Add internal + field devices (simple insertion loss)." },
    { key:"G", title:"Results", subtitle:"Dual-band results (250 + 1000) side-by-side." },
  ];

  function setStep(i){
    state.step = Math.max(0, Math.min(STEPS.length-1, i));
    saveState();
    render();
  }
  function nextStep(){ setStep(state.step+1); }
  function prevStep(){ setStep(state.step-1); }

  function setTab(tab){
    state.tab = tab;
    saveState();
    render();
  }

  // -----------------------------
  // Render
  // -----------------------------
  function render(){
    const root = $("#app");
    root.innerHTML = "";

    const shell = document.createElement("div");
    shell.className = "shell";

    shell.appendChild(renderTopbar());

    if(state.tab === "info"){
      shell.appendChild(renderInfoTab());
      root.appendChild(shell);
      bindHandlers();
      return;
    }

    if(state.tab === "ac"){
      shell.appendChild(renderAcTab());
      root.appendChild(shell);
      bindHandlers();
      return;
    }

    // calc tab
    shell.appendChild(renderStepper());
    shell.appendChild(renderCalcCard());
    root.appendChild(shell);
    bindHandlers();
  }

  function renderTopbar(){
    const bar = document.createElement("div");
    bar.className = "topbar";

    const left = document.createElement("div");
    left.className = "brand";
    left.innerHTML = `
      <div class="title">CATV Calc</div>
      <div class="sub">Calc • Info • AC Powering</div>
    `;

    const right = document.createElement("div");
    right.className = "tabs";
    right.innerHTML = `
      <button class="pill ${state.tab==="calc"?"active":""}" data-tab="calc">CATV Calc</button>
      <button class="pill ${state.tab==="info"?"active":""}" data-tab="info">CATV Info</button>
      <button class="pill ${state.tab==="ac"?"active":""}" data-tab="ac">AC Powering</button>
      <button class="btn danger" data-action="resetAll">Reset</button>
    `;

    bar.appendChild(left);
    bar.appendChild(right);
    return bar;
  }

  function renderStepper(){
    const wrap = document.createElement("div");
    wrap.className = "card";
    const s = STEPS[state.step];
    const pct = Math.round((state.step/(STEPS.length-1))*100);

    wrap.innerHTML = `
      <div class="hd">
        <div class="h1">Step ${s.key}: ${s.title}</div>
        <div class="h2">${s.subtitle} • ${pct}%</div>
      </div>
      <div class="bd">
        <div class="resBox">
          <div class="k">Progress</div>
          <div class="v">${pct}%</div>
        </div>
      </div>
    `;
    return wrap;
  }

  function renderCalcCard(){
    const card = document.createElement("div");
    card.className = "card";
    const s = STEPS[state.step];

    const body = document.createElement("div");
    body.className = "bd";

    if(s.key==="A") body.appendChild(stepA());
    if(s.key==="B") body.appendChild(stepB());
    if(s.key==="C") body.appendChild(stepC());
    if(s.key==="D") body.appendChild(stepD());
    if(s.key==="E") body.appendChild(stepE());
    if(s.key==="F") body.appendChild(stepF());
    if(s.key==="G") body.appendChild(stepG());

    const footer = document.createElement("div");
    footer.className = "bd";
    footer.innerHTML = `
      <div class="row tight" style="justify-content:space-between">
        <button class="btn ghost" data-action="prev" ${state.step===0?"disabled":""}>Back</button>
        ${state.step < STEPS.length-1
          ? `<button class="btn primary" data-action="next">Next</button>`
          : `<button class="btn primary" data-action="copyResults">Copy Results</button>`
        }
      </div>
    `;

    card.innerHTML = `
      <div class="hd">
        <div class="h1">${s.title}</div>
        <div class="h2">${s.subtitle}</div>
      </div>
    `;
    card.appendChild(body);
    card.appendChild(document.createElement("div")).className="hr";
    card.appendChild(footer);
    return card;
  }

  // ---- Calc Steps ----
  function stepA(){
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="row">
        <button class="btn ${state.meterLocation==="AT_TAP"?"primary":""}" data-set="meterLocation" data-val="AT_TAP">
          AT TAP (local)
        </button>
        <button class="btn ${state.meterLocation==="UPSTREAM"?"primary":""}" data-set="meterLocation" data-val="UPSTREAM">
          UPSTREAM (before run)
        </button>
      </div>
      <div class="small" style="margin-top:8px">
        AT TAP assumes your reading is the <b>tap port output</b>.
        UPSTREAM assumes your reading is <b>before</b> cable + inline losses.
      </div>
    `;
    return wrap;
  }

  function stepB(){
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="row">
        <div class="field">
          <label>Meter @ 250 MHz (dBmV)</label>
          <input inputmode="decimal" type="text" id="meter250" placeholder="ex: 34.5" value="${escapeHtml(state.meter250)}">
        </div>
        <div class="field">
          <label>Meter @ 1000 MHz (dBmV)</label>
          <input inputmode="decimal" type="text" id="meter1000" placeholder="ex: 41" value="${escapeHtml(state.meter1000)}">
        </div>
      </div>
    `;
    return wrap;
  }

  function stepC(){
    const wrap = document.createElement("div");

    const list = document.createElement("div");
    list.className = "list";
    if(state.segments.length === 0){
      list.innerHTML = `<div class="item"><div class="left"><div class="name">(no segments yet)</div><div class="meta">Add segments below</div></div></div>`;
    } else {
      list.innerHTML = state.segments.map((seg, idx)=>{
        const c = CABLES.find(x=>x.id===seg.cableId);
        return `
          <div class="item">
            <div class="left">
              <div class="name">${c?c.name:"?"} • ${Number(seg.feet||0)} ft</div>
              <div class="meta">/100ft @250=${c?c.loss250:"?"} • @1000=${c?c.loss1000:"?"}</div>
            </div>
            <div class="row tight">
              <button class="btn" data-action="editSeg" data-idx="${idx}">Edit</button>
              <button class="btn danger" data-action="delSeg" data-idx="${idx}">Remove</button>
            </div>
          </div>
        `;
      }).join("");
    }

    const totals = `
      <div class="row" style="margin-top:12px">
        <div class="resBox">
          <div class="k">Cable loss total @250</div>
          <div class="v">${fmt(cableLossForSegmentsAt(250))} dB</div>
        </div>
        <div class="resBox">
          <div class="k">Cable loss total @1000</div>
          <div class="v">${fmt(cableLossForSegmentsAt(1000))} dB</div>
        </div>
      </div>
    `;

    const addBox = document.createElement("div");
    addBox.innerHTML = `
      <div class="hr"></div>
      <div class="row">
        <div class="field">
          <label>Cable type</label>
          <select id="newCable">
            ${CABLES.map(c=>`<option value="${c.id}">${c.name}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Feet</label>
          <input id="newFeet" inputmode="numeric" type="text" placeholder="ex: 814">
        </div>
      </div>
      <div class="row tight">
        <button class="btn primary" data-action="addSeg">Add Segment</button>
        <button class="btn" data-action="clearSegs">Clear Segments</button>
      </div>
      ${totals}
    `;

    wrap.appendChild(list);
    wrap.appendChild(addBox);
    return wrap;
  }

  function stepD(){
    const wrap = document.createElement("div");

    const list = document.createElement("div");
    list.className = "list";
    if(state.inlineTaps.length === 0){
      list.innerHTML = `<div class="item"><div class="left"><div class="name">(no inline taps)</div><div class="meta">Add inline taps that are in the way</div></div></div>`;
    } else {
      list.innerHTML = state.inlineTaps.map((t, idx)=>`
        <div class="item">
          <div class="left">
            <div class="name">${t.tapValue} dB tap</div>
            <div class="meta">THRU loss: ${fmt(t.thruLoss)} dB</div>
          </div>
          <div class="row tight">
            <button class="btn danger" data-action="delInline" data-idx="${idx}">Remove</button>
          </div>
        </div>
      `).join("");
    }

    const addBox = document.createElement("div");
    addBox.innerHTML = `
      <div class="hr"></div>
      <div class="row">
        <div class="field">
          <label>Inline tap value (dB)</label>
          <select id="newInlineTapVal">
            ${TAP_VALUES.map(v=>`<option value="${v}">${v}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Inline tap THRU loss (dB)</label>
          <select id="newInlineThru">
            ${THRU_LOSS_OPTIONS.map(v=>`<option value="${v}">${v}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="row tight">
        <button class="btn primary" data-action="addInline">Add Inline Tap</button>
        <button class="btn" data-action="clearInline">Clear Inline Taps</button>
      </div>

      <div class="row" style="margin-top:12px">
        <div class="resBox">
          <div class="k">Inline taps THRU total</div>
          <div class="v">${fmt(inlineThruTotal())} dB</div>
        </div>
      </div>
    `;

    wrap.appendChild(list);
    wrap.appendChild(addBox);
    return wrap;
  }

  function stepE(){
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="row">
        <div class="field">
          <label>Current tap value (dB)</label>
          <select id="currentTapValue">
            ${TAP_VALUES.map(v=>`<option value="${v}" ${Number(state.currentTapValue)===v?"selected":""}>${v}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Current tap THRU loss (dB)</label>
          <select id="currentTapThruLoss">
            ${THRU_LOSS_OPTIONS.map(v=>`<option value="${v}" ${Number(state.currentTapThruLoss)===v?"selected":""}>${v}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="small">
        Tap port output = <b>Level at tap IN</b> − <b>Tap value</b><br>
        THRU output at tap = <b>Level at tap IN</b> − <b>Tap THRU loss</b>
      </div>
    `;
    return wrap;
  }

  function stepF(){
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="row">
        <div class="field">
          <label>Internal device</label>
          <select id="internalDevice">
            ${INTERNAL_DEVICES.map(d=>`<option value="${d.id}" ${state.internalDeviceId===d.id?"selected":""}>${d.name} (${fmt(d.loss)} dB)</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Field device</label>
          <select id="fieldDevice">
            ${FIELD_DEVICES.map(d=>`<option value="${d.id}" ${state.fieldDeviceId===d.id?"selected":""}>${d.name} (${fmt(d.loss)} dB)</option>`).join("")}
          </select>
        </div>
      </div>
    `;
    return wrap;
  }

  function stepG(){
    const res = computeResults();

    const wrap = document.createElement("div");
    wrap.className = "grid two";

    wrap.appendChild(bandCard("250 MHz", res.r250));
    wrap.appendChild(bandCard("1000 MHz", res.r1000));

    const breakdown = document.createElement("div");
    breakdown.className = "card";
    breakdown.innerHTML = `
      <div class="hd">
        <div class="h1">Loss breakdown</div>
        <div class="h2">Thru path losses + current tap info</div>
      </div>
      <div class="bd">
        <table class="table">
          <tr><th>Item</th><th>Value</th></tr>
          <tr><td>Segments</td><td>${res.segmentsCount}</td></tr>
          <tr><td>Inline taps THRU total</td><td>${fmt(res.inlineThru)} dB</td></tr>
          <tr><td>Internal device loss</td><td>${fmt(res.internalLoss)} dB</td></tr>
          <tr><td>Field device loss</td><td>${fmt(res.fieldLoss)} dB</td></tr>
          <tr><td>Current tap value</td><td>${fmt(res.tapVal)} dB</td></tr>
          <tr><td>Current tap THRU loss</td><td>${fmt(res.tapThru)} dB</td></tr>
          <tr><td>Cable loss @250</td><td>${fmt(res.cable250)} dB</td></tr>
          <tr><td>Cable loss @1000</td><td>${fmt(res.cable1000)} dB</td></tr>
        </table>
      </div>
    `;

    wrap.appendChild(breakdown);
    return wrap;
  }

  function bandCard(title, r){
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="hd">
        <div class="h1">Results • ${title}</div>
        <div class="h2">${state.meterLocation==="UPSTREAM" ? "Meter = upstream before losses" : "Meter = tap port output"}</div>
      </div>
      <div class="bd">
        ${renderBand(r)}
      </div>
    `;
    return card;
  }

  function renderBand(r){
    if(!r) return `<div class="small">Enter meter readings first.</div>`;
    const cls = classifyLevel(r.tapPortOut);
    return `
      <div class="row">
        <div class="resBox">
          <div class="k">Level at tap IN</div>
          <div class="v">${fmt(r.levelAtTapIn)} dBmV</div>
        </div>
        <div class="resBox">
          <div class="k">Tap port output</div>
          <div class="v ${cls}">${fmt(r.tapPortOut)} dBmV</div>
        </div>
      </div>

      <div class="row" style="margin-top:10px">
        <div class="resBox">
          <div class="k">THRU output at tap</div>
          <div class="v">${fmt(r.thruOutAtTap)} dBmV</div>
        </div>
        <div class="resBox">
          <div class="k">Upstream equivalent</div>
          <div class="v">${fmt(r.upstreamEquivalent)} dBmV</div>
        </div>
      </div>

      <div class="row" style="margin-top:10px">
        <div class="resBox">
          <div class="k">Thru-path loss (to current tap)</div>
          <div class="v">${fmt(r.thruPathLoss)} dB</div>
        </div>
        <div class="resBox">
          <div class="k">Meter used</div>
          <div class="v">${fmt(r.meter)} dBmV</div>
        </div>
      </div>
    `;
  }

  // ---- Info Tab ----
  function renderInfoTab(){
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="hd">
        <div class="h1">CATV Info</div>
        <div class="h2">Quick troubleshooting patterns + formulas</div>
      </div>
      <div class="bd">
        <div class="resBox">
          <div class="k">Humping</div>
          <div class="small">Midband build-up. Often from over-equalizing amps in cascade.</div>
        </div>
        <div class="resBox" style="margin-top:10px">
          <div class="k">Reflections (standing waves)</div>
          <div class="small">Symmetrical peaks/valleys. Usually impedance mismatch (not 75Ω).</div>
        </div>
        <div class="resBox" style="margin-top:10px">
          <div class="k">High-end roll-off</div>
          <div class="small">Drop near upper band edge. Causes: loose connectors, modules, diplex, bad splices, wrong passives.</div>
        </div>
        <div class="resBox" style="margin-top:10px">
          <div class="k">Notch</div>
          <div class="small">Sharp negative dip. Causes: loose connectors, bad faceplates, amp module, grounding.</div>
        </div>
        <div class="resBox" style="margin-top:10px">
          <div class="k">Distance-to-fault (standing waves)</div>
          <div class="small"><b>D = 492 × (V<sub>p</sub> / F)</b> • Use 149 for meters.</div>
        </div>
      </div>
    `;
    return card;
  }

  // ---- AC Tab ----
  function renderAcTab(){
    const res = acCompute();

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="hd">
        <div class="h1">AC Powering</div>
        <div class="h2">Voltage drop estimate (choose cable size + feet, enter amps)</div>
      </div>
      <div class="bd">
        <div class="row">
          <div class="field">
            <label>Start voltage (VAC)</label>
            <input id="acStartVolts" inputmode="decimal" type="text" placeholder="ex: 90" value="${escapeHtml(state.acStartVolts)}">
          </div>
          <div class="field">
            <label>Load current (amps)</label>
            <input id="acAmps" inputmode="decimal" type="text" placeholder="ex: 4" value="${escapeHtml(state.acAmps)}">
          </div>
        </div>

        <div class="list" id="acList">
          ${renderAcSegmentsList()}
        </div>

        <div class="hr"></div>

        <div class="row">
          <div class="field">
            <label>Cable size</label>
            <select id="acNewSize">
              ${AC_CABLES.map(c=>`<option value="${c.id}">${c.name}</option>`).join("")}
            </select>
            <div class="small">Uses typical Ω/1000ft model</div>
          </div>
          <div class="field">
            <label>Feet</label>
            <input id="acNewFeet" inputmode="numeric" type="text" placeholder="ex: 1200">
          </div>
        </div>

        <div class="row tight">
          <button class="btn primary" data-action="acAddSeg">Add Segment</button>
          <button class="btn" data-action="acClearSegs">Clear</button>
        </div>

        <div class="hr"></div>

        <div class="row">
          <div class="resBox">
            <div class="k">Total feet</div>
            <div class="v">${fmt(acTotalFeet())} ft</div>
          </div>
          <div class="resBox">
            <div class="k">Total V drop</div>
            <div class="v ${res ? (res.totalDrop>10 ? "warn" : "good") : ""}">${res ? fmt(res.totalDrop) : "—"} V</div>
          </div>
          <div class="resBox">
            <div class="k">End voltage</div>
            <div class="v ${res ? (res.endV<60 ? "bad" : "good") : ""}">${res ? fmt(res.endV) : "—"} VAC</div>
          </div>
        </div>

        <div class="small" style="margin-top:10px">
          Formula: Vdrop = I × R, where R = (Ω/1000ft) × (ft/1000).<br>
          If you want, we can add a “min voltage” warning for 60/65/70 VAC.
        </div>
      </div>
    `;
    return card;
  }

  function renderAcSegmentsList(){
    if(state.acSegments.length === 0){
      return `<div class="item"><div class="left"><div class="name">(no AC segments yet)</div><div class="meta">Add segments below</div></div></div>`;
    }

    const amps = num(state.acAmps) ?? 0;

    return state.acSegments.map((seg, idx)=>{
      const c = AC_CABLES.find(x=>x.id===seg.sizeId);
      const feet = Number(seg.feet||0);
      const drop = acSegmentVdrop(seg, amps);
      return `
        <div class="item">
          <div class="left">
            <div class="name">${c?c.name:"?"} • ${feet} ft</div>
            <div class="meta">Drop @ ${amps}A: ${fmt(drop)} V</div>
          </div>
          <div class="row tight">
            <button class="btn" data-action="acEditSeg" data-idx="${idx}">Edit</button>
            <button class="btn danger" data-action="acDelSeg" data-idx="${idx}">Remove</button>
          </div>
        </div>
      `;
    }).join("");
  }

  // -----------------------------
  // Bind events
  // -----------------------------
  function bindHandlers(){
    // tabs
    $$("[data-tab]").forEach(b=>{
      b.addEventListener("click", ()=>setTab(b.getAttribute("data-tab")));
    });

    // reset
    const resetBtn = $("[data-action='resetAll']");
    if(resetBtn) resetBtn.addEventListener("click", resetAll);

    // wizard nav
    const prevBtn = $("[data-action='prev']");
    const nextBtn = $("[data-action='next']");
    if(prevBtn) prevBtn.addEventListener("click", prevStep);
    if(nextBtn) nextBtn.addEventListener("click", nextStep);

    const copyBtn = $("[data-action='copyResults']");
    if(copyBtn) copyBtn.addEventListener("click", copyResultsToClipboard);

    // step A
    $$("[data-set='meterLocation']").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        state.meterLocation = btn.getAttribute("data-val");
        saveState(); render();
      });
    });

    // step B
    const m250 = $("#meter250");
    const m1000 = $("#meter1000");
    if(m250) m250.addEventListener("input", (e)=>{ state.meter250 = e.target.value; saveState(); });
    if(m1000) m1000.addEventListener("input", (e)=>{ state.meter1000 = e.target.value; saveState(); });

    // step C segments
    const addSeg = $("[data-action='addSeg']");
    if(addSeg){
      addSeg.addEventListener("click", ()=>{
        const cableId = $("#newCable").value;
        const feet = Number(($("#newFeet").value||"").trim());
        if(!Number.isFinite(feet) || feet<=0) return alert("Enter valid feet.");
        state.segments.push({ cableId, feet });
        $("#newFeet").value = "";
        saveState(); render();
      });
    }
    const clearSegs = $("[data-action='clearSegs']");
    if(clearSegs){
      clearSegs.addEventListener("click", ()=>{
        state.segments = [];
        saveState(); render();
      });
    }
    $$("[data-action='delSeg']").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const idx = Number(btn.getAttribute("data-idx"));
        state.segments.splice(idx,1);
        saveState(); render();
      });
    });
    $$("[data-action='editSeg']").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const idx = Number(btn.getAttribute("data-idx"));
        const seg = state.segments[idx];
        if(!seg) return;
        const newFeet = prompt("Feet for this segment:", String(seg.feet));
        if(newFeet===null) return;
        const feet = Number(newFeet);
        if(!Number.isFinite(feet) || feet<=0) return alert("Invalid feet.");
        seg.feet = feet;
        saveState(); render();
      });
    });

    // step D inline taps
    const addInline = $("[data-action='addInline']");
    if(addInline){
      addInline.addEventListener("click", ()=>{
        const tapValue = Number($("#newInlineTapVal").value);
        const thruLoss = Number($("#newInlineThru").value);
        state.inlineTaps.push({ tapValue, thruLoss });
        saveState(); render();
      });
    }
    const clearInline = $("[data-action='clearInline']");
    if(clearInline){
      clearInline.addEventListener("click", ()=>{
        state.inlineTaps = [];
        saveState(); render();
      });
    }
    $$("[data-action='delInline']").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const idx = Number(btn.getAttribute("data-idx"));
        state.inlineTaps.splice(idx,1);
        saveState(); render();
      });
    });

    // step E
    const ctv = $("#currentTapValue");
    const ctl = $("#currentTapThruLoss");
    if(ctv) ctv.addEventListener("change", ()=>{ state.currentTapValue = Number(ctv.value); saveState(); });
    if(ctl) ctl.addEventListener("change", ()=>{ state.currentTapThruLoss = Number(ctl.value); saveState(); });

    // step F
    const intDev = $("#internalDevice");
    const fldDev = $("#fieldDevice");
    if(intDev) intDev.addEventListener("change", ()=>{ state.internalDeviceId = intDev.value; saveState(); });
    if(fldDev) fldDev.addEventListener("change", ()=>{ state.fieldDeviceId = fldDev.value; saveState(); });

    // AC tab inputs
    const acStart = $("#acStartVolts");
    const acAmps = $("#acAmps");
    if(acStart) acStart.addEventListener("input", (e)=>{ state.acStartVolts = e.target.value; saveState(); render(); });
    if(acAmps) acAmps.addEventListener("input", (e)=>{ state.acAmps = e.target.value; saveState(); render(); });

    const acAdd = $("[data-action='acAddSeg']");
    if(acAdd){
      acAdd.addEventListener("click", ()=>{
        const sizeId = $("#acNewSize").value;
        const feet = Number(($("#acNewFeet").value||"").trim());
        if(!Number.isFinite(feet) || feet<=0) return alert("Enter valid feet.");
        state.acSegments.push({ sizeId, feet });
        $("#acNewFeet").value = "";
        saveState(); render();
      });
    }

    const acClear = $("[data-action='acClearSegs']");
    if(acClear){
      acClear.addEventListener("click", ()=>{
        state.acSegments = [];
        saveState(); render();
      });
    }

    $$("[data-action='acDelSeg']").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const idx = Number(btn.getAttribute("data-idx"));
        state.acSegments.splice(idx,1);
        saveState(); render();
      });
    });

    $$("[data-action='acEditSeg']").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const idx = Number(btn.getAttribute("data-idx"));
        const seg = state.acSegments[idx];
        if(!seg) return;
        const newFeet = prompt("Feet for this AC segment:", String(seg.feet));
        if(newFeet===null) return;
        const feet = Number(newFeet);
        if(!Number.isFinite(feet) || feet<=0) return alert("Invalid feet.");
        seg.feet = feet;
        saveState(); render();
      });
    });
  }

  function copyResultsToClipboard(){
    const res = computeResults();
    const lines = [];
    lines.push("CATV Calc Results");
    lines.push(`Meter location: ${state.meterLocation}`);
    lines.push(`Meter @250: ${state.meter250}`);
    lines.push(`Meter @1000: ${state.meter1000}`);
    lines.push("");

    for(const r of [res.r250, res.r1000]){
      if(!r) continue;
      lines.push(`=== ${r.freq} MHz ===`);
      lines.push(`Level at tap IN: ${fmt(r.levelAtTapIn)} dBmV`);
      lines.push(`Tap port output: ${fmt(r.tapPortOut)} dBmV`);
      lines.push(`THRU output at tap: ${fmt(r.thruOutAtTap)} dBmV`);
      lines.push(`Thru-path loss: ${fmt(r.thruPathLoss)} dB`);
      lines.push(`Upstream equivalent: ${fmt(r.upstreamEquivalent)} dBmV`);
      lines.push("");
    }

    const text = lines.join("\n");
    navigator.clipboard?.writeText(text)
      .then(()=>alert("Copied!"))
      .catch(()=>prompt("Copy manually:", text));
  }

  // Start app
  render();

})();
