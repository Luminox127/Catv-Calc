(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  // ---- Data: cable loss per 100 ft at 250 + 1000 (edit any time)
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

  function num(v) {
    const n = parseFloat(String(v ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  function fmt(n) {
    return Number.isFinite(n) ? n.toFixed(2) : "0.00";
  }
  function cableById(id) {
    return CABLES.find(c => c.id === id) || CABLES[0];
  }

  // ---- App state (strings for inputs to avoid focus bugs)
  const state = {
    step: 0,
    readingTaken: "",   // "tap" or "upstream"
    meter250: "",
    meter1000: "",
    tapValue: "",
    tapThru: "",
    inlineThruEach: "",
    inlineCount: 0,
    segments: [{ cableId: "P3-500", feet: "" }],
  };

  // ---- Render (single-step wizard; inputs are not destroyed while typing)
  const root = $("#app");

  function buildTopBar() {
    const top = document.createElement("div");
    top.className = "topbar";

    const brand = document.createElement("div");
    brand.className = "brand";
    brand.innerHTML = `
      <div class="title">CATV Calc</div>
      <div class="sub">Questionnaire • Dual-band (250 + 1000) • No meter pad</div>
    `;

    const actions = document.createElement("div");
    actions.className = "actions";

    const btnResults = document.createElement("button");
    btnResults.className = "btn ghost";
    btnResults.type = "button";
    btnResults.textContent = "Results";
    btnResults.addEventListener("click", () => {
      state.step = STEPS.length - 1;
      render();
    });

    const btnReset = document.createElement("button");
    btnReset.className = "btn ghost";
    btnReset.type = "button";
    btnReset.textContent = "Reset";
    btnReset.addEventListener("click", () => resetAll());

    actions.appendChild(btnResults);
    actions.appendChild(btnReset);

    top.appendChild(brand);
    top.appendChild(actions);
    return top;
  }

  function card(title, hint) {
    const c = document.createElement("div");
    c.className = "card";

    const head = document.createElement("div");
    head.className = "stepHead";

    const left = document.createElement("div");
    left.innerHTML = `
      <div class="stepTitle">${title}</div>
      <div class="stepHint">${hint}</div>
    `;

    const right = document.createElement("div");
    right.className = "pill";
    right.textContent = `Step ${state.step + 1} / ${STEPS.length}`;

    head.appendChild(left);
    head.appendChild(right);
    c.appendChild(head);

    return c;
  }

  function nav(canNext) {
    const bar = document.createElement("div");
    bar.className = "navbar";

    const back = document.createElement("button");
    back.className = "btn";
    back.type = "button";
    back.textContent = "Back";
    back.disabled = state.step === 0;
    back.addEventListener("click", () => {
      state.step = Math.max(0, state.step - 1);
      render();
    });

    const next = document.createElement("button");
    next.className = "btn primary";
    next.type = "button";
    next.textContent = state.step === STEPS.length - 1 ? "Done" : "Next";
    next.disabled = !canNext;
    next.addEventListener("click", () => {
      if (state.step < STEPS.length - 1) {
        state.step += 1;
        render();
      }
    });

    bar.appendChild(back);
    bar.appendChild(next);
    return bar;
  }

  // ---- Calculation (core)
  function calc() {
    const m250 = num(state.meter250);
    const m1000 = num(state.meter1000);

    const tapVal = num(state.tapValue);
    const tapThru = num(state.tapThru);

    const inlineThru = num(state.inlineThruEach) * (state.inlineCount || 0);

    let cableLoss250 = 0, cableLoss1000 = 0;
    for (const s of state.segments) {
      const feet = num(s.feet);
      const c = cableById(s.cableId);
      cableLoss250 += (feet / 100) * c.loss250;
      cableLoss1000 += (feet / 100) * c.loss1000;
    }

    // Tap Port from upstream (your formula)
    const tapPort250_up = m250 - cableLoss250 - inlineThru - tapVal;
    const tapPort1000_up = m1000 - cableLoss1000 - inlineThru - tapVal;

    // Tap IN from upstream
    const tapIn250_up = m250 - cableLoss250 - inlineThru;
    const tapIn1000_up = m1000 - cableLoss1000 - inlineThru;

    // THRU output from upstream (uses tap THRU, not tap value)
    const thruOut250_up = m250 - cableLoss250 - inlineThru - tapThru;
    const thruOut1000_up = m1000 - cableLoss1000 - inlineThru - tapThru;

    // If measured at current tap PORT already
    const tapPort250_tap = m250;
    const tapPort1000_tap = m1000;
    const tapIn250_tap = m250 + tapVal;
    const tapIn1000_tap = m1000 + tapVal;
    const thruOut250_tap = (m250 + tapVal) - tapThru;
    const thruOut1000_tap = (m1000 + tapVal) - tapThru;

    const mode = state.readingTaken;

    const out = {
      cableLoss250, cableLoss1000,
      inlineThru,
      tapVal, tapThru,
      meter250: m250, meter1000: m1000,
      tapIn250: mode === "upstream" ? tapIn250_up : tapIn250_tap,
      tapIn1000: mode === "upstream" ? tapIn1000_up : tapIn1000_tap,
      tapPort250: mode === "upstream" ? tapPort250_up : tapPort250_tap,
      tapPort1000: mode === "upstream" ? tapPort1000_up : tapPort1000_tap,
      thruOut250: mode === "upstream" ? thruOut250_up : thruOut250_tap,
      thruOut1000: mode === "upstream" ? thruOut1000_up : thruOut1000_tap,
    };

    return out;
  }

  // ---- Steps
  const STEPS = [
    // 0
    () => {
      const c = card(
        "A) Where is your meter reading taken?",
        "Pick one. This changes how the app interprets your meter readings."
      );

      const grid = document.createElement("div");
      grid.className = "choiceGrid";

      const a = document.createElement("div");
      a.className = "choice";
      a.innerHTML = `<div class="big">AT CURRENT TAP</div><div class="muted">meter is at the tap port</div>`;
      a.addEventListener("click", () => { state.readingTaken = "tap"; render(); });

      const b = document.createElement("div");
      b.className = "choice";
      b.innerHTML = `<div class="big">UPSTREAM (BEFORE RUN)</div><div class="muted">meter is before losses</div>`;
      b.addEventListener("click", () => { state.readingTaken = "upstream"; render(); });

      a.classList.toggle("selected", state.readingTaken === "tap");
      b.classList.toggle("selected", state.readingTaken === "upstream");

      grid.appendChild(a);
      grid.appendChild(b);
      c.appendChild(grid);

      c.appendChild(nav(state.readingTaken === "tap" || state.readingTaken === "upstream"));
      return c;
    },

    // 1
    () => {
      const c = card(
        "B) Enter meter readings (dBmV)",
        "Dual-band only. Type both numbers."
      );

      const g = document.createElement("div");
      g.className = "grid2";

      const i250 = document.createElement("input");
      i250.className = "in";
      i250.inputMode = "decimal";
      i250.placeholder = "Meter @250 (ex: 34.5)";
      i250.value = state.meter250;
      i250.addEventListener("input", () => { state.meter250 = i250.value; });

      const i1000 = document.createElement("input");
      i1000.className = "in";
      i1000.inputMode = "decimal";
      i1000.placeholder = "Meter @1000 (ex: 41)";
      i1000.value = state.meter1000;
      i1000.addEventListener("input", () => { state.meter1000 = i1000.value; });

      g.appendChild(i250);
      g.appendChild(i1000);
      c.appendChild(g);

      const ok = String(state.meter250).trim() !== "" && String(state.meter1000).trim() !== "";
      c.appendChild(nav(ok));
      return c;
    },

    // 2
    () => {
      const c = card(
        "C) Current Tap settings",
        "Tap value affects TAP PORT. Tap THRU loss affects THRU output."
      );

      const g = document.createElement("div");
      g.className = "grid2";

      const tval = document.createElement("input");
      tval.className = "in";
      tval.inputMode = "decimal";
      tval.placeholder = "Tap value dB (ex: 4)";
      tval.value = state.tapValue;
      tval.addEventListener("input", () => { state.tapValue = tval.value; });

      const tthru = document.createElement("input");
      tthru.className = "in";
      tthru.inputMode = "decimal";
      tthru.placeholder = "Tap THRU loss dB (ex: 1.5)";
      tthru.value = state.tapThru;
      tthru.addEventListener("input", () => { state.tapThru = tthru.value; });

      g.appendChild(tval);
      g.appendChild(tthru);
      c.appendChild(g);

      const ok = String(state.tapValue).trim() !== "" && String(state.tapThru).trim() !== "";
      c.appendChild(nav(ok));
      return c;
    },

    // 3
    () => {
      const c = card(
        "D) Inline taps (THRU losses between meter point and current tap)",
        "Enter THRU loss each, then set how many inline taps."
      );

      const row = document.createElement("div");
      row.className = "row";

      const thruEach = document.createElement("input");
      thruEach.className = "in";
      thruEach.style.maxWidth = "320px";
      thruEach.inputMode = "decimal";
      thruEach.placeholder = "Inline tap THRU loss each (ex: 1.5)";
      thruEach.value = state.inlineThruEach;
      thruEach.addEventListener("input", () => { state.inlineThruEach = thruEach.value; });

      const minus = document.createElement("button");
      minus.className = "btn";
      minus.type = "button";
      minus.textContent = "−";
      minus.addEventListener("click", () => { state.inlineCount = Math.max(0, state.inlineCount - 1); render(); });

      const count = document.createElement("div");
      count.className = "pill";
      count.textContent = `Count: ${state.inlineCount}`;

      const plus = document.createElement("button");
      plus.className = "btn";
      plus.type = "button";
      plus.textContent = "+";
      plus.addEventListener("click", () => { state.inlineCount = Math.min(50, state.inlineCount + 1); render(); });

      row.appendChild(thruEach);
      row.appendChild(minus);
      row.appendChild(count);
      row.appendChild(plus);
      c.appendChild(row);

      const total = num(state.inlineThruEach) * (state.inlineCount || 0);
      const msg = document.createElement("div");
      msg.className = "toast";
      msg.textContent = `Inline THRU total: ${fmt(total)} dB`;
      c.appendChild(msg);

      const ok = String(state.inlineThruEach).trim() !== "";
      c.appendChild(nav(ok));
      return c;
    },

    // 4
    () => {
      const c = card(
        "E) Cable segments",
        "Add segments if cable type changes along the run."
      );

      const segWrap = document.createElement("div");

      function renderSegRows() {
        segWrap.innerHTML = "";

        state.segments.forEach((seg, idx) => {
          const row = document.createElement("div");
          row.className = "segRow";

          const n = document.createElement("div");
          n.className = "pill";
          n.textContent = `Seg ${idx + 1}`;

          const sel = document.createElement("select");
          sel.className = "sel";
          CABLES.forEach(ca => {
            const o = document.createElement("option");
            o.value = ca.id;
            o.textContent = ca.label;
            sel.appendChild(o);
          });
          sel.value = seg.cableId;
          sel.addEventListener("change", () => { seg.cableId = sel.value; updateTotals(); });

          const ft = document.createElement("input");
          ft.className = "in";
          ft.inputMode = "decimal";
          ft.placeholder = "feet (ex: 814)";
          ft.value = seg.feet;
          ft.addEventListener("input", () => { seg.feet = ft.value; updateTotals(); });

          const rm = document.createElement("button");
          rm.className = "btn danger";
          rm.type = "button";
          rm.textContent = "Remove";
          rm.addEventListener("click", () => {
            state.segments.splice(idx, 1);
            if (state.segments.length === 0) state.segments.push({ cableId:"P3-500", feet:"" });
            renderSegRows();
            updateTotals();
          });

          row.appendChild(n);
          row.appendChild(sel);
          row.appendChild(ft);
          row.appendChild(rm);
          segWrap.appendChild(row);
        });
      }

      const add = document.createElement("button");
      add.className = "btn";
      add.type = "button";
      add.textContent = "Add Segment";
      add.addEventListener("click", () => {
        state.segments.push({ cableId: "P3-500", feet: "" });
        renderSegRows();
        updateTotals();
      });

      const totals = document.createElement("div");
      totals.className = "toast";

      function updateTotals() {
        const r = calc();
        totals.textContent = `Cable loss: 250=${fmt(r.cableLoss250)} dB • 1000=${fmt(r.cableLoss1000)} dB`;
      }

      renderSegRows();
      updateTotals();

      c.appendChild(segWrap);
      c.appendChild(document.createElement("div")).className = "hr";
      c.appendChild(add);
      c.appendChild(totals);

      // allow next even if feet blank (treat as 0)
      c.appendChild(nav(true));
      return c;
    },

    // 5 Results
    () => {
      const r = calc();
      const c = card(
        "RESULTS (250 + 1000)",
        state.readingTaken === "upstream"
          ? "Tap PORT = Meter − CableLoss − InlineTHRU − TapValue"
          : "Meter is already at tap port output."
      );

      const kv = document.createElement("div");
      kv.className = "kv";

      function box(k, v, cls="") {
        const b = document.createElement("div");
        b.className = "box";
        b.innerHTML = `<div class="k">${k}</div><div class="v ${cls}">${v}</div>`;
        return b;
      }

      kv.appendChild(box("Tap IN @250", `${fmt(r.tapIn250)} dBmV`));
      kv.appendChild(box("Tap IN @1000", `${fmt(r.tapIn1000)} dBmV`));
      kv.appendChild(box("Tap PORT @250", `${fmt(r.tapPort250)} dBmV`, "good"));
      kv.appendChild(box("Tap PORT @1000", `${fmt(r.tapPort1000)} dBmV`, "good"));
      kv.appendChild(box("THRU OUT @250", `${fmt(r.thruOut250)} dBmV`));
      kv.appendChild(box("THRU OUT @1000", `${fmt(r.thruOut1000)} dBmV`));

      c.appendChild(kv);

      const detail = document.createElement("div");
      detail.className = "toast";
      detail.innerHTML = `
        Inline THRU total: <b>${fmt(r.inlineThru)}</b> dB<br/>
        Cable loss: 250=<b>${fmt(r.cableLoss250)}</b> dB • 1000=<b>${fmt(r.cableLoss1000)}</b> dB<br/>
        Tap value: <b>${fmt(r.tapVal)}</b> dB • Tap THRU: <b>${fmt(r.tapThru)}</b> dB
      `;
      c.appendChild(document.createElement("div")).className = "hr";
      c.appendChild(detail);

      c.appendChild(nav(true));
      return c;
    }
  ];

  function resetAll() {
    state.step = 0;
    state.readingTaken = "";
    state.meter250 = "";
    state.meter1000 = "";
    state.tapValue = "";
    state.tapThru = "";
    state.inlineThruEach = "";
    state.inlineCount = 0;
    state.segments = [{ cableId: "P3-500", feet: "" }];
    render();
  }

  function render() {
    root.innerHTML = "";
    root.appendChild(buildTopBar());
    root.appendChild(STEPS[state.step]());
  }

  render();
})();
