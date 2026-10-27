import {audioReading} from './microphone.mjs';
import {cloneDefaults,validate,clamp,thresholds,createDetector,feed,advance,recordClap,lampFor,rgb,configCode,detectorCode} from './model.mjs';
const $=id=>document.getElementById(id);
const STORAGE_KEY='clap-it-calibration-v3';
let config=cloneDefaults(),storageAvailable=true;
try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));if(saved&&validate(saved))config=saved;else {const previous=JSON.parse(localStorage.getItem('clap-it-calibration-v2'));if(previous&&validate(previous))config={...previous,debounce:220,window:700};}}catch{storageAvailable=false;}
let detector=createDetector(),history=[],mode='manual',raw=config.baseline,manualValue=raw,lastTick=0,lastDetected=-Infinity,sessionStart=performance.now(),pulseUntil=0,nextDemoPulse=0,demoPulseUntil=0,serialPort=null,serialReader=null,connecting=false;
let pulses=[], demoStep=0;
let microphone=null, requestingMic=false, microphoneGain=8;
const fieldNames=['baseline','threshold','sensitivity','debounce','window'];

function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(config));storageAvailable=true;}catch{storageAvailable=false;}$('saveStatus').textContent=storageAvailable?'Saved in this browser':'Browser storage unavailable';}
function clearSession(clearChart=true){detector=createDetector();pulses=[];lastDetected=-Infinity;sessionStart=performance.now();if(clearChart)history=[];$('eventNote').textContent='Session cleared. Ready to test.';renderOutput();}
function saveConfig(reset=true,except=null){save();if(reset)clearSession();syncConfig(except);}
function syncConfig(except=null){
 for(const k of fieldNames){if(k!==except)$(k).value=config[k];if($(k+'Number')&&k+'Number'!==except)$(k+'Number').value=config[k];}
 const t=thresholds(config);
 $('triggerValue').textContent=t.high;
 $('summaryTrigger').textContent=`${t.high} ADC`;
 $('summaryWindow').textContent=`${config.window} ms`;
 $('formula').textContent=`max(0, reading − ${config.baseline}) × ${config.sensitivity.toFixed(2)} ≥ ${config.threshold}`;
 $('rangeWarning').hidden=t.high<=1023;
 $('configCode').textContent=configCode(config);
 $('helperCode').textContent=detectorCode();
 $('timingWarning').hidden=config.debounce<config.window;
 $('idleDescription').textContent='Sleep → low → medium → high → sleep';
 $('windowLabel').textContent=`waiting for ${config.window} ms of quiet`;
 for(let i=0;i<3;i++){
  const b=config.bands[i];
  $(`bright${i}`).value=b.brightness;$(`brightNumber${i}`).value=b.brightness;
  $(`color${i}`).value=b.color;$(`hex${i}`).textContent=b.color;
 }
 drawChart(performance.now());renderOutput();
}
function buildBands(){
 $('bands').innerHTML=config.bands.map((b,i)=>`<div class="band-row" id="band${i}"><div class="band-range"><span class="level-tag">0${i+1}</span><span>${['Wake · low','Next · medium','Next · high'][i]}</span></div><div class="band-brightness"><input type="range" id="bright${i}" min="0" max="255" value="${b.brightness}" aria-label="Level ${i+1} brightness slider"><input type="number" id="brightNumber${i}" min="0" max="255" value="${b.brightness}" aria-label="Level ${i+1} brightness from 0 to 255"></div><div class="band-color"><input type="color" id="color${i}" value="${b.color}" aria-label="Color cycle stop ${i+1}"><code id="hex${i}"></code></div></div>`).join('');
 for(let i=0;i<3;i++){
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
  else{const limits={baseline:[0,1023],threshold:[1,1023],debounce:[50,1000],window:[300,1500]};value=clamp(Math.round(value),...limits[k]);}
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
 if(result.accepted){lastDetected=now;$('eventNote').textContent=`Clap detected at ${raw} ADC · ${detector.pending} in gesture`;}
 history.push({t:now,raw});history=history.filter(p=>now-p.t<=10000);
 $('rawValue').textContent=raw;$('signalValue').textContent=`Signal ${Math.round(result.signal)} / ${config.threshold}`;
}
function renderOutput(now=performance.now()){
 advance(detector,config,now);
 const count=detector.pending,lamp=lampFor(config,detector),percent=Math.round(lamp.brightness/255*100);
 $('clapCount').innerHTML=`${count===4?'4+':count}<span> clap${count===1?'':'s'}</span>`;
 $('windowLabel').textContent=count?`Pause ${(Math.max(0,config.window-(now-detector.lastGesture))/1000).toFixed(1)} s to finish`:'Ready for a new sequence';
 if(!count&&detector.completed)$('eventNote').textContent=`Sequence complete · ${detector.lastCount===4?'4+':detector.lastCount} clap${detector.lastCount===1?'':'s'} · count reset`;
 $('brightnessPercent').innerHTML=`${percent}<span>%</span>`;
 $('lampLabel').textContent=detector.mode==='sleep'?'Sleeping · 1 or 2+ claps to wake':detector.mode==='colors'?(detector.paused?'Color paused':'RGB color cycle'):`Level ${lamp.index+1} · ${percent}% brightness`;
 $('gestureResult').textContent=detector.lastAction;
 $('colorCycleNote').textContent=detector.mode==='colors'?(detector.paused?'Paused · 1 clap resumes, 2+ claps turn off':`Smooth 5 s transitions · ${Math.round((detector.phase%5000)/50)}% to next color`):'White: 1 clap · colors: 2+ from sleep, 3+ while awake';
 $('activeLevel').textContent=detector.mode==='sleep'?'ASLEEP':detector.mode==='colors'?(detector.paused?'PAUSED':'COLORS'):`LEVEL 0${lamp.index+1}`;
 $('lampScene').style.setProperty('--lamp',lamp.color);
 $('lampGlow').style.opacity=lamp.brightness/255*.6;
 $('shadeTint').setAttribute('fill',lamp.color);$('shadeTint').setAttribute('opacity',String(lamp.brightness/255*.75));
 $('lampLight').setAttribute('fill',lamp.color);$('lampLight').setAttribute('opacity',String(lamp.brightness/255*.95));
 $('brightnessFill').style.width=`${percent}%`;$('brightnessFill').style.background=lamp.color;
 $('outputSwatch').style.background=lamp.color;$('outputRGB').textContent=`RGB ${rgb(lamp.color).join(', ')}`;$('outputBrightness').textContent=`${lamp.brightness} / 255`;
 for(let i=0;i<3;i++)$(`band${i}`).classList.toggle('is-active',lamp.index===i);
 const recent=now-lastDetected<400;
 $('detectorStatus').textContent=recent?'Clap detected':detector.latched?'Rearm below release':count?'Counting claps':'Listening';
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
 if(next!=='microphone')await stopMicrophone();
 clearSession();
 $('manualMode').classList.toggle('selected',next==='manual');$('manualMode').setAttribute('aria-pressed',String(next==='manual'));
 $('demoMode').classList.toggle('selected',next==='demo');$('demoMode').setAttribute('aria-pressed',String(next==='demo'));
 $('reading').disabled=next!=='manual';$('readingNumber').disabled=next!=='manual';$('testClap').disabled=next!=='manual';
 $('sourceBadge').innerHTML=`<i></i>${next==='demo'?'Simulated stream':next==='serial'?'Arduino serial':next==='microphone'?'Microphone live':'Manual input'}`;
 $('sourceNote').textContent=next==='demo'?'Demo data, not a microphone: simulated room noise and clap pulses.':next==='serial'?'Live serial · 115200 baud · send one 0–1023 integer per line with Serial.println(reading).':'Manual values are held steady. Return below the release line to rearm.';
 $('microphoneButton').textContent=next==='microphone'?'Stop microphone':'Start microphone';
 $('microphoneControls').hidden=next!=='microphone';
 if(next==='microphone')$('sourceNote').textContent='Listening locally · audio is not recorded or uploaded. Tune microphone gain and the clap threshold so room noise stays below the trigger. Speech and other sharp sounds may also trigger claps.';
 $('sourceError').hidden=true;
 $('serialButton').textContent=next==='serial'?'Disconnect Arduino':'Connect Arduino ↗';
 nextDemoPulse=performance.now()+700;demoStep=0;demoPulseUntil=0;pulseUntil=0;
}
$('manualMode').addEventListener('click',()=>switchMode('manual'));
$('demoMode').addEventListener('click',()=>switchMode(mode==='demo'?'manual':'demo'));
function queueGesture(count){
 if(pulses.length){$('eventNote').textContent='Wait for the current test gesture to finish.';return;}
 const spacing=Math.floor((config.debounce+config.window)/2);
 if(count>1&&config.debounce>=config.window){$('eventNote').textContent='Set minimum clap gap below the gesture quiet gap first.';return;}
 const now=performance.now();
 for(let i=0;i<count;i++)pulses.push({start:now+40+i*spacing,end:now+135+i*spacing});
 if(mode==='manual')setManual(config.baseline);
 $('eventNote').textContent=`Sending ${count} clap${count===1?'':'s'} through the sensor detector…`;
}
$('testClap').addEventListener('click',()=>{
 const now=performance.now(),peak=Math.min(1023,thresholds(config).high+25);
 setManual(config.baseline);
 recordClap(detector,config,now,peak);detector.latched=true;lastDetected=now;
 pulses.push({start:now,end:now+95});
 sample(peak,now);
 $('eventNote').textContent=`${detector.pending===4?'4+':detector.pending} clap${detector.pending===1?'':'s'} recorded · clap again now, or pause to finish`;
 renderOutput(now);drawChart(now);
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
async function stopMicrophone(){
 const mic=microphone;microphone=null;
 if(!mic)return;
 clearInterval(mic.timer);
 mic.source.disconnect();mic.analyser.disconnect();
 for(const track of mic.stream.getTracks())track.stop();
 try{await mic.context.close();}catch{}
}
$('microphoneGain').addEventListener('input',()=>{
 microphoneGain=Number($('microphoneGain').value);$('microphoneGainValue').textContent=`${microphoneGain}×`;
});
$('microphoneButton').addEventListener('click',async()=>{
 if(mode==='microphone'){await switchMode('manual');return;}
 if(requestingMic)return;
 if(!navigator.mediaDevices?.getUserMedia){$('sourceError').hidden=false;$('sourceError').textContent='Microphone input requires HTTPS or localhost and a browser with audio capture support.';return;}
 requestingMic=true;$('microphoneButton').disabled=true;
 let stream=null,context=null,adopted=false;
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  context=new AudioContext();await context.resume();
  const analyser=context.createAnalyser();analyser.fftSize=1024;
  const source=context.createMediaStreamSource(stream);source.connect(analyser);
  const samples=new Float32Array(analyser.fftSize);
  await switchMode('microphone');
  const mic={stream,context,source,analyser,timer:null};microphone=mic;adopted=true;
  mic.timer=setInterval(()=>{
   if(microphone!==mic||mode!=='microphone')return;
   analyser.getFloatTimeDomainData(samples);
   sample(audioReading(samples,config.baseline,microphoneGain),performance.now());
  },16);
  for(const track of stream.getAudioTracks())track.addEventListener('ended',()=>{
   if(microphone===mic){switchMode('manual').then(()=>{$('sourceError').hidden=false;$('sourceError').textContent='Microphone disconnected. Reconnect it and start listening again.';});}
  });
 }catch(error){
  $('sourceError').hidden=false;
  $('sourceError').textContent=error.name==='NotAllowedError'?'Microphone permission was denied. Allow microphone access in your browser’s site settings, then try again.':error.name==='NotFoundError'?'No microphone found. Connect a microphone and try again.':'Could not start the microphone. Check that your microphone is available and try again.';
 }finally{
  if(!adopted){for(const track of stream?.getTracks()??[])track.stop();if(context)try{await context.close();}catch{}}
  requestingMic=false;$('microphoneButton').disabled=false;
 }
});
window.addEventListener('pagehide',()=>{stopMicrophone();});
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
  if(mode==='demo'&&now>=nextDemoPulse&&!pulses.length){
   const sequence=[1,3,1,1,2];queueGesture(sequence[demoStep%sequence.length]);demoStep++;
   nextDemoPulse=now+Math.max(4000,config.window*5);
  }
  const pulse=pulses.some(p=>now>=p.start&&now<p.end);
  pulses=pulses.filter(p=>now<p.end);
  if(mode==='manual'||mode==='demo')sample(pulse?Math.min(1023,thresholds(config).high+25):mode==='demo'?config.baseline+Math.random()*15:manualValue,now);
  renderOutput(now);drawChart(now);
 }
 requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
