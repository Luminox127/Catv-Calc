/* CATV Calc — Fresh PWA build (dual-band 250 + 1000)
   - No meter pad (assumed 0 always)
   - Segments (auto cable loss at 250 & 1000)
   - Inline taps (tap value + THRU loss both counted correctly)
   - Internal + Field passives using ATX GigaXtend Line Passives (typ @200 ~ 250, typ @1002 ~ 1000)
   - Modern theme + Tabs + CATV Info + Mini 8-input sum
*/

(() => {
  "use strict";

  // ----------------------------
  // Helpers
  // ----------------------------
  const $ = (sel) => document.querySelector(sel);
  const fmt = (n) => (Number.isFinite(n) ? n.toFixed(2) : "0.00");

  const safeNum = (v) => {
    const n = parseFloat(String(v ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // ----------------------------
  // Data — Cable loss (dB/100ft) at 250 & 1000
  // Using your screenshot values (examples) for common cables.
  // Adjust these anytime.
  // ----------------------------
  const CABLES = [
    { id: "RG59", label: "RG59", loss250: 4.10, loss1000: 8.12 },
    { id: "RG6",  label: "RG6",  loss250: 3.30, loss1000: 6.55 },
    { id: "RG11", label: "RG11", loss250: 2.05, loss1000: 4.35 },
    { id: "QR540", label: "QR540", loss250: 1.03, loss1000: 2.17 },

    { id: "P3-500", label: "P3-500", loss250: 1.20, loss1000: 2.52 },
    { id: "P3-625", label: "P3-625", loss250: 1.00, loss1000: 2.07 },
    { id: "P3-750", label: "P3-750", loss250: 0.81, loss1000: 1.74 },
    { id: "P3-875", label: "P3-875", loss250: 0.72, loss1000: 1.53 },
  ];

  // ----------------------------
  // Data — ATX GigaXtend Line Passives (Insertion Loss, TYP)
  // From your table: using 200 MHz row ~= 250, 1002 MHz row ~= 1000
  // ----------------------------
  const PASSIVES = [
    // Splitters
    { id: "2W_SPL", label: "2-way Splitter (XSC-2-04)", loss250: 4.2, loss1000: 5.0 },
    { id: "3W_BAL", label: "3-way Balanced Splitter (XSC-2-959)", loss250: 4.5, loss1000: 5.1 },
    { id: "3W_UNB", label: "3-way Unbalanced Splitter / 636 (XSC-2-777)", loss250: 6.3, loss1000: 6.9 },

    // Directional couplers (in-out insertion)
    { id: "DC8", label: "DC-8 Coupler (XSC-2-08)", loss250: 2.0, loss1000: 2.4 },
    { id: "DC12", label: "DC-12 Coupler (XSC-2-12)", loss250: 1.4, loss1000: 1.9 },
    { id: "DC16", label: "DC-16 Coupler (XSC-2-16)", loss250: 1.2, loss1000: 1.9 },

    // Power inserter (thru insertion)
    { id: "PI", label: "Power Inserter (XSI-2-20)", loss250: 0.5, loss1000: 0.7 },
  ];

  // Internal devices only (per your request: internal is only 2-way, DC-8, DC-12)
  const INTERNAL_CHOICES = ["2W_SPL", "DC8", "DC12"].map(id => PASSIVES.find(p => p.id === id));

  // Field devices: include 2-way, 3-way balanced, 3-way unbalanced (636), DC-12, DC-9 (we approximate DC-9 using DC-8),
  // and optionally DC-16 + power inserter
  const FIELD_CHOICES = [
    "2W_SPL", "3W_BAL", "3W_UNB", "DC12", "DC8", "DC16", "PI"
  ].map(id => PASSIVES.find(p => p.id === id)).filter(Boolean);

  // ----------------------------
  // State
  // ----------------------------
  let started = false;

  // Wizard answers
  let readingWhere = null; // "tap" or "upstream"
  let meter250 = 0;
  let meter1000 = 0;
  let currentTapValue = 0;     // dB (tap loss)
  let currentTapThru = 0;      // dB (thru loss at current tap)
  let segments = [];           // { cableId, lengthFt }
  let inlineTaps = [];         // { tapValue, thruLoss }
  let internalDevices = [];    // passive id list
  let fieldDevices = [];       // passive id list

  // ----------------------------
  // DOM refs
  // ----------------------------
  const wizardMount = $("#wizardMount");
  const segmentsList = $("#segmentsList");
  const inlineTapsList = $("#inlineTapsList");
  const internalPick = $("#internalPick");
  const fieldPick = $("#fieldPick");
  const internalList = $("#internalList");
  const fieldList = $("#fieldList");
  const resultsBox = $("#resultsBox");

  // ----------------------------
  // Tabs
  // ----------------------------
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("tab--active"));
      btn.classList.add("tab--active");

      const t = btn.dataset.tab;
      $("#tab-calc").classList.toggle("hidden", t !== "calc");
      $("#tab-info").classList.toggle("hidden", t !== "info");
    });
  });

  // ----------------------------
  // Start (audio unlock)
  // ----------------------------
  const bootSound = (() => {
    // Small built-in synth beep (no copyright audio file)
    // iPhone requires user gesture first.
    let ctx = null;
    return {
      play: () => {
        try{
          if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = "sine";
          o.frequency.value = 440;
          g.gain.value = 0.0001;
          o.connect(g); g.connect(ctx.destination);
          o.start();
          // quick "startup chirp"
          g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
          o.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.10);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
          o.stop(ctx.currentTime + 0.2);
        }catch(e){}
      }
    };
  })();

  $("#btnStart").addEventListener("click", () => {
    started = true;
    bootSound.play();
    $("#startStatus").textContent = "Ready ✓";
    $("#startStatus").classList.remove("pill--muted");
    renderWizard();
    // register SW after start (reduces weird cached fail states)
    registerSW();
  });

  // Top buttons
  $("#btnReset").addEventListener("click", () => resetAll(true));
  $("#btnResults").addEventListener("click", () => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  });

  // ----------------------------
  // Build picklists
  // ----------------------------
  function fillSelect(selectEl, list) {
    selectEl.innerHTML = "";
    list.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.label}  (≈${fmt(p.loss250)} @250, ${fmt(p.loss1000)} @1000)`;
      selectEl.appendChild(opt);
    });
  }

  fillSelect(internalPick, INTERNAL_CHOICES);
  fillSelect(fieldPick, FIELD_CHOICES);

  // ----------------------------
  // Wizard UI
  // ----------------------------
  function renderWizard() {
    if (!started) {
      wizardMount.innerHTML = `
        <div class="card">
          <div class="card__title">Wizard Locked</div>
          <div class="card__desc">Tap START above first (iPhone requirement).</div>
        </div>`;
      return;
    }

    wizardMount.innerHTML = "";

    // Step A — where is reading taken
    const stepA = document.createElement("div");
    stepA.className = "card";
    stepA.innerHTML = `
      <div class="card__title">A) Where is your meter reading taken?</div>
      <div class="card__desc">
        <b>At Current Tap</b> = you measured at the current tap port output.<br>
        <b>Upstream</b> = you measured before the run (before segments + inline taps + devices).
      </div>
      <div class="choices">
        <button class="choice" id="pickTap" type="button">
          <b>AT CURRENT TAP</b><span>measured at the tap port</span>
        </button>
        <button class="choice" id="pickUp" type="button">
          <b>UPSTREAM</b><span>measured before losses</span>
        </button>
      </div>
      <div class="divider"></div>
      <div class="row">
        <div class="pill">Selected: <b id="whereSel">${readingWhere ? readingWhere.toUpperCase() : "NONE"}</b></div>
      </div>
    `;
    wizardMount.appendChild(stepA);

    $("#pickTap").onclick = () => { readingWhere = "tap"; renderWizard(); };
    $("#pickUp").onclick = () => { readingWhere = "upstream"; renderWizard(); };

    // Step B — meter levels (dual band)
    const stepB = document.createElement("div");
    stepB.className = "card";
    stepB.innerHTML = `
      <div class="card__title">B) Meter readings (dBmV)</div>
      <div class="card__desc">Enter both levels. The app calculates 250 and 1000 automatically. Meter pad is always 0.</div>
      <div class="row">
        <label class="pill">Meter @250:
          <input class="input input--sm" id="m250" inputmode="decimal" placeholder="ex: 34.5" value="${meter250 || ""}">
        </label>
        <label class="pill">Meter @1000:
          <input class="input input--sm" id="m1000" inputmode="decimal" placeholder="ex: 41" value="${meter1000 || ""}">
        </label>
      </div>
    `;
    wizardMount.appendChild(stepB);

    // Step C — current tap
    const stepC = document.createElement("div");
    stepC.className = "card";
    stepC.innerHTML = `
      <div class="card__title">C) Current tap</div>
      <div class="card__desc">Tap value affects tap port. THRU loss affects thru path.</div>
      <div class="row">
        <label class="pill">Tap value (dB):
          <input class="input input--sm" id="tapVal" inputmode="decimal" placeholder="ex: 4" value="${currentTapValue || ""}">
        </label>
        <label class="pill">Tap THRU loss (dB):
          <input class="input input--sm" id="tapThru" inputmode="decimal" placeholder="ex: 1.5" value="${currentTapThru || ""}">
        </label>
      </div>
      <div class="card__desc">Example: Tap output = upstream level − tap value − inline THRU − devices − cable.</div>
    `;
    wizardMount.appendChild(stepC);

    // Wire inputs
    $("#m250").addEventListener("input", (e) => meter250 = safeNum(e.target.value));
    $("#m1000").addEventListener("input", (e) => meter1000 = safeNum(e.target.value));
    $("#tapVal").addEventListener("input", (e) => currentTapValue = safeNum(e.target.value));
    $("#tapThru").addEventListener("input", (e) => currentTapThru = safeNum(e.target.value));

    // Ensure segments/taps have at least one row to start
    if (segments.length === 0) addSegment();
    if (inlineTaps.length === 0) addInlineTap();
    renderSegments();
    renderInlineTaps();
    renderDeviceLists();
    renderMiniCalc();
  }

  // ----------------------------
  // Segments
  // ----------------------------
  function addSegment() {
    segments.push({ cableId: CABLES[0].id, lengthFt: 0 });
  }

  function clearSegments() {
    segments = [];
    addSegment();
    renderSegments();
  }

  $("#btnAddSeg").addEventListener("click", () => { addSegment(); renderSegments(); });
  $("#btnClearSeg").addEventListener("click", () => { clearSegments(); });

  function renderSegments() {
    segmentsList.innerHTML = "";
    segments.forEach((seg, idx) => {
      const cable = CABLES.find(c => c.id === seg.cableId) || CABLES[0];

      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div class="item__top">
          <div>
            <div class="item__title">Segment ${idx + 1}</div>
            <div class="item__meta">Auto loss uses dB/100ft at 250 & 1000.</div>
          </div>
          <div class="item__actions">
            <button class="iconbtn iconbtn--danger" type="button" data-del="${idx}">Del</button>
          </div>
        </div>

        <div class="row" style="margin-top:10px;">
          <select class="select" data-cable="${idx}">
            ${CABLES.map(c => `<option value="${c.id}" ${c.id === cable.id ? "selected" : ""}>${c.label} ( ${fmt(c.loss250)} @250 / ${fmt(c.loss1000)} @1000 )</option>`).join("")}
          </select>

          <input class="input input--sm" data-len="${idx}" inputmode="decimal" placeholder="Length ft" value="${seg.lengthFt || ""}">
        </div>

        <div class="row" style="margin-top:10px;">
          <div class="pill">This seg loss @250: <b>${fmt((seg.lengthFt/100) * cable.loss250)}</b> dB</div>
          <div class="pill">This seg loss @1000: <b>${fmt((seg.lengthFt/100) * cable.loss1000)}</b> dB</div>
        </div>
      `;
      segmentsList.appendChild(row);
    });

    // handlers
    segmentsList.querySelectorAll("[data-del]").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.getAttribute("data-del"), 10);
        segments.splice(i, 1);
        if (segments.length === 0) addSegment();
        renderSegments();
      });
    });

    segmentsList.querySelectorAll("[data-cable]").forEach(sel => {
      sel.addEventListener("change", () => {
        const i = parseInt(sel.getAttribute("data-cable"), 10);
        segments[i].cableId = sel.value;
        renderSegments();
      });
    });

    segmentsList.querySelectorAll("[data-len]").forEach(inp => {
      inp.addEventListener("input", () => {
        const i = parseInt(inp.getAttribute("data-len"), 10);
        segments[i].lengthFt = safeNum(inp.value);
        renderSegments();
      });
    });
  }

  // ----------------------------
  // Inline taps
  // ----------------------------
  function addInlineTap() {
    inlineTaps.push({ tapValue: 0, thruLoss: 1.5 });
  }

  function clearInlineTaps() {
    inlineTaps = [];
    addInlineTap();
    renderInlineTaps();
  }

  $("#btnAddTap").addEventListener("click", () => { addInlineTap(); renderInlineTaps(); });
  $("#btnClearTap").addEventListener("click", () => { clearInlineTaps(); });

  function renderInlineTaps() {
    inlineTapsList.innerHTML = "";
    inlineTaps.forEach((t, idx) => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="item__top">
          <div>
            <div class="item__title">Inline Tap ${idx + 1}</div>
            <div class="item__meta">THRU loss is subtracted on the thru path.</div>
          </div>
          <div class="item__actions">
            <button class="iconbtn iconbtn--danger" type="button" data-tapdel="${idx}">Del</button>
          </div>
        </div>

        <div class="row" style="margin-top:10px;">
          <label class="pill">Tap value (dB):
            <input class="input input--sm" data-tapv="${idx}" inputmode="decimal" value="${t.tapValue || ""}" placeholder="ex: 11">
          </label>
          <label class="pill">THRU loss (dB):
            <input class="input input--sm" data-tapt="${idx}" inputmode="decimal" value="${t.thruLoss || ""}" placeholder="ex: 1.5">
          </label>
        </div>
      `;
      inlineTapsList.appendChild(el);
    });

    inlineTapsList.querySelectorAll("[data-tapdel]").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.getAttribute("data-tapdel"), 10);
        inlineTaps.splice(i, 1);
        if (inlineTaps.length === 0) addInlineTap();
        renderInlineTaps();
      });
    });

    inlineTapsList.querySelectorAll("[data-tapv]").forEach(inp => {
      inp.addEventListener("input", () => {
        const i = parseInt(inp.getAttribute("data-tapv"), 10);
        inlineTaps[i].tapValue = safeNum(inp.value);
      });
    });
    inlineTapsList.querySelectorAll("[data-tapt]").forEach(inp => {
      inp.addEventListener("input", () => {
        const i = parseInt(inp.getAttribute("data-tapt"), 10);
        inlineTaps[i].thruLoss = safeNum(inp.value);
      });
    });
  }

  // ----------------------------
  // Devices (internal & field)
  // ----------------------------
  function addDevice(list, id) {
    list.push(id);
  }
  function clearDevices(list) {
    list.length = 0;
  }
  function passiveById(id) {
    return PASSIVES.find(p => p.id === id);
  }

  $("#btnAddInternal").addEventListener("click", () => {
    addDevice(internalDevices, internalPick.value);
    renderDeviceLists();
  });
  $("#btnClearInternal").addEventListener("click", () => {
    clearDevices(internalDevices);
    renderDeviceLists();
  });

  $("#btnAddField").addEventListener("click", () => {
    addDevice(fieldDevices, fieldPick.value);
    renderDeviceLists();
  });
  $("#btnClearField").addEventListener("click", () => {
    clearDevices(fieldDevices);
    renderDeviceLists();
  });

  function deviceTotals(devList) {
    let t250 = 0, t1000 = 0;
    devList.forEach(id => {
      const p = passiveById(id);
      if (!p) return;
      t250 += p.loss250;
      t1000 += p.loss1000;
    });
    return { t250, t1000 };
  }

  function renderDeviceLists() {
    internalList.innerHTML = "";
    fieldList.innerHTML = "";

    internalDevices.forEach((id, idx) => {
      const p = passiveById(id);
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="item__top">
          <div>
            <div class="item__title">${p ? p.label : id}</div>
            <div class="item__meta">≈ ${fmt(p?.loss250 ?? 0)} dB @250 • ${fmt(p?.loss1000 ?? 0)} dB @1000</div>
          </div>
          <div class="item__actions">
            <button class="iconbtn iconbtn--danger" type="button" data-idel="${idx}">Del</button>
          </div>
        </div>
      `;
      internalList.appendChild(el);
    });

    fieldDevices.forEach((id, idx) => {
      const p = passiveById(id);
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="item__top">
          <div>
            <div class="item__title">${p ? p.label : id}</div>
            <div class="item__meta">≈ ${fmt(p?.loss250 ?? 0)} dB @250 • ${fmt(p?.loss1000 ?? 0)} dB @1000</div>
          </div>
          <div class="item__actions">
            <button class="iconbtn iconbtn--danger" type="button" data-fdel="${idx}">Del</button>
          </div>
        </div>
      `;
      fieldList.appendChild(el);
    });

    internalList.querySelectorAll("[data-idel]").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.getAttribute("data-idel"), 10);
        internalDevices.splice(i, 1);
        renderDeviceLists();
      });
    });

    fieldList.querySelectorAll("[data-fdel]").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.getAttribute("data-fdel"), 10);
        fieldDevices.splice(i, 1);
        renderDeviceLists();
      });
    });

    const it = deviceTotals(internalDevices);
    const ft = deviceTotals(fieldDevices);

    $("#internal250").textContent = fmt(it.t250);
    $("#internal1000").textContent = fmt(it.t1000);
    $("#field250").textContent = fmt(ft.t250);
    $("#field1000").textContent = fmt(ft.t1000);
  }

  // ----------------------------
  // Mini calc (8 inputs)
  // ----------------------------
  function renderMiniCalc() {
    const mount = $("#miniCalc");
    mount.innerHTML = "";
    for (let i=0;i<8;i++){
      const inp = document.createElement("input");
      inp.className = "input";
      inp.inputMode = "decimal";
      inp.placeholder = `#${i+1}`;
      inp.id = `mini${i}`;
      mount.appendChild(inp);
    }
    $("#miniOut").textContent = "= 0";
  }

  $("#btnMiniSum").addEventListener("click", () => {
    let sum = 0;
    for (let i=0;i<8;i++){
      sum += safeNum($(`#mini${i}`)?.value);
    }
    $("#miniOut").textContent = `= ${fmt(sum)}`;
  });

  // ----------------------------
  // Core math
  // ----------------------------
  function totalCableLoss() {
    let c250 = 0, c1000 = 0;
    segments.forEach(seg => {
      const cable = CABLES.find(c => c.id === seg.cableId) || CABLES[0];
      const L = safeNum(seg.lengthFt);
      c250 += (L/100) * cable.loss250;
      c1000 += (L/100) * cable.loss1000;
    });
    return { c250, c1000 };
  }

  function totalInlineThru() {
    let t = 0;
    inlineTaps.forEach(x => t += safeNum(x.thruLoss));
    return t;
  }

  // We compute BOTH bands.
  // Key idea:
  // If meter is UPSTREAM: tap output = meter - (cable + inlineThru + deviceInsertion + tapValue)
  // If meter is AT TAP (tap port): upstream = meter + (cable + inlineThru + deviceInsertion + tapValue)
  // We also show THRU path at current tap: upstream - (cable + inlineThru + deviceInsertion + currentTapThru)
  function compute() {
    const devI = deviceTotals(internalDevices);
    const devF = deviceTotals(fieldDevices);
    const dev250 = devI.t250 + devF.t250;
    const dev1000 = devI.t1000 + devF.t1000;

    const cable = totalCableLoss();
    const inlineThru = totalInlineThru();
    const tapV = safeNum(currentTapValue);
    const tapThru = safeNum(currentTapThru);

    const out = {
      inputs: {
        readingWhere,
        meter250, meter1000,
        tapV, tapThru,
        inlineThru,
        dev250, dev1000,
        cable250: cable.c250,
        cable1000: cable.c1000
      },
      band250: {},
      band1000: {}
    };

    // Compute for a band
    const calcBand = (meter, dev, cableLoss) => {
      const totalBeforeTap = cableLoss + inlineThru + dev; // losses before current tap
      if (readingWhere === "upstream") {
        const tapPort = meter - totalBeforeTap - tapV;
        const thruAtTap = meter - totalBeforeTap - tapThru; // THRU path at current tap output
        return {
          upstream: meter,
          tapPort,
          thruAtTap,
          totalBeforeTap
        };
      } else if (readingWhere === "tap") {
        // meter reading measured at current tap port output
        const upstream = meter + totalBeforeTap + tapV;
        const thruAtTap = upstream - totalBeforeTap - tapThru;
        return {
          upstream,
          tapPort: meter,
          thruAtTap,
          totalBeforeTap
        };
      } else {
        return null;
      }
    };

    out.band250 = calcBand(meter250, dev250, cable.c250);
    out.band1000 = calcBand(meter1000, dev1000, cable.c1000);
    return out;
  }

  // ----------------------------
  // Render results
  // ----------------------------
  function renderResults() {
    if (!started) {
      resultsBox.textContent = "Tap START to begin (required on iPhone).";
      return;
    }
    if (!readingWhere) {
      resultsBox.textContent = "Select where the meter was taken (AT CURRENT TAP or UPSTREAM).";
      return;
    }

    const r = compute();
    if (!r.band250 || !r.band1000) {
      resultsBox.textContent = "Missing inputs.";
      return;
    }

    const lines = [];

    lines.push(`CATV CALC RESULTS (Dual-band)`);
    lines.push(`Reading location: ${readingWhere.toUpperCase()}`);
    lines.push(`Meter pad: 0 dB (removed)`);
    lines.push(``);

    lines.push(`INPUTS`);
    lines.push(`Meter @250:  ${fmt(r.inputs.meter250)} dBmV`);
    lines.push(`Meter @1000: ${fmt(r.inputs.meter1000)} dBmV`);
    lines.push(`Current tap value: ${fmt(r.inputs.tapV)} dB`);
    lines.push(`Current tap THRU:  ${fmt(r.inputs.tapThru)} dB`);
    lines.push(`Inline taps THRU total: ${fmt(r.inputs.inlineThru)} dB`);
    lines.push(`Internal devices (≈): ${fmt(deviceTotals(internalDevices).t250)} @250 / ${fmt(deviceTotals(internalDevices).t1000)} @1000 dB`);
    lines.push(`Field devices (≈):    ${fmt(deviceTotals(fieldDevices).t250)} @250 / ${fmt(deviceTotals(fieldDevices).t1000)} @1000 dB`);
    lines.push(`Cable loss total:     ${fmt(r.inputs.cable250)} @250 / ${fmt(r.inputs.cable1000)} @1000 dB`);
    lines.push(``);

    const bandBlock = (name, b, cableLoss, devLoss) => {
      lines.push(`--- ${name} ---`);
      lines.push(`Total BEFORE current tap (cable + inlineThru + devices): ${fmt(b.totalBeforeTap)} dB`);
      lines.push(`Cable:   ${fmt(cableLoss)} dB`);
      lines.push(`Devices: ${fmt(devLoss)} dB`);
      lines.push(`Inline THRU: ${fmt(r.inputs.inlineThru)} dB`);
      lines.push(``);
      lines.push(`Upstream level:  ${fmt(b.upstream)} dBmV`);
      lines.push(`Tap port output: ${fmt(b.tapPort)} dBmV`);
      lines.push(`THRU @ tap out:  ${fmt(b.thruAtTap)} dBmV`);
      lines.push(``);
    };

    bandBlock("250 MHz", r.band250, r.inputs.cable250, r.inputs.dev250);
    bandBlock("1000 MHz", r.band1000, r.inputs.cable1000, r.inputs.dev1000);

    // sanity line for the exact logic user asked:
    // upstream - cable - inlineThru - tapValue
    if (readingWhere === "upstream") {
      lines.push(`CHECK (your style): TapPort = Upstream − Cable − InlineThru − Devices − TapValue`);
    } else {
      lines.push(`CHECK: Upstream = TapPort + Cable + InlineThru + Devices + TapValue`);
    }

    resultsBox.textContent = lines.join("\n");
  }

  // Run / Copy
  $("#btnRun").addEventListener("click", () => renderResults());

  $("#btnCopy").addEventListener("click", async () => {
    try{
      await navigator.clipboard.writeText(resultsBox.textContent || "");
      $("#btnCopy").textContent = "COPIED ✓";
      setTimeout(()=> $("#btnCopy").textContent = "COPY", 900);
    }catch(e){
      $("#btnCopy").textContent = "COPY FAILED";
      setTimeout(()=> $("#btnCopy").textContent = "COPY", 900);
    }
  });

  // ----------------------------
  // Reset
  // ----------------------------
  function resetAll(hard = false) {
    readingWhere = null;
    meter250 = 0;
    meter1000 = 0;
    currentTapValue = 0;
    currentTapThru = 0;

    segments = [];
    inlineTaps = [];
    internalDevices = [];
    fieldDevices = [];

    if (started) {
      addSegment();
      addInlineTap();
      renderWizard();
      renderSegments();
      renderInlineTaps();
      renderDeviceLists();
      renderMiniCalc();
      resultsBox.textContent = "Reset complete. Enter inputs then RUN ANALYSIS.";
    } else {
      resultsBox.textContent = "Tap START to begin.";
    }

    // optional: force SW update if hard reset
    if (hard) {
      try{
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
        }
      }catch(e){}
    }
  }

  // ----------------------------
  // Segments & taps defaults (so UI isn't empty)
  // ----------------------------
  addSegment();
  addInlineTap();

  // ----------------------------
  // Wire “Results” and “Reset” top bar already handled
  // ----------------------------

  // ----------------------------
  // Service Worker (safe, versioned cache)
  // ----------------------------
  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }

  // ----------------------------
  // Initial render
  // ----------------------------
  renderWizard();
  renderSegments();
  renderInlineTaps();
  renderDeviceLists();
  renderMiniCalc();
  renderResults();

})();
