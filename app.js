// ============================================================
// FVG INDUSTRIES (TM) — CATV CALC TERMINAL (Tap-Only Wizard)
// - One question card at a time
// - Click/tap options (no typing for cables/devices/taps)
// - Numeric keypad only for numbers
// - Mixed cable segments
// - Inline taps: THRU loss subtracted correctly + port outputs
// - iPhone-safe START (touchend + click)
// ============================================================

const boot = document.getElementById("boot");
const bootText = document.getElementById("bootText");
const bootBtn = document.getElementById("bootBtn");

const subtitle = document.getElementById("subtitle");

const qTitle = document.getElementById("qTitle");
const qHint  = document.getElementById("qHint");
const optionsEl = document.getElementById("options");

const numWrap = document.getElementById("numWrap");
const numInput = document.getElementById("numInput");
const numOk = document.getElementById("numOk");
const numCancel = document.getElementById("numCancel");

const backBtn = document.getElementById("backBtn");
const resetBtn = document.getElementById("resetBtn");
const resultsBtn = document.getElementById("resultsBtn");

const resultsEl = document.getElementById("results");

const STORAGE_KEY = "catv_wizard_state_v2";

// ---------- Loss tables (dB per 100ft) ----------
const LOSS_PER_100FT = {
  "RG59":   {250: 4.10, 1000: 8.12},
  "RG6":    {250: 3.30, 1000: 6.55},
  "RG11":   {250: 2.05, 1000: 4.35},
  "QR540":  {250: 1.03, 1000: 2.17},
  "P3-500": {250: 1.20, 1000: 2.52},
  "P3-625": {250: 1.00, 1000: 2.07},
  "P3-750": {250: 0.81, 1000: 1.74},
  "P3-875": {250: 0.72, 1000: 1.53}
};

// Inline tap defaults (thru) — you can adjust as you learn your plant
const DEFAULT_TAP_THRU = {
  4: 1.2, 8: 1.4, 11: 1.5, 14: 1.6, 17: 1.7, 20: 1.8, 23: 1.9, 26: 2.0, 29: 2.1
};

const CABLE_CHOICES = [
  {id:"P3-500", label:"P3-500 (.500)", sub:"Hardline"},
  {id:"P3-625", label:"P3-625 (.625)", sub:"Hardline"},
  {id:"P3-750", label:"P3-750 (.750)", sub:"Hardline"},
  {id:"P3-875", label:"P3-875 (.875)", sub:"Hardline"},
  {id:"QR540", label:"QR540", sub:"Hardline"},
  {id:"RG6", label:"RG6", sub:"Drop"},
  {id:"RG11", label:"RG11", sub:"Drop"},
  {id:"RG59", label:"RG59", sub:"Drop"}
];

const INTERNAL_DEVICES = [
  {name:"2-way splitter", loss:3.5},
  {name:"DC-8", loss:8.0},
  {name:"DC-12", loss:12.0}
];

const FIELD_DEVICES = [
  {name:"2-way splitter", loss:3.5},
  {name:"2-way balanced", loss:3.5},
  {name:"3-way splitter (636)", loss:5.5},
  {name:"DC-9", loss:9.0},
  {name:"DC-12", loss:12.0}
];

const INLINE_TAP_VALUES = [4,8,11,14,17,20,23,26,29];
const CURRENT_TAP_VALUES = [4,8,11,14,17,20,23,26,29];

// ---------- Utils ----------
function f2(x){ return Number.isFinite(x) ? x.toFixed(2) : "0.00"; }
function n(x, fallback=0){
  const v = parseFloat(String(x).trim());
  return Number.isFinite(v) ? v : fallback;
}
function freqFromBand(b){ return b === "HIGH" ? 1000 : 250; }
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function load(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try{
    const s = JSON.parse(raw);
    state = {...state, ...s};
  }catch{}
}

function resetAll(){
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  historyStack = [];
  resultsEl.classList.add("hidden");
  render();
}

// ---------- App state ----------
function defaultState(){
  return {
    band: "LOW",          // LOW=250 / HIGH=1000
    mode: "AT_TAP",       // AT_TAP or UPSTREAM
    meter250: 34.5,
    meter1000: 41.0,
    pad: 20.0,
    padComp: false,

    segments: [],         // [{cable, ft}]
    inlineTaps: [],       // [{value, thru}]
    internal: [],         // [{name, loss}]
    field: [],            // [{name, loss}]

    currentTapValue: 4,
    currentTapThru: 1.5
  };
}

let state = defaultState();

// We keep a stack of wizard “screens” for BACK
let historyStack = [];
let screen = "BAND";

// numeric input callback
let pendingNumber = null;

// ---------- Wizard screen renderer ----------
function setScreen(next){
  historyStack.push(screen);
  screen = next;
  resultsEl.classList.add("hidden");
  render();
}

function back(){
  if (!historyStack.length) return;
  screen = historyStack.pop();
  resultsEl.classList.add("hidden");
  render();
}

function showNumber(promptTitle, hint, initial, onOk){
  qTitle.textContent = promptTitle;
  qHint.textContent = hint || "";
  optionsEl.innerHTML = "";
  numWrap.classList.remove("hidden");
  numInput.value = (initial ?? "");
  pendingNumber = onOk;
  setTimeout(() => numInput.focus(), 50);
}

function hideNumber(){
  numWrap.classList.add("hidden");
  pendingNumber = null;
}

function setOptions(title, hint, opts){
  qTitle.textContent = title;
  qHint.textContent = hint || "";
  hideNumber();
  optionsEl.innerHTML = "";

  opts.forEach(o => {
    const btn = document.createElement("button");
    btn.className = "opt";
    btn.innerHTML = `${o.label}${o.sub ? `<small>${o.sub}</small>` : ""}`;

    const handler = (e) => { e.preventDefault(); o.onPick(); };
    btn.addEventListener("touchend", handler, {passive:false});
    btn.addEventListener("click", handler);

    optionsEl.appendChild(btn);
  });
}

function render(){
  subtitle.textContent = `MODE: WIZARD • BAND: ${state.band} (${freqFromBand(state.band)} MHz)`;

  // Decide what to show:
  switch(screen){

    case "BAND":
      setOptions(
        "SELECT BAND",
        "Choose which frequency you are calculating for.",
        [
          {label:"LOW (250 MHz)", onPick: () => { state.band="LOW"; save(); setScreen("MODE"); }},
          {label:"HIGH (1000 MHz)", onPick: () => { state.band="HIGH"; save(); setScreen("MODE"); }}
        ]
      );
      break;

    case "MODE":
      setOptions(
        "WHERE IS YOUR METER READING TAKEN?",
        "AT TAP = your reading is at the current tap. UPSTREAM = before the run.",
        [
          {label:"AT TAP (local reading)", onPick: () => { state.mode="AT_TAP"; save(); setScreen("METER250"); }},
          {label:"UPSTREAM (before run)", onPick: () => { state.mode="UPSTREAM"; save(); setScreen("METER250"); }}
        ]
      );
      break;

    case "METER250":
      showNumber(
        "METER @ 250 MHz (dBmV)",
        "Tap OK to continue.",
        state.meter250,
        (val) => { state.meter250 = val; save(); setScreen("METER1000"); }
      );
      break;

    case "METER1000":
      showNumber(
        "METER @ 1000 MHz (dBmV)",
        "Tap OK to continue.",
        state.meter1000,
        (val) => { state.meter1000 = val; save(); setScreen("PAD"); }
      );
      break;

    case "PAD":
      showNumber(
        "METER PAD (dB)",
        "Example: 20. If your meter compensates, choose YES next.",
        state.pad,
        (val) => { state.pad = val; save(); setScreen("PADCOMP"); }
      );
      break;

    case "PADCOMP":
      setOptions(
        "DOES YOUR METER COMPENSATE FOR PAD?",
        "YES = do NOT subtract pad. NO = subtract pad.",
        [
          {label:"NO (subtract pad)", onPick: () => { state.padComp=false; save(); setScreen("SEG_MENU"); }},
          {label:"YES (meter compensates)", onPick: () => { state.padComp=true; save(); setScreen("SEG_MENU"); }}
        ]
      );
      break;

    case "SEG_MENU":
      setOptions(
        "CABLE SEGMENTS",
        `Segments: ${state.segments.length}. Add segments in order (mixed cable runs).`,
        [
          {label:"ADD SEGMENT", sub:"Pick cable type + enter feet", onPick: () => setScreen("SEG_CABLE")},
          {label:"DONE (Next)", sub:"Go to inline taps", onPick: () => setScreen("INLINE_MENU")},
          {label:"CLEAR ALL SEGMENTS", sub:"Remove all cable segments", onPick: () => { state.segments=[]; save(); render(); }}
        ]
      );
      break;

    case "SEG_CABLE":
      setOptions(
        "SELECT CABLE TYPE",
        "Tap a cable type for this segment.",
        CABLE_CHOICES.map(c => ({
          label: c.label,
          sub: `${LOSS_PER_100FT[c.id][250]} dB/100ft @250 • ${LOSS_PER_100FT[c.id][1000]} dB/100ft @1000`,
          onPick: () => {
            temp.segmentCable = c.id;
            setScreen("SEG_FEET");
          }
        })).concat([
          {label:"BACK", onPick: () => back()}
        ])
      );
      break;

    case "SEG_FEET":
      showNumber(
        "SEGMENT LENGTH (feet)",
        `Cable: ${temp.segmentCable}. Enter feet then OK.`,
        100,
        (val) => {
          state.segments.push({ cable: temp.segmentCable, ft: Math.round(val) });
          save();
          setScreen("SEG_MENU");
        }
      );
      break;

    case "INLINE_MENU":
      setOptions(
        "INLINE TAPS (THRU PATH)",
        `Inline taps: ${state.inlineTaps.length}. THRU losses subtract on the THRU path.`,
        [
          {label:"ADD INLINE TAP", sub:"Pick value + auto THRU", onPick: () => setScreen("INLINE_VALUE")},
          {label:"DONE (Next)", sub:"Go to internal devices", onPick: () => setScreen("INT_MENU")},
          {label:"CLEAR INLINE TAPS", sub:"Remove all inline taps", onPick: () => { state.inlineTaps=[]; save(); render(); }}
        ]
      );
      break;

    case "INLINE_VALUE":
      setOptions(
        "SELECT INLINE TAP VALUE",
        "Tap a value. THRU will auto-fill; you can edit later if needed.",
        INLINE_TAP_VALUES.map(v => ({
          label: `${v} value`,
          sub: `Default THRU: ${f2(DEFAULT_TAP_THRU[v] ?? 1.5)} dB`,
          onPick: () => {
            const thru = DEFAULT_TAP_THRU[v] ?? 1.5;
            state.inlineTaps.push({ value: v, thru });
            save();
            setScreen("INLINE_MENU");
          }
        })).concat([{label:"BACK", onPick: () => back()}])
      );
      break;

    case "INT_MENU":
      setOptions(
        "INTERNAL (MINIBRIDGER) DEVICES",
        `Internal items: ${state.internal.length}.`,
        [
          {label:"ADD INTERNAL DEVICE", onPick: () => setScreen("INT_ADD")},
          {label:"DONE (Next)", sub:"Go to field devices", onPick: () => setScreen("FIELD_MENU")},
          {label:"CLEAR INTERNAL", onPick: () => { state.internal=[]; save(); render(); }}
        ]
      );
      break;

    case "INT_ADD":
      setOptions(
        "ADD INTERNAL DEVICE",
        "Tap a device to add it to the stack.",
        INTERNAL_DEVICES.map(d => ({
          label: d.name,
          sub: `-${f2(d.loss)} dB`,
          onPick: () => { state.internal.push({...d}); save(); setScreen("INT_MENU"); }
        })).concat([{label:"BACK", onPick: () => back()}])
      );
      break;

    case "FIELD_MENU":
      setOptions(
        "FIELD DEVICES",
        `Field items: ${state.field.length}.`,
        [
          {label:"ADD FIELD DEVICE", onPick: () => setScreen("FIELD_ADD")},
          {label:"DONE (Next)", sub:"Current tap", onPick: () => setScreen("CUR_TAP_VALUE")},
          {label:"CLEAR FIELD", onPick: () => { state.field=[]; save(); render(); }}
        ]
      );
      break;

    case "FIELD_ADD":
      setOptions(
        "ADD FIELD DEVICE",
        "Tap a device to add it to the stack.",
        FIELD_DEVICES.map(d => ({
          label: d.name,
          sub: `-${f2(d.loss)} dB`,
          onPick: () => { state.field.push({...d}); save(); setScreen("FIELD_MENU"); }
        })).concat([{label:"BACK", onPick: () => back()}])
      );
      break;

    case "CUR_TAP_VALUE":
      setOptions(
        "CURRENT TAP VALUE",
        "Tap the value of the current tap you are on.",
        CURRENT_TAP_VALUES.map(v => ({
          label: `${v} value`,
          sub: `Default THRU: ${f2(DEFAULT_TAP_THRU[v] ?? state.currentTapThru)} dB`,
          onPick: () => {
            state.currentTapValue = v;
            state.currentTapThru = DEFAULT_TAP_THRU[v] ?? state.currentTapThru;
            save();
            setScreen("CUR_TAP_THRU");
          }
        }))
      );
      break;

    case "CUR_TAP_THRU":
      showNumber(
        "CURRENT TAP THRU LOSS (dB)",
        "Edit if needed, then OK.",
        state.currentTapThru,
        (val) => { state.currentTapThru = val; save(); setScreen("DONE"); }
      );
      break;

    case "DONE":
      setOptions(
        "READY",
        "Tap RESULTS to see calculations. You can BACK to edit any step.",
        [
          {label:"SHOW RESULTS", onPick: () => showResults()},
          {label:"EDIT INLINE TAP THRU LOSSES", sub:"(optional)", onPick: () => setScreen("EDIT_INLINE_LIST")},
          {label:"EDIT CABLE SEGMENTS", onPick: () => setScreen("SEG_MENU")}
        ]
      );
      break;

    case "EDIT_INLINE_LIST":
      setOptions(
        "EDIT INLINE TAP THRU",
        "Tap a tap to edit THRU loss.",
        state.inlineTaps.map((t, idx) => ({
          label: `${idx+1}) ${t.value}v tap`,
          sub: `THRU: ${f2(t.thru)} dB`,
          onPick: () => {
            temp.editInlineIndex = idx;
            setScreen("EDIT_INLINE_THRU");
          }
        })).concat([
          {label:"BACK", onPick: () => back()},
          {label:"DONE", onPick: () => setScreen("DONE")}
        ])
      );
      break;

    case "EDIT_INLINE_THRU": {
      const idx = temp.editInlineIndex;
      const t = state.inlineTaps[idx];
      showNumber(
        `INLINE ${idx+1} THRU LOSS (dB)`,
        `${t.value}v inline tap — edit thru loss.`,
        t.thru,
        (val) => {
          state.inlineTaps[idx].thru = val;
          save();
          setScreen("EDIT_INLINE_LIST");
        }
      );
      break;
    }

    default:
      setScreen("BAND");
  }
}

const temp = {};

// ---------- Analysis ----------
function startLevel(freq){
  const meter = (freq === 250) ? state.meter250 : state.meter1000;
  return state.padComp ? meter : (meter - state.pad);
}

function cableLossForSegment(seg, freq){
  const row = LOSS_PER_100FT[seg.cable];
  if (!row) return 0;
  const per100 = row[freq];
  return per100 * (seg.ft / 100);
}
function totalCableLoss(freq){
  return state.segments.reduce((s, seg) => s + cableLossForSegment(seg, freq), 0);
}
function totalInlineThruLoss(){
  return state.inlineTaps.reduce((s, t) => s + (t.thru || 0), 0);
}
function totalDeviceLoss(list){
  return list.reduce((s, d) => s + (d.loss || 0), 0);
}

function showResults(){
  const freq = freqFromBand(state.band);
  const start = startLevel(freq);

  const cab = totalCableLoss(freq);
  const inlineThru = totalInlineThruLoss();
  const internal = totalDeviceLoss(state.internal);
  const field = totalDeviceLoss(state.field);

  let levelAtTapIn = start;
  if (state.mode === "UPSTREAM"){
    levelAtTapIn = start - cab - inlineThru - internal - field;
  }

  const tapPort = levelAtTapIn - state.currentTapValue;
  const thruLocal = levelAtTapIn - state.currentTapThru;

  let finalThru = thruLocal;
  if (state.mode === "AT_TAP"){
    finalThru = thruLocal - cab - inlineThru - internal - field;
  }

  // Inline tap ports along THRU path
  let running = thruLocal;
  const inlineLines = [];
  for (let i=0; i<state.inlineTaps.length; i++){
    const t = state.inlineTaps[i];
    const port = running - t.value;
    running = running - t.thru;
    inlineLines.push(`${i+1}) ${t.value}v  PORT ${f2(port)} dBmV | THRU AFTER ${f2(running)} dBmV  (THRU -${f2(t.thru)}dB)`);
  }

  const status =
    (finalThru >= -2 && finalThru <= 15) ? "OK" :
    (finalThru < -2) ? "LOW" : "HOT";

  const segLines = state.segments.map((s,i)=> {
    const l = cableLossForSegment(s, freq);
    return `${i+1}) ${s.cable} ${s.ft}ft  -> -${f2(l)} dB`;
  });

  const txt =
`================================
FVG INDUSTRIES (TM) — RESULTS
================================
BAND/FREQ:            ${state.band} / ${freq} MHz
MODE:                 ${state.mode}

START LEVEL USED:     ${f2(start)} dBmV ${state.padComp ? "(PAD COMP)" : `(PAD -${f2(state.pad)}dB)`}

CABLE SEGMENTS:
${segLines.length ? segLines.join("\n") : "(none)"}
TOTAL CABLE LOSS:     -${f2(cab)} dB

INLINE TAPS THRU TOTAL: -${f2(inlineThru)} dB
INTERNAL TOTAL:         -${f2(internal)} dB
FIELD TOTAL:            -${f2(field)} dB

LEVEL AT TAP IN:      ${f2(levelAtTapIn)} dBmV
TAP PORT OUTPUT:      ${f2(tapPort)} dBmV   (tap value -${f2(state.currentTapValue)}dB)
THRU OUTPUT (LOCAL):  ${f2(thruLocal)} dBmV (tap thru -${f2(state.currentTapThru)}dB)

INLINE TAP PORTS (DOWNSTREAM):
${inlineLines.length ? inlineLines.join("\n") : "(none)"}

FINAL THRU LEVEL:     ${f2(finalThru)} dBmV
STATUS:               [ ${status} ]
================================
`;

  resultsEl.textContent = txt;
  resultsEl.classList.remove("hidden");
}

// ---------- Boot sound ----------
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

  setTimeout(() => { try{ ctx.close(); }catch{} }, 1200);
}

function bootAnim(){
  const lines = [
    "FVG INDUSTRIES (TM)",
    "CATV CALC INITIALIZING....",
    "LOADING WIZARD UI.............. OK",
    "LOADING LOSS TABLES............ OK",
    "LOADING TAP MODULE............. OK",
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

// iPhone: touchend + click
function startApp(e){
  if (e) e.preventDefault();
  pipboyChirp();
  boot.style.display = "none";
  render();
}
["touchend","click"].forEach(evt => bootBtn.addEventListener(evt, startApp, { once:true, passive:false }));

// numeric handlers
numOk.addEventListener("click", (e) => {
  e.preventDefault();
  const val = n(numInput.value, NaN);
  if (!Number.isFinite(val)){
    alert("Enter a number.");
    return;
  }
  const cb = pendingNumber;
  pendingNumber = null;
  hideNumber();
  cb(val);
});
numCancel.addEventListener("click", (e) => {
  e.preventDefault();
  hideNumber();
  render();
});

backBtn.addEventListener("click", (e)=>{ e.preventDefault(); back(); });
resetBtn.addEventListener("click", (e)=>{ e.preventDefault(); if (confirm("Reset everything?")) resetAll(); });
resultsBtn.addEventListener("click", (e)=>{ e.preventDefault(); showResults(); });

// load saved state
load();
bootAnim();

// Service worker
if ("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  });
}
