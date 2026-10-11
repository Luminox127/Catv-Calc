const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
(async()=>{
for(const blocked of [false,true]){
let callback,delay,focused=false,plays=0,pauses=0;
const elements={startScreen:{hidden:false},startLoading:{addEventListener(k,f){this.click=f;}},loadingScreen:{hidden:true,classList:{add(){}}},loginGate:{hidden:true,inert:true},loginPassword:{focus(){focused=true;}},loadingAudio:{currentTime:1,play(){plays++;return blocked?Promise.reject(Error('blocked')):Promise.resolve();},pause(){pauses++;}}};
vm.runInNewContext(fs.readFileSync(__dirname+'/loading.js','utf8'),{document:{getElementById:id=>elements[id]},setTimeout(fn,ms){callback=fn;delay=ms;}});
assert.equal(plays,0);assert.equal(callback,undefined);assert.equal(elements.startScreen.hidden,false);
elements.startLoading.click();assert.equal(plays,1);assert.equal(delay,7000);assert.equal(elements.loadingScreen.hidden,false);assert.equal(elements.startScreen.hidden,true);assert.equal(elements.startLoading.disabled,true);
elements.startLoading.click();assert.equal(plays,1);
await Promise.resolve();await Promise.resolve();
callback();assert.equal(elements.loadingScreen.hidden,true);assert.equal(elements.loginGate.hidden,false);assert.equal(elements.loginGate.inert,false);assert.equal(focused,true);assert.ok(pauses>0);assert.equal(elements.loadingAudio.currentTime,0);
}
console.log('PASS: Start triggers audio and seven-second loading, repeated clicks ignored, login transition and playback error handling.');
})().catch(e=>{console.error(e);process.exitCode=1;});
