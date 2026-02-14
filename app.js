/* CATV Calc — Wizard + Tabs (CATV Calc / CATV Info / AC Power)
   - True questionnaire: one step at a time
   - Dual-band inputs: 250 + 1000 (no frequency chooser)
   - Meter pad removed (always 0)
   - Cable Segments step includes mini 8-input adder
   - Inline taps affect THRU path + tap port math
   - Passives/devices: dropdown picks (edit numbers in arrays below)
*/

(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  const fmt2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : "0.00");
  const num = (v) => {
    const n = parseFloat(String(v ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  // ---------------------------
  // Data (edit anytime)
  // Cable loss = dB per 100 ft at 250 and 1000 (from your screenshots)
  // ---------------------------
  const CABLES = [
    { id: "RG59",  label: "RG59",  loss250: 4.10, loss1000: 8.12 },
    { id: "RG6",   label: "RG6",   loss250: 3.30, loss1000: 6.55 },
    { id: "RG11",  label: "RG11",  loss250: 2.05, loss1000: 4.35 },
    { id: "QR540", label: "QR540", loss250: 1.03, loss1000: 2.17 },

    { id: "P3-500", label: "P3-500", loss250: 1.20, loss1000: 2.52 },
    { id: "P3-625", label: "P3-625", loss250: 1.00, loss1000: 2.07 },
    { id: "P3-750", label: "P3-750", loss250: 0.81, loss1000: 1.74 },
    { id: "P3-875", label: "P3-875", loss250: 0.72, loss1000: 1.53 }
  ];

  // Passives / devices insertion loss (typ values). You can tweak.
  // Internal devices: ONLY 2-way + DC8 + DC12 (per your request).
  const INTERNAL_DEVICES = [
    { id: "INT_NONE", label: "(none)", loss250: 0.00, loss1000: 0.00 },
    { id: "INT_2W",   label: "Internal 2-way splitter", loss250: 4.20, loss1000: 5.00 },
    { id: "INT_DC8",  label: "Internal DC-8",  loss250: 1.60, loss1000: 1.90 },
    { id: "INT_DC12", label: "Internal DC-12", loss250: 2.00, loss1000: 2.30 }
  ];

  // Field devices: 2-way, 3-way balanced, 3-way unbalanced (636), DC9, DC12
  const FIELD_DEVICES = [
    { id: "FLD_NONE", label: "(none)", loss250: 0.00, loss1000: 0.00 },
    { id: "FLD_2W",   label: "2-way splitter", loss250: 4.20, loss1000: 5.00 },
    { id: "FLD_3W_BAL", label: "3-way balanced splitter", loss250: 4.50, loss1000: 5.10 },
    { id: "FLD_636",  label: "3-way unbalanced (636)", loss250: 6.30, loss1000: 6.90 },
    { id: "FLD_DC9",  label: "Directional coupler / DC-9",  loss250: 1.70, loss1000: 2.00 },
    { id: "FLD_DC12", label: "Directional coupler / DC-12", loss250: 2.00, loss1000: 2.30 }
  ];

  // Inline taps list. Tap value affects TAP PORT output.
  // THRU loss affects THRU path (and should also be subtracted when you want “tap port inline thru result”)
  const TAP_VALUES = [4, 8, 11, 14, 17, 20, 23, 26, 29];

  // ---------------------------
  // State
  // ---------------------------
  const S = {
    tab: "calc", // calc | info | ac
    started: false,

    // Wizard
    step: 0,

    // Inputs
    readingPlace: "", // "tap" | "upstream"
    meter250: "",
    meter1000: "",

    currentTapValue: "",
    currentTapThru: "",

    internalDeviceId: "INT_NONE",
    fieldDeviceId: "FLD_NONE",

    // Inline taps list (in the run)
    inlineTapValue: 11,
    inlineTapThru: 1.50,
    inlineTaps: [], // [{tapValue, thruLoss}...]

    // Cable segments
    segCableId: "P3-500",
    segLenFt: "",
    segments: [], // [{cableId, lenFt}]

    // Mini adder (8 inputs)
    adders: Array.from({ length: 8 }, () => ""),

    // AC power calc tab
    acSupplyV: "90",
    acLoadA: "5",
    acLenFt: "1000",
    acType: "0.500",
    // default "volts drop per 1000ft per amp" — user editable
    acDropPer1000ftPerAmp: {
      "0.500": 1.60,
      "0.625": 1.25,
      "0.750": 1.00,
      "0.875": 0.85
    }
  };

  // ---------------------------
  // Math
  // ---------------------------
  function cableLossFor(cableId, lenFt, band) {
    const c = CABLES.find(x => x.id === cableId) || CABLES[0];
    const per100 = band === 250 ? c.loss250 : c.loss1000;
    return (per100 * (lenFt / 100));
  }

  function deviceLoss(deviceId, band) {
    const all = [...INTERNAL_DEVICES, ...FIELD_DEVICES];
    const d = all.find(x => x.id === deviceId);
    if (!d) return 0;
    return band === 250 ? d.loss250 : d.loss1000;
  }

  function sumSegments(band) {
    return S.segments.reduce((acc, seg) => {
      const len = Number(seg.lenFt) || 0;
      return acc + cableLossFor(seg.cableId, len, band);
    }, 0);
  }

  function sumInlineThru() {
    return S.inlineTaps.reduce((acc, t) => acc + (Number(t.thruLoss) || 0), 0);
  }

  function computeBand(band) {
    const meter = band === 250 ? num(S.meter250) : num(S.meter1000);

    const tapValue = num(S.currentTapValue);
    const currentTapThru = num(S.currentTapThru);

    const internalLoss = deviceLoss(S.internalDeviceId, band);
    const fieldLoss = deviceLoss(S.fieldDeviceId, band);

    const inlineThru = sumInlineThru();
    const cableLoss = sumSegments(band);

    // Interpretation:
    // If your reading is UPSTREAM: it’s before segments + inline taps + devices + current tap.
    // If your reading is AT TAP: it’s at the current tap port (local) and already includes upstream-to-tap path.
    //
    // Output we show:
    // - TAP PORT output at current tap
    // - THRU output at current tap (after current tap thru loss)
    // - THRU after inline taps + devices + cable segments (end of run)
    //
    // The user’s earlier expectation:
    // tap port output = meter - (inline THRU taps) - (tap value) - (devices) - (cable)  (when using upstream)
    //
    // We’ll implement:
    // If UPSTREAM:
    //   level_at_tap_in = meter - inlineThru - internalLoss - fieldLoss - cableLoss
    //   tap_port_out = level_at_tap_in - tapValue
    //   thru_out_at_current = level_at_tap_in - currentTapThru
    //
    // If AT TAP:
    //   level_at_tap_in = meter (meaning: measured at current tap port? we treat as tap port level)
    //   tap_port_out = meter (already the port)
    //   To get "equivalent upstream": add back tapValue (optional). We’ll keep it simple:
    //   thru_out_at_current = (meter + tapValue) - currentTapThru
    //
    let levelAtTapIn, tapPortOut, thruOutAtCurrent, thruAfterRun;

    if (S.readingPlace === "upstream") {
      levelAtTapIn = meter - inlineThru - internalLoss - fieldLoss - cableLoss;
      tapPortOut = levelAtTapIn - tapValue;
      thruOutAtCurrent = levelAtTapIn - currentTapThru;
      // after current tap thru, nothing else to subtract (because inline taps / devices / cable were before reaching this tap)
      thruAfterRun = thruOutAtCurrent;
    } else {
      // AT TAP (local): meter is tap port output at the current tap
      tapPortOut = meter;
      // estimate tap-in by adding tap value back (tap port = tap-in - tap value)
      levelAtTapIn = meter + tapValue;
      thruOutAtCurrent = levelAtTapIn - currentTapThru;
      // THRU after run from this point would subtract devices+segments? But those are upstream of current tap in most cases.
      // We keep “thruAfterRun” same as thruOutAtCurrent for AT TAP mode.
      thruAfterRun = thruOutAtCurrent;
    }

    return {
      band,
      meter,
      levelAtTapIn,
      tapPortOut,
      thruOutAtCurrent,
      thruAfterRun,
      inlineThru,
      internalLoss,
      fieldLoss,
      cableLoss
    };
  }

  function miniAdderSum() {
    return S.adders.reduce((acc, v) => acc + num(v), 0);
  }

  // AC power calc (simple model):
  // Vdrop = (lenFt / 1000) * amps * (dropPer1000ftPerAmp)
  function acPowerCalc() {
    const Vs = num(S.acSupplyV);
    const A = num(S.acLoadA);
    const L = num(S.acLenFt);
    const t = S.acType;
    const k = Number(S.acDropPer1000ftPerAmp[t]) || 0;
    const vdrop = (L / 1000) * A * k;
    const vout = Vs - vdrop;
    return { Vs, A, L, t, k, vdrop, vout };
  }

  // ---------------------------
  // Wizard steps
  // ---------------------------
  const STEPS = [
    {
      key: "place",
      title: "A) Where is your meter reading taken?",
      render: () => `
        <div class="help">
          <b>UPSTREAM</b> = measured before losses (before segments + inline taps + devices).<br/>
          <b>AT CURRENT TAP</b> = measured at the current tap port output.
        </div>
        <div class="choiceRow" style="margin-top:12px;">
          <div class="choice" data-pick="tap">
            <div class="title">AT CURRENT TAP</div>
            <div class="desc">measured at the tap port</div>
          </div>
          <div class="choice" data-pick="upstream">
            <div class="title">UPSTREAM</div>
            <div class="desc">measured before losses</div>
          </div>
        </div>
        <div style="margin-top:10px;" class="badge">Selected: ${S.readingPlace ? S.readingPlace.toUpperCase() : "NONE"}</div>
      `,
      bind: (root) => {
        root.querySelectorAll("[data-pick]").forEach(el => {
          el.addEventListener("click", () => {
            S.readingPlace = el.getAttribute("data-pick");
            render();
          });
        });
      },
      canNext: () => !!S.readingPlace
    },
    {
      key: "meters",
      title: "B) Meter readings (dBmV)",
      render: () => `
        <div class="help">Enter both levels. No meter pad (assumed 0 always).</div>
        <div class="row" style="margin-top:12px;">
          <div class="field">
            <label>Meter @250 (dBmV)</label>
            <input id="m250" inputmode="decimal" placeholder="ex: 34.5" value="${escapeHtml(S.meter250)}" />
          </div>
          <div class="field">
            <label>Meter @1000 (dBmV)</label>
            <input id="m1000" inputmode="decimal" placeholder="ex: 41" value="${escapeHtml(S.meter1000)}" />
          </div>
        </div>
      `,
      bind: () => {
        $("#m250").addEventListener("input", (e) => { S.meter250 = e.target.value; });
        $("#m1000").addEventListener("input", (e) => { S.meter1000 = e.target.value; });
      },
      canNext: () => (String(S.meter250).trim() !== "" && String(S.meter1000).trim() !== "")
    },
    {
      key: "currentTap",
      title: "C) Current tap",
      render: () => `
        <div class="help">
          Tap value affects the tap port. THRU loss affects the thru path at the current tap.
        </div>
        <div class="row" style="margin-top:12px;">
          <div class="field">
            <label>Tap value (dB)</label>
            <select id="tapVal">
              <option value="">Select…</option>
              ${TAP_VALUES.map(v => `<option value="${v}" ${String(S.currentTapValue)===String(v)?"selected":""}>${v}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Tap THRU loss (dB)</label>
            <input id="tapThru" inputmode="decimal" placeholder="ex: 1.5" value="${escapeHtml(S.currentTapThru)}" />
          </div>
        </div>
      `,
      bind: () => {
        $("#tapVal").addEventListener("change", (e) => { S.currentTapValue = e.target.value; });
        $("#tapThru").addEventListener("input", (e) => { S.currentTapThru = e.target.value; });
      },
      canNext: () => (String(S.currentTapValue).trim() !== "" && String(S.currentTapThru).trim() !== "")
    },
    {
      key: "devices",
      title: "D) Devices (internal + field)",
      render: () => `
        <div class="help">Choose what’s in-line on the run.</div>
        <div class="row" style="margin-top:12px;">
          <div class="field">
            <label>Internal device</label>
            <select id="internalSel">
              ${INTERNAL_DEVICES.map(d => `<option value="${d.id}" ${S.internalDeviceId===d.id?"selected":""}>${d.label}</option>`).join("")}
            </select>
            <small>Internal allowed: 2-way + DC8 + DC12</small>
          </div>
          <div class="field">
            <label>Field device</label>
            <select id="fieldSel">
              ${FIELD_DEVICES.map(d => `<option value="${d.id}" ${S.fieldDeviceId===d.id?"selected":""}>${d.label}</option>`).join("")}
            </select>
            <small>Field: 2-way / 3-way balanced / 636 / DC9 / DC12</small>
          </div>
        </div>
      `,
      bind: () => {
        $("#internalSel").addEventListener("change", (e) => { S.internalDeviceId = e.target.value; });
        $("#fieldSel").addEventListener("change", (e) => { S.fieldDeviceId = e.target.value; });
      },
      canNext: () => true
    },
    {
      key: "inline",
      title: "E) Inline taps (in the run)",
      render: () => `
        <div class="help">Add any taps you pass through before the current tap.</div>

        <div class="row" style="margin-top:12px;">
          <div class="field">
            <label>Inline tap value (dB)</label>
            <select id="inTapVal">
              ${TAP_VALUES.map(v => `<option value="${v}" ${Number(S.inlineTapValue)===Number(v)?"selected":""}>${v}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Inline tap THRU loss (dB)</label>
            <input id="inTapThru" inputmode="decimal" placeholder="ex: 1.5" value="${escapeHtml(S.inlineTapThru)}" />
          </div>
          <div class="field" style="min-width:180px; flex:0;">
            <label>&nbsp;</label>
            <button class="btn primary" id="addInline">Add inline tap</button>
          </div>
        </div>

        <div class="hr"></div>

        <div class="list">
          ${S.inlineTaps.length ? S.inlineTaps.map((t, i) => `
            <div class="item">
              <div>
                <div><b>${fmt2(t.tapValue)} dB</b> tap <span class="meta">(THRU ${fmt2(t.thruLoss)} dB)</span></div>
              </div>
              <button class="x" data-rm-inline="${i}">X</button>
            </div>
          `).join("") : `<div class="help">(none)</div>`}
        </div>

        <div style="margin-top:10px;" class="badge">
          Inline THRU total: <b>${fmt2(sumInlineThru())} dB</b>
        </div>

        <div class="navRow">
          <div class="left">
            <button class="btn" id="clearInline">Clear inline taps</button>
          </div>
          <div class="right"></div>
        </div>
      `,
      bind: () => {
        $("#inTapVal").addEventListener("change", (e) => { S.inlineTapValue = Number(e.target.value); });
        $("#inTapThru").addEventListener("input", (e) => { S.inlineTapThru = e.target.value; });

        $("#addInline").addEventListener("click", () => {
          const v = Number(S.inlineTapValue);
          const thr = num(S.inlineTapThru);
          S.inlineTaps.push({ tapValue: v, thruLoss: thr });
          render();
        });

        $("#clearInline").addEventListener("click", () => {
          S.inlineTaps = [];
          render();
        });

        document.querySelectorAll("[data-rm-inline]").forEach(btn => {
          btn.addEventListener("click", () => {
            const idx = Number(btn.getAttribute("data-rm-inline"));
            S.inlineTaps.splice(idx, 1);
            render();
          });
        });
      },
      canNext: () => true
    },
    {
      key: "segments",
      title: "F) Cable segments",
      render: () => `
        <div class="help">Add segments. The app totals cable loss at 250 + 1000 automatically.</div>

        <div class="row" style="margin-top:12px;">
          <div class="field">
            <label>Cable type</label>
            <select id="segCable">
              ${CABLES.map(c => `<option value="${c.id}" ${S.segCableId===c.id?"selected":""}>${c.label}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Length (ft)</label>
            <input id="segLen" inputmode="numeric" placeholder="ex: 814" value="${escapeHtml(S.segLenFt)}" />
          </div>
          <div class="field" style="min-width:180px; flex:0;">
            <label>&nbsp;</label>
            <button class="btn primary" id="addSeg">Add segment</button>
          </div>
        </div>

        <div class="hr"></div>

        <div class="list">
          ${S.segments.length ? S.segments.map((s, i) => {
            const c = CABLES.find(x => x.id === s.cableId) || CABLES[0];
            return `
              <div class="item">
                <div>
                  <div><b>${c.label}</b> — ${fmt2(Number(s.lenFt)||0)} ft</div>
                  <div class="meta">
                    loss@250: ${fmt2(cableLossFor(s.cableId, Number(s.lenFt)||0, 250))} dB •
                    loss@1000: ${fmt2(cableLossFor(s.cableId, Number(s.lenFt)||0, 1000))} dB
                  </div>
                </div>
                <button class="x" data-rm-seg="${i}">X</button>
              </div>
            `;
          }).join("") : `<div class="help">(none)</div>`}
        </div>

        <div style="margin-top:10px;" class="kpi">
          <div class="k"><div class="t">Total cable loss @250</div><div class="v">${fmt2(sumSegments(250))} dB</div></div>
          <div class="k"><div class="t">Total cable loss @1000</div><div class="v">${fmt2(sumSegments(1000))} dB</div></div>
        </div>

        <div class="hr"></div>

        <div class="card" style="margin-bottom:0;">
          <h2>Mini add calculator (up to 8 inputs)</h2>
          <div class="help">Quickly sum multiple numbers: 3+4+2+8+4+6+5+5</div>
          <div class="row" style="margin-top:10px;">
            ${S.adders.map((v, idx) => `
              <div class="field" style="min-width:120px; flex:0;">
                <label>#${idx+1}</label>
                <input class="adder" data-adder="${idx}" inputmode="decimal" placeholder="0" value="${escapeHtml(v)}" />
              </div>
            `).join("")}
          </div>
          <div class="navRow">
            <div class="left">
              <button class="btn" id="clearAdd">Clear</button>
            </div>
            <div class="right">
              <span class="badge">Sum: <b>${fmt2(miniAdderSum())}</b></span>
            </div>
          </div>
        </div>

        <div class="navRow">
          <div class="left">
            <button class="btn" id="clearSegs">Clear segments</button>
          </div>
          <div class="right"></div>
        </div>
      `,
      bind: () => {
        $("#segCable").addEventListener("change", (e) => { S.segCableId = e.target.value; });
        $("#segLen").addEventListener("input", (e) => { S.segLenFt = e.target.value; });

        $("#addSeg").addEventListener("click", () => {
          const len = num(S.segLenFt);
          if (len <= 0) return;
          S.segments.push({ cableId: S.segCableId, lenFt: len });
          S.segLenFt = "";
          render();
        });

        $("#clearSegs").addEventListener("click", () => {
          S.segments = [];
          render();
        });

        document.querySelectorAll("[data-rm-seg]").forEach(btn => {
          btn.addEventListener("click", () => {
            const idx = Number(btn.getAttribute("data-rm-seg"));
            S.segments.splice(idx, 1);
            render();
          });
        });

        document.querySelectorAll(".adder").forEach(inp => {
          inp.addEventListener("input", () => {
            const idx = Number(inp.getAttribute("data-adder"));
            S.adders[idx] = inp.value;
            render(false); // soft render (don’t jump)
          });
        });

        $("#clearAdd").addEventListener("click", () => {
          S.adders = Array.from({ length: 8 }, () => "");
          render();
        });
      },
      canNext: () => true
    },
    {
      key: "results",
      title: "G) Results",
      render: () => {
        const r250 = computeBand(250);
        const r1000 = computeBand(1000);

        const summary = `
=== INPUTS ===
Reading place: ${S.readingPlace.toUpperCase()}
Meter @250:  ${fmt2(num(S.meter250))} dBmV
Meter @1000: ${fmt2(num(S.meter1000))} dBmV

Current tap:
  Tap value: ${fmt2(num(S.currentTapValue))} dB
  Tap THRU:  ${fmt2(num(S.currentTapThru))} dB

Inline taps THRU total: ${fmt2(sumInlineThru())} dB
Internal device loss:   @250 ${fmt2(r250.internalLoss)} dB | @1000 ${fmt2(r1000.internalLoss)} dB
Field device loss:      @250 ${fmt2(r250.fieldLoss)} dB | @1000 ${fmt2(r1000.fieldLoss)} dB
Cable loss total:       @250 ${fmt2(r250.cableLoss)} dB | @1000 ${fmt2(r1000.cableLoss)} dB

=== RESULTS (@250) ===
Level at TAP IN:        ${fmt2(r250.levelAtTapIn)} dBmV
Tap port output:        ${fmt2(r250.tapPortOut)} dBmV
THRU output (current):  ${fmt2(r250.thruOutAtCurrent)} dBmV

=== RESULTS (@1000) ===
Level at TAP IN:        ${fmt2(r1000.levelAtTapIn)} dBmV
Tap port output:        ${fmt2(r1000.tapPortOut)} dBmV
THRU output (current):  ${fmt2(r1000.thruOutAtCurrent)} dBmV
        `.trim();

        return `
          <div class="kpi">
            <div class="k"><div class="t">Tap port @250</div><div class="v">${fmt2(r250.tapPortOut)} dBmV</div></div>
            <div class="k"><div class="t">Tap port @1000</div><div class="v">${fmt2(r1000.tapPortOut)} dBmV</div></div>
            <div class="k"><div class="t">Inline THRU total</div><div class="v">${fmt2(sumInlineThru())} dB</div></div>
          </div>
          <div class="hr"></div>
          <div class="results" id="resBox">${escapeHtml(summary)}</div>
          <div class="navRow">
            <div class="left"></div>
            <div class="right">
              <button class="btn" id="copyRes">Copy</button>
            </div>
          </div>
        `;
      },
      bind: () => {
        $("#copyRes").addEventListener("click", async () => {
          const text = $("#resBox").textContent;
          try { await navigator.clipboard.writeText(text); } catch {}
        });
      },
      canNext: () => false
    }
  ];

  // ---------------------------
  // UI shell
  // ---------------------------
  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function render(keepScroll=true){
    const root = $("#app");
    if (!root) return;

    root.innerHTML = `
      <div class="wrap">
        <div class="topbar">
          <div class="brand">
            <h1>CATV Calc</h1>
            <div class="sub">Dual-band (250 + 1000) • Wizard (one step at a time) • Segments</div>
          </div>
          <div class="actions">
            <button class="btn" id="btnResults">Results</button>
            <button class="btn" id="btnReset">Reset</button>
          </div>
        </div>

        <div class="tabs">
          <div class="tab ${S.tab==="calc"?"active":""}" data-tab="calc">CATV Calc</div>
          <div class="tab ${S.tab==="info"?"active":""}" data-tab="info">CATV Info</div>
          <div class="tab ${S.tab==="ac"?"active":""}" data-tab="ac">AC Power</div>
        </div>

        ${S.tab==="calc" ? renderCalc() : S.tab==="info" ? renderInfo() : renderAC()}
      </div>
    `;

    // bind tabs
    document.querySelectorAll("[data-tab]").forEach(t => {
      t.addEventListener("click", () => { S.tab = t.getAttribute("data-tab"); render(); });
    });

    // results / reset
    $("#btnReset").addEventListener("click", () => {
      // keep theme/tab but reset calc wizard inputs
      const tab = S.tab;
      Object.assign(S, {
        tab,
        started: false,
        step: 0,
        readingPlace: "",
        meter250: "",
        meter1000: "",
        currentTapValue: "",
        currentTapThru: "",
        internalDeviceId: "INT_NONE",
        fieldDeviceId: "FLD_NONE",
        inlineTapValue: 11,
        inlineTapThru: 1.50,
        inlineTaps: [],
        segCableId: "P3-500",
        segLenFt: "",
        segments: [],
        adders: Array.from({ length: 8 }, () => "")
      });
      render();
    });

    $("#btnResults").addEventListener("click", () => {
      S.tab = "calc";
      S.step = STEPS.length - 1;
      render();
    });

    if (!keepScroll) return;
  }

  function renderCalc(){
    const stepObj = STEPS[S.step];
    return `
      <div class="card">
        <h2>START</h2>
        <div class="help">Tap START once to unlock the wizard (and enable audio later if you add sounds). iPhone requires a user tap.</div>
        <div class="navRow" style="margin-top:10px;">
          <div class="left">
            <button class="btn primary" id="btnStart">${S.started ? "Ready ✓" : "START"}</button>
            <span class="pill">${S.started ? "Wizard unlocked" : "Locked until tap"}</span>
          </div>
          <div class="right">
            <span class="stepBadge">Step ${S.step+1} / ${STEPS.length}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>${stepObj.title}</h2>
        ${!S.started ? `<div class="help"><b>Tap START first.</b></div>` : stepObj.render()}
        ${renderNav(stepObj)}
      </div>
    `;
  }

  function renderNav(stepObj){
    if (!S.started) return "";

    const isLast = (S.step === STEPS.length - 1);

    const canBack = S.step > 0;
    const canNext = !isLast && stepObj.canNext();

    return `
      <div class="navRow">
        <div class="left">
          <button class="btn" id="btnBack" ${canBack ? "" : "disabled"}>Back</button>
        </div>
        <div class="right">
          ${!isLast ? `<button class="btn primary" id="btnNext" ${canNext ? "" : "disabled"}>Next</button>` : ``}
        </div>
      </div>
    `;
  }

  function renderInfo(){
    return `
      <div class="card">
        <h2>CATV Info</h2>
        <div class="help">
          Quick references you wanted in-app. (We can add more pages like “Ingress/Noise”, “MER/BER”, “High-split notes”, etc.)
        </div>
        <div class="hr"></div>

        <div class="card" style="margin-bottom:14px;">
          <h2>Humping</h2>
          <div class="help">A signal build-up in the midband. Often caused by over-equalizing a cascade or correcting roll-off too hard.</div>
        </div>

        <div class="card" style="margin-bottom:14px;">
          <h2>Reflections (standing waves)</h2>
          <div class="help">
            Symmetrical peaks/valleys across the band. Most common with impedance mismatches (not 75Ω) and bidirectional testpoints.
          </div>
        </div>

        <div class="card" style="margin-bottom:14px;">
          <h2>Roll-off</h2>
          <div class="help">
            Response level drop near band edges. Causes: loose connectors, loose modules, diplex issues, bad splices, wrong-band passives.
          </div>
        </div>

        <div class="card">
          <h2>Notch</h2>
          <div class="help">
            Sharp negative dip. Often connector/faceplate issues, amplifier module issues, or grounding/bonding problems.
          </div>
        </div>

        <div class="hr"></div>

        <div class="card">
          <h2>Standing wave fault distance (forward sweep)</h2>
          <div class="help">
            Formula from the handbook:
          </div>
          <div class="results" style="margin-top:10px;">
D = 492 (Vp / F)

D  = distance to fault (feet)
492 = constant factor (use 149 for meters)
Vp = velocity of propagation (% speed of light)
F  = frequency width (MHz) of one cycle
          </div>
        </div>
      </div>
    `;
  }

  function renderAC(){
    const r = acPowerCalc();
    return `
      <div class="card">
        <h2>AC Powering (simple voltage drop)</h2>
        <div class="help">
          This is a straightforward model: Vdrop = (ft/1000) × amps × (drop per 1000ft per amp).<br/>
          You can tweak the default “drop per 1000ft per amp” values to match your plant/company chart.
        </div>

        <div class="row" style="margin-top:12px;">
          <div class="field">
            <label>Supply voltage (VAC)</label>
            <input id="acVs" inputmode="decimal" value="${escapeHtml(S.acSupplyV)}" />
          </div>
          <div class="field">
            <label>Load current (A)</label>
            <input id="acA" inputmode="decimal" value="${escapeHtml(S.acLoadA)}" />
          </div>
          <div class="field">
            <label>Length (ft)</label>
            <input id="acL" inputmode="numeric" value="${escapeHtml(S.acLenFt)}" />
          </div>
          <div class="field">
            <label>Cable size</label>
            <select id="acType">
              ${["0.500","0.625","0.750","0.875"].map(t => `<option value="${t}" ${S.acType===t?"selected":""}>${t}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="row" style="margin-top:12px;">
          <div class="field">
            <label>Drop per 1000ft per amp (V / 1000ft / A)</label>
            <input id="acK" inputmode="decimal" value="${escapeHtml(String(S.acDropPer1000ftPerAmp[S.acType]))}" />
            <small>Editable default. Set this to your known chart value.</small>
          </div>
        </div>

        <div class="hr"></div>

        <div class="kpi">
          <div class="k"><div class="t">Voltage drop</div><div class="v">${fmt2(r.vdrop)} V</div></div>
          <div class="k"><div class="t">Estimated output</div><div class="v">${fmt2(r.vout)} VAC</div></div>
        </div>
      </div>
    `;
  }

  function bindCalc(){
    // Start
    $("#btnStart").addEventListener("click", () => {
      S.started = true;
      render();
    });

    if (!S.started) return;

    // step content bindings
    const stepObj = STEPS[S.step];
    stepObj.bind(document);

    // nav
    const back = $("#btnBack");
    if (back) back.addEventListener("click", () => {
      if (S.step > 0) S.step--;
      render();
    });

    const next = $("#btnNext");
    if (next) next.addEventListener("click", () => {
      if (S.step < STEPS.length - 1 && stepObj.canNext()) {
        S.step++;
        render();
      }
    });
  }

  function bindAC(){
    if (!$("#acVs")) return;
    $("#acVs").addEventListener("input", e => { S.acSupplyV = e.target.value; render(false); });
    $("#acA").addEventListener("input", e => { S.acLoadA = e.target.value; render(false); });
    $("#acL").addEventListener("input", e => { S.acLenFt = e.target.value; render(false); });

    $("#acType").addEventListener("change", e => {
      S.acType = e.target.value;
      render();
    });

    $("#acK").addEventListener("input", e => {
      const v = num(e.target.value);
      S.acDropPer1000ftPerAmp[S.acType] = v;
      render(false);
    });
  }

  function bindAll(){
    if (S.tab === "calc") bindCalc();
    if (S.tab === "ac") bindAC();
  }

  // rebind after every render
  const _render = render;
  render = (keepScroll=true) => {
    _render(keepScroll);
    bindAll();
  };

  // initial
  render();
})();
