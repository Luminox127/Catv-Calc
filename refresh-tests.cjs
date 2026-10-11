const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const previous={meter250:99,meter1000:98,segments:[{cable:'RG6',ft:100}],inlineTaps:[{value:8,thru:1.4}],internal:[{name:'splitter',loss:3.5}],field:[{name:'splitter',loss:3.5}],currentTapModel:'4:11',currentTapValue:11};
const source=fs.readFileSync(__dirname+'/atx-data.js','utf8')+fs.readFileSync(__dirname+'/passive-data.js','utf8')+'\n'+fs.readFileSync(__dirname+'/app.js','utf8');
for(const blocked of [false,true]) {
 let stored=JSON.stringify(previous);
 const elements=new Map();
 const el=id=>{if(!elements.has(id))elements.set(id,{value:'',style:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},appendChild(){},focus(){},reset(){}});return elements.get(id);};
 const ctx=vm.createContext({console,window:{addEventListener(){}},document:{getElementById:el},localStorage:{getItem(){return stored;},setItem(k,v){if(blocked)throw Error();stored=v;},removeItem(){if(blocked)throw Error();stored=null;}},setTimeout(){}});
 vm.runInContext(source,ctx);
 for(const list of ['segments','inlineTaps','internal','field'])assert.equal(vm.runInContext(`state.${list}.length`,ctx),0);
 assert.equal(vm.runInContext('state.meter250',ctx),34.5);
 assert.equal(vm.runInContext('state.meter1000',ctx),41);
 assert.equal(vm.runInContext('state.currentTapModel',ctx),'legacy');
 assert.equal(vm.runInContext('screen',ctx),'MODE');
}
console.log('PASS: page load ignores prior run and resets all component lists, meter defaults and tap selection, even with blocked storage.');
