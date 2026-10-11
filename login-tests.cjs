const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
(async()=>{
for(const blocked of [false,true]){
const els=new Map();let starts=0,plays=0,pauses=0;
const el=id=>{if(!els.has(id))els.set(id,{value:'',style:{},handlers:{},addEventListener(k,f){this.handlers[k]=f;},reset(){el('loginPassword').value='';},focus(){},select(){},setAttribute(){},removeAttribute(){},pause(){pauses++;},play(){plays++;return blocked?Promise.reject(Error()):Promise.resolve();}});return els.get(id);};
el('loadingScreen').hidden=true;el('startScreen').hidden=true;
vm.runInNewContext(fs.readFileSync(__dirname+'/login.js','utf8'),{window:{__STARTAPP(){starts++;}},document:{getElementById:el}});
assert.equal(el('calculatorContent').hidden,true);
el('loginPassword').value='wrong';el('loginForm').handlers.submit({preventDefault(){}});assert.equal(starts,0);assert.equal(plays,0);
for(let i=0;i<2;i++){
el('loginPassword').value='charter';el('loginForm').handlers.submit({preventDefault(){}});assert.equal(el('calculatorContent').hidden,false);
await Promise.resolve();el('logoutBtn').handlers.click();assert.equal(el('calculatorContent').hidden,true);
}
assert.equal(starts,2);assert.equal(plays,2);assert.equal(pauses,4);assert.equal(el('loginAudio').currentTime,0);
}
assert.ok(fs.statSync(__dirname+'/audio/login.mp3').size>0);
console.log('PASS: valid login plays clip, invalid password does not, logout stops playback, repeat login and playback failures handled.');
})().catch(e=>{console.error(e);process.exitCode=1;});
