// Return-path TX estimates use the user's amp TX reference plus passive path loss.
(() => {
  const cables = {
    'P3-500':{5:.16,55:.54,83:.66,85:.68,204:1.07},
    'P3-625':{5:.13,55:.45,83:.56,85:.56,204:.89},
    'P3-750':{5:.11,55:.37,83:.46,85:.46,204:.72},
    'P3-875':{5:.09,55:.33,83:.41,85:.40,204:.63},
    QR540:{5:.14,55:.48,83:.58,85:.59,204:.93},
    RG6:{5:.58,55:1.60,83:1.95,187:2.85},
    RG11:{5:.38,55:.96,83:1.18,187:1.75}
  };
  const baseInput=document.getElementById('txBaseline');
  const genericInput=document.getElementById('txGeneric');
  const deviceInput=document.getElementById('txDevices');
  const output=document.getElementById('txOutput');
  const read = el => el.value.trim()==='' ? NaN : Number(el.value);
  function interpolate(row,freq){
    const points=Object.keys(row).map(Number).sort((a,b)=>a-b);
    const lo=points.filter(f=>f<=freq).at(-1),hi=points.find(f=>f>=freq);
    if(lo===undefined || hi===undefined)throw Error('Return frequency outside cable specifications.');
    return lo===hi ? row[lo] : row[lo]+(row[hi]-row[lo])*(freq-lo)/(hi-lo);
  }
  function settings(){
    const measuredTX=read(baseInput);
    if(!Number.isFinite(measuredTX))throw Error('Enter a valid amp test-point TX reading.');
    // User's FWD OUT / REV INJ point: 20 dB injection loss, no meter compensation.
    const baseline=measuredTX-20;
    const hasGeneric=state.currentTapModel==='legacy' || state.inlineTaps.some(t=>!t.model);
    if(hasGeneric && !genericInput.checked)throw Error('Select ATX models for all taps, or enable the generic tap estimates below.');
    let devices=0;
    let deviceOverride=false;
    const custom=read(deviceInput);
    if(deviceInput.value.trim()!==''){
      if(!Number.isFinite(custom) || custom<0)throw Error('Return device loss must be zero or greater.');
      devices=custom;
      deviceOverride=true;
    }else if(state.internal.length || state.field.some(d=>!d.model)){
      if(!genericInput.checked)throw Error('Enter the total return splitter/DC loss, or enable the flat presets below.');
      devices=totalDeviceLoss(state.internal)+totalDeviceLoss(state.field.filter(d=>!d.model));
    }
    for(const seg of state.segments)if(!cables[seg.cable])throw Error('No verified return cable preset for '+seg.cable+'. TX estimate unavailable for this run.');
    return {baseline,measuredTX,devices,hasGeneric,deviceOverride};
  }
  function atFrequency(freq,config){
    const cable=state.segments.reduce((sum,seg)=>sum+interpolate(cables[seg.cable],freq)*seg.ft/100,0);
    const inline=state.inlineTaps.reduce((sum,t)=>{
      const loss=t.model ? atxLoss(t.model,'thru',freq) : t.thru;
      if(loss===null)throw Error('An inline tap has no return THRU specification.');
      return sum+loss;
    },0);
    const tap=currentTapLoss('tap',freq);
    if(!Number.isFinite(tap))throw Error('Current tap has no return tap-loss specification.');
    const field=config.deviceOverride ? 0 : totalDeviceLoss(state.field.filter(d=>d.model),freq);
    const loss=cable+inline+config.devices+field+tap;
    return {freq,loss,field,tx:config.baseline+loss};
  }
  function band(lo,hi,config){
    // Piecewise-linear extrema occur at endpoints or at a table breakpoint.
    const points=new Set([lo,hi]);
    for(const seg of state.segments)for(const f of Object.keys(cables[seg.cable]))if(+f>lo && +f<hi)points.add(+f);
    for(const key of [state.currentTapModel,...state.inlineTaps.map(t=>t.model)])if(ATX_TAPS[key]){
      for(const f of Object.keys(ATX_TAPS[key].tap))if(+f>lo && +f<hi)points.add(+f);
    }
    if(!config.deviceOverride)for(const d of state.field)if(d.model)for(const f of Object.keys(ATX_PASSIVES[d.model][d.path]))if(+f>lo && +f<hi)points.add(+f);
    const values=[...points].map(f=>atFrequency(f,config).tx);
    return {min:Math.min(...values),max:Math.max(...values)};
  }
  window.updateTX = () => {
    try {
      const config=settings();
      const lines=[`Amp test-point TX: ${config.measuredTX.toFixed(2)} dBmV`, 'Assumed: FWD OUT / REV INJ −20 dB; meter compensation OFF', `Mainline TX reference: ${config.baseline.toFixed(2)} dBmV`, `Flat return device loss: ${config.devices.toFixed(2)} dB${config.deviceOverride ? " (replaces all listed devices)" : "; ATX field losses added per frequency"}`, '', 'SC-QAM EXPECTED TX AT TAP'];
      for(const freq of [18.2,24.6,31,37.4]){
        const r=atFrequency(freq,config);
        lines.push(`${freq.toFixed(1)} MHz: ${r.tx.toFixed(2)} dBmV (path loss +${r.loss.toFixed(2)} dB)`);
      }
      lines.push('','OFDMA PATH-LOSS TX ESTIMATES');
      for(const [name,lo,hi] of [['OFDMA 1',25.4,40],['OFDMA 2',41.1,87.9]]){
        const r=band(lo,hi,config);
        lines.push(`${name} (${lo}–${hi} MHz): ${r.min.toFixed(2)}–${r.max.toFixed(2)} dBmV`);
      }
      if(genericInput.checked)lines.push('','Generic tap/device presets enabled: return losses may differ.');
      output.textContent=lines.join('\n');
    }catch(error){output.textContent='TX estimate unavailable: '+error.message;}
  };
  for(const input of [baseInput,genericInput,deviceInput])input.addEventListener('input',()=>{if(!document.getElementById('resultsWrap').classList.contains('hidden'))window.updateTX();});
  window.resetTX = () => {baseInput.value='34';genericInput.checked=false;deviceInput.value='';output.textContent='';};
  // Expose pure calculation entry points for regression checks.
  window.catvTX = {settings,atFrequency,band,interpolate};
})();
