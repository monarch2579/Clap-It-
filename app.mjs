import {cloneDefaults,validate,clamp,thresholds,createDetector,feed,expire,lampFor,rgb,configCode,detectorCode} from './model.mjs';
const $=id=>document.getElementById(id);
const STORAGE_KEY='clap-it-calibration-v1';
let config=cloneDefaults(),storageAvailable=true;
try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));if(saved&&validate(saved))config=saved;}catch{storageAvailable=false;}
let detector=createDetector(),history=[],mode='manual',raw=config.baseline,manualValue=raw,lastTick=0,lastDetected=-Infinity,sessionStart=performance.now(),pulseUntil=0,nextDemoPulse=0,demoPulseUntil=0,serialPort=null,serialReader=null,connecting=false;
const fieldNames=['baseline','threshold','sensitivity','debounce','window'];

function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(config));storageAvailable=true;}catch{storageAvailable=false;}$('saveStatus').textContent=storageAvailable?'Saved in this browser':'Browser storage unavailable';}
function clearSession(clearChart=true){detector=createDetector();lastDetected=-Infinity;sessionStart=performance.now();if(clearChart)history=[];$('eventNote').textContent='Session cleared. Ready to test.';renderOutput();}
function saveConfig(reset=true,except=null){save();if(reset)clearSession();syncConfig(except);}
function syncConfig(except=null){
 for(const k of fieldNames){if(k!==except)$(k).value=config[k];if($(k+'Number')&&k+'Number'!==except)$(k+'Number').value=config[k];}
 const t=thresholds(config);
 $('triggerValue').textContent=t.high;
 $('summaryTrigger').textContent=`${t.high} ADC`;
 $('summaryWindow').textContent=`${config.window/1000} s`;
 $('formula').textContent=`max(0, reading − ${config.baseline}) × ${config.sensitivity.toFixed(2)} ≥ ${config.threshold}`;
 $('rangeWarning').hidden=t.high<=1023;
 $('configCode').textContent=configCode(config);
 $('helperCode').textContent=detectorCode();
 $('idleDescription').textContent=`${config.bands[0].min===1?'0':`0–${config.bands[0].min-1}`} claps → lamp off`;
 $('windowLabel').textContent=`in the last ${config.window/1000} second${config.window===1000?'':'s'}`;
 for(let i=0;i<3;i++){
  const b=config.bands[i];
  if(except!==`min${i}`)$(`min${i}`).value=b.min;
  $(`tail${i}`).textContent=i===2?'+':`–${config.bands[i+1].min-1}`;
  $(`bright${i}`).value=b.brightness;$(`brightNumber${i}`).value=b.brightness;
  $(`color${i}`).value=b.color;$(`hex${i}`).textContent=b.color;
 }
 drawChart(performance.now());renderOutput();
}
function buildBands(){
 $('bands').innerHTML=config.bands.map((b,i)=>`<div class="band-row" id="band${i}"><div class="band-range"><span class="level-tag">0${i+1}</span><input type="number" id="min${i}" min="1" max="99" value="${b.min}" aria-label="Level ${i+1} minimum clap count"><span class="range-tail" id="tail${i}"></span></div><div class="band-brightness"><input type="range" id="bright${i}" min="0" max="255" value="${b.brightness}" aria-label="Level ${i+1} brightness slider"><input type="number" id="brightNumber${i}" min="0" max="255" value="${b.brightness}" aria-label="Level ${i+1} brightness from 0 to 255"></div><div class="band-color"><input type="color" id="color${i}" value="${b.color}" aria-label="Level ${i+1} LED color"><code id="hex${i}"></code></div></div>`).join('');
 for(let i=0;i<3;i++){
  $(`min${i}`).addEventListener('input',()=>{
   if($(`min${i}`).value==='')return;
   const draft=structuredClone(config);draft.bands[i].min=Number($(`min${i}`).value);
   if(!validate(draft)){$('bandError').hidden=false;$('bandError').textContent='Start counts must be whole numbers from 1–99, increasing from level 1 to 3. Invalid edits are not applied.';return;}
   $('bandError').hidden=true;config=draft;saveConfig(false,`min${i}`);
  });
  $(`min${i}`).addEventListener('blur',()=>syncConfig());
  for(const id of [`bright${i}`,`brightNumber${i}`])$(id).addEventListener('input',()=>{
   if($(id).value==='')return;config.bands[i].brightness=clamp(Math.round(Number($(id).value)),0,255);saveConfig(false);
  });
  $(`color${i}`).addEventListener('input',()=>{config.bands[i].color=$(`color${i}`).value;saveConfig(false);});
 }
}

for(const k of fieldNames){
 const ids=k==='window'?[k]:[k,k+'Number'];
 for(const id of ids){$(id).addEventListener(k==='window'?'change':'input',()=>{
  if($(id).value==='')return;
  const draft=structuredClone(config);let value=Number($(id).value);
  if(k==='sensitivity')value=Math.round(clamp(value,.5,3)*100)/100;
  else{const limits={baseline:[0,1023],threshold:[1,1023],debounce:[50,1000],window:[1000,10000]};value=clamp(Math.round(value),...limits[k]);}
  draft[k]=value;if(validate(draft)){config=draft;$('bandError').hidden=true;saveConfig(true,id);}
 });
 if(id.endsWith('Number'))$(id).addEventListener('blur',()=>syncConfig());
 }
}
function setManual(value){manualValue=clamp(Math.round(value),0,1023);$('reading').value=manualValue;$('readingNumber').value=manualValue;}
$('reading').addEventListener('input',()=>setManual(Number($('reading').value)));
$('readingNumber').addEventListener('input',()=>{if($('readingNumber').value!=='')setManual(Number($('readingNumber').value));});
$('readingNumber').addEventListener('blur',()=>setManual(manualValue));
$('clear').addEventListener('click',()=>clearSession());
$('reset').addEventListener('click',()=>{config=cloneDefaults();setManual(config.baseline);$('bandError').hidden=true;saveConfig();$('eventNote').textContent='Default calibration restored.';});

function sample(value,now){
 raw=clamp(Math.round(value),0,1023);
 const result=feed(detector,config,raw,now);
 if(result.accepted){lastDetected=now;$('eventNote').textContent=`Clap detected at ${raw} ADC · ${detector.claps.length} in window`;}
 history.push({t:now,raw});history=history.filter(p=>now-p.t<=10000);
 $('rawValue').textContent=raw;$('signalValue').textContent=`Signal ${Math.round(result.signal)} / ${config.threshold}`;
}
function renderOutput(now=performance.now()){
 const count=expire(detector,config,now),lamp=lampFor(config,count),percent=Math.round(lamp.brightness/255*100);
 $('clapCount').innerHTML=`${count}<span> clap${count===1?'':'s'}</span>`;
 $('brightnessPercent').innerHTML=`${percent}<span>%</span>`;
 $('lampLabel').textContent=lamp.index<0?'Waiting for a clap':`Level ${lamp.index+1} · ${percent}% brightness`;
 $('activeLevel').textContent=lamp.index<0?'STANDBY':`LEVEL 0${lamp.index+1}`;
 $('lampScene').style.setProperty('--lamp',lamp.color);
 $('lampGlow').style.opacity=lamp.brightness/255*.6;
 $('shadeTint').setAttribute('fill',lamp.color);$('shadeTint').setAttribute('opacity',String(lamp.brightness/255*.75));
 $('lampLight').setAttribute('fill',lamp.color);$('lampLight').setAttribute('opacity',String(lamp.brightness/255*.95));
 $('brightnessFill').style.width=`${percent}%`;$('brightnessFill').style.background=lamp.color;
 $('outputSwatch').style.background=lamp.color;$('outputRGB').textContent=`RGB ${rgb(lamp.color).join(', ')}`;$('outputBrightness').textContent=`${lamp.brightness} / 255`;
 for(let i=0;i<3;i++)$(`band${i}`).classList.toggle('is-active',lamp.index===i);
 const recent=now-lastDetected<400;
 $('detectorStatus').textContent=recent?'Clap detected':detector.latched?'Rearm below release':'Listening';
 $('detectorStatus').style.color=recent?'#d46a35':detector.latched?'#9b7a40':'#3d6244';
}
function drawChart(now){
 const t=thresholds(config),max=Math.min(1023,Math.ceil(Math.max(350,t.high*1.2,...history.map(p=>p.raw*1.15))/100)*100);
 const X=time=>35+Math.max(0,Math.min(10000,10000-(now-time)))/10000*588;
 const Y=value=>166-clamp(value/max,0,1)*147;
 $('chartGrid').innerHTML=[0,.5,1].map(p=>`<line x1="34" y1="${Y(max*p)}" x2="624" y2="${Y(max*p)}"/><text x="7" y="${Y(max*p)+3}">${Math.round(max*p)}</text>`).join('');
 const points=history.map(p=>`${X(p.t).toFixed(1)},${Y(p.raw).toFixed(1)}`);
 const path=points.length?'M'+points.join(' L'):'';
 $('signalPath').setAttribute('d',path);
 $('areaPath').setAttribute('d',points.length?`${path} L${X(history.at(-1).t)},166 L${X(history[0].t)},166 Z`:'');
 $('triggerLine').setAttribute('d',`M35,${Y(t.high)} H624`);
 $('releaseLine').setAttribute('d',`M35,${Y(t.release)} H624`);
 $('thresholdLabel').setAttribute('x','617');$('thresholdLabel').setAttribute('text-anchor','end');$('thresholdLabel').setAttribute('y',String(Math.max(12,Y(t.high)-6)));$('thresholdLabel').textContent=`TRIGGER ${t.high}`;
 $('clapMarkers').innerHTML=detector.events.filter(e=>now-e.time<10000).map(e=>`<circle cx="${X(e.time)}" cy="${Y(e.raw)}" r="3.8"/>`).join('');
}
async function closeSerial(){
 const reader=serialReader;serialReader=null;
 if(reader)try{await reader.cancel();}catch{}
 const port=serialPort;serialPort=null;
 if(port)try{await port.close();}catch{}
}
async function switchMode(next){
 mode=next;
 if(next!=='serial')await closeSerial();
 clearSession();
 $('manualMode').classList.toggle('selected',next==='manual');$('manualMode').setAttribute('aria-pressed',String(next==='manual'));
 $('demoMode').classList.toggle('selected',next==='demo');$('demoMode').setAttribute('aria-pressed',String(next==='demo'));
 $('reading').disabled=next!=='manual';$('readingNumber').disabled=next!=='manual';$('testClap').disabled=next==='serial';
 $('sourceBadge').innerHTML=`<i></i>${next==='demo'?'Simulated stream':next==='serial'?'Arduino serial':'Manual input'}`;
 $('sourceNote').textContent=next==='demo'?'Demo data, not a microphone: simulated room noise and clap pulses.':next==='serial'?'Live serial · 115200 baud · send one 0–1023 integer per line with Serial.println(reading).':'Manual values are held steady. Return below the release line to rearm.';
 $('sourceError').hidden=true;
 $('serialButton').textContent=next==='serial'?'Disconnect Arduino':'Connect Arduino ↗';
 nextDemoPulse=performance.now()+700;demoPulseUntil=0;pulseUntil=0;
}
$('manualMode').addEventListener('click',()=>switchMode('manual'));
$('demoMode').addEventListener('click',()=>switchMode(mode==='demo'?'manual':'demo'));
$('testClap').addEventListener('click',()=>{
 const now=performance.now();feed(detector,config,config.baseline,now);
 pulseUntil=now+95;sample(Math.min(1023,thresholds(config).high+25),now);
 if(mode==='manual')setManual(config.baseline);renderOutput(now);drawChart(now);
});
if(!('serial' in navigator)){$('serialButton').disabled=true;$('serialButton').title='Web Serial requires a supported desktop browser such as Chrome or Edge.';$('sourceNote').textContent+=' Serial input requires desktop Chrome or Edge.';}
$('serialButton').addEventListener('click',async()=>{
 if(connecting)return;
 if(mode==='serial'){await switchMode('manual');return;}
 connecting=true;$('serialButton').disabled=true;
 try{
  const port=await navigator.serial.requestPort();
  await port.open({baudRate:115200});
  await switchMode('serial');serialPort=port;
  connecting=false;$('serialButton').disabled=false;
  const reader=port.readable.getReader();serialReader=reader;
  const decoder=new TextDecoder();let buffer='',badLines=0;
  while(mode==='serial'&&serialReader===reader){
   const {value,done}=await reader.read();if(done)break;
   buffer+=decoder.decode(value,{stream:true});
   if(buffer.length>8192){buffer='';$('sourceError').hidden=false;$('sourceError').textContent='Serial input needs newline-separated ADC integers (0–1023).';}
   const lines=buffer.split('\n');buffer=lines.pop();
   for(const line of lines){const s=line.trim();if(/^\d{1,4}$/.test(s)&&Number(s)<=1023){sample(Number(s),performance.now());$('sourceError').hidden=true;}else if(s&&++badLines%20===1){$('sourceError').hidden=false;$('sourceError').textContent='Ignored non-ADC serial data. Send one integer from 0–1023 per line.';}}
  }
  reader.releaseLock();
  if(mode==='serial')await switchMode('manual');
 }catch(e){
  await switchMode('manual');
  $('sourceError').hidden=false;$('sourceError').textContent=e.name==='NotFoundError'?'No port selected. Manual input is ready.':'Could not read Arduino serial. Close other serial monitors, check 115200 baud, then reconnect.';
 }finally{connecting=false;$('serialButton').disabled=false;}
});
async function copy(text,label){
 try{await navigator.clipboard.writeText(text);$('copyStatus').textContent=`${label} copied.`;}
 catch{const field=document.createElement('textarea');field.value=text;field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();let copied=false;try{copied=document.execCommand('copy');}catch{}field.remove();$('copyStatus').textContent=copied?`${label} copied.`:'Copy unavailable. Open the code below and select it manually.';}
}
$('copyConfig').addEventListener('click',()=>copy(configCode(config),'Configuration'));
$('copyHelper').addEventListener('click',()=>copy(detectorCode(),'Detector helper'));
buildBands();syncConfig();setManual(config.baseline);save();
function tick(now){
 if(now-lastTick>=50){
  lastTick=now;
  if(mode==='manual')sample(now<pulseUntil?Math.min(1023,thresholds(config).high+25):manualValue,now);
  if(mode==='demo'){
   if(now>=nextDemoPulse){demoPulseUntil=now+75;nextDemoPulse=now+650+Math.random()*500;}
   sample(now<pulseUntil||now<demoPulseUntil?Math.min(1023,config.baseline+220+Math.random()*100):config.baseline+(Math.random()-.3)*22,now);
  }
  renderOutput(now);drawChart(now);
 }
 requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
