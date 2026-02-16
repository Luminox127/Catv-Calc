/* CATV Calc — Wizard + Tabs (CATV Calc / CATV Info / AC Power)
   Fixes:
   - No full re-render on each keystroke (prevents iOS/Chrome focus loss)
   - No click-blocking overlay issues (Start gate removed cleanly)
   - Buttons are type="button" only (no form submit refresh)
*/

(() => {
  "use strict";

  // -------------------------
  // Data (edit anytime)
  // -------------------------
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

  // Field/Internal passives (from your ATX line passives screenshot, using TYP @200≈250 and @1002≈1000)
  const PASSIVES = [
    { id: "NONE", label: "(none)", loss250: 0.0, loss1000: 0.0 },

    // Splitters
    { id: "2W", label: "2-way Splitter", loss250: 4.2, loss1000: 5.0 },
    { id: "3WB", label: "3-way Balanced", loss250: 4.5, loss1000: 5.1 },
    { id: "3WU", label: "3-way Unbalanced / 636", loss250: 6.3, loss1000: 6.9 },

    // Directional couplers (example values — adjust to your sheet if needed)
    { id: "DC8", label: "Directional Coupler DC-8", loss250: 2.0, loss1000: 2.4 },
    { id: "DC12", label: "Directional Coupler DC-12", loss250: 1.9, loss1000: 2.4 },
    { id: "DC9", label: "Directional Coupler DC-9", loss250: 2.0, loss1000: 2.4 },
  ];

  // -------------------------
  // Helpers
  // -------------------------
  const $ = (sel) => document.querySelector(sel);

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, String(v));
    }
    for (const c of children) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return node;
  }

  function num(v) {
    const n = parseFloat(String(v ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  function fmt(n) {
    return Number.isFinite(n) ? n.toFixed(2) : "0.00";
  }
  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }
  function cableById(id) {
    return CABLES.find((c) => c.id === id) || CABLES[0];
  }
  function passiveById(id) {
    return PASSIVES.find((p) => p.id === id) || PASSIVES[0];
  }

  // -------------------------
  // App State
  // -------------------------
  const state = {
    tab: "calc",              // calc | info | ac
    unlocked: false,          // start gate
    step: 0,                  // wizard step index

    // Inputs
    readingTaken: "",         // "tap" | "upstream"
    meter250: "",             // string (keep raw)
    meter1000: "",

    currentTapValue: "",      // dB
    currentTapThru: "",       // dB

    // Devices (choose lists)
    internalPassive: "NONE",
    fieldPassive: "NONE",

    // Inline taps (thru losses)
    inlineTapThruEach: "",    // dB each
    inlineTapCount: 0,

    // Cable segments
    segments: [
      { cableId: "P3-500", feet: "" }
    ],

    // Mini sum calc (8 inputs)
    sumInputs: Array.from({ length: 8 }, () => ""),
  };

  // -------------------------
  // Mount
  // -------------------------
  const root = $("#app");
  if (!root) return;

  // Static layout (we do NOT destroy/recreate inputs while typing)
  const appShell = el("div", { class: "appShell" }, []);
  const header = el("div", { class: "topBar" }, [
    el("div", { class: "brand" }, [
      el("div", { class: "title", text: "CATV Calc" }),
      el("div", { class: "subtitle", text: "Wizard • Dual-band (250 + 1000)" }),
    ]),
    el("div", { class: "topActions" }, [
      el("button", { class: "btn ghost", type: "button", id: "btnResults", text: "Results" }),
      el("button", { class: "btn ghost", type: "button", id: "btnReset", text: "Reset" }),
    ])
  ]);

  const tabs = el("div", { class: "tabs" }, [
    el("button", { class: "tab active", type: "button", id: "tabCalc", text: "CATV Calc" }),
    el("button", { class: "tab", type: "button", id: "tabInfo", text: "CATV Info" }),
    el("button", { class: "tab", type: "button", id: "tabAC", text: "AC Power" }),
  ]);

  const main = el("div", { class: "main" }, []);
  appShell.appendChild(header);
  appShell.appendChild(tabs);
  appShell.appendChild(main);
  root.replaceChildren(appShell);

  // -------------------------
  // Tab switching
  // -------------------------
  function setTab(tab) {
    state.tab = tab;
    $("#tabCalc").classList.toggle("active", tab === "calc");
    $("#tabInfo").classList.toggle("active", tab === "info");
    $("#tabAC").classList.toggle("active", tab === "ac");
    renderTab();
  }

  $("#tabCalc").addEventListener("click", () => setTab("calc"));
  $("#tabInfo").addEventListener("click", () => setTab("info"));
  $("#tabAC").addEventListener("click", () => setTab("ac"));

  // -------------------------
  // Results math
  // -------------------------
  function calcLosses() {
    const m250 = num(state.meter250);
    const m1000 = num(state.meter1000);

    const tapVal = num(state.currentTapValue);
    const tapThru = num(state.currentTapThru);

    const inlineThru = num(state.inlineTapThruEach) * (state.inlineTapCount || 0);

    const internal = passiveById(state.internalPassive);
    const field = passiveById(state.fieldPassive);

    // Cable segments loss sums
    let cableLoss250 = 0;
    let cableLoss1000 = 0;

    for (const s of state.segments) {
      const feet = num(s.feet);
      const c = cableById(s.cableId);
      cableLoss250 += (feet / 100) * c.loss250;
      cableLoss1000 += (feet / 100) * c.loss1000;
    }

    // IMPORTANT:
    // You told me the tap-port output you want is:
    // Meter - cableLoss - inlineThru - currentTapValue - device losses
    // (no meter pad)
    //
    // Also we handle two possible measurement points:
    // - UPSTREAM: meter is before run; subtract everything to get tap port.
    // - AT TAP: meter is already at the current tap port; then tap port = meter.
    //
    // We compute BOTH 250 and 1000.

    const dev250 = internal.loss250 + field.loss250;
    const dev1000 = internal.loss1000 + field.loss1000;

    function tapPortFromUpstream(m, cableLoss, devLoss, inlineThruLoss, tapValue) {
      return m - cableLoss - devLoss - inlineThruLoss - tapValue;
    }
    function tapInFromUpstream(m, cableLoss, devLoss, inlineThruLoss) {
      // level arriving at current tap IN (before tap value subtraction)
      return m - cableLoss - devLoss - inlineThruLoss;
    }

    const isUpstream = state.readingTaken === "upstream";
    const isAtTap = state.readingTaken === "tap";

    let tapPort250 = 0, tapPort1000 = 0;
    let tapIn250 = 0, tapIn1000 = 0;

    if (isUpstream) {
      tapIn250 = tapInFromUpstream(m250, cableLoss250, dev250, inlineThru);
      tapIn1000 = tapInFromUpstream(m1000, cableLoss1000, dev1000, inlineThru);

      tapPort250 = tapPortFromUpstream(m250, cableLoss250, dev250, inlineThru, tapVal);
      tapPort1000 = tapPortFromUpstream(m1000, cableLoss1000, dev1000, inlineThru, tapVal);
    } else if (isAtTap) {
      // measured at current tap port already
      tapPort250 = m250;
      tapPort1000 = m1000;

      // back-calc tap-in at the device (add tap value only)
      tapIn250 = m250 + tapVal;
      tapIn1000 = m1000 + tapVal;
    }

    // THRU outputs: THRU path uses tap THRU loss (and does NOT subtract tap value)
    // If upstream measured, THRU out = upstream - cable - devices - inlineThru - currentTapThru
    // If at tap measured at port, we can estimate THRU out = (tapPort + tapVal) - currentTapThru
    let thruOut250 = 0, thruOut1000 = 0;
    if (isUpstream) {
      thruOut250 = m250 - cableLoss250 - dev250 - inlineThru - tapThru;
      thruOut1000 = m1000 - cableLoss1000 - dev1000 - inlineThru - tapThru;
    } else if (isAtTap) {
      thruOut250 = (m250 + tapVal) - tapThru;
      thruOut1000 = (m1000 + tapVal) - tapThru;
    }

    return {
      m250, m1000,
      cableLoss250, cableLoss1000,
      dev250, dev1000,
      inlineThru,
      tapVal, tapThru,
      tapIn250, tapIn1000,
      tapPort250, tapPort1000,
      thruOut250, thruOut1000,
      internal, field,
    };
  }

  // -------------------------
  // Wizard Steps (questionnaire)
  // -------------------------
  const steps = [
    {
      key: "start",
      title: "START",
      render: () => {
        const box = el("div", { class: "card" }, [
          el("div", { class: "cardTitle", text: "START" }),
          el("div", { class: "muted", text: "Tap START once to unlock the wizard (required on iPhone so buttons + sound work)." }),
        ]);

        const row = el("div", { class: "row" }, []);
        const startBtn = el("button", { class: "btn primary", type: "button", text: "START" });
        const status = el("span", { class: "pill", text: state.unlocked ? "Ready ✓" : "Locked" });

        startBtn.addEventListener("click", () => {
          state.unlocked = true;
          status.textContent = "Ready ✓";
          // nothing overlay-ish stays around; just enable next
          updateNav();
        });

        row.appendChild(startBtn);
        row.appendChild(status);
        box.appendChild(row);

        return box;
      },
      canNext: () => state.unlocked === true,
    },

    {
      key: "where",
      title: "A) Where is your meter reading taken?",
      render: () => {
        const box = el("div", { class: "card" }, [
          el("div", { class: "cardTitle", text: "A) WHERE IS YOUR METER READING TAKEN?" }),
          el("div", { class: "muted", text: "At Current Tap = measured at current tap port. Upstream = measured before losses." }),
        ]);

        const grid = el("div", { class: "choiceGrid" }, []);
        const btnTap = el("button", { class: "choiceBtn", type: "button" }, [
          el("div", { class: "choiceBig", text: "AT CURRENT TAP" }),
          el("div", { class: "muted", text: "measured at the tap port" }),
        ]);
        const btnUp = el("button", { class: "choiceBtn", type: "button" }, [
          el("div", { class: "choiceBig", text: "UPSTREAM" }),
          el("div", { class: "muted", text: "measured before losses" }),
        ]);

        function refreshChoice() {
          btnTap.classList.toggle("selected", state.readingTaken === "tap");
          btnUp.classList.toggle("selected", state.readingTaken === "upstream");
        }

        btnTap.addEventListener("click", () => { state.readingTaken = "tap"; refreshChoice(); updateNav(); });
        btnUp.addEventListener("click", () => { state.readingTaken = "upstream"; refreshChoice(); updateNav(); });

        refreshChoice();
        grid.appendChild(btnTap);
        grid.appendChild(btnUp);
        box.appendChild(grid);

        return box;
      },
      canNext: () => state.readingTaken === "tap" || state.readingTaken === "upstream",
    },

    {
      key: "meters",
      title: "B) Meter readings (dBmV)",
      render: () => {
        const box = el("div", { class: "card" }, [
          el("div", { class: "cardTitle", text: "B) METER READINGS (dBmV)" }),
          el("div", { class: "muted", text: "Enter both levels. No meter pad (assumed 0)." }),
        ]);

        const row = el("div", { class: "row" }, []);
        const i250 = el("input", { class: "in", inputmode: "decimal", placeholder: "Meter @250 (ex: 34.5)" });
        const i1000 = el("input", { class: "in", inputmode: "decimal", placeholder: "Meter @1000 (ex: 41)" });

        // IMPORTANT: do not render() on input — prevents focus drop
        i250.value = state.meter250;
        i1000.value = state.meter1000;

        i250.addEventListener("input", () => { state.meter250 = i250.value; updateNav(); });
        i1000.addEventListener("input", () => { state.meter1000 = i1000.value; updateNav(); });

        row.appendChild(i250);
        row.appendChild(i1000);
        box.appendChild(row);
        return box;
      },
      canNext: () => Number.isFinite(num(state.meter250)) && Number.isFinite(num(state.meter1000)) && (String(state.meter250).trim() !== "" && String(state.meter1000).trim() !== ""),
    },

    {
      key: "tap",
      title: "C) Current Tap",
      render: () => {
        const box = el("div", { class: "card" }, [
          el("div", { class: "cardTitle", text: "C) CURRENT TAP" }),
          el("div", { class: "muted", text: "Tap value affects TAP PORT output. THRU loss affects THRU path." }),
        ]);

        const row = el("div", { class: "row" }, []);
        const tapVal = el("input", { class: "in", inputmode: "decimal", placeholder: "Tap value dB (ex: 4)" });
        const tapThru = el("input", { class: "in", inputmode: "decimal", placeholder: "Tap THRU loss dB (ex: 1.5)" });

        tapVal.value = state.currentTapValue;
        tapThru.value = state.currentTapThru;

        tapVal.addEventListener("input", () => { state.currentTapValue = tapVal.value; updateNav(); });
        tapThru.addEventListener("input", () => { state.currentTapThru = tapThru.value; updateNav(); });

        row.appendChild(tapVal);
        row.appendChild(tapThru);
        box.appendChild(row);
        return box;
      },
      canNext: () => String(state.currentTapValue).trim() !== "" && String(state.currentTapThru).trim() !== "",
    },

    {
      key: "inlines",
      title: "D) Inline taps (THRU losses)",
      render: () => {
        const box = el("div", { class: "card" }, [
          el("div", { class: "cardTitle", text: "D) INLINE TAPS (THRU LOSSES)" }),
          el("div", { class: "muted", text: "If there are inline taps between meter point and the current tap, add their THRU loss." }),
        ]);

        const row = el("div", { class: "row" }, []);
        const thruEach = el("input", { class: "in", inputmode: "decimal", placeholder: "Inline tap THRU loss each (ex: 1.5)" });
        thruEach.value = state.inlineTapThruEach;

        const countWrap = el("div", { class: "countWrap" }, []);
        const minus = el("button", { class: "btn", type: "button", text: "−" });
        const count = el("div", { class: "pill", text: String(state.inlineTapCount || 0) });
        const plus = el("button", { class: "btn", type: "button", text: "+" });

        thruEach.addEventListener("input", () => { state.inlineTapThruEach = thruEach.value; updateNav(); });

        minus.addEventListener("click", () => {
          state.inlineTapCount = Math.max(0, (state.inlineTapCount || 0) - 1);
          count.textContent = String(state.inlineTapCount);
          updateNav();
        });
        plus.addEventListener("click", () => {
          state.inlineTapCount = Math.min(50, (state.inlineTapCount || 0) + 1);
          count.textContent = String(state.inlineTapCount);
          updateNav();
        });

        countWrap.appendChild(minus);
        countWrap.appendChild(count);
        countWrap.appendChild(plus);

        row.appendChild(thruEach);
        row.appendChild(countWrap);
        box.appendChild(row);

        const total = num(state.inlineTapThruEach) * (state.inlineTapCount || 0);
        box.appendChild(el("div", { class: "muted", text: `Inline THRU total: ${fmt(total)} dB` }));
        return box;
      },
      canNext: () => String(state.inlineTapThruEach).trim() !== "" && (state.inlineTapCount || 0) >= 0,
    },

    {
      key: "devices",
      title: "E) Internal + Field devices",
      render: () => {
        const box = el("div", { class: "card" }, [
          el("div", { class: "cardTitle", text: "E) INTERNAL + FIELD DEVICES" }),
          el("div", { class: "muted", text: "Choose any internal mini-bridger passive and any in-field passive. (Optional)" }),
        ]);

        const row = el("div", { class: "row" }, []);
        const sInternal = el("select", { class: "sel" }, []);
        const sField = el("select", { class: "sel" }, []);

        for (const p of PASSIVES) {
          sInternal.appendChild(el("option", { value: p.id, text: `Internal: ${p.label}` }));
          sField.appendChild(el("option", { value: p.id, text: `Field: ${p.label}` }));
        }

        sInternal.value = state.internalPassive;
        sField.value = state.fieldPassive;

        sInternal.addEventListener("change", () => { state.internalPassive = sInternal.value; });
        sField.addEventListener("change", () => { state.fieldPassive = sField.value; });

        row.appendChild(sInternal);
        row.appendChild(sField);
        box.appendChild(row);

        box.appendChild(el("div", { class: "muted", text: "Device losses are applied automatically at 250 and 1000." }));
        return box;
      },
      canNext: () => true,
    },

    {
      key: "segments",
      title: "F) Cable segments",
      render: () => {
        const box = el("div", { class: "card" }, [
          el("div", { class: "cardTitle", text: "F) CABLE SEGMENTS" }),
          el("div", { class: "muted", text: "Add segments if the run changes cable type. Loss is calculated at 250 and 1000." }),
        ]);

        const list = el("div", { class: "segList" }, []);

        function renderSegments() {
          list.replaceChildren();

          state.segments.forEach((seg, idx) => {
            const row = el("div", { class: "segRow" }, []);

            const sel = el("select", { class: "sel" }, []);
            for (const c of CABLES) sel.appendChild(el("option", { value: c.id, text: c.label }));
            sel.value = seg.cableId;

            const ft = el("input", { class: "in", inputmode: "decimal", placeholder: "feet" });
            ft.value = seg.feet;

            // NO re-render on input
            sel.addEventListener("change", () => { seg.cableId = sel.value; updateSegTotals(); });
            ft.addEventListener("input", () => { seg.feet = ft.value; updateSegTotals(); });

            const del = el("button", { class: "btn danger", type: "button", text: "Remove" });
            del.addEventListener("click", () => {
              state.segments.splice(idx, 1);
              if (state.segments.length === 0) state.segments.push({ cableId: "P3-500", feet: "" });
              renderSegments();
              updateSegTotals();
            });

            row.appendChild(el("div", { class: "segN", text: `${idx + 1}` }));
            row.appendChild(sel);
            row.appendChild(ft);
            row.appendChild(del);
            list.appendChild(row);
          });

          updateSegTotals();
        }

        const addBtn = el("button", { class: "btn", type: "button", text: "Add Segment" });
        addBtn.addEventListener("click", () => {
          state.segments.push({ cableId: "P3-500", feet: "" });
          renderSegments();
        });

        const totals = el("div", { class: "totals" }, []);
        function updateSegTotals() {
          const r = calcLosses();
          totals.textContent = `Cable loss: 250 = ${fmt(r.cableLoss250)} dB • 1000 = ${fmt(r.cableLoss1000)} dB`;
          updateNav();
        }

        box.appendChild(list);
        box.appendChild(addBtn);
        box.appendChild(totals);

        // Mini 8-input sum calculator (ONLY on this step)
        const sumBox = el("div", { class: "miniCalc" }, [
          el("div", { class: "cardTitle", text: "Mini Sum (8 inputs)" }),
          el("div", { class: "muted", text: "Quick add: 3+4+2+8+4+6+5+5 =" }),
        ]);

        const sumGrid = el("div", { class: "sumGrid" }, []);
        const sumOut = el("div", { class: "pill", text: "Sum: 0.00" });

        function updateSum() {
          let s = 0;
          for (const v of state.sumInputs) s += num(v);
          sumOut.textContent = `Sum: ${fmt(s)}`;
        }

        state.sumInputs.forEach((v, i) => {
          const inp = el("input", { class: "in", inputmode: "decimal", placeholder: `${i + 1}` });
          inp.value = v;
          inp.addEventListener("input", () => {
            state.sumInputs[i] = inp.value;
            updateSum();
          });
          sumGrid.appendChild(inp);
        });

        const clearSum = el("button", { class: "btn ghost", type: "button", text: "Clear" });
        clearSum.addEventListener("click", () => {
          state.sumInputs = Array.from({ length: 8 }, () => "");
          // refresh grid values without re-rendering whole page
          [...sumGrid.querySelectorAll("input")].forEach((inp) => (inp.value = ""));
          updateSum();
        });

        sumBox.appendChild(sumGrid);
        sumBox.appendChild(el("div", { class: "row" }, [sumOut, clearSum]));
        box.appendChild(sumBox);

        renderSegments();
        updateSum();
        return box;
      },
      canNext: () => true,
    },

    {
      key: "results",
      title: "Results",
      render: () => {
        const r = calcLosses();
        const box = el("div", { class: "card" }, [
          el("div", { class: "cardTitle", text: "RESULTS (250 + 1000)" }),
        ]);

        const warn = [];
        if (!state.readingTaken) warn.push("Pick where reading was taken.");
        if (String(state.meter250).trim() === "" || String(state.meter1000).trim() === "") warn.push("Enter both meter readings.");
        if (warn.length) {
          box.appendChild(el("div", { class: "warn", text: "Missing: " + warn.join(" • ") }));
        }

        const list = el("div", { class: "resultGrid" }, []);

        list.appendChild(resultRow("Tap IN", r.tapIn250, r.tapIn1000));
        list.appendChild(resultRow("Tap PORT output", r.tapPort250, r.tapPort1000));
        list.appendChild(resultRow("THRU output", r.thruOut250, r.thruOut1000));

        box.appendChild(list);

        box.appendChild(el("div", { class: "divider" }));
        box.appendChild(el("div", { class: "muted", text:
          `Inline THRU total: ${fmt(r.inlineThru)} dB • Devices: 250=${fmt(r.dev250)} dB, 1000=${fmt(r.dev1000)} dB • Cable: 250=${fmt(r.cableLoss250)} dB, 1000=${fmt(r.cableLoss1000)} dB`
        }));

        // quick formula reminder matching what you asked for:
        if (state.readingTaken === "upstream") {
          box.appendChild(el("div", { class: "muted", text:
            `Tap PORT (upstream) = Meter − Cable − Devices − Inline THRU − Tap Value`
          }));
        } else if (state.readingTaken === "tap") {
          box.appendChild(el("div", { class: "muted", text:
            `Tap PORT (at tap) = Meter (already at port)`
          }));
        }

        return box;
      },
      canNext: () => true,
    }
  ];

  function resultRow(label, v250, v1000) {
    return el("div", { class: "rRow" }, [
      el("div", { class: "rLabel", text: label }),
      el("div", { class: "rVal", text: `250: ${fmt(v250)} dBmV` }),
      el("div", { class: "rVal", text: `1000: ${fmt(v1000)} dBmV` }),
    ]);
  }

  // -------------------------
  // Render current tab
  // -------------------------
  function renderTab() {
    main.replaceChildren();

    if (state.tab === "calc") {
      main.appendChild(renderWizard());
    } else if (state.tab === "info") {
      main.appendChild(renderInfoTab());
    } else if (state.tab === "ac") {
      main.appendChild(renderACTab());
    }
  }

  function renderWizard() {
    const wrap = el("div", { class: "wizard" }, []);

    // Step card
    const stepObj = steps[state.step] || steps[0];
    const stepCard = stepObj.render();
    wrap.appendChild(stepCard);

    // Nav
    const nav = el("div", { class: "navBar" }, []);
    const back = el("button", { class: "btn", type: "button", text: "Back" });
    const next = el("button", { class: "btn primary", type: "button", text: state.step >= steps.length - 1 ? "Done" : "Next" });

    back.addEventListener("click", () => {
      state.step = Math.max(0, state.step - 1);
      renderTab();
    });

    next.addEventListener("click", () => {
      // jump to results if top Results pressed too
      state.step = Math.min(steps.length - 1, state.step + 1);
      renderTab();
    });

    nav.appendChild(back);
    nav.appendChild(next);
    wrap.appendChild(nav);

    // Expose for updateNav()
    wrap._navBack = back;
    wrap._navNext = next;

    // initial nav state
    setTimeout(updateNav, 0);

    return wrap;
  }

  function updateNav() {
    const wizard = main.querySelector(".wizard");
    if (!wizard) return;

    const back = wizard._navBack;
    const next = wizard._navNext;
    if (!back || !next) return;

    back.disabled = state.step === 0;

    const stepObj = steps[state.step] || steps[0];
    const ok = stepObj.canNext ? !!stepObj.canNext() : true;

    next.disabled = !ok;

    // style disabled
    next.classList.toggle("disabled", next.disabled);
    back.classList.toggle("disabled", back.disabled);
  }

  // -------------------------
  // CATV Info tab
  // -------------------------
  function renderInfoTab() {
    const box = el("div", { class: "card" }, [
      el("div", { class: "cardTitle", text: "CATV INFO" }),
      el("div", { class: "muted", text: "Add quick reference notes here (sweep shapes, reflections, hump, notch, formulas, etc.)." }),
      el("div", { class: "infoBlock" }, [
        el("div", { class: "infoH", text: "Reflections / Standing Waves" }),
        el("div", { class: "muted", text: "Often caused by impedance mismatch (not 75Ω), loose connectors, bad ports, bidirectional testpoints." }),
      ]),
      el("div", { class: "infoBlock" }, [
        el("div", { class: "infoH", text: "Distance-to-fault (sweep / standing wave)" }),
        el("div", { class: "muted", text: "D = 492 (Vp / F)  •  D in feet  •  Vp = velocity (% of c, typical ~87)  •  F = bandwidth (MHz)" }),
      ]),
      el("div", { class: "infoBlock" }, [
        el("div", { class: "infoH", text: "Roll-off / High-end roll-off" }),
        el("div", { class: "muted", text: "Loose connectors, loose modules, amplifier misalignment, diplex issues, improper splicing, wrong-band passives." }),
      ]),
      el("div", { class: "infoBlock" }, [
        el("div", { class: "infoH", text: "Notch" }),
        el("div", { class: "muted", text: "Sharp dip often from loose connector, tap/coupler faceplates, amplifier modules, internal RF grounding." }),
      ]),
    ]);
    return box;
  }

  // -------------------------
  // AC Power tab (simple useful starter)
  // -------------------------
  function renderACTab() {
    const box = el("div", { class: "card" }, [
      el("div", { class: "cardTitle", text: "AC POWER (Starter Calc)" }),
      el("div", { class: "muted", text: "Quick voltage drop sanity check. (We can expand to .500/.625/.750/.875 later.)" }),
    ]);

    const row = el("div", { class: "row" }, []);
    const vStart = el("input", { class: "in", inputmode: "decimal", placeholder: "Start AC volts (ex: 90)" });
    const vEnd = el("input", { class: "in", inputmode: "decimal", placeholder: "End AC volts (ex: 82)" });

    const out = el("div", { class: "pill", text: "Drop: 0.00 V" });

    function upd() {
      const d = num(vStart.value) - num(vEnd.value);
      out.textContent = `Drop: ${fmt(d)} V`;
    }

    vStart.addEventListener("input", upd);
    vEnd.addEventListener("input", upd);

    row.appendChild(vStart);
    row.appendChild(vEnd);
    box.appendChild(row);
    box.appendChild(out);

    box.appendChild(el("div", { class: "muted", text: "Next upgrade: choose cable size + distance + load amps to estimate expected drop." }));
    return box;
  }

  // -------------------------
  // Top buttons
  // -------------------------
  $("#btnReset").addEventListener("click", () => {
    // soft reset
    state.tab = "calc";
    state.unlocked = false;
    state.step = 0;

    state.readingTaken = "";
    state.meter250 = "";
    state.meter1000 = "";
    state.currentTapValue = "";
    state.currentTapThru = "";

    state.internalPassive = "NONE";
    state.fieldPassive = "NONE";

    state.inlineTapThruEach = "";
    state.inlineTapCount = 0;

    state.segments = [{ cableId: "P3-500", feet: "" }];
    state.sumInputs = Array.from({ length: 8 }, () => "");

    setTab("calc");
  });

  $("#btnResults").addEventListener("click", () => {
    // Jump to results step (last)
    state.tab = "calc";
    state.step = steps.length - 1;
    setTab("calc");
  });

  // First paint
  setTab("calc");
})();
