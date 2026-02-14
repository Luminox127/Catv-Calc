/*  CATV Calc — Questionnaire Wizard + Tabs (CATV Calc / CATV Info / AC Power)
    - Mobile-first, tap-only (no typing except numbers)
    - Dual-band inputs: 250 + 1000 (no frequency chooser)
    - Meter pad removed (always 0)
    - Cable segments step supports multiple segments + mini 8-input adder
    - Inline taps: counts THRU losses correctly (THRU path) + optional current tap THRU loss
    - Current tap value affects TAP PORT output (and can be used for “tap-port expectation”)
    - Passives (field/internal): choose from list; each has loss @250 and @1000
    - CATV Info tab: your “Humping / Reflections / Roll-off / Notch” + standing-wave distance formula
    - AC Power tab: voltage drop + pass/fail to 60/63/70/75/87/90VAC targets (simple model)
*/

(() => {
  "use strict";

  // ---------------------------
  // Helpers
  // ---------------------------
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  };
  const safeNum = (v) => {
    const n = parseFloat(String(v ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "0.00");
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // ---------------------------
  // Data: Cable loss (dB / 100 ft) @ 250 and @ 1000
  // From your screenshots (examples). Tweak anytime.
  // ---------------------------
  const CABLES = [
    { id: "RG59", label: "RG59", loss250: 4.10, loss1000: 8.12 },
    { id: "RG6", label: "RG6", loss250: 3.30, loss1000: 6.55 },
    { id: "RG11", label: "RG11", loss250: 2.05, loss1000: 4.35 },
    { id: "QR540", label: "QR540", loss250: 1.03, loss1000: 2.17 },
    { id: "P3-500", label: "P3-500", loss250: 1.20, loss1000: 2.52 },
    { id: "P3-625", label: "P3-625", loss250: 1.00, loss1000: 2.07 },
    { id: "P3-750", label: "P3-750", loss250: 0.81, loss1000: 1.74 },
    { id: "P3-875", label: "P3-875", loss250: 0.72, loss1000: 1.53 },
  ];

  // ---------------------------
  // Data: Inline tap THRU loss defaults (dB) — if you want a default
  // You can still override per tap in UI.
  // ---------------------------
  const DEFAULT_INLINE_THRU_DB = 1.5;

  // ---------------------------
  // Data: Passives (loss @250 and @1000)
  // NOTE: replace numbers with your exact ATX table if you want.
  // These are “reasonable defaults” and can be edited later.
  // ---------------------------
  const PASSIVES = [
    // Splitters
    { id: "2W_SPL", label: "2-way Splitter", loss250: 4.2, loss1000: 5.0, group: "Splitters" },
    { id: "3W_BAL", label: "3-way Balanced", loss250: 4.5, loss1000: 5.1, group: "Splitters" },
    { id: "3W_636", label: "3-way 636 (unbalanced)", loss250: 6.3, loss1000: 6.9, group: "Splitters" },

    // Directional couplers (DC)
    { id: "DC-8", label: "DC-8", loss250: 1.9, loss1000: 2.3, group: "Directional Couplers" },
    { id: "DC-12", label: "DC-12", loss250: 1.6, loss1000: 2.0, group: "Directional Couplers" },
    { id: "DC-9", label: "DC-9", loss250: 1.8, loss1000: 2.2, group: "Directional Couplers" },

    // Couplers / misc
    { id: "COUP_8", label: "Coupler 8 dB", loss250: 0.8, loss1000: 1.2, group: "Couplers" },
    { id: "COUP_12", label: "Coupler 12 dB", loss250: 0.9, loss1000: 1.3, group: "Couplers" },
    { id: "PI", label: "Power Inserter (passive RF loss)", loss250: 1.0, loss1000: 1.4, group: "Power" },
  ];

  // ---------------------------
  // AC Power: simple voltage drop model per 1000 ft for common sizes
  // (These are placeholders—swap to your plant standards.)
  // We'll do: Vdrop = I * R_per_1000ft * (ft/1000) * 2  (round trip)
  // ---------------------------
  const AC_CABLE = [
    { id: "0.500", label: ".500", r_ohm_per_1000ft: 0.33 },
    { id: "0.625", label: ".625", r_ohm_per_1000ft: 0.26 },
    { id: "0.750", label: ".750", r_ohm_per_1000ft: 0.21 },
    { id: "0.875", label: ".875", r_ohm_per_1000ft: 0.17 },
  ];

  // ---------------------------
  // App State
  // ---------------------------
  const state = {
    tab: "calc", // calc | info | ac
    started: false,

    // Wizard step
    step: 0, // 0..N

    // Inputs
    readingLocation: null, // "tap" | "upstream"
    meter250: "",
    meter1000: "",

    currentTapValue: "", // dB (tap value)
    currentTapThru: "",  // dB (thru loss at current tap)

    // Cable segments: list of { cableId, lengthFt }
    segments: [],

    // Inline taps in the way: list of { tapValueDb, thruDb }
    inlineTaps: [],

    // Passives: list of { passiveId, where: "internal"|"field" }
    passives: [],

    // Mini adder (8 inputs)
    adder: Array(8).fill(""),
  };

  // ---------------------------
  // Mount
  // ---------------------------
  const root = document.getElementById("app");
  if (!root) return;

  // ---------------------------
  // UI: Base Layout
  // ---------------------------
  function render() {
    root.innerHTML = "";

    const shell = el("div", "shell");
    const header = el(
      "div",
      "topbar",
      `
      <div class="brand">
        <div class="title">CATV Calc</div>
        <div class="subtitle">Wizard • Dual-band (250 + 1000)</div>
      </div>
      <div class="topactions">
        <button class="pill" id="btnResults">Results</button>
        <button class="pill" id="btnReset">Reset</button>
      </div>
    `
    );

    const tabs = el(
      "div",
      "tabs",
      `
      <button class="tab ${state.tab === "calc" ? "active" : ""}" data-tab="calc">CATV Calc</button>
      <button class="tab ${state.tab === "info" ? "active" : ""}" data-tab="info">CATV Info</button>
      <button class="tab ${state.tab === "ac" ? "active" : ""}" data-tab="ac">AC Power</button>
    `
    );

    const body = el("div", "body");
    shell.append(header, tabs, body);
    root.append(shell);

    // Wire tabs
    shell.querySelectorAll(".tab").forEach((b) => {
      b.addEventListener("click", () => {
        state.tab = b.getAttribute("data-tab");
        render();
      });
    });

    // Header actions
    $("#btnReset")?.addEventListener("click", () => {
      Object.assign(state, {
        tab: state.tab,
        started: false,
        step: 0,
        readingLocation: null,
        meter250: "",
        meter1000: "",
        currentTapValue: "",
        currentTapThru: "",
        segments: [],
        inlineTaps: [],
        passives: [],
        adder: Array(8).fill(""),
      });
      render();
    });

    $("#btnResults")?.addEventListener("click", () => {
      if (state.tab !== "calc") {
        state.tab = "calc";
      }
      state.step = 999; // results screen
      render();
    });

    if (state.tab === "calc") renderCalc(body);
    if (state.tab === "info") renderInfo(body);
    if (state.tab === "ac") renderAC(body);

    // iPhone audio unlock: just toggles started; you can hook sound later
    // (We keep this because some iPhones block “first interaction” logic.)
  }

  // ---------------------------
  // UI Building Blocks
  // ---------------------------
  function card(title, subtitle) {
    const c = el("div", "card");
    const h = el("div", "cardHead", `<div class="cardTitle">${title}</div>${subtitle ? `<div class="cardSub">${subtitle}</div>` : ""}`);
    const content = el("div", "cardBody");
    c.append(h, content);
    return { c, content };
  }

  function bigChoice(label, hint, onClick, selected = false) {
    const b = el(
      "button",
      `choice ${selected ? "selected" : ""}`,
      `<div class="choiceTitle">${label}</div>${hint ? `<div class="choiceHint">${hint}</div>` : ""}`
    );
    b.addEventListener("click", onClick);
    return b;
  }

  function numberField(label, value, onInput, placeholder = "0") {
    const wrap = el("div", "field");
    wrap.append(el("div", "fieldLabel", label));
    const input = el("input", "input");
    input.type = "number";
    input.inputMode = "decimal";
    input.placeholder = placeholder;
    input.value = value ?? "";
    input.addEventListener("input", (e) => onInput(e.target.value));
    wrap.append(input);
    return wrap;
  }

  function selectField(label, options, value, onChange) {
    const wrap = el("div", "field");
    wrap.append(el("div", "fieldLabel", label));
    const sel = el("select", "select");
    options.forEach((o) => {
      const opt = el("option");
      opt.value = o.value;
      opt.textContent = o.label;
      if (o.value === value) opt.selected = true;
      sel.append(opt);
    });
    sel.addEventListener("change", (e) => onChange(e.target.value));
    wrap.append(sel);
    return wrap;
  }

  function stepNav(container, { back = null, next = null, nextLabel = "Next" } = {}) {
    const row = el("div", "navrow");
    const bBack = el("button", "btn ghost", "Back");
    const bNext = el("button", "btn", nextLabel);

    if (!back) bBack.disabled = true;
    if (!next) bNext.disabled = true;

    bBack.addEventListener("click", () => back && back());
    bNext.addEventListener("click", () => next && next());

    row.append(bBack, el("div", "spacer"), bNext);
    container.append(row);
  }

  // ---------------------------
  // Calculation engine (dual-band)
  // ---------------------------
  function calcAll() {
    const m250 = safeNum(state.meter250);
    const m1000 = safeNum(state.meter1000);

    const tapValue = safeNum(state.currentTapValue);
    const tapThru = safeNum(state.currentTapThru);

    // Cable loss sums by segment, using each segment's selected cable type
    let cableLoss250 = 0;
    let cableLoss1000 = 0;
    for (const seg of state.segments) {
      const cable = CABLES.find((c) => c.id === seg.cableId) || CABLES[0];
      const ft = safeNum(seg.lengthFt);
      cableLoss250 += (cable.loss250 / 100) * ft;
      cableLoss1000 += (cable.loss1000 / 100) * ft;
    }

    // Inline taps THRU loss sum
    let inlineThruTotal = 0;
    for (const t of state.inlineTaps) inlineThruTotal += safeNum(t.thruDb);

    // Passives loss sum (separate internal vs field, but both affect path)
    let internal250 = 0, internal1000 = 0, field250 = 0, field1000 = 0;
    for (const p of state.passives) {
      const def = PASSIVES.find((x) => x.id === p.passiveId);
      if (!def) continue;
      if (p.where === "internal") {
        internal250 += def.loss250;
        internal1000 += def.loss1000;
      } else {
        field250 += def.loss250;
        field1000 += def.loss1000;
      }
    }

    // ReadingLocation interpretation:
    // - If "upstream": meter is before segments + inline taps + passives + current tap THRU (thru path)
    // - If "tap": meter is at current tap OUT (port), so to compute upstream we add tap value back.
    //
    // We'll compute:
    // A) Upstream level before the run (at the point feeding the run)
    // B) Level at "tap in" (input of current tap) after run losses (thru path + cable + passives + inline taps)
    // C) Tap port output at current tap (tap-in minus tap value)
    // D) Thru output after current tap THRU loss (tap-in minus tapThru)
    //
    // NOTE: Inline THRU taps are part of the run losses, so they reduce tap-in.
    // This matches what you said: meter - cable - inlineThru - current tap value => tap port output (if meter is upstream).
    //
    // Dual-band results:
    // We'll do for both 250 and 1000.

    function band(meter) {
      // Meter pad is always 0, per your requirement.
      if (state.readingLocation === "tap") {
        // meter is at tap port output
        const tapPort = meter;
        const tapIn = tapPort + tapValue;
        const thruOut = tapIn - tapThru;
        const upstream = tapIn + cableLossForBand + inlineThruTotal + passivesForBand;
        return { upstream, tapIn, tapPort, thruOut };
      }
      // upstream mode: meter is before run losses
      const upstream = meter;
      const tapIn = upstream - cableLossForBand - inlineThruTotal - passivesForBand;
      const tapPort = tapIn - tapValue;
      const thruOut = tapIn - tapThru;
      return { upstream, tapIn, tapPort, thruOut };
    }

    // We'll compute separately with band-specific loss variables:
    const passives250 = internal250 + field250;
    const passives1000 = internal1000 + field1000;

    // Bind band helpers
    let cableLossForBand = cableLoss250;
    let passivesForBand = passives250;
    const res250 = band(m250);

    cableLossForBand = cableLoss1000;
    passivesForBand = passives1000;
    const res1000 = band(m1000);

    return {
      inputs: { m250, m1000, tapValue, tapThru },
      losses: {
        cableLoss250, cableLoss1000,
        inlineThruTotal,
        internal250, internal1000,
        field250, field1000,
        passives250, passives1000,
      },
      out: {
        res250, res1000,
      },
    };
  }

  // ---------------------------
  // CATV Calc Wizard
  // ---------------------------
  function renderCalc(body) {
    // Tabs page: Wizard section
    const start = card(
      "START",
      "Tap START once to unlock the wizard (and optional audio later)."
    );
    start.content.append(
      el(
        "div",
        "row",
        `
        <button class="btn" id="btnStart">${state.started ? "Ready ✓" : "START"}</button>
        <div class="pillnote">${state.started ? "Wizard unlocked" : "Required on some iPhones"}</div>
      `
      )
    );
    body.append(start.c);

    start.c.querySelector("#btnStart").addEventListener("click", () => {
      state.started = true;
      // if you later add audio, you can prime AudioContext here.
      render();
    });

    if (!state.started) {
      const tip = card("Tip", "If taps don’t work on iPhone, hit START once first.");
      tip.content.append(el("div", "muted", "Then continue the questions below."));
      body.append(tip.c);
      return;
    }

    // If results screen
    if (state.step === 999) {
      renderResults(body);
      return;
    }

    // Step 0: Reading location
    if (state.step === 0) {
      const s = card(
        "A) Where is your meter reading taken?",
        "AT CURRENT TAP = measured at the current tap port output. UPSTREAM = measured before the run."
      );
      const row = el("div", "choicesRow");
      row.append(
        bigChoice("AT CURRENT TAP", "measured at the tap port", () => {
          state.readingLocation = "tap";
          state.step++;
          render();
        }, state.readingLocation === "tap"),
        bigChoice("UPSTREAM", "measured before losses", () => {
          state.readingLocation = "upstream";
          state.step++;
          render();
        }, state.readingLocation === "upstream")
      );
      s.content.append(row);
      s.content.append(el("div", "selectedLine", `Selected: <b>${state.readingLocation ? state.readingLocation.toUpperCase() : "NONE"}</b>`));
      stepNav(s.content, {
        back: null,
        next: state.readingLocation ? () => (state.step++, render()) : null,
      });
      body.append(s.c);
      return;
    }

    // Step 1: Meter readings
    if (state.step === 1) {
      const s = card(
        "B) Meter readings (dBmV)",
        "Enter both. No frequency chooser. Meter pad is always 0."
      );
      const grid = el("div", "grid2");
      grid.append(
        numberField("Meter @250 (dBmV)", state.meter250, (v) => (state.meter250 = v), "ex: 34.5"),
        numberField("Meter @1000 (dBmV)", state.meter1000, (v) => (state.meter1000 = v), "ex: 41")
      );
      s.content.append(grid);
      stepNav(s.content, {
        back: () => (state.step--, render()),
        next: () => (state.step++, render()),
      });
      body.append(s.c);
      return;
    }

    // Step 2: Current tap
    if (state.step === 2) {
      const s = card(
        "C) Current tap",
        "Tap value affects TAP PORT output. THRU loss affects THRU path."
      );
      const grid = el("div", "grid2");
      grid.append(
        numberField("Current tap value (dB)", state.currentTapValue, (v) => (state.currentTapValue = v), "ex: 4"),
        numberField("Current tap THRU loss (dB)", state.currentTapThru, (v) => (state.currentTapThru = v), "ex: 1.5")
      );
      s.content.append(grid);

      s.content.append(el("div", "muted",
        `Example (UPSTREAM mode): Tap Port = Upstream − cable − inline THRU − passives − tap value.`));

      stepNav(s.content, {
        back: () => (state.step--, render()),
        next: () => (state.step++, render()),
      });
      body.append(s.c);
      return;
    }

    // Step 3: Cable segments + mini adder
    if (state.step === 3) {
      const s = card(
        "D) Cable segments",
        "Add each run segment. Each segment has cable type + length. Mini adder is for quick sums (up to 8)."
      );

      // Mini adder (only on this screen, as requested)
      const ad = el("div", "adder");
      ad.append(el("div", "adderTitle", "Mini Adder (8 inputs)"));
      const adGrid = el("div", "adderGrid");
      state.adder.forEach((val, i) => {
        const inp = el("input", "input");
        inp.type = "number";
        inp.placeholder = `${i + 1}`;
        inp.value = val;
        inp.addEventListener("input", (e) => {
          state.adder[i] = e.target.value;
          render(); // re-render to update sum
        });
        adGrid.append(inp);
      });
      const sum = state.adder.reduce((a, v) => a + safeNum(v), 0);
      ad.append(adGrid);
      ad.append(el("div", "adderSum", `Sum: <b>${fmt(sum, 2)}</b>`));
      s.content.append(ad);

      // Add segment controls
      const addRow = el("div", "segAdd");
      const segCableOptions = CABLES.map((c) => ({ value: c.id, label: c.label }));
      let tempCable = state.segments[state.segments.length - 1]?.cableId || CABLES[0].id;
      let tempLen = "";

      const cableSel = selectField("Cable type", segCableOptions, tempCable, (v) => (tempCable = v));
      const lenField = numberField("Length (ft)", tempLen, (v) => (tempLen = v), "ex: 200");
      const btnAdd = el("button", "btn", "Add segment");

      btnAdd.addEventListener("click", () => {
        const lengthFt = safeNum(lenField.querySelector("input").value);
        const cableId = cableSel.querySelector("select").value;
        if (lengthFt <= 0) return;
        state.segments.push({ cableId, lengthFt });
        render();
      });

      addRow.append(cableSel, lenField, btnAdd);
      s.content.append(addRow);

      // Segments list
      const list = el("div", "list");
      if (state.segments.length === 0) {
        list.append(el("div", "muted", "No segments added yet."));
      } else {
        state.segments.forEach((seg, idx) => {
          const c = CABLES.find((x) => x.id === seg.cableId) || CABLES[0];
          const row = el("div", "listRow");
          row.innerHTML = `<div><b>${idx + 1})</b> ${c.label} • ${fmt(seg.lengthFt, 0)} ft</div>`;
          const del = el("button", "miniBtn", "Remove");
          del.addEventListener("click", () => {
            state.segments.splice(idx, 1);
            render();
          });
          row.append(del);
          list.append(row);
        });
      }
      const clear = el("button", "btn ghost", "Clear segments");
      clear.addEventListener("click", () => {
        state.segments = [];
        render();
      });
      s.content.append(list);
      s.content.append(clear);

      stepNav(s.content, {
        back: () => (state.step--, render()),
        next: () => (state.step++, render()),
      });
      body.append(s.c);
      return;
    }

    // Step 4: Inline taps (in the way)
    if (state.step === 4) {
      const s = card(
        "E) Inline taps in the way",
        "Add each inline tap. THRU loss is what matters for the main path."
      );

      const row = el("div", "grid2");
      const tapValSel = selectField(
        "Inline tap value (dB)",
        [8, 11, 14, 17, 20, 23, 26, 29].map((v) => ({ value: String(v), label: `${v} dB` })),
        "11",
        () => {}
      );
      const thru = numberField("Inline tap THRU loss (dB)", String(DEFAULT_INLINE_THRU_DB), () => {}, "ex: 1.5");

      const addBtn = el("button", "btn", "Add inline tap");
      addBtn.addEventListener("click", () => {
        const tv = safeNum(tapValSel.querySelector("select").value);
        const th = safeNum(thru.querySelector("input").value);
        state.inlineTaps.push({ tapValueDb: tv, thruDb: th });
        render();
      });

      row.append(tapValSel, thru);
      s.content.append(row);
      s.content.append(addBtn);

      const list = el("div", "list");
      if (state.inlineTaps.length === 0) {
        list.append(el("div", "muted", "No inline taps added."));
      } else {
        state.inlineTaps.forEach((t, idx) => {
          const r = el("div", "listRow");
          r.innerHTML = `<div><b>${idx + 1})</b> ${fmt(t.tapValueDb, 0)} dB tap • THRU ${fmt(t.thruDb, 2)} dB</div>`;
          const del = el("button", "miniBtn", "Remove");
          del.addEventListener("click", () => {
            state.inlineTaps.splice(idx, 1);
            render();
          });
          r.append(del);
          list.append(r);
        });
      }
      const clear = el("button", "btn ghost", "Clear inline taps");
      clear.addEventListener("click", () => {
        state.inlineTaps = [];
        render();
      });

      // Inline THRU total quick view
      const inlineTotal = state.inlineTaps.reduce((a, t) => a + safeNum(t.thruDb), 0);
      s.content.append(el("div", "muted", `Inline taps THRU total: <b>${fmt(inlineTotal, 2)} dB</b>`));

      s.content.append(list);
      s.content.append(clear);

      stepNav(s.content, {
        back: () => (state.step--, render()),
        next: () => (state.step++, render()),
        nextLabel: "Next (Passives)",
      });
      body.append(s.c);
      return;
    }

    // Step 5: Passives (internal + field)
    if (state.step === 5) {
      const s = card(
        "F) Passives / devices",
        "Add internal (minibridger) devices and field devices. Each has different loss @250/@1000."
      );

      const groupOptions = [];
      const byGroup = PASSIVES.reduce((m, p) => {
        (m[p.group] ||= []).push(p);
        return m;
      }, {});
      Object.keys(byGroup).forEach((g) => groupOptions.push({ value: g, label: g }));

      let tempGroup = groupOptions[0]?.value || "Splitters";
      let tempPassive = byGroup[tempGroup]?.[0]?.id || PASSIVES[0]?.id || "";
      let tempWhere = "field";

      const groupSel = selectField("Category", groupOptions, tempGroup, (v) => {
        tempGroup = v;
        const first = byGroup[tempGroup]?.[0];
        tempPassive = first ? first.id : tempPassive;
        render();
      });

      const passiveOptions = (byGroup[tempGroup] || PASSIVES).map((p) => ({
        value: p.id,
        label: `${p.label} (250:${p.loss250} / 1000:${p.loss1000})`,
      }));

      const passiveSel = selectField("Device", passiveOptions, tempPassive, (v) => (tempPassive = v));
      const whereSel = selectField(
        "Where?",
        [
          { value: "internal", label: "Internal (minibridger)" },
          { value: "field", label: "Field (line)" },
        ],
        tempWhere,
        (v) => (tempWhere = v)
      );

      const addBtn = el("button", "btn", "Add device");
      addBtn.addEventListener("click", () => {
        const pid = passiveSel.querySelector("select").value;
        const wh = whereSel.querySelector("select").value;
        if (!pid) return;
        state.passives.push({ passiveId: pid, where: wh });
        render();
      });

      const grid = el("div", "grid2");
      grid.append(groupSel, passiveSel);
      s.content.append(grid);
      s.content.append(whereSel);
      s.content.append(addBtn);

      const list = el("div", "list");
      if (state.passives.length === 0) {
        list.append(el("div", "muted", "No devices added."));
      } else {
        state.passives.forEach((p, idx) => {
          const def = PASSIVES.find((x) => x.id === p.passiveId);
          const r = el("div", "listRow");
          r.innerHTML = `<div><b>${idx + 1})</b> ${def ? def.label : p.passiveId} • <span class="tag">${p.where}</span></div>`;
          const del = el("button", "miniBtn", "Remove");
          del.addEventListener("click", () => {
            state.passives.splice(idx, 1);
            render();
          });
          r.append(del);
          list.append(r);
        });
      }

      const clear = el("button", "btn ghost", "Clear devices");
      clear.addEventListener("click", () => {
        state.passives = [];
        render();
      });

      s.content.append(list);
      s.content.append(clear);

      stepNav(s.content, {
        back: () => (state.step--, render()),
        next: () => (state.step = 999, render()),
        nextLabel: "Show Results",
      });
      body.append(s.c);
      return;
    }

    // Fallback
    const s = card("Wizard", "Unknown step. Hit Results.");
    body.append(s.c);
  }

  // ---------------------------
  // Results Screen
  // ---------------------------
  function renderResults(body) {
    const calc = calcAll();
    const { losses, out } = calc;

    const s = card("Results", "Dual-band outputs: 250 and 1000 shown together.");

    // Summary table
    const summary = el("div", "resultsGrid");

    const box = (title, rows) => {
      const b = el("div", "resultBox");
      b.append(el("div", "resultTitle", title));
      const ul = el("div", "resultRows");
      rows.forEach((r) => {
        ul.append(el("div", "resultRow", `<span>${r.k}</span><b>${r.v}</b>`));
      });
      b.append(ul);
      return b;
    };

    summary.append(
      box("Inputs", [
        { k: "Reading location", v: (state.readingLocation || "—").toUpperCase() },
        { k: "Meter @250", v: `${fmt(calc.inputs.m250)} dBmV` },
        { k: "Meter @1000", v: `${fmt(calc.inputs.m1000)} dBmV` },
        { k: "Tap value", v: `${fmt(calc.inputs.tapValue)} dB` },
        { k: "Tap THRU", v: `${fmt(calc.inputs.tapThru)} dB` },
      ]),
      box("Loss breakdown (250)", [
        { k: "Cable loss", v: `${fmt(losses.cableLoss250)} dB` },
        { k: "Inline taps THRU", v: `${fmt(losses.inlineThruTotal)} dB` },
        { k: "Internal passives", v: `${fmt(losses.internal250)} dB` },
        { k: "Field passives", v: `${fmt(losses.field250)} dB` },
        { k: "Total passives", v: `${fmt(losses.passives250)} dB` },
      ]),
      box("Loss breakdown (1000)", [
        { k: "Cable loss", v: `${fmt(losses.cableLoss1000)} dB` },
        { k: "Inline taps THRU", v: `${fmt(losses.inlineThruTotal)} dB` },
        { k: "Internal passives", v: `${fmt(losses.internal1000)} dB` },
        { k: "Field passives", v: `${fmt(losses.field1000)} dB` },
        { k: "Total passives", v: `${fmt(losses.passives1000)} dB` },
      ])
    );

    const outputs = el("div", "resultsGrid");
    outputs.append(
      box("250 MHz", [
        { k: "Upstream", v: `${fmt(out.res250.upstream)} dBmV` },
        { k: "Level at TAP IN", v: `${fmt(out.res250.tapIn)} dBmV` },
        { k: "Tap PORT output", v: `${fmt(out.res250.tapPort)} dBmV` },
        { k: "THRU output", v: `${fmt(out.res250.thruOut)} dBmV` },
      ]),
      box("1000 MHz", [
        { k: "Upstream", v: `${fmt(out.res1000.upstream)} dBmV` },
        { k: "Level at TAP IN", v: `${fmt(out.res1000.tapIn)} dBmV` },
        { k: "Tap PORT output", v: `${fmt(out.res1000.tapPort)} dBmV` },
        { k: "THRU output", v: `${fmt(out.res1000.thruOut)} dBmV` },
      ])
    );

    // Quick sanity line for what you wanted:
    // "meter - cable - inlineThru - tapValue"
    const sanity = el("div", "sanity");
    const m1000 = calc.inputs.m1000;
    const san = m1000 - losses.cableLoss1000 - losses.inlineThruTotal - losses.passives1000 - calc.inputs.tapValue;
    sanity.innerHTML = `<div class="muted">
      Sanity (UPSTREAM @1000): meter − cable − inlineTHRU − passives − tapValue = <b>${fmt(san)} dBmV</b>
    </div>`;
    s.content.append(summary);
    s.content.append(outputs);
    s.content.append(sanity);

    // Nav
    stepNav(s.content, {
      back: () => (state.step = 5, render()),
      next: () => {},
      nextLabel: "Done",
    });

    body.append(s.c);
  }

  // ---------------------------
  // CATV Info Tab
  // ---------------------------
  function renderInfo(body) {
    const a = card("CATV Info", "Quick field reference.");

    a.content.append(
      el("div", "infoBlock", `
        <div class="infoTitle">Humping</div>
        <div class="infoText">A signal build-up of the midband. Common cause: over-equalizing amplifiers in an affected cascade, especially if EQ was used to correct roll-off.</div>
      `)
    );

    a.content.append(
      el("div", "infoBlock", `
        <div class="infoTitle">Reflections (Standing waves)</div>
        <div class="infoText">Stable symmetrical peaks/valleys in response across the band (often worse at higher frequencies). Cause: impedance mismatch somewhere in the path (anything not ~75Ω). Common in amps with bi-directional test points.</div>
      `)
    );

    a.content.append(
      el("div", "infoBlock", `
        <div class="infoTitle">High-End Roll-off</div>
        <div class="infoText">Frequency response drops near the upper band edge. Causes: loose connectors/center seizure screws, loose modules, amplifier misalignment, diplex problems, damaged center conductor, passives/plug-ins designed for lower passband.</div>
      `)
    );

    a.content.append(
      el("div", "infoBlock", `
        <div class="infoTitle">Notch</div>
        <div class="infoText">A sharp (often deep) negative dip. Causes: loose connectors, tap/coupler faceplates, or amplifier modules; internal RF grounding issues.</div>
      `)
    );

    const f = card("Standing-wave distance (forward sweep)", "Used to estimate distance to fault.");
    f.content.append(
      el("div", "formula", `
        <div><b>D = 492 × (Vp / F)</b></div>
        <div class="muted">D = distance (feet). Use 149 instead of 492 for meters.</div>
        <div class="muted">Vp = velocity of propagation (% of speed of light, ex: 87).</div>
        <div class="muted">F = frequency width (MHz) of one standing-wave cycle.</div>
      `)
    );

    // Calculator for D
    const grid = el("div", "grid2");
    let vp = "87";
    let fw = "10";
    const outBox = el("div", "resultBox");
    const update = () => {
      const D = 492 * (safeNum(vp) / Math.max(0.01, safeNum(fw)));
      outBox.innerHTML = `<div class="resultTitle">Distance estimate</div>
        <div class="resultRows">
          <div class="resultRow"><span>D (feet)</span><b>${fmt(D, 1)}</b></div>
        </div>`;
    };
    const vpField = numberField("Vp (%)", vp, (v) => { vp = v; update(); }, "ex: 87");
    const fField = numberField("F (MHz)", fw, (v) => { fw = v; update(); }, "ex: 10");
    grid.append(vpField, fField);
    f.content.append(grid);
    update();
    f.content.append(outBox);

    body.append(a.c);
    body.append(f.c);
  }

  // ---------------------------
  // AC Power Tab
  // ---------------------------
  function renderAC(body) {
    const c = card("AC Powering Calc", "Simple voltage drop + end-of-line estimate (placeholders—swap to your plant values).");

    let vStart = "90";
    let amps = "6";
    let ft = "1000";
    let cableId = AC_CABLE[0].id;

    const grid = el("div", "grid2");
    grid.append(
      numberField("Start voltage (VAC)", vStart, (v) => { vStart = v; update(); }, "ex: 90"),
      numberField("Load current (A)", amps, (v) => { amps = v; update(); }, "ex: 6")
    );
    grid.append(
      numberField("Distance (ft)", ft, (v) => { ft = v; update(); }, "ex: 2500"),
      selectField("Cable size", AC_CABLE.map(x => ({ value: x.id, label: x.label })), cableId, (v) => { cableId = v; update(); })
    );

    const outBox = el("div", "resultBox");
    const update = () => {
      const V = safeNum(vStart);
      const I = safeNum(amps);
      const L = safeNum(ft);
      const cab = AC_CABLE.find(x => x.id === cableId) || AC_CABLE[0];

      // round trip resistance
      const R = cab.r_ohm_per_1000ft * (L / 1000) * 2;
      const vDrop = I * R;
      const vEnd = V - vDrop;

      // Simple thresholds
      const ok63 = vEnd >= 63;
      const ok70 = vEnd >= 70;
      const ok75 = vEnd >= 75;

      outBox.innerHTML = `
        <div class="resultTitle">AC Results</div>
        <div class="resultRows">
          <div class="resultRow"><span>Round-trip R</span><b>${fmt(R, 3)} Ω</b></div>
          <div class="resultRow"><span>Voltage drop</span><b>${fmt(vDrop, 2)} VAC</b></div>
          <div class="resultRow"><span>End voltage</span><b>${fmt(vEnd, 2)} VAC</b></div>
          <div class="resultRow"><span>≥ 63 VAC</span><b class="${ok63 ? "good" : "bad"}">${ok63 ? "PASS" : "FAIL"}</b></div>
          <div class="resultRow"><span>≥ 70 VAC</span><b class="${ok70 ? "good" : "bad"}">${ok70 ? "PASS" : "FAIL"}</b></div>
          <div class="resultRow"><span>≥ 75 VAC</span><b class="${ok75 ? "good" : "bad"}">${ok75 ? "PASS" : "FAIL"}</b></div>
        </div>
        <div class="muted" style="margin-top:10px;">
          Note: resistance values are placeholders. Swap r_ohm_per_1000ft to match your plant spec.
        </div>
      `;
    };

    c.content.append(grid);
    c.content.append(outBox);
    update();
    body.append(c.c);
  }

  // ---------------------------
  // Boot / Init
  // ---------------------------
  render();

})();
