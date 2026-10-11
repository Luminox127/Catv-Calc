require('./tests.cjs');
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const elements=new Map();
const el=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',style:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},appendChild(){},focus(){},reset(){}});return elements.get(id);};
let saved=null;
const ctx=vm.createContext({console,window:{addEventListener(){}},document:{getElementById:el,createElement:()=>({addEventListener(){}})},localStorage:{getItem:()=>saved,setItem(){}},setTimeout(){},alert(){}});
vm.runInContext(fs.readFileSync(__dirname+'/atx-data.js','utf8')+fs.readFileSync(__dirname+'/passive-data.js','utf8')+fs.readFileSync(__dirname+'/app.js','utf8'),ctx);
const run=s=>vm.runInContext(s,ctx),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
near(run('atxLoss("4:11","thru",258)'),3.4);
near(run('atxLoss("4:11","thru",250)'),3.3+.1*46/54);
near(run('atxLoss("4:11","tap",1000)'),11+(11.2-11)*166/168);
run('state.tapBasis="maximum"');near(run('atxLoss("8:14","tap",1002)'),17);
run('state=defaultState();state.currentTapModel="4:8";state.currentTapValue=8');
assert.equal(run('computeFor(250).thruLocal'),null);assert.equal(run('computeFor(1000).finalThru'),null);
assert.ok(run('formatResult(computeFor(250))').includes('terminating tap has no OUT port'));
near(run('computeFor(250).tapPort'),34.5-(6.6+.1*46/54));
run('temp.tapFamily=4');assert.equal(run('tapChoices(false).length'),7);assert.equal(run('tapChoices(true).length'),8);
run('state.currentTapModel="2:17";state.currentTapValue=17;state.inlineTaps=[{model:"4:11",value:11},{model:"8:26",value:26}]');
near(run('computeFor(250).inlineThru'),3.3+.1*46/54+1.1);
near(run('computeFor(1000).inlineThru'),3.9+.1*166/168+1.3);
assert.ok(run('computeFor(1000).inlineThru')>run('computeFor(250).inlineThru'));
saved=JSON.stringify({currentTapModel:'2:5',currentTapValue:5,tapBasis:'maximum',inlineTaps:[{model:'4:11',value:11}]});run('state=defaultState();load()');
assert.equal(run('state.currentTapModel'),'2:5');assert.equal(run('state.inlineTaps[0].model'),'4:11');assert.equal(run('state.tapBasis'),'maximum');
for(const ports of [2,4,8])for(const basis of ['typical','maximum']){
 run(`state.tapBasis="${basis}"`);
 const entries=JSON.parse(run(`JSON.stringify(Object.entries(ATX_TAPS).filter(([k,t])=>t.ports===${ports}))`));
 for(const [key,t] of entries)for(const freq of [250,1000]){
  assert.ok(Number.isFinite(run(`atxLoss("${key}","tap",${freq})`)));
  assert.equal(run(`atxLoss("${key}","thru",${freq})`)===null,t.terminal);
 }
}
console.log('PASS: all 24 ATX models, interpolation, typical/maximum, frequency-dependent inline loss, terminal outputs, model persistence and selection filtering.');
