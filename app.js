// CATV Calc — Stable Wizard (NO START BUTTON, NO PAD/COMP)

const app = document.getElementById("app");
if (!app) throw new Error("Missing <div id='app'></div> in index.html");

const LOSS = {
  "P3-500": {250:1.20,1000:2.52},
  "P3-625": {250:1.00,1000:2.07},
  "P3-750": {250:0.81,1000:1.74},
  "P3-875": {250:0.72,1000:1.53},
  "QR540":  {250:1.03,1000:2.17},
  "RG6":    {250:3.30,1000:6.55},
  "RG11":   {250:2.05,1000:4.35},
  "RG59":   {250:4.10,1000:8.12}
};

let state = {
  step: 0,
  mode: null,          // "AT_TAP" or "UPSTREAM"
  meter250: "",
  meter1000: "",
  tapValue: "",
  tapThru: "",
  inlineLoss: "",
  segments: []         // {cable, ft}
};

function num(v){ const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
function f(v){ return (Number.isFinite(v) ? v : 0).toFixed(2); }

function h(tag, attrs={}, children=[]){
  const el = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)){
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v);
  }
  children.forEach(c => el.appendChild(c));
  return el;
}

function btn(label, onClick, extraClass=""){
  const b = h("button", { class:`btn ${extraClass}`, type:"button", text:label });
  b.addEventListener("click", onClick);
  b.addEventListener("touchend", (e)=>{ e.preventDefault(); onClick(); }, {passive:false});
  return b;
}

function input(placeholder, value, onInput){
  const i = h("input", { class:"in", placeholder, inputmode:"decimal" });
  i.value = value ?? "";
  i.addEventListener("input", ()=> onInput(i.value));
  return i;
}

function selectCable(value, onChange){
  const s = h("select", { class:"sel" });
  Object.keys(LOSS).forEach(k=>{
    const o = h("option", { value:k, text:k });
    s.appendChild(o);
  });
  s.value = value || "P3-500";
  s.addEventListener("change", ()=> onChange(s.value));
  return s;
}

function next(){ state.step = Math.min(5, state.step + 1); render(); }
function back(){ state.step = Math.max(0, state.step - 1); render(); }

function calc(freq){
  const meter = (freq===250) ? num(state.meter250) : num(state.meter1000);

  let cableLoss = 0;
  for (const s of state.segments){
    const ft = num(s.ft);
    const row = LOSS[s.cable];
    if (!row) continue;
    cableLoss += row[freq] * (ft/100);
  }

  const inline = num(state.inlineLoss);
  const tapV = num(state.tapValue);
  const tapT = num(state.tapThru);

  let tapIn;
  if (state.mode === "UPSTREAM"){
    // tapIN = meter - cable - inline
    tapIn = meter - cableLoss - inline;
  } else {
    // AT_TAP: meter is tapPORT
    // tapIN = tapPORT + tapVALUE
    tapIn = meter + tapV;
  }

  const tapPort = tapIn - tapV;
  const thruOut = tapIn - tapT;

  return { meter, cableLoss, inline, tapIn, tapPort, thruOut, tapV, tapT };
}

function screenWrap(title, hint){
  const top = h("div", { class:"topbar" }, [
    h("div", { class:"brand" }, [
      h("div", { class:"title", text:"CATV Calc" }),
      h("div", { class:"sub", text:"Stable Wizard • Dual-band (250 + 1000) • No pad/comp" })
    ]),
    h("div", { class:"actions" }, [
      btn("Reset", ()=>{ state = {...state, step:0, mode:null, meter250:"", meter1000:"", tapValue:"", tapThru:"", inlineLoss:"", segments:[] }; render(); }, "ghost")
    ])
  ]);

  const card = h("div", { class:"card" }, [
    h("div", { class:"stepHead" }, [
      h("div", {}, [
        h("div", { class:"stepTitle", text:title }),
        h("div", { class:"stepHint", text:hint })
      ]),
      h("div", { class:"pill", text:`Step ${state.step+1}/6` })
    ])
  ]);

  return { top, card };
}

function nav(canNext=true){
  const bar = h("div", { class:"navbar" }, [
    btn("Back", back, "ghost"),
    btn("Next", next, "primary")
  ]);
  bar.children[0].disabled = (state.step===0);
  bar.children[1].disabled = !canNext;
  return bar;
}

function render(){
  app.innerHTML = "";

  if (state.step === 0){
    const { top, card } = screenWrap(
      "A) Where is your reading taken?",
      "AT TAP = meter is at the tap port. UPSTREAM = meter is before cable/inline losses."
    );

    const grid = h("div", { class:"choiceGrid" }, [
      h("div", { class:`choice ${state.mode==="AT_TAP"?"selected":""}` }, [
        h("div", { class:"big", text:"AT TAP" }),
        h("div", { class:"muted", text:"tap port reading" })
      ]),
      h("div", { class:`choice ${state.mode==="UPSTREAM"?"selected":""}` }, [
        h("div", { class:"big", text:"UPSTREAM" }),
        h("div", { class:"muted", text:"before run losses" })
      ])
    ]);

    grid.children[0].addEventListener("click", ()=>{ state.mode="AT_TAP"; render(); });
    grid.children[1].addEventListener("click", ()=>{ state.mode="UPSTREAM"; render(); });

    card.appendChild(grid);
    card.appendChild(nav(state.mode==="AT_TAP" || state.mode==="UPSTREAM"));

    app.appendChild(top);
    app.appendChild(card);
    return;
  }

  if (state.step === 1){
    const { top, card } = screenWrap("B) Meter readings (dBmV)", "Enter both readings.");
    const g = h("div", { class:"grid2" }, [
      input("Meter @250 (ex 34.5)", state.meter250, v=> state.meter250=v),
      input("Meter @1000 (ex 41)", state.meter1000, v=> state.meter1000=v)
    ]);
    card.appendChild(g);
    card.appendChild(nav(state.meter250!=="" && state.meter1000!==""));
    app.appendChild(top); app.appendChild(card);
    return;
  }

  if (state.step === 2){
    const { top, card } = screenWrap("C) Current tap", "Tap value and tap THRU loss.");
    const g = h("div", { class:"grid2" }, [
      input("Tap value dB (ex 4)", state.tapValue, v=> state.tapValue=v),
      input("Tap THRU dB (ex 1.5)", state.tapThru, v=> state.tapThru=v)
    ]);
    card.appendChild(g);
    card.appendChild(nav(state.tapValue!=="" && state.tapThru!==""));
    app.appendChild(top); app.appendChild(card);
    return;
  }

  if (state.step === 3){
    const { top, card } = screenWrap("D) Inline tap THRU losses (TOTAL)", "Enter total THRU loss between meter point and current tap.");
    card.appendChild(input("Inline THRU total (ex 4.50)", state.inlineLoss, v=> state.inlineLoss=v));
    card.appendChild(nav(true));
    app.appendChild(top); app.appendChild(card);
    return;
  }

  if (state.step === 4){
    const { top, card } = screenWrap("E) Cable segments", "Add segments if cable changes along the run.");
    const list = h("div", {});
    const addRow = () => {
      const seg = { cable:"P3-500", ft:"" };
      state.segments.push(seg);

      const row = h("div", { class:"segRow" }, []);
      const tag = h("div", { class:"pill", text:`Seg ${state.segments.length}` });
      const sel = selectCable(seg.cable, v=> seg.cable=v);
      const ft = input("feet", seg.ft, v=> seg.ft=v);
      const rm = btn("Remove", ()=>{
        const idx = state.segments.indexOf(seg);
        if (idx >= 0) state.segments.splice(idx,1);
        render();
      }, "danger");

      row.appendChild(tag); row.appendChild(sel); row.appendChild(ft); row.appendChild(rm);
      list.appendChild(row);
    };

    // existing
    state.segments.forEach(seg=>{
      const row = h("div", { class:"segRow" }, []);
      const idx = state.segments.indexOf(seg) + 1;
      const tag = h("div", { class:"pill", text:`Seg ${idx}` });
      const sel = selectCable(seg.cable, v=> seg.cable=v);
      const ft = input("feet", seg.ft, v=> seg.ft=v);
      const rm = btn("Remove", ()=>{
        const i = state.segments.indexOf(seg);
        if (i>=0) state.segments.splice(i,1);
        render();
      }, "danger");
      row.appendChild(tag); row.appendChild(sel); row.appendChild(ft); row.appendChild(rm);
      list.appendChild(row);
    });

    card.appendChild(list);
    card.appendChild(btn("Add segment", ()=>{ addRow(); render(); }));
    card.appendChild(nav(true));
    app.appendChild(top); app.appendChild(card);
    return;
  }

  // step 5 results
  const { top, card } = screenWrap("RESULTS", "Shows both 250 and 1000 automatically.");
  const r250 = calc(250);
  const r1000 = calc(1000);

  const pre = h("pre", { }, []);
  pre.textContent =
`250 MHz
Tap IN:   ${f(r250.tapIn)} dBmV
Tap PORT: ${f(r250.tapPort)} dBmV
THRU OUT: ${f(r250.thruOut)} dBmV
Cable loss: -${f(r250.cableLoss)} dB   Inline: -${f(r250.inline)} dB

1000 MHz
Tap IN:   ${f(r1000.tapIn)} dBmV
Tap PORT: ${f(r1000.tapPort)} dBmV
THRU OUT: ${f(r1000.thruOut)} dBmV
Cable loss: -${f(r1000.cableLoss)} dB   Inline: -${f(r1000.inline)} dB
`;

  card.appendChild(pre);
  card.appendChild(nav(true));
  app.appendChild(top); app.appendChild(card);
}

render();
