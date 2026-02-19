// ================= CATV CALC — STABLE FIELD VERSION =================
// No pad
// No compensation
// Correct AT TAP vs UPSTREAM math
// Inline taps are "in the way" losses
// ================================================================

const app = document.getElementById("app");

const LOSS = {
  "P3-500": {250:1.20,1000:2.52},
  "P3-625": {250:1.00,1000:2.07},
  "P3-750": {250:0.81,1000:1.74},
  "P3-875": {250:0.72,1000:1.53},
  "QR540": {250:1.03,1000:2.17},
  "RG6": {250:3.30,1000:6.55},
  "RG11": {250:2.05,1000:4.35},
  "RG59": {250:4.10,1000:8.12}
};

let state = {
  step:0,
  mode:null,
  meter250:null,
  meter1000:null,
  tapValue:null,
  tapThru:null,
  inlineLoss:0,
  segments:[]
};

function num(v){ return parseFloat(v)||0 }
function f(v){ return Number(v).toFixed(2) }

// ---------------- RENDER ----------------
function render(){
  app.innerHTML="";
  if(state.step===0) return screenMode();
  if(state.step===1) return screenMeter();
  if(state.step===2) return screenTap();
  if(state.step===3) return screenInline();
  if(state.step===4) return screenSegments();
  if(state.step===5) return screenResults();
}

function next(){ state.step++; render() }
function back(){ state.step--; if(state.step<0)state.step=0; render() }

// ---------------- SCREENS ----------------

function button(label, fn){
  const b=document.createElement("button");
  b.className="btn";
  b.textContent=label;
  b.onclick=fn;
  return b;
}

// MODE
function screenMode(){
  app.appendChild(title("Where is your reading taken?"));

  app.appendChild(button("AT TAP",()=>{
    state.mode="AT_TAP";
    next();
  }));

  app.appendChild(button("UPSTREAM",()=>{
    state.mode="UPSTREAM";
    next();
  }));
}

// METER
function screenMeter(){
  app.appendChild(title("Enter meter readings"));

  const low=input("250 MHz");
  const high=input("1000 MHz");

  app.appendChild(low);
  app.appendChild(high);

  app.appendChild(button("Next",()=>{
    state.meter250=num(low.value);
    state.meter1000=num(high.value);
    next();
  }));

  app.appendChild(button("Back",back));
}

// TAP
function screenTap(){
  app.appendChild(title("Current Tap"));

  const tv=input("Tap Value (ex 4)");
  const tt=input("Tap THRU (ex 1.5)");

  app.appendChild(tv);
  app.appendChild(tt);

  app.appendChild(button("Next",()=>{
    state.tapValue=num(tv.value);
    state.tapThru=num(tt.value);
    next();
  }));

  app.appendChild(button("Back",back));
}

// INLINE
function screenInline(){
  app.appendChild(title("Inline tap THRU losses (total)"));

  const il=input("Total THRU loss (ex 4.5)");

  app.appendChild(il);

  app.appendChild(button("Next",()=>{
    state.inlineLoss=num(il.value);
    next();
  }));

  app.appendChild(button("Back",back));
}

// SEGMENTS
function screenSegments(){
  app.appendChild(title("Cable segments"));

  const cable=document.createElement("select");
  Object.keys(LOSS).forEach(c=>{
    const o=document.createElement("option");
    o.value=c;
    o.textContent=c;
    cable.appendChild(o);
  });

  const feet=input("Feet");

  app.appendChild(cable);
  app.appendChild(feet);

  app.appendChild(button("Add Segment",()=>{
    state.segments.push({cable:cable.value,ft:num(feet.value)});
    feet.value="";
  }));

  app.appendChild(button("Done",next));
  app.appendChild(button("Back",back));
}

// RESULTS
function screenResults(){
  app.appendChild(title("RESULTS"));

  const low=calculate(250);
  const high=calculate(1000);

  const pre=document.createElement("pre");
  pre.textContent=
`250 MHz
Tap In: ${f(low.tapIn)} dBmV
Tap Port: ${f(low.tapPort)} dBmV
Thru Out: ${f(low.thru)} dBmV

1000 MHz
Tap In: ${f(high.tapIn)} dBmV
Tap Port: ${f(high.tapPort)} dBmV
Thru Out: ${f(high.thru)} dBmV`;

  app.appendChild(pre);
  app.appendChild(button("Restart",()=>{location.reload()}));
}

// ---------------- MATH ----------------
function calculate(freq){
  let start=(freq===250?state.meter250:state.meter1000);

  let cableLoss=0;
  state.segments.forEach(s=>{
    cableLoss+=LOSS[s.cable][freq]*(s.ft/100);
  });

  let tapIn;

  if(state.mode==="UPSTREAM"){
    tapIn=start-cableLoss-state.inlineLoss;
  }else{
    tapIn=start+state.tapValue;
  }

  let tapPort=tapIn-state.tapValue;
  let thru=tapIn-state.tapThru;

  return {tapIn,tapPort,thru};
}

// ---------------- UI HELPERS ----------------
function title(t){
  const h=document.createElement("h2");
  h.textContent=t;
  return h;
}

function input(ph){
  const i=document.createElement("input");
  i.placeholder=ph;
  i.type="number";
  return i;
}

render();
