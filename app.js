/* ============================================================
   CATV CALC — 2026 Wizard (Dual-band auto calc)
   - Meter pad removed (ALWAYS 0)
   - 8-input SUM mini calculator only on Cable Segments screen
   - Inline tap THRU subtraction included
   - No service worker (avoid cache/tap issues)
   ============================================================ */

console.log("CATV CALC: app.js loaded");

// show errors if any (so never “nothing happens”)
window.addEventListener("error", (e) => alert("JS ERROR: " + (e?.message || "unknown")));
window.addEventListener("unhandledrejection", (e) => alert("JS PROMISE ERROR: " + (e?.reason?.message || e?.reason || "unknown")));

const boot = document.getElementById("boot");
const bootBtn = document.getElementById("bootBtn");
const bootDots = document.getElementById("bootDots");

const qTitle = document.getElementById("qTitle");
const qHint  = document.getElementById("qHint");
const optionsEl = document.getElementById("options");

const numWrap = document.getElementById("numWrap");
const numInput = document.getElementById("numInput");
const numOk = document.getElementById("numOk");
const numCancel = document.getElementById("numCancel");

const backBtn = document.getElementById("backBtn");
const showResults = document.getElementById("showResults");
const showResultsTop = document.getElementById("showResultsTop");
const resetTop = document.getElementById("resetTop");

const resultsWrap = document.getElementById("resultsWrap");
const resLow = document.getElementById("resLow");
const resHigh = document.getElementById("resHigh");

// Mini calc wrapper (only visible on SEG_MENU)
const miniCalc = document.getElementById("miniCalc");

// 8-input SUM calculator elements (must exist in index.html)
const sumIds = ["s1","s2","s3","s4","s5","s6","s7","s8"];
const sumInputs = sumIds.map(id => document.getElementById(id));
const sumOut = document.getElementById("sumOut");
const sumCopy = document.getElementById("sumCopy");
const sumClear = document.getElementById("sumClear");

const STORAGE_KEY = "catv_calc_2026_nosw_v3";

// Loss tables (dB/100ft) for 250 & 1000
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

const DEFAULT_TAP_THRU = { 4:1.2, 8:1.4, 11:1.5, 14:1.6, 17:1.7, 20:1.8, 23:1.9, 26:2.0, 29:2.1 };
const TAP_VALUES = [4,8,11,14,17,20,23,26,29];

const CABLE_CHOICES = [
  {id:"P3-500", label:"P3-500 (.500)", sub:"Hardline"},
  {id:"P3-625", label:"P3-625 (.625)", sub:"Hardline"},
  {id:"P3-750", label:"P3-750 (.750)", sub:"Hardline"},
  {id:"P3-875", label:"P3-875 (.875)", sub:"Hardline"},
  {id:"QR540",  label:"QR540",         sub:"Hardline"},
  {id:"RG6",    label:"RG6",           sub:"Drop"},
  {id:"RG11",   label:"RG11",          sub:"Drop"},
  {id:"RG59",   label:"RG59",          sub:"Drop"}
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

function f2(x){ return Number.isFinite(x) ? x.toFixed(2) : "0.00"; }
function n(x, fallback=0){
  const v = parseFloat(String(x).trim());
  return Number.isFinite(v) ? v : fallback;
}

function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function load(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try{ state = {...state, ...JSON.parse(raw)}; }catch{}
}
function resetAll(){
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  screen = "MODE";
  historyStack = [];
  resultsWrap.classList.add("hidden");
  render();
}

function defaultState(){
  return {
    mode: "AT_TAP",     // AT_TAP or UPSTREAM
    meter250: 34.5,
    meter1000: 41.0,

    // pad removed; always 0
    pad: 0.0,

    segments: [],
    inlineTaps: [],
    internal: [],
    field: [],

    currentTapValue: 4,
    currentTapThru: 1.5
  };
}

let state = defaultState();
let screen = "MODE";
let historyStack = [];
let pendingNumber = null;
const temp = {};

function hideNumber(){
  numWrap.classList.add("hidden");
  pendingNumber = null;
}
function showNumber(title, hint, initial, onOk){
  qTitle.textContent = title;
  qHint.textContent = hint || "";
  optionsEl.innerHTML = "";
  numWrap.classList.remove("hidden");
  numInput.value = (initial ?? "");
  pendingNumber = onOk;
  setTimeout(() => numInput.focus(), 60);
}

function optButton(label, sub, onPick){
  const b = document.createElement("button");
  b.className = "opt";
  b.innerHTML = `<div class="optTitle">${label}</div>${sub ? `<div class="optSub">${sub}</div>`:""}`;
  const handler = (e)=>{ e.preventDefault(); onPick(); };
  b.addEventListener("touchend", handler, {passive:false});
  b.addEventListener("click", handler);
  return b;
}

function setOptions(title, hint, opts){
  qTitle.textContent = title;
  qHint.textContent = hint || "";
  hideNumber();
  optionsEl.innerHTML = "";
  opts.forEach(o => optionsEl.appendChild(optButton(o.label, o.sub, o.onPick)));
}

function setMiniCalcVisible(on){
  if (on){
    miniCalc.classList.remove("hidden");
    // refresh sum immediately when opening segments screen
    setTimeout(sumCompute, 0);
  } else {
    miniCalc.classList.add("hidden");
  }
}

function setScreen(next){
  historyStack.push(screen);
  screen = next;
  resultsWrap.classList.add("hidden");
  render();
}
function back(){
  if (!historyStack.length) return;
  screen = historyStack.pop();
  resultsWrap.classList.add("hidden");
  render();
}

// --------- Calculations ----------
function startLevel(freq){
  // pad always 0, but keep formula clean
  const meter = (freq === 250) ? state.meter250 : state.meter1000;
  return meter - state.pad;
}
function cableLossForSegment(seg, freq){
  const row = LOSS_PER_100FT[seg.cable];
  if (!row) return 0;
  return row[freq] * (seg.ft / 100);
}
function totalCableLoss(freq){
  return state.segments.reduce((s, seg)=> s + cableLossForSegment(seg, freq), 0);
}
function totalInlineThruLoss(){
  return state.inlineTaps.reduce((s, t)=> s + (t.thru || 0), 0);
}
function totalDeviceLoss(list){
  return list.reduce((s, d)=> s + (d.loss || 0), 0);
}

function computeFor(freq){
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

  let running = thruLocal;
  const inlineLines = [];
  for (let i=0; i<state.inlineTaps.length; i++){
    const t = state.inlineTaps[i];
    const port = running - t.value;
    running = running - t.thru;
    inlineLines.push(`${i+1}) ${t.value}v  PORT ${f2(port)} | THRU_AFTER ${f2(running)} (THRU -${f2(t.thru)})`);
  }

  const segLines = state.segments.map((s,i)=>{
    const l = cableLossForSegment(s, freq);
    return `${i+1}) ${s.cable} ${s.ft}ft  -${f2(l)} dB`;
  });

  const status =
    (finalThru >= -2 && finalThru <= 15) ? "OK" :
    (finalThru < -2) ? "LOW" : "HOT";

  return {
    freq, start, cab, inlineThru, internal, field,
    levelAtTapIn, tapPort, thruLocal, finalThru,
    inlineLines, segLines, status
  };
}

function formatResult(r){
  return (
`Start used:         ${f2(r.start)} dBmV   (pad fixed at 0dB)
Mode:               ${state.mode}

Cable loss:         -${f2(r.cab)} dB
Inline THRU total:  -${f2(r.inlineThru)} dB
Internal total:     -${f2(r.internal)} dB
Field total:        -${f2(r.field)} dB

Level @ tap IN:     ${f2(r.levelAtTapIn)} dBmV
Tap port OUT:       ${f2(r.tapPort)} dBmV  (tap -${f2(state.currentTapValue)})
Thru OUT (local):   ${f2(r.thruLocal)} dBmV (thru -${f2(state.currentTapThru)})

Inline ports:
${r.inlineLines.length ? r.inlineLines.join("\n") : "(none)"}

Final THRU level:   ${f2(r.finalThru)} dBmV
Status:             ${r.status}

Segments:
${r.segLines.length ? r.segLines.join("\n") : "(none)"}`
  );
}

function showResultsNow(){
  const low = computeFor(250);
  const high = computeFor(1000);
  resLow.textContent = formatResult(low);
  resHigh.textContent = formatResult(high);
  resultsWrap.classList.remove("hidden");
}

// --------- Wizard screens ----------
function render(){
  save();

  // show mini calc ONLY on cable segments screen
  setMiniCalcVisible(screen === "SEG_MENU");

  switch(screen){
    case "MODE":
      setOptions(
        "Where is your meter reading taken?",
        "AT TAP = measured at current tap. UPSTREAM = measured before the run.",
        [
          {label:"AT TAP (local reading)", sub:"common in the field", onPick: ()=>{ state.mode="AT_TAP"; setScreen("M250"); }},
          {label:"UPSTREAM (before run)", sub:"measured before losses", onPick: ()=>{ state.mode="UPSTREAM"; setScreen("M250"); }}
        ]
      );
      break;

    case "M250":
      showNumber("Meter @ 250 MHz (dBmV)", "Enter LOW reading.", state.meter250, (v)=>{ state.meter250=v; setScreen("M1000"); });
      break;

    case "M1000":
      showNumber("Meter @ 1000 MHz (dBmV)", "Enter HIGH reading.", state.meter1000, (v)=>{ state.meter1000=v; setScreen("SEG_MENU"); });
      break;

    case "SEG_MENU":
      setOptions(
        "Cable segments",
        `Segments: ${state.segments.length}. Add in order (mixed cable OK).`,
        [
          {label:"Add segment", sub:"pick cable + feet", onPick: ()=> setScreen("SEG_CABLE")},
          {label:"Done", sub:"go to inline taps", onPick: ()=> setScreen("INLINE_MENU")},
          {label:"Clear segments", sub:"remove all segments", onPick: ()=>{ state.segments=[]; render(); }}
        ]
      );
      break;

    case "SEG_CABLE":
      setOptions(
        "Select cable type",
        "Tap a cable for this segment.",
        CABLE_CHOICES.map(c => ({
          label: c.label,
          sub: `${LOSS_PER_100FT[c.id][250]} dB/100ft @250 • ${LOSS_PER_100FT[c.id][1000]} dB/100ft @1000`,
          onPick: ()=>{ temp.segCable=c.id; setScreen("SEG_FEET"); }
        })).concat([{label:"Back", sub:"", onPick: ()=> back()}])
      );
      break;

    case "SEG_FEET":
      showNumber("Segment length (ft)", `Cable: ${temp.segCable}`, 100, (v)=>{
        state.segments.push({ cable: temp.segCable, ft: Math.round(v) });
        setScreen("SEG_MENU");
      });
      break;

    case "INLINE_MENU":
      setOptions(
        "Inline taps (THRU path)",
        `Inline taps: ${state.inlineTaps.length}. THRU losses subtract on the THRU path.`,
        [
          {label:"Add inline tap", sub:"pick value (auto THRU)", onPick: ()=> setScreen("INLINE_VALUE")},
          {label:"Done", sub:"go to internal devices", onPick: ()=> setScreen("INT_MENU")},
          {label:"Clear inline taps", sub:"remove inline taps", onPick: ()=>{ state.inlineTaps=[]; render(); }}
        ]
      );
      break;

    case "INLINE_VALUE":
      setOptions(
        "Select inline tap value",
        "Tap a value (THRU uses default).",
        TAP_VALUES.map(v => ({
          label: `${v} value`,
          sub: `Default THRU ${f2(DEFAULT_TAP_THRU[v] ?? 1.5)} dB`,
          onPick: ()=>{ state.inlineTaps.push({ value:v, thru: DEFAULT_TAP_THRU[v] ?? 1.5 }); setScreen("INLINE_MENU"); }
        })).concat([{label:"Back", sub:"", onPick: ()=> back()}])
      );
      break;

    case "INT_MENU":
      setOptions(
        "Internal devices (minibridger)",
        `Internal items: ${state.internal.length}`,
        [
          {label:"Add internal device", sub:"2-way / DC-8 / DC-12", onPick: ()=> setScreen("INT_ADD")},
          {label:"Done", sub:"go to field devices", onPick: ()=> setScreen("FIELD_MENU")},
          {label:"Clear internal", sub:"remove internal stack", onPick: ()=>{ state.internal=[]; render(); }}
        ]
      );
      break;

    case "INT_ADD":
      setOptions(
        "Add internal device",
        "Tap a device to add it.",
        INTERNAL_DEVICES.map(d => ({
          label: d.name,
          sub: `-${f2(d.loss)} dB`,
          onPick: ()=>{ state.internal.push({...d}); setScreen("INT_MENU"); }
        })).concat([{label:"Back", sub:"", onPick: ()=> back()}])
      );
      break;

    case "FIELD_MENU":
      setOptions(
        "Field devices",
        `Field items: ${state.field.length}`,
        [
          {label:"Add field device", sub:"splitters / DC", onPick: ()=> setScreen("FIELD_ADD")},
          {label:"Done", sub:"current tap", onPick: ()=> setScreen("CUR_TAP_VALUE")},
          {label:"Clear field", sub:"remove field stack", onPick: ()=>{ state.field=[]; render(); }}
        ]
      );
      break;

    case "FIELD_ADD":
      setOptions(
        "Add field device",
        "Tap a device to add it.",
        FIELD_DEVICES.map(d => ({
          label: d.name,
          sub: `-${f2(d.loss)} dB`,
          onPick: ()=>{ state.field.push({...d}); setScreen("FIELD_MENU"); }
        })).concat([{label:"Back", sub:"", onPick: ()=> back()}])
      );
      break;

    case "CUR_TAP_VALUE":
      setOptions(
        "Current tap value",
        "Tap the value of the tap you are on.",
        TAP_VALUES.map(v => ({
          label: `${v} value`,
          sub: `Default THRU ${f2(DEFAULT_TAP_THRU[v] ?? state.currentTapThru)} dB`,
          onPick: ()=>{ state.currentTapValue=v; state.currentTapThru = DEFAULT_TAP_THRU[v] ?? state.currentTapThru; setScreen("CUR_TAP_THRU"); }
        }))
      );
      break;

    case "CUR_TAP_THRU":
      showNumber("Current tap THRU loss (dB)", "Edit if needed.", state.currentTapThru, (v)=>{ state.currentTapThru=v; setScreen("DONE"); });
      break;

    case "DONE":
      setOptions(
        "Ready",
        "Tap Results to calculate both LOW and HIGH automatically.",
        [
          {label:"Show results", sub:"250 + 1000", onPick: ()=> showResultsNow()},
          {label:"Edit cable segments", sub:"", onPick: ()=> setScreen("SEG_MENU")},
          {label:"Edit inline taps", sub:"", onPick: ()=> setScreen("INLINE_MENU")}
        ]
      );
      break;

    default:
      screen = "MODE";
      render();
  }
}

// --------- 8-input SUM calculator ----------
function sumCompute(){
  if (!sumOut) return 0;
  let total = 0;
  for (const el of sumInputs){
    if (!el) continue;
    const v = parseFloat((el.value || "").trim());
    if (Number.isFinite(v)) total += v;
  }
  sumOut.textContent = f2(total);
  return total;
}

// update as you type
sumInputs.forEach(el=>{
  if (!el) return;
  el.addEventListener("input", sumCompute);
  el.addEventListener("change", sumCompute);
});

if (sumCopy){
  sumCopy.addEventListener("click", async (e)=>{
    e.preventDefault();
    const txt = sumOut?.textContent || "0.00";
    try{
      await navigator.clipboard.writeText(txt);
      alert("Copied: " + txt);
    }catch{
      const t = document.createElement("textarea");
      t.value = txt;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
      alert("Copied: " + txt);
    }
  });
}

if (sumClear){
  sumClear.addEventListener("click", (e)=>{
    e.preventDefault();
    sumInputs.forEach(el => { if (el) el.value = ""; });
    if (sumOut) sumOut.textContent = "0.00";
  });
}

// --------- Boot sound (simple modern chirp) ----------
function startupSound(){
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  const ctx = new AudioCtx();
  const now = ctx.currentTime;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.60);
  g.connect(ctx.destination);

  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(520, now);
  o.frequency.linearRampToValueAtTime(920, now + 0.10);
  o.frequency.linearRampToValueAtTime(680, now + 0.22);
  o.connect(g);
  o.start(now);
  o.stop(now + 0.26);

  setTimeout(()=>{ try{ ctx.close(); }catch{} }, 900);
}

// Boot dots
(function bootAnim(){
  const dots = ["•", "••", "•••"];
  let i = 0;
  setInterval(()=>{ bootDots.textContent = dots[i++ % dots.length]; }, 180);
})();

// START function exposed for onclick fallback
function startApp(e){
  if (e) e.preventDefault();
  startupSound();
  boot.style.display = "none";
  resultsWrap.classList.add("hidden");
  render();
}
window.__STARTAPP = startApp;

// Listeners
["touchend","click"].forEach(evt => bootBtn.addEventListener(evt, startApp, { passive:false }));

numOk.addEventListener("click", (e)=>{
  e.preventDefault();
  const v = n(numInput.value, NaN);
  if (!Number.isFinite(v)) { alert("Enter a number."); return; }
  const cb = pendingNumber;
  pendingNumber = null;
  hideNumber();
  cb(v);
});
numCancel.addEventListener("click", (e)=>{ e.preventDefault(); hideNumber(); render(); });

backBtn.addEventListener("click", (e)=>{ e.preventDefault(); back(); });
showResults.addEventListener("click", (e)=>{ e.preventDefault(); showResultsNow(); });
showResultsTop.addEventListener("click", (e)=>{ e.preventDefault(); showResultsNow(); });
resetTop.addEventListener("click", (e)=>{ e.preventDefault(); if (confirm("Reset everything?")) resetAll(); });

// Load saved state
load();

// Ensure pad is always 0 even if old state existed
state.pad = 0.0;
save();
