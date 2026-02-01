// ============================================================
// CATV PWA Calculator (v3)
// Adds:
// 1) Auto tap THRU lookup (tap + inline taps)
// 2) Inline tap port outputs (per tap)
// 3) LOW/HIGH band toggle (250/1000)
// 4) Pad-compensation checkbox
// 5) Tilt calculator
// 6) Tap chain optimizer (greedy)
// 8) Frequency sweep estimate
// 9) Upstream/return estimate (simple)
// QoL: Copy results, Share snapshot, Night mode
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
  "3-way splitter": 5.5, // your “636”
  "DC-9": 9.0,
  "DC-12": 12.0,
};

const COMMON_TAP_VALUES = [4, 8, 11, 14, 17, 20, 23, 26, 29];

// ---- Tap THRU loss lookup table (editable in code) ----
// These are typical-ish defaults. If your tap chart differs, tell me and we’ll set it.
const TAP_THRU_BY_VALUE = {
  4: 1.2,
  8: 1.4,
  11: 1.5,
  14: 1.6,
  17: 1.7,
  20: 1.8,
  23: 1.9,
  26: 2.0,
  29: 2.1,
};

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

function getFreqFromBand(){
  const band = $("band").value;
  return band === "HIGH" ? 1000 : 250;
}

function padAdjustedMeter(freq){
  const meter = (freq === 250) ? n($("meter250").value) : n($("meter1000").value);
  const pad = n($("pad").value);
  const compensated = $("padComp").checked;
  return compensated ? meter : (meter - pad);
}

function cableLossExact(cable, lengthFt, freq){
  const per100 = LOSS_DB_PER_100FT[cable]?.[freq];
  if (!Number.isFinite(per100)) return 0;
  return per100 * (lengthFt / 100.0);
}

// Estimate loss at arbitrary freq using log interpolation between 250 and 1000.
// For return freqs (<250), extrapolate using same slope.
function cableLossEstimate(cable, lengthFt, freq){
  if (freq === 250 || freq === 1000) return cableLossExact(cable, lengthFt, freq);

  const L250 = LOSS_DB_PER_100FT[cable]?.[250];
  const L1000 = LOSS_DB_PER_100FT[cable]?.[1000];
  if (!Number.isFinite(L250) || !Number.isFinite(L1000)) return 0;

  const x1 = Math.log10(250);
  const x2 = Math.log10(1000);
  const y1 = L250;
  const y2 = L1000;

  const x = Math.log10(freq);
  const y = y1 + (y2 - y1) * ((x - x1) / (x2 - x1)); // linear in log(freq)

  return y * (lengthFt / 100.0);
}

function chainLoss(chain, lib){
  return chain.reduce((sum, item) => sum + (lib[item] ?? 0), 0);
}

function inlineThruTotal(){
  return inlineTaps.reduce((sum, t) => sum + (t.thru ?? 0), 0);
}

function fillSelect(selectEl, values){
  selectEl.innerHTML = "";
  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  });
}

function formatDb(x){ return `${x.toFixed(2)}`; }

function applyTapThruAutofill(){
  if (!$("tapThruAuto").checked) return;
  const tv = n($("tapVal").value);
  if (TAP_THRU_BY_VALUE[tv] != null) $("tapThru").value = TAP_THRU_BY_VALUE[tv].toFixed(2);
}

function applyInlineThruAutofill(){
  if (!$("inlineThruAuto").checked) return;
  const tv = n($("inlineTapVal").value);
  if (TAP_THRU_BY_VALUE[tv] != null) $("inlineTapThru").value = TAP_THRU_BY_VALUE[tv].toFixed(2);
}

// ---------- Render ----------
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

  $("internalTotal").textContent = formatDb(chainLoss(internalChain, INTERNAL_DEVICE_LOSS_DB));
  $("fieldTotal").textContent = formatDb(chainLoss(fieldChain, FIELD_DEVICE_LOSS_DB));
  $("inlineTotal").textContent = formatDb(inlineThruTotal());

  $("freqLabel").textContent = String(getFreqFromBand());
  saveState();
}

// ---------- Core calc ----------
function calc(){
  const mode = $("mode").value; // AT_TAP | UPSTREAM
  const freq = getFreqFromBand();

  const cable = $("cable").value;
  const lengthFt = n($("length").value);

  applyTapThruAutofill(); // keep it synced

  const tapVal = n($("tapVal").value);
  const tapThru = n($("tapThru").value);

  const intLoss = chainLoss(internalChain, INTERNAL_DEVICE_LOSS_DB);
  const fldLoss = chainLoss(fieldChain, FIELD_DEVICE_LOSS_DB);
  const inlineTotal = inlineThruTotal();
  const cblExact = cableLossExact(cable, lengthFt, freq);

  // start level means "meter reading at that freq, with pad handled"
  const startLevel = padAdjustedMeter(freq);

  let levelAtTapIn;
  let note;

  if (mode === "AT_TAP"){
    levelAtTapIn = startLevel;
    note = "Mode: Meter is AT current tap (cable/devices/inline taps are AFTER this tap for final THRU).";
  } else {
    // User wants: start - cable - inline - internal - field => tap input
    levelAtTapIn = startLevel - cblExact - inlineTotal - intLoss - fldLoss;
    note = "Mode: Meter is UPSTREAM start level (cable/devices/inline taps applied BEFORE current tap).";
  }

  const tapPortLocal = levelAtTapIn - tapVal;
  const thruOutLocal = levelAtTapIn - tapThru;

  // Inline tap breakdown (port and thru after each inline tap)
  // This assumes the inline taps are downstream on the THRU path.
  let runningThru = thruOutLocal;
  const inlineBreak = [];
  for (let i=0; i<inlineTaps.length; i++){
    const t = inlineTaps[i];
    const port = runningThru - t.value;
    runningThru = runningThru - t.thru;
    inlineBreak.push(
      `Inline ${i+1}: ${t.value}v | Port ${port.toFixed(2)} dBmV | Thru after ${runningThru.toFixed(2)} dBmV`
    );
  }

  let finalLevel;
  let thruAfterInlineDisplay;

  if (mode === "AT_TAP"){
    // losses after current tap
    thruAfterInlineDisplay = thruOutLocal - inlineTotal;
    finalLevel = thruOutLocal - inlineTotal - intLoss - fldLoss - cblExact;
  } else {
    // losses already included before tap-in
    thruAfterInlineDisplay = thruOutLocal;
    finalLevel = thruOutLocal;
  }

  const lines = [];
  lines.push(`Band/Freq:                  ${$("band").value} / ${freq} MHz`);
  lines.push(`Start level used:           ${startLevel.toFixed(2)} dBmV (pad handling applied)`);
  lines.push(note);
  lines.push("");
  lines.push(`Cable loss (${cable}, ${lengthFt.toFixed(0)}ft @ ${freq}): ${cblExact.toFixed(2)} dB`);
  lines.push(`Inline taps THRU total:     ${inlineTotal.toFixed(2)} dB`);
  lines.push(`Internal loss total:        ${intLoss.toFixed(2)} dB`);
  lines.push(`Field loss total:           ${fldLoss.toFixed(2)} dB`);
  lines.push("");
  lines.push(`LEVEL AT TAP IN:            ${levelAtTapIn.toFixed(2)} dBmV`);
  lines.push(`TAP PORT OUTPUT (local):    ${tapPortLocal.toFixed(2)} dBmV`);
  lines.push(`THRU OUTPUT (local):        ${thruOutLocal.toFixed(2)} dBmV`);
  lines.push(`THRU AFTER INLINE (display):${thruAfterInlineDisplay.toFixed(2)} dBmV`);
  lines.push("");

  lines.push(`INLINE TAP PORTS (from THRU):`);
  lines.push(inlineBreak.length ? inlineBreak.join("\n") : "(none)");
  lines.push("--------------------------------");
  lines.push(`FINAL LEVEL (THRU path):    ${finalLevel.toFixed(2)} dBmV`);

  $("results").textContent = lines.join("\n");
  saveState();
}

// ---------- Tilt / slope ----------
function computeTilt(){
  const m250 = padAdjustedMeter(250);
  const m1000 = padAdjustedMeter(1000);
  const tilt = m1000 - m250;

  const status = (Math.abs(tilt) <= 3)
    ? "OK (low tilt)"
    : (tilt > 3 ? "High is hotter (positive tilt)" : "High is lower (negative tilt)");

  $("tiltOut").textContent =
`Meter@250 (pad-handled):   ${m250.toFixed(2)} dBmV
Meter@1000 (pad-handled):  ${m1000.toFixed(2)} dBmV
Tilt (1000 - 250):         ${tilt.toFixed(2)} dB
Status:                    ${status}`;
}

// ---------- Tap chain optimizer (greedy) ----------
function suggestChain(){
  const startThru = n($("optStart").value);
  const targetPort = n($("optTarget").value);
  const count = Math.max(1, Math.floor(n($("optCount").value, 1)));
  const thruLoss = n($("optThru").value, 1.5);

  let running = startThru;
  const out = [];

  // Greedy: choose tap value that gets closest to target port (running - tap ~= target)
  for (let i=1; i<=count; i++){
    let bestTap = COMMON_TAP_VALUES[0];
    let bestErr = Infinity;

    for (const tv of COMMON_TAP_VALUES){
      const port = running - tv;
      const err = Math.abs(port - targetPort);
      if (err < bestErr){
        bestErr = err;
        bestTap = tv;
      }
    }

    const port = running - bestTap;
    const nextThru = running - thruLoss;

    out.push(`Tap ${i}: ${bestTap}v | Port ${port.toFixed(2)} | Thru next ${nextThru.toFixed(2)}`);
    running = nextThru;
  }

  $("optOut").textContent =
`Start THRU:   ${startThru.toFixed(2)} dBmV
Target port:  ${targetPort.toFixed(2)} dBmV
Taps:         ${count}
Thru loss ea: ${thruLoss.toFixed(2)} dB

${out.join("\n")}

Note: This is a quick greedy suggestion. Real designs also depend on feeder loss between taps and exact tap charts.`;
}

// ---------- Frequency sweep ----------
function buildSweep(){
  const cable = $("cable").value;
  const lengthFt = n($("length").value);

  const freqs = [55, 121, 250, 750, 1000];
  const rows = freqs.map(f => {
    const loss = cableLossEstimate(cable, lengthFt, f);
    return `${String(f).padEnd(4)} MHz : ${loss.toFixed(2)} dB`;
  });

  $("sweepOut").textContent =
`Cable: ${cable}
Length: ${lengthFt.toFixed(0)} ft

Estimated cable loss:
${rows.join("\n")}

(250 and 1000 are exact from your chart. Others are log-interpolated estimates.)`;
}

// ---------- Return estimate ----------
function computeReturn(){
  const cable = $("cable").value;
  const lengthFt = n($("length").value);

  const retFreq = Math.max(5, n($("retFreq").value, 42));
  const target = n($("retTarget").value, 0);

  // Use estimated cable loss at return freq
  const cbl = cableLossEstimate(cable, lengthFt, retFreq);

  // Assume same device losses in reverse (simplified)
  const intLoss = chainLoss(internalChain, INTERNAL_DEVICE_LOSS_DB);
  const fldLoss = chainLoss(fieldChain, FIELD_DEVICE_LOSS_DB);
  const inlineTotal = inlineThruTotal();

  const totalReturnLoss = cbl + intLoss + fldLoss + inlineTotal;

  // Required TX to hit headend target:
  const requiredTx = target + totalReturnLoss;

  $("retOut").textContent =
`Return freq:        ${retFreq.toFixed(1)} MHz
Cable loss est:     ${cbl.toFixed(2)} dB
Inline taps THRU:   ${inlineTotal.toFixed(2)} dB
Internal devices:   ${intLoss.toFixed(2)} dB
Field devices:      ${fldLoss.toFixed(2)} dB
--------------------------------
Total return loss:  ${totalReturnLoss.toFixed(2)} dB

Target @ headend:   ${target.toFixed(2)} dBmV
Required TX (est):  ${requiredTx.toFixed(2)} dBmV

Note: simplified bidirectional loss model; real return depends on passives, diplex, and exact return freqs.`;
}

// ---------- Copy / Share / Night ----------
async function copyResults(){
  const txt = $("results").textContent || "";
  try {
    await navigator.clipboard.writeText(txt);
    $("copyBtn").textContent = "Copied!";
    setTimeout(() => ($("copyBtn").textContent = "Copy results"), 900);
  } catch {
    $("copyBtn").textContent = "Copy failed";
    setTimeout(() => ($("copyBtn").textContent = "Copy results"), 900);
  }
}

async function shareSnapshot(){
  const txt = $("results").textContent || "";
  // share as text (no URLs needed)
  try{
    if (navigator.share){
      await navigator.share({ title: "CATV Calc Snapshot", text: txt });
    } else {
      await navigator.clipboard.writeText(txt);
      alert("Share not supported here — snapshot copied to clipboard.");
    }
  } catch {
    // user canceled or failed; ignore
  }
}

function toggleNight(){
  document.body.classList.toggle("night");
  saveState();
}

// ---------- Storage ----------
const KEY = "catv_calc_pwa_v3";

function saveState(){
  const state = {
    inputs: {
      mode: $("mode").value,
      band: $("band").value,
      meter250: $("meter250").value,
      meter1000: $("meter1000").value,
      pad: $("pad").value,
      padComp: $("padComp").checked,
      cable: $("cable").value,
      length: $("length").value,
      tapVal: $("tapVal").value,
      tapThru: $("tapThru").value,
      tapThruAuto: $("tapThruAuto").checked,
      inlineTapVal: $("inlineTapVal").value,
      inlineTapThru: $("inlineTapThru").value,
      inlineThruAuto: $("inlineThruAuto").checked,
      internalPick: $("internalPick").value,
      fieldPick: $("fieldPick").value,
      optStart: $("optStart").value,
      optTarget: $("optTarget").value,
      optCount: $("optCount").value,
      optThru: $("optThru").value,
      retFreq: $("retFreq").value,
      retTarget: $("retTarget").value,
      night: document.body.classList.contains("night"),
    },
    internalChain,
    fieldChain,
    inlineTaps,
    results: $("results").textContent,
    tiltOut: $("tiltOut").textContent,
    optOut: $("optOut").textContent,
    sweepOut: $("sweepOut").textContent,
    retOut: $("retOut").textContent,
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
    if (i.band) $("band").value = i.band;
    if (i.meter250) $("meter250").value = i.meter250;
    if (i.meter1000) $("meter1000").value = i.meter1000;
    if (i.pad) $("pad").value = i.pad;
    $("padComp").checked = !!i.padComp;

    if (i.cable) $("cable").value = i.cable;
    if (i.length) $("length").value = i.length;
    if (i.tapVal) $("tapVal").value = i.tapVal;
    if (i.tapThru) $("tapThru").value = i.tapThru;
    $("tapThruAuto").checked = (i.tapThruAuto !== false);

    if (i.inlineTapVal) $("inlineTapVal").value = i.inlineTapVal;
    if (i.inlineTapThru) $("inlineTapThru").value = i.inlineTapThru;
    $("inlineThruAuto").checked = (i.inlineThruAuto !== false);

    if (i.internalPick) $("internalPick").value = i.internalPick;
    if (i.fieldPick) $("fieldPick").value = i.fieldPick;

    if (i.optStart) $("optStart").value = i.optStart;
    if (i.optTarget) $("optTarget").value = i.optTarget;
    if (i.optCount) $("optCount").value = i.optCount;
    if (i.optThru) $("optThru").value = i.optThru;

    if (i.retFreq) $("retFreq").value = i.retFreq;
    if (i.retTarget) $("retTarget").value = i.retTarget;

    if (i.night) document.body.classList.add("night");

    if (state.results) $("results").textContent = state.results;
    if (state.tiltOut) $("tiltOut").textContent = state.tiltOut;
    if (state.optOut) $("optOut").textContent = state.optOut;
    if (state.sweepOut) $("sweepOut").textContent = state.sweepOut;
    if (state.retOut) $("retOut").textContent = state.retOut;

  } catch {
    // ignore
  }
}

// ---------- Events ----------
function bind(){
  $("band").addEventListener("change", () => { renderLists(); });
  $("tapVal").addEventListener("input", () => { applyTapThruAutofill(); saveState(); });
  $("tapThruAuto").addEventListener("change", () => { applyTapThruAutofill(); saveState(); });

  $("inlineTapVal").addEventListener("change", () => { applyInlineThruAutofill(); saveState(); });
  $("inlineThruAuto").addEventListener("change", () => { applyInlineThruAutofill(); saveState(); });

  $("addInternal").addEventListener("click", () => { internalChain.push($("internalPick").value); renderLists(); });
  $("clearInternal").addEventListener("click", () => { internalChain = []; renderLists(); });

  $("addField").addEventListener("click", () => { fieldChain.push($("fieldPick").value); renderLists(); });
  $("clearField").addEventListener("click", () => { fieldChain = []; renderLists(); });

  $("addInline").addEventListener("click", () => {
    // auto-fill inline THRU if enabled
    applyInlineThruAutofill();
    inlineTaps.push({
      value: n($("inlineTapVal").value),
      thru: n($("inlineTapThru").value, 1.5),
    });
    renderLists();
  });
  $("clearInline").addEventListener("click", () => { inlineTaps = []; renderLists(); });

  $("calcBtn").addEventListener("click", calc);
  $("copyBtn").addEventListener("click", copyResults);
  $("shareBtn").addEventListener("click", shareSnapshot);
  $("nightBtn").addEventListener("click", toggleNight);

  $("tiltBtn").addEventListener("click", computeTilt);
  $("optBtn").addEventListener("click", suggestChain);
  $("sweepBtn").addEventListener("click", buildSweep);
  $("retBtn").addEventListener("click", computeReturn);

  // Auto-save on changes
  [
    "mode","band","meter250","meter1000","pad","padComp",
    "cable","length","tapVal","tapThru",
    "inlineTapVal","inlineTapThru","internalPick","fieldPick",
    "optStart","optTarget","optCount","optThru",
    "retFreq","retTarget"
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

  // apply autofill after load
  applyTapThruAutofill();
  applyInlineThruAutofill();

  renderLists();
})();

