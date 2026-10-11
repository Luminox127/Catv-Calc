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

function f2(x){ return Number.isFinite(x) ? x.toFixed(2) : "N/A"; }
function n(x, fallback=0){
  const text = String(x).trim();
  const v = text === "" ? NaN : Number(text);
  return Number.isFinite(v) ? v : fallback;
}

function save(){ try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} }
function load(){
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return;
    const valid = (v) => typeof v === "number" && Number.isFinite(v);
    const loss = (v) => valid(v) && v >= 0;
    state.mode = "UPSTREAM";
    if (["typical","maximum"].includes(saved.tapBasis)) state.tapBasis = saved.tapBasis;
    if (ATX_TAPS[saved.currentTapModel]) { state.currentTapModel = saved.currentTapModel; state.currentTapValue = ATX_TAPS[saved.currentTapModel].value; }
    for (const key of ["meter250", "meter1000"]) if (valid(saved[key])) state[key] = saved[key];
    if (state.currentTapModel === "legacy" && TAP_VALUES.includes(saved.currentTapValue)) state.currentTapValue = saved.currentTapValue;
    state.currentTapThru = loss(saved.currentTapThru) ? saved.currentTapThru : DEFAULT_TAP_THRU[state.currentTapValue];
    if (Array.isArray(saved.segments)) state.segments = saved.segments.filter(v => v && Object.hasOwn(LOSS_PER_100FT, v.cable) && loss(v.ft)).map(v => ({cable:v.cable, ft:v.ft}));
    if (Array.isArray(saved.inlineTaps)) state.inlineTaps = saved.inlineTaps.filter(v => v && ((ATX_TAPS[v.model] && !ATX_TAPS[v.model].terminal) || (TAP_VALUES.includes(v.value) && loss(v.thru)))).map(v => ATX_TAPS[v.model] && !ATX_TAPS[v.model].terminal ? {model:v.model,value:ATX_TAPS[v.model].value} : {value:v.value,thru:v.thru});
    for (const key of ["internal", "field"]) if (Array.isArray(saved[key])) state[key] = saved[key].filter(v => v && ((key === "field" && validPassive(v)) || (typeof v.name === "string" && loss(v.loss)))).map(v => key === "field" && validPassive(v) ? {model:v.model,path:v.path,name:passiveName(v)} : {name:v.name,loss:v.loss});
  } catch {}
}
function resetAll(){
  window.resetTX?.();
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  state = defaultState();
  screen = "MODE";
  historyStack = [];
  resultsWrap.classList.add("hidden");
  sumInputs.forEach(el => { if (el) el.value = ""; });
  sumCompute();
  render();
}

function defaultState(){
  return {
    currentTapModel: "legacy",
    tapBasis: "typical",
    mode: "UPSTREAM",   // Meter reading at amplifier output, before run losses
    meter250: 34.5,
    meter1000: 41.0,

    // pad removed; always 0
    pad: 0.0,

    segments: [],
    inlineTaps: [],
    internal: [],
    field: [],

    currentTapValue: 4,
    currentTapThru: DEFAULT_TAP_THRU[4]
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
  const displayLabel = label.replace(/HIGH LOSS/g, '<span class="moreLoss">HIGH LOSS</span>');
  b.innerHTML = `<div class="optTitle">${displayLabel}</div>${sub ? `<div class="optSub">${sub}</div>`:""}`;
  const handler = (e)=>{ e.preventDefault(); onPick(); };
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
function atxLoss(model, kind, freq){
  const spec = ATX_TAPS[model];
  if (!spec) throw new Error("Unknown ATX tap model");
  const index = state.tapBasis === "maximum" ? 1 : 0;
  const points = Object.keys(spec[kind]).map(Number).sort((a,b)=>a-b);
  const lo = points.filter(f=>f<=freq).at(-1), hi = points.find(f=>f>=freq);
  if (lo === undefined || hi === undefined) return null;
  const a=spec[kind][lo][index], b=spec[kind][hi][index];
  if (a === null || b === null) return null;
  return lo===hi ? a : a+(b-a)*(freq-lo)/(hi-lo);
}
function currentTapLoss(kind,freq){
  return state.currentTapModel === "legacy" ? (kind === "tap" ? state.currentTapValue : state.currentTapThru) : atxLoss(state.currentTapModel,kind,freq);
}
function inlineLoss(t,freq){ return t.model ? atxLoss(t.model,"thru",freq) : t.thru; }
function totalInlineThruLoss(freq){
  return state.inlineTaps.reduce((sum,t)=>{
    const loss=inlineLoss(t,freq);
    if (loss === null) throw new Error("A terminating tap cannot be used in the inline path");
    return sum+loss;
  },0);
}
function pickTapFamily(isCurrent){
  setOptions(isCurrent ? "Current tap type" : "Inline tap type", "Select the faceplate port count for ATX GigaXtend XS.",
    [2,4,8,"legacy"].map(ports=>({label:ports === "legacy" ? "Generic / previous presets" : "ATX GigaXtend XS · "+ports+" ports",sub:ports === "legacy" ? "Existing nominal tap and fixed THRU losses" : "ANW2030 manufacturer loss tables",onPick:()=>{temp.tapFamily=ports;setScreen(isCurrent ? "CUR_TAP_VALUE" : "INLINE_VALUE");}})));
}
function tapChoices(isCurrent){
  if (temp.tapFamily === "legacy" || !temp.tapFamily) return TAP_VALUES.map(v=>({label:v+" dB tap",sub:"Default THRU "+f2(DEFAULT_TAP_THRU[v])+" dB",onPick:()=>{
    if(isCurrent){state.currentTapModel="legacy";state.currentTapValue=v;state.currentTapThru=DEFAULT_TAP_THRU[v];setScreen("CUR_TAP_THRU");}
    else{state.inlineTaps.push({value:v,thru:DEFAULT_TAP_THRU[v]});setScreen("INLINE_MENU");}
  }}));
  return Object.entries(ATX_TAPS).filter(([key,t])=>t.ports===temp.tapFamily && (isCurrent || !t.terminal)).map(([key,t])=>({
    label:t.value+" dB · "+t.part,
    sub:t.terminal ? "Terminating tap — no THRU output" : "THRU "+f2(atxLoss(key,"thru",250))+" / "+f2(atxLoss(key,"thru",1000))+" dB (250 / 1000 MHz)",
    onPick:()=>{if(isCurrent){state.currentTapModel=key;state.currentTapValue=t.value;setScreen("DONE");}else{state.inlineTaps.push({model:key,value:t.value});setScreen("INLINE_MENU");}}
  }));
}
function validPassive(d){
  return Object.hasOwn(ATX_PASSIVES,d.model || "") && ["thru","tap"].includes(d.path) && ATX_PASSIVES[d.model][d.path][5][0] !== null;
}
function passiveName(d){
  const spec=ATX_PASSIVES[d.model];
  const hasUnequalPorts=spec.tap[5][0] !== null;
  const port=hasUnequalPorts
    ? (d.path === "tap" ? "HIGH LOSS · "+(d.model === "XSC-2-959" ? "high-loss output" : "coupled port") : "LESS LOSS · "+(d.model === "XSC-2-959" ? "low-loss output" : "THRU port"))
    : (d.model === "XSI-2-20" ? "RF through path" : "any output · equal loss");
  return spec.name+" · "+d.model+" · "+port;
}
function passiveLoss(d,freq){
  if (!validPassive(d)) throw new Error("Invalid field device port");
  const row=ATX_PASSIVES[d.model][d.path],index=state.tapBasis === "maximum" ? 1 : 0;
  const points=Object.keys(row).map(Number).sort((a,b)=>a-b);
  const lo=points.filter(f=>f<=freq).at(-1),hi=points.find(f=>f>=freq);
  if(lo===undefined || hi===undefined)throw new Error("Field device frequency outside specifications");
  return lo===hi ? row[lo][index] : row[lo][index]+(row[hi][index]-row[lo][index])*(freq-lo)/(hi-lo);
}
function totalDeviceLoss(list,freq){
  return list.reduce((sum,d)=>sum+(d.model ? passiveLoss(d,freq) : (d.loss || 0)),0);
}
function fieldChoices(){
  return Object.entries(ATX_PASSIVES).flatMap(([model,spec])=>["thru","tap"].filter(path=>spec[path][5][0] !== null).map(path=>{
    const d={model,path};
    return {label:passiveName(d),sub:"Loss "+f2(passiveLoss(d,250))+" / "+f2(passiveLoss(d,1000))+" dB (250 / 1000 MHz)",onPick:()=>{state.field.push({...d,name:passiveName(d)});setScreen("FIELD_MENU");}};
  }));
}

function computeFor(freq){
  const start = startLevel(freq);

  const cab = totalCableLoss(freq);
  const inlineThru = totalInlineThruLoss(freq);
  const internal = totalDeviceLoss(state.internal,freq);
  const field = totalDeviceLoss(state.field,freq);

  const levelAtTapIn = start - cab - inlineThru - internal - field;

  const tapLoss = currentTapLoss("tap",freq);
  const thruLoss = currentTapLoss("thru",freq);
  const tapPort = levelAtTapIn - tapLoss;
  const thruLocal = thruLoss === null ? null : levelAtTapIn - thruLoss;

  const finalThru = thruLocal;

  // The wizard does not record cable/device positions between taps.
  // Report inline losses only; port levels require an ordered topology.
  const inlineLines = [];
  for (let i=0; i<state.inlineTaps.length; i++){
    const t = state.inlineTaps[i];
    inlineLines.push(`${i+1}) ${t.model ? ATX_TAPS[t.model].part : t.value+" dB generic tap"}: THRU loss -${f2(inlineLoss(t,freq))} dB`);
  }

  const segLines = state.segments.map((s,i)=>{
    const l = cableLossForSegment(s, freq);
    return `${i+1}) ${s.cable} ${s.ft}ft  -${f2(l)} dB`;
  });

  const status =
    finalThru === null ? "N/A (no THRU output)" :
    (finalThru >= -2 && finalThru <= 15) ? "OK" :
    (finalThru < -2) ? "LOW" : "HOT";

  return {
    freq, start, cab, inlineThru, internal, field, tapLoss, thruLoss,
    levelAtTapIn, tapPort, thruLocal, finalThru,
    inlineLines, segLines, status
  };
}

function formatResult(r){
  return (
`Start used:         ${f2(r.start)} dBmV   (pad fixed at 0dB)
Reading location:   Meter reading out of amp
Current tap:        ${state.currentTapModel === "legacy" ? "Generic / previous presets" : ATX_TAPS[state.currentTapModel].part}
ATX loss basis:     ${state.tapBasis} (linear interpolation at 250 / 1000 MHz)

Cable loss:         -${f2(r.cab)} dB
Inline THRU total:  -${f2(r.inlineThru)} dB
Internal total:     -${f2(r.internal)} dB
Field total:        -${f2(r.field)} dB
${state.field.map((d,i)=>"  "+(i+1)+") "+(d.model ? passiveName(d) : d.name+" (generic)")+": -"+f2(d.model ? passiveLoss(d,r.freq) : d.loss)+" dB").join("\n")}

Level @ tap IN:     ${f2(r.levelAtTapIn)} dBmV
TAP PORT OUT:       ${f2(r.tapPort)} dBmV  (tap -${f2(r.tapLoss)})
Thru OUT (local):   ${r.thruLoss === null ? "N/A — terminating tap has no OUT port" : f2(r.thruLocal)+" dBmV (thru -"+f2(r.thruLoss)+" dB)"}

Inline tap losses (port levels require component positions):
${r.inlineLines.length ? r.inlineLines.join("\n") : "(none)"}

Final THRU level:   ${r.finalThru === null ? "N/A — no OUT port" : f2(r.finalThru)+" dBmV"}
Reference range:    ${r.status} (configured -2 to +15 dBmV; verify for this test point)

Segments:
${r.segLines.length ? r.segLines.join("\n") : "(none)"}`
  );
}

function showResultsNow(){
  const low = computeFor(250);
  const high = computeFor(1000);
  resLow.textContent = formatResult(low);
  resHigh.textContent = formatResult(high);
  document.getElementById("tapPortLow").textContent = f2(low.tapPort) + " dBmV";
  document.getElementById("tapPortHigh").textContent = f2(high.tapPort) + " dBmV";
  resultsWrap.classList.remove("hidden");
  window.updateTX?.();
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
        "Use the amplifier output reading, before the listed cable, tap and device losses.",
        [
          {label:"Meter reading out of amp", sub:"measured before run losses", onPick: ()=>{ state.mode="UPSTREAM"; setScreen("M250"); }}
        ]
      );
      break;

    case "M250":
      showNumber("Meter @ 250 MHz (dBmV)", "Enter LOW reading.", state.meter250, (v)=>{ state.meter250=v; setScreen("M1000"); });
      break;

    case "M1000":
      showNumber("Meter @ 1000 MHz (dBmV)", "Enter HIGH reading.", state.meter1000, (v)=>{ state.meter1000=v; setScreen("TAP_BASIS"); });
      break;

    case "TAP_BASIS":
      setOptions("ATX tap / field-device loss basis", "Typical predicts normal performance; maximum uses the published upper loss limits. Cable and generic device presets are unchanged.",
        ["typical","maximum"].map(b=>({label:b === "typical" ? "Typical loss" : "Maximum loss",sub:"Applies to selected ATX taps and field devices",onPick:()=>{state.tapBasis=b;setScreen("SEG_MENU");}})));
      break;
    case "INLINE_FAMILY": pickTapFamily(false); break;
    case "CUR_TAP_FAMILY": pickTapFamily(true); break;
    case "SEG_MENU":
      setOptions(
        "Cable segments",
        `Segments: ${state.segments.length}. Cable run from amplifier output to current tap.`,
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
        state.segments.push({ cable: temp.segCable, ft: v });
        setScreen("SEG_MENU");
      });
      break;

    case "INLINE_MENU":
      setOptions(
        "Inline taps (THRU path)",
        `Inline taps: ${state.inlineTaps.length}. THRU losses subtract on the THRU path.`,
        [
          {label:"Add inline tap", sub:"pick model + value (auto THRU)", onPick: ()=> setScreen("INLINE_FAMILY")},
          {label:"Done", sub:"go to internal devices", onPick: ()=> setScreen("INT_MENU")},
          {label:"Clear inline taps", sub:"remove inline taps", onPick: ()=>{ state.inlineTaps=[]; render(); }}
        ]
      );
      break;

    case "INLINE_VALUE":
      setOptions("Select inline tap", "Only taps with a THRU output are available.", tapChoices(false));
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
          {label:"Add field device", sub:"ATX splitters / DC / power inserter", onPick: ()=> setScreen("FIELD_ADD")},
          {label:"Done", sub:"current tap", onPick: ()=> setScreen("CUR_TAP_FAMILY")},
          {label:"Clear field", sub:"remove field stack", onPick: ()=>{ state.field=[]; render(); }}
        ]
      );
      break;

    case "FIELD_ADD":
      setOptions("Add ATX field device", "Pick LESS LOSS or HIGH LOSS for the leg feeding your tap. Balanced splitters have equal-loss outputs.",
        fieldChoices().concat([{label:"Other hardware / generic presets",sub:"Previous fixed loss choices",onPick:()=>setScreen("FIELD_GENERIC")}])) ;
      break;
    case "FIELD_GENERIC":
      setOptions("Generic field devices", "These fixed presets are not ATX manufacturer specifications.", FIELD_DEVICES.map(d=>({label:d.name,sub:"-"+f2(d.loss)+" dB",onPick:()=>{state.field.push({...d});setScreen("FIELD_MENU");}})));
      break;

    case "CUR_TAP_VALUE":
      setOptions("Select current tap", "Choose the nominal value printed on its faceplate.", tapChoices(true));
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
          {label:"Edit current tap", sub:"model + port count", onPick: ()=> setScreen("CUR_TAP_FAMILY")},
          {label:"Edit loss basis", sub:"typical / maximum", onPick: ()=> setScreen("TAP_BASIS")},
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

// Open the calculator after successful login. Audio is handled by login.js.
function startApp(){
  resultsWrap.classList.add("hidden");
  render();
}
window.__STARTAPP = startApp;

numOk.addEventListener("click", (e)=>{
  e.preventDefault();
  const v = n(numInput.value, NaN);
  if (!Number.isFinite(v)) { alert("Enter a number."); return; }
  if (["SEG_FEET", "CUR_TAP_THRU"].includes(screen) && v < 0) { alert("Length and loss must be zero or greater."); return; }
  const cb = pendingNumber;
  if (!cb) return;
  pendingNumber = null;
  hideNumber();
  cb(v);
});
numCancel.addEventListener("click", (e)=>{ e.preventDefault(); hideNumber(); back(); });

backBtn.addEventListener("click", (e)=>{ e.preventDefault(); back(); });
showResults.addEventListener("click", (e)=>{ e.preventDefault(); showResultsNow(); });
showResultsTop.addEventListener("click", (e)=>{ e.preventDefault(); showResultsNow(); });
resetTop.addEventListener("click", (e)=>{ e.preventDefault(); if (confirm("Reset everything?")) resetAll(); });

// Each page load starts a fresh calculation.
// Keep in-session wizard navigation intact, but discard previous runs.
try { localStorage.removeItem(STORAGE_KEY); } catch {}
state = defaultState();

// Ensure pad is always 0 even if old state existed
state.pad = 0.0;
save();
