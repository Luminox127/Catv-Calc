// ============================================================
// CATV PWA Calculator
// Mirrors your logic + stores inputs locally (offline friendly)
// ============================================================

// Cable loss (dB per 100 ft) from your screenshots
const LOSS_DB_PER_100FT = {
  "RG59":   {250: 4.10, 1000: 8.12},
  "RG6":    {250: 3.30, 1000: 6.55},
  "RG11":   {250: 2.05, 1000: 4.35},
  "QR540":  {250: 1.03, 1000: 2.17},
  "P3-500": {250: 1.20, 1000: 2.52},
  "P3-625": {250: 1.00, 1000: 2.07},
  "P3-750": {250: 0.81, 1000: 1.74},
  "P3-875": {250: 0.72, 1000: 1.53},
};

const INTERNAL_DEVICE_LOSS_DB = {
  "2-way splitter": 3.5,
  "DC-8": 8.0,
  "DC-12": 12.0,
};

const FIELD_DEVICE_LOSS_DB = {
  "2-way splitter": 3.5,
  "2-way balanced": 3.5,
  "3-way splitter": 5.5, // your "636"
  "DC-9": 9.0,
  "DC-12": 12.0,
};

const COMMON_TAP_VALUES = [4, 8, 11, 14, 17, 20, 23, 26, 29];

// ---------- State ----------
let internalChain = [];
let fieldChain = [];
let inlineTaps = []; // {value, thru}

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);

function n(val, fallback=0){
  const x = parseFloat(val);
  return Number.isFinite(x) ? x : fallback;
}

function cableLoss(cable, lengthFt, freq){
  const per100 = LOSS_DB_PER_100FT[cable]?.[freq];
  if (!Number.isFinite(per100)) return 0;
  return per100 * (lengthFt / 100.0);
}

function chainLoss(chain, lib){
  return chain.reduce((sum, item) => sum + (lib[item] ?? 0), 0);
}

function inlineThruTotal(){
  return inlineTaps.reduce((sum, t) => sum + (t.thru ?? 0), 0);
}

function meterForFreq(freq){
  return freq === 250 ? n($("meter250").value) : n($("meter1000").value);
}

// ---------- UI populate ----------
function fillSelect(selectEl, values){
  selectEl.innerHTML = "";
  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  });
}

function renderLists(){
  $("internalList").textContent = internalChain.length ? internalChain.join("\n") : "(none)";
  $("fieldList").textContent = fieldChain.length ? fieldChain.join("\n") : "(none)";

  if (!inlineTaps.length){
    $("inlineList").textContent = "(none)";
  } else {
    $("inlineList").textContent = inlineTaps
      .map((t, i) => `${i+1}) ${t.value}v tap (THRU ${t.thru.toFixed(2)} dB)`)
      .join("\n");
  }

  $("internalTotal").textContent = chainLoss(internalChain, INTERNAL_DEVICE_LOSS_DB).toFixed(2);
  $("fieldTotal").textContent = chainLoss(fieldChain, FIELD_DEVICE_LOSS_DB).toFixed(2);
  $("inlineTotal").textContent = inlineThruTotal().toFixed(2);

  saveState();
}

function calc(){
  const mode = $("mode").value; // AT_TAP | UPSTREAM
  const freq = parseInt($("freq").value, 10);
  const meter = meterForFreq(freq);
  const pad = n($("pad").value);

  const cable = $("cable").value;
  const lengthFt = n($("length").value);
  const tapVal = n($("tapVal").value);
  const tapThru = n($("tapThru").value);

  const intLoss = chainLoss(internalChain, INTERNAL_DEVICE_LOSS_DB);
  const fldLoss = chainLoss(fieldChain, FIELD_DEVICE_LOSS_DB);
  const inlineTotal = inlineThruTotal();
  const cbl = cableLoss(cable, lengthFt, freq);

  const startLevel = meter - pad;

  let levelAtTapIn;
  let note;

  if (mode === "AT_TAP"){
    // Your meter reading is at the current tap location
    levelAtTapIn = startLevel;
    note = "Mode: Meter is AT current tap (losses applied AFTER this tap for final).";
  } else {
    // Your meter reading is upstream start level before span
    // Walk forward to get current tap input
    levelAtTapIn = startLevel - cbl - inlineTotal - intLoss - fldLoss;
    note = "Mode: Meter is UPSTREAM start level (losses applied BEFORE current tap).";
  }

  const tapPortLocal = levelAtTapIn - tapVal;
  const thruOutLocal = levelAtTapIn - tapThru;

  // For AT_TAP mode: inline/internal/field/cable are AFTER current tap on THRU path
  // For UPSTREAM mode: we already applied them BEFORE current tap, so final is just local THRU output
  let thruAfterInline, finalLevel;
  if (mode === "AT_TAP"){
    thruAfterInline = thruOutLocal - inlineTotal;
    finalLevel = thruAfterInline - intLoss - fldLoss - cbl;
  } else {
    thruAfterInline = thruOutLocal; // inline already counted before tap in this mode
    finalLevel = thruOutLocal;
  }

  const lines = [];
  lines.push(`Frequency: ${freq} MHz`);
  lines.push(`Meter used: ${meter.toFixed(2)} dBmV`);
  lines.push(`Meter pad removed: -${pad.toFixed(2)} dB`);
  lines.push(note);
  lines.push("");
  lines.push(`Start level (meter-pad): ${startLevel.toFixed(2)} dBmV`);
  lines.push(`Cable loss (${cable}, ${lengthFt.toFixed(0)}ft): ${cbl.toFixed(2)} dB`);
  lines.push(`Inline taps THRU total: ${inlineTotal.toFixed(2)} dB`);
  lines.push(`Internal loss total: ${intLoss.toFixed(2)} dB`);
  lines.push(`Field loss total: ${fldLoss.toFixed(2)} dB`);
  lines.push("");
  lines.push(`LEVEL AT TAP IN: ${levelAtTapIn.toFixed(2)} dBmV`);
  lines.push(`TAP PORT OUTPUT (local): ${tapPortLocal.toFixed(2)} dBmV`);
  lines.push(`THRU OUTPUT (local): ${thruOutLocal.toFixed(2)} dBmV`);
  lines.push(`THRU AFTER INLINE (display): ${thruAfterInline.toFixed(2)} dBmV`);
  lines.push("--------------------------------");
  lines.push(`FINAL LEVEL (THRU path): ${finalLevel.toFixed(2)} dBmV`);

  $("results").textContent = lines.join("\n");
  saveState();
}

// ---------- Storage ----------
const KEY = "catv_calc_pwa_v1";

function saveState(){
  const state = {
    inputs: {
      mode: $("mode").value,
      freq: $("freq").value,
      meter250: $("meter250").value,
      meter1000: $("meter1000").value,
      pad: $("pad").value,
      cable: $("cable").value,
      length: $("length").value,
      tapVal: $("tapVal").value,
      tapThru: $("tapThru").value,
      inlineTapVal: $("inlineTapVal").value,
      inlineTapThru: $("inlineTapThru").value,
      internalPick: $("internalPick").value,
      fieldPick: $("fieldPick").value,
    },
    internalChain,
    fieldChain,
    inlineTaps,
    results: $("results").textContent
  };
  localStorage.setItem(KEY, JSON.stringify(state));
}

function loadState(){
  const raw = localStorage.getItem(KEY);
  if (!raw) return;
  try {
    const state = JSON.parse(raw);
    internalChain = Array.isArray(state.internalChain) ? state.internalChain : [];
    fieldChain = Array.isArray(state.fieldChain) ? state.fieldChain : [];
    inlineTaps = Array.isArray(state.inlineTaps) ? state.inlineTaps : [];

    const i = state.inputs || {};
    if (i.mode) $("mode").value = i.mode;
    if (i.freq) $("freq").value = i.freq;
    if (i.meter250) $("meter250").value = i.meter250;
    if (i.meter1000) $("meter1000").value = i.meter1000;
    if (i.pad) $("pad").value = i.pad;
    if (i.cable) $("cable").value = i.cable;
    if (i.length) $("length").value = i.length;
    if (i.tapVal) $("tapVal").value = i.tapVal;
    if (i.tapThru) $("tapThru").value = i.tapThru;
    if (i.inlineTapVal) $("inlineTapVal").value = i.inlineTapVal;
    if (i.inlineTapThru) $("inlineTapThru").value = i.inlineTapThru;
    if (i.internalPick) $("internalPick").value = i.internalPick;
    if (i.fieldPick) $("fieldPick").value = i.fieldPick;

    if (state.results) $("results").textContent = state.results;

  } catch {
    // ignore
  }
}

// ---------- Events ----------
function bind(){
  $("addInternal").addEventListener("click", () => {
    internalChain.push($("internalPick").value);
    renderLists();
  });
  $("clearInternal").addEventListener("click", () => {
    internalChain = [];
    renderLists();
  });

  $("addField").addEventListener("click", () => {
    fieldChain.push($("fieldPick").value);
    renderLists();
  });
  $("clearField").addEventListener("click", () => {
    fieldChain = [];
    renderLists();
  });

  $("addInline").addEventListener("click", () => {
    inlineTaps.push({
      value: parseFloat($("inlineTapVal").value),
      thru: n($("inlineTapThru").value, 1.5),
    });
    renderLists();
  });
  $("clearInline").addEventListener("click", () => {
    inlineTaps = [];
    renderLists();
  });

  $("calcBtn").addEventListener("click", calc);

  // Auto-save on input changes
  [
    "mode","freq","meter250","meter1000","pad","cable","length",
    "tapVal","tapThru","inlineTapVal","inlineTapThru","internalPick","fieldPick"
  ].forEach(id => {
    $(id).addEventListener("change", saveState);
    $(id).addEventListener("input", saveState);
  });
}

// ---------- Service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// ---------- Init ----------
(function init(){
  fillSelect($("cable"), Object.keys(LOSS_DB_PER_100FT));
  fillSelect($("internalPick"), Object.keys(INTERNAL_DEVICE_LOSS_DB));
  fillSelect($("fieldPick"), Object.keys(FIELD_DEVICE_LOSS_DB));
  fillSelect($("inlineTapVal"), COMMON_TAP_VALUES.map(String));

  // Defaults
  $("cable").value = "P3-500";
  $("internalPick").value = "DC-12";
  $("fieldPick").value = "2-way splitter";
  $("inlineTapVal").value = "11";
  
  bind();
  loadState();
  renderLists();
})();

