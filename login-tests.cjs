const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
function check(supported) {
const els=new Map();let starts=0,spoken=[],cancels=0;
const el=id=>{if(!els.has(id))els.set(id,{value:'',style:{},handlers:{},addEventListener(k,f){this.handlers[k]=f;},reset(){el('loginPassword').value='';},focus(){},select(){},setAttribute(){},removeAttribute(){}});return els.get(id);};
const speech={getVoices:()=>[{lang:'en-GB',name:'David'},{lang:'en-US',name:'Microsoft Zira'}],cancel(){cancels++;},speak(u){spoken.push(u);}};
vm.runInNewContext(fs.readFileSync(__dirname+'/login.js','utf8'),{SpeechSynthesisUtterance:function(t){this.text=t;},window:{speechSynthesis:supported?speech:null,__STARTAPP(){starts++;}},document:{getElementById:el}});
assert.equal(el('calculatorContent').hidden,true);
el('loginPassword').value='wrong';el('loginForm').handlers.submit({preventDefault(){}});assert.equal(starts,0);assert.equal(spoken.length,0);
for(let i=0;i<2;i++) {
el('loginPassword').value='charter';el('loginForm').handlers.submit({preventDefault(){}});assert.equal(el('calculatorContent').hidden,false);
el('logoutBtn').handlers.click();assert.equal(el('calculatorContent').hidden,true);
}
assert.equal(starts,2);
if(supported){assert.equal(spoken.length,2);assert.equal(spoken[0].text,'Welcome.');assert.equal(spoken[0].voice.name,'Microsoft Zira');assert.equal(cancels,4);}
}
check(true);check(false);console.log('PASS: password gate, repeated welcome on login, female voice preference, logout, and login without speech support.');
