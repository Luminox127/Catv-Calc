// ============================================================
// FVG INDUSTRIES (TM) - CATV CALC TERMINAL (Questionnaire)
// - Boot + iPhone-safe startup chirp (plays on START tap)
// - Mixed cable segments
// - Inline taps with correct THRU subtraction + tap port outputs
// - Internal + Field device stacks
// - PWA ready + offline cache (sw.js)
// ============================================================

const out = document.getElementById("out");
const inp = document.getElementById("in");
const quick = document.getElementById("quick");
const stepHint = document.getElementById("stepHint");

const boot = document.getElementById("boot");
const bootText = document.getElementById("bootText");
const bootBtn = document.getElementById("bootBtn");

const backBtn = document.getElementById("backBtn");
const resetBtn = document.getElementById("resetBtn");
const runBtn = document.getElementById("runBtn");
const copyBtn = document.getElementById("copyBtn");

const STORAGE_KEY = "catv_terminal_state_v1";

// ---- Loss tables (dB per 100ft) for only the freqs we use now (250 & 1000) ----
const LOSS_PER_100FT = {
  "RG59":   {250: 4.10, 1000: 8.12},
  "RG6":    {250: 3.30, 1000: 6.55},
  "RG11":   {250: 2.05, 1000: 4.35},
  "QR540":  {250: 1.03, 1000: 2.17},
  "P3-500": {250: 1.20, 1000: 2.52},
  "P3-625": {250: 1.00, 1000: 2.07},
  "P3-750": {250: 0.81, 1000: 1.74},
  "P3-875": {250: 0.72, 1000: 1.53},

  // aliases
  ".500":   {250: 1.20, 1000: 2.52},
  ".625":   {250: 1.00, 1000: 2.07},
  ".750":   {250: 0.81, 1000: 1.74},
  ".875":   {250: 0.72, 1000: 1.53},
};

// Default THRU by tap value (you can edit anytime)
const DEFAULT_TAP_THRU = {
  4: 1.2, 8: 1.4, 11: 1.5, 14: 1.6, 17: 1.7, 20: 1.8, 23: 1.9, 26: 2.0, 29: 2.1,
};

// Internal (minibridger) allowed
const INTERNAL_DEVICES = [
  {name:"2-way splitter", loss:3.5},
  {name:"DC-8", loss:8.0},
  {name:"DC-12", loss:12.0},
];

// Field devices allowed
const FIELD_DEVICES = [
  {name:"2-way splitter", loss:3.5},
  {name:"2-way balanced", loss:3.5},
  {name:"3-way splitter (636)", loss:5.5},
  {name:"DC-9", loss:9.0},
  {name:"DC-12", loss:12.0},
];

function f2(x){ return Number.isFinite(x) ? x.toFixed(2) : "0.00"; }
function n(x, fallback=0){
  const v = parseFloat(String(x).trim());
  return Number.isFinite(v) ? v : fallback;
}
function freqFromBand(band){ return band === "HIGH" ? 1000 : 250; }

function print(line=""){
  out.textContent += line + "\n";
  out.scrollTop = out.scrollHeight;
}
function clearScreen(){
  out.textContent = "";
}

function setQuickButtons(buttons){
  quick.innerHTML = "";
  (buttons || []).forEach(b => {
    const btn = document.createElement("button");
    btn.className = "qbtn";
    btn.textContent = b.label;
    btn.addEventListener("click", () => handleAnswer(b.value));
    quick.appendChild(btn);
  });
}

function setHint(txt){ stepHint.textContent = txt || ""; }

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try{
    const s = JSON.parse(raw);
    state = {...state, ...s};
  }catch{}
}

function resetState(){
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  clearScreen();
  printHeader();
  goToStep(0);
}

// ---- Core math helpers ----
function cableLossForSegment(seg, freq){
  const row = LOSS_PER_100FT[seg.cable];
  if (!row) return 0;
  const per100 = row[freq];
  if (!Number.isFinite(per100)) return 0;
  return per100 * (seg.ft / 100.0);
}
function totalCableLoss(freq){
  return state.segments.reduce((sum, s) => sum + cableLossForSegment(s, freq), 0);
}
function totalDeviceLoss(list){
  return list.reduce((sum, d) => sum + (d.loss || 0), 0);
}
function totalInlineThruLoss(){
  return state.inlineTaps.reduce((sum, t) => sum + (t.thru || 0), 0);
}

// ---- Questionnaire state ----
function defaultState(){
  return {
    step: 0,

    // config
    band: "LOW",                 // LOW=250, HIGH=1000
    mode: "AT_TAP",              // AT_TAP or UPSTREAM

    meter250: 34.5,
    meter1000: 41.0,
    pad: 20.0,
    padComp: false,              // if true, do NOT subtract pad

    // build
    segments: [],                // [{cable, ft}]
    inlineTaps: [],              // [{value, thru}]
    internal: [],                // [{name, loss}]
    field: [],                   // [{name, loss}]

    // current tap
    currentTapValue: 4,
    currentTapThru: 1.5,
    currentTapThruAuto: true,
  };
}

let state = defaultState();

// ---- Steps definition ----
const steps = [
  {
    title: "SELECT BAND (FREQUENCY)",
    hint: "LOW = 250 MHz, HIGH = 1000 MHz.",
    buttons: [
      {label:"LOW (250)", value:"LOW"},
      {label:"HIGH (1000)", value:"HIGH"}
    ],
    ask: () => print("> Select band: LOW or HIGH"),
    validate: (ans) => ["LOW","HIGH"].includes(ans),
    apply: (ans) => { state.band = ans; }
  },

  {
    title: "SELECT MODE",
    hint: "AT_TAP = your meter reading is taken at the current tap location. UPSTREAM = meter is at the start of the run (before losses).",
    buttons: [
      {label:"AT TAP", value:"AT_TAP"},
      {label:"UPSTREAM", value:"UPSTREAM"}
    ],
    ask: () => print("> Select mode: AT_TAP or UPSTREAM"),
    validate: (ans) => ["AT_TAP","UPSTREAM"].includes(ans),
    apply: (ans) => { state.mode = ans; }
  },

  {
    title: "ENTER METER @ 250 MHz (dBmV)",
    hint: "Example: 34.5",
    ask: () => print("> Enter meter @250 (dBmV):"),
    validate: (ans) => Number.isFinite(n(ans, NaN)),
    apply: (ans) => { state.meter250 = n(ans, state.meter250); }
  },

  {
    title: "ENTER METER @ 1000 MHz (dBmV)",
    hint: "Example: 41",
    ask: () => print("> Enter meter @1000 (dBmV):"),
    validate: (ans) => Number.isFinite(n(ans, NaN)),
    apply: (ans) => { state.meter1000 = n(ans, state.meter1000); }
  },

  {
    title: "METER PAD (dB)",
    hint: "Example: 20. If your meter already compensates, we won’t subtract it (next step).",
    ask: () => print("> Enter meter pad (dB):"),
    validate: (ans) => Number.isFinite(n(ans, NaN)),
    apply: (ans) => { state.pad = n(ans, state.pad); }
  },

  {
    title: "PAD HANDLING",
    hint: "If your meter shows the REAL level even with pad installed, choose YES (don’t subtract pad).",
    buttons: [
      {label:"NO (subtract pad)", value:"NO"},
      {label:"YES (meter compensates)", value:"YES"}
    ],
    ask: () => print("> Does your meter compensate for the pad? YES or NO"),
    validate: (ans) => ["YES","NO"].includes(ans),
    apply: (ans) => { state.padComp = (ans === "YES"); }
  },

  // ---- Cable segments builder (loop step) ----
  {
    title: "CABLE RUN BUILDER",
    hint: "Add cable segments in order. Type LIST to see current segments. Type DONE when finished.",
    buttons: [
      {label:"ADD SEGMENT", value:"ADD"},
      {label:"LIST", value:"LIST"},
      {label:"DONE", value:"DONE"}
    ],
    ask: () => {
      print("> Cable segments: type ADD, LIST, or DONE");
    },
    validate: (ans) => ["ADD","LIST","DONE"].includes(ans),
    apply: (ans) => { /* handled in special handler */ },
    special: "SEGMENTS"
  },

  // ---- Inline taps builder ----
  {
    title: "INLINE TAPS (DOWNSTREAM THRU PATH)",
    hint: "Each inline tap subtracts THRU loss on THRU path. Type LIST to see taps. Type DONE when finished.",
    buttons: [
      {label:"ADD INLINE TAP", value:"ADD"},
      {label:"LIST", value:"LIST"},
      {label:"DONE", value:"DONE"}
    ],
    ask: () => print("> Inline taps: type ADD, LIST, or DONE"),
    validate: (ans) => ["ADD","LIST","DONE"].includes(ans),
    apply: (ans) => {},
    special: "INLINE"
  },

  // ---- Internal devices builder ----
  {
    title: "INTERNAL (MINIBRIDGER) DEVICES",
    hint: "Allowed: 2-way splitter, DC-8, DC-12. Type LIST to see stack. DONE when finished.",
    buttons: [
      {label:"ADD", value:"ADD"},
      {label:"LIST", value:"LIST"},
      {label:"DONE", value:"DONE"}
    ],
    ask: () => print("> Internal stack: type ADD, LIST, or DONE"),
    validate: (ans) => ["ADD","LIST","DONE"].includes(ans),
    apply: (ans) => {},
    special: "INTERNAL"
  },

  // ---- Field devices builder ----
  {
    title: "FIELD DEVICES (DOWNSTREAM)",
    hint: "Allowed: 2-way, 2-way balanced, 3-way(636), DC-9, DC-12. LIST or DONE.",
    buttons: [
      {label:"ADD", value:"ADD"},
      {label:"LIST", value:"LIST"},
      {label:"DONE", value:"DONE"}
    ],
    ask: () => print("> Field stack: type ADD, LIST, or DONE"),
    validate: (ans) => ["ADD","LIST","DONE"].includes(ans),
    apply: (ans) => {},
    special: "FIELD"
  },

  // ---- Current tap settings ----
  {
    title: "CURRENT TAP VALUE (dB)",
    hint: "Example: 4",
    ask: () => print("> Enter CURRENT tap value (dB):"),
    validate: (ans) => Number.isFinite(n(ans, NaN)) && n(ans,0) > 0,
    apply: (ans) => {
      state.currentTapValue = n(ans, state.currentTapValue);
      if (state.currentTapThruAuto && DEFAULT_TAP_THRU[state.currentTapValue] != null){
        state.currentTapThru = DEFAULT_TAP_THRU[state.currentTapValue];
      }
    }
  },

  {
    title: "CURRENT TAP THRU LOSS (dB)",
    hint: "Auto-fill is ON by default using a simple lookup. Type AUTO to toggle, or enter a number.",
    buttons: [
      {label:"AUTO ON/OFF", value:"AUTO"}
    ],
    ask: () => {
      print(`> Current tap THRU loss is ${f2(state.currentTapThru)} dB (AUTO ${state.currentTapThruAuto ? "ON" : "OFF"})`);
      print("> Enter THRU loss (dB) or type AUTO:");
    },
    validate: (ans) => {
      if (ans === "AUTO") return true;
      return Number.isFinite(n(ans, NaN)) && n(ans,0) > 0;
    },
    apply: (ans) => {
      if (ans === "AUTO"){
        state.currentTapThruAuto = !state.currentTapThruAuto;
        if (state.currentTapThruAuto && DEFAULT_TAP_THRU[state.currentTapValue] != null){
          state.currentTapThru = DEFAULT_TAP_THRU[state.currentTapValue];
        }
        return;
      }
      state.currentTapThru = n(ans, state.currentTapThru);
      state.currentTapThruAuto = false;
    }
  },

  {
    title: "READY",
    hint: "Press RUN ANALYSIS (button) anytime. You can BACK to change anything.",
    ask: () => {
      print("> SYSTEM READY.");
      print("> Press RUN ANALYSIS.");
    },
    validate: () => true,
    apply: () => {}
  }
];

// ---- Special step internal sub-flows ----
let subflow = null;

function startSubflow(type){
  subflow = { type, stage: 0, temp: {} };
}

function handleSegmentsSubflow(ans){
  const freq = freqFromBand(state.band);

  // stage 0 expects ADD/LIST/DONE already validated
  if (subflow.stage === 0){
    if (ans === "LIST"){
      if (!state.segments.length){
        print("(none)");
      } else {
        print("CABLE SEGMENTS:");
        state.segments.forEach((s,i)=>{
          const l = cableLossForSegment(s, freq);
          print(`${i+1}) ${s.cable} ${s.ft}ft  -> -${f2(l)} dB @ ${freq}MHz`);
        });
        print(`TOTAL CABLE LOSS: -${f2(totalCableLoss(freq))} dB`);
      }
      steps[state.step].ask();
      return;
    }
    if (ans === "DONE"){
      if (!state.segments.length){
        print("ERROR: You need at least 1 cable segment.");
        steps[state.step].ask();
        return;
      }
      // exit subflow
      subflow = null;
      nextStep();
      return;
    }
    if (ans === "ADD"){
      startSubflow("SEG_ADD");
      print("> Select cable type (example: P3-500, P3-625, .500, RG6, RG11)");
      print("> Type: " + Object.keys(LOSS_PER_100FT).slice(0,12).join(", ") + " ...");
      print("> Enter cable type:");
      subflow.stage = 1;
      return;
    }
  }

  // stage 1: cable type
  if (subflow.stage === 1){
    const cable = String(ans);
    if (!LOSS_PER_100FT[cable]){
      print("ERROR: Unknown cable type. Try one from the list.");
      return;
    }
    subflow.temp.cable = cable;
    subflow.stage = 2;
    print("> Enter length (ft):");
    return;
  }

  // stage 2: length
  if (subflow.stage === 2){
    const ft = n(ans, NaN);
    if (!Number.isFinite(ft) || ft <= 0){
      print("ERROR: length must be > 0.");
      return;
    }
    state.segments.push({ cable: subflow.temp.cable, ft: Math.round(ft) });
    print(`OK: Added ${subflow.temp.cable} ${Math.round(ft)}ft`);
    saveState();
    // return to main step
    subflow = { type:"SEGMENTS", stage:0, temp:{} };
    steps[state.step].ask();
    return;
  }
}

function handleInlineSubflow(ans){
  // stage 0 expects ADD/LIST/DONE
  if (subflow.stage === 0){
    if (ans === "LIST"){
      if (!state.inlineTaps.length){
        print("(none)");
      } else {
        print("INLINE TAPS (THRU LOSS):");
        state.inlineTaps.forEach((t,i)=> print(`${i+1}) ${t.value}v  THRU -${f2(t.thru)} dB`));
        print(`INLINE THRU TOTAL: -${f2(totalInlineThruLoss())} dB`);
      }
      steps[state.step].ask();
      return;
    }
    if (ans === "DONE"){
      subflow = null;
      nextStep();
      return;
    }
    if (ans === "ADD"){
      startSubflow("INLINE_ADD");
      subflow.stage = 1;
      print("> Enter inline tap value (example: 11, 17, 23):");
      return;
    }
  }

  // stage 1: tap value
  if (subflow.stage === 1){
    const v = Math.round(n(ans, NaN));
    if (!Number.isFinite(v) || v <= 0){
      print("ERROR: invalid tap value.");
      return;
    }
    subflow.temp.value = v;

    const defaultThru = DEFAULT_TAP_THRU[v];
    if (defaultThru != null){
      subflow.temp.thru = defaultThru;
      print(`> THRU loss default for ${v}v = ${f2(defaultThru)} dB`);
      print("> Enter THRU loss (dB) or press Enter to accept default:");
      subflow.stage = 2;
    } else {
      print("> Enter THRU loss (dB):");
      subflow.stage = 3;
    }
    return;
  }

  // stage 2: allow blank to accept default
  if (subflow.stage === 2){
    const raw = String(ans).trim();
    let thru = subflow.temp.thru;
    if (raw !== ""){
      const t = n(raw, NaN);
      if (!Number.isFinite(t) || t <= 0){
        print("ERROR: invalid THRU loss.");
        return;
      }
      thru = t;
    }
    state.inlineTaps.push({ value: subflow.temp.value, thru });
    print(`OK: Added inline ${subflow.temp.value}v THRU -${f2(thru)} dB`);
    saveState();
    subflow = { type:"INLINE", stage:0, temp:{} };
    steps[state.step].ask();
    return;
  }

  // stage 3: manual thru
  if (subflow.stage === 3){
    const t = n(ans, NaN);
    if (!Number.isFinite(t) || t <= 0){
      print("ERROR: invalid THRU loss.");
      return;
    }
    state.inlineTaps.push({ value: subflow.temp.value, thru: t });
    print(`OK: Added inline ${subflow.temp.value}v THRU -${f2(t)} dB`);
    saveState();
    subflow = { type:"INLINE", stage:0, temp:{} };
    steps[state.step].ask();
    return;
  }
}

function handleInternalSubflow(ans){
  if (subflow.stage === 0){
    if (ans === "LIST"){
      if (!state.internal.length) print("(none)");
      else {
        print("INTERNAL STACK:");
        state.internal.forEach((d,i)=> print(`${i+1}) ${d.name}  -${f2(d.loss)} dB`));
        print(`INTERNAL TOTAL: -${f2(totalDeviceLoss(state.internal))} dB`);
      }
      steps[state.step].ask();
      return;
    }
    if (ans === "DONE"){
      subflow = null;
      nextStep();
      return;
    }
    if (ans === "ADD"){
      startSubflow("INTERNAL_ADD");
      subflow.stage = 1;
      print("> Choose internal device number:");
      INTERNAL_DEVICES.forEach((d,i)=> print(`  ${i+1}) ${d.name} (-${f2(d.loss)} dB)`));
      return;
    }
  }

  if (subflow.stage === 1){
    const idx = Math.round(n(ans, NaN)) - 1;
    if (!Number.isFinite(idx) || idx < 0 || idx >= INTERNAL_DEVICES.length){
      print("ERROR: choose a valid number.");
      return;
    }
    state.internal.push({...INTERNAL_DEVICES[idx]});
    print(`OK: Added INTERNAL ${INTERNAL_DEVICES[idx].name}`);
    saveState();
    subflow = { type:"INTERNAL", stage:0, temp:{} };
    steps[state.step].ask();
    return;
  }
}

function handleFieldSubflow(ans){
  if (subflow.stage === 0){
    if (ans === "LIST"){
      if (!state.field.length) print("(none)");
      else {
        print("FIELD STACK:");
        state.field.forEach((d,i)=> print(`${i+1}) ${d.name}  -${f2(d.loss)} dB`));
        print(`FIELD TOTAL: -${f2(totalDeviceLoss(state.field))} dB`);
      }
      steps[state.step].ask();
      return;
    }
    if (ans === "DONE"){
      subflow = null;
      nextStep();
      return;
    }
    if (ans === "ADD"){
      startSubflow("FIELD_ADD");
      subflow.stage = 1;
      print("> Choose field device number:");
      FIELD_DEVICES.forEach((d,i)=> print(`  ${i+1}) ${d.name} (-${f2(d.loss)} dB)`));
      return;
    }
  }

  if (subflow.stage === 1){
    const idx = Math.round(n(ans, NaN)) - 1;
    if (!Number.isFinite(idx) || idx < 0 || idx >= FIELD_DEVICES.length){
      print("ERROR: choose a valid number.");
      return;
    }
    state.field.push({...FIELD_DEVICES[idx]});
    print(`OK: Added FIELD ${FIELD_DEVICES[idx].name}`);
    saveState();
    subflow = { type:"FIELD", stage:0, temp:{} };
    steps[state.step].ask();
    return;
  }
}

// ---- Step navigation ----
function goToStep(i){
  state.step = Math.max(0, Math.min(i, steps.length - 1));
  saveState();

  const step = steps[state.step];
  setHint(`[STEP ${state.step+1}/${steps.length}] ${step.title} — ${step.hint || ""}`);

  setQuickButtons(step.buttons || []);
  step.ask();

  // handle special builder steps
  if (step.special && !subflow){
    subflow = { type: step.special, stage: 0, temp: {} };
  }
}

function nextStep(){
  goToStep(state.step + 1);
}
function prevStep(){
  // if we are inside a builder subflow, back exits subflow stage and returns to builder menu
  const step = steps[state.step];
  if (step.special){
    subflow = { type: step.special, stage: 0, temp: {} };
    print("> BACK: returned to builder menu.");
    step.ask();
    return;
  }
  goToStep(state.step - 1);
}

// ---- Analysis ----
function startLevel(freq){
  const meter = (freq === 250) ? state.meter250 : state.meter1000;
  return state.padComp ? meter : (meter - state.pad);
}

function runAnalysis(){
  const freq = freqFromBand(state.band);

  const start = startLevel(freq);

  const cab = totalCableLoss(freq);
  const inlineThru = totalInlineThruLoss();
  const internal = totalDeviceLoss(state.internal);
  const field = totalDeviceLoss(state.field);

  // Level at current tap IN depends on mode:
  // UPSTREAM: start is before losses; AT_TAP: start is already at tap
  let levelAtTapIn = start;
  if (state.mode === "UPSTREAM"){
    // all losses BEFORE reaching current tap
    levelAtTapIn = start - cab - inlineThru - internal - field;
  }

  // Current tap outputs:
  const tapPort = levelAtTapIn - state.currentTapValue;
  const thruLocal = levelAtTapIn - state.currentTapThru;

  // Downstream THRU final:
  let finalThru = thruLocal;
  if (state.mode === "AT_TAP"){
    // losses occur AFTER tap
    finalThru = thruLocal - cab - inlineThru - internal - field;
  }

  // Inline tap port outputs along THRU path (downstream of current tap)
  // We compute ports sequentially from THRU output at current tap.
  let running = thruLocal;
  const inlineLines = [];
  for (let i=0; i<state.inlineTaps.length; i++){
    const t = state.inlineTaps[i];
    const port = running - t.value;   // tap port = current thru level - tap value
    running = running - t.thru;       // then subtract thru loss to continue
    inlineLines.push(`${i+1}) ${t.value}v | PORT ${f2(port)} dBmV | THRU AFTER ${f2(running)} dBmV (THRU -${f2(t.thru)}dB)`);
  }

  const status =
    (finalThru >= -2 && finalThru <= 15) ? "OK" :
    (finalThru < -2) ? "LOW" : "HOT";

  print("");
  print("================================");
  print("SIGNAL ANALYSIS COMPLETE");
  print("================================");
  print(`BAND/FREQ:            ${state.band} / ${freq} MHz`);
  print(`MODE:                 ${state.mode}`);
  print(`START LEVEL USED:     ${f2(start)} dBmV ${state.padComp ? "(PAD COMP)" : `(PAD -${f2(state.pad)}dB)`}`);
  print("");
  print(`CABLE LOSS:           -${f2(cab)} dB   (segments: ${state.segments.length})`);
  print(`INLINE THRU TOTAL:    -${f2(inlineThru)} dB   (inline taps: ${state.inlineTaps.length})`);
  print(`INTERNAL TOTAL:       -${f2(internal)} dB   (items: ${state.internal.length})`);
  print(`FIELD TOTAL:          -${f2(field)} dB   (items: ${state.field.length})`);
  print("");
  print(`LEVEL AT TAP IN:      ${f2(levelAtTapIn)} dBmV`);
  print(`TAP PORT OUTPUT:      ${f2(tapPort)} dBmV   (tap value -${f2(state.currentTapValue)}dB)`);
  print(`THRU OUTPUT (LOCAL):  ${f2(thruLocal)} dBmV (tap thru -${f2(state.currentTapThru)}dB)`);
  print("");
  print("INLINE TAP PORTS (DOWNSTREAM):");
  print(inlineLines.length ? inlineLines.join("\n") : "(none)");
  print("--------------------------------");
  print(`FINAL THRU LEVEL:     ${f2(finalThru)} dBmV`);
  print(`STATUS:               [ ${status} ]`);
  print("================================");
  print("");
}

// ---- Answer handling ----
function normalizeAns(raw){
  const s = String(raw ?? "").trim();
  return s.toUpperCase();
}

function handleAnswer(raw){
  const ans = normalizeAns(raw);

  // allow blank enter (used for inline default THRU accept)
  const rawTrim = String(raw ?? "").trim();

  // Special builder subflows
  const step = steps[state.step];
  if (step.special){
    if (!subflow) subflow = { type: step.special, stage: 0, temp: {} };

    // route to correct handler
    if (step.special === "SEGMENTS"){
      // create a subflow state for segments if not already
      if (!subflow.type || subflow.type === "SEGMENTS") {
        // use stage 0 menu
        subflow.type = "SEGMENTS";
        subflow.stage = 0;
      }
      // Here "ADD/LIST/DONE"
      if (subflow.stage === 0){
        if (!["ADD","LIST","DONE"].includes(ans)){
          print("ERROR: type ADD, LIST, or DONE.");
          return;
        }
        // hand into segments handler (it will start internal stage)
        subflow.type = "SEGMENTS";
        handleSegmentsSubflow(ans);
        return;
      }

      // inside add stages: pass raw (case sensitive cable types)
      handleSegmentsSubflow(String(rawTrim));
      return;
    }

    if (step.special === "INLINE"){
      if (!subflow.type || subflow.type === "INLINE") {
        subflow.type = "INLINE";
        subflow.stage = 0;
      }
      if (subflow.stage === 0){
        if (!["ADD","LIST","DONE"].includes(ans)){
          print("ERROR: type ADD, LIST, or DONE.");
          return;
        }
        handleInlineSubflow(ans);
        return;
      }
      // if stage 2 allows blank, pass rawTrim
      handleInlineSubflow(rawTrim);
      return;
    }

    if (step.special === "INTERNAL"){
      if (!subflow.type || subflow.type === "INTERNAL") {
        subflow.type = "INTERNAL";
        subflow.stage = 0;
      }
      if (subflow.stage === 0){
        if (!["ADD","LIST","DONE"].includes(ans)){
          print("ERROR: type ADD, LIST, or DONE.");
          return;
        }
        handleInternalSubflow(ans);
        return;
      }
      handleInternalSubflow(rawTrim);
      return;
    }

    if (step.special === "FIELD"){
      if (!subflow.type || subflow.type === "FIELD") {
        subflow.type = "FIELD";
        subflow.stage = 0;
      }
      if (subflow.stage === 0){
        if (!["ADD","LIST","DONE"].includes(ans)){
          print("ERROR: type ADD, LIST, or DONE.");
          return;
        }
        handleFieldSubflow(ans);
        return;
      }
      handleFieldSubflow(rawTrim);
      return;
    }
  }

  // Normal step
  const def = steps[state.step];

  // some steps accept AUTO button
  const actual = (ans === "" ? "" : ans);

  // validate
  if (!def.validate(actual)){
    print("ERROR: invalid entry.");
    def.ask();
    return;
  }

  // apply (for numeric steps we should use rawTrim to preserve decimals)
  if (def.title.includes("METER @") || def.title.includes("PAD") || def.title.includes("TAP")){
    def.apply(rawTrim === "" ? "" : rawTrim);
  } else {
    def.apply(actual);
  }

  saveState();
  if (state.step < steps.length - 1) nextStep();
}

// ---- UI events ----
inp.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const val = inp.value;
  inp.value = "";
  print(`> ${val}`);
  handleAnswer(val);
});

backBtn.addEventListener("click", () => {
  print("> BACK");
  prevStep();
});

resetBtn.addEventListener("click", () => {
  if (confirm("Reset everything?")) resetState();
});

runBtn.addEventListener("click", () => {
  print("> RUN ANALYSIS");
  runAnalysis();
});

copyBtn.addEventListener("click", async () => {
  try{
    await navigator.clipboard.writeText(out.textContent);
    print("> COPIED.");
  }catch{
    print("> COPY FAILED (browser restriction).");
  }
});

// ---- Boot + sound (iPhone needs user tap) ----
function pipboyChirp(){
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  const ctx = new AudioCtx();
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0, now);
  master.gain.linearRampToValueAtTime(0.20, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
  master.connect(ctx.destination);

  function chirp(t0, f0, f1, dur){
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.7, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur);
  }

  chirp(now + 0.00, 520, 880, 0.10);
  chirp(now + 0.14, 420, 700, 0.12);
  chirp(now + 0.30, 620, 980, 0.14);

  const o2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  o2.type = "sine";
  o2.frequency.setValueAtTime(90, now + 0.06);
  g2.gain.setValueAtTime(0.0001, now + 0.06);
  g2.gain.exponentialRampToValueAtTime(0.25, now + 0.08);
  g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.20);
  o2.connect(g2); g2.connect(master);
  o2.start(now + 0.06); o2.stop(now + 0.22);

  setTimeout(() => { try{ ctx.close(); }catch{} }, 1200);
}

function bootAnim(){
  const lines = [
    "FVG INDUSTRIES (TM)",
    "CATV CALC INITIALIZING....",
    "LOADING LOSS TABLES............. OK",
    "LOADING TAP MODULES.............. OK",
    "LOADING DEVICE MODULES........... OK",
    "CHECKING OFFLINE CACHE........... OK",
    "READY."
  ];
  bootText.textContent = "";
  let i = 0;
  const t = setInterval(() => {
    bootText.textContent += lines[i] + "\n";
    i++;
    if (i >= lines.length) clearInterval(t);
  }, 220);
}

function printHeader(){
  print("FVG INDUSTRIES (TM)");
  print("CATV SIGNAL DIAGNOSTICS TERMINAL");
  print("--------------------------------");
  print("Type answers and press Enter (or tap quick buttons).");
  print("");
}

bootBtn.addEventListener("click", () => {
  pipboyChirp();
  boot.style.display = "none";
  clearScreen();
  printHeader();
  goToStep(state.step || 0);
  inp.focus();
}, { once:true });

// ---- Service worker ----
if ("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  });
}

// ---- Init ----
(function init(){
  loadState();
  bootAnim();
})();
