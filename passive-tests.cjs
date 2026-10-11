const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,textContent:'',style:{},classList:{add(){},remove(){},contains(){return false;},toggle(){}},addEventListener(){},appendChild(){},focus(){},reset(){}});return elements.get(id);};
let stored=null;
const ctx=vm.createContext({console,window:{addEventListener(){}},document:{getElementById:el},localStorage:{getItem:()=>stored,setItem(){},removeItem(){}},setTimeout(){}});
for(const f of ['atx-data.js','passive-data.js','app.js','tx.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+f,'utf8'),ctx);
const run=s=>vm.runInContext(s,ctx),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
near(run('passiveLoss({model:"XSC-2-04",path:"thru"},250)'),4.2+.1*46/54);
near(run('passiveLoss({model:"XSC-2-08",path:"thru"},1002)'),2.4);
near(run('passiveLoss({model:"XSC-2-08",path:"tap"},1002)'),9);
near(run('passiveLoss({model:"XSC-2-959",path:"thru"},42)'),4.4);
near(run('passiveLoss({model:"XSC-2-959",path:"tap"},42)'),8.1);
run('state.tapBasis="maximum"');near(run('passiveLoss({model:"XSC-2-12",path:"tap"},1002)'),13.2);
assert.equal(run('fieldChoices().length'),11);assert.equal(run('validPassive({model:"XSI-2-20",path:"tap"})'),false);
run('state=defaultState();state.field=[{model:"XSC-2-12",path:"thru"},{model:"XSC-2-959",path:"tap"}];');
near(run('computeFor(250).field'),1.4+8.4+.1*46/54);
run('state.currentTapModel="2:17";state.currentTapValue=17');el('txBaseline').value='38';
near(run('window.catvTX.atFrequency(31,window.catvTX.settings()).tx'),18+17+1.2+8+.1*21/32);
el('txDevices').value='3';near(run('window.catvTX.atFrequency(31,window.catvTX.settings()).tx'),18+17+3);
el('txDevices').value='';
stored=JSON.stringify({field:[{model:'XSC-2-16',path:'tap'},{model:'XSI-2-20',path:'thru'}]});run('state=defaultState();load()');assert.equal(run('state.field.length'),2);assert.equal(run('state.field[0].path'),'tap');
for(const basis of ['typical','maximum']){
 run(`state.tapBasis="${basis}"`);
 const devices=JSON.parse(run('JSON.stringify(fieldChoices().map(d=>d.label))'));assert.equal(devices.length,11);
 for(const f of [18.2,24.6,31,37.4,25.4,40,41.1,87.9,250,1000])assert.ok(Number.isFinite(run(`totalDeviceLoss(state.field,${f})`)));
}
console.log('PASS: all 11 ATX field paths, output-port selection, interpolation, typical/maximum, forward sum, return TX, manual override and saved devices.');
